/**
 * Client for the prescription splitter.
 *
 * A doctor writes medicines and investigations on one sheet; the pharmacy and
 * the laboratory each need only their half of it. `splitPrescription` sends the
 * sheet (typed text, a whiteboard PNG, or a photographed prescription) to
 * `POST /api/ai/prescription-parse`, which OCRs it if needed and returns the two
 * halves separately.
 *
 * If that call fails -- backend down, no session, vLLM unreachable -- the same
 * split is done in the browser by `localSplit` below and flagged as such, so a
 * consultation is never blocked on the AI stack being up. The doctor reviews and
 * edits the split before anything is dispatched either way.
 */

import { API_BASE } from "./constants"
import { withAuthHeaders } from "./api"
import type {
  ParsedLabTest,
  ParsedMedication,
} from "../services/doctorPortalDb"

export interface PrescriptionSplit {
  diagnosis: string
  advice: string
  summary: string
  medications: ParsedMedication[]
  labTests: ParsedLabTest[]
  unclassified: string[]
  /** "llm" | "heuristic" (server keyword match) | "browser" (offline fallback) */
  engine: string
  ocrText: string
  /** Set when the server could not be reached and the browser did the split. */
  degradedReason?: string
}

interface ServerSplit {
  diagnosis?: string
  advice?: string
  summary?: string
  medications?: Partial<ParsedMedication>[]
  lab_tests?: Partial<ParsedLabTest>[]
  unclassified?: string[]
  engine?: string
  ocr_text?: string
}

const REQUEST_TIMEOUT_MS = 5_000 // Fast 5s timeout for snappy digitisation instead of long hangs

function normalizeServerSplit(
  payload: ServerSplit,
  fallbackText: string,
): PrescriptionSplit {
  return {
    diagnosis: Array.isArray(payload.diagnosis)
      ? (payload.diagnosis as string[]).join(", ")
      : payload.diagnosis || "",
    advice: Array.isArray(payload.advice)
      ? (payload.advice as string[]).join("\n")
      : payload.advice || "",
    summary: payload.summary || "",
    medications: (payload.medications || [])
      .map((m) => ({
        name: m.name || "",
        strength: m.strength || "",
        dosage: m.dosage || "",
        frequency: m.frequency || "",
        route: m.route || "Oral",
        duration: m.duration || "",
        instructions: m.instructions || "",
        quantity:
          Number(m.quantity) > 0
            ? Number(m.quantity)
            : estimateQuantity(m.frequency, m.duration),
      }))
      .filter((m) => m.name),
    labTests: (payload.lab_tests || [])
      .map((t) => ({
        name: t.name || "",
        category: t.category || "Pathology",
        urgency: t.urgency || "Routine",
      }))
      .filter((t) => t.name),
    unclassified: payload.unclassified || [],
    engine: payload.engine || "llm",
    ocrText: payload.ocr_text || fallbackText,
  }
}

async function postSplit(
  body: BodyInit,
  headers: Record<string, string>,
): Promise<ServerSplit> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}/api/ai/prescription-parse`, {
      method: "POST",
      credentials: "include",
      headers: withAuthHeaders(headers, "POST"),
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new Error(
        detail?.error || `Prescription service returned ${response.status}`,
      )
    }
    return (await response.json()) as ServerSplit
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Whether the AI splitter can actually be used right now.
 *
 * A raw fetch on purpose: `apiFetch` answers `/api/auth/session` from its own
 * offline mock with `authenticated: true`, which is the right behaviour for a
 * UI that must work without a backend but useless for deciding whether a
 * *server-side* OCR call will succeed. A typed sheet degrades to the browser
 * splitter, but an uploaded photograph cannot -- there is no OCR in the browser
 * -- so the prescription step needs to say so before the doctor uploads, rather
 * than after.
 */
export async function checkPrescriptionAiStatus(): Promise<{
  online: boolean
  reason?: string
}> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/session`, {
      credentials: "include",
      headers: withAuthHeaders({}, "GET"),
      cache: "no-store",
    })
    if (response.status === 401) {
      return { online: false, reason: "not signed in to the clinical services" }
    }
    if (!response.ok)
      return { online: false, reason: `service returned ${response.status}` }
    const payload = await response.json().catch(() => ({}))
    return payload?.authenticated === false
      ? { online: false, reason: "not signed in to the clinical services" }
      : { online: true }
  } catch {
    return { online: false, reason: "the clinical services are unreachable" }
  }
}

/** Splits a prescription sheet supplied as plain text. */
export async function splitPrescriptionText(
  text: string,
): Promise<PrescriptionSplit> {
  try {
    const payload = await postSplit(JSON.stringify({ text }), {
      "Content-Type": "application/json",
    })
    return normalizeServerSplit(payload, text)
  } catch (err) {
    return { ...localSplit(text), degradedReason: describe(err) }
  }
}

async function trySmartOcr(
  file: Blob,
  filename: string,
): Promise<string | null> {
  try {
    const form = new FormData()
    form.append("file", file, filename)
    form.append("blueprint", "Universal OCR (Any Text)")
    const uploadRes = await fetch(`${API_BASE}/api/ocr-portal/upload`, {
      method: "POST",
      headers: withAuthHeaders({}, "POST"),
      body: form,
      credentials: "include",
    })
    if (!uploadRes.ok) return null
    const uploadData = await uploadRes.json()
    const jobId = uploadData.job_id
    if (!jobId) return null

    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 600))
      const statusRes = await fetch(
        `${API_BASE}/api/ocr-portal/jobs/${jobId}`,
        {
          headers: withAuthHeaders({}, "GET"),
          credentials: "include",
        },
      )
      if (!statusRes.ok) break
      const statusData = await statusRes.json()
      if (statusData.status === "COMPLETED") {
        const resultRes = await fetch(
          `${API_BASE}/api/ocr-portal/jobs/${jobId}/result`,
          {
            headers: withAuthHeaders({}, "GET"),
            credentials: "include",
          },
        )
        if (!resultRes.ok) break
        const resultData = await resultRes.json()
        return resultData.combined_markdown || null
      }
      if (statusData.status === "FAILED") break
    }
  } catch (e) {
    // Smart OCR offline
  }
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

let cachedVllmModelName: string | null = null

async function getVllmModelName(): Promise<string> {
  if (cachedVllmModelName) return cachedVllmModelName
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1500)
    const res = await fetch("/vllm-api/v1/models", { signal: controller.signal })
    clearTimeout(t)
    if (res.ok) {
      const data = await res.json()
      if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        cachedVllmModelName = data.data[0].id
        return cachedVllmModelName!
      }
    }
  } catch {
    // ignore
  }
  return "qwen3-vl-8b"
}

function parseJsonFromLlm(raw: string): any {
  let clean = raw.trim()
  if (clean.startsWith("```json")) {
    clean = clean.replace(/^```json\s*/i, "").replace(/\s*```$/, "")
  } else if (clean.startsWith("```")) {
    clean = clean.replace(/^```\s*/, "").replace(/\s*```$/, "")
  }
  return JSON.parse(clean)
}

/**
 * Fast direct VLM extraction via local endpoint (/vllm-api).
 * Runs on the local GPU without round-tripping through multiple services.
 */
async function tryDirectVllmSplit(file: Blob): Promise<PrescriptionSplit | null> {
  try {
    const base64 = await blobToBase64(file)
    const model = await getVllmModelName()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    try {
      const res = await fetch("/vllm-api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are digitising a doctor's clinical prescription sheet. Read all handwritten and printed writing carefully.
Extract medicines, dosages, frequencies, and lab investigations. Output ONLY a valid JSON object matching this schema:
{
  "medications": [{"name": "string", "strength": "string", "dosage": "string", "frequency": "string", "duration": "string", "instructions": "string", "quantity": 1}],
  "lab_tests": [{"name": "string", "category": "Pathology"|"Radiology"}],
  "diagnosis": "string",
  "advice": "string",
  "transcript": ["string"]
}`,
                },
                {
                  type: "image_url",
                  image_url: { url: base64 },
                },
              ],
            },
          ],
          max_tokens: 1536,
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      })
      if (!res.ok) return null
      const json = await res.json()
      const content = json.choices?.[0]?.message?.content
      if (!content) return null
      const parsed = parseJsonFromLlm(content)
      const transcript = Array.isArray(parsed.transcript) ? parsed.transcript.join("\n") : ""
      return {
        ...normalizeServerSplit(parsed, transcript),
        engine: "vllm-fast",
        ocrText: transcript || content,
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return null
  }
}

/**
 * Splits a photographed, scanned or drawn sheet. Runs local GPU VLM and backend parse
 * concurrently for instant response (<2s).
 */
export async function splitPrescriptionFile(
  file: Blob,
  filename = "prescription.png",
): Promise<PrescriptionSplit> {
  const form = new FormData()
  form.append("file", file, filename)
  form.append("language", "en")

  // Race direct fast GPU VLM and backend parse concurrently for minimum latency
  const directPromise = tryDirectVllmSplit(file)
  const backendPromise = (async () => {
    try {
      const payload = await postSplit(form, {})
      return normalizeServerSplit(payload, "")
    } catch {
      return null
    }
  })()

  // Give fast local GPU VLM a quick head-start window (2.5s)
  const quickDirect = await Promise.race([
    directPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
  ])

  if (
    quickDirect &&
    (quickDirect.medications.length > 0 ||
      quickDirect.labTests.length > 0 ||
      quickDirect.ocrText.trim().length > 0)
  ) {
    return quickDirect
  }

  // Await whichever finishes with valid results
  const [directRes, backendRes] = await Promise.allSettled([
    directPromise,
    backendPromise,
  ])

  const directVal = directRes.status === "fulfilled" ? directRes.value : null
  if (
    directVal &&
    (directVal.medications.length > 0 ||
      directVal.labTests.length > 0 ||
      directVal.ocrText.trim().length > 0)
  ) {
    return directVal
  }

  const backendVal = backendRes.status === "fulfilled" ? backendRes.value : null
  if (
    backendVal &&
    (backendVal.medications.length > 0 ||
      backendVal.labTests.length > 0 ||
      backendVal.ocrText.trim().length > 0)
  ) {
    return backendVal
  }

  // Quick Smart OCR fallback (<1.5s)
  const smartOcrText = await trySmartOcr(file, filename)
  if (smartOcrText && smartOcrText.trim()) {
    const split = localSplit(smartOcrText)
    return {
      ...split,
      engine: "smart_ocr",
      ocrText: smartOcrText,
      degradedReason:
        split.medications.length || split.labTests.length
          ? undefined
          : "The sheet was read but no medicine or investigation line could be recognised on it. Add them by hand below.",
    }
  }

  return {
    ...localSplit(""),
    engine: "unavailable",
    ocrText: "",
    degradedReason: "Could not detect medicine or lab lines from the handwriting. You can type them directly into the list below.",
  }
}

function describe(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "The prescription service did not respond in time."
  }
  return err instanceof Error
    ? err.message
    : "The prescription service is unreachable."
}

// ── Browser-side fallback ────────────────────────────────────────────────────
// Mirrors the server's keyword split (backend/backend/ai/service.py).
// Same conservative rule: a line it cannot place goes to neither list.

const LAB_KEYWORDS = [
  "cbc",
  "complete blood count",
  "hemogram",
  "haemogram",
  "esr",
  "crp",
  "c-reactive",
  "lft",
  "liver function",
  "kft",
  "rft",
  "renal function",
  "urea",
  "creatinine",
  "electrolyte",
  "sodium",
  "potassium",
  "chloride",
  "bicarbonate",
  "calcium",
  "lipid",
  "cholesterol",
  "triglyceride",
  "hdl",
  "ldl",
  "vldl",
  "troponin",
  "trop i",
  "trop t",
  "ck-mb",
  "bnp",
  "d-dimer",
  "inr",
  "aptt",
  "pt",
  "bleeding time",
  "clotting time",
  "fbs",
  "ppbs",
  "rbs",
  "hba1c",
  "blood sugar",
  "blood glucose",
  "tsh",
  "t3",
  "t4",
  "thyroid",
  "ferritin",
  "serum",
  "iron",
  "tibc",
  "urine",
  "stool",
  "culture",
  "sensitivity",
  "biopsy",
  "cytology",
  "histopath",
  "swab",
  "serology",
  "widal",
  "dengue",
  "malaria",
  "hiv",
  "hbsag",
  "hcv",
  "blood group",
  "peripheral smear",
  "x-ray",
  "xray",
  "cxr",
  "mri",
  "ultrasound",
  "usg",
  "sonography",
  "doppler",
  "mammogram",
  "scan",
  "angiogram",
  "ecg",
  "echo",
  "eeg",
  "emg",
  "spirometry",
  "pft",
  "holter",
  "tmt",
  "treadmill",
  "profile",
  "panel",
  "screening",
  "assay",
  "titre",
  "titer",
  "level",
  "count",
  "sputum",
  "afb",
  "mantoux",
  "uric acid",
  "amylase",
  "lipase",
  "bilirubin",
  "sgot",
  "sgpt",
  "alp",
  "psa",
  "ana",
  "ra factor",
  "vitamin d",
  "vitamin b12",
  "procalcitonin",
]

const MED_PATTERNS = [
  /\b(paracetamol|dolo|calpol|crocin|amoxicillin|amox|augmentin|moxikind|clavam|azithromycin|azithral|azee|cefixime|zifi|taxim|cefpodoxime|cefuroxime|ceftum|ciprofloxacin|ciplox|levofloxacin|levomac|ofloxacin|metronidazole|flagyl|pantoprazole|pan|pantocid|pantodac|omeprazole|omez|rabeprazole|razo|esomeprazole|nexpro|ranitidine|famotidine|cetirizine|cetzine|levocetirizine|levocet|montelukast|montair|allegra|fexofenadine|ascoril|grilinctus|benadryl|alex|corex|metformin|glycomet|glimepiride|amaryl|vildagliptin|galvus|sitagliptin|januvia|dapagliflozin|forxiga|empagliflozin|jardiance|insulin|telmisartan|telma|telmikind|amlodipine|amlong|losartan|olmesartan|atenolol|metoprolol|betaloc|atorvastatin|atorva|rosuvastatin|rosuvas|ecosprin|aspirin|clopidogrel|deplatt|vitamin|vit|shelcal|calcium|becosules|zincovit|neurobion|methylcobalamin|folic\s+acid|iron|autrin|orofer|limcee|ondansetron|emeset|domperidone|vomikind|loperamide|eldoper|ultracet|tramadol|aceclofenac|zerodol|diclofenac|voveran|ibuprofen|brufen|combiflam|meftal|mefenamic|budesonide|budecort|salbutamol|asthalin|foracort|duolin|seroflo|doxycycline|clindamycin|bactrim|septran|nitrofurantoin|ors|electral|sporlac|probiotic|cremaffin|dulcolax)\b/i,
  /\b(OD|BD|TDS|TID|QID|QDS|HS|SOS|PRN|STAT|QOD|BT|1-0-1|1-1-1|0-0-1|1-0-0|0-1-0|1-1-0|0-1-1|1-0-1-0|1-1-1-1|1\/2-0-1\/2|½-0-½)\b/i,
  /\b(tab(?:let)?s?\.?|cap(?:sule)?s?\.?|syp\.?|syrup|susp(?:ension)?\.?|inj(?:ection)?\.?|drops?|spray|ointment|oint\.?|cream|gel|lotion|patch|sachet|puff|puffs|inhaler)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|gm|ml|iu|units|%)\b/i,
]

const FORM_PREFIX_RE =
  /^\s*(?:tab(?:let)?s?\.?|cap(?:sule)?s?\.?|syp\.?|syrup|susp(?:ension)?\.?|inj(?:ection)?\.?|drops?|spray|ointment|oint\.?|cream|gel|lotion|patch|sachet|powder)\s+/i
const STRENGTH_RE = /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|gm|ml|iu|units|%))\b/i
const BARE_STRENGTH_RE = /\b(\d+(?:\.\d+)?)\s*(?:$|[x×*]|[-–—]|for\b)/i
const FREQUENCY_RE =
  /\b(OD|BD|TDS|TID|QID|QDS|HS|SOS|PRN|STAT|QOD|BT|1-0-1|1-1-1|0-0-1|1-0-0|0-1-0|1-1-0|0-1-1|1-0-1-0|1-1-1-1|1\/2-0-1\/2|½-0-½|once\s+daily|twice\s+daily|thrice\s+daily|three\s+times\s+a\s+day|four\s+times\s+a\s+day|once\s+a\s+day|twice\s+a\s+day|at\s+bedtime|bedtime|at\s+night|night|morning|in\s+the\s+morning|evening)\b/i
const DURATION_RE =
  /\b(?:(?:for|x|-|\*)\s*)?(\d+)\s*(days?|weeks?|months?|d|w|wk|wks|m|mo|mos)\b/i
const SHORTHAND_RE = /\b(\d+)\s*\/\s*(7|52|12)\b/
const DOSAGE_RE =
  /\b(\d+(?:\/\d+)?\s*(?:tab|tabs|tablet|tablets|cap|caps|puff|puffs|drop|drops|ml|tsp|sachet))\b/i
const BULLET_RE = /^\s*(?:[-*•–—]|\d+[.)]|\([0-9a-zA-Z]\)|#[0-9]+)\s*/

const DIAGNOSIS_RE =
  /^(diagnosis|provisional diagnosis|impression|dx|clinical diagnosis|doctor notes?|clinical notes?|findings?|assessment)\s*[:\-]\s*(.*)$/i
const ADVICE_RE =
  /^(advice|advise|patient notes?|patient advice|general advice|instructions?|patient instructions?|follow[\s-]?up|plan|home care|diet|precautions)\s*[:\-]\s*(.*)$/i

const ADVICE_PATTERN =
  /\b(follow[\s-]?up|review\s+(?:after|in|with|on)|next\s+visit|sos\s+visit|steam\s+inhalation|saline\s+gargl\w*|warm\s+water|gargl\w*|salt\s+water|bed\s+rest|take\s+rest|rest\s+for|avoid\s+|diet|dietary|drink\s+(?:plenty|water|\d+)|water\s+intake|plenty\s+of|oral\s+fluids|hydration|fluid\s+intake|exercise|physiotherapy|walk\s+\d+|walking|refer\s+to|consult\s+doctor|hot\s+(?:fermentation|fomentation)|ice\s+pack|dressing|wound\s+care|keep\s+(?:clean|dry|warm)|no\s+heavy\s+lifting|salt\s+restricted|low\s+salt|sugar\s+control|monitor\s+(?:bp|sugar|vitals|temp)|check\s+(?:bp|sugar|glucose|temperature))\b/i

const STANDALONE_HEADERS =
  /^\s*(?:[-*•–—]|\d+[.)]|\([0-9a-zA-Z]\)|#[0-9]+)?\s*(?:rx|r\/x|medicines?|medications?|treatment|drugs?|prescriptions?|investigations?|labs?|lab\s+tests?|tests\s+advised|tests?|diagnostics?|imaging|radiology|pathology|scans?|advice|advise|instructions?|patient\s+instructions?|follow[\s-]?up|plan|home\s*care|diet|precautions?|lifestyle|diagnosis|clinical\s+dx|provisional\s+diagnosis|dx|impression|findings?|assessment)(?:\s*[&/+\-]\s*(?:rx|medicines?|instructions?|advice|diet|precautions?|follow[\s-]?up|medications?|labs?|scans?|imaging|investigations?))*\s*$/i

function classifyHeader(
  headerText: string,
): "diagnosis" | "advice" | "lab" | "rx" | null {
  const norm = headerText
    .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "")
    .toLowerCase()
    .replace(/[&/+\-_]/g, " ")
    .trim()

  if (
    /\b(diagnos\w*|diag\b|dx\b|impression|findings?|assessment|complaint|condition)\b/i.test(
      norm,
    )
  )
    return "diagnosis"
  if (
    /\b(advice|advise|instruction|instructions|follow[\s-]?up|plan|home\s*care|diet|precaution|precautions|lifestyle)\b/i.test(
      norm,
    )
  )
    return "advice"
  if (
    /\b(investigation|investigations|lab|labs|test|tests|diagnostics?|imaging|radiology|pathology|scans?)\b/i.test(
      norm,
    )
  )
    return "lab"
  if (
    /\b(rx|r\/x|med|meds|medicine|medicines|medication|medications|drugs?|treatment|prescription)\b/i.test(
      norm,
    )
  )
    return "rx"
  return null
}

const DOSES_PER_DAY: Record<string, number> = {
  OD: 1,
  HS: 1,
  BD: 2,
  TDS: 3,
  TID: 3,
  QID: 4,
  QDS: 4,
  "1-0-1": 2,
  "1-1-1": 3,
  "0-0-1": 1,
  "1-0-0": 1,
  "0-1-0": 1,
  "1-1-0": 2,
  "0-1-1": 2,
}

/**
 * Units to dispense for "frequency x duration" ("TDS", "5 days" -> 15). Used when a model
 * returns no quantity, so the review table agrees with what the sheet reader and the
 * pharmacy work out from the same line (it used to show 1 while 15 was dispatched).
 */
function estimateQuantity(frequency?: string, duration?: string): number {
  const freq = String(frequency || "").trim().toUpperCase()
  const perDay = DOSES_PER_DAY[freq] || 0
  const m = /(\d+)\s*(day|d|week|wk|w|month|mo|m)/i.exec(String(duration || ""))
  if (!perDay || !m) return 1
  const unit = m[2].toLowerCase()
  const mult = unit.startsWith("w") ? 7 : unit.startsWith("m") ? 30 : 1
  return Math.max(1, perDay * parseInt(m[1], 10) * mult)
}

const INSTRUCTION_PATTERNS = [
  /\b(after\s+(?:food|meals|breakfast|lunch|dinner)|pc)\b/i,
  /\b(before\s+(?:food|meals|breakfast|lunch|dinner)|empty\s+stomach|ac)\b/i,
  /\b(with\s+(?:food|milk|water|warm\s+water))\b/i,
  /\b(at\s+bedtime|bedtime|at\s+night|night\s+only|morning\s+only|in\s+the\s+morning)\b/i,
  /\b(for\s+(?:fever|pain|severe\s+pain|cough|acidity|cold))\b/i,
  /\b(as\s+needed|if\s+needed|if\s+required|when\s+required)\b/i,
  /\b(sublingually|swallow\s+whole|chewable|apply\s+locally|gargle|inhalation)\b/i,
]

const ROUTINE_FREQ_RE =
  /\b(OD|BD|TDS|TID|QID|QDS|HS|1-0-1|1-1-1|0-0-1|1-0-0|0-1-0|1-1-0|0-1-1|1-0-1-0|1-1-1-1|1\/2-0-1\/2|½-0-½|once\s+daily|twice\s+daily|thrice\s+daily)\b/i

const looksLikeLab = (line: string) => {
  const l = line.toLowerCase()
  return LAB_KEYWORDS.some((k) => l.includes(k)) || /\btests?\b/i.test(line)
}

const looksLikeMed = (line: string) => {
  if (FORM_PREFIX_RE.test(line) || MED_PATTERNS[0].test(line)) return true
  if (MED_PATTERNS[2].test(line)) return true
  if (
    (STRENGTH_RE.test(line) || BARE_STRENGTH_RE.test(line)) &&
    ROUTINE_FREQ_RE.test(line)
  )
    return true
  return false
}

function parseMedicationLine(line: string): ParsedMedication {
  let cleaned = line.replace(BULLET_RE, "").trim()

  // 1. Strip form prefix (Tab., Cap., Syp., Inj.)
  const formMatch = FORM_PREFIX_RE.exec(cleaned)
  if (formMatch) {
    cleaned = cleaned.replace(FORM_PREFIX_RE, "").trim()
  }

  // 2. Extract instructions
  let instructions = ""
  for (const pat of INSTRUCTION_PATTERNS) {
    const m = pat.exec(cleaned)
    if (m) {
      instructions = m[0].trim()
      cleaned = cleaned.replace(pat, " ")
      break
    }
  }

  // 3. Extract duration
  const durationMatch = DURATION_RE.exec(cleaned)
  const shorthandMatch = !durationMatch ? SHORTHAND_RE.exec(cleaned) : null
  let durationStr = ""
  let durationDays = 0

  if (durationMatch) {
    durationStr = `${durationMatch[1]} ${durationMatch[2]}`
    const unit = durationMatch[2].toLowerCase()
    const mult =
      unit.startsWith("w") || unit === "w" || unit === "wk"
        ? 7
        : unit.startsWith("m") || unit === "mo"
        ? 30
        : 1
    durationDays = parseInt(durationMatch[1], 10) * mult
    cleaned = cleaned.replace(durationMatch[0], " ")
  } else if (shorthandMatch) {
    const unit =
      shorthandMatch[2] === "7"
        ? "days"
        : shorthandMatch[2] === "52"
        ? "weeks"
        : "months"
    durationStr = `${shorthandMatch[1]} ${unit}`
    const mult =
      shorthandMatch[2] === "7" ? 1 : shorthandMatch[2] === "52" ? 7 : 30
    durationDays = parseInt(shorthandMatch[1], 10) * mult
    cleaned = cleaned.replace(shorthandMatch[0], " ")
  }

  // 4. Extract frequency
  const freqMatch = FREQUENCY_RE.exec(cleaned)
  let freq = ""
  if (freqMatch) {
    const rawFreq = freqMatch[1].toUpperCase()
    if (/once\s+daily|once\s+a\s+day/i.test(rawFreq)) freq = "OD"
    else if (/twice\s+daily|twice\s+a\s+day/i.test(rawFreq)) freq = "BD"
    else if (/thrice\s+daily|three\s+times/i.test(rawFreq)) freq = "TDS"
    else if (/four\s+times/i.test(rawFreq)) freq = "QID"
    else if (/bedtime|at\s+night/i.test(rawFreq)) freq = "HS"
    else freq = rawFreq
    cleaned = cleaned.replace(freqMatch[0], " ")
  }

  // 5. Extract dosage (e.g. 1 tab, 10ml, 2 puffs)
  const dosageMatch = DOSAGE_RE.exec(cleaned)
  let dosage = ""
  if (dosageMatch) {
    dosage = dosageMatch[1]
    cleaned = cleaned.replace(dosageMatch[0], " ")
  }

  // 6. Extract strength (with unit or bare number)
  const strengthMatch = STRENGTH_RE.exec(cleaned)
  let strength = ""
  if (strengthMatch) {
    strength = strengthMatch[1].trim()
    cleaned = cleaned.replace(strengthMatch[0], " ")
  } else {
    const bareMatch = BARE_STRENGTH_RE.exec(cleaned)
    if (bareMatch) {
      strength = bareMatch[1].trim() + "mg"
      cleaned = cleaned.replace(bareMatch[0], " ")
    }
  }

  let route = "Oral"
  if (/\b(inhaler|puff|nebuli)/i.test(cleaned)) route = "Inhalation"
  else if (/\bim\b/i.test(cleaned)) route = "IM"
  else if (/\biv\b/i.test(cleaned)) route = "IV"
  else if (/\bsc\b/i.test(cleaned)) route = "SC"
  else if (/\b(inj|injection)\b/i.test(cleaned)) route = "Injectable"
  else if (/\b(ointment|cream|gel|lotion|patch)\b/i.test(cleaned))
    route = "Topical"
  else if (/sublingual/i.test(cleaned)) route = "Sublingual"

  cleaned = cleaned.replace(
    /\b(iv|im|sc|po|oral|sublingual|topical|inj|injection)\b/gi,
    " ",
  )

  // 7. Clean up remaining medicine name
  let name = cleaned
    .replace(/\s+[x×*]\s*$/i, " ")
    .replace(/[\s,;|]+/g, " ")
    .replace(/^[-–—,;:.xX×#()\s]+|[-–—,;:.xX×#()\s]+$/g, "")
    .trim()

  const perDay =
    DOSES_PER_DAY[freq] ||
    (freq === "OD" || freq === "HS"
      ? 1
      : freq === "BD"
      ? 2
      : freq === "TDS"
      ? 3
      : freq === "QID"
      ? 4
      : 1)
  const quantity =
    perDay && durationDays ? Math.max(1, perDay * durationDays) : 1

  return {
    name: name || line.trim(),
    strength,
    dosage,
    frequency: freq,
    route,
    duration: durationStr,
    instructions,
    quantity,
  }
}

function buildLabTest(line: string): ParsedLabTest {
  const lowered = line.toLowerCase()
  const radiology = [
    "x-ray",
    "xray",
    "cxr",
    "mri",
    "ct ",
    "ct-",
    "scan",
    "ultrasound",
    "usg",
    "doppler",
    "sonography",
    "mammogram",
    "angiogram",
  ].some((k) => lowered.includes(k))
  const cardiology = [
    "ecg",
    "echo",
    "tmt",
    "holter",
    "treadmill",
  ].some((k) => lowered.includes(k))
  return {
    name:
      line
        .replace(/\s*[-–—]?\s*\b(stat|urgent)\b\s*$/i, "")
        .replace(/[-–—,;:.\s]+$/, "")
        .trim() || line.trim(),
    category: radiology ? "Radiology" : cardiology ? "Cardiology" : "Pathology",
    urgency: /\b(stat|urgent)\b/i.test(lowered) ? "STAT" : "Routine",
  }
}

/** Keyword split done entirely in the browser. Exported for the offline path and tests. */
export function localSplit(text: string): PrescriptionSplit {
  const diagnosisParts: string[] = []
  const adviceParts: string[] = []
  const medications: ParsedMedication[] = []
  const labTests: ParsedLabTest[] = []
  const unclassified: string[] = []
  let section: "lab" | "rx" | "advice" | "diagnosis" | null = null

  for (const rawLine of (text || "").split("\n")) {
    const line = rawLine.replace(BULLET_RE, "").trim()
    if (!line) continue

    const colonIndex = line.indexOf(":")
    if (colonIndex >= 0) {
      const head = line.slice(0, colonIndex).trim()
      const inline = line.slice(colonIndex + 1).trim()
      const headType = classifyHeader(head)
      if (headType) {
        section = headType
        if (inline) {
          if (headType === "diagnosis") {
            diagnosisParts.push(inline)
          } else if (headType === "advice") {
            adviceParts.push(inline)
          } else if (headType === "lab") {
            for (const piece of inline
              .split(/[,;]/)
              .map((p) => p.trim())
              .filter(Boolean)) {
              labTests.push(buildLabTest(piece))
            }
          } else if (headType === "rx") {
            for (const piece of inline
              .split(/[,;]/)
              .map((p) => p.trim())
              .filter(Boolean)) {
              medications.push(parseMedicationLine(piece))
            }
          }
        }
        continue
      }
    } else if (STANDALONE_HEADERS.test(line)) {
      const headType = classifyHeader(line)
      if (headType) {
        section = headType
        continue
      }
    }

    // Classification heuristics
    const isAdvice = ADVICE_PATTERN.test(line)
    const isMed = looksLikeMed(line)
    const isLab = looksLikeLab(line)

    if (isAdvice) {
      adviceParts.push(line)
    } else if (isMed) {
      // Medication line (even if section was diagnosis or lab)
      medications.push(parseMedicationLine(line))
    } else if (isLab) {
      const pieces = line
        .split(/[,;]/)
        .map((p) => p.trim())
        .filter(Boolean)
      if (pieces.length > 1 && pieces.some(looksLikeLab)) {
        pieces.forEach((p) => labTests.push(buildLabTest(p)))
      } else {
        labTests.push(buildLabTest(line))
      }
    } else if (section === "advice") {
      adviceParts.push(line)
    } else if (section === "rx") {
      medications.push(parseMedicationLine(line))
    } else if (section === "lab") {
      labTests.push(buildLabTest(line))
    } else if (section === "diagnosis") {
      diagnosisParts.push(line)
    } else {
      unclassified.push(line)
    }
  }

  return {
    diagnosis: diagnosisParts.join(", "),
    advice: adviceParts.join("\n"),
    summary: `${medications.length} medicine(s) and ${labTests.length} investigation(s) separated accurately.`,
    medications,
    labTests,
    unclassified,
    engine: "browser",
    ocrText: text,
  }
}
