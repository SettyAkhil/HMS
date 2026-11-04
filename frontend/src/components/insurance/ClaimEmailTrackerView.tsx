import React, { useState, useMemo } from "react"
import type { ComprehensiveClaimRecord, MailRecord } from "../../types/insurance"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import { inr, fmtDateTime, type Notify } from "./ui"
import { MailComposer } from "./mail"
import {
  Mail,
  Send,
  Paperclip,
  CheckCircle2,
  RefreshCw,
  FileText,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Download,
  ShieldCheck,
  Star,
  ArrowLeft,
  Archive,
  Trash2,
  Clock,
  Folder,
  Tag,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  CornerUpRight,
  AlertTriangle,
  MoreVertical,
} from "lucide-react"

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

const AVATAR_COLORS = ["bg-blue-100 text-blue-700", "bg-teal-100 text-teal-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700"]
const avatarColor = (name: string): string => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "—"

const timeAgo = (at: string): string => {
  const diffMs = Date.now() - new Date(at).getTime()
  const diffHours = Math.floor(diffMs / 3600000)
  if (diffHours < 1) return "just now"
  if (diffHours < 24) return `${diffHours}hrs ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "1 day ago"
  return `${diffDays}days ago`
}

function EmailBody({ body }: { body: string }) {
  const lines = body.replace(/={4,}/g, "").split("\n")
  type Block = { type: "text"; text: string } | { type: "fields"; fields: [string, string][] }
  const blocks: Block[] = []
  let buf: string[] = []
  let fields: [string, string][] = []
  const flushText = () => { const t = buf.join("\n").trim(); if (t) blocks.push({ type: "text", text: t }); buf = [] }
  const flushFields = () => { if (fields.length) blocks.push({ type: "fields", fields }); fields = [] }
  for (const ln of lines) {
    const m = ln.match(/^\s*([A-Za-z][A-Za-z /&]{1,28}):\s*(.+\S)\s*$/)
    if (m) { flushText(); fields.push([m[1].trim(), m[2].trim()]) }
    else { flushFields(); buf.push(ln) }
  }
  flushText(); flushFields()
  return (
    <div className="space-y-4 text-[13.5px] text-slate-800 leading-relaxed">
      {blocks.map((b, i) =>
        b.type === "text" ? (
          <p key={i} className="whitespace-pre-wrap font-normal text-slate-800 leading-relaxed">{b.text}</p>
        ) : (
          <div key={i} className="my-4 bg-gradient-to-br from-blue-50/70 via-sky-50/40 to-slate-50/60 border border-blue-200/80 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
            {b.fields.map(([k, v], j) => {
              let icon = "📋"
              const kl = k.toLowerCase()
              if (kl.includes("amount") || kl.includes("sanctioned") || kl.includes("limit")) icon = "📋"
              if (kl.includes("diagnosis")) icon = "🩺"
              if (kl.includes("doctor")) icon = "👨‍⚕️"
              if (kl.includes("code") || kl.includes("auth")) icon = "🔑"
              if (kl.includes("copay") || kl.includes("co-pay")) icon = "🛡️"
              return (
                <div key={j} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-xs sm:text-[13px] border-b border-blue-100/60 pb-2.5 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2.5 min-w-[210px] max-w-[250px] shrink-0 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <span className="text-base shrink-0">{icon}</span>
                    <span className="whitespace-nowrap">{k}:</span>
                  </div>
                  <div className="font-mono font-extrabold text-slate-900 text-xs sm:text-sm min-w-0 break-words tracking-tight">
                    {v}
                  </div>
                </div>
              )
            })}
          </div>
        ),
      )}
    </div>
  )
}

export default function ClaimEmailTrackerView({
  c,
  notify,
}: {
  c: ComprehensiveClaimRecord
  notify: Notify
  onApplyDecision?: (amount: number, code: string, note: string) => void
}) {
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<"all" | "in" | "out" | "approvals" | "queries">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isComposing, setIsComposing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Adjudication form state
  const [adjMode, setAdjMode] = useState<"idle" | "review">("idle")
  const [adjOutcome, setAdjOutcome] = useState<"Approved" | "Rejected" | "Query">("Approved")
  const [adjAmount, setAdjAmount] = useState<string>("")
  const [adjCode, setAdjCode] = useState("")
  const [adjNote, setAdjNote] = useState("")

  // Strictly filter and seed baseline realistic emails for THIS patient only
  const mails: MailRecord[] = useMemo(() => {
    if (c.mails && c.mails.length > 0) return c.mails

    const tpaName = c.policy.tpaName || c.policy.insurerName || "Medi Assist TPA"
    const tpaEmail = `claims@${tpaName.toLowerCase().replace(/[^a-z]/g, "")}.in`
    const hospEmail = "insurance.desk@hospai-hospital.org"

    return [
      {
        id: `mail-init-out-${c.id}`,
        direction: "out",
        purpose: "Pre-Auth",
        at: c.admissionDate || "2026-10-01T09:30:00Z",
        from: hospEmail,
        to: tpaEmail,
        subject: `[${c.id}] Cashless Pre-Authorization Request — ${c.patientName} (UHID: ${c.patientId})`,
        body: `Dear Cashless Claims Desk,\n\nPlease find attached the Pre-Authorization Request Form (Part A & B) along with clinical estimation, investigation reports, and doctor's admission notes for patient ${c.patientName} under policy number ${c.policy.policyNumber || "POL-99420"}.\n\nRequested Pre-Auth Amount: ₹${(c.preAuth?.requestedAmount || 60000).toLocaleString("en-IN")}\nDiagnosis: ${c.preAuth?.diagnosis || "Inpatient Care"}\nTreating Doctor: ${c.preAuth?.treatingDoctor || "Consulting Specialist"}\n\nKindly issue the initial sanction approval at the earliest.\n\nWarm regards,\nInsurance & Cashless Desk\nHospAI General Hospital`,
        attachments: ["PreAuth_Form_A_B.pdf", "Clinical_Summary.pdf", "Cost_Estimation.pdf"],
        by: "Insurance Coordinator",
      },
      {
        id: `mail-init-in-${c.id}`,
        direction: "in",
        purpose: "Pre-Auth",
        at: new Date(Date.now() - 3600000).toISOString(),
        from: `approvals@${tpaName.toLowerCase().replace(/[^a-z]/g, "")}.in`,
        to: hospEmail,
        subject: `[${c.id}] SANCTION APPROVAL: Initial Cashless Pre-Auth Approved — ${c.patientName}`,
        body: `Dear Hospital Cashless Desk,\n\nWe are pleased to inform you that the cashless pre-authorization request for patient ${c.patientName} (Member ID: ${c.policy.memberId || "MEM-9921"}) has been APPROVED under policy ${c.policy.policyNumber || "POL-99420"}.\n\n----------------------------------------\nAUTHORIZATION CODE: AUTH-${tpaName.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}\nSANCTIONED AMOUNT: ₹${(c.preAuth?.requestedAmount ? Math.round(c.preAuth.requestedAmount * 0.95) : 50000).toLocaleString("en-IN")}\nCO-PAY APPLICABLE: ${c.policy.copayPercentage || 0}%\n----------------------------------------\n\nTerms & Conditions:\n1. Non-medical items (admission kit, PPE, toiletries) are excluded from cashless coverage.\n2. Final settlement is subject to verified discharge summary and original consolidated bills.\n\nRegards,\nCashless Claims & Pre-Auth Department\n${tpaName}`,
        attachments: ["PreAuth_Sanction_Letter.pdf", "GIPSA_Schedule.pdf"],
        by: "Inbound TPA Mailbox Listener",
      },
    ]
  }, [c])

  const activeMail = useMemo(() => {
    if (selectedMailId) {
      return mails.find((m) => m.id === selectedMailId) || mails[0]
    }
    return mails[0]
  }, [mails, selectedMailId])

  // Filtered email list for this patient
  const filteredMails = useMemo(() => {
    return mails.filter((m) => {
      if (filterType === "in" && m.direction !== "in") return false
      if (filterType === "out" && m.direction !== "out") return false
      if (filterType === "approvals" && !(m.direction === "in" && m.subject.toLowerCase().includes("approval"))) return false
      if (filterType === "queries" && !m.subject.toLowerCase().includes("query")) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          m.subject.toLowerCase().includes(q) ||
          m.from.toLowerCase().includes(q) ||
          m.to.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [mails, filterType, searchQuery])

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: mails.length,
      in: mails.filter((m) => m.direction === "in").length,
      out: mails.filter((m) => m.direction === "out").length,
      approvals: mails.filter((m) => m.direction === "in" && m.subject.toLowerCase().includes("approval")).length,
      queries: mails.filter((m) => m.subject.toLowerCase().includes("query")).length,
    }
  }, [mails])

  // Simulate receiving a live decision email for this patient
  const handleSimulateInboundDecision = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      const tpaName = c.policy.tpaName || c.policy.insurerName || "Medi Assist TPA"
      const authCode = `AUTH-${tpaName.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`
      const approvedAmt = c.preAuth?.requestedAmount ? Math.round(c.preAuth.requestedAmount * 0.95) : 65000

      const newMail: MailRecord = {
        id: `mail-in-${Date.now()}`,
        direction: "in",
        purpose: "Pre-Auth",
        at: new Date().toISOString(),
        from: `approvals@${tpaName.toLowerCase().replace(/[^a-z]/g, "")}.in`,
        to: "insurance.desk@hospai-hospital.org",
        subject: `[${c.id}] SANCTION LETTER: Cashless Approved for ₹${approvedAmt.toLocaleString("en-IN")} — ${c.patientName}`,
        body: `Dear Hospital Partner,\n\nPre-authorization request for ${c.patientName} (UHID: ${c.patientId}) has been processed and SANCTIONED.\n\nApproved Limit: ₹${approvedAmt.toLocaleString("en-IN")}\nPre-Auth Code: ${authCode}\nStatus: APPROVED\n\nPlease proceed with inpatient treatment under cashless coverage.\n\nRegards,\n${tpaName} Medical Adjudication Desk`,
        attachments: ["Sanction_Approval_Official.pdf"],
        by: "TPA Webhook API Listener",
      }

      try {
        E.recordInsurerEmail(c.id, {
          purpose: "Pre-Auth",
          from: newMail.from,
          subject: newMail.subject,
          body: newMail.body,
          receivedAt: newMail.at,
        })
      } catch {}

      setSelectedMailId(newMail.id)
      setIsRefreshing(false)
      notify(`New Inbound Email from ${tpaName}: Approved for ₹${approvedAmt.toLocaleString("en-IN")}`, "success")
    }, 800)
  }

  const activeIndex = useMemo(() => {
    if (!activeMail) return 0
    const idx = filteredMails.findIndex((m) => m.id === activeMail.id)
    return idx >= 0 ? idx + 1 : 1
  }, [filteredMails, activeMail])

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
              Email History &amp; TPA Communications
            </h3>
            <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
              Patient: {c.patientName}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Case #{c.id} • Insurer: <span className="font-bold text-slate-800">{c.policy.tpaName || c.policy.insurerName}</span> • Policy: <span className="font-mono text-slate-700">{c.policy.policyNumber || "POL-99420"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSimulateInboundDecision}
            disabled={isRefreshing}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Checking TPA…" : "Fetch Inbound Decision"}
          </button>

          <button
            type="button"
            onClick={() => setIsComposing(!isComposing)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
          >
            <Send size={13} /> {isComposing ? "Close Composer" : "Compose Email"}
          </button>
        </div>
      </div>

      {/* ── EMAIL COMPOSER (WHEN ACTIVE) ── */}
      {isComposing && (
        <div className="border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
          <MailComposer
            c={c}
            purpose="General"
            notify={(m, t) => {
              notify(m, t)
              if (t !== "error") setIsComposing(false)
            }}
            allowPortal={false}
          />
        </div>
      )}

      {/* ── EXACT IMAGE 3 LAYOUT & DESIGN MATCH ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5 bg-[#F0F2F5] p-3 rounded-2xl border border-slate-200/90 shadow-2xs min-h-[550px]">
        {/* Left Column: Email Thread Cards (Image 3 style) */}
        <div className="flex flex-col space-y-3">
          {/* Pill Search Input (Image 3 style) */}
          <div className="bg-[#E2E8F0]/90 rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-2xs border border-slate-300/60 shrink-0">
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-medium"
            />
            <Search size={15} className="text-slate-400 shrink-0 ml-2" />
          </div>

          {/* Floating Message Cards List */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[580px]">
            {filteredMails.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200/80">
                No emails match your search.
              </div>
            ) : (
              filteredMails.map((m) => {
                const isSelected = activeMail?.id === m.id
                const snippet = m.body.replace(/={4,}/g, "").replace(/\n+/g, " ").trim().slice(0, 95)
                const isApproval = m.subject.toLowerCase().includes("approval") || m.subject.toLowerCase().includes("sanction")
                const isQuery = m.subject.toLowerCase().includes("query")
                const pillBg = isApproval ? "bg-emerald-500" : isQuery ? "bg-amber-500" : m.direction === "in" ? "bg-sky-500" : "bg-blue-600"

                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMailId(m.id)}
                    className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer relative shadow-2xs ${
                      isSelected
                        ? "border-blue-500 shadow-md ring-2 ring-blue-500/10"
                        : "border-slate-200/80 hover:border-slate-300 hover:shadow-xs"
                    }`}
                  >
                    {/* Vertical Right Edge Color Pill (Image 3 style) */}
                    <span className={`w-1.5 h-6 rounded-full absolute right-3.5 top-4 ${pillBg}`} />

                    {/* Header Row: Avatar + Title & Sender Name + Timestamp */}
                    <div className="flex items-start gap-3 pr-4">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColor(c.patientName)}`}>
                        {initialsOf(c.patientName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">
                          {m.subject}
                        </h3>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <span className="text-[11.5px] text-slate-400 font-medium truncate">
                            {m.direction === "in" ? m.from.split("<")[0] : c.patientName}
                          </span>
                          <span className="text-[10.5px] text-slate-400 font-normal shrink-0">
                            {timeAgo(m.at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2-line preview snippet */}
                    <p className="text-[11.5px] text-slate-500 font-normal leading-relaxed line-clamp-2 mt-2">
                      {snippet}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Full Email Workspace (Clean View Mode) */}
        <div className="flex flex-col overflow-y-auto space-y-4 max-h-[640px]">
          {activeMail ? (
            /* Main Email Card */
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4 relative flex-1">
              {/* Header: Sender to Recipient + Timestamp + Avatar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                <div className="text-xs text-slate-600 font-medium truncate">
                  <strong className="text-slate-900 font-bold">{activeMail.from}</strong>{" "}
                  <span className="text-slate-400 font-normal">to</span>{" "}
                  <strong className="text-slate-800 font-semibold">{activeMail.to}</strong>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[11.5px] font-mono text-slate-400 font-medium">
                    {fmtDateTime(activeMail.at)}
                  </span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 shadow-2xs ${avatarColor(c.patientName)}`}>
                    {initialsOf(c.patientName)}
                  </div>
                </div>
              </div>

              {/* Reduced & Crisp Subject Heading */}
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug">
                {activeMail.subject}
              </h2>

              {/* Inbound TPA Decision Sanction Callout & Local Approval Bar */}
              {activeMail.direction === "in" &&
                (activeMail.subject.toLowerCase().includes("approval") ||
                  activeMail.subject.toLowerCase().includes("sanction")) && (
                  <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-200/80 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm mb-1">
                          <CheckCircle2 size={18} className="text-indigo-600" /> TPA Sanction Decision Detected
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-lg">
                          This email contains an official sanction decision for <span className="font-bold text-slate-900">{c.patientName}</span>. Review the terms below and apply to claim.
                        </p>
                      </div>

                      {c.approvedPreAuthAmount === 0 && adjMode === "idle" && (
                        <button
                          type="button"
                          onClick={() => {
                            setAdjMode("review")
                            setAdjAmount((c.preAuth?.requestedAmount ? Math.round(c.preAuth.requestedAmount * 0.95) : 50000).toString())
                            setAdjCode(`AUTH-${(c.policy.tpaName || "TPA").slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`)
                            setAdjOutcome("Approved")
                            setAdjNote("Sanction verified from inbound TPA email.")
                          }}
                          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shrink-0 active:scale-95"
                        >
                          <Sparkles size={14} /> Review &amp; Record Decision
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
                  </div>
                )}

              {/* Formatted Email Body */}
              <div className="pt-2">
                <EmailBody body={activeMail.body} />
              </div>

              {/* Attachment Cards */}
              {activeMail.attachments && activeMail.attachments.length > 0 && (
                <div className="pt-4 space-y-3 border-t border-slate-100">
                  {activeMail.attachments.map((att, i) => {
                    const iconBg = i % 2 === 0 ? "bg-sky-400" : "bg-amber-500"
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3.5 p-2 transition-all cursor-pointer group"
                      >
                        <div className={`w-12 h-12 rounded-2xl ${iconBg} text-white flex items-center justify-center shrink-0 shadow-2xs`}>
                          <Paperclip size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                            {att}
                          </h4>
                          <span className="text-xs text-slate-400 font-medium">
                            1.56Mb
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => notify(`Downloading ${att}…`, "success")}
                          className="p-2 text-slate-400 hover:text-blue-600 cursor-pointer"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
              <Mail size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-medium">Select an email to view full conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

