import { usePharmacyData } from "../data/usePharmacyData"
import { useState, useEffect, useMemo } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  ShoppingCart,
  ClipboardList,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Package,
  IndianRupee,
  RefreshCcw,
  BarChart3,
  ArrowRight,
  Trash2,
} from "lucide-react"
import { PharmacyDatabase, isAwaitingVerification } from "../../../services/pharmacyDb"
import { toast } from "react-hot-toast"

import StatusBadge from "../components/StatusBadge"
import PageHeader from "../components/PageHeader"

const quickActions = [
  {
    label: "New Sale",
    icon: ShoppingCart,
    color: "#0F766E",
    page: "dispensing",
  },
  {
    label: "Prescription Queue",
    icon: ClipboardList,
    color: "#059669",
    page: "prescriptions",
  },
  { label: "Receive Stock", icon: Package, color: "#D97706", page: "grn" },
  {
    label: "Check Stock",
    icon: AlertTriangle,
    color: "#dc2626",
    page: "expiry-low-stock",
  },
  {
    label: "Write-Off Stock",
    icon: Trash2,
    color: "#be123c",
    page: "write-off",
  },
  {
    label: "Generate Report",
    icon: BarChart3,
    color: "#0284c7",
    page: "reports",
  },
]

interface DashboardProps {
  onNavigate: (page: string) => void
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const {
    prescriptions,
    medicines,
    expiringMedicines,
    bills,
    supplierReturns,
    returns,
    refresh,
  } = usePharmacyData()
  const [chartView, setChartView] = useState<"weekly" | "monthly">("weekly")
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  )

  // Dynamically generate chart data ending on selectedDate (7 days for weekly, 30 days for monthly)
  const numDays = chartView === "monthly" ? 30 : 7
  const chartDays = Array.from({ length: numDays }).map((_, i) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - (numDays - 1 - i))
    return d.toISOString().split("T")[0]
  })

  const chartData = chartDays.map((dateStr) => {
    const dayBills = bills.filter(
      (b) =>
        (b.billDate || "").startsWith(dateStr) &&
        !b.isModifiedReturnBill &&
        !b.billNumber?.startsWith("MOD-"),
    )
    const dayReturns = returns.filter((r) =>
      (r.createdAt || "").startsWith(dateStr),
    )
    const dayGross = dayBills.reduce((acc, b) => acc + (b.totalAmount || 0), 0)
    const dayRefunds = dayReturns.reduce(
      (acc, r) => acc + (r.refundAmount || 0),
      0,
    )
    const dayNet = Math.max(0, dayGross - dayRefunds)

    // Number of active bills (bills that were not completely returned)
    const activeBillsCount = dayBills.filter((b) => {
      const bReturns = PharmacyDatabase.getReturnsForBill(b.billNumber)
      const bRefund = bReturns.reduce((s, r) => s + (r.refundAmount || 0), 0)
      return (b.totalAmount || 0) > bRefund
    }).length

    const dateLabel =
      chartView === "monthly"
        ? new Date(dateStr).toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
          })
        : new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" })

    return {
      date: dateLabel,
      revenue: dayNet, // Actual net sales after deducting returns
      gross: dayGross,
      refunds: dayRefunds,
      orders: activeBillsCount,
      totalOrders: dayBills.length,
    }
  })

  // Total Sales across period (reflects actual sales after returns)
  const totalSales = chartData.reduce((sum, d) => sum + (d.revenue || 0), 0)
  const totalOrders = chartData.reduce((sum, d) => sum + d.orders, 0)
  const avgSales = chartData.length > 0 ? totalSales / chartData.length : 0

  // Selected Date specific metric (Total sales after returns for selected date)
  const selectedDateStats = chartData[chartData.length - 1]
  const selectedDateNet = selectedDateStats?.revenue || 0

  const selectedDatePrescriptions = prescriptions.filter(
    (p) =>
      (p.date || "").startsWith(selectedDate) ||
      (p.createdAt || "").startsWith(selectedDate),
  )

  const pendingPrescriptions = prescriptions.filter((p) =>
    isAwaitingVerification((p as any).status) ||
    p.status === "pending" ||
    (p as any).status === "Sent To Pharmacy",
  )

  const queuePrescriptions = useMemo(() => {
    const list: typeof prescriptions = []
    const seen = new Set<string>()

    // Pending prescriptions first (newest pending first)
    pendingPrescriptions.forEach((p) => {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        list.push(p)
      }
    })

    // Today's / selected date prescriptions
    selectedDatePrescriptions.forEach((p) => {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        list.push(p)
      }
    })

    // Fallback if none in current filter
    if (list.length === 0) {
      prescriptions.slice(0, 5).forEach((p) => {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          list.push(p)
        }
      })
    }

    return list.slice(0, 5)
  }, [prescriptions, pendingPrescriptions, selectedDatePrescriptions])

  const isToday = selectedDate === new Date().toISOString().split("T")[0]

  const kpis = [
    {
      title: isToday ? "Today's Total Sales" : "Selected Date Total Sales",
      value: `₹${selectedDateNet.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: selectedDateStats?.refunds && selectedDateStats.refunds > 0
        ? `${selectedDateStats.orders} Active (${selectedDateStats.totalOrders - selectedDateStats.orders} Returned)`
        : `${selectedDateStats?.orders || 0} Bills`,
      up: selectedDateNet > 0,
      sub: selectedDateStats?.refunds && selectedDateStats.refunds > 0
        ? `₹${(selectedDateStats.gross || 0).toLocaleString("en-IN")} sales - ₹${(selectedDateStats.refunds || 0).toLocaleString("en-IN")} ret.`
        : "Total pharmacy sales",
      icon: ShoppingCart,
      color: "#0F766E",
      borderColor: "#0F766E",
      bg: "#E8EDF5",
      page: "dispensing",
    },
    {
      title: "Prescription Queue",
      value: pendingPrescriptions.length.toString(),
      change: `${pendingPrescriptions.length} Pending`,
      up: true,
      sub: `${selectedDatePrescriptions.length} issued today · ${pendingPrescriptions.length} in queue`,
      icon: ClipboardList,
      color: "#10B981",
      borderColor: "#10B981",
      bg: "#DCFCE7",
      page: "prescriptions",
    },
    {
      title: "Low Stock Items",
      value: medicines
        .filter((m) => m.stock < m.reorderLevel)
        .length.toString(),
      change: "Alert",
      up: false,
      sub: "Requires attention",
      icon: AlertTriangle,
      color: "#F59E0B",
      borderColor: "#F59E0B",
      bg: "#FEF3C7",
      page: "expiry-low-stock",
    },
    {
      title: "Expiring Soon",
      value: expiringMedicines.length.toString(),
      change: "Within 30d",
      up: false,
      sub: "Within 30 days",
      icon: Clock,
      color: "#EF4444",
      borderColor: "#EF4444",
      bg: "#FEE2E2",
      page: "expiry-low-stock",
    },
  ]

  const stockDistribution = [
    {
      name: "In Stock",
      value: medicines.filter((m) => m.stock >= m.reorderLevel).length,
      color: "#16A34A",
    },
    {
      name: "Low Stock",
      value: medicines.filter((m) => m.stock > 0 && m.stock < m.reorderLevel)
        .length,
      color: "#f59e0b",
    },
    {
      name: "Out of Stock",
      value: medicines.filter((m) => m.stock === 0).length,
      color: "#ef4444",
    },
    {
      name: "Expiring Soon",
      value: expiringMedicines.length,
      color: "#D97706",
    },
  ]

  // 1. Supplier Returns (Procurement Debit Notes to Vendors)
  const currentMonthSupplierReturns = supplierReturns.filter(
    (r) =>
      r.createdAt && new Date(r.createdAt).getMonth() === new Date().getMonth(),
  )
  const supplierReturnsThisMonth = currentMonthSupplierReturns.reduce(
    (acc, curr) => acc + (curr.returnAmount || 0),
    0,
  )
  const totalSupplierReturnsAmount = supplierReturns.reduce(
    (acc, curr) => acc + (curr.returnAmount || 0),
    0,
  )
  const expiredStockReturnedUnits = supplierReturns
    .filter((r) => (r.reason || "").toLowerCase().includes("expired"))
    .reduce((acc, curr) => acc + (curr.quantity || 0), 0)

  // 2. Patient Returns (Sales Returns / Counter Refunds)
  const currentMonthPatientReturns = returns.filter(
    (r) =>
      r.createdAt && new Date(r.createdAt).getMonth() === new Date().getMonth(),
  )
  const patientReturnsThisMonth = currentMonthPatientReturns.reduce(
    (acc, curr) => acc + (curr.refundAmount || 0),
    0,
  )
  const totalPatientReturnsAmount = returns.reduce(
    (acc, curr) => acc + (curr.refundAmount || 0),
    0,
  )

  const returnKpis = [
    {
      title: "Total Patient Returns",
      value: `₹${totalPatientReturnsAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${returns.length} patient returns refunded (${patientReturnsThisMonth > 0 ? `₹${patientReturnsThisMonth.toLocaleString("en-IN")} this mo.` : "Sales counter refunds"})`,
      icon: RefreshCcw,
      color: "#D97706",
      bg: "#FEF3C7",
      page: "sales-returns",
    },
    {
      title: "Total Supplier Returns",
      value: `₹${totalSupplierReturnsAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `${supplierReturns.length} vendor debit notes (${supplierReturnsThisMonth > 0 ? `₹${supplierReturnsThisMonth.toLocaleString("en-IN")} this mo.` : "Procurement debit notes"})`,
      icon: IndianRupee,
      color: "#0F766E",
      bg: "#E0F2FE",
      page: "supplier-returns",
    },
    {
      title: "Expired Stock Returned",
      value: `${expiredStockReturnedUnits} Units`,
      sub: "Stock returned to vendors",
      icon: Package,
      color: "#DC2626",
      bg: "#FEE2E2",
      page: "supplier-returns",
    },
  ]

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full font-sans text-[#0F1624]">
      <PageHeader
        title="Pharmacy Dashboard"
        description={`Here's what's happening in your pharmacy today – ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        actions={
          <>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-[#DDE2EC] bg-white text-[#334155] focus:border-[#1B4FD8] focus:outline-none"
            />
            <button
              onClick={() => onNavigate("dispensing")}
              className="px-3.5 py-1.5 rounded-md text-white text-xs font-medium flex items-center gap-1.5 bg-[#1B4FD8] hover:bg-[#1541B0] shadow-2xs transition-colors"
            >
              <ShoppingCart size={14} /> New Sale
            </button>
            <button
              onClick={() => onNavigate("prescriptions")}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium border border-[#DDE2EC] bg-white text-[#334155] hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
            >
              <ClipboardList size={14} /> Scan Prescription
            </button>
          </>
        }
      />

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.title}
            onClick={() => onNavigate(kpi.page)}
            className="bg-white rounded-xl p-5 shadow-sm border border-[#E2E8F0] border-t-2 hover:shadow-md transition-all text-left w-full group relative overflow-hidden"
            style={{ borderTopColor: kpi.borderColor }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[12px] text-[#64748B] font-medium">
                  {kpi.title}
                </p>
                <p className="text-[26px] font-bold text-[#0F1624] mt-1 leading-none tracking-tight">
                  {kpi.value}
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: kpi.bg }}
              >
                <kpi.icon size={18} style={{ color: kpi.color }} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[12px]">
              {kpi.up ? (
                <TrendingUp size={13} className="text-emerald-500" />
              ) : (
                <TrendingDown size={13} className="text-red-500" />
              )}
              <span
                className="font-semibold"
                style={{ color: kpi.up ? "#15803d" : "#b91c1c" }}
              >
                {kpi.change}
              </span>
              <span className="text-[#94A3B8]">{kpi.sub}</span>
            </div>
          </button>
        ))}
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {returnKpis.map((kpi) => (
          <button
            key={kpi.title}
            onClick={() => onNavigate(kpi.page)}
            className="bg-white rounded-xl p-5 shadow-sm border border-[#E2E8F0] hover:shadow-md transition-all text-left w-full group"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[12px] text-[#64748B] font-medium">
                  {kpi.title}
                </p>
                <p className="text-[22px] font-bold text-[#0F1624] mt-1 leading-none tracking-tight">
                  {kpi.value}
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: kpi.bg }}
              >
                <kpi.icon size={18} style={{ color: kpi.color }} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-[#E2E8F0] border-t-2 border-t-[#0F766E] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-bold text-[#134E4A]">
                Sales Overview
              </h2>
              <p className="text-[12px] text-[#64748B]">
                Revenue and transaction trends
              </p>
            </div>
            <div className="flex rounded-full bg-[#F1F5F9] p-0.5 border border-[#E2E8F0] text-[12px]">
              {(["weekly", "monthly"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setChartView(v)}
                  className={`px-3.5 py-1 font-medium rounded-full transition-all ${
                    chartView === v
                      ? "bg-[#0F766E] text-white shadow-xs"
                      : "text-[#64748B] hover:text-[#0F1624]"
                  }`}
                >
                  {v === "weekly" ? "This Week" : "Monthly"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-[#F0F2F5]">
            <div>
              <p className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                TOTAL SALES
              </p>
              <p className="text-[19px] font-bold text-[#0F1624]">
                ₹
                {totalSales.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                AVG / DAY
              </p>
              <p className="text-[19px] font-bold text-[#0F1624]">
                ₹
                {avgSales.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                TRANSACTIONS
              </p>
              <p className="text-[19px] font-bold text-[#0F1624]">
                {totalOrders}
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0F766E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0F766E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="#F1F5F9"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => [
                  `₹${Number(v ?? 0).toLocaleString("en-IN")}`,
                  "Sales",
                ]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #E2E8F0",
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#0F766E"
                strokeWidth={2}
                fill="url(#salesGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stock Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
          <h2 className="text-[16px] font-bold text-[#0F1624] mb-1">
            Stock Summary
          </h2>
          <p className="text-[12px] text-[#64748B] mb-4">Total: {medicines.length} medicines</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={stockDistribution}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {stockDistribution.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, name) => [v as number, name as string]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {stockDistribution.map((d) => (
              <div
                key={d.name}
                className="flex items-center justify-between text-[12px]"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded"
                    style={{ background: d.color }}
                  />
                  <span className="text-[#64748B]">{d.name}</span>
                </div>
                <span className="font-semibold text-[#0F1624]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
          <h2 className="text-[15px] font-semibold text-[#0F1624] mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={() => onNavigate(a.page)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[#CCFBF1] bg-[#F0FDFA] hover:border-[#0F766E] hover:bg-[#CCFBF1] shadow-xs hover:shadow-sm transition-all text-center group"
              >
                <div
                  className="w-9 h-9 rounded flex items-center justify-center"
                  style={{ background: `${a.color}15` }}
                >
                  <a.icon size={16} style={{ color: a.color }} />
                </div>
                <span className="text-[11px] font-medium text-[#334155] group-hover:text-[#0F766E] transition-colors leading-tight">
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Prescription Queue */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F2F5]">
            <h2 className="text-[15px] font-semibold text-[#0F1624]">
              Prescription Queue
            </h2>
            <button
              onClick={() => onNavigate("prescriptions")}
              className="text-[12px] font-medium flex items-center gap-1 text-[#0F766E] hover:underline"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Prescription ID
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Patient
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Doctor
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Items
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Status
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Time
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D1FAE5]">
              {queuePrescriptions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-6 text-[#64748B] text-[13px]"
                  >
                    No incoming prescriptions in queue.
                  </td>
                </tr>
              ) : (
                queuePrescriptions.map((rx) => (
                  <tr
                    className="hover:bg-[#F0FDFA] transition-colors cursor-pointer"
                    key={rx.id}
                    onClick={() => {
                      localStorage.setItem("_v2_pharmacy_dispense_rx", rx.id)
                      onNavigate("dispensing")
                    }}
                  >
                    <td className="font-mono text-[12px] text-[#0F766E] font-medium py-3 px-4">
                      {rx.id}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#0F1624] text-[13px]">
                        {rx.patient}
                      </p>
                      <p className="text-[11px] text-[#94A3B8]">
                        {rx.age}y · {rx.gender}
                      </p>
                    </td>
                    <td className="text-[13px] text-[#334155] py-3 px-4">
                      {rx.doctor}
                    </td>
                    <td className="text-[13px] font-medium text-center py-3 px-4">
                      {rx.items}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={rx.status} size="sm" />
                    </td>
                    <td className="text-[12px] text-[#94A3B8] py-3 px-4">
                      {rx.time || rx.arrivalTime || "Just now"}
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.setItem("_v2_pharmacy_dispense_rx", rx.id)
                            onNavigate("dispensing")
                          }}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded bg-[#0F766E] text-white hover:bg-[#0D655E] transition-colors shadow-2xs"
                        >
                          Dispense
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigate("prescriptions")}
                          className="text-[11px] font-medium px-2 py-1 rounded border border-[#E2E8F0] text-[#334155] hover:bg-[#F0F2F5] transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low Stock */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F2F5]">
            <h2 className="text-[15px] font-semibold text-[#0F1624]">
              Low Stock Medicines
            </h2>
            <button
              onClick={() => onNavigate("expiry-low-stock")}
              className="text-[12px] font-medium text-[#0F766E] hover:underline"
            >
              View all
            </button>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Medicine
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Stock
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Reorder Level
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D1FAE5]">
              {medicines
                .filter((m) => m.stock < m.reorderLevel && m.stock > 0)
                .slice(0, 5)
                .map((m) => (
                  <tr
                    className="hover:bg-[#F0FDFA] transition-colors"
                    key={m.id}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#0F1624] text-[13px]">
                        {m.name}
                      </p>
                      <p className="text-[11px] text-[#94A3B8]">
                        {m.manufacturer}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="font-semibold text-[13px]"
                        style={{
                          color: m.stock < 20 ? "#dc2626" : "#D97706",
                        }}
                      >
                        {m.stock}
                      </span>
                    </td>
                    <td className="text-[13px] text-[#64748B] py-3 px-4">
                      {m.reorderLevel}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => onNavigate("ocr")}
                        className="text-[11px] font-medium px-2 py-1 rounded bg-[#E8EDF5] text-[#0F766E] hover:bg-[#DDE2EC] transition-colors"
                      >
                        Inward
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Expiring Medicines */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F2F5]">
            <h2 className="text-[15px] font-semibold text-[#0F1624]">
              Expiring Soon
            </h2>
            <button
              onClick={() => onNavigate("expiry-low-stock")}
              className="text-[12px] font-medium text-[#0F766E] hover:underline"
            >
              View all
            </button>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Medicine
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Batch
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Expiry
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Days Left
                </th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D1FAE5]">
              {expiringMedicines.map((m) => {
                const urgency =
                  m.daysLeft <= 15
                    ? "#dc2626"
                    : m.daysLeft <= 30
                      ? "#D97706"
                      : "#64748B"
                return (
                  <tr
                    className="hover:bg-[#F0FDFA] transition-colors"
                    key={m.id}
                  >
                    <td className="font-medium text-[13px] text-[#0F1624] py-3 px-4">
                      {m.medicine}
                    </td>
                    <td className="font-mono text-[12px] text-[#64748B] py-3 px-4">
                      {m.batch}
                    </td>
                    <td className="text-[12px] text-[#64748B] py-3 px-4">
                      {m.expiry}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="font-bold text-[13px]"
                        style={{ color: urgency }}
                      >
                        {m.daysLeft}d
                      </span>
                    </td>
                    <td className="text-[13px] text-[#334155] py-3 px-4">
                      {m.quantity}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
