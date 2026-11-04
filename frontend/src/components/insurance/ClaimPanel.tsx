import React, { useEffect, useState } from "react"
import { AlertTriangle, Check, X } from "lucide-react"
import {
  BillingDatabase,
  type ClaimRecord,
  type PreAuthStatus,
} from "../../services/billingDb"
import { PanelTitle } from "../billing/BillingChrome"

// One insurance claim as the insurance department works it. A bill arrives
// here when a billing counter bills it to insurance (the patient pays
// nothing); the department then claims it from the insurance company:
// submit, answer queries, record the approval and the settlement.

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`

export const INSURERS = [
  "Star Health",
  "HDFC ERGO",
  "ICICI Lombard",
  "Care Health",
  "Bajaj Allianz",
  "Niva Bupa",
  "New India Assurance",
  "PM-JAY (Ayushman Bharat)",
  "CGHS",
]

export const TPAS = [
  "Direct with insurer",
  "Medi Assist",
  "Paramount Health",
  "Vidal Health",
  "MD India",
  "Health India",
  "Family Health Plan",
]

export type ClaimStage =
  | "Self-pay"
  | "Pre-auth needed"
  | "Pre-auth pending"
  | "To claim"
  | "With insurer"
  | "Query"
  | "Approved"
  | "Denied"
  | "Appeal"
  | "Settled"

export const isInsured = (c: ClaimRecord) =>
  !!c.insuranceProvider && c.insuranceProvider !== "Self-Pay"

/** Handed to insurance by a billing counter (cashless). */
export const isBilledToInsurance = (c: ClaimRecord) => !!c.tpa?.billedAt

export const preAuthOf = (c: ClaimRecord): PreAuthStatus =>
  c.tpa?.preAuthStatus ?? (c.preAuthCode ? "Approved" : "Not Raised")

export const claimAmountOf = (c: ClaimRecord) =>
  c.tpa?.claimAmount ??
  c.items.reduce((a, it) => a + Number(it.insuranceCovered || 0), 0)

/** Where a claim stands with the insurance company. */
export function claimStage(c: ClaimRecord): ClaimStage {
  if (!isInsured(c)) return "Self-pay"
  if (c.tpa?.settledAt || c.status === "Paid") return "Settled"
  if (c.status === "Denied" || c.status === "Rejected") return "Denied"
  if (c.status === "Appeal") return "Appeal"
  if (c.status === "Accepted") return "Approved"
  if (c.status === "Submitted") return c.tpa?.queryOpen ? "Query" : "With insurer"
  if (isBilledToInsurance(c)) return "To claim"
  const pa = preAuthOf(c)
  if (pa === "Requested" || pa === "Enhancement Requested") return "Pre-auth pending"
  if (pa === "Approved") return "To claim"
  return "Pre-auth needed"
}

const STAGE_STYLE: Record<ClaimStage, string> = {
  "Self-pay": "bg-slate-100 text-slate-700 border-slate-300",
  "Pre-auth needed": "bg-amber-50 text-amber-800 border-amber-300",
  "Pre-auth pending": "bg-amber-50 text-amber-800 border-amber-300",
  "To claim": "bg-blue-50 text-blue-800 border-blue-300",
  "With insurer": "bg-sky-50 text-sky-800 border-sky-300",
  Query: "bg-rose-50 text-rose-800 border-rose-300",
  Approved: "bg-purple-50 text-purple-800 border-purple-300",
  Denied: "bg-rose-50 text-rose-800 border-rose-300",
  Appeal: "bg-rose-50 text-rose-800 border-rose-300",
  Settled: "bg-emerald-50 text-emerald-800 border-emerald-300",
}

export function StageBadge({ stage }: { stage: ClaimStage }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10.5px] font-bold uppercase border whitespace-nowrap ${STAGE_STYLE[stage]}`}
    >
      {stage}
    </span>
  )
}

const STEPS = ["Billed to insurance", "Claim submitted", "Insurer decision", "Settled"] as const

function stepIndex(stage: ClaimStage) {
  switch (stage) {
    case "Pre-auth needed":
    case "Pre-auth pending":
    case "To claim":
      return 1
    case "With insurer":
    case "Query":
    case "Denied":
    case "Appeal":
      return 2
    case "Approved":
      return 3
    case "Settled":
      return 4
    default:
      return -1
  }
}

const field =
  "w-full px-2.5 h-8 bg-white border border-[#CBD5E1] text-[12.5px] focus:outline-none focus:border-blue-600"
const btnPrimary =
  "px-3 h-8 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white text-[12px] font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
const btnSoft =
  "px-3 h-8 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 text-[12px] font-bold cursor-pointer transition-colors"
const btnDanger =
  "px-3 h-8 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-[12px] font-bold cursor-pointer transition-colors"

type Form =
  | null
  | "setup"
  | "preauth"
  | "sanction"
  | "enhance"
  | "approve"
  | "query"
  | "answer"
  | "deny"
  | "appeal"
  | "settle"

const FORM_TITLE: Record<Exclude<Form, null>, string> = {
  setup: "Initial Intake & Insurance Setup",
  preauth: "Request pre-authorisation",
  sanction: "Record pre-auth sanction",
  enhance: "Request enhancement",
  approve: "Record insurer approval",
  query: "Record insurer query",
  answer: "Reply to query",
  deny: "Record claim denial",
  appeal: "File appeal",
  settle: "Record settlement received",
}

function Labeled({ label, children }: { label: string ;children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

export default function ClaimPanel({
  claim,
  onNotify,
  readOnly,
}: {
  claim: ClaimRecord
  onNotify?: (message: string, type?: "success" | "error" | "info") => void
  /** Billing shows the claim's progress but cannot act on it. */
  readOnly?: boolean
}) {
  const stage = claimStage(claim)
  const claimed = claimAmountOf(claim)
  const deduction = claim.tpa?.deduction || 0
  const writeOff = claim.tpa?.shortfallTo !== "patient"
  const sanctioned = claim.tpa?.preAuthSanctioned
  const overSanction =
    sanctioned !== undefined && claimed > sanctioned ? claimed - sanctioned : 0
  const idx = stepIndex(stage)

  const [form, setForm] = useState<Form>(null)
  const [amount, setAmount] = useState(0)
  const [text, setText] = useState("")
  const [shortfallTo, setShortfallTo] = useState<"writeoff" | "patient">("writeoff")

  // Setup initial stage state
  const [setupProvider, setSetupProvider] = useState(
    claim.insuranceProvider && claim.insuranceProvider !== "Pending Insurance Assignment"
      ? claim.insuranceProvider
      : INSURERS[0],
  )
  const [setupTpa, setSetupTpa] = useState(claim.tpa?.tpaName || TPAS[0])
  const [setupPolicy, setSetupPolicy] = useState(
    claim.policyNumber && claim.policyNumber !== "Pending KYC" ? claim.policyNumber : "",
  )
  const [setupPreAuth, setSetupPreAuth] = useState(claim.preAuthCode || "")

  // A half-filled form must never be applied to a different claim.
  useEffect(() => {
    setForm(null)
    setSetupProvider(
      claim.insuranceProvider && claim.insuranceProvider !== "Pending Insurance Assignment"
        ? claim.insuranceProvider
        : INSURERS[0],
    )
    setSetupTpa(claim.tpa?.tpaName || TPAS[0])
    setSetupPolicy(
      claim.policyNumber && claim.policyNumber !== "Pending KYC" ? claim.policyNumber : "",
    )
    setSetupPreAuth(claim.preAuthCode || "")
  }, [claim.id])

  const open = (f: Form, preset = 0) => {
    setForm(f)
    setAmount(preset)
    setText("")
    setShortfallTo("writeoff")
    if (f === "setup") {
      setSetupProvider(
        claim.insuranceProvider && claim.insuranceProvider !== "Pending Insurance Assignment"
          ? claim.insuranceProvider
          : INSURERS[0],
      )
      setSetupTpa(claim.tpa?.tpaName || TPAS[0])
      setSetupPolicy(
        claim.policyNumber && claim.policyNumber !== "Pending KYC" ? claim.policyNumber : "",
      )
      setSetupPreAuth(claim.preAuthCode || "")
    }
  }

  const run = (fn: () => void, message: string) => {
    try {
      fn()
      onNotify?.(message, "success")
      setForm(null)
    } catch (e) {
      onNotify?.((e as Error).message || "Could not update the claim", "error")
    }
  }

  const id = claim.id
  const insurer = claim.insuranceProvider

  const submit = () => {
    switch (form) {
      case "setup":
        return run(
          () =>
            BillingDatabase.updateInsuranceDetails(id, {
              insuranceProvider: setupProvider,
              tpaName: setupTpa,
              policyNumber: setupPolicy.trim(),
              preAuthCode: setupPreAuth.trim() || undefined,
            }),
          `Insurance details updated: ${setupProvider} (Policy ${setupPolicy}).`,
        )
      case "preauth":
        return run(() => BillingDatabase.requestPreAuth(id, amount, text.trim() || undefined), `Pre-auth for ${inr(amount)} sent to ${insurer}.`)
      case "sanction":
        return run(() => BillingDatabase.approvePreAuth(id, amount, text.trim()), `Pre-auth approved: ${inr(amount)} sanctioned.`)
      case "enhance":
        return run(() => BillingDatabase.requestEnhancement(id, amount, text.trim()), `Enhancement to ${inr(amount)} requested.`)
      case "approve":
        return run(
          () => BillingDatabase.recordTpaApproval(id, amount, text.trim() || undefined, shortfallTo),
          amount < claimed
            ? `Approved ${inr(amount)}; ${inr(claimed - amount)} ${shortfallTo === "patient" ? "sent back to billing to recover from the patient" : "written off"}.`
            : `Claim approved in full (${inr(amount)}).`,
        )
      case "query":
        return run(() => BillingDatabase.recordTpaQuery(id, text.trim()), "Insurer query recorded.")
      case "answer":
        return run(() => BillingDatabase.answerTpaQuery(id, text.trim()), "Query reply recorded.")
      case "deny":
        return run(() => BillingDatabase.recordTpaDenial(id, text.trim()), "Claim marked denied.")
      case "appeal":
        return run(() => BillingDatabase.appealClaim(id, text.trim()), `Appeal filed with ${insurer}.`)
      case "settle":
        return run(() => BillingDatabase.recordTpaSettlement(id, amount, text.trim()), `Settlement of ${inr(amount)} from ${insurer} recorded.`)
    }
  }

  const formValid = (() => {
    switch (form) {
      case "setup":
        return !!setupProvider && !!setupPolicy.trim()
      case "preauth":
        return amount > 0
      case "sanction":
      case "enhance":
      case "settle":
        return amount > 0 && text.trim().length > 0
      case "approve":
        return amount >= 0 && amount <= claimed
      default:
        return text.trim().length > 0
    }
  })()

  // What can happen next, for this stage.
  const actions: React.ReactNode = (() => {
    switch (stage) {
      case "Pre-auth needed":
        return (
          <>
            <button type="button" className={btnSoft} onClick={() => open("setup")}>
              Setup Insurer & Policy
            </button>
            <button type="button" className={btnPrimary} onClick={() => open("preauth", claimed)}>
              Request pre-auth
            </button>
          </>
        )
      case "Pre-auth pending":
        return (
          <button
            type="button"
            className={btnPrimary}
            onClick={() => open("sanction", claim.tpa?.enhancementRequested || claim.tpa?.preAuthRequested || claimed)}
          >
            Record sanction
          </button>
        )
      case "To claim":
        return (
          <>
            {!isBilledToInsurance(claim) && (
              <button type="button" className={btnSoft} onClick={() => open("enhance", claimed)}>
                Request enhancement
              </button>
            )}
            <button
              type="button"
              className={btnPrimary}
              onClick={() => run(() => BillingDatabase.submitClaim(id), `Claim for ${inr(claimed)} submitted to ${insurer}.`)}
            >
              Submit claim to {insurer}
            </button>
          </>
        )
      case "With insurer":
        return (
          <>
            <button type="button" className={btnDanger} onClick={() => open("deny")}>
              Denied
            </button>
            <button type="button" className={btnSoft} onClick={() => open("query")}>
              Insurer query
            </button>
            <button type="button" className={btnPrimary} onClick={() => open("approve", claimed)}>
              Record approval
            </button>
          </>
        )
      case "Query":
        return (
          <button type="button" className={btnPrimary} onClick={() => open("answer")}>
            Reply to query
          </button>
        )
      case "Approved":
        return (
          <button type="button" className={btnPrimary} onClick={() => open("settle", claim.tpa?.approvedAmount ?? claimed)}>
            Record settlement
          </button>
        )
      case "Denied":
        return (
          <>
            <button
              type="button"
              className={btnSoft}
              onClick={() => run(() => BillingDatabase.resubmitClaim(id), `Corrected claim resubmitted to ${insurer}.`)}
            >
              Resubmit
            </button>
            <button type="button" className={btnPrimary} onClick={() => open("appeal")}>
              Appeal
            </button>
          </>
        )
      case "Appeal":
        return (
          <>
            <button type="button" className={btnDanger} onClick={() => open("deny")}>
              Appeal rejected
            </button>
            <button type="button" className={btnPrimary} onClick={() => open("approve", claimed)}>
              Record approval
            </button>
          </>
        )
      default:
        return null
    }
  })()

  const events = [...(claim.tpa?.events ?? [])].reverse()

  return (
    <section className="bg-white border border-[#CBD5E1] shadow-2xs">
      <PanelTitle
        title={readOnly ? "Billed to insurance" : "Insurance claim"}
        actions={<StageBadge stage={stage} />}
      />

      {/* Who is paying */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#E2E8F0] border-b border-[#E2E8F0]">
        {[
          { l: "Insurance company", v: claim.insuranceProvider },
          { l: "TPA", v: claim.tpa?.tpaName || "—" },
          { l: "Policy / member no.", v: claim.policyNumber || "—" },
          { l: "Pre-auth", v: `${preAuthOf(claim)}${claim.preAuthCode ? ` · ${claim.preAuthCode}` : ""}` },
        ].map((x) => (
          <div key={x.l} className="bg-slate-50 px-4 py-2.5 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{x.l}</div>
            <div className="text-[12.5px] font-semibold text-slate-900 truncate mt-0.5" title={x.v}>
              {x.v}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 space-y-4">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((label, i) => {
            const done = i < idx
            const current = i === idx
            const bad = current && (stage === "Denied" || stage === "Appeal" || stage === "Query")
            return (
              <li key={label} className="min-w-0">
                <div className={`h-1.5 ${done ? "bg-emerald-600" : bad ? "bg-rose-500" : current ? "bg-blue-600" : "bg-slate-200"}`} />
                <div
                  className={`mt-1.5 text-[11px] font-bold flex items-center gap-1 truncate ${
                    done ? "text-emerald-700" : bad ? "text-rose-700" : current ? "text-blue-700" : "text-slate-400"
                  }`}
                >
                  {done && <Check size={12} className="shrink-0" />}
                  {bad ? stage : label}
                </div>
              </li>
            )
          })}
        </ol>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { l: "Claim amount", v: claimed },
            { l: "Approved", v: claim.tpa?.approvedAmount, muted: claim.tpa?.approvedAmount === undefined },
            { l: writeOff ? "Deduction (write-off)" : "Deduction (patient)", v: deduction, danger: deduction > 0 },
            { l: "Settled", v: claim.tpa?.settledAmount, muted: claim.tpa?.settledAmount === undefined },
          ].map((x) => (
            <div key={x.l}>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{x.l}</div>
              <div
                className={`font-mono text-[15px] font-bold mt-0.5 ${
                  x.danger ? "text-rose-700" : x.muted ? "text-slate-300" : "text-slate-900"
                }`}
              >
                {x.v === undefined ? "—" : inr(x.v)}
              </div>
            </div>
          ))}
        </div>

        <div className="text-[11.5px] text-slate-500">
          Patient paid {inr(claim.amountPaid || 0)} at the counter
          {claim.balanceDue > 0 ? ` · ${inr(claim.balanceDue)} still due from the patient` : " · nothing due from the patient"}
          {claim.tpa?.billedAt && (
            <> · billed to insurance {new Date(claim.tpa.billedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</>
          )}
          {claim.tpa?.settlementRef && <> · UTR {claim.tpa.settlementRef}</>}
        </div>

        {overSanction > 0 && stage !== "Settled" && stage !== "Approved" && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-300 text-[12px] text-amber-900">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>The claim is {inr(overSanction)} over the pre-auth sanction of {inr(sanctioned!)}.</span>
          </div>
        )}
        {claim.tpa?.queryOpen && (
          <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-300 text-[12px] text-rose-900">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Insurer query:</strong> {claim.tpa.queryNote}
            </span>
          </div>
        )}
        {claim.denialReason && (stage === "Denied" || stage === "Appeal") && (
          <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-300 text-[12px] text-rose-900">
            <X size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Denied:</strong> {claim.denialReason}
            </span>
          </div>
        )}
        {deduction > 0 && claim.tpa?.deductionReason && (
          <div className="text-[12px] text-slate-600">
            <strong className="text-slate-800">Deduction reason:</strong> {claim.tpa.deductionReason}
          </div>
        )}
        {readOnly && (
          <div className="text-[11.5px] text-blue-800 bg-blue-50 border border-blue-200 px-3 py-2">
            The Insurance department is handling this claim with {claim.insuranceProvider}. Nothing is
            collected from the patient at this counter.
          </div>
        )}
      </div>

      {!readOnly && actions && !form && (
        <div className="px-5 py-3 border-t border-[#E2E8F0] bg-slate-50/60 flex flex-wrap justify-end gap-2">{actions}</div>
      )}

      {!readOnly && form && (
        <div className="px-5 py-4 border-t border-[#E2E8F0] bg-blue-50/40 space-y-3">
          <div className="text-[12.5px] font-bold text-slate-900">{FORM_TITLE[form]}</div>

          {form === "setup" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labeled label="Insurance Company *">
                  <select
                    className={field}
                    value={setupProvider}
                    onChange={(e) => setSetupProvider(e.target.value)}
                  >
                    {INSURERS.map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="TPA">
                  <select
                    className={field}
                    value={setupTpa}
                    onChange={(e) => setSetupTpa(e.target.value)}
                  >
                    {TPAS.map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Policy / Member No. *">
                  <input
                    className={`${field} font-mono`}
                    value={setupPolicy}
                    onChange={(e) => setSetupPolicy(e.target.value)}
                    placeholder="Enter policy or membership number"
                  />
                </Labeled>
                <Labeled label="Pre-auth / Approval Code (optional)">
                  <input
                    className={`${field} font-mono`}
                    value={setupPreAuth}
                    onChange={(e) => setSetupPreAuth(e.target.value)}
                    placeholder="Enter pre-auth code if approved"
                  />
                </Labeled>
              </div>

              <div className="p-3 bg-white border border-[#CBD5E1] rounded-sm space-y-2">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  KYC & Document Attachments (Aadhaar / Policy Card)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[11.5px] font-semibold rounded-sm cursor-pointer inline-flex items-center gap-1.5">
                    <input type="file" className="hidden" onChange={() => onNotify?.("Patient Aadhaar attached", "info")} />
                    Attach Patient Aadhaar / KYC
                  </label>
                  <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[11.5px] font-semibold rounded-sm cursor-pointer inline-flex items-center gap-1.5">
                    <input type="file" className="hidden" onChange={() => onNotify?.("Health card attached", "info")} />
                    Attach Health Card / Policy Copy
                  </label>
                </div>
              </div>
            </div>
          )}

          {(form === "preauth" || form === "sanction" || form === "enhance" || form === "approve" || form === "settle") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Labeled
                label={
                  form === "sanction" ? "Sanctioned amount" : form === "approve" ? "Approved amount" : form === "settle" ? "Amount received" : "Amount requested"
                }
              >
                <input
                  type="number"
                  min={0}
                  className={`${field} font-mono`}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                />
              </Labeled>
              <Labeled
                label={
                  form === "sanction"
                    ? "Pre-auth / approval code"
                    : form === "settle"
                      ? "UTR / NEFT reference"
                      : form === "approve"
                        ? "Deduction reason (if any)"
                        : form === "enhance"
                          ? "Reason for enhancement"
                          : "Note (optional)"
                }
              >
                <input className={field} value={text} onChange={(e) => setText(e.target.value)} />
              </Labeled>
            </div>
          )}

          {form === "approve" && amount < claimed && (
            <div className="space-y-1.5">
              <div className="text-[12px] text-rose-800">
                {inr(claimed - amount)} of the claim is not approved. Who absorbs it?
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["writeoff", "Hospital write-off"],
                    ["patient", "Recover from patient (reopens their bill)"],
                  ] as const
                ).map(([v, l]) => (
                  <label
                    key={v}
                    className={`px-3 h-8 flex items-center gap-2 border text-[12px] font-bold cursor-pointer ${
                      shortfallTo === v ? "bg-blue-50 border-blue-600 text-blue-800" : "bg-white border-[#CBD5E1] text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="shortfall"
                      className="accent-blue-600"
                      checked={shortfallTo === v}
                      onChange={() => setShortfallTo(v)}
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          )}

          {(form === "query" || form === "answer" || form === "deny" || form === "appeal") && (
            <Labeled
              label={
                form === "query" ? "What the insurer asked for" : form === "answer" ? "Reply / documents sent" : form === "deny" ? "Denial reason" : "Grounds for appeal"
              }
            >
              <textarea rows={2} className={`${field} h-auto py-1.5`} value={text} onChange={(e) => setText(e.target.value)} />
            </Labeled>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className={btnSoft} onClick={() => setForm(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} disabled={!formValid} onClick={submit}>
              Save
            </button>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="px-5 py-3 border-t border-[#E2E8F0]">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">Claim history</div>
          <ol className="space-y-1.5">
            {events.slice(0, readOnly ? 3 : 10).map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                <span className="w-1.5 h-1.5 bg-blue-600 mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900">{e.action}</span>
                  {e.amount !== undefined && <span className="font-mono text-slate-700"> · {inr(e.amount)}</span>}
                  {e.detail && <span className="text-slate-500"> — {e.detail}</span>}
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">
                  {new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
