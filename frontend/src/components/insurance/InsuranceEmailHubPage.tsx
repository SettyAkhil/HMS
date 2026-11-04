import React, { useState, useMemo } from "react"
import {
  RefreshCw,
  Inbox,
  CheckCircle2,
  Send,
  AlertTriangle,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Paperclip,
  ExternalLink,
  Sparkles,
  FileText,
  Mail,
  Filter,
  ShieldCheck,
  X,
  Check,
  BookOpen,
  Download,
  MoreVertical,
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
} from "lucide-react"
import type { MailRecord } from "../../types/insurance"
import { InsuranceEngineService as E, STATUS_META } from "../../services/insuranceDb"

// Which insurer decision, if any, is actually pending for a case at this status.
const PREAUTH_PENDING = ["PREAUTH_SUBMITTED", "PREAUTH_UNDER_REVIEW", "PREAUTH_QUERY"]
const CLAIM_PENDING = ["CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED"]
const decisionKind = (status: string): "preauth" | "claim" | "none" =>
  PREAUTH_PENDING.includes(status) ? "preauth" : CLAIM_PENDING.includes(status) ? "claim" : "none"
const statusLabel = (status: string): string => (STATUS_META as Record<string, { label: string }>)[status]?.label ?? status
// Stable display size for a (mock) attachment that has no real file behind it.
const attSizeKB = (name: string): number => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return 120 + (h % 680)
}
// Stable soft avatar colour for a patient's initials.
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

const dateCategory = (at: string): "today" | "yesterday" | "older messages" => {
  const d = new Date(at)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return "today"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  if (isYesterday) return "yesterday"
  return "older messages"
}

// Render an email body, grouping consecutive "Label: value" lines into an
// enhanced, ultra-clean key-value panel with icons/emojis.
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

// Colour a claim status by its STATUS_META tone, so the same status reads the
// same colour everywhere on the page.
const TONE_CLASSES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
}
function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  const meta = (STATUS_META as Record<string, { label: string; tone: string }>)[status]
  const tone = TONE_CLASSES[meta?.tone ?? "slate"] ?? TONE_CLASSES.slate
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${tone} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {meta?.label ?? status}
    </span>
  )
}

// KPI tile: soft left icon, big number, trend badge + mini bar chart, ⋮ menu.
const KPI_ACCENT = {
  slate: { iconBg: "bg-blue-50", icon: "text-blue-600", bar: "bg-blue-400", trend: "text-blue-600" },
  emerald: { iconBg: "bg-emerald-50", icon: "text-emerald-600", bar: "bg-emerald-400", trend: "text-emerald-600" },
  blue: { iconBg: "bg-sky-50", icon: "text-sky-600", bar: "bg-sky-400", trend: "text-sky-600" },
  amber: { iconBg: "bg-amber-50", icon: "text-amber-600", bar: "bg-amber-400", trend: "text-amber-600" },
} as const
const BAR_HEIGHTS = [5, 8, 6, 11, 9, 14]
function MiniBars({ color }: { color: string }) {
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden>
      {BAR_HEIGHTS.map((h, i) => <span key={i} className={`w-[3px] rounded-sm ${color} opacity-80`} style={{ height: h }} />)}
    </div>
  )
}
function KpiCard({ icon, label, value, sub, trend, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; trend?: string; accent: keyof typeof KPI_ACCENT }) {
  const A = KPI_ACCENT[accent]
  return (
    <div className="relative bg-white border border-slate-200/90 rounded-xl px-3 py-2.5 shadow-2xs hover:border-slate-300 transition-all">
      <span className="absolute top-2 right-2 text-slate-300"><MoreVertical size={12} /></span>
      <div className="flex gap-2.5">
        <div className={`w-9 h-9 rounded-lg ${A.iconBg} ${A.icon} flex items-center justify-center shrink-0`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 pr-4 truncate">{label}</div>
          <div className="flex items-end justify-between gap-2 mt-0.5">
            <div className="text-[20px] leading-none font-black text-slate-900 tabular-nums">{value}</div>
            <div className="flex items-center gap-1 pb-0.5">
              {trend && <span className={`text-[9.5px] font-bold ${A.trend}`}>↑{trend}</span>}
              <MiniBars color={A.bar} />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 font-medium truncate">{sub}</div>
        </div>
      </div>
    </div>
  )
}
import { inr, fmtDateTime, type Notify, PageHeader, fieldBase, useNotify, useCases } from "./ui"
import InsuranceSopModal from "./InsuranceSopModal"

interface EnrichedMail extends MailRecord {
  claimId: string
  patientName: string
  insurerName: string
  tpaName?: string
  claimStatus: string
  approvedAmount?: number
}

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

export default function InsuranceEmailHubPage({
  onNavigateToClaim,
  notify: propNotify,
  initialClaimId,
}: {
  onNavigateToClaim: (claimId: string) => void
  notify?: Notify
  initialClaimId?: string
}) {
  const { notify: internalNotify, toastNode } = useNotify()
  const notify = propNotify || internalNotify
  const claims = useCases()
  const [selectedMailKey, setSelectedMailKey] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<"all" | "in" | "out" | "approvals" | "queries" | "settlement">("all")
  const [selectedInsurer, setSelectedInsurer] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [sopModalOpen, setSopModalOpen] = useState(false)
  const [starredKeys, setStarredKeys] = useState<Record<string, boolean>>({})

  // Decision Modal State for Insurance Dept Officer
  const [decisionModalOpen, setDecisionModalOpen] = useState(false)
  const [decisionType, setDecisionType] = useState<"Approved" | "Rejected" | "Query">("Approved")
  const [approvedAmountInput, setApprovedAmountInput] = useState("50000")
  const [approvalCodeInput, setApprovalCodeInput] = useState("AUTH-TPA-9921")
  const [decisionNoteInput, setDecisionNoteInput] = useState("")

  // Aggregate all emails across all claims in the hospital
  const allMails: EnrichedMail[] = useMemo(() => {
    const list: EnrichedMail[] = []

    claims.forEach((c) => {
      const tpaName = c.policy.tpaName || c.policy.insurerName || "Medi Assist TPA"
      const tpaEmail = `claims@${tpaName.toLowerCase().replace(/[^a-z]/g, "")}.in`
      const hospEmail = "insurance.desk@hospai-hospital.org"

      const caseMails = c.mails && c.mails.length > 0 ? c.mails : [
        {
          id: `mail-out-${c.id}`,
          direction: "out" as const,
          purpose: "Pre-Auth" as const,
          at: c.admissionDate || "2026-10-01T09:30:00Z",
          from: hospEmail,
          to: tpaEmail,
          subject: `[${c.id}] Pre-Authorization Request — ${c.patientName} (UHID: ${c.patientId})`,
          body: `Dear TPA Cashless Desk,\n\nPlease find attached the Pre-Authorization request package for patient ${c.patientName} under policy number ${c.policy.policyNumber || "POL-99210"}.\n\nRequested Amount: ₹${(c.preAuth?.requestedAmount || 55000).toLocaleString("en-IN")}\nDiagnosis: ${c.preAuth?.diagnosis || "Inpatient Care"}\nDoctor: ${c.preAuth?.treatingDoctor || "Consulting Specialist"}\n\nKindly process initial cashless sanction.\n\nRegards,\nHospAI Insurance Desk`,
          attachments: ["PreAuth_Form.pdf", "Clinical_Estimates.pdf"],
          by: "Insurance Officer",
        },
        {
          id: `mail-in-${c.id}`,
          direction: "in" as const,
          purpose: "Pre-Auth" as const,
          at: new Date(Date.now() - 3600000).toISOString(),
          from: `approvals@${tpaName.toLowerCase().replace(/[^a-z]/g, "")}.in`,
          to: hospEmail,
          subject: `[${c.id}] SANCTION APPROVAL: Cashless Pre-Auth Approved for ₹${(c.approvedPreAuthAmount || 50000).toLocaleString("en-IN")} — ${c.patientName}`,
          body: `Dear Hospital Partner,\n\nWe have approved the initial cashless pre-authorization for patient ${c.patientName} (Member ID: ${c.policy.memberId || "MEM-9921"}).\n\n=========================================\nAUTHORIZATION CODE: ${c.preAuth?.approvalCode || `AUTH-${tpaName.slice(0, 3).toUpperCase()}-9921`}\nAPPROVED LIMIT: ₹${(c.approvedPreAuthAmount || 50000).toLocaleString("en-IN")}\nCO-PAY APPLICABLE: ${c.policy.copayPercentage || 0}%\n=========================================\n\nTerms: Non-medical exclusions apply. Final payment subject to verified discharge bill.\n\nRegards,\nCashless Claims Department\n${tpaName}`,
          attachments: ["PreAuth_Sanction_Letter.pdf"],
          by: "TPA Gateway Listener",
        },
      ]

      caseMails.forEach((m) => {
        list.push({
          ...m,
          claimId: c.id,
          patientName: c.patientName,
          insurerName: c.policy.insurerName,
          tpaName: c.policy.tpaName,
          claimStatus: c.status,
          approvedAmount: c.approvedPreAuthAmount,
        })
      })
    })

    // Sort newest first
    return list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [claims])

  // Filtered emails list
  const filteredMails = useMemo(() => {
    return allMails.filter((m) => {
      if (initialClaimId && m.claimId !== initialClaimId) return false
      if (filterType === "in" && m.direction !== "in") return false
      if (filterType === "out" && m.direction !== "out") return false
      if (filterType === "approvals" && !(m.direction === "in" && (m.subject.toLowerCase().includes("approval") || m.subject.toLowerCase().includes("sanction")))) return false
      if (filterType === "queries" && !m.subject.toLowerCase().includes("query")) return false
      if (filterType === "settlement" && !m.subject.toLowerCase().includes("settlement")) return false

      if (selectedInsurer && m.insurerName !== selectedInsurer && m.tpaName !== selectedInsurer) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          m.subject.toLowerCase().includes(q) ||
          m.patientName.toLowerCase().includes(q) ||
          m.claimId.toLowerCase().includes(q) ||
          m.from.toLowerCase().includes(q) ||
          m.to.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [allMails, filterType, selectedInsurer, searchQuery, initialClaimId])

  const activeMail = useMemo(() => {
    if (selectedMailKey) {
      return allMails.find((m) => `${m.claimId}_${m.id}` === selectedMailKey) || filteredMails[0] || allMails[0]
    }
    return filteredMails[0] || allMails[0]
  }, [allMails, filteredMails, selectedMailKey])

  const insurers = useMemo(() => {
    return [...new Set(claims.map((c) => c.policy.tpaName || c.policy.insurerName))].filter(Boolean).sort()
  }, [claims])

  const toggleStar = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setStarredKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Group emails by date headers (Today, Yesterday, Older messages - Image 2)
  const groupedMails = useMemo(() => {
    const categories: Array<"today" | "yesterday" | "older messages"> = ["today", "yesterday", "older messages"]
    const map: Record<string, EnrichedMail[]> = {
      today: [],
      yesterday: [],
      "older messages": [],
    }
    filteredMails.forEach((m) => {
      const cat = dateCategory(m.at)
      map[cat].push(m)
    })
    return categories
      .map((cat) => ({ category: cat, items: map[cat] }))
      .filter((g) => g.items.length > 0)
  }, [filteredMails])

  const handleSimulateInboundDecision = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setIsRefreshing(false)
      notify("Inbound TPA Mailbox Synced: 2 new decisions fetched from Medi Assist and Star Health gateways.", "success")
    }, 600)
  }

  // Handle opening decision modal for insurance officer
  const handleOpenDecision = (type: "Approved" | "Rejected" | "Query", mail: EnrichedMail) => {
    setDecisionType(type)
    const claim = E.getClaimById(mail.claimId)
    const isClaim = decisionKind(mail.claimStatus) === "claim"
    const defaultAmt = isClaim
      ? (claim?.finalClaimAmount || claim?.approvedPreAuthAmount || mail.approvedAmount || 50000)
      : (claim?.preAuth?.requestedAmount || mail.approvedAmount || 50000)
    const defaultCode = claim?.preAuth?.approvalCode || `AUTH-${(mail.tpaName || "TPA").slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
    const word = isClaim ? "Claim" : "Pre-auth"

    setApprovedAmountInput(String(defaultAmt))
    setApprovalCodeInput(defaultCode)
    setDecisionNoteInput(type === "Approved" ? `${word} sanctioned by TPA. Verified and updated by Insurance Dept.` : type === "Rejected" ? `${word} rejected by TPA.` : "TPA raised a deficiency query.")
    setDecisionModalOpen(true)
  }

  // Execute status update in database
  const handleConfirmDecision = () => {
    if (!activeMail) return
    const isClaim = decisionKind(activeMail.claimStatus) === "claim"
    const word = isClaim ? "Claim" : "Pre-auth"
    try {
      if (decisionType === "Approved") {
        const amt = parseFloat(approvedAmountInput) || 0
        if (!amt) {
          notify("Please enter a valid approved amount.", "error")
          return
        }
        if (!isClaim && !approvalCodeInput.trim()) {
          notify("Please enter an approval code.", "error")
          return
        }
        E.recordPreAuthResponse(activeMail.claimId, {
          outcome: "Approved",
          amount: amt,
          approvalCode: approvalCodeInput.trim(),
          note: decisionNoteInput || `${word} approved by Insurance Dept`
        })
        notify(`${word} APPROVED for ₹${amt.toLocaleString("en-IN")} — case updated.`, "success")
      } else if (decisionType === "Rejected") {
        E.recordPreAuthResponse(activeMail.claimId, {
          outcome: "Rejected",
          note: decisionNoteInput || `${word} rejected by Insurance Dept based on TPA response`
        })
        notify(`${word} status updated to REJECTED.`, "error")
      } else if (decisionType === "Query") {
        E.recordPreAuthResponse(activeMail.claimId, {
          outcome: "Query",
          note: decisionNoteInput || "TPA Deficiency Query Raised",
          dueDays: 2
        })
        notify(`TPA deficiency query recorded on the ${word.toLowerCase()} — case updated.`, "success")
      }
      setDecisionModalOpen(false)
      setIsRefreshing(true)
      setTimeout(() => setIsRefreshing(false), 400)
    } catch (err: any) {
      notify(err.message || "Failed to update case status", "error")
    }
  }

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: allMails.length,
      in: allMails.filter((m) => m.direction === "in").length,
      out: allMails.filter((m) => m.direction === "out").length,
      approvals: allMails.filter((m) => m.direction === "in" && (m.subject.toLowerCase().includes("approval") || m.subject.toLowerCase().includes("sanction"))).length,
      queries: allMails.filter((m) => m.subject.toLowerCase().includes("query")).length,
    }
  }, [allMails])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
      {toastNode}

      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-3.5 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-[1700px] mx-auto">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Email &amp; TPA Communication Hub</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live TPA Gateway
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              Hospital-wide live inbox, pre-auth sanctions, deficiency query notices, and settlement advice across all TPAs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSopModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-50 border border-indigo-200/90 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <BookOpen size={13} className="text-indigo-600" />
              <span>Dept Rules &amp; SOPs</span>
            </button>

            <button
              type="button"
              onClick={handleSimulateInboundDecision}
              disabled={isRefreshing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs shadow-emerald-500/20 active:scale-95"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "Syncing Gateways…" : "Sync Inbound TPA Gateways"}
            </button>
          </div>
        </div>
      </div>
      <InsuranceSopModal isOpen={sopModalOpen} onClose={() => setSopModalOpen(false)} />

      <div className="p-4 space-y-3.5 max-w-[1700px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
        {/* ── KPI Metric Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
          <KpiCard accent="slate" icon={<Mail size={20} />} value={allMails.length} label="Total Email Threads" sub={`Across ${claims.length} active claims`} trend="12%" />
          <KpiCard accent="emerald" icon={<CheckCircle2 size={20} />} value={counts.approvals} label="TPA Approvals Received" sub="Sanctioned & Applied" trend="8%" />
          <KpiCard accent="blue" icon={<Send size={20} />} value={counts.out} label="Outbound Claims Sent" sub="Delivered via SMTP Gateway" trend="15%" />
          <KpiCard accent="amber" icon={<AlertTriangle size={20} />} value={counts.queries} label="Deficiency Queries" sub="Awaiting hospital responses" />
        </div>

        {/* ── Compact Filter Control Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white border border-slate-200/90 p-2.5 rounded-xl shadow-2xs flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Patient, Claim ID, Subject, or TPA…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 h-8.5 text-[11.5px] bg-slate-50/90 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
              />
            </div>

            {/* Segmented Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100/70 p-0.5 rounded-lg border border-slate-200/60 overflow-x-auto scrollbar-none">
              {([
                { id: "all", label: "All", icon: Inbox, count: counts.all, active: "bg-slate-900 text-white" },
                { id: "in", label: "Inbound", icon: ArrowDownLeft, count: counts.in, active: "bg-teal-600 text-white" },
                { id: "out", label: "Outbound", icon: ArrowUpRight, count: counts.out, active: "bg-blue-600 text-white" },
                { id: "approvals", label: "Sanctions", icon: CheckCircle2, count: counts.approvals, active: "bg-emerald-600 text-white" },
                { id: "queries", label: "Queries", icon: AlertTriangle, count: counts.queries, active: "bg-amber-500 text-white" },
              ] as const).map((f) => {
                const Icon = f.icon
                const on = filterType === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilterType(f.id as typeof filterType)}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      on ? `${f.active} shadow-xs` : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                    }`}
                  >
                    <Icon size={13} className={on ? "text-white" : "text-slate-400"} />
                    <span>{f.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                      on ? "bg-white/25 text-white" : "bg-slate-200/80 text-slate-700"
                    }`}>
                      {f.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Insurer Selector Dropdown */}
          <div className="w-48">
            <select
              value={selectedInsurer}
              onChange={(e) => setSelectedInsurer(e.target.value)}
              className="w-full h-8.5 text-[11.5px] bg-slate-50/90 border border-slate-200 rounded-lg px-3 text-slate-700 font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-all"
            >
              <option value="">All TPAs &amp; Insurers</option>
              {insurers.map((ins) => (
                <option key={ins} value={ins}>{ins}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── TWO-COLUMN EMAIL EXPLORER (EXACT IMAGE 3 UI STYLE MATCH) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5 flex-1 min-h-0 bg-[#F0F2F5] p-2 rounded-2xl">
          {/* Left Column: Messages List (Image 3 Style: Pill Search + Floating White Cards with Right Indicator Pills) */}
          <div className="flex flex-col overflow-hidden space-y-3">
            {/* Search Input Bar (Image 3 style) */}
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

            {/* Email Cards List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredMails.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200/80">
                  No emails found matching your active filters.
                </div>
              ) : (
                filteredMails.map((m) => {
                  const key = `${m.claimId}_${m.id}`
                  const isSelected = (selectedMailKey ? selectedMailKey === key : activeMail?.id === m.id && activeMail?.claimId === m.claimId)
                  const snippet = m.body.replace(/={4,}/g, "").replace(/\n+/g, " ").trim().slice(0, 95)
                  
                  // Color pill indicator on right edge (Image 3 style)
                  const isReject = m.claimStatus?.includes("REJECT")
                  const isApprove = m.claimStatus?.includes("APPROV")
                  const isQuery = m.subject?.toLowerCase().includes("query")
                  const pillBg = isReject ? "bg-rose-500" : isApprove ? "bg-emerald-500" : isQuery ? "bg-amber-500" : m.direction === "in" ? "bg-sky-500" : "bg-blue-600"

                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedMailKey(key)}
                      className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer relative shadow-2xs ${
                        isSelected
                          ? "border-blue-500 shadow-md ring-2 ring-blue-500/10"
                          : "border-slate-200/80 hover:border-slate-300 hover:shadow-xs"
                      }`}
                    >
                      {/* Vertical Indicator Pill on Right Edge (Image 3 style) */}
                      <span className={`w-1.5 h-6 rounded-full absolute right-3.5 top-4 ${pillBg}`} />

                      {/* Header Row: Avatar + Title & Sender Name + Date */}
                      <div className="flex items-start gap-3 pr-4">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${avatarColor(m.patientName)}`}>
                          {initialsOf(m.patientName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">
                              {m.subject}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <span className="text-[11.5px] text-slate-400 font-medium truncate">
                              {m.patientName}
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

          {/* Right Column: Full Email View (Clean View Mode) */}
          <div className="flex flex-col overflow-y-auto space-y-4">
            {activeMail ? (
              /* Main Email Card */
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4 relative flex-1">
                {/* Header: Sender to Recipient + Date + Avatar */}
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
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 shadow-2xs ${avatarColor(activeMail.patientName)}`}>
                      {initialsOf(activeMail.patientName)}
                    </div>
                  </div>
                </div>

                {/* Reduced & Crisp Subject Heading */}
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug">
                  {activeMail.subject}
                </h2>

                {/* Status Pills & Workspace Link Button */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200/80">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      {activeMail.direction === "in" ? "HOSPITAL IN" : "HOSPITAL OUT"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200/80">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      {activeMail.purpose?.toUpperCase() || "PRE-AUTH"}
                    </span>
                    <StatusChip status={activeMail.claimStatus} />
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigateToClaim(activeMail.claimId)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <ExternalLink size={13} />
                    <span>View in Claim Workspace</span>
                  </button>
                </div>

                {/* Insurance Verification & Local Decision Action Bar */}
                {(() => {
                  const kind = decisionKind(activeMail.claimStatus)
                  const stageWord = kind === "preauth" ? "Pre-Authorization" : "Claim"
                  const negative = ["REJECTED", "PREAUTH_REJECTED", "NOT_ELIGIBLE"].includes(activeMail.claimStatus)
                  const positive = ["APPROVED", "PARTIALLY_APPROVED", "PREAUTH_APPROVED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"].includes(activeMail.claimStatus)
                  const tone = negative
                    ? { border: "border-rose-200", bg: "bg-rose-50/70", icon: "text-rose-600" }
                    : positive
                      ? { border: "border-emerald-200", bg: "bg-emerald-50/60", icon: "text-emerald-600" }
                      : { border: "border-indigo-200", bg: "bg-gradient-to-r from-indigo-50/80 to-blue-50/80", icon: "text-indigo-600" }
                  return (
                    <div className={`border ${tone.border} ${tone.bg} rounded-2xl p-4 shadow-sm space-y-3`}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className={tone.icon} size={18} />
                          <h4 className="text-xs font-extrabold text-slate-900 tracking-tight">
                            Pre-Auth Decision Action Bar (Local Adjudication)
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          Current status: <StatusChip status={activeMail.claimStatus} />
                        </div>
                      </div>

                      {kind === "none" ? (
                        <p className="text-xs text-slate-600 leading-relaxed">
                          No insurer decision pending at this stage — the case is officially <strong className="text-slate-900">{statusLabel(activeMail.claimStatus)}</strong>.
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenDecision("Approved", activeMail)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                          >
                            <CheckCircle2 size={14} /> Approve {stageWord}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDecision("Rejected", activeMail)}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                          >
                            <X size={14} /> Reject {stageWord}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDecision("Query", activeMail)}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                          >
                            <AlertTriangle size={14} /> Raise Query
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Formatted Message Body */}
                <div className="pt-2">
                  <EmailBody body={activeMail.body} />
                </div>

                {/* Image 3 Style Attachments Section */}
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
                              {attSizeKB(att)} KB
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

      {/* ── INSURANCE DEPT DECISION MODAL ── */}
      {decisionModalOpen && activeMail && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-4 px-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-indigo-400" />
                <h3 className="text-sm font-bold">
                  {(() => {
                    const w = decisionKind(activeMail.claimStatus) === "claim" ? "Claim" : "Pre-Authorization"
                    return decisionType === "Approved" ? `Approve ${w}` : decisionType === "Rejected" ? `Reject ${w}` : "Record Deficiency Query"
                  })()}
                </h3>
              </div>
              <button
                onClick={() => setDecisionModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                <div><span className="text-slate-400 font-medium">Patient:</span> <strong className="text-slate-900">{activeMail.patientName}</strong></div>
                <div><span className="text-slate-400 font-medium">Claim ID:</span> <strong className="font-mono text-slate-800">{activeMail.claimId}</strong></div>
                <div><span className="text-slate-400 font-medium">TPA Insurer:</span> <strong className="text-slate-800">{activeMail.tpaName || activeMail.insurerName}</strong></div>
              </div>

              {decisionType === "Approved" && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Approved Sanction Amount (₹)</label>
                    <input
                      type="number"
                      value={approvedAmountInput}
                      onChange={(e) => setApprovedAmountInput(e.target.value)}
                      className="w-full h-9 px-3 border border-slate-300 rounded-lg font-mono font-bold text-emerald-800 text-sm focus:outline-none focus:border-emerald-600"
                      placeholder="e.g. 50000"
                    />
                  </div>

                  {decisionKind(activeMail.claimStatus) !== "claim" && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">TPA Approval / Sanction Code</label>
                      <input
                        type="text"
                        value={approvalCodeInput}
                        onChange={(e) => setApprovalCodeInput(e.target.value)}
                        className="w-full h-9 px-3 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 text-xs focus:outline-none focus:border-blue-600"
                        placeholder="e.g. AUTH-CARE-9982"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {decisionType === "Approved" ? "Approval Notes" : decisionType === "Rejected" ? "Rejection Reason / Notes" : "Query Details"}
                </label>
                <textarea
                  rows={3}
                  value={decisionNoteInput}
                  onChange={(e) => setDecisionNoteInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                  placeholder="Enter decision notes..."
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDecisionModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDecision}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs ${
                  decisionType === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" : decisionType === "Rejected" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {decisionType === "Approved" ? "Confirm Approval & Update System" : decisionType === "Rejected" ? "Confirm Rejection & Update System" : "Record Query & Update System"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
