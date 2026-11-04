import React, { useState, useEffect, useMemo } from "react"
import {
  LabOrder,
  LabOrderTest,
  LabOrderDatabase,
} from "../../services/labOrdersDb"
import { findTestDefinition } from "./labCatalogueSchema"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface LaboratoryAnalyticsProps {
  technician?: string
}

const DEPARTMENTS = [
  "HEMATOLOGY",
  "BIOCHEMISTRY",
  "PATHOLOGY",
  "MICROBIOLOGY",
  "IMMUNOLOGY",
  "THYROID FUNCTION",
  "SPECIAL TESTS",
]

const COLORS = [
  "#2563EB", // Blue
  "#059669", // Emerald
  "#D97706", // Amber
  "#DC2626", // Red
  "#7C3AED", // Violet
  "#0891B2", // Cyan
  "#475569", // Slate
]

function parseTatMinutes(targetTatStr?: string): number | null {
  if (!targetTatStr) return null
  const s = targetTatStr.toLowerCase().trim()
  const matchHours = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)/i)
  if (matchHours) return parseFloat(matchHours[1]) * 60
  const matchMins = s.match(/(\d+(?:\.\d+)?)\s*(?:min|m)/i)
  if (matchMins) return parseFloat(matchMins[1])
  const matchDays = s.match(/(\d+(?:\.\d+)?)\s*(?:day|d)/i)
  if (matchDays) return parseFloat(matchDays[1]) * 1440
  return null
}

function formatDuration(minutes: number): string {
  if (isNaN(minutes) || minutes <= 0) return "0 mins"
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const hrs = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

export default function LaboratoryAnalytics({
  technician = "Laboratory Specialist",
}: LaboratoryAnalyticsProps) {
  const [tick, setTick] = useState(0)
  const [timeRange, setTimeRange] = useState<"today" | "7days" | "30days" | "all">("30days")
  const [selectedDept, setSelectedDept] = useState("all")

  // Subscribe to DB changes
  useEffect(() => {
    return LabOrderDatabase.subscribe(() => setTick((t) => t + 1))
  }, [])

  const allOrders = useMemo(() => {
    return LabOrderDatabase.getOrders()
  }, [tick])

  // Filter orders by time range
  const filteredOrders = useMemo(() => {
    const now = new Date()
    return allOrders.filter((order) => {
      const created = new Date(order.createdAt)
      if (timeRange === "today") {
        return (
          created.getDate() === now.getDate() &&
          created.getMonth() === now.getMonth() &&
          created.getFullYear() === now.getFullYear()
        )
      }
      if (timeRange === "7days") {
        const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
        return diffDays <= 7
      }
      if (timeRange === "30days") {
        const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
        return diffDays <= 30
      }
      return true
    })
  }, [allOrders, timeRange])

  // Flatten tests
  const allTests = useMemo(() => {
    const list: { order: LabOrder; test: LabOrderTest }[] = []
    filteredOrders.forEach((order) => {
      order.tests.forEach((test) => {
        if (selectedDept !== "all") {
          const cat = (test.category || "PATHOLOGY").toUpperCase()
          if (!cat.includes(selectedDept) && !selectedDept.includes(cat)) return
        }
        list.push({ order, test })
      })
    })
    return list
  }, [filteredOrders, selectedDept])

  // Core KPIs
  const kpis = useMemo(() => {
    const now = new Date()
    const todayTests = allOrders.reduce((acc, order) => {
      const d = new Date(order.createdAt)
      if (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      ) {
        return acc + order.tests.length
      }
      return acc
    }, 0)

    const thisMonthTests = allOrders.reduce((acc, order) => {
      const d = new Date(order.createdAt)
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        return acc + order.tests.length
      }
      return acc
    }, 0)

    // Calculate TAT on tests with valid timestamps
    let totalTatMins = 0
    let validTatCount = 0
    let withinTargetCount = 0

    allTests.forEach(({ test }) => {
      if (test.processingStartedAt && test.processingCompletedAt) {
        const start = new Date(test.processingStartedAt).getTime()
        const end = new Date(test.processingCompletedAt).getTime()
        if (end >= start) {
          const diffMins = (end - start) / (1000 * 60)
          totalTatMins += diffMins
          validTatCount++

          const def = findTestDefinition(test.name)
          const targetMins = parseTatMinutes(def?.turnaroundTime)
          if (targetMins !== null) {
            if (diffMins <= targetMins) {
              withinTargetCount++
            }
          } else {
            withinTargetCount++ // default compliant if no target defined
          }
        }
      }
    })

    const avgTatMins = validTatCount > 0 ? totalTatMins / validTatCount : null
    const withinTatPct =
      validTatCount > 0 ? Math.round((withinTargetCount / validTatCount) * 100) : null

    // Critical results
    const criticalCount = allTests.filter(
      ({ test }) =>
        test.flag === "Critical" ||
        Object.values(test.results || {}).some((r) => r.flag === "Critical")
    ).length

    // Verified reports
    const verifiedReports = filteredOrders.filter(
      (o) =>
        o.status === "Completed" ||
        (o.tests.length > 0 &&
          o.tests.every((t) => t.status === "Completed" || t.status === "Verified"))
    ).length

    return {
      todayTests,
      thisMonthTests,
      avgTatMins,
      withinTatPct,
      criticalCount,
      verifiedReports,
      totalOrders: filteredOrders.length,
      totalTests: allTests.length,
    }
  }, [allOrders, filteredOrders, allTests])

  // Test Volume Over Time Chart Data
  const volumeTrendData = useMemo(() => {
    const dateMap = new Map<string, number>()

    filteredOrders.forEach((o) => {
      const d = new Date(o.createdAt)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      dateMap.set(key, (dateMap.get(key) || 0) + o.tests.length)
    })

    const sortedEntries = Array.from(dateMap.entries()).sort((a, b) => {
      return a[0].localeCompare(b[0])
    })

    return sortedEntries.map(([date, count]) => ({ date, tests: count }))
  }, [filteredOrders])

  // Department-wise Distribution Data
  const departmentData = useMemo(() => {
    const deptMap = new Map<string, number>()

    allTests.forEach(({ test }) => {
      const rawCat = (test.category || "PATHOLOGY").toUpperCase()
      let mapped = "OTHER SPECIAL"
      for (const d of DEPARTMENTS) {
        if (rawCat.includes(d) || d.includes(rawCat)) {
          mapped = d
          break
        }
      }
      deptMap.set(mapped, (deptMap.get(mapped) || 0) + 1)
    })

    const total = allTests.length || 1
    return Array.from(deptMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
  }, [allTests])

  // Status Distribution Data
  const statusDistributionData = useMemo(() => {
    const counts = {
      Pending: 0,
      "Sample Collected": 0,
      Processing: 0,
      "Result Entered": 0,
      Verified: 0,
      Completed: 0,
    }

    allTests.forEach(({ test }) => {
      if (test.status in counts) {
        counts[test.status as keyof typeof counts]++
      } else {
        counts.Pending++
      }
    })

    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [allTests])

  // Test-wise Analytics Table Data
  const testWiseTable = useMemo(() => {
    const testMap = new Map<
      string,
      {
        name: string
        department: string
        orders: number
        completed: number
        verified: number
        critical: number
        totalTat: number
        tatCount: number
        withinTarget: number
      }
    >()

    allTests.forEach(({ test }) => {
      const entry = testMap.get(test.name) || {
        name: test.name,
        department: test.category || "PATHOLOGY",
        orders: 0,
        completed: 0,
        verified: 0,
        critical: 0,
        totalTat: 0,
        tatCount: 0,
        withinTarget: 0,
      }

      entry.orders++
      if (test.status === "Completed") entry.completed++
      if (test.status === "Verified" || test.verifier) entry.verified++
      if (
        test.flag === "Critical" ||
        Object.values(test.results || {}).some((r) => r.flag === "Critical")
      ) {
        entry.critical++
      }

      if (test.processingStartedAt && test.processingCompletedAt) {
        const s = new Date(test.processingStartedAt).getTime()
        const e = new Date(test.processingCompletedAt).getTime()
        if (e >= s) {
          const diff = (e - s) / (1000 * 60)
          entry.totalTat += diff
          entry.tatCount++

          const def = findTestDefinition(test.name)
          const target = parseTatMinutes(def?.turnaroundTime)
          if (target === null || diff <= target) {
            entry.withinTarget++
          }
        }
      }

      testMap.set(test.name, entry)
    })

    return Array.from(testMap.values()).sort((a, b) => b.orders - a.orders)
  }, [allTests])

  // Billing & Payment Operational Breakdown
  const billingOperational = useMemo(() => {
    const awaitingBilling = filteredOrders.filter(
      (o) => o.billing.status === "Pending" && o.status !== "Cancelled"
    ).length
    const paidReady = filteredOrders.filter(
      (o) => o.billing.status === "Paid" && o.status !== "Completed" && o.status !== "Cancelled"
    ).length
    const completedAfterPaid = filteredOrders.filter(
      (o) => o.billing.status === "Paid" && o.status === "Completed"
    ).length

    return { awaitingBilling, paidReady, completedAfterPaid }
  }, [filteredOrders])

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden text-gray-900 font-sans">
      {/* Analytics Filter Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-blue-600 inline-block"></span>
            Department Scope:
          </span>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-gray-300 bg-white rounded-none font-medium text-gray-800 cursor-pointer shadow-2xs"
          >
            <option value="all">All Diagnostic Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center border border-gray-300 bg-white">
            <button
              onClick={() => setTimeRange("today")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                timeRange === "today"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange("7days")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                timeRange === "7days"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange("30days")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                timeRange === "30days"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                timeRange === "all"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All Time
            </button>
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-none focus:outline-none focus:border-blue-600"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5 shrink-0">
          <div className="bg-white border border-gray-200 border-l-4 border-l-blue-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-gray-500 block text-[10.5px] font-semibold uppercase tracking-wider">
              Tests Today
            </span>
            <strong className="text-2xl font-bold text-gray-900 mt-1 block">
              {kpis.todayTests}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-indigo-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-indigo-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Tests This Month
            </span>
            <strong className="text-2xl font-bold text-indigo-900 mt-1 block">
              {kpis.thisMonthTests}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-teal-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-teal-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Avg Processing TAT
            </span>
            <strong className="text-2xl font-bold text-teal-900 mt-1 block">
              {kpis.avgTatMins !== null ? formatDuration(kpis.avgTatMins) : "—"}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-emerald-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-emerald-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Within Target TAT
            </span>
            <strong className="text-2xl font-bold text-emerald-800 mt-1 block">
              {kpis.withinTatPct !== null ? `${kpis.withinTatPct}%` : "—"}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-red-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-red-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Critical Results
            </span>
            <strong className="text-2xl font-bold text-red-800 mt-1 block">
              {kpis.criticalCount}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-slate-700 rounded-none p-3.5 shadow-2xs">
            <span className="text-slate-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Verified Reports
            </span>
            <strong className="text-2xl font-bold text-slate-900 mt-1 block">
              {kpis.verifiedReports}
            </strong>
          </div>
        </div>

        {/* Empty State Guard */}
        {allTests.length === 0 ? (
          <div className="bg-white border border-gray-200 p-16 text-center text-gray-500 rounded-none shadow-2xs">
            <div className="text-3xl mb-2">📊</div>
            <h3 className="text-sm font-bold text-gray-800">
              No laboratory data available for the selected period.
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Diagnostic analytics will automatically calculate and display as laboratory orders are
              accessioned and processed.
            </p>
          </div>
        ) : (
          <>
            {/* Visual Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Chart 1: Test Volume Trend */}
              <div className="lg:col-span-2 bg-white border border-gray-200 p-4 rounded-none shadow-2xs flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      Diagnostic Workload Volume
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      Total investigations ordered across all diagnostic benches
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-700">
                    {allTests.length} Total Tests
                  </span>
                </div>
                <div className="h-60 mt-3">
                  {volumeTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={volumeTrendData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorTests" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0F172A",
                            borderColor: "#334155",
                            borderRadius: 0,
                            color: "#fff",
                            fontSize: "12px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="tests"
                          stroke="#2563EB"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorTests)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-400">
                      Insufficient trend points
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 2: Status Distribution */}
              <div className="bg-white border border-gray-200 p-4 rounded-none shadow-2xs flex flex-col">
                <div className="pb-3 border-b border-gray-100">
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Operational Status Distribution
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Bench progression of ordered investigations
                  </p>
                </div>
                <div className="h-60 mt-3 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistributionData.filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusDistributionData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          borderRadius: 0,
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 text-[10.5px]">
                  {statusDistributionData.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between text-gray-600">
                      <span className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2 h-2 inline-block shrink-0"
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                        ></span>
                        <span className="truncate">{item.name}</span>
                      </span>
                      <strong className="font-mono text-gray-900 ml-1">{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Department Breakdown Bar Strip */}
            <div className="bg-white border border-gray-200 p-4 rounded-none shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Department-wise Test Distribution
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Diagnostic volume breakdown across clinical sub-disciplines
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                {departmentData.map((dept, idx) => (
                  <div
                    key={dept.name}
                    className="p-3 border border-gray-200 bg-slate-50/60 rounded-none"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-800 truncate">
                        {dept.name}
                      </span>
                      <span className="text-xs font-mono font-bold text-blue-700">
                        {dept.count}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 mt-2 rounded-none overflow-hidden">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${dept.percentage}%` }}
                      ></div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 flex justify-between">
                      <span>Share of Volume</span>
                      <span className="font-mono">{dept.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment & Billing Operational Flow (Clinical Focus - Zero Profitability) */}
            <div className="bg-white border border-gray-200 p-4 rounded-none shadow-2xs">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                Billing &amp; Payment Operational Flow
              </h3>
              <p className="text-[11px] text-gray-500 mb-3">
                Clearance hand-off between reception billing and laboratory bench processing
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-none">
                  <span className="text-[10.5px] font-bold uppercase text-amber-800 block">
                    Awaiting Billing Clearance
                  </span>
                  <strong className="text-xl font-bold text-amber-900 mt-1 block">
                    {billingOperational.awaitingBilling}
                  </strong>
                  <span className="text-[10px] text-amber-700 mt-1 block">
                    Orders pending payment at reception
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-none">
                  <span className="text-[10.5px] font-bold uppercase text-emerald-800 block">
                    Pre-Paid / Active Worklist
                  </span>
                  <strong className="text-xl font-bold text-emerald-900 mt-1 block">
                    {billingOperational.paidReady}
                  </strong>
                  <span className="text-[10px] text-emerald-700 mt-1 block">
                    Paid orders ready or underway
                  </span>
                </div>
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-none">
                  <span className="text-[10.5px] font-bold uppercase text-blue-800 block">
                    Completed Post-Clearance
                  </span>
                  <strong className="text-xl font-bold text-blue-900 mt-1 block">
                    {billingOperational.completedAfterPaid}
                  </strong>
                  <span className="text-[10px] text-blue-700 mt-1 block">
                    Diagnostic reports verified &amp; delivered
                  </span>
                </div>
              </div>
            </div>

            {/* Test-wise Analytics Table */}
            <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex flex-col overflow-hidden">
              <div className="p-3.5 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Investigation Bench Performance
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Test-wise metrics for volume, completions, pathologist verifications, and
                    TAT compliance
                  </p>
                </div>
                <span className="text-xs font-mono text-gray-600">
                  {testWiseTable.length} Investigations
                </span>
              </div>

              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4">Test Name</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-right">Orders</th>
                      <th className="py-2.5 px-3 text-right">Completed</th>
                      <th className="py-2.5 px-3 text-right">Verified</th>
                      <th className="py-2.5 px-3 text-center">Critical</th>
                      <th className="py-2.5 px-3 text-right">Avg Processing TAT</th>
                      <th className="py-2.5 px-3 text-right">Within Target %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {testWiseTable.map((row) => {
                      const avgTatStr =
                        row.tatCount > 0 ? formatDuration(row.totalTat / row.tatCount) : "—"
                      const compliancePct =
                        row.tatCount > 0
                          ? `${Math.round((row.withinTarget / row.tatCount) * 100)}%`
                          : "—"

                      return (
                        <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-gray-900">{row.name}</td>
                          <td className="py-2.5 px-3 text-gray-600">{row.department}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                            {row.orders}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                            {row.completed}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-indigo-700">
                            {row.verified}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {row.critical > 0 ? (
                              <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-800 font-bold border border-red-300">
                                {row.critical} Critical
                              </span>
                            ) : (
                              <span className="text-gray-400 font-mono">0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                            {avgTatStr}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold">
                            {compliancePct !== "—" ? (
                              <span
                                className={
                                  parseInt(compliancePct) >= 80
                                    ? "text-emerald-700"
                                    : "text-amber-800"
                                }
                              >
                                {compliancePct}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

