/**
 * The outbox: every message addressed to a patient's phone, plus the matching
 * alerts for the OP department floor.
 *
 * This file only *stores* messages. Composing and sending them is
 * `patientMessaging.ts`, which hands each one to the backend's
 * `/api/messaging/send` (Twilio SMS / WhatsApp) and writes the outcome back
 * here.
 *
 * ## A status means what it says
 *
 * - `queued`  -- not sent yet: the messaging service was unreachable, or is not
 *                set up. `error` says which. Retried from Patient Messages.
 * - `sent`    -- accepted by the provider. Not the same as delivered.
 * - `delivered` / `read` -- the provider's delivery receipt said so.
 * - `failed`  -- the provider refused it; `error`/`hint` say why. Retrying an
 *                invalid number does not make it valid, so these are not
 *                retried automatically.
 * - `manual`  -- handed to the desk's own WhatsApp or SMS app. We know the app
 *                was opened, not that the message went.
 *
 * Nothing here may claim a message was delivered without the provider saying
 * so -- telling a receptionist "the patient has been notified" when no SMS left
 * the building is how a patient ends up sitting in a waiting room nobody called.
 */

export type NotificationChannel = "sms" | "whatsapp" | "email" | "op-floor"
export type MessageChannel = Exclude<NotificationChannel, "op-floor">
export type NotificationStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "manual"

export interface PatientNotification {
  id: string
  /** OP encounter it belongs to, or "" for a message not tied to one. */
  encounterId: string
  umr: string
  patientName: string
  /** The patient's number; empty for an on-screen floor alert. */
  phone: string
  email?: string
  channel: NotificationChannel
  /** What triggered it -- a `MessageKind` from patientMessaging.ts. */
  kind?: string
  /** What the patient (or the floor) is being told. `{link}` marks where the
   *  document link goes once the server has one. */
  message: string
  status: NotificationStatus
  /** Why it is still queued, or why it failed. */
  error?: string
  /** What the desk can do about `error`, when the server knows. */
  hint?: string
  documentTitle?: string
  /** Whether the document actually went with it (attached / linked). */
  documentAttached?: boolean
  /** The PDF, kept only while the message is queued so a retry can resend it.
   *  Dropped once sent -- the outbox is not a document store. */
  documentBase64?: string
  documentFilename?: string
  /** `patient_messages.id` on the server, for matching delivery receipts. */
  serverId?: number
  providerSid?: string
  createdAt: string
  updatedAt?: string
  /** Read state for the OP floor alerts. */
  read?: boolean
}

const OUTBOX_KEY = "hospai_patient_notifications_v1"
const CHANNEL = "hospai_patient_notifications"
const MAX_ENTRIES = 300

const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null
let crossTabReady = false

function ensureCrossTab() {
  if (crossTabReady || typeof window === "undefined") return
  crossTabReady = true
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = () => listeners.forEach((fn) => fn())
  } catch {
    /* falls back to the storage event below */
  }
  window.addEventListener("storage", (e) => {
    if (e.key === OUTBOX_KEY) listeners.forEach((fn) => fn())
  })
}

function read(): PatientNotification[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY)
    return raw ? (JSON.parse(raw) as PatientNotification[]) : []
  } catch {
    return []
  }
}

function write(all: PatientNotification[]) {
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(all))
  } catch {
    // Over quota: the queued PDFs are the only large thing in here, so drop
    // them rather than the record of what was sent. A message whose PDF was
    // dropped can still be resent from the screen it came from.
    try {
      const slim = all.map((n) =>
        n.documentBase64
          ? {
              ...n,
              documentBase64: undefined,
              error: `${n.error || "Not sent"} -- the PDF could not be kept for a retry; resend it from the original screen.`,
            }
          : n,
      )
      window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(slim))
    } catch {
      // A full quota must not break the clinical action that triggered the
      // message -- the patient still gets called, the record just is not kept.
      return
    }
  }
  listeners.forEach((fn) => fn())
  ensureCrossTab()
  try {
    channel?.postMessage(Date.now())
  } catch {
    /* closed channel */
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  ensureCrossTab()
  return () => listeners.delete(listener)
}

/** Every entry, newest first. */
export function getOutbox(): PatientNotification[] {
  return read()
}

/** Messages to patients' phones (not floor alerts), newest first. */
export function getPatientMessages(): PatientNotification[] {
  return read().filter((n) => n.channel !== "op-floor")
}

/** Undelivered floor alerts, newest first. */
export function getFloorAlerts(): PatientNotification[] {
  return read()
    .filter((n) => n.channel === "op-floor" && !n.read)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function markFloorAlertsRead(ids: string[]) {
  if (!ids.length) return
  const set = new Set(ids)
  write(read().map((n) => (set.has(n.id) ? { ...n, read: true } : n)))
}

/** Adds an entry and returns its id. */
export function pushNotification(
  entry: Omit<PatientNotification, "id" | "createdAt" | "status"> & {
    status?: NotificationStatus
  },
): string {
  const id = `MSG-${Date.now()}-${Math.random().toString(36).slice(-4)}`
  const all = read()
  all.unshift({
    ...entry,
    id,
    status: entry.status || "queued",
    createdAt: new Date().toISOString(),
  })
  // Keep the outbox from growing without bound on a long-running desk.
  write(all.slice(0, MAX_ENTRIES))
  return id
}

/** Applies several patches in one write (one storage event, one re-render). */
export function updateNotifications(
  patches: { id: string ;patch: Partial<PatientNotification> }[],
) {
  if (!patches.length) return
  const byId = new Map(patches.map((p) => [p.id, p.patch]))
  const now = new Date().toISOString()
  write(
    read().map((n) => {
      const patch = byId.get(n.id)
      if (!patch) return n
      const next = { ...n, ...patch, updatedAt: now }
      // The PDF is only kept while there is still a send to retry.
      if (next.status !== "queued") delete next.documentBase64
      return next
    }),
  )
}

export function updateNotification(
  id: string,
  patch: Partial<PatientNotification>,
) {
  updateNotifications([{ id, patch }])
}
