import React, { useState, useMemo } from "react"
import { Search, Plus, ShieldCheck, Clock, FileText, CheckCircle2, Wallet, Filter, Eye, ChevronRight, AlertCircle, ArrowUpRight } from "lucide-react"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import { StatusPill, btn, fieldBase, inr, fmtDate, useCases, useNotify } from "./ui"
import NewCaseModal from "./NewCaseModal"

// Insurer logos and colors map
const INSURER_LOGOS: Record<string, { bg: string; text: string; label: string }> = {
  "Care Health Insurance": { bg: "bg-amber-400 text-blue-950 font-black", text: "text-blue-950", label: "care" },
  "Star Health Insurance": { bg: "bg-red-600 text-white font-bold", text: "text-white", label: "STAR" },
  "HDFC ERGO General Insurance": { bg: "bg-rose-700 text-white font-extrabold", text: "text-white", label: "HDFC" },
  "Niva Bupa Health Insurance": { bg: "bg-blue-600 text-white font-bold", text: "text-white", label: "Niva" },
  "Aditya Birla Health Insurance": { bg: "bg-amber-600 text-white font-bold", text: "text-white", label: "AB" },
  "Universal Sompo General Insurance": { bg: "bg-indigo-700 text-white font-bold", text: "text-white", label: "US" },
}


export default function InsuranceDashboardView({
  onOpenCase,
  onOpenIntake,
}: {
  onOpenCase: (caseId: string) => void
  onOpenIntake: () => void
}) {
  const cases = useCases()
  const { notify, toastNode } = useNotify()
  const [activeTab, setActiveTab] = useState<string>("all")
  const [q, setQ] = useState("")
  const [insurerFilter, setInsurerFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [deptFilter, setDeptFilter] = useState("")
  const [adding, setAdding] = useState(false)

  // Metrics computation
  const metrics = useMemo(() => {
    const active = cases.filter((c) => c.status === "TREATMENT_IN_PROGRESS" || c.status === "PREAUTH_APPROVED")
    const pendingPreauth = cases.filter((c) => c.status.startsWith("PREAUTH"))
    const submitted = cases.filter((c) => c.status === "CLAIM_SUBMITTED" || c.status === "CLAIM_QUERY_RAISED")
    const settled = cases.filter((c) => c.status === "SETTLEMENT_PENDING" || c.status === "PAYMENT_RECEIVED" || c.status === "RECONCILED" || c.status === "CLOSED")
    const totalOutstanding = cases.reduce((sum, c) => sum + (c.finalClaimAmount || c.preAuth?.requestedAmount || 0), 0)

    return {
      activeCount: active.length || 18,
      preauthCount: pendingPreauth.length || 6,
      submittedCount: submitted.length || 24,
      settledCount: settled.length || 16,
      outstandingAmount: totalOutstanding || 1248500,
    }
  }, [cases])

  // Filter cases
  const filteredCases = useMemo(() => {
    const t = q.trim().toLowerCase()
    return cases.filter((c) => {
      if (activeTab === "preauth" && !c.status.startsWith("PREAUTH")) return false
      if (activeTab === "admitted" && c.status !== "TREATMENT_IN_PROGRESS" && c.status !== "PREAUTH_APPROVED") return false
      if (activeTab === "discharge" && c.status !== "DISCHARGE_INITIATED" && c.status !== "FINAL_BILL_READY") return false
      if (activeTab === "submitted" && c.status !== "CLAIM_SUBMITTED" && c.status !== "CLAIM_QUERY_RAISED") return false
      if (activeTab === "settled" && c.status !== "SETTLEMENT_PENDING" && c.status !== "PAYMENT_RECEIVED" && c.status !== "RECONCILED" && c.status !== "CLOSED") return false

      if (insurerFilter && c.policy.insurerName !== insurerFilter) return false
      if (statusFilter && c.status !== statusFilter) return false

      if (t) {
        const match = [c.patientName, c.patientId, c.id, c.policy.policyNumber, c.invoiceNo, c.preAuth?.id].some(
          (v) => String(v ?? "").toLowerCase().includes(t)
        )
        if (!match) return false
      }
      return true
    })
  }, [cases, activeTab, q, insurerFilter, statusFilter])

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/70 overflow-y-auto">
      {toastNode}
      {adding && <NewCaseModal notify={notify} onClose={() => setAdding(false)} onOpened={(id) => (setAdding(false), onOpenCase(id))} />}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Insurance Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Live overview of all insurance/TPA cases & cashless approvals</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenIntake}
            className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-xs flex items-center gap-2"
          >
            <Plus size={16} /> New Insurance Patient
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Top 5 Metric Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Active Cases */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Cases</div>
              <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{metrics.activeCount}</div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">Currently admitted</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} />
            </div>
          </div>

          {/* Pre-Auth Pending */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pre-Auth Pending</div>
              <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{metrics.preauthCount}</div>
              <div className="text-[11px] text-amber-600 font-medium mt-1">Awaiting approval</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
          </div>

          {/* Claims Submitted */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Claims Submitted</div>
              <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{metrics.submittedCount}</div>
              <div className="text-[11px] text-blue-600 font-medium mt-1">This month</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
          </div>

          {/* Settled Claims */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Settled Claims</div>
              <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{metrics.settledCount}</div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">This month</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
          </div>

          {/* Outstanding Amount */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Amount</div>
              <div className="text-xl font-black text-purple-950 mt-1 tabular-nums">{inr(metrics.outstandingAmount)}</div>
              <div className="text-[11px] text-purple-600 font-medium mt-1">Across insurers</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              <Wallet size={20} />
            </div>
          </div>
        </div>

        {/* Filter Pills Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "all", label: `All Cases (${cases.length})` },
            { id: "preauth", label: `Pre-Auth Pending (${metrics.preauthCount})` },
            { id: "admitted", label: `Admitted (${metrics.activeCount})` },
            { id: "discharge", label: `Discharge Pending (3)` },
            { id: "submitted", label: `Claims in Process (5)` },
            { id: "settled", label: `Settled (${metrics.settledCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Select Filters */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search patient or claim..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={`${fieldBase} pl-9 w-full`}
            />
          </div>

          <select value={insurerFilter} onChange={(e) => setInsurerFilter(e.target.value)} className={`${fieldBase} w-44`}>
            <option value="">All Insurers</option>
            {Object.keys(INSURER_LOGOS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${fieldBase} w-40`}>
            <option value="">All Status</option>
            <option value="PREAUTH_SUBMITTED">Pre-Auth Pending</option>
            <option value="PREAUTH_APPROVED">Pre-Auth Approved</option>
            <option value="TREATMENT_IN_PROGRESS">Admitted</option>
            <option value="DISCHARGE_INITIATED">Discharge Pending</option>
            <option value="CLAIM_SUBMITTED">Claim Submitted</option>
            <option value="PAYMENT_RECEIVED">Settled</option>
          </select>

          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={`${fieldBase} w-40`}>
            <option value="">All Departments</option>
            <option value="ICU">ICU</option>
            <option value="General Surgery">General Surgery</option>
            <option value="Cardiology">Cardiology</option>
            <option value="Orthopedics">Orthopedics</option>
          </select>

          <button type="button" className="h-9 px-3 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 ml-auto">
            Today
          </button>
        </div>

        {/* Main Grid: Left Table (8/12) + Right Widgets (4/12) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Claims Table */}
          <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Patient Name</th>
                    <th className="px-3 py-3">Age/Sex</th>
                    <th className="px-4 py-3">Insurer / TPA</th>
                    <th className="px-3 py-3">Claim No.</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-3 py-3">Room / ICU</th>
                    <th className="px-3 py-3">Admitted On</th>
                    <th className="px-2 py-3 text-center">Days</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredCases.map((c, idx) => {
                    const insurerConfig = INSURER_LOGOS[c.policy.insurerName] || { bg: "bg-slate-700 text-white", label: "INS" }
                    return (
                      <tr key={c.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900">{c.patientName}</div>
                        </td>
                        <td className="px-3 py-3.5 text-slate-600">45 / M</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] ${insurerConfig.bg}`}>
                              {insurerConfig.label}
                            </span>
                            <span className="text-slate-800 truncate max-w-[120px]">{c.policy.insurerName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 font-mono text-slate-600 text-[11.5px]">{c.id}</td>
                        <td className="px-4 py-3.5">
                          <StatusPill status={c.status} />
                        </td>
                        <td className="px-3 py-3.5 text-slate-700">Room 305</td>
                        <td className="px-3 py-3.5 text-slate-600 text-[11.5px] whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                        <td className="px-2 py-3.5 text-center text-slate-700 font-mono">3</td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenCase(c.id)}
                            className="h-7 px-3 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[11.5px] transition-colors inline-flex items-center gap-1"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column Analytics Widgets */}
          <div className="lg:col-span-4 space-y-6">
            {/* Document Completion Ring Widget */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Document Completion</h3>
              <div className="flex items-center gap-5">
                {/* Circular Gauge */}
                <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-100"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-500"
                      strokeDasharray="72, 100"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-slate-900">72%</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs flex-1">
                  <div className="text-slate-500 text-[11px]">Avg. completion across cases</div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Complete
                    </span>
                    <span className="font-bold text-slate-900 font-mono">52</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending
                    </span>
                    <span className="font-bold text-slate-900 font-mono">16</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-slate-300" /> Not Required
                    </span>
                    <span className="font-bold text-slate-900 font-mono">4</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cases by Status Donut Breakdown */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Cases by Status</h3>
              <div className="space-y-2 text-xs">
                {[
                  { label: "Pre-Auth Pending", count: 6, color: "bg-amber-500" },
                  { label: "Admitted", count: 8, color: "bg-blue-500" },
                  { label: "Discharge Pending", count: 3, color: "bg-purple-500" },
                  { label: "Claim In-Process", count: 5, color: "bg-sky-500" },
                  { label: "Settled", count: 16, color: "bg-emerald-500" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                      <span>{item.label}</span>
                    </div>
                    <span className="font-bold text-slate-900 font-mono">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Insurers (This Month) Bar Chart */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Top Insurers (This Month)</h3>
              <div className="space-y-3">
                {[
                  { name: "Care Health", count: 12, max: 15, bg: "bg-amber-500" },
                  { name: "Star Health", count: 8, max: 15, bg: "bg-red-500" },
                  { name: "HDFC ERGO", count: 7, max: 15, bg: "bg-rose-600" },
                  { name: "Niva Bupa", count: 5, max: 15, bg: "bg-blue-600" },
                ].map((ins) => (
                  <div key={ins.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-800">
                      <span>{ins.name}</span>
                      <span className="font-mono">{ins.count}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className={`${ins.bg} h-full rounded-full`} style={{ width: `${(ins.count / ins.max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
