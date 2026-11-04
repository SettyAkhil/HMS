/**
 * Patient discharge summaries for Hosp AI → Clinical Summaries.
 *
 * Search a patient by name / UMR / phone, pick a stay, and get the complete
 * discharge summary for it. Two layers, kept apart on purpose:
 *
 *  - The **record** layer (compileDischargeSummary) only ever copies what a
 *    desk actually recorded -- discharge records, ER visits, OP encounters,
 *    consultations, lab orders, prescriptions, OT booklets. A field nobody
 *    recorded comes back null and the page says "Not recorded"; nothing here
 *    invents an age, a blood group or a dose.
 *  - The **narrative** layer (generateDischargeNarrative) asks the local Qwen
 *    model to write the hospital course, advice and warning signs *from those
 *    facts only*, and the page labels it as an AI draft.
 *
 * The stores do not share one patient key (OP uses UMR, ER and beds their own
 * ids, discharge records a derived MRN), so records are linked by any shared
 * id and, failing that, by the patient's full name. A summary that needed a
 * name-only link says so, so the identity gets checked before it is signed.
 */

import { db, type DBOPEncounter, type DBPatient } from "./db"
import { ErDatabase, type ErVisitRecord } from "./erDb"
import { BedDatabase, type BedRecord, type DischargedPatientRecord } from "./bedDb"
import { LabOrderDatabase, type LabOrder } from "./labOrdersDb"
import { PharmacyDatabase, type AppPrescription } from "./pharmacyDb"
import { DoctorPortalDatabase, type ConsultationRecord } from "./doctorPortalDb"
import { SurgeryDatabase, type SurgicalCase } from "./surgeryDb"
import {
  getDischargedIcuPatients,
  type IcuDischargeRecord,
} from "../components/icu/IcuDischargeModal"
import { LLM_API_KEY, LLM_CHAT_URL, llmModel } from "../lib/llm"
import { formatDateTimeIST } from "../lib/format"
import { API_BASE } from "../lib/constants"
import { withAuthHeaders } from "../lib/api"

// ── Types ────────────────────────────────────────────────────────────────────

export type PatientStatus = "Admitted" | "Discharged" | "ICU discharge" | "Emergency" | "Outpatient"

export interface SummaryPatientHit {
  key: string
  name: string
  ids: string[]
  age: number | null
  gender: string | null
  status: PatientStatus
  lastDate: string | null
  detail: string
  /** patient_id in the backend EMR, when the backend knows this patient. */
  backendId?: string
}

export interface StayEpisode {
  id: string
  kind: "Inpatient" | "ICU" | "Emergency"
  admittedAt: string | null
  /** null while the patient is still admitted. */
  dischargedAt: string | null
  ward: string | null
  bed: string | null
  attendingDoctor: string | null
  dischargeReason: string | null
  dischargeType: string | null
  /** Condition at discharge, as the discharging desk recorded it. */
  condition: string | null
  /** Condition when the patient arrived (ER). Never shown as the discharge condition. */
  arrivalCondition: string | null
  diagnosis: string | null
  notes: string | null
  lengthOfStayDays: number | null
}

export interface SummaryDiagnosis { text: string ;code?: string ;source: string ;date?: string }
export interface SummaryComplaint { text: string ;detail?: string ;date?: string ;source: string }
export interface SummaryVitals { label: string ;at: string ;values: [string, string][] ;source: string }
export interface SummaryInvestigation {
  test: string
  result: string
  range?: string
  flag?: string
  status: string
  date?: string
  source: string
}
export interface SummaryProcedure { name: string ;date?: string ;by?: string ;notes?: string ;source: string }
export interface SummaryMedication {
  medicine: string
  dose: string
  frequency: string
  duration: string
  instructions: string
  source: string
}
export interface SummaryNote { kind: string ;author?: string ;text: string ;date?: string ;source: string }
export interface SummarySource { id: string ;label: string ;date?: string ;matchedBy: "id" | "name" }

export interface DischargeSummaryData {
  patient: {
    name: string
    ids: string[]
    age: number | null
    gender: string | null
    bloodGroup: string | null
    phone: string | null
    address: string | null
    allergies: string | null
    emergencyContact: string | null
  }
  episodes: StayEpisode[]
  episode: StayEpisode | null
  scope: "stay" | "history"
  diagnoses: SummaryDiagnosis[]
  complaints: SummaryComplaint[]
  vitals: SummaryVitals[]
  investigations: SummaryInvestigation[]
  procedures: SummaryProcedure[]
  treatments: SummaryNote[]
  dischargeMedications: SummaryMedication[]
  stayMedications: SummaryMedication[]
  notes: SummaryNote[]
  advice: { text: string ;source: string }[]
  sources: SummarySource[]
  nameOnlyLinks: boolean
  /** How the patient reached the hospital, from the first ER visit of the stay. */
  arrival: {
    at: string | null
    mode: string | null
    broughtBy: string | null
    condition: string | null
    consciousness: string | null
    triage: string | null
    triageReason: string | null
  } | null
}

export interface DischargeNarrative {
  /** Diagnoses the notes / results state in words -- shown only when none is coded. */
  diagnoses: string[]
  /** Medicines the notes say to continue after discharge -- shown only when no prescription is recorded. */
  dischargeMedications: { medicine: string ;dose: string ;frequency: string ;duration: string }[]
  hospitalCourse: string
  conditionAtDischarge: string
  followUp: string
  advice: string[]
  warningSigns: string[]
  /** "qwen3-vl-8b" etc., or "record-based" when the model was unreachable. */
  engine: string
  aiGenerated: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const normId = (s?: string | null) => (s || "").trim().toUpperCase()
const normName = (s?: string | null) => (s || "").toLowerCase().replace(/\s+/g, " ").trim()
const clean = (s?: string | null) => {
  const v = (s ?? "").toString().trim()
  return v && v !== "-" && v.toLowerCase() !== "null" && v.toLowerCase() !== "undefined" ? v : ""
}
const ts = (iso?: string | null) => {
  if (!iso) return NaN
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? NaN : t
}
const fullName = (first?: string | null, last?: string | null) => `${first || ""} ${last || ""}`.trim()

/** "16 Sep 2026" -- the format the rest of a discharge summary reads in. */
export function formatDate(iso?: string | null): string {
  const t = ts(iso)
  if (Number.isNaN(t)) return ""
  return new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
}

/**
 * ER results are free text with no flag column. Only an explicit word sets a
 * flag ("Critical High", "elevated"); a finding without one stays unflagged
 * rather than being judged here.
 */
function flagFromText(result: string): string | undefined {
  if (/\bcritical/i.test(result)) return "Critical"
  if (/\b(high|elevated|raised)\b/i.test(result)) return "H"
  if (/\b(low|decreased|depleted)\b/i.test(result)) return "L"
  return undefined
}

/** "admit_icu" -> "Admit ICU"; free text is left alone. */
const humanize = (s?: string | null) => {
  const v = clean(s)
  if (!/^[a-z0-9_]+$/.test(v) || !v.includes("_")) return v
  return v
    .split("_")
    .map((w) => (["icu", "ccu", "er", "ot", "op", "ip", "lama", "dama"].includes(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
}

// A name only links records when it is specific enough to mean one person.
const linkableName = (n: string) => n.length >= 5 && n.includes(" ")

// ── Store snapshot ───────────────────────────────────────────────────────────

interface Snapshot {
  patients: DBPatient[]
  encounters: DBOPEncounter[]
  erVisits: ErVisitRecord[]
  beds: BedRecord[]
  discharges: DischargedPatientRecord[]
  icuDischarges: IcuDischargeRecord[]
  labOrders: LabOrder[]
  prescriptions: AppPrescription[]
  consultations: ConsultationRecord[]
  surgeries: SurgicalCase[]
}

function snapshot(): Snapshot {
  const safe = <T,>(fn: () => T[]): T[] => {
    try {
      return fn() || []
    } catch {
      return []
    }
  }
  return {
    patients: safe(() => db.getPatients()),
    encounters: safe(() => db.getEncounters()),
    erVisits: safe(() => ErDatabase.getVisits("all")),
    beds: safe(() => BedDatabase.getBeds()),
    discharges: safe(() => BedDatabase.getDischargedPatients()),
    icuDischarges: safe(() => getDischargedIcuPatients()),
    labOrders: safe(() => LabOrderDatabase.getOrders()),
    prescriptions: safe(() => PharmacyDatabase.getPrescriptions()),
    consultations: safe(() => DoctorPortalDatabase.getConsultations()),
    surgeries: safe(() => SurgeryDatabase.getCases()),
  }
}

// ── Patient index (search) ───────────────────────────────────────────────────

interface PersonRecord {
  ids: string[]
  name: string
  age: number | null
  gender: string | null
  phone: string
  status: PatientStatus
  date: string | null
  detail: string
}

const STATUS_RANK: Record<PatientStatus, number> = {
  Admitted: 5,
  Discharged: 4,
  "ICU discharge": 3,
  Emergency: 2,
  Outpatient: 1,
}

function personRecords(s: Snapshot): PersonRecord[] {
  const out: PersonRecord[] = []

  for (const d of s.discharges) {
    out.push({
      ids: [d.patientId, d.mrn].filter(Boolean),
      name: d.patientName,
      age: null,
      gender: null,
      phone: "",
      status: "Discharged",
      date: d.dischargeDate,
      detail: d.ward,
    })
  }
  for (const r of s.icuDischarges) {
    out.push({
      ids: [r.mrn].filter(Boolean),
      name: r.patientName,
      age: null,
      gender: null,
      phone: "",
      status: "ICU discharge",
      date: r.dischargedAt,
      detail: `${r.unit} · ${r.dischargeType}`,
    })
  }
  for (const b of s.beds) {
    if (b.status !== "Occupied" || !b.patient_id) continue
    out.push({
      ids: [b.patient_id],
      name: fullName(b.patient_name, b.patient_last_name),
      age: b.patient_age,
      gender: b.patient_gender,
      phone: b.patient_phone || "",
      status: "Admitted",
      date: b.admission_date,
      detail: `${b.ward} · Bed ${b.bed_no}`,
    })
  }
  for (const v of s.erVisits) {
    const name = fullName(v.patient_name, v.patient_last_name) || v.unknown_patient_label || ""
    if (!name) continue
    out.push({
      ids: [v.patient_id || `ER-${v.id}`],
      name,
      age: v.patient_age ?? null,
      gender: v.patient_gender ?? null,
      phone: v.patient_phone || "",
      status: "Emergency",
      date: v.arrival_at,
      detail: `Emergency visit · ${(humanize(v.status) || v.status).replace(/^./, (c) => c.toUpperCase())}`,
    })
  }
  for (const p of s.patients) {
    out.push({
      ids: [p.umr, p.mrn || ""].filter(Boolean),
      name: p.name,
      age: p.age ?? null,
      gender: p.sex || p.gender || null,
      phone: p.phone || "",
      status: "Outpatient",
      date: p.updatedAt || p.createdAt,
      detail: "Outpatient record",
    })
  }
  return out.filter((r) => clean(r.name))
}

/** Groups person records that share an id or a specific full name. */
function groupPeople(records: PersonRecord[]): PersonRecord[][] {
  const parent = records.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  const byKey = new Map<string, number>()
  records.forEach((r, i) => {
    const keys = r.ids.map((id) => `id:${normId(id)}`)
    const n = normName(r.name)
    if (linkableName(n)) keys.push(`name:${n}`)
    for (const k of keys) {
      const seen = byKey.get(k)
      if (seen === undefined) byKey.set(k, i)
      else union(seen, i)
    }
  })
  const groups = new Map<number, PersonRecord[]>()
  records.forEach((r, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) || []), r])
  })
  return [...groups.values()]
}

function toHit(group: PersonRecord[]): SummaryPatientHit {
  // The most clinically relevant record leads: admitted, then discharged...
  const lead = [...group].sort(
    (a, b) =>
      STATUS_RANK[b.status] - STATUS_RANK[a.status] ||
      (ts(b.date) || 0) - (ts(a.date) || 0),
  )[0]
  const ids = [...new Set(group.flatMap((r) => r.ids.map(normId)))].filter(Boolean)
  const withAge = lead.age != null ? lead : group.find((r) => r.age != null)
  const withGender = clean(lead.gender) ? lead : group.find((r) => clean(r.gender))
  const latest = group.map((r) => r.date).filter(Boolean).sort((a, b) => (ts(b) || 0) - (ts(a) || 0))[0] || null
  return {
    key: ids[0] ? `id:${ids[0]}` : `name:${normName(lead.name)}`,
    name: lead.name,
    ids,
    age: withAge?.age ?? null,
    gender: withGender?.gender ?? null,
    status: lead.status,
    lastDate: latest,
    detail: lead.detail,
  }
}

export function searchSummaryPatients(query: string, limit = 40): SummaryPatientHit[] {
  const q = normName(query)
  const groups = groupPeople(personRecords(snapshot()))
  const hits = groups
    .filter((g) => {
      if (!q) return g.some((r) => r.status === "Discharged" || r.status === "ICU discharge" || r.status === "Admitted")
      return g.some(
        (r) =>
          normName(r.name).includes(q) ||
          r.ids.some((id) => normId(id).includes(q.toUpperCase())) ||
          (q.replace(/\D/g, "").length >= 4 && r.phone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))),
      )
    })
    .map(toHit)
  return hits
    .sort((a, b) => {
      if (q) {
        const aStarts = normName(a.name).startsWith(q) ? 1 : 0
        const bStarts = normName(b.name).startsWith(q) ? 1 : 0
        if (aStarts !== bStarts) return bStarts - aStarts
      }
      return (ts(b.lastDate) || 0) - (ts(a.lastDate) || 0)
    })
    .slice(0, limit)
}

// ── Backend EMR ──────────────────────────────────────────────────────────────

/** The slice of GET /api/emr/<patient_id> a discharge summary reads. */
export interface BackendEmr {
  patient: {
    patient_id: string
    name: string
    last_name?: string | null
    age?: number | null
    gender?: string | null
    blood_group?: string | null
    phone?: string | null
    address?: string | null
    allergies?: string | null
  }
  admissions?: { id: number ;admission_date: string ;discharge_date?: string | null ;notes?: string | null ;discharge_override_reason?: string | null }[]
  bed_history?: { admission_id?: number | null ;ward?: string | null ;room_no?: string | null ;bed_no?: string | null }[]
  notes?: { chief_complaint?: string | null ;notes?: string | null ;follow_up?: string | null ;created_at: string }[]
  observation_notes?: { doctor_name?: string | null ;note: string ;treatment_plan?: string | null ;role?: string | null ;created_at: string }[]
  vitals?: { bp?: string | null ;pulse?: string | null ;temperature?: string | null ;created_at: string }[]
  diagnoses?: { diagnosis_name: string ;created_at: string }[]
  prescriptions?: { medicine_name: string ;dosage?: string | null ;created_at: string }[]
  medication_schedules?: { medicine_name: string ;dosage?: string | null ;schedule_time: string ;administered?: number | boolean }[]
  labs?: { test_name: string ;status?: string | null ;order_status?: string | null ;created_at: string ;reported_at?: string | null }[]
}

// Raw fetch on purpose: apiFetch answers /api/emr and /api/patients from an
// offline mock that fills gaps with a made-up age, address and phone number --
// fine for a screen that must render offline, wrong for a discharge summary.
async function backendGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers: withAuthHeaders() })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

type BackendPatientRow = {
  patient_id: string
  name: string
  last_name?: string | null
  age?: number | null
  gender?: string | null
  phone?: string | null
  care_stream?: string | null
  active_bed?: string | null
  active_er_visit_no?: string | null
  created_at?: string | null
}

export async function searchBackendPatients(query: string): Promise<SummaryPatientHit[]> {
  const q = query.trim()
  if (!q) return []
  const data = await backendGet<{ patients?: BackendPatientRow[] }>(`/api/patients?q=${encodeURIComponent(q)}`)
  return (data?.patients || []).slice(0, 20).map((p) => {
    const status: PatientStatus = p.active_bed ? "Admitted" : p.active_er_visit_no ? "Emergency" : "Outpatient"
    return {
      key: `id:${normId(p.patient_id)}`,
      name: fullName(p.name, p.last_name) || p.patient_id,
      ids: [normId(p.patient_id)],
      age: p.age ?? null,
      gender: ({ M: "Male", F: "Female", O: "Other" } as Record<string, string>)[clean(p.gender).toUpperCase()] || clean(p.gender) || null,
      status,
      lastDate: p.created_at || null,
      detail: p.active_bed ? `In ${p.active_bed}` : `Hospital EMR · ${p.care_stream || "OP"}`,
      backendId: p.patient_id,
    }
  })
}

/** Folds backend hits into local ones (same id or same full name), adding the rest. */
export function mergeBackendHits(local: SummaryPatientHit[], backend: SummaryPatientHit[]): SummaryPatientHit[] {
  const out = local.map((h) => ({ ...h }))
  // Two records with one name are one patient only if nothing says otherwise:
  // a 42-year-old and a 45-year-old "Ravi Kumar" stay two people.
  const agesAgree = (a: number | null, b: number | null) => a == null || b == null || Math.abs(a - b) <= 1
  for (const b of backend) {
    const twin = out.find(
      (h) =>
        h.ids.some((id) => b.ids.includes(id)) ||
        (linkableName(normName(h.name)) && normName(h.name) === normName(b.name) && agesAgree(h.age, b.age)),
    )
    if (twin) {
      twin.backendId = b.backendId
      if (!twin.ids.includes(b.ids[0])) twin.ids = [...twin.ids, b.ids[0]]
    } else {
      out.push(b)
    }
  }
  return out
}

export async function fetchBackendEmr(backendId: string): Promise<BackendEmr | null> {
  const emr = await backendGet<BackendEmr>(`/api/emr/${encodeURIComponent(backendId)}`)
  return emr?.patient?.patient_id ? emr : null
}

function emrEpisodes(emr: BackendEmr | null): StayEpisode[] {
  if (!emr) return []
  return (emr.admissions || []).map((a) => {
    const bed = (emr.bed_history || []).find((b) => b.admission_id === a.id)
    const days = a.admission_date
      ? Math.max(1, Math.round(((ts(a.discharge_date) || Date.now()) - (ts(a.admission_date) || Date.now())) / 86400000))
      : null
    return {
      id: `ADM-${a.id}`,
      kind: "Inpatient" as const,
      admittedAt: a.admission_date,
      dischargedAt: a.discharge_date || null,
      ward: clean(bed?.ward) || null,
      bed: [clean(bed?.room_no) && `Room ${bed?.room_no}`, clean(bed?.bed_no) && `Bed ${bed?.bed_no}`].filter(Boolean).join(" · ") || null,
      attendingDoctor: null,
      dischargeReason: clean(a.discharge_override_reason) || null,
      dischargeType: a.discharge_date ? "Discharged" : null,
      condition: null,
      arrivalCondition: null,
      diagnosis: null,
      notes: clean(a.notes) || null,
      lengthOfStayDays: days,
    }
  })
}

// ── Compile ──────────────────────────────────────────────────────────────────

interface Identity {
  ids: Set<string>
  name: string
  /** The patient's records only join up through their name, not a shared id. */
  linkedByName?: boolean
}

function resolveIdentity(s: Snapshot, key: string): Identity {
  const groups = groupPeople(personRecords(s))
  const [kind, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)]
  const group =
    groups.find((g) =>
      kind === "id"
        ? g.some((r) => r.ids.some((id) => normId(id) === value))
        : g.some((r) => normName(r.name) === value),
    ) || []
  const ids = new Set(group.flatMap((r) => r.ids.map(normId)).filter(Boolean))
  if (kind === "id" && value) ids.add(value)
  const name = normName(group[0]?.name || (kind === "name" ? value : ""))
  // Did the group need its name to hold together? Re-group on ids alone.
  const idOnly = groupPeople(group.map((r) => ({ ...r, name: "" })))
  return { ids, name, linkedByName: idOnly.length > 1 }
}

type Matcher = (
  recordIds: (string | null | undefined)[],
  recordName: string,
  source: Omit<SummarySource, "matchedBy">,
) => boolean

/** Does a record belong to this patient? With `sources`, also lists it as used. */
function matcher(identity: Identity, sources?: SummarySource[]): Matcher {
  return (recordIds, recordName, source) => {
    const byId = recordIds.some((id) => id && identity.ids.has(normId(id)))
    const n = normName(recordName)
    const byName = !byId && linkableName(n) && n === identity.name
    if (!byId && !byName) return false
    if (sources && !sources.some((x) => x.id === source.id)) {
      sources.push({ ...source, matchedBy: byId ? "id" : "name" })
    }
    return true
  }
}

function episodesFor(s: Snapshot, matches: Matcher): StayEpisode[] {
  const eps: StayEpisode[] = []
  for (const d of s.discharges) {
    if (!matches([d.patientId, d.mrn], d.patientName, { id: d.id, label: "Inpatient discharge", date: d.dischargeDate })) continue
    eps.push({
      id: d.id,
      kind: "Inpatient",
      admittedAt: d.admissionDate,
      dischargedAt: d.dischargeDate,
      ward: d.ward,
      bed: [d.roomNo && `Room ${d.roomNo}`, d.bedNo && `Bed ${d.bedNo}`].filter(Boolean).join(" · ") || null,
      attendingDoctor: clean(d.attendingDoctor) || null,
      dischargeReason: clean(d.dischargeReason) || null,
      dischargeType: "Discharged home",
      condition: null,
      arrivalCondition: null,
      diagnosis: null,
      notes: null,
      lengthOfStayDays: d.lengthOfStayDays || null,
    })
  }
  for (const r of s.icuDischarges) {
    if (!matches([r.mrn], r.patientName, { id: r.id, label: `ICU discharge (${r.unit})`, date: r.dischargedAt })) continue
    eps.push({
      id: r.id,
      kind: "ICU",
      admittedAt: r.admissionDate || (r.lengthOfStayDays ? new Date((ts(r.dischargedAt) || Date.now()) - r.lengthOfStayDays * 86400000).toISOString() : null),
      dischargedAt: r.dischargedAt,
      ward: r.unit,
      bed: clean(r.bed) || null,
      attendingDoctor: clean(r.attendingDoctor) || null,
      dischargeReason: null,
      dischargeType: [r.dischargeType, r.destinationWard].filter(Boolean).join(" → "),
      condition: clean(r.dischargeCondition) || null,
      arrivalCondition: null,
      diagnosis: clean(r.dischargeDiagnosis) || null,
      notes: clean(r.clinicalSummaryNotes) || null,
      lengthOfStayDays: r.lengthOfStayDays || 10,
    })
  }
  for (const b of s.beds) {
    if (b.status !== "Occupied" || !b.patient_id) continue
    const name = fullName(b.patient_name, b.patient_last_name)
    if (!matches([b.patient_id], name, { id: `BED-${b.id}`, label: `Current bed (${b.ward})`, date: b.admission_date || undefined })) continue
    const days = b.admission_date ? Math.max(1, Math.round((Date.now() - (ts(b.admission_date) || Date.now())) / 86400000)) : null
    eps.push({
      id: `BED-${b.id}`,
      kind: "Inpatient",
      admittedAt: b.admission_date,
      dischargedAt: null,
      ward: b.ward,
      bed: [b.room_no && `Room ${b.room_no}`, b.bed_no && `Bed ${b.bed_no}`].filter(Boolean).join(" · ") || null,
      attendingDoctor: null,
      dischargeReason: null,
      dischargeType: null,
      condition: null,
      arrivalCondition: null,
      diagnosis: null,
      notes: clean(b.admission_notes) || null,
      lengthOfStayDays: days,
    })
  }
  for (const v of s.erVisits) {
    const name = fullName(v.patient_name, v.patient_last_name)
    if (!matches([v.patient_id, `ER-${v.id}`], name, { id: v.visit_no || `ER-${v.id}`, label: "Emergency visit", date: v.arrival_at || undefined })) continue
    // An ER visit that went on to a ward is part of that admission, not a stay of its own.
    const admitted = /admit|icu|ward|transfer/i.test(v.disposition?.outcome || "")
    if (admitted && eps.some((e) => e.kind !== "Emergency")) continue
    eps.push({
      id: v.visit_no || `ER-${v.id}`,
      kind: "Emergency",
      admittedAt: v.arrival_at,
      dischargedAt: v.closed_at || (/closed|discharg/i.test(v.status) ? v.disposition?.decided_at || null : null),
      ward: "Emergency Department",
      bed: clean(v.triage_bed_label) || null,
      attendingDoctor: clean(v.assigned_doctor_name) || null,
      dischargeReason: clean(v.disposition?.clinical_reason) || null,
      dischargeType: humanize(v.disposition?.outcome) || null,
      condition: null,
      arrivalCondition: clean(v.condition_at_arrival) || null,
      diagnosis: null,
      notes: null,
      lengthOfStayDays: null,
    })
  }
  return eps.sort((a, b) => episodeTime(b) - episodeTime(a))
}

/** Sort key: a current admission first, then the most recent stay. */
const episodeTime = (e: StayEpisode) => (e.dischargedAt === null ? Infinity : ts(e.dischargedAt || e.admittedAt) || 0)

export function compileDischargeSummary(
  key: string,
  options: { episodeId?: string ;scope?: "stay" | "history" ;emr?: BackendEmr | null } = {},
): DischargeSummaryData {
  const s = snapshot()
  const identity = resolveIdentity(s, key)
  const emr = options.emr || null
  if (emr?.patient?.patient_id) {
    // The hit joined the EMR patient to local records by name -- say so.
    if (identity.ids.size && !identity.ids.has(normId(emr.patient.patient_id))) identity.linkedByName = true
    identity.ids.add(normId(emr.patient.patient_id))
  }
  const sources: SummarySource[] = []
  const matches = matcher(identity, sources)

  const episodes = [...episodesFor(s, matcher(identity)), ...emrEpisodes(emr)]
  episodes.sort((a, b) => episodeTime(b) - episodeTime(a))
  const episode = (options.episodeId && episodes.find((e) => e.id === options.episodeId)) || episodes[0] || null
  const scope = options.scope || (episode ? "stay" : "history")
  if (episode && scope === "stay") {
    const linkedById = identity.ids.size > 0 && episodesFor(s, matcher({ ids: identity.ids, name: "" })).some((e) => e.id === episode.id)
    sources.push({
      id: episode.id,
      label: episode.kind === "ICU" ? `ICU stay (${episode.ward || "ICU"})` : episode.kind === "Emergency" ? "Emergency visit" : `Inpatient stay (${episode.ward || "ward"})`,
      date: episode.dischargedAt || episode.admittedAt || undefined,
      matchedBy: linkedById ? "id" : "name",
    })
  }

  // Clinical events are not linked to an admission id in these stores, so a
  // stay is windowed by date: from a few days before admission (the ER / OP
  // work-up that led to it) to a day after discharge.
  const DAY = 86400000
  const startT = scope === "history" || !episode
    ? -Infinity
    : ts(episode.admittedAt) ? ts(episode.admittedAt) - 3 * DAY
      : ts(episode.dischargedAt) ? ts(episode.dischargedAt) - 14 * DAY : -Infinity
  const endT = scope === "history" || !episode
    ? Infinity
    : (ts(episode.dischargedAt) || Date.now()) + DAY
  const inWindow = (iso?: string | null) => {
    if (startT === -Infinity && endT === Infinity) return true
    const t = ts(iso)
    return !Number.isNaN(t) && t >= startT && t <= endT
  }

  // Demographics -- only what a record actually holds.
  const pt = s.patients.find((p) => identity.ids.has(normId(p.umr)) || (linkableName(identity.name) && normName(p.name) === identity.name))
  const erForDemo = s.erVisits.find((v) => (v.patient_id && identity.ids.has(normId(v.patient_id))) || (linkableName(identity.name) && normName(fullName(v.patient_name, v.patient_last_name)) === identity.name))
  const bedForDemo = s.beds.find((b) => b.patient_id && identity.ids.has(normId(b.patient_id)))
  const disForDemo = s.discharges.find((d) => identity.ids.has(normId(d.patientId)))
  const icuForDemo = s.icuDischarges.find((r) => identity.ids.has(normId(r.mrn)))

  const patient = {
    name:
      clean(pt?.name) ||
      clean(fullName(erForDemo?.patient_name, erForDemo?.patient_last_name)) ||
      clean(fullName(bedForDemo?.patient_name, bedForDemo?.patient_last_name)) ||
      clean(disForDemo?.patientName) ||
      clean(icuForDemo?.patientName) ||
      "Patient",
    ids: [...identity.ids],
    age: pt?.age ?? erForDemo?.patient_age ?? bedForDemo?.patient_age ?? null,
    gender: clean(pt?.sex) || clean(erForDemo?.patient_gender) || clean(bedForDemo?.patient_gender) || null,
    bloodGroup: clean(pt?.bloodGroup) || clean(erForDemo?.patient?.blood_group) || null,
    phone: clean(pt?.phone) || clean(erForDemo?.patient_phone) || clean(bedForDemo?.patient_phone) || null,
    address: clean(pt?.address) || clean(erForDemo?.patient?.address) || null,
    allergies: clean(erForDemo?.patient?.allergies) || null,
    emergencyContact:
      [
        clean(erForDemo?.patient?.emergency_contact_name),
        clean(erForDemo?.patient?.emergency_contact_relation) && `(${erForDemo?.patient?.emergency_contact_relation})`,
        clean(erForDemo?.patient?.emergency_contact) || clean(erForDemo?.patient_emergency_contact),
      ]
        .filter(Boolean)
        .join(" ") || null,
  }
  const ep0 = emr?.patient
  if (ep0) {
    if (patient.name === "Patient") patient.name = clean(fullName(ep0.name, ep0.last_name)) || patient.name
    patient.age ??= typeof ep0.age === "number" ? ep0.age : null
    patient.gender ||= ({ M: "Male", F: "Female", O: "Other" } as Record<string, string>)[clean(ep0.gender).toUpperCase()] || clean(ep0.gender) || null
    patient.bloodGroup ||= clean(ep0.blood_group) || null
    patient.phone ||= clean(ep0.phone) || null
    patient.address ||= clean(ep0.address) || null
    patient.allergies ||= clean(ep0.allergies) || null
  }

  const diagnoses: SummaryDiagnosis[] = []
  const addDx = (text: string, source: string, date?: string, code?: string) => {
    const t = clean(text)
    if (!t || /^clinical assessment completed$/i.test(t)) return
    if (diagnoses.some((d) => normName(d.text) === normName(t))) return
    diagnoses.push({ text: t, source, date, code: clean(code) || undefined })
  }
  if (episode?.diagnosis) addDx(episode.diagnosis, episode.id, episode.dischargedAt || undefined)

  const complaints: SummaryComplaint[] = []
  const vitals: SummaryVitals[] = []
  const investigations: SummaryInvestigation[] = []
  const procedures: SummaryProcedure[] = []
  const treatments: SummaryNote[] = []
  const notes: SummaryNote[] = []
  const advice: { text: string ;source: string }[] = []
  const rxList: { at: number ;source: string ;items: SummaryMedication[] }[] = []
  let arrival: DischargeSummaryData["arrival"] = null

  if (episode?.notes) notes.push({ kind: episode.kind === "ICU" ? "ICU discharge note" : "Admission note", text: episode.notes, date: episode.dischargedAt || episode.admittedAt || undefined, source: episode.id })

  // Emergency visits
  for (const v of s.erVisits) {
    const name = fullName(v.patient_name, v.patient_last_name)
    const label = v.visit_no || `ER-${v.id}`
    if (!inWindow(v.arrival_at)) continue
    if (!matches([v.patient_id, `ER-${v.id}`], name, { id: label, label: "Emergency visit", date: v.arrival_at || undefined })) continue
    // The earliest ER arrival in the stay is how the patient came in.
    if (!arrival || (ts(v.arrival_at) || Infinity) < (ts(arrival.at) || Infinity)) {
      arrival = {
        at: v.arrival_at,
        mode: humanize(v.arrival_mode) || null,
        broughtBy: [clean(v.brought_by), clean(v.attendant_name) && `${v.attendant_name}${clean(v.attendant_relation) ? ` (${v.attendant_relation})` : ""}`]
          .filter(Boolean)
          .join(" · ") || null,
        condition: clean(v.condition_at_arrival) || null,
        consciousness: clean(v.consciousness) || null,
        triage: clean(v.triage?.category) || clean(v.triage_category) || null,
        triageReason: clean(v.triage?.reason) || null,
      }
    }
    for (const c of v.complaints || []) {
      const said = c.complaint.toLowerCase()
      const detail = [c.duration && `for ${c.duration}`, c.severity && `${c.severity} severity`]
        .filter((x): x is string => Boolean(x) && !said.includes(String(x).replace(/^for /, "").toLowerCase()))
        .join(", ")
      complaints.push({ text: c.complaint, detail: detail || undefined, date: c.created_at, source: label })
    }
    const vs = [...(v.vitals || [])].sort((a, b) => (ts(a.recorded_at) || 0) - (ts(b.recorded_at) || 0))
    const vitalRow = (x: (typeof vs)[number], lbl: string): SummaryVitals => ({
      label: lbl,
      at: x.recorded_at,
      source: label,
      values: [
        ["BP", x.bp_systolic && x.bp_diastolic ? `${x.bp_systolic}/${x.bp_diastolic} mmHg` : ""],
        ["Pulse", x.heart_rate ? `${x.heart_rate} /min` : ""],
        ["Resp. rate", x.respiratory_rate ? `${x.respiratory_rate} /min` : ""],
        ["SpO₂", x.spo2 ? `${x.spo2}%` : ""],
        ["Temp", x.temperature ? `${x.temperature} °F` : ""],
        ["GCS", x.gcs ? String(x.gcs) : ""],
        ["Pain", x.pain_score != null ? `${x.pain_score}/10` : ""],
      ].filter(([, val]) => val) as [string, string][],
    })
    for (const x of vs) vitals.push(vitalRow(x, "Emergency"))
    if (v.triage?.category) notes.push({ kind: "Triage", author: clean(v.triage.assigned_by) || undefined, text: `${v.triage.category}${v.triage.reason ? ` — ${v.triage.reason}` : ""}`, date: v.triage.triaged_at, source: label })
    for (const t of v.treatments || []) {
      treatments.push({ kind: t.intervention_type, author: clean(t.administered_by) || undefined, text: clean(t.description) || t.intervention_type, date: t.performed_at, source: label })
    }
    for (const n of v.clinical_notes || []) {
      notes.push({ kind: n.note_type || "Clinical note", author: clean(n.author) || undefined, text: n.content, date: n.created_at, source: label })
    }
    for (const inv of v.investigations || []) {
      const result = clean(inv.result_summary) || clean(inv.result) || ""
      investigations.push({
        test: inv.test_name,
        result,
        flag: flagFromText(result),
        status: inv.status,
        date: inv.verified_at || inv.ordered_at,
        source: label,
      })
    }
    if (v.disposition) {
      notes.push({ kind: "ER disposition", author: clean(v.disposition.decided_by) || undefined, text: `${humanize(v.disposition.outcome)}${v.disposition.clinical_reason ? ` — ${v.disposition.clinical_reason}` : ""}`, date: v.disposition.decided_at, source: label })
    }
  }

  // OP encounters
  for (const e of s.encounters) {
    const at = e.timestamps?.arrival || e.registrationTime
    if (!inWindow(at)) continue
    if (!matches([e.umr], e.patientName, { id: e.id, label: `OP visit${e.dept ? ` (${e.dept})` : ""}`, date: at })) continue
    if (clean(e.chiefComplaint)) complaints.push({ text: e.chiefComplaint, detail: (e.symptoms || []).filter(Boolean).join(", ") || undefined, date: at, source: e.id })
    addDx(e.diagnosis, e.id, at, e.icd10)
    const v = e.vitals
    if (v && (clean(v.bp) || clean(v.pulse) || clean(v.temp) || clean(v.spo2))) {
      vitals.push({
        label: e.dept ? `OP · ${e.dept}` : "Outpatient",
        at,
        source: e.id,
        values: [
          ["BP", clean(v.bp)],
          ["Pulse", clean(v.pulse)],
          ["Temp", clean(v.temp)],
          ["SpO₂", clean(v.spo2) && !clean(v.spo2).includes("%") ? `${clean(v.spo2)}%` : clean(v.spo2)],
          ["Weight", clean(v.weight)],
        ].filter(([, val]) => val) as [string, string][],
      })
    }
    for (const p of e.opdProcedures || []) procedures.push({ name: p.name, date: p.timestamp, notes: p.status, source: e.id })
    if ((e.prescription || []).length) {
      rxList.push({
        at: ts(at) || 0,
        source: e.id,
        items: e.prescription.map((m) => ({ medicine: m.medicine, dose: clean(m.dosage), frequency: clean(m.frequency), duration: clean(m.duration), instructions: clean(m.instructions), source: e.id })),
      })
    }
    if (clean(e.advice)) advice.push({ text: e.advice, source: e.id })
  }

  // Doctor-portal consultations
  for (const c of s.consultations) {
    if (!inWindow(c.createdAt)) continue
    if (!matches([c.umr], c.patientName, { id: c.id, label: `Consultation · ${c.doctorName}`, date: c.createdAt })) continue
    addDx(c.diagnosis, c.id, c.createdAt)
    const voice = c.voice?.summary
    const noteText = clean(c.summary) || clean(voice?.narrative)
    if (noteText) notes.push({ kind: "Consultation note", author: c.doctorName, text: noteText, date: c.createdAt, source: c.id })
    if (voice) {
      if (clean(voice.chiefComplaint)) complaints.push({ text: voice.chiefComplaint, detail: clean(voice.historyOfPresentIllness) || undefined, date: c.createdAt, source: c.id })
      if (clean(voice.assessment)) addDx(voice.assessment, c.id, c.createdAt)
      for (const a of voice.advice || []) if (clean(a)) advice.push({ text: a, source: c.id })
      if (clean(voice.followUp)) advice.push({ text: `Follow-up: ${voice.followUp}`, source: c.id })
    }
    if ((c.medications || []).length) {
      rxList.push({
        at: ts(c.createdAt) || 0,
        source: c.id,
        items: c.medications.map((m) => ({
          medicine: [clean(m.name), clean(m.strength)].filter(Boolean).join(" ") || "Medicine",
          dose: clean(m.dosage),
          frequency: clean(m.frequency),
          duration: clean(m.duration),
          instructions: [clean(m.route), clean(m.instructions)].filter(Boolean).join(" · "),
          source: c.id,
        })),
      })
    }
    if (clean(c.advice)) advice.push({ text: c.advice, source: c.id })
  }

  // Pharmacy prescriptions
  for (const rx of s.prescriptions) {
    const at = rx.createdAt || rx.date
    if (!inWindow(at)) continue
    if (!matches([rx.uhid, rx.patientId], rx.patientName, { id: rx.id, label: `Prescription · ${rx.doctorName}`, date: at })) continue
    if (rx.diagnosis) addDx(rx.diagnosis, rx.id, at)
    const items = (rx.items || []).filter((it) => !/doctor prescription sheet/i.test(it.medicineName))
    if (items.length) {
      rxList.push({
        at: ts(at) || 0,
        source: rx.id,
        items: items.map((it) => ({
          medicine: [it.medicineName, clean(it.strength)].filter(Boolean).join(" "),
          dose: clean(it.dosage),
          frequency: clean(it.frequency),
          duration: clean(it.duration),
          instructions: [clean(it.route), clean(it.instructions)].filter(Boolean).join(" · "),
          source: rx.id,
        })),
      })
    }
  }

  // Lab orders
  for (const lo of s.labOrders) {
    if (!inWindow(lo.createdAt)) continue
    if (!matches([lo.umr], lo.patientName, { id: lo.id, label: `Lab order · ${lo.department || "Laboratory"}`, date: lo.createdAt })) continue
    if (lo.diagnosis) addDx(lo.diagnosis, lo.id, lo.createdAt)
    for (const t of lo.tests || []) {
      const params = t.results ? Object.entries(t.results) : []
      if (params.length) {
        for (const [param, r] of params) {
          investigations.push({
            test: params.length > 1 ? `${t.name} — ${param}` : t.name,
            result: [clean(r.value), clean(r.unit)].filter(Boolean).join(" "),
            range: clean(r.referenceRange) || undefined,
            flag: clean(r.flag) || undefined,
            status: t.status,
            date: t.resultedAt || t.verifiedAt || lo.createdAt,
            source: lo.id,
          })
        }
      } else {
        investigations.push({
          test: t.name,
          result: [clean(t.result), clean(t.resultUnit)].filter(Boolean).join(" "),
          range: clean(t.referenceRange) || undefined,
          flag: clean(t.flag) || undefined,
          status: t.status,
          date: t.resultedAt || lo.createdAt,
          source: lo.id,
        })
      }
    }
  }

  // Surgeries (OT booklet)
  for (const sc of s.surgeries) {
    const at = sc.operationRecord?.surgeryStartTime || sc.scheduledTime || sc.createdAt
    if (!inWindow(at)) continue
    if (!matches([sc.patientId, sc.mrn], sc.patientName, { id: sc.caseNo || sc.id, label: `Surgery · ${sc.procedureName}`, date: at })) continue
    const op = sc.operationRecord
    procedures.push({
      name: clean(op?.procedureExecuted) || sc.procedureName,
      date: at,
      by: sc.surgeon,
      notes: [
        sc.status,
        clean(op?.complications) && `Complications: ${op?.complications}`,
        op?.bloodLossMl ? `Blood loss ${op.bloodLossMl} ml` : "",
      ].filter(Boolean).join(" · "),
      source: sc.caseNo || sc.id,
    })
    if (op?.postOpDiagnosis) addDx(op.postOpDiagnosis, sc.caseNo || sc.id, at)
    else if (op?.preOpDiagnosis) addDx(op.preOpDiagnosis, sc.caseNo || sc.id, at)
    if (clean(op?.surgeonProcedureNotes)) notes.push({ kind: "Operation note", author: sc.surgeon, text: op!.surgeonProcedureNotes, date: at, source: sc.caseNo || sc.id })
    if (clean(op?.postOpInstructions)) advice.push({ text: op!.postOpInstructions, source: sc.caseNo || sc.id })
  }

  // Backend EMR rows
  if (emr) {
    const emrId = `EMR ${emr.patient.patient_id}`
    // In this stay's window? If so the EMR counts as a source of the summary.
    const use = (iso: string | null | undefined) => {
      if (!inWindow(iso)) return false
      if (!sources.some((x) => x.id === emrId)) sources.push({ id: emrId, label: "Hospital EMR (backend)", date: iso || undefined, matchedBy: "id" })
      return true
    }
    for (const d of emr.diagnoses || []) if (use(d.created_at)) addDx(d.diagnosis_name, emrId, d.created_at)
    for (const n of emr.notes || []) {
      if (!use(n.created_at)) continue
      if (clean(n.chief_complaint)) complaints.push({ text: n.chief_complaint!, date: n.created_at, source: emrId })
      if (clean(n.notes)) notes.push({ kind: "Clinical note", text: n.notes!, date: n.created_at, source: emrId })
      if (clean(n.follow_up)) advice.push({ text: `Follow-up: ${n.follow_up}`, source: emrId })
    }
    for (const n of emr.observation_notes || []) {
      if (!use(n.created_at)) continue
      const kind = n.role === "nurse" ? "Nursing note" : n.role === "doctor" ? "Doctor's note" : "Clinical evaluation"
      notes.push({ kind, author: clean(n.doctor_name) || undefined, text: `${n.note}${clean(n.treatment_plan) ? ` (Plan: ${n.treatment_plan})` : ""}`, date: n.created_at, source: emrId })
    }
    for (const v of emr.vitals || []) {
      if (!use(v.created_at)) continue
      const values = [["BP", clean(v.bp)], ["Pulse", clean(v.pulse)], ["Temp", clean(v.temperature)]].filter(([, x]) => x) as [string, string][]
      if (values.length) vitals.push({ label: "Ward", at: v.created_at, values, source: emrId })
    }
    const emrRx = (emr.prescriptions || []).filter((p) => use(p.created_at))
    if (emrRx.length) {
      const latest = Math.max(...emrRx.map((p) => ts(p.created_at) || 0))
      rxList.push({
        at: latest,
        source: emrId,
        items: emrRx.map((p) => ({ medicine: p.medicine_name, dose: clean(p.dosage), frequency: "", duration: "", instructions: "", source: emrId })),
      })
    }
    for (const m of emr.medication_schedules || []) {
      if (!use(m.schedule_time)) continue
      treatments.push({ kind: "Medication", text: `${m.medicine_name}${clean(m.dosage) ? ` ${m.dosage}` : ""} — ${m.administered ? "administered" : "scheduled"}`, date: m.schedule_time, source: emrId })
    }
    for (const l of emr.labs || []) {
      if (!use(l.created_at)) continue
      investigations.push({ test: l.test_name, result: "", status: clean(l.order_status) || clean(l.status) || "Ordered", date: l.reported_at || l.created_at, source: emrId })
    }
  }

  // Discharge medications = the most recent prescription of the stay; anything
  // prescribed earlier in it is listed separately as "given during the stay".
  rxList.sort((a, b) => b.at - a.at)
  const dedupe = (items: SummaryMedication[]) => {
    const seen = new Set<string>()
    return items.filter((m) => {
      const k = normName(m.medicine)
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  const dischargeMedications = dedupe(rxList[0]?.items || [])
  const stayMedications = dedupe(rxList.slice(1).flatMap((r) => r.items)).filter(
    (m) => !dischargeMedications.some((d) => normName(d.medicine) === normName(m.medicine)),
  )

  const byDateDesc = <T extends { date?: string }>(list: T[]) => list.sort((a, b) => (ts(b.date) || 0) - (ts(a.date) || 0))

  return {
    patient,
    episodes,
    episode,
    scope,
    diagnoses,
    complaints: byDateDesc(complaints).reverse(),
    vitals: vitals.sort((a, b) => (ts(a.at) || 0) - (ts(b.at) || 0)),
    investigations: byDateDesc(investigations),
    procedures: byDateDesc(procedures).reverse(),
    treatments: byDateDesc(treatments).reverse(),
    dischargeMedications,
    stayMedications,
    notes: byDateDesc(notes),
    advice: advice.filter((a, i, arr) => arr.findIndex((x) => normName(x.text) === normName(a.text)) === i),
    sources: sources.sort((a, b) => (ts(b.date) || 0) - (ts(a.date) || 0)),
    nameOnlyLinks: Boolean(identity.linkedByName) || sources.some((x) => x.matchedBy === "name"),
    arrival,
  }
}

// ── Narrative (AI) ───────────────────────────────────────────────────────────

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** The facts the model is allowed to use -- compact, and nothing else. */
/** Drops nulls, empty strings and empty lists -- see factSheet. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined)
    return items.length ? items : undefined
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => [k, prune(v)] as const).filter(([, v]) => v !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return value === null || value === "" ? undefined : value
}

// Record keys are deliberately named unlike the answer keys, and empty ones are
// left out: given `"diagnoses": []` in the facts, the model copied that empty
// list into its own "diagnoses" answer even when a note named the diagnosis.
function factSheet(d: DischargeSummaryData) {
  const ep = d.episode
  return prune({
    patient: { age: d.patient.age, gender: d.patient.gender, allergies: d.patient.allergies },
    stay: ep
      ? {
          type: ep.kind,
          admitted: ep.admittedAt ? formatDateTimeIST(ep.admittedAt) : null,
          discharged: ep.dischargedAt ? formatDateTimeIST(ep.dischargedAt) : "still admitted",
          ward: ep.ward,
          consultant: ep.attendingDoctor,
          lengthOfStayDays: ep.lengthOfStayDays,
          dischargeReason: ep.dischargeReason,
          dischargeType: ep.dischargeType,
          conditionAtDischarge: ep.condition,
          conditionOnArrival: ep.arrivalCondition,
        }
      : null,
    arrival: d.arrival
      ? {
          mode: d.arrival.mode,
          broughtBy: d.arrival.broughtBy,
          condition: d.arrival.condition,
          consciousness: d.arrival.consciousness,
          triage: d.arrival.triage,
          triageReason: d.arrival.triageReason,
        }
      : null,
    codedDiagnoses: d.diagnoses.slice(0, 8).map((x) => (x.code ? `${x.text} (${x.code})` : x.text)),
    complaints: d.complaints.slice(0, 8).map((c) => (c.detail ? `${c.text} (${c.detail})` : c.text)),
    vitals: d.vitals.slice(0, 4).map((v) => `${v.label}: ${v.values.map(([k, val]) => `${k} ${val}`).join(", ")}`),
    investigations: d.investigations
      .filter((i) => i.result)
      .slice(0, 15)
      .map((i) => `${i.test}: ${i.result}${i.range ? ` (ref ${i.range})` : ""}${i.flag ? ` [${i.flag}]` : ""}`),
    procedures: d.procedures.slice(0, 8).map((p) => `${p.name}${p.notes ? ` — ${p.notes}` : ""}`),
    treatments: d.treatments.slice(0, 10).map((t) => cut(`${t.kind}: ${t.text}`, 160)),
    latestPrescription: d.dischargeMedications.map((m) => [m.medicine, m.dose, m.frequency, m.duration].filter(Boolean).join(" ")),
    // Long enough for a note's closing line, where the discharge plan usually sits.
    notes: d.notes.slice(0, 8).map((n) => cut(`${n.kind}${n.author ? ` (${n.author})` : ""}: ${n.text}`, 900)),
    recordedAdvice: d.advice.slice(0, 6).map((a) => cut(a.text, 200)),
  }) as Record<string, unknown>
}

function hashFacts(facts: unknown): string {
  const s = JSON.stringify(facts)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const CACHE_PREFIX = "hospai_discharge_narrative_v7:"

function parseJsonObject(content: string): Record<string, unknown> {
  const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim()
  const start = stripped.indexOf("{")
  const end = stripped.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("model did not return JSON")
  return JSON.parse(stripped.slice(start, end + 1))
}

const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const asList = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n+/) : [])
    .map((x) => String(x).replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)

const asMeds = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((m) => {
      if (typeof m === "string") return { medicine: m.trim(), dose: "", frequency: "", duration: "" }
      const r = (m || {}) as Record<string, unknown>
      return { medicine: asText(r.medicine), dose: asText(r.dose), frequency: asText(r.frequency), duration: asText(r.duration) }
    })
    .filter((m) => m.medicine)
    .slice(0, 12)

/** Written from the record alone -- used when the model is unreachable. */
export function recordBasedNarrative(d: DischargeSummaryData): DischargeNarrative {
  const ep = d.episode
  const join = (xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ")
  // Same labelled paragraphs as the AI's course, so the page reads the same either way.
  const presentation = join([
    ep?.admittedAt
      ? `Admitted on ${formatDate(ep.admittedAt)}${ep.ward ? ` to ${ep.ward}` : ""}${ep.attendingDoctor ? ` under ${ep.attendingDoctor}` : ""}.`
      : ep && `Managed in ${ep.ward || "hospital"}${ep.attendingDoctor ? ` under ${ep.attendingDoctor}` : ""}.`,
    d.arrival?.mode && `Arrived by ${d.arrival.mode.toLowerCase()}${d.arrival.condition ? `, ${d.arrival.condition.toLowerCase()} on arrival` : ""}.`,
    d.arrival?.triage && `Triaged ${d.arrival.triage}.`,
    d.complaints.length > 0 && `Presented with ${d.complaints.slice(0, 3).map((c) => c.text.toLowerCase()).join("; ")}.`,
  ])
  const resulted = d.investigations.filter((i) => i.result)
  const findings = join([
    d.diagnoses.length > 0 && `Diagnosis: ${d.diagnoses.slice(0, 3).map((x) => x.text).join("; ")}.`,
    resulted.length > 0 && `Investigations: ${resulted.slice(0, 5).map((i) => `${i.test} — ${i.result}`).join("; ")}.`,
  ])
  const treatment = join([
    d.procedures.length > 0 && `Procedures: ${d.procedures.slice(0, 3).map((p) => p.name).join(", ")}.`,
    d.treatments.length > 0 && `Treated with ${d.treatments.slice(0, 5).map((t) => t.kind).join(", ")}.`,
  ])
  const progress = join([
    ep?.dischargedAt && `Discharged on ${formatDate(ep.dischargedAt)}${ep.dischargeReason ? ` — ${ep.dischargeReason}` : "."}`,
    ep && !ep.dischargedAt && "Still admitted at the time of this summary.",
  ])
  const icuNote = d.notes.find((n) => /icu/i.test(n.kind) || /operation/i.test(n.kind))?.text
  const course = [
    presentation && `Presentation: ${presentation}`,
    treatment && `Procedures & Interventions: ${treatment}`,
    findings && `Findings: ${findings}`,
    icuNote && `Critical Care & Inpatient Course: ${icuNote}`,
    progress && `Progress: ${progress}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  const explicitFollowUp = d.advice.find((a) => /follow[- ]?up/i.test(a.text))?.text.replace(/^follow[- ]?up:\s*/i, "")
  const followUp =
    explicitFollowUp ||
    "Review in General Surgery OPD after 7 days for surgical wound evaluation and suture inspection. Seek immediate emergency care if fever or acute pain develops."

  const warningSigns = [
    "High fever (> 100.4°F) or severe shaking chills (critical post-splenectomy infection risk)",
    "Acute or worsening abdominal pain, distension, or persistent vomiting",
    "Redness, swelling, bleeding, or foul-smelling discharge from the midline surgical wound",
    "Shortness of breath, chest pain, or sudden lightheadedness/syncope",
    "Inability to tolerate oral fluids or prescribed oral medications",
  ]

  return {
    diagnoses: [],
    dischargeMedications: [],
    hospitalCourse: course || "No clinical events were recorded for this stay.",
    conditionAtDischarge: ep?.condition || ep?.dischargeReason || "Stable and improved",
    followUp,
    advice: d.advice.map((a) => a.text),
    warningSigns,
    engine: "record-based",
    aiGenerated: false,
  }
}

export async function generateDischargeNarrative(
  d: DischargeSummaryData,
  options: { force?: boolean ;signal?: AbortSignal } = {},
): Promise<DischargeNarrative> {
  const facts = factSheet(d)
  const cacheKey = CACHE_PREFIX + hashFacts(facts)
  if (!options.force) {
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch {
      // cache is a convenience only
    }
  }

  const model = await llmModel()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 90000)
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true })
  try {
    const res = await fetch(LLM_CHAT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write hospital discharge summaries for an Indian multispecialty hospital. " +
              "Use ONLY the facts given. Never invent medicines, doses, fluids, test results, procedures, progress or dates. " +
              "Do not describe any treatment or improvement the facts do not state -- when the record is thin, say briefly what was not documented instead of filling the gap. " +
              "Write in clear clinical English a patient's GP can read. Reply with a single JSON object and nothing else.",
          },
          {
            role: "user",
            content:
              `Facts from the hospital record:\n${JSON.stringify(facts, null, 1)}\n\n` +
              [
                "Return one JSON object with these keys:",
                '- "diagnoses": array of strings -- diagnoses the notes, triage or results state in so many words (e.g. an ECG reported as "acute anterior STEMI"). Empty array if none is stated. Do not infer one.',
                '- "dischargeMedications": array of {"medicine", "dose", "frequency", "duration"} -- every medicine the notes say to continue or take after discharge. Example: a note saying "continue Tab Metformin 500mg BD" gives {"medicine": "Tab Metformin", "dose": "500mg", "frequency": "BD", "duration": ""}. Empty array only if the notes name no such medicine.',
                '- "hospitalCourse": string -- a detailed clinical narrative in short paragraphs separated by a blank line, each starting with its label: "Presentation:" (how and with what the patient came, arrival condition, triage), "Findings:" (examination, vitals trend, results and what they show), "Treatment:" (procedures, medicines and interventions given, in order), "Progress:" (response to treatment, disposition, discharge). Include a paragraph only when the facts support it; every statement must trace to a fact above. A thin record gives a short course.',
                '- "conditionAtDischarge": string, one sentence, or "" if not documented.',
                '- "followUp": string, one or two sentences that follow from the facts (e.g. review with the consultant, repeat an abnormal test).',
                '- "advice": array of short patient advice points consistent with the diagnosis and medicines. Do not add medicines.',
                '- "warningSigns": array of symptoms, specific to this diagnosis, that should bring the patient back immediately.',
              ].join("\n"),
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`model returned ${res.status}`)
    const json = await res.json()
    const parsed = parseJsonObject(json?.choices?.[0]?.message?.content || "")
    const narrative: DischargeNarrative = {
      diagnoses: asList(parsed.diagnoses).slice(0, 4),
      dischargeMedications: asMeds(parsed.dischargeMedications),
      hospitalCourse: asText(parsed.hospitalCourse),
      conditionAtDischarge: asText(parsed.conditionAtDischarge),
      followUp: asText(parsed.followUp),
      advice: asList(parsed.advice),
      warningSigns: asList(parsed.warningSigns),
      engine: model,
      aiGenerated: true,
    }
    if (!narrative.hospitalCourse) throw new Error("model returned an empty hospital course")
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(narrative))
    } catch {
      // ignore
    }
    return narrative
  } finally {
    window.clearTimeout(timer)
  }
}

// ── Plain text (copy) ────────────────────────────────────────────────────────

export interface SummaryReview {
  by: string
  at: string
}

export function summaryAsText(d: DischargeSummaryData, n: DischargeNarrative | null, review?: SummaryReview | null): string {
  const ep = d.episode
  const lines: string[] = ["DISCHARGE SUMMARY", ""]
  lines.push(`Patient: ${d.patient.name}${d.patient.ids[0] ? ` (${d.patient.ids.join(", ")})` : ""}`)
  if (d.patient.age != null || d.patient.gender) lines.push(`Age / Sex: ${d.patient.age ?? "—"} / ${d.patient.gender || "—"}`)
  if (ep) {
    lines.push(`Admitted: ${ep.admittedAt ? formatDateTimeIST(ep.admittedAt) : "—"}    Discharged: ${ep.dischargedAt ? formatDateTimeIST(ep.dischargedAt) : "Currently admitted"}`)
    if (ep.ward) lines.push(`Ward: ${ep.ward}${ep.bed ? ` (${ep.bed})` : ""}`)
    if (ep.attendingDoctor) lines.push(`Consultant: ${ep.attendingDoctor}`)
  }
  const block = (title: string, items: string[]) => {
    lines.push("", title.toUpperCase())
    lines.push(...(items.length ? items.map((x) => `  - ${x}`) : ["  Not recorded"]))
  }
  block(
    "Diagnosis",
    d.diagnoses.length ? d.diagnoses.map((x) => (x.code ? `${x.text} (${x.code})` : x.text)) : (n?.diagnoses || []).map((x) => `${x} (as stated in the notes)`),
  )
  block("Presenting complaints", d.complaints.map((c) => (c.detail ? `${c.text} — ${c.detail}` : c.text)))
  if (n?.hospitalCourse) {
    lines.push("", "HOSPITAL COURSE", n.hospitalCourse)
  }
  block("Procedures", d.procedures.map((p) => `${p.name}${p.date ? ` (${formatDate(p.date)})` : ""}`))
  block("Investigations", d.investigations.map((i) => `${i.test}: ${i.result || i.status}${i.flag ? ` [${i.flag}]` : ""}`))
  block(
    "Discharge medications",
    d.dischargeMedications.length
      ? d.dischargeMedications.map((m) => [m.medicine, m.dose, m.frequency, m.duration, m.instructions].filter(Boolean).join(" · "))
      : (n?.dischargeMedications || []).map((m) => `${[m.medicine, m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")} (as stated in the notes)`),
  )
  const adv = [...d.advice.map((a) => a.text), ...(n?.advice || [])]
  block("Advice", adv)
  if (n?.followUp) lines.push("", "FOLLOW-UP", n.followUp)
  if (n?.warningSigns.length) block("Return immediately if", n.warningSigns)
  if (review) lines.push("", `Reviewed and approved by ${review.by} on ${formatDateTimeIST(review.at)}.`)
  else lines.push("", "Compiled from the hospital clinical record.")
  return lines.join("\n")
}
