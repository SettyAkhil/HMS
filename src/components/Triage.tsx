import React, { useState, useEffect, useMemo } from "react"
import {
  FiArrowLeft,
  FiSearch,
  FiActivity,
  FiClock,
  FiShield,
  FiAlertTriangle,
  FiCheckCircle,
  FiUserPlus,
  FiRefreshCw,
  FiChevronRight,
  FiLayers,
} from "react-icons/fi"
import { apiFetch } from "../lib/api"
import type { Notice } from "../types"
import {
  VisitDetailPanel,
  ErErrorBoundary,
  type ErVisitDetail,
  type TriageCategory,
  type ErVisit,
} from "../pages/ErPage"
import PrescriptionUploadModal from "./PrescriptionUploadModal"
import { AcuityBadge, StatusBadge } from "./shared"
import InstantPatientSearchDropdown, { highlightMatch } from "./InstantPatientSearchDropdown"

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

function getWaitTimeString(arrivalAt?: string | null): string {
  if (!arrivalAt) return "0m"
  const start = new Date(arrivalAt).getTime()
  if (isNaN(start)) return "0m"
  const diffMinutes = Math.max(0, Math.floor((Date.now() - start) / (1000 * 60)))
  if (diffMinutes < 60) return `${diffMinutes}m`
  const hours = Math.floor(diffMinutes / 60)
  const remainingMins = diffMinutes % 60
  return `${hours}h ${remainingMins}m`
}

export default function Triage({
  initialVisitId,
  setNotice,
  onNavigate,
}: {
  initialVisitId?: number | null
  setNotice?: (notice: Notice | null) => void
  onNavigate?: (module: string) => void
}) {
  const [visits, setVisits] = useState<ErVisit[]>([])
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(
    initialVisitId || null,
  )
  const [detail, setDetail] = useState<ErVisitDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [categories, setCategories] = useState<TriageCategory[]>([])
  const [prescriptionTarget, setPrescriptionTarget] = useState<{
    id: string
    name: string
    doctorName?: string
  } | null>(null)

  // Triage queue filters
  const [searchQuery, setSearchQuery] = useState("")
  const [triageFilter, setTriageFilter] = useState<"untriaged" | "all" | "critical">("untriaged")
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [])

  const loadVisitsAndConfig = async () => {
    try {
      const [visitsRes, catsRes] = await Promise.all([
        apiFetch<{ visits: ErVisit[] }>("/api/er/visits?active_only=true"),
        apiFetch<{ categories: TriageCategory[] }>("/api/er/triage-config"),
      ])
      const list = visitsRes?.visits || []
      setVisits(list)
      setCategories(catsRes?.categories || [])

      if (initialVisitId && list.some((v) => v.id === initialVisitId)) {
        setSelectedVisitId(initialVisitId)
      }
    } catch {
      // Standalone mode / offline fallback already handled
    }
  }

  const loadDetail = async (visitId: number) => {
    setDetailLoading(true)
    try {
      const data = await apiFetch<ErVisitDetail>(`/api/er/visits/${visitId}`)
      setDetail(data || null)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadVisitsAndConfig()
  }, [initialVisitId])

  useEffect(() => {
    if (selectedVisitId) {
      loadDetail(selectedVisitId)
    }
  }, [selectedVisitId])

  const refreshAfterAction = async () => {
    await loadVisitsAndConfig()
    if (selectedVisitId) {
      await loadDetail(selectedVisitId)
    }
  }

  // Active queue counters
  const untriagedList = useMemo(() => {
    return visits.filter((v) => {
      const s = (v.status || "").toLowerCase()
      return !v.triage_category || s === "registered"
    })
  }, [visits])

  const criticalList = useMemo(() => {
    return visits.filter((v) => {
      const a = parseAcuity(v.triage_category)
      return a === 1 || a === 2 || v.condition_at_arrival === "Critical" || v.condition_at_arrival === "Unconscious"
    })
  }, [visits])

  // Filtered queue (instantly matches on single alphabet across all active records)
  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      // If user typed even a single alphabet, prioritize and search across all visits immediately
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const name = (v.patient_name || v.patient?.name || v.unknown_patient_label || "").toLowerCase()
        const visitNo = (v.visit_no || "").toLowerCase()
        const uhid = (v.patient_id || "").toLowerCase()
        const chief = (v.condition_at_arrival || "").toLowerCase()
        const phone = (v.patient_phone || v.patient?.phone || "").toLowerCase()
        return name.includes(q) || visitNo.includes(q) || uhid.includes(q) || chief.includes(q) || phone.includes(q)
      }

      if (triageFilter === "untriaged") {
        const s = (v.status || "").toLowerCase()
        if (v.triage_category && s !== "registered") return false
      }
      if (triageFilter === "critical") {
        const a = parseAcuity(v.triage_category)
        if (a !== 1 && a !== 2 && v.condition_at_arrival !== "Critical" && v.condition_at_arrival !== "Unconscious") {
          return false
        }
      }
      return true
    })
  }, [visits, triageFilter, searchQuery])

  // If no patient is selected, show the live Triage Queue
  if (!selectedVisitId) {
    return (
      <div className="flex-1 bg-[#F0F2F5] p-5 sm:p-6 min-h-full flex flex-col space-y-4">
        {/* Header Bar */}
        <div className="bg-white border border-[#DDE2EC] rounded p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-blue-50 text-[#1B4FD8] flex items-center justify-center text-lg font-bold">
                🛡️
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">
                  Emergency Triage Assessment Queue
                </h1>
                <p className="text-[11.5px] text-[#64748B]">
                  Live intake assessment, ESI acuity stratification, vital signs and priority routing.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadVisitsAndConfig}
              className="px-3 py-1.5 border border-[#DDE2EC] rounded bg-white text-gray-700 hover:bg-gray-50 text-[12px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FiRefreshCw className="w-3.5 h-3.5 text-gray-500" /> Refresh Queue
            </button>
            <button
              onClick={() => onNavigate?.("emergency")}
              className="px-3 py-1.5 bg-[#1B4FD8] hover:bg-[#1E40AF] text-white rounded text-[12px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FiArrowLeft /> ED Track Board
            </button>
          </div>
        </div>

        {/* Metric Cards Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-[#DDE2EC] rounded p-4 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                Awaiting Initial Triage
              </div>
              <div className="text-2xl font-bold font-mono text-[#D97706] mt-0.5">
                {untriagedList.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-50 text-[#D97706] flex items-center justify-center text-lg">
              ⏳
            </div>
          </div>

          <div className="bg-white border border-[#DDE2EC] rounded p-4 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                Critical (ESI 1–2 / Resus)
              </div>
              <div className="text-2xl font-bold font-mono text-[#DC2626] mt-0.5">
                {criticalList.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-50 text-[#DC2626] flex items-center justify-center text-lg">
              🚨
            </div>
          </div>

          <div className="bg-white border border-[#DDE2EC] rounded p-4 shadow-2xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                Total Active ER Census
              </div>
              <div className="text-2xl font-bold font-mono text-gray-900 mt-0.5">
                {visits.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1B4FD8] flex items-center justify-center text-lg">
              🏥
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white border border-[#DDE2EC] rounded p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <InstantPatientSearchDropdown
            value={searchQuery}
            onChange={setSearchQuery}
            activeVisits={visits}
            onSelectVisit={(visitId) => setSelectedVisitId(visitId)}
            placeholder="Type any alphabet to search patient (e.g. 'a', 'r')..."
            className="max-w-md"
            onClear={() => setSearchQuery("")}
          />

          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded border border-[#DDE2EC]">
            <button
              onClick={() => setTriageFilter("untriaged")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                triageFilter === "untriaged"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Needs Triage ({untriagedList.length})
            </button>
            <button
              onClick={() => setTriageFilter("critical")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                triageFilter === "critical"
                  ? "bg-white text-[#DC2626] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Critical / ESI 1-2 ({criticalList.length})
            </button>
            <button
              onClick={() => setTriageFilter("all")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                triageFilter === "all"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All Active ({visits.length})
            </button>
          </div>
        </div>

        {/* Patient Queue Cards */}
        {filteredVisits.length === 0 ? (
          <div className="bg-white border border-[#DDE2EC] rounded p-12 text-center text-[#64748B] shadow-2xs space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mx-auto">
              ✓
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {triageFilter === "untriaged"
                  ? "All Patients Are Triaged"
                  : "No Patients Found in Queue"}
              </h2>
              <p className="text-[12px] text-[#64748B] mt-1 max-w-md mx-auto">
                {triageFilter === "untriaged"
                  ? "Every active patient currently in the Emergency Room has an assigned ESI acuity."
                  : "Try adjusting your search criteria or switch to another queue filter."}
              </p>
            </div>
            <button
              onClick={() => onNavigate?.("emergency")}
              className="px-4 py-2 bg-[#1B4FD8] hover:bg-[#1E40AF] text-white font-semibold rounded text-[12px] transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <FiArrowLeft /> Go to ED Track Board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredVisits.map((v) => {
              const acuity = parseAcuity(v.triage_category)
              const waitStr = getWaitTimeString(v.arrival_at)
              const isUntriaged = !v.triage_category || (v.status || "").toLowerCase() === "registered"
              const isAmbulance = (v.arrival_mode || "").toLowerCase().includes("ambulance")
              const patientName =
                v.patient_name ||
                v.patient?.name ||
                v.unknown_patient_label ||
                `Patient #${v.id}`

              return (
                <div
                  key={v.id}
                  className={`bg-white border rounded p-4 shadow-2xs flex flex-col justify-between transition-all hover:shadow-md ${
                    acuity === 1
                      ? "border-red-300 bg-red-50/20"
                      : acuity === 2
                      ? "border-amber-300 bg-amber-50/20"
                      : isUntriaged
                      ? "border-blue-200"
                      : "border-[#DDE2EC]"
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Acuity & Arrival Mode */}
                    <div className="flex items-center justify-between">
                      {isUntriaged ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                          ● Awaiting Triage
                        </span>
                      ) : (
                        <AcuityBadge level={acuity} />
                      )}

                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                        {isAmbulance ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-[10px] flex items-center gap-1">
                            🚑 Ambulance
                          </span>
                        ) : (
                          <span className="text-gray-500">{v.arrival_mode || "Walk-in"}</span>
                        )}
                        <span>·</span>
                        <span className="font-mono text-gray-700 font-semibold flex items-center gap-0.5">
                          <FiClock className="w-3 h-3 text-gray-400" /> {waitStr}
                        </span>
                      </div>
                    </div>

                    {/* Patient Details */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 leading-snug">
                        {highlightMatch(patientName, searchQuery)}
                      </h3>
                      <div className="text-[11px] text-[#64748B] flex items-center gap-2 mt-0.5 font-mono">
                        <span>{v.patient_age ?? "—"} yrs</span>
                        <span>·</span>
                        <span>{v.patient_gender || "—"}</span>
                        <span>·</span>
                        <span>{highlightMatch(v.visit_no, searchQuery)}</span>
                      </div>
                    </div>

                    {/* Condition & Arrival Note */}
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded text-[11.5px] space-y-1">
                      <div className="flex items-center justify-between text-[10.5px] text-gray-500">
                        <span>Condition at Arrival:</span>
                        <span className="font-semibold text-gray-800">
                          {v.condition_at_arrival || "Stable"}
                        </span>
                      </div>
                      <div className="text-gray-700 font-medium">
                        {v.triage_bed_label ? (
                          <span className="text-gray-500 text-[10.5px]">
                            Assigned Bay: <strong className="text-gray-800">{v.triage_bed_label}</strong>
                          </span>
                        ) : (
                          <span className="text-amber-700 text-[10.5px] italic">
                            No bay assigned yet
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action: Start Triage */}
                  <div className="pt-3 border-t border-[#F1F5F9] mt-3">
                    <button
                      onClick={() => setSelectedVisitId(v.id)}
                      className={`w-full py-2 px-3 rounded text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isUntriaged
                          ? "bg-[#1B4FD8] hover:bg-[#1E40AF] text-white shadow-xs"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                      }`}
                    >
                      <FiShield /> {isUntriaged ? "Start Triage Assessment" : "Review & Update Triage"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // When selectedVisitId is set, render the complete clinical triage panel
  return (
    <div className="flex-1 bg-[#F0F2F5] p-5 sm:p-6 min-h-full space-y-3">
      {/* Back to Queue Navigation Banner */}
      <div className="bg-white border border-[#DDE2EC] rounded px-4 py-2.5 flex items-center justify-between shadow-2xs">
        <button
          onClick={() => setSelectedVisitId(null)}
          className="text-xs font-semibold text-[#1B4FD8] hover:text-[#1E40AF] flex items-center gap-1.5 cursor-pointer"
        >
          <FiArrowLeft /> Back to Triage Queue
        </button>
        <span className="text-[11.5px] text-[#64748B]">
          Viewing Triage & Clinical Chart for Visit #{selectedVisitId}
        </span>
      </div>

      {detail ? (
        <ErErrorBoundary onReset={refreshAfterAction}>
          <VisitDetailPanel
            key={detail.id}
            detail={detail}
            loading={detailLoading}
            categories={categories}
            setNotice={setNotice || (() => {})}
            onNavigate={onNavigate}
            onBack={() => setSelectedVisitId(null)}
            onRefresh={refreshAfterAction}
            onOrderMedication={() =>
              setPrescriptionTarget({
                id: detail.patient_id || "",
                name: detail.patient_id
                  ? detail.patient_id
                  : detail.unknown_patient_label || detail.visit_no,
                doctorName: detail.assigned_doctor_name || undefined,
              })
            }
            visits={visits}
            onSelectVisit={(id) => setSelectedVisitId(id)}
          />
        </ErErrorBoundary>
      ) : (
        <div className="bg-white border border-[#DDE2EC] rounded p-12 text-center text-[#64748B]">
          <p className="text-[13px]">Loading patient triage chart...</p>
        </div>
      )}

      {prescriptionTarget && (
        <PrescriptionUploadModal
          patientId={prescriptionTarget.id}
          patientName={prescriptionTarget.name}
          doctorName={prescriptionTarget.doctorName}
          mode="manual"
          setNotice={setNotice || (() => {})}
          onClose={() => setPrescriptionTarget(null)}
        />
      )}
    </div>
  )
}
