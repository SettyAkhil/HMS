/**
 * Consultation voice engine: transcription clean-up, speaker separation and the
 * clinical note summary built from what was actually said in the room.
 *
 * Scope note -- this module deliberately produces **no orders**. A doctor does
 * not read a prescription out loud to the patient; what is spoken in a
 * consultation is history, examination and advice. Medicines and investigations
 * come from the prescription sheet the doctor writes, draws or uploads, and are
 * parsed there (see `prescriptionAI.ts`). Nothing here is allowed to create a
 * medicine or a lab test, because a drug conjured out of a noisy microphone
 * transcript is a dispensing error waiting to happen.
 *
 * What it does provide:
 *  1. Language auto-detection across Telugu, Hindi, Tamil, Kannada and English.
 *  2. Phonetic/terminology normalisation of raw speech-recognition output.
 *  3. Turn-level speaker separation (doctor vs. patient), with the cues that
 *     decided each turn kept on the turn so the attribution can be judged -- and
 *     corrected -- by the doctor rather than silently trusted.
 *  4. A structured clinical note (SOAP) summarised from those turns.
 */

import { API_BASE } from "./constants"
import { getCsrfToken, getHospitalCode } from "./api"

// ── Types ────────────────────────────────────────────────────────────────────

export type Speaker = "doctor" | "patient"

/** How a turn's speaker was decided, weakest last. */
export type SpeakerBasis = "manual" | "label" | "cues" | "turn-taking"

export interface TranscriptTurn {
  id: string
  speaker: Speaker
  text: string
  /** Milliseconds from the start of the recording. */
  atMs: number
  /** 0..1. Always 1 when the doctor set the speaker by hand. */
  confidence: number
  basis: SpeakerBasis
  /** The phrases that decided the speaker, shown in the UI as the reason. */
  cues: string[]
  languageCode: string
}

export interface LanguageDetectionResult {
  primaryLanguage: string
  languageCode: string
  isMultiLingual: boolean
  detectedLanguages: string[]
  confidence: number
}

export interface ConsultationNoteSummary {
  language: string
  languageCode: string
  isMultiLingual: boolean
  durationSeconds: number
  durationFormatted: string

  turnCount: number
  doctorTurns: number
  patientTurns: number
  /** Turns the diarizer is not confident about -- the doctor should check these. */
  uncertainTurns: number
  /** Share of the conversation the patient spoke, 0..1. */
  patientShare: number

  chiefComplaint: string
  historyOfPresentIllness: string
  /** Symptoms recognised in the patient's own words, with onset where stated. */
  symptoms: RecognisedSymptom[]
  patientReported: string[]
  doctorObservations: string[]
  assessment: string
  advice: string[]
  followUp: string

  soap: { subjective: string ;objective: string ;assessment: string ;plan: string }
  /** One paragraph, written into the consultation record and the patient journey. */
  narrative: string
  /** What the conversation did and did not cover -- prompts, not judgements. */
  coverage: {
    symptoms: boolean
    onset: boolean
    examination: boolean
    advice: boolean
    followUp: boolean
  }
}

export interface RecognisedSymptom {
  term: string
  /** The patient's own phrasing, before normalisation. */
  saidAs: string
  onset: string
}

// ── Whisper Large V3 Multilingual STT Integration ──────────────────────────

export const WHISPER_LANGUAGES = [
  { code: "auto", label: "Auto-Detect (99+ Languages)" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi (हिंदी)" },
  { code: "te", label: "Telugu (తెలుగు)" },
  { code: "ta", label: "Tamil (தமிழ்)" },
  { code: "kn", label: "Kannada (ಕನ್ನಡ)" },
  { code: "ml", label: "Malayalam (മലയാളം)" },
  { code: "mr", label: "Marathi (मराठी)" },
  { code: "bn", label: "Bengali (বাংলা)" },
  { code: "gu", label: "Gujarati (ગુજરાતી)" },
  { code: "pa", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "ur", label: "Urdu (اردو)" },
]

/**
 * Transcribes audio recordings using Whisper Large V3 multilingual speech-to-text API.
 */
export async function transcribeAudioWithWhisper(
  blob: Blob,
  language: string = "auto",
): Promise<string> {
  const formData = new FormData()
  formData.append("file", blob, "doctor-consultation.webm")
  if (language && language !== "auto") {
    formData.append("language", language)
  }
  formData.append("model", "whisper-large-v3")

  const csrfToken = getCsrfToken()
  const response = await fetch(`${API_BASE}/api/ai/transcribe`, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Hospital-Code": getHospitalCode(),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: formData,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || "Failed to transcribe recording with Whisper Large V3.")
  }
  return payload.text || ""
}

// ── Multi-lingual medical phonetic & terminology normalisation ───────────────
// Speech recognition returns a phonetic guess; these rules turn the common
// Indian-clinic variants of a term into the term a chart would use. They cover
// symptoms, anatomy, timing and advice -- the vocabulary of a consultation.
// Drug and test names are deliberately absent: see the scope note above.

const PHONETIC_MAP: [RegExp, string][] = [
  // ── Spoken numerals, so a duration survives into the note as a number ──
  [/\bone\b(?=\s+(day|week|month|year))/gi, "1"],
  [/\btwo\b(?=\s+(day|week|month|year))/gi, "2"],
  [/\bthree\b(?=\s+(day|week|month|year))/gi, "3"],
  [/\bfour\b(?=\s+(day|week|month|year))/gi, "4"],
  [/\bfive\b(?=\s+(day|week|month|year))/gi, "5"],
  [/\bsix\b(?=\s+(day|week|month|year))/gi, "6"],
  [/\bseven\b(?=\s+(day|week|month|year))/gi, "7"],
  [/\b(ten|10)\b(?=\s+(day|week|month|year))/gi, "10"],
  [/ఒక(టి)?\s*(?=రోజు|వారం|నెల)/gi, "1 "],
  [/రెండు\s*(?=రోజు|వారా|నెల)/gi, "2 "],
  [/మూడు\s*(?=రోజు|వారా|నెల)/gi, "3 "],
  [/నాలుగు\s*(?=రోజు|వారా|నెల)/gi, "4 "],
  [/ఐదు\s*(?=రోజు|వారా|నెల)/gi, "5 "],
  [/పది\s*(?=రోజు|వారా|నెల)/gi, "10 "],
  [/एक\s*(?=दिन|हफ्त|महीन)/gi, "1 "],
  [/दो\s*(?=दिन|हफ्त|महीन)/gi, "2 "],
  [/तीन\s*(?=दिन|हफ्त|महीन)/gi, "3 "],
  [/चार\s*(?=दिन|हफ्त|महीन)/gi, "4 "],
  [/पांच\s*(?=दिन|हफ्त|महीन)/gi, "5 "],

  // ── Telugu symptoms & clinical terms ──
  [/జ్వరం\s*(వచ్చింది|ఉంది)?/gi, "fever"],
  [/చలి\s*జ్వరం/gi, "fever with chills"],
  [/గొంతు\s*నొప్పి/gi, "throat pain"],
  [/తలనొప్పి/gi, "headache"],
  [/(కడుపు|పొట్ట)\s*నొప్పి/gi, "abdominal pain"],
  [/ఛాతీ\s*నొప్పి/gi, "chest pain"],
  [/వీపు\s*నొప్పి|నడుము\s*నొప్పి/gi, "back pain"],
  [/కీళ్ళ\s*నొప్పులు/gi, "joint pain"],
  [/దగ్గు/gi, "cough"],
  [/ఆయాసం|ఊపిరి\s*ఆడటం\s*లేదు/gi, "breathlessness"],
  [/వాంతులు/gi, "vomiting"],
  [/వికారం/gi, "nausea"],
  [/నీరసం|బలహీనత/gi, "weakness"],
  [/తల\s*తిరుగుతుంది/gi, "dizziness"],
  [/మోషన్స్|విరేచనాలు/gi, "loose motions"],
  [/మలబద్ధకం/gi, "constipation"],
  [/ఆకలి\s*లేకపోవడం/gi, "loss of appetite"],
  [/నిద్ర\s*పట్టడం\s*లేదు/gi, "disturbed sleep"],
  [/దురద/gi, "itching"],
  [/వాపు/gi, "swelling"],
  [/రక్తపోటు|బిపి/gi, "blood pressure"],
  [/షుగర్\s*వ్యాధి|మధుమేహం/gi, "diabetes"],
  [/రోజుల\s*నుండి|రోజుల\s*నుంచి/gi, "days"],
  [/వారాల\s*నుండి/gi, "weeks"],
  [/నెలల\s*నుండి/gi, "months"],
  [/నిన్నటి\s*నుండి/gi, "since yesterday"],
  [/విశ్రాంతి\s*తీసుకోండి/gi, "take rest"],
  [/(మంచి\s*)?నీళ్ళు\s*ఎక్కువగా\s*తాగండి/gi, "drink plenty of fluids"],

  // ── Hindi symptoms & clinical terms ──
  [/बुखार\s*(है)?/gi, "fever"],
  [/सर\s*दर्द|सिर\s*दर्द/gi, "headache"],
  [/पेट\s*दर्द/gi, "abdominal pain"],
  [/छाती\s*में\s*दर्द|सीने\s*में\s*दर्द/gi, "chest pain"],
  [/कमर\s*दर्द/gi, "back pain"],
  [/गले\s*में\s*दर्द/gi, "throat pain"],
  [/खाँसी|खांसी/gi, "cough"],
  [/सांस\s*फूलना|सांस\s*लेने\s*में\s*तकलीफ/gi, "breathlessness"],
  [/उल्टी/gi, "vomiting"],
  [/जी\s*मिचलाना/gi, "nausea"],
  [/कमजोरी/gi, "weakness"],
  [/चक्कर\s*आना/gi, "dizziness"],
  [/दस्त|लूज\s*मोशन/gi, "loose motions"],
  [/कब्ज/gi, "constipation"],
  [/भूख\s*नहीं\s*लगती/gi, "loss of appetite"],
  [/सूजन/gi, "swelling"],
  [/दिनों\s*से/gi, "days"],
  [/हफ्तों\s*से/gi, "weeks"],
  [/महीनों\s*से/gi, "months"],
  [/आराम\s*कीजिए/gi, "take rest"],

  // ── English speech-recognition clean-up ──
  [/\b(feverish|temperature\s+is\s+high|running\s+temperature)\b/gi, "fever"],
  [/\b(loose\s+motion|loose\s+motions|lose\s+motion)\b/gi, "loose motions"],
  [
    /\b(short\s+of\s+breath|breathlessness|breathing\s+difficulty|shortness\s+of\s+breath)\b/gi,
    "breathlessness",
  ],
  [/\b(stomach\s+ache|tummy\s+pain|belly\s+pain)\b/gi, "abdominal pain"],
  [/\b(head\s+ache|head\s+pain)\b/gi, "headache"],
  [/\b(giddiness|light\s+headed|lightheaded)\b/gi, "dizziness"],
  [/\b(throwing\s+up|puking)\b/gi, "vomiting"],
  [/\b(b\s*p|blood\s+pressure)\b/gi, "blood pressure"],
  [/\b(sugar\s+problem|sugar\s+patient)\b/gi, "diabetes"],
  [/\b(since\s+how\s+many\s+days)\b/gi, "since how many days"],
  // Speech recognition loves spelling out digits next to units.
  [/\b(\d+)\s+(days?|weeks?|months?|years?)\b/gi, "$1 $2"],
]

/** Auto-detects the spoken language(s) of a transcript. */
export function detectLanguage(text: string): LanguageDetectionResult {
  if (!text || !text.trim()) {
    return {
      primaryLanguage: "English",
      languageCode: "en-IN",
      isMultiLingual: false,
      detectedLanguages: ["English"],
      confidence: 1,
    }
  }

  const scripts: { name: string ;code: string ;count: number }[] = [
    {
      name: "Telugu (తెలుగు)",
      code: "te-IN",
      count: (text.match(/[ఀ-౿]/g) || []).length,
    },
    {
      name: "Hindi (हिंदी)",
      code: "hi-IN",
      count: (text.match(/[ऀ-ॿ]/g) || []).length,
    },
    {
      name: "Tamil (தமிழ்)",
      code: "ta-IN",
      count: (text.match(/[஀-௿]/g) || []).length,
    },
    {
      name: "Kannada (ಕನ್ನಡ)",
      code: "kn-IN",
      count: (text.match(/[ಀ-೿]/g) || []).length,
    },
    {
      name: "English",
      code: "en-IN",
      count: (text.match(/[a-zA-Z]/g) || []).length,
    },
  ]

  const detected = scripts.filter((s) => s.count > (s.code === "en-IN" ? 5 : 3))
  const ranked = [...scripts].sort((a, b) => b.count - a.count)
  const primary = ranked[0].count > 0 ? ranked[0] : scripts[4]
  const total = scripts.reduce((sum, s) => sum + s.count, 0) || 1

  const names = detected.map((s) => s.name)
  const isMultiLingual = names.length > 1

  return {
    primaryLanguage: isMultiLingual ? names.join(" + ") : primary.name,
    languageCode: primary.code,
    isMultiLingual,
    detectedLanguages: names.length ? names : ["English"],
    confidence: Math.min(1, primary.count / total),
  }
}

/** Cleans one utterance of raw speech-recognition output into chart vocabulary. */
export function normalizeMedicalSpeech(rawText: string): string {
  if (!rawText) return ""
  let text = rawText.replace(/\s+/g, " ").trim()
  for (const [regex, replacement] of PHONETIC_MAP) {
    text = text.replace(regex, replacement)
  }
  // Sentence-case the utterance; recognisers return everything lower-cased.
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ── Speaker separation ───────────────────────────────────────────────────────
// Weighted cues rather than a flat keyword count: "how long has this been going
// on" is a doctor asking, "it has been going on three days" is a patient
// answering, and the two share most of their words. Weight is what separates
// them, plus the fact that a consultation alternates.

interface Cue {
  pattern: RegExp
  weight: number
  label: string
}

/** Phrases only the clinician in the room says. */
const DOCTOR_CUES: Cue[] = [
  {
    pattern:
      /\b(since\s+when|how\s+long|how\s+many\s+days|when\s+did\s+it\s+start|any\s+other|anything\s+else)\b/i,
    weight: 3,
    label: "history question",
  },
  {
    pattern:
      /\b(do\s+you|did\s+you|have\s+you|are\s+you|is\s+there\s+any|were\s+you)\b/i,
    weight: 3,
    label: "asks the patient",
  },
  {
    pattern:
      /\b(let\s+me\s+(see|check|examine)|open\s+your\s+mouth|show\s+me|lie\s+down|take\s+a\s+deep\s+breath|breathe\s+in)\b/i,
    weight: 4,
    label: "examination instruction",
  },
  {
    pattern:
      /\b(on\s+examination|i\s+can\s+(see|hear|feel)|there\s+is\s+no|your\s+(blood\s+pressure|pulse|temperature|throat|chest|abdomen))\b/i,
    weight: 4,
    label: "examination finding",
  },
  {
    pattern: /\b(looks\s+like|appears\s+to\s+be|seems\s+to\s+be)\b/i,
    weight: 2,
    label: "clinical statement",
  },
  {
    pattern:
      /\b(you\s+(should|need\s+to|must|can)|avoid|take\s+rest|drink\s+(plenty|more|plenty\s+of\s+fluids)|come\s+back|follow\s+up|review\s+after|see\s+me\s+again|don'?t\s+worry|nothing\s+to\s+worry)\b/i,
    weight: 3,
    label: "advice to patient",
  },
  {
    pattern: /^(any|is\s+there\s+any|anything)\b/i,
    weight: 3,
    label: "review of systems",
  },
  {
    pattern:
      /\b(diagnosis|i\s+will\s+write|i\s+am\s+writing|this\s+is\s+a|it\s+is\s+a|viral|bacterial|infection|inflammation)\b/i,
    weight: 2,
    label: "clinical judgement",
  },
  {
    pattern: /(ఎప్పటి\s*నుండి|ఎన్ని\s*రోజుల|చూపించండి|పడుకోండి|నోరు\s*తెరవండి|భయపడకండి)/i,
    weight: 3,
    label: "doctor (Telugu)",
  },
  {
    pattern: /(कब\s*से|कितने\s*दिन|दिखाइए|लेट\s*जाइए|मुँह\s*खोलिए|घबराइए\s*मत)/i,
    weight: 3,
    label: "doctor (Hindi)",
  },
]

/** Phrases only the person with the illness says. */
const PATIENT_CUES: Cue[] = [
  {
    pattern:
      /\b(i\s+(have|feel|am\s+having|had|get|got|can'?t|cannot)|i'?m\s+(having|feeling))\b/i,
    weight: 4,
    label: "first-person symptom",
  },
  {
    pattern:
      /\bmy\s+(head|chest|stomach|throat|back|leg|arm|knee|eye|ear|body|joints?|tummy)\b/i,
    weight: 4,
    label: "own body part",
  },
  {
    pattern:
      /\b(it\s+(hurts|pains|burns)|paining|hurting|not\s+able\s+to\s+(eat|sleep|walk|breathe))\b/i,
    weight: 3,
    label: "describes symptom",
  },
  {
    pattern:
      /\b(yes\s+(doctor|sir|madam)|no\s+(doctor|sir|madam)|okay\s+doctor|thank\s+you\s+doctor)\b/i,
    weight: 4,
    label: "answers the doctor",
  },
  {
    pattern:
      /\b(since|from|for\s+the\s+last|past)\s+\d*\s*(day|days|week|weeks|month|months|yesterday|morning|night)\b/i,
    weight: 2,
    label: "states duration",
  },
  {
    pattern: /(నాకు|నాది|నా\s|బాధపడుతున్నాను|అవుతుంది|తగ్గడం\s*లేదు)/i,
    weight: 4,
    label: "patient (Telugu)",
  },
  {
    pattern: /(मुझे|मेरा|मेरी|मेरे|हो\s*रहा\s*है|नहीं\s*हो\s*रहा)/i,
    weight: 4,
    label: "patient (Hindi)",
  },
  {
    pattern:
      /\b(will\s+it\s+(go|get|take)|is\s+it\s+(serious|dangerous|bad)|how\s+long\s+will\s+it\s+take|can\s+i\s+|should\s+i\s+|do\s+i\s+(have|need)|what\s+happened\s+to\s+me)\b/i,
    weight: 3,
    label: "asks about their illness",
  },
]

const SECOND_PERSON = /\b(you|your|మీ|మీకు|आप|आपको|आपका)\b/i
const FIRST_PERSON = /\b(i|me|my|mine|నాకు|నా|मुझे|मेरा|मेरी)\b/i

export interface SpeakerAttribution {
  speaker: Speaker
  confidence: number
  basis: SpeakerBasis
  cues: string[]
}

/**
 * Decides who said one utterance.
 *
 * `previousSpeaker` matters: a consultation alternates, so an utterance with no
 * cues of its own most likely came from whoever did *not* just speak -- but that
 * is the weakest signal available, and it is reported as such so the UI can flag
 * the turn for the doctor to correct instead of presenting a guess as a fact.
 */
export function attributeSpeaker(
  text: string,
  previousSpeaker?: Speaker,
): SpeakerAttribution {
  const clean = text.trim()
  if (!clean) {
    return {
      speaker: previousSpeaker || "doctor",
      confidence: 0,
      basis: "turn-taking",
      cues: [],
    }
  }

  const explicit = /^(doctor|dr|physician|డాక్టర్|डॉक्टर)\s*[:\-]/i.test(clean)
    ? "doctor"
    : /^(patient|pt|पेशेंट|పేషెంట్|मरीज)\s*[:\-]/i.test(clean)
      ? "patient"
      : null
  if (explicit) {
    return {
      speaker: explicit as Speaker,
      confidence: 1,
      basis: "label",
      cues: ["explicit label"],
    }
  }

  let doctorScore = 0
  let patientScore = 0
  const cues: string[] = []

  for (const cue of DOCTOR_CUES) {
    if (cue.pattern.test(clean)) {
      doctorScore += cue.weight
      cues.push(cue.label)
    }
  }
  for (const cue of PATIENT_CUES) {
    if (cue.pattern.test(clean)) {
      patientScore += cue.weight
      cues.push(cue.label)
    }
  }

  // A question is a strong signal, but of *whom* depends on the pronoun: "how
  // long have you had it" is the doctor, "will it go away" is the patient.
  const isQuestion =
    /\?\s*$/.test(clean) ||
    /^(how|what|when|where|why|which|is|are|do|does|did|can|will|should|have|has)\b/i.test(
      clean,
    )
  if (isQuestion) {
    if (SECOND_PERSON.test(clean) && !FIRST_PERSON.test(clean)) {
      doctorScore += 3
      cues.push("asks about you")
    } else if (FIRST_PERSON.test(clean) && !SECOND_PERSON.test(clean)) {
      patientScore += 2
      cues.push("asks about self")
    } else {
      doctorScore += 1
    }
  }

  if (doctorScore === patientScore) {
    // Nothing in the words separates them. Fall back on alternation.
    const speaker: Speaker = previousSpeaker === "doctor" ? "patient" : "doctor"
    return {
      speaker,
      confidence: doctorScore === 0 ? 0.25 : 0.4,
      basis: "turn-taking",
      cues: cues.length ? cues : ["no distinguishing cues"],
    }
  }

  let winner: Speaker = doctorScore > patientScore ? "doctor" : "patient"
  let margin = Math.abs(doctorScore - patientScore)

  // A one-point win over whoever just finished speaking is not evidence of
  // anything -- people take turns. Hand the floor over and say so, rather than
  // reporting a coin flip as a decision.
  if (previousSpeaker && winner === previousSpeaker && margin <= 1) {
    winner = previousSpeaker === "doctor" ? "patient" : "doctor"
    return {
      speaker: winner,
      confidence: 0.35,
      basis: "turn-taking",
      cues: cues.length ? [...cues, "weak against turn order"] : ["turn order"],
    }
  }
  const total = doctorScore + patientScore
  // Confidence is the margin as a share of the evidence, floored so a single
  // weak cue never reads as certainty and capped below an explicit label.
  const confidence = Math.max(
    0.35,
    Math.min(
      0.95,
      (margin / Math.max(total, 1)) * 0.6 + Math.min(margin, 6) / 12,
    ),
  )

  return { speaker: winner, confidence, basis: "cues", cues }
}

let turnCounter = 0
function nextTurnId(): string {
  turnCounter += 1
  return `turn-${Date.now().toString(36)}-${turnCounter.toString(36)}`
}

/**
 * Builds one turn from a freshly recognised utterance.
 *
 * `forcedSpeaker` is the doctor's own Doctor/Patient toggle. When it is set the
 * heuristics are not consulted at all -- a human in the room beats a keyword
 * list, and the turn is marked `manual` so the UI does not flag it for review.
 */
export function buildTurn(
  rawText: string,
  options: {
    atMs: number
    previousSpeaker?: Speaker
    forcedSpeaker?: Speaker | null
  },
): TranscriptTurn | null {
  const text = normalizeMedicalSpeech(rawText).replace(
    /^(doctor|dr|patient|pt)\s*[:\-]\s*/i,
    "",
  )
  if (!text.trim()) return null

  const attribution = options.forcedSpeaker
    ? {
        speaker: options.forcedSpeaker,
        confidence: 1,
        basis: "manual" as SpeakerBasis,
        cues: ["set by the doctor"],
      }
    : attributeSpeaker(text, options.previousSpeaker)

  return {
    id: nextTurnId(),
    speaker: attribution.speaker,
    text,
    atMs: Math.max(0, options.atMs),
    confidence: attribution.confidence,
    basis: attribution.basis,
    cues: attribution.cues,
    languageCode: detectLanguage(text).languageCode,
  }
}

/** Parses a pasted or typed conversation into turns, one per line. */
export function diarizeTranscript(transcript: string): TranscriptTurn[] {
  const lines = transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const turns: TranscriptTurn[] = []
  for (const line of lines) {
    const turn = buildTurn(line, {
      atMs: turns.length * 1000,
      previousSpeaker: turns[turns.length - 1]?.speaker,
    })
    if (turn) turns.push(turn)
  }
  return turns
}

/** Re-assigns one turn's speaker. The correction is authoritative from then on. */
export function setTurnSpeaker(
  turns: TranscriptTurn[],
  turnId: string,
  speaker: Speaker,
): TranscriptTurn[] {
  return turns.map((turn) =>
    turn.id === turnId
      ? {
          ...turn,
          speaker,
          confidence: 1,
          basis: "manual" as SpeakerBasis,
          cues: ["corrected by the doctor"],
        }
      : turn,
  )
}

/** The transcript as a speaker-labelled block, for the record and for export. */
export function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map(
      (turn) =>
        `${turn.speaker === "doctor" ? "Doctor" : "Patient"}: ${turn.text}`,
    )
    .join("\n")
}

// ── Clinical note summarisation ──────────────────────────────────────────────

const SYMPTOM_LEXICON: { term: string ;pattern: RegExp }[] = [
  { term: "Fever", pattern: /\bfever\b/i },
  { term: "Cough", pattern: /\bcough\b/i },
  { term: "Headache", pattern: /\bheadache\b/i },
  { term: "Throat pain", pattern: /\bthroat pain\b/i },
  { term: "Chest pain", pattern: /\bchest pain\b/i },
  { term: "Abdominal pain", pattern: /\babdominal pain\b/i },
  { term: "Back pain", pattern: /\bback pain\b/i },
  { term: "Joint pain", pattern: /\bjoint pain\b/i },
  { term: "Breathlessness", pattern: /\bbreathlessness\b/i },
  { term: "Vomiting", pattern: /\bvomiting\b/i },
  { term: "Nausea", pattern: /\bnausea\b/i },
  { term: "Loose motions", pattern: /\bloose motions\b/i },
  { term: "Constipation", pattern: /\bconstipation\b/i },
  { term: "Dizziness", pattern: /\bdizziness\b/i },
  { term: "Weakness", pattern: /\bweakness\b/i },
  { term: "Loss of appetite", pattern: /\bloss of appetite\b/i },
  { term: "Swelling", pattern: /\bswelling\b/i },
  { term: "Itching", pattern: /\bitching\b/i },
  { term: "Disturbed sleep", pattern: /\bdisturbed sleep\b/i },
  {
    term: "Burning micturition",
    pattern: /\bburning (urination|micturition)\b/i,
  },
  { term: "Rash", pattern: /\brash\b/i },
  { term: "Palpitations", pattern: /\bpalpitations?\b/i },
]

const ONSET_RE =
  /\b((?:since|from|for the last|past)\s+(?:\d+\s+)?(?:day|days|week|weeks|month|months|year|years|yesterday|morning|night|evening)|\d+\s+(?:day|days|week|weeks|month|months|year|years))\b/i

// An examination finding is something the doctor observed, stated as a fact
// about the patient's body -- not an instruction ("open your mouth") and not a
// conclusion ("this looks like a viral infection"), both of which belong in
// other sections and both of which an over-broad pattern will swallow.
const EXAM_RE =
  /\b(on examination|i can (see|hear|feel)|your (blood pressure|pulse|temperature|throat|chest|abdomen|tongue|eyes|heart|lungs)\s+(is|are|looks|appears|seems)|there (is|are) (no )?(tenderness|swelling|rash|redness|congestion)|(is|are|looks|appears) (tender|swollen|congested|clear|normal|red|pale))/i
const EXAM_INSTRUCTION_RE =
  /\b(let me (see|check|examine)|open your mouth|show me|lie down|sit up|take a deep breath|breathe in)\b/i
const ADVICE_RE =
  /\b(take rest|get rest|avoid|drink|diet|fluids|steam|warm water|gargle|walk|exercise|do not|don'?t|stop|continue|monitor)\b/i
const FOLLOWUP_RE =
  /\b(come back|follow up|follow-up|review (after|in)|see me (again|after)|next visit|revisit|after (\d+|a|one|two|three) (day|days|week|weeks|month|months))\b/i
const ASSESSMENT_RE =
  /\b(this (is|looks like|seems)|it (is|looks like|seems)|diagnosis|most likely|probably|viral|bacterial|infection|inflammation|gastritis|migraine|allergy|allergic|sprain|strain|anemia|anaemia|uncontrolled|under control)\b/i

function firstSentence(text: string): string {
  return sentences(text)[0] || text.trim()
}

/**
 * Splits an utterance into sentences.
 *
 * The note is assembled sentence by sentence, not line by line: "Take rest and
 * drink plenty of fluids. Come back after 7 days." is one breath and two
 * different parts of the note, and classifying the whole line sent the advice
 * into the follow-up field and left "Advice given" reading "not stated".
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "not timed"
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

/**
 * Summarises the consultation into a clinical note.
 *
 * The patient's turns become the subjective half (complaint and history), the
 * doctor's declarative turns become the objective/assessment half, and the
 * doctor's instructional turns become the plan. Nothing becomes a medicine or a
 * test -- the plan section says where those come from instead.
 */
export function summariseConsultation(
  turns: TranscriptTurn[],
  options: { durationSeconds?: number ;patientName?: string } = {},
): ConsultationNoteSummary {
  const durationSeconds = Math.max(0, Math.round(options.durationSeconds || 0))
  const fullText = turns.map((t) => t.text).join("\n")
  const language = detectLanguage(fullText)

  const patientTurns = turns.filter((t) => t.speaker === "patient")
  const doctorTurns = turns.filter((t) => t.speaker === "doctor")
  const patientText = patientTurns.map((t) => t.text)
  const doctorText = doctorTurns.map((t) => t.text)

  // Symptoms, in the patient's own words, with the onset they gave.
  const symptoms: RecognisedSymptom[] = []
  for (const entry of SYMPTOM_LEXICON) {
    const source = patientText.find((line) => entry.pattern.test(line)) || ""
    if (!source) continue
    symptoms.push({
      term: entry.term,
      saidAs: firstSentence(source),
      onset: (source.match(ONSET_RE)?.[0] || "").trim(),
    })
  }

  const complaintLine = patientText.find((line) =>
    SYMPTOM_LEXICON.some((s) => s.pattern.test(line)),
  )
  const chiefComplaint = symptoms.length
    ? symptoms
        .slice(0, 3)
        .map((s) => (s.onset ? `${s.term} (${s.onset})` : s.term))
        .join(", ")
    : complaintLine
      ? firstSentence(complaintLine)
      : patientText.length
        ? firstSentence(patientText[0])
        : ""

  const historyOfPresentIllness = patientText.length
    ? patientText.join(" ").replace(/\s+/g, " ").trim()
    : ""

  // Every declarative sentence the doctor spoke, as sentences rather than lines.
  const statements = doctorText
    .flatMap(sentences)
    .filter((part) => !/\?\s*$/.test(part))

  // Assigned in order of specificity, each section claiming its sentences before
  // the next one looks, so a sentence lands in exactly one part of the note:
  // "this looks like a viral infection" is an impression, never a finding, and
  // "come back after 7 days" is follow-up, not advice.
  const claimed = new Set<string>()

  const assessmentSentence = statements.find(
    (part) => ASSESSMENT_RE.test(part) && !EXAM_RE.test(part),
  )
  const assessment = assessmentSentence || ""
  if (assessmentSentence) claimed.add(assessmentSentence)

  const followUpSentence = statements.find((part) => FOLLOWUP_RE.test(part))
  const followUp = followUpSentence || ""
  if (followUpSentence) claimed.add(followUpSentence)

  const doctorObservations = unique(
    statements.filter(
      (part) =>
        !claimed.has(part) &&
        (EXAM_RE.test(part) || EXAM_INSTRUCTION_RE.test(part)),
    ),
  )
  doctorObservations.forEach((part) => claimed.add(part))

  const advice = unique(
    statements.filter((part) => !claimed.has(part) && ADVICE_RE.test(part)),
  )

  const who = options.patientName ? options.patientName : "The patient"
  const uncertainTurns = turns.filter(
    (t) => t.basis !== "manual" && t.basis !== "label" && t.confidence < 0.5,
  ).length

  const subjective = historyOfPresentIllness
    ? `${who} reports ${chiefComplaint || "the symptoms below"}. ${historyOfPresentIllness}`
    : chiefComplaint
      ? `${who} reports ${chiefComplaint}.`
      : "Nothing recorded from the patient in this conversation."

  const objective = doctorObservations.length
    ? doctorObservations.join(" ")
    : "No examination findings were spoken during the recording. Vitals are on the patient card."

  const assessmentText =
    assessment ||
    "Clinical impression not stated aloud — confirm on the prescription sheet."

  const planParts = [
    advice.length ? `Advice: ${advice.join(" ")}` : "",
    followUp ? `Follow-up: ${followUp}` : "",
    "Medicines and investigations are taken from the prescription sheet, not from this recording.",
  ].filter(Boolean)

  const narrative = [
    `Voice consultation${
      durationSeconds ? ` (${formatDuration(durationSeconds)}` : " ("
    }${
      durationSeconds ? ", " : ""
    }${language.primaryLanguage}), ${turns.length} exchange${
      turns.length === 1 ? "" : "s"
    }.`,
    chiefComplaint ? `${who} reports ${chiefComplaint}.` : "",
    doctorObservations.length
      ? `On examination: ${doctorObservations.join(" ")}`
      : "",
    assessment ? `Impression: ${assessment}` : "",
    advice.length ? `Advice given: ${advice.join(" ")}` : "",
    followUp ? followUp : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return {
    language: language.primaryLanguage,
    languageCode: language.languageCode,
    isMultiLingual: language.isMultiLingual,
    durationSeconds,
    durationFormatted: formatDuration(durationSeconds),

    turnCount: turns.length,
    doctorTurns: doctorTurns.length,
    patientTurns: patientTurns.length,
    uncertainTurns,
    patientShare: turns.length ? patientTurns.length / turns.length : 0,

    chiefComplaint,
    historyOfPresentIllness,
    symptoms,
    patientReported: unique(patientText.map(firstSentence)),
    doctorObservations,
    assessment,
    advice,
    followUp,

    soap: {
      subjective,
      objective,
      assessment: assessmentText,
      plan: planParts.join(" "),
    },
    narrative,
    coverage: {
      symptoms: symptoms.length > 0 || patientTurns.length > 0,
      onset:
        symptoms.some((s) => !!s.onset) ||
        ONSET_RE.test(historyOfPresentIllness),
      examination: doctorObservations.length > 0,
      advice: advice.length > 0,
      followUp: !!followUp,
    },
  }
}
