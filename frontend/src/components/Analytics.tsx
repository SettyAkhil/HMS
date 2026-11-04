import React, { useState } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts"
import { Card, Btn, MetricCard } from "./shared"

const ADMISSION_TREND = [
  { month: "Mar", admissions: 312, discharges: 308, ed: 1240 },
  { month: "Apr", admissions: 328, discharges: 321, ed: 1310 },
  { month: "May", admissions: 341, discharges: 338, ed: 1360 },
  { month: "Jun", admissions: 298, discharges: 302, ed: 1190 },
  { month: "Jul", admissions: 320, discharges: 315, ed: 1280 },
  { month: "Aug", admissions: 338, discharges: 331, ed: 1352 },
]

const LOS_DATA = [
  { dept: "Medical", avg: 4.2, target: 4.0 },
  { dept: "Surgery", avg: 3.1, target: 3.5 },
  { dept: "ICU", avg: 6.8, target: 6.0 },
  { dept: "Oncology", avg: 7.2, target: 6.5 },
  { dept: "OB/GYN", avg: 2.1, target: 2.5 },
  { dept: "Cardiac", avg: 5.4, target: 5.0 },
]

const PAYER_MIX = [
  { name: "BlueCross PPO", value: 34, color: "#1B4FD8" },
  { name: "Medicare", value: 28, color: "#0284C7" },
  { name: "Aetna HMO", value: 15, color: "#7C3AED" },
  { name: "Medicaid", value: 12, color: "#16A34A" },
  { name: "United PPO", value: 7, color: "#D97706" },
  { name: "Self-Pay", value: 4, color: "#DC2626" },
]

const ED_FLOW = [
  { hour: "00", arrivals: 8, dispositions: 9 },
  { hour: "02", arrivals: 5, dispositions: 6 },
  { hour: "04", arrivals: 4, dispositions: 4 },
  { hour: "06", arrivals: 7, dispositions: 5 },
  { hour: "08", arrivals: 18, dispositions: 12 },
  { hour: "10", arrivals: 24, dispositions: 22 },
  { hour: "12", arrivals: 22, dispositions: 20 },
  { hour: "14", arrivals: 26, dispositions: 24 },
  { hour: "16", arrivals: 28, dispositions: 25 },
  { hour: "18", arrivals: 22, dispositions: 20 },
  { hour: "20", arrivals: 15, dispositions: 16 },
  { hour: "22", arrivals: 10, dispositions: 11 },
]

const LAB_TAT = [
  { test: "CBC", target: 90, actual: 72, unit: "min" },
  { test: "BMP", target: 90, actual: 68, unit: "min" },
  { test: "Troponin", target: 60, actual: 44, unit: "min" },
  { test: "Blood Cx", target: 1440, actual: 1280, unit: "min" },
  { test: "UA", target: 60, actual: 38, unit: "min" },
  { test: "Lipase", target: 90, actual: 81, unit: "min" },
]

const REVENUE_TREND = [
  { month: "Mar", charges: 1080, collections: 1012, denied: 68 },
  { month: "Apr", charges: 1140, collections: 1076, denied: 64 },
  { month: "May", charges: 1190, collections: 1121, denied: 69 },
  { month: "Jun", charges: 1020, collections: 962, denied: 58 },
  { month: "Jul", charges: 1160, collections: 1088, denied: 72 },
  { month: "Aug", charges: 1240, collections: 1168, denied: 72 },
]

export default function Analytics() {
  const [period, setPeriod] = useState("MTD")

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">
            Analytics & Reporting
          </h1>
          <p className="text-[11.5px] text-[#64748B]">
            General Hospital · Operational Intelligence Dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[#DDE2EC] rounded overflow-hidden">
            {["MTD", "QTD", "YTD", "Custom"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  period === p
                    ? "bg-[#1B4FD8] text-white"
                    : "bg-white text-[#64748B] hover:bg-[#F8FAFC]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Btn variant="outline" size="sm">
            Export Report
          </Btn>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Avg Daily Census"
            value="284"
            sub="Target: 300"
            trend="↓5%"
          />
          <MetricCard
            label="Avg LOS"
            value="4.2d"
            sub="Target: 4.0 days"
            trend="↑0.2"
          />
          <MetricCard
            label="Bed Occupancy"
            value="88%"
            sub="3 units > 90%"
            color="#D97706"
          />
          <MetricCard
            label="ED Left W/O Seen"
            value="1.8%"
            sub="Target: < 2%"
            color="#16A34A"
          />
          <MetricCard
            label="30-Day Readmit"
            value="7.2%"
            sub="Target: < 8%"
            color="#16A34A"
          />
          <MetricCard
            label="Patient Satisf."
            value="4.4/5"
            sub="89th percentile"
            color="#16A34A"
          />
        </div>

        {/* Admission/Discharge trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Admissions & Discharges — 6 Month Trend">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={ADMISSION_TREND}
                margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid #DDE2EC",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="admissions"
                  stroke="#1B4FD8"
                  fill="#EFF6FF"
                  strokeWidth={2}
                  name="Admissions"
                />
                <Area
                  type="monotone"
                  dataKey="discharges"
                  stroke="#16A34A"
                  fill="#F0FDF4"
                  strokeWidth={2}
                  name="Discharges"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Revenue — Charges vs Collections (000s)">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={REVENUE_TREND}
                margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                barGap={3}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid #DDE2EC",
                  }}
                  formatter={(val) => `$${val}K`}
                />
                <Bar
                  dataKey="charges"
                  fill="#1B4FD8"
                  name="Total Charges"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="collections"
                  fill="#16A34A"
                  name="Collections"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="denied"
                  fill="#DC2626"
                  name="Denied"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ED Flow + LOS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="ED Patient Flow — Hourly (Today)">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={ED_FLOW}
                margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(h) => `${h}:00`}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid #DDE2EC",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="arrivals"
                  stroke="#DC2626"
                  strokeWidth={2}
                  dot={false}
                  name="Arrivals"
                />
                <Line
                  type="monotone"
                  dataKey="dispositions"
                  stroke="#16A34A"
                  strokeWidth={2}
                  dot={false}
                  name="Dispositions"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Average Length of Stay by Department (Days)">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={LOS_DATA}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="dept"
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid #DDE2EC",
                  }}
                  formatter={(val) => `${val} days`}
                />
                <Bar
                  dataKey="actual"
                  name="Actual LOS"
                  fill="#1B4FD8"
                  radius={[0, 2, 2, 0]}
                />
                <Bar
                  dataKey="target"
                  name="Target LOS"
                  fill="#E2E8F0"
                  radius={[0, 2, 2, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Payer Mix + Lab TAT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Payer Mix — YTD">
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={PAYER_MIX}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={60}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {PAYER_MIX.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {PAYER_MIX.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-[12px] text-gray-700 flex-1">
                      {p.name}
                    </span>
                    <span className="font-mono font-semibold text-[12px] text-gray-900">
                      {p.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Laboratory Turnaround Time vs Target">
            <div className="space-y-2.5">
              {LAB_TAT.map((l, i) => {
                const pct = Math.min((l.actual / l.target) * 100, 100)
                const ok = l.actual <= l.target
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[12px] text-gray-700">
                        {l.test}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[11.5px] font-semibold ${
                            ok ? "text-[#16A34A]" : "text-[#DC2626]"
                          }`}
                        >
                          {l.actual}m
                        </span>
                        <span className="text-[#94A3B8] text-[11px]">
                          / {l.target}m
                        </span>
                        <span>{ok ? "✓" : "⚠"}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#F1F5F9] rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: ok ? "#16A34A" : "#DC2626",
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Scorecard table */}
        <Card title="Department Performance Scorecard — August 2026">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#DDE2EC] bg-[#F8FAFC]">
                  {[
                    "Department",
                    "Admissions",
                    "Discharges",
                    "Avg LOS",
                    "Occupancy",
                    "HCAHPS",
                    "Readmit 30d",
                    "Collections",
                    "Score",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    dept: "3N Medical",
                    adm: 82,
                    dc: 79,
                    los: "4.2d",
                    occ: "88%",
                    hcahps: "4.4",
                    readmit: "6.8%",
                    coll: "$312K",
                    score: 87,
                  },
                  {
                    dept: "4S Medical",
                    adm: 74,
                    dc: 71,
                    los: "4.0d",
                    occ: "82%",
                    hcahps: "4.6",
                    readmit: "7.1%",
                    coll: "$284K",
                    score: 89,
                  },
                  {
                    dept: "ICU",
                    adm: 24,
                    dc: 20,
                    los: "6.8d",
                    occ: "85%",
                    hcahps: "4.7",
                    readmit: "4.2%",
                    coll: "$682K",
                    score: 92,
                  },
                  {
                    dept: "Surgery",
                    adm: 61,
                    dc: 62,
                    los: "3.1d",
                    occ: "78%",
                    hcahps: "4.5",
                    readmit: "3.8%",
                    coll: "$428K",
                    score: 91,
                  },
                  {
                    dept: "Oncology 5W",
                    adm: 48,
                    dc: 46,
                    los: "7.2d",
                    occ: "91%",
                    hcahps: "4.3",
                    readmit: "9.2%",
                    coll: "$394K",
                    score: 82,
                  },
                  {
                    dept: "ED",
                    adm: 49,
                    dc: 1310,
                    los: "3.8h",
                    occ: "90%",
                    hcahps: "4.2",
                    readmit: "—",
                    coll: "$248K",
                    score: 85,
                  },
                ].map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-gray-800">
                      {r.dept}
                    </td>
                    <td className="px-3 py-2.5 font-mono">{r.adm}</td>
                    <td className="px-3 py-2.5 font-mono">{r.dc}</td>
                    <td className="px-3 py-2.5 font-mono">{r.los}</td>
                    <td className="px-3 py-2.5 font-mono">{r.occ}</td>
                    <td className="px-3 py-2.5 font-mono">{r.hcahps}</td>
                    <td
                      className={`px-3 py-2.5 font-mono font-semibold ${
                        parseFloat(r.readmit) > 8
                          ? "text-[#DC2626]"
                          : "text-[#16A34A]"
                      }`}
                    >
                      {r.readmit}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-gray-800">
                      {r.coll}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#F1F5F9] rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${r.score}%`,
                              backgroundColor:
                                r.score >= 90
                                  ? "#16A34A"
                                  : r.score >= 85
                                    ? "#D97706"
                                    : "#DC2626",
                            }}
                          />
                        </div>
                        <span
                          className={`font-mono font-semibold text-[12px] ${
                            r.score >= 90
                              ? "text-[#16A34A]"
                              : r.score >= 85
                                ? "text-[#D97706]"
                                : "text-[#DC2626]"
                          }`}
                        >
                          {r.score}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
