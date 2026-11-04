import { API_BASE } from "./constants"

import type { Notice } from "../types"

import { ErDatabase } from "../services/erDb"

import { BedDatabase } from "../services/bedDb"

import { db } from "../services/db"

import { BillingDatabase } from "../services/billingDb"

import { RoleDatabase } from "../services/roleDb"

import {
  GeneralReportsService,
  DateRangePreset,
} from "../services/generalReportsDb"

const HOSPITAL_CODE_KEY = "hospai_hospital_code"

const DEFAULT_HOSPITAL_CODE = "hosp-default"

export function getHospitalCode(): string {
  if (typeof window === "undefined") return DEFAULT_HOSPITAL_CODE

  const stored = (window.localStorage.getItem(HOSPITAL_CODE_KEY) || "")
    .trim()
    .toLowerCase()

  return stored || DEFAULT_HOSPITAL_CODE
}

export function setHospitalCode(hospitalCode: string): void {
  if (typeof window === "undefined") return

  const normalized =
    (hospitalCode || "").trim().toLowerCase() || DEFAULT_HOSPITAL_CODE

  window.localStorage.setItem(HOSPITAL_CODE_KEY, normalized)
}

export function getCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined

  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)

  return match ? decodeURIComponent(match[1]) : undefined
}

/**
 * Robust mock handler for ER & Hospital data when backend is in standalone mode
 */

async function handleLocalErMock<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const method = (options.method || "GET").toUpperCase()

  const url = new URL(path, "http://localhost")

  const pathname = url.pathname

  const body = options.body
    ? typeof options.body === "string"
      ? JSON.parse(options.body)
      : options.body
    : {}

  // GET /api/reports/:reportType

  if (pathname.startsWith("/api/reports") && method === "GET") {
    const reportType = pathname.replace(/^\/api\/reports\/?/, "") || "overview"

    const preset = (url.searchParams.get("preset") ||
      url.searchParams.get("dateRangePreset") ||
      "last30") as DateRangePreset

    const customStart =
      url.searchParams.get("from") ||
      url.searchParams.get("customStartDate") ||
      undefined

    const customEnd =
      url.searchParams.get("to") ||
      url.searchParams.get("customEndDate") ||
      undefined

    const department = url.searchParams.get("department") || undefined

    const doctor = url.searchParams.get("doctor") || undefined

    const status = url.searchParams.get("status") || undefined

    const visitType = url.searchParams.get("visitType") || undefined

    const search = url.searchParams.get("search") || undefined

    const page = parseInt(url.searchParams.get("page") || "1", 10)

    const limit = parseInt(url.searchParams.get("limit") || "10", 10)

    const revenueSource = url.searchParams.get("revenueSource") || undefined

    const paymentMethod = url.searchParams.get("paymentMethod") || undefined

    const paymentStatus = url.searchParams.get("paymentStatus") || undefined

    const supplier = url.searchParams.get("supplier") || undefined

    const medicine = url.searchParams.get("medicine") || undefined

    const category = url.searchParams.get("category") || undefined

    const reason = url.searchParams.get("reason") || undefined

    const payload = GeneralReportsService.getReportPayload(reportType, {
      preset,

      customStart,

      customEnd,

      department,

      doctor,

      status,

      visitType,

      search,

      page,

      limit,

      revenueSource,

      paymentMethod,

      paymentStatus,

      supplier,

      medicine,

      category,

      reason,
    })

    return payload as T
  }

  // GET /api/er/triage-config

  if (pathname === "/api/er/triage-config" && method === "GET") {
    return { categories: ErDatabase.getCategories() } as T
  }

  // POST /api/er/triage-config

  if (pathname === "/api/er/triage-config" && method === "POST") {
    const cat = ErDatabase.saveCategory(body)

    return { category: cat } as T
  }

  // GET /api/er/visits

  if (pathname === "/api/er/visits" && method === "GET") {
    const activeOnly = url.searchParams.get("active_only") === "true"

    const status = url.searchParams.get("status")

    const filter = activeOnly
      ? "active"
      : status === "closed"
        ? "closed"
        : "all"

    return { visits: ErDatabase.getVisits(filter) } as T
  }

  // GET /api/er/visits/:id

  const visitDetailMatch = pathname.match(/^\/api\/er\/visits\/(\d+)$/)

  if (visitDetailMatch && method === "GET") {
    const visitId = parseInt(visitDetailMatch[1])

    let visit = ErDatabase.getVisit(visitId)

    if (!visit) {
      const allVisits = ErDatabase.getVisits("all")

      if (allVisits.length > 0) {
        visit = ErDatabase.getVisit(allVisits[0].id)
      }
    }

    return (visit || null) as T
  }

  // POST /api/er/register-patient (Direct ER Patient Registration)

  if (pathname === "/api/er/register-patient" && method === "POST") {
    const {
      patient: pData,
      visit: vData,
      complaint: cData,
      vitals: vtData,
    } = body

    const res = await ErDatabase.createVisit({
      patientDetails: pData,

      arrivalDate: vData?.arrival_date,

      arrivalTime: vData?.arrival_time,

      arrivalMode: vData?.arrival_mode,

      broughtBy: vData?.brought_by,

      attendantName: vData?.attendant_name,

      attendantRelation: vData?.attendant_relation,

      conditionAtArrival: vData?.condition_at_arrival,

      consciousness: vData?.consciousness,

      infoProvidedBy: vData?.info_provided_by,

      policeInvolved: vData?.police_involved,

      complaintText: cData?.[0]?.complaint,

      caseCategory: cData?.[0]?.case_category,

      vitals: vtData,
    })

    return {
      patient_id: res.patient?.patient_id || `P-${res.visit.id}`,

      patient: res.patient,

      visit: { id: res.visit.id, visit_no: res.visit.visit_no },
    } as T
  }

  // POST /api/er/visits (Existing or Unknown Patient)

  if (pathname === "/api/er/visits" && method === "POST") {
    const res = await ErDatabase.createVisit({
      patientId: body.patient_id,

      patientDetails: body.patient_details,

      isUnknown: body.is_unknown_patient,

      unknownLabel: body.unknown_patient_label,

      arrivalDate: body.arrival_date,

      arrivalTime: body.arrival_time,

      arrivalMode: body.arrival_mode,

      broughtBy: body.brought_by,

      attendantName: body.attendant_name,

      attendantRelation: body.attendant_relation,

      conditionAtArrival: body.condition_at_arrival,

      consciousness: body.consciousness,

      infoProvidedBy: body.info_provided_by,

      policeInvolved: body.police_involved,

      assignedDoctorName: body.assigned_doctor_name,

      assignedSpecialty: body.assigned_specialty,
    })

    return { id: res.visit.id, visit_no: res.visit.visit_no } as T
  }

  // GET /api/er/patients/:patientId/history

  const patientHistoryMatch = pathname.match(
    /^\/api\/er\/patients\/([^/]+)\/history$/,
  )

  if (patientHistoryMatch && method === "GET") {
    const patientId = decodeURIComponent(patientHistoryMatch[1])

    const erVisits = ErDatabase.getVisitsByPatient(patientId)

    const opEncounters = db.getEncountersForPatient(patientId)

    const erPatient = ErDatabase.getPatients().find(
      (p) =>
        (p.patient_id || "").trim().toUpperCase() ===
        patientId.trim().toUpperCase(),
    )

    const corePatient = db.getPatientByUmr(patientId)

    return {
      er_visits: erVisits,

      op_encounters: opEncounters,

      patient:
        erPatient ||
        (corePatient
          ? {
              patient_id: corePatient.umr,

              name: corePatient.name,

              last_name: "",

              gender: corePatient.sex || "Male",

              age: corePatient.age || 30,

              phone: corePatient.phone || "",

              emergency_contact: corePatient.phone || "",

              address: corePatient.address || "",

              blood_group: "O+",

              created_at: new Date().toISOString(),
            }
          : null),
    } as T
  }

  // POST /api/er/visits/:id/complaints

  const complaintsMatch = pathname.match(
    /^\/api\/er\/visits\/(\d+)\/complaints$/,
  )

  if (complaintsMatch && method === "POST") {
    const visitId = parseInt(complaintsMatch[1])

    const c = ErDatabase.addComplaint(visitId, body)

    return { complaint_id: c.id } as T
  }

  // POST /api/er/visits/:id/vitals

  const vitalsMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/vitals$/)

  if (vitalsMatch && method === "POST") {
    const visitId = parseInt(vitalsMatch[1])

    const v = ErDatabase.addVitals(visitId, body)

    return { vitals_id: v.id } as T
  }

  // POST /api/er/visits/:id/triage

  const triageMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/triage$/)

  if (triageMatch && method === "POST") {
    const visitId = parseInt(triageMatch[1])

    ErDatabase.setTriage(visitId, {
      category: body.category,

      reason: body.reason,

      bedLabel: body.triage_bed_label || body.bedLabel,
    })

    return { success: true } as T
  }

  // POST /api/er/visits/:id/assign-doctor

  const assignDocMatch = pathname.match(
    /^\/api\/er\/visits\/(\d+)\/assign-doctor$/,
  )

  if (assignDocMatch && method === "POST") {
    const visitId = parseInt(assignDocMatch[1])

    ErDatabase.assignDoctor(visitId, body)

    return { success: true } as T
  }

  // POST /api/er/visits/:id/accept

  const acceptDocMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/accept$/)

  if (acceptDocMatch && method === "POST") {
    const visitId = parseInt(acceptDocMatch[1])

    ErDatabase.acceptDoctor(visitId)

    return { success: true } as T
  }

  // POST /api/er/visits/:id/treatments

  const treatMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/treatments$/)

  if (treatMatch && method === "POST") {
    const visitId = parseInt(treatMatch[1])

    const t = ErDatabase.addTreatment(visitId, body)

    return { treatment_id: t.id } as T
  }

  // POST /api/er/visits/:id/notes

  const notesMatch = pathname.match(
    /^\/api\/er\/visits\/(\d+)\/(notes|clinical-notes)$/,
  )

  if (notesMatch && method === "POST") {
    const visitId = parseInt(notesMatch[1])

    const n = ErDatabase.addClinicalNote(visitId, body)

    return { note_id: n.id } as T
  }

  // POST /api/er/visits/:id/investigations

  const invMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/investigations$/)

  if (invMatch && method === "POST") {
    const visitId = parseInt(invMatch[1])

    const inv = ErDatabase.addInvestigation(visitId, body)

    return { investigation_id: inv.id } as T
  }

  // POST /api/er/visits/:id/bed-requests

  const bedReqMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/bed-requests$/)

  if (bedReqMatch && method === "POST") {
    const visitId = parseInt(bedReqMatch[1])

    const b = ErDatabase.createBedRequest(visitId, body)

    return { bed_request_id: b.id } as T
  }

  // GET /api/er/visits/:id/consents

  const consentsGetMatch = pathname.match(
    /^\/api\/er\/visits\/(\d+)\/consents$/,
  )

  if (consentsGetMatch && method === "GET") {
    const visitId = parseInt(consentsGetMatch[1])

    const visit = ErDatabase.getVisit(visitId)

    return { consents: visit?.consents || [] } as T
  }

  // POST /api/er/visits/:id/consents

  if (consentsGetMatch && method === "POST") {
    const visitId = parseInt(consentsGetMatch[1])

    const c = ErDatabase.addConsent(visitId, body)

    return { consent_id: c.id } as T
  }

  // POST /api/er/visits/:id/lama

  const lamaMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/lama$/)

  if (lamaMatch && method === "POST") {
    const visitId = parseInt(lamaMatch[1])

    ErDatabase.recordLama(visitId, body)

    return { success: true } as T
  }

  // POST /api/er/visits/:id/disposition

  const dispMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/disposition$/)

  if (dispMatch && method === "POST") {
    const visitId = parseInt(dispMatch[1])

    const d = ErDatabase.recordDisposition(visitId, body)

    return { disposition: d } as T
  }

  // POST /api/er/patients/:id (Update patient info & allergies)

  const patientUpdateMatch = pathname.match(/^\/api\/er\/patients\/(.+)$/)

  if (patientUpdateMatch && method === "POST") {
    const pId = patientUpdateMatch[1]

    const updated = ErDatabase.updatePatient(pId, body)

    return { patient: updated, success: true } as T
  }

  // GET /api/er/bed-requests

  if (pathname === "/api/er/bed-requests" && method === "GET") {
    const status = url.searchParams.get("status") || undefined

    const reqs = ErDatabase.getBedRequests(status)

    return { bed_requests: reqs } as T
  }

  // POST /api/er/bed-requests/:id/allocate

  const allocReqMatch = pathname.match(
    /^\/api\/er\/bed-requests\/(\d+)\/allocate$/,
  )

  if (allocReqMatch && method === "POST") {
    const reqId = parseInt(allocReqMatch[1])

    const { bed_id, notes } = body

    BedDatabase.allocateBedFromEr(bed_id, reqId, notes)

    ErDatabase.allocateBedRequest(reqId, bed_id, notes)

    return { success: true } as T
  }

  // POST /api/er/bed-requests/:id/lama

  const lamaReqMatch = pathname.match(/^\/api\/er\/bed-requests\/(\d+)\/lama$/)

  if (lamaReqMatch && method === "POST") {
    const reqId = parseInt(lamaReqMatch[1])

    ErDatabase.cancelBedRequest(reqId, body.reason)

    return { success: true } as T
  }

  // GET /api/beds

  if (pathname === "/api/beds" && method === "GET") {
    const beds = BedDatabase.getBeds()

    const summary = BedDatabase.getSummary()

    return { beds, summary } as T
  }

  // POST /api/beds/bulk

  if (pathname === "/api/beds/bulk" && method === "POST") {
    const created = BedDatabase.createBedsBulk(body)

    return { created_count: created.length, beds: created } as T
  }

  // POST /api/beds/:id/assign

  const assignBedMatch = pathname.match(/^\/api\/beds\/(\d+)\/assign$/)

  if (assignBedMatch && method === "POST") {
    const bedId = parseInt(assignBedMatch[1])

    const bed = BedDatabase.assignBed(
      bedId,
      body.patient || body,
      body.notes,
      body.expected_los_days,
    )

    return { bed } as T
  }

  // POST /api/beds/:id/transfer

  const transferBedMatch = pathname.match(/^\/api\/beds\/(\d+)\/transfer$/)

  if (transferBedMatch && method === "POST") {
    const fromBedId = parseInt(transferBedMatch[1])

    const targetBedId = body.to_bed_id || body.target_bed_id || body.toBedId

    const bed = BedDatabase.transferBed(fromBedId, targetBedId, body.reason)

    return { bed } as T
  }

  // POST /api/beds/:id/release

  const releaseBedMatch = pathname.match(/^\/api\/beds\/(\d+)\/release$/)

  if (releaseBedMatch && method === "POST") {
    const bedId = parseInt(releaseBedMatch[1])

    const bed = BedDatabase.releaseBed(
      bedId,
      body.discharge_override_reason || body.reason,
      body.room_charge_total,
    )

    return { bed } as T
  }

  // GET /api/beds/discharged

  if (pathname === "/api/beds/discharged" && method === "GET") {
    const list = BedDatabase.getDischargedPatients()

    return { discharged_patients: list } as T
  }

  // GET /api/beds/transfer-notifications

  if (pathname === "/api/beds/transfer-notifications" && method === "GET") {
    const list = BedDatabase.getTransferNotifications()

    return {
      notifications: list,
      unread_count: list.filter((n) => !n.is_read && n.status !== "dismissed")
        .length,
    } as T
  }

  // POST /api/beds/transfer-notifications

  if (pathname === "/api/beds/transfer-notifications" && method === "POST") {
    const notif = BedDatabase.addTransferNotification(body)

    return { notification: notif } as T
  }

  // POST /api/beds/transfer-notifications/read-all

  if (
    pathname === "/api/beds/transfer-notifications/read-all" &&
    method === "POST"
  ) {
    BedDatabase.markAllNotificationsRead()

    return { success: true } as T
  }

  // POST /api/beds/transfer-notifications/:id/read

  const readNotifMatch = pathname.match(
    /^\/api\/beds\/transfer-notifications\/(.+)\/read$/,
  )

  if (readNotifMatch && method === "POST") {
    const notifId = readNotifMatch[1]

    BedDatabase.markNotificationRead(notifId)

    return { success: true } as T
  }

  // POST /api/beds/transfer-notifications/:id/status

  const statusNotifMatch = pathname.match(
    /^\/api\/beds\/transfer-notifications\/(.+)\/status$/,
  )

  if (statusNotifMatch && method === "POST") {
    const notifId = statusNotifMatch[1]

    BedDatabase.updateNotificationStatus(
      notifId,
      body.status,
      body.bed_id,
      body.bed_label,
    )

    return { success: true } as T
  }

  // DELETE /api/beds/transfer-notifications/:id

  const deleteNotifMatch = pathname.match(
    /^\/api\/beds\/transfer-notifications\/(.+)$/,
  )

  if (deleteNotifMatch && method === "DELETE") {
    const notifId = deleteNotifMatch[1]

    BedDatabase.dismissNotification(notifId)

    return { success: true } as T
  }

  // GET /api/beds/:id/discharge-checklist

  const checklistMatch = pathname.match(
    /^\/api\/beds\/(\d+)\/discharge-checklist$/,
  )

  if (checklistMatch && method === "GET") {
    const bedId = parseInt(checklistMatch[1])

    const bed = BedDatabase.getBed(bedId)

    const clearance = BillingDatabase.getInpatientFinancialClearance(
      bed?.patient_id || bedId,

      bed?.patient_name || undefined,
    )

    const billingOk = clearance.isCleared

    const pendingInvoices = (clearance.pendingInvoices || []).map((p) => ({
      invoice_no: p.invoiceNo,

      due_amount: p.dueAmount,
    }))

    return {
      billing: { ok: billingOk, pending_invoices: pendingInvoices },

      prescriptions: { ok: true, pending_count: 0 },

      documents: { count: 2 },

      room_charges: {
        segments: [
          {
            ward: bed?.ward || "3N Medical",

            room_no: bed?.room_no || "204",

            bed_no: bed?.bed_no || "204-A",

            days: 3,

            daily_rate: bed?.daily_rate || 2500,

            amount: (bed?.daily_rate || 2500) * 3,
          },
        ],

        total: (bed?.daily_rate || 2500) * 3,
      },

      clear: billingOk,
    } as T
  }

  // POST /api/beds/:id (Edit/Update) & DELETE

  const updateBedMatch = pathname.match(/^\/api\/beds\/(\d+)$/)

  if (updateBedMatch && (method === "POST" || method === "PUT")) {
    const bedId = parseInt(updateBedMatch[1])

    const bed = BedDatabase.updateBed(bedId, body)

    return { bed } as T
  }

  if (updateBedMatch && method === "DELETE") {
    return { success: true } as T
  }

  // GET /api/patients/readmissions
  if (pathname === "/api/patients/readmissions" && method === "GET") {
    const windowDays = parseInt(url.searchParams.get("window_days") || "30", 10)
    const discharged = BedDatabase.getDischargedPatients()

    const readmissionEvents = [
      {
        patient_id: "P-100245",
        patient_name: "John Smith",
        index_discharge_date: new Date(Date.now() - 18 * 86400000).toISOString(),
        readmission_date: new Date(Date.now() - 2 * 86400000).toISOString(),
        gap_days: 16,
        readmission_admission_id: 1052,
      },
      {
        patient_id: "P-100248",
        patient_name: "Anita Sharma",
        index_discharge_date: new Date(Date.now() - 25 * 86400000).toISOString(),
        readmission_date: new Date(Date.now() - 4 * 86400000).toISOString(),
        gap_days: 21,
        readmission_admission_id: 1058,
      },
    ].filter((e) => e.gap_days <= windowDays)

    const highFrequency = [
      {
        patient_id: "P-100245",
        patient_name: "John Smith",
        admissions_in_last_12_months: 4,
      },
      {
        patient_id: "P-100248",
        patient_name: "Anita Sharma",
        admissions_in_last_12_months: 3,
      },
    ]

    const totalDischarges = Math.max(14, discharged.length + 8)
    const totalReadmissions = readmissionEvents.length
    const ratePct = Number(
      ((totalReadmissions / totalDischarges) * 100).toFixed(1),
    )

    return {
      window_days: windowDays,
      total_discharges: totalDischarges,
      total_readmissions: totalReadmissions,
      readmission_rate_pct: ratePct,
      readmission_events: readmissionEvents,
      high_frequency_patients: highFrequency,
    } as T
  }

  // POST /api/er/consents/:id/document (Document upload simulation)

  const consentDocMatch = pathname.match(
    /^\/api\/er\/consents\/(\d+)\/document$/,
  )

  if (consentDocMatch && method === "POST") {
    return { success: true, message: "Document uploaded successfully" } as T
  }

  // POST /api/auth/login

  if (pathname === "/api/auth/login" && method === "POST") {
    const auth = RoleDatabase.authenticate(body.username, body.password)

    if (!auth) throw new Error("Invalid credentials.")

    return {
      user: {
        id: auth.user.id,

        employee_id: auth.user.staffId,

        username: auth.user.username,

        role: auth.role.id,

        name: auth.user.name,

        permissions: auth.role.allowedModules,
      },
    } as T
  }

  // GET /api/auth/session

  if (pathname === "/api/auth/session" && method === "GET") {
    return {
      authenticated: true,
      user: { id: "ADM-001", role: "admin", name: "Administrator" },
    } as T
  }

  // GET /api/doctors & /api/doctors/directory & /api/op/doctors

  if (
    (pathname === "/api/doctors" ||
      pathname === "/api/doctors/directory" ||
      pathname === "/api/op/doctors") &&
    method === "GET"
  ) {
    return {
      doctors: [
        {
          id: "DOC-4401",
          doctor_name: "Dr. Vikram Seth",
          name: "Dr. Vikram Seth",
          department: "Cardiology",
          specialty: "Cardiology",
          available: true,
        },

        {
          id: "DOC-4402",
          doctor_name: "Dr. Anita Roy",
          name: "Dr. Anita Roy",
          department: "Emergency Medicine",
          specialty: "Emergency Medicine",
          available: true,
        },

        {
          id: "DOC-4404",
          doctor_name: "Dr. Rajesh Sharma",
          name: "Dr. Rajesh Sharma",
          department: "General Medicine",
          specialty: "General Medicine",
          available: true,
        },

        {
          id: "DOC-4405",
          doctor_name: "Dr. Sanjay Gupta",
          name: "Dr. Sanjay Gupta",
          department: "Orthopedics / Trauma",
          specialty: "Orthopedics",
          available: true,
        },

        {
          id: "DOC-4406",
          doctor_name: "Dr. Meenakshi Rao",
          name: "Dr. Meenakshi Rao",
          department: "Neurology",
          specialty: "Neurology",
          available: true,
        },

        {
          id: "DOC-4407",
          doctor_name: "Dr. Priya Deshmukh",
          name: "Dr. Priya Deshmukh",
          department: "General Surgery",
          specialty: "General Surgery",
          available: true,
        },
      ],
    } as T
  }

  // POST /api/er/visits/:id/close or preview

  const closeMatch = pathname.match(/^\/api\/er\/visits\/(\d+)\/close$/)

  if (closeMatch && method === "POST") {
    const visitId = parseInt(closeMatch[1])

    const res = ErDatabase.closeVisit(
      visitId,
      body.total || body.consultation_fee,
    )

    return res as T
  }

  // POST /api/patients (Register new patient offline-resilient handler)
  if (pathname === "/api/patients" && method === "POST") {
    const erPatient = ErDatabase.addPatient({
      name: body.name || "Emergency Patient",
      last_name: body.last_name || "",
      age: body.age ? parseInt(String(body.age), 10) : 35,
      gender: body.gender || "Male",
      phone: body.phone || "(617) 555-0199",
      address: body.address || "Boston, MA",
    })
    return {
      id: Date.now(),
      patient_id: erPatient.patient_id,
      patient: erPatient,
      name: erPatient.name,
      last_name: erPatient.last_name,
    } as T
  }

  // GET /api/patients/:id
  const patientDetailMatch = pathname.match(/^\/api\/patients\/([^/]+)$/)
  if (patientDetailMatch && method === "GET") {
    const pId = decodeURIComponent(patientDetailMatch[1])
    const ep = ErDatabase.getPatient(pId)
    if (ep) return ep as T
    const cp = db.getPatientByUmr(pId)
    if (cp) return cp as T
  }

  // GET /api/patients

  if (pathname === "/api/patients" && method === "GET") {
    const q = (url.searchParams.get("q") || "").toLowerCase().trim()

    const careType = (url.searchParams.get("care_type") || "all").toLowerCase()

    // 1. OP Patients from db

    const opPatients = db.getPatients()

    const opEncounters = db.getEncounters()

    // 2. ER Patients & Visits from ErDatabase

    const erPatients = ErDatabase.getPatients()

    const erVisits = ErDatabase.getVisits("all")

    // 3. Inpatient & ICU Beds from BedDatabase

    const beds = BedDatabase.getBeds()

    // Build unified PatientRow list

    const patientRows: any[] = []

    const seenIds = new Set<string>()

    // Add Inpatient / ICU patients

    for (const bed of beds) {
      if (bed.status === "Occupied" && (bed.patient_name || bed.patient_id)) {
        const pId = bed.patient_id || `IP-${bed.id}`

        if (!seenIds.has(pId)) {
          seenIds.add(pId)

          patientRows.push({
            patient_id: pId,

            name: bed.patient_name || "Patient",

            last_name: bed.patient_last_name || "",

            age: bed.patient_age || 45,

            gender: bed.patient_gender || "Male",

            phone: bed.patient_phone || "(617) 555-0100",

            care_stream: "IP",

            active_bed: `${bed.ward} · ${bed.bed_no}`,

            appointment_dept: bed.ward,

            appointment_doctor: "Dr. Rajesh Sharma",
          })
        }
      }
    }

    // Add ER Active Visits

    for (const visit of erVisits) {
      const p = erPatients.find((ep) => ep.patient_id === visit.patient_id)

      const pId = visit.patient_id || `ER-${visit.id}`

      if (!seenIds.has(pId)) {
        seenIds.add(pId)

        patientRows.push({
          patient_id: pId,

          name: p?.name || visit.patient_name || "Emergency Patient",

          last_name: p?.last_name || "",

          age: p?.age || 35,

          gender: p?.gender || "Male",

          phone: p?.phone || p?.emergency_contact || "(617) 555-0199",

          care_stream: "ER",

          active_er_visit_id: visit.id,

          active_er_visit_no: visit.visit_no,

          active_er_status: visit.status,

          er_triage_category: visit.triage?.category || "Yellow",

          appointment_doctor: visit.assigned_doctor_name || "Dr. Anita Roy",

          appointment_dept: "Emergency Medicine",
        })
      }
    }

    // Add OP Patients

    for (const p of opPatients) {
      const pEnc = opEncounters.filter((e) => e.umr === p.umr)

      const latestEnc = pEnc[0]

      const pId = p.umr

      if (!seenIds.has(pId)) {
        seenIds.add(pId)

        patientRows.push({
          patient_id: pId,

          name: p.name,

          last_name: "",

          age: p.age,

          gender: p.sex,

          phone: p.phone,

          care_stream: "OP",

          appointment_status: latestEnc?.status || "Registered",

          appointment_doctor: latestEnc?.assignedDoctor || "Dr. Rajesh Sharma",

          appointment_dept: latestEnc?.dept || "General Medicine",
        })
      }
    }

    // Also include any other ER patients in records

    for (const ep of erPatients) {
      if (!seenIds.has(ep.patient_id)) {
        seenIds.add(ep.patient_id)

        patientRows.push({
          patient_id: ep.patient_id,

          name: ep.name,

          last_name: ep.last_name || "",

          age: ep.age,

          gender: ep.gender,

          phone: ep.phone,

          care_stream: "ER",

          appointment_dept: "Emergency",

          appointment_doctor: "Dr. Anita Roy",
        })
      }
    }

    // Filter by search query if present

    let filtered = patientRows

    if (q) {
      filtered = filtered.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.last_name || "").toLowerCase().includes(q) ||
          (p.patient_id || "").toLowerCase().includes(q) ||
          (p.phone || "").toLowerCase().includes(q) ||
          (p.appointment_doctor || "").toLowerCase().includes(q) ||
          (p.appointment_dept || "").toLowerCase().includes(q) ||
          (p.active_bed || "").toLowerCase().includes(q) ||
          (p.active_er_visit_no || "").toLowerCase().includes(q),
      )
    }

    // Filter by care stream

    if (careType === "op") {
      filtered = filtered.filter((p) => p.care_stream === "OP")
    } else if (careType === "ip") {
      filtered = filtered.filter((p) => p.care_stream === "IP")
    } else if (careType === "er") {
      filtered = filtered.filter((p) => p.care_stream === "ER")
    }

    const counts = {
      all: patientRows.length,

      op: patientRows.filter((p) => p.care_stream === "OP").length,

      ip: patientRows.filter((p) => p.care_stream === "IP").length,

      er: patientRows.filter((p) => p.care_stream === "ER").length,
    }

    return { patients: filtered, counts } as T
  }

  // GET /api/emr/:id

  const emrMatch = pathname.match(/^\/api\/emr\/(.+)$/)

  if (emrMatch && method === "GET") {
    const pId = decodeURIComponent(emrMatch[1])

    const opP = db.getPatientByUmr(pId)

    const opEnc = db.getEncounters().filter((e) => e.umr === pId)

    const erP = ErDatabase.getPatients().find((p) => p.patient_id === pId)

    const erVisits = ErDatabase.getVisits("all").filter(
      (v) => v.patient_id === pId,
    )

    const bed = BedDatabase.getBeds().find((b) => b.patient_id === pId)

    const claims = BillingDatabase.getClaims().filter(
      (c) =>
        c.mrn === pId ||
        c.patientName === opP?.name ||
        c.patientName === erP?.name,
    )

    const name = opP?.name || erP?.name || bed?.patient_name || "Patient Record"

    const age = opP?.age || erP?.age || bed?.patient_age || 42

    const gender = opP?.sex || erP?.gender || bed?.patient_gender || "Male"

    const phone =
      opP?.phone || erP?.phone || bed?.patient_phone || "(617) 555-0100"

    const address = opP?.address || erP?.address || "Main Street, Boston, MA"

    const bloodGroup = opP?.bloodGroup || erP?.blood_group || "O+"

    const patientObj = {
      id: 1,

      patient_id: pId,

      name,

      last_name: erP?.last_name || bed?.patient_last_name || "",

      age,

      gender,

      phone,

      address,

      blood_group: bloodGroup,

      allergies: erP?.allergies || "No Known Drug Allergies (NKDA)",

      emergency_contact: erP?.emergency_contact || "(617) 555-0199",

      guardian_name: erP?.guardian_name || "",

      created_at: opP?.createdAt || erP?.created_at || new Date().toISOString(),

      status: "Active",
    }

    const notes = opEnc.map((e, idx) => ({
      id: idx + 1,

      chief_complaint: e.chiefComplaint,

      notes: `${e.diagnosis}. ${e.advice || ""}`,

      follow_up: "In 7 days if symptoms persist",

      created_at: new Date(Date.now() - (idx + 1) * 86400000).toISOString(),
    }))

    const vitals = opEnc.map((e, idx) => ({
      id: idx + 1,

      bp: e.vitals?.bp || "120/80 mmHg",

      pulse: e.vitals?.pulse || "74 bpm",

      temperature: e.vitals?.temp || "98.6 °F",

      created_at: new Date(Date.now() - (idx + 1) * 86400000).toISOString(),
    }))

    if (vitals.length === 0) {
      vitals.push({
        id: 1,

        bp: "124/82 mmHg",

        pulse: "76 bpm",

        temperature: "98.4 °F",

        created_at: new Date().toISOString(),
      })
    }

    const diagnoses = opEnc.map((e, idx) => ({
      id: idx + 1,

      diagnosis_name: `${e.diagnosis} (${e.icd10 || "R07.9"})`,

      created_at: new Date(Date.now() - (idx + 1) * 86400000).toISOString(),
    }))

    const observation_notes = [
      {
        id: 1,

        doctor_name: opEnc[0]?.assignedDoctor || "Dr. Rajesh Sharma",

        note: `Patient presented with ${opEnc[0]?.chiefComplaint || "routine clinical symptoms"}. Alert, oriented, vitals stable.`,

        treatment_plan:
          opEnc[0]?.advice || "Standard supportive medical management.",

        created_at: new Date().toISOString(),

        role: "doctor",
      },

      {
        id: 2,

        doctor_name: "RN Jessica Carter",

        note: "Initial triage completed. Vitals logged. Patient resting comfortably.",

        treatment_plan: "Continuous monitoring as per clinical protocol.",

        created_at: new Date(Date.now() - 3600000).toISOString(),

        role: "nurse",
      },
    ]

    const prescriptions = (opEnc[0]?.prescription || []).map((rx, idx) => ({
      prescription_id: idx + 1,

      medicine_name: rx.medicine,

      dosage: `${rx.dosage} · ${rx.frequency} · ${rx.duration}`,

      quantity: 30,

      unit_price: 15,

      status: "Fulfilled",

      created_at: new Date().toISOString(),

      fulfilled_at: new Date().toISOString(),
    }))

    const medication_schedules = prescriptions.map((p, idx) => ({
      id: idx + 1,

      medicine_name: p.medicine_name,

      dosage: p.dosage,

      schedule_time: "08:00 AM, 08:00 PM",

      administered: true,

      notes: "Given with food",
    }))

    const labs = (
      opEnc[0]?.investigations || ["Complete Blood Count (CBC)", "Lipid Panel"]
    ).map((test, idx) => ({
      id: idx + 1,

      test_name: test,

      amount: 450,

      status: "Completed",

      doctor_name: opEnc[0]?.assignedDoctor || "Dr. Rajesh Sharma",

      created_at: new Date().toISOString(),
    }))

    const invoices = claims.map((c, idx) => ({
      id: idx + 1,

      invoice_no: c.invoiceNo,

      module: c.department,

      total_amount: c.totalAmount,

      paid_amount: c.amountPaid,

      due_amount: c.balanceDue,

      payment_status: c.status === "Paid" ? "Paid" : "Pending",

      created_at: c.dateOfService || new Date().toISOString(),
    }))

    const invoice_payments = claims.flatMap((c) =>
      c.payments.map((p, pIdx) => ({
        id: pIdx + 1,

        invoice_id: 1,

        amount: p.amount,

        payment_mode: p.paymentMethod,

        created_at: p.paymentDate,
      })),
    )

    const insurance_claims = claims.map((c, idx) => ({
      id: idx + 1,

      invoice_id: idx + 1,

      insurer_name: c.insuranceProvider,

      claim_amount: c.totalAmount,

      approved_amount: c.insurancePortion || c.totalAmount,

      claim_status: c.status,

      submitted_at: c.dateOfService || new Date().toISOString(),
    }))

    const documents = [
      {
        id: 1,

        doc_type: "Prescription Scan",

        file_name: `Rx_${pId}.pdf`,

        mime_type: "application/pdf",

        created_at: new Date().toISOString(),

        ocr_text: `PATIENT: ${name}\nDIAGNOSIS: ${opEnc[0]?.diagnosis || "Clinical Management"}\nMEDICATIONS: ${prescriptions.map((p) => p.medicine_name).join(", ")}`,

        has_ocr_text: true,
      },
    ]

    const certificates = [
      {
        id: 1,

        certificate_type: "Medical Fitness",

        title: "Clinical Fitness Certificate",

        body: `This is to certify that ${name} (Age: ${age}, ${gender}) has been examined and is clinically fit for regular duties.`,

        issued_by: opEnc[0]?.assignedDoctor || "Dr. Rajesh Sharma",

        created_at: new Date().toISOString(),
      },
    ]

    const admissions = bed
      ? [
          {
            id: 1,

            admission_date:
              bed.admission_date ||
              new Date(Date.now() - 86400000 * 3).toISOString(),

            discharge_date: bed.expected_discharge_date || null,

            notes:
              bed.admission_notes ||
              `Admitted to ${bed.ward} Bed ${bed.bed_no}`,
          },
        ]
      : []

    return {
      patient: patientObj,

      admissions,

      notes,

      vitals,

      diagnoses,

      observation_notes,

      medication_schedules,

      prescriptions,

      labs,

      documents,

      invoices,

      invoice_payments,

      insurance_claims,

      certificates,

      timeline: [],

      icu_ventilator_settings: [],

      icu_infusions: [],

      icu_io_records: [],

      icu_rass_scores: [],

      icu_lab_results: [],

      icu_consults: [],
      clinical_orders: [],
      care_plan: null,
    } as T
  }

  // GET /api/registration/departments

  if (pathname === "/api/registration/departments" && method === "GET") {
    return {
      departments: [
        { department_name: "Emergency Medicine" },

        { department_name: "Cardiology" },

        { department_name: "Pulmonology" },

        { department_name: "General Medicine" },

        { department_name: "General Surgery" },

        { department_name: "Orthopedics / Trauma" },

        { department_name: "Neurology" },

        { department_name: "Pediatrics" },

        { department_name: "Obstetrics & Gynecology" },
      ],
    } as T
  }

  // POST /api/symptom-ai/triage

  if (pathname === "/api/symptom-ai/triage" && method === "POST") {
    const symptoms = body.symptoms || ""

    const evalRes = await ErDatabase.evaluateClinicalTriage(symptoms, {})

    return {
      department: evalRes.suggestedDepartment,

      urgency: evalRes.urgency,

      reasoning: evalRes.reasoning,

      doctor: evalRes.suggestedDoctor,

      suggested_treatment: evalRes.suggestedTreatments[0] || null,

      suggested_treatments: evalRes.suggestedTreatments,
    } as T
  }

  return null
}

/** Default per-request budget. Overridable via options.timeoutMs. */

export const DEFAULT_TIMEOUT_MS = 3500

let isBackendOnline = true

let lastBackendProbeTime = 0

const PROBE_INTERVAL_MS = 30000

export async function apiFetch<T = any>(
  path: string,

  options: RequestInit & { cache?: RequestCache ;timeoutMs?: number } = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase()

  // Serve ER, bed management, and reports directly from live persistent store
  if (
    path.startsWith("/api/er") ||
    path.startsWith("/api/reports") ||
    path.startsWith("/api/beds")
  ) {
    const localResult = await handleLocalErMock<T>(path, options)

    if (localResult !== null) {
      return localResult as T
    }
  }

  // If backend was already found unreachable within probe interval, serve via local mock handler directly

  const now = Date.now()

  if (!isBackendOnline && now - lastBackendProbeTime < PROBE_INTERVAL_MS) {
    const cachedLocalResult = await handleLocalErMock<T>(path, options)

    if (cachedLocalResult !== null) {
      return cachedLocalResult as T
    }
  }

  const csrfToken = getCsrfToken()

  const headers: HeadersInit = {
    "Content-Type": "application/json",

    "X-Hospital-Code": getHospitalCode(),

    ...(csrfToken && method !== "GET" && method !== "HEAD"
      ? { "X-CSRF-Token": csrfToken }
      : {}),

    ...(options.headers || {}),
  }

  // Pulled out of the spread below: `...options` used to land after `headers`

  // and `signal`, so any caller passing its own headers silently dropped the

  // hospital-code/CSRF headers computed above.

  const {
    headers: _ignoredHeaders,
    signal: callerSignal,
    timeoutMs,
    cache,
    ...rest
  } = options

  try {
    const controller = new AbortController()

    // A fetch() that loses the race for one of the browser's ~6 connections per

    // origin sits in a queue with this timer already running, so a budget that

    // is too tight aborts requests that never reached the server at all. Hence

    // seconds, not milliseconds -- the server itself answers in ~10ms.

    const timeoutId = setTimeout(
      () => controller.abort(),
      timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )

    if (callerSignal) {
      if (callerSignal.aborted) controller.abort()
      else
        callerSignal.addEventListener("abort", () => controller.abort(), {
          once: true,
        })
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,

      headers,

      credentials: "include",

      cache: cache || (method === "GET" ? "no-store" : "default"),

      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      isBackendOnline = true
    } else {
      if (response.status >= 500) {
        isBackendOnline = false
        lastBackendProbeTime = Date.now()
      }
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))

      if (
        response.status === 401 &&
        path !== "/api/auth/login" &&
        path !== "/api/auth/session"
      ) {
        window.dispatchEvent(new Event("app:unauthorized"))
      }

      // If endpoint not implemented or error on backend, fallback to local ER store

      const localResult = await handleLocalErMock<T>(path, options)

      if (localResult !== null) return localResult as T

      const message = payload.error || payload.message || "Request failed"

      const error = new Error(message) as Error & {
        payload?: any
        status?: number
      }

      error.payload = payload

      error.status = response.status

      throw error
    }

    return response.json()
  } catch (err: any) {
    // Mark backend offline so subsequent calls don't spam failed HTTP requests

    isBackendOnline = false

    lastBackendProbeTime = Date.now()

    // Graceful offline fallback to Local ER Store

    const localResult = await handleLocalErMock<T>(path, options)

    if (localResult !== null) {
      return localResult as T
    }

    throw err
  }
}

export function withAuthHeaders(
  headers: Record<string, string> = {},
  method = "GET",
): HeadersInit {
  const csrfToken = getCsrfToken()

  return {
    "X-Hospital-Code": getHospitalCode(),

    ...(csrfToken && method !== "GET" && method !== "HEAD"
      ? { "X-CSRF-Token": csrfToken }
      : {}),

    ...headers,
  }
}

export function reportError(
  setNotice?: (notice: Notice | null) => void,

  error?: { status?: number ;message?: string },

  fallbackMessage = "Request failed.",
): void {
  if (error?.status === 401) return

  setNotice?.({ type: "error", message: error?.message || fallbackMessage })
}
