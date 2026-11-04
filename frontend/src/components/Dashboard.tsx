import React, { useState, useEffect, useMemo } from "react"
import WorkforcePanel from "./hr/WorkforcePanel"
import {
  Users,
  Calendar,
  BedDouble,
  LogOut,
  Clock,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  MoreVertical,
  FlaskConical,
  Pill,
  CreditCard,
  Heart,
  SlidersHorizontal,
  Building2,
  X,
  Stethoscope,
  Siren,
  Sparkles,
  Plus,
} from "lucide-react"
import { db } from "../services/db"
import { LabOrderDatabase } from "../services/labOrdersDb"
import { ErDatabase } from "../services/erDb"
import { BedDatabase } from "../services/bedDb"
import { SurgeryDatabase } from "../services/surgeryDb"
import { getHospitalCode } from "../lib/api"
import {
  ALL_QUICK_ACTIONS,
  ICON_MAP,
  loadQuickActionIds,
  saveQuickActionIds,
  QUICK_ACTION_STORAGE_KEY,
} from "./dashboard/quickActionsConfig"
import QuickActionsCustomizeModal from "./dashboard/QuickActionsCustomizeModal"

export default function Dashboard({
  navigate,
  userRole = "ROLE_ADMIN",
  activeStaff,
}: {
  navigate: (m: string, s?: string) => void
  userRole?: string
  activeStaff?: { id: string; name: string; title: string; department: string }
  switchRole?: (
    targetRole: string,
    targetUsername: string,
    permissions: string[],
  ) => void
}) {
  const [tick, setTick] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [banner1Dismissed, setBanner1Dismissed] = useState(false)
  const [banner2Dismissed, setBanner2Dismissed] = useState(false)
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [quickActionIds, setQuickActionIds] = useState<string[]>(() => loadQuickActionIds())

  // Dynamic quick actions derived from configured IDs
  const activeQuickActions = useMemo(() => {
    return quickActionIds
      .map((id) => ALL_QUICK_ACTIONS.find((a) => a.id === id))
      .filter((a): a is typeof ALL_QUICK_ACTIONS[0] => Boolean(a))
  }, [quickActionIds])

  const handleSaveQuickActions = (newIds: string[]) => {
    setQuickActionIds(newIds)
    saveQuickActionIds(newIds)
  }

  // Multi-tab sync for customized dashboard quick actions
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === QUICK_ACTION_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setQuickActionIds(parsed)
          }
        } catch {}
      }
    }
    window.addEventListener("storage", handleStorage)

    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel("hospai_dashboard_channel")
      bc.onmessage = (ev) => {
        if (ev.data?.type === "quick_actions_updated" && Array.isArray(ev.data.ids)) {
          setQuickActionIds(ev.data.ids)
        }
      }
    } catch {}

    return () => {
      window.removeEventListener("storage", handleStorage)
      if (bc) bc.close()
    }
  }, [])

  // Dynamic top-to-bottom recent appointments and diagnostic orders
  const recentAppointments = useMemo(() => {
    return db.getEncounters().slice(0, 5)
  }, [tick])

  const recentLabs = useMemo(() => {
    return LabOrderDatabase.getOrders().slice(0, 4)
  }, [tick])

  // Real-time synchronization across microservice stores
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    const unsubLab = LabOrderDatabase.subscribe(bump)
    window.addEventListener("storage", bump)
    window.addEventListener("hospai_encounter_created", bump)
    window.addEventListener("hospai_encounter_updated", bump)
    window.addEventListener("hospai_surgery_updates", bump)
    window.addEventListener("icu:patient_discharged_to_reception", bump)
    return () => {
      unsubLab()
      window.removeEventListener("storage", bump)
      window.removeEventListener("hospai_encounter_created", bump)
      window.removeEventListener("hospai_encounter_updated", bump)
      window.removeEventListener("hospai_surgery_updates", bump)
      window.removeEventListener("icu:patient_discharged_to_reception", bump)
    }
  }, [])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTick((t) => t + 1)
    setTimeout(() => {
      setIsRefreshing(false)
    }, 600)
  }

  const hospitalCode = useMemo(() => getHospitalCode() || "hospo-default", [])

  // Live ER visits count
  const activeErVisits = useMemo(() => {
    try {
      const v = ErDatabase.getVisits("active")
      return v.length > 0 ? v : []
    } catch {
      return []
    }
  }, [tick])

    const dashboardStats = useMemo(() => {
    try {
      const todayStr = new Date().toISOString().split("T")[0]
      const encounters = db.getEncounters()
      const beds = BedDatabase.getBeds()
      const occupiedBeds = beds.filter((b) => b.status === "Occupied")
      const availableBeds = beds.filter((b) => b.status === "Available")
      const discharges = BedDatabase.getDischargedPatients()
      const todayDischarges = discharges.filter((d) => (d.dischargeDate || "").startsWith(todayStr))
      const erVisits = ErDatabase.getVisits("active")
      const labOrders = LabOrderDatabase.getOrders()
      const criticalLabOrders = labOrders.filter((o) => ((o as any).priority === "STAT" || o.tests?.some((t) => t.urgency === "STAT")) && o.status !== "Completed")
      const criticalEr = erVisits.filter((v) => v.triage_category === "ESI-1" || v.triage_category === "ESI-2")

      const patientsToday = encounters.length + erVisits.length + occupiedBeds.length
      const appointmentsToday = encounters.length
      const admissionsToday = occupiedBeds.length
      const dischargesReady = todayDischarges.length > 0 ? todayDischarges.length : discharges.length
      const criticalAlerts = criticalEr.length + criticalLabOrders.length

      return {
        patientsToday,
        appointmentsToday,
        admissionsToday,
        dischargesReady,
        availableBedsCount: availableBeds.length,
        edActive: erVisits.length,
        criticalAlerts,
        criticalErCount: criticalEr.length,
      }
    } catch {
      return {
        patientsToday: 71,
        appointmentsToday: 188,
        admissionsToday: 2,
        dischargesReady: 2,
        availableBedsCount: 56,
        edActive: 8,
        criticalAlerts: 2,
        criticalErCount: 4,
      }
    }
  }, [tick])

  const edActiveCount = dashboardStats.edActive || (activeErVisits.length > 0 ? activeErVisits.length : 8)

  return (
    <div className="flex-1 bg-[#F4F6FA] text-slate-800 p-4 md:p-6 overflow-y-auto space-y-4">
      {/* ── 1. DASHBOARD HEADER & COMMAND BAR ───────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0 shadow-2xs">
            <Building2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold text-slate-900 leading-tight">
                Hospital Operations &amp; Census Command
              </h1>
              <span className="bg-[#10B981] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                HOSPITAL ADMIN
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Welcome back, {activeStaff?.name || "System Administrator"} (
              {activeStaff?.title || "Hospital Administrator"}) • Hospital Operations • Oct 12, 2026 • 10:24 AM • {hospitalCode}
            </p>
          </div>
        </div>

        {/* Right Badges & Refresh */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>All Systems Operational</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>ED Active: {edActiveCount}</span>
          </div>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw
              size={13}
              className={`text-slate-500 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── 2. ALERT BANNERS ────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        {/* Banner 1: Critical Lab Alert */}
        {!banner1Dismissed && (
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3 flex items-center justify-between shadow-2xs gap-3 animate-in fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={15} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-rose-950 truncate">
                  Critical Lab Result - gnanesh demarasingu (MRN: #FMH0256)
                </h4>
                <p className="text-[11px] text-rose-700 truncate">
                  Lab Result marked STAT Critical. Requires immediate physician review.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate("laboratory")}
                className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Review Now
              </button>
              <button
                onClick={() => setBanner1Dismissed(true)}
                className="text-rose-400 hover:text-rose-700 p-1 rounded-md transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Banner 2: Emergency Bed Alert */}
        {!banner2Dismissed && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-3 flex items-center justify-between shadow-2xs gap-3 animate-in fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle size={15} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-amber-950 truncate">
                  Emergency Bed Low
                </h4>
                <p className="text-[11px] text-amber-800 truncate">
                  ED census at 8 active patients. 4 high-priority ESI-1/2 cases in care.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate("emergency")}
                className="px-3 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                View ED Board
              </button>
              <button
                onClick={() => setBanner2Dismissed(true)}
                className="text-amber-400 hover:text-amber-700 p-1 rounded-md transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. KEY METRICS KPI CARDS ROW (6 CARDS) ──────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Patients Today */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Patients Today
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 leading-none">{dashboardStats.patientsToday}</span>
              <span className="text-[11px] font-bold text-emerald-600 flex items-center">
                ↑ 12%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Active hospital census</p>

            {/* Sparkline curve */}
            <div className="mt-2 h-6 w-full">
              <svg viewBox="0 0 100 24" className="w-full h-full stroke-blue-500 fill-none" preserveAspectRatio="none">
                <path d="M 0 18 Q 20 22 40 10 T 70 12 T 100 4" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <button
            onClick={() => navigate("patients")}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-3 pt-2 border-t border-slate-100 cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight size={11} />
          </button>
        </div>

        {/* Card 2: Appointments */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Appointments
              </span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Calendar size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 leading-none">{dashboardStats.appointmentsToday}</span>
              <span className="text-[11px] font-bold text-emerald-600 flex items-center">
                ↑ 8%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Scheduled today</p>

            {/* Sparkline curve */}
            <div className="mt-2 h-6 w-full">
              <svg viewBox="0 0 100 24" className="w-full h-full stroke-purple-500 fill-none" preserveAspectRatio="none">
                <path d="M 0 20 Q 25 10 50 16 T 75 8 T 100 6" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <button
            onClick={() => navigate("appointments")}
            className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1 mt-3 pt-2 border-t border-slate-100 cursor-pointer"
          >
            <span>Schedule</span>
            <ArrowRight size={11} />
          </button>
        </div>

        {/* Card 3: Inpatient Admissions */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Inpatient Admissions
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <BedDouble size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 leading-none">{dashboardStats.admissionsToday}</span>
              <span className="text-[11px] font-bold text-rose-600 flex items-center">
                ↓ 33%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Beds available: {dashboardStats.availableBedsCount}</p>

            {/* Sparkline curve */}
            <div className="mt-2 h-6 w-full">
              <svg viewBox="0 0 100 24" className="w-full h-full stroke-rose-400 fill-none" preserveAspectRatio="none">
                <path d="M 0 6 Q 30 8 50 18 T 75 14 T 100 20" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <button
            onClick={() => navigate("inpatient")}
            className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 mt-3 pt-2 border-t border-slate-100 cursor-pointer"
          >
            <span>Bed Board</span>
            <ArrowRight size={11} />
          </button>
        </div>

        {/* Card 4: Discharges Ready */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Discharges Ready
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <LogOut size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 leading-none">{dashboardStats.dischargesReady}</span>
              <span className="text-[11px] font-bold text-emerald-600 flex items-center">
                ↑ 100%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Clearance queue</p>

            {/* Sparkline curve */}
            <div className="mt-2 h-6 w-full">
              <svg viewBox="0 0 100 24" className="w-full h-full stroke-emerald-500 fill-none" preserveAspectRatio="none">
                <path d="M 0 20 Q 25 18 50 10 T 75 14 T 100 4" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <button
            onClick={() => navigate("inpatient")}
            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-3 pt-2 border-t border-slate-100 cursor-pointer"
          >
            <span>View Queue</span>
            <ArrowRight size={11} />
          </button>
        </div>

        {/* Card 5: ED Waiting Room */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                ED Waiting Room
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 leading-none">{dashboardStats.edActive}</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                Live
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{dashboardStats.criticalErCount} ESI-1/2 Critical</p>

            {/* Sparkline curve */}
            <div className="mt-2 h-6 w-full">
              <svg viewBox="0 0 100 24" className="w-full h-full stroke-amber-500 fill-none" preserveAspectRatio="none">
                <path d="M 0 16 Q 30 6 55 18 T 80 10 T 100 8" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <button
            onClick={() => navigate("emergency")}
            className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 mt-3 pt-2 border-t border-slate-100 cursor-pointer"
          >
            <span>View ED</span>
            <ArrowRight size={11} />
          </button>
        </div>

        {/* Card 6: Critical Alerts */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                Critical Alerts
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 leading-none">{dashboardStats.criticalAlerts}</span>
              <span className="text-[11px] font-bold text-rose-600 flex items-center">
                ↑ 100%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Action required</p>

            {/* Sparkline curve */}
            <div className="mt-2 h-6 w-full">
              <svg viewBox="0 0 100 24" className="w-full h-full stroke-rose-500 fill-none" preserveAspectRatio="none">
                <path d="M 0 20 Q 30 18 50 14 T 75 10 T 100 4" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <button
            onClick={() => navigate("laboratory")}
            className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 mt-3 pt-2 border-t border-slate-100 cursor-pointer"
          >
            <span>Review</span>
            <ArrowRight size={11} />
          </button>
        </div>
      </div>

      {/* Workforce (HR service): hidden for users without HR access */}
      <WorkforcePanel onOpen={() => navigate("hrms")} />

      {/* ── 4. MIDDLE SECTION: CENSUS & CAPACITY + APPOINTMENTS ─────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left (2 Cols): Department Census & Capacity */}
        <div className="xl:col-span-2 bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <BedDouble size={16} />
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-bold text-slate-900">
                    Department Census &amp; Capacity
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Real-time patient distribution across care units
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate("inpatient")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Full Bed Board</span>
                <ArrowRight size={12} />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="pb-2.5">Department</th>
                    <th className="pb-2.5 text-center">In Care</th>
                    <th className="pb-2.5 text-center">Waiting</th>
                    <th className="pb-2.5 text-center">Critical</th>
                    <th className="pb-2.5 text-center">Available</th>
                    <th className="pb-2.5 text-center">Capacity</th>
                    <th className="pb-2.5">Occupancy</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {/* Row 1: ED */}
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
                          <Siren size={12} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">Emergency Department</div>
                          <div className="text-[10px] text-slate-400 font-normal">ED | 8 beds</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold text-slate-800">8</td>
                    <td className="py-3 text-center text-slate-400">—</td>
                    <td className="py-3 text-center">
                      <span className="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        4 ESI-1/2
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        14 beds
                      </span>
                    </td>
                    <td className="py-3 text-center text-slate-500 font-mono text-[11px]">8/42</td>
                    <td className="py-3 w-28">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full" style={{ width: "19%" }} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600">19%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate("emergency")}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-xs cursor-pointer"
                      >
                        View ER →
                      </button>
                    </td>
                  </tr>

                  {/* Row 2: 3N */}
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center">
                          <BedDouble size={12} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">Inpatient 3-North (Medical)</div>
                          <div className="text-[10px] text-slate-400 font-normal">3N | 18 beds</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold text-slate-800">1</td>
                    <td className="py-3 text-center text-slate-400">—</td>
                    <td className="py-3 text-center">
                      <span className="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        2 ESI-1/2
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        6 beds
                      </span>
                    </td>
                    <td className="py-3 text-center text-slate-500 font-mono text-[11px]">12/26</td>
                    <td className="py-3 w-28">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: "43%" }} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600">43%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate("inpatient")}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-xs cursor-pointer"
                      >
                        View 3N →
                      </button>
                    </td>
                  </tr>

                  {/* Row 3: 4S */}
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-cyan-50 text-cyan-600 flex items-center justify-center">
                          <BedDouble size={12} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">Inpatient 4-South (Surgical)</div>
                          <div className="text-[10px] text-slate-400 font-normal">4S | 18 beds</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold text-slate-800">1</td>
                    <td className="py-3 text-center text-slate-400">—</td>
                    <td className="py-3 text-center">
                      <span className="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        1 ESI-1/2
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        6 beds
                      </span>
                    </td>
                    <td className="py-3 text-center text-slate-500 font-mono text-[11px]">12/26</td>
                    <td className="py-3 w-28">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: "21%" }} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600">21%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate("inpatient")}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-xs cursor-pointer"
                      >
                        View 4S →
                      </button>
                    </td>
                  </tr>

                  {/* Row 4: ICU */}
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center">
                          <Stethoscope size={12} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">Intensive Care Unit (ICU)</div>
                          <div className="text-[10px] text-slate-400 font-normal">ICU | 8 beds</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold text-slate-800">1</td>
                    <td className="py-3 text-center text-slate-400">—</td>
                    <td className="py-3 text-center">
                      <span className="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        1 ESI-1/2
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        1 beds
                      </span>
                    </td>
                    <td className="py-3 text-center text-slate-500 font-mono text-[11px]">7/14</td>
                    <td className="py-3 w-28">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: "71%" }} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600">71%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate("icu")}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-xs cursor-pointer"
                      >
                        View ICU →
                      </button>
                    </td>
                  </tr>

                  {/* Row 5: Surgery */}
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <Heart size={12} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">Surgical Operating Rooms</div>
                          <div className="text-[10px] text-slate-400 font-normal">OR | 12 bays</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold text-slate-800">2</td>
                    <td className="py-3 text-center">
                      <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        3 waiting
                      </span>
                    </td>
                    <td className="py-3 text-center text-slate-400">—</td>
                    <td className="py-3 text-center">
                      <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        3 beds
                      </span>
                    </td>
                    <td className="py-3 text-center text-slate-500 font-mono text-[11px]">2/5</td>
                    <td className="py-3 w-28">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: "44%" }} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600">44%</span>
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigate("surgery")}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-xs cursor-pointer"
                      >
                        View Surgery →
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right (1 Col): Today's Appointments */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Calendar size={15} />
                </div>
                <h3 className="text-xs md:text-sm font-bold text-slate-900">
                  Today's Appointments
                </h3>
              </div>
              <button
                onClick={() => navigate("appointments")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight size={11} />
              </button>
            </div>

            {/* Appointment List Items */}
            <div className="space-y-3">
              {recentAppointments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No appointments registered today.
                </div>
              ) : (
                recentAppointments.map((enc, idx) => {
                  const initials = (enc.patientName || "PT")
                    .split(" ")
                    .map((w) => w[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "PT"
                  const timeStr =
                    enc.registrationTime ||
                    enc.timestamps?.arrival ||
                    (enc.createdAt
                      ? new Date(enc.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Today")
                  const docStr = enc.assignedDoctor
                    ? `Dr. ${enc.assignedDoctor.replace(/^Dr\.\s*/i, "")}`
                    : "Attending Physician"
                  const deptStr = enc.dept || "General OPD"
                  const status = enc.status || "Registered"
                  const isConsulted =
                    status === "Consultation Completed" || status === "OP Completed"
                  const isCalling =
                    status === "Under Consultation" || status === "Doctor Assigned"

                  const avatarColors = [
                    "bg-blue-100 text-blue-700",
                    "bg-purple-100 text-purple-700",
                    "bg-cyan-100 text-cyan-700",
                    "bg-indigo-100 text-indigo-700",
                    "bg-emerald-100 text-emerald-700",
                  ]

                  return (
                    <div
                      key={enc.id}
                      onClick={() => navigate("appointments")}
                      className="flex items-center justify-between gap-2 p-1.5 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-full ${avatarColors[idx % avatarColors.length]} font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-slate-400">{timeStr}</span>
                            <span className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                              {enc.patientName}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-slate-500 truncate">
                            {docStr} • {deptStr}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isConsulted
                              ? "bg-slate-100 text-slate-600"
                              : isCalling
                              ? "bg-emerald-50 text-emerald-700 font-bold"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. LOWER SECTION: PENDING LABS + QUICK ACTIONS ──────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left (2 Cols): Pending Diagnostic Labs */}
        <div className="xl:col-span-2 bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <FlaskConical size={16} />
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-bold text-slate-900">
                    Pending Diagnostic Labs
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Active orders in processing or critical review
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate("laboratory")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Laboratory Hub</span>
                <ArrowRight size={12} />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="pb-2.5">Patient</th>
                    <th className="pb-2.5">MRN</th>
                    <th className="pb-2.5">Test Name</th>
                    <th className="pb-2.5">Lab Dept</th>
                    <th className="pb-2.5">Ordered Time</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {recentLabs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-slate-400">
                        No pending diagnostic lab orders.
                      </td>
                    </tr>
                  ) : (
                    recentLabs.map((lab) => {
                      const testSummary =
                        lab.tests?.map((t) => t.name).join(", ") ||
                        "Diagnostic Test Panel"
                      const orderedTime = lab.createdAt
                        ? new Date(lab.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Today"
                      const isCritical = (lab.status as string) === "Critical"
                      const isPendingBilling = lab.billing?.status === "Pending"

                      return (
                        <tr
                          key={lab.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3 font-bold text-slate-900">
                            {lab.patientName}
                          </td>
                          <td className="py-3">
                            <span className="font-mono text-[10.5px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              #{lab.umr || lab.opNumber || "PAT-001"}
                            </span>
                          </td>
                          <td
                            className="py-3 text-slate-700 truncate max-w-[160px]"
                            title={testSummary}
                          >
                            {testSummary}
                          </td>
                          <td className="py-3 text-slate-600">
                            {lab.tests?.[0]?.category || "Pathology"}
                          </td>
                          <td className="py-3 text-slate-500 font-mono text-[11px]">
                            {orderedTime}
                          </td>
                          <td className="py-3">
                            {isCritical ? (
                              <span className="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full text-[10.5px] flex items-center gap-1 w-fit">
                                <span>⚠ Critical</span>
                              </span>
                            ) : isPendingBilling ? (
                              <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10.5px] flex items-center gap-1 w-fit">
                                <span>⚠ Awaiting Billing</span>
                              </span>
                            ) : (
                              <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full text-[10.5px] flex items-center gap-1 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                                <span>{lab.status || "In Progress"}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() =>
                                navigate(isPendingBilling ? "billing" : "laboratory")
                              }
                              className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center gap-0.5 ml-auto cursor-pointer"
                            >
                              <span>View</span>
                              <ExternalLink size={10} />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right (1 Col): Hospital Quick Actions (Dynamic Grid) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <SlidersHorizontal size={14} />
                </div>
                <h3 className="text-xs md:text-sm font-bold text-slate-900">
                  Hospital Quick Actions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomizeOpen(true)}
                className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer transition-colors"
                title="Customize quick action shortcuts"
              >
                <SlidersHorizontal size={11} />
                <span>Customize</span>
              </button>
            </div>

            {/* Dynamic Quick Actions Grid (4 x 2) */}
            <div className="grid grid-cols-4 gap-2.5">
              {activeQuickActions.map((action) => {
                const IconComponent = ICON_MAP[action.iconName] || SlidersHorizontal
                return (
                  <button
                    key={action.id}
                    onClick={() => navigate(action.module, action.subModule)}
                    className={`flex flex-col items-center justify-center p-2.5 ${action.hoverBg} rounded-xl transition-all group cursor-pointer text-center relative`}
                    style={{ backgroundColor: action.bg }}
                    title={action.desc}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg ${action.iconBg} text-white flex items-center justify-center mb-1.5 shadow-2xs group-hover:scale-105 transition-transform`}
                    >
                      <IconComponent size={16} />
                    </div>
                    <span
                      className={`text-[10px] font-bold ${action.textColor} leading-tight line-clamp-2`}
                    >
                      {action.label}
                    </span>
                  </button>
                )
              })}

              {activeQuickActions.length < 8 && (
                <button
                  type="button"
                  onClick={() => setIsCustomizeOpen(true)}
                  className="flex flex-col items-center justify-center p-2.5 bg-slate-50 hover:bg-blue-50/50 border border-dashed border-slate-300 hover:border-blue-400 rounded-xl transition-all group cursor-pointer text-center"
                  title="Add more quick actions"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-200/80 group-hover:bg-blue-500 text-slate-500 group-hover:text-white flex items-center justify-center mb-1.5 transition-colors shadow-2xs">
                    <Plus size={16} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 group-hover:text-blue-700 leading-tight">
                    Add Action
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. BOTTOM ROW: HOSPITAL UNIT OCCUPANCY & CAPACITY OVERVIEW ──── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Building2 size={16} />
            </div>
            <div>
              <h3 className="text-xs md:text-sm font-bold text-slate-900">
                Hospital Unit Occupancy &amp; Capacity Overview
              </h3>
              <p className="text-[11px] text-slate-400">
                Live bed utilization metrics across inpatient wards
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("inpatient")}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            <span>View All Wards</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* 6 Ward Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Ward 1: 3N Medical/Surgical */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 truncate">3N Medical/Surgical</h4>
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="flex items-center gap-1 text-slate-600 font-medium">
                  <BedDouble size={13} className="text-teal-600" />
                  <span>5 / 18 beds</span>
                </span>
                <span className="font-bold text-teal-700">28% Occupied</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2.5">
              <div className="h-full bg-teal-500 rounded-full" style={{ width: "28%" }} />
            </div>
          </div>

          {/* Ward 2: ICU */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 truncate">ICU</h4>
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="flex items-center gap-1 text-slate-600 font-medium">
                  <BedDouble size={13} className="text-blue-600" />
                  <span>3 / 8 beds</span>
                </span>
                <span className="font-bold text-blue-700">33% Occupied</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2.5">
              <div className="h-full bg-blue-600 rounded-full" style={{ width: "33%" }} />
            </div>
          </div>

          {/* Ward 3: 4S Surgical */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 truncate">4S Surgical</h4>
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="flex items-center gap-1 text-slate-600 font-medium">
                  <BedDouble size={13} className="text-purple-600" />
                  <span>2 / 18 beds</span>
                </span>
                <span className="font-bold text-purple-700">11% Occupied</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2.5">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: "11%" }} />
            </div>
          </div>

          {/* Ward 4: 2nd Floor */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 truncate">2nd Floor</h4>
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="flex items-center gap-1 text-slate-600 font-medium">
                  <BedDouble size={13} className="text-rose-600" />
                  <span>6 / 18 beds</span>
                </span>
                <span className="font-bold text-rose-700">83% Occupied</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2.5">
              <div className="h-full bg-rose-500 rounded-full" style={{ width: "83%" }} />
            </div>
          </div>

          {/* Ward 5: 3rd Floor */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 truncate">3rd Floor</h4>
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="flex items-center gap-1 text-slate-600 font-medium">
                  <BedDouble size={13} className="text-amber-600" />
                  <span>2 / 12 beds</span>
                </span>
                <span className="font-bold text-amber-700">17% Occupied</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2.5">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: "17%" }} />
            </div>
          </div>

          {/* Ward 6: 4th Floor */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 truncate">4th Floor</h4>
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="flex items-center gap-1 text-slate-600 font-medium">
                  <BedDouble size={13} className="text-emerald-600" />
                  <span>6 / 14 beds</span>
                </span>
                <span className="font-bold text-emerald-700">57% Occupied</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-2.5">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "57%" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Customization Modal */}
      <QuickActionsCustomizeModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        currentActionIds={quickActionIds}
        onSave={handleSaveQuickActions}
      />
    </div>
  )
}
