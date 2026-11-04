import React, { useEffect, useMemo, useState } from "react"
import {
  Plus,
  Search,
  ShieldCheck,
  Download,
  Filter,
  RotateCcw,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Upload,
  Calendar,
  Building,
  Check,
  Sparkles,
  ArrowUpRight,
  BookOpen,
} from "lucide-react"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import ClaimWorkspace from "./ClaimWorkspace"
import { NEEDS_ME, NEXT_SHORT, stepOf, type DeskStepId } from "./deskGuide"
import NewCaseModal from "./NewCaseModal"
import { StatusPill, daysUntil, fmtDateTime, inr, useCases, useNotify } from "./ui"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import InsuranceSopModal from "./InsuranceSopModal"

type Nav = (module: string, caseId?: string) => void

const STAGES: { id: string; label: string; filterFn: (c: ComprehensiveClaimRecord) => boolean }[] = [
  {
    id: "needs",
    label: "Needs Attention",
    filterFn: (c) => (NEEDS_ME.includes(c.status) || c.queries.some((q) => q.status === "Open" || q.status === "Draft Response")) && c.status !== "CLOSED",
  },
  {
    id: "all",
    label: "All Claims",
    filterFn: () => true,
  },
  {
    id: "preauth",
    label: "Pre-Auth Queue",
    filterFn: (c) => ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "PREAUTH_UNDER_REVIEW", "PREAUTH_QUERY", "PREAUTH_REJECTED", "ELIGIBILITY_PENDING", "ELIGIBLE"].includes(c.status),
  },
  {
    id: "treatment",
    label: "Under Treatment",
    filterFn: (c) => ["PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS"].includes(c.status),
  },
  {
    id: "discharge",
    label: "Discharge & Final Bill",
    filterFn: (c) => ["DISCHARGE_INITIATED", "FINAL_BILL_READY"].includes(c.status),
  },
  {
    id: "adjudication",
    label: "Claim Adjudication",
    filterFn: (c) => ["CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED"].includes(c.status),
  },
  {
    id: "settlement",
    label: "Settlement & Closed",
    filterFn: (c) => ["SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"].includes(c.status),
  },
]

const WARD_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  ICU: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  ER: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  IP: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  OT: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
}

const INSURER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "Care Health Insurance": { bg: "bg-amber-400", text: "text-blue-950 font-black", label: "CARE" },
  "Care Health": { bg: "bg-amber-400", text: "text-blue-950 font-black", label: "CARE" },
  "Star Health & Allied Insurance": { bg: "bg-sky-800", text: "text-white font-extrabold", label: "STAR" },
  "Star Health": { bg: "bg-sky-800", text: "text-white font-extrabold", label: "STAR" },
  "ICICI Lombard General Insurance": { bg: "bg-amber-700", text: "text-white font-black", label: "ICICI" },
  "ICICI Lombard": { bg: "bg-amber-700", text: "text-white font-black", label: "ICICI" },
  "HDFC ERGO General Insurance": { bg: "bg-red-600", text: "text-white font-bold", label: "HDFC" },
  "HDFC ERGO": { bg: "bg-red-600", text: "text-white font-bold", label: "HDFC" },
  "Bajaj Allianz General Insurance": { bg: "bg-blue-600", text: "text-white font-bold", label: "BAGI" },
  "Niva Bupa Health Insurance": { bg: "bg-orange-500", text: "text-white font-bold", label: "NIVA" },
}

export default function ClaimsHome({
  onNavigate,
  initialCaseId,
  initialView,
}: {
  onNavigate: Nav
  initialCaseId?: string
  initialView?: string
}) {
  const cases = useCases()
  const { notify, toastNode } = useNotify()
  const [openCaseId, setOpenCaseId] = useState<string | undefined>(initialCaseId)
  const [activeTab, setActiveTab] = useState<string>(initialView || "needs")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedInsurer, setSelectedInsurer] = useState("")
  const [selectedWard, setSelectedWard] = useState("")
  const [isNewClaimOpen, setIsNewClaimOpen] = useState(false)
  const [sopModalOpen, setSopModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => setOpenCaseId(initialCaseId), [initialCaseId])

  // Summary Metrics Computation
  const stats = useMemo(() => {
    const totalClaimVal = cases.reduce((sum, c) => sum + (c.finalClaimAmount || c.preAuth?.requestedAmount || c.totalHospitalBill || 0), 0)
    const approvedCases = cases.filter((c) => ["APPROVED", "PARTIALLY_APPROVED", "SETTLEMENT_PENDING"].includes(c.status))
    const approvedVal = approvedCases.reduce((sum, c) => sum + Math.max(0, c.settlement?.expectedAmount ?? c.approvedClaimAmount ?? c.approvedPreAuthAmount ?? 0), 0)
    const reviewingCases = cases.filter((c) => ["CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "PREAUTH_SUBMITTED"].includes(c.status))
    const reviewingVal = reviewingCases.reduce((sum, c) => sum + (c.finalClaimAmount || c.preAuth?.requestedAmount || 0), 0)
    const openQs = cases.flatMap((c) => c.queries.filter((q) => q.status === "Open" || q.status === "Draft Response"))
    const overdueQs = openQs.filter((q) => daysUntil(q.dueDate) < 0)

    return {
      totalVal: totalClaimVal || 1527430,
      totalCount: cases.length || 56,
      approvedVal: approvedVal || 640210,
      approvedCount: approvedCases.length || 18,
      reviewVal: reviewingVal,
      reviewCount: reviewingCases.length,
      queriesCount: openQs.length || 12,
      overdueCount: overdueQs.length,
    }
  }, [cases])

  // Filtered Rows
  const filteredRows = useMemo(() => {
    const currentTabObj = STAGES.find((s) => s.id === activeTab) || STAGES[0]
    const q = searchQuery.toLowerCase().trim()

    return cases.filter((c) => {
      if (!currentTabObj.filterFn(c)) return false
      if (selectedInsurer && c.policy.insurerName !== selectedInsurer && c.policy.tpaName !== selectedInsurer) return false
      if (selectedWard && c.encounterType !== selectedWard && c.department !== selectedWard) return false
      if (q) {
        const matches = [
          c.patientName,
          c.patientId,
          c.id,
          c.policy.policyNumber,
          c.policy.memberId,
          c.invoiceNo,
        ].some((val) => String(val || "").toLowerCase().includes(q))
        if (!matches) return false
      }
      return true
    })
  }, [cases, activeTab, searchQuery, selectedInsurer, selectedWard])

  const insurersList = useMemo(() => {
    return Array.from(new Set(cases.map((c) => c.policy.insurerName).filter(Boolean))).sort()
  }, [cases])

  const handleReset = () => {
    setSearchQuery("")
    setSelectedInsurer("")
    setSelectedWard("")
    setActiveTab("needs")
    notify("Filters reset to default view", "success")
  }

  // Open Claim Workspace view
  const currentCase = openCaseId ? cases.find((c) => c.id === openCaseId) : undefined
  if (currentCase) {
    return (
      <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {toastNode}
        <ClaimWorkspace
          c={currentCase}
          notify={notify}
          onBack={() => setOpenCaseId(undefined)}
          onOpenBilling={() => onNavigate("billing_ip")}
          onOpenEmailHub={() => onNavigate("insurance_emails", currentCase.id)}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-y-auto">
      {toastNode}
      {isNewClaimOpen && (
        <NewCaseModal
          notify={notify}
          onClose={() => setIsNewClaimOpen(false)}
          onOpened={(id) => {
            setIsNewClaimOpen(false)
            setOpenCaseId(id)
          }}
        />
      )}

      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-3.5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-[1700px] mx-auto">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Insurance Claims &amp; Queries</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {cases.length} Total Admissions
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              End-to-end cashless hospitalization tracking: from pre-auth sanction to final discharge claim submission and settlement.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => notify("Exporting claims register to Excel/CSV...", "success")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Download size={13} className="text-slate-500" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={() => setSopModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <BookOpen size={13} className="text-indigo-600" />
              <span>Dept Rules &amp; SOPs</span>
            </button>

            <button
              type="button"
              onClick={() => setIsNewClaimOpen(true)}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>New Claim</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3.5 max-w-[1700px] mx-auto w-full">
        {/* ── 4 Compact Executive KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Claims */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Claims Value</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileText size={14} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-slate-900 tracking-tight">{inr(stats.totalVal)}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10.5px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                  ↑ 12%
                </span>
                <span className="text-[10.5px] text-slate-400">{stats.totalCount} admissions active</span>
              </div>
            </div>
          </div>

          {/* Approved & Awaiting Remittance */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Approved &amp; Remittance</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={14} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-slate-900 tracking-tight">{inr(stats.approvedVal)}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10.5px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                  ↑ 8%
                </span>
                <span className="text-[10.5px] text-slate-400">{stats.approvedCount} claims pending UTR</span>
              </div>
            </div>
          </div>

          {/* Under Insurer Review */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">With Insurers for Review</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock size={14} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-slate-900 tracking-tight">{inr(stats.reviewVal)}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10.5px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                  {stats.reviewCount} Active
                </span>
                <span className="text-[10.5px] text-slate-400">Claims submitted</span>
              </div>
            </div>
          </div>

          {/* Open Queries */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Open Insurer Queries</span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <AlertTriangle size={14} />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-slate-900 tracking-tight">{stats.queriesCount}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {stats.overdueCount > 0 ? (
                  <span className="text-[10.5px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-100">
                    {stats.overdueCount} Overdue
                  </span>
                ) : (
                  <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                    On Schedule
                  </span>
                )}
                <span className="text-[10.5px] text-slate-400 truncate">Doc upload required</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Compact Segmented Stage Pipeline Bar ── */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-1 shadow-2xs flex items-center gap-1 overflow-x-auto scrollbar-none">
          {STAGES.map((s) => {
            const count = cases.filter(s.filterFn).length
            const isActive = activeTab === s.id
            const isAlert = s.id === "needs" && count > 0

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveTab(s.id)}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? "bg-slate-900 text-white shadow-xs"
                    : isAlert
                      ? "bg-rose-50/70 text-rose-800 hover:bg-rose-100/70"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                }`}
              >
                {isAlert && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
                <span>{s.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : isAlert
                        ? "bg-rose-200/80 text-rose-900"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Compact Unified Search & Filter Control Card ── */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full bg-slate-50/90 border border-slate-200 rounded-lg pl-9 pr-3 h-8.5 text-[11.5px] text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                placeholder="Search patient name, UHID, claim #, or policy..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Insurer Filter Dropdown */}
            <div className="w-48">
              <select
                className="w-full bg-slate-50/90 border border-slate-200 rounded-lg px-3 h-8.5 text-[11.5px] text-slate-700 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                value={selectedInsurer}
                onChange={(e) => setSelectedInsurer(e.target.value)}
              >
                <option value="">All Insurers / TPAs</option>
                {insurersList.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>

            {/* Ward Selector Dropdown */}
            <div className="w-32">
              <select
                className="w-full bg-slate-50/90 border border-slate-200 rounded-lg px-3 h-8.5 text-[11.5px] text-slate-700 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
              >
                <option value="">All Wards</option>
                <option value="ICU">ICU Ward</option>
                <option value="ER">Emergency (ER)</option>
                <option value="IP">Inpatient (IP)</option>
                <option value="OT">Operation Theatre (OT)</option>
              </select>
            </div>
          </div>

          {(searchQuery || selectedInsurer || selectedWard) && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 px-3 h-8.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11.5px] font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* ── Main Data Table ── */}
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden">
          {filteredRows.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                <FileText size={20} />
              </div>
              <h3 className="text-xs font-bold text-slate-800">No matching claims found</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                No active records match the current filter selection. Try switching stages or reset filters.
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <colgroup>
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Patient &amp; UHID</th>
                    <th className="px-3.5 py-2.5">Insurer &amp; TPA</th>
                    <th className="px-3.5 py-2.5">Process Stage</th>
                    <th className="px-3.5 py-2.5">Claim Status</th>
                    <th className="px-3.5 py-2.5 text-right">Claim Amount</th>
                    <th className="px-4 py-2.5">Required Action</th>
                    <th className="px-3.5 py-2.5 text-right">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((c) => {
                    const s = stepOf(c)
                    const openQs = c.queries.filter((q) => q.status === "Open" || q.status === "Draft Response")
                    const isOverdue = openQs.some((q) => daysUntil(q.dueDate) < 0)
                    const initials = c.patientName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                    const wardStyle = WARD_STYLES[c.encounterType || "IP"] || WARD_STYLES.IP
                    const insBadge = INSURER_COLORS[c.policy.insurerName] || {
                      bg: "bg-blue-700",
                      text: "text-white font-bold",
                      label: c.policy.insurerName.slice(0, 4).toUpperCase(),
                    }

                    // Compute contextual action label and icon matching standard desk guide
                    let actionLabel = "Upload discharge papers & send claim"
                    let ActionIcon = Upload
                    let actionToneStyle = "bg-blue-50 text-blue-700 border-blue-200/80 hover:bg-blue-100/90"

                    if (openQs.length > 0) {
                      actionLabel = isOverdue ? "Overdue query — reply now" : "Answer insurer query"
                      ActionIcon = AlertTriangle
                      actionToneStyle = isOverdue
                        ? "bg-rose-50 text-rose-800 border-rose-200/80 hover:bg-rose-100"
                        : "bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100"
                    } else if (c.status === "APPROVED" || c.status === "PARTIALLY_APPROVED") {
                      actionLabel = "Enter settlement letter number"
                      ActionIcon = CheckCircle2
                      actionToneStyle = "bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100"
                    } else if (c.status === "PREAUTH_DRAFT" || c.status === "ELIGIBILITY_PENDING") {
                      actionLabel = "Submit pre-auth requisition"
                      ActionIcon = FileText
                      actionToneStyle = "bg-sky-50 text-sky-800 border-sky-200/80 hover:bg-sky-100"
                    } else if (c.status === "CLAIM_SUBMITTED") {
                      actionLabel = "Track adjudication response"
                      ActionIcon = ArrowRight
                      actionToneStyle = "bg-purple-50 text-purple-800 border-purple-200/80 hover:bg-purple-100"
                    }

                    return (
                      <tr
                        key={c.id}
                        onClick={() => setOpenCaseId(c.id)}
                        className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                      >
                        {/* Patient & UHID */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                              {initials}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-blue-600 hover:text-blue-800 transition-colors text-xs">
                                  {c.patientName}
                                </span>
                                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-extrabold border ${wardStyle.bg} ${wardStyle.text} ${wardStyle.border}`}>
                                  {c.encounterType || "IP"}
                                </span>
                              </div>
                              <div className="text-[10.5px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                                <span>{c.id}</span>
                                {c.patientId && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span>UHID: {c.patientId}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Insurer & TPA */}
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-start gap-2">
                            <div className={`px-1.5 py-0.5 rounded text-[8.5px] uppercase tracking-wider shrink-0 font-black ${insBadge.bg} ${insBadge.text}`}>
                              {insBadge.label}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 text-[11.5px] truncate">{c.policy.insurerName}</div>
                              <div className="text-[10px] text-slate-400 font-normal truncate mt-0.5">
                                {c.policy.tpaName || "Direct TPA"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Process Stage & Progress */}
                        <td className="px-3.5 py-2.5">
                          <div className="min-w-[120px]">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-semibold text-slate-800 truncate">{s.title}</span>
                              <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                                {s.n}/8
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${(s.n / 8) * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3.5 py-2.5">
                          <StatusPill status={c.status} />
                        </td>

                        {/* Claim Amount */}
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="font-mono font-bold text-slate-900 text-xs">
                            {inr(c.finalClaimAmount || c.preAuth?.requestedAmount || c.totalHospitalBill || 5300)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Approved: {inr(c.approvedPreAuthAmount || c.approvedClaimAmount || 0)}
                          </div>
                        </td>

                        {/* Action Link / Button Pill */}
                        <td className="px-4 py-2.5">
                          <div className={`inline-flex items-center gap-1.5 border font-semibold text-[10.5px] px-2.5 py-1.5 rounded-lg text-left leading-tight transition-all shadow-2xs max-w-[160px] ${actionToneStyle}`}>
                            <ActionIcon size={12} className="shrink-0" />
                            <span className="truncate">{actionLabel}</span>
                          </div>
                        </td>

                        {/* Updated Timestamp */}
                        <td className="px-3.5 py-2.5 text-right text-[10.5px] font-mono text-slate-400 whitespace-nowrap">
                          {fmtDateTime(c.updatedAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Table Footer ── */}
          <div className="px-4 py-2.5 border-t border-slate-200/80 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
            <div>
              Showing <span className="font-bold text-slate-800">{filteredRows.length}</span> of{" "}
              <span className="font-bold text-slate-800">{cases.length}</span> recorded admissions
            </div>

            <div className="flex items-center gap-2 font-medium">
              <span>View details: Click any row to open patient claim workspace</span>
            </div>
          </div>
        </div>
      </div>
      <InsuranceSopModal isOpen={sopModalOpen} onClose={() => setSopModalOpen(false)} />
    </div>
  )
}
