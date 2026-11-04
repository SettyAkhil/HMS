
import {
  FlaskConical,
  LayoutDashboard,
  ClipboardList,
  Microscope,
  FileCheck2,
  Boxes,
  LineChart,
  Settings,
  HelpCircle,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  FileText,
  CreditCard,
  Syringe,
  Info,
  X,
} from "lucide-react"
import React, { useState, useEffect, useMemo, Suspense, lazy } from "react"
import LabDashboardView from "./LabDashboardView"

const LabOrdersAndCollectionView = lazy(() => import("./LabOrdersAndCollectionView"))
const LabWorkbenchView = lazy(() => import("./LabWorkbenchView"))
const LabReportsView = lazy(() => import("./LabReportsView"))
const LaboratoryInventory = lazy(() => import("./LaboratoryInventory"))
const QualityControlView = lazy(() => import("./QualityControlView"))
const AdminConfigurationView = lazy(() => import("./AdminConfigurationView"))

const TabLoadingFallback = () => (
  <div className="p-16 flex flex-col items-center justify-center space-y-3 bg-white rounded-2xl border border-slate-200">
    <div className="w-8 h-8 border-3 border-[#7552B8] border-t-transparent rounded-full animate-spin" />
    <span className="text-xs font-semibold text-slate-500">Loading diagnostic workspace...</span>
  </div>
)
import { LabOrder, LabOrderDatabase, LabOrderTest } from "../../services/labOrdersDb"
import { LabLisService, SpecimenRecord, CriticalAlertRecord } from "../../services/labLisService"

interface LaboratoryManagementSuiteProps {
  technician?: string
  activeSubPage?: string
  onNavigate?: (module: string) => void
}

export type LisSubModule =
  | "lab_dashboard"
  | "lab_orders_collection"
  | "lab_workbench"
  | "lab_reports"
  | "lab_inventory"
  | "lab_quality_analytics"
  | "lab_admin_config"
  // Legacy / granular keys for seamless routing:
  | "lab_orders"
  | "lab_sample_collection"
  | "lab_worklists"
  | "lab_analyzers"
  | "lab_result_entry"
  | "lab_pathologist_review"
  | "lab_critical_alerts"
  | "lab_review_reports"
  | "lab_test_master"
  | "lab_settings"
  | "lab_tat"

const MODULE_HEADER_INFO: Record<
  string,
  { title: string; subtitle: string; badge?: string }
> = {
  lab_dashboard: {
    title: "Laboratory Command Center",
    subtitle: "Real-time diagnostic workload, turnaround times, and pending specimen queues",
    badge: "Operational Overview",
  },
  lab_orders_collection: {
    title: "Lab Orders & Sample Collection",
    subtitle: "Doctor order intake, billing clearance verification, vacuum tube selection, and barcode phlebotomy queue",
    badge: "Order Intake & Phlebotomy",
  },
  lab_workbench: {
    title: "Laboratory Workbench & Result Entry",
    subtitle: "Department analytical bench queues, structured parameter entry with panic limit checks, and pathologist sign-off",
    badge: "Analytical Testing",
  },
  lab_reports: {
    title: "Diagnostic Reports & Archive",
    subtitle: "Official printable hospital pathology reports, release history, high-fidelity PDF printing, and EMR timeline",
    badge: "Diagnostic Archive",
  },
  lab_inventory: {
    title: "Laboratory Consumables & Reagents",
    subtitle: "Reagents, test kits, vacuum collection tubes, and consumable stock management",
    badge: "Inventory Management",
  },
  lab_quality_analytics: {
    title: "Quality Control & Analytics",
    subtitle: "Levey-Jennings visual charts, Westgard multi-rules, operational analytics, and TAT SLA monitoring",
    badge: "Quality & SLAs",
  },
  lab_admin_config: {
    title: "Laboratory Test Master Directory",
    subtitle: "Master directory of 206 hospital diagnostic tests, tariffs, NABL/CAP accreditation, and tube rules",
    badge: "Catalogue & Policies",
  },
}

export default function LaboratoryManagementSuite({
  technician = "Lab Technician",
  activeSubPage = "lab_dashboard",
  onNavigate,
}: LaboratoryManagementSuiteProps) {
  // Normalize module keys into consolidated LIS architecture
  const normalizeKey = (key: string): LisSubModule => {
    if (key === "laboratory" || key === "lab" || key === "lab_dashboard") return "lab_dashboard"
    if (key === "lab_orders" || key === "lab_sample_collection" || key === "lab_orders_collection") {
      return "lab_orders_collection"
    }
    if (key === "lab_sample_reception") return "lab_workbench"
    if (
      key === "lab_worklists" ||
      key === "lab_result_entry" ||
      key === "lab_pathologist_review" ||
      key === "lab_analyzers" ||
      key === "lab_processing" ||
      key === "lab_workbench" ||
      key === "lab_critical" ||
      key === "lab_critical_alerts"
    ) {
      return "lab_workbench"
    }
    if (key === "lab_reports" || key === "lab_review_reports") {
      return "lab_reports"
    }
    if (key === "lab_inventory") return "lab_inventory"
    if (key === "lab_quality_analytics" || key === "lab_analytics" || key === "lab_tat") {
      return "lab_quality_analytics"
    }
    if (key === "lab_admin_config" || key === "lab_test_master" || key === "lab_catalog" || key === "lab_settings") {
      return "lab_admin_config"
    }

    return "lab_dashboard"
  }

  const [currentTab, setCurrentTab] = useState<LisSubModule>(normalizeKey(activeSubPage))
  const [activeOrderForBench, setActiveOrderForBench] = useState<LabOrder | null>(null)
  const [activeTestForBench, setActiveTestForBench] = useState<LabOrderTest | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  // Live data subscriptions for badges
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [specimens, setSpecimens] = useState<SpecimenRecord[]>([])
  const [criticalAlerts, setCriticalAlerts] = useState<CriticalAlertRecord[]>([])

  const loadData = () => {
    setOrders(LabOrderDatabase.getOrders())
    setSpecimens(LabLisService.getSpecimens())
    setCriticalAlerts(LabLisService.getCriticalAlerts())
  }

  useEffect(() => {
    loadData()
    const unsub1 = LabOrderDatabase.subscribe(loadData)
    const unsub2 = LabLisService.subscribe(loadData)
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  useEffect(() => {
    if (activeSubPage) {
      setCurrentTab(normalizeKey(activeSubPage))
    }
  }, [activeSubPage])

  const counts = useMemo(() => {
    const pendingDraws = specimens.filter(
      (s) => s.status === "Collection Pending" || s.status === "Recollection Requested"
    ).length
    const workbenchPending = orders.filter(
      (o) => o.status === "Sample Collected" || o.status === "In Progress" || o.status === "Billed"
    ).length
    const reportsReady = orders.filter((o) => o.status === "Completed").length
    const activeCritical = criticalAlerts.filter(
      (a) => a.status === "Active Alert" || a.status === "Escalated"
    ).length

    return {
      pendingDraws,
      workbenchPending,
      reportsReady,
      activeCritical,
    }
  }, [orders, specimens, criticalAlerts])

  const handleTabChange = (tabId: LisSubModule) => {
    const normalized = normalizeKey(tabId)
    setCurrentTab(normalized)
    if (onNavigate) {
      onNavigate(normalized)
    }
  }

  const handleOpenBenchWithOrder = (order: LabOrder, test?: LabOrderTest) => {
    setActiveOrderForBench(order)
    setActiveTestForBench(test || null)
    handleTabChange("lab_workbench")
  }

  const currentHeader = MODULE_HEADER_INFO[currentTab] || {
    title: "Laboratory Diagnostic System",
    subtitle: "Enterprise Diagnostic Workflow: Doctor Order → Specimen Collection → Bench Testing → Pathologist Review → Report Distribution",
    badge: "NABL & CAP Certified",
  }

  // Navigation tab definitions
  const tabs = [
    {
      id: "lab_dashboard" as LisSubModule,
      label: "Dashboard",
      icon: LayoutDashboard,
      badge: null,
      desc: "Live clinic pulse & workload",
    },
    {
      id: "lab_orders_collection" as LisSubModule,
      label: "Orders & Phlebotomy",
      icon: ClipboardList,
      badge: counts.pendingDraws > 0 ? `${counts.pendingDraws} draws` : null,
      badgeColor: "bg-amber-100 text-amber-800",
      desc: "Intake & specimen collection",
    },
    {
      id: "lab_workbench" as LisSubModule,
      label: "Lab Workbench",
      icon: Microscope,
      badge: counts.workbenchPending > 0 ? `${counts.workbenchPending} pending` : null,
      badgeColor: "bg-teal-100 text-teal-800",
      desc: "Benches, entry & approval",
    },
    {
      id: "lab_reports" as LisSubModule,
      label: "Diagnostic Reports",
      icon: FileCheck2,
      badge: counts.reportsReady > 0 ? `${counts.reportsReady} ready` : null,
      badgeColor: "bg-emerald-100 text-emerald-800",
      desc: "Official printable reports",
    },
    {
      id: "lab_inventory" as LisSubModule,
      label: "Reagents & Stock",
      icon: Boxes,
      badge: null,
      desc: "Kits & vacuum tubes",
    },
    {
      id: "lab_quality_analytics" as LisSubModule,
      label: "Quality & QC",
      icon: LineChart,
      badge: null,
      desc: "Westgard rules & TAT SLAs",
    },
    {
      id: "lab_admin_config" as LisSubModule,
      label: "Test Master",
      icon: Settings,
      badge: "206 tests",
      badgeColor: "bg-purple-100 text-[#7552B8]",
      desc: "Tariffs & reference intervals",
    },
  ]

  // Workflow pipeline stages
  const workflowPipeline = [
    {
      step: 1,
      title: "1. Doctor Prescription",
      desc: "Doctor orders tests in portal",
      tag: "Doctor Desk",
      targetTab: "lab_orders_collection" as LisSubModule,
    },
    {
      step: 2,
      title: "2. Billing Clearance",
      desc: "Cashier settles diagnostic bill",
      tag: "Billing Counter",
      targetTab: "lab_orders_collection" as LisSubModule,
    },
    {
      step: 3,
      title: "3. Specimen Draw",
      desc: "Phlebotomist collects in tube (EDTA/Gel)",
      tag: `${counts.pendingDraws} awaiting draw`,
      targetTab: "lab_orders_collection" as LisSubModule,
    },
    {
      step: 4,
      title: "4. Workbench Analysis",
      desc: "Analyzer processing & value entry",
      tag: `${counts.workbenchPending} in bench`,
      targetTab: "lab_workbench" as LisSubModule,
    },
    {
      step: 5,
      title: "5. Pathologist Sign & Print",
      desc: "Official verification & PDF report",
      tag: `${counts.reportsReady} reports released`,
      targetTab: "lab_reports" as LisSubModule,
    },
  ]

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-slate-800 p-6 space-y-4">
      {/* ── 1. UNIFIED LIS MASTER HEADER ─────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-gradient-to-br from-[#7552B8] to-[#583994] text-white rounded-xl shadow-xs">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  {currentHeader.title}
                </h1>
                {currentHeader.badge && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-[#7552B8] uppercase tracking-wider">
                    {currentHeader.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentHeader.subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {counts.activeCritical > 0 && (
              <button
                type="button"
                onClick={() => handleTabChange("lab_workbench")}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer animate-pulse"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{counts.activeCritical} Critical Panic Limits</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-none text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#7552B8]" />
              <span>{showGuide ? "Hide Guide" : "How Lab Works"}</span>
            </button>
          </div>
        </div>

        {/* ── 2. INTERACTIVE DIAGNOSTIC WORKFLOW STEPPER ─────────────────────── */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>Diagnostic Journey Pipeline (Click any stage to jump)</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
            {workflowPipeline.map((p, idx) => {
              const isCurrent =
                (p.step === 1 && currentTab === "lab_orders_collection") ||
                (p.step === 2 && currentTab === "lab_orders_collection") ||
                (p.step === 3 && currentTab === "lab_orders_collection") ||
                (p.step === 4 && currentTab === "lab_workbench") ||
                (p.step === 5 && currentTab === "lab_reports")

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleTabChange(p.targetTab)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer group flex flex-col justify-between ${
                    isCurrent
                      ? "bg-purple-50/80 border-[#7552B8] shadow-2xs ring-1 ring-[#7552B8]"
                      : "bg-slate-50/60 border-slate-200 hover:border-purple-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11.5px] font-black ${isCurrent ? "text-[#7552B8]" : "text-slate-800"}`}>
                      {p.title}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 font-bold">0{p.step}</span>
                  </div>
                  <div className="text-[10.5px] text-slate-500 mt-1 line-clamp-1">{p.desc}</div>
                  <div className="mt-2 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                    <span className={`font-semibold ${isCurrent ? "text-[#7552B8]" : "text-slate-600"}`}>
                      {p.tag}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── 3. COLLAPSIBLE "HOW LAB WORKS" QUICK GUIDE BANNER ──────────────── */}
        {showGuide && (
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-white border border-purple-200 rounded-xl p-4 shadow-2xs text-xs space-y-3 relative">
            <button
              onClick={() => setShowGuide(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-[#7552B8] font-black text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Diagnostic Operations Quick Reference Guide</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-slate-700">
              <div className="bg-white/80 p-3 rounded-lg border border-purple-100 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  <span>1. Billing Clearance</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Doctor prescribes tests in OPD/IPD. Tests show as <strong className="text-amber-700">Awaiting Billing</strong> until settled at the Billing counter or quick-authorized.
                </p>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-purple-100 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Syringe className="w-3.5 h-3.5 text-purple-600" />
                  <span>2. Color-Coded Tubes</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  <strong className="text-purple-700">Lavender:</strong> EDTA (CBC, ESR) · <strong className="text-rose-700">Red/Gold:</strong> Gel SST (LFT, RFT, Lipids) · <strong className="text-slate-700">Grey:</strong> Fluoride (Glucose).
                </p>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-purple-100 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Microscope className="w-3.5 h-3.5 text-teal-600" />
                  <span>3. Bench & Panic Limits</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Values entered trigger automated flags (<span className="text-amber-600 font-bold">▲ High</span>, <span className="text-blue-600 font-bold">▼ Low</span>, or <span className="text-rose-600 font-bold animate-pulse">CRITICAL</span>). Critical values immediately notify ordering doctors.
                </p>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-purple-100 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>4. Report Release</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Pathologist verifies and signs the order. It renders in authentic Imperial Hospital letterhead with print & PDF export for clinical discharge and doctor review.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. PRIMARY IN-PAGE SUB-MODULE NAVIGATION TABS ──────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-2 border-t border-slate-100">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = currentTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex-shrink-0 border ${
                  isActive
                    ? "bg-[#7552B8] text-white border-[#7552B8] shadow-xs"
                    : "bg-slate-50/70 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500"}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide ${
                      isActive ? "bg-white/20 text-white" : tab.badgeColor || "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 5. ACTIVE SUB-MODULE WORKSPACES RENDERING ───────────────────────── */}
      <div className="transition-all">
        <Suspense fallback={<TabLoadingFallback />}>
          {currentTab === "lab_dashboard" && (
            <LabDashboardView
              initialOrders={orders}
              initialSpecimens={specimens}
              initialCriticalAlerts={criticalAlerts}
              onNavigate={(mod) => handleTabChange(normalizeKey(mod))}
              onOpenOrder={(ord) => handleOpenBenchWithOrder(ord)}
            />
          )}

        {currentTab === "lab_orders_collection" && (
          <LabOrdersAndCollectionView
            onOpenWorkbench={(ord, t) => handleOpenBenchWithOrder(ord, t)}
            onOpenReport={() => handleTabChange("lab_reports")}
          />
        )}

        {currentTab === "lab_workbench" && (
          <LabWorkbenchView
            initialOrder={activeOrderForBench || undefined}
            initialTest={activeTestForBench || undefined}
            onCompleteToReports={() => handleTabChange("lab_reports")}
          />
        )}

        {currentTab === "lab_reports" && <LabReportsView />}

        {currentTab === "lab_inventory" && <LaboratoryInventory />}

        {currentTab === "lab_quality_analytics" && <QualityControlView />}

        {currentTab === "lab_admin_config" && <AdminConfigurationView />}
        </Suspense>
      </div>
    </div>
  )
}
