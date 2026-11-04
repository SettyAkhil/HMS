import { useState, useMemo, useRef } from "react"
import {
  ArrowLeft,
  Printer,
  MoreHorizontal,
  Send,
  User,
  Calendar,
  Bed,
  Shield,
  CreditCard,
  CheckCircle2,
  FileText,
  AlertCircle,
  Clock,
  Upload,
  ArrowRight,
  Sparkles,
  Home,
  Mail,
  Check,
  Building,
  DollarSign,
  FileCheck,
} from "lucide-react"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import { DESK_STEPS, stepOf } from "./deskGuide"
import { DocumentChecklist, NextStep } from "./forms"
import { MailComposer, MailThread } from "./mail"
import { Hint, KV, NEXT_HINT, StatusPill, fmtDate, fmtDateTime, inr, type Notify } from "./ui"
import { AuditTable, BillLines, Consumption, Readiness } from "./widgets"
import ClaimPharmacyBillsView from "./ClaimPharmacyBillsView"
import FixedPackageBillSection from "./FixedPackageBillSection"
import SendToInsurerFlow from "./SendToInsurerFlow"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import ClaimPatientJourneyView from "./ClaimPatientJourneyView"
import ClaimEmailTrackerView from "./ClaimEmailTrackerView"
import PatientProfileModal from "./PatientProfileModal"

const TABS = ["Current Step", "Bills & Pharmacy", "Fixed Package Bill", "Patient Journey", "Emails", "Documents", "Details", "History"] as const
type Tab = (typeof TABS)[number]

export default function ClaimWorkspace({
  c,
  notify,
  onBack,
  onOpenBilling,
  onOpenEmailHub,
}: {
  c: ComprehensiveClaimRecord
  notify: Notify
  onBack: () => void
  onOpenBilling?: () => void
  onOpenEmailHub?: () => void
}) {
  const [tab, setTab] = useState<Tab>("Current Step")
  const [patientModalOpen, setPatientModalOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)

  // Adjudication form state for Details tab
  const [adjMode, setAdjMode] = useState<"idle" | "review">("idle")
  const [adjOutcome, setAdjOutcome] = useState<"Approved" | "Rejected" | "Query">("Approved")
  const [adjAmount, setAdjAmount] = useState<string>("")
  const [adjCode, setAdjCode] = useState("")
  const [adjNote, setAdjNote] = useState("")

  const stage = stepOf(c)
  const stageIdx = DESK_STEPS.findIndex((s) => s.id === stage.id)
  const closed = c.status === "CLOSED"
  const stopped = ["NOT_ELIGIBLE", "PREAUTH_REJECTED", "REJECTED"].includes(c.status)
  const mand = c.documents.filter((d) => d.isMandatory)
  const verified = mand.filter((d) => d.isUploaded && d.status === "Verified").length
  const initials = c.patientName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()

  const policyNum = c.policy.policyNumber || "—"

  const hospitalBill = c.totalHospitalBill || 0
  const claimAmount = c.finalClaimAmount || c.preAuth?.requestedAmount || 0
  const nonPayable = c.nonPayableAmount || 0
  const patientShare = c.patientShareAmount || 0

  // ── Dynamic pre-submission checklist & document counts ──────────────────────
  const APPROVED_ONWARDS = ["PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "SETTLEMENT_PENDING", "CLOSED"]
  const docsTotal = c.documents.length
  const uploadedCount = c.documents.filter((d) => d.isUploaded).length
  const verifiedCount = c.documents.filter((d) => d.status === "Verified").length
  const toUploadCount = c.documents.filter((d) => !d.isUploaded).length
  const preAuthDone = !!c.preAuth?.approvalCode || APPROVED_ONWARDS.includes(c.status)
  const finalBillDone = hospitalBill > 0 || !!c.invoiceNo
  const docsDone = mand.length > 0 && verified === mand.length
  const clearanceDone = APPROVED_ONWARDS.includes(c.status)
  const checklist = [
    { label: "Pre-auth approved", done: preAuthDone, meta: c.preAuth?.approvalCode ? `Approval No: ${c.preAuth.approvalCode}` : "Pending" },
    { label: "Final bill ready", done: finalBillDone, meta: c.invoiceNo ? `Invoice: ${c.invoiceNo}` : hospitalBill > 0 ? inr(hospitalBill) : "Pending" },
    { label: "Documents uploaded & verified", done: docsDone, meta: `${verified} of ${mand.length} verified` },
    { label: "Insurance clearance", done: clearanceDone, meta: clearanceDone ? "Clear" : "Pending" },
  ]
  const checklistDone = checklist.filter((x) => x.done).length

  // Documents grouped the way the sheet shows them.
  const patientDocs = c.documents.filter((d) => d.category === "Patient" || d.category === "Insurance")
  const hospitalDocs = c.documents.filter((d) => ["Clinical", "Billing", "Discharge", "Pre-Auth"].includes(d.category))

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)
  const triggerUpload = (docId: string) => { setUploadingDocId(docId); fileInputRef.current?.click() }
  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    const docId = uploadingDocId
    e.target.value = ""
    if (!f || !docId) return
    try { E.uploadDocument(c.id, docId, f.name); notify(`Uploaded ${f.name}`, "success") }
    catch (err) { notify(err instanceof Error ? err.message : "Upload failed", "error") }
  }
  const verifyDoc = (docId: string) => {
    try { E.verifyDocument(c.id, docId, true); notify("Document verified", "success") }
    catch (err) { notify(err instanceof Error ? err.message : "Could not verify", "error") }
  }
  const verifyAllUploaded = () => {
    try { E.verifyAllUploaded(c.id); notify("All uploaded documents verified", "success") }
    catch (err) { notify(err instanceof Error ? err.message : "Could not verify", "error") }
  }
  const renderDocCard = (d: typeof c.documents[number]) => {
    const dot = d.status === "Verified" ? "bg-emerald-500 border-emerald-500" : d.isUploaded ? "bg-amber-400 border-amber-400" : "border-slate-300"
    const statusText = d.status === "Verified" ? `Verified${d.fileName ? ` · ${d.fileName}` : ""}` : d.status === "Rejected" ? "Rejected — re-upload" : d.isUploaded ? `Uploaded${d.fileName ? ` · ${d.fileName}` : ""} — verify it` : "Not uploaded"
    const statusTone = d.status === "Verified" ? "text-emerald-600" : d.isUploaded ? "text-amber-600" : "text-slate-400"
    return (
      <div key={d.id} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${dot}`} />
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800 truncate">{d.documentType}{d.isMandatory && <span className="text-rose-500"> *</span>}</div>
            <div className={`text-[11px] truncate ${statusTone}`}>{statusText}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {d.isUploaded && d.status !== "Verified" && (
            <button type="button" onClick={() => verifyDoc(d.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer">
              <Check size={13} /> Verify
            </button>
          )}
          <button type="button" onClick={() => triggerUpload(d.id)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer">
            <Upload size={13} /> {d.isUploaded ? "Replace" : "Upload"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC]">
      {/* ── Top Header & Actions Bar ── */}
      <div className="bg-white border-b border-slate-200/80 px-8 py-4.5 sticky top-0 z-30 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-[1700px] mx-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Back to Claims Register"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{c.patientName}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                  {c.id}
                </span>
                <StatusPill status={c.status} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {c.policy.insurerName} • Policy: <span className="font-mono text-slate-700 font-medium">{policyNum}</span> • Stage {stage.n}/8: {stage.title}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Printer size={14} className="text-slate-500" />
              <span>Print Dossier</span>
            </button>
            <button
              type="button"
              onClick={() => setPatientModalOpen(true)}
              title="View patient profile"
              className="inline-flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <MoreHorizontal size={15} className="text-slate-500" />
            </button>
            <button
              type="button"
              onClick={() => setSendOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <span>Send to Insurer</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6 max-w-[1700px] mx-auto w-full">
        {/* ── Patient Profile Hero Card ── */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4.5">
            <div className="w-14 h-14 rounded-2xl bg-[#D1FAE5] text-emerald-800 font-extrabold text-lg flex items-center justify-center shrink-0 border border-emerald-200">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{c.patientName}</h1>
                <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  Claim ready
                </span>
                <button
                  type="button"
                  onClick={() => setPatientModalOpen(true)}
                  className="px-2.5 py-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>👤</span> View Full Profile
                </button>
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium flex flex-wrap items-center gap-2">
                <span className="font-mono text-slate-600">{c.id}</span>
                <span className="text-slate-300">|</span>
                <span>{c.encounterType || "ICU"} - Admitted: {fmtDate(c.admissionDate)}</span>
                <span className="text-slate-300">|</span>
                <span>Male, 45 yrs</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium flex flex-wrap items-center gap-2">
                <span>{c.policy.insurerName} / {c.policy.tpaName || "FHPL (Family Health Plan TPA)"}</span>
                <span className="text-slate-300">|</span>
                <span className="font-mono">Policy: {policyNum}</span>
              </div>
            </div>
          </div>

          {/* 4 Compact Meta Pill Badges on Right */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="bg-cyan-50/70 border border-cyan-100 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-100/80 text-cyan-700 flex items-center justify-center shrink-0">
                <User size={13} />
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Ward</div>
                <div className="text-xs font-bold text-slate-800">{c.encounterType || "ICU"}</div>
              </div>
            </div>

            <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0">
                <Calendar size={13} />
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Admission</div>
                <div className="text-xs font-bold text-slate-800">{fmtDate(c.admissionDate)}</div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-200/70 text-slate-700 flex items-center justify-center shrink-0">
                <Bed size={13} />
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Discharge</div>
                <div className="text-xs font-bold text-slate-800">{c.dischargeDate ? fmtDate(c.dischargeDate) : "Pending"}</div>
              </div>
            </div>

            <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0">
                <Shield size={13} />
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Policy No.</div>
                <div className="text-xs font-bold text-slate-800 font-mono truncate max-w-[85px]">{policyNum}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5 Financial KPI Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Hospital Bill */}
          <div className="bg-[#FAF5FF]/70 border border-purple-100/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
              <User size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Hospital Bill</div>
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">{inr(hospitalBill)}</div>
            </div>
          </div>

          {/* Card 2: Pre-auth Approved */}
          <div className="bg-[#ECFDF5]/70 border border-emerald-100/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Pre-auth Approved</div>
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">{preAuthDone ? "Yes" : "Pending"}</div>
              <div className="text-[10px] text-slate-400 font-mono">Approval No: {c.preAuth?.approvalCode || "—"}</div>
            </div>
          </div>

          {/* Card 3: Claim Amount */}
          <div className="bg-[#EFF6FF]/70 border border-blue-100/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <CreditCard size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Claim Amount</div>
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">{inr(claimAmount)}</div>
            </div>
          </div>

          {/* Card 4: Non-payable */}
          <div className="bg-[#FFF1F2]/70 border border-rose-100/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Shield size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Non-payable</div>
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">{inr(nonPayable)}</div>
            </div>
          </div>

          {/* Card 5: Settled Amount */}
          <div className="bg-[#FFFBEB]/70 border border-amber-100/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <Home size={18} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Settled Amount</div>
              <div className="text-lg font-extrabold text-slate-900 tracking-tight">{c.settlement?.receivedAmount ? inr(c.settlement.receivedAmount) : "—"}</div>
              <div className="text-[10px] text-slate-400">{c.settlement?.receivedAmount ? "Settled" : "Not yet settled"}</div>
            </div>
          </div>
        </div>

        {/* ── Main Layout (Left Stepper + Right Tabs Content) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
          {/* ── Left Stepper: Claim Progress ── */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Claim Progress</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${closed ? "bg-slate-100 text-slate-600 border-slate-200" : stopped ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                {closed ? "Closed" : stopped ? "Stopped" : "In progress"}
              </span>
            </div>

            <ol className="relative pl-1 space-y-5">
              {DESK_STEPS.map((s, i) => {
                const done = i < stageIdx
                const current = i === stageIdx
                const last = i === DESK_STEPS.length - 1
                return (
                  <li key={s.id} className="relative flex items-start gap-3">
                    {!last && <span className={`absolute left-[11px] top-6 bottom-[-20px] w-0.5 ${done ? "bg-emerald-400" : "bg-slate-200"}`} />}
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 ${done ? "bg-emerald-500 text-white" : current ? "bg-blue-600 text-white ring-4 ring-blue-100" : "border border-slate-300 text-slate-400 bg-white"}`}>
                      {done ? <Check size={13} /> : i + 1}
                    </div>
                    <div>
                      <div className={`text-xs ${current ? "font-bold text-blue-900" : done ? "font-bold text-slate-900" : "font-medium text-slate-500"}`}>{s.title}</div>
                      <div className={`text-[11px] ${current ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{done ? "Completed" : current ? "In progress" : "Pending"}</div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* ── Right Content Pane with Tab Bar ── */}
          <div className="space-y-5 min-w-0">
            {/* Tabs Header */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-2xs flex items-center gap-1 overflow-x-auto scrollbar-none">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    tab === t
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span>{t}</span>
                  {t === "Emails" && (c.mails?.length ?? 0) > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${tab === t ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                      {c.mails?.length}
                    </span>
                  )}
                  {t === "Documents" && docsTotal > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${tab === t ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {verifiedCount}/{docsTotal}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* TAB CONTENT */}
            {tab === "Current Step" && (
              <div className="space-y-5">
                {/* ── Active Step Banner (Discharge & Final Bill) ── */}
                <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-blue-50/30 border border-blue-100/90 rounded-2xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Send size={18} className="-rotate-12" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{stage.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{stage.meaning}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenEmailHub}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-blue-200/80 hover:bg-blue-50/80 text-blue-700 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0"
                  >
                    <Mail size={14} className="text-blue-600" />
                    <span>View Full Email Hub</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* ── 2 Summary Boxes (Grid 2 cols) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Box 1: Pre-Submission Checklist */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck size={16} className="text-blue-600" />
                        <h4 className="text-xs font-bold text-slate-900">Pre-Submission Checklist</h4>
                      </div>
                      <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full ${checklistDone === checklist.length ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                        {checklistDone}/{checklist.length} Completed
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {checklist.map((item) => (
                        <div key={item.label} className="flex items-center justify-between p-2 rounded-lg bg-slate-50/80">
                          <div className="flex items-center gap-2 font-medium text-slate-800">
                            {item.done
                              ? <CheckCircle2 size={15} className="text-emerald-500" />
                              : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                            <span>{item.label}</span>
                          </div>
                          <span className={`font-mono text-[11px] ${item.done ? "text-emerald-600 font-semibold" : "text-slate-500"}`}>{item.meta}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Box 2: Claim Summary */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                    <div className="flex items-center gap-2">
                      <DollarSign size={16} className="text-blue-600" />
                      <h4 className="text-xs font-bold text-slate-900">Claim Summary</h4>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-slate-100 text-slate-600">
                        <span>Hospital bill</span>
                        <span className="font-bold font-mono text-slate-900">{inr(hospitalBill)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100 text-slate-600">
                        <span>Non-payable</span>
                        <span className="font-bold font-mono text-slate-900">{inr(nonPayable)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-slate-100 text-slate-600">
                        <span>Patient share</span>
                        <span className="font-bold font-mono text-slate-900">{inr(patientShare)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/80 text-blue-900 font-bold mt-2">
                        <span className="font-semibold">Claim amount</span>
                        <span className="font-extrabold font-mono text-sm">{inr(claimAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Check the claim documents Section ── */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Check the claim documents</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Upload anything missing and verify each document against the original.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-medium">{uploadedCount}/{docsTotal} uploaded • {verifiedCount}/{docsTotal} verified • {toUploadCount} to upload</span>
                      <button
                        type="button"
                        onClick={() => verifyAllUploaded()}
                        disabled={uploadedCount === verifiedCount}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        <Check size={13} />
                        <span>Verify all uploaded</span>
                      </button>
                    </div>
                  </div>

                  <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />

                  {docsTotal === 0 ? (
                    <div className="text-xs text-slate-500 py-6 text-center">No document requirements on this case yet.</div>
                  ) : (
                    <>
                      {/* Patient Documents */}
                      {patientDocs.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                            <FileText size={15} className="text-blue-600" />
                            <span>Patient documents</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {patientDocs.map(renderDocCard)}
                          </div>
                        </div>
                      )}

                      {/* Hospital Documents */}
                      {hospitalDocs.length > 0 && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                            <Building size={15} className="text-emerald-600" />
                            <span>Hospital documents</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {hospitalDocs.map(renderDocCard)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === "Bills & Pharmacy" && (
              <ClaimPharmacyBillsView c={c} notify={notify} />
            )}

            {tab === "Fixed Package Bill" && (
              <FixedPackageBillSection c={c} notify={notify} />
            )}

            {tab === "Patient Journey" && (
              <ClaimPatientJourneyView c={c} />
            )}

            {tab === "Emails" && (
              <ClaimEmailTrackerView c={c} notify={notify} />
            )}

            {tab === "Documents" && (
              <DocumentChecklist c={c} notify={notify} />
            )}

            {tab === "Details" && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">Comprehensive Policy &amp; Clinical Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-slate-400 text-[11px]">Primary Insurer</div>
                      <div className="font-bold text-slate-800 mt-0.5">{c.policy.insurerName}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-slate-400 text-[11px]">TPA Network</div>
                      <div className="font-bold text-slate-800 mt-0.5">{c.policy.tpaName || "Direct"}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-slate-400 text-[11px]">Member ID</div>
                      <div className="font-bold text-slate-800 mt-0.5 font-mono">{c.policy.memberId || "MEM-99210"}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-slate-400 text-[11px]">Policy Sum Insured</div>
                      <div className="font-bold text-slate-800 mt-0.5 font-mono">{inr(c.policy.sumInsured || 500000)}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-slate-400 text-[11px]">Co-Pay Clause</div>
                      <div className="font-bold text-slate-800 mt-0.5">{c.policy.copayPercentage || 0}%</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-slate-400 text-[11px]">Pre-Auth Limit</div>
                      <div className="font-bold text-slate-800 mt-0.5 font-mono">{inr(c.approvedPreAuthAmount || 50000)}</div>
                    </div>
                  </div>
                </div>

                {/* ── Direct Adjudication Action Panel ── */}
                <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-200/80 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm mb-1">
                        <CheckCircle2 size={18} className="text-indigo-600" /> Manual Pre-Auth Adjudication
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-lg">
                        Directly record an approval or rejection for <span className="font-bold text-slate-900">{c.patientName}</span>. This will immediately update the patient's status across Reception, Pharmacy, and the overall dashboard.
                      </p>
                    </div>

                    {c.approvedPreAuthAmount === 0 && adjMode === "idle" && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdjMode("review")
                          setAdjAmount((c.preAuth?.requestedAmount || 50000).toString())
                          setAdjCode(`AUTH-${(c.policy.tpaName || "TPA").slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`)
                          setAdjOutcome("Approved")
                          setAdjNote("Sanction verified manually.")
                        }}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shrink-0 active:scale-95"
                      >
                        <Sparkles size={14} /> Update Decision
                      </button>
                    )}
                  </div>

                  {adjMode === "review" && c.approvedPreAuthAmount === 0 && (
                    <div className="mt-4 p-4 bg-white border border-indigo-100 rounded-xl shadow-inner space-y-4">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Record Official Decision</div>
                      
                      <div className="flex gap-2">
                        {(["Approved", "Rejected", "Query"] as const).map((out) => (
                          <button
                            key={out}
                            type="button"
                            onClick={() => setAdjOutcome(out)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors border ${
                              adjOutcome === out
                                ? out === "Approved"
                                  ? "bg-emerald-50 border-emerald-600 text-emerald-700 shadow-xs"
                                  : out === "Rejected"
                                  ? "bg-rose-50 border-rose-600 text-rose-700 shadow-xs"
                                  : "bg-amber-50 border-amber-600 text-amber-700 shadow-xs"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            {out}
                          </button>
                        ))}
                      </div>

                      {adjOutcome === "Approved" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Approved Amount (₹)</label>
                            <input
                              type="number"
                              value={adjAmount}
                              onChange={(e) => setAdjAmount(e.target.value)}
                              className="w-full px-3 py-2 text-sm font-bold text-emerald-700 bg-emerald-50/30 border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              placeholder="e.g. 50000"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Authorization Code</label>
                            <input
                              type="text"
                              value={adjCode}
                              onChange={(e) => setAdjCode(e.target.value)}
                              className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              placeholder="e.g. AUTH-12345"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Internal Note / Remarks</label>
                        <textarea
                          value={adjNote}
                          onChange={(e) => setAdjNote(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="Add any remarks for the record..."
                        />
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setAdjMode("idle")}
                          className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const amt = parseInt(adjAmount, 10) || 0
                              if (adjOutcome === "Approved" && !amt) throw new Error("Please enter a valid approved amount.")
                              if (adjOutcome === "Approved" && !adjCode.trim()) throw new Error("Authorization code is required.")
                              
                              E.recordPreAuthResponse(c.id, {
                                outcome: adjOutcome,
                                amount: amt,
                                approvalCode: adjCode,
                                note: adjNote,
                              })
                              setAdjMode("idle")
                              notify(
                                adjOutcome === "Approved" 
                                  ? `Approved for ₹${amt.toLocaleString("en-IN")} and synced!` 
                                  : `Decision recorded as ${adjOutcome}.`,
                                "success"
                              )
                            } catch (err: any) {
                              notify(err.message, "error")
                            }
                          }}
                          className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-all shadow-sm active:scale-95 flex items-center gap-1.5 ${
                            adjOutcome === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" :
                            adjOutcome === "Rejected" ? "bg-rose-600 hover:bg-rose-700" :
                            "bg-amber-600 hover:bg-amber-700"
                          }`}
                        >
                          <CheckCircle2 size={14} /> Confirm &amp; Save
                        </button>
                      </div>
                    </div>
                  )}

                  {c.approvedPreAuthAmount > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/80 border border-indigo-100 rounded-lg p-3">
                      <div>
                        <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Authorization Code</div>
                        <div className="text-xs font-mono font-bold text-slate-900 mt-0.5">
                          {c.preAuth?.approvalCode || `AUTH-${(c.policy.tpaName || "TPA").slice(0, 3).toUpperCase()}-9921`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Sanctioned Amount</div>
                        <div className="text-sm font-bold text-emerald-700 mt-0.5">
                          {inr(c.approvedPreAuthAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Co-Pay Clause</div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5">{c.policy.copayPercentage || 0}%</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "History" && (
              <AuditTable c={c} notify={notify} />
            )}
          </div>
        </div>
      </div>

      <PatientProfileModal
        isOpen={patientModalOpen}
        onClose={() => setPatientModalOpen(false)}
        patient={{
          patientName: c.patientName,
          uhid: (c as any).uhid || "UH001256",
          ipNo: (c as any).ipNo || "IP20250928012",
          gender: (c as any).gender || "Male",
          age: String((c as any).age || 45),
          contact: (c as any).mobile || "9876543210",
          email: (c as any).email || "ramesh.kumar@gmail.com",
          address: (c as any).address || "Flat 402, Sea Pearl Apartments, MVP Colony, Visakhapatnam - 530017",
          admissionType: c.encounterType || "Planned Surgical / Medical",
          department: (c as any).department || "General Surgery",
          admittedOn: fmtDate(c.admissionDate),
          insurerName: c.policy.insurerName,
          tpaName: c.policy.tpaName,
          policyNo: c.policy.policyNumber,
          memberId: c.policy.memberId,
          sumInsured: String(c.policy.sumInsured || 500000),
          estimateAmount: String((c as any).totalEstimatedAmount || (c as any).estimatedBill || 185000),
          preAuthApproved: String(c.approvedPreAuthAmount || 150000),
          corporateName: (c.policy as any).corporateName || "TECHCORP SOLUTIONS PVT LTD",
        }}
      />

      {sendOpen && (
        <SendToInsurerFlow c={c} notify={notify} onClose={() => setSendOpen(false)} onSent={onOpenEmailHub} />
      )}
    </div>
  )
}
