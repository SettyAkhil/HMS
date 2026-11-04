import React, { useState, useEffect, useMemo } from "react"
import {
  AcuityBadge,
  StatusBadge,
  Table,
  TR,
  TD,
  Btn,
  Card,
} from "./shared"
import { Icon } from "./icons"
import {
  FiSearch,
  FiFilter,
  FiRefreshCw,
  FiPlus,
  FiActivity,
  FiUser,
  FiClock,
  FiCheckCircle,
  FiAlertTriangle,
  FiX,
  FiChevronRight,
  FiEye,
  FiHeart,
  FiThermometer,
  FiDroplet,
  FiArrowRight,
  FiShield,
  FiCornerDownRight,
  FiUserCheck,
} from "react-icons/fi"
import { apiFetch } from "../lib/api"
import {
  ErDatabase,
  type ErVisitRecord,
  type TriageCategoryConfig,
} from "../services/erDb"
import { BedDatabase, type BedRecord } from "../services/bedDb"
import { DOCTOR_MASTER, type MasterDoctor } from "../services/doctorMaster"
import ErRegistrationForm from "./ErRegistrationForm"
import InstantPatientSearchDropdown, { highlightMatch } from "./InstantPatientSearchDropdown"
import type { Notice, TriageCategory } from "../types"

interface EmergencyProps {
  onSelect?: (visitId?: number) => void
  onRegister?: () => void
  onOpenTriage?: (visitId: number) => void
  onOpenTrackBoard?: () => void
}

function parseAcuity(cat?: string | null): number {
  if (!cat) return 0
  const normalized = cat.toUpperCase()
  if (normalized.includes("ESI-1") || normalized.includes("B1") || normalized.includes("RESUS") || normalized === "1") return 1
  if (normalized.includes("ESI-2") || normalized.includes("B2") || normalized.includes("EMERG") || normalized === "2") return 2
  if (normalized.includes("ESI-3") || normalized.includes("B3") || normalized.includes("URGENT") || normalized === "3") return 3
  if (normalized.includes("ESI-4") || normalized.includes("B4") || normalized.includes("LESS") || normalized === "4") return 4
  if (normalized.includes("ESI-5") || normalized.includes("B5") || normalized.includes("NON") || normalized === "5") return 5
  return 0
}

function getWaitTimeString(arrivalAt?: string | null, closedAt?: string | null): string {
  if (!arrivalAt) return "0m"
  const start = new Date(arrivalAt).getTime()
  if (isNaN(start)) return "0m"
  const end = closedAt ? new Date(closedAt).getTime() : Date.now()
  const diffMinutes = Math.max(0, Math.floor((end - start) / (1000 * 60)))
  if (diffMinutes < 60) return `${diffMinutes}m`
  const hours = Math.floor(diffMinutes / 60)
  const remainingMins = diffMinutes % 60
  return `${hours}h ${remainingMins}m`
}

function formatErStatus(status: string): { label: string; badgeStatus: string } {
  const s = (status || "").toLowerCase()
  if (s === "registered") return { label: "Waiting / Registered", badgeStatus: "pending" }
  if (s === "triaged") return { label: "Triaged", badgeStatus: "info" }
  if (s === "bed_allocated" || s === "allocated") return { label: "Bed Allocated", badgeStatus: "active" }
  if (s === "under_treatment" || s === "under_care" || s === "doctor_assigned") return { label: "In Care", badgeStatus: "inprogress" }
  if (s === "stabilized") return { label: "Stabilized", badgeStatus: "completed" }
  if (s === "disposition_decided") return { label: "Disposition Decided", badgeStatus: "warning" }
  if (s === "closed") return { label: "Discharged / Closed", badgeStatus: "inactive" }
  return { label: status || "Waiting", badgeStatus: "pending" }
}

export default function Emergency({
  onSelect,
  onRegister,
  onOpenTriage,
  onOpenTrackBoard,
}: EmergencyProps) {
  const [view, setView] = useState<"board" | "list">("board")
  const [visits, setVisits] = useState<ErVisitRecord[]>([])
  const [beds, setBeds] = useState<BedRecord[]>([])
  const [categories, setCategories] = useState<TriageCategoryConfig[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [acuityFilter, setAcuityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("active")
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null)
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [now, setNow] = useState<number>(Date.now())

  // Quick Action form states inside drawer
  const [vitalsInput, setVitalsInput] = useState({
    hr: "",
    bpSys: "",
    bpDia: "",
    spo2: "",
    rr: "",
    temp: "",
    pain: "",
  })
  const [selectedDoctor, setSelectedDoctor] = useState<string>("")
  const [selectedBed, setSelectedBed] = useState<string>("")
  const [isUpdating, setIsUpdating] = useState<boolean>(false)

  // Timer for live wait times and census clock
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 15000)
    return () => clearInterval(timer)
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // 1. Fetch visits via apiFetch (or fallback to ErDatabase)
      const res = await apiFetch<{ visits: any[] }>("/api/er/visits")
      const rawVisits = res?.visits || ErDatabase.getVisits("all")
      
      // Ensure each visit has complete shape
      const hydrated = rawVisits.map((v) => {
        const full = ErDatabase.getVisit(v.id) || v
        return full
      })
      setVisits(hydrated)

      // 2. Fetch Beds
      const allBeds = BedDatabase.getBeds()
      setBeds(allBeds)

      // 3. Fetch Categories
      const cats = ErDatabase.getCategories()
      setCategories(cats)
    } catch {
      // Offline fallback
      setVisits(ErDatabase.getVisits("all"))
      setBeds(BedDatabase.getBeds())
      setCategories(ErDatabase.getCategories())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Listen for storage events (multi-tab or internal dispatch)
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key?.includes("hospai_er") ||
        e.key?.includes("beds") ||
        e.key?.includes("patient")
      ) {
        loadData()
      }
    }
    window.addEventListener("storage", handleStorage)

    // Listen to custom window events
    const handleRefresh = () => loadData()
    window.addEventListener("er:refresh", handleRefresh)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("er:refresh", handleRefresh)
    }
  }, [])

  // Sync selected visit record
  const selectedVisit = useMemo(() => {
    if (!selectedVisitId) return null
    return visits.find((v) => v.id === selectedVisitId) || null
  }, [visits, selectedVisitId])

  // Reset drawer form inputs when selected patient changes
  useEffect(() => {
    if (selectedVisit) {
      setSelectedDoctor(selectedVisit.assigned_doctor_name || "")
      setSelectedBed(selectedVisit.triage_bed_label || "")
      const latestVitals = selectedVisit.vitals?.[selectedVisit.vitals.length - 1]
      if (latestVitals) {
        setVitalsInput({
          hr: latestVitals.heart_rate?.toString() || "",
          bpSys: latestVitals.bp_systolic?.toString() || "",
          bpDia: latestVitals.bp_diastolic?.toString() || "",
          spo2: latestVitals.spo2?.toString() || "",
          rr: latestVitals.respiratory_rate?.toString() || "",
          temp: latestVitals.temperature?.toString() || "",
          pain: latestVitals.pain_score?.toString() || "",
        })
      } else {
        setVitalsInput({ hr: "", bpSys: "", bpDia: "", spo2: "", rr: "", temp: "", pain: "" })
      }
    }
  }, [selectedVisit])

  // Live Census Calculations
  const activeVisits = useMemo(() => {
    return visits.filter((v) => v.status !== "closed" && !v.closed_at)
  }, [visits])

  const totalCensus = activeVisits.length

  const critical = useMemo(() => {
    return activeVisits.filter((v) => {
      const a = parseAcuity(v.triage_category)
      return a === 1 || a === 2 || v.condition_at_arrival === "Critical" || v.condition_at_arrival === "Unconscious"
    }).length
  }, [activeVisits])

  const waiting = useMemo(() => {
    return activeVisits.filter((v) => {
      const s = (v.status || "").toLowerCase()
      const room = v.triage_bed_label || ""
      return s === "registered" || s === "triaged" || room === "Wait" || !room
    }).length
  }, [activeVisits])

  const inCare = useMemo(() => {
    return activeVisits.filter((v) => {
      const s = (v.status || "").toLowerCase()
      return s === "bed_allocated" || s === "under_treatment" || s === "under_care" || s === "stabilized" || s === "doctor_assigned"
    }).length
  }, [activeVisits])

  const roomsAvailable = useMemo(() => {
    const erBeds = beds.filter(
      (b) =>
        (b.ward?.toLowerCase().includes("er") ||
          b.ward?.toLowerCase().includes("emergency")) &&
        b.status === "Available"
    )
    if (erBeds.length > 0) return erBeds.length
    // Fallback: total hospital available beds
    const avail = beds.filter((b) => b.status === "Available").length
    return avail > 0 ? avail : 8
  }, [beds])

  const awaitingAdmission = useMemo(() => {
    return activeVisits.filter((v) => {
      const dispOutcome = v.disposition?.outcome?.toLowerCase() || ""
      const hasPendingBedReq = (v.bed_requests || []).some((r) => r.status === "pending")
      return (
        dispOutcome.includes("admit") ||
        dispOutcome.includes("ward") ||
        dispOutcome.includes("icu") ||
        hasPendingBedReq
      )
    }).length
  }, [activeVisits])

  // Filtered Visits (searches instantly on single alphabet across all records)
  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      // 1. If user typed even 1 alphabet, search across all visits immediately
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const name = (v.patient_name || v.patient?.name || v.unknown_patient_label || "").toLowerCase()
        const visitNo = (v.visit_no || "").toLowerCase()
        const uhid = (v.patient_id || "").toLowerCase()
        const phone = (v.patient_phone || v.patient?.phone || "").toLowerCase()
        const chief = (v.complaints?.[0]?.complaint || v.condition_at_arrival || "").toLowerCase()
        const room = (v.triage_bed_label || "").toLowerCase()
        const doctor = (v.assigned_doctor_name || "").toLowerCase()

        return (
          name.includes(q) ||
          visitNo.includes(q) ||
          uhid.includes(q) ||
          phone.includes(q) ||
          chief.includes(q) ||
          room.includes(q) ||
          doctor.includes(q)
        )
      }

      // 2. Status Filter
      if (statusFilter === "active" && (v.status === "closed" || !!v.closed_at)) return false
      if (statusFilter === "waiting") {
        const s = (v.status || "").toLowerCase()
        const room = v.triage_bed_label || ""
        if (!(s === "registered" || s === "triaged" || room === "Wait" || !room) || v.status === "closed") return false
      }
      if (statusFilter === "in_care") {
        const s = (v.status || "").toLowerCase()
        if (!(s === "bed_allocated" || s === "under_treatment" || s === "under_care" || s === "stabilized") || v.status === "closed") return false
      }
      if (statusFilter === "closed" && v.status !== "closed" && !v.closed_at) return false

      // 3. Acuity Filter
      const acuity = parseAcuity(v.triage_category)
      if (acuityFilter === "critical" && acuity !== 1 && acuity !== 2) return false
      if (acuityFilter === "urgent" && acuity !== 3) return false
      if (acuityFilter === "non_urgent" && acuity !== 4 && acuity !== 5) return false
      if (acuityFilter === "untriaged" && acuity !== 0) return false

      return true
    })
  }, [visits, statusFilter, acuityFilter, searchQuery])

  // Available ER beds for allocation
  const availableErBeds = useMemo(() => {
    return beds.filter(
      (b) =>
        b.status === "Available" ||
        b.ward?.toLowerCase().includes("er") ||
        b.ward?.toLowerCase().includes("emergency")
    )
  }, [beds])

  // Quick Action Handlers
  const handleAssignBed = (bedLabel: string) => {
    if (!selectedVisitId || !bedLabel) return
    setIsUpdating(true)
    try {
      ErDatabase.updateVisit(selectedVisitId, {
        triage_bed_label: bedLabel,
        status: "bed_allocated",
      })
      loadData()
      setNotice({ type: "success", message: `Bed ${bedLabel} allocated successfully.` })
    } catch {
      setNotice({ type: "error", message: "Failed to allocate bed." })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAssignDoctor = (docName: string) => {
    if (!selectedVisitId || !docName) return
    setIsUpdating(true)
    try {
      const doc = DOCTOR_MASTER.find((d: MasterDoctor) => d.name === docName)
      ErDatabase.assignDoctor(selectedVisitId, {
        doctor_name: docName,
        specialty: doc?.specialty || "Emergency Medicine",
      })
      loadData()
      setNotice({ type: "success", message: `${docName} assigned to patient.` })
    } catch {
      setNotice({ type: "error", message: "Failed to assign doctor." })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleUpdateAcuity = (level: number) => {
    if (!selectedVisitId) return
    setIsUpdating(true)
    try {
      const catCode = `ESI-${level}`
      const bedDefault = level === 1 ? "Resus Bay 1" : level === 2 ? "Trauma Bay 2" : "Observation 1"
      ErDatabase.setTriage(selectedVisitId, {
        category: catCode,
        bedLabel: selectedVisit?.triage_bed_label || bedDefault,
        reason: `Re-evaluated to ESI ${level}`,
      })
      loadData()
      setNotice({ type: "success", message: `Triage Acuity updated to ESI ${level}.` })
    } catch {
      setNotice({ type: "error", message: "Failed to update triage acuity." })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSaveVitals = () => {
    if (!selectedVisitId) return
    setIsUpdating(true)
    try {
      ErDatabase.addVitals(selectedVisitId, {
        heart_rate: vitalsInput.hr ? parseInt(vitalsInput.hr) : null,
        bp_systolic: vitalsInput.bpSys ? parseInt(vitalsInput.bpSys) : null,
        bp_diastolic: vitalsInput.bpDia ? parseInt(vitalsInput.bpDia) : null,
        spo2: vitalsInput.spo2 ? parseInt(vitalsInput.spo2) : null,
        respiratory_rate: vitalsInput.rr ? parseInt(vitalsInput.rr) : null,
        temperature: vitalsInput.temp ? parseFloat(vitalsInput.temp) : null,
        pain_score: vitalsInput.pain ? parseInt(vitalsInput.pain) : null,
      })
      loadData()
      setNotice({ type: "success", message: "Vitals recorded successfully." })
    } catch {
      setNotice({ type: "error", message: "Failed to record vitals." })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleQuickDisposition = (outcome: "discharge" | "ward" | "icu" | "ot") => {
    if (!selectedVisitId) return
    setIsUpdating(true)
    try {
      const outcomeLabels: Record<string, string> = {
        discharge: "Discharged Home (Stable)",
        ward: "Admit to Inpatient Ward",
        icu: "Admit to Intensive Care Unit (ICU)",
        ot: "Emergency Transfer to Operation Theatre",
      }
      ErDatabase.recordDisposition(selectedVisitId, {
        outcome,
        required_specialty: outcome === "icu" ? "Critical Care" : "General Medicine",
        clinical_reason: outcomeLabels[outcome],
        decided_by: "ER Attending Physician",
      })
      if (outcome === "discharge") {
        ErDatabase.closeVisit(selectedVisitId)
      }
      loadData()
      setNotice({ type: "success", message: `Disposition recorded: ${outcomeLabels[outcome]}.` })
    } catch {
      setNotice({ type: "error", message: "Failed to record disposition." })
    } finally {
      setIsUpdating(false)
    }
  }

  // Current formatted timestamp
  const currentTimestamp = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) + " · " + d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }, [now])

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F0F2F5] min-h-full">
      {/* Top Banner & Title Bar */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">
              Emergency Department
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-red-100 text-red-700 animate-pulse">
              ● Live ED Census
            </span>
          </div>
          <p className="text-[11.5px] text-[#64748B]">
            General Hospital ED · Real-time patient flow & acuity board · {currentTimestamp}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={loadData}
            title="Refresh ED Data"
            className="p-1.5 border border-[#DDE2EC] rounded bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#1B4FD8]" : ""}`} />
          </button>

          {/* View Toggle */}
          <div className="flex border border-[#DDE2EC] rounded overflow-hidden">
            <button
              onClick={() => setView("board")}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                view === "board"
                  ? "bg-[#1B4FD8] text-white"
                  : "bg-white text-[#64748B] hover:bg-[#F8FAFC]"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                view === "list"
                  ? "bg-[#1B4FD8] text-white"
                  : "bg-white text-[#64748B] hover:bg-[#F8FAFC]"
              }`}
            >
              List
            </button>
          </div>

          {/* Quick Register Patient */}
          <Btn
            variant="primary"
            size="sm"
            onClick={() => {
              if (onRegister) {
                onRegister()
              } else {
                setShowRegisterModal(true)
              }
            }}
          >
            <Icon.Plus /> Register Patient
          </Btn>
        </div>
      </div>

      {/* Notice alert */}
      {notice && (
        <div
          className={`mx-6 mt-3 p-3 rounded text-[12px] flex items-center justify-between border ${
            notice.type === "success"
              ? "bg-green-50 text-green-800 border-green-200"
              : notice.type === "error"
              ? "bg-red-50 text-red-800 border-red-200"
              : "bg-blue-50 text-blue-800 border-blue-200"
          }`}
        >
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className="text-gray-500 hover:text-gray-700 cursor-pointer">
            <FiX />
          </button>
        </div>
      )}

      {/* Dynamic Census Bar */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <div className="text-center">
          <div className="text-2xl font-semibold font-mono text-gray-900">
            {totalCensus}
          </div>
          <div className="text-[11px] font-medium text-[#64748B]">
            Total Census
          </div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-semibold font-mono text-[#DC2626]">
            {critical}
          </div>
          <div className="text-[11px] font-medium text-[#64748B]">
            ESI 1–2 (Critical)
          </div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-semibold font-mono text-[#D97706]">
            {waiting}
          </div>
          <div className="text-[11px] font-medium text-[#64748B]">Waiting</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-semibold font-mono text-[#16A34A]">
            {inCare}
          </div>
          <div className="text-[11px] font-medium text-[#64748B]">In Care</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-semibold font-mono text-[#0284C7]">
            {roomsAvailable}
          </div>
          <div className="text-[11px] font-medium text-[#64748B]">
            Rooms Available
          </div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-semibold font-mono text-[#7C3AED]">
            {awaitingAdmission}
          </div>
          <div className="text-[11px] font-medium text-[#64748B]">
            Awaiting Admission
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 py-3 bg-[#FAFBFD] border-b border-[#DDE2EC] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <InstantPatientSearchDropdown
            value={searchQuery}
            onChange={setSearchQuery}
            activeVisits={visits}
            onSelectVisit={(visitId) => setSelectedVisitId(visitId)}
            placeholder="Search patient by typing any letter (e.g. 'a', 'r')..."
            className="w-full"
            onClear={() => setSearchQuery("")}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-white border border-[#DDE2EC] rounded p-0.5">
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === "active" ? "bg-[#1B4FD8] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Active ({activeVisits.length})
            </button>
            <button
              onClick={() => setStatusFilter("waiting")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === "waiting" ? "bg-[#1B4FD8] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Waiting ({waiting})
            </button>
            <button
              onClick={() => setStatusFilter("in_care")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === "in_care" ? "bg-[#1B4FD8] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              In Care ({inCare})
            </button>
            <button
              onClick={() => setStatusFilter("closed")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === "closed" ? "bg-[#1B4FD8] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Discharged
            </button>
          </div>

          {/* Acuity Filter */}
          <select
            value={acuityFilter}
            onChange={(e) => setAcuityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] bg-white border border-[#DDE2EC] rounded text-gray-700 focus:outline-none focus:border-[#1B4FD8]"
          >
            <option value="all">All Acuities</option>
            <option value="critical">Critical (ESI 1-2)</option>
            <option value="urgent">Urgent (ESI 3)</option>
            <option value="non_urgent">Non-Urgent (ESI 4-5)</option>
            <option value="untriaged">Untriaged</option>
          </select>
        </div>
      </div>

      {/* Main Track Board & List Area */}
      <div className="p-5 flex-1 overflow-x-auto">
        {filteredVisits.length === 0 ? (
          <div className="bg-white border border-[#DDE2EC] rounded p-12 text-center text-[#64748B] space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-[#1B4FD8] flex items-center justify-center text-xl mx-auto">
              🛡️
            </div>
            <div>
              <p className="text-[13px] font-semibold text-gray-800">
                No Emergency Patients Found
              </p>
              <p className="text-[11.5px] text-[#64748B] mt-1">
                {searchQuery || acuityFilter !== "all" || statusFilter !== "active"
                  ? "Try adjusting your search criteria or filter options."
                  : "All emergency bays and waiting areas are currently clear."}
              </p>
            </div>
            <Btn
              variant="primary"
              size="sm"
              onClick={() => {
                if (onRegister) onRegister()
                else setShowRegisterModal(true)
              }}
            >
              <Icon.Plus /> Register New Patient
            </Btn>
          </div>
        ) : view === "board" ? (
          /* Dynamic Track Board */
          <div className="bg-white border border-[#DDE2EC] rounded overflow-x-auto shadow-2xs">
            <div
              className="grid min-w-[960px] text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider bg-[#F8FAFC] border-b border-[#DDE2EC]"
              style={{
                gridTemplateColumns: "36px 1.4fr 1.2fr 75px 85px 85px 120px 105px 110px",
              }}
            >
              {[
                "#",
                "Patient",
                "Chief Complaint",
                "Acuity",
                "Room / Bay",
                "Wait Time",
                "Attending Doc",
                "Status",
                "Actions",
              ].map((h, i) => (
                <div key={i} className="px-3 py-2.5">
                  {h}
                </div>
              ))}
            </div>

            {filteredVisits.map((p, i) => {
              const acuity = parseAcuity(p.triage_category)
              const waitStr = getWaitTimeString(p.arrival_at, p.closed_at)
              const isWaitLong = waitStr.includes("h") || parseInt(waitStr) > 45
              const isWaitModerate = parseInt(waitStr) > 20
              const chiefComplaint =
                p.complaints?.[0]?.complaint ||
                p.condition_at_arrival ||
                (p.is_unknown_patient ? "Trauma / Unknown intake" : "Assessment pending")
              const patientName =
                p.patient_name ||
                p.patient?.name ||
                p.unknown_patient_label ||
                `Patient #${p.id}`
              const patientAge = p.patient_age ?? p.patient?.age ?? "—"
              const room = p.triage_bed_label || "Wait"
              const doctor = p.assigned_doctor_name || "Unassigned"
              const statusInfo = formatErStatus(p.status)

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedVisitId(p.id)
                    onSelect?.(p.id)
                  }}
                  className={`grid min-w-[960px] items-center border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] cursor-pointer transition-colors ${
                    acuity === 1
                      ? "bg-[#FEF2F2]/60 hover:bg-[#FEF2F2]"
                      : acuity === 2
                      ? "bg-[#FFFBEB]/60 hover:bg-[#FFFBEB]"
                      : ""
                  }`}
                  style={{
                    gridTemplateColumns: "36px 1.4fr 1.2fr 75px 85px 85px 120px 105px 110px",
                  }}
                >
                  {/* # Index */}
                  <div className="pl-3 text-[11px] font-mono text-[#94A3B8]">
                    {i + 1}
                  </div>

                  {/* Patient Info */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold text-gray-900 truncate">
                        {highlightMatch(patientName, searchQuery)}
                      </span>
                      {p.is_unknown_patient && (
                        <span className="text-[9.5px] font-bold px-1 py-0.2 bg-amber-100 text-amber-800 rounded">
                          UNKNOWN
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 mt-0.5">
                      <span>{patientAge} yrs</span>
                      <span>·</span>
                      <span className="font-mono">{p.patient_gender || "—"}</span>
                      <span>·</span>
                      <span className="font-mono text-[#94A3B8]">{highlightMatch(p.visit_no, searchQuery)}</span>
                    </div>
                  </div>

                  {/* Chief Complaint */}
                  <div className="px-3 py-1 text-[11.5px] text-gray-700 truncate" title={chiefComplaint}>
                    {chiefComplaint}
                  </div>

                  {/* Acuity Badge */}
                  <div className="px-3">
                    {acuity > 0 ? (
                      <AcuityBadge level={acuity} />
                    ) : (
                      <span className="bg-gray-100 text-gray-600 font-mono text-[10.5px] font-medium px-1.5 py-0.5 rounded">
                        Untriaged
                      </span>
                    )}
                  </div>

                  {/* Room / Bay */}
                  <div className="px-3">
                    <span
                      className={`font-mono font-semibold text-[11.5px] px-1.5 py-0.5 rounded ${
                        room === "Wait" || !room
                          ? "bg-amber-50 text-[#D97706] border border-amber-200"
                          : "bg-blue-50 text-blue-800 border border-blue-200"
                      }`}
                    >
                      {room || "Wait"}
                    </span>
                  </div>

                  {/* Wait Time */}
                  <div className="px-3">
                    <span
                      className={`font-mono text-[11.5px] ${
                        isWaitLong
                          ? "text-[#DC2626] font-bold"
                          : isWaitModerate
                          ? "text-[#D97706] font-semibold"
                          : "text-gray-700"
                      }`}
                    >
                      {waitStr}
                    </span>
                  </div>

                  {/* Provider / Doctor */}
                  <div className="px-3 text-[11.5px] text-gray-700 truncate" title={doctor}>
                    {doctor === "Unassigned" ? (
                      <span className="text-gray-400 italic">Unassigned</span>
                    ) : (
                      doctor
                    )}
                  </div>

                  {/* Status */}
                  <div className="px-3">
                    <StatusBadge status={statusInfo.badgeStatus} />
                  </div>

                  {/* Actions */}
                  <div className="px-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedVisitId(p.id)}
                      className="px-2 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 rounded transition-colors"
                      title="Quick Clinical Overview"
                    >
                      View
                    </button>
                    {onOpenTriage && (
                      <button
                        onClick={() => onOpenTriage(p.id)}
                        className="px-2 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-[#1B4FD8] rounded transition-colors"
                        title="Open Triage Assessment"
                      >
                        Triage
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Dynamic List Table View */
          <div className="bg-white border border-[#DDE2EC] rounded overflow-hidden shadow-2xs">
            <Table
              headers={[
                "Patient",
                "Age/Sex",
                "Visit No",
                "Chief Complaint",
                "Acuity",
                "Bay / Room",
                "Wait",
                "Provider",
                "Status",
                "Actions",
              ]}
            >
              {filteredVisits.map((p) => {
                const acuity = parseAcuity(p.triage_category)
                const waitStr = getWaitTimeString(p.arrival_at, p.closed_at)
                const chiefComplaint =
                  p.complaints?.[0]?.complaint ||
                  p.condition_at_arrival ||
                  (p.is_unknown_patient ? "Trauma / Unknown" : "Pending assessment")
                const patientName =
                  p.patient_name ||
                  p.patient?.name ||
                  p.unknown_patient_label ||
                  `Patient #${p.id}`
                const statusInfo = formatErStatus(p.status)

                return (
                  <TR
                    key={p.id}
                    onClick={() => {
                      setSelectedVisitId(p.id)
                      onSelect?.(p.id)
                    }}
                  >
                    <TD>
                      <div className="font-semibold text-gray-900">{patientName}</div>
                      <div className="text-[10.5px] text-gray-500 font-mono">
                        {p.patient_id || "No UHID"}
                      </div>
                    </TD>
                    <TD>
                      <span className="font-mono text-gray-600">
                        {p.patient_age ?? "—"} / {p.patient_gender || "—"}
                      </span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[11px] text-gray-600">{p.visit_no}</span>
                    </TD>
                    <TD>
                      <span className="text-[11.5px] text-gray-800 line-clamp-1">{chiefComplaint}</span>
                    </TD>
                    <TD>
                      {acuity > 0 ? (
                        <AcuityBadge level={acuity} />
                      ) : (
                        <span className="bg-gray-100 text-gray-600 font-mono text-[10.5px] px-1.5 py-0.5 rounded">
                          Untriaged
                        </span>
                      )}
                    </TD>
                    <TD>
                      <span className="font-mono font-semibold text-[11.5px] text-gray-800">
                        {p.triage_bed_label || "Wait"}
                      </span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[11.5px] text-gray-700">{waitStr}</span>
                    </TD>
                    <TD>
                      <span className="text-gray-700 text-[11.5px]">
                        {p.assigned_doctor_name || "—"}
                      </span>
                    </TD>
                    <TD>
                      <StatusBadge status={statusInfo.badgeStatus} />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedVisitId(p.id)}
                          className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 rounded"
                        >
                          Chart
                        </button>
                        {onOpenTriage && (
                          <button
                            onClick={() => onOpenTriage(p.id)}
                            className="px-2 py-0.5 text-[11px] font-medium bg-blue-50 hover:bg-blue-100 text-[#1B4FD8] rounded"
                          >
                            Triage
                          </button>
                        )}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </Table>
          </div>
        )}
      </div>

      {/* Patient Clinical Quick Drawer */}
      {selectedVisit && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-2xs flex justify-end transition-opacity">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">
                    {selectedVisit.patient_name || selectedVisit.patient?.name || selectedVisit.unknown_patient_label || `Visit #${selectedVisit.id}`}
                  </h2>
                  {parseAcuity(selectedVisit.triage_category) > 0 && (
                    <AcuityBadge level={parseAcuity(selectedVisit.triage_category)} />
                  )}
                  <StatusBadge status={formatErStatus(selectedVisit.status).badgeStatus} />
                </div>
                <div className="text-[11.5px] text-[#64748B] flex items-center gap-2 mt-0.5">
                  <span>Visit: {selectedVisit.visit_no}</span>
                  <span>·</span>
                  <span>UHID: {selectedVisit.patient_id || "Unregistered"}</span>
                  <span>·</span>
                  <span>{selectedVisit.patient_age ?? "—"} yrs, {selectedVisit.patient_gender || "—"}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedVisitId(null)}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 cursor-pointer"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Quick Actions Bar */}
              <div className="flex items-center gap-2">
                {onOpenTriage && (
                  <button
                    onClick={() => {
                      onOpenTriage(selectedVisit.id)
                      setSelectedVisitId(null)
                    }}
                    className="flex-1 px-3 py-2 bg-[#1B4FD8] hover:bg-[#1E40AF] text-white font-semibold text-[12px] rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FiShield /> Open Full Triage
                  </button>
                )}
                {onOpenTrackBoard && (
                  <button
                    onClick={() => {
                      onOpenTrackBoard()
                      setSelectedVisitId(null)
                    }}
                    className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-[12px] rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FiCornerDownRight /> Track Board
                  </button>
                )}
              </div>

              {/* 1. Intake & Complaints */}
              <div className="bg-[#FAFBFD] border border-[#DDE2EC] rounded p-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FiClock className="text-[#1B4FD8]" /> Arrival & Intake Details
                </h3>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <span className="text-gray-500 block text-[10.5px]">Arrival Time</span>
                    <span className="font-semibold text-gray-800">
                      {selectedVisit.arrival_at
                        ? new Date(selectedVisit.arrival_at).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10.5px]">Arrival Mode</span>
                    <span className="font-semibold text-gray-800">
                      {selectedVisit.arrival_mode || "Walk-in"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10.5px]">Condition at Arrival</span>
                    <span className="font-semibold text-gray-800">
                      {selectedVisit.condition_at_arrival || "Stable"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10.5px]">Wait Time</span>
                    <span className="font-mono font-bold text-[#1B4FD8]">
                      {getWaitTimeString(selectedVisit.arrival_at, selectedVisit.closed_at)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#DDE2EC]">
                  <span className="text-gray-500 block text-[10.5px]">Chief Complaints</span>
                  <div className="mt-1 space-y-1">
                    {selectedVisit.complaints && selectedVisit.complaints.length > 0 ? (
                      selectedVisit.complaints.map((c, idx) => (
                        <div key={idx} className="bg-white border border-[#E2E8F0] p-2 rounded text-[11.5px] text-gray-800">
                          <span className="font-semibold">{c.complaint}</span>
                          {c.duration && <span className="text-gray-500 ml-1.5">({c.duration})</span>}
                          {c.severity && (
                            <span className="ml-2 text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                              Severity: {c.severity}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-[11.5px] text-gray-500 italic">No formal complaint items logged.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Rapid Vitals */}
              <div className="bg-[#FAFBFD] border border-[#DDE2EC] rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FiActivity className="text-emerald-600" /> Vital Signs
                  </h3>
                  <button
                    onClick={handleSaveVitals}
                    disabled={isUpdating}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors cursor-pointer"
                  >
                    Save Vitals
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600 block">HR (bpm)</label>
                    <input
                      type="number"
                      placeholder="e.g. 78"
                      value={vitalsInput.hr}
                      onChange={(e) => setVitalsInput({ ...vitalsInput, hr: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600 block">BP Sys</label>
                    <input
                      type="number"
                      placeholder="120"
                      value={vitalsInput.bpSys}
                      onChange={(e) => setVitalsInput({ ...vitalsInput, bpSys: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600 block">BP Dia</label>
                    <input
                      type="number"
                      placeholder="80"
                      value={vitalsInput.bpDia}
                      onChange={(e) => setVitalsInput({ ...vitalsInput, bpDia: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600 block">SpO2 (%)</label>
                    <input
                      type="number"
                      placeholder="98"
                      value={vitalsInput.spo2}
                      onChange={(e) => setVitalsInput({ ...vitalsInput, spo2: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600 block">RR (/min)</label>
                    <input
                      type="number"
                      placeholder="18"
                      value={vitalsInput.rr}
                      onChange={(e) => setVitalsInput({ ...vitalsInput, rr: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600 block">Temp (°F)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="98.6"
                      value={vitalsInput.temp}
                      onChange={(e) => setVitalsInput({ ...vitalsInput, temp: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-600 block">Pain (0-10)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={vitalsInput.pain}
                      onChange={(e) => setVitalsInput({ ...vitalsInput, pain: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Triage & Bed Allocation */}
              <div className="bg-[#FAFBFD] border border-[#DDE2EC] rounded p-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FiShield className="text-indigo-600" /> Triage Acuity & Bed Assignment
                </h3>

                <div>
                  <span className="text-[11px] font-semibold text-gray-600 block mb-1.5">
                    Select ESI Acuity Scale:
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => handleUpdateAcuity(lvl)}
                        className={`py-1.5 px-2 rounded text-[11.5px] font-mono font-bold transition-all border ${
                          parseAcuity(selectedVisit.triage_category) === lvl
                            ? "bg-[#1B4FD8] text-white border-[#1B4FD8] shadow-xs"
                            : "bg-white text-gray-700 border-[#DDE2EC] hover:bg-gray-50"
                        }`}
                      >
                        ESI {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[10.5px] font-semibold text-gray-600 block mb-1">
                      Assign Room / Bay:
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={selectedBed}
                        onChange={(e) => setSelectedBed(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                      >
                        <option value="">-- Choose Bay --</option>
                        <option value="Resus Bay 1">Resus Bay 1</option>
                        <option value="Resus Bay 2">Resus Bay 2</option>
                        <option value="Trauma Bay 1">Trauma Bay 1</option>
                        <option value="Trauma Bay 2">Trauma Bay 2</option>
                        <option value="Acute Bay 3">Acute Bay 3</option>
                        <option value="Acute Bay 4">Acute Bay 4</option>
                        <option value="Observation 1">Observation 1</option>
                        <option value="Observation 2">Observation 2</option>
                        <option value="Wait">Waiting Room</option>
                        {availableErBeds.map((b) => (
                          <option key={b.id} value={b.bed_no}>
                            {b.bed_no} ({b.ward} - Room {b.room_no})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignBed(selectedBed)}
                        disabled={!selectedBed || isUpdating}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-[#1B4FD8] hover:bg-[#1E40AF] text-white rounded transition-colors disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-gray-600 block mb-1">
                      Assign Physician:
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={selectedDoctor}
                        onChange={(e) => setSelectedDoctor(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border border-[#DDE2EC] rounded bg-white text-gray-800"
                      >
                        <option value="">-- Choose Doctor --</option>
                        {DOCTOR_MASTER.map((d: MasterDoctor) => (
                          <option key={d.id} value={d.name}>
                            {d.name} ({d.specialty || "ED"})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignDoctor(selectedDoctor)}
                        disabled={!selectedDoctor || isUpdating}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-[#1B4FD8] hover:bg-[#1E40AF] text-white rounded transition-colors disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Quick Disposition */}
              <div className="bg-[#FAFBFD] border border-[#DDE2EC] rounded p-4 space-y-2.5">
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FiCheckCircle className="text-purple-600" /> Patient Disposition
                </h3>
                <p className="text-[11.5px] text-gray-600">
                  Select outcome when patient is ready to leave the emergency bay:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => handleQuickDisposition("discharge")}
                    disabled={isUpdating}
                    className="p-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded text-[11px] transition-colors"
                  >
                    Discharge Home
                  </button>
                  <button
                    onClick={() => handleQuickDisposition("ward")}
                    disabled={isUpdating}
                    className="p-2 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold rounded text-[11px] transition-colors"
                  >
                    Admit to Ward
                  </button>
                  <button
                    onClick={() => handleQuickDisposition("icu")}
                    disabled={isUpdating}
                    className="p-2 border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 font-semibold rounded text-[11px] transition-colors"
                  >
                    Admit to ICU
                  </button>
                  <button
                    onClick={() => handleQuickDisposition("ot")}
                    disabled={isUpdating}
                    className="p-2 border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 font-semibold rounded text-[11px] transition-colors"
                  >
                    Transfer to OT
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-3 bg-[#F8FAFC] border-t border-[#DDE2EC] flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-500 font-mono">
                ID: {selectedVisit.id} · Synced
              </span>
              <button
                onClick={() => setSelectedVisitId(null)}
                className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick ER Registration Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            <ErRegistrationForm
              categories={categories as unknown as TriageCategory[]}
              setNotice={setNotice}
              onCancel={() => setShowRegisterModal(false)}
              onCreated={(visitId) => {
                setShowRegisterModal(false)
                loadData()
                setSelectedVisitId(visitId)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
