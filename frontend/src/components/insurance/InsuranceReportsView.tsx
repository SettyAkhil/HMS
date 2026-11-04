import React, { useMemo, useState } from "react"
import {
  BarChart2, TrendingUp, Download, FileText, Filter, Calendar,
  ArrowRight, PieChart, AlertCircle, CheckCircle2, Clock, Wallet,
  Users, RefreshCw, Printer
} from "lucide-react"
import { inr, useCases, btn } from "./ui"
import { InsuranceEngineService } from "../../services/insuranceDb"

type ReportTab = "summary" | "insurer" | "department" | "pending" | "rejection" | "tat"

// Mini bar for insurer breakdown
function MiniBar({ label, value, max, amount }: { label: string; value: number; max: number; amount: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-slate-600 truncate shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <div className="text-xs font-semibold text-slate-700 w-6 text-center">{value}</div>
      <div className="text-xs font-mono text-slate-500 w-20 text-right">{inr(amount)}</div>
    </div>
  )
}

// Donut chart mock
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div className="flex items-center gap-6">
      <div className="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          {segments.reduce(
            (acc, seg) => {
              const pct = (seg.value / total) * 100
              const circle = (
                <circle
                  key={seg.label}
                  cx="18" cy="18" r="15.9"
                  fill="none"
                  strokeWidth="3.5"
                  stroke={seg.color}
                  strokeDasharray={`${(pct * 100) / 100} ${100 - (pct * 100) / 100}`}
                  strokeDashoffset={-acc.offset}
                />
              )
              return { offset: acc.offset + pct, elements: [...acc.elements, circle] }
            },
            { offset: 0, elements: [] as React.ReactNode[] }
          ).elements}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-base font-black text-slate-900">{total}</div>
            <div className="text-[9px] text-slate-400">total</div>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-bold text-slate-900 ml-auto pl-4">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// TAT row
function TatRow({ insurer, avgHrs, preauth, claim, sla }: { insurer: string; avgHrs: number; preauth: number; claim: number; sla: number }) {
  const ok = avgHrs <= sla
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-xs font-semibold text-slate-900">{insurer}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{preauth}h</td>
      <td className="px-4 py-3 text-xs text-slate-600">{claim}h</td>
      <td className="px-4 py-3 text-xs font-bold">
        <span className={ok ? "text-emerald-700" : "text-rose-700"}>{avgHrs}h</span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{sla}h SLA</td>
      <td className="px-4 py-3">
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
          {ok ? "Within SLA" : "Overdue"}
        </span>
      </td>
    </tr>
  )
}

export default function InsuranceReportsView({
  onBack,
}: {
  onBack?: () => void
}) {
  const cases = useCases()
  const [tab, setTab] = useState<ReportTab>("summary")
  const [period, setPeriod] = useState("month")

  // Derived stats
  const stats = useMemo(() => {
    const approved = cases.filter(c => c.status === "APPROVED" || c.status === "PARTIALLY_APPROVED" || c.status === "CLOSED" || c.status === "RECONCILED")
    const pending = cases.filter(c => !["CLOSED", "RECONCILED", "SETTLED", "REJECTED"].includes(c.status))
    const rejected = cases.filter(c => c.status === "REJECTED" || c.status === "NOT_ELIGIBLE")
    const settled = cases.filter(c => c.status === "CLOSED" || c.status === "RECONCILED")
    const totalClaimed = cases.reduce((s, c) => s + (c.finalClaimAmount || c.preAuth?.requestedAmount || 0), 0)
    const totalSettled = settled.reduce((s, c) => s + (c.approvedClaimAmount || c.finalClaimAmount || c.preAuth?.approvedAmount || 0), 0)
    const totalPending = pending.reduce((s, c) => s + (c.finalClaimAmount || c.preAuth?.requestedAmount || 0), 0)

    // Insurer breakdown (demo if empty)
    const insurerMap: Record<string, { name: string; count: number; amount: number; approved: number }> = {}
    cases.forEach(c => {
      const k = c.policy.insurerName
      if (!insurerMap[k]) insurerMap[k] = { name: k, count: 0, amount: 0, approved: 0 }
      insurerMap[k].count++
      insurerMap[k].amount += c.finalClaimAmount || c.preAuth?.requestedAmount || 0
      if (approved.includes(c)) insurerMap[k].approved++
    })

    const insurerList = Object.values(insurerMap).sort((a, b) => b.amount - a.amount)

    return { approved, pending, rejected, settled, totalClaimed, totalSettled, totalPending, insurerList }
  }, [cases])

  // Demo numbers when real store is empty
  const D = {
    total: cases.length || 48,
    approved: stats.approved.length || 28,
    pending: stats.pending.length || 12,
    rejected: stats.rejected.length || 8,
    totalClaimed: stats.totalClaimed || 4280000,
    totalSettled: stats.totalSettled || 2160000,
    totalPending: stats.totalPending || 1540000,
    insurers: stats.insurerList.length > 0 ? stats.insurerList : [
      { name: "Star Health Insurance", count: 16, amount: 1280000, approved: 12 },
      { name: "Care Health Insurance", count: 12, amount: 960000, approved: 8 },
      { name: "HDFC ERGO General Insurance", count: 10, amount: 1100000, approved: 6 },
      { name: "Niva Bupa Health Insurance", count: 10, amount: 940000, approved: 7 },
    ],
  }
  const maxCount = Math.max(...D.insurers.map(i => i.count))

  const TABS: { id: ReportTab; label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "insurer", label: "By Insurer" },
    { id: "department", label: "By Department" },
    { id: "pending", label: "Pending Claims" },
    { id: "rejection", label: "Rejections" },
    { id: "tat", label: "TAT Report" },
  ]

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/70 overflow-y-auto">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium mb-1">
            <BarChart2 size={13} /> Insurance &rsaquo; Reports
          </div>
          <h1 className="text-xl font-bold text-slate-900">Insurance Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">Management analytics — claims, settlements, TAT and rejections</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none">
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <button type="button" className={`${btn.soft} gap-1.5`}><Filter size={13} /> Filter</button>
          <button type="button" className={`${btn.soft} gap-1.5`}><Download size={13} /> Export CSV</button>
          <button type="button" className={`${btn.primary} gap-1.5`}><Printer size={13} /> Print Report</button>
        </div>
      </header>

      {/* KPI Bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: "Total Cases", value: D.total, color: "text-slate-900", icon: Users },
            { label: "Approved", value: D.approved, color: "text-emerald-700", icon: CheckCircle2 },
            { label: "Pending", value: D.pending, color: "text-amber-700", icon: Clock },
            { label: "Rejected", value: D.rejected, color: "text-rose-700", icon: AlertCircle },
            { label: "Total Claimed", value: inr(D.totalClaimed), color: "text-blue-700", icon: Wallet },
            { label: "Total Settled", value: inr(D.totalSettled), color: "text-emerald-700", icon: CheckCircle2 },
            { label: "Outstanding", value: inr(D.totalPending), color: "text-amber-700", icon: TrendingUp },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[11px] text-slate-400 font-medium mb-0.5">{s.label}</div>
              <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-8 px-3 rounded-md text-[11.5px] font-semibold whitespace-nowrap transition-all ${tab === t.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 space-y-6">

        {/* ── SUMMARY ─────────────────────────────────────────────── */}
        {tab === "summary" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status donut */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Claims by Status</h3>
              <DonutChart segments={[
                { label: "Approved", value: D.approved, color: "#10b981" },
                { label: "Pending", value: D.pending, color: "#f59e0b" },
                { label: "Rejected", value: D.rejected, color: "#ef4444" },
              ]} />
            </div>

            {/* Approval rate trend (mock chart) */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Monthly Claims Trend</h3>
              <div className="flex items-end justify-between gap-2 h-32">
                {["Jul", "Aug", "Sep", "Oct"].map((month, i) => {
                  const heights = [60, 80, 90, 70]
                  const vals = [28, 34, 42, D.total]
                  return (
                    <div key={month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs font-bold text-slate-700">{vals[i]}</div>
                      <div className="w-full rounded-t-md bg-blue-500 opacity-80" style={{ height: `${heights[i]}%` }} />
                      <div className="text-[11px] text-slate-500">{month}</div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "Approval Rate", value: `${Math.round((D.approved / D.total) * 100)}%`, color: "text-emerald-700" },
                  { label: "Avg Claim", value: inr(Math.round(D.totalClaimed / D.total)), color: "text-blue-700" },
                  { label: "Settlement Rate", value: `${Math.round((D.totalSettled / D.totalClaimed) * 100)}%`, color: "text-violet-700" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-slate-500 mb-1">{s.label}</div>
                    <div className={`text-base font-black ${s.color}`}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── BY INSURER ──────────────────────────────────────────── */}
        {tab === "insurer" && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Claims by Insurer</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10.5px]">
                    <th className="px-4 py-3 text-left">Insurer</th>
                    <th className="px-4 py-3 text-center">Total Cases</th>
                    <th className="px-4 py-3 text-center">Approved</th>
                    <th className="px-4 py-3 text-center">Pending</th>
                    <th className="px-4 py-3 text-center">Rejected</th>
                    <th className="px-4 py-3 text-right">Total Claimed</th>
                    <th className="px-4 py-3 text-right">Approval %</th>
                    <th className="px-4 py-3">Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {D.insurers.map((ins, i) => {
                    const approvalPct = Math.round((ins.approved / ins.count) * 100)
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{ins.name}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800">{ins.count}</td>
                        <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{ins.approved}</td>
                        <td className="px-4 py-3 text-center text-amber-700 font-semibold">{Math.round(ins.count * 0.25)}</td>
                        <td className="px-4 py-3 text-center text-rose-700 font-semibold">{ins.count - ins.approved - Math.round(ins.count * 0.25)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{inr(ins.amount)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold text-[11px] ${approvalPct >= 70 ? "text-emerald-700" : approvalPct >= 50 ? "text-amber-700" : "text-rose-700"}`}>
                            {approvalPct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 w-28">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(ins.count / maxCount) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── BY DEPARTMENT ───────────────────────────────────────── */}
        {tab === "department" && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Claims by Department</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10.5px]">
                    <th className="px-4 py-3 text-left">Department</th>
                    <th className="px-4 py-3 text-center">Cases</th>
                    <th className="px-4 py-3 text-center">Avg LOS</th>
                    <th className="px-4 py-3 text-right">Avg Claim</th>
                    <th className="px-4 py-3 text-right">Total Claimed</th>
                    <th className="px-4 py-3 text-center">Approval %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    { dept: "General Surgery", cases: 12, los: 4, avgClaim: 85000, total: 1020000, approval: 85 },
                    { dept: "Cardiology", cases: 8, los: 7, avgClaim: 155000, total: 1240000, approval: 78 },
                    { dept: "Orthopedics", cases: 7, los: 5, avgClaim: 125000, total: 875000, approval: 82 },
                    { dept: "Gynecology", cases: 6, los: 3, avgClaim: 65000, total: 390000, approval: 90 },
                    { dept: "Neuro Surgery", cases: 4, los: 8, avgClaim: 185000, total: 740000, approval: 75 },
                    { dept: "ENT", cases: 4, los: 2, avgClaim: 42000, total: 168000, approval: 92 },
                    { dept: "Urology", cases: 4, los: 4, avgClaim: 78000, total: 312000, approval: 88 },
                    { dept: "Ophthalmology", cases: 3, los: 1, avgClaim: 38000, total: 114000, approval: 95 },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.dept}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">{row.cases}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{row.los} days</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{inr(row.avgClaim)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{inr(row.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-[11px] ${row.approval >= 85 ? "text-emerald-700" : row.approval >= 75 ? "text-amber-700" : "text-rose-700"}`}>
                          {row.approval}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PENDING CLAIMS ──────────────────────────────────────── */}
        {tab === "pending" && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Pending Claims (Age Analysis)</h3>
              <div className="text-xs text-slate-400">Total outstanding: {inr(D.totalPending)}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10.5px]">
                    <th className="px-4 py-3 text-left">Patient</th>
                    <th className="px-4 py-3 text-left">Insurer</th>
                    <th className="px-4 py-3 text-left">Stage</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Age (days)</th>
                    <th className="px-4 py-3 text-center">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    { patient: "Arjun Nair", insurer: "HDFC ERGO", stage: "Discharge Initiated", amount: 175000, age: 8, priority: "high" },
                    { patient: "Sita Devi", insurer: "Star Health", stage: "Pre-Auth Submitted", amount: 65000, age: 6, priority: "high" },
                    { patient: "Kavya Reddy", insurer: "Care Health", stage: "Pre-Auth Query", amount: 55000, age: 3, priority: "medium" },
                    { patient: "Ramesh Kumar", insurer: "Care Health", stage: "Treatment In Progress", amount: 71000, age: 4, priority: "medium" },
                    { patient: "Ananya Sharma", insurer: "Niva Bupa", stage: "Pre-Auth Approved", amount: 42000, age: 2, priority: "low" },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.patient}</td>
                      <td className="px-4 py-3 text-slate-600">{row.insurer}</td>
                      <td className="px-4 py-3 text-slate-600">{row.stage}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{inr(row.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-[11px] ${row.age > 5 ? "text-rose-700" : row.age > 3 ? "text-amber-700" : "text-slate-700"}`}>
                          {row.age}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                          row.priority === "high" ? "bg-rose-50 text-rose-700 border border-rose-200" :
                          row.priority === "medium" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {row.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REJECTION ANALYSIS ──────────────────────────────────── */}
        {tab === "rejection" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
              <h3 className="font-bold text-slate-900 mb-4">Top Rejection Reasons</h3>
              <div className="space-y-3">
                {[
                  { reason: "Inadequate documentation", count: 8, pct: 32 },
                  { reason: "Diagnosis not covered", count: 6, pct: 24 },
                  { reason: "Policy lapsed / inactive", count: 4, pct: 16 },
                  { reason: "Pre-existing condition exclusion", count: 4, pct: 16 },
                  { reason: "Co-pay not deducted correctly", count: 3, pct: 12 },
                ].map(r => (
                  <div key={r.reason}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-700 font-medium">{r.reason}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600">{r.count}</span>
                        <span className="text-[10.5px] text-slate-400">({r.pct}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
              <h3 className="font-bold text-slate-900 mb-4">Rejections by Insurer</h3>
              <div className="space-y-3">
                {[
                  { insurer: "Star Health", rejections: 3, total: 16, pct: 19 },
                  { insurer: "HDFC ERGO", rejections: 3, total: 10, pct: 30 },
                  { insurer: "Care Health", rejections: 2, total: 12, pct: 17 },
                  { insurer: "Niva Bupa", rejections: 0, total: 10, pct: 0 },
                ].map(r => (
                  <MiniBar key={r.insurer} label={r.insurer} value={r.rejections} max={5} amount={r.rejections * 75000} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAT REPORT ──────────────────────────────────────────── */}
        {tab === "tat" && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Turn-Around Time (TAT) by Insurer</h3>
              <p className="text-xs text-slate-500 mt-0.5">Tracks hours from submission to insurer decision</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10.5px]">
                    <th className="px-4 py-3 text-left">Insurer</th>
                    <th className="px-4 py-3 text-center">Pre-Auth TAT</th>
                    <th className="px-4 py-3 text-center">Claim TAT</th>
                    <th className="px-4 py-3 text-center">Avg TAT</th>
                    <th className="px-4 py-3 text-center">SLA Target</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <TatRow insurer="Star Health Insurance" avgHrs={3.2} preauth={3.2} claim={72} sla={4} />
                  <TatRow insurer="Care Health Insurance" avgHrs={5.8} preauth={5.8} claim={96} sla={4} />
                  <TatRow insurer="HDFC ERGO General Insurance" avgHrs={2.9} preauth={2.9} claim={48} sla={4} />
                  <TatRow insurer="Niva Bupa Health Insurance" avgHrs={3.5} preauth={3.5} claim={60} sla={4} />
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Within SLA</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Overdue</span>
                <span className="text-slate-400 ml-auto">SLA: 4-hour pre-auth response target</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
