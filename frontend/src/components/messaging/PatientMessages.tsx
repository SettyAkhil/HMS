import React, { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageCircle,
  MessageSquare,
  Mail,
  RefreshCw,
  RotateCcw,
  Star,
  XCircle,
} from "lucide-react"
import { API_BASE } from "../../lib/constants"
import { getCsrfToken, getHospitalCode } from "../../lib/api"
import {
  CHANNEL_LABEL,
  MESSAGE_KINDS,
  getMessagingSettings,
  getMessagingStatus,
  markHandedOff,
  previewMessage,
  refreshDeliveryStatus,
  retryQueuedMessages,
  saveMessagingSettings,
  smsHandoffUrl,
  whatsAppHandoffUrl,
  emailHandoffUrl,
  type MessageKind,
  type MessagingSettings,
  type MessagingStatus,
} from "../../services/patientMessaging"
import {
  getPatientMessages,
  subscribe,
  type MessageChannel,
  type NotificationStatus,
  type PatientNotification,
} from "../../services/patientNotifications"
import { formatDateTimeIST } from "../../lib/format"
import { BRANDING_EVENT, prepareHospitalLogo, saveHospitalLogo } from "../../lib/branding"
import { HospitalMark, useBranding } from "../branding/DocumentBranding"

/**
 * Patient Messages: everything sent (or waiting to be sent) to patients by
 * SMS and WhatsApp, how each kind of message is routed and worded, and what
 * the server still needs before messages can actually go.
 */

type Tab = "messages" | "templates" | "setup" | "feedback"

const TABS: { key: Tab ;label: string }[] = [
  { key: "messages", label: "Messages" },
  { key: "templates", label: "Templates & routing" },
  { key: "feedback", label: "Feedback replies" },
  { key: "setup", label: "Setup" },
]

export default function PatientMessages() {
  const [tab, setTab] = useState<Tab>("messages")
  const [status, setStatus] = useState<MessagingStatus | null>(null)

  const loadStatus = () => getMessagingStatus().then(setStatus)
  useEffect(() => {
    loadStatus()
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5] min-w-0">
      <div className="bg-white border-b border-[#DDE2EC] px-4 sm:px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Patient Messages</h1>
        <p className="text-[12.5px] text-[#64748B]">
          SMS and WhatsApp to patients -- appointment and OP updates, bills, discharge
          summaries, reports and feedback requests.
        </p>
        <StatusStrip status={status} />
      </div>

      <div className="bg-white border-b border-[#DDE2EC] px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2.5 text-[13px] whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key
                ? "border-[#1B4FD8] text-[#1B4FD8] font-medium"
                : "border-transparent text-[#64748B] hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {tab === "messages" && <MessagesTab onStatusChange={loadStatus} />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "feedback" && <FeedbackTab />}
        {tab === "setup" && <SetupTab status={status} onSaved={loadStatus} />}
      </div>
    </div>
  )
}

function StatusStrip({ status }: { status: MessagingStatus | null }) {
  if (!status) return <div className="mt-3 text-[12px] text-[#94A3B8]">Checking the messaging service...</div>
  if (!status.reachable) {
    return (
      <div className="mt-3 text-[12px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-none px-3 py-2 flex gap-2">
        <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
        <span>
          {status.reason} Messages are being kept here as <strong>queued</strong>; nothing has
          reached a patient's phone except what was handed off by hand.
        </span>
      </div>
    )
  }
  const items: [string, boolean][] = [
    ["SMS", status.sms],
    ["WhatsApp", status.whatsapp],
    ["Email", status.email ?? true],
    ["PDF attachments & links", status.documentLinks],
  ]
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map(([label, ok]) => (
        <span
          key={label}
          className={`text-[11.5px] px-2 py-1 rounded-none border inline-flex items-center gap-1 ${
            ok ? "text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]" : "text-[#92400E] bg-[#FFFBEB] border-[#FDE68A]"
          }`}
        >
          {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          {label}: {ok ? "ready" : "not set up"}
        </span>
      ))}
    </div>
  )
}

// ── Messages ─────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<NotificationStatus, { label: string ;cls: string ;icon: React.ReactNode }> = {
  queued: { label: "Queued", cls: "text-[#92400E] bg-[#FFFBEB] border-[#FDE68A]", icon: <Clock size={12} /> },
  sent: { label: "Sent", cls: "text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]", icon: <CheckCircle2 size={12} /> },
  delivered: { label: "Delivered", cls: "text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]", icon: <CheckCircle2 size={12} /> },
  read: { label: "Read", cls: "text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]", icon: <CheckCircle2 size={12} /> },
  failed: { label: "Failed", cls: "text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]", icon: <XCircle size={12} /> },
  manual: { label: "Handed off", cls: "text-[#475569] bg-[#F1F5F9] border-[#E2E8F0]", icon: <MessageCircle size={12} /> },
}

function kindLabel(kind?: string) {
  return MESSAGE_KINDS[kind as MessageKind]?.label || "Message"
}

function MessagesTab({ onStatusChange }: { onStatusChange: () => void }) {
  const [messages, setMessages] = useState<PatientNotification[]>(() => getPatientMessages())
  const [channel, setChannel] = useState<"all" | MessageChannel>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | NotificationStatus>("all")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => subscribe(() => setMessages(getPatientMessages())), [])

  const queuedCount = messages.filter((m) => m.status === "queued").length
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return messages.filter(
      (m) =>
        (channel === "all" || m.channel === channel) &&
        (statusFilter === "all" || m.status === statusFilter) &&
        (!q ||
          m.patientName.toLowerCase().includes(q) ||
          m.phone.includes(q) ||
          (m.umr || "").toLowerCase().includes(q)),
    )
  }, [messages, channel, statusFilter, query])

  const retry = async () => {
    setBusy("retry")
    setNote(null)
    const r = await retryQueuedMessages()
    setBusy(null)
    setNote(
      r.sent || r.failed
        ? `${r.sent} sent, ${r.failed} failed, ${r.queued} still queued.`
        : r.queued
          ? `Still unable to send -- ${r.queued} queued. See the reason on each message.`
          : "Nothing was queued.",
    )
    onStatusChange()
  }

  const refresh = async () => {
    setBusy("refresh")
    setNote(null)
    const ok = await refreshDeliveryStatus()
    setBusy(null)
    setNote(ok ? "Delivery status updated from the provider's receipts." : "Could not reach the messaging service.")
  }

  const handOff = (m: PatientNotification) => {
    let url: string | null = null
    if (m.channel === "whatsapp") {
      url = whatsAppHandoffUrl(m.phone, m.message)
    } else if (m.channel === "email") {
      url = emailHandoffUrl(m.email || "", m.documentTitle || "Hospital Document", m.message)
    } else {
      url = smsHandoffUrl(m.phone, m.message)
    }
    if (!url) return
    window.open(url, "_blank", "noopener")
    markHandedOff([m.id])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patient, phone, UMR"
          className="h-9 px-3 text-[13px] border border-[#DDE2EC] rounded-none bg-white w-full sm:w-64"
        />
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as any)}
          className="h-9 px-2 text-[13px] border border-[#DDE2EC] rounded-none bg-white"
        >
          <option value="all">All channels</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="h-9 px-2 text-[13px] border border-[#DDE2EC] rounded-none bg-white"
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_STYLE) as NotificationStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_STYLE[s].label}
            </option>
          ))}
        </select>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={refresh}
            disabled={!!busy}
            className="h-9 px-3 text-[12.5px] border border-[#DDE2EC] bg-white rounded-none hover:bg-[#F8FAFC] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={13} className={busy === "refresh" ? "animate-spin" : ""} /> Delivery status
          </button>
          <button
            type="button"
            onClick={retry}
            disabled={!!busy || queuedCount === 0}
            className="h-9 px-3 text-[12.5px] font-medium bg-[#1B4FD8] text-white rounded-none hover:bg-[#1740B4] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw size={13} className={busy === "retry" ? "animate-spin" : ""} /> Retry queued ({queuedCount})
          </button>
        </div>
      </div>
      {note && <p className="text-[12px] text-[#475569]">{note}</p>}

      <div className="bg-white border border-[#DDE2EC] rounded-none overflow-hidden">
        {shown.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-[#94A3B8]">
            {messages.length === 0
              ? "No messages yet. Appointment and OP updates appear here as they happen; documents are sent with the Send to patient button on bills, discharge and the patient chart."
              : "No messages match these filters."}
          </div>
        ) : (
          <ul className="divide-y divide-[#EEF1F6]">
            {shown.map((m) => {
              const st = STATUS_STYLE[m.status] || STATUS_STYLE.queued
              const open = expanded === m.id
              return (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <span className="text-[#64748B] mt-0.5" title={CHANNEL_LABEL[m.channel as MessageChannel]}>
                      {m.channel === "whatsapp" ? (
                        <MessageCircle size={15} />
                      ) : m.channel === "email" ? (
                        <Mail size={15} />
                      ) : (
                        <MessageSquare size={15} />
                      )}
                    </span>
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[13px] font-medium text-gray-900">
                        {m.patientName}
                        <span className="font-normal text-[#64748B]">
                          {" "}
                          · {m.channel === "email" ? m.email || m.phone || "no email" : m.phone || "no number"}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {kindLabel(m.kind)} by {CHANNEL_LABEL[m.channel as MessageChannel]}
                        {m.documentTitle ? ` · ${m.documentTitle}` : ""} · {formatDateTimeIST(m.createdAt)}
                      </div>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-none border inline-flex items-center gap-1 ${st.cls}`}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                  {(m.status === "queued" || m.status === "failed" || m.hint) && (m.hint || m.error) && (
                    <div className="text-[11.5px] text-[#92400E] mt-1 pl-7">{m.hint || m.error}</div>
                  )}
                  <div className="pl-7 mt-1.5 flex flex-wrap gap-3 text-[12px]">
                    <button type="button" onClick={() => setExpanded(open ? null : m.id)} className="text-[#1B4FD8] hover:underline">
                      {open ? "Hide message" : "Show message"}
                    </button>
                    {(m.status === "queued" || m.status === "failed") && (m.phone || m.email) && (
                      <button type="button" onClick={() => handOff(m)} className="text-[#1B4FD8] hover:underline">
                        Open in {m.channel === "whatsapp" ? "WhatsApp" : m.channel === "email" ? "Email app" : "SMS app"}
                      </button>
                    )}
                  </div>
                  {open && (
                    <pre className="mt-2 ml-7 whitespace-pre-wrap font-sans text-[12.5px] text-gray-800 bg-[#F8FAFC] border border-[#EEF1F6] rounded-none p-3">
                      {previewMessage(m.message, !!m.documentTitle)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="text-[11.5px] text-[#94A3B8]">
        "Sent" means the provider accepted the message. "Delivered" and "Read" come from the
        provider's receipts, which need the server's public address (PUBLIC_BASE_URL).
      </p>
    </div>
  )
}

// ── Templates & routing ──────────────────────────────────────────────────────

function TemplatesTab() {
  const [settings, setSettings] = useState<MessagingSettings>(() => getMessagingSettings())
  const [saved, setSaved] = useState(false)

  const update = (next: MessagingSettings) => {
    setSettings(next)
    setSaved(false)
  }
  const setRule = (kind: MessageKind, patch: Partial<NonNullable<MessagingSettings["rules"][MessageKind]>>) => {
    const def = MESSAGE_KINDS[kind]
    const cur = settings.rules[kind] || { channels: def.defaultChannels, auto: def.automatic }
    update({ ...settings, rules: { ...settings.rules, [kind]: { ...cur, ...patch } } })
  }
  const save = () => {
    saveMessagingSettings(settings)
    // The hospital name heads every printed document -- let open ones redraw.
    window.dispatchEvent(new Event(BRANDING_EVENT))
    setSaved(true)
  }

  const kinds = (Object.keys(MESSAGE_KINDS) as MessageKind[]).filter((k) => k !== "custom")
  const groups = ["Visit updates", "Documents", "Feedback"] as const

  return (
    <div className="space-y-4 max-w-[900px]">
      <section className="bg-white border border-[#DDE2EC] rounded-none p-4">
        <h2 className="text-[14px] font-semibold text-gray-900">Hospital details used in messages</h2>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ["hospitalName", "Hospital name", "{hospital}"],
              ["opHours", "OP timings", "{opHours}"],
              ["helpline", "Helpline", "{helpline}"],
            ] as const
          ).map(([key, label, ph]) => (
            <label key={key} className="block">
              <span className="text-[11.5px] font-medium text-[#475569]">
                {label} <span className="font-mono text-[#94A3B8]">{ph}</span>
              </span>
              <input
                value={settings[key]}
                onChange={(e) => update({ ...settings, [key]: e.target.value })}
                className="mt-1 w-full h-9 px-3 text-[13px] border border-[#DDE2EC] rounded-none"
              />
            </label>
          ))}
        </div>
        <HospitalLogoField />
      </section>

      {groups.map((group) => (
        <section key={group} className="space-y-2">
          <h2 className="text-[13px] font-semibold text-[#475569] uppercase tracking-wide">{group}</h2>
          {kinds
            .filter((k) => MESSAGE_KINDS[k].group === group)
            .map((kind) => {
              const def = MESSAGE_KINDS[kind]
              const rule = settings.rules[kind]
              const channels = rule?.channels ?? def.defaultChannels
              const auto = def.automatic ? (rule?.auto ?? true) : false
              const template = rule?.template || def.template
              return (
                <div key={kind} className="bg-white border border-[#DDE2EC] rounded-none p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-gray-900">{def.label}</div>
                      <div className="text-[12px] text-[#64748B]">{def.description}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                      {(["sms", "whatsapp", "email"] as MessageChannel[]).map((c) => (
                        <label key={c} className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={channels.includes(c)}
                            onChange={() =>
                              setRule(kind, {
                                channels: channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c],
                              })
                            }
                          />
                          {CHANNEL_LABEL[c]}
                        </label>
                      ))}
                      {def.automatic && (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer pl-3 border-l border-[#EEF1F6]">
                          <input type="checkbox" checked={auto} onChange={() => setRule(kind, { auto: !auto })} />
                          Send automatically
                        </label>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={template}
                    onChange={(e) => setRule(kind, { template: e.target.value })}
                    rows={3}
                    className="mt-3 w-full px-3 py-2 text-[12.5px] leading-snug border border-[#DDE2EC] rounded-none font-mono"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                    <div className="text-[11px] text-[#94A3B8]">
                      Placeholders:{" "}
                      {["name", ...def.variables, "hospital", "opHours", "helpline", ...(def.document ? ["link"] : [])]
                        .map((v) => `{${v}}`)
                        .join(" ")}
                    </div>
                    {rule?.template && rule.template !== def.template && (
                      <button
                        type="button"
                        onClick={() => setRule(kind, { template: undefined })}
                        className="text-[11.5px] text-[#1B4FD8] hover:underline"
                      >
                        Reset wording
                      </button>
                    )}
                  </div>
                  {def.automatic && auto && channels.length === 0 && (
                    <p className="text-[11.5px] text-[#B45309] mt-1">No channel selected -- nothing will be sent.</p>
                  )}
                </div>
              )
            })}
        </section>
      ))}

      <div className="sticky bottom-0 bg-[#F0F2F5] py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          className="h-9 px-4 text-[13px] font-medium bg-[#1B4FD8] text-white rounded-none hover:bg-[#1740B4]"
        >
          Save
        </button>
        {saved && <span className="text-[12px] text-[#15803D]">Saved.</span>}
        <span className="text-[11.5px] text-[#94A3B8]">
          In India, SMS wording must match a DLT-registered template exactly.
        </span>
      </div>
    </div>
  )
}

// ── Feedback replies ─────────────────────────────────────────────────────────

type FeedbackRow = {
  id: number
  patient_name?: string | null
  phone_number?: string | null
  rating?: number | null
  comment?: string | null
  status?: string | null
  received_at?: string | null
}

function FeedbackTab() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/whatsapp/feedback`, {
      credentials: "include",
      headers: { "X-Hospital-Code": getHospitalCode() },
      cache: "no-store",
    })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Not signed in to the clinical services.")
        if (res.status === 403) throw new Error("This account cannot view patient feedback (patient_experience).")
        if (!res.ok) throw new Error(`The feedback service returned HTTP ${res.status}.`)
        const data = await res.json()
        setRows(data.feedback || [])
      })
      .catch((e) =>
        setError(e instanceof TypeError ? "The clinical services are unreachable." : e.message),
      )
  }, [])

  if (error) return <p className="text-[12.5px] text-[#92400E]">{error}</p>
  if (!rows) return <p className="text-[12.5px] text-[#94A3B8]">Loading...</p>

  const rated = rows.filter((r) => r.rating)
  const avg = rated.length ? rated.reduce((s, r) => s + (r.rating || 0), 0) / rated.length : null

  return (
    <div className="space-y-3 max-w-[900px]">
      <p className="text-[12.5px] text-[#64748B]">
        Replies to WhatsApp feedback requests. A reply starting with 1-5 is a rating; 1 or 2 is
        escalated to patient care automatically.
        {avg !== null && (
          <strong className="text-gray-900"> Average {avg.toFixed(1)} / 5 from {rated.length} ratings.</strong>
        )}
      </p>
      <div className="bg-white border border-[#DDE2EC] rounded-none overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-[#94A3B8]">No replies yet.</div>
        ) : (
          <ul className="divide-y divide-[#EEF1F6]">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 flex flex-wrap gap-3 items-start">
                <div className="flex gap-0.5 mt-0.5" aria-label={r.rating ? `${r.rating} of 5` : "No rating"}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={13}
                      className={r.rating && i <= r.rating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#CBD5E1]"}
                    />
                  ))}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[13px] text-gray-900">{r.comment || <em className="text-[#94A3B8]">No comment</em>}</div>
                  <div className="text-[11.5px] text-[#64748B]">
                    {r.patient_name || "Unknown patient"} · {r.phone_number}
                    {r.received_at ? ` · ${formatDateTimeIST(r.received_at)}` : ""}
                  </div>
                </div>
                {r.status && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-none border ${
                      r.status === "Escalated"
                        ? "text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]"
                        : "text-[#475569] bg-[#F1F5F9] border-[#E2E8F0]"
                    }`}
                  >
                    {r.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Setup ────────────────────────────────────────────────────────────────────

type ProviderSettings = {
  source: "database" | "environment" | "none"
  account_sid: string
  auth_token_set: boolean
  whatsapp_from: string
  default_country_code: string
  encryption_configured: boolean
}

function SetupTab({ status, onSaved }: { status: MessagingStatus | null ;onSaved: () => void }) {
  const [current, setCurrent] = useState<ProviderSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState({ account_sid: "", auth_token: "", whatsapp_from: "", default_country_code: "+91" })
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ ok: boolean ;text: string } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/whatsapp/settings`, {
      credentials: "include",
      headers: { "X-Hospital-Code": getHospitalCode() },
      cache: "no-store",
    })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Sign in to the clinical services to manage the provider account.")
        if (res.status === 403) throw new Error("Only an administrator can change the messaging account.")
        if (!res.ok) throw new Error(`The settings service returned HTTP ${res.status}.`)
        const data: ProviderSettings = await res.json()
        setCurrent(data)
        setForm((f) => ({
          ...f,
          account_sid: data.account_sid || "",
          whatsapp_from: data.whatsapp_from || "",
          default_country_code: data.default_country_code || "+91",
        }))
      })
      .catch((e) => setLoadError(e instanceof TypeError ? "The clinical services are unreachable." : e.message))
  }, [])

  const save = async () => {
    setSaving(true)
    setNote(null)
    try {
      const csrf = getCsrfToken()
      const res = await fetch(`${API_BASE}/api/whatsapp/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Hospital-Code": getHospitalCode(),
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setNote({ ok: true, text: "Saved. Takes effect on the next message -- no restart needed." })
      setForm((f) => ({ ...f, auth_token: "" }))
      onSaved()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Could not save." })
    } finally {
      setSaving(false)
    }
  }

  const steps: { done: boolean | null ;title: string ;body: React.ReactNode }[] = [
    {
      done: status ? status.reachable : null,
      title: "Messaging service running",
      body: status?.reachable
        ? "The patients service answers on /api/messaging."
        : status?.reason || "Checking...",
    },
    {
      done: status ? status.whatsapp : null,
      title: "WhatsApp sender (Twilio)",
      body: "A WhatsApp Business sender approved in Twilio. Enter the account below, or set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM on the server.",
    },
    {
      done: status ? status.sms : null,
      title: "SMS sender",
      body: "Same Twilio account. Set TWILIO_SMS_FROM, or for India a TWILIO_MESSAGING_SERVICE_SID carrying your DLT-registered sender ID -- Indian SMS must also match a DLT-approved template word for word.",
    },
    {
      done: status ? status.documentLinks : null,
      title: "Public address for PDFs and receipts",
      body: "PUBLIC_BASE_URL -- the HTTPS address of the API gateway as seen from the internet. Twilio fetches attachments from it and posts delivery receipts and patient replies to it. Without it, messages go as text only.",
    },
    {
      done: status ? status.templates.length > 0 : null,
      title: "Approved WhatsApp templates",
      body: (
        <>
          WhatsApp only allows free-form messages within 24 hours of the patient last writing to
          you. For everything else -- most bills, reports and reminders -- get templates approved
          in Twilio and map them in WHATSAPP_TEMPLATE_SIDS.
          {status && status.templates.length > 0 && (
            <> Approved now: {status.templates.map((k) => kindLabel(k)).join(", ")}.</>
          )}
        </>
      ),
    },
  ]

  return (
    <div className="space-y-4 max-w-[900px]">
      <section className="bg-white border border-[#DDE2EC] rounded-none p-4">
        <h2 className="text-[14px] font-semibold text-gray-900">What sending needs</h2>
        <ol className="mt-3 space-y-3">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-3">
              <span className="mt-0.5 flex-shrink-0">
                {s.done === null ? (
                  <Clock size={16} className="text-[#94A3B8]" />
                ) : s.done ? (
                  <CheckCircle2 size={16} className="text-[#16A34A]" />
                ) : (
                  <AlertTriangle size={16} className="text-[#D97706]" />
                )}
              </span>
              <div>
                <div className="text-[13px] font-medium text-gray-900">{s.title}</div>
                <div className="text-[12px] text-[#64748B]">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-white border border-[#DDE2EC] rounded-none p-4">
        <h2 className="text-[14px] font-semibold text-gray-900">Twilio account</h2>
        {loadError ? (
          <p className="mt-2 text-[12.5px] text-[#92400E]">{loadError}</p>
        ) : !current ? (
          <p className="mt-2 text-[12.5px] text-[#94A3B8]">Loading...</p>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-[#64748B]">
              {current.source === "database"
                ? "Using the account saved here."
                : current.source === "environment"
                  ? "Using the account from the server's environment. Saving here overrides it."
                  : "No account configured yet."}
              {!current.encryption_configured &&
                " The server has no SETTINGS_ENCRYPTION_KEY, so it will refuse to store a token here -- set the TWILIO_* environment variables instead, or ask for the key to be set."}
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ["account_sid", "Account SID", "AC..."],
                  ["auth_token", "Auth token", current.auth_token_set ? "Saved -- leave blank to keep" : ""],
                  ["whatsapp_from", "WhatsApp sender number", "+14155238886"],
                  ["default_country_code", "Default country code", "+91"],
                ] as const
              ).map(([key, label, ph]) => (
                <label key={key} className="block">
                  <span className="text-[11.5px] font-medium text-[#475569]">{label}</span>
                  <input
                    type={key === "auth_token" ? "password" : "text"}
                    autoComplete="off"
                    value={form[key]}
                    placeholder={ph}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="mt-1 w-full h-9 px-3 text-[13px] border border-[#DDE2EC] rounded-none"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || !form.account_sid || !form.whatsapp_from}
                className="h-9 px-4 text-[13px] font-medium bg-[#1B4FD8] text-white rounded-none hover:bg-[#1740B4] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save account"}
              </button>
              {note && (
                <span className={`text-[12px] ${note.ok ? "text-[#15803D]" : "text-[#B91C1C]"}`}>{note.text}</span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/**
 * The hospital's own logo, printed beside HospAI at the head of discharge
 * summaries, clinical journeys and patient PDFs. Saved as soon as it is chosen.
 */
function HospitalLogoField() {
  const branding = useBranding()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean ;text: string } | null>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      saveHospitalLogo(await prepareHospitalLogo(file))
      setMessage({ ok: true, text: "Logo saved. It now heads every printed document." })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not use that image." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#EEF1F6] flex flex-wrap items-center gap-4">
      <div className="h-14 min-w-14 px-2 rounded-none border border-dashed border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-center">
        <HospitalMark branding={branding} height={40} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-gray-900">Hospital logo</div>
        <div className="text-[11.5px] text-[#64748B]">
          Printed beside the HospAI logo on discharge summaries, clinical journeys and patient PDFs. PNG with a transparent background works best.
        </div>
        {message && <div className={`mt-1 text-[11.5px] ${message.ok ? "text-[#15803D]" : "text-[#B91C1C]"}`}>{message.text}</div>}
      </div>
      <div className="flex items-center gap-2">
        <label className={`h-9 px-3 inline-flex items-center rounded-none bg-[#1B4FD8] text-white text-[12.5px] font-medium cursor-pointer hover:bg-[#1740B4] ${busy ? "opacity-60 pointer-events-none" : ""}`}>
          {busy ? "Saving…" : branding.hospitalLogo ? "Replace logo" : "Upload logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={onFile} />
        </label>
        {branding.hospitalLogo && (
          <button
            type="button"
            onClick={() => {
              saveHospitalLogo(null)
              setMessage({ ok: true, text: "Logo removed. Documents show the hospital's initials instead." })
            }}
            className="h-9 px-3 rounded-none border border-[#DDE2EC] text-[12.5px] font-medium text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
