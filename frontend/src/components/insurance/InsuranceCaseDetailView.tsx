import React, { useState } from "react"
import {
  ArrowLeft, AlertTriangle, Upload, PlusCircle, FileText, CheckCircle2,
  Clock, Shield, DollarSign, Activity, UserCheck, Check, ChevronRight,
  TrendingUp, AlertCircle, Send, Download, Printer, MoreHorizontal, Edit3,
  Pill, FlaskConical, Bed, Stethoscope, X
} from "lucide-react"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import { StatusPill, btn, fieldBase, inr, fmtDate, fmtDateTime, useNotify, Hint, KV, Drawer, attempt } from "./ui"
import { InsuranceEngineService } from "../../services/insuranceDb"
import { DESK_STEPS } from "./deskGuide"
import { MailComposer } from "./mail"

type Tab = "current" | "documents" | "emails" | "charges" | "approvals" | "history"

// 8-stage sidebar stepper
function StageRail({ c }: { c: ComprehensiveClaimRecord }) {
  const currentStep = DESK_STEPS.findIndex(s => s.statuses.includes(c.status))
  return (
    <nav className="w-52 shrink-0 bg-white border-r border-slate-100 overflow-y-auto">
      <div className="px-3 py-3 border-b border-slate-100">
        <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">8-Stage Process</div>
      </div>
      {DESK_STEPS.map((step, i) => {
        const done = i < currentStep
        const active = i === currentStep
        const future = i > currentStep
        return (
          <div key={step.id} className={`px-3 py-3 border-b border-slate-50 ${active ? "bg-blue-50" : ""}`}>
            <div className="flex items-start gap-2.5">
              <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                done ? "bg-emerald-500 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 border border-slate-200"
              }`}>
                {done ? <Check size={10} /> : step.n}
              </div>
              <div className="min-w-0">
                <div className={`text-[11.5px] font-semibold ${active ? "text-blue-800" : done ? "text-emerald-700" : "text-slate-500"}`}>
                  {step.title}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{step.short}</div>
              </div>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

// Document row
const DOC_LIST = [
  "Approval Letter",
  "Pre-Authorization Letter",
  "Insurance Card Copy",
  "Patient ID Proof (Aadhaar / PAN)",
  "Patient Photograph",
  "Network Hospital Declaration",
  "Claim Form Part-B",
  "Detailed Final Discharge Summary",
  "Detailed Final Itemized Bill",
  "Investigation & Diagnostic Reports",
  "Central KYC (CKYC)",
]

function DocRow({ n, name, status, file, date, by }: { n: number; name: string; status: "uploaded" | "verified" | "pending"; file?: string; date?: string; by?: string }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{n}</td>
      <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-900">{name}</td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
          status === "verified" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
          status === "uploaded" ? "bg-sky-50 text-sky-700 border border-sky-200" :
          "bg-slate-50 text-slate-500 border border-slate-200"
        }`}>
          {status === "verified" ? "Verified" : status === "uploaded" ? "Uploaded" : "Pending"}
        </span>
      </td>
      <td className="px-4 py-3 text-blue-600 underline text-xs cursor-pointer">{file || "—"}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{date || "—"}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{by || "—"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {status === "pending" && (
            <button type="button" className="h-6 px-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[10px] border border-blue-200">
              Upload
            </button>
          )}
          {status === "uploaded" && (
            <button type="button" className="h-6 px-2 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[10px] border border-emerald-200">
              Verify
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// Enhancement drawer
function EnhancementDrawer({ c, onClose, notify }: { c: ComprehensiveClaimRecord; onClose: () => void; notify: (msg: string, t?: "success" | "error") => void }) {
  const [amt, setAmt] = useState("")
  const [reason, setReason] = useState("")
  const pct = c.approvedPreAuthAmount > 0 ? Math.round((c.consumedBillAmount / c.approvedPreAuthAmount) * 100) : 85

  return (
    <Drawer
      title="Enhancement Request"
      subtitle={`${c.patientName} — current approval ₹${c.approvedPreAuthAmount?.toLocaleString()}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.soft}>Cancel</button>
          <button type="button" onClick={() => { notify("Enhancement request sent to insurer", "success"); onClose() }} className={btn.primary}>
            Send Enhancement Request
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
            <TrendingUp size={15} /> Utilisation Warning
          </div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex-1 h-2.5 bg-amber-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-amber-900 font-black text-sm">{pct}%</span>
          </div>
          <p className="text-xs text-amber-700">Bill is at {pct}% of the approved pre-authorization limit. Request an enhancement before the limit is exceeded.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Additional Amount Required (₹)</label>
            <input type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="e.g. 25000" className={`w-full ${fieldBase}`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Clinical Justification</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Describe the reason for the enhancement: new procedure, extended stay, complications, etc." className="w-full px-3 py-2 rounded-md border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Supporting Documents</label>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400 hover:border-blue-300 cursor-pointer">
              <Upload size={16} className="mx-auto mb-1.5" />
              Updated operative notes, new reports, or cost projections
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

export default function InsuranceCaseDetailView({
  c,
  onBack,
  onOpenBilling,
}: {
  c: ComprehensiveClaimRecord
  onBack: () => void
  onOpenBilling?: () => void
}) {
  const { notify, toastNode } = useNotify()
  const [tab, setTab] = useState<Tab>("current")
  const [showEnhancement, setShowEnhancement] = useState(false)
  const [showMail, setShowMail] = useState(false)

  const initials = c.patientName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  const threshold = InsuranceEngineService.checkThresholdWarning(c)

  const uploadedDocs = c.documents?.filter(d => d.status === "Uploaded" || d.status === "Verified").length ?? 8
  const verifiedDocs = c.documents?.filter(d => d.status === "Verified").length ?? 5
  const totalDocs = 11

  const TABS: { id: Tab; label: string }[] = [
    { id: "current", label: "Current Step" },
    { id: "documents", label: `Documents (${uploadedDocs}/${totalDocs})` },
    { id: "emails", label: "Emails" },
    { id: "charges", label: "Charges & Package" },
    { id: "approvals", label: "Approvals" },
    { id: "history", label: "History" },
  ]

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/70 overflow-hidden">
      {toastNode}
      {showEnhancement && <EnhancementDrawer c={c} onClose={() => setShowEnhancement(false)} notify={notify} />}
      {showMail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Email to Insurer</h3>
              <button onClick={() => setShowMail(false)} className="w-8 h-8 hover:bg-slate-100 rounded-lg flex items-center justify-center"><X size={15} /></button>
            </div>
            <MailComposer c={c} purpose="Pre-Auth" notify={notify} />
          </div>
        </div>
      )}

      {/* Page Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 space-y-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <button type="button" onClick={onBack} className="hover:underline flex items-center gap-1">
            <ArrowLeft size={13} /> Cashless Board
          </button>
          <span>&rsaquo;</span>
          <span className="text-slate-900 font-semibold">{c.patientName}</span>
          <span>&rsaquo;</span>
          <span>Case Detail</span>
        </div>

        {/* Patient hero */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-800 border-2 border-blue-200 font-black text-sm flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-bold text-slate-900">{c.patientName}</h1>
                <span className="text-xs font-semibold text-slate-400 font-mono">{c.mrn || c.patientId}</span>
                <StatusPill status={c.status} />
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-600 mt-1 font-mono">
                <span>Insurer: <strong className="text-slate-800">{c.policy.insurerName}</strong></span>
                <span>Policy: <strong className="text-slate-800">{c.policy.policyNumber}</strong></span>
                <span>Case: <strong className="text-slate-800">{c.id}</strong></span>
                {c.admissionDate && <span>Admitted: <strong className="text-slate-800">{fmtDate(c.admissionDate)}</strong></span>}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {threshold.isWarning && (
              <button type="button" onClick={() => setShowEnhancement(true)} className={`${btn.danger} gap-1.5`}>
                <TrendingUp size={13} /> Request Enhancement
              </button>
            )}
            <button type="button" onClick={() => setShowMail(true)} className={`${btn.soft} gap-1.5`}>
              <Send size={13} /> Email Insurer
            </button>
            <button type="button" className={`${btn.soft} gap-1.5`}>
              <Printer size={13} /> Print
            </button>
            <button type="button" className={`${btn.primary} gap-1.5`}>
              <ChevronRight size={13} /> Next Action
            </button>
          </div>
        </div>

        {/* Utilisation bar if in treatment */}
        {threshold.isWarning && (
          <div className="flex items-center gap-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-amber-900 mb-1">
                {Math.round(threshold.percentageConsumed)}% of approved limit consumed — {inr(threshold.remaining)} remaining
              </div>
              <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(threshold.percentageConsumed, 100)}%` }} />
              </div>
            </div>
            <button type="button" onClick={() => setShowEnhancement(true)} className="text-xs font-bold text-amber-700 underline whitespace-nowrap">
              Request Enhancement
            </button>
          </div>
        )}

        {/* Tab strip */}
        <div className="flex items-center gap-1 overflow-x-auto -mb-4 pt-1">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 px-4 text-xs font-semibold rounded-t-md whitespace-nowrap transition-all ${
                tab === t.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main content: stage rail + tab body */}
      <div className="flex flex-1 overflow-hidden">
        <StageRail c={c} />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── TAB: CURRENT STEP ───────────────────────────────── */}
          {tab === "current" && (
            <div className="space-y-6">
              {/* Current step card */}
              {(() => {
                const step = DESK_STEPS.find(s => s.statuses.includes(c.status))
                if (!step) return null
                return (
                  <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-2xs space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">{step.n}</span>
                      <h2 className="text-sm font-bold text-blue-900">{step.title}</h2>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{step.meaning}</p>
                    <div>
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tasks in this stage</div>
                      <ul className="space-y-1.5">
                        {step.tasks.map((task, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-slate-700">
                            <div className="w-4 h-4 rounded border border-slate-200 flex items-center justify-center shrink-0 cursor-pointer hover:bg-blue-50 hover:border-blue-300">
                              <Check size={10} className="text-slate-300" />
                            </div>
                            {task}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Documents needed</div>
                      <div className="flex flex-wrap gap-2">
                        {step.needs.map((n, i) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">{n}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Claim snapshot grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Approved Amount", value: inr(c.approvedPreAuthAmount || c.preAuth?.requestedAmount || 85000), color: "text-blue-700" },
                  { label: "Consumed", value: inr(c.consumedBillAmount || 71000), color: "text-amber-700" },
                  { label: "Remaining", value: inr((c.approvedPreAuthAmount || 85000) - (c.consumedBillAmount || 71000)), color: "text-emerald-700" },
                  { label: "Final Claim", value: inr(c.finalClaimAmount || 0) || "Pending", color: "text-slate-700" },
                ].map((s, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{s.label}</div>
                    <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Case information */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-3 mb-4">Clinical Details</h3>
                  <div className="space-y-2">
                    <KV k="Department" v={c.department || "General Surgery"} />
                    <KV k="Consultant" v={c.attendingDoctor || "Dr. Suresh Reddy"} />
                    <KV k="Admission" v={fmtDate(c.admissionDate) || "28 Sep 2026"} />
                    <KV k="Diagnosis" v={c.carePathway || "Acute Appendicitis"} />
                    <KV k="Procedure" v={c.encounterType || "Appendectomy (Laparoscopic)"} />
                    <KV k="Room Category" v={c.policy.roomCategoryEligible || "General Ward"} />
                    <KV k="Expected Discharge" v={fmtDate(c.dischargeDate) || "30 Sep 2026"} />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-3 mb-4">Policy Details</h3>
                  <div className="space-y-2">
                    <KV k="Insurer" v={c.policy.insurerName} />
                    <KV k="TPA" v={c.policy.tpaName || "—"} />
                    <KV k="Policy Number" v={<span className="font-mono">{c.policy.policyNumber}</span>} />
                    <KV k="Member ID" v={<span className="font-mono">{c.policy.memberId || "—"}</span>} />
                    <KV k="Sum Insured" v={inr(c.policy.sumInsured)} mono />
                    <KV k="Room Eligible" v={c.policy.roomCategoryEligible || "—"} />
                    <KV k="Co-Pay" v={`${c.policy.copayPercentage || 0}%`} />
                    <KV k="Deductible" v={inr(c.policy.deductibleAmount)} mono />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: DOCUMENTS ──────────────────────────────────── */}
          {tab === "documents" && (
            <div className="space-y-4">
              {/* Progress header */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between gap-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Document Checklist ({uploadedDocs}/{totalDocs} uploaded, {verifiedDocs} verified)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Discharge summary, lab reports and final bill auto-attach from EMR.</p>
                </div>
                <div className="flex items-center gap-3 min-w-48">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round((uploadedDocs / totalDocs) * 100)}%` }} />
                  </div>
                  <span className="font-black text-xs text-slate-900 font-mono">{Math.round((uploadedDocs / totalDocs) * 100)}%</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10.5px]">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Document</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">File</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">By</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {DOC_LIST.map((docName, i) => {
                      const uploaded = i < uploadedDocs
                      const verified = i < verifiedDocs
                      return (
                        <DocRow
                          key={i}
                          n={i + 1}
                          name={docName}
                          status={verified ? "verified" : uploaded ? "uploaded" : "pending"}
                          file={uploaded ? `doc_${i + 1}.pdf` : undefined}
                          date={uploaded ? "28 Sep 2026" : undefined}
                          by={uploaded ? ["Admin", "Desk", "Dr. Reddy", "Billing", "Lab"][i % 5] : undefined}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB: EMAILS ─────────────────────────────────────── */}
          {tab === "emails" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowMail(true)} className={`${btn.primary} gap-1.5`}>
                  <Send size={13} /> Compose Email
                </button>
              </div>
              {[
                { from: "Dr. Sharma", to: "claims@starhealth.in", subject: "Pre-Authorization Request — Ramesh Kumar / Appendectomy", date: "28 Sep 2026, 10:05 AM", type: "sent", status: "sent" },
                { from: "claims@starhealth.in", to: "insurance@hospital.com", subject: "Re: Pre-Authorization — Query on diagnosis code", date: "28 Sep 2026, 2:30 PM", type: "received", status: "query" },
                { from: "Dr. Sharma", to: "claims@starhealth.in", subject: "Re: Pre-Authorization — Additional documents attached", date: "28 Sep 2026, 4:45 PM", type: "sent", status: "sent" },
                { from: "claims@starhealth.in", to: "insurance@hospital.com", subject: "Pre-Authorization APPROVED — ₹85,000", date: "29 Sep 2026, 9:15 AM", type: "received", status: "approved" },
              ].map((email, i) => (
                <div key={i} className={`bg-white border rounded-xl p-4 shadow-2xs ${email.type === "received" ? "border-blue-100" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${email.type === "sent" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                          {email.type === "sent" ? "SENT" : "RECEIVED"}
                        </span>
                        {email.status === "query" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">QUERY</span>}
                        {email.status === "approved" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">APPROVED</span>}
                      </div>
                      <div className="font-semibold text-slate-900 text-sm">{email.subject}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {email.type === "sent" ? `To: ${email.to}` : `From: ${email.from}`}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 whitespace-nowrap">{email.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: CHARGES & PACKAGE ─────────────────────────── */}
          {tab === "charges" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Package Rules */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-3">Package &amp; Calculation Rules</h3>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Package Rate", value: inr(c.packageBaseAmount || 85000) },
                    { label: "Room Category", value: c.policy.roomCategoryEligible || "General Ward" },
                    { label: "Stay Days", value: "4 days" },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{f.label}</label>
                      <div className="h-9 px-3 rounded-md bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 flex items-center">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Multi-Surgery Rule</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[{ label: "1st Procedure", pct: "100%", cls: "emerald" }, { label: "2nd Procedure", pct: "50%", cls: "amber" }, { label: "3rd+", pct: "25%", cls: "rose" }].map(s => (
                      <div key={s.label} className={`p-3 bg-${s.cls}-50 border border-${s.cls}-200 rounded-lg`}>
                        <div className="text-[10.5px] font-medium text-slate-600">{s.label}</div>
                        <div className={`text-xl font-black text-${s.cls}-700`}>{s.pct}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Billing split */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-3">Billing Summary Split</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600"><span>Package Amount</span><span className="font-mono font-bold text-slate-900">{inr(c.packageBaseAmount || 85000)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Room Charges</span><span className="font-mono font-bold text-slate-900">₹10,000</span></div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-100 pt-2"><span>Total Package</span><span className="font-mono text-blue-700">₹95,000</span></div>
                  <div className="flex justify-between text-slate-500 pt-2"><span>Non-Payables (Consumables)</span><span className="font-mono text-rose-600">{inr(c.nonPayableAmount || 5000)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>Co-Pay ({c.policy.copayPercentage || 10}%)</span><span className="font-mono text-amber-600">-₹9,500</span></div>
                  <div className="flex justify-between font-bold text-sm border-t border-slate-100 pt-3">
                    <span className="text-blue-900">Insurer Payable</span>
                    <span className="font-mono text-blue-700 text-base">{inr(c.approvedPreAuthAmount || 80500)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm">
                    <span className="text-amber-900">Patient Share</span>
                    <span className="font-mono text-amber-700">₹14,500</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: APPROVALS ──────────────────────────────────── */}
          {tab === "approvals" && (
            <div className="space-y-4">
              {[
                { title: "Pre-Authorization", date: "29 Sep 2026", amount: c.approvedPreAuthAmount || 85000, ref: "PA/2026/09876", status: "approved", notes: "Approved for Appendectomy (Laparoscopic) — General Ward" },
                { title: "Enhancement Request #1", date: "Pending", amount: 25000, ref: "—", status: "pending", notes: "Requested for extended ICU stay due to post-op complication" },
              ].map((appr, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-slate-900">{appr.title}</h3>
                        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${
                          appr.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          appr.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {appr.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mb-2">{appr.notes}</div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                        <span>Ref: {appr.ref}</span>
                        <span>Date: {appr.date}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-slate-900">{inr(appr.amount)}</div>
                      <div className="text-[11px] text-slate-400">approved amount</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: HISTORY ────────────────────────────────────── */}
          {tab === "history" && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Activity Log</h3>
              </div>
              <ul className="divide-y divide-slate-50">
                {(c.auditTrail?.map((e: any) => ({ at: e.timestamp, actor: e.actor, action: e.action })) || [
                  { at: new Date(Date.now() - 86400000 * 3).toISOString(), actor: "Admin", action: "Case registered and policy captured" },
                  { at: new Date(Date.now() - 86400000 * 2.5).toISOString(), actor: "Desk", action: "Eligibility verified with Star Health — policy active" },
                  { at: new Date(Date.now() - 86400000 * 2).toISOString(), actor: "Dr. Sharma", action: "Pre-authorization request drafted and emailed" },
                  { at: new Date(Date.now() - 86400000 * 1.5).toISOString(), actor: "Star Health", action: "Query raised on diagnosis code ICD-10" },
                  { at: new Date(Date.now() - 86400000 * 1).toISOString(), actor: "Dr. Sharma", action: "Query resolved — additional documents sent" },
                  { at: new Date(Date.now() - 86400000 * 0.5).toISOString(), actor: "Star Health", action: "Pre-Authorization APPROVED — ₹85,000" },
                ]).map((ev: any, i: number) => (
                  <li key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50">
                    <div className="mt-0.5 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-600 shrink-0">
                      {(ev.actor || "—").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-slate-900">{ev.action}</div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span className="font-medium text-slate-600">{ev.actor}</span>
                        <span>·</span>
                        <span>{fmtDateTime(ev.at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
