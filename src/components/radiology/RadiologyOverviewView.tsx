import React, { useState, useMemo, useEffect } from "react"
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileText,
  Users,
  Activity,
  ArrowRight,
  ShieldAlert,
  Layers,
  Sparkles,
  TrendingUp,
  RefreshCw,
} from "lucide-react"
import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "../../services/radiologyWorkflowDb"
import { UniversalRadiologyDb, RadiologySuite, RadiologyException } from "../../services/universalRadiologyDb"
import { RADIOLOGY_MODALITIES } from "../../services/radiologyTariffsData"
import { isPaidOrClearedStudy } from "./RadiologyOperationsView"

interface RadiologyOverviewViewProps {
  onNavigateToView: (view: string, subParam?: string) => void
}

export default function RadiologyOverviewView({
  onNavigateToView,
}: RadiologyOverviewViewProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const unsub1 = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    const unsub2 = UniversalRadiologyDb.subscribe(() => setTick((t) => t + 1))
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const studies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])
  const analytics = useMemo(() => UniversalRadiologyDb.getDepartmentAnalytics(), [tick])
  const suites = useMemo(() => UniversalRadiologyDb.getSuites(), [tick])
  const exceptions = useMemo(() => {
    return UniversalRadiologyDb.getExceptions().sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime()
      const timeB = new Date(b.timestamp || 0).getTime()
      if (timeA !== timeB) return timeB - timeA // Newest first
      return (b.id || "").localeCompare(a.id || "")
    })
  }, [tick])

  // Predefined Standardized Sorting: Latest department activity strictly first (descending).
  // Uses actual audit event timestamps.
  // Stable secondary sort: Event ID descending.
  const auditEvents = useMemo(() => {
    return UniversalRadiologyDb.getAuditEvents().sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime()
      const timeB = new Date(b.timestamp || 0).getTime()
      if (timeA !== timeB) return timeB - timeA // Latest department activity first
      return (b.id || "").localeCompare(a.id || "")
    })
  }, [tick])

  // Single-pass computation for summary counters from persisted records
  const summary = useMemo(() => {
    let todayOrders = 0
    let awaitingVerification = 0
    let readyToScan = 0
    let inScanning = 0
    let awaitingReport = 0
    let drafts = 0
    let finalized = 0

    const now = new Date()
    const todayLocalYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

    const isCreatedToday = (s: ExtendedRadiologyRecord): boolean => {
      if (s.orderDate && s.orderDate.slice(0, 10) === todayLocalYMD) return true
      const ts = RadiologyWorkflowDb.getOrderCreationTimestamp(s)
      if (ts > 1000000000000) {
        const d = new Date(ts)
        const dYMD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        if (dYMD === todayLocalYMD) return true
      }
      if (s.ordered && s.ordered.length >= 10 && s.ordered.slice(0, 10) === todayLocalYMD) return true
      return false
    }

    const isCancelled = (s: ExtendedRadiologyRecord) => {
      const status = (s.status || "").toLowerCase()
      const wStatus = ((s as any).workflowStatus || "").toLowerCase()
      const bStatus = (s.billingStatus || "").toLowerCase()
      const pStatus = (s.paymentStatus || "").toLowerCase()
      return (
        (s as any).isCancelled === true ||
        status === "cancelled" ||
        wStatus === "cancelled" ||
        bStatus === "cancelled" ||
        pStatus === "cancelled"
      )
    }

    studies.forEach((s) => {
      if (isCancelled(s)) return

      if (isCreatedToday(s)) {
        todayOrders++
      }

      if ((s.normalizedStatus === "ORDERED" || !s.normalizedStatus || s.status === "Pending") && !s.nurseVerified) {
        awaitingVerification++
      }

      if (
        isPaidOrClearedStudy(s) &&
        (s.normalizedStatus === "ORDERED" || !s.normalizedStatus || s.status === "Scheduled") &&
        s.normalizedStatus !== "IN PROGRESS" &&
        s.normalizedStatus !== "DONE" &&
        (s as any).scanningStage !== 2 &&
        (s as any).scanningStage !== 3
      ) {
        readyToScan++
      }

      if (
        (s.normalizedStatus === "IN PROGRESS" || s.status === "In Progress" || (s as any).scanningStage === 2) &&
        s.normalizedStatus !== "DONE"
      ) {
        inScanning++
      }

      if (
        (s.normalizedStatus === "DONE" || (s as any).scanningStage === 3 || !!s.sentToReporting) &&
        (s.normalizedReportStatus === "Awaiting Report" || s.reportStatus === "Awaiting Report") &&
        s.normalizedReportStatus !== "Draft" &&
        s.normalizedReportStatus !== "Finalized" &&
        !s.hasDraft
      ) {
        awaitingReport++
      }

      if (
        (s.normalizedReportStatus === "Draft" || (s as any).reportStatus === "Draft" || !!s.hasDraft) &&
        s.normalizedReportStatus !== "Finalized"
      ) {
        drafts++
      }

      if (s.normalizedReportStatus === "Finalized" || s.reportStatus === "Finalized" || !!s.finalizedAt) {
        finalized++
      }
    })

    const availableSuites = suites.filter((s) => s.status === "Available").length

    return {
      todayOrders,
      awaitingVerification,
      readyToScan,
      inScanning,
      awaitingReport,
      drafts,
      finalized,
      availableSuites,
    }
  }, [studies, suites])

  return (
    <div className="space-y-6">
      {/* ── Operational Banner / Department Pulse ── */}
      <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white p-6 rounded-lg shadow-sm border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="bg-[#1B4FD8] text-white text-[11px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider font-mono">
              Live Operations
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400 text-[12px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              All 11 Modalities Online
            </span>
          </div>
          <h2 className="text-xl font-bold mt-2 text-white">Central Diagnostic Imaging & Radiology Hub</h2>
          <p className="text-[13px] text-slate-300 mt-0.5">
            Real-time patient examination throughput, scanning suites availability, and clinical reporting queue.
          </p>
        </div>
      </div>

      {/* ── 11 Critical Operational KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
        {[
          { label: "Today's Orders", count: summary.todayOrders, view: "worklist", color: "blue", icon: FileText },
          { label: "Verify Pending", count: summary.awaitingVerification, view: "worklist", filter: "verify", color: "amber", icon: AlertTriangle },
          { label: "Ready to Scan", count: summary.readyToScan, view: "worklist", filter: "ready", color: "emerald", icon: CheckCircle2 },
          { label: "In Scanning", count: summary.inScanning, view: "operations", color: "indigo", icon: Play },
          { label: "Awaiting Report", count: summary.awaitingReport, view: "reporting", filter: "awaiting", color: "purple", icon: Clock },
          { label: "Report Drafts", count: summary.drafts, view: "reporting", filter: "drafts", color: "amber", icon: FileText },
          { label: "Finalized Reports", count: summary.finalized, view: "finalized", color: "emerald", icon: CheckCircle2 },
          { label: "Active Suites", count: `${summary.availableSuites}/${suites.length}`, view: "operations", color: "slate", icon: Layers },
          { label: "Order → Scan TAT", count: analytics.turnaroundTime.orderToScan, view: "analytics", color: "blue", icon: Activity },
          { label: "Scan → Report TAT", count: analytics.turnaroundTime.scanToReport, view: "analytics", color: "purple", icon: Clock },
          { label: "Overall Median TAT", count: analytics.turnaroundTime.medianTat, view: "analytics", color: "emerald", icon: TrendingUp },
        ].map((kpi, idx) => {
          const Icon = kpi.icon
          const bgColors: Record<string, string> = {
            blue: "bg-blue-50/70 border-blue-200 text-blue-900",
            amber: "bg-amber-50/70 border-amber-200 text-amber-900",
            emerald: "bg-emerald-50/70 border-emerald-200 text-emerald-900",
            indigo: "bg-indigo-50/70 border-indigo-200 text-indigo-900",
            purple: "bg-purple-50/70 border-purple-200 text-purple-900",
            red: "bg-red-50/70 border-red-200 text-red-900",
            slate: "bg-slate-50 border-slate-200 text-slate-800",
          }

          return (
            <div
              key={idx}
              onClick={() => onNavigateToView(kpi.view, kpi.filter)}
              className={`p-3.5 border rounded-lg cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${bgColors[kpi.color] || "bg-white border-slate-200 text-slate-800"}`}
            >
              <div className="flex items-center justify-between text-[11.5px] font-bold opacity-80 mb-1">
                <span className="truncate">{kpi.label}</span>
                <Icon className="w-3.5 h-3.5 shrink-0" />
              </div>
              <div className="text-xl font-extrabold tracking-tight font-mono">{kpi.count}</div>
              <div className="text-[10.5px] mt-1.5 flex items-center gap-1 font-semibold opacity-75">
                <span>View Queue</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Main Content Grid: Modality Status & Live Worklist Feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Modality Workload & Scanning Suites */}
        <div className="lg:col-span-2 space-y-6">
          {/* Modality Workload Cards */}
          <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9] mb-4">
              <div>
                <h3 className="text-[14px] font-bold text-[#0F172A] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#1B4FD8]" />
                  Clinical Modality Workload (All 11 Modalities)
                </h3>
                <p className="text-[12px] text-[#64748B]">Active study distribution across registered hospital imaging modalities</p>
              </div>
              <button
                onClick={() => onNavigateToView("worklist")}
                className="text-[12px] font-bold text-[#1B4FD8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Full Worklist</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {RADIOLOGY_MODALITIES.map((mod) => {
                const count = analytics.modalityCounts[mod] || 0
                return (
                  <div
                    key={mod}
                    onClick={() => onNavigateToView("worklist", mod)}
                    className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-md hover:border-[#1B4FD8] hover:bg-blue-50/30 transition-all cursor-pointer"
                  >
                    <div className="text-[11.5px] font-bold text-[#334155] truncate">{mod}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[18px] font-extrabold text-[#0F172A] font-mono">{count}</span>
                      <span className="text-[10px] bg-white border border-[#CBD5E1] px-1.5 py-0.5 rounded text-[#64748B] font-mono">
                        studies
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Active Equipment Suites Live Status */}
          <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9] mb-4">
              <div>
                <h3 className="text-[14px] font-bold text-[#0F172A] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#1B4FD8]" />
                  Imaging Suites & Gantry Operational Status
                </h3>
                <p className="text-[12px] text-[#64748B]">Live room availability and scanning readiness</p>
              </div>
              <button
                onClick={() => onNavigateToView("operations")}
                className="text-[12px] font-bold text-[#1B4FD8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>View Operations</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto pr-1">
              {suites.map((suite) => (
                <div
                  key={suite.id}
                  onClick={() => onNavigateToView("operations")}
                  className="p-3 border rounded-md bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#1B4FD8] hover:bg-slate-50 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10.5px] font-mono font-bold text-[#64748B]">{suite.code}</span>
                      <span
                        className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${
                          suite.status === "Available"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : suite.status === "In Use"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : suite.status === "Maintenance"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {suite.status}
                      </span>
                    </div>
                    <div className="text-[12.5px] font-bold text-[#0F172A]">{suite.name}</div>
                    <div className="text-[11px] text-[#64748B]">{suite.room} • {suite.modality}</div>
                  </div>
                  {suite.utilization && (
                    <div className="mt-2 pt-1.5 border-t border-[#E2E8F0] flex items-center gap-1.5 text-[10.5px] text-[#475569]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          suite.status === "In Use"
                            ? "bg-blue-600 animate-pulse"
                            : suite.status === "Available"
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                        }`}
                      />
                      <span className="truncate font-medium">{suite.utilization}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (1 col): Recent Activity & Exception Alerts */}
        <div className="space-y-6">
          {/* Exception Alerts Panel */}
          <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9] mb-3">
              <h3 className="text-[14px] font-bold text-[#0F172A] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                Operational Exception Alerts
              </h3>
              <span className="text-[11px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full">
                {exceptions.filter((e) => e.status !== "Resolved").length} Active
              </span>
            </div>

            {exceptions.filter((e) => e.status !== "Resolved").length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-[#64748B]">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                No unresolved exceptions detected. Department is operating normally.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {exceptions
                  .filter((e) => e.status !== "Resolved")
                  .slice(0, 10)
                  .map((ex) => {
                    const handleExceptionClick = () => {
                      if (ex.studyId) {
                        if (ex.category === "Reporting Delay") {
                          onNavigateToView("reporting", ex.studyId)
                        } else if (ex.category === "Incomplete Examination") {
                          onNavigateToView("operations", ex.studyId)
                        } else {
                          onNavigateToView("worklist", ex.studyId)
                        }
                      } else {
                        onNavigateToView("worklist")
                      }
                    }

                    return (
                      <div
                        key={ex.id}
                        onClick={handleExceptionClick}
                        className="p-3 rounded border border-red-200 bg-red-50/50 hover:bg-red-50 hover:shadow-xs transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold text-red-900 mb-1">
                          <span className="truncate">{ex.category}</span>
                          <span
                            className={`text-[9.5px] px-1.5 py-0.5 rounded uppercase font-mono font-semibold ${
                              ex.severity === "Critical"
                                ? "bg-red-200 text-red-800"
                                : ex.severity === "High"
                                ? "bg-amber-200 text-amber-900"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {ex.severity}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-[#334155] line-clamp-2 leading-relaxed">{ex.description}</p>
                        <div className="mt-1.5 text-[10.5px] text-[#64748B] flex items-center justify-between">
                          <span className="font-medium text-[#475569]">
                            {ex.patientName ? `${ex.patientName} (${ex.umr || "—"})` : "System Exception"}
                          </span>
                          <span className="font-mono">
                            {new Date(ex.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
            <button
              onClick={() => onNavigateToView("worklist")}
              className="w-full mt-3 py-1.5 text-center text-[12px] font-bold text-[#1B4FD8] bg-blue-50/60 hover:bg-blue-50 border border-blue-200 rounded cursor-pointer transition-colors"
            >
              View Examination Worklist →
            </button>
          </div>

          {/* Department Audit Log Feed */}
          <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9] mb-3">
              <h3 className="text-[14px] font-bold text-[#0F172A] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#1B4FD8]" />
                Recent Department Activity
              </h3>
              <button
                onClick={() => setTick((t) => t + 1)}
                className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Refresh Activity"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {auditEvents.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-[#64748B]">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                No department activity recorded yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {auditEvents.slice(0, 12).map((ev) => {
                  const handleActivityClick = () => {
                    if (ev.studyId) {
                      if (ev.action.includes("Report") || ev.action.includes("Finalized")) {
                        onNavigateToView("reporting", ev.studyId)
                      } else if (ev.action.includes("Scan")) {
                        onNavigateToView("operations", ev.studyId)
                      } else {
                        onNavigateToView("worklist", ev.studyId)
                      }
                    } else {
                      onNavigateToView("worklist")
                    }
                  }

                  const evDate = new Date(ev.timestamp)
                  const timeFormatted = isNaN(evDate.getTime())
                    ? ev.timestamp
                    : evDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

                  return (
                    <div
                      key={ev.id}
                      onClick={handleActivityClick}
                      className="flex items-start gap-2.5 text-[12px] border-b border-slate-100 pb-2.5 last:border-b-0 hover:bg-slate-50/80 p-1 rounded transition-colors cursor-pointer"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#1B4FD8] mt-1.5 shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-[#0F172A] truncate">{ev.action}</span>
                          <span className="text-[10px] text-[#64748B] font-mono shrink-0">
                            {timeFormatted}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-[#475569] line-clamp-2 mt-0.5 leading-snug">{ev.details}</p>
                        <div className="text-[10.5px] text-[#94A3B8] mt-1 flex items-center justify-between">
                          <span>{ev.actor} ({ev.role})</span>
                          {ev.patientName && (
                            <span className="truncate font-medium text-[#64748B]">
                              {ev.patientName} {ev.umr ? `(${ev.umr})` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
