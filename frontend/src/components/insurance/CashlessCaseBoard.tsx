import React, { useMemo, useState } from "react"
import {
  Search, Filter, Grid, List, ChevronRight, Clock, FileText,
  Upload, Shield, AlertTriangle, CheckCircle2, MoreVertical,
  Users, Building2, Bed, Calendar, TrendingUp
} from "lucide-react"
import { StatusPill, inr, fmtDate, useCases, btn } from "./ui"
import { InsuranceEngineService, STATUS_META } from "../../services/insuranceDb"
import type { ComprehensiveClaimRecord, InsuranceClaimStatus } from "../../types/insurance"

// Insurer logo chip
function InsurerBadge({ name }: { name: string }) {
  const abbr = name.slice(0, 4).toUpperCase()
  const colors: Record<string, string> = {
    "Star": "bg-red-600 text-white",
    "Care": "bg-amber-400 text-blue-950",
    "HDFC": "bg-rose-700 text-white",
    "Niva": "bg-blue-600 text-white",
    "Adit": "bg-amber-600 text-white",
  }
  const colorKey = Object.keys(colors).find(k => name.startsWith(k)) ?? ""
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9.5px] font-black ${colors[colorKey] || "bg-slate-200 text-slate-700"}`}>
      {abbr}
    </span>
  )
}

// Utilisation bar
function UtilBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${pct >= 80 ? "text-rose-600" : "text-slate-600"}`}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}

// Stage filter tabs
const STAGES: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "preauth", label: "Pre-Auth" },
  { key: "admitted", label: "Admitted" },
  { key: "discharge", label: "Discharge" },
  { key: "claim", label: "Claim" },
  { key: "settled", label: "Settled" },
  { key: "docs_missing", label: "Docs Missing" },
  { key: "limit_80", label: "> 80% Limit" },
]

// Demo seed rows (shown when store is empty)
const DEMO_CASES = [
  { id: "INS20260001", patientName: "Ramesh Kumar", mrn: "UH001256", insurerName: "Care Health Insurance", status: "TREATMENT_IN_PROGRESS" as InsuranceClaimStatus, approved: 85000, billed: 71000, docs: 9, bed: "Gen Ward / 305", admDate: "2026-09-28", dept: "General Surgery" },
  { id: "INS20260002", patientName: "Sita Devi", mrn: "UH001189", insurerName: "Star Health Insurance", status: "PREAUTH_SUBMITTED" as InsuranceClaimStatus, approved: 65000, billed: 0, docs: 7, bed: "Semi-Pvt / 201", admDate: "2026-09-29", dept: "Gynecology" },
  { id: "INS20260003", patientName: "Mahesh Babu", mrn: "UH001303", insurerName: "HDFC ERGO General Insurance", status: "CLAIM_SUBMITTED" as InsuranceClaimStatus, approved: 120000, billed: 115000, docs: 11, bed: "ICU / 01", admDate: "2026-09-26", dept: "Cardiology" },
  { id: "INS20260004", patientName: "Ananya Sharma", mrn: "UH001401", insurerName: "Niva Bupa Health Insurance", status: "PREAUTH_APPROVED" as InsuranceClaimStatus, approved: 95000, billed: 42000, docs: 8, bed: "Pvt AC / 410", admDate: "2026-09-30", dept: "Orthopedics" },
  { id: "INS20260005", patientName: "Vijay Reddy", mrn: "UH001522", insurerName: "Star Health Insurance", status: "SETTLEMENT_PENDING" as InsuranceClaimStatus, approved: 78000, billed: 76000, docs: 11, bed: "Gen Ward / 312", admDate: "2026-09-24", dept: "Urology" },
  { id: "INS20260006", patientName: "Kavya Reddy", mrn: "UH001677", insurerName: "Care Health Insurance", status: "PREAUTH_QUERY" as InsuranceClaimStatus, approved: 55000, billed: 0, docs: 6, bed: "Semi-Pvt / 215", admDate: "2026-10-01", dept: "Ophthalmology" },
  { id: "INS20260007", patientName: "Arjun Nair", mrn: "UH001788", insurerName: "HDFC ERGO General Insurance", status: "DISCHARGE_INITIATED" as InsuranceClaimStatus, approved: 180000, billed: 175000, docs: 10, bed: "ICU / 03", admDate: "2026-09-22", dept: "Neuro Surgery" },
  { id: "INS20260008", patientName: "Priya Venkat", mrn: "UH001889", insurerName: "Niva Bupa Health Insurance", status: "FINAL_BILL_READY" as InsuranceClaimStatus, approved: 62000, billed: 60000, docs: 11, bed: "Gen Ward / 307", admDate: "2026-09-27", dept: "ENT" },
]

export default function CashlessCaseBoard({
  onOpenCase,
  onOpenIntake,
}: {
  onOpenCase: (id: string) => void
  onOpenIntake: () => void
}) {
  const cases = useCases()
  const [tab, setTab] = useState("all")
  const [q, setQ] = useState("")
  const [insurerFilter, setInsurerFilter] = useState("")
  const [wardFilter, setWardFilter] = useState("")
  const [viewMode, setViewMode] = useState<"table" | "card">("table")

  const insurers = useMemo(() => {
    const set = new Set<string>()
    cases.forEach(c => set.add(c.policy.insurerName))
    if (set.size === 0) DEMO_CASES.forEach(c => set.add(c.insurerName))
    return Array.from(set)
  }, [cases])

  const displayCases = useMemo(() => {
    const src = cases.length > 0 ? cases : null
    if (!src) {
      // Filter demo data
      let d = DEMO_CASES
      if (q) d = d.filter(c => c.patientName.toLowerCase().includes(q.toLowerCase()) || c.mrn.toLowerCase().includes(q.toLowerCase()))
      if (insurerFilter) d = d.filter(c => c.insurerName === insurerFilter)
      if (tab === "preauth") d = d.filter(c => c.status.startsWith("PREAUTH"))
      if (tab === "admitted") d = d.filter(c => c.status === "TREATMENT_IN_PROGRESS" || c.status === "PREAUTH_APPROVED")
      if (tab === "discharge") d = d.filter(c => c.status === "DISCHARGE_INITIATED" || c.status === "FINAL_BILL_READY")
      if (tab === "claim") d = d.filter(c => c.status === "CLAIM_SUBMITTED" || c.status === "CLAIM_QUERY_RAISED")
      if (tab === "settled") d = d.filter(c => c.status === "SETTLEMENT_PENDING" || c.status === "RECONCILED" || c.status === "CLOSED")
      if (tab === "docs_missing") d = d.filter(c => c.docs < 11)
      if (tab === "limit_80") d = d.filter(c => c.billed > 0 && c.approved > 0 && (c.billed / c.approved) > 0.8)
      return d
    }

    return src.filter(c => {
      if (q) {
        const t = q.toLowerCase()
        if (!c.patientName.toLowerCase().includes(t) && !c.patientId.toLowerCase().includes(t) && !c.id.toLowerCase().includes(t)) return false
      }
      if (insurerFilter && c.policy.insurerName !== insurerFilter) return false
      if (tab === "preauth" && !c.status.startsWith("PREAUTH")) return false
      if (tab === "admitted" && c.status !== "TREATMENT_IN_PROGRESS" && c.status !== "PREAUTH_APPROVED") return false
      if (tab === "discharge" && c.status !== "DISCHARGE_INITIATED" && c.status !== "FINAL_BILL_READY") return false
      if (tab === "claim" && c.status !== "CLAIM_SUBMITTED" && c.status !== "CLAIM_QUERY_RAISED") return false
      if (tab === "settled" && c.status !== "SETTLEMENT_PENDING" && c.status !== "RECONCILED" && c.status !== "CLOSED") return false
      if (tab === "docs_missing") {
        const docs = c.documents?.filter((d: any) => d.status === "Uploaded" || d.status === "Verified" || d.status === "uploaded" || d.status === "verified").length ?? 0
        if (docs >= 11) return false
      }
      if (tab === "limit_80") {
        const pct = c.approvedPreAuthAmount > 0 ? (c.consumedBillAmount / c.approvedPreAuthAmount) * 100 : 0
        if (pct < 80) return false
      }
      return true
    })
  }, [cases, q, insurerFilter, tab])

  // Tab counts
  const counts = useMemo(() => {
    const src = cases.length > 0 ? cases : DEMO_CASES
    const isReal = cases.length > 0
    const preauthPending = isReal
      ? src.filter((c: any) => c.status?.startsWith("PREAUTH")).length
      : DEMO_CASES.filter(c => c.status.startsWith("PREAUTH")).length
    const limit80 = isReal
      ? src.filter((c: any) => c.approvedPreAuthAmount > 0 && (c.consumedBillAmount / c.approvedPreAuthAmount) > 0.8).length
      : DEMO_CASES.filter(c => c.billed > 0 && c.approved > 0 && (c.billed / c.approved) > 0.8).length
    const docsMissing = isReal
      ? src.filter((c: any) => (c.documents?.filter((d: any) => d.status === "uploaded" || d.status === "verified").length ?? 0) < 11).length
      : DEMO_CASES.filter(c => c.docs < 11).length

    return { preauthPending, limit80, docsMissing, total: src.length }
  }, [cases])

  const admDays = (date: string) => {
    const d = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
    return `Day ${d + 1}`
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/70 overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium mb-1">
            <Shield size={13} /> Insurance &rsaquo; Cashless Case Board
          </div>
          <h1 className="text-xl font-bold text-slate-900">Cashless Case Board</h1>
          <p className="text-xs text-slate-500 mt-0.5">Live digital whiteboard — {counts.total} active insurance cases</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setViewMode(viewMode === "table" ? "card" : "table")} className={btn.soft}>
            {viewMode === "table" ? <><Grid size={13} /> Card view</> : <><List size={13} /> Table view</>}
          </button>
          <button type="button" onClick={onOpenIntake} className={`${btn.primary} gap-1.5`}>
            <Upload size={14} /> New Intake
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient, MRN, case ID…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full pl-8 pr-3 h-8 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:border-blue-400 outline-none"
          />
        </div>
        <select value={insurerFilter} onChange={e => setInsurerFilter(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white outline-none">
          <option value="">All insurers</option>
          {insurers.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={wardFilter} onChange={e => setWardFilter(e.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white outline-none">
          <option value="">All wards</option>
          <option value="ICU">ICU</option>
          <option value="General Ward">General Ward</option>
          <option value="Semi-Private">Semi-Private</option>
          <option value="Private">Private AC</option>
        </select>
      </div>

      {/* Stage tabs */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex gap-1 overflow-x-auto">
        {STAGES.map(s => {
          const count = s.key === "all" ? counts.total : s.key === "docs_missing" ? counts.docsMissing : s.key === "limit_80" ? counts.limit80 : s.key === "preauth" ? counts.preauthPending : undefined
          const alert = (s.key === "docs_missing" && counts.docsMissing > 0) || (s.key === "limit_80" && counts.limit80 > 0)
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setTab(s.key)}
              className={`h-8 px-3 rounded-md text-[11.5px] font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                tab === s.key ? "bg-blue-600 text-white" : alert ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s.label}
              {count !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === s.key ? "bg-blue-700 text-white" : alert ? "bg-rose-200 text-rose-800" : "bg-slate-100 text-slate-600"}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10.5px]">
                <th className="px-4 py-3 text-left">Patient / MRN</th>
                <th className="px-4 py-3 text-left">Insurer</th>
                <th className="px-4 py-3 text-left">Stage</th>
                <th className="px-4 py-3 text-left">Bed / Ward</th>
                <th className="px-4 py-3 text-left">Admitted</th>
                <th className="px-4 py-3 text-right">Approved</th>
                <th className="px-4 py-3 text-right">Billed</th>
                <th className="px-4 py-3">Utilisation</th>
                <th className="px-4 py-3 text-center">Docs</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(cases.length > 0 ? displayCases as ComprehensiveClaimRecord[] : displayCases).map((row: any, i: number) => {
                const isReal = !!row.policy
                const approvedAmt = isReal ? row.approvedPreAuthAmount : row.approved
                const billedAmt = isReal ? row.consumedBillAmount : row.billed
                const docsCount = isReal ? (row.documents?.filter((d: any) => d.status === "Uploaded" || d.status === "Verified").length ?? 0) : row.docs
                const pct = approvedAmt > 0 ? (billedAmt / approvedAmt) * 100 : 0
                const status = isReal ? row.status : row.status
                const admDate = isReal ? row.admissionDate : row.admDate

                return (
                  <tr
                    key={i}
                    className="hover:bg-blue-50/30 cursor-pointer group"
                    onClick={() => isReal ? onOpenCase(row.id) : onOpenCase(row.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 group-hover:text-blue-700">{row.patientName}</div>
                      <div className="text-slate-400 font-mono text-[10px]">{isReal ? (row.mrn || row.patientId) : row.mrn}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <InsurerBadge name={isReal ? row.policy.insurerName : row.insurerName} />
                        <span className="text-slate-600 text-[11px] truncate max-w-[110px]">{isReal ? row.policy.insurerName : row.insurerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isReal ? (
                        <StatusPill status={status} />
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold inline-flex items-center gap-1 ${
                          status.includes("APPROVED") && !status.includes("PARTIAL") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          status.includes("PENDING") || status.includes("QUERY") ? "bg-amber-50 text-amber-700 border border-amber-200" :
                          status.includes("SUBMITTED") ? "bg-blue-50 text-blue-700 border border-blue-200" :
                          status.includes("TREATMENT") ? "bg-sky-50 text-sky-700 border border-sky-200" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {status.replace(/_/g, " ").toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{isReal ? (row.roomCategory || "—") : row.bed}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{fmtDate(admDate)}</div>
                      <div className="text-slate-400 text-[10px]">{admDays(admDate)}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                      {approvedAmt > 0 ? inr(approvedAmt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {billedAmt > 0 ? inr(billedAmt) : "—"}
                    </td>
                    <td className="px-4 py-3 w-28">
                      {approvedAmt > 0 && billedAmt > 0 ? (
                        <UtilBar pct={pct} />
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold text-[10.5px] ${docsCount >= 11 ? "text-emerald-600" : docsCount < 7 ? "text-rose-600" : "text-amber-700"}`}>
                        {docsCount}/11
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); isReal ? onOpenCase(row.id) : onOpenCase(row.id) }}
                          className="h-6 px-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[10px] border border-blue-200"
                        >
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {displayCases.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No cases match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
