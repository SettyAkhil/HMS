import React, { useState, useEffect, useMemo } from "react"
import { ACTIVE_DOCTORS, MasterDoctor } from "../services/doctorMaster"
import { doesDoctorMatchEncounter, isUnassignedDoctor } from "../services/doctorPortalDb"
import { notifyPatientCalledToNurse } from "../services/patientMessaging"
import { Icon } from "./icons"
import { db, DBOPEncounter, DBPatient } from "../services/db"

interface OPManagementProps {
  onNavigateToOPWorkflow?: (encId: string, step?: number) => void
  onNavigateToNurseStation?: () => void
  staffName?: string
  onNavigateToDoctorWorkflow?: (encId: string) => void
  onNavigateToQueue?: (dept?: string) => void
  onNavigateToOPRegistration?: () => void
  onNavigateToOPDProcedures?: () => void
}

interface DepartmentCapacity {
  name: string
  code: string
  headDoctor: string
  activeDoctors: number
  totalDoctors: number
  rooms: string[]
  capacityThreshold: number
  doctors: MasterDoctor[]
  totalEncounters?: number
  waitingCount?: number
  inConsultCount?: number
  completedCount?: number
  loadPercentage?: number
  status?: string
  encounters?: DBOPEncounter[]
}

/** Statuses considered awaiting triage at Nurse Station */
const AWAITING_VITALS_STATUSES: DBOPEncounter["status"][] = [
  "Registered",
  "Symptoms Captured",
  "AI Recommended",
  "Awaiting Doctor",
  "Doctor Assigned",
]

// Helper: Calculate NEWS2 Early Warning Score from Vitals
function calculateNEWS2(vitals?: {
  bp: string
  pulse: string
  temp: string
  spo2: string
}): { score: number ;risk: "Low" | "Medium" | "High" } {
  if (!vitals || !vitals.bp) return { score: 0, risk: "Low" }
  let score = 0

  // Pulse (bpm)
  const pulse = parseInt(vitals.pulse) || 75
  if (pulse <= 40 || pulse >= 131) score += 3
  else if (pulse >= 111) score += 2
  else if (pulse <= 50 || pulse >= 91) score += 1

  // Temp (F)
  const tempF = parseFloat(vitals.temp) || 98.6
  if (tempF < 95.0) score += 3
  else if (tempF >= 102.2) score += 2
  else if (tempF <= 96.8 || tempF >= 100.4) score += 1

  // SpO2 (%)
  const spo2 = parseInt(vitals.spo2) || 98
  if (spo2 <= 91) score += 3
  else if (spo2 <= 93) score += 2
  else if (spo2 <= 95) score += 1

  // BP Systolic
  const bpSys = parseInt((vitals.bp || "").split("/")[0]) || 120
  if (bpSys <= 90 || bpSys >= 220) score += 3
  else if (bpSys <= 100) score += 2
  else if (bpSys <= 110) score += 1

  let risk: "Low" | "Medium" | "High" = "Low"
  if (score >= 7) risk = "High"
  else if (score >= 5) risk = "Medium"

  return { score, risk }
}

// Clean Doctor Name Formatter
function formatCleanDoctorName(name: string): string {
  if (!name) return "Doctor"
  // Remove multi-initial cluster bloat for clean sleek display
  return name.replace(/Dr\.\s+([A-Z]\.\s*)+/g, "Dr. ")
}

export default function OPManagement({
  onNavigateToOPWorkflow,
  onNavigateToNurseStation,
  staffName = "OP desk",
  onNavigateToDoctorWorkflow,
  onNavigateToQueue,
  onNavigateToOPRegistration,
  onNavigateToOPDProcedures,
}: OPManagementProps) {
  // DB state & subscription
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const [patients, setPatients] = useState<DBPatient[]>([])

  // View state
  const [activeTab, setActiveTab] =
    useState<
      "patient_flow" | "unassigned_pool" | "doctor_chambers" | "department_capacity"
    >("patient_flow")
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("All")
  const [selectedStatusFilter, setSelectedStatusFilter] =
    useState<string>("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [chamberFilterActiveOnly, setChamberFilterActiveOnly] = useState(false)

  // Modals
  const [selectedDeptRoster, setSelectedDeptRoster] =
    useState<DepartmentCapacity | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [selectedJourneyEncounter, setSelectedJourneyEncounter] =
    useState<DBOPEncounter | null>(null)
  const [selectedChamberDetail, setSelectedChamberDetail] =
    useState<any | null>(null)

  // Subscribe to DB
  useEffect(() => {
    const loadData = () => {
      setEncounters(db.getEncounters())
      setPatients(db.getPatients())
    }
    loadData()
    const unsubscribe = db.subscribe(loadData)
    return () => {
      unsubscribe()
    }
  }, [])

  // Department Config derived dynamically from doctor master
  const departmentRows = useMemo(() => {
    const map: Record<string, DepartmentCapacity> = {}

    ACTIVE_DOCTORS.forEach((d) => {
      const name = d.specialty || "General Medicine"
      if (!map[name]) {
        map[name] = {
          name,
          code: name.slice(0, 4).toUpperCase(),
          headDoctor: d.name,
          activeDoctors: 0,
          totalDoctors: 0,
          rooms: [],
          capacityThreshold: 0,
          doctors: [],
        }
      }
      const dept = map[name]
      if (d.section === "Main" && (!dept.rooms.length || !dept.headDoctor)) {
        dept.headDoctor = d.name
      }
      dept.totalDoctors += 1
      if (d.section === "Main") dept.activeDoctors += 1
      if (!dept.rooms.includes(d.room)) dept.rooms.push(d.room)
      dept.doctors.push(d)
      dept.capacityThreshold = Math.max(5, dept.totalDoctors * 5)
    })

    return Object.values(map)
      .map((dept) => {
        const deptEncounters = encounters.filter(
          (e) =>
            (e.dept || "").toLowerCase().includes(dept.name.toLowerCase()) ||
            (e.aiSpecialty || "")
              .toLowerCase()
              .includes(dept.name.toLowerCase()),
        )

        const waitingCount = deptEncounters.filter(
          (e) =>
            e.status === "In Queue" ||
            e.status === "Registered" ||
            e.status === "Awaiting Doctor" ||
            e.status === "Doctor Assigned",
        ).length

        const inConsultCount = deptEncounters.filter(
          (e) => e.status === "Under Consultation",
        ).length
        const completedCount = deptEncounters.filter(
          (e) =>
            e.status === "Consultation Completed" ||
            e.status === "OP Completed" ||
            e.status === "Billing Completed",
        ).length

        const loadPercentage = Math.min(
          100,
          Math.round((waitingCount / dept.capacityThreshold) * 100),
        )

        let status = "Optimal"
        if (loadPercentage > 85) status = "Overloaded"
        else if (loadPercentage > 60) status = "High"
        else if (loadPercentage > 30) status = "Normal"

        return {
          ...dept,
          totalEncounters: deptEncounters.length,
          waitingCount,
          inConsultCount,
          completedCount,
          loadPercentage,
          status,
          encounters: deptEncounters,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [encounters])

  // Overall Floor Stats
  const stats = useMemo(() => {
    const totalVisits = encounters.length
    const unassignedCount = encounters.filter(
      (e) => isUnassignedDoctor(e.assignedDoctor || (e as any).doctorAssigned),
    ).length
    const awaitingVitals = encounters.filter((e) =>
      AWAITING_VITALS_STATUSES.includes(e.status),
    ).length
    const readyInQueue = encounters.filter(
      (e) => e.status === "In Queue",
    ).length
    const inConsult = encounters.filter(
      (e) => e.status === "Under Consultation",
    ).length
    const completed = encounters.filter(
      (e) =>
        e.status === "Consultation Completed" ||
        e.status === "OP Completed" ||
        e.status === "Billing Completed",
    ).length
    const activeDoctorsOnDuty = ACTIVE_DOCTORS.filter(
      (d) =>
        d.section === "Main" ||
        encounters.some((e) => doesDoctorMatchEncounter(d, e)),
    ).length

    return {
      totalVisits,
      unassignedCount,
      awaitingVitals,
      readyInQueue,
      inConsult,
      completed,
      activeDoctorsOnDuty,
    }
  }, [encounters])

  // Doctor Roster & Live Chamber Statuses
  const doctorRosterData = useMemo(() => {
    const list = ACTIVE_DOCTORS.map((doc) => {
      const docEncounters = encounters.filter(
        (e) => doesDoctorMatchEncounter(doc, e),
      )
      const activePatient =
        docEncounters.find((e) => e.status === "Under Consultation") || null
      const waitingQueue = docEncounters.filter((e) => e.status === "In Queue")
      const awaitingTriage = docEncounters.filter((e) =>
        AWAITING_VITALS_STATUSES.includes(e.status),
      )
      const completed = docEncounters.filter(
        (e) =>
          e.status === "Consultation Completed" ||
          e.status === "OP Completed" ||
          e.status === "Billing Completed",
      )

      let currentStatus: "CONSULTING" | "AVAILABLE" | "WAITING" | "OFF_DUTY" =
        "OFF_DUTY"
      if (activePatient) {
        currentStatus = "CONSULTING"
      } else if (waitingQueue.length > 0) {
        currentStatus = "WAITING"
      } else if (doc.section === "Main" || docEncounters.length > 0) {
        currentStatus = "AVAILABLE"
      }

      return {
        ...doc,
        cleanName: formatCleanDoctorName(doc.name),
        docEncounters,
        activePatient,
        waitingQueue,
        waitingQueueCount: waitingQueue.length,
        awaitingTriageCount: awaitingTriage.length,
        completedCount: completed.length,
        totalBooked: docEncounters.length,
        currentStatus,
      }
    })

    // Sort active chambers with patients or consultations FIRST
    return list.sort((a, b) => {
      const scoreA =
        (a.activePatient ? 100 : 0) +
        a.waitingQueueCount * 10 +
        a.completedCount
      const scoreB =
        (b.activePatient ? 100 : 0) +
        b.waitingQueueCount * 10 +
        b.completedCount
      return scoreB - scoreA
    })
  }, [encounters])

  // Filtered Doctor Chambers
  const filteredChambers = useMemo(() => {
    if (!chamberFilterActiveOnly) return doctorRosterData
    return doctorRosterData.filter(
      (d) => d.activePatient || d.waitingQueueCount > 0 || d.completedCount > 0,
    )
  }, [doctorRosterData, chamberFilterActiveOnly])

  // Unassigned Encounters Pool
  const unassignedEncounters = useMemo(() => {
    return encounters.filter(
      (e) =>
        !e.assignedDoctor ||
        e.assignedDoctor.toLowerCase().includes("unassigned") ||
        e.assignedDoctor === "Assigned by Reception" ||
        e.assignedDoctor.toLowerCase().includes("duty doctor"),
    )
  }, [encounters])

  // Filtered Encounters
  const filteredEncounters = useMemo(() => {
    return encounters.filter((enc) => {
      if (selectedDeptFilter !== "All") {
        const encDept = (enc.dept || "").toLowerCase()
        const encAiDept = (enc.aiSpecialty || "").toLowerCase()
        const filterDept = selectedDeptFilter.toLowerCase()
        if (
          !encDept.includes(filterDept) &&
          !encAiDept.includes(filterDept) &&
          !filterDept.includes(encDept)
        ) {
          return false
        }
      }
      if (selectedStatusFilter !== "All") {
        if (selectedStatusFilter === "Unassigned") {
          const doc = (enc.assignedDoctor || "").toLowerCase()
          if (
            enc.assignedDoctor &&
            !doc.includes("unassigned") &&
            !doc.includes("duty doctor") &&
            enc.assignedDoctor !== "Assigned by Reception"
          ) {
            return false
          }
        } else if (
          selectedStatusFilter === "Triage" &&
          !AWAITING_VITALS_STATUSES.includes(enc.status)
        ) {
          return false
        } else if (
          selectedStatusFilter === "In Queue" &&
          enc.status !== "In Queue"
        ) {
          return false
        } else if (
          selectedStatusFilter === "In Consult" &&
          enc.status !== "Under Consultation"
        ) {
          return false
        } else if (
          selectedStatusFilter === "Completed" &&
          ![
            "Consultation Completed",
            "OP Completed",
            "Billing Completed",
          ].includes(enc.status)
        ) {
          return false
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        return (
          enc.patientName.toLowerCase().includes(q) ||
          enc.umr.toLowerCase().includes(q) ||
          enc.opNumber.toLowerCase().includes(q) ||
          (enc.assignedDoctor || "").toLowerCase().includes(q) ||
          (enc.chiefComplaint || "").toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [encounters, selectedDeptFilter, selectedStatusFilter, searchQuery])

  const resetAllFilters = () => {
    setSelectedDeptFilter("All")
    setSelectedStatusFilter("All")
    setSearchQuery("")
  }

  // Helper for specialty color pill styles
  const getSpecialtyBadgeStyle = (dept: string) => {
    const d = (dept || "").toLowerCase()
    if (d.includes("cardio")) return "bg-rose-50 text-rose-800 border-rose-200"
    if (d.includes("ortho"))
      return "bg-amber-50 text-amber-800 border-amber-200"
    if (d.includes("neuro"))
      return "bg-purple-50 text-purple-800 border-purple-200"
    if (d.includes("pediat")) return "bg-teal-50 text-teal-800 border-teal-200"
    if (d.includes("ent") || d.includes("ophthal"))
      return "bg-sky-50 text-sky-800 border-sky-200"
    if (d.includes("gynaec") || d.includes("obg"))
      return "bg-pink-50 text-pink-800 border-pink-200"
    return "bg-blue-50 text-blue-800 border-blue-200"
  }

  // Call Patient to Nurse Station
  const callToNurse = (enc: DBOPEncounter) => {
    notifyPatientCalledToNurse(enc)
    db.callToNurseStation(enc.id, staffName)
  }

  // Export CSV Report
  const handleExportCSV = () => {
    const headers = [
      "Encounter_ID",
      "UMR",
      "OP_Number",
      "Patient_Name",
      "Age",
      "Sex",
      "Department",
      "Doctor",
      "Room",
      "Status",
      "Registration_Time",
    ]
    const rows = encounters.map((e) => [
      e.id,
      e.umr,
      e.opNumber,
      `"${e.patientName}"`,
      e.age,
      e.sex,
      `"${e.dept}"`,
      `"${e.assignedDoctor || "Unassigned"}"`,
      e.room || "Room 101",
      e.status,
      e.registrationTime || "10:00 AM",
    ])

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute(
      "download",
      `OP_Management_Report_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setIsExportModalOpen(false)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F1F5F9] text-slate-800 font-sans overflow-hidden">
      {/* ── MINIMALIST COLORFUL HEADER WITH SEARCH ── */}
      <div className="bg-white border-b border-[#CBD5E1] px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between flex-shrink-0 shadow-2xs gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-blue-600 text-white font-bold flex items-center justify-center text-base rounded-none shadow-xs">
            🏥
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-x-2 gap-y-1">
              OP Management Hub
              <span className="text-[10.5px] bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-none font-mono uppercase font-bold">
                Live Floor Operations
              </span>
            </h1>
            <p className="text-[11.5px] text-slate-500">
              Outpatient floor status, active doctor chambers, and department
              capacity.
            </p>
          </div>
        </div>

        {/* Header Search & Actions */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Global Search Box in Header */}
          <div className="relative flex-1 sm:flex-none min-w-0">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient, UMR, token..."
              className="pl-8 pr-3 h-8 text-xs border border-[#CBD5E1] rounded-none bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 w-full sm:w-56 lg:w-64 font-medium shadow-2xs"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon.Search size={13} />
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 text-[12px] font-bold rounded-none transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs h-8 whitespace-nowrap flex-shrink-0"
          >
            <Icon.Download size={13} /> Daily Report
          </button>
        </div>
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 w-full">
        {/* ── 1. VIBRANT SQUARED COLORFUL KPI CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-blue-50/80 border border-blue-200 border-l-4 border-l-blue-600 rounded-none p-3 shadow-2xs">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-blue-900 flex justify-between items-center">
              <span>Total OP Bookings</span>
              <span className="text-blue-600">📊</span>
            </div>
            <div className="text-2xl font-bold font-mono text-blue-950 mt-1">
              {stats.totalVisits}
            </div>
            <div className="text-[11px] text-blue-700 mt-0.5 font-medium">
              Today's encounters
            </div>
          </div>

          <div
            onClick={() => {
              setActiveTab("patient_flow")
              setSelectedStatusFilter("Unassigned")
            }}
            className="bg-amber-50/90 border border-amber-300 border-l-4 border-l-amber-600 rounded-none p-3 shadow-2xs cursor-pointer hover:bg-amber-100/70 transition-colors"
          >
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-950 flex justify-between items-center">
              <span>Unassigned OP Pool</span>
              <span className="text-amber-600 font-bold">⚡</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-950 mt-1 flex items-center gap-2">
              {stats.unassignedCount}
              {stats.unassignedCount > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <div className="text-[11px] text-amber-800 mt-0.5 font-medium">
              Needs doctor assignment
            </div>
          </div>

          <div className="bg-amber-50/80 border border-amber-200 border-l-4 border-l-amber-500 rounded-none p-3 shadow-2xs">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-900 flex justify-between items-center">
              <span>Awaiting Vitals</span>
              <span className="text-amber-600">⏳</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-950 mt-1">
              {stats.awaitingVitals}
            </div>
            <div className="text-[11px] text-amber-800 mt-0.5 font-medium">
              Pending triage
            </div>
          </div>

          <div className="bg-sky-50/80 border border-sky-200 border-l-4 border-l-sky-600 rounded-none p-3 shadow-2xs">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-sky-900 flex justify-between items-center">
              <span>Ready in Queue</span>
              <span className="text-sky-600">⏱️</span>
            </div>
            <div className="text-2xl font-bold font-mono text-sky-950 mt-1">
              {stats.readyInQueue}
            </div>
            <div className="text-[11px] text-sky-800 mt-0.5 font-medium">
              Awaiting doctor call
            </div>
          </div>

          <div className="bg-purple-50/80 border border-purple-200 border-l-4 border-l-purple-600 rounded-none p-3 shadow-2xs">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-purple-900 flex justify-between items-center">
              <span>In Consultation</span>
              <span className="text-purple-600">👨‍⚕️</span>
            </div>
            <div className="text-2xl font-bold font-mono text-purple-950 mt-1">
              {stats.inConsult}
            </div>
            <div className="text-[11px] text-purple-800 mt-0.5 font-medium">
              Inside chambers
            </div>
          </div>

          <div className="bg-emerald-50/80 border border-emerald-200 border-l-4 border-l-emerald-600 rounded-none p-3 shadow-2xs">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-900 flex justify-between items-center">
              <span>Completed Visits</span>
              <span className="text-emerald-600">✅</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-950 mt-1">
              {stats.completed}
            </div>
            <div className="text-[11px] text-emerald-800 mt-0.5 font-medium">
              Finished visits
            </div>
          </div>
        </div>

        {/* ── 2. MINIMAL ORGANIZED TAB BAR & CONTROLS ── */}
        <div className="bg-white border border-[#CBD5E1] rounded-none p-2 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-2xs">
          {/* Tab Navigation Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-[#E2E8F0] lg:border-b-0 pb-1 lg:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab("patient_flow")}
              className={`px-3.5 py-1.5 text-[12.5px] font-bold transition-all cursor-pointer rounded-none flex items-center gap-2 whitespace-nowrap border ${
                activeTab === "patient_flow"
                  ? "bg-blue-600 text-white border-blue-700 shadow-xs"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>📋 OP Patient Roster</span>
              <span
                className={`px-1.5 py-0.2 text-[11px] font-mono font-bold ${
                  activeTab === "patient_flow"
                    ? "bg-white text-blue-900"
                    : "bg-blue-100 text-blue-900 border border-blue-200"
                }`}
              >
                {filteredEncounters.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("unassigned_pool")}
              className={`px-3.5 py-1.5 text-[12.5px] font-bold transition-all cursor-pointer rounded-none flex items-center gap-2 whitespace-nowrap border ${
                activeTab === "unassigned_pool"
                  ? "bg-amber-600 text-white border-amber-700 shadow-xs"
                  : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
              }`}
            >
              <span>⚡ Unassigned Patients</span>
              <span
                className={`px-1.5 py-0.2 text-[11px] font-mono font-bold ${
                  activeTab === "unassigned_pool"
                    ? "bg-white text-amber-950"
                    : "bg-amber-200 text-amber-950 border border-amber-300"
                }`}
              >
                {unassignedEncounters.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("doctor_chambers")}
              className={`px-3.5 py-1.5 text-[12.5px] font-bold transition-all cursor-pointer rounded-none flex items-center gap-2 whitespace-nowrap border ${
                activeTab === "doctor_chambers"
                  ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>🚪 Doctor Chambers</span>
              <span
                className={`px-1.5 py-0.2 text-[11px] font-mono font-bold ${
                  activeTab === "doctor_chambers"
                    ? "bg-white text-emerald-900"
                    : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                }`}
              >
                {stats.activeDoctorsOnDuty} Active
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("department_capacity")}
              className={`px-3.5 py-1.5 text-[12.5px] font-bold transition-all cursor-pointer rounded-none flex items-center gap-2 whitespace-nowrap border ${
                activeTab === "department_capacity"
                  ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>🏥 Department Capacity</span>
              <span
                className={`px-1.5 py-0.2 text-[11px] font-mono font-bold ${
                  activeTab === "department_capacity"
                    ? "bg-white text-indigo-900"
                    : "bg-indigo-100 text-indigo-900 border border-indigo-200"
                }`}
              >
                {departmentRows.length}
              </span>
            </button>
          </div>

          {/* Filter Controls */}
          <div className="flex items-center gap-2 overflow-x-auto shrink-0 flex-nowrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-none px-2.5 h-8 text-xs shrink-0">
              <span className="text-slate-600 font-bold text-[11px] whitespace-nowrap">
                Status:
              </span>
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer text-xs rounded-none h-full"
              >
                <option value="All">All Statuses</option>
                <option value="Unassigned">⚡ Unassigned Pool ({stats.unassignedCount})</option>
                <option value="Triage">Awaiting Triage</option>
                <option value="In Queue">In Queue</option>
                <option value="In Consult">In Consultation</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Specialty Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-[#CBD5E1] rounded-none px-2.5 h-8 text-xs shrink-0">
              <span className="text-slate-600 font-bold text-[11px] whitespace-nowrap">
                Dept:
              </span>
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer text-xs rounded-none h-full"
              >
                <option value="All">All Specialties</option>
                {departmentRows.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {(selectedDeptFilter !== "All" ||
              selectedStatusFilter !== "All" ||
              searchQuery.trim() !== "") && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-2.5 h-8 bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold rounded-none border border-slate-300 transition-colors cursor-pointer shrink-0"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* ── TAB 1: TODAY'S LIVE OP PATIENT ROSTER ── */}
        {activeTab === "patient_flow" && (
          <div className="bg-white border border-[#CBD5E1] rounded-none shadow-2xs overflow-hidden">
            <div className="px-5 py-3 border-b border-[#CBD5E1] bg-slate-100 flex items-center justify-between">
              <h2 className="text-[13.5px] font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-blue-600 inline-block"></span>
                Today's Outpatient Care Roster
              </h2>
              <span className="text-[11px] font-mono font-bold text-blue-900 bg-blue-100 border border-blue-300 px-2 py-0.5">
                {filteredEncounters.length} Encounters
              </span>
            </div>

            <div className="overflow-x-auto">
              {filteredEncounters.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-medium space-y-2">
                  <p>No patient records match the selected search/filter criteria.</p>
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-none cursor-pointer shadow-xs transition-colors"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">OP Token &amp; UMR</th>
                      <th className="px-4 py-3">Patient Details</th>
                      <th className="px-4 py-3">Specialty &amp; Doctor</th>
                      <th className="px-4 py-3">NEWS2 Baseline</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Floor Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[12px]">
                    {filteredEncounters.map((enc) => {
                      const isCompleted =
                        enc.status === "Consultation Completed" ||
                        enc.status === "OP Completed" ||
                        enc.status === "Billing Completed"
                      const isAwaitingVitals =
                        AWAITING_VITALS_STATUSES.includes(enc.status)
                      const news2 = calculateNEWS2(enc.vitals)

                      return (
                        <tr
                          key={enc.id}
                          className="hover:bg-blue-50/40 transition-colors"
                        >
                          {/* Token & UMR */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-xs text-blue-900 bg-blue-100 px-2.5 py-1 rounded-none border border-blue-300 inline-block shadow-2xs">
                              {enc.opNumber}
                            </span>
                            <div className="text-[10.5px] font-mono text-slate-600 font-bold mt-1">
                              UMR: {enc.umr}
                            </div>
                          </td>

                          {/* Patient Info */}
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900 text-[13px]">
                              {enc.patientName}
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium">
                              {enc.age} yrs · {enc.sex} · {enc.phone}
                            </div>
                            <div className="text-[10.5px] text-slate-500 truncate max-w-xs mt-0.5 font-medium">
                              💬{" "}
                              {enc.chiefComplaint ||
                                enc.symptoms.join(", ") ||
                                "General Evaluation"}
                            </div>
                          </td>

                          {/* Dept & Doctor (MINIMALIST UNIFIED ALIGNED BADGE) */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center mb-1">
                              <span
                                className={`px-2.5 py-0.5 text-[11px] font-bold uppercase border ${getSpecialtyBadgeStyle(enc.dept)} rounded-none inline-flex items-center gap-1.5 h-5 leading-none shadow-2xs`}
                              >
                                <span>{enc.dept || "General Medicine"}</span>
                                <span className="opacity-40 font-normal">
                                  |
                                </span>
                                <span className="font-mono text-slate-800 text-[10.5px] font-bold">
                                  {enc.room || "Room 101"}
                                </span>
                              </span>
                            </div>
                            {!enc.assignedDoctor ||
                            enc.assignedDoctor.toLowerCase().includes("unassigned") ||
                            enc.assignedDoctor === "Assigned by Reception" ||
                            enc.assignedDoctor.toLowerCase().includes("duty doctor") ? (
                              <div className="flex items-center gap-1 mt-1">
                                <select
                                  id={`row-assign-${enc.id}`}
                                  className="bg-amber-50 border border-amber-300 text-slate-900 text-[11px] font-bold px-1.5 py-0.5 focus:outline-none focus:border-blue-600 rounded-none max-w-[130px]"
                                  defaultValue=""
                                >
                                  <option value="" disabled>Select Doctor...</option>
                                  {ACTIVE_DOCTORS.map((d) => (
                                    <option key={d.id} value={d.name}>
                                      {d.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const selectEl = document.getElementById(
                                      `row-assign-${enc.id}`,
                                    ) as HTMLSelectElement
                                    const docName = selectEl?.value
                                    if (docName) {
                                      const docObj = ACTIVE_DOCTORS.find((d) => d.name === docName)
                                      db.updateEncounter(enc.id, {
                                        assignedDoctor: docName,
                                        doctorAssigned: docName,
                                        assignedDoctorId: docObj?.id,
                                        doctorId: docObj?.id,
                                        dept: enc.dept && enc.dept !== "Awaiting Triage" ? enc.dept : (docObj?.specialty || enc.dept),
                                        room: enc.room || docObj?.room || "Room 101",
                                        status: enc.status === "Registered" ? "Doctor Assigned" : (enc.status || "Doctor Assigned"),
                                      } as any)
                                    }
                                  }}
                                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white text-[10.5px] font-bold border border-amber-700 cursor-pointer shadow-2xs transition-colors"
                                >
                                  Assign
                                </button>
                              </div>
                            ) : (
                              <div className="text-[11.5px] text-slate-900 font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full shrink-0"></span>
                                <span>{enc.assignedDoctor}</span>
                              </div>
                            )}
                          </td>

                          {/* NEWS2 & Vitals */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {enc.vitals?.bp ? (
                              <div>
                                <span
                                  className={`px-2 py-0.5 rounded-none text-[10px] font-bold uppercase border inline-block ${
                                    news2.risk === "High"
                                      ? "bg-red-100 text-red-900 border-red-300"
                                      : news2.risk === "Medium"
                                        ? "bg-amber-100 text-amber-900 border-amber-300"
                                        : "bg-emerald-100 text-emerald-900 border-emerald-300"
                                  }`}
                                >
                                  NEWS2: {news2.score} ({news2.risk})
                                </span>
                                <div className="text-slate-700 font-mono text-[10.5px] mt-1 font-semibold">
                                  BP: <strong>{enc.vitals.bp}</strong> · HR:{" "}
                                  <strong>{enc.vitals.pulse}</strong>
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-900 bg-amber-100 px-2 py-0.5 rounded-none text-[10.5px] font-bold border border-amber-300 inline-block">
                                ⏳ Pending Triage
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-none uppercase border inline-block ${
                                isCompleted
                                  ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                  : enc.status === "Under Consultation"
                                    ? "bg-purple-100 text-purple-900 border-purple-300"
                                    : enc.status === "In Queue"
                                      ? "bg-blue-100 text-blue-900 border-blue-300"
                                      : "bg-amber-100 text-amber-900 border-amber-300"
                              }`}
                            >
                              {enc.status}
                            </span>
                          </td>

                          {/* Floor Actions */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {isAwaitingVitals && (
                                <button
                                  type="button"
                                  onClick={() => callToNurse(enc)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-none cursor-pointer shadow-xs transition-colors"
                                >
                                  📢 Call Nurse
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setSelectedJourneyEncounter(enc)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded-none border border-slate-900 cursor-pointer shadow-xs transition-colors"
                              >
                                Journey →
                              </button>

                              {!isCompleted && onNavigateToDoctorWorkflow && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onNavigateToDoctorWorkflow(enc.id)
                                  }
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 text-[11px] font-bold rounded-none cursor-pointer shadow-xs transition-colors"
                                >
                                  Doctor →
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: UNASSIGNED PATIENTS POOL ── */}
        {activeTab === "unassigned_pool" && (
          <div className="bg-white border border-[#CBD5E1] rounded-none shadow-2xs overflow-hidden">
            <div className="px-5 py-3 border-b border-[#CBD5E1] bg-amber-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-[14px] font-bold text-amber-950 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-amber-600 inline-block animate-pulse"></span>
                  Unassigned Outpatient Queue
                </h2>
                <p className="text-[11.5px] text-amber-800 font-medium mt-0.5">
                  Patients registered without a doctor assigned. Select a physician to assign them directly to that doctor's live queue.
                </p>
              </div>
              <span className="text-[11px] font-mono font-bold text-amber-900 bg-amber-200 border border-amber-300 px-2.5 py-1">
                {unassignedEncounters.length} Pending Assignment
              </span>
            </div>

            <div className="overflow-x-auto">
              {unassignedEncounters.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs font-medium space-y-2">
                  <div className="text-3xl">✅</div>
                  <div className="text-slate-900 font-bold text-sm">All OP Patients Are Assigned!</div>
                  <p className="text-slate-500 max-w-md mx-auto">
                    There are currently no unassigned patients waiting in the OP pool.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">OP Token &amp; UMR</th>
                      <th className="px-4 py-3">Patient Details</th>
                      <th className="px-4 py-3">Department &amp; Complaint</th>
                      <th className="px-4 py-3">NEWS2 / Vitals</th>
                      <th className="px-4 py-3 text-right">Assign Doctor &amp; Dispatch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[12px]">
                    {unassignedEncounters.map((enc) => {
                      const news2 = calculateNEWS2(enc.vitals)
                      return (
                        <tr
                          key={enc.id}
                          className="hover:bg-amber-50/40 transition-colors"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-xs text-blue-900 bg-blue-100 px-2.5 py-1 border border-blue-300 inline-block shadow-2xs">
                              {enc.opNumber}
                            </span>
                            <div className="text-[10.5px] font-mono text-slate-600 font-bold mt-1">
                              UMR: {enc.umr}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900 text-[13px]">
                              {enc.patientName}
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium">
                              {enc.age} yrs · {enc.sex} · {enc.phone}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 text-[10.5px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-300 inline-block mb-1">
                              {enc.dept || "General Medicine"}
                            </span>
                            <div className="text-[11px] text-slate-700 font-medium truncate max-w-xs">
                              💬 {enc.chiefComplaint || enc.symptoms.join(", ") || "General Evaluation"}
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {enc.vitals?.bp ? (
                              <div>
                                <span
                                  className={`px-2 py-0.5 rounded-none text-[10px] font-bold uppercase border inline-block ${
                                    news2.risk === "High"
                                      ? "bg-red-100 text-red-900 border-red-300"
                                      : news2.risk === "Medium"
                                        ? "bg-amber-100 text-amber-900 border-amber-300"
                                        : "bg-emerald-100 text-emerald-900 border-emerald-300"
                                  }`}
                                >
                                  NEWS2: {news2.score} ({news2.risk})
                                </span>
                                <div className="text-slate-700 font-mono text-[10.5px] mt-1 font-semibold">
                                  BP: <strong>{enc.vitals.bp}</strong> · HR: <strong>{enc.vitals.pulse}</strong>
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-900 bg-amber-100 px-2 py-0.5 rounded-none text-[10.5px] font-bold border border-amber-300 inline-block">
                                ⏳ Pending Triage
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <select
                                id={`tab-assign-${enc.id}`}
                                className="bg-white border border-slate-300 text-slate-900 text-xs font-bold px-2 py-1 focus:outline-none focus:border-blue-600 rounded-none max-w-[160px]"
                                defaultValue=""
                              >
                                <option value="" disabled>Select Doctor...</option>
                                {ACTIVE_DOCTORS.map((d) => (
                                  <option key={d.id} value={d.name}>
                                    {d.name} ({d.specialty})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  const selectEl = document.getElementById(
                                    `tab-assign-${enc.id}`,
                                  ) as HTMLSelectElement
                                  const docName = selectEl?.value
                                  if (docName) {
                                    const docObj = ACTIVE_DOCTORS.find((d) => d.name === docName)
                                    db.updateEncounter(enc.id, {
                                      assignedDoctor: docName,
                                      doctorAssigned: docName,
                                      assignedDoctorId: docObj?.id,
                                      doctorId: docObj?.id,
                                      dept: enc.dept && enc.dept !== "Awaiting Triage" ? enc.dept : (docObj?.specialty || enc.dept),
                                      room: enc.room || docObj?.room || "Room 101",
                                      status: enc.status === "Registered" ? "Doctor Assigned" : (enc.status || "Doctor Assigned"),
                                    } as any)
                                  }
                                }}
                                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold border border-amber-700 cursor-pointer shadow-xs transition-colors"
                              >
                                ⚡ Assign Doctor
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 2: ULTRA-SLEEK MINIMAL DOCTOR CHAMBERS ROSTER ── */}
        {activeTab === "doctor_chambers" && (
          <div className="bg-white border border-[#CBD5E1] rounded-none shadow-2xs overflow-hidden">
            {/* Header & Filter Toggle Bar */}
            <div className="px-5 py-3 border-b border-[#CBD5E1] bg-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[13.5px] font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-600 inline-block"></span>
                  Doctor Chamber Corridor Status
                </h2>
                <p className="text-[11.5px] text-slate-600 font-medium">
                  Live room utilization &amp; consultant queue status.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChamberFilterActiveOnly(false)}
                  className={`px-3 py-1 text-xs font-bold rounded-none transition-colors border cursor-pointer ${
                    !chamberFilterActiveOnly
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-[#CBD5E1] hover:bg-slate-50"
                  }`}
                >
                  All Chambers ({doctorRosterData.length})
                </button>

                <button
                  type="button"
                  onClick={() => setChamberFilterActiveOnly(true)}
                  className={`px-3 py-1 text-xs font-bold rounded-none transition-colors border cursor-pointer ${
                    chamberFilterActiveOnly
                      ? "bg-emerald-600 text-white border-emerald-700"
                      : "bg-white text-slate-700 border-[#CBD5E1] hover:bg-slate-50"
                  }`}
                >
                  Active Today (
                  {
                    doctorRosterData.filter(
                      (d) =>
                        d.activePatient ||
                        d.waitingQueueCount > 0 ||
                        d.completedCount > 0,
                    ).length
                  }
                  )
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Room &amp; Consultant</th>
                    <th className="px-4 py-3">Specialty</th>
                    <th className="px-4 py-3">Chamber Live Status</th>
                    <th className="px-4 py-3 text-center">Queue Load</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-[12px]">
                  {filteredChambers.map((doc) => {
                    const isConsulting = doc.currentStatus === "CONSULTING"
                    const isWaiting = doc.currentStatus === "WAITING"

                    return (
                      <tr
                        key={doc.id}
                        className="hover:bg-emerald-50/30 transition-colors"
                      >
                        {/* Room & Doctor */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded-none shadow-2xs">
                              {doc.room}
                            </span>
                            <span className="font-bold text-slate-900 text-[13px]">
                              {doc.cleanName}
                            </span>
                          </div>
                        </td>

                        {/* Specialty */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 border rounded-none inline-block ${getSpecialtyBadgeStyle(doc.specialty || "")}`}
                          >
                            {doc.specialty}
                          </span>
                        </td>

                        {/* Live Chamber Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isConsulting ? (
                            <span className="bg-purple-100 text-purple-950 border border-purple-300 font-bold text-[11.5px] px-2.5 py-1 rounded-none inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
                              In Consult:{" "}
                              <strong>{doc.activePatient?.opNumber}</strong> (
                              {doc.activePatient?.patientName})
                            </span>
                          ) : isWaiting ? (
                            <span className="bg-amber-100 text-amber-950 border border-amber-300 font-bold text-[11.5px] px-2.5 py-1 rounded-none inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <strong>{doc.waitingQueueCount} Waiting</strong>{" "}
                              (Next: {doc.waitingQueue[0]?.opNumber})
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold text-[11.5px] px-2.5 py-1 rounded-none inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                              Available
                            </span>
                          )}
                        </td>

                        {/* Queue Metrics */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap font-mono text-[11.5px]">
                          <span className="text-slate-700 font-semibold">
                            Queue:{" "}
                            <strong className="text-slate-900">
                              {doc.waitingQueueCount}
                            </strong>{" "}
                            · Done:{" "}
                            <strong className="text-emerald-700">
                              {doc.completedCount}
                            </strong>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedChamberDetail(doc)}
                            className="text-[12px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-none"
                          >
                            Queue →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: DEPARTMENT CAPACITY ROSTER ── */}
        {activeTab === "department_capacity" && (
          <div className="bg-white border border-[#CBD5E1] rounded-none shadow-2xs overflow-hidden">
            <div className="px-5 py-3 border-b border-[#CBD5E1] bg-slate-100 flex justify-between items-center">
              <h2 className="text-[13.5px] font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-indigo-600 inline-block"></span>
                Outpatient Specialty &amp; Capacity Roster
              </h2>
              <span className="text-xs text-indigo-900 font-mono font-bold bg-indigo-100 border border-indigo-300 px-2 py-0.5">
                {departmentRows.length} Specialties Active
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Head Consultant</th>
                    <th className="px-4 py-3">Active Doctors</th>
                    <th className="px-4 py-3">Waiting</th>
                    <th className="px-4 py-3">In Consult</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Capacity Load</th>
                    <th className="px-4 py-3 text-right">Roster</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {departmentRows.map((d) => (
                    <tr
                      key={d.name}
                      className="hover:bg-indigo-50/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-bold border rounded-none inline-block ${getSpecialtyBadgeStyle(d.name)}`}
                        >
                          {d.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-bold">
                        👨‍⚕️ {d.headDoctor}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {d.activeDoctors} / {d.totalDoctors} Drs
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-amber-700">
                        {d.waitingCount}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-purple-700">
                        {d.inConsultCount}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-700">
                        {d.completedCount}
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-28 space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-slate-700 font-bold">
                            <span>{d.loadPercentage}%</span>
                            <span>{d.status}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-none overflow-hidden border border-slate-300">
                            <div
                              className={`h-full transition-all ${
                                (d.loadPercentage || 0) > 80
                                  ? "bg-red-600"
                                  : (d.loadPercentage || 0) > 50
                                    ? "bg-amber-500"
                                    : "bg-emerald-600"
                              }`}
                              style={{ width: `${d.loadPercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDeptRoster(d)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-none cursor-pointer"
                        >
                          Roster →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: PATIENT JOURNEY TIMELINE ── */}
      {selectedJourneyEncounter && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-[#CBD5E1] rounded-none shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Patient Journey — {selectedJourneyEncounter.patientName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  UMR: {selectedJourneyEncounter.umr} · OP Token:{" "}
                  {selectedJourneyEncounter.opNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedJourneyEncounter(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Visual Step Progress */}
            <div className="space-y-2 text-xs">
              {[
                {
                  stage: "Reception Registration",
                  status: "Completed",
                  desc: `Registered at ${selectedJourneyEncounter.registrationTime || "10:00 AM"}`,
                },
                {
                  stage: "Nurse Vitals Baseline",
                  status: selectedJourneyEncounter.vitals
                    ? "Completed"
                    : "Pending",
                  desc: selectedJourneyEncounter.vitals
                    ? `BP: ${selectedJourneyEncounter.vitals.bp}, HR: ${selectedJourneyEncounter.vitals.pulse}`
                    : "Awaiting triage at Nurse Station",
                },
                {
                  stage: "Token Queue Call",
                  status:
                    selectedJourneyEncounter.status === "In Queue" ||
                    selectedJourneyEncounter.status === "Under Consultation" ||
                    selectedJourneyEncounter.status === "OP Completed"
                      ? "Completed"
                      : "Pending",
                  desc: `Assigned Room: ${selectedJourneyEncounter.room || "Chamber 101"}`,
                },
                {
                  stage: "Physician Consultation",
                  status:
                    selectedJourneyEncounter.status === "Under Consultation" ||
                    selectedJourneyEncounter.status === "OP Completed"
                      ? "Completed"
                      : "Pending",
                  desc: `Doctor: ${selectedJourneyEncounter.assignedDoctor || "Assigned Consultant"}`,
                },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-none"
                >
                  <div
                    className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-none ${
                      step.status === "Completed"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {step.status === "Completed" ? "✓" : idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900">
                        {step.stage}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-none border ${
                          step.status === "Completed"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedJourneyEncounter(null)}
                className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-none cursor-pointer"
              >
                Close Journey
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CHAMBER FULL QUEUE DETAIL ── */}
      {selectedChamberDetail && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-[#CBD5E1] rounded-none shadow-xl max-w-xl w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Chamber Queue — {selectedChamberDetail.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedChamberDetail.specialty} · Room{" "}
                  {selectedChamberDetail.room}
                </p>
              </div>
              <button
                onClick={() => setSelectedChamberDetail(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {selectedChamberDetail.waitingQueue.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No patients waiting in queue for this chamber.
                </div>
              ) : (
                selectedChamberDetail.waitingQueue.map(
                  (patient: DBOPEncounter, idx: number) => (
                    <div
                      key={patient.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-none flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 border border-blue-200">
                          #{idx + 1} Token {patient.opNumber}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">
                            {patient.patientName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            UMR: {patient.umr} · {patient.age} yrs (
                            {patient.sex})
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10.5px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 font-bold">
                          {patient.status}
                        </span>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedChamberDetail(null)}
                className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-none cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EXPORT REPORT ── */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-[#CBD5E1] rounded-none shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">
              Export Daily OP Report
            </h3>
            <p className="text-xs text-slate-600">
              Download CSV dataset of today's outpatient encounters (
              {encounters.length} records).
            </p>
            <div className="flex justify-end gap-2 text-xs font-bold pt-1">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-3 py-1.5 bg-slate-100 rounded-none text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-1.5 bg-[#1B4FD8] text-white rounded-none"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DEPARTMENT ROSTER DETAIL ── */}
      {selectedDeptRoster && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-[#CBD5E1] rounded-none shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {selectedDeptRoster.name} Roster
                </h3>
                <p className="text-xs text-slate-500">
                  Head Doctor: {selectedDeptRoster.headDoctor}
                </p>
              </div>
              <button
                onClick={() => setSelectedDeptRoster(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {selectedDeptRoster.doctors.map((doc) => (
                <div
                  key={doc.id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-none flex justify-between items-center text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">{doc.name}</span>
                    <p className="text-slate-500 text-[10.5px]">
                      {doc.qualification}
                    </p>
                  </div>
                  <span className="font-mono bg-slate-900 text-white px-2 py-0.5 rounded-none text-[10.5px] font-bold">
                    📍 {doc.room}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSelectedDeptRoster(null)}
                className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-none cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
