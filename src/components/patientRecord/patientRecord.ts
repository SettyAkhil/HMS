/**
 * One patient's complete end-to-end record, compiled from every desk.
 *
 * What a scanned OP card opens. Each section copies only what was recorded,
 * from the store that owns it:
 *   - patient master, OP visits                     -> db (reception)
 *   - doctor consultations                          -> DoctorPortalDatabase
 *   - prescriptions                                 -> PharmacyDatabase
 *   - lab orders and results                        -> LabOrderDatabase
 *   - bills                                         -> BillingDatabase claims
 *   - ICU hand-offs                                 -> ICU discharge records
 *   - admissions, transfers, discharges, OT, ICU
 *     charts, backend billing, full timeline        -> backend /api/patients/<id>/journey
 *   - current bed                                   -> /api/beds
 *   - ICU chart days                                -> /api/icu/<id>/flowsheets
 * Missing data stays missing; nothing is filled in. Backend reads use raw
 * fetch -- apiFetch's offline mock invents demographics.
 */

import { db, type DBOPEncounter, type DBPatient } from "../../services/db"
import { encounterArrivalIso, encounterArrivalMs } from "../../services/encounterTime"
import { DoctorPortalDatabase, type ConsultationRecord } from "../../services/doctorPortalDb"
import { PharmacyDatabase, type AppPrescription } from "../../services/pharmacyDb"
import { LabOrderDatabase, type LabOrder } from "../../services/labOrdersDb"
import { BillingDatabase, type ClaimRecord } from "../../services/billingDb"
import { getDischargedIcuPatients, type IcuDischargeRecord } from "../icu/IcuDischargeModal"
import type { BedRecord } from "../../services/bedDb"
import { API_BASE } from "../../lib/constants"
import { withAuthHeaders } from "../../lib/api"

export type JourneyEvent = {
  stage: string
  label: string
  timestamp: string | null
  detail?: Record<string, unknown>
}

export type BackendJourney = {
  patient: Record<string, unknown>
  events: JourneyEvent[]
  summary?: { total_billed?: number ;total_paid?: number ;total_due?: number }
}

export type IpStay = {
  admittedAt: number
  dischargedAt: number | null
  firstBed: string
  lastBed: string
  transfers: number
  events: JourneyEvent[]
}

/** One OP visit, from reception's record or, failing that, the server's. */
export type OpVisitRow = {
  at: number | null
  opNo: string
  dept: string
  doctor: string
  complaint: string
  diagnosis: string
  prescribed: string
  status: string
  source: "desk" | "server"
  /** The source holds a date but no time of day. */
  dateOnly?: boolean
}

type ServerOpVisit = {
  appointment_date?: string | null
  token_no?: number | string | null
  department?: string | null
  doctor_name?: string | null
  chief_complaint?: string | null
  symptoms?: string | null
  diagnoses?: { diagnosis?: string ;name?: string ;icd_code?: string }[]
  prescriptions?: { medicine_name?: string ;dosage?: string }[]
  status?: string | null
}

export type TimelineItem = { at: number | null ;stage: string ;label: string ;source: "desk" | "record" }

export type PatientRecord = {
  code: string
  id: string
  found: boolean
  backendReachable: boolean
  patient: {
    name: string
    age: number | string | null
    sex: string | null
    bloodGroup: string | null
    phone: string | null
    address: string | null
    registeredOn: string | null
  }
  status: { kind: "IP" | "OP" | "NONE" ;bed: BedRecord | null }
  opVisits: OpVisitRow[]
  stays: IpStay[]
  consultations: ConsultationRecord[]
  prescriptions: AppPrescription[]
  labOrders: LabOrder[]
  icuDays: { chart_date: string ;entry_count: number ;updated_by?: string | null ;updated_at?: string | null }[]
  icuHandoffs: IcuDischargeRecord[]
  bills: ClaimRecord[]
  billing: { billed: number ;paid: number ;due: number }
  timeline: TimelineItem[]
  compiledAt: string
}

async function getJson<T>(path: string): Promise<{ ok: boolean ;data: T | null ;reachable: boolean }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: withAuthHeaders({}, "GET"),
      cache: "no-store",
    })
    if (!res.ok) return { ok: false, data: null, reachable: res.status < 500 }
    return { ok: true, data: (await res.json()) as T, reachable: true }
  } catch {
    return { ok: false, data: null, reachable: false }
  }
}

/** Backend timestamps without an offset are UTC (same rule as lib/format). */
export function toMs(t: string | null | undefined): number | null {
  if (!t) return null
  const n = String(t).trim().replace(" ", "T")
  const iso = /^\d{4}-\d{2}-\d{2}T/.test(n) && !/([zZ]|[+-]\d{2}:?\d{2})$/.test(n) ? `${n}Z` : n
  const v = new Date(iso).getTime()
  return Number.isFinite(v) ? v : null
}

const isAdmission = (e: JourneyEvent) => e.stage === "bed" && /^Admitted to/i.test(e.label)
const isTransfer = (e: JourneyEvent) => e.stage === "bed" && /^Transferred to/i.test(e.label)
const isDischarge = (e: JourneyEvent) => e.stage === "bed" && /^Discharged/i.test(e.label)
const bedOf = (label: string) => label.replace(/^(Admitted|Transferred) to\s*/i, "").replace(/^Discharged,\s*/i, "").replace(/\s*released$/i, "")

/** Admission -> (transfers) -> discharge, from the backend's bed events. */
export function deriveStays(events: JourneyEvent[], currentBed: BedRecord | null): IpStay[] {
  const dated = events.filter((e) => toMs(e.timestamp) != null)
  const stays: IpStay[] = []
  let open: IpStay | null = null
  for (const e of dated) {
    const t = toMs(e.timestamp)!
    if (isAdmission(e)) {
      if (open) stays.push(open)
      open = { admittedAt: t, dischargedAt: null, firstBed: bedOf(e.label), lastBed: bedOf(e.label), transfers: 0, events: [e] }
    } else if (open) {
      open.events.push(e)
      if (isTransfer(e)) {
        open.transfers += 1
        open.lastBed = bedOf(e.label)
      } else if (isDischarge(e)) {
        open.dischargedAt = t
        stays.push(open)
        open = null
      }
    }
  }
  if (open) stays.push(open)
  if (currentBed && !stays.some((s) => s.dischargedAt == null)) {
    const t = toMs(currentBed.allocated_at || currentBed.admission_date) ?? Date.now()
    const label = `${currentBed.ward} / Room ${currentBed.room_no} / Bed ${currentBed.bed_no}`
    stays.push({ admittedAt: t, dischargedAt: null, firstBed: label, lastBed: label, transfers: 0, events: dated.filter((e) => (toMs(e.timestamp) ?? 0) >= t) })
  }
  return stays.sort((a, b) => b.admittedAt - a.admittedAt)
}

const dayKey = (ms: number | null) => {
  if (ms == null) return ""
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Reception's visits, plus the server's for any visit reception's record on
 * this computer does not have. Reception writes each visit to the server too,
 * so a server visit on the same date as a desk visit is that same visit.
 */
export function mergeOpVisits(desk: DBOPEncounter[], server: ServerOpVisit[]): OpVisitRow[] {
  const rows: OpVisitRow[] = desk.map((v) => ({
    at: toMs(encounterArrivalIso(v)),
    opNo: v.opNumber,
    dept: v.dept || "",
    doctor: v.assignedDoctor || "",
    complaint: v.chiefComplaint || (v.symptoms || []).join(", "),
    diagnosis: [v.diagnosis, v.icd10].filter(Boolean).join(" · "),
    prescribed: (v.prescription || []).map((m) => m.medicine).join(", "),
    status: v.status || "",
    source: "desk",
  }))
  const unmatched = new Map<string, number>()
  for (const r of rows) unmatched.set(dayKey(r.at), (unmatched.get(dayKey(r.at)) ?? 0) + 1)
  for (const v of server) {
    // A visit date is a calendar day ("2026-10-27 00:00:00"), not a UTC instant.
    const dm = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00(?::00)?)?$/.exec((v.appointment_date || "").trim())
    const at = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]).getTime() : toMs(v.appointment_date ?? null)
    const key = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : dayKey(at)
    const left = unmatched.get(key) ?? 0
    if (left > 0) {
      unmatched.set(key, left - 1)
      continue
    }
    const dept = v.department && !/awaiting/i.test(v.department) ? v.department : ""
    const doctor = v.doctor_name && v.doctor_name !== "Dr. Staff" ? v.doctor_name : ""
    rows.push({
      at,
      opNo: v.token_no != null ? `Token ${v.token_no}` : "—",
      dept,
      doctor,
      complaint: v.chief_complaint && v.chief_complaint !== "OP Visit" ? v.chief_complaint : v.symptoms || "",
      diagnosis: (v.diagnoses ?? []).map((d) => [d.diagnosis || d.name, d.icd_code].filter(Boolean).join(" ")).join("; "),
      prescribed: (v.prescriptions ?? []).map((m) => [m.medicine_name, m.dosage].filter(Boolean).join(" ")).join(", "),
      status: (v.status || "").replace(/_/g, " "),
      source: "server",
      dateOnly: Boolean(dm),
    })
  }
  return rows.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
}

/** Card code (UMR, OP number or backend patient id) -> patient id. */
export function resolvePatientId(code: string): string {
  const c = code.trim().toUpperCase()
  const byOp = db.getEncounters().find((e) => (e.opNumber || "").toUpperCase() === c)
  return byOp?.umr || c
}

const clean = (v: unknown) => {
  const s = v == null ? "" : String(v).trim()
  return s && !/^(unknown|n\/?a|-|—|null|undefined)$/i.test(s) ? s : null
}

export async function compilePatientRecord(code: string): Promise<PatientRecord> {
  const id = resolvePatientId(code)
  const idU = id.toUpperCase()
  const local: DBPatient | undefined = db.getPatientByUmr(id)

  const [journeyRes, bedsRes, icuRes, opRes] = await Promise.all([
    getJson<BackendJourney>(`/api/patients/${encodeURIComponent(id)}/journey`),
    getJson<{ beds: BedRecord[] }>("/api/beds"),
    getJson<{ days: PatientRecord["icuDays"] }>(`/api/icu/${encodeURIComponent(id)}/flowsheets`),
    getJson<{ visits: ServerOpVisit[] }>(`/api/op/patients/${encodeURIComponent(id)}/history`),
  ])
  const journey = journeyRes.data
  const bp = journey?.patient ?? {}
  const currentBed =
    bedsRes.data?.beds?.find((b) => b.status === "Occupied" && String(b.patient_id || "").toUpperCase() === idU) ?? null

  const deskVisits: DBOPEncounter[] = db
    .getEncounters()
    .filter((e) => (e.umr || "").toUpperCase() === idU)
    .sort((a, b) => (encounterArrivalMs(b) ?? 0) - (encounterArrivalMs(a) ?? 0))
  const opVisits = mergeOpVisits(deskVisits, opRes.data?.visits ?? [])
  const consultations = DoctorPortalDatabase.getConsultationsForPatient(id)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
  const prescriptions = PharmacyDatabase.getPrescriptions()
    .filter((p) => [p.patientId, p.uhid].some((x) => (x || "").toUpperCase() === idU))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
  const labOrders = LabOrderDatabase.getOrdersForPatient(id)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
  const bills = BillingDatabase.getClaims()
    .filter((c) => (c.patientId || "").toUpperCase() === idU)
    .sort((a, b) => (b.dateOfService || "").localeCompare(a.dateOfService || ""))
  const icuHandoffs = getDischargedIcuPatients().filter((r) => (r.mrn || "").toUpperCase() === idU)
  const events = journey?.events ?? []
  const stays = deriveStays(events, currentBed)

  // Billing: the hospital's own invoices where they exist, else the backend's.
  const localBilled = bills.reduce((a, b) => a + (b.totalAmount || 0), 0)
  const billing = bills.length
    ? {
        billed: localBilled,
        paid: bills.reduce((a, b) => a + (b.amountPaid || 0), 0),
        due: bills.reduce((a, b) => a + (b.balanceDue || 0), 0),
      }
    : {
        billed: Number(journey?.summary?.total_billed ?? 0),
        paid: Number(journey?.summary?.total_paid ?? 0),
        due: Number(journey?.summary?.total_due ?? 0),
      }

  // Timeline: the backend's record plus the desk-side steps it does not hold.
  const timeline: TimelineItem[] = events.map((e) => ({ at: toMs(e.timestamp), stage: e.stage, label: e.label, source: "record" as const }))
  for (const v of opVisits) {
    if (v.source !== "desk") continue // server visits are already in the record's own events
    timeline.push({
      at: v.at,
      stage: "op",
      label: `OP visit ${v.opNo}${v.dept ? ` · ${v.dept}` : ""}${v.doctor ? ` · ${v.doctor}` : ""}${v.diagnosis ? ` — ${v.diagnosis}` : ""}`,
      source: "desk",
    })
  }
  for (const c of consultations) {
    timeline.push({ at: toMs(c.createdAt), stage: "consultation", label: `Consultation with ${c.doctorName}${c.diagnosis ? ` — ${c.diagnosis}` : ""}`, source: "desk" })
  }
  for (const p of prescriptions) {
    timeline.push({ at: toMs(p.createdAt), stage: "pharmacy", label: `Prescription ${p.id} (${p.items.length} item${p.items.length === 1 ? "" : "s"}) — ${p.status}`, source: "desk" })
  }
  for (const o of labOrders) {
    timeline.push({ at: toMs(o.createdAt), stage: "lab", label: `Lab order ${o.id}: ${o.tests.map((t) => t.name).join(", ")} — ${o.status}`, source: "desk" })
  }
  for (const h of icuHandoffs) {
    timeline.push({ at: toMs(h.dischargedAt), stage: "icu", label: `ICU ${h.dischargeType} from ${h.bed}${h.destinationWard ? ` to ${h.destinationWard}` : ""}`, source: "desk" })
  }
  timeline.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))

  const lastOp = opVisits[0]?.at ?? null
  const latestStay = stays[0]
  const kind: PatientRecord["status"]["kind"] = currentBed || (latestStay && (lastOp == null || latestStay.admittedAt >= lastOp))
    ? "IP"
    : opVisits.length
      ? "OP"
      : "NONE"

  const bpName = [bp.name, bp.last_name].map(clean).filter(Boolean).join(" ")
  return {
    code,
    id,
    found: Boolean(local || journey || opVisits.length),
    backendReachable: journeyRes.reachable,
    patient: {
      name: local?.name || bpName || deskVisits[0]?.patientName || "",
      age: local?.age ?? (clean(bp.age) as string | null) ?? deskVisits[0]?.age ?? null,
      sex: local?.sex || clean(bp.gender) || deskVisits[0]?.sex || null,
      bloodGroup: clean(local?.bloodGroup) || clean(bp.blood_group),
      phone: local?.phone || clean(bp.phone) || deskVisits[0]?.phone || null,
      address: clean(local?.address) || clean(bp.address),
      registeredOn: local?.createdAt || clean(bp.created_at),
    },
    status: { kind, bed: currentBed },
    opVisits,
    stays,
    consultations,
    prescriptions,
    labOrders,
    icuDays: icuRes.data?.days ?? [],
    icuHandoffs,
    bills,
    billing,
    timeline,
    compiledAt: new Date().toISOString(),
  }
}

/** URL of the patient page, on this same origin (opened in a new tab). */
export function patientPageUrl(code: string): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#/patient/${encodeURIComponent(code.trim().toUpperCase())}`
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i

/**
 * Origin a phone can reach, for the card's QR code. A QR pointing at
 * "localhost" would send the phone to itself, so when the app is open on
 * localhost this uses VITE_PUBLIC_APP_URL, else the machine's LAN address
 * published by the dev server (VITE_LAN_ORIGIN).
 */
export function publicAppOrigin(): { origin: string ;reachable: boolean } {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "")
  if (configured) return { origin: configured, reachable: true }
  if (!LOCAL_HOST.test(window.location.hostname)) return { origin: window.location.origin, reachable: true }
  const lan = String(import.meta.env.VITE_LAN_ORIGIN || "").trim()
  return lan ? { origin: lan, reachable: true } : { origin: window.location.origin, reachable: false }
}

/** What the card's QR encodes: a link straight to this patient's page. */
export function publicPatientPageUrl(code: string): string {
  const { origin } = publicAppOrigin()
  const path = window.location.pathname || "/"
  return `${origin}${path}#/patient/${encodeURIComponent(code.trim().toUpperCase())}`
}

// --- No-login card links -----------------------------------------------------
// The card's QR opens `#/card/<token>`: a per-card secret issued by the backend
// (never the UMR, which is sequential and so guessable). Anyone holding the
// card can open it without signing in; nobody can reach another patient's
// record by editing the address. Reissuing cancels a lost card's link.

const tokenCache = new Map<string, string>()
const serverPatients = new Map<string, Record<string, unknown>>()

/**
 * The server's own details for a patient, as returned with their card link.
 * Cards print these in preference to the desk's copy, which may be stale or,
 * for patients synced by older versions, hold placeholder values.
 */
export function serverCardPatient(patientId: string): Record<string, unknown> | null {
  return serverPatients.get(patientId.trim().toUpperCase()) ?? null
}

/** Why a card could not get its link -- shown on the card instead of the QR. */
export type CardLinkProblem = "offline" | "signin" | "conflict" | "deleted" | "unknown"

export type CardPatientDetails = {
  name: string
  age?: number | string | null
  sex?: string | null
  phone?: string | null
  bloodGroup?: string | null
}

let lastProblem: CardLinkProblem | null = null
/** Reason the most recent fetchCardToken() failed, if it did. */
export function lastCardLinkProblem(): CardLinkProblem | null {
  return lastProblem
}

/**
 * The patient's card token from the backend (issued on first use). `details`
 * lets the backend register a patient known only at this desk (registered
 * offline, or a local demo record) under the same UMR, so their card works.
 */
export async function fetchCardToken(
  patientId: string,
  rotate = false,
  details?: CardPatientDetails,
): Promise<string | null> {
  const key = patientId.trim().toUpperCase()
  if (!rotate && tokenCache.has(key)) return tokenCache.get(key)!
  const parts = (details?.name || "").trim().split(/\s+/)
  const patient = details
    ? {
        name: parts[0] || "",
        last_name: parts.slice(1).join(" "),
        age: details.age ?? null,
        gender: details.sex ?? null,
        phone: details.phone ?? null,
        blood_group: details.bloodGroup ?? null,
      }
    : undefined
  try {
    const res = await fetch(`${API_BASE}/api/patients/${encodeURIComponent(patientId)}/card-token`, {
      method: "POST",
      credentials: "include",
      headers: withAuthHeaders({ "Content-Type": "application/json" }, "POST"),
      body: JSON.stringify({ rotate, patient }),
    })
    if (!res.ok) {
      lastProblem =
        res.status === 401 || res.status === 403
          ? "signin"
          : res.status === 409
            ? "conflict"
            : res.status === 410
              ? "deleted"
              : res.status >= 500
              ? "offline"
              : "unknown"
      return null
    }
    const data = (await res.json()) as { token?: string ;patient?: Record<string, unknown> | null }
    if (data.patient) serverPatients.set(key, data.patient)
    if (!data.token) {
      lastProblem = "unknown"
      return null
    }
    lastProblem = null
    tokenCache.set(key, data.token)
    return data.token
  } catch {
    lastProblem = "offline"
    return null
  }
}

/** What the card's QR encodes: the no-login link for this card. */
export function publicCardUrl(token: string): string {
  const { origin } = publicAppOrigin()
  const path = window.location.pathname || "/"
  return `${origin}${path}#/card/${encodeURIComponent(token)}`
}

/** The card token in a URL hash, if this tab is a card page. */
export function cardTokenFromHash(hash = window.location.hash): string | null {
  const m = /^#\/card\/([A-Za-z0-9_-]{20,64})/.exec(hash)
  return m ? m[1] : null
}

export type PublicCardPayload = {
  patient: Record<string, unknown>
  hospital: { name: string | null }
  events: JourneyEvent[]
  summary?: BackendJourney["summary"]
  visits: ServerOpVisit[]
  bed: Partial<BedRecord> | null
  icu_days: PatientRecord["icuDays"]
}

function signedInHere(): boolean {
  try {
    return Boolean(localStorage.getItem("hospai_current_user"))
  } catch {
    return false
  }
}

/**
 * The record behind a card link. Without a login it comes from the backend's
 * public card route alone; on a signed-in HMS computer the desk's own records
 * (prescriptions, lab results, consultations, bills) are added as well.
 */
export async function compileCardRecord(token: string): Promise<{ record: PatientRecord | null ;hospitalName: string | null ;status: "ok" | "unknown" | "offline" }> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/public/patient-card/${encodeURIComponent(token)}`, { cache: "no-store", credentials: "omit" })
  } catch {
    return { record: null, hospitalName: null, status: "offline" }
  }
  if (res.status === 404) return { record: null, hospitalName: null, status: "unknown" }
  if (!res.ok) return { record: null, hospitalName: null, status: "offline" }
  const data = (await res.json()) as PublicCardPayload
  const id = String(data.patient.patient_id || "")
  if (signedInHere() && id) {
    const full = await compilePatientRecord(id)
    if (full.found) return { record: full, hospitalName: data.hospital?.name ?? null, status: "ok" }
  }
  const p = data.patient
  const bed = data.bed ? ({ ...data.bed, status: "Occupied", patient_id: id } as BedRecord) : null
  const events = data.events ?? []
  const stays = deriveStays(events, bed)
  const opVisits = mergeOpVisits([], data.visits ?? [])
  const lastOp = opVisits[0]?.at ?? null
  const kind: PatientRecord["status"]["kind"] = bed || (stays[0] && (lastOp == null || stays[0].admittedAt >= lastOp)) ? "IP" : opVisits.length ? "OP" : "NONE"
  const record: PatientRecord = {
    code: token,
    id,
    found: true,
    backendReachable: true,
    patient: {
      name: [p.name, p.middle_name, p.last_name].map(clean).filter(Boolean).join(" "),
      age: (clean(p.age) as string | null) ?? null,
      sex: clean(p.gender),
      bloodGroup: clean(p.blood_group),
      phone: clean(p.phone),
      address: [clean(p.address), clean(p.area)].filter(Boolean).join(", ") || null,
      registeredOn: clean(p.created_at),
    },
    status: { kind, bed },
    opVisits,
    stays,
    consultations: [],
    prescriptions: [],
    labOrders: [],
    icuDays: data.icu_days ?? [],
    icuHandoffs: [],
    bills: [],
    billing: {
      billed: Number(data.summary?.total_billed ?? 0),
      paid: Number(data.summary?.total_paid ?? 0),
      due: Number(data.summary?.total_due ?? 0),
    },
    timeline: events.map((e) => ({ at: toMs(e.timestamp), stage: e.stage, label: e.label, source: "record" as const })).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
    compiledAt: new Date().toISOString(),
  }
  return { record, hospitalName: data.hospital?.name ?? null, status: "ok" }
}

/**
 * The patient code in whatever a scanner produced: a bare UMR / OP number,
 * or the full link a 2-D scanner reads out of the card's QR.
 */
export function extractCardCode(scanned: string): string {
  const s = scanned.trim()
  const fromLink = patientCodeFromHash(s.includes("#") ? s.slice(s.indexOf("#")) : "")
  return (fromLink ?? s).trim()
}

/** The code in the current URL, if this tab is a patient page. */
export function patientCodeFromHash(hash = window.location.hash): string | null {
  const m = /^#\/patient\/([^/?#]+)/.exec(hash)
  return m ? decodeURIComponent(m[1]) : null
}
