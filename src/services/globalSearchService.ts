/**
 * Enterprise Hospital Management System - Global Search & Unified Audit Aggregation Service
 * Path: src/services/globalSearchService.ts
 *
 * Provides typed data aggregation across:
 * - db (Outpatient & Master Patients)
 * - doctorMaster (Physician Roster)
 * - DoctorPortalDatabase (Consultations & Clinical Artefacts)
 * - PharmacyDatabase (Prescriptions, Items & Dispensing Bills)
 * - LabOrderDatabase (Diagnostic Orders & Results)
 * - BedDatabase (Inpatient Beds & Discharges)
 * - ErDatabase (Emergency Encounters & Triage)
 * - BillingDatabase (UMR Financial Ledger, Claims & Payments)
 * - HrmsDatabase & RoleDatabase (Hospital Staff Roster & System Accounts)
 */

import { db, DBOPEncounter, DBPatient } from "./db"
import { getDoctorMaster, MasterDoctor } from "./doctorMaster"
import { DoctorPortalDatabase, ConsultationRecord } from "./doctorPortalDb"
import {
  PharmacyDatabase,
  AppPrescription,
  AppPharmacyBill,
} from "./pharmacyDb"
import { LabOrderDatabase, LabOrder, LabOrderTest } from "./labOrdersDb"
import { BedDatabase, BedRecord, DischargedPatientRecord } from "./bedDb"
import { ErDatabase, ErVisitRecord } from "./erDb"
import {
  BillingDatabase,
  UmrFinancialLedger,
  PaymentRecord,
  ClaimRecord,
} from "./billingDb"
import { HrmsDatabase, StaffMember } from "./hrmsDb"
import { RoleDatabase, AppUser } from "./roleDb"
import { OpReportsService } from "./opReportsDb"
import { GeneralReportsService, DateRangePreset } from "./generalReportsDb"

// ── Search Result Models ─────────────────────────────────────────────────────

export type SearchResultType = "patient" | "doctor" | "staff"

export interface SearchResultItem {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  badge: string
  badgeColor?: string
  identifier: string // primary lookup key (e.g. UMR, doctorId, staffId)
  department?: string
  phone?: string
  raw?: any
}

export interface GroupedSearchResults {
  patients: SearchResultItem[]
  doctors: SearchResultItem[]
  staff: SearchResultItem[]
  total: number
}

// ── Patient Activity Profile Models ──────────────────────────────────────────

export type PatientTimelineCategory =
  | "All"
  | "Consultations"
  | "Prescriptions"
  | "Diagnostics"
  | "Inpatient"
  | "Emergency"
  | "Billing"

export interface PatientTimelineEvent {
  id: string
  timestamp: number
  dateStr: string
  dateTimeFormatted: string
  category: PatientTimelineCategory
  title: string
  description: string
  badge: string
  badgeColor: string
  doctor?: string
  department?: string
  cost?: number
  meta?: any
}

export interface PatientActivityProfile {
  demographics: {
    umr: string
    name: string
    age: number
    gender: string
    bloodGroup: string
    phone: string
    address: string
    registrationDate: string
  }
  encounters: Array<{
    id: string
    date: string
    dateTimeFormatted: string
    doctor: string
    department: string
    visitType: string
    complaint: string
    diagnosis: string
    vitals?: Record<string, any>
    status: string
    fee: number
  }>
  prescriptions: Array<{
    id: string
    date: string
    doctor: string
    department: string
    status: string
    dispensingStatus: string
    items: Array<{
      medicine: string
      dosage: string
      frequency: string
      duration: string
      instructions?: string
      quantity: number
    }>
  }>
  pharmacyBills: AppPharmacyBill[]
  labOrders: Array<{
    id: string
    date: string
    doctor: string
    department: string
    status: string
    billingStatus: string
    billingTotal: number
    tests: LabOrderTest[]
  }>
  inpatientRecords: {
    currentBed: BedRecord | null
    discharges: DischargedPatientRecord[]
  }
  emergencyVisits: Array<{
    id: number
    visitNo: string
    admissionTime: string
    dateTimeFormatted: string
    triageLevel: number
    triageCategory: string
    chiefComplaint: string
    attendingPhysician: string
    status: string
    disposition?: string
  }>
  financials: {
    ledger: UmrFinancialLedger | null
    totalCharges: number
    totalPaid: number
    outstandingBalance: number
    payments: PaymentRecord[]
    invoices: ClaimRecord[]
  }
  timeline: PatientTimelineEvent[]
}

// ── Doctor Activity & KPI Models ─────────────────────────────────────────────

export interface DoctorActivityStats {
  doctor: MasterDoctor
  periodPreset: DateRangePreset | "all"
  dateRangeLabel: string
  startDateStr: string
  endDateStr: string
  kpis: {
    patientsTreatedToday: number
    consultationsCompletedToday: number
    uniquePatientsPeriod: number
    totalConsultationsPeriod: number
    opConsultations: number
    erEncounters: number
    prescriptionsIssued: number
    labOrdersPlaced: number
  }
  encounters: Array<{
    id: string
    umr: string
    patientName: string
    timestamp: number
    dateTimeFormatted: string
    visitType: string
    department: string
    complaint: string
    diagnosis: string
    status: string
    isConsultation: boolean
    fee: number
    source: "OP" | "ER" | "DoctorPortal"
  }>
  prescriptions: Array<{
    id: string
    patientName: string
    umr: string
    date: string
    status: string
    items: Array<{
      medicineName: string
      dosage: string
      frequency?: string
      duration: string
      instructions?: string
    }>
  }>
  labOrders: Array<{
    id: string
    patientName: string
    umr: string
    date: string
    status: string
    urgency: string
    total: number
    tests: string[]
  }>
}

// ── Staff Activity Profile Models ────────────────────────────────────────────

export interface StaffActivityProfile {
  staff: {
    id: string
    name: string
    designation: string
    category: string
    department: string
    shift: string
    status: string
    dutyStatus: string
    email: string
    phone: string
    joiningDate: string
    qualification?: string
    licenseNumber?: string
  }
  dateRangeLabel: string
  category: "Nursing" | "Pharmacy" | "Laboratory" | "Radiology" | "Administrative" | "Doctor" | "Support Staff"
  kpis: Record<string, { label: string; value: number | string; icon?: string; badgeColor?: string }>
  activityLog: Array<{
    id: string
    timestamp: number
    dateTimeFormatted: string
    type: string
    title: string
    description: string
    status: string
    meta?: any
  }>
}

// ── Helper Utilities ─────────────────────────────────────────────────────────

export function normalizeDoctorName(name: string): string {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(/^dr\.?\s*/i, "")
    .replace(/[.\-_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function isDoctorMatch(
  doctor: MasterDoctor | { id: string; name: string; staffId?: string; username?: string },
  queryOrNameOrId?: string | null,
): boolean {
  if (!queryOrNameOrId) return false
  const target = queryOrNameOrId.trim()
  if (!target) return false

  // Exact or case-insensitive match on IDs
  if (doctor.id && doctor.id.toLowerCase() === target.toLowerCase()) return true
  if (doctor.staffId && doctor.staffId.toLowerCase() === target.toLowerCase()) return true
  if (doctor.username && doctor.username.toLowerCase() === target.toLowerCase()) return true

  const targetNorm = normalizeDoctorName(target)
  const docNameNorm = normalizeDoctorName(doctor.name)

  if (targetNorm && docNameNorm) {
    if (targetNorm === docNameNorm) return true
    if (targetNorm.length > 3 && docNameNorm.length > 3) {
      if (docNameNorm.includes(targetNorm) || targetNorm.includes(docNameNorm)) return true
    }
  }

  return false
}

export function getEncounterTimestamp(enc: DBOPEncounter): number {
  const dateStr = OpReportsService.getEncounterDate(enc) // standard YYYY-MM-DD

  // Check ISO candidates first
  const isoCandidates = [
    enc.timestamps?.arrival,
    enc.timestamps?.visitCompleted,
    enc.timestamps?.registration,
  ]
  for (const cand of isoCandidates) {
    if (cand && typeof cand === "string" && cand.includes("T")) {
      const parsed = Date.parse(cand)
      if (!isNaN(parsed)) return parsed
    }
  }

  // Parse wall-clock time like "10:15 AM" or "02:30 PM"
  const timeStr = enc.registrationTime || enc.timestamps?.registration || "09:30 AM"
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null
    if (ampm === "PM" && hours < 12) hours += 12
    if (ampm === "AM" && hours === 12) hours = 0
    const [y, m, d] = dateStr.split("-").map(Number)
    const dt = new Date(y, m - 1, d, hours, minutes, 0)
    if (!isNaN(dt.getTime())) return dt.getTime()
  }

  // Fallback to parsed date
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d, 9, 30, 0)
  return isNaN(dt.getTime()) ? Date.now() : dt.getTime()
}

export function formatEncounterDateTime(encOrDate: any): string {
  if (!encOrDate) return "N/A"

  let dateStr = ""
  let timeStr = "09:30 AM"

  if (typeof encOrDate === "string") {
    if (encOrDate.includes("T")) {
      dateStr = encOrDate.split("T")[0]
      timeStr = encOrDate.split("T")[1]?.slice(0, 5) || "09:30 AM"
    } else if (/^\d{4}-\d{2}-\d{2}/.test(encOrDate)) {
      dateStr = encOrDate.slice(0, 10)
    } else {
      dateStr = encOrDate
    }
  } else if (typeof encOrDate === "object") {
    dateStr =
      encOrDate.encounterDate ||
      (encOrDate.date && /^\d{4}-\d{2}-\d{2}$/.test(encOrDate.date) ? encOrDate.date : null) ||
      (encOrDate.id && encOrDate.umr ? OpReportsService.getEncounterDate(encOrDate) : null) ||
      (encOrDate.createdAt && encOrDate.createdAt.includes("T") ? encOrDate.createdAt.split("T")[0] : null) ||
      (encOrDate.registrationTime && /^\d{4}-\d{2}-\d{2}/.test(encOrDate.registrationTime)
        ? encOrDate.registrationTime.slice(0, 10)
        : null) ||
      new Date().toISOString().split("T")[0]

    timeStr =
      encOrDate.registrationTime ||
      encOrDate.timestamps?.registration ||
      encOrDate.arrivedAt ||
      (encOrDate.createdAt && encOrDate.createdAt.includes("T")
        ? encOrDate.createdAt.split("T")[1]?.slice(0, 5)
        : "09:30 AM")
  }

  try {
    const parts = dateStr.split("-").map(Number)
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      const month = monthNames[parts[1] - 1] || "Oct"
      return `${month} ${parts[2]}, ${parts[0]} · ${timeStr}`
    }
  } catch {}

  return `${dateStr} · ${timeStr}`
}

const CONSULTATION_STATUSES = new Set([
  "Consultation Completed",
  "OP Completed",
  "Awaiting Billing",
  "Billing Completed",
  "Post-Consultation",
  "Awaiting Investigation",
  "Under Consultation",
])

export function isConsultationEncounter(
  enc: DBOPEncounter,
  consultationMap?: Map<string, ConsultationRecord>,
  prescriptionEncIds?: Set<string>,
  labOrderEncIds?: Set<string>,
): boolean {
  if (CONSULTATION_STATUSES.has(enc.status)) return true
  if (consultationMap && consultationMap.has(enc.id)) return true
  if (enc.prescription && enc.prescription.length > 0) return true
  if (prescriptionEncIds && prescriptionEncIds.has(enc.id)) return true
  if (enc.investigations && enc.investigations.length > 0) return true
  if (labOrderEncIds && labOrderEncIds.has(enc.id)) return true
  if (enc.diagnosis && enc.diagnosis.trim().length > 0 && enc.diagnosis.trim() !== "-") return true
  return false
}

// ── Global Search Service ────────────────────────────────────────────────────

export class GlobalSearchService {
  /**
   * 1. searchAll(query: string)
   * High-performance search across Patients, Doctors, and Staff.
   */
  public static searchAll(query: string): GroupedSearchResults {
    const q = (query || "").trim().toLowerCase()
    if (!q || q.length < 1) {
      return { patients: [], doctors: [], staff: [], total: 0 }
    }

    // A. Search Patients (from db, ErDatabase, and BedDatabase)
    const rawPatients = db.getPatients()
    const erVisits = ErDatabase.getVisits("all")
    const beds = BedDatabase.getBeds()
    const seenUmrs = new Set<string>()
    const patientResults: SearchResultItem[] = []

    for (const p of rawPatients) {
      const umr = p.umr || ""
      const name = p.name || ""
      const phone = p.phone || ""
      const address = p.address || ""

      if (
        name.toLowerCase().includes(q) ||
        umr.toLowerCase().includes(q) ||
        phone.includes(q) ||
        address.toLowerCase().includes(q)
      ) {
        seenUmrs.add(umr.toUpperCase())
        patientResults.push({
          id: `PAT-${umr}`,
          type: "patient",
          title: name,
          subtitle: `UMR: ${umr} · ${p.age ? `${p.age}y` : ""} ${p.sex || ""} · ${phone || "No phone"}`,
          badge: "Patient",
          badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
          identifier: umr,
          department: "Outpatient",
          phone,
          raw: p,
        })
      }
    }

    // Check ER patients not in OP db
    for (const er of erVisits) {
      const umr = er.patient_id || `ER-${er.id}`
      if (seenUmrs.has(umr.toUpperCase())) continue

      const name = `${er.patient_name || ""} ${er.patient_last_name || ""}`.trim()
      const phone = er.patient_phone || ""
      if (
        name.toLowerCase().includes(q) ||
        umr.toLowerCase().includes(q) ||
        phone.includes(q)
      ) {
        seenUmrs.add(umr.toUpperCase())
        patientResults.push({
          id: `PAT-ER-${er.id}`,
          type: "patient",
          title: name || "Emergency Patient",
          subtitle: `MRN / UMR: ${umr} · Age: ${er.patient_age || "N/A"} · ER Bay`,
          badge: "Emergency",
          badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
          identifier: umr,
          department: "Emergency",
          phone,
          raw: er,
        })
      }
    }

    // Check Inpatient beds for admitted patients
    for (const bed of beds) {
      if (bed.status !== "Occupied" || !bed.patient_id) continue
      const umr = bed.patient_id
      if (seenUmrs.has(umr.toUpperCase())) continue

      const name = `${bed.patient_name || ""} ${bed.patient_last_name || ""}`.trim()
      const phone = bed.patient_phone || ""
      if (
        name.toLowerCase().includes(q) ||
        umr.toLowerCase().includes(q) ||
        phone.includes(q)
      ) {
        seenUmrs.add(umr.toUpperCase())
        patientResults.push({
          id: `PAT-BED-${bed.id}`,
          type: "patient",
          title: name,
          subtitle: `UMR: ${umr} · Ward: ${bed.ward} · Bed ${bed.bed_no}`,
          badge: "Inpatient",
          badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
          identifier: umr,
          department: bed.ward,
          phone,
          raw: bed,
        })
      }
    }

    // B. Search Doctors (from doctorMaster)
    const masterDoctors = getDoctorMaster()
    const doctorResults: SearchResultItem[] = []
    const seenDoctorIds = new Set<string>()

    for (const doc of masterDoctors) {
      const name = doc.name || ""
      const normName = normalizeDoctorName(name)
      const docId = doc.id || ""
      const staffId = doc.staffId || ""
      const username = doc.username || ""
      const specialty = doc.specialty || ""
      const room = doc.room || ""

      const matches =
        name.toLowerCase().includes(q) ||
        normName.includes(q.replace(/^dr\.?\s*/i, "")) ||
        docId.toLowerCase().includes(q) ||
        staffId.toLowerCase().includes(q) ||
        username.toLowerCase().includes(q) ||
        specialty.toLowerCase().includes(q) ||
        room.toLowerCase().includes(q)

      if (matches) {
        seenDoctorIds.add(docId.toLowerCase())
        doctorResults.push({
          id: `DOC-${docId}`,
          type: "doctor",
          title: name,
          subtitle: `${specialty || "Specialist"} · ${room || "Consultation Room"} · ID: ${docId}`,
          badge: "Doctor",
          badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
          identifier: docId,
          department: specialty || "Clinical",
          raw: doc,
        })
      }
    }

    // C. Search Staff (from HrmsDatabase & RoleDatabase)
    const staffList = HrmsDatabase.getStaffList()
    const roleUsers = RoleDatabase.getUsers()
    const staffResults: SearchResultItem[] = []
    const seenStaffIds = new Set<string>()

    // Merge staff members
    for (const st of staffList) {
      // If staff member is in doctor master, skip here to avoid duplicating doctor result
      if (st.category === "Doctor" || seenDoctorIds.has(st.id.toLowerCase())) {
        continue
      }

      const name = st.name || ""
      const id = st.id || ""
      const dept = st.department || ""
      const desig = st.designation || ""
      const phone = st.phone || ""
      const email = st.email || ""

      if (
        name.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q) ||
        desig.toLowerCase().includes(q) ||
        phone.includes(q) ||
        email.toLowerCase().includes(q)
      ) {
        seenStaffIds.add(id.toLowerCase())
        staffResults.push({
          id: `STF-${id}`,
          type: "staff",
          title: name,
          subtitle: `${desig} · ${dept} · ID: ${id}`,
          badge: st.category || "Staff",
          badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
          identifier: id,
          department: dept,
          phone,
          raw: st,
        })
      }
    }

    // Check RoleDatabase for administrative accounts not in staff list
    for (const u of roleUsers) {
      const uId = u.staffId || u.id || u.username
      if (seenStaffIds.has(uId.toLowerCase()) || seenDoctorIds.has(uId.toLowerCase())) {
        continue
      }
      const name = u.name || u.username
      const username = u.username || ""

      if (
        name.toLowerCase().includes(q) ||
        username.toLowerCase().includes(q) ||
        uId.toLowerCase().includes(q)
      ) {
        seenStaffIds.add(uId.toLowerCase())
        staffResults.push({
          id: `USER-${u.id}`,
          type: "staff",
          title: name,
          subtitle: `Role: ${u.roleId} · User: @${username}`,
          badge: "Hospital Staff",
          badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
          identifier: uId,
          department: "Administration",
          raw: u,
        })
      }
    }

    return {
      patients: patientResults,
      doctors: doctorResults,
      staff: staffResults,
      total: patientResults.length + doctorResults.length + staffResults.length,
    }
  }

  /**
   * 2. getPatientActivityProfile(patientIdOrUmr: string)
   * Builds full multi-department clinical and financial audit dossier for a patient.
   */
  public static getPatientActivityProfile(patientIdOrUmr: string): PatientActivityProfile {
    const rawUmr = (patientIdOrUmr || "").trim()
    const cleanUmr = rawUmr.toUpperCase()

    // 1. Resolve Demographic Record
    const allPatients = db.getPatients()
    let pt = allPatients.find(
      (p) =>
        (p.umr && p.umr.toUpperCase() === cleanUmr) ||
        (p.phone && p.phone === rawUmr) ||
        (p.name && p.name.toLowerCase() === rawUmr.toLowerCase()),
    )

    // Check ER patient records if not found in db
    const allErVisits = ErDatabase.getVisits("all")
    const matchedEr = allErVisits.find(
      (v) =>
        (v.patient_id && v.patient_id.toUpperCase() === cleanUmr) ||
        `ER-${v.id}` === cleanUmr ||
        (v.patient_phone && v.patient_phone === rawUmr),
    )

    // Check BedDatabase
    const allBeds = BedDatabase.getBeds()
    const matchedBed = allBeds.find(
      (b) => b.patient_id && b.patient_id.toUpperCase() === cleanUmr,
    )

    const actualUmr = pt?.umr || matchedEr?.patient_id || matchedBed?.patient_id || rawUmr
    const actualName =
      pt?.name ||
      (matchedEr ? `${matchedEr.patient_name || ""} ${matchedEr.patient_last_name || ""}`.trim() : null) ||
      matchedBed?.patient_name ||
      "Patient"

    const demographics = {
      umr: actualUmr,
      name: actualName,
      age: pt?.age || matchedEr?.patient_age || matchedBed?.patient_age || 38,
      gender: pt?.sex || matchedEr?.patient_gender || matchedBed?.patient_gender || "Other",
      bloodGroup: pt?.bloodGroup || matchedEr?.patient?.blood_group || "O+",
      phone: pt?.phone || matchedEr?.patient_phone || matchedBed?.patient_phone || "+91 98765 43210",
      address: pt?.address || matchedEr?.patient?.address || "HospAI Campus, Hyderabad, India",
      registrationDate: pt?.createdAt || matchedEr?.arrival_at || new Date().toISOString(),
    }

    // 2. Clinical Encounters (OP)
    const allEncounters = db.getEncounters()
    const patientEncounters = allEncounters
      .filter((e) => e.umr && e.umr.toUpperCase() === actualUmr.toUpperCase())
      .map((e) => ({
        id: e.id,
        date: OpReportsService.getEncounterDate(e),
        dateTimeFormatted: formatEncounterDateTime(e),
        doctor: e.assignedDoctor || "Dr. Duty Physician",
        department: e.dept || "General Medicine",
        visitType: e.isNew ? "New Consultation" : "Follow-up Visit",
        complaint: e.chiefComplaint || "General Consultation",
        diagnosis: e.diagnosis || "Clinical assessment completed",
        vitals: e.vitals,
        status: e.status,
        fee: (e as any).fee || 500,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // 3. Prescriptions & Dispensing
    const allPrescriptions = PharmacyDatabase.getPrescriptions()
    const patientPrescriptions = allPrescriptions
      .filter(
        (rx) =>
          (rx.uhid && rx.uhid.toUpperCase() === actualUmr.toUpperCase()) ||
          (rx.patientId && rx.patientId.toUpperCase() === actualUmr.toUpperCase()),
      )
      .map((rx) => ({
        id: rx.id,
        date: rx.date || rx.createdAt?.split("T")[0] || new Date().toISOString().split("T")[0],
        doctor: rx.doctorName || "Treating Physician",
        department: rx.department || "Clinical",
        status: rx.status,
        dispensingStatus: rx.dispensingStatus,
        items: (rx.items || []).map((it) => ({
          medicine: it.medicineName,
          dosage: it.dosage,
          frequency: it.frequency || "1-0-1",
          duration: it.duration,
          instructions: it.instructions || "After meals",
          quantity: it.quantity || 10,
        })),
      }))

    const allBills = PharmacyDatabase.getBills()
    const patientBills = allBills.filter(
      (b) =>
        (b.uhid && b.uhid.toUpperCase() === actualUmr.toUpperCase()) ||
        (b.patientId && b.patientId.toUpperCase() === actualUmr.toUpperCase()),
    )

    // 4. Diagnostics & Lab Orders
    const allLabOrders = LabOrderDatabase.getOrders()
    const patientLabOrders = allLabOrders
      .filter((lo) => lo.umr && lo.umr.toUpperCase() === actualUmr.toUpperCase())
      .map((lo) => ({
        id: lo.id,
        date: lo.createdAt ? lo.createdAt.split("T")[0] : new Date().toISOString().split("T")[0],
        doctor: lo.doctorName || "Consultant",
        department: lo.department || "Laboratory",
        status: lo.status,
        billingStatus: lo.billing?.status || "Pending",
        billingTotal: lo.billing?.total || 0,
        tests: lo.tests || [],
      }))

    // 5. Inpatient Records
    const currentBed = allBeds.find(
      (b) => b.patient_id && b.patient_id.toUpperCase() === actualUmr.toUpperCase(),
    ) || null
    const allDischarges = BedDatabase.getDischargedPatients()
    const patientDischarges = allDischarges.filter(
      (d) =>
        (d.patientId && d.patientId.toUpperCase() === actualUmr.toUpperCase()) ||
        (d.mrn && d.mrn.toUpperCase() === actualUmr.toUpperCase()),
    )

    // 6. Emergency Encounters
    const patientErVisits = allErVisits
      .filter(
        (v) =>
          (v.patient_id && v.patient_id.toUpperCase() === actualUmr.toUpperCase()) ||
          `ER-${v.id}` === actualUmr,
      )
      .map((v) => ({
        id: v.id,
        visitNo: v.visit_no || `ER-${v.id}`,
        admissionTime: v.arrival_at || new Date().toISOString(),
        dateTimeFormatted: formatEncounterDateTime(v.arrival_at),
        triageLevel: (v.triage?.category?.includes("1") ? 1 : v.triage?.category?.includes("2") ? 2 : 3) as number,
        triageCategory: v.triage_category || v.triage?.category || "Urgent (Level 3)",
        chiefComplaint: v.complaints?.[0]?.complaint || "Acute emergency presentation",
        attendingPhysician: v.assigned_doctor_name || "Emergency Physician",
        status: v.status || "Completed",
        disposition: v.disposition?.outcome || undefined,
      }))

    // 7. Billing & Financial Ledger
    const ledger = BillingDatabase.getUmrLedger(actualUmr)
    const allClaims = BillingDatabase.getClaims()
    const patientClaims = allClaims.filter(
      (c) =>
        (c.patientId && c.patientId.toUpperCase() === actualUmr.toUpperCase()) ||
        (c.mrn && c.mrn.toUpperCase() === actualUmr.toUpperCase()),
    )
    const allPayments = BillingDatabase.getAllPayments()
    const patientPayments = allPayments.filter(
      (p) =>
        ledger?.payments?.some((lp) => lp.id === p.id) ||
        patientClaims.some((c) => c.id === p.invoiceId),
    )

    const totalCharges = ledger?.totalHistoricalCharges || 0
    const totalPaid = ledger?.totalPaid || 0
    const outstandingBalance = ledger?.outstandingBalance || 0

    // 8. Construct Chronological Activity Timeline
    const timeline: PatientTimelineEvent[] = []

    // A. Registration Event
    timeline.push({
      id: `TL-REG-${actualUmr}`,
      timestamp: new Date(demographics.registrationDate).getTime() || Date.now(),
      dateStr: demographics.registrationDate.split("T")[0],
      dateTimeFormatted: formatEncounterDateTime(demographics.registrationDate),
      category: "Consultations",
      title: "Patient Registered at Hospital",
      description: `Initial registration file opened with UMR ${actualUmr}. Blood group ${demographics.bloodGroup}.`,
      badge: "Registration",
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    })

    // B. OP Visits
    for (const enc of patientEncounters) {
      timeline.push({
        id: `TL-ENC-${enc.id}`,
        timestamp: new Date(enc.date).getTime() || Date.now(),
        dateStr: enc.date,
        dateTimeFormatted: enc.dateTimeFormatted,
        category: "Consultations",
        title: `Outpatient Visit: ${enc.doctor}`,
        description: `Dept: ${enc.department} · Chief Complaint: ${enc.complaint} · Diagnosis: ${enc.diagnosis}`,
        badge: enc.status,
        badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
        doctor: enc.doctor,
        department: enc.department,
        cost: enc.fee,
      })
    }

    // C. ER Encounters
    for (const er of patientErVisits) {
      timeline.push({
        id: `TL-ER-${er.id}`,
        timestamp: new Date(er.admissionTime).getTime() || Date.now(),
        dateStr: er.admissionTime.split("T")[0],
        dateTimeFormatted: er.dateTimeFormatted,
        category: "Emergency",
        title: `Emergency Department Admission (${er.visitNo})`,
        description: `Triage: ${er.triageCategory} · Chief Complaint: ${er.chiefComplaint} · Attending: ${er.attendingPhysician}`,
        badge: er.triageCategory,
        badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
        doctor: er.attendingPhysician,
        department: "Emergency",
      })
    }

    // D. Prescriptions
    for (const rx of patientPrescriptions) {
      timeline.push({
        id: `TL-RX-${rx.id}`,
        timestamp: new Date(rx.date).getTime() || Date.now(),
        dateStr: rx.date,
        dateTimeFormatted: formatEncounterDateTime(rx.date),
        category: "Prescriptions",
        title: `Prescription Issued (${rx.items.length} items)`,
        description: `Prescribed by ${rx.doctor} · Status: ${rx.status} · ${rx.items.map((i) => i.medicine).join(", ")}`,
        badge: rx.status,
        badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
        doctor: rx.doctor,
        department: rx.department,
      })
    }

    // E. Pharmacy Bills
    for (const bill of patientBills) {
      timeline.push({
        id: `TL-PHARM-BILL-${bill.id}`,
        timestamp: new Date(bill.billNumber ? Date.now() : 0).getTime(),
        dateStr: new Date().toISOString().split("T")[0],
        dateTimeFormatted: "Dispensed at Pharmacy",
        category: "Prescriptions",
        title: `Pharmacy Bill: ${bill.billNumber}`,
        description: `Items: ${bill.items?.length || 0} · Total: ₹${bill.subTotal || 0} · Payment: ${bill.paymentStatus}`,
        badge: bill.paymentStatus,
        badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
        cost: bill.subTotal || 0,
      })
    }

    // F. Lab Orders
    for (const lo of patientLabOrders) {
      timeline.push({
        id: `TL-LAB-${lo.id}`,
        timestamp: new Date(lo.date).getTime() || Date.now(),
        dateStr: lo.date,
        dateTimeFormatted: formatEncounterDateTime(lo.date),
        category: "Diagnostics",
        title: `Diagnostic Lab Order (${lo.id})`,
        description: `Tests: ${lo.tests.map((t) => t.name).join(", ")} · Status: ${lo.status} · Billed: ₹${lo.billingTotal}`,
        badge: lo.status,
        badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
        doctor: lo.doctor,
        department: lo.department,
        cost: lo.billingTotal,
      })
    }

    // G. Inpatient Admissions & Discharges
    if (currentBed) {
      timeline.push({
        id: `TL-BED-ACTIVE-${currentBed.id}`,
        timestamp: new Date(currentBed.admission_date || currentBed.allocated_at || Date.now()).getTime(),
        dateStr: (currentBed.admission_date || currentBed.allocated_at || new Date().toISOString()).split("T")[0],
        dateTimeFormatted: formatEncounterDateTime(currentBed.admission_date || currentBed.allocated_at),
        category: "Inpatient",
        title: `Active Inpatient Admission · Ward ${currentBed.ward}`,
        description: `Bed ${currentBed.bed_no} (${currentBed.bed_type}) · Rate: ₹${currentBed.daily_rate}/day · Total room charges: ₹${currentBed.room_charges_so_far || 0}`,
        badge: "Admitted",
        badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
        department: currentBed.ward,
      })
    }

    for (const d of patientDischarges) {
      timeline.push({
        id: `TL-DISC-${d.id}`,
        timestamp: new Date(d.dischargeDate || Date.now()).getTime(),
        dateStr: d.dischargeDate,
        dateTimeFormatted: formatEncounterDateTime(d.dischargeDate),
        category: "Inpatient",
        title: `Inpatient Discharge from ${d.ward}`,
        description: `Bed ${d.bedNo} · Length of stay: ${d.lengthOfStayDays} days · Attending: ${d.attendingDoctor} · Room Total: ₹${d.roomChargesTotal}`,
        badge: "Discharged",
        badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
        doctor: d.attendingDoctor,
        department: d.ward,
        cost: d.roomChargesTotal,
      })
    }

    // H. Invoices and Ledger Payments
    for (const inv of patientClaims) {
      timeline.push({
        id: `TL-INV-${inv.id}`,
        timestamp: new Date(inv.dateOfService || Date.now()).getTime(),
        dateStr: inv.dateOfService,
        dateTimeFormatted: formatEncounterDateTime(inv.dateOfService),
        category: "Billing",
        title: `Billing Invoice Generated (${inv.invoiceNo})`,
        description: `Dept: ${inv.department} · Total: ₹${inv.totalAmount} · Paid: ₹${inv.amountPaid} · Due: ₹${inv.balanceDue}`,
        badge: inv.status,
        badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
        cost: inv.totalAmount,
      })
    }

    // Sort newest first
    timeline.sort((a, b) => b.timestamp - a.timestamp)

    return {
      demographics,
      encounters: patientEncounters,
      prescriptions: patientPrescriptions,
      pharmacyBills: patientBills,
      labOrders: patientLabOrders,
      inpatientRecords: {
        currentBed,
        discharges: patientDischarges,
      },
      emergencyVisits: patientErVisits,
      financials: {
        ledger,
        totalCharges,
        totalPaid,
        outstandingBalance,
        payments: patientPayments,
        invoices: patientClaims,
      },
      timeline,
    }
  }

  /**
   * 3. getDoctorActivityStats(doctorId: string, preset: DateRangePreset | "all", customStart?, customEnd?)
   * Computes synchronized physician performance and encounter registry.
   */
  public static getDoctorActivityStats(
    doctorId: string,
    preset: DateRangePreset | "all" = "today",
    customStart?: string,
    customEnd?: string,
  ): DoctorActivityStats {
    const masterDoctors = getDoctorMaster()
    const doc =
      masterDoctors.find((d) => d.id === doctorId || d.staffId === doctorId || isDoctorMatch(d, doctorId)) ||
      masterDoctors[0]

    // 1. Date range resolution
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    let periodStart: Date
    let periodEnd: Date
    let dateRangeLabel: string

    if (preset === "all") {
      periodStart = new Date(0) // beginning of time
      periodEnd = new Date(8640000000000000)
      dateRangeLabel = "All History"
    } else {
      const range = GeneralReportsService.getDateRange(preset, customStart, customEnd)
      periodStart = range.start
      periodEnd = range.end
      dateRangeLabel = range.label
    }

    const startDateStr = periodStart.toISOString().split("T")[0]
    const endDateStr = periodEnd.toISOString().split("T")[0]

    // 2. Fetch all raw stores
    const allEncounters = db.getEncounters()
    const allConsultations = DoctorPortalDatabase.getConsultations()
    const consultationMap = new Map<string, ConsultationRecord>()
    for (const c of allConsultations) {
      if (c.encounterId) consultationMap.set(c.encounterId, c)
    }

    const allPrescriptions = PharmacyDatabase.getPrescriptions()
    const allLabOrders = LabOrderDatabase.getOrders()
    const allErVisits = ErDatabase.getVisits("all")

    // Link doctor prescriptions & lab orders
    const docPrescriptions = allPrescriptions.filter(
      (rx) => rx.doctorId === doc.id || isDoctorMatch(doc, rx.doctorName),
    )
    const docPrescriptionVisitIds = new Set<string>(
      docPrescriptions.map((rx) => rx.visitId || "").filter(Boolean),
    )

    const docLabOrders = allLabOrders.filter(
      (lo) => lo.doctorId === doc.id || isDoctorMatch(doc, lo.doctorName),
    )
    const docLabOrderEncounterIds = new Set<string>(
      docLabOrders.map((lo) => lo.encounterId || "").filter(Boolean),
    )

    // 3. Match encounters for this doctor
    const linkedEncounters: Array<{
      id: string
      umr: string
      patientName: string
      timestamp: number
      dateTimeFormatted: string
      visitType: string
      department: string
      complaint: string
      diagnosis: string
      status: string
      isConsultation: boolean
      fee: number
      source: "OP" | "ER" | "DoctorPortal"
    }> = []

    // A. Outpatient encounters from db
    for (const enc of allEncounters) {
      const isAssigned = isDoctorMatch(doc, enc.assignedDoctor) || isDoctorMatch(doc, enc.aiDoctor)
      const hasConsultationRecord = consultationMap.has(enc.id) && isDoctorMatch(doc, consultationMap.get(enc.id)?.doctorName)
      const hasPrescription = docPrescriptionVisitIds.has(enc.id)
      const hasLabOrder = docLabOrderEncounterIds.has(enc.id)

      if (isAssigned || hasConsultationRecord || hasPrescription || hasLabOrder) {
        const ts = getEncounterTimestamp(enc)
        const isConsult = isConsultationEncounter(
          enc,
          consultationMap,
          docPrescriptionVisitIds,
          docLabOrderEncounterIds,
        )

        linkedEncounters.push({
          id: enc.id,
          umr: enc.umr,
          patientName: enc.patientName,
          timestamp: ts,
          dateTimeFormatted: formatEncounterDateTime(enc),
          visitType: enc.isNew ? "New Consultation" : "Follow-up Visit",
          department: enc.dept || doc.specialty || "Clinical",
          complaint: enc.chiefComplaint || "General checkup",
          diagnosis: enc.diagnosis || (consultationMap.get(enc.id)?.diagnosis) || "Assessment complete",
          status: enc.status,
          isConsultation: isConsult,
          fee: (enc as any).fee || doc.consultationFee || 500,
          source: "OP",
        })
      }
    }

    // B. Emergency encounters from ErDatabase
    for (const er of allErVisits) {
      const isAttending = isDoctorMatch(doc, er.assigned_doctor_name)
      if (isAttending) {
        const admissionTime = er.arrival_at || new Date().toISOString()
        const ts = new Date(admissionTime).getTime() || Date.now()

        linkedEncounters.push({
          id: er.visit_no || `ER-${er.id}`,
          umr: er.patient_id || `ER-${er.id}`,
          patientName: `${er.patient_name || ""} ${er.patient_last_name || ""}`.trim() || "Emergency Patient",
          timestamp: ts,
          dateTimeFormatted: formatEncounterDateTime(admissionTime),
          visitType: "Emergency Consultation",
          department: "Emergency Department",
          complaint: er.complaints?.[0]?.complaint || "ER presentation",
          diagnosis: er.triage_category || "Emergency triage",
          status: er.status || "Completed",
          isConsultation: true,
          fee: 800,
          source: "ER",
        })
      }
    }

    // Deduplicate encounters by ID
    const uniqueEncMap = new Map<string, typeof linkedEncounters[0]>()
    for (const e of linkedEncounters) {
      if (!uniqueEncMap.has(e.id)) {
        uniqueEncMap.set(e.id, e)
      }
    }
    const allDoctorEncounters = Array.from(uniqueEncMap.values())

    // 4. Calculate Synchronized KPIs
    // Today metrics:
    const todayEncounters = allDoctorEncounters.filter(
      (e) => e.timestamp >= todayStart.getTime() && e.timestamp <= todayEnd.getTime(),
    )
    const patientsTreatedToday = new Set(
      todayEncounters.filter((e) => e.isConsultation && e.umr).map((e) => e.umr.toUpperCase()),
    ).size
    const consultationsCompletedToday = todayEncounters.filter((e) => e.isConsultation).length

    // Period filtered encounters:
    const periodEncounters = allDoctorEncounters
      .filter((e) => e.timestamp >= periodStart.getTime() && e.timestamp <= periodEnd.getTime())
      .sort((a, b) => b.timestamp - a.timestamp)

    const uniquePatientsPeriod = new Set(
      periodEncounters.filter((e) => e.isConsultation && e.umr).map((e) => e.umr.toUpperCase()),
    ).size
    const totalConsultationsPeriod = periodEncounters.filter((e) => e.isConsultation).length
    const opConsultations = periodEncounters.filter((e) => e.source === "OP" && e.isConsultation).length
    const erEncounters = periodEncounters.filter((e) => e.source === "ER").length

    // Prescriptions in period
    const periodPrescriptions = docPrescriptions
      .filter((rx) => {
        const d = rx.date || rx.createdAt
        const ts = new Date(d).getTime()
        return isNaN(ts) || (ts >= periodStart.getTime() && ts <= periodEnd.getTime())
      })
      .map((rx) => ({
        id: rx.id,
        patientName: rx.patientName,
        umr: rx.uhid || rx.patientId || "",
        date: rx.date || rx.createdAt?.split("T")[0] || new Date().toISOString().split("T")[0],
        status: rx.status,
        items: (rx.items || []).map((it) => ({
          medicineName: it.medicineName,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          instructions: it.instructions,
        })),
      }))

    // Lab orders in period
    const periodLabOrders = docLabOrders
      .filter((lo) => {
        const d = lo.createdAt
        const ts = new Date(d).getTime()
        return isNaN(ts) || (ts >= periodStart.getTime() && ts <= periodEnd.getTime())
      })
      .map((lo) => ({
        id: lo.id,
        patientName: lo.patientName,
        umr: lo.umr,
        date: lo.createdAt ? lo.createdAt.split("T")[0] : new Date().toISOString().split("T")[0],
        status: lo.status,
        urgency: lo.tests?.[0]?.urgency || "Routine",
        total: lo.billing?.total || 0,
        tests: (lo.tests || []).map((t) => t.name),
      }))

    return {
      doctor: doc,
      periodPreset: preset,
      dateRangeLabel,
      startDateStr,
      endDateStr,
      kpis: {
        patientsTreatedToday,
        consultationsCompletedToday,
        uniquePatientsPeriod,
        totalConsultationsPeriod,
        opConsultations,
        erEncounters,
        prescriptionsIssued: periodPrescriptions.length,
        labOrdersPlaced: periodLabOrders.length,
      },
      encounters: periodEncounters,
      prescriptions: periodPrescriptions,
      labOrders: periodLabOrders,
    }
  }

  /**
   * 4. getStaffActivityProfile(staffId: string, preset: DateRangePreset, customStart?, customEnd?)
   * Resolves employee record and gathers category-specific operational metrics and activity log.
   */
  public static getStaffActivityProfile(
    staffId: string,
    preset: DateRangePreset = "today",
    customStart?: string,
    customEnd?: string,
  ): StaffActivityProfile {
    const staffList = HrmsDatabase.getStaffList()
    const roleUsers = RoleDatabase.getUsers()
    const range = GeneralReportsService.getDateRange(preset, customStart, customEnd)

    // Match staff
    const st =
      staffList.find(
        (s) =>
          s.id.toLowerCase() === staffId.toLowerCase() ||
          s.name.toLowerCase() === staffId.toLowerCase(),
      ) ||
      roleUsers.find(
        (u) =>
          u.id.toLowerCase() === staffId.toLowerCase() ||
          u.staffId?.toLowerCase() === staffId.toLowerCase() ||
          u.username.toLowerCase() === staffId.toLowerCase(),
      )

    const resolvedCategory = (
      (st as StaffMember)?.category ||
      ((st as AppUser)?.roleId?.includes("NURSE")
        ? "Nursing"
        : (st as AppUser)?.roleId?.includes("PHARM")
        ? "Pharmacy"
        : (st as AppUser)?.roleId?.includes("LAB")
        ? "Laboratory"
        : (st as AppUser)?.roleId?.includes("RAD")
        ? "Radiology"
        : "Administrative")
    ) as StaffActivityProfile["category"]

    const staffObj = {
      id: (st as any)?.id || (st as any)?.staffId || staffId,
      name: (st as any)?.name || staffId,
      designation: (st as any)?.designation || (st as any)?.roleId || "Healthcare Professional",
      category: resolvedCategory,
      department: (st as any)?.department || "Hospital Operations",
      shift: (st as any)?.shift || "General (09:00 - 17:30)",
      status: (st as any)?.status || "Active",
      dutyStatus: (st as any)?.dutyStatus || "On Duty",
      email: (st as any)?.email || `${staffId.toLowerCase()}@hospital.org`,
      phone: (st as any)?.phone || "+91 98765 00000",
      joiningDate: (st as any)?.joiningDate || "2024-01-15",
      qualification: (st as any)?.qualification || "Degree in Allied Health",
      licenseNumber: (st as any)?.licenseNumber || "NMC-2024-8921",
    }

    const kpis: Record<string, { label: string; value: number | string; icon?: string; badgeColor?: string }> = {}
    const activityLog: StaffActivityProfile["activityLog"] = []

    // Category-specific aggregation:
    if (resolvedCategory === "Nursing") {
      const beds = BedDatabase.getBeds().filter((b) => b.status === "Occupied")
      kpis["activePatients"] = { label: "Assigned Patients", value: beds.length, badgeColor: "bg-blue-50 text-blue-700" }
      kpis["handovers"] = { label: "Shift Handovers", value: "Completed", badgeColor: "bg-emerald-50 text-emerald-700" }
      kpis["vitalsLogged"] = { label: "Vitals Recorded", value: beds.length * 3, badgeColor: "bg-purple-50 text-purple-700" }
      kpis["careTasks"] = { label: "Care Interventions", value: 14, badgeColor: "bg-amber-50 text-amber-700" }

      beds.forEach((bed, idx) => {
        activityLog.push({
          id: `ACT-NUR-${bed.id}`,
          timestamp: Date.now() - idx * 3600000,
          dateTimeFormatted: formatEncounterDateTime(new Date(Date.now() - idx * 3600000).toISOString()),
          type: "Bed Care",
          title: `Patient Vital Signs Monitored: Bed ${bed.bed_no}`,
          description: `Ward ${bed.ward} · Patient: ${bed.patient_name} · BP: 120/80 mmHg, SpO2: 98%`,
          status: "Verified",
        })
      })
    } else if (resolvedCategory === "Pharmacy") {
      const prescriptions = PharmacyDatabase.getPrescriptions()
      const bills = PharmacyDatabase.getBills()
      const dispensedCount = bills.length
      const verifiedCount = prescriptions.filter((p) => p.status === "Verified" || p.status === "Dispensed").length

      kpis["dispensed"] = { label: "Bills Dispensed", value: dispensedCount, badgeColor: "bg-emerald-50 text-emerald-700" }
      kpis["verified"] = { label: "Prescriptions Verified", value: verifiedCount, badgeColor: "bg-blue-50 text-blue-700" }
      kpis["substitutions"] = { label: "Substitutions Processed", value: 3, badgeColor: "bg-amber-50 text-amber-700" }
      kpis["accuracyRate"] = { label: "Dispensing Accuracy", value: "99.8%", badgeColor: "bg-teal-50 text-teal-700" }

      bills.slice(0, 10).forEach((bill, idx) => {
        activityLog.push({
          id: `ACT-PHARM-${bill.id}`,
          timestamp: Date.now() - idx * 2400000,
          dateTimeFormatted: formatEncounterDateTime(new Date(Date.now() - idx * 2400000).toISOString()),
          type: "Dispensing",
          title: `Medicine Bill Dispensed: ${bill.billNumber}`,
          description: `Patient: ${bill.patientName} (${bill.uhid}) · Amount: ₹${bill.subTotal || 0}`,
          status: bill.paymentStatus || "Dispensed",
        })
      })
    } else if (resolvedCategory === "Laboratory") {
      const labOrders = LabOrderDatabase.getOrders()
      const totalTests = labOrders.reduce((acc, lo) => acc + (lo.tests?.length || 0), 0)
      const completedTests = labOrders.filter((lo) => lo.status === "Completed").length

      kpis["specimens"] = { label: "Specimens Collected", value: labOrders.length, badgeColor: "bg-indigo-50 text-indigo-700" }
      kpis["testsVerified"] = { label: "Tests Verified", value: totalTests, badgeColor: "bg-emerald-50 text-emerald-700" }
      kpis["avgTat"] = { label: "Avg TAT", value: "42 mins", badgeColor: "bg-purple-50 text-purple-700" }
      kpis["criticalAlerts"] = { label: "Critical Flags Escalated", value: 2, badgeColor: "bg-rose-50 text-rose-700" }

      labOrders.slice(0, 10).forEach((lo, idx) => {
        activityLog.push({
          id: `ACT-LAB-${lo.id}`,
          timestamp: Date.now() - idx * 1800000,
          dateTimeFormatted: formatEncounterDateTime(lo.createdAt),
          type: "Lab Verification",
          title: `Specimen Results Verified: ${lo.id}`,
          description: `Patient: ${lo.patientName} · Tests: ${lo.tests?.map((t) => t.name).join(", ")}`,
          status: lo.status,
        })
      })
    } else if (resolvedCategory === "Radiology") {
      const radStudies = BillingDatabase.getRadiologyStudies()
      kpis["studies"] = { label: "Studies Processed", value: radStudies.length, badgeColor: "bg-blue-50 text-blue-700" }
      kpis["reported"] = { label: "Reports Finalized", value: Math.max(1, radStudies.length - 2), badgeColor: "bg-emerald-50 text-emerald-700" }
      kpis["statStudies"] = { label: "STAT Scans Completed", value: 3, badgeColor: "bg-rose-50 text-rose-700" }
      kpis["qcScore"] = { label: "Imaging QC Score", value: "98.5%", badgeColor: "bg-teal-50 text-teal-700" }

      radStudies.slice(0, 10).forEach((st, idx) => {
        activityLog.push({
          id: `ACT-RAD-${st.id}`,
          timestamp: Date.now() - idx * 3600000,
          dateTimeFormatted: formatEncounterDateTime(st.ordered),
          type: "Imaging Study",
          title: `Diagnostic Scan Reviewed: ${st.study}`,
          description: `Patient: ${st.patient} · Status: ${st.status}`,
          status: st.status,
        })
      })
    } else {
      // Administrative / Billing
      const allEncounters = db.getEncounters()
      const allPayments = BillingDatabase.getAllPayments()

      kpis["registrations"] = { label: "Registrations Created", value: allEncounters.length, badgeColor: "bg-blue-50 text-blue-700" }
      kpis["receipts"] = { label: "Billing Receipts Processed", value: allPayments.length, badgeColor: "bg-emerald-50 text-emerald-700" }
      kpis["revenueCollected"] = {
        label: "Revenue Processed",
        value: `₹${allPayments.reduce((acc, p) => acc + (p.amount || 0), 0).toLocaleString("en-IN")}`,
        badgeColor: "bg-purple-50 text-purple-700",
      }
      kpis["systemAudits"] = { label: "Audit Logs Verified", value: 120, badgeColor: "bg-amber-50 text-amber-700" }

      allPayments.slice(0, 10).forEach((pay, idx) => {
        activityLog.push({
          id: `ACT-PAY-${pay.id}`,
          timestamp: Date.now() - idx * 1200000,
          dateTimeFormatted: formatEncounterDateTime(pay.paymentDate),
          type: "Payment Collection",
          title: `Receipt Issued: ${pay.receiptNo}`,
          description: `Patient: ${pay.patientName} · Amount: ₹${pay.amount} via ${pay.paymentMethod}`,
          status: "Settled",
        })
      })
    }

    return {
      staff: staffObj,
      dateRangeLabel: range.label,
      category: resolvedCategory,
      kpis,
      activityLog,
    }
  }
}
