import React, { useState, useEffect, useMemo } from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  FlaskConical,
  Microscope,
  Phone,
  Search,
  TrendingUp,
  User,
  Users,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react"
import { LabOrder, LabOrderDatabase } from "../../services/labOrdersDb"
import { LabLisService, SpecimenRecord, CriticalAlertRecord } from "../../services/labLisService"

interface LabDashboardViewProps {
  onNavigate: (module: string) => void
  onOpenOrder?: (order: LabOrder) => void
  initialOrders?: LabOrder[]
  initialSpecimens?: SpecimenRecord[]
  initialCriticalAlerts?: CriticalAlertRecord[]
}

export default function LabDashboardView({
  onNavigate,
  onOpenOrder,
  initialOrders,
  initialSpecimens,
  initialCriticalAlerts,
}: LabDashboardViewProps) {
  const [orders, setOrders] = useState<LabOrder[]>(initialOrders || [])
  const [specimens, setSpecimens] = useState<SpecimenRecord[]>(initialSpecimens || [])
  const [criticalAlerts, setCriticalAlerts] = useState<CriticalAlertRecord[]>(initialCriticalAlerts || [])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDept, setSelectedDept] = useState("All")
  const [selectedPriority, setSelectedPriority] = useState("All")
  const [selectedStatus, setSelectedStatus] = useState("All")

  const loadData = () => {
    setOrders(LabOrderDatabase.getOrders())
    setSpecimens(LabLisService.getSpecimens())
    setCriticalAlerts(LabLisService.getCriticalAlerts())
  }

  useEffect(() => {
    if (!initialOrders || initialOrders.length === 0) {
      loadData()
    }
    const unsub1 = LabOrderDatabase.subscribe(loadData)
    const unsub2 = LabLisService.subscribe(loadData)
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  useEffect(() => {
    if (initialOrders) setOrders(initialOrders)
    if (initialSpecimens) setSpecimens(initialSpecimens)
    if (initialCriticalAlerts) setCriticalAlerts(initialCriticalAlerts)
  }, [initialOrders, initialSpecimens, initialCriticalAlerts])

  // KPI Metrics Calculation
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0]
    const ordersToday = orders.filter((o) => o.createdAt?.startsWith(todayStr)).length
    const awaitingCollection = specimens.filter((s) => s.status === "Collection Pending").length
    const processingCount = orders.filter((o) => o.status === "In Progress" || o.status === "Sample Collected").length
    const awaitingReview = orders.filter((o) =>
      o.tests.some((t) => t.status === "Result Entered" || t.status === "In Progress") && o.status !== "Completed"
    ).length
    const releasedToday = orders.filter((o) => o.status === "Completed" && o.billing?.status === "Paid").length
    const activeCritical = criticalAlerts.filter((a) => a.status === "Active Alert" || a.status === "Escalated").length
    const overdueCount = orders.filter(
      (o) => o.status !== "Completed" && o.status !== "Cancelled" && o.tests.some((t) => t.urgency === "STAT")
    ).length

    return {
      ordersToday,
      awaitingCollection,
      processingCount,
      awaitingReview,
      releasedToday,
      activeCritical,
      overdueCount,
    }
  }, [orders, specimens, criticalAlerts])

  // Filtered Dashboard Worklist
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !searchQuery ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.umr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.tests.some((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchDept = selectedDept === "All" || o.department === selectedDept
      const matchPriority =
        selectedPriority === "All" ||
        (selectedPriority === "STAT" && o.tests.some((t) => t.urgency === "STAT")) ||
        (selectedPriority === "Routine" && o.tests.every((t) => t.urgency !== "STAT"))

      const matchStatus = selectedStatus === "All" || o.status === selectedStatus

      return matchSearch && matchDept && matchPriority && matchStatus
    })
  }, [orders, searchQuery, selectedDept, selectedPriority, selectedStatus])

  return (
    <div className="space-y-5">
      {/* ── 1. OPERATIONAL KPI SUMMARY CARDS ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          {
            label: "Orders Today",
            value: metrics.ordersToday,
            subtext: "Total Diagnostic Requests",
            icon: FileText,
            color: "text-[#7552B8]",
            bgColor: "bg-purple-50",
            border: "border-purple-200",
            action: () => onNavigate("lab_orders_collection"),
          },
          {
            label: "Awaiting Draw",
            value: metrics.awaitingCollection,
            subtext: "Phlebotomy Queue",
            icon: Clock,
            color: "text-amber-600",
            bgColor: "bg-amber-50",
            border: "border-amber-200",
            action: () => onNavigate("lab_orders_collection"),
          },
          {
            label: "Processing",
            value: metrics.processingCount,
            subtext: "Workbench Benches",
            icon: Microscope,
            color: "text-teal-600",
            bgColor: "bg-teal-50",
            border: "border-teal-200",
            action: () => onNavigate("lab_workbench"),
          },
          {
            label: "Awaiting Review",
            value: metrics.awaitingReview,
            subtext: "Pathologist Sign-off",
            icon: User,
            color: "text-indigo-600",
            bgColor: "bg-indigo-50",
            border: "border-indigo-200",
            action: () => onNavigate("lab_workbench"),
          },
          {
            label: "Reports Released",
            value: metrics.releasedToday,
            subtext: "Completed Diagnostics",
            icon: CheckCircle2,
            color: "text-emerald-600",
            bgColor: "bg-emerald-50",
            border: "border-emerald-200",
            action: () => onNavigate("lab_reports"),
          },
          {
            label: "Critical Alerts",
            value: metrics.activeCritical,
            subtext: "Immediate Panic Values",
            icon: AlertTriangle,
            color: "text-rose-600",
            bgColor: "bg-rose-50",
            border: "border-rose-300",
            action: () => onNavigate("lab_workbench"),
          },
          {
            label: "STAT Priority",
            value: metrics.overdueCount,
            subtext: "Fast-Track Turnaround",
            icon: Activity,
            color: "text-orange-600",
            bgColor: "bg-orange-50",
            border: "border-orange-200",
            action: () => onNavigate("lab_workbench"),
          },
        ].map((card, idx) => {
          const Icon = card.icon
          return (
            <button
              key={idx}
              onClick={card.action}
              className={`p-3.5 bg-white rounded-xl border ${card.border} hover:shadow-md transition-all text-left flex flex-col justify-between cursor-pointer group`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{card.label}</span>
                <div className={`p-1.5 rounded-lg ${card.bgColor} ${card.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-slate-900 group-hover:text-[#7552B8] transition-colors">
                  {card.value}
                </div>
                <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{card.subtext}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── 2. CRITICAL ALERTS BANNER (IF ACTIVE) ────────────────────────────── */}
      {criticalAlerts.filter((a) => a.status === "Active Alert").length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-rose-800 font-black text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
              <span>Critical Panic Limit Alerts Requiring Immediate Clinician Notification</span>
            </div>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
              Active Panic Limits
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {criticalAlerts
              .filter((a) => a.status === "Active Alert")
              .slice(0, 3)
              .map((alert) => (
                <div key={alert.id} className="bg-white p-3 rounded-lg border border-rose-200 text-xs shadow-2xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-slate-900">{alert.patientName}</span>
                      <span className="text-slate-400 font-mono text-[10px] ml-1.5">({alert.umr})</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
                      CRITICAL
                    </span>
                  </div>
                  <div className="mt-1 text-slate-700">
                    <span className="font-medium text-slate-900">{alert.testName}:</span>{" "}
                    <span className="font-mono font-bold text-rose-700">{alert.observedValue}</span>{" "}
                    <span className="text-slate-400 text-[10px]">({alert.panicLimits})</span>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Dr: {alert.orderingDoctor}</span>
                    <span className="text-[10px] font-semibold text-rose-600">
                      Immediate Notification Required
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── 3. DASHBOARD WORKLIST & BENCH QUEUE ──────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        {/* Toolbar Header */}
        <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-[#7552B8]" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Laboratory Operations Worklist</h3>
              <p className="text-[11px] text-slate-500">Live analytical diagnostic queue across clinical benches</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
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

            {/* Department filter */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg text-slate-700 focus:outline-none"
            >
              <option value="All">All Departments</option>
              <option value="Hematology">Hematology</option>
              <option value="Biochemistry">Biochemistry</option>
              <option value="Microbiology">Microbiology</option>
              <option value="Pathology">Pathology</option>
              <option value="Cardiology">Cardiology</option>
            </select>

            {/* Priority filter */}
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg text-slate-700 focus:outline-none"
            >
              <option value="All">All Priorities</option>
              <option value="STAT">STAT / Urgent</option>
              <option value="Routine">Routine</option>
            </select>

            {/* Status filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg text-slate-700 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Awaiting Billing">Awaiting Billing</option>
              <option value="Billed">Billed (Ready to Draw)</option>
              <option value="Sample Collected">Sample Collected</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>

            <button
              onClick={loadData}
              className="p-1.5 bg-white border border-[#E2E8F0] hover:bg-slate-100 rounded-lg text-slate-600 transition cursor-pointer"
              title="Refresh Queue"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/70 border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-4">Order ID & Date</th>
                <th className="py-2.5 px-4">Patient Demographics</th>
                <th className="py-2.5 px-4">Tests Ordered</th>
                <th className="py-2.5 px-4">Ordering Clinician</th>
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4">Billing</th>
                <th className="py-2.5 px-4">Lab Stage</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    No laboratory orders match your selected filters.
                  </td>
                </tr>
              ) : (
                filteredOrders.slice(0, 15).map((order) => {
                  const hasStat = order.tests.some((t) => t.urgency === "STAT")
                  const isPaid = order.billing?.status === "Paid"

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{order.id}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN") : "Today"}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{order.patientName}</div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {order.umr} · {order.age}y/{order.sex?.[0] || "M"}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 truncate">
                          {order.tests.map((t) => t.name).join(", ")}
                        </div>
                        <div className="text-[10px] text-slate-400">{order.tests.length} investigation(s)</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{order.doctorName}</div>
                        <div className="text-[10px] text-slate-400">{order.department}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            hasStat
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {hasStat ? "STAT" : "Routine"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {order.billing?.status || "Pending"}
                        </span>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">₹{order.billing?.total || 0}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            !isPaid
                              ? "bg-amber-50 text-amber-800 border-amber-300"
                              : order.status === "Completed"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : order.status === "In Progress"
                                ? "bg-teal-50 text-teal-700 border-teal-200"
                                : order.status === "Sample Collected"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {!isPaid ? "Awaiting Billing" : order.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {!isPaid ? (
                          <span
                            className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-default select-none"
                            title="Payment must be settled in the central Billing section"
                          >
                            Bill at Billing Section
                          </span>
                        ) : order.status === "Billed" ? (
                          <button
                            type="button"
                            onClick={() => onNavigate("lab_orders_collection")}
                            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-[#7552B8] border border-purple-200 text-xs font-bold rounded-lg transition cursor-pointer"
                          >
                            💉 Draw Sample
                          </button>
                        ) : order.status === "Completed" ? (
                          <button
                            type="button"
                            onClick={() => onNavigate("lab_reports")}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer"
                          >
                            📄 View Report
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenOrder) onOpenOrder(order)
                              else onNavigate("lab_workbench")
                            }}
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer"
                          >
                            🔬 Enter Results
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-[#E2E8F0] bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-800">{Math.min(15, filteredOrders.length)}</strong> of{" "}
            <strong className="text-slate-800">{filteredOrders.length}</strong> total active lab orders
          </span>
          <button
            onClick={() => onNavigate("lab_orders_collection")}
            className="text-[#7552B8] font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            View Complete Order Directory <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

