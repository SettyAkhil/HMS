/**
 * Hospital-wide view of every doctor's work, for administrators.
 *
 * Derived on every read from the stores the desks already write to -- OP
 * encounters (`db`), consultations (`DoctorPortalDatabase`), lab orders and
 * pharmacy prescriptions -- so the overview can never disagree with what a
 * doctor sees in their own workspace. Nothing here is stored.
 *
 * Records are matched to a doctor by account id where the record carries one,
 * otherwise by name. A name that matches no account ("Dr. Vance" on an old
 * seed) is still listed, as an unlinked doctor, rather than silently dropped:
 * its patients would otherwise appear in nobody's workspace and nobody's report.
 */

import { db, type DBOPEncounter } from "./db"
import {
  DOCTOR_ROSTER,
  DoctorPortalDatabase,
  getAllDoctorAccounts,
  isUnassignedDoctor,
  normalizeDoctorName,
  type ConsultationRecord,
  type DoctorAccount,
} from "./doctorPortalDb"
import { getDoctorMaster } from "./doctorMaster"
import { LabOrderDatabase, type LabOrder } from "./labOrdersDb"
import { PharmacyDatabase, type AppPrescription } from "./pharmacyDb"
import { encounterArrivalMs, stampMs } from "./encounterTime"

export type VisitStage = "Registered" | "With nurse" | "Waiting" | "In consultation" | "After consultation" | "Completed"

export function visitStage(status: DBOPEncounter["status"] | string): VisitStage {
  switch (status) {
    case "Doctor Assigned":
    case "Awaiting Doctor":
    case "With Nurse":
    case "Triage Done":
      return "With nurse"
    case "Vitals Recorded":
    case "In Queue":
    case "Awaiting Consultation":
    case "Waiting":
      return "Waiting"
    case "Under Consultation":
    case "In Consultation":
      return "In consultation"
    case "Consultation Completed":
    case "Post-Consultation":
    case "Awaiting Billing":
    case "Billing Completed":
    case "Awaiting Investigation":
      return "After consultation"
    case "OP Completed":
    case "Discharged":
    case "Cancelled":
      return "Completed"
    default:
      return "Registered"
  }
}

const OPEN_STAGES: VisitStage[] = ["Registered", "With nurse", "Waiting", "In consultation"]
export const isOpenStage = (s: VisitStage) => OPEN_STAGES.includes(s)

/** The visit's milestones, for a progress track: done or not, and when. */
export interface VisitMilestone {
  label: string
  done: boolean
  at: number | null
}

export interface DoctorPatientRow {
  encounter: DBOPEncounter
  arrivalMs: number | null
  stage: VisitStage
  milestones: VisitMilestone[]
  consultation?: ConsultationRecord
  labOrders: LabOrder[]
  prescriptions: AppPrescription[]
}

export interface TimelineEvent {
  at: number
  kind: "visit" | "consultation" | "lab" | "pharmacy"
  title: string
  detail: string
  patient: string
}

export interface DoctorCounts {
  patients: number
  open: number
  waiting: number
  withNurse: number
  inConsultation: number
  seenToday: number
  consultations: number
  dispatched: number
  labOrders: number
  labPending: number
  labCritical: number
  prescriptions: number
  rxAtPharmacy: number
}

export interface DoctorOversightRow {
  key: string
  /** The sign-in account, or null for a doctor name with no account. */
  account: DoctorAccount | null
  name: string
  specialty: string
  room: string
  patients: DoctorPatientRow[]
  consultations: ConsultationRecord[]
  labOrders: LabOrder[]
  prescriptions: AppPrescription[]
  counts: DoctorCounts
  lastActivity: number | null
}

export interface DoctorOversight {
  doctors: DoctorOversightRow[]
  unclaimed: DoctorPatientRow[]
  totals: {
    activeDoctors: number
    waiting: number
    inConsultation: number
    seenToday: number
    unclaimed: number
    labPending: number
    labCritical: number
    rxAtPharmacy: number
  }
}

const norm = (s?: string | null) => (s || "").toLowerCase().replace(/^dr\.?\s*/, "").replace(/[^a-z0-9]+/g, " ").trim()

const LAB_DONE: LabOrder["status"][] = ["Completed", "Cancelled"]
const RX_DONE = ["Dispensed", "Cancelled", "Rejected"]

function isToday(ms: number | null): boolean {
  if (ms === null) return false
  const d = new Date(ms)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function milestonesFor(e: DBOPEncounter, c: ConsultationRecord | undefined, stage: VisitStage): VisitMilestone[] {
  const t = e.timestamps || ({} as DBOPEncounter["timestamps"])
  const after = (s: VisitStage[]) => s.includes(stage)
  return [
    { label: "Arrived", done: true, at: encounterArrivalMs(e) },
    {
      label: "Vitals",
      done: Boolean(t.vitalsRecorded) || after(["Waiting", "In consultation", "After consultation", "Completed"]),
      at: stampMs(t.vitalsRecorded),
    },
    {
      label: "Consultation",
      done: Boolean(t.consultationStart) || after(["In consultation", "After consultation", "Completed"]),
      at: stampMs(t.consultationStart) ?? stampMs(c?.createdAt),
    },
    {
      label: "Orders sent",
      done: c?.dispatch === "Dispatched" || after(["After consultation", "Completed"]),
      at: stampMs(c?.dispatchedAt) ?? stampMs(t.consultationEnd),
    },
    { label: "Completed", done: stage === "Completed", at: stampMs(t.visitCompleted) },
  ]
}

function countsFor(rows: DoctorPatientRow[], cons: ConsultationRecord[], labs: LabOrder[], rx: AppPrescription[]): DoctorCounts {
  return {
    patients: rows.length,
    open: rows.filter((r) => isOpenStage(r.stage)).length,
    waiting: rows.filter((r) => r.stage === "Waiting").length,
    withNurse: rows.filter((r) => r.stage === "With nurse" || r.stage === "Registered").length,
    inConsultation: rows.filter((r) => r.stage === "In consultation").length,
    seenToday: rows.filter((r) => !isOpenStage(r.stage) && isToday(r.arrivalMs)).length,
    consultations: cons.length,
    dispatched: cons.filter((c) => c.dispatch === "Dispatched").length,
    labOrders: labs.length,
    labPending: labs.filter((o) => !LAB_DONE.includes(o.status)).length,
    labCritical: labs.filter((o) => o.tests.some((t) => /critical/i.test(t.flag || "") || Object.values(t.results || {}).some((r) => /critical/i.test(r.flag || "")))).length,
    prescriptions: rx.length,
    rxAtPharmacy: rx.filter((p) => !RX_DONE.includes(p.status)).length,
  }
}

export function getDoctorOversight(): DoctorOversight {
  const encounters = db.getEncounters()
  const consultations = DoctorPortalDatabase.getConsultations()
  const labOrders = LabOrderDatabase.getOrders()
  const prescriptions = PharmacyDatabase.getPrescriptions()

  // Every doctor identity that appears anywhere: accounts first, then names without one.
  const byKey = new Map<string, { account: DoctorAccount | null ;name: string ;specialty: string ;room: string }>()
  const keyForName = new Map<string, string>()

  const allDocs = getAllDoctorAccounts()
  for (const d of allDocs) {
    byKey.set(d.id, { account: d, name: d.name, specialty: d.specialty, room: d.room })
    keyForName.set(normalizeDoctorName(d.name), d.id)
    if (d.username) keyForName.set(normalizeDoctorName(d.username), d.id)
    if (d.staffId) keyForName.set(normalizeDoctorName(d.staffId), d.id)
  }

  // Also index master doctors in case any custom entries exist
  try {
    for (const d of getDoctorMaster()) {
      if (!byKey.has(d.id)) {
        const docAcc: DoctorAccount = {
          id: d.id,
          username: (d.username || d.id.toLowerCase().replace(/[^a-z0-9]/g, "")).toLowerCase(),
          name: d.name,
          specialty: d.specialty || "General Medicine",
          room: d.room || "Room 101",
          staffId: d.staffId || d.id,
          qualification: d.qualification || "Consultant Physician",
        }
        byKey.set(d.id, { account: docAcc, name: d.name, specialty: docAcc.specialty, room: docAcc.room })
      }
      keyForName.set(normalizeDoctorName(d.name), d.id)
      if (d.username) keyForName.set(normalizeDoctorName(d.username), d.id)
      if (d.staffId) keyForName.set(normalizeDoctorName(d.staffId), d.id)
    }
  } catch {}

  const keyFor = (id?: string | null, name?: string | null): string | null => {
    if (id && byKey.has(id)) return id
    if (!name || isUnassignedDoctor(name)) return null
    const n = normalizeDoctorName(name)
    if (!n) return null

    const known = keyForName.get(n)
    if (known) return known

    // Fuzzy matching by substring against registered doctor names
    for (const [kn, kid] of keyForName.entries()) {
      if (kn === n) return kid
      if (kn.length >= 4 && n.length >= 4 && (kn.includes(n) || n.includes(kn))) {
        return kid
      }
    }

    const key = `name:${n}`
    if (!byKey.has(key)) {
      byKey.set(key, { account: null, name: (name || "").trim(), specialty: "", room: "" })
      keyForName.set(n, key)
    }
    return key
  }

  const consByEncounter = new Map(consultations.map((c) => [c.encounterId, c]))
  const rowFor = (e: DBOPEncounter): DoctorPatientRow => {
    const c = consByEncounter.get(e.id)
    const stage = visitStage(e.status)
    return {
      encounter: e,
      arrivalMs: encounterArrivalMs(e),
      stage,
      milestones: milestonesFor(e, c, stage),
      consultation: c,
      labOrders: labOrders.filter((o) => o.encounterId === e.id || (c?.labOrderId && o.id === c.labOrderId)),
      prescriptions: prescriptions.filter((p) => p.visitId === e.id || (c?.prescriptionId && p.id === c.prescriptionId)),
    }
  }

  const patientsByKey = new Map<string, DoctorPatientRow[]>()
  const unclaimed: DoctorPatientRow[] = []
  for (const e of encounters) {
    const docId = (e as any).assignedDoctorId || (e as any).doctorId
    const docName = e.assignedDoctor || (e as any).doctorAssigned
    const key = keyFor(docId, docName)
    const row = rowFor(e)
    if (!key) {
      if (isOpenStage(row.stage)) unclaimed.push(row)
      continue
    }
    patientsByKey.set(key, [...(patientsByKey.get(key) || []), row])
  }
  const group = <T,>(items: T[], idOf: (x: T) => string | undefined, nameOf: (x: T) => string | undefined) => {
    const m = new Map<string, T[]>()
    for (const it of items) {
      const key = keyFor(idOf(it), nameOf(it))
      if (key) m.set(key, [...(m.get(key) || []), it])
    }
    return m
  }
  const consByKey = group(consultations, (c) => c.doctorId, (c) => c.doctorName)
  const labsByKey = group(labOrders, (o) => o.doctorId, (o) => o.doctorName)
  const rxByKey = group(prescriptions, (p) => p.doctorId, (p) => p.doctorName)

  const byArrivalDesc = (a: DoctorPatientRow, b: DoctorPatientRow) => (b.arrivalMs ?? 0) - (a.arrivalMs ?? 0)

  const doctors: DoctorOversightRow[] = [...byKey.entries()].map(([key, who]) => {
    const patients = (patientsByKey.get(key) || []).sort(byArrivalDesc)
    const cons = consByKey.get(key) || []
    const labs = labsByKey.get(key) || []
    const rx = rxByKey.get(key) || []
    const stamps = [
      ...patients.map((p) => p.arrivalMs),
      ...cons.map((c) => stampMs(c.updatedAt)),
      ...labs.map((o) => stampMs(o.updatedAt)),
      ...rx.map((p) => stampMs(p.createdAt)),
    ].filter((x): x is number => x !== null)
    return {
      key,
      account: who.account,
      name: who.name,
      specialty: who.specialty || patients[0]?.encounter.dept || "",
      room: who.room,
      patients,
      consultations: cons,
      labOrders: labs,
      prescriptions: rx,
      counts: countsFor(patients, cons, labs, rx),
      lastActivity: stamps.length ? Math.max(...stamps) : null,
    }
  })

  // Busiest first: who has people waiting now, then who has done the most.
  doctors.sort(
    (a, b) =>
      b.counts.open - a.counts.open ||
      b.counts.patients + b.counts.labOrders + b.counts.prescriptions - (a.counts.patients + a.counts.labOrders + a.counts.prescriptions) ||
      a.name.localeCompare(b.name),
  )

  const sum = (f: (c: DoctorCounts) => number) => doctors.reduce((n, d) => n + f(d.counts), 0)
  return {
    doctors,
    unclaimed: unclaimed.sort(byArrivalDesc),
    totals: {
      activeDoctors: doctors.filter((d) => d.counts.open > 0 || d.counts.seenToday > 0).length,
      waiting: sum((c) => c.waiting + c.withNurse),
      inConsultation: sum((c) => c.inConsultation),
      seenToday: sum((c) => c.seenToday),
      unclaimed: unclaimed.length,
      labPending: sum((c) => c.labPending),
      labCritical: sum((c) => c.labCritical),
      rxAtPharmacy: sum((c) => c.rxAtPharmacy),
    },
  }
}

/** Everything that happened under one doctor, newest first. */
export function doctorTimeline(row: DoctorOversightRow, limit = 60): TimelineEvent[] {
  const ev: TimelineEvent[] = []
  const push = (at: number | null, kind: TimelineEvent["kind"], title: string, detail: string, patient: string) => {
    if (at !== null) ev.push({ at, kind, title, detail, patient })
  }
  for (const p of row.patients) {
    const e = p.encounter
    const t = e.timestamps || ({} as DBOPEncounter["timestamps"])
    push(p.arrivalMs, "visit", "Patient arrived", [e.opNumber, e.dept, e.chiefComplaint].filter(Boolean).join(" · "), e.patientName)
    push(stampMs(t.vitalsRecorded), "visit", "Vitals recorded", t.vitalsBy ? `by ${t.vitalsBy}` : "", e.patientName)
    push(stampMs(t.consultationStart), "visit", "Consultation started", e.opNumber, e.patientName)
    push(stampMs(t.visitCompleted), "visit", "Visit completed", e.diagnosis || "", e.patientName)
  }
  for (const c of row.consultations) {
    push(stampMs(c.createdAt), "consultation", "Consultation opened", c.diagnosis || "", c.patientName)
    push(stampMs(c.dispatchedAt), "consultation", "Orders sent", [c.medications.length && `${c.medications.length} medicines`, c.labTests.length && `${c.labTests.length} tests`].filter(Boolean).join(" · "), c.patientName)
  }
  for (const o of row.labOrders) {
    push(stampMs(o.createdAt), "lab", "Lab order placed", o.tests.map((t) => t.name).join(", "), o.patientName)
    for (const h of o.history || []) push(stampMs(h.at), "lab", h.action, h.detail || h.actor, o.patientName)
  }
  for (const p of row.prescriptions) {
    push(stampMs(p.createdAt), "pharmacy", "Prescription sent to pharmacy", `${p.items.length} item${p.items.length === 1 ? "" : "s"} · ${p.status}`, p.patientName)
    push(stampMs(p.verifiedDate), "pharmacy", "Prescription verified", p.verifiedBy ? `by ${p.verifiedBy}` : "", p.patientName)
  }
  return ev.sort((a, b) => b.at - a.at).slice(0, limit)
}
