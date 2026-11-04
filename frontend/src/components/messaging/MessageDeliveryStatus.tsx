import React, { useEffect, useMemo, useState } from "react"
import { getOutbox, subscribe, type PatientNotification } from "../../services/patientNotifications"
import { markHandedOff, smsHandoffUrl, whatsAppHandoffUrl } from "../../services/patientMessaging"

/**
 * What actually happened to the automatic message for one visit -- per
 * channel, live from the outbox -- instead of a banner that always claimed
 * "SMS & WhatsApp sent". When the hospital's messaging service cannot send
 * (not set up, server down), the desk sends the very same message from its own
 * WhatsApp or phone with one click.
 */

const LABEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email" }

function tone(n: PatientNotification): { text: string ;cls: string } {
  switch (n.status) {
    case "sent":
    case "delivered":
    case "read":
      return { text: n.status === "sent" ? "Sent" : n.status === "delivered" ? "Delivered" : "Read", cls: "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]" }
    case "manual":
      return { text: "Sent from desk", cls: "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]" }
    case "queued":
      return { text: "Not sent yet", cls: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" }
    default:
      return { text: "Failed", cls: "bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]" }
  }
}

export default function MessageDeliveryStatus({
  encounterId,
  kind,
  phone,
  compact = false,
}: {
  encounterId: string
  kind: "op_registered" | "appointment_booked"
  phone?: string | null
  compact?: boolean
}) {
  const [tick, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick((t) => t + 1)), [])

  // The latest message of this kind for this visit (all its channels).
  const entries = useMemo(() => {
    const mine = getOutbox().filter((n) => n.encounterId === encounterId && n.kind === kind)
    if (!mine.length) return []
    const newest = mine.reduce((a, b) => ((a.createdAt || "") >= (b.createdAt || "") ? a : b))
    return mine.filter((n) => n.message === newest.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId, kind, tick])

  const message = entries[0]?.message
  const to = entries[0]?.phone || phone || ""
  const allDone = entries.length > 0 && entries.every((n) => ["sent", "delivered", "read", "manual"].includes(n.status))
  const reason = entries.find((n) => n.error)?.error
  const wa = message && to ? whatsAppHandoffUrl(to, message) : null
  const sms = message && to ? smsHandoffUrl(to, message) : null
  const handOff = () => markHandedOff(entries.filter((n) => n.status === "queued" || n.status === "failed").map((n) => n.id))

  if (!entries.length) {
    return (
      <div className={`text-[11.5px] text-[#64748B] ${compact ? "" : "py-1"}`}>
        {to ? `Preparing the message to ${to}…` : "No phone number on file — the patient cannot be messaged."}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-[#334155]">Message to {to}:</span>
        {entries.map((n) => {
          const t = tone(n)
          return (
            <span key={n.id} title={n.error || undefined} className={`text-[10.5px] font-bold px-1.5 py-0.5 border rounded-[4px] ${t.cls}`}>
              {LABEL[n.channel] || n.channel} · {t.text}
            </span>
          )
        })}
      </div>
      {!allDone && (
        <>
          {reason && <div className="text-[11px] text-[#92400E]">{reason}</div>}
          {(wa || sms) && (
            <div className="flex flex-wrap items-center gap-2">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handOff}
                  className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20BD5A] text-white text-[11.5px] font-bold rounded-[6px] inline-flex items-center gap-1.5"
                >
                  Send on WhatsApp
                </a>
              )}
              {sms && (
                <a
                  href={sms}
                  onClick={handOff}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[11.5px] font-bold rounded-[6px] inline-flex items-center gap-1.5"
                >
                  Send by SMS
                </a>
              )}
              {!compact && (
                <span className="text-[10.5px] text-[#64748B]">Sends the same message from this desk&apos;s WhatsApp / phone.</span>
              )}
            </div>
          )}
        </>
      )}
      {!compact && message && (
        <details className="text-[11px] text-[#475569]">
          <summary className="cursor-pointer select-none">Message text</summary>
          <pre className="whitespace-pre-wrap font-sans mt-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] px-2 py-1.5">{message}</pre>
        </details>
      )}
    </div>
  )
}
