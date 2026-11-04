import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"
import { InsuranceEngineService, STATUS_META } from "../../services/insuranceDb"
import type { ComprehensiveClaimRecord, DocumentCategory, InsuranceClaimStatus } from "../../types/insurance"

// Shared building blocks of the Insurance pages. Calm by design: one blue
// accent, light borders, sentence-case labels, no pictographs.

export const inr = (n: number | undefined) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"

export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—"

export const daysUntil = (iso?: string) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : 0

const TONE: Record<string, string> = {
  slate: "bg-slate-100/90 text-slate-700 border border-slate-200/80 shadow-2xs",
  blue: "bg-blue-50/90 text-blue-800 border border-blue-200/80 shadow-2xs",
  sky: "bg-sky-50/90 text-sky-800 border border-sky-200/80 shadow-2xs",
  amber: "bg-amber-50/90 text-amber-900 border border-amber-200/80 shadow-2xs",
  violet: "bg-violet-50/90 text-violet-800 border border-violet-200/80 shadow-2xs",
  rose: "bg-rose-50/90 text-rose-800 border border-rose-200/80 shadow-2xs",
  emerald: "bg-emerald-50/90 text-emerald-800 border border-emerald-200/80 shadow-2xs",
}
const DOT: Record<string, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-600 animate-pulse",
  sky: "bg-sky-600",
  amber: "bg-amber-600 animate-pulse",
  violet: "bg-violet-600",
  rose: "bg-rose-600 animate-pulse",
  emerald: "bg-emerald-600",
}

// Kept for older call sites; the insurance UI no longer uses pictographs.
export const STATUS_EMOJI = {} as Record<InsuranceClaimStatus, string>
export const STAGE_EMOJI = {} as Record<string, string>
export const DOC_EMOJI = {} as Record<DocumentCategory, string>

/** Plain-language "what do I do now" for each status. */
export const NEXT_HINT: Record<InsuranceClaimStatus, string> = {
  DRAFT: "Capture the patient's policy details to start.",
  ELIGIBILITY_PENDING: "Verify the policy with the insurer / TPA — on their portal, by phone, or by email — and record what they confirmed.",
  ELIGIBLE: "Policy verified. Prepare the pre-auth: diagnosis, packages and estimated cost.",
  NOT_ELIGIBLE: "The insurer declined cover. Re-check with the insurer or move the patient to self-pay.",
  PREAUTH_DRAFT: "Upload the documents, check and verify each one, then email the pre-auth to the insurer.",
  PREAUTH_SUBMITTED: "Pre-auth emailed. When the insurer replies, paste their email below and record the decision.",
  PREAUTH_UNDER_REVIEW: "The insurer is reviewing. Paste their reply email and record the decision when it arrives.",
  PREAUTH_QUERY: "The insurer asked a question. Attach what they need, verify it, and email the answer back.",
  PREAUTH_APPROVED: "Approved. Treatment can go ahead — keep an eye on the running bill.",
  PREAUTH_REJECTED: "Pre-auth was rejected. Fix the request and submit again, or move to self-pay.",
  TREATMENT_IN_PROGRESS: "Patient is being treated. If the bill will cross the approved amount, ask for an enhancement. At discharge, press Initiate discharge.",
  DISCHARGE_INITIATED: "Collect and verify the discharge documents while the IP counter sends the final bill to insurance.",
  FINAL_BILL_READY: "Final bill received. Verify every claim document, then email the claim to the insurer.",
  CLAIM_SUBMITTED: "Claim emailed to the insurer. When they reply, paste the email and record the decision or their query.",
  CLAIM_QUERY_RAISED: "The insurer has a question about the claim. Verify the documents they asked for and email the answer.",
  APPROVED: "Approved in full. Enter the settlement advice number when it arrives.",
  PARTIALLY_APPROVED: "Approved with deductions. Enter the settlement advice number when it arrives.",
  REJECTED: "The claim was rejected. You can file an appeal with your reasons.",
  SETTLEMENT_PENDING: "Waiting for the money. When it lands in the bank, record the payment with its UTR.",
  PAYMENT_RECEIVED: "Money received. Match it against the bank statement and reconcile.",
  RECONCILED: "Everything matches. Close the claim.",
  CLOSED: "All done — nothing more to do on this claim.",
}

export function StatusPill({ status }: { status: InsuranceClaimStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight whitespace-nowrap transition-all duration-150 ${TONE[m.tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[m.tone]}`} />
      {m.label}
    </span>
  )
}

/** One line of guidance: what to do now. */
export function Hint({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "amber" | "emerald" | "rose" }) {
  const t = {
    blue: "border-teal-500 bg-teal-50/70 text-teal-900 shadow-2xs",
    amber: "border-amber-500 bg-amber-50/70 text-amber-900 shadow-2xs",
    emerald: "border-emerald-500 bg-emerald-50/70 text-emerald-900 shadow-2xs",
    rose: "border-rose-500 bg-rose-50/70 text-rose-900 shadow-2xs"
  }[tone]
  return <div className={`border-l-3 px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed rounded-r-md ${t}`}>{children}</div>
}


/** A titled group of fields inside a form. */
export function Section({ n, title, help, children }: { n?: number; title: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="pt-4 first:pt-0">
      <div className="flex items-baseline gap-2 mb-3">
        {n !== undefined && <span className="text-[12px] font-semibold text-slate-400 tabular-nums">{n}.</span>}
        <div>
          <h4 className="text-[13.5px] font-semibold text-slate-900">{title}</h4>
          {help && <p className="text-[12.5px] text-slate-500 mt-0.5">{help}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Radio card for the few choices that matter. */
export function Choice({ active, title, sub, onClick }: { active: boolean; emoji?: string; title: string; sub?: string; onClick: () => void; tone?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`text-left rounded-none border px-3 py-2.5 cursor-pointer transition-colors flex gap-2.5 ${active ? "border-blue-600 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
    >
      <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${active ? "border-blue-600" : "border-slate-300"}`}>
        {active && <span className="w-2 h-2 rounded-full bg-blue-600" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-900">{title}</span>
        {sub && <span className="block text-[12px] text-slate-500 mt-0.5">{sub}</span>}
      </span>
    </button>
  )
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer select-none mr-5">
      <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

/** Text tab with a count, for queues and filters. */
export function QueueButton({ active, label, count, onClick, alert }: { active: boolean; emoji?: string; label: string; count?: number; onClick: () => void; alert?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 px-3.5 rounded-md text-[12.5px] font-semibold cursor-pointer inline-flex items-center gap-2 whitespace-nowrap transition-all duration-150 shadow-2xs ${
        active
          ? "bg-teal-700 text-white shadow-sm ring-1 ring-teal-800"
          : "bg-white text-slate-700 hover:bg-slate-100/80 border border-slate-200/80 hover:border-slate-300"
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`tabular-nums text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
            active
              ? "bg-teal-800/80 text-teal-100"
              : alert && count > 0
              ? "bg-rose-100 text-rose-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function Tag({ tone = "slate", children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE[tone]}`}>{children}</span>
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  pad = true,
}: {
  title?: string
  emoji?: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  pad?: boolean
}) {
  return (
    <section className={`bg-white border border-slate-200/90 rounded-lg shadow-2xs transition-shadow hover:shadow-xs min-w-0 ${className}`}>
      {title && (
        <header className={`px-5 pt-4 ${pad ? "pb-0" : "pb-3.5 border-b border-slate-100"} flex items-start justify-between gap-3`}>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-slate-900 tracking-tight truncate">{title}</h3>
            {subtitle && <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  )
}

/** Input look without a width: for fields that set their own. */
export const fieldBase =
  "h-9 px-3.5 rounded-md bg-white border border-slate-300/90 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 transition-all duration-150 disabled:bg-slate-50 disabled:text-slate-500 shadow-2xs"

export const fieldCls = `w-full ${fieldBase}`

export function Field({ label, hint, children, span = 1 }: { label: string; hint?: string; children: React.ReactNode; span?: 1 | 2 | 3 | 4 }) {
  const cls = span === 4 ? "sm:col-span-2 lg:col-span-4" : span === 3 ? "sm:col-span-2 lg:col-span-3" : span === 2 ? "sm:col-span-2" : ""
  return (
    <label className={`block min-w-0 ${cls}`}>
      <span className="block text-[12.5px] font-semibold text-slate-800 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-slate-500 mt-1">{hint}</span>}
    </label>
  )
}

const btnBase = "h-9 px-4 rounded-none text-[12.5px] font-semibold cursor-pointer transition-all duration-150 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
export const btn = {
  primary: `${btnBase} bg-teal-700 hover:bg-teal-800 text-white shadow-xs focus:ring-2 focus:ring-teal-500/30`,
  soft: `${btnBase} bg-white hover:bg-slate-50 border border-slate-300/90 text-slate-800 focus:ring-2 focus:ring-slate-400/20`,
  plain: `${btnBase} bg-white hover:bg-slate-50 border border-slate-300/90 text-slate-700`,
  danger: `${btnBase} bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 focus:ring-2 focus:ring-rose-500/20`,
  success: `${btnBase} bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs focus:ring-2 focus:ring-emerald-500/30`,
  link: "text-[12.5px] font-semibold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer transition-colors",
}


export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-none border border-slate-300 shadow-xl my-10`} onClick={(e) => e.stopPropagation()}>
        <header className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <h3 className="text-[16px] font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-none hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
            <X size={16} />
          </button>
        </header>
        <div className="px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>
  )
}

export function Drawer({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 flex justify-end" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[520px] h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-[12.5px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-none hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">{footer}</footer>}
      </aside>
    </div>
  )
}

/** Label / value row in read-only summaries. */
export function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[13px] text-slate-500">{k}</span>
      <span className={`text-[13px] font-medium text-slate-900 text-right ${mono ? "tabular-nums" : ""}`}>{v}</span>
    </div>
  )
}

export function Dot({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok === null ? "text-amber-700" : ok ? "text-emerald-700" : "text-rose-700"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok === null ? "bg-amber-500" : ok ? "bg-emerald-500" : "bg-rose-500"}`} />
      {children}
    </span>
  )
}

export type Notify = (message: string, type?: "success" | "error") => void

/** Toast state + a runner that turns engine errors into toasts. */
export function useNotify() {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const notify: Notify = useCallback((message, type = "success") => {
    setToast({ message, type })
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [])
  const node = toast ? (
    <div
      role="status"
      className={`fixed top-5 right-5 z-[70] max-w-sm rounded-lg px-4 py-2.5 shadow-xl text-xs font-semibold text-white flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-200 ${
        toast.type === "error" ? "bg-rose-600" : "bg-slate-900 border border-slate-700"
      }`}
    >
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => setToast(null)}
        className="w-5 h-5 rounded hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  ) : null
  return { notify, toastNode: node }
}

/** Run an engine action; success message on success, the error otherwise. */
export function attempt(notify: Notify, fn: () => void, ok: string): boolean {
  try {
    fn()
    notify(ok, "success")
    return true
  } catch (e) {
    notify((e as Error).message || "Something went wrong", "error")
    return false
  }
}

/** Live list of insurance cases (same tab, other tabs, and billing changes). */
export function useCases() {
  const [cases, setCases] = useState<ComprehensiveClaimRecord[]>(() => InsuranceEngineService.getClaims())
  useEffect(() => {
    const load = () => setCases(InsuranceEngineService.getClaims())
    load()
    return InsuranceEngineService.subscribe(load)
  }, [])
  return cases
}

export function Empty({ title, hint }: { title: string; hint?: string; emoji?: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="text-[13.5px] font-medium text-slate-700">{title}</div>
      {hint && <div className="text-[12.5px] text-slate-500 mt-1">{hint}</div>}
    </div>
  )
}

export function Stat({ label, value, tone = "text-slate-900", sub }: { label: string; value: React.ReactNode; tone?: string; sub?: string }) {
  return (
    <div className="min-w-0 bg-slate-50/60 border border-slate-200/80 rounded-md p-3 transition-colors hover:bg-white hover:border-slate-300">
      <div className="text-[11.5px] font-medium text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-[17px] font-bold tabular-nums mt-0.5 truncate ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

/** Page title bar used by every insurance page. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="bg-white border-b border-slate-200/90 px-6 py-4.5 flex flex-wrap items-center gap-4 shadow-2xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
          <h1 className="text-[19px] font-bold text-slate-900 tracking-tight">{title}</h1>
        </div>
        {subtitle && <p className="text-[12.5px] text-slate-500 mt-1 font-normal leading-normal">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2.5">{actions}</div>}
    </header>
  )
}

