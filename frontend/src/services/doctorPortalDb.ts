import {
  ACTIVE_DOCTORS,
  ACTIVE_SPECIALTIES,
  getDoctorMaster,
  INITIAL_DOCTOR_MASTER,
  type MasterDoctor,
} from "./doctorMaster"
/**
 * Doctor Portal store.
 *
 * Backs the per-doctor portal: the inbox of patients appointed to *this* doctor,
 * and the consultation artefacts the doctor produces for one visit (recorded
 * consultation video, the whiteboard prescription sheet, an uploaded/scanned
 * prescription, and the AI split of that sheet into medicines vs. investigations).
 *
 * Notifications are *derived*, not stored: the OP encounter in `db` is the source
 * of truth for "who has been appointed to whom", so the inbox is recomputed from
 * it on every read and only the read/seen state is persisted here. That way a
 * queue change made anywhere else in the app (reception, queue management, the
 * OP workflow) shows up in the doctor's inbox without a second write path that
 * could drift out of sync.
 */

import { db, DBOPEncounter, DBPatient } from "./db"
import { encounterArrivalIso, encounterArrivalMs } from "./encounterTime"
import type {
  ConsultationNoteSummary,
  TranscriptTurn,
} from "../lib/medicalVoiceAI"

// ── Doctor roster & matching ──────────────────────────────────────────────────

export interface DoctorAccount {
  id: string
  username: string
  name: string
  specialty: string
  room: string
  staffId: string
  qualification: string
}

/**
 * Normalizes a doctor name or title for resilient, typo-tolerant equality checks.
 * Strips "Dr.", punctuation, honorifics, and whitespace collapses.
 */
export function normalizeDoctorName(name?: string | null): string {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(/^dr\.?\s*/i, "")
    .replace(/[.\-_,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Returns true if the doctor field represents an unassigned placeholder. */
export function isUnassignedDoctor(doc?: string | null): boolean {
  if (!doc) return true
  const lower = doc.trim().toLowerCase()
  return (
    lower === "" ||
    lower.includes("unassigned") ||
    lower.includes("assigned by reception") ||
    lower.includes("duty doctor") ||
    lower.includes("duty physician") ||
    lower === "not assigned" ||
    lower === "none"
  )
}

/** Builds the full roster dynamically from doctor master with complete fallback coverage. */
export function getAllDoctorAccounts(): DoctorAccount[] {
  let master: MasterDoctor[] = []
  try {
    master = getDoctorMaster()
  } catch {
    master = INITIAL_DOCTOR_MASTER
  }
  if (!master || master.length === 0) {
    master = INITIAL_DOCTOR_MASTER
  }

  const seenIds = new Set<string>()
  const accounts: DoctorAccount[] = []

  for (const d of master) {
    if (!d || !d.id || seenIds.has(d.id)) continue
    seenIds.add(d.id)
    accounts.push({
      id: d.id,
      username: (d.username || d.id.toLowerCase().replace(/[^a-z0-9]/g, "")).toLowerCase(),
      name: d.name || `Dr. ${d.id}`,
      specialty: d.specialty || "General Medicine",
      room: d.room || "Room 101",
      staffId: d.staffId || d.id,
      qualification: d.qualification || "Consultant Physician",
    })
  }

  // Include any ACTIVE_DOCTORS that weren't captured
  for (const d of ACTIVE_DOCTORS) {
    if (!seenIds.has(d.id)) {
      seenIds.add(d.id)
      accounts.push({
        id: d.id,
        username: (d.username || d.id.toLowerCase().replace(/[^a-z0-9]/g, "")).toLowerCase(),
        name: d.name,
        specialty: d.specialty || "General Medicine",
        room: d.room || "Room 101",
        staffId: d.staffId || d.id,
        qualification: d.qualification || "Consultant Physician",
      })
    }
  }

  return accounts
}

/** Static roster initialized with all doctors in the master. */
export const DOCTOR_ROSTER: DoctorAccount[] = getAllDoctorAccounts()

/**
 * Resiliently checks whether an encounter belongs to a specific doctor.
 * Matches on ID, staff ID, username, exact name, or normalized name / token overlap.
 */
export function doesDoctorMatchEncounter(
  doctor: DoctorAccount | MasterDoctor | { id?: string; name: string; staffId?: string; username?: string },
  encounter: DBOPEncounter,
): boolean {
  if (!doctor || !encounter) return false

  // 1. Direct ID / StaffId / Username match
  const encAssignedId = ((encounter as any).assignedDoctorId || (encounter as any).doctorId || "").trim().toLowerCase()
  if (encAssignedId) {
    if (doctor.id && doctor.id.toLowerCase() === encAssignedId) return true
    if ("staffId" in doctor && doctor.staffId && doctor.staffId.toLowerCase() === encAssignedId) return true
    if ("username" in doctor && doctor.username && doctor.username.toLowerCase() === encAssignedId) return true
  }

  // 2. Doctor Name / Assignment strings
  const encDoc = (encounter.assignedDoctor || (encounter as any).doctorAssigned || "").trim()
  if (isUnassignedDoctor(encDoc)) return false

  // Direct case-insensitive match
  if (doctor.name && encDoc.toLowerCase() === doctor.name.toLowerCase()) return true
  if (doctor.id && encDoc.toLowerCase() === doctor.id.toLowerCase()) return true
  if ("username" in doctor && doctor.username && encDoc.toLowerCase() === doctor.username.toLowerCase()) return true
  if ("staffId" in doctor && doctor.staffId && encDoc.toLowerCase() === doctor.staffId.toLowerCase()) return true

  // Normalized matching (stripping Dr., punctuation, extra spaces)
  const normEnc = normalizeDoctorName(encDoc)
  const normDoc = normalizeDoctorName(doctor.name)
  if (normEnc && normDoc) {
    if (normEnc === normDoc) return true
    if (normEnc.length >= 4 && normDoc.length >= 4) {
      if (normDoc.includes(normEnc) || normEnc.includes(normDoc)) return true
    }
  }

  return false
}

export function getDoctorById(doctorId?: string | null): DoctorAccount {
  if (!doctorId || !doctorId.trim()) {
    return DOCTOR_ROSTER[0] || getAllDoctorAccounts()[0]
  }

  const tid = doctorId.trim()
  const lower = tid.toLowerCase()
  const normTid = normalizeDoctorName(tid)

  // 1. Check in DOCTOR_ROSTER first
  const matchRoster = DOCTOR_ROSTER.find(
    (d) =>
      d.id.toLowerCase() === lower ||
      d.staffId.toLowerCase() === lower ||
      d.username.toLowerCase() === lower ||
      d.name.toLowerCase() === lower ||
      normalizeDoctorName(d.name) === normTid,
  )
  if (matchRoster) return matchRoster

  // 2. Check dynamic accounts from master
  const dynamicAccounts = getAllDoctorAccounts()
  const matchDynamic = dynamicAccounts.find(
    (d) =>
      d.id.toLowerCase() === lower ||
      d.staffId.toLowerCase() === lower ||
      d.username.toLowerCase() === lower ||
      d.name.toLowerCase() === lower ||
      normalizeDoctorName(d.name) === normTid,
  )
  if (matchDynamic) return matchDynamic

  // 3. Substring match across all accounts
  const matchSub = dynamicAccounts.find((d) => {
    const nd = normalizeDoctorName(d.name)
    return nd.length >= 4 && normTid.length >= 4 && (nd.includes(normTid) || normTid.includes(nd))
  })
  if (matchSub) return matchSub

  // 4. Synthesize account for unknown named doctor rather than defaulting to Dr. Varma
  if (/[a-zA-Z]/.test(tid)) {
    const isDocPrefix = /^dr\.?\s*/i.test(tid)
    const displayName = isDocPrefix ? tid : `Dr. ${tid}`
    return {
      id: tid,
      username: tid.toLowerCase().replace(/[^a-z0-9]/g, ""),
      name: displayName,
      specialty: "General Medicine",
      room: "Room 101",
      staffId: tid,
      qualification: "Consultant Physician",
    }
  }

  return DOCTOR_ROSTER[0] || dynamicAccounts[0]
}

export function getDoctorByName(
  name?: string | null,
): DoctorAccount | undefined {
  if (!name || isUnassignedDoctor(name)) return undefined
  const target = name.trim()
  const normTarget = normalizeDoctorName(target)
  const lower = target.toLowerCase()

  const allAccounts = getAllDoctorAccounts()

  const direct = allAccounts.find(
    (d) =>
      d.name.toLowerCase() === lower ||
      (normTarget && normalizeDoctorName(d.name) === normTarget) ||
      d.username.toLowerCase() === lower ||
      d.id.toLowerCase() === lower,
  )
  if (direct) return direct

  if (normTarget.length >= 4) {
    const sub = allAccounts.find((d) => {
      const nd = normalizeDoctorName(d.name)
      return nd.length >= 4 && (nd.includes(normTarget) || normTarget.includes(nd))
    })
    if (sub) return sub
  }

  return undefined
}

/** Resolves the doctor a session belongs to, from whatever the login handed back. */
export function resolveDoctorAccount(hint?: {
  doctorId?: string | null
  username?: string | null
  name?: string | null
}): DoctorAccount {
  if (!hint) return DOCTOR_ROSTER[0] || getAllDoctorAccounts()[0]

  if (hint.doctorId) {
    const byId = getDoctorById(hint.doctorId)
    if (byId && byId.id === hint.doctorId) return byId
  }

  if (hint.username) {
    const u = hint.username.trim().toLowerCase()
    const all = getAllDoctorAccounts()
    const byUser = all.find((d) => d.username === u || d.id.toLowerCase() === u)
    if (byUser) return byUser
  }

  if (hint.name) {
    const byName = getDoctorByName(hint.name)
    if (byName) return byName
  }

  if (hint.doctorId) {
    return getDoctorById(hint.doctorId)
  }

  return DOCTOR_ROSTER[0] || getAllDoctorAccounts()[0]
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DoctorNotification {
  id: string
  doctorId: string
  encounterId: string
  umr: string
  patientName: string
  age: number
  sex: string
  phone: string
  opNumber: string
  dept: string
  room: string
  token: string
  queuePosition: number
  isNewPatient: boolean
  chiefComplaint: string
  symptoms: string[]
  aiConfidence: number
  aiReasoning?: string
  vitals: DBOPEncounter["vitals"]
  status: DBOPEncounter["status"]
  arrivedAt: string
  /** Who took the baseline vitals at the OP nurse station, and when. */
  vitalsBy?: string
  vitalsAt?: string
  read: boolean
}

export interface ParsedMedication {
  name: string
  strength: string
  dosage: string
  frequency: string
  route: string
  duration: string
  instructions: string
  quantity: number
}

export interface ParsedLabTest {
  name: string
  category: string
  urgency: "Routine" | "STAT" | string
}

export interface ConsultationAttachment {
  name: string
  type: string
  size: number
  /** Session-scoped blob URL. Absent after a reload -- see the note on video below. */
  objectUrl?: string
  /** Persisted preview (images only, downscaled). Videos are never inlined. */
  dataUrl?: string
  recordedAt: string
}

export type DispatchState = "Draft" | "Dispatched"

export interface ConsultationRecord {
  id: string
  encounterId: string
  umr: string
  patientName: string
  opNumber: string
  doctorId: string
  doctorName: string
  department: string
  createdAt: string
  updatedAt: string

  /** Recorded/uploaded consultation video (metadata persisted, bytes are not). */
  video?: ConsultationAttachment
  /** The whiteboard sheet the doctor wrote the prescription on, as a PNG data URL. */
  whiteboardImage?: string
  /** A photographed/scanned prescription the doctor uploaded instead of writing one. */
  uploadedPrescription?: ConsultationAttachment

  /**
   * The spoken consultation: separated doctor/patient turns and the clinical
   * note summarised from them.
   *
   * This is the history-and-advice record, never a source of orders -- a doctor
   * does not dictate a prescription at the patient, so nothing in here reaches
   * the pharmacy or the lab. The audio itself is not persisted (same quota
   * reasoning as `video`); the transcript is the clinical artefact worth keeping.
   */
  voice?: {
    turns: TranscriptTurn[]
    summary: ConsultationNoteSummary
    durationSeconds: number
    recordedAt: string
  }

  /** The single prescription sheet, as text, before it was split. */
  rawText: string
  /** Which engine produced the split: the LLM, keyword fallback, or the doctor by hand. */
  aiEngine: string
  diagnosis: string
  advice: string
  summary: string
  medications: ParsedMedication[]
  labTests: ParsedLabTest[]
  /** Lines the split could not confidently place -- the doctor files these by hand. */
  unclassified: string[]

  dispatch: DispatchState
  dispatchedAt?: string
  prescriptionId?: string
  labOrderId?: string
}

// ── Storage ──────────────────────────────────────────────────────────────────

const READ_NOTIFICATIONS_KEY = "hospai_doctor_portal_read_v1"
const CONSULTATIONS_KEY = "hospai_doctor_consultations_v1"
const ACKNOWLEDGED_ALERTS_KEY = "hospai_doctor_acked_alerts_v1"
const CHANNEL_NAME = "hospai_doctor_portal"

const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined")
    return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = () => listeners.forEach((fn) => fn())
  }
  return channel
}

function notify(broadcast = true) {
  listeners.forEach((fn) => fn())
  if (broadcast) ensureChannel()?.postMessage("changed")
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    // Quota is the realistic failure here (whiteboard PNGs and Rx photos are the
    // bulk of it). Report it rather than silently dropping clinical content.
    console.error("Doctor portal: could not persist", key, err)
    return false
  }
}

// ── Notifications (derived from the OP encounter queue) ──────────────────────

/** Statuses that indicate a patient visit has completed or been concluded. */
export const CLOSED_STATUSES = new Set<string>([
  "Consultation Completed",
  "Post-Consultation",
  "Awaiting Billing",
  "Billing Completed",
  "OP Completed",
  "Discharged",
  "Cancelled",
])

/** Whether an encounter is still active / open for clinical consultation. */
export function isEncounterOpen(status?: string | null): boolean {
  if (!status) return true
  return !CLOSED_STATUSES.has(status)
}

/** Statuses that mean the patient is still the doctor's to see (backward compatibility). */
export const OPEN_STATUSES: DBOPEncounter["status"][] = [
  "Registered",
  "Symptoms Captured",
  "AI Recommended",
  "Awaiting Doctor",
  "Doctor Assigned",
  "In Queue",
  "Under Consultation",
  "Vitals Recorded",
  "Awaiting Consultation",
]

/**
 * Whether this visit gets an admit card (new patient) or a prior-history panel.
 *
 * Two sources have to agree: the visit index (is there an earlier encounter for
 * this UMR?) and how reception registered them (`encounter.isNew`). Reception's
 * flag is authoritative for "not new" -- a patient whose earlier visits predate
 * this store, or were seen at another site, is still a revisit even though the
 * local index has nothing before today.
 */
export function isFirstVisit(
  encounter: DBOPEncounter,
  allEncounters?: DBOPEncounter[],
): boolean {
  if (encounter.isNew === false) return false
  const history = (allEncounters || db.getEncounters()).filter(
    (e) => e.umr.toUpperCase() === encounter.umr.toUpperCase(),
  )
  if (history.length <= 1) return true
  const at = (e: DBOPEncounter) => encounterArrivalMs(e) ?? Number.MAX_SAFE_INTEGER
  const earliest = history.reduce((a, b) => (at(a) <= at(b) ? a : b))
  return earliest.id === encounter.id
}

export class DoctorPortalDatabase {
  static subscribe(listener: () => void): () => void {
    listeners.add(listener)
    ensureChannel()
    const unsubDb = db.subscribe(() => listener())
    return () => {
      listeners.delete(listener)
      unsubDb()
    }
  }

  // ── Inbox ──────────────────────────────────────────────────────────────────

  private static getReadIds(): string[] {
    return readJson<string[]>(READ_NOTIFICATIONS_KEY, [])
  }

  /**
   * Every patient currently appointed to this doctor, newest arrival first.
   * Pass `includeClosed` to also list visits this doctor has already finished.
   */
  static getNotifications(
    doctorId: string,
    includeClosed = false,
  ): DoctorNotification[] {
    const doctor = getDoctorById(doctorId)
    const encounters = db.getEncounters()
    const readIds = new Set(this.getReadIds())

    return encounters
      .filter((e) => doesDoctorMatchEncounter(doctor, e))
      .filter((e) => includeClosed || isEncounterOpen(e.status))
      .map<DoctorNotification>((e) => ({
        id: `NOTIF-${e.id}`,
        doctorId: doctor.id,
        encounterId: e.id,
        umr: e.umr,
        patientName: e.patientName,
        age: e.age,
        sex: e.sex,
        phone: e.phone,
        opNumber: e.opNumber,
        dept: e.dept || doctor.specialty,
        room: e.room || doctor.room,
        token: e.queueToken,
        queuePosition: e.queuePosition,
        isNewPatient: isFirstVisit(e, encounters),
        chiefComplaint: e.chiefComplaint,
        symptoms: e.symptoms || [],
        aiConfidence: e.aiConfidence,
        aiReasoning: e.aiReasoning,
        vitals: e.vitals,
        status: e.status,
        arrivedAt: encounterArrivalIso(e) || e.timestamps?.arrival || e.registrationTime,
        vitalsBy: e.timestamps?.vitalsBy,
        vitalsAt: e.timestamps?.vitalsRecorded,
        read: readIds.has(`NOTIF-${e.id}`),
      }))
      .sort((a, b) => (Date.parse(b.arrivedAt) || 0) - (Date.parse(a.arrivedAt) || 0))
  }

  /**
   * Patients waiting in this doctor's own department who have **no doctor
   * assigned yet**, newest arrival first.
   *
   * Registration deliberately does not pick a doctor -- `createNewPatientEncounter`
   * and `createRevisitEncounter` both write `assignedDoctor: ""` and leave the
   * choice to triage.
   */
  static getUnassigned(doctorId: string): DoctorNotification[] {
    const doctor = getDoctorById(doctorId)
    const encounters = db.getEncounters()
    const readIds = new Set(this.getReadIds())

    return (
      encounters
        .filter((e) => isUnassignedDoctor(e.assignedDoctor || (e as any).doctorAssigned))
        .filter((e) => isEncounterOpen(e.status))
        // Same specialty, not yet triaged into one -- or in a department that has
        // no bookable consultant at all, which would otherwise leave the patient
        // visible to nobody.
        .filter((e) => {
          const dept = (e.dept || "").trim()
          if (!dept || dept === "Awaiting Triage" || dept === doctor.specialty)
            return true
          return !ACTIVE_SPECIALTIES.includes(dept)
        })
        .map<DoctorNotification>((e) => ({
          id: `NOTIF-${e.id}`,
          doctorId: doctor.id,
          encounterId: e.id,
          umr: e.umr,
          patientName: e.patientName,
          age: e.age,
          sex: e.sex,
          phone: e.phone,
          opNumber: e.opNumber,
          dept: e.dept,
          room: e.room || doctor.room,
          token: e.queueToken,
          queuePosition: e.queuePosition,
          isNewPatient: isFirstVisit(e, encounters),
          chiefComplaint: e.chiefComplaint,
          symptoms: e.symptoms || [],
          aiConfidence: e.aiConfidence,
          aiReasoning: e.aiReasoning,
          vitals: e.vitals,
          status: e.status,
          arrivedAt: encounterArrivalIso(e) || e.timestamps?.arrival || e.registrationTime,
          vitalsBy: e.timestamps?.vitalsBy,
          vitalsAt: e.timestamps?.vitalsRecorded,
          read: readIds.has(`NOTIF-${e.id}`),
        }))
        .sort((a, b) => (Date.parse(b.arrivedAt) || 0) - (Date.parse(a.arrivedAt) || 0))
    )
  }

  /**
   * Take an unassigned patient. Refuses one already assigned to someone else,
   * so two doctors claiming at once cannot silently steal the patient from
   * whoever got there first.
   */
  static claimEncounter(doctorId: string, encounterId: string): {
    ok: boolean
    message: string
  } {
    const doctor = getDoctorById(doctorId)
    const encounter = db.getEncounters().find((e) => e.id === encounterId)
    if (!encounter)
      return { ok: false, message: "That visit no longer exists." }

    const current = (encounter.assignedDoctor || (encounter as any).doctorAssigned || "").trim()
    if (current && !isUnassignedDoctor(current) && !doesDoctorMatchEncounter(doctor, encounter)) {
      return {
        ok: false,
        message: `${encounter.patientName} was just taken by ${current}.`,
      }
    }

    db.updateEncounter(encounterId, {
      assignedDoctor: doctor.name,
      doctorAssigned: doctor.name,
      assignedDoctorId: doctor.id,
      doctorId: doctor.id,
      dept:
        encounter.dept && encounter.dept !== "Awaiting Triage"
          ? encounter.dept
          : doctor.specialty,
      room: encounter.room || doctor.room,
      status:
        encounter.status === "Under Consultation"
          ? encounter.status
          : "In Queue",
    } as any)
    notify()
    return {
      ok: true,
      message: `${encounter.patientName} added to your queue.`,
    }
  }

  static getUnreadCount(doctorId: string): number {
    return this.getNotifications(doctorId).filter((n) => !n.read).length
  }

  static markRead(notificationIds: string[]): void {
    if (!notificationIds.length) return
    const merged = Array.from(
      new Set([...this.getReadIds(), ...notificationIds]),
    )
    writeJson(READ_NOTIFICATIONS_KEY, merged)
    notify()
  }

  static markAllRead(doctorId: string): void {
    this.markRead(this.getNotifications(doctorId).map((n) => n.id))
  }

  // ── Patient context ────────────────────────────────────────────────────────

  /**
   * What the doctor needs before opening their mouth: the patient record, every
   * prior visit with its diagnosis/medication/investigations, and whether this is
   * a first visit (admit card) or a revisit (history panel).
   */
  static getPatientContext(umr: string, currentEncounterId?: string): {
    patient?: DBPatient
    currentVisit?: DBOPEncounter
    previousVisits: DBOPEncounter[]
    consultations: ConsultationRecord[]
    isNewPatient: boolean
  } {
    const patient = db.getPatientByUmr(umr)
    const visits = db
      .getEncountersForPatient(umr)
      .sort(
        (a, b) =>
          new Date(b.timestamps?.arrival || b.registrationTime).getTime() -
          new Date(a.timestamps?.arrival || a.registrationTime).getTime(),
      )
    const currentVisit = currentEncounterId
      ? (visits.find((v) => v.id === currentEncounterId) || db.getEncounterById(currentEncounterId))
      : visits[0]
    const previousVisits = visits.filter((v) => v.id !== currentVisit?.id)

    return {
      patient,
      currentVisit,
      previousVisits,
      consultations: this.getConsultationsForPatient(umr).filter(
        (c) => c.encounterId !== currentVisit?.id,
      ),
      isNewPatient: currentVisit
        ? isFirstVisit(currentVisit, visits)
        : previousVisits.length === 0,
    }
  }

  // ── Consultations ──────────────────────────────────────────────────────────

  static getConsultations(): ConsultationRecord[] {
    return readJson<ConsultationRecord[]>(CONSULTATIONS_KEY, [])
  }

  static getConsultationsForPatient(umr: string): ConsultationRecord[] {
    const normalized = umr.toUpperCase()
    return this.getConsultations()
      .filter((c) => c.umr.toUpperCase() === normalized)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  }

  static getConsultationForEncounter(
    encounterId: string,
  ): ConsultationRecord | undefined {
    return this.getConsultations().find((c) => c.encounterId === encounterId)
  }

  /** Creates the record for an encounter if it doesn't exist yet, then returns it. */
  static openConsultation(
    encounter: DBOPEncounter,
    doctor: DoctorAccount,
  ): ConsultationRecord {
    const existing = this.getConsultationForEncounter(encounter.id)
    if (existing) return existing

    const now = new Date().toISOString()
    const record: ConsultationRecord = {
      id: `CONS-${Date.now().toString(36).toUpperCase()}`,
      encounterId: encounter.id,
      umr: encounter.umr,
      patientName: encounter.patientName,
      opNumber: encounter.opNumber,
      doctorId: doctor.id,
      doctorName: doctor.name,
      department: encounter.dept || doctor.specialty,
      createdAt: now,
      updatedAt: now,
      rawText: "",
      aiEngine: "",
      diagnosis: encounter.diagnosis || "",
      advice: encounter.advice || "",
      summary: "",
      medications: [],
      labTests: [],
      unclassified: [],
      dispatch: "Draft",
    }
    writeJson(CONSULTATIONS_KEY, [record, ...this.getConsultations()])
    notify()
    return record
  }

  static saveConsultation(record: ConsultationRecord): ConsultationRecord {
    const updated = { ...record, updatedAt: new Date().toISOString() }
    const all = this.getConsultations()
    const index = all.findIndex((c) => c.id === record.id)
    if (index >= 0) all[index] = updated
    else all.unshift(updated)
    writeJson(CONSULTATIONS_KEY, all)
    notify()
    return updated
  }

  static updateConsultation(
    id: string,
    updates: Partial<ConsultationRecord>,
  ): ConsultationRecord | undefined {
    const record = this.getConsultations().find((c) => c.id === id)
    if (!record) return undefined
    return this.saveConsultation({ ...record, ...updates })
  }

  // ── Live alert acknowledgement ─────────────────────────────────────────────
  // Alerts on the live board are derived from other stores on every read, so
  // "I have seen this" cannot live on the alert itself. It is kept here as a
  // set of alert ids the doctor has cleared, keyed by a stable id built from
  // the underlying record (see buildAlertId in doctorLiveFeed.ts) so the same
  // alert stays cleared across reloads and does not resurface.

  static getAcknowledgedAlerts(): Record<string, string> {
    return readJson<Record<string, string>>(ACKNOWLEDGED_ALERTS_KEY, {})
  }

  static acknowledgeAlert(alertId: string): void {
    writeJson(ACKNOWLEDGED_ALERTS_KEY, {
      ...this.getAcknowledgedAlerts(),
      [alertId]: new Date().toISOString(),
    })
    notify()
  }

  static acknowledgeAlerts(alertIds: string[]): void {
    if (!alertIds.length) return
    const now = new Date().toISOString()
    const merged = { ...this.getAcknowledgedAlerts() }
    for (const id of alertIds) merged[id] = now
    writeJson(ACKNOWLEDGED_ALERTS_KEY, merged)
    notify()
  }
}

// ── Attachment helpers ───────────────────────────────────────────────────────

/**
 * Downscales an image to something a browser's localStorage can actually hold.
 * A 12MP phone photo of a prescription is ~4MB of base64 -- past the whole quota
 * on its own -- while 1400px wide at JPEG q0.72 is legible and ~200KB.
 */
/**
 * Reads a prescription the doctor picked off disk into something the portal can
 * both show and send for OCR.
 *
 * Images are downscaled -- a modern phone photo is several megabytes and the
 * whole consultation record lives in localStorage. A PDF cannot go through a
 * canvas at all, so it is read as-is and flagged, and the caller shows a file
 * card rather than an `<img>` that would silently render nothing. Anything that
 * fails to decode as an image is treated the same way rather than thrown away:
 * the server-side OCR may still read it, and a doctor who attached a sheet
 * should never be left looking at a screen that quietly dropped it.
 */
export async function readPrescriptionFile(
  file: File,
): Promise<{ dataUrl: string ;kind: "image" | "document" }> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
  if (!isPdf) {
    try {
      return { dataUrl: await compressImageFile(file), kind: "image" }
    } catch {
      // Fall through: keep the bytes, let the OCR service have a go at them.
    }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error("Could not read the selected file."))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
  return { dataUrl, kind: "document" }
}

export function compressImageFile(
  file: File,
  maxWidth = 1400,
  quality = 0.72,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error("Could not read the selected file."))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () =>
        reject(new Error("That file could not be read as an image."))
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          reject(new Error("Canvas is unavailable in this browser."))
          return
        }
        ctx.fillStyle = "#FFFFFF"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg", quality))
      }
      img.src = (reader.result as string)
    }
    reader.readAsDataURL(file)
  })
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}
