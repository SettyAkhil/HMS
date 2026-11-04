import { API_BASE } from "../lib/constants"
import { getCsrfToken, getHospitalCode } from "../lib/api"
import type { DBOPEncounter } from "./db"
import {
  getOutbox,
  getPatientMessages,
  pushNotification,
  updateNotifications,
  type MessageChannel,
  type NotificationStatus,
  type PatientNotification,
} from "./patientNotifications"

/**
 * Messages to patients by SMS and WhatsApp -- what to send, by which channel,
 * and the send itself.
 *
 * Every screen that messages a patient comes through here: the automatic visit
 * updates (appointment booked, OP registration, "the doctor is ready for you")
 * and the documents a desk sends from a button (bill, discharge summary, EMR
 * report, lab report, visit journey, feedback request).
 *
 * The send goes to the backend's `/api/messaging/send`, which owns the Twilio
 * account, gives the PDF a URL Twilio can fetch, and logs the attempt. Every
 * message is written to the outbox (`patientNotifications.ts`) *before* it is
 * sent and updated with what actually happened, so a send that never reached
 * the server is a queued message on the Patient Messages screen, not a silent
 * loss.
 *
 * Which kinds go by which channel, whether the visit updates go out by
 * themselves, and the wording of every template, are the hospital's to set
 * (Patient Messages -> Templates & routing). The defaults: visit updates by
 * SMS, documents and the feedback request by WhatsApp, bills and discharge
 * summaries by both.
 */

export type MessageKind =
  | "appointment_booked"
  | "op_registered"
  | "op_called"
  | "op_nurse_call"
  | "bill"
  | "discharge_summary"
  | "emr_report"
  | "lab_report"
  | "patient_journey"
  | "feedback_request"
  | "custom"

export interface MessageKindDef {
  label: string
  description: string
  group: "Visit updates" | "Documents" | "Feedback"
  defaultChannels: MessageChannel[]
  /** Sent by itself when the event happens, rather than from a button. */
  automatic: boolean
  /** Carries a PDF. */
  document: boolean
  template: string
  /** Placeholders the template can use, besides {name}, {hospital},
   *  {opHours}, {helpline} and (for documents) {link}. */
  variables: string[]
}

export const MESSAGE_KINDS: Record<MessageKind, MessageKindDef> = {
  appointment_booked: {
    label: "Appointment confirmation",
    description: "Sent when reception books a doctor for the patient.",
    group: "Visit updates",
    defaultChannels: ["sms", "whatsapp"],
    automatic: true,
    document: false,
    template:
      "Dear {name}, your appointment with {doctor} ({dept}) is confirmed for {date} at {time}. Token {token}, Room {room}. OP timings: {opHours}. Helpline: {helpline}. - {hospital}",
    variables: ["doctor", "dept", "date", "time", "token", "room"],
  },
  op_registered: {
    label: "OP registration",
    description: "Sent when a patient is registered or re-registered at the OP desk.",
    group: "Visit updates",
    defaultChannels: ["sms", "whatsapp"],
    automatic: true,
    document: false,
    template:
      "Dear {name}, you are registered at {hospital}. UMR {umr}, OP No. {opNumber}, Department {dept}. OP timings: {opHours}. Please wait to be called. Helpline {helpline}.",
    variables: ["umr", "opNumber", "dept"],
  },
  op_nurse_call: {
    label: "Called to the nurse station",
    description: "Sent when the patient is called to the nurse station for vitals and triage.",
    group: "Visit updates",
    defaultChannels: ["sms", "whatsapp"],
    automatic: true,
    document: false,
    template:
      "Dear {name} (Token {token}): Please come to the Nurse Station now for baseline vital signs and health triage before seeing {doctor}. - {hospital}",
    variables: ["token", "doctor", "dept", "room"],
  },
  op_called: {
    label: "Doctor is ready",
    description: "Sent when the doctor calls the patient into the consulting room.",
    group: "Visit updates",
    defaultChannels: ["sms"],
    automatic: true,
    document: false,
    template:
      "{name} (token {token}): {doctor} is ready for you now. Please proceed to {room}. - {hospital}",
    variables: ["token", "doctor", "room"],
  },
  bill: {
    label: "Bill / receipt",
    description: "The bill or payment receipt, as a PDF.",
    group: "Documents",
    defaultChannels: ["sms", "whatsapp", "email"],
    automatic: false,
    document: true,
    template:
      "Dear {name}, your bill {billNo} from {hospital}: total Rs {total}, paid Rs {paid}, balance Rs {balance}.\nView bill: {link}",
    variables: ["billNo", "total", "paid", "balance"],
  },
  discharge_summary: {
    label: "Discharge summary",
    description: "The discharge summary, as a PDF.",
    group: "Documents",
    defaultChannels: ["sms", "whatsapp", "email"],
    automatic: false,
    document: true,
    template:
      "Dear {name}, your discharge summary from {hospital} is ready. Please follow the medicines and advice in it and bring it to your follow-up visit.\nView: {link}",
    variables: [],
  },
  emr_report: {
    label: "EMR report",
    description: "A summary of the patient's health record, as a PDF.",
    group: "Documents",
    defaultChannels: ["whatsapp", "email"],
    automatic: false,
    document: true,
    template:
      "Dear {name}, your health record summary from {hospital} is attached.\n{link}",
    variables: [],
  },
  lab_report: {
    label: "Lab report",
    description: "Laboratory results, as a PDF.",
    group: "Documents",
    defaultChannels: ["whatsapp", "email"],
    automatic: false,
    document: true,
    template:
      "Dear {name}, your lab report ({tests}) from {hospital} is ready.\nView report: {link}",
    variables: ["tests"],
  },
  patient_journey: {
    label: "Visit journey",
    description: "Every step of the visit, from registration to discharge, as a structured PDF & summary.",
    group: "Documents",
    defaultChannels: ["whatsapp", "email", "sms"],
    automatic: false,
    document: true,
    template:
      "Dear {name}, here is your outpatient visit summary and care journey from {hospital}:\n• OP No: {opNumber} | Token: {token}\n• Doctor: {doctor} ({dept})\n• Status: {status}\n• Vitals: {vitals}\n• Diagnosis: {diagnosis}\nOfficial Journey Report & Care Timeline (PDF): {link}\nHelpline: {helpline}",
    variables: ["opNumber", "token", "doctor", "dept", "status", "vitals", "diagnosis", "advice", "date"],
  },
  feedback_request: {
    label: "Feedback / rating request",
    description:
      "Asks the patient to rate the visit. A WhatsApp reply is recorded as their rating.",
    group: "Feedback",
    defaultChannels: ["whatsapp"],
    automatic: false,
    document: false,
    template:
      "Dear {name}, thank you for choosing {hospital}. How was your experience? Please reply with a number from 1 (poor) to 5 (excellent), and tell us anything we could do better.",
    variables: [],
  },
  custom: {
    label: "Message",
    description: "A free-text message.",
    group: "Visit updates",
    defaultChannels: ["sms"],
    automatic: false,
    document: false,
    template: "Dear {name}, ",
    variables: [],
  },
}

export const CHANNEL_LABEL: Record<MessageChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
}

// ── Settings: routing, automatic sends, wording ──────────────────────────────

export interface KindRule {
  channels: MessageChannel[]
  /** Only meaningful for automatic kinds. */
  auto: boolean
  /** Overrides the default template. */
  template?: string
}

export interface MessagingSettings {
  hospitalName: string
  opHours: string
  helpline: string
  rules: Partial<Record<MessageKind, KindRule>>
}

const SETTINGS_KEY = "hospai_messaging_settings_v1"

const DEFAULT_SETTINGS: MessagingSettings = {
  hospitalName: "Imperial Hospitals",
  opHours: "Mon-Sat, 9:00 AM - 5:00 PM",
  helpline: "08816-279999",
  rules: {},
}

export function getMessagingSettings(): MessagingSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, rules: {} }
    const parsed = JSON.parse(raw) as Partial<MessagingSettings>
    return { ...DEFAULT_SETTINGS, ...parsed, rules: parsed.rules || {} }
  } catch {
    return { ...DEFAULT_SETTINGS, rules: {} }
  }
}

export function saveMessagingSettings(settings: MessagingSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* quota: the defaults still work */
  }
}

export function ruleFor(kind: MessageKind): KindRule {
  const def = MESSAGE_KINDS[kind]
  const saved = getMessagingSettings().rules[kind]
  return {
    channels: saved?.channels ?? def.defaultChannels,
    auto: def.automatic ? (saved?.auto ?? true) : false,
    template: saved?.template || def.template,
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

export type TemplateVars = Record<string, string | number | null | undefined>

/**
 * Fills `{placeholders}` from `vars` plus the hospital settings. `{link}` is
 * left alone -- only the server knows the document URL. A placeholder with no
 * value is dropped along with the punctuation it leaves dangling, so a booking
 * without a room reads "Token D-OP12." rather than "Token D-OP12, ."
 */
export function renderTemplate(template: string, vars: TemplateVars = {}): string {
  const s = getMessagingSettings()
  const all: TemplateVars = {
    hospital: s.hospitalName,
    opHours: s.opHours,
    helpline: s.helpline,
    ...vars,
  }
  return template
    .replace(/\{(\w+)\}/g, (match, key: string) => {
      if (key === "link") return match
      const value = all[key]
      return value === null || value === undefined ? "" : String(value)
    })
    .split("\n")
    .map((line) =>
      line
        .replace(/\(\s*\)/g, "")
        .replace(/\s+([,.)])/g, "$1")
        .replace(/,\s*,/g, ",")
        .replace(/,\s*\./g, ".")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    )
    .join("\n")
}

/** The message as the patient will see it, for screens; the link is a marker. */
export function previewMessage(message: string, hasDocument: boolean): string {
  return message
    .split("\n")
    .map((line) =>
      line.includes("{link}")
        ? hasDocument
          ? line.replace("{link}", "[link to the PDF]")
          : ""
        : line,
    )
    .filter((line, i, lines) => line || i < lines.length - 1)
    .join("\n")
    .trim()
}

/** For a hand-off through the desk's own app, which has no document link. */
function handoffText(message: string): string {
  return message
    .split("\n")
    .filter((line) => !line.includes("{link}"))
    .join("\n")
    .trim()
}

// ── Phone numbers ────────────────────────────────────────────────────────────

/**
 * Numbers this app fills in when a form's phone field is left blank (see
 * OPRegistration, Registration, QueueManagement, db.ts, erDb.ts). They are
 * somebody's real number somewhere -- a bill must never be texted to them.
 */
const PLACEHOLDER_NUMBERS = new Set(["6175550199"])

export function isPlaceholderPhone(phone: string | undefined | null): boolean {
  const digits = (phone || "").replace(/\D/g, "")
  const last10 = digits.slice(-10)
  return PLACEHOLDER_NUMBERS.has(last10) || (digits.length >= 10 && /^(\d)\1{9}$/.test(last10))
}

/** Digits with country code ("919876543210"), or null if not a usable mobile. */
export function normalisePhone(phone: string | undefined | null): string | null {
  const raw = (phone || "").trim()
  let digits = raw.replace(/\D/g, "")
  if (!digits || isPlaceholderPhone(digits)) return null
  if (raw.startsWith("+")) return digits.length >= 10 ? digits : null
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1)
  if (digits.length === 10) return `91${digits}`
  return digits.length >= 11 && digits.length <= 15 ? digits : null
}

export function whatsAppHandoffUrl(phone: string, message: string): string | null {
  const to = normalisePhone(phone)
  if (!to) return null
  return `https://wa.me/${to}?text=${encodeURIComponent(handoffText(message))}`
}

export function smsHandoffUrl(phone: string, message: string): string | null {
  const to = normalisePhone(phone)
  if (!to) return null
  // "?&body=" is the form both iOS and Android accept.
  return `sms:+${to}?&body=${encodeURIComponent(handoffText(message))}`
}

export function isValidEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function emailHandoffUrl(email: string, subject: string, message: string): string | null {
  const to = (email || "").trim()
  if (!isValidEmail(to)) return null
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(handoffText(message))}`
}

/** The desk opened its own WhatsApp/SMS app for these -- see `manual`. */
export function markHandedOff(outboxIds: string[]) {
  updateNotifications(
    outboxIds.map((id) => ({
      id,
      patch: {
        status: "manual" as NotificationStatus,
        error: undefined,
        hint: "Opened in the desk's own app -- check it was actually sent.",
      },
    })),
  )
}

// ── Server ───────────────────────────────────────────────────────────────────

export interface MessagingStatus {
  /** The messaging service answered. */
  reachable: boolean
  reason?: string
  sms: boolean
  whatsapp: boolean
  email?: boolean
  /** PUBLIC_BASE_URL is set: PDFs can be attached / linked. */
  documentLinks: boolean
  /** Kinds with an approved WhatsApp template. */
  templates: string[]
}

function headers(method: string): HeadersInit {
  const csrf = getCsrfToken()
  return {
    "Content-Type": "application/json",
    "X-Hospital-Code": getHospitalCode(),
    ...(csrf && method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
  }
}

function unreachableReason(status: number): string {
  if (status === 401) return "Not signed in to the clinical services."
  if (status === 403) return "This account is not allowed to message patients."
  if (status === 404)
    return "The server does not have patient messaging yet -- the patients service needs a rebuild."
  if (status >= 500) return `The messaging service is down (HTTP ${status}).`
  return `The messaging service returned HTTP ${status}.`
}

/**
 * Raw fetch on purpose, not `apiFetch`: that answers from an offline mock when
 * the backend is down, which is right for screens that must keep working and
 * wrong for deciding whether a message to a patient can actually go.
 */
export async function getMessagingStatus(): Promise<MessagingStatus> {
  const offline = (reason: string): MessagingStatus => ({
    reachable: false,
    reason,
    sms: false,
    whatsapp: false,
    email: false,
    documentLinks: false,
    templates: [],
  })
  try {
    const res = await fetch(`${API_BASE}/api/messaging/status`, {
      credentials: "include",
      headers: headers("GET"),
      cache: "no-store",
    })
    if (!res.ok) return offline(unreachableReason(res.status))
    const data = await res.json().catch(() => null)
    // Only the real service names its provider; anything else is a stand-in
    // answering for a backend that is not there.
    if (!data?.provider || typeof data.sms !== "object") {
      return offline("The messaging service is not running (got a placeholder answer).")
    }
    return {
      reachable: true,
      sms: !!data?.sms?.configured,
      whatsapp: !!data?.whatsapp?.configured,
      email: data?.email !== undefined ? !!data?.email?.configured : true,
      documentLinks: !!data?.document_links,
      templates: Array.isArray(data?.whatsapp?.templates) ? data.whatsapp.templates : [],
    }
  } catch {
    return offline("The clinical services are unreachable.")
  }
}

export interface PatientRef {
  name: string
  phone: string
  email?: string
  /** UMR / patient id. */
  id?: string
  encounterId?: string
}

export interface PatientDocument {
  title: string
  filename: string
  /** PDF bytes, base64. */
  base64: string
}

export interface ChannelResult {
  channel: MessageChannel
  outboxId: string
  status: NotificationStatus
  error?: string
  hint?: string
  documentAttached: boolean
}

export interface SendResult {
  results: ChannelResult[]
  /** Why the document did not go, when the text did. */
  documentNote?: string
}

interface ServerResult {
  channel: MessageChannel
  status: "sent" | "failed" | "not_configured"
  id?: number
  provider_sid?: string
  error?: string
  hint?: string
  document_attached?: boolean
}

type PostOutcome =
  | { ok: true ;results: ServerResult[] ;documentNote?: string }
  | { ok: false ;retryable: boolean ;reason: string }

async function postSend(payload: Record<string, unknown>): Promise<PostOutcome> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/messaging/send`, {
      method: "POST",
      credentials: "include",
      headers: headers("POST"),
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, retryable: true, reason: "The clinical services are unreachable." }
  }
  if (res.status === 400) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, retryable: false, reason: data?.error || "The server refused the message." }
  }
  if (!res.ok) {
    // 401: signing in again fixes it; 403 does not, but the desk can still hand
    // it off by hand, which a queued entry offers and a failed one also does.
    return { ok: false, retryable: res.status !== 403, reason: unreachableReason(res.status) }
  }
  const data = await res.json().catch(() => null)
  // An empty result list is not "sent to nobody", it is a stand-in answering
  // for a backend that is not running -- the real service reports every channel.
  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    return { ok: false, retryable: true, reason: "The messaging service is not running." }
  }
  return { ok: true, results: data.results, documentNote: data.document?.reason || undefined }
}

function patchFromServer(r: ServerResult): Partial<PatientNotification> {
  const status: NotificationStatus =
    r.status === "sent" ? "sent" : r.status === "not_configured" ? "queued" : "failed"
  return {
    status,
    error: r.status === "sent" ? undefined : r.error || "Not sent",
    hint: r.status === "sent" ? undefined : r.hint,
    serverId: r.id ?? undefined,
    providerSid: r.provider_sid ?? undefined,
    documentAttached: !!r.document_attached,
  }
}

/** Kept so a queued document message can be retried; generated PDFs are a few
 *  tens of kB, so anything over this is not worth a share of localStorage. */
const MAX_KEPT_PDF_CHARS = 400_000

/**
 * Sends one message to a patient on one or more channels.
 *
 * Resolves (never rejects) with one result per channel. A channel that did not
 * go is `queued` (server unreachable / not set up -- retry later, or hand it
 * off) or `failed` (the provider refused it).
 */
export async function sendPatientMessage(req: {
  patient: PatientRef
  kind: MessageKind
  channels: MessageChannel[]
  message: string
  document?: PatientDocument
}): Promise<SendResult> {
  const { patient, kind, channels, message, document } = req
  const usablePhone = normalisePhone(patient.phone)
  const usableEmail = isValidEmail(patient.email)

  const ids = channels.map((channel) =>
    pushNotification({
      encounterId: patient.encounterId || "",
      umr: patient.id || "",
      patientName: patient.name,
      phone: patient.phone,
      email: patient.email,
      channel,
      kind,
      message,
      documentTitle: document?.title,
      documentFilename: document?.filename,
      documentBase64:
        document && document.base64.length <= MAX_KEPT_PDF_CHARS ? document.base64 : undefined,
    }),
  )

  const channelErrors = new Map<MessageChannel, string>()
  channels.forEach((channel) => {
    if (channel === "email") {
      if (!patient.email?.trim()) {
        channelErrors.set(channel, "No email address on the patient record.")
      } else if (!usableEmail) {
        channelErrors.set(channel, `"${patient.email}" is not a valid email address.`)
      }
    } else {
      if (!usablePhone) {
        const err = !patient.phone?.trim()
          ? "No phone number on the patient record."
          : isPlaceholderPhone(patient.phone)
            ? `${patient.phone} is a placeholder number.`
            : `"${patient.phone}" is not a usable mobile number.`
        channelErrors.set(channel, err)
      }
    }
  })

  // If every requested channel has a contact validation failure:
  if (channelErrors.size === channels.length) {
    updateNotifications(
      ids.map((id, i) => ({
        id,
        patch: { status: "failed", error: channelErrors.get(channels[i]) },
      })),
    )
    return {
      results: channels.map((channel, i) => ({
        channel,
        outboxId: ids[i],
        status: "failed",
        error: channelErrors.get(channel),
        documentAttached: false,
      })),
    }
  }

  // Send the valid channels:
  const channelsToSend = channels.filter((c) => !channelErrors.has(c))
  const outcome = await postSend({
    phone: patient.phone,
    email: patient.email,
    patient_name: patient.name,
    patient_id: patient.id || undefined,
    kind,
    channels: channelsToSend,
    message,
    document: document
      ? { title: document.title, filename: document.filename, content_base64: document.base64 }
      : undefined,
  })

  if (!outcome.ok) {
    const patch: Partial<PatientNotification> = {
      status: outcome.retryable ? "queued" : "failed",
      error: outcome.reason,
    }
    updateNotifications(ids.map((id) => ({ id, patch })))
    return {
      results: channels.map((channel, i) => ({
        channel,
        outboxId: ids[i],
        status: patch.status!,
        error: outcome.reason,
        documentAttached: false,
      })),
    }
  }

  const byChannel = new Map(outcome.results.map((r) => [r.channel, r]))
  const patches = channels.map((channel, i) => {
    const r = byChannel.get(channel)
    return {
      id: ids[i],
      patch: r
        ? patchFromServer(r)
        : { status: "failed" as NotificationStatus, error: "The server did not report this channel." },
    }
  })
  updateNotifications(patches)
  return {
    documentNote: outcome.documentNote,
    results: channels.map((channel, i) => ({
      channel,
      outboxId: ids[i],
      status: patches[i].patch.status as NotificationStatus,
      error: patches[i].patch.error,
      hint: patches[i].patch.hint,
      documentAttached: !!patches[i].patch.documentAttached,
    })),
  }
}

/**
 * Retries every queued message, oldest first, one at a time. Stops at the
 * first sign the server is still unreachable rather than hammering it once per
 * message.
 */
export async function retryQueuedMessages(opts: { maxAgeMs?: number } = {}): Promise<{
  sent: number
  failed: number
  queued: number
}> {
  const cutoff = opts.maxAgeMs ? Date.now() - opts.maxAgeMs : null
  const queued = getPatientMessages()
    .filter((n) => n.status === "queued")
    .filter((n) => cutoff == null || new Date(n.createdAt).getTime() >= cutoff)
    .reverse()
  let sent = 0
  let failed = 0
  for (let i = 0; i < queued.length; i++) {
    const n = queued[i]
    const outcome = await postSend({
      phone: n.phone,
      patient_name: n.patientName,
      patient_id: n.umr || undefined,
      kind: n.kind || "custom",
      channels: [n.channel],
      message: n.message,
      document: n.documentBase64
        ? {
            title: n.documentTitle || "Document",
            filename: n.documentFilename || "document.pdf",
            content_base64: n.documentBase64,
          }
        : undefined,
    })
    if (!outcome.ok) {
      if (outcome.retryable) {
        updateNotifications(
          queued.slice(i).map((q) => ({ id: q.id, patch: { error: outcome.reason } })),
        )
        return { sent, failed, queued: queued.length - i }
      }
      updateNotifications([{ id: n.id, patch: { status: "failed", error: outcome.reason } }])
      failed++
      continue
    }
    const r = outcome.results[0]
    const patch = r
      ? patchFromServer(r)
      : { status: "failed" as NotificationStatus, error: "No result from the server." }
    if (n.documentTitle && !n.documentBase64 && patch.status === "sent") {
      patch.hint = "Sent without the PDF -- it was not kept for the retry. Resend it from the original screen."
    }
    updateNotifications([{ id: n.id, patch }])
    if (patch.status === "sent") sent++
    else if (patch.status === "failed") failed++
  }
  const stillQueued = getPatientMessages().filter((n) => n.status === "queued").length
  return { sent, failed, queued: stillQueued }
}

/**
 * Pulls Twilio's delivery receipts (delivered / read / undelivered) from the
 * server log onto the matching outbox entries. Returns false if the server
 * could not be asked.
 */
export async function refreshDeliveryStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/messaging/log?limit=500`, {
      credentials: "include",
      headers: headers("GET"),
      cache: "no-store",
    })
    if (!res.ok) return false
    const data = await res.json()
    const byId = new Map<number, { status: string ;error_code?: string }>(
      (data?.messages || []).map((m: any) => [m.id, m]),
    )
    const patches: { id: string ;patch: Partial<PatientNotification> }[] = []
    for (const n of getPatientMessages()) {
      if (!n.serverId) continue
      const row = byId.get(n.serverId)
      if (!row) continue
      const status: NotificationStatus | null =
        row.status === "delivered" || row.status === "read"
          ? row.status
          : row.status === "undelivered" || row.status === "failed"
            ? "failed"
            : null
      if (status && status !== n.status) {
        patches.push({
          id: n.id,
          patch: {
            status,
            ...(status === "failed"
              ? { error: `Not delivered${row.error_code ? ` (Twilio error ${row.error_code})` : ""}.` }
              : {}),
          },
        })
      }
    }
    updateNotifications(patches)
    return true
  } catch {
    return false
  }
}

// ── Automatic visit updates ──────────────────────────────────────────────────

/**
 * Sends an automatic message if the hospital has it switched on. Fire and
 * forget: the clinical action that triggered it (a booking, a call-in) must not
 * wait on, or fail because of, a text message.
 */
function autoSend(kind: MessageKind, patient: PatientRef, vars: TemplateVars, extraLine?: string | null) {
  const rule = ruleFor(kind)
  if (!rule.auto || rule.channels.length === 0) return Promise.resolve(null)
  let message = renderTemplate(rule.template || MESSAGE_KINDS[kind].template, {
    name: patient.name,
    ...vars,
  })
  if (extraLine) message = `${message}\n${extraLine}`
  // Never the same message twice for the same visit (a re-render, a second
  // tab, a retried save): the outbox already holds it.
  if (
    patient.encounterId &&
    getOutbox().some((n) => n.encounterId === patient.encounterId && n.kind === kind && n.message === message)
  ) {
    return Promise.resolve(null)
  }
  return sendPatientMessage({ patient, kind, channels: rule.channels, message }).catch(() => {
    /* recorded in the outbox already */
    return null
  })
}

/**
 * The patient's own no-login record link (the same one their card's QR holds),
 * or null if the server could not issue it. Loaded lazily: patientRecord pulls
 * in most of the app's stores.
 */
async function recordLinkLine(umr: string, details: { name: string ;phone?: string | null }): Promise<string | null> {
  try {
    const { fetchCardToken, publicCardUrl } = await import("../components/patientRecord/patientRecord")
    const token = await fetchCardToken(umr, false, { name: details.name, phone: details.phone ?? null })
    return token ? `Your health record: ${publicCardUrl(token)}` : null
  } catch {
    return null
  }
}

function today(): string {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export async function notifyAppointmentBooked(booked: {
  encounterId: string
  name: string
  umr: string
  phone: string
  doctor: string
  dept: string
  room: string
  token: string
  time: string
}) {
  const link = booked.umr ? await recordLinkLine(booked.umr, { name: booked.name, phone: booked.phone }) : null
  return autoSend(
    "appointment_booked",
    { name: booked.name, phone: booked.phone, id: booked.umr, encounterId: booked.encounterId },
    {
      doctor: booked.doctor,
      dept: booked.dept,
      date: today(),
      time: booked.time,
      token: booked.token,
      // Bookings store "Room 103"; the template already says "Room {room}".
      room: (booked.room || "").replace(/^\s*room\s+/i, "") || null,
    },
    link,
  )
}

/** A new or returning patient has been registered for OP. */
export async function notifyOpRegistered(encounter: DBOPEncounter) {
  const link = await recordLinkLine(encounter.umr, { name: encounter.patientName, phone: encounter.phone })
  const dept = encounter.dept && !/awaiting/i.test(encounter.dept) ? encounter.dept : null
  return autoSend(
    "op_registered",
    {
      name: encounter.patientName,
      phone: encounter.phone,
      id: encounter.umr,
      encounterId: encounter.id,
    },
    { umr: encounter.umr, opNumber: encounter.opNumber, dept },
    link,
  )
}

// ── Automatic retry ──────────────────────────────────────────────────────────
// A message that could not go (messaging not set up yet, server down) waits in
// the outbox as "queued". Every 2 minutes, if any recent one is waiting and the
// server can now send, send it -- so connecting the SMS/WhatsApp provider
// delivers what reception queued in the meantime. Only the last 6 hours: an
// old "please wait to be called" is worse than none (older ones stay in
// Patient Messages for the desk to resend or drop).
const AUTO_RETRY_EVERY_MS = 2 * 60_000
const AUTO_RETRY_MAX_AGE_MS = 6 * 60 * 60_000
if (typeof window !== "undefined" && !(window as any).__hospaiMessagingRetry) {
  ;(window as any).__hospaiMessagingRetry = window.setInterval(async () => {
    const cutoff = Date.now() - AUTO_RETRY_MAX_AGE_MS
    const waiting = getPatientMessages().some((n) => n.status === "queued" && new Date(n.createdAt).getTime() >= cutoff)
    if (!waiting) return
    const status = await getMessagingStatus()
    if (!status.reachable || (!status.sms && !status.whatsapp)) return
    await retryQueuedMessages({ maxAgeMs: AUTO_RETRY_MAX_AGE_MS }).catch(() => null)
  }, AUTO_RETRY_EVERY_MS)
}

// Every OP registration, from any desk (Registration, OP queue, revisit), is
// announced by db once its server write has settled -- message the patient then.
if (typeof window !== "undefined") {
  window.addEventListener("hms:op-registered", (e) => {
    const encounter = (e as CustomEvent<DBOPEncounter>).detail
    if (encounter?.id) void notifyOpRegistered(encounter)
  })
}

/**
 * The doctor has called this patient into the room.
 *
 * Raises two things at once: a message for the patient's phone, and an alert for
 * the OP floor so the sister knows to walk them through.
 */
export function notifyPatientCalled(encounter: DBOPEncounter, doctorName: string) {
  const room = encounter.room || "the consulting room"
  const token = encounter.queueToken ? ` (token ${encounter.queueToken})` : ""

  autoSend(
    "op_called",
    {
      name: encounter.patientName,
      phone: encounter.phone,
      id: encounter.umr,
      encounterId: encounter.id,
    },
    { token: encounter.queueToken, doctor: doctorName, room },
  )

  pushNotification({
    encounterId: encounter.id,
    umr: encounter.umr,
    patientName: encounter.patientName,
    phone: "",
    channel: "op-floor",
    message: `${doctorName} has called ${encounter.patientName} into ${room}${token}.`,
    read: false,
  })
}

/**
 * The nurse station or OP desk has called this patient through for vitals and triage.
 *
 * Dispatches three coordinated alerts:
 * 1. SMS / WhatsApp notification directly to patient's mobile device
 * 2. Floor / waiting hall notification on the OP public feed
 * 3. Hospital chime tone & Web Speech announcement
 */
export function notifyPatientCalledToNurse(
  encounter: DBOPEncounter,
  nurseName?: string,
  stationRoom?: string,
) {
  const token = encounter.queueToken ? `#${encounter.queueToken}` : encounter.opNumber || "OP"
  const station = stationRoom || "OP Nurse Station (Triage & Vitals)"
  const doctor = encounter.assignedDoctor || "the consulting physician"

  // 1. Dispatch SMS / WhatsApp to patient's mobile
  autoSend(
    "op_nurse_call",
    {
      name: encounter.patientName,
      phone: encounter.phone,
      id: encounter.umr,
      encounterId: encounter.id,
    },
    {
      token,
      doctor,
      dept: encounter.dept || "Outpatient Care",
      room: station,
    },
  )

  // 2. Push on-screen floor alert for OP waiting halls & outbox
  pushNotification({
    encounterId: encounter.id,
    umr: encounter.umr,
    patientName: encounter.patientName,
    phone: encounter.phone,
    channel: "op-floor",
    kind: "op_nurse_call",
    message: `📢 Nurse Station calling ${encounter.patientName} (${token}) to ${station} for baseline vitals and triage.`,
    read: false,
  })

  // 3. Audio hospital chime & Web Speech voice announcement
  if (typeof window !== "undefined") {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const now = ctx.currentTime
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = "sine"
        osc1.frequency.setValueAtTime(587.33, now) // D5
        gain1.gain.setValueAtTime(0.12, now)
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
        osc1.connect(gain1)
        gain1.connect(ctx.destination)
        osc1.start(now)
        osc1.stop(now + 0.4)

        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = "sine"
        osc2.frequency.setValueAtTime(880, now + 0.15) // A5
        gain2.gain.setValueAtTime(0.15, now + 0.15)
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(now + 0.15)
        osc2.stop(now + 0.7)
      }
    } catch {
      // AudioContext fallback
    }

    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel()
        const announcement = `Token ${encounter.queueToken || encounter.opNumber}, ${encounter.patientName}, please proceed to Nurse Station for vitals.`
        const utterance = new SpeechSynthesisUtterance(announcement)
        utterance.rate = 0.95
        utterance.pitch = 1.05
        window.speechSynthesis.speak(utterance)
      } catch {
        // SpeechSynthesis fallback
      }
    }
  }
}
