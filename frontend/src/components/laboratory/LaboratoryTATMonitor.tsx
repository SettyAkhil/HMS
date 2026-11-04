import React, { useState, useEffect, useMemo } from "react"
import {
  LabOrder,
  LabOrderTest,
  LabOrderDatabase,
} from "../../services/labOrdersDb"
import { findTestDefinition } from "./labCatalogueSchema"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

interface LaboratoryTATMonitorProps {
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

function formatDuration(minutes: number | null): string {
  if (minutes === null || isNaN(minutes) || minutes < 0) return "Not Available"
  const m = Math.round(minutes)
  if (m < 60) return `${m} mins`
  const hrs = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

interface TestTatRecord {
  orderId: string
  encounterId: string
  umr: string
  patientName: string
  testId: string
  testName: string
  category: string
  urgency: string
  processingStartedAt?: string
  processingCompletedAt?: string
  actualProcessingMinutes: number | null
  targetTatStr?: string
  targetTatMinutes: number | null
  isWithinTarget: boolean | null
  status: "Within Target" | "At Risk" | "Breached" | "In Progress" | "Not Available"
}

export default function LaboratoryTATMonitor({
  technician = "Laboratory Specialist",
}: LaboratoryTATMonitorProps) {
  const [tick, setTick] = useState(0)
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "all">("30days")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "within" | "breached">("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Subscribe to DB changes
  useEffect(() => {
    return LabOrderDatabase.subscribe(() => setTick((t) => t + 1))
  }, [])

  const allOrders = useMemo(() => {
    return LabOrderDatabase.getOrders()
  }, [tick])

  // Extract all test records with strict Option C Processing TAT calculation
  const allTestRecords = useMemo(() => {
    const records: TestTatRecord[] = []
    const now = new Date()

    allOrders.forEach((order) => {
      // Date range filter on order creation or processing
      const orderDate = new Date(order.createdAt)
      if (dateRange === "today") {
        if (
          orderDate.getDate() !== now.getDate() ||
          orderDate.getMonth() !== now.getMonth() ||
          orderDate.getFullYear() !== now.getFullYear()
        ) {
          return
        }
      } else if (dateRange === "7days") {
        if ((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24) > 7) return
      } else if (dateRange === "30days") {
        if ((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24) > 30) return
      }

      order.tests.forEach((test) => {
        const def = findTestDefinition(test.name)
        const targetTatStr = def?.turnaroundTime || "2 Hours"
        const targetTatMinutes = parseTatMinutes(targetTatStr)

        let actualMinutes: number | null = null
        let isWithin: boolean | null = null
        let status: TestTatRecord["status"] = "Not Available"

        // Strictly Option C: processingStartedAt -> processingCompletedAt
        if (test.processingStartedAt && test.processingCompletedAt) {
          const start = new Date(test.processingStartedAt).getTime()
          const end = new Date(test.processingCompletedAt).getTime()
          if (end >= start) {
            actualMinutes = (end - start) / (1000 * 60)
            if (targetTatMinutes !== null) {
              if (actualMinutes <= targetTatMinutes) {
                isWithin = true
                status = "Within Target"
              } else {
                isWithin = false
                status = "Breached"
              }
            } else {
              isWithin = true
              status = "Within Target"
            }
          }
        } else if (test.processingStartedAt && !test.processingCompletedAt) {
          // In processing
          const start = new Date(test.processingStartedAt).getTime()
          const elapsed = (now.getTime() - start) / (1000 * 60)
          if (targetTatMinutes !== null) {
            if (elapsed > targetTatMinutes) {
              status = "Breached"
            } else if (elapsed > targetTatMinutes * 0.75) {
              status = "At Risk"
            } else {
              status = "In Progress"
            }
          } else {
            status = "In Progress"
          }
        }

        records.push({
          orderId: order.id,
          encounterId: order.opNumber || order.encounterId,
          umr: order.umr,
          patientName: order.patientName,
          testId: test.id,
          testName: test.name,
          category: test.category || "PATHOLOGY",
          urgency: test.urgency || "Routine",
          processingStartedAt: test.processingStartedAt,
          processingCompletedAt: test.processingCompletedAt,
          actualProcessingMinutes: actualMinutes,
          targetTatStr,
          targetTatMinutes,
          isWithinTarget: isWithin,
          status,
        })
      })
    })

    return records
  }, [allOrders, dateRange])

  // Completed tests with valid processing timestamps
  const validCompletedTests = useMemo(() => {
    return allTestRecords.filter(
      (r) => r.actualProcessingMinutes !== null && r.processingCompletedAt !== undefined
    )
  }, [allTestRecords])

  // Core KPIs
  const kpis = useMemo(() => {
    const totalCompleted = validCompletedTests.length
    if (totalCompleted === 0) {
      return {
        completed: 0,
        avgTatMins: null,
        withinTarget: 0,
        compliancePct: null,
        fastestMins: null,
        slowestMins: null,
        breached: 0,
      }
    }

    let sumMins = 0
    let within = 0
    let breached = 0
    let minMins = Infinity
    let maxMins = -Infinity

    validCompletedTests.forEach((r) => {
      const m = r.actualProcessingMinutes!
      sumMins += m
      if (m < minMins) minMins = m
      if (m > maxMins) maxMins = m
      if (r.isWithinTarget) {
        within++
      } else {
        breached++
      }
    })

    const avgMins = sumMins / totalCompleted
    const compliance = Math.round((within / totalCompleted) * 100)

    return {
      completed: totalCompleted,
      avgTatMins: avgMins,
      withinTarget: within,
      compliancePct: compliance,
      fastestMins: minMins !== Infinity ? minMins : null,
      slowestMins: maxMins !== -Infinity ? maxMins : null,
      breached,
    }
  }, [validCompletedTests])

  // Filtered Records for Table
  const filteredRecords = useMemo(() => {
    return allTestRecords.filter((r) => {
      if (departmentFilter !== "all") {
        const cat = r.category.toUpperCase()
        if (!cat.includes(departmentFilter) && !departmentFilter.includes(cat)) return false
      }
      if (statusFilter === "within" && !r.isWithinTarget) return false
      if (statusFilter === "breached" && (r.isWithinTarget || r.status !== "Breached")) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = r.testName.toLowerCase().includes(q)
        const matchPatient = r.patientName.toLowerCase().includes(q)
        const matchUmr = r.umr.toLowerCase().includes(q)
        const matchOrder = r.orderId.toLowerCase().includes(q)
        if (!matchName && !matchPatient && !matchUmr && !matchOrder) return false
      }
      return true
    })
  }, [allTestRecords, departmentFilter, statusFilter, searchQuery])

  // Test-wise Aggregation Table
  const testWiseTable = useMemo(() => {
    const map = new Map<
      string,
      {
        testName: string
        department: string
        targetTatStr: string
        completedCount: number
        totalMins: number
        minMins: number
        maxMins: number
        withinTarget: number
        breached: number
      }
    >()

    validCompletedTests.forEach((r) => {
      const entry = map.get(r.testName) || {
        testName: r.testName,
        department: r.category,
        targetTatStr: r.targetTatStr || "2 Hours",
        completedCount: 0,
        totalMins: 0,
        minMins: Infinity,
        maxMins: -Infinity,
        withinTarget: 0,
        breached: 0,
      }

      const m = r.actualProcessingMinutes!
      entry.completedCount++
      entry.totalMins += m
      if (m < entry.minMins) entry.minMins = m
      if (m > entry.maxMins) entry.maxMins = m

      if (r.isWithinTarget) {
        entry.withinTarget++
      } else {
        entry.breached++
      }

      map.set(r.testName, entry)
    })

    return Array.from(map.values()).map((row) => {
      const avg = row.totalMins / row.completedCount
      const comp = Math.round((row.withinTarget / row.completedCount) * 100)
      let status: "Within Target" | "At Risk" | "Breached" = "Within Target"
      if (comp < 80) status = "Breached"
      else if (comp < 95) status = "At Risk"

      return {
        ...row,
        avgMins: avg,
        compliancePct: comp,
        status,
      }
    })
  }, [validCompletedTests])

  // Department-wise Aggregation Table
  const departmentWiseTable = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string
        completedCount: number
        totalMins: number
        withinTarget: number
        breached: number
      }
    >()

    validCompletedTests.forEach((r) => {
      const rawDept = r.category.toUpperCase()
      let mapped = "OTHER SPECIAL"
      for (const d of DEPARTMENTS) {
        if (rawDept.includes(d) || d.includes(rawDept)) {
          mapped = d
          break
        }
      }

      const entry = map.get(mapped) || {
        department: mapped,
        completedCount: 0,
        totalMins: 0,
        withinTarget: 0,
        breached: 0,
      }

      const m = r.actualProcessingMinutes!
      entry.completedCount++
      entry.totalMins += m
      if (r.isWithinTarget) {
        entry.withinTarget++
      } else {
        entry.breached++
      }

      map.set(mapped, entry)
    })

    return Array.from(map.values()).map((row) => ({
      ...row,
      avgMins: row.totalMins / row.completedCount,
      compliancePct: Math.round((row.withinTarget / row.completedCount) * 100),
    }))
  }, [validCompletedTests])

  // TAT Trend Over Time Data
  const tatTrendData = useMemo(() => {
    const dateMap = new Map<string, { sum: number; count: number }>()

    validCompletedTests.forEach((r) => {
      if (!r.processingCompletedAt) return
      const d = new Date(r.processingCompletedAt)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      const curr = dateMap.get(key) || { sum: 0, count: 0 }
      curr.sum += r.actualProcessingMinutes!
      curr.count += 1
      dateMap.set(key, curr)
    })

    return Array.from(dateMap.entries())
      .map(([date, val]) => ({
        date,
        avgMins: Math.round(val.sum / val.count),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [validCompletedTests])

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden text-gray-900 font-sans">
      {/* TAT Filter Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <span className="w-1.5 h-3.5 bg-teal-600 inline-block"></span>
            Department Scope:
          </span>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-gray-300 bg-white rounded-none font-medium text-gray-800 cursor-pointer shadow-2xs"
          >
            <option value="all">All Diagnostic Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 border border-teal-200 ml-1">
            Option C: Processing Duration vs Target
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center border border-gray-300 bg-white">
            <button
              onClick={() => setDateRange("today")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                dateRange === "today"
                  ? "bg-teal-700 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange("7days")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                dateRange === "7days"
                  ? "bg-teal-700 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setDateRange("30days")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                dateRange === "30days"
                  ? "bg-teal-700 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setDateRange("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none cursor-pointer ${
                dateRange === "all"
                  ? "bg-teal-700 text-white font-bold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col">
        {/* KPI Strip (7 Rectangular KPI Workspaces) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 shrink-0">
          <div className="bg-white border border-gray-200 border-l-4 border-l-blue-600 rounded-none p-3 shadow-2xs">
            <span className="text-gray-500 block text-[10px] font-semibold uppercase tracking-wider">
              Tests Completed
            </span>
            <strong className="text-xl font-bold text-gray-900 mt-1 block">
              {kpis.completed}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-teal-600 rounded-none p-3 shadow-2xs">
            <span className="text-teal-700 block text-[10px] font-semibold uppercase tracking-wider">
              Avg Processing TAT
            </span>
            <strong className="text-xl font-bold text-teal-900 mt-1 block">
              {kpis.avgTatMins !== null ? formatDuration(kpis.avgTatMins) : "—"}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-emerald-600 rounded-none p-3 shadow-2xs">
            <span className="text-emerald-700 block text-[10px] font-semibold uppercase tracking-wider">
              Within Target TAT
            </span>
            <strong className="text-xl font-bold text-emerald-800 mt-1 block">
              {kpis.withinTarget}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-indigo-600 rounded-none p-3 shadow-2xs">
            <span className="text-indigo-700 block text-[10px] font-semibold uppercase tracking-wider">
              TAT Compliance %
            </span>
            <strong className="text-xl font-bold text-indigo-900 mt-1 block">
              {kpis.compliancePct !== null ? `${kpis.compliancePct}%` : "—"}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-green-600 rounded-none p-3 shadow-2xs">
            <span className="text-green-700 block text-[10px] font-semibold uppercase tracking-wider">
              Fastest Time
            </span>
            <strong className="text-xl font-bold text-green-900 mt-1 block">
              {kpis.fastestMins !== null ? formatDuration(kpis.fastestMins) : "—"}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-amber-500 rounded-none p-3 shadow-2xs">
            <span className="text-amber-700 block text-[10px] font-semibold uppercase tracking-wider">
              Slowest Time
            </span>
            <strong className="text-xl font-bold text-amber-900 mt-1 block">
              {kpis.slowestMins !== null ? formatDuration(kpis.slowestMins) : "—"}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-red-600 rounded-none p-3 shadow-2xs">
            <span className="text-red-700 block text-[10px] font-semibold uppercase tracking-wider">
              TAT Breached
            </span>
            <strong className="text-xl font-bold text-red-800 mt-1 block">
              {kpis.breached}
            </strong>
          </div>
        </div>

        {/* Empty State Guard */}
        {validCompletedTests.length === 0 ? (
          <div className="bg-white border border-gray-200 p-16 text-center text-gray-500 rounded-none shadow-2xs">
            <div className="text-3xl mb-2">⏱️</div>
            <h3 className="text-sm font-bold text-gray-800">
              No completed tests with valid processing timestamps are available.
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Under strict clinical Option C TAT definitions, turnaround time is calculated from the
              instant analytical processing begins to result completion and pathologist
              verification.
            </p>
          </div>
        ) : (
          <>
            {/* Trend Chart: Average Processing TAT Over Time */}
            <div className="bg-white border border-gray-200 p-4 rounded-none shadow-2xs flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Average Analytical Processing TAT Trend (Minutes)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Daily average turnaround duration from Processing Started to Results Completed
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-teal-800">
                  Target Benchmark: &lt; 120 mins
                </span>
              </div>
              <div className="h-56 mt-3">
                {tatTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={tatTrendData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          borderRadius: 0,
                          fontSize: "12px",
                          color: "#fff",
                        }}
                        formatter={(val: any) => [`${val} mins`, "Avg TAT"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgMins"
                        stroke="#0D9488"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#0D9488" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400">
                    Insufficient historical trend points
                  </div>
                )}
              </div>
            </div>

            {/* Department-wise TAT Benchmark Table */}
            <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex flex-col overflow-hidden">
              <div className="p-3.5 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Department TAT Performance &amp; Compliance
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Aggregated analytical turnaround performance across laboratory sections
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4">Department</th>
                      <th className="py-2.5 px-3 text-right">Tests Completed</th>
                      <th className="py-2.5 px-3 text-right">Average TAT</th>
                      <th className="py-2.5 px-3 text-right">Target / Benchmark</th>
                      <th className="py-2.5 px-3 text-right">Within Target %</th>
                      <th className="py-2.5 px-3 text-center">Breached Tests</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {departmentWiseTable.map((row) => (
                      <tr key={row.department} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-gray-900">{row.department}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                          {row.completedCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-800">
                          {formatDuration(row.avgMins)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                          2 Hours
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          <span
                            className={
                              row.compliancePct >= 90
                                ? "text-emerald-700"
                                : row.compliancePct >= 75
                                ? "text-amber-800"
                                : "text-red-700"
                            }
                          >
                            {row.compliancePct}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.breached > 0 ? (
                            <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-800 font-bold border border-red-300">
                              {row.breached} Breached
                            </span>
                          ) : (
                            <span className="text-gray-400 font-mono">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Test-wise TAT Table */}
            <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex flex-col overflow-hidden">
              <div className="p-3.5 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Individual Test TAT Compliance
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Detailed bench turnaround times measured against catalogue reference targets
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-none"
                  >
                    <option value="all">All TAT Statuses</option>
                    <option value="within">Within Target</option>
                    <option value="breached">Breached</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Search test..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4">Test Name</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-right">Tests Completed</th>
                      <th className="py-2.5 px-3 text-right">Target TAT</th>
                      <th className="py-2.5 px-3 text-right">Average TAT</th>
                      <th className="py-2.5 px-3 text-right">Fastest</th>
                      <th className="py-2.5 px-3 text-right">Slowest</th>
                      <th className="py-2.5 px-3 text-right">Within Target</th>
                      <th className="py-2.5 px-3 text-right">Breached</th>
                      <th className="py-2.5 px-3 text-right">Compliance %</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {testWiseTable
                      .filter((row) => {
                        if (statusFilter === "within" && row.breached > 0 && row.withinTarget === 0)
                          return false
                        if (statusFilter === "breached" && row.breached === 0) return false
                        if (searchQuery.trim()) {
                          const q = searchQuery.toLowerCase().trim()
                          if (!row.testName.toLowerCase().includes(q)) return false
                        }
                        return true
                      })
                      .map((row) => (
                        <tr key={row.testName} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-semibold text-gray-900 font-sans">
                            {row.testName}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 font-sans">{row.department}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                            {row.completedCount}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-700">
                            {row.targetTatStr}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-teal-800">
                            {formatDuration(row.avgMins)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-green-700">
                            {formatDuration(row.minMins)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-800">
                            {formatDuration(row.maxMins)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700">
                            {row.withinTarget}
                          </td>
                          <td className="py-2.5 px-3 text-right text-red-700 font-bold">
                            {row.breached}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            <span
                              className={
                                row.compliancePct >= 90
                                  ? "text-emerald-700"
                                  : row.compliancePct >= 75
                                  ? "text-amber-800"
                                  : "text-red-700"
                              }
                            >
                              {row.compliancePct}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold border ${
                                row.status === "Within Target"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : row.status === "At Risk"
                                  ? "bg-amber-50 text-amber-800 border-amber-300"
                                  : "bg-red-50 text-red-800 border-red-300"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
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

