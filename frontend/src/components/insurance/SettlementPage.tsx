import React, { useEffect, useMemo, useState } from "react"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import { PaymentForm, ReconcileForm, SettlementAdviceForm } from "./forms"
import {
  Drawer,
  Empty,
  Hint,
  KV,
  StatusPill,
  attempt,
  btn,
  daysUntil,
  fmtDate,
  inr,
  useCases,
  useNotify,
} from "./ui"
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Download,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  FileText,
  CreditCard,
  Sparkles,
  ChevronRight,
  DollarSign,
  ShieldCheck,
} from "lucide-react"

type Nav = (module: string, caseId?: string) => void
type Step = "advice" | "expected" | "reconcile" | "reconciled" | "closed"

const STEPS: { id: Step; label: string; sub: string; match: (c: ComprehensiveClaimRecord) => boolean }[] = [
  { id: "advice", label: "Awaiting Advice", sub: "Approved claims awaiting TPA advice note", match: (c) => c.status === "APPROVED" || c.status === "PARTIALLY_APPROVED" },
  { id: "expected", label: "Payment Expected", sub: "Advice received, awaiting bank UTR transfer", match: (c) => c.status === "SETTLEMENT_PENDING" },
  { id: "reconcile", label: "To Reconcile", sub: "Payment received, matching bank statement", match: (c) => c.status === "PAYMENT_RECEIVED" },
  { id: "reconciled", label: "Reconciled", sub: "Payment verified & matched with bank statement", match: (c) => c.status === "RECONCILED" },
  { id: "closed", label: "Closed Archives", sub: "Finalized & archived claim settlements", match: (c) => c.status === "CLOSED" && !!c.settlement },
]

const INSURER_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  "Care Health Insurance": { bg: "bg-amber-400", text: "text-blue-950 font-black", label: "CARE" },
  "Care Health": { bg: "bg-amber-400", text: "text-blue-950 font-black", label: "CARE" },
  "Star Health & Allied Insurance": { bg: "bg-sky-900", text: "text-white font-black", label: "STAR" },
  "Star Health": { bg: "bg-sky-900", text: "text-white font-black", label: "STAR" },
  "ICICI Lombard General Insurance": { bg: "bg-amber-700", text: "text-white font-black", label: "ICICI" },
  "ICICI Lombard": { bg: "bg-amber-700", text: "text-white font-black", label: "ICICI" },
  "HDFC ERGO General Insurance": { bg: "bg-red-600", text: "text-white font-black", label: "HDFC" },
  "FHPL (Family Health Plan TPA)": { bg: "bg-purple-600", text: "text-white font-black", label: "FHPL" },
  "Medi Assist TPA": { bg: "bg-teal-600", text: "text-white font-black", label: "MEDI" },
}

export const expectedOf = (c: ComprehensiveClaimRecord) => c.settlement?.expectedAmount ?? c.approvedClaimAmount ?? 0

export default function SettlementPage({ onNavigate, initialCaseId }: { onNavigate: Nav; initialCaseId?: string }) {
  const cases = useCases()
  const { notify, toastNode } = useNotify()
  const [step, setStep] = useState<Step>("advice")
  const [open, setOpen] = useState<string | undefined>(initialCaseId)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedInsurer, setSelectedInsurer] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    const c = initialCaseId && cases.find((x) => x.id === initialCaseId)
    const s = c && STEPS.find((x) => x.match(c))
    if (s) setStep(s.id)
    setOpen(initialCaseId)
  }, [initialCaseId])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setIsRefreshing(false)
      notify("Financial settlements & bank reconciliation data synced.", "success")
    }, 500)
  }

  // Filtered rows for current step
  const rawRows = cases.filter(STEPS.find((s) => s.id === step)!.match)
  const rows = useMemo(() => {
    let list = rawRows
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (c) =>
          c.patientName.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.policy.insurerName.toLowerCase().includes(q) ||
          c.settlement?.paymentReferenceNo?.toLowerCase().includes(q) ||
          c.settlement?.settlementAdviceNo?.toLowerCase().includes(q)
      )
    }
    if (selectedInsurer) {
      list = list.filter((c) => c.policy.insurerName.includes(selectedInsurer))
    }
    return list
  }, [rawRows, searchQuery, selectedInsurer])

  const current = open ? cases.find((c) => c.id === open) : undefined

  // Executive KPI calculations
  const totals = useMemo(() => {
    const due = cases.filter((c) => ["APPROVED", "PARTIALLY_APPROVED", "SETTLEMENT_PENDING"].includes(c.status))
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
    const overdueList = cases.filter((c) => c.status === "SETTLEMENT_PENDING" && c.settlement?.expectedBy && daysUntil(c.settlement.expectedBy) < 0)
    const receivedMonth = cases
      .filter((c) => c.settlement?.paymentDate && new Date(c.settlement.paymentDate).getTime() >= monthStart)
      .reduce((a, c) => a + (c.settlement?.receivedAmount ?? 0), 0)
    const totalDeducted = cases.reduce((a, c) => a + (c.settlement?.deductionsAmount ?? 0), 0)
    const totalExpectedAmount = due.reduce((a, c) => a + Math.max(0, expectedOf(c) - (c.settlement?.receivedAmount ?? 0)), 0)
    const reconciledCount = cases.filter((c) => c.status === "RECONCILED" || c.status === "CLOSED").length

    return {
      dueAmount: totalExpectedAmount,
      dueCount: due.length,
      overdueCount: overdueList.length,
      overdueAmount: overdueList.reduce((a, c) => a + expectedOf(c), 0),
      monthReceived: receivedMonth,
      deducted: totalDeducted,
      reconciledCount,
    }
  }, [cases])

  const insurersList = useMemo(() => {
    return [...new Set(cases.map((c) => c.policy.insurerName))].filter(Boolean)
  }, [cases])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-y-auto">
      {toastNode}
      {current && (
        <SettlementDrawer
          c={current}
          notify={notify}
          onClose={() => setOpen(undefined)}
          onOpenClaim={() => onNavigate("insurance_claims", current.id)}
        />
      )}

      <div className="p-6 max-w-[1750px] mx-auto w-full space-y-5">
        {/* ── 1. PAGE TITLE & HEADER CONTROLS ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Wallet size={22} className="fill-white/20" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Financial Settlements &amp; Bank Reconciliation
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Track claim approvals, TPA settlement advice notes, UTR payments, and bank statement matching.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefresh}
              className="bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin text-amber-600" : "text-slate-500"} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => notify("Exporting Financial Reconciliation Statement (Excel/PDF)…", "success")}
              className="bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Download size={14} className="text-slate-500" />
              <span>Export Statement</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (rawRows.length > 0) setOpen(rawRows[0].id)
                else notify("Select a claim from the table to record payment.", "info" as any)
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Plus size={15} />
              <span>Record Payment UTR</span>
            </button>
          </div>
        </div>

        {/* ── 2. EXECUTIVE FINANCIAL KPI CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Total Expected Recovery */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Wallet size={16} />
                </div>
                <span className="text-xs font-semibold text-slate-500 truncate">Total Expected Recovery</span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-slate-900 tracking-tight">{inr(totals.dueAmount)}</span>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                  {totals.dueCount} Claims
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Pending from TPA &amp; Insurers</p>
            </div>
          </div>

          {/* Card 2: Received This Month */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <span className="text-xs font-semibold text-slate-500 truncate">Received (This Month)</span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-emerald-700 tracking-tight">{inr(totals.monthReceived)}</span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                  95.2% Recovery
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Cleared via bank UTR</p>
            </div>
          </div>

          {/* Card 3: Overdue Payments */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} />
                </div>
                <span className="text-xs font-semibold text-slate-500 truncate">Overdue Payments</span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-rose-700 tracking-tight">{inr(totals.overdueAmount)}</span>
                <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                  {totals.overdueCount} Overdue
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Exceeded insurer SLA limit</p>
            </div>
          </div>

          {/* Card 4: Insurer Deductions */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <CreditCard size={16} />
                </div>
                <span className="text-xs font-semibold text-slate-500 truncate">TPA Disallowances</span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-black text-slate-900 tracking-tight">{inr(totals.deducted)}</span>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
                  Non-Medical
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Room rent &amp; GIPSA deductions</p>
            </div>
          </div>
        </div>

        {/* ── 3. RECONCILIATION STAGE STEPPER & FILTERS ── */}
        <div className="space-y-4">
          {/* Stage Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {STEPS.map((s) => {
              const count = cases.filter(s.match).length
              const isActive = step === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-extrabold ${isActive ? "text-white" : "text-slate-900"}`}>
                      {s.label}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                  <p className={`text-[10.5px] mt-1.5 truncate ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                    {s.sub}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Patient Name, Claim ID, UTR #, or Insurer…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium transition-all"
                />
              </div>

              {/* Insurer Selector */}
              <select
                value={selectedInsurer}
                onChange={(e) => setSelectedInsurer(e.target.value)}
                className="h-9 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 text-slate-700 font-semibold focus:outline-none focus:bg-white cursor-pointer"
              >
                <option value="">All TPAs &amp; Insurers</option>
                {insurersList.map((ins) => (
                  <option key={ins} value={ins}>
                    {ins}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs font-semibold text-slate-500">
              Showing <span className="font-bold text-slate-900">{rows.length}</span> settlement records
            </span>
          </div>
        </div>

        {/* ── 4. DETAILED RECONCILIATION TABLE ── */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Wallet size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">No settlement records found at this stage</p>
              <p className="text-[11.5px] text-slate-400 mt-0.5">Try selecting another stage step or clearing filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Patient &amp; Claim ID</th>
                    <th className="py-3 px-4">Insurer / TPA Network</th>
                    <th className="py-3 px-4 text-right">Claimed (Bill)</th>
                    <th className="py-3 px-4 text-right">Approved (TPA)</th>
                    <th className="py-3 px-4 text-right">Received (Bank)</th>
                    <th className="py-3 px-4 text-right">Variance / Deductions</th>
                    <th className="py-3 px-4">UTR / Advice Reference</th>
                    <th className="py-3 px-4 text-right">Payment SLA / Date</th>
                    <th className="py-3 px-4 text-center">Action Desk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {rows.map((c) => {
                    const exp = expectedOf(c)
                    const rec = c.settlement?.receivedAmount ?? 0
                    const diff = rec ? rec - exp : 0
                    const late = c.status === "SETTLEMENT_PENDING" && c.settlement?.expectedBy && daysUntil(c.settlement.expectedBy) < 0
                    const insBadge = INSURER_BADGES[c.policy.insurerName] || {
                      bg: "bg-amber-700",
                      text: "text-white font-black",
                      label: c.policy.insurerName.slice(0, 4).toUpperCase(),
                    }

                    return (
                      <tr
                        key={c.id}
                        onClick={() => setOpen(c.id)}
                        className="hover:bg-amber-50/30 transition-colors cursor-pointer"
                      >
                        {/* Patient & Claim ID */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 hover:text-amber-700 transition-colors">
                            {c.patientName}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10.5px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                              {c.id}
                            </span>
                            <span className="text-[10.5px] font-semibold text-slate-400">
                              {c.encounterType || "ICU"}
                            </span>
                          </div>
                        </td>

                        {/* Insurer / TPA Network */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider shrink-0 ${insBadge.bg} ${insBadge.text}`}>
                              {insBadge.label}
                            </span>
                            <span className="font-semibold text-slate-800 text-xs truncate max-w-[150px]">
                              {c.policy.insurerName}
                            </span>
                          </div>
                        </td>

                        {/* Claimed Amount */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-700">
                          {inr(c.finalClaimAmount)}
                        </td>

                        {/* Approved Amount */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                          {inr(exp)}
                        </td>

                        {/* Received Amount */}
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-700">
                          {rec ? inr(rec) : "—"}
                        </td>

                        {/* Variance / Deductions */}
                        <td className="py-3.5 px-4 text-right font-mono font-bold">
                          {rec ? (
                            diff < 0 ? (
                              <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                Short {inr(diff)}
                              </span>
                            ) : diff > 0 ? (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Excess +{inr(diff)}
                              </span>
                            ) : (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                ✓ Matched (₹0)
                              </span>
                            )
                          ) : c.settlement?.deductionsAmount ? (
                            <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              Cut {inr(c.settlement.deductionsAmount)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* UTR / Advice Reference */}
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-700 font-semibold">
                          {c.settlement?.paymentReferenceNo ? (
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-900">
                              {c.settlement.paymentReferenceNo}
                            </span>
                          ) : c.settlement?.settlementAdviceNo ? (
                            <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                              {c.settlement.settlementAdviceNo}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Pending UTR</span>
                          )}
                        </td>

                        {/* Payment SLA / Date */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {c.settlement?.paymentDate ? (
                            <span className="font-mono text-emerald-700 font-bold">
                              {fmtDate(c.settlement.paymentDate)}
                            </span>
                          ) : c.settlement?.expectedBy ? (
                            <span
                              className={`font-semibold px-2 py-0.5 rounded ${
                                late ? "bg-rose-100 text-rose-700 font-bold" : "bg-amber-50 text-amber-800"
                              }`}
                            >
                              {late ? `OVERDUE (due ${fmtDate(c.settlement.expectedBy)})` : `Due ${fmtDate(c.settlement.expectedBy)}`}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Action Desk */}
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setOpen(c.id)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-xl transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>
                              {step === "advice"
                                ? "Record Advice"
                                : step === "expected"
                                ? "Record UTR"
                                : step === "reconcile"
                                ? "Match Bank"
                                : "View Details"}
                            </span>
                            <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SettlementDrawer({
  c,
  notify,
  onClose,
  onOpenClaim,
}: {
  c: ComprehensiveClaimRecord
  notify: ReturnType<typeof useNotify>["notify"]
  onClose: () => void
  onOpenClaim: () => void
}) {
  const s = c.settlement
  const exp = expectedOf(c)
  const insBadge = INSURER_BADGES[c.policy.insurerName] || {
    bg: "bg-amber-700",
    text: "text-white font-black",
    label: c.policy.insurerName.slice(0, 4).toUpperCase(),
  }

  return (
    <Drawer title={c.patientName} subtitle={`Claim #${c.id} • ${c.policy.insurerName}`} onClose={onClose}>
      <div className="space-y-6">
        {/* Header Status & Claim Jump */}
        <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${insBadge.bg} ${insBadge.text}`}>
              {insBadge.label}
            </span>
            <StatusPill status={c.status} />
          </div>

          <button
            type="button"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-xs"
            onClick={onOpenClaim}
          >
            <Sparkles size={12} />
            <span>Open Claim Workspace</span>
          </button>
        </div>

        {/* Financial Overview 4-Box Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="text-[11px] font-bold uppercase text-slate-400">Hospital Claim Bill</div>
            <div className="text-base font-extrabold text-slate-900 mt-0.5 font-mono">{inr(c.finalClaimAmount)}</div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
            <div className="text-[11px] font-bold uppercase text-blue-700">TPA Approved Amount</div>
            <div className="text-base font-extrabold text-blue-900 mt-0.5 font-mono">{inr(exp)}</div>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
            <div className="text-[11px] font-bold uppercase text-emerald-700">Received Bank Payment</div>
            <div className="text-base font-extrabold text-emerald-900 mt-0.5 font-mono">{s?.receivedAmount ? inr(s.receivedAmount) : "—"}</div>
          </div>

          <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl">
            <div className="text-[11px] font-bold uppercase text-purple-700">Insurer Deductions</div>
            <div className="text-base font-extrabold text-purple-900 mt-0.5 font-mono">{s?.deductionsAmount ? inr(s.deductionsAmount) : "—"}</div>
          </div>
        </div>

        {/* Detailed Key Values */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs space-y-2">
          <h4 className="text-xs font-extrabold text-slate-900 border-b border-slate-100 pb-2 mb-2">
            Settlement &amp; Bank UTR Identifiers
          </h4>
          <KV k="Settlement Advice No." v={s?.settlementAdviceNo || "—"} />
          <KV k="UTR / Payment Reference" v={s?.paymentReferenceNo || "—"} mono />
          <KV k="Payment Date" v={s?.paymentDate ? fmtDate(s.paymentDate) : s?.expectedBy ? `expected ${fmtDate(s.expectedBy)}` : "—"} />
          <KV k="Reconciliation Status" v={s?.reconciliationStatus ?? "—"} />
        </div>

        {/* Deduction Reasons Breakdown */}
        {!!s?.deductionReasons?.length && (
          <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-rose-600" /> Insurer Disallowances Breakdown
            </div>
            {s.deductionReasons.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs text-rose-950 font-medium py-1 border-b border-rose-100/70 last:border-0">
                <span>
                  {d.category}
                  {d.remark ? ` — ${d.remark}` : ""}
                </span>
                <span className="font-mono font-bold">{inr(d.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Interactive Action Forms */}
        <div className="border-t border-slate-200/80 pt-5">
          {(c.status === "APPROVED" || c.status === "PARTIALLY_APPROVED") && (
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                Step 1: Record Settlement Advice Note
              </h4>
              <SettlementAdviceForm c={c} notify={notify} />
            </div>
          )}
          {c.status === "SETTLEMENT_PENDING" && (
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                Step 2: Record Bank UTR Payment Received
              </h4>
              <PaymentForm c={c} notify={notify} />
            </div>
          )}
          {c.status === "PAYMENT_RECEIVED" && (
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                Step 3: Match with Bank Statement &amp; Reconcile
              </h4>
              {s?.reconciliationStatus !== "Received" && (
                <Hint tone="amber">
                  The payment is {s?.reconciliationStatus === "Short Payment" ? "less" : "more"} than the settlement advice — explain the variance before reconciling.
                </Hint>
              )}
              <ReconcileForm c={c} notify={notify} />
            </div>
          )}
          {c.status === "RECONCILED" && (
            <button
              type="button"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              onClick={() => attempt(notify, () => E.closeClaim(c.id), "Claim closed.")}
            >
              <CheckCircle2 size={15} /> Close &amp; Archive Claim Settlement
            </button>
          )}
          {c.status === "CLOSED" && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>This claim settlement is fully reconciled and closed in archives.</span>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
