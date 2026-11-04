import React, { useState, useMemo, useEffect, useRef } from "react"
import {
  LayoutDashboard,
  ClipboardList,
  Activity,
  FileText,
  CheckCircle2,
  BarChart3,
  Bell,
  Menu,
  X,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  User,
  Sparkles,
  Upload,
} from "lucide-react"

// Lazy-loaded sub-modules for fast on-demand code splitting and instant navigation
const RadiologyOverviewView = React.lazy(() => import("./RadiologyOverviewView"))
const RadiologyWorklistView = React.lazy(() => import("./RadiologyWorklistView"))
const RadiologyOperationsView = React.lazy(() => import("./RadiologyOperationsView"))
const RadiologyReportingView = React.lazy(() => import("./RadiologyReportingView"))
const RadiologyFinalizedView = React.lazy(() => import("./RadiologyFinalizedView"))
const RadiologyAnalyticsView = React.lazy(() => import("./RadiologyAnalyticsView"))
const RadiologyTemplateUploadView = React.lazy(() => import("./RadiologyTemplateUploadView"))

function RadiologyModuleLoader({ moduleName }: { moduleName: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[380px] p-8 text-center space-y-3">
      <div className="w-9 h-9 border-3 border-[#1B4FD8] border-t-transparent rounded-full animate-spin" />
      <div className="text-[13.5px] font-bold text-slate-700">Loading {moduleName}...</div>
      <p className="text-[11.5px] text-slate-400">Preparing imaging records and workspace state</p>
    </div>
  )
}

import NewInvestigationOrderModal from "./NewInvestigationOrderModal"
import TemplateImporterModal from "./TemplateImporterModal"
import { RadiologyWorkflowDb } from "../../services/radiologyWorkflowDb"
import { UniversalRadiologyDb } from "../../services/universalRadiologyDb"
import { RADIOLOGY_MODALITIES } from "../../services/radiologyTariffsData"

export type RadiologyViewMode =
  | "overview"
  | "worklist"
  | "operations"
  | "reporting"
  | "finalized"
  | "template_upload"
  | "analytics"


interface UniversalRadiologyShellProps {
  initialView?: RadiologyViewMode
  initialStudyId?: string | null
  onViewChange?: (view: RadiologyViewMode, subParam?: string) => void
  hideSidebar?: boolean
  initialScope?: string
  technician?: string
  role?: string
}

export default function UniversalRadiologyShell({
  initialView = "overview",
  initialStudyId = null,
  onViewChange,
  hideSidebar = true,
  initialScope = "all",
  technician = "Dr. Rajesh Sharma, MD",
  role = "Senior Radiologist & HOD",
}: UniversalRadiologyShellProps) {
  const [activeView, setActiveView] = useState<RadiologyViewMode>(initialView)
  const [viewSubParam, setViewSubParam] = useState<string | null>(initialStudyId || null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [showTemplateImporterModal, setShowTemplateImporterModal] = useState(false)
  const [tick, setTick] = useState(0)
  const mainScrollRef = useRef<HTMLElement | null>(null)

  // Retain views once visited to guarantee sub-millisecond, lag-free navigation between sub-modules
  const [visitedViews, setVisitedViews] = useState<Set<RadiologyViewMode>>(
    () => new Set([initialView])
  )

  useEffect(() => {
    setVisitedViews((prev) => {
      if (prev.has(activeView)) return prev
      const next = new Set(prev)
      next.add(activeView)
      return next
    })
  }, [activeView])

  // Idle script prefetching - downloads code chunks into cache without mounting components
  useEffect(() => {
    const timer = setTimeout(() => {
      import("./RadiologyWorklistView")
      import("./RadiologyOperationsView")
      import("./RadiologyReportingView")
    }, 400)
    return () => clearTimeout(timer)
  }, [])

  // Cleanly reset top-level container scroll when switching active view
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0
    }
  }, [activeView])

  useEffect(() => {
    if (initialView && initialView !== activeView) {
      setActiveView(initialView)
    }
  }, [initialView])

  useEffect(() => {
    setViewSubParam(initialStudyId || null)
  }, [initialStudyId])

  useEffect(() => {
    const unsub1 = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    const unsub2 = UniversalRadiologyDb.subscribe(() => setTick((t) => t + 1))
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const studies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])
  const exceptions = useMemo(() => UniversalRadiologyDb.getExceptions(), [tick])

  // Real-time Badge Counts
  const counts = useMemo(() => {
    const totalOrders = studies.length

    let readyToScan = 0
    let inProgressScanning = 0
    let awaitingReports = 0
    let finalizedReports = 0

    studies.forEach((s) => {
      if ((s as any).status === "Cancelled" || (s as any).isCancelled) return

      const isFinal =
        s.normalizedReportStatus === "Finalized" ||
        s.reportStatus === "Final" ||
        s.reportStatus === "Finalized" ||
        (s as any).workflowStatus === "FINALIZED"

      if (isFinal) {
        finalizedReports++
        return
      }

      let isMarkedSent = false
      try {
        if (s.id && localStorage.getItem(`hospai_rad_sent_${s.id}`) === "true") {
          isMarkedSent = true
        }
      } catch { }

      const isSentToReporting =
        isMarkedSent ||
        Boolean(s.sentToReporting) ||
        s.status === "Sent for Reporting" ||
        (s as any).workflowStatus === "SENT_TO_REPORTING" ||
        (s.reportStatus as string) === "Awaiting Report" ||
        (s as any).workflowStatus === "AWAITING_REPORT"

      const isUnderReporting =
        s.normalizedReportStatus === "Draft" ||
        s.normalizedReportStatus === "Submitted for Review" ||
        s.normalizedReportStatus === "Needs Correction" ||
        s.normalizedReportStatus === "Correction Required" ||
        (s.reportStatus as string) === "Draft" ||
        (s.reportStatus as string) === "Submitted for Review" ||
        (s.reportStatus as string) === "Needs Correction" ||
        (s.reportStatus as string) === "Correction Required" ||
        (s as any).workflowStatus === "DRAFT_SAVED" ||
        (s as any).workflowStatus === "UNDER_REVIEW" ||
        (s as any).workflowStatus === "CORRECTION_REQUIRED"

      if (isSentToReporting || isUnderReporting) {
        awaitingReports++
        return
      }

      // Otherwise in scanning operations if paid or cleared
      const isPaid = s.isPaid || s.paymentStatus === "Paid" || s.billingStatus === "Authorized Exception"
      if (isPaid) {
        if (s.normalizedStatus === "IN PROGRESS" || s.scanningStage === 2 || (s as any).workflowStatus === "IN_PROGRESS") {
          inProgressScanning++
        } else if (s.normalizedStatus !== "DONE" && (s as any).workflowStatus !== "COMPLETED") {
          readyToScan++
        }
      }
    })

    const inScanning = readyToScan + inProgressScanning
    const openExceptions = exceptions.filter((e) => e.status !== "Resolved").length

    return { totalOrders, awaitingReports, finalizedReports, inScanning, openExceptions }
  }, [studies, exceptions])

  // Navigation Items Definition
  const NAV_ITEMS: {
    id: RadiologyViewMode
    label: string
    icon: React.ComponentType<{ className?: string }>
    badge?: number | string
    badgeColor?: string
  }[] = [
    { id: "overview", label: "Overview Hub", icon: LayoutDashboard },
    { id: "worklist", label: "Examination Worklist", icon: ClipboardList, badge: counts.totalOrders, badgeColor: "bg-blue-600" },
    { id: "operations", label: "Scanning Operations", icon: Activity, badge: counts.inScanning > 0 ? counts.inScanning : undefined, badgeColor: "bg-amber-600" },
    { id: "reporting", label: "Reporting Workspace", icon: FileText, badge: counts.awaitingReports, badgeColor: "bg-purple-600" },
    { id: "finalized", label: "Finalized Reports", icon: CheckCircle2, badge: counts.finalizedReports, badgeColor: "bg-emerald-600" },
    { id: "template_upload", label: "Template Management", icon: Upload },
    { id: "analytics", label: "Department Analytics", icon: BarChart3 },
  ]

  const handleNavigate = (view: string, subParam?: string) => {
    let nextView = view as RadiologyViewMode
    if ((view as string) === "scheduling" || (view as string) === "exceptions") {
      nextView = "overview"
    }
    setActiveView(nextView)
    setViewSubParam(subParam || null)
    setIsMobileDrawerOpen(false)
    onViewChange?.(nextView, subParam)
  }

  // Active View Title & Breadcrumb Helper
  const currentNav = NAV_ITEMS.find((n) => n.id === activeView) || NAV_ITEMS[0]

  return (
    <div className="flex h-screen bg-[#F4F7FB] text-[#0F172A] font-sans overflow-hidden">
      {/* ── 1. PERSISTENT DEEP NAVY SIDEBAR (Desktop - only shown if not embedded) ── */}
      {!hideSidebar && (
        <aside
          className={`hidden md:flex flex-col bg-[#0F172A] text-white transition-all duration-200 border-r border-slate-800 shrink-0 z-30 ${
            isSidebarCollapsed ? "w-20" : "w-64"
          }`}
        >
        {/* Department Identity Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#1B4FD8] to-purple-600 flex items-center justify-center font-bold text-white shadow-sm shrink-0">
                ⚡
              </div>
              <div className="truncate">
                <div className="font-extrabold text-[13.5px] tracking-tight text-white leading-tight">
                  Universal Radiology
                </div>
                <div className="text-[10px] text-blue-300 font-mono tracking-wider uppercase">
                  Tertiary Imaging Suite
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer mx-auto"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[12.5px] font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#1B4FD8] text-white font-bold shadow-sm"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                }`}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                {!isSidebarCollapsed && (
                  <span className="flex-1 text-left truncate">{item.label}</span>
                )}
                {!isSidebarCollapsed && item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full text-white ${
                      item.badgeColor || "bg-slate-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Sidebar Footer: Active Operator Profile */}
        <div className="p-3 border-t border-slate-800 bg-[#0B1120]">
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[12px] font-bold text-white shrink-0">
                DR
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold text-white truncate">{technician}</div>
                <div className="text-[10.5px] text-slate-400 truncate">{role}</div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[11px] font-bold text-white">
                DR
              </div>
            </div>
          )}
        </div>
      </aside>
      )}

      {/* ── MOBILE DRAWER NAVIGATION ── */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 md:hidden flex">
          <div className="bg-[#0F172A] text-white w-64 h-full p-4 flex flex-col justify-between animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <span className="font-bold text-[14px]">Universal Radiology</span>
                <button onClick={() => setIsMobileDrawerOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon
                  const isActive = activeView === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-semibold ${
                        isActive ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. MAIN APPLICATION CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        {activeView !== "operations" && (
          <header className="h-16 bg-white border-b border-[#DDE2EC] px-6 flex items-center justify-between gap-4 shadow-2xs shrink-0 z-20">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileDrawerOpen(true)}
                className="md:hidden text-slate-600 hover:text-slate-900 p-1"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Breadcrumb Navigation */}
              {activeView === "template_upload" ? (
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#0F172A] text-[15px]">Radiology</span>
                  <div className="flex items-center gap-1.5 text-[12px] text-slate-500 font-medium">
                    <span>Radiology</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span>Template Management</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">Upload & Extraction</span>
                  </div>
                </div>
              ) : activeView === "reporting" && viewSubParam ? (
                <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium">
                  <button
                    onClick={() => handleNavigate("worklist")}
                    className="hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    Examination Worklist
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold text-[#0F172A]">Patient Report</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium">
                  <span>Radiology</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-bold text-[#0F172A]">{currentNav.label}</span>
                </div>
              )}
            </div>

            {/* Quick Header Actions */}
            {activeView === "reporting" && (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowTemplateImporterModal(true)}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded text-[12.5px] font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                  title="Upload report format file to reproduce original layout"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>Upload Template</span>
                </button>
              </div>
            )}
          </header>
        )}


        {/* Scrollable View Container - Retains mounted views for instantaneous tab switching */}
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto p-6 bg-[#F4F7FB]">
          <React.Suspense fallback={<RadiologyModuleLoader moduleName={currentNav.label} />}>
            {visitedViews.has("overview") && (
              <div className={activeView === "overview" ? "block" : "hidden"}>
                <RadiologyOverviewView
                  onNavigateToView={handleNavigate}
                />
              </div>
            )}

            {visitedViews.has("worklist") && (
              <div className={activeView === "worklist" ? "block" : "hidden"}>
                <RadiologyWorklistView
                  onNavigateToScanning={(studyId) => {
                    handleNavigate("operations", studyId)
                  }}
                  onNavigateToReporting={(studyId) => {
                    handleNavigate("reporting", studyId)
                  }}
                  onOpenOrderModal={() => setShowNewOrderModal(true)}
                  initialModalityFilter={
                    viewSubParam && (RADIOLOGY_MODALITIES as readonly string[]).includes(viewSubParam)
                      ? viewSubParam
                      : initialScope && (RADIOLOGY_MODALITIES as readonly string[]).includes(initialScope)
                      ? initialScope
                      : "all"
                  }
                  initialStatusFilter={
                    viewSubParam && ["ready", "in_progress", "awaiting", "drafts", "finalized"].includes(viewSubParam)
                      ? viewSubParam
                      : "all"
                  }
                />
              </div>
            )}

            {visitedViews.has("operations") && (
              <div className={activeView === "operations" ? "block" : "hidden"}>
                <RadiologyOperationsView
                  initialStudyId={
                    viewSubParam && !["ready", "ready_to_scan", "in_progress", "awaiting_clearance", "all"].includes(viewSubParam)
                      ? viewSubParam
                      : undefined
                  }
                  initialTab={
                    viewSubParam === "ready" || viewSubParam === "ready_to_scan"
                      ? "ready_to_scan"
                      : viewSubParam === "in_progress"
                      ? "in_progress"
                      : undefined
                  }
                  onNavigateToReporting={(studyId) => {
                    handleNavigate("reporting", studyId)
                  }}
                  onNavigateToWorklist={() => handleNavigate("worklist")}
                  onOpenOrderModal={() => setShowNewOrderModal(true)}
                />
              </div>
            )}

            {visitedViews.has("reporting") && (
              <div className={activeView === "reporting" ? "block" : "hidden"}>
                <RadiologyReportingView
                  initialStudyId={
                    viewSubParam && !["awaiting", "drafts", "submitted", "correction"].includes(viewSubParam)
                      ? viewSubParam
                      : undefined
                  }
                  initialFilter={
                    viewSubParam && ["awaiting", "drafts", "submitted", "correction"].includes(viewSubParam)
                      ? viewSubParam
                      : undefined
                  }
                  currentTechnician={technician}
                  currentRole={role}
                  onNavigateToWorklist={() => handleNavigate("worklist")}
                  onNavigateToTemplates={() => handleNavigate("template_upload")}
                  onNavigateToFinalized={() => handleNavigate("finalized")}
                />
              </div>
            )}

            {visitedViews.has("finalized") && (
              <div className={activeView === "finalized" ? "block" : "hidden"}>
                <RadiologyFinalizedView />
              </div>
            )}

            {visitedViews.has("template_upload") && (
              <div className={activeView === "template_upload" ? "block" : "hidden"}>
                <RadiologyTemplateUploadView
                  currentUserName={technician}
                  currentRole={role}
                  onNavigateView={handleNavigate}
                />
              </div>
            )}

            {activeView === "analytics" && (
              <div className="block">
                <RadiologyAnalyticsView />
              </div>
            )}
          </React.Suspense>
        </main>
      </div>

      {/* ── New Investigation Order Modal ── */}
      {showNewOrderModal && (
        <NewInvestigationOrderModal
          onClose={() => setShowNewOrderModal(false)}
          onOrderCreated={() => {
            setShowNewOrderModal(false)
            setTick((t) => t + 1)
          }}
        />
      )}

      {/* ── Template Importer Modal ── */}
      {showTemplateImporterModal && (
        <TemplateImporterModal
          onClose={() => setShowTemplateImporterModal(false)}
          currentRole={role}
          currentUserName={technician}
          onSuccess={() => {
            setShowTemplateImporterModal(false)
            setTick((t) => t + 1)
          }}
        />
      )}
    </div>
  )
}
