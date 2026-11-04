/**
 * The doctor's live board: everything happening right now that this one doctor
 * either needs to act on or should know about.
 *
 * Nothing here is a new data source. The feed is derived on every read from the
 * three stores that other departments actually write to during a clinic session:
 *
 *   - `db` encounters        -- reception, queue management and the OP workflow
 *   - `LabOrderDatabase`     -- reception's billing desk and the laboratory
 *   - `PharmacyDatabase`     -- the pharmacist's verification/dispensing queue
 *
 * Deriving rather than storing is deliberate: an event can never disagree with
 * the record it describes, and a write by any other role -- in this tab or
 * another one -- surfaces here the moment its store changes.
 *
 * Only alerts a doctor can actually do something about are marked `actionable`;
 * the rest are informational so the board does not nag about work that belongs
 * to another desk.
 */

import { db, DBOPEncounter } from "./db"
import { encounterArrivalIso } from "./encounterTime"
import { notifyPatientCalled } from "./patientMessaging"
import { LabOrder, LabOrderDatabase } from "./labOrdersDb"
import { AppPrescription, PharmacyDatabase } from "./pharmacyDb"
import {
  DoctorAccount,
  DoctorPortalDatabase,
  doesDoctorMatchEncounter,
  isEncounterOpen,
  isFirstVisit,
  normalizeDoctorName,
} from "./doctorPortalDb"

// ER visits are the one alert source this feed doesn't derive from a local
// store -- they live only in the real backend, so the caller (useErAssignmentsForDoctor)
// polls and hands the result in, same shape as everything else pushed below.
export interface ErAssignment {
  id: number
  visit_no: string
  patient_name?: string | null
  patient_last_name?: string | null
  is_unknown_patient?: boolean
  unknown_patient_label?: string | null
  condition_at_arrival?: string | null
  triage_category?: string | null
  assigned_specialty?: string | null
  doctor_assigned_at?: string | null
}

export type LiveSeverity = "critical" | "warning" | "info"

export type LiveAlertKind = "new-patient" | "vitals-ready" | "waiting-long" | "in-consultation" | "lab-awaiting-payment" | "lab-in-progress" | "lab-result" | "lab-critical" | "rx-ready" | "rx-dispensed" | "rx-rejected" | "er-assignment"

export interface LiveAlert {
  id: string
  kind: LiveAlertKind
  severity: LiveSeverity
  /** True when the doctor is the one who can resolve it. */
  actionable: boolean
  title: string
  detail: string
  at: string
  patientName: string
  umr: string
  encounterId?: string
  /** Lab order id or prescription id, for the action buttons. */
  refId?: string
  acknowledged: boolean
}

export interface QueueEntry {
  encounter: DBOPEncounter
  isNewPatient: boolean
  /** Minutes since arrival, recomputed on each tick. */
  waitingMinutes: number
  position: number
}

export interface ClinicPulse {
  waiting: number
  inConsultation: number
  completedToday: number
  longestWaitMinutes: number
  averageWaitMinutes: number
  labAwaitingPayment: number
  labInProgress: number
  resultsReady: number
  rxAwaitingPharmacy: number
  rxDispensed: number
}

export interface DoctorLiveBoard {
  alerts: LiveAlert[]
  actionable: LiveAlert[]
  queue: QueueEntry[]
  active?: QueueEntry
  pulse: ClinicPulse
}

/** How long a patient may sit in the waiting room before the board says so. */
export const LONG_WAIT_MINUTES = 20
/** How long an ordered investigation may sit unpaid at reception before it is flagged. */
export const STALE_BILLING_MINUTES = 15

const WAITING_STATUSES: DBOPEncounter["status"][] = [
  "Registered",
  "Symptoms Captured",
  "AI Recommended",
  "Awaiting Doctor",
  "Doctor Assigned",
  "In Queue",
  "Vitals Recorded",
  "Awaiting Consultation",
]

/** Whether the encounter is actively waiting for this doctor's consultation. */
export function isWaitingForDoctor(status?: string | null): boolean {
  if (!status) return true
  if (status === "Under Consultation" || (status as string) === "In Consultation") return false
  return isEncounterOpen(status)
}

/** Parsed arrival (see encounterTime.ts); the raw text only if nothing parses. */
function arrivalOf(e: DBOPEncounter): string {
  return encounterArrivalIso(e) || e.timestamps?.arrival || e.registrationTime
}

function minutesSince(iso: string | undefined, now: number): number {
  if (!iso) return 0
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 0
  return Math.max(0, Math.round((now - then) / 60000))
}

/**
 * A stable id for a derived alert, so acknowledging one keeps it cleared.
 * It includes the state that produced the alert, so a *later* change to the
 * same record (a second result, a re-dispatch) raises a fresh alert rather than
 * arriving pre-acknowledged.
 */
function buildAlertId(
  kind: LiveAlertKind,
  refId: string,
  stamp: string,
): string {
  return `${kind}:${refId}:${stamp}`
}

function isToday(iso: string | undefined): boolean {
  if (!iso) return false
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

/**
 * Visits this doctor has finished today.
 *
 * `timestamps.consultationEnd` is a wall-clock string with no date, so it
 * cannot answer "today" on its own. A consultation record dispatched today is
 * the reliable signal; an encounter that reached a post-consultation status and
 * arrived today covers visits closed without a dispatch (no medicines, no
 * tests). Counted as a union of encounter ids so a visit is never counted twice.
 */
function countSeenToday(doctor: DoctorAccount, mine: DBOPEncounter[]): number {
  const seen = new Set<string>()

  for (const record of DoctorPortalDatabase.getConsultations()) {
    if (record.doctorId !== doctor.id) continue
    if (record.dispatch === "Dispatched" && isToday(record.dispatchedAt))
      seen.add(record.encounterId)
  }

  for (const encounter of mine) {
    const finished = !isEncounterOpen(encounter.status)
    if (
      finished &&
      isToday(arrivalOf(encounter))
    ) {
      seen.add(encounter.id)
    }
  }

  return seen.size
}

export function buildDoctorLiveBoard(
  doctor: DoctorAccount,
  now: number = Date.now(),
  erAssignments: ErAssignment[] = [],
): DoctorLiveBoard {
  const encounters = db.getEncounters()
  const mine = encounters.filter((e) => e && doctor && doesDoctorMatchEncounter(doctor, e))
  const myUmrs = new Set(
    mine
      .map((e) => (e.umr ? e.umr.toUpperCase() : ""))
      .filter(Boolean),
  )

  const normDocName = normalizeDoctorName(doctor?.name)
  const isDocMatch = (docId?: string, docName?: string) => {
    if (!doctor) return false
    if (docId && (docId === doctor.id || docId === doctor.staffId || docId === doctor.username)) return true
    if (!docName) return false
    const n = normalizeDoctorName(docName)
    return n === normDocName || (n.length >= 4 && normDocName.length >= 4 && (n.includes(normDocName) || normDocName.includes(n)))
  }

  const labOrders = LabOrderDatabase.getOrders().filter(
    (order) =>
      order &&
      (order.doctorId === doctor?.id ||
        isDocMatch(order.doctorId, order.doctorName) ||
        (order.umr && myUmrs.has(order.umr.toUpperCase()))),
  )
  const prescriptions = PharmacyDatabase.getPrescriptions().filter(
    (rx) =>
      rx &&
      (rx.doctorId === doctor?.id ||
        isDocMatch(rx.doctorId, rx.doctorName) ||
        (rx.uhid && myUmrs.has(rx.uhid.toUpperCase()))),
  )
  const acknowledged = DoctorPortalDatabase.getAcknowledgedAlerts()

  // ── Queue ────────────────────────────────────────────────────────────────
  const queue: QueueEntry[] = mine
    .filter((e) => isWaitingForDoctor(e.status))
    .map((e) => ({
      encounter: e,
      isNewPatient: isFirstVisit(e, encounters),
      waitingMinutes: minutesSince(arrivalOf(e), now),
      position: e.queuePosition,
    }))
    .sort((a, b) => b.waitingMinutes - a.waitingMinutes)

  const activeEncounter = mine.find(
    (e) => e.status === "Under Consultation" || (e.status as string) === "In Consultation",
  )
  const active: QueueEntry | undefined = activeEncounter
    ? {
        encounter: activeEncounter,
        isNewPatient: isFirstVisit(activeEncounter, encounters),
        waitingMinutes: minutesSince(arrivalOf(activeEncounter), now),
        position: activeEncounter.queuePosition,
      }
    : undefined

  // ── Alerts ───────────────────────────────────────────────────────────────
  const alerts: LiveAlert[] = []
  const push = (alert: Omit<LiveAlert, "acknowledged">) =>
    alerts.push({ ...alert, acknowledged: Boolean(acknowledged[alert.id]) })

  // ER triage assigned this doctor a patient -- the "call the doctor" signal.
  // Severity follows triage acuity (B1/B2 are the immediate/emergent tiers);
  // clears itself once the doctor accepts (POST /api/er/visits/:id/accept),
  // which is what the alert's own action button does.
  for (const er of erAssignments) {
    const cat = (er.triage_category || "").toUpperCase()
    const patientName = er.is_unknown_patient
      ? er.unknown_patient_label || "Unidentified Patient"
      : [er.patient_name, er.patient_last_name].filter(Boolean).join(" ") || er.visit_no
    push({
      id: buildAlertId("er-assignment", String(er.id), er.doctor_assigned_at || ""),
      kind: "er-assignment",
      severity: cat === "B1" || cat === "B2" ? "critical" : "warning",
      actionable: true,
      title: `ER patient assigned to you — ${patientName}`,
      detail: [
        er.condition_at_arrival,
        er.triage_category ? `Triage ${er.triage_category}` : null,
        er.assigned_specialty,
      ]
        .filter(Boolean)
        .join(" · ") || "No details charted yet.",
      at: er.doctor_assigned_at || new Date().toISOString(),
      patientName,
      umr: er.visit_no,
      refId: String(er.id),
    })
  }

  for (const entry of queue) {
    const e = entry.encounter
    const arrived = arrivalOf(e)

    // The OP nurse has taken baseline observations and sent the patient in.
    // This is the doctor's notification that the patient is physically ready:
    // the visit only reaches "In Queue" via `db.recordVitals`, so the presence
    // of a `vitalsRecorded` stamp is the handover, not a guess.
    const vitalsAt = e.timestamps?.vitalsRecorded
    if (vitalsAt && e.status === "In Queue") {
      const v = e.vitals || {} as typeof e.vitals
      const readings = [
        v.bp && `BP ${v.bp}`,
        v.pulse && `Pulse ${v.pulse}`,
        v.temp && `Temp ${v.temp}`,
        v.spo2 && `SpO2 ${v.spo2}`,
      ]
        .filter(Boolean)
        .join(" · ")
      push({
        id: buildAlertId("vitals-ready", e.id, vitalsAt),
        kind: "vitals-ready",
        severity: "info",
        actionable: true,
        title: `Vitals done — ${e.patientName} is ready for you`,
        detail: [
          readings || "No readings recorded",
          e.timestamps?.vitalsBy ? `by ${e.timestamps.vitalsBy}` : null,
          v.notes || null,
        ]
          .filter(Boolean)
          .join(" · "),
        at: vitalsAt,
        patientName: e.patientName,
        umr: e.umr,
        encounterId: e.id,
      })
    }

    if (entry.waitingMinutes >= LONG_WAIT_MINUTES) {
      push({
        id: buildAlertId(
          "waiting-long",
          e.id,
          String(Math.floor(entry.waitingMinutes / LONG_WAIT_MINUTES)),
        ),
        kind: "waiting-long",
        severity:
          entry.waitingMinutes >= LONG_WAIT_MINUTES * 2
            ? "critical"
            : "warning",
        actionable: true,
        title: `${e.patientName} has been waiting ${entry.waitingMinutes} min`,
        detail: `${e.chiefComplaint || "No chief complaint recorded"} · token ${e.queueToken || "--"}`,
        at: arrived,
        patientName: e.patientName,
        umr: e.umr,
        encounterId: e.id,
      })
    } else {
      push({
        id: buildAlertId("new-patient", e.id, e.status),
        kind: "new-patient",
        severity: "info",
        actionable: true,
        title: `${
          entry.isNewPatient ? "New patient" : "Revisit"
        } appointed to you — ${e.patientName}`,
        detail:
          [e.chiefComplaint, (e.symptoms || []).join(", ")]
            .filter(Boolean)
            .join(" · ") || "No symptoms recorded",
        at: arrived,
        patientName: e.patientName,
        umr: e.umr,
        encounterId: e.id,
      })
    }
  }

  for (const order of labOrders) {
    const critical = order.tests.filter((test) => test.flag === "Critical")
    const abnormal = order.tests.filter(
      (test) => test.flag === "H" || test.flag === "L",
    )
    const resulted = order.tests.filter((test) => test.status === "Completed")
    const lastResultAt = resulted
      .map((test) => test.resultedAt || order.updatedAt)
      .sort()
      .slice(-1)[0]

    if (critical.length) {
      push({
        id: buildAlertId("lab-critical", order.id, String(resulted.length)),
        kind: "lab-critical",
        severity: "critical",
        actionable: true,
        title: `Critical result — ${order.patientName}`,
        detail: critical
          .map((test) =>
            `${test.name}: ${test.result ?? "?"} ${test.resultUnit || ""}`.trim(),
          )
          .join(" · "),
        at: lastResultAt || order.updatedAt,
        patientName: order.patientName,
        umr: order.umr,
        encounterId: order.encounterId,
        refId: order.id,
      })
    } else if (resulted.length) {
      push({
        id: buildAlertId("lab-result", order.id, String(resulted.length)),
        kind: "lab-result",
        severity: abnormal.length ? "warning" : "info",
        actionable: true,
        title: `${
          resulted.length === order.tests.length
            ? "Results ready"
            : "Partial results"
        } — ${order.patientName}`,
        detail: resulted
          .map((test) =>
            `${test.name}: ${test.result ?? "?"} ${test.resultUnit || ""}${
              test.flag ? ` (${test.flag})` : ""
            }`.trim(),
          )
          .join(" · "),
        at: lastResultAt || order.updatedAt,
        patientName: order.patientName,
        umr: order.umr,
        encounterId: order.encounterId,
        refId: order.id,
      })
    } else if (order.status === "Awaiting Billing") {
      const stale = minutesSince(order.createdAt, now) >= STALE_BILLING_MINUTES
      push({
        id: buildAlertId(
          "lab-awaiting-payment",
          order.id,
          stale ? "stale" : "fresh",
        ),
        kind: "lab-awaiting-payment",
        severity: stale ? "warning" : "info",
        actionable: stale,
        title: stale
          ? `${order.patientName} still hasn't paid for their tests`
          : `Investigations sent to reception — ${order.patientName}`,
        detail:
          `${order.tests.map((test) => test.name).join(", ")} · ₹${order.billing.total.toLocaleString("en-IN")}` +
          (stale
            ? ` · waiting ${minutesSince(order.createdAt, now)} min at the billing desk`
            : ""),
        at: order.createdAt,
        patientName: order.patientName,
        umr: order.umr,
        encounterId: order.encounterId,
        refId: order.id,
      })
    } else {
      push({
        id: buildAlertId("lab-in-progress", order.id, order.status),
        kind: "lab-in-progress",
        severity: "info",
        actionable: false,
        title: `Lab ${order.status.toLowerCase()} — ${order.patientName}`,
        detail: order.tests.map((test) => test.name).join(", "),
        at: order.updatedAt,
        patientName: order.patientName,
        umr: order.umr,
        encounterId: order.encounterId,
        refId: order.id,
      })
    }
  }

  for (const rx of prescriptions) {
    const shared = {
      at: rx.verifiedDate || rx.createdAt,
      patientName: rx.patientName,
      umr: rx.uhid,
      refId: rx.id,
    }

    if (rx.status === "Rejected" || rx.status === "Cancelled") {
      push({
        ...shared,
        id: buildAlertId("rx-rejected", rx.id, rx.status),
        kind: "rx-rejected",
        severity: "critical",
        actionable: true,
        title: `Pharmacy ${rx.status.toLowerCase()} the prescription — ${rx.patientName}`,
        detail:
          rx.rejectedReason ||
          rx.verificationNotes ||
          "No reason given. Rewrite or clarify with the pharmacist.",
      })
    } else if (
      rx.status === "Dispensed" ||
      rx.dispensingStatus === "Dispensed"
    ) {
      push({
        ...shared,
        id: buildAlertId("rx-dispensed", rx.id, "dispensed"),
        kind: "rx-dispensed",
        severity: "info",
        actionable: false,
        title: `Medicines dispensed — ${rx.patientName}`,
        detail:
          rx.items.map((item) => item.medicineName).join(", ") || "Dispensed",
      })
    } else if (
      rx.dispensingStatus === "Ready" ||
      rx.status === "Ready For Dispensing"
    ) {
      push({
        ...shared,
        id: buildAlertId("rx-ready", rx.id, "ready"),
        kind: "rx-ready",
        severity: "info",
        actionable: false,
        title: `Medicines ready for collection — ${rx.patientName}`,
        detail:
          rx.items.map((item) => item.medicineName).join(", ") ||
          "Ready at the pharmacy counter",
      })
    }
  }

  alerts.sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 } as const
    if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1
    if (rank[a.severity] !== rank[b.severity])
      return rank[a.severity] - rank[b.severity]
    return new Date(b.at).getTime() - new Date(a.at).getTime()
  })

  // ── Pulse ────────────────────────────────────────────────────────────────
  const waits = queue.map((entry) => entry.waitingMinutes)
  const pulse: ClinicPulse = {
    waiting: queue.length,
    inConsultation: active ? 1 : 0,
    completedToday: countSeenToday(doctor, mine),
    longestWaitMinutes: waits.length ? Math.max(...waits) : 0,
    averageWaitMinutes: waits.length
      ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
      : 0,
    labAwaitingPayment: labOrders.filter(
      (order) => order.status === "Awaiting Billing",
    ).length,
    labInProgress: labOrders.filter(
      (order) =>
        order.status === "Billed" ||
        order.status === "Sample Collected" ||
        order.status === "In Progress",
    ).length,
    resultsReady: labOrders.filter((order) =>
      order.tests.some((test) => test.status === "Completed"),
    ).length,
    rxAwaitingPharmacy: prescriptions.filter(
      (rx) =>
        rx.status !== "Dispensed" &&
        rx.status !== "Rejected" &&
        rx.status !== "Cancelled",
    ).length,
    rxDispensed: prescriptions.filter((rx) => rx.status === "Dispensed").length,
  }

  return {
    alerts,
    actionable: alerts.filter(
      (alert) => alert.actionable && !alert.acknowledged,
    ),
    queue,
    active,
    pulse,
  }
}

// ── Actions the doctor can take straight off the board ───────────────────────

/** Calls a waiting patient in: they become the doctor's active consultation. */
export function callPatientIn(
  encounterId: string,
  doctorName?: string,
): DBOPEncounter | undefined {
  const encounter = db.getEncounterById(encounterId)
  if (!encounter) return undefined

  // Calling a patient in is the moment two other people need to know: the
  // patient, on their own phone, and the OP floor, so the sister can walk them
  // through. Sent as an SMS if the hospital has that switched on -- see
  // `patientMessaging.ts`.
  notifyPatientCalled(
    encounter,
    doctorName || encounter.assignedDoctor || "Your doctor",
  )

  return db.updateEncounter(encounterId, {
    status: "Under Consultation",
    timestamps: {
      ...encounter.timestamps,
      consultationStart:
        encounter.timestamps?.consultationStart ||
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
  })
}

/** Sends the active patient back to the queue without losing their place. */
export function holdPatient(encounterId: string): DBOPEncounter | undefined {
  const encounter = db.getEncounterById(encounterId)
  if (!encounter) return undefined
  return db.updateEncounter(encounterId, { status: "In Queue" })
}

export function acknowledgeAlert(alert: LiveAlert): void {
  DoctorPortalDatabase.acknowledgeAlert(alert.id)
}

export function acknowledgeAll(alerts: LiveAlert[]): void {
  DoctorPortalDatabase.acknowledgeAlerts(
    alerts.filter((alert) => !alert.acknowledged).map((alert) => alert.id),
  )
}

/**
 * Withdraws an investigation the doctor no longer wants. Only offered while the
 * order is still unpaid -- once reception has taken money for it, cancelling is
 * a refund, which is their desk's decision and not the doctor's.
 */
export function withdrawLabOrder(
  order: LabOrder,
  doctor: DoctorAccount,
  reason: string,
): boolean {
  if (order.billing.status === "Paid") return false
  return Boolean(LabOrderDatabase.cancelOrder(order.id, doctor.name, reason))
}

export type { AppPrescription, LabOrder }
