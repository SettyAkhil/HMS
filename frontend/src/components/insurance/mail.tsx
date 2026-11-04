import { useMemo, useState } from "react"
import { Mail, MailOpen, Paperclip, Send, Receipt } from "lucide-react"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import { PharmacyDatabase } from "../../services/pharmacyDb"
import { BillingDatabase } from "../../services/billingDb"
import type { ComprehensiveClaimRecord, MailPurpose, MailRecord } from "../../types/insurance"
import { SubmitForm } from "./forms"
import { Field, attempt, btn, fieldCls, fmtDateTime, inr, type Notify } from "./ui"

// Email is how the insurance desk works with insurers and TPAs: verify the
// documents, email them, and record the insurer's emailed reply. The mail
// itself is kept on the case (Emails tab) so the whole exchange is on record.
//
// There is no mail server behind this frontend: "Send email" records the
// email on the case and moves it on; "Open in mail app" hands the same
// message to the desk's own mail client (attach the files there).

const PURPOSE_LABEL: Record<MailPurpose, string> = {
  Eligibility: "Send eligibility request",
  "Pre-Auth": "Email pre-auth to insurer",
  Enhancement: "Email enhancement request",
  Claim: "Email claim to insurer",
  "Query Response": "Email response to insurer",
  General: "Send email",
}

export function MailComposer({
  c,
  purpose,
  notify,
  queryId,
  allowPortal = purpose === "Pre-Auth" || purpose === "Claim",
}: {
  c: ComprehensiveClaimRecord
  purpose: MailPurpose
  notify: Notify
  queryId?: string
  allowPortal?: boolean
}) {
  const draft = useMemo(() => E.mailDraft(c, purpose, queryId), [c, purpose, queryId])
  const [to, setTo] = useState(draft.to)
  const [cc, setCc] = useState("")
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(purpose === "Query Response" && draft.body_for_query ? draft.body_for_query : draft.body)
  const verified = draft.documents.filter((d) => d.isUploaded && d.status === "Verified")
  const [attach, setAttach] = useState<string[]>(verified.map((d) => d.id))
  const [portal, setPortal] = useState(false)

  // Saved bills raised for this case — fixed package, pharmacy, reception/hospital —
  // selectable as extra attachments on the submission email.
  const savedBills = useMemo(() => {
    const out: { id: string; label: string }[] = []
    try {
      const fb = E.getFixedPackageBillForCase(c.id)
      if (fb && fb.packageCode) out.push({ id: `fixed:${fb.id}`, label: `Fixed Package Bill ${fb.id} — ${inr(fb.totalAmount)}` })
    } catch { /* ignore */ }
    try {
      const pName = (c.patientName || "").toLowerCase().trim()
      const pId = (c.patientId || "").toLowerCase().trim()
      const uhid = (c.policy?.memberId || "").toLowerCase().trim()
      PharmacyDatabase.getBills()
        .filter((b) => {
          const bName = (b.patientName || "").toLowerCase().trim()
          return (pName && bName.includes(pName)) || (pId && (b.patientId || "").toLowerCase().trim() === pId) || (uhid && (b.uhid || "").toLowerCase().trim() === uhid)
        })
        .forEach((b) => out.push({ id: `pharm:${b.id}`, label: `Pharmacy Bill ${b.billNumber} — ${inr(b.totalAmount)}` }))
    } catch { /* ignore */ }
    try {
      const hb = c.billingClaimId ? BillingDatabase.getClaimById(c.billingClaimId) : undefined
      if (hb) out.push({ id: `hosp:${hb.id || hb.invoiceNo}`, label: `Reception / Hospital Bill ${hb.invoiceNo} — ${inr(hb.totalAmount)}` })
    } catch { /* ignore */ }
    return out
  }, [c])
  const [billSel, setBillSel] = useState<string[]>([])
  const billAttachments = savedBills.filter((b) => billSel.includes(b.id)).map((b) => b.label)
  const notReady = draft.documents.filter((d) => d.isMandatory && !(d.isUploaded && d.status === "Verified"))
  const gated = purpose === "Pre-Auth" || purpose === "Claim"

  const mailto = `mailto:${encodeURIComponent(to)}?${cc ? `cc=${encodeURIComponent(cc)}&` : ""}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div className="border border-slate-200 bg-white">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Mail size={15} className="text-blue-600" />
        <span className="text-[13px] font-semibold text-slate-900">New email to the insurer</span>
        <span className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200">{purpose}</span>
      </div>

      {gated && (
        <div className={`px-4 py-2 text-[12px] border-b ${notReady.length ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}>
          {notReady.length ? (
            <>
              <strong> {notReady.length} required document{notReady.length > 1 ? "s" : ""} not verified yet:</strong> {notReady.map((d) => d.documentType).join(" · ")}. Upload and verify them in the checklist before sending.
            </>
          ) : (
            <>
              <strong>✓ All {draft.documents.filter((d) => d.isMandatory).length} required documents verified</strong> — ready to send.
            </>
          )}
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-[60px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-[12.5px]">
          <label htmlFor={`to-${c.id}-${purpose}`} className="text-slate-500 font-semibold">
            To
          </label>
          <input id={`to-${c.id}-${purpose}`} className={`${fieldCls} tabular-nums`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="preauth@insurer.com" aria-label="To" />
          <label htmlFor={`cc-${c.id}-${purpose}`} className="text-slate-500 font-semibold">
            Cc
          </label>
          <input id={`cc-${c.id}-${purpose}`} className={`${fieldCls} tabular-nums`} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" aria-label="Cc" />
          <label htmlFor={`sub-${c.id}-${purpose}`} className="text-slate-500 font-semibold">
            Subject
          </label>
          <input id={`sub-${c.id}-${purpose}`} className={fieldCls} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
        </div>
        <textarea className={`${fieldCls} h-auto py-2 tabular-nums text-[12px] leading-5`} rows={Math.min(16, Math.max(8, body.split("\n").length + 1))} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Email body" />

        <div>
          <div className="text-[12px] font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
            <Paperclip size={12} /> Attachments ({attach.length})
          </div>
          {draft.documents.length === 0 ? (
            <div className="text-[12px] text-slate-500">No documents on this case yet.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.documents.map((d) => {
                const ok = d.isUploaded && d.status === "Verified"
                const on = attach.includes(d.id)
                return (
                  <label
                    key={d.id}
                    title={ok ? d.fileName : d.isUploaded ? "Uploaded — verify it first" : "Not uploaded"}
                    className={`inline-flex items-center gap-1.5 px-2 h-8 border text-[11.5px] ${ok ? (on ? "border-blue-400 bg-blue-50 cursor-pointer" : "border-slate-200 cursor-pointer") : "border-dashed border-slate-300 text-slate-400"}`}
                  >
                    <input type="checkbox" className="accent-blue-600" disabled={!ok} checked={on} onChange={(e) => setAttach(e.target.checked ? [...attach, d.id] : attach.filter((x) => x !== d.id))} />
                     {d.documentType}
                    {!ok && <span className="text-[10.5px]">({d.isUploaded ? "verify" : "missing"})</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <div className="text-[12px] font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
            <Receipt size={12} /> Saved bills ({billSel.length})
          </div>
          {savedBills.length === 0 ? (
            <div className="text-[12px] text-slate-500">No saved bills for this case yet. Save a fixed package / pharmacy / reception bill first.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {savedBills.map((b) => {
                const on = billSel.includes(b.id)
                return (
                  <label key={b.id} className={`inline-flex items-center gap-1.5 px-2 h-8 border text-[11.5px] cursor-pointer ${on ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                    <input type="checkbox" className="accent-blue-600" checked={on} onChange={(e) => setBillSel(e.target.checked ? [...billSel, b.id] : billSel.filter((x) => x !== b.id))} />
                    {b.label}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            className={btn.primary}
            disabled={gated && notReady.length > 0}
            onClick={() => attempt(notify, () => E.sendInsurerEmail(c.id, { purpose, to, cc, subject, body, attachmentIds: attach, extraAttachments: billAttachments, queryId }), `Email sent to ${to} and recorded on the case.`)}
          >
            <Send size={14} /> {PURPOSE_LABEL[purpose]}
          </button>
          <a href={mailto} className={btn.plain} target="_blank" rel="noreferrer">
            <MailOpen size={14} /> Open in mail app
          </a>
          {purpose === "Query Response" && queryId && (
            <button type="button" className={btn.plain} onClick={() => attempt(notify, () => E.saveQueryDraft(c.id, queryId, body), "Draft saved.")}>
               Save draft
            </button>
          )}
          {allowPortal && (
            <button type="button" className="ml-auto text-[12px] text-slate-500 underline cursor-pointer" onClick={() => setPortal((x) => !x)}>
              {portal ? "Hide" : "Submitted through the insurer's portal instead?"}
            </button>
          )}
        </div>
        {portal && allowPortal && (
          <div className="border-t border-slate-100 pt-3">
            <SubmitForm
              label={purpose === "Claim" ? "Record portal submission" : "Record portal submission"}
              onSubmit={(m, r) =>
                attempt(notify, () => (purpose === "Claim" ? E.submitClaim(c.id, m, r) : E.submitPreAuth(c.id, m, r)), purpose === "Claim" ? "Claim submission recorded." : "Pre-auth submission recorded.")
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The insurer answered by email. Paste the email (kept on the case), then
 * record what it decided with the form given as children. The email is filed
 * the moment the decision is saved.
 */
export function InsurerReply({
  c,
  purpose,
  notify,
  children,
  queryId,
}: {
  c: ComprehensiveClaimRecord
  purpose: MailPurpose
  notify: Notify
  queryId?: string
  children: (notify: Notify) => React.ReactNode
}) {
  const lastOut = [...(c.mails ?? [])].reverse().find((m) => m.direction === "out" && m.purpose === purpose)
  const [from, setFrom] = useState(lastOut?.to.split(",")[0] ?? E.insurerAddress(c, purpose))
  const [subject, setSubject] = useState(lastOut ? `Re: ${lastOut.subject}` : "")
  const [body, setBody] = useState("")
  const [at, setAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))

  // File the email alongside the decision.
  const wrapped: Notify = (msg, type) => {
    if (type !== "error" && (body.trim() || subject.trim())) {
      try {
        E.recordInsurerEmail(c.id, { purpose, from, subject, body, receivedAt: at, queryId })
      } catch {}
    }
    notify(msg, type)
  }

  return (
    <div className="border border-slate-200 bg-white">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <MailOpen size={15} className="text-emerald-600" />
        <span className="text-[13px] font-semibold text-slate-900">Insurer's reply (email)</span>
        {lastOut && <span className="ml-auto text-[11.5px] text-slate-500">Sent {fmtDateTime(lastOut.at)} to {lastOut.to}</span>}
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="From">
            <input className={`${fieldCls} tabular-nums`} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Received">
            <input type="datetime-local" className={fieldCls} value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="Subject">
            <input className={fieldCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Email text" hint="Paste the insurer's email — it is kept on the case with the decision" span={2}>
            <textarea rows={3} className={`${fieldCls} h-auto py-2`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. We approve cashless for ₹70,000 under auth no. AUTH-9911…" />
          </Field>
        </div>
        <div className="border-t border-dashed border-slate-200 pt-3">
          <div className="text-[12px] font-medium text-slate-500 mb-2">What the insurer decided</div>
          {children(wrapped)}
        </div>
      </div>
    </div>
  )
}

export function MailThread({ mails }: { mails: MailRecord[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!mails.length)
    return (
      <div className="px-4 py-8 text-center text-[12.5px] text-slate-500">
        <div aria-hidden className="text-[30px]"></div>
        No emails with the insurer yet.
      </div>
    )
  return (
    <ol className="space-y-2">
      {[...mails].reverse().map((m) => {
        const out = m.direction === "out"
        const expanded = open === m.id
        return (
          <li key={m.id} className={`border ${out ? "border-blue-200 bg-blue-50/40 ml-0 mr-10" : "border-emerald-200 bg-emerald-50/40 ml-10 mr-0"}`}>
            <button type="button" onClick={() => setOpen(expanded ? null : m.id)} className="w-full text-left px-3 py-2 cursor-pointer">
              <div className="flex items-center gap-2 text-[12px]">
                <span aria-hidden>{out ? "" : ""}</span>
                <span className="font-semibold text-slate-900">{out ? `To ${m.to}` : `From ${m.from}`}</span>
                <span className="px-1.5 text-[10.5px] font-semibold bg-white border border-slate-200 rounded-[8px]">{m.purpose}</span>
                <span className="ml-auto text-slate-500 whitespace-nowrap">{fmtDateTime(m.at)}</span>
              </div>
              <div className="text-[12.5px] font-semibold text-slate-800 mt-0.5 truncate">{m.subject}</div>
              {!expanded && <div className="text-[11.5px] text-slate-500 truncate">{m.body.split("\n").find((l) => l.trim() && !/^dear/i.test(l)) ?? ""}</div>}
            </button>
            {expanded && (
              <div className="px-3 pb-3">
                {m.cc && <div className="text-[11.5px] text-slate-500">Cc {m.cc}</div>}
                <pre className="whitespace-pre-wrap font-sans text-[12.5px] text-slate-800 bg-white border border-slate-100 p-3 mt-1">{m.body || "(no text)"}</pre>
                {m.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.attachments.map((a) => (
                      <span key={a} className="px-2 py-1 bg-white border border-slate-200 rounded-[8px] text-[11px]">
                         {a}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[11px] text-slate-400 mt-1">Recorded by {m.by}</div>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
