import React, { useState, useMemo, useEffect, useRef } from "react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Icon } from "./icons"
import {
  exportGenericReportPdf,
  printGenericReport,
} from "../utils/generalReportsExporter"
import { GeneralReportsService, DateRangePreset } from "../services/generalReportsDb"

export default function RevenueReports() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth")

  const reportData = useMemo(() => {
    return GeneralReportsService.getReportPayload("revenue_reports", {
      preset,
    })
  }, [preset])

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
    const mainEl = document.querySelector("main")
    if (mainEl) mainEl.scrollTop = 0
    window.scrollTo(0, 0)
  }, [])

  // Dynamic Chart Data from real transactions
  const revenueTrendData = useMemo(() => {
    const list = reportData?.charts?.revenueTrend || []
    return list.map((item: any) => ({
      month: item.date || item.period,
      revenue: item.revenue || 0,
      collections: item.collections || 0,
      transactions: item.transactions || 0,
    }))
  }, [reportData])

  const deptRevenueData = useMemo(() => {
    const list = reportData?.charts?.deptRevenue || []
    const palette = ["#1B4FD8", "#0284C7", "#0EA5E9", "#38BDF8", "#7DD3FC", "#10B981", "#6366F1"]
    return list.map((item: any, idx: number) => ({
      dept: item.department,
      revenue: item.amount || 0,
      count: item.count || 0,
      color: palette[idx % palette.length],
    }))
  }, [reportData])

  const paymentMethodsData = useMemo(() => {
    const list = reportData?.charts?.paymentMethods || []
    const palette = ["#10B981", "#F59E0B", "#1B4FD8", "#8B5CF6", "#EF4444", "#06B6D4"]
    return list.map((item: any, idx: number) => ({
      name: item.method || item.name,
      value: item.amount || 0,
      count: item.count || 0,
      color: palette[idx % palette.length],
    }))
  }, [reportData])

  const prepareExportData = () => {
    const records = (reportData.records || []).map((t: any) => ({
      dept: t.department || "General",
      revenue: `₹${(t.paidAmount || t.amount || 0).toLocaleString("en-IN")}`,
      insuranceShare: t.paymentMethod === "Insurance" ? `₹${(t.paidAmount || 0).toLocaleString("en-IN")}` : "₹0",
      settlement: t.paymentMethod || "Cash",
      status: t.paymentStatus || "Paid",
    }))

    return {
      reportTitle: "Revenue & Financial Reports",
      dateRangeLabel:
        preset === "today"
          ? "Today"
          : preset === "yesterday"
            ? "Yesterday"
            : preset === "last7"
              ? "Last 7 Days"
              : preset === "thisMonth"
                ? "This Month MTD"
                : preset === "lastMonth"
                  ? "Last Month"
                  : (preset as string) === "thisQuarter"
                    ? "This Quarter"
                    : "This Financial Year",
      departmentFilter: "All Departments",
      kpis: reportData.kpis
        ? reportData.kpis.map((k: any) => ({
            label: k.label,
            value: k.value,
            change: k.change,
          }))
        : [],
      columns: [
        { header: "Department / Specialty", key: "dept" },
        { header: "Gross Revenue", key: "revenue" },
        { header: "Insurance Share", key: "insuranceShare" },
        { header: "Settlement Method", key: "settlement" },
        { header: "Financial Status", key: "status" },
      ],
      records: records.length > 0 ? records : [
        { dept: "No records found in range", revenue: "₹0", insuranceShare: "₹0", settlement: "N/A", status: "None" }
      ],
    }
  }

  const handleExportPdf = () => {
    exportGenericReportPdf(prepareExportData())
  }

  const handlePrint = () => {
    printGenericReport(prepareExportData())
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col h-full bg-slate-50/50 overflow-y-auto">
      {/* Top Bar */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-6 py-5 flex flex-wrap items-center justify-between gap-3 flex-shrink-0 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
            Revenue &amp; Financial Reports
          </h1>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">
            Real-time multi-department revenue, payment settlement, and billing analytics (INR ₹).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as DateRangePreset)}
            className="border border-[#DDE2EC] rounded-lg bg-white text-[12px] font-semibold px-3 py-1.5 focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="thisMonth">This Month MTD</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisQuarter">This Quarter</option>
            <option value="thisYear">This Financial Year</option>
          </select>
          <button
            onClick={handlePrint}
            className="h-8 px-3.5 bg-white border border-[#CBD5E1] text-slate-700 text-[12px] font-semibold rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
          >
            <Icon.Printer /> Print Report
          </button>
          <button
            onClick={handleExportPdf}
            className="h-8 px-3.5 bg-[#1B4FD8] text-white text-[12px] font-semibold rounded-lg hover:bg-[#1740B4] transition-colors flex items-center gap-2 cursor-pointer shadow-2xs whitespace-nowrap"
          >
            <Icon.Download /> Export Financial PDF
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 w-full">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(reportData.kpis || []).map((stat: any, i: number) => (
            <div
              key={i}
              className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-2xs hover:shadow-md transition-all duration-300"
            >
              <div className="text-[12px] font-bold text-slate-500 mb-2 uppercase tracking-wide">
                {stat.label}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-black tracking-tight text-slate-900">
                    {stat.value}
                  </div>
                </div>
                {stat.change && (
                  <div
                    className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${
                      stat.change.startsWith("+")
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {stat.change}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Section 1: Full-Width Monthly Revenue Trend Area Chart */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-4 gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Hospital Revenue &amp; Collections Trend
              </h2>
              <p className="text-[12px] text-slate-500">
                Financial intake and collections across the selected period
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#1B4FD8] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full font-bold">
              INR (₹)
            </span>
          </div>

          <div className="h-80 w-full">
            {revenueTrendData.length > 0 && revenueTrendData.some((d: any) => d.revenue > 0 || d.collections > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrendData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1B4FD8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#1B4FD8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorCol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748B", fontWeight: 600 }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val: number) => `₹${val.toLocaleString("en-IN")}`}
                  />
                  <RechartsTooltip
                    formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, ""]}
                    contentStyle={{
                      borderRadius: 12,
                      fontSize: 12,
                      border: "1px solid #CBD5E1",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Gross Revenue"
                    stroke="#1B4FD8"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorRev)"
                  />
                  <Area
                    type="monotone"
                    dataKey="collections"
                    name="Settled Collections"
                    stroke="#0284C7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCol)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <p className="text-sm font-medium">No revenue transactions recorded for the selected period.</p>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Department Revenue & Payment Methods Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue by Department Bar Chart */}
          <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs flex flex-col">
            <div className="pb-4 border-b border-slate-100 mb-4">
              <h2 className="text-base font-bold text-slate-900">
                Department Revenue Contribution
              </h2>
              <p className="text-[12px] text-slate-500">
                Actual financial intake across hospital departments and pharmacies
              </p>
            </div>

            <div className="h-80 w-full">
              {deptRevenueData.length > 0 && deptRevenueData.some((d: any) => d.revenue > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptRevenueData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#64748B" }}
                      tickLine={false}
                      tickFormatter={(val: number) => `₹${val.toLocaleString("en-IN")}`}
                    />
                    <YAxis
                      dataKey="dept"
                      type="category"
                      tick={{ fontSize: 12, fill: "#1E293B", fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                      width={140}
                    />
                    <RechartsTooltip
                      formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, "Revenue"]}
                      contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #CBD5E1" }}
                    />
                    <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                      {deptRevenueData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <p className="text-sm font-medium">No department collections recorded in this period.</p>
                </div>
              )}
            </div>
          </div>

          {/* Payment Methods Donut Pie Chart */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs flex flex-col">
            <div className="pb-4 border-b border-slate-100 mb-4 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Payment Settlement Methods
                </h2>
                <p className="text-[12px] text-slate-500">
                  Distribution of Cash, Card, UPI, and Insurance
                </p>
              </div>
              <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Icon.Insurance />
              </span>
            </div>

            <div className="h-64 w-full relative">
              {paymentMethodsData.length > 0 && paymentMethodsData.some((p: any) => p.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentMethodsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {paymentMethodsData.map((entry: any, index: number) => (
                        <Cell key={`pie-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, "Amount"]}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <p className="text-sm font-medium">No settlements recorded in this period.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
