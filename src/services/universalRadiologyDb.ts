/**
 * Universal Radiology Center - Unified Operational Data & Workflow Service
 *
 * Implements authoritative state management for:
 * - Examination Scheduling & Room Suite Management
 * - Operational Scanning & Readiness
 * - Centralized Exception Queue
 * - Staff Assignments & Role Scopes
 * - Real-time Department Audit & Turnaround-Time (TAT) Analytics
 */

import { BillingDatabase, RadiologyStudyRecord } from "./billingDb"
import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "./radiologyWorkflowDb"
import { db } from "./db"
import { RADIOLOGY_MODALITIES } from "./radiologyTariffsData"
import { getCanonicalRadiologyModality } from "../utils/testClassifier"

/**
 * Safely parses any date, time, or timestamp into a valid ISO string.
 * Handles full ISO strings, bullet dates, time-only strings ("04:30 PM"),
 * timestamps, and invalid data without ever throwing RangeError.
 */
export function safeToIsoDate(raw: any, fallbackDateStr?: string): string {
  try {
    if (!raw) {
      return fallbackDateStr && !isNaN(new Date(fallbackDateStr).getTime())
        ? new Date(fallbackDateStr).toISOString()
        : new Date().toISOString()
    }

    if (typeof raw === "number") {
      if (isNaN(raw) || raw <= 0) return new Date().toISOString()
      const ms = raw < 10000000000 ? raw * 1000 : raw
      const d = new Date(ms)
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
    }

    if (typeof raw === "string") {
      let trimmed = raw.trim()
      if (!trimmed) return new Date().toISOString()

      // Replace bullet separators
      trimmed = trimmed.replace(/[•·]/g, " ").replace(/\s+/g, " ")

      // 1. Direct Date constructor
      const d = new Date(trimmed)
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
        return d.toISOString()
      }

      // 2. Numeric string?
      const num = Number(trimmed)
      if (!isNaN(num) && num > 1000000000) {
        const ms = num < 10000000000 ? num * 1000 : num
        const dNum = new Date(ms)
        if (!isNaN(dNum.getTime())) return dNum.toISOString()
      }

      // 3. Time-only string (e.g. "04:30 PM", "16:30", "9:15 AM")
      const baseDate = fallbackDateStr && /^\d{4}-\d{2}-\d{2}/.test(fallbackDateStr)
        ? fallbackDateStr.slice(0, 10)
        : new Date().toISOString().split("T")[0]

      const combined = new Date(`${baseDate} ${trimmed}`)
      if (!isNaN(combined.getTime())) {
        return combined.toISOString()
      }

      const matchTime = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
      if (matchTime) {
        let hours = parseInt(matchTime[1], 10)
        const minutes = parseInt(matchTime[2], 10)
        const seconds = matchTime[3] ? parseInt(matchTime[3], 10) : 0
        const ampm = (matchTime[4] || "").toUpperCase()
        if (ampm === "PM" && hours < 12) hours += 12
        if (ampm === "AM" && hours === 12) hours = 0
        const dTime = new Date(`${baseDate}T00:00:00`)
        dTime.setHours(hours, minutes, seconds, 0)
        if (!isNaN(dTime.getTime())) {
          return dTime.toISOString()
        }
      }
    }
  } catch {}

  return new Date().toISOString()
}

export function safeToTimestamp(raw: any, fallbackDateStr?: string): number {
  try {
    const iso = safeToIsoDate(raw, fallbackDateStr)
    const t = new Date(iso).getTime()
    return isNaN(t) ? Date.now() : t
  } catch {
    return Date.now()
  }
}

export type RadiologyAppointmentStatus =
  | "Scheduled"
  | "Checked In"
  | "In Progress"
  | "Completed"
  | "Cancelled"
  | "No Show"

export interface RadiologyAppointment {
  id: string
  studyId: string
  patientId?: string
  patientName: string
  umr: string
  encounterId?: string
  modality: string
  studyName: string
  scheduledDate: string // YYYY-MM-DD
  scheduledTime: string // HH:MM
  durationMinutes: number
  room: string
  suiteId?: string
  technicianId?: string
  technicianName: string
  status: RadiologyAppointmentStatus
  priority: "Routine" | "Urgent" | "STAT"
  prepInstructions?: string
  notes?: string
  cancelledReason?: string
  createdAt: string
  updatedAt: string
}

export type SuiteOperationalStatus = "Available" | "In Use" | "Maintenance" | "Offline" | "Out of Service"

export interface RadiologySuite {
  id: string
  code: string
  name: string
  room: string
  modality: string
  status: SuiteOperationalStatus
  currentStudyId?: string
  currentPatient?: string
  currentStudyName?: string
  utilization?: string
  notes?: string
  maintenanceExpectedUntil?: string
}

export type ExceptionCategory =
  | "Missing Approved Template"
  | "Ambiguous Template Mapping"
  | "Incomplete Examination"
  | "Scheduling Conflict"
  | "Equipment Down"
  | "Staff Assignment Conflict"
  | "Billing Status Inconsistency"
  | "Missing Patient Linkage"
  | "Report Overdue"
  | "AI Service Anomaly"

export type ExceptionSeverity = "Critical" | "High" | "Medium" | "Low"

export interface RadiologyException {
  id: string
  category: ExceptionCategory
  severity: ExceptionSeverity
  studyId?: string
  patientName?: string
  umr?: string
  description: string
  timestamp: string
  assignedOwner: string
  status: "Open" | "In Progress" | "Resolved"
  resolutionNotes?: string
  resolvedBy?: string
  resolvedAt?: string
}

export interface RadiologyAuditEvent {
  id: string
  timestamp: string
  studyId?: string
  patientName?: string
  umr?: string
  studyName?: string
  action: string
  actor: string
  role: string
  details: string
  severity?: "Info" | "Warning" | "Critical"
}

const STORAGE_KEY_APPOINTMENTS = "hospai_rad_appointments_v1"
const STORAGE_KEY_SUITES = "hospai_rad_suites_v2"
const STORAGE_KEY_EXCEPTIONS = "hospai_rad_exceptions_v1"
const STORAGE_KEY_AUDIT = "hospai_rad_audit_v1"
const RAD_CHANNEL = "hospai_universal_radiology_channel"

const INITIAL_SUITES: RadiologySuite[] = [
  { id: "suite_xr_1", code: "XR-01", name: "Digital X-Ray Suite 1", room: "Room 101", modality: "X-Ray", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_xr_2", code: "XR-02", name: "Digital X-Ray Suite 2", room: "Room 102", modality: "X-Ray", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_ct_1", code: "CT-01", name: "64-Slice High-Speed CT", room: "CT Gantry 1", modality: "CT Scan", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_ct_2", code: "CT-02", name: "128-Slice Dual-Source CT", room: "CT Gantry 2", modality: "CT Scan", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_mr_1", code: "MR-01", name: "3.0T High-Field MRI", room: "MRI Suite 1", modality: "MRI", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_us_1", code: "US-01", name: "4D Color Ultrasound Suite", room: "USG Room A", modality: "Ultrasound (USG)", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_dop_1", code: "DOP-01", name: "Vascular Doppler Suite", room: "USG Room B", modality: "Doppler", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_mam_1", code: "MAM-01", name: "Digital Breast Tomosynthesis", room: "Mammo Suite", modality: "Mammography", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_fl_1", code: "FL-01", name: "Digital Fluoroscopy & Contrast", room: "Room 105", modality: "Fluoroscopy / Contrast", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_nm_1", code: "NM-01", name: "PET-CT & SPECT Imaging", room: "Nuclear Med Bay", modality: "Nuclear Medicine", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_dexa_1", code: "DEXA-01", name: "Bone Densitometry Unit", room: "DEXA Lab", modality: "DEXA", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_dnt_1", code: "DNT-01", name: "Dental CBCT / OPG Suite", room: "Dental X-Ray", modality: "Dental", status: "Available", utilization: "Ready for Next Patient" },
  { id: "suite_ir_1", code: "IR-01", name: "Interventional Angio / Cath Suite", room: "Cath Lab 2", modality: "Interventional Radiology", status: "Available", utilization: "Ready for Next Patient" },
]

export class UniversalRadiologyDb {
  private static listeners: Set<() => void> = new Set()
  private static channel: BroadcastChannel | null = null
  private static channel2: BroadcastChannel | null = null

  private static initChannel() {
    if (typeof window === "undefined") return
    if (!this.channel) {
      try {
        this.channel = new BroadcastChannel(RAD_CHANNEL)
        this.channel.onmessage = () => this.notify(false)
      } catch {}
    }
    if (!this.channel2) {
      try {
        this.channel2 = new BroadcastChannel("hospai_rad_channel")
        this.channel2.onmessage = () => this.notify(false)
      } catch {}
    }
  }

  public static subscribe(fn: () => void): () => void {
    this.initChannel()
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  public static notify(broadcast = true) {
    this.listeners.forEach((fn) => {
      try { fn() } catch {}
    })
    if (broadcast) {
      try { this.channel?.postMessage("refresh") } catch {}
      try { this.channel2?.postMessage("refresh") } catch {}
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hospai_rad_updated"))
      }
    }
  }

  // ── Equipment Suites ──────────────────────────────────────────────────────────
  public static getSuites(): RadiologySuite[] {
    let rawSuites: RadiologySuite[] = []
    try {
      const data = localStorage.getItem(STORAGE_KEY_SUITES)
      if (data) rawSuites = JSON.parse(data)
    } catch {}

    if (!rawSuites || rawSuites.length === 0) {
      rawSuites = INITIAL_SUITES
      this.saveSuites(rawSuites)
    }

    // Reconcile dynamically with actual active scanning examinations in RadiologyWorkflowDb
    const activeStudies = RadiologyWorkflowDb.getStudies().filter((s) => {
      if (s.status === "Cancelled" || (s as any).workflowStatus === "CANCELLED") return false
      const status = s.normalizedStatus || s.status
      return (
        status === "IN PROGRESS" ||
        status === "In Progress" ||
        (s as any).scanningStage === 2 ||
        (s as any).workflowStatus === "IN_PROGRESS"
      ) && status !== "DONE"
    })

    const updated = rawSuites.map((suite) => {
      // Respect persisted maintenance and offline equipment statuses
      if (suite.status === "Maintenance" || suite.status === "Offline" || suite.status === "Out of Service") {
        return {
          ...suite,
          utilization: suite.status === "Maintenance" ? "Scheduled Maintenance" : "Equipment Offline / Unserviceable",
        }
      }

      // Check if any actively scanning study is mapped to this suite
      const occupyingStudy = activeStudies.find(
        (s) =>
          (s as any).suiteId === suite.id ||
          (s.room &&
            (s.room.toLowerCase() === suite.room.toLowerCase() ||
             s.room.toLowerCase() === suite.code.toLowerCase() ||
             s.room.toLowerCase() === suite.name.toLowerCase()))
      ) || activeStudies.find((s) => {
        // Fallback match by modality if study room isn't explicit
        const mod = getCanonicalRadiologyModality(s)
        return mod === suite.modality && !activeStudies.some(o => (o as any).suiteId === suite.id)
      })

      if (occupyingStudy) {
        return {
          ...suite,
          status: "In Use" as SuiteOperationalStatus,
          currentStudyId: occupyingStudy.id,
          currentPatient: occupyingStudy.patient,
          currentStudyName: occupyingStudy.study,
          utilization: `Active Scan: ${occupyingStudy.patient} (${occupyingStudy.study})`,
        }
      }

      return {
        ...suite,
        status: "Available" as SuiteOperationalStatus,
        currentStudyId: undefined,
        currentPatient: undefined,
        currentStudyName: undefined,
        utilization: "Ready for Next Patient",
      }
    })

    return updated
  }

  public static saveSuites(suites: RadiologySuite[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_SUITES, JSON.stringify(suites))
      this.notify()
    } catch {}
  }

  public static occupySuiteForStudy(studyId: string, roomOrModality?: string): void {
    try {
      const suites = this.getSuites().map((s) => {
        const match =
          s.currentStudyId === studyId ||
          (roomOrModality &&
            (s.room.toLowerCase() === roomOrModality.toLowerCase() ||
             s.code.toLowerCase() === roomOrModality.toLowerCase() ||
             s.name.toLowerCase() === roomOrModality.toLowerCase() ||
             s.modality.toLowerCase() === roomOrModality.toLowerCase()))
        if (match && s.status !== "Maintenance" && s.status !== "Offline" && s.status !== "Out of Service") {
          return {
            ...s,
            status: "In Use" as SuiteOperationalStatus,
            currentStudyId: studyId,
          }
        }
        return s
      })
      this.saveSuites(suites)
    } catch {}
  }

  public static releaseSuiteForStudy(studyId: string): void {
    try {
      const suites = this.getSuites().map((s) => {
        if (s.currentStudyId === studyId && s.status !== "Maintenance" && s.status !== "Offline" && s.status !== "Out of Service") {
          return {
            ...s,
            status: "Available" as SuiteOperationalStatus,
            currentStudyId: undefined,
            currentPatient: undefined,
            currentStudyName: undefined,
            utilization: "Ready for Next Patient",
          }
        }
        return s
      })
      this.saveSuites(suites)
    } catch {}
  }

  public static updateSuiteStatus(id: string, status: SuiteOperationalStatus, notes?: string): void {
    const suites = this.getSuites().map((s) => {
      if (s.id === id) {
        return {
          ...s,
          status,
          notes: notes !== undefined ? notes : s.notes,
          utilization: status === "Available" ? "Ready for Next Patient" : status === "Maintenance" ? "Scheduled Maintenance" : status === "Offline" ? "Equipment Offline" : s.utilization
        }
      }
      return s
    })
    this.saveSuites(suites)
    this.logAudit({
      action: "Suite Status Changed",
      actor: "System / In-Charge",
      role: "Radiology Supervisor",
      details: `Equipment suite ${id} status transitioned to '${status}'`
    })
  }

  // ── Appointments & Scheduling ─────────────────────────────────────────────────
  public static getAppointments(): RadiologyAppointment[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_APPOINTMENTS)
      if (data) return JSON.parse(data)
    } catch {}
    return []
  }

  public static saveAppointments(appts: RadiologyAppointment[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_APPOINTMENTS, JSON.stringify(appts))
      this.notify()
    } catch {}
  }

  public static createAppointment(appt: Omit<RadiologyAppointment, "id" | "createdAt" | "updatedAt">): RadiologyAppointment {
    const appts = this.getAppointments()
    const newAppt: RadiologyAppointment = {
      ...appt,
      id: `RAD-APT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    appts.push(newAppt)
    this.saveAppointments(appts)

    // Update study in BillingDatabase if linked
    if (newAppt.studyId) {
      try {
        BillingDatabase.updateRadiologyStudy(newAppt.studyId, {
          room: newAppt.room,
        })
      } catch {}
    }

    this.logAudit({
      studyId: newAppt.studyId,
      patientName: newAppt.patientName,
      action: "Appointment Scheduled",
      actor: newAppt.technicianName || "Reception Desk",
      role: "Radiology Coordinator",
      details: `Scheduled ${newAppt.studyName} (${newAppt.modality}) on ${newAppt.scheduledDate} at ${newAppt.scheduledTime} in ${newAppt.room}`
    })

    return newAppt
  }

  public static updateAppointmentStatus(id: string, status: RadiologyAppointmentStatus, cancelReason?: string): void {
    const appts = this.getAppointments().map((a) => {
      if (a.id === id) {
        return {
          ...a,
          status,
          cancelledReason: cancelReason || a.cancelledReason,
          updatedAt: new Date().toISOString(),
        }
      }
      return a
    })
    this.saveAppointments(appts)
  }

  // ── Exceptions Queue ──────────────────────────────────────────────────────────
  public static getExceptions(): RadiologyException[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_EXCEPTIONS)
      if (data) {
        const stored: RadiologyException[] = JSON.parse(data)
        const derived = this.deriveExceptionsFromLiveStudies()
        // Merge derived with stored, resolving those whose underlying condition disappeared
        const merged = [...stored]
        derived.forEach((d) => {
          if (!merged.some((m) => m.id === d.id || (m.studyId === d.studyId && m.category === d.category))) {
            merged.push(d)
          }
        })
        return merged
      }
    } catch {}

    const derived = this.deriveExceptionsFromLiveStudies()
    this.saveExceptions(derived)
    return derived
  }

  public static saveExceptions(exceptions: RadiologyException[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_EXCEPTIONS, JSON.stringify(exceptions))
      this.notify()
    } catch {}
  }

  public static createException(ex: Omit<RadiologyException, "id" | "timestamp" | "status">): RadiologyException {
    const list = this.getExceptions()
    
    // Avoid duplicate exceptions when the same unresolved issue is detected repeatedly
    if (ex.studyId && ex.category) {
      const existing = list.find(
        (e) => e.studyId === ex.studyId && e.category === ex.category && e.status !== "Resolved"
      )
      if (existing) {
        return existing
      }
    }

    const newEx: RadiologyException = {
      ...ex,
      id: `EX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      status: "Open",
    }
    list.unshift(newEx)
    this.saveExceptions(list)
    return newEx
  }

  public static resolveException(id: string, notes: string, resolvedBy: string): void {
    const list = this.getExceptions().map((ex) => {
      if (ex.id === id) {
        return {
          ...ex,
          status: "Resolved" as const,
          resolutionNotes: notes,
          resolvedBy,
          resolvedAt: new Date().toISOString(),
        }
      }
      return ex
    })
    this.saveExceptions(list)
    this.logAudit({
      action: "Exception Resolved",
      actor: resolvedBy,
      role: "Radiology In-Charge",
      details: `Resolved exception '${id}': ${notes}`
    })
  }

  private static deriveExceptionsFromLiveStudies(): RadiologyException[] {
    const exceptions: RadiologyException[] = []
    const studies = RadiologyWorkflowDb.getStudies()

    studies.forEach((s) => {
      if (s.status === "Cancelled" || (s as any).workflowStatus === "CANCELLED") return

      const orderTs = RadiologyWorkflowDb.getOrderCreationTimestamp(s)
      const fallbackTs = safeToIsoDate(s.ordered || s.orderedAt || orderTs, s.orderDate)

      // 1. STAT priority with unverified / unpaid billing
      if (s.priority === "STAT" && !s.isPaid && s.paymentStatus !== "Paid" && s.billingStatus !== "Authorized Exception") {
        exceptions.push({
          id: `EX-STAT-${s.id}`,
          category: "Billing Status Inconsistency",
          severity: "Critical",
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          description: `STAT emergency study "${s.study}" has unverified billing without authorized financial override clearance.`,
          timestamp: fallbackTs,
          assignedOwner: "Radiology Reception / Billing Desk",
          status: "Open"
        })
      }

      // 2. Scan completed with billing discrepancy
      if (s.hasBillingDiscrepancy || (s.normalizedStatus === "DONE" && !s.isPaid && s.paymentStatus !== "Paid" && s.billingStatus !== "Authorized Exception")) {
        exceptions.push({
          id: `EX-DISCREPANCY-${s.id}`,
          category: "Billing Status Inconsistency",
          severity: "High",
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          description: `Billing discrepancy: Scan acquisition completed for "${s.study}" while billing remains pending (₹${s.price || 0}). Flagged for authorized financial resolution.`,
          timestamp: safeToIsoDate(s.completedAt || s.scanCompletedAt || s.ordered || orderTs, s.orderDate),
          assignedOwner: "Central Billing Cashier / Clinical Supervisor",
          status: "Open"
        })
      }

      // 3. Incomplete examination or interrupted scan
      if ((s as any).isIncomplete || (s as any).scanningInterrupted || (s as any).workflowStatus === "INCOMPLETE") {
        exceptions.push({
          id: `EX-INCOMPLETE-${s.id}`,
          category: "Incomplete Examination",
          severity: "High",
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          description: `Scanning procedure for "${s.study}" was interrupted or flagged incomplete before protocol completion. Staff attention required.`,
          timestamp: safeToIsoDate(s.completedAt || s.scanCompletedAt || s.ordered || orderTs, s.orderDate),
          assignedOwner: s.technician || "Senior Radiologic Technologist",
          status: "Open"
        })
      }

      // 4. Report Overdue (>24 hours since scan completion)
      if (s.normalizedStatus === "DONE" && s.normalizedReportStatus !== "Finalized") {
        const compTime = s.completedAt || s.scanningCompletedAt || s.scanCompletedAt
          ? safeToTimestamp(s.completedAt || s.scanningCompletedAt || s.scanCompletedAt, s.orderDate)
          : 0
        const orderTime = safeToTimestamp(s.ordered || s.orderedAt || orderTs, s.orderDate)
        const effectiveTime = compTime > 0 ? compTime : orderTime
        const hoursAgo = (Date.now() - effectiveTime) / (1000 * 60 * 60)
        if (hoursAgo > 24) {
          exceptions.push({
            id: `EX-TAT-${s.id}`,
            category: "Report Overdue",
            severity: "High",
            studyId: s.id,
            patientName: s.patient,
            umr: s.umr,
            description: `Examination completed over 24 hours ago but diagnostic report remains pending transcription/authorization.`,
            timestamp: fallbackTs,
            assignedOwner: s.radiologist || "Dr. Rajesh Sharma (HOD)",
            status: "Open"
          })
        }
      }

      // 5. Missing Patient Linkage
      if (!s.patient || !s.umr) {
        exceptions.push({
          id: `EX-MISSING-PATIENT-${s.id}`,
          category: "Missing Patient Linkage",
          severity: "Critical",
          studyId: s.id,
          patientName: s.patient || "Unknown Patient",
          umr: s.umr || "UNKNOWN",
          description: `Radiology examination record "${s.study || s.id}" has missing or unlinked patient demographic identification.`,
          timestamp: fallbackTs,
          assignedOwner: "Radiology Reception / Medical Records",
          status: "Open"
        })
      }
    })

    return exceptions
  }

  // ── Audit Events ──────────────────────────────────────────────────────────────
  public static getAuditEvents(): RadiologyAuditEvent[] {
    let list: RadiologyAuditEvent[] = []
    try {
      const data = localStorage.getItem(STORAGE_KEY_AUDIT)
      if (data) list = JSON.parse(data)
    } catch {}

    const studies = RadiologyWorkflowDb.getStudies()
    const synthesized: RadiologyAuditEvent[] = []

    studies.forEach((s) => {
      if (s.status === "Cancelled" || (s as any).workflowStatus === "CANCELLED") return

      // 1. Examination Order Created
      const orderTs = RadiologyWorkflowDb.getOrderCreationTimestamp(s)
      if (orderTs > 0) {
        synthesized.push({
          id: `AUD-ORD-${s.id}`,
          timestamp: safeToIsoDate(orderTs, s.orderDate),
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          studyName: s.study,
          action: "Examination Order Created",
          actor: s.provider || "Attending Physician",
          role: "Physician",
          details: `Order created for ${s.study} [${s.modality || "Imaging"}] · Patient: ${s.patient} (${s.umr})`,
        })
      }

      // 2. Billing Cleared
      if ((s.isPaid || s.paymentStatus === "Paid") && (s.paidAt || s.billingClearedAt)) {
        synthesized.push({
          id: `AUD-PAY-${s.id}`,
          timestamp: safeToIsoDate(s.paidAt || s.billingClearedAt || orderTs, s.orderDate),
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          studyName: s.study,
          action: "Billing Cleared",
          actor: s.billedBy || "Cashier / Billing Desk",
          role: "Billing Officer",
          details: `Billing clearance confirmed for ${s.study}. Receipt: ${s.paidReceiptNo || s.invoiceNo || "CLEARED"}`,
        })
      }

      // 3. Scanning Started
      if (s.scanningStartedAt || s.scanStartedAt) {
        synthesized.push({
          id: `AUD-SCAN-START-${s.id}`,
          timestamp: safeToIsoDate(s.scanningStartedAt || s.scanStartedAt || orderTs, s.orderDate),
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          studyName: s.study,
          action: "Scanning Started",
          actor: s.technician || "Radiology Technologist",
          role: "Senior Technologist",
          details: `Scan acquisition initiated in ${s.room || "Scan Suite"} for ${s.patient}`,
        })
      }

      // 4. Scanning Completed
      if (s.scanningCompletedAt || s.scanCompletedAt || s.completedAt || s.normalizedStatus === "DONE") {
        synthesized.push({
          id: `AUD-SCAN-DONE-${s.id}`,
          timestamp: safeToIsoDate(s.scanningCompletedAt || s.scanCompletedAt || s.completedAt || orderTs, s.orderDate),
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          studyName: s.study,
          action: "Scanning Completed",
          actor: s.technician || "Radiology Technologist",
          role: "Senior Technologist",
          details: `Diagnostic imaging completed for ${s.study}. DICOM images ingested.`,
        })
      }

      // 5. Sent to Reporting Workspace
      if (s.transferredToReportingAt || s.reportingQueuedAt || (s as any).transferredToReporting || (s as any).sentToReporting) {
        synthesized.push({
          id: `AUD-TRANS-${s.id}`,
          timestamp: safeToIsoDate(s.transferredToReportingAt || s.reportingQueuedAt || s.completedAt || orderTs, s.orderDate),
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          studyName: s.study,
          action: "Sent to Reporting Workspace",
          actor: s.technician || "Radiology Technologist",
          role: "Senior Technologist",
          details: `${s.study} dispatched to Radiologist diagnostic reporting workspace`,
        })
      }

      // 6. Report Draft Saved
      if (s.reportCreatedAt || (s as any).reportDraftSavedAt || s.normalizedReportStatus === "Draft") {
        synthesized.push({
          id: `AUD-DRAFT-${s.id}`,
          timestamp: safeToIsoDate(s.reportCreatedAt || (s as any).reportDraftSavedAt || orderTs, s.orderDate),
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          studyName: s.study,
          action: "Report Draft Saved",
          actor: s.radiologist || "Consultant Radiologist",
          role: "Radiologist",
          details: `Diagnostic report draft saved with anatomical section findings for ${s.patient}`,
        })
      }

      // 7. Report Finalized
      if (s.finalizedAt || s.signedAt || s.normalizedReportStatus === "Finalized") {
        synthesized.push({
          id: `AUD-FINAL-${s.id}`,
          timestamp: safeToIsoDate(s.finalizedAt || s.signedAt || orderTs, s.orderDate),
          studyId: s.id,
          patientName: s.patient,
          umr: s.umr,
          studyName: s.study,
          action: "Report Finalized",
          actor: s.finalizedBy || s.radiologist || "Dr. Rajesh Sharma, MD",
          role: "Senior Radiologist",
          details: `Report finalized and electronically signed. Available for patient and referring physician.`,
        })
      }
    })

    const merged = [...list]
    synthesized.forEach((syn) => {
      if (!merged.some((m) => m.id === syn.id || (m.studyId === syn.studyId && m.action === syn.action))) {
        merged.push(syn)
      }
    })

    return merged.sort((a, b) => {
      const timeA = safeToTimestamp(a.timestamp)
      const timeB = safeToTimestamp(b.timestamp)
      if (timeA !== timeB) return timeB - timeA
      return (b.id || "").localeCompare(a.id || "")
    })
  }

  public static logAudit(event: Omit<RadiologyAuditEvent, "id" | "timestamp">): void {
    const list = this.getAuditEvents()
    const newEv: RadiologyAuditEvent = {
      ...event,
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }
    list.unshift(newEv)
    try {
      localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(list.slice(0, 300)))
      this.notify()
    } catch {}
  }

  // ── Analytics & KPI Engine ────────────────────────────────────────────────────
  public static getDepartmentAnalytics(dateRange: "today" | "7days" | "30days" = "7days") {
    const allStudies = RadiologyWorkflowDb.getStudies()
    const exceptions = this.getExceptions()
    const suites = this.getSuites()

    const now = Date.now()
    const msMap = {
      today: 24 * 60 * 60 * 1000,
      "7days": 7 * 24 * 60 * 60 * 1000,
      "30days": 30 * 24 * 60 * 60 * 1000,
    }
    const cutoff = now - msMap[dateRange]

    // Filter studies strictly within the selected date range using actual persisted order creation timestamp
    const studies = allStudies.filter((s) => {
      if (s.status === "Cancelled" || (s as any).workflowStatus === "CANCELLED") return false
      const ts = RadiologyWorkflowDb.getOrderCreationTimestamp(s)
      return ts >= cutoff || ts === 0
    })

    const totalStudies = studies.length
    const completedStudies = studies.filter((s) => s.normalizedStatus === "DONE" || (s as any).workflowStatus === "COMPLETED" || (s as any).scanningStage === 3).length
    const finalizedReports = studies.filter((s) => s.normalizedReportStatus === "Finalized" || s.reportStatus === "Finalized" || !!s.finalizedAt).length
    const draftReports = studies.filter((s) => (s.normalizedReportStatus === "Draft" || (s as any).reportStatus === "Draft" || !!s.hasDraft) && s.normalizedReportStatus !== "Finalized").length
    const awaitingReports = studies.filter((s) => (s.normalizedStatus === "DONE" || (s as any).workflowStatus === "COMPLETED" || (s as any).scanningStage === 3 || !!s.transferredToReportingAt) && s.normalizedReportStatus === "Awaiting Report" && !s.hasDraft).length
    const inProgressScanning = studies.filter((s) => (s.normalizedStatus === "IN PROGRESS" || s.status === "In Progress" || (s as any).scanningStage === 2) && s.normalizedStatus !== "DONE").length
    const openExceptions = exceptions.filter((e) => e.status !== "Resolved").length

    // Modality breakdown for studies in this date range
    const modalityCounts: Record<string, number> = {}
    RADIOLOGY_MODALITIES.forEach((m) => { modalityCounts[m] = 0 })
    studies.forEach((s) => {
      if (s.status === "Cancelled" || (s as any).workflowStatus === "CANCELLED") return
      const matched = getCanonicalRadiologyModality(s)
      modalityCounts[matched] = (modalityCounts[matched] || 0) + 1
    })

    // Actual Turnaround Time (TAT) Calculations from persisted timestamps
    let totalOrderToScanMinutes = 0
    let countOrderToScan = 0
    let totalScanToReportMinutes = 0
    let countScanToReport = 0
    const totalTatMinutesList: number[] = []

    studies.forEach((s) => {
      if (s.status === "Cancelled" || (s as any).workflowStatus === "CANCELLED") return

      const orderTs = RadiologyWorkflowDb.getOrderCreationTimestamp(s)
      const scanStartTs = s.scanningStartedAt || s.scanStartedAt ? safeToTimestamp(s.scanningStartedAt || s.scanStartedAt, s.orderDate) : 0
      const scanCompletedTs = s.scanningCompletedAt || s.scanCompletedAt || s.completedAt ? safeToTimestamp(s.scanningCompletedAt || s.scanCompletedAt || s.completedAt, s.orderDate) : 0
      const finalizedTs = s.finalizedAt || s.signedAt ? safeToTimestamp(s.finalizedAt || s.signedAt, s.orderDate) : 0

      const effectiveScanStart = scanStartTs > 0 ? scanStartTs : scanCompletedTs
      if (orderTs > 0 && effectiveScanStart > orderTs) {
        const diffMins = Math.round((effectiveScanStart - orderTs) / (1000 * 60))
        if (diffMins > 0 && diffMins < 1440 * 7) {
          totalOrderToScanMinutes += diffMins
          countOrderToScan++
        }
      }

      if (scanCompletedTs > 0 && finalizedTs > scanCompletedTs) {
        const diffMins = Math.round((finalizedTs - scanCompletedTs) / (1000 * 60))
        if (diffMins > 0 && diffMins < 1440 * 7) {
          totalScanToReportMinutes += diffMins
          countScanToReport++
        }
      }

      if (orderTs > 0 && finalizedTs > orderTs) {
        const diffMins = Math.round((finalizedTs - orderTs) / (1000 * 60))
        if (diffMins > 0 && diffMins < 1440 * 14) {
          totalTatMinutesList.push(diffMins)
        }
      }
    })

    const avgOrderToScanMinutes = countOrderToScan > 0 ? Math.round(totalOrderToScanMinutes / countOrderToScan) : 0
    const avgScanToReportMinutes = countScanToReport > 0 ? Math.round(totalScanToReportMinutes / countScanToReport) : 0
    const overallTatMinutes = avgOrderToScanMinutes + avgScanToReportMinutes

    // Chronological date-based throughput distribution:
    const daysCount = dateRange === "today" ? 1 : dateRange === "7days" ? 7 : 30
    const chronologicalTrend: { date: string; label: string; count: number; completed: number; finalized: number }[] = []

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000)
      const dateKey = d.toISOString().split("T")[0]
      const label = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })

      const dayStudies = studies.filter((s) => {
        const ts = RadiologyWorkflowDb.getOrderCreationTimestamp(s)
        if (!ts) return false
        return new Date(ts).toISOString().split("T")[0] === dateKey
      })

      chronologicalTrend.push({
        date: dateKey,
        label,
        count: dayStudies.length,
        completed: dayStudies.filter((s) => s.normalizedStatus === "DONE").length,
        finalized: dayStudies.filter((s) => s.normalizedReportStatus === "Finalized").length,
      })
    }

    // Median TAT
    totalTatMinutesList.sort((a, b) => a - b)
    let medianTatStr = "—"
    if (totalTatMinutesList.length > 0) {
      const medianMins = totalTatMinutesList[Math.floor(totalTatMinutesList.length / 2)]
      const medianTatHours = Math.floor(medianMins / 60)
      const medianTatRemMins = medianMins % 60
      medianTatStr = medianTatHours > 0 ? `${medianTatHours}h ${medianTatRemMins}m` : `${medianTatRemMins} mins`
    }

    return {
      dateRange,
      totalStudies,
      completedStudies,
      finalizedReports,
      draftReports,
      awaitingReports,
      inProgressScanning,
      openExceptions,
      modalityCounts,
      chronologicalTrend,
      suitesInUse: suites.filter((s) => s.status === "In Use").length,
      suitesAvailable: suites.filter((s) => s.status === "Available").length,
      turnaroundTime: {
        orderToScan: countOrderToScan > 0 ? `${avgOrderToScanMinutes} mins` : "—",
        scanToReport: countScanToReport > 0 ? `${avgScanToReportMinutes} mins` : "—",
        overall: overallTatMinutes > 0 ? `${Math.round(overallTatMinutes / 60)}h ${overallTatMinutes % 60}m` : "—",
        medianTat: medianTatStr,
      }
    }
  }
}

export const RadiologyDatabase = UniversalRadiologyDb
export type RadiologyDatabase = UniversalRadiologyDb
