import React, { useState, useEffect, useMemo } from "react"
import {
  LabOrder,
  LabOrderTest,
  LabOrderDatabase,
  LabTestStatus,
  LabParameterResult,
  priceForTest,
} from "../services/labOrdersDb"
import {
  ALL_LAB_TESTS,
  LAB_CATALOGUE,
  findTestDefinition,
  LabTestDefinition,
} from "./laboratory/labCatalogueSchema"
import TestResultModal from "./laboratory/TestResultModal"
import ImportAllResultsModal from "./laboratory/ImportAllResultsModal"
import CompleteLabReportModal from "./laboratory/CompleteLabReportModal"
import TestCatalogModal from "./laboratory/TestCatalogModal"
import { AuditDatabase } from "../services/auditDb"
import LaboratoryInventory from "./laboratory/LaboratoryInventory"
import LaboratoryAnalytics from "./laboratory/LaboratoryAnalytics"
import LaboratoryTATMonitor from "./laboratory/LaboratoryTATMonitor"
import { LabInventoryDatabase } from "../services/labInventoryDb"

const LAB_DASHBOARDS = [
  {
    id: "all" as const,
    label: "All Orders",
    shortLabel: "All Orders",
    icon: "📋",
    title: "All Laboratory Orders Dashboard",
    description: "Operational diagnostic worklist for phlebotomy, specimen accessioning, and bench analysis",
    accentColor: "border-l-blue-600",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "paid" as const,
    label: "Pre-Paid (Ready)",
    shortLabel: "Pre-Paid (Ready)",
    icon: "✓",
    title: "Pre-Paid (Ready) Orders Station",
    description: "Pre-paid orders ready for specimen draw, barcode labeling, and accessioning",
    accentColor: "border-l-emerald-600",
    badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-300",
  },
  {
    id: "processing" as const,
    label: "Processing Bench",
    shortLabel: "Processing Bench",
    icon: "⚙️",
    title: "Analytical Processing Bench",
    description: "Accessioned specimens currently undergoing automated analysis, staining, and test result entry",
    accentColor: "border-l-teal-600",
    badgeColor: "bg-teal-50 text-teal-800 border-teal-300",
  },
  {
    id: "pending" as const,
    label: "Payment Pending",
    shortLabel: "Payment Pending",
    icon: "💳",
    title: "Payment Pending Clearance Desk",
    description: "Doctor-prescribed lab orders awaiting billing payment clearance at reception desk",
    accentColor: "border-l-amber-500",
    badgeColor: "bg-amber-50 text-amber-800 border-amber-300",
  },
  {
    id: "critical" as const,
    label: "Critical Values",
    shortLabel: "Critical Values",
    icon: "🚨",
    title: "Critical Values Alert Center",
    description: "Urgent panic limits requiring immediate physician alert and clinical notification record",
    accentColor: "border-l-red-600",
    badgeColor: "bg-red-50 text-red-700 border-red-200",
  },
  {
    id: "completed" as const,
    label: "Completed & Verified",
    shortLabel: "Completed & Verified",
    icon: "📋",
    title: "Completed & Verified Reports Portal",
    description: "Finalized diagnostic pathology reports verified and signed off by pathologist",
    accentColor: "border-l-indigo-600",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    id: "inventory" as const,
    label: "Lab Inventory",
    shortLabel: "Inventory",
    icon: "📦",
    title: "Laboratory Inventory & Reagent Stock",
    description: "Reagents, test kits, blood tubes, consumables, stock levels, and supply transactions",
    accentColor: "border-l-cyan-600",
    badgeColor: "bg-cyan-50 text-cyan-800 border-cyan-300",
  },
  {
    id: "analytics" as const,
    label: "Laboratory Analytics",
    shortLabel: "Analytics",
    icon: "📊",
    title: "Diagnostic Operational Analytics",
    description: "Operational metrics, department volume, test utilization, and status distribution",
    accentColor: "border-l-purple-600",
    badgeColor: "bg-purple-50 text-purple-800 border-purple-300",
  },
  {
    id: "tat" as const,
    label: "TAT Monitor",
    shortLabel: "TAT Monitor",
    icon: "⏱️",
    title: "Turnaround Time (TAT) Compliance Monitor",
    description: "Analytical processing duration, benchmark compliance, and SLA breach tracking",
    accentColor: "border-l-amber-600",
    badgeColor: "bg-amber-50 text-amber-800 border-amber-300",
  },
  {
    id: "catalog" as const,
    label: "Test Catalog",
    shortLabel: "Catalog",
    icon: "📖",
    title: "Diagnostic Test Catalog & Rate Card",
    description: "Standard directory of clinical tests, specimen types, reference ranges, and tariff prices",
    accentColor: "border-l-blue-600",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
]

// The 5 core clinical queue dashboards belonging specifically to Laboratory Portal
const PORTAL_DASHBOARDS = LAB_DASHBOARDS.filter((d) =>
  ["all", "paid", "pending", "critical", "completed"].includes(d.id)
)

interface LaboratoryProps {
  technician?: string
  activeSubPage?: string
  onNavigate?: (sub: string) => void
}

export default function Laboratory({
  technician = "Laboratory Specialist",
  activeSubPage,
  onNavigate,
}: LaboratoryProps) {
  const [tick, setTick] = useState(0)
  const [activeQueue, setActiveQueue] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [showTestCatalogModal, setShowTestCatalogModal] = useState(false)

  // Identifies if the user is currently viewing the Laboratory Portal queues
  const isPortalView = ["all", "paid", "processing", "pending", "critical", "completed"].includes(activeQueue)

  // Synchronize internal queue tab when navigating from sidebar sub-pages
  useEffect(() => {
    if (!activeSubPage) return
    if (activeSubPage === "laboratory") {
      setActiveQueue((prev) => (prev === "inventory" || prev === "analytics" || prev === "tat" || prev === "catalog" ? "all" : prev))
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    } else if (activeSubPage === "lab_sample_collection") {
      setActiveQueue("paid")
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    } else if (activeSubPage === "lab_critical") {
      setActiveQueue("critical")
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    } else if (activeSubPage === "lab_reports") {
      setActiveQueue("completed")
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    } else if (activeSubPage === "lab_inventory") {
      setActiveQueue("inventory")
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    } else if (activeSubPage === "lab_analytics") {
      setActiveQueue("analytics")
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    } else if (activeSubPage === "lab_tat") {
      setActiveQueue("tat")
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    } else if (activeSubPage === "lab_catalog") {
      setActiveQueue("catalog")
      setSelectedOrderId(null)
      setShowTestCatalogModal(false)
    }
  }, [activeSubPage])

  const handleSelectDashboard = (dashId: string) => {
    setActiveQueue(dashId)
    setSelectedOrderId(null)
    // Only navigate externally for standalone submodules
    if (dashId === "inventory") onNavigate?.("lab_inventory")
    else if (dashId === "analytics") onNavigate?.("lab_analytics")
    else if (dashId === "tat") onNavigate?.("lab_tat")
    else if (dashId === "catalog") onNavigate?.("lab_catalog")
    // Core queue tabs ("all", "paid", "pending", "critical", "completed") are managed internally within Laboratory Portal
  }
  
  // Modals state
  const [activeTestForResult, setActiveTestForResult] = useState<{
    order: LabOrder
    test: LabOrderTest
  } | null>(null)
  const [showImportAllModal, setShowImportAllModal] = useState<LabOrder | null>(null)
  const [showCompleteReportModal, setShowCompleteReportModal] = useState<LabOrder | null>(null)
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  // Direct order creation form state
  const [newOrderForm, setNewOrderForm] = useState({
    patientName: "",
    umr: "",
    age: 35,
    sex: "Male",
    phone: "",
    opNumber: "",
    doctorName: "Dr. Arvind Sharma",
    department: "Internal Medicine",
    diagnosis: "General Investigation",
    selectedTests: ["CBC / Complete Hemogram"],
  })

  // Subscribe to changes in LabOrderDatabase and LabInventoryDatabase
  useEffect(() => {
    const unsubOrders = LabOrderDatabase.subscribe(() => setTick((t) => t + 1))
    const unsubInventory = LabInventoryDatabase.subscribe(() => setTick((t) => t + 1))
    return () => {
      unsubOrders()
      unsubInventory()
    }
  }, [])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Load all lab orders
  const allOrders = useMemo(() => {
    return LabOrderDatabase.getLabWorklist()
  }, [tick])

  // Helper to determine if an order is completed
  const isOrderCompleted = (order: LabOrder): boolean => {
    if (order.billing?.status !== "Paid") return false
    if (order.status === "Completed") return true
    if (
      order.tests.length > 0 &&
      order.tests.every(
        (t) => t.status === "Completed" || t.status === "Verified"
      )
    ) {
      return true
    }
    return false
  }

  // Filter orders by active queue tab, search query, and category
  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => {
      const isCompleted = isOrderCompleted(order)

      // 1. Queue filter
      if (activeQueue === "all" && isCompleted) return false
      if (activeQueue === "paid" && (order.billing.status !== "Paid" || isCompleted)) return false
      if (activeQueue === "pending" && (order.billing.status !== "Pending" || isCompleted)) return false
      if (activeQueue === "collected" && (order.status !== "Sample Collected" || isCompleted)) return false
      if (activeQueue === "processing" && ((order.status !== "In Progress" && order.status !== "Sample Collected") || isCompleted)) return false
      if (activeQueue === "critical") {
        const hasCritical = order.tests.some(
          (t) =>
            t.flag === "Critical" ||
            Object.values(t.results || {}).some((r) => r.flag === "Critical")
        )
        if (!hasCritical) return false
      }
      if (activeQueue === "completed" && !isCompleted) return false

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = order.patientName.toLowerCase().includes(q)
        const matchUmr = order.umr.toLowerCase().includes(q)
        const matchId = order.id.toLowerCase().includes(q)
        const matchDoctor = order.doctorName.toLowerCase().includes(q)
        const matchTest = order.tests.some((t) => t.name.toLowerCase().includes(q))
        if (!matchName && !matchUmr && !matchId && !matchDoctor && !matchTest) return false
      }

      // 3. Category filter
      if (categoryFilter !== "all") {
        const matchCat = order.tests.some(
          (t) => t.category.toLowerCase() === categoryFilter.toLowerCase()
        )
        if (!matchCat) return false
      }

      return true
    })
  }, [allOrders, activeQueue, searchQuery, categoryFilter])

  // Currently opened order in detail view
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null
    return allOrders.find((o) => o.id === selectedOrderId) || null
  }, [allOrders, selectedOrderId])

  // Quick statistics
  const stats = useMemo(() => {
    const activeOrders = allOrders.filter((o) => !isOrderCompleted(o))
    const total = activeOrders.length
    const paid = activeOrders.filter((o) => o.billing.status === "Paid").length
    const pending = activeOrders.filter((o) => o.billing.status === "Pending").length
    const processing = activeOrders.filter(
      (o) => o.status === "In Progress" || o.status === "Sample Collected"
    ).length
    const critical = allOrders.filter((o) =>
      o.tests.some(
        (t) =>
          t.flag === "Critical" ||
          Object.values(t.results || {}).some((r) => r.flag === "Critical")
      )
    ).length
    const completed = allOrders.filter(isOrderCompleted).length
    return { total, paid, pending, processing, critical, completed }
  }, [allOrders])

  const inventoryItemCount = useMemo(() => {
    return LabInventoryDatabase.getItems().length
  }, [tick])

  const tatCount = useMemo(() => {
    return allOrders.filter((o) =>
      o.tests.some((t) => t.processingCompletedAt || t.processingStartedAt)
    ).length
  }, [allOrders])

  // Save individual test result from modal
  const handleSaveTestResult = (
    testId: string,
    status: "Result Entered" | "Completed" | "Verified",
    results: Record<string, LabParameterResult>,
    clinicalComments?: string,
    technicianName?: string,
    verifierName?: string,
    tableData?: any[]
  ) => {
    if (!activeTestForResult) return
    const updated = LabOrderDatabase.saveDetailedTestResult(
      activeTestForResult.order.id,
      testId,
      {
        status,
        results,
        clinicalComments,
        technician: technicianName || technician,
        verifier: verifierName,
        tableData,
        actor: technician,
      }
    )

    if (updated) {
      setActiveTestForResult(null)
      const isNowCompleted = isOrderCompleted(updated)
      showToast(
        isNowCompleted
          ? `✓ All tests completed! Order ${updated.id} moved to Completed & Verified.`
          : `✓ Results for ${activeTestForResult.test.name} saved.`,
        "success"
      )
    }
  }

  // Batch Save all tests from Import All modal
  const handleSaveAllBatch = (
    updatedTestsData: Array<{
      testId: string
      status: "Completed" | "Result Entered"
      results: Record<string, LabParameterResult>
      clinicalComments?: string
      technician?: string
      verifier?: string
    }>
  ) => {
    if (!showImportAllModal) return
    if (showImportAllModal.billing.status !== "Paid") {
      showToast("Action restricted: Billing payment is pending for this patient.", "error")
      return
    }
    const orderId = showImportAllModal.id

    updatedTestsData.forEach((item) => {
      LabOrderDatabase.saveDetailedTestResult(orderId, item.testId, {
        status: item.status,
        results: item.results,
        clinicalComments: item.clinicalComments,
        technician: item.technician || technician,
        verifier: item.verifier,
        actor: technician,
      })
    })

    setShowImportAllModal(null)
    showToast(
      `✓ All ${updatedTestsData.length} test results successfully imported & updated for ${showImportAllModal.patientName}!`,
      "success"
    )
  }

  // Advance test status directly (e.g. Sample Collected -> Processing)
  const handleAdvanceTestStatus = (
    order: LabOrder,
    test: LabOrderTest,
    nextStatus: LabTestStatus
  ) => {
    const updated = LabOrderDatabase.updateTestStatus(
      order.id,
      test.id,
      nextStatus,
      technician,
      {
        sampleCollector: technician,
        technician,
      }
    )

    if (updated) {
      showToast(`✓ ${test.name} status updated to "${nextStatus}"`, "info")
      AuditDatabase.logEvent(
        `Test ${nextStatus}`,
        "Laboratory",
        `${technician} marked ${test.name} as ${nextStatus} for ${order.patientName} (${order.umr}).`,
        "Success"
      )
    }
  }

  // Create new lab order directly from Lab module
  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOrderForm.patientName.trim()) {
      showToast("Please enter patient name", "error")
      return
    }

    const umr = newOrderForm.umr.trim() || `PAT-${Math.floor(10000 + Math.random() * 90000)}`
    const opNumber = newOrderForm.opNumber.trim() || `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`

    const created = LabOrderDatabase.createOrder({
      encounterId: `ENC-${Math.floor(1000 + Math.random() * 9000)}`,
      umr,
      patientName: newOrderForm.patientName,
      age: Number(newOrderForm.age) || 35,
      sex: newOrderForm.sex,
      phone: newOrderForm.phone || "+91 98765 00000",
      opNumber,
      doctorId: "DOC-DIRECT",
      doctorName: newOrderForm.doctorName,
      department: newOrderForm.department,
      diagnosis: newOrderForm.diagnosis,
      tests: newOrderForm.selectedTests.map((tName) => {
        const def = findTestDefinition(tName)
        return {
          name: def?.name || tName,
          category: def?.category || "PATHOLOGY",
          urgency: "Routine",
        }
      }),
    })

    setShowNewOrderModal(false)
    showToast(
      `✓ New Lab Order ${created.id} created for ${created.patientName}. Sent to billing!`,
      "success"
    )
    AuditDatabase.logEvent(
      "Lab Order Created",
      "Laboratory",
      `New lab order ${created.id} created for ${created.patientName} (${created.umr}) with ${created.tests.length} test(s).`,
      "Success"
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F3F5F9] overflow-hidden">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-none shadow-lg text-xs font-bold text-white flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === "success"
              ? "bg-emerald-600"
              : toastMessage.type === "error"
              ? "bg-red-600"
              : "bg-blue-600"
          }`}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header Workspace (Rectangular Enterprise) */}
      <div className="bg-white border-b border-gray-200 shrink-0">
        {/* Main Header Bar */}
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-none bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                DIAGNOSTIC PATHOLOGY
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {activeQueue === "inventory"
                  ? "Reagents & Consumables Store"
                  : activeQueue === "analytics"
                  ? "Operational Analytics & Utilization"
                  : activeQueue === "tat"
                  ? "Turnaround Time (TAT) Performance"
                  : activeQueue === "catalog"
                  ? "Diagnostic Reference Directory & Rate Card"
                  : "LIS & Specimen Bench"}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight mt-1">
              {activeQueue === "inventory"
                ? "Lab Inventory & Consumables"
                : activeQueue === "analytics"
                ? "Laboratory Analytics"
                : activeQueue === "tat"
                ? "Turnaround Time (TAT) Monitor"
                : activeQueue === "catalog"
                ? "Laboratory Test Catalog"
                : "Laboratory Portal"}
            </h1>
          </div>

          {/* Action Buttons - Only visible on Laboratory Portal */}
          {isPortalView && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectDashboard("catalog")}
                className={`px-3.5 py-2 text-xs font-semibold rounded-none border transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  activeQueue === "catalog"
                    ? "bg-blue-50 text-blue-700 border-blue-400 font-bold"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-blue-700 hover:border-blue-300"
                }`}
              >
                <span className="text-xs">📖</span> Test Catalog
              </button>
              <button
                onClick={() => setShowNewOrderModal(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-none shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="font-bold text-sm leading-none">+</span> New Lab Order
              </button>
            </div>
          )}
        </div>

        {/* Top-Level Dashboard Switcher - Only visible on Laboratory Portal */}
        {isPortalView && (
          <div className="bg-slate-100/90 border-t border-gray-200 px-6 py-2 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mr-2 flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-3.5 bg-blue-600 inline-block"></span>
              Dashboards:
            </span>
            {PORTAL_DASHBOARDS.map((dash) => {
              const isActive = activeQueue === dash.id
              let count = 0
              if (dash.id === "all") count = allOrders.filter((o) => !isOrderCompleted(o)).length
              if (dash.id === "paid") count = allOrders.filter((o) => o.billing.status === "Paid" && !isOrderCompleted(o)).length
              if (dash.id === "processing") count = allOrders.filter((o) => (o.status === "Sample Collected" || o.status === "In Progress") && !isOrderCompleted(o)).length
              if (dash.id === "pending") count = allOrders.filter((o) => o.billing.status === "Pending" && !isOrderCompleted(o)).length
              if (dash.id === "critical") count = stats.critical
              if (dash.id === "completed") count = allOrders.filter(isOrderCompleted).length

              return (
                <button
                  key={dash.id}
                  onClick={() => handleSelectDashboard(dash.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-none border transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shadow-2xs ${
                    isActive
                      ? "bg-white text-blue-700 border-blue-600 font-bold border-b-2"
                      : "bg-slate-200/70 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900"
                  }`}
                >
                  <span>{dash.icon}</span>
                  <span>{dash.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-none font-mono font-bold ${
                      isActive
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-200/80 text-gray-600"
                    }`}
                  >
                    [{count}]
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Workspace Body: Inventory, Analytics, TAT, Catalog, or Standard Laboratory Queues */}
      {activeQueue === "inventory" ? (
        <LaboratoryInventory technician={technician} />
      ) : activeQueue === "analytics" ? (
        <LaboratoryAnalytics technician={technician} />
      ) : activeQueue === "tat" ? (
        <LaboratoryTATMonitor technician={technician} />
      ) : activeQueue === "catalog" ? (
        <TestCatalogModal isInline={true} />
      ) : (
        /* Main Content Workspace with Structured Spacing */
        <div className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col">
        
        {/* Quick Statistics Strip (5 Balanced Rectangular KPI Cards - Clickable Dashboard Selectors) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5 shrink-0">
          <div
            onClick={() => handleSelectDashboard("all")}
            className={`bg-white border border-gray-200 border-l-4 border-l-blue-600 rounded-none p-3.5 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors ${activeQueue === "all" ? "ring-1 ring-blue-500 bg-blue-50/20" : ""}`}
            title="Click to open All Orders Dashboard"
          >
            <span className="text-gray-500 block text-[10.5px] font-semibold uppercase tracking-wider">
              All Orders
            </span>
            <strong className="text-2xl font-bold text-gray-900 mt-1 block">
              {stats.total}
            </strong>
          </div>
          <div
            onClick={() => handleSelectDashboard("paid")}
            className={`bg-white border border-gray-200 border-l-4 border-l-emerald-600 rounded-none p-3.5 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors ${activeQueue === "paid" ? "ring-1 ring-emerald-500 bg-emerald-50/20" : ""}`}
            title="Click to open Pre-Paid (Ready) Orders"
          >
            <span className="text-emerald-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Pre-Paid (Ready)
            </span>
            <strong className="text-2xl font-bold text-emerald-800 mt-1 block">
              {stats.paid}
            </strong>
          </div>
          <div
            onClick={() => handleSelectDashboard("pending")}
            className={`bg-white border border-gray-200 border-l-4 border-l-amber-500 rounded-none p-3.5 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors ${activeQueue === "pending" ? "ring-1 ring-amber-500 bg-amber-50/20" : ""}`}
            title="Click to open Payment Pending Desk"
          >
            <span className="text-amber-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Payment Pending
            </span>
            <strong className="text-2xl font-bold text-amber-800 mt-1 block">
              {stats.pending}
            </strong>
          </div>
          <div
            onClick={() => handleSelectDashboard("critical")}
            className={`bg-white border border-gray-200 border-l-4 border-l-red-600 rounded-none p-3.5 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors ${activeQueue === "critical" ? "ring-1 ring-red-500 bg-red-50/20" : ""}`}
            title="Click to open Critical Values Alert Center"
          >
            <span className="text-red-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Critical Values
            </span>
            <strong className="text-2xl font-bold text-red-800 mt-1 block">
              {stats.critical}
            </strong>
          </div>
          <div
            onClick={() => handleSelectDashboard("completed")}
            className={`bg-white border border-gray-200 border-l-4 border-l-indigo-600 rounded-none p-3.5 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors ${activeQueue === "completed" ? "ring-1 ring-indigo-500 bg-indigo-50/20" : ""}`}
            title="Click to open Completed & Verified Reports"
          >
            <span className="text-indigo-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Completed &amp; Verified
            </span>
            <strong className="text-2xl font-bold text-indigo-800 mt-1 block">
              {stats.completed}
            </strong>
          </div>
        </div>

      {/* Primary Work Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* CONDITIONAL:
            1. If entering test result, show FULL PAGE RESULT VIEW
            2. If patient selected, show PATIENT DETAILS view
            3. Otherwise PATIENT LIST view */}
        {activeTestForResult ? (
          <TestResultModal
            order={activeTestForResult.order}
            test={activeTestForResult.test}
            onClose={() => setActiveTestForResult(null)}
            onSave={handleSaveTestResult}
          />
        ) : selectedOrder ? (
          /* ========================================================================= */
          /* PATIENT DETAILS & ORDERED TESTS VIEW                                      */
          /* ========================================================================= */
          <div className="flex-1 bg-white rounded-none shadow-2xs border border-gray-200 flex flex-col overflow-hidden min-h-[480px]">
            
            {/* Header / Actions Bar (Clean Professional Light Theme) */}
            <div className="bg-white text-gray-900 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedOrderId(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-none border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span>←</span> Back to Patient List
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900 tracking-tight">
                      {selectedOrder.patientName}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-none bg-blue-50 text-blue-700 font-mono border border-blue-200 font-semibold">
                      {selectedOrder.umr}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-none font-semibold border inline-flex items-center gap-1.5 ${
                        selectedOrder.billing.status === "Paid"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-amber-50 text-amber-800 border-amber-300"
                      }`}
                    >
                      <span className={selectedOrder.billing.status === "Paid" ? "text-emerald-500 text-[8px]" : "text-amber-500 text-[8px]"}>●</span>
                      <span>Billing: {selectedOrder.billing.status}</span>
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 mt-0.5 block font-mono">
                    Visit: {selectedOrder.opNumber || selectedOrder.encounterId} · Order: {selectedOrder.id} · <span className="font-sans">Age/Sex: {selectedOrder.age}Y / {selectedOrder.sex}</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  disabled={selectedOrder.billing.status !== "Paid"}
                  onClick={() => {
                    if (selectedOrder.billing.status !== "Paid") return
                    setShowImportAllModal(selectedOrder)
                  }}
                  title={
                    selectedOrder.billing.status !== "Paid"
                      ? "Action Restricted: Billing payment is pending at reception desk"
                      : "Batch enter results for all ordered tests"
                  }
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-none border transition-colors flex items-center gap-1.5 shadow-2xs ${
                    selectedOrder.billing.status === "Paid"
                      ? "text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-300 cursor-pointer"
                      : "text-gray-400 bg-slate-100 border-slate-200 cursor-not-allowed opacity-60"
                  }`}
                >
                  <span>⚡</span> Import All Test Results
                </button>
                <button
                  onClick={() => setShowCompleteReportModal(selectedOrder)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-none transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>📋</span> Complete Laboratory Report
                </button>
                {isOrderCompleted(selectedOrder) && (
                  <span className="px-3 py-1 rounded-none text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    ✓ Completed &amp; Verified
                  </span>
                )}
              </div>
            </div>

            {/* Patient Clinical Info Card */}
            <div className="bg-slate-50 border-b border-gray-200 px-6 py-3.5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Ordering Physician</span>
                <strong className="text-gray-900 font-semibold">{selectedOrder.doctorName}</strong>
                <span className="text-gray-500 block text-[11px] mt-0.5">{selectedOrder.department}</span>
              </div>
              <div>
                <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Clinical Diagnosis</span>
                <strong className="text-gray-900 font-semibold">{selectedOrder.diagnosis || "Under Evaluation"}</strong>
              </div>
              <div>
                <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Clinical Notes / Advice</span>
                <span className="text-gray-700">{selectedOrder.clinicalNotes || "Standard diagnostic workup"}</span>
              </div>
              <div>
                <span className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Payment Reference</span>
                {selectedOrder.billing.status === "Paid" ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <span>✓</span> Paid ({selectedOrder.billing.receiptNo}) · ₹{selectedOrder.billing.total}
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold flex items-center gap-1">
                    <span>⚠️</span> Unpaid (₹{selectedOrder.billing.total}) · Pending at Reception
                  </span>
                )}
              </div>
            </div>

            {/* Warning Banner if Billing is Pending */}
            {selectedOrder.billing.status === "Pending" && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <span>
                    <strong>Payment Pending in Billing Desk:</strong> Investigations are listed as ordered by the doctor. Processing and verification are restricted until billing is settled.
                  </span>
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-none">
                  Awaiting Billing Settlement
                </span>
              </div>
            )}

            {/* Ordered Tests Table */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-3.5 bg-blue-600 inline-block"></span>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Ordered Investigations ({selectedOrder.tests.length})
                    </h3>
                    <span className="text-[11px] text-gray-500">
                      Doctor prescribed investigations
                    </span>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-none overflow-hidden shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-gray-600 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Test Name &amp; Code</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Laboratory Module</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Urgency</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Price</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Billing Status</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Result Summary</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {selectedOrder.tests.map((test) => {
                      const def = findTestDefinition(test.name)
                      const isPaid = selectedOrder.billing.status === "Paid"
                      const hasResults = test.results && Object.keys(test.results).length > 0

                      return (
                        <tr key={test.id} className="hover:bg-blue-50/25 transition-colors border-b border-gray-200/80">
                          <td className="py-3 px-4 border-r border-gray-100">
                            <strong className="text-gray-900 block text-xs">
                              {test.name}
                            </strong>
                            <span className="text-[11px] text-gray-500 font-medium font-mono">
                              {def?.code || test.id} {def?.subModule ? `• ${def.subModule}` : ""}
                            </span>
                          </td>
                          <td className="py-3 px-4 border-r border-gray-100">
                            <span className="px-2 py-0.5 rounded-none bg-gray-100 text-gray-700 text-[11px] font-medium uppercase border border-gray-200">
                              {def?.category || test.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 border-r border-gray-100">
                            {test.urgency === "STAT" ? (
                              <span className="px-2 py-0.5 rounded-none bg-red-100 text-red-800 font-bold text-[10.5px] border border-red-200">
                                STAT
                              </span>
                            ) : (
                              <span className="text-gray-500 text-[11px]">Routine</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-gray-800 border-r border-gray-100">
                            ₹{test.price}
                          </td>
                          <td className="py-3 px-4 border-r border-gray-100">
                            <span
                              className={`px-2 py-0.5 rounded-none font-semibold text-[11px] inline-flex items-center gap-1.5 border ${
                                isPaid
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : "bg-amber-50 text-amber-800 border-amber-300"
                              }`}
                            >
                              <span className={isPaid ? "text-emerald-500 text-[8px]" : "text-amber-500 text-[8px]"}>●</span>
                              <span>{isPaid ? "Paid" : "Pending"}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 border-r border-gray-100">
                            {hasResults ? (
                              <div>
                                <span className="font-bold text-gray-900 font-mono text-xs">
                                  {Object.values(test.results!)[0]?.value}{" "}
                                  {Object.values(test.results!)[0]?.unit}
                                </span>
                                {test.flag === "H" && (
                                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-none">
                                    ▲ High
                                  </span>
                                )}
                                {test.flag === "L" && (
                                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded-none">
                                    ▼ Low
                                  </span>
                                )}
                                {test.flag === "Critical" && (
                                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-red-600 text-white rounded-none">
                                    CRITICAL
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 italic text-[11px]">
                                {test.result || "No results yet"}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!isPaid ? (
                              <span className="px-3 py-1 text-xs font-semibold text-gray-400 bg-gray-100 rounded-none border border-gray-200 cursor-not-allowed">
                                Restricted
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                {test.status === "Pending" && (
                                  <button
                                    onClick={() => handleAdvanceTestStatus(selectedOrder, test, "Sample Collected")}
                                    className="px-2.5 py-1 text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-none transition-colors cursor-pointer shadow-2xs"
                                  >
                                    Collect Sample
                                  </button>
                                )}
                                {test.status === "Sample Collected" && (
                                  <button
                                    onClick={() => handleAdvanceTestStatus(selectedOrder, test, "Processing")}
                                    className="px-2.5 py-1 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-none transition-colors cursor-pointer shadow-2xs"
                                  >
                                    Start Processing
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    setActiveTestForResult({
                                      order: selectedOrder,
                                      test,
                                    })
                                  }
                                  className={`px-3 py-1 text-xs font-semibold rounded-none transition-colors cursor-pointer shadow-2xs ${
                                    test.status === "Completed" || test.status === "Verified" || test.status === "Result Entered"
                                      ? "text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300"
                                      : "text-white bg-blue-600 hover:bg-blue-700 shadow-xs"
                                  }`}
                                >
                                  {test.status === "Completed" || test.status === "Verified" || test.status === "Result Entered"
                                    ? "View / Edit"
                                    : "Enter Results"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        ) : (
          /* ========================================================================= */
          /* LABORATORY PATIENT LIST VIEW                                              */
          /* ========================================================================= */
          <div className="flex-1 bg-white rounded-none border border-gray-200 shadow-2xs flex flex-col overflow-hidden min-h-[480px]">
            
            {/* Active Dashboard Title & Operations Banner */}
            {(() => {
              const currentDash = LAB_DASHBOARDS.find((d) => d.id === activeQueue) || LAB_DASHBOARDS[0]
              const isCritical = activeQueue === "critical"
              const isPending = activeQueue === "pending"
              const isPaid = activeQueue === "paid"
              const isCompleted = activeQueue === "completed"

              return (
                <div className={`border-b border-gray-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 ${
                  isCritical
                    ? "bg-red-50/80 border-b-red-200"
                    : isPending
                    ? "bg-amber-50/80 border-b-amber-200"
                    : isPaid
                    ? "bg-emerald-50/70 border-b-emerald-200"
                    : isCompleted
                    ? "bg-indigo-50/70 border-b-indigo-200"
                    : "bg-slate-50/90"
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{currentDash.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
                          {currentDash.title}
                        </h2>
                        <span className={`text-[10px] px-2 py-0.5 rounded-none font-bold uppercase border ${currentDash.badgeColor}`}>
                          {isCritical
                            ? "Panic Limits"
                            : isPending
                            ? "Billing Action Required"
                            : isPaid
                            ? "Ready for Phlebotomy"
                            : isCompleted
                            ? "Archived & Verified"
                            : "Live Queue"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {currentDash.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">
                      Total Records: <strong className="text-gray-900 font-bold">{filteredOrders.length}</strong>
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Search and Secondary Filter Bar */}
            <div className="px-6 py-2.5 border-b border-gray-200 bg-slate-50/40 flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[280px] max-w-md relative">
                <span className="absolute left-3 top-2 text-gray-400 text-xs pointer-events-none">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patient, UMR, order ID, doctor, test..."
                  className="w-full text-xs pl-8 pr-3 py-1.5 rounded-none border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600">Module:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-xs font-semibold px-3 py-1.5 border rounded-none border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 cursor-pointer"
                >
                  <option value="all">All Modules</option>
                  <option value="hematology">Hematology</option>
                  <option value="pathology">Pathology</option>
                  <option value="microbiology">Microbiology</option>
                  <option value="biochemistry">Biochemistry</option>
                  <option value="immunology / serology">Immunology / Serology</option>
                  <option value="thyroid function">Thyroid Function</option>
                  <option value="other special tests">Other Special Tests</option>
                </select>
              </div>
            </div>

            {/* Patients Table */}
            <div className="flex-1 overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400">
                  <div className="w-12 h-12 rounded-none bg-gray-50 border border-gray-200 flex items-center justify-center text-2xl mb-2">
                    🧪
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700">No Laboratory Orders Found</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm">
                    Orders dispatched by doctors from Doctor Portal or walk-ins created here will appear on this worklist.
                  </p>
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-gray-600 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Patient ID / Name</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Visit / Encounter</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Ordering Doctor</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Lab Order ID</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Ordered Tests</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Billing Status</th>
                      <th className="py-2.5 px-4 font-semibold border-r border-gray-200/60 last:border-r-0">Date / Time</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredOrders.map((order) => {
                      const isPaid = order.billing.status === "Paid"
                      const hasCritical = order.tests.some(
                        (t) =>
                          t.flag === "Critical" ||
                          Object.values(t.results || {}).some((r) => r.flag === "Critical")
                      )

                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-blue-50/25 border-b border-gray-200/80 transition-colors cursor-pointer group"
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          {/* Patient ID / Name */}
                          <td className="py-3 px-4 border-r border-gray-100">
                            <div className="flex items-center gap-2">
                              <strong className="text-gray-900 block text-xs font-semibold">
                                {order.patientName}
                              </strong>
                              {hasCritical && (
                                <span className="px-1.5 py-0.5 rounded-none text-[9.5px] font-bold bg-red-600 text-white animate-pulse">
                                  CRITICAL
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5 font-mono">
                              <span className="font-semibold text-blue-700">
                                {order.umr}
                              </span>
                              <span className="text-gray-300">•</span>
                              <span className="font-sans text-gray-500">{order.age}Y / {order.sex}</span>
                            </div>
                          </td>

                          {/* Visit / Encounter */}
                          <td className="py-3 px-4 font-mono text-gray-700 text-xs border-r border-gray-100">
                            {order.opNumber || order.encounterId}
                          </td>

                          {/* Doctor */}
                          <td className="py-3 px-4 border-r border-gray-100">
                            <span className="font-semibold text-gray-900 block text-xs">
                              {order.doctorName}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              {order.department}
                            </span>
                          </td>

                          {/* Lab Order ID */}
                          <td className="py-3 px-4 font-mono font-bold text-gray-800 text-xs border-r border-gray-100">
                            {order.id}
                          </td>

                          {/* Ordered Tests */}
                          <td className="py-3 px-4 border-r border-gray-100">
                            <div className="flex flex-wrap items-center gap-1 max-w-xs">
                              {order.tests.slice(0, 3).map((t) => (
                                <span
                                  key={t.id}
                                  className={`px-2 py-0.5 rounded-none text-[10.5px] font-medium border ${
                                    t.status === "Completed" || t.status === "Verified"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : "bg-gray-50 text-gray-700 border-gray-200"
                                  }`}
                                >
                                  {t.name}
                                  {(t.status === "Completed" || t.status === "Verified") && " ✓"}
                                </span>
                              ))}
                              {order.tests.length > 3 && (
                                <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-none">
                                  +{order.tests.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Billing Status */}
                          <td className="py-3 px-4 border-r border-gray-100" onClick={(e) => e.stopPropagation()}>
                            <span
                              className={`px-2.5 py-1 rounded-none font-semibold text-[11px] inline-flex items-center gap-1.5 border ${
                                isPaid
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : "bg-amber-50 text-amber-800 border-amber-300"
                              }`}
                            >
                              <span className={isPaid ? "text-emerald-500 text-[8px]" : "text-amber-500 text-[8px]"}>●</span>
                              <span>{order.billing.status}</span>
                            </span>
                          </td>

                          {/* Date / Time */}
                          <td className="py-3 px-4 text-gray-500 text-[11px] whitespace-nowrap font-mono border-r border-gray-100">
                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                            })} · {new Date(order.createdAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>

                          {/* Action Button */}
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {activeQueue === "completed" && (
                                <button
                                  onClick={() => setShowCompleteReportModal(order)}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-none transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                                  title="View & Print Completed Lab Report"
                                >
                                  View Report 📋
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedOrderId(order.id)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-none transition-colors cursor-pointer shadow-2xs whitespace-nowrap ${
                                  activeQueue === "critical"
                                    ? "text-red-700 bg-red-50 hover:bg-red-100 border border-red-300"
                                    : "text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200"
                                }`}
                              >
                                {activeQueue === "critical" ? "Review Alert 🚨" : "Open Details →"}
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

      </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}

      {/* 2. Import All Test Results Modal */}
      {showImportAllModal && (
        <ImportAllResultsModal
          order={showImportAllModal}
          onClose={() => setShowImportAllModal(null)}
          onSaveAll={handleSaveAllBatch}
        />
      )}

      {/* 3. Complete Laboratory Report Modal */}
      {showCompleteReportModal && (
        <CompleteLabReportModal
          order={showCompleteReportModal}
          onClose={() => setShowCompleteReportModal(null)}
        />
      )}

      {/* 4. New Lab Order Modal */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-none shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Create Laboratory Order</h3>
                <p className="text-xs text-blue-200">
                  Dispatches new test request to Laboratory and Billing modules
                </p>
              </div>
              <button
                onClick={() => setShowNewOrderModal(false)}
                className="text-white hover:text-gray-200 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newOrderForm.patientName}
                  onChange={(e) =>
                    setNewOrderForm({ ...newOrderForm, patientName: e.target.value })
                  }
                  placeholder="e.g. Ramesh Chandra"
                  className="w-full text-xs px-3 py-2 border rounded-none border-gray-300"                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">
                    Patient ID / UMR
                  </label>
                  <input
                    type="text"
                    value={newOrderForm.umr}
                    onChange={(e) =>
                      setNewOrderForm({ ...newOrderForm, umr: e.target.value })
                    }
                    placeholder="PAT-xxxxx"
                    className="w-full text-xs px-3 py-2 border rounded-none border-gray-300"                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    value={newOrderForm.age}
                    onChange={(e) =>
                      setNewOrderForm({ ...newOrderForm, age: Number(e.target.value) })
                    }
                    className="w-full text-xs px-3 py-2 border rounded-none border-gray-300"                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">
                    Gender
                  </label>
                  <select
                    value={newOrderForm.sex}
                    onChange={(e) =>
                      setNewOrderForm({ ...newOrderForm, sex: e.target.value })
                    }
                    className="w-full text-xs px-3 py-2 border rounded-none border-gray-300 bg-white"                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">
                    Referring Doctor
                  </label>
                  <input
                    type="text"
                    value={newOrderForm.doctorName}
                    onChange={(e) =>
                      setNewOrderForm({ ...newOrderForm, doctorName: e.target.value })
                    }
                    className="w-full text-xs px-3 py-2 border rounded-none border-gray-300"                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={newOrderForm.department}
                    onChange={(e) =>
                      setNewOrderForm({ ...newOrderForm, department: e.target.value })
                    }
                    className="w-full text-xs px-3 py-2 border rounded-none border-gray-300"                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Select Investigations to Order
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-none p-2 space-y-1.5 bg-gray-50">                  {ALL_LAB_TESTS.slice(0, 25).map((test) => {
                    const isChecked = newOrderForm.selectedTests.includes(test.name)
                    return (
                      <label
                        key={test.id}
                        className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer hover:bg-white p-1 rounded-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewOrderForm({
                                ...newOrderForm,
                                selectedTests: [...newOrderForm.selectedTests, test.name],
                              })
                            } else {
                              setNewOrderForm({
                                ...newOrderForm,
                                selectedTests: newOrderForm.selectedTests.filter(
                                  (t) => t !== test.name
                                ),
                              })
                            }
                          }}
                        />
                        <span className="font-medium">{test.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono ml-auto">
                          ₹{test.price}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="bg-gray-50 -mx-6 -mb-6 p-4 border-t border-gray-200 flex items-center justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-none text-gray-700 hover:bg-gray-100 cursor-pointer"                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-none hover:bg-blue-700 shadow-sm cursor-pointer"                >
                  Create & Send to Billing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Test Catalog Pop-up Modal */}
      {showTestCatalogModal && (
        <TestCatalogModal
          onClose={() => {
            setShowTestCatalogModal(false)
            if (activeSubPage === "lab_catalog") {
              onNavigate?.("laboratory")
            }
          }}
        />
      )}

    </div>
  )
}
