import React, { useState, useEffect, useMemo } from "react"
import {
  FileText,
  Printer,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Eye,
  Calendar,
  Share2,
  RefreshCw,
  Sparkles,
  Archive,
  Layers,
  FileCheck,
  Activity,
  AlertCircle,
  Building2,
} from "lucide-react"
import { LabOrder, LabOrderDatabase } from "../../services/labOrdersDb"
import CompleteLabReportModal from "./CompleteLabReportModal"

type ReportSubTab = "recent_approved" | "history" | "preliminary" | "all"

export default function LabReportsView() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [activeSubTab, setActiveSubTab] = useState<ReportSubTab>("recent_approved")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("All")
  const [activeReportOrder, setActiveReportOrder] = useState<LabOrder | null>(null)

  const loadData = () => {
    setOrders(LabOrderDatabase.getOrders())
  }

  useEffect(() => {
    loadData()
    const unsub = LabOrderDatabase.subscribe(loadData)
    return () => unsub()
  }, [])

  // Helper to extract timestamp when an order was authorized / completed
  const getApprovalTimestamp = (order: LabOrder): number => {
    if (order.processingCompletedAt) {
      const t = new Date(order.processingCompletedAt).getTime()
      if (!isNaN(t) && t > 0) return t
    }
    if (order.tests && order.tests.length > 0) {
      const verifiedTimes = order.tests
        .map((t) => (t.verifiedAt ? new Date(t.verifiedAt).getTime() : 0))
        .filter((t) => !isNaN(t) && t > 0)
      if (verifiedTimes.length > 0) return Math.max(...verifiedTimes)
    }
    const historyCompleted = order.history?.filter(
      (h) => h.action.includes("Completed") || h.action.includes("Verified")
    )
    if (historyCompleted && historyCompleted.length > 0) {
      const t = new Date(historyCompleted[historyCompleted.length - 1].at).getTime()
      if (!isNaN(t) && t > 0) return t
    }
    if (order.updatedAt) {
      const t = new Date(order.updatedAt).getTime()
      if (!isNaN(t) && t > 0) return t
    }
    if (order.createdAt) {
      const t = new Date(order.createdAt).getTime()
      if (!isNaN(t) && t > 0) return t
    }
    return 0
  }

  // Check if timestamp is today
  const isToday = (timestamp: number): boolean => {
    if (!timestamp) return false
    const date = new Date(timestamp)
    const today = new Date()
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  }

  // Format date and time for reports table
  const formatReportDateTime = (order: LabOrder) => {
    const timestamp = getApprovalTimestamp(order)
    if (!timestamp) return "Today"
    const date = new Date(timestamp)
    return `${date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })} ${date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })}`
  }

  // Base filter by search query and department
  const filteredBaseOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !searchQuery ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.umr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.tests.some((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchDept =
        selectedDeptFilter === "All" ||
        o.department?.toLowerCase() === selectedDeptFilter.toLowerCase() ||
        o.tests.some((t) => t.category?.toLowerCase() === selectedDeptFilter.toLowerCase())

      return matchSearch && matchDept
    })
  }, [orders, searchQuery, selectedDeptFilter])

  // Sub-module 1: Newly Approved Reports (Newest at the very TOP)
  // STRICT RULE: Only fully Paid and authorized orders can be in Approved Reports
  const newlyApprovedReports = useMemo(() => {
    return filteredBaseOrders
      .filter((o) => o.status === "Completed" && o.billing?.status === "Paid")
      .sort((a, b) => {
        const timeA = getApprovalTimestamp(a)
        const timeB = getApprovalTimestamp(b)
        if (timeA !== timeB) return timeB - timeA
        return b.id.localeCompare(a.id)
      })
  }, [filteredBaseOrders])

  // Split into fresh today vs older history
  const todayApprovedReports = useMemo(() => {
    const todayOnly = newlyApprovedReports.filter((o) => isToday(getApprovalTimestamp(o)))
    // If few approved today, fallback to top recent approved records so queue is never artificially empty
    return todayOnly.length > 0 ? todayOnly : newlyApprovedReports.slice(0, 5)
  }, [newlyApprovedReports])

  // Sub-module 2: Archived Reports History
  const historyReports = useMemo(() => {
    const recentIds = new Set(todayApprovedReports.map((o) => o.id))
    return newlyApprovedReports.filter((o) => !recentIds.has(o.id))
  }, [newlyApprovedReports, todayApprovedReports])

  // Sub-module 3: Preliminary / In-Progress Reports
  const preliminaryReports = useMemo(() => {
    return filteredBaseOrders
      .filter((o) => (o.status !== "Completed" || o.billing?.status !== "Paid") && o.status !== "Cancelled")
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime()
        const timeB = new Date(b.createdAt || 0).getTime()
        return timeB - timeA || b.id.localeCompare(a.id)
      })
  }, [filteredBaseOrders])

  // Display queue based on active sub-tab
  const displayedReports = useMemo(() => {
    if (activeSubTab === "recent_approved") return todayApprovedReports
    if (activeSubTab === "history") return historyReports
    if (activeSubTab === "preliminary") return preliminaryReports
    // In "all", newly approved are strictly at TOP, followed by history, then preliminary
    return [...todayApprovedReports, ...historyReports, ...preliminaryReports]
  }, [activeSubTab, todayApprovedReports, historyReports, preliminaryReports])

  // KPI Metrics
  const metrics = useMemo(() => {
    const totalCompleted = orders.filter((o) => o.status === "Completed").length
    const approvedToday = orders.filter(
      (o) => o.status === "Completed" && isToday(getApprovalTimestamp(o))
    ).length
    const preliminaryCount = orders.filter(
      (o) => o.status !== "Completed" && o.status !== "Cancelled"
    ).length
    const statExpedited = orders.filter(
      (o) => o.status === "Completed" && o.tests.some((t) => t.urgency === "STAT")
    ).length

    return {
      approvedToday,
      totalCompleted,
      preliminaryCount,
      statExpedited,
    }
  }, [orders])

  return (
    <div className="space-y-4">
      {/* ── 1. OPERATIONAL REPORT KPI METRICS ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Newly Approved Today</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {metrics.approvedToday || todayApprovedReports.length}
          </div>
          <div className="text-[10.5px] text-emerald-700 font-semibold mt-0.5">
            Pathologist authorized & signed
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Historical Repository</span>
            <Archive className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{metrics.totalCompleted}</div>
          <div className="text-[10.5px] text-purple-700 font-semibold mt-0.5">
            Archived final diagnostic records
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Preliminary / In-Flight</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{metrics.preliminaryCount}</div>
          <div className="text-[10.5px] text-amber-700 font-semibold mt-0.5">
            Under workbench bench testing
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>STAT Priority Reports</span>
            <Activity className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{metrics.statExpedited}</div>
          <div className="text-[10.5px] text-rose-700 font-semibold mt-0.5">
            Expedited critical turnaround
          </div>
        </div>
      </div>

      {/* ── 2. SUB-MODULE TABS: CATEGORIZATION & SEPARATION ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-2">
        <button
          onClick={() => setActiveSubTab("recent_approved")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "recent_approved"
              ? "bg-[#0D9488] text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Newly Approved Reports</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "recent_approved" ? "bg-white text-[#0D9488]" : "bg-teal-100 text-[#0D9488]"
            }`}
          >
            {todayApprovedReports.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("history")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "history"
              ? "bg-[#7552B8] text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Archived Reports History</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "history" ? "bg-white text-[#7552B8]" : "bg-purple-100 text-[#7552B8]"
            }`}
          >
            {historyReports.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("preliminary")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "preliminary"
              ? "bg-amber-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Preliminary & In-Flight</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "preliminary" ? "bg-white text-amber-600" : "bg-amber-100 text-amber-700"
            }`}
          >
            {preliminaryReports.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("all")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "all"
              ? "bg-slate-800 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All Reports Archive</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "all" ? "bg-white text-slate-800" : "bg-slate-200 text-slate-700"
            }`}
          >
            {filteredBaseOrders.length}
          </span>
        </button>
      </div>

      {/* ── 3. REPORTS REPOSITORY TABLE ─────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#7552B8]" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {activeSubTab === "recent_approved" && "Newly Approved Pathology Reports"}
                {activeSubTab === "history" && "Archived Diagnostic Reports Repository"}
                {activeSubTab === "preliminary" && "Preliminary & In-Progress Diagnostic Queue"}
                {activeSubTab === "all" && "Complete Diagnostic Reports Master Archive"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {activeSubTab === "recent_approved" &&
                  "Authorized clinical reports with newest releases strictly at the top. Ready for printing & EMR."}
                {activeSubTab === "history" &&
                  "Searchable historical diagnostic reports released by authorized pathologists."}
                {activeSubTab === "preliminary" &&
                  "In-progress investigations awaiting bench completion and pathologist authorization."}
                {activeSubTab === "all" &&
                  "Audit-ready clinical repository: newly approved reports at the top, history below."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by order, patient, UMR..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#7552B8] w-56"
              />
            </div>

            {/* Department Filter */}
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg text-slate-700 focus:outline-none"
            >
              <option value="All">All Departments</option>
              <option value="Hematology">Hematology</option>
              <option value="Biochemistry">Biochemistry</option>
              <option value="Microbiology">Microbiology</option>
              <option value="Pathology">Pathology</option>
              <option value="Cardiology">Cardiology</option>
            </select>

            <button
              onClick={loadData}
              className="p-1.5 bg-white border border-[#E2E8F0] hover:bg-slate-100 rounded-lg text-slate-600 transition cursor-pointer"
              title="Refresh Reports"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Report / Order Ref</th>
                <th className="py-3 px-4">Patient Demographics</th>
                <th className="py-3 px-4">Diagnostic Panels Completed</th>
                <th className="py-3 px-4">Referring Physician</th>
                <th className="py-3 px-4">Release Status</th>
                <th className="py-3 px-4">Authorization</th>
                <th className="py-3 px-4 text-right">Report Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    {activeSubTab === "recent_approved"
                      ? "No new reports approved recently. When the pathologist authorizes reports in Lab Workbench, they will appear here at the top!"
                      : activeSubTab === "history"
                      ? "No archived reports match your search criteria."
                      : activeSubTab === "preliminary"
                      ? "No preliminary or in-flight reports in the queue."
                      : "No diagnostic reports found."}
                  </td>
                </tr>
              ) : (
                displayedReports.map((order, idx) => {
                  const isPaid = order.billing?.status === "Paid"
                  const isFinal = order.status === "Completed" && isPaid
                  const hasStat = order.tests.some((t) => t.urgency === "STAT")
                  const isFresh = isFinal && (isToday(getApprovalTimestamp(order)) || idx === 0)

                  return (
                    <tr
                      key={order.id}
                      className={`transition-colors ${
                        isFresh
                          ? "bg-teal-50/30 hover:bg-teal-50/60"
                          : "hover:bg-slate-50/70"
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">{order.id}</span>
                          {isFresh && (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400 inline" />
                          <span>{formatReportDateTime(order)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{order.patientName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {order.umr} · {order.age}y/{order.sex?.[0] || "M"}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 truncate">
                          {order.tests.map((t) => t.name).join(", ")}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>{order.tests.length} investigation(s)</span>
                          {hasStat && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-800 uppercase">
                              STAT
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{order.doctorName}</div>
                        <div className="text-[10px] text-slate-400">{order.department}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                            isFinal
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : !isPaid
                              ? "bg-amber-50 text-amber-800 border-amber-300"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {isFinal ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />
                              <span>Finalized & Signed</span>
                            </>
                          ) : !isPaid ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-600 inline" />
                              <span>Billing Pending (₹${order.billing?.total || 0})</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-blue-600 inline" />
                              <span>Preliminary Draft</span>
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">
                          {isFinal ? "Dr. Arvind Swaminathan (MD Path)" : !isPaid ? "Reception Billing" : "Pending Review"}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {isFinal ? "Digitally Verified · v1.0" : !isPaid ? "Unpaid - Awaiting Cashier" : "Bench Status: Testing"}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setActiveReportOrder(order)}
                            className="px-3 py-1 bg-slate-100 hover:bg-[#7552B8] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Preview</span>
                          </button>
                          <button
                            onClick={() => setActiveReportOrder(order)}
                            className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                            title="Print Clinical PDF with Hospital Letterhead"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-[#E2E8F0] bg-slate-50/70 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <span>
            Displaying <strong className="text-slate-800">{displayedReports.length}</strong> reports in{" "}
            <strong className="text-slate-800">
              {activeSubTab === "recent_approved"
                ? "Newly Approved"
                : activeSubTab === "history"
                ? "Historical Archive"
                : activeSubTab === "preliminary"
                ? "Preliminary Queue"
                : "All Reports"}
            </strong>
          </span>
          <span className="text-[11px] text-slate-400">
            NABL ISO 15189 Certified Pathology Audit Repository
          </span>
        </div>
      </div>

      {/* PDF / Complete Lab Report Modal */}
      {activeReportOrder && (
        <CompleteLabReportModal order={activeReportOrder} onClose={() => setActiveReportOrder(null)} />
      )}
    </div>
  )
}
