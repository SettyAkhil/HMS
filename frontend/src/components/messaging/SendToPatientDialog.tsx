import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  MessageSquare,
  Mail,
  Send,
  X,
  XCircle,
} from "lucide-react"
import {
  CHANNEL_LABEL,
  MESSAGE_KINDS,
  getMessagingStatus,
  isPlaceholderPhone,
  isValidEmail,
  markHandedOff,
  normalisePhone,
  previewMessage,
  renderTemplate,
  ruleFor,
  sendPatientMessage,
  smsHandoffUrl,
  whatsAppHandoffUrl,
  emailHandoffUrl,
  type ChannelResult,
  type MessageKind,
  type MessagingStatus,
  type PatientDocument,
  type PatientRef,
  type SendResult,
  type TemplateVars,
} from "../../services/patientMessaging"
import type { MessageChannel } from "../../services/patientNotifications"
import { downloadPatientDocument } from "../../lib/patientDocumentPdf"
import PhoneInput from "../ui/PhoneInput"

/**
 * "Send to patient": one dialog for every document and message a desk sends
 * by hand -- bill, discharge summary, EMR report, lab report, visit journey,
 * feedback request.
 *
 * It says what will happen *before* the send (the server's messaging status),
 * and what did happen after it, per channel. A channel that did not go offers
 * the desk's own WhatsApp / SMS app and the PDF to attach, so a patient can
 * still get their bill when the messaging service is down or not set up yet.
 */

export interface SendToPatientProps {
  patient: PatientRef
  kind: MessageKind
  /** Template placeholders, e.g. { billNo, total }. */
  vars?: TemplateVars
  /** Builds the PDF. Called once, when the dialog opens. */
  buildDocument?: () => Promise<PatientDocument>
  /** "Bill INV-2026-0811" -- shown on the attachment row. */
  documentLabel?: string
}

export default function SendToPatientDialog({
  open,
  onClose,
  patient,
  kind,
  vars,
  buildDocument,
  documentLabel,
}: SendToPatientProps & { open: boolean ;onClose: () => void }) {
  if (!open || typeof document === "undefined") return null
  return createPortal(
    <DialogBody
      onClose={onClose}
      patient={patient}
      kind={kind}
      vars={vars}
      buildDocument={buildDocument}
      documentLabel={documentLabel}
    />,
    document.body,
  )
}

/** A button that opens the dialog. */
export function SendToPatientButton({
  label = "Send to patient",
  className,
  title,
  ...props
}: SendToPatientProps & { label?: string ;className?: string ;title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title || `Send by SMS / WhatsApp to ${props.patient.name}`}
        className={
          className ||
          "px-3 py-1.5 text-[12px] font-medium rounded-[6px] border border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7] inline-flex items-center gap-1.5 cursor-pointer"
        }
      >
        <Send size={13} aria-hidden /> {label}
      </button>
      <SendToPatientDialog open={open} onClose={() => setOpen(false)} {...props} />
    </>
  )
}

function DialogBody({
  onClose,
  patient,
  kind,
  vars,
  buildDocument,
  documentLabel,
}: SendToPatientProps & { onClose: () => void }) {
  const def = MESSAGE_KINDS[kind]
  const rule = useMemo(() => ruleFor(kind), [kind])
  const [phone, setPhone] = useState(patient.phone || "")
  const [email, setEmail] = useState(patient.email || "")
  const [channels, setChannels] = useState<MessageChannel[]>(
    rule.channels.length ? rule.channels : def.defaultChannels,
  )
  const [message, setMessage] = useState(() =>
    renderTemplate(rule.template || def.template, { name: patient.name, ...vars }),
  )
  const [status, setStatus] = useState<MessagingStatus | null>(null)
  const [doc, setDoc] = useState<PatientDocument | null>(null)
  const [docError, setDocError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    getMessagingStatus().then((s) => live && setStatus(s))
    if (buildDocument) {
      buildDocument()
        .then((d) => live && setDoc(d))
        .catch((e) => live && setDocError(e instanceof Error ? e.message : "Could not build the PDF."))
    }
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      live = false
      window.removeEventListener("keydown", onKey)
    }
    // Built once per opening; the props describe one patient and one document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasPhoneChannel = channels.some((c) => c === "sms" || c === "whatsapp")
  const hasEmailChannel = channels.includes("email")
  const phoneOk = !hasPhoneChannel || !!normalisePhone(phone)
  const emailOk = !hasEmailChannel || isValidEmail(email)
  const needsDoc = !!buildDocument
  const docReady = !needsDoc || !!doc
  const canSend =
    !sending &&
    !result &&
    ((hasPhoneChannel && phoneOk) || (hasEmailChannel && emailOk)) &&
    channels.length > 0 &&
    message.trim().length > 0 &&
    docReady

  const toggle = (c: MessageChannel) =>
    setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))

  const send = async () => {
    if (!canSend) return
    setSending(true)
    try {
      setResult(
        await sendPatientMessage({
          patient: { ...patient, phone, email },
          kind,
          channels,
          message: message.trim(),
          document: doc || undefined,
        }),
      )
    } finally {
      setSending(false)
    }
  }

  const smsChars = previewMessage(message, needsDoc).length + (needsDoc ? 60 : 0)

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !sending && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-to-patient-title"
    >
      <div className="bg-white w-full sm:max-w-[560px] max-h-[95vh] overflow-y-auto rounded-t-[10px] sm:rounded-[10px] shadow-xl border border-[#DDE2EC]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#EEF1F6]">
          <div className="min-w-0">
            <h2 id="send-to-patient-title" className="text-[15px] font-semibold text-gray-900">
              Send {def.label.toLowerCase()} to patient
            </h2>
            <p className="text-[12px] text-[#64748B] truncate">
              {patient.name}
              {patient.id ? ` · ${patient.id}` : ""}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={sending}
            className="w-8 h-8 rounded-full hover:bg-[#F1F5F9] text-[#64748B] flex items-center justify-center flex-shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {!result ? (
          <div className="px-5 py-4 space-y-4">
            {/* Phone */}
            <label className="block">
              <span className="text-[11.5px] font-medium text-[#475569]">Mobile number</span>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                placeholder="98765 43210"
                className={`mt-1 ${
                  phone && !phoneOk ? "border-[#FCA5A5]" : "border-[#DDE2EC]"
                }`}
              />
              {phone && !phoneOk && (
                <span className="text-[11px] text-[#B91C1C]">
                  {isPlaceholderPhone(phone)
                    ? "This is the placeholder the app fills in when no number was entered -- ask the patient for theirs."
                    : "Not a usable mobile number."}
                </span>
              )}
              {!phone && (
                <span className="text-[11px] text-[#B91C1C]">
                  No number on the patient record -- enter one to send.
                </span>
              )}
            </label>

            {/* Channels */}
            <div>
              <span className="text-[11.5px] font-medium text-[#475569]">Send by</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["sms", "whatsapp", "email"] as MessageChannel[]).map((c) => {
                  const on = channels.includes(c)
                  const ready = status ? (c === "sms" ? status.sms : c === "whatsapp" ? status.whatsapp : true) : null
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggle(c)}
                      aria-pressed={on}
                      className={`text-left px-2.5 py-2 rounded-[8px] border transition-colors ${
                        on
                          ? "border-[#1B4FD8] bg-[#EFF6FF]"
                          : "border-[#DDE2EC] bg-white hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-gray-900">
                        <span
                          className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${
                            on ? "bg-[#1B4FD8] border-[#1B4FD8] text-white" : "border-[#CBD5E1]"
                          }`}
                          aria-hidden
                        >
                          {on && <CheckCircle2 size={10} />}
                        </span>
                        {c === "sms" ? (
                          <MessageSquare size={13} className="shrink-0" />
                        ) : c === "whatsapp" ? (
                          <MessageCircle size={13} className="shrink-0" />
                        ) : (
                          <Mail size={13} className="shrink-0" />
                        )}
                        <span className="truncate">{CHANNEL_LABEL[c]}</span>
                      </div>
                      <div className="text-[10.5px] text-[#64748B] mt-0.5 pl-5">
                        {c === "sms"
                          ? needsDoc
                            ? "Link to PDF"
                            : "Text message"
                          : c === "whatsapp"
                            ? needsDoc
                              ? "PDF attached"
                              : "WhatsApp"
                            : needsDoc
                              ? "PDF attached"
                              : "Email"}
                        {ready === false && (
                          <span className="block text-[#B45309]">Queued</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Email input field */}
            {hasEmailChannel && (
              <label className="block">
                <span className="text-[11.5px] font-medium text-[#475569]">Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1 w-full h-9 px-3 text-[13px] border rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#BFDBFE] ${
                    email && !isValidEmail(email) ? "border-[#FCA5A5]" : "border-[#DDE2EC]"
                  }`}
                  placeholder="patient@example.com"
                />
                {email && !isValidEmail(email) && (
                  <span className="text-[11px] text-[#B91C1C]">Please enter a valid email address.</span>
                )}
                {!email && (
                  <span className="text-[11px] text-[#B45309]">Enter email to dispatch document.</span>
                )}
              </label>
            )}

            {/* Message */}
            <label className="block">
              <span className="text-[11.5px] font-medium text-[#475569]">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="mt-1 w-full px-3 py-2 text-[13px] leading-snug border border-[#DDE2EC] rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#BFDBFE] resize-y"
              />
              <span className="flex justify-between gap-2 text-[11px] text-[#94A3B8]">
                <span>
                  {needsDoc
                    ? "{link} becomes a secure link to the PDF (valid 7 days)."
                    : kind === "feedback_request"
                      ? "The patient's WhatsApp reply is recorded as their rating."
                      : ""}
                </span>
                {channels.includes("sms") && (
                  <span className="whitespace-nowrap">
                    ~{smsChars} chars · {Math.max(1, Math.ceil(smsChars / 153))} SMS
                  </span>
                )}
              </span>
            </label>

            {/* Attachment */}
            {needsDoc && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] border border-[#DDE2EC] bg-[#F8FAFC]">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={16} className="text-[#1B4FD8] flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-gray-900 truncate">
                      {documentLabel || def.label} (PDF)
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      {docError
                        ? docError
                        : doc
                          ? `${Math.max(1, Math.round((doc.base64.length * 0.75) / 1024))} kB · ${doc.filename}`
                          : "Preparing..."}
                    </div>
                  </div>
                </div>
                {doc && (
                  <button
                    type="button"
                    onClick={() => downloadPatientDocument(doc)}
                    className="text-[12px] text-[#1B4FD8] hover:underline flex items-center gap-1 flex-shrink-0"
                  >
                    <Download size={13} /> Preview
                  </button>
                )}
              </div>
            )}

            {/* Server status */}
            <ServerStatusLine status={status} channels={channels} needsDoc={needsDoc} />
          </div>
        ) : (
          <ResultView
            result={result}
            phone={phone}
            email={email}
            message={message}
            doc={doc}
            documentLabel={documentLabel || def.label}
            onHandOff={(ids) => markHandedOff(ids)}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#EEF1F6] bg-[#FAFBFD] sticky bottom-0">
          {!result ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="h-9 px-4 text-[13px] rounded-[6px] border border-[#DDE2EC] bg-white hover:bg-[#F8FAFC] text-[#374151]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className="h-9 px-4 text-[13px] font-medium rounded-[6px] bg-[#1B4FD8] hover:bg-[#1740B4] text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? "Sending..." : "Send"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-[13px] font-medium rounded-[6px] bg-[#1B4FD8] hover:bg-[#1740B4] text-white"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ServerStatusLine({
  status,
  channels,
  needsDoc,
}: {
  status: MessagingStatus | null
  channels: MessageChannel[]
  needsDoc: boolean
}) {
  if (!status) {
    return (
      <div className="text-[11.5px] text-[#64748B] flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin" /> Checking the messaging service...
      </div>
    )
  }
  if (!status.reachable) {
    return (
      <div className="text-[11.5px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] px-3 py-2 flex gap-2">
        <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
        <span>
          {status.reason} The message will be kept in Patient Messages to retry, and you can
          send it from your own WhatsApp or SMS app after pressing Send.
        </span>
      </div>
    )
  }
  const notReady = channels.filter((c) => (c === "sms" ? !status.sms : !status.whatsapp))
  const warnings: string[] = []
  if (notReady.length)
    warnings.push(
      `${notReady.map((c) => CHANNEL_LABEL[c]).join(" and ")} ${notReady.length > 1 ? "are" : "is"} not set up on the server yet, so ${notReady.length > 1 ? "those" : "that"} will be queued.`,
    )
  if (needsDoc && !status.documentLinks)
    warnings.push(
      "The server has no public address (PUBLIC_BASE_URL), so the text goes without the PDF -- download it to hand over.",
    )
  if (!warnings.length) {
    return (
      <div className="text-[11.5px] text-[#15803D] flex items-center gap-1.5">
        <CheckCircle2 size={13} /> Messaging is connected.
      </div>
    )
  }
  return (
    <div className="text-[11.5px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-[6px] px-3 py-2 flex gap-2">
      <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
      <span>{warnings.join(" ")}</span>
    </div>
  )
}

const RESULT_STYLE: Record<string, { icon: React.ReactNode ;text: string ;cls: string }> = {
  sent: {
    icon: <CheckCircle2 size={16} />,
    text: "Sent -- accepted by the provider",
    cls: "text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]",
  },
  queued: {
    icon: <Clock size={16} />,
    text: "Not sent yet -- queued",
    cls: "text-[#92400E] bg-[#FFFBEB] border-[#FDE68A]",
  },
  failed: {
    icon: <XCircle size={16} />,
    text: "Not sent",
    cls: "text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]",
  },
}

function ResultView({
  result,
  phone,
  email,
  message,
  doc,
  documentLabel,
  onHandOff,
}: {
  result: SendResult
  phone: string
  email?: string
  message: string
  doc: PatientDocument | null
  documentLabel?: string
  onHandOff: (ids: string[]) => void
}) {
  const [handedOff, setHandedOff] = useState<Set<string>>(new Set())
  const notSent = result.results.filter((r) => r.status === "queued" || r.status === "failed")

  const handOff = (r: ChannelResult) => {
    let url: string | null = null
    if (r.channel === "whatsapp") {
      url = whatsAppHandoffUrl(phone, message)
    } else if (r.channel === "email") {
      url = emailHandoffUrl(email || "", doc?.title || documentLabel || "Hospital Document", message)
    } else {
      url = smsHandoffUrl(phone, message)
    }
    if (!url) return
    window.open(url, "_blank", "noopener")
    onHandOff([r.outboxId])
    setHandedOff((s) => new Set(s).add(r.outboxId))
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {result.results.map((r) => {
        const style = RESULT_STYLE[r.status] || RESULT_STYLE.failed
        const manual = handedOff.has(r.outboxId)
        return (
          <div key={r.channel} className={`border rounded-[8px] px-3 py-2.5 ${style.cls}`}>
            <div className="flex items-center gap-2 text-[13px] font-medium">
              {style.icon}
              <span>
                {CHANNEL_LABEL[r.channel]}: {manual ? "opened in your own app" : style.text}
              </span>
            </div>
            {r.status === "sent" && doc && (
              <div className="text-[11.5px] mt-1 pl-6">
                {r.documentAttached
                  ? r.channel === "whatsapp"
                    ? "PDF attached."
                    : "Link to the PDF included."
                  : "Sent without the PDF."}
              </div>
            )}
            {r.error && r.status !== "sent" && !manual && (
              <div className="text-[11.5px] mt-1 pl-6">{r.hint || r.error}</div>
            )}
            {r.status !== "sent" && !manual && (
              <div className="pl-6 mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handOff(r)}
                  className="h-8 px-3 text-[12px] font-medium rounded-[6px] bg-white border border-current inline-flex items-center gap-1.5"
                >
                  {r.channel === "whatsapp" ? (
                    <MessageCircle size={13} />
                  ) : r.channel === "email" ? (
                    <Mail size={13} />
                  ) : (
                    <MessageSquare size={13} />
                  )}
                  Open in {r.channel === "whatsapp" ? "WhatsApp" : r.channel === "email" ? "Email app" : "SMS app"}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {result.documentNote && (
        <p className="text-[11.5px] text-[#92400E]">{result.documentNote}</p>
      )}

      {doc && (notSent.length > 0 || result.results.some((r) => r.status === "sent" && !r.documentAttached)) && (
        <div className="flex items-center justify-between gap-2 text-[12px] text-[#475569] border border-[#DDE2EC] rounded-[8px] px-3 py-2">
          <span>The PDF did not go with every message. Attach it yourself:</span>
          <button
            type="button"
            onClick={() => downloadPatientDocument(doc)}
            className="text-[#1B4FD8] hover:underline inline-flex items-center gap-1 flex-shrink-0"
          >
            <Download size={13} /> Download PDF
          </button>
        </div>
      )}

      {notSent.some((r) => r.status === "queued") && (
        <p className="text-[11.5px] text-[#64748B]">
          Queued messages stay in Patient Messages and can be retried once the messaging
          service is available.
        </p>
      )}
    </div>
  )
}
