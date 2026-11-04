// Shared building blocks for the Accounts screens: formatting, layout, tables,
// form controls, and the data-loading hook. One visual language for the module:
// white cards on a light page, one blue accent, light borders, tabular figures.
// Radii are explicit (rounded-[6px] / [8px]) because this app's theme redefines
// rounded-md / rounded-lg.

import React, { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2, X } from "lucide-react"

// ── Formatting ──────────────────────────────────────────────────────────────

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inrCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 })

/** ₹ with Indian digit grouping. Negative figures in brackets, as on a statement. */
export function formatINR(value: number | null | undefined, opts: { blankZero?: boolean } = {}): string {
  const n = Number(value || 0)
  if (opts.blankZero && n === 0) return ""
  const body = `₹${inr.format(Math.abs(n))}`
  return n < 0 ? `(${body})` : body
}

/** ₹12.4 L / ₹3.1 Cr for headline tiles. */
export function formatINRShort(value: number): string {
  const n = Math.abs(value)
  const sign = value < 0 ? "−" : ""
  if (n >= 1e7) return `${sign}₹${inrCompact.format(n / 1e7)} Cr`
  if (n >= 1e5) return `${sign}₹${inrCompact.format(n / 1e5)} L`
  return `${sign}₹${inr.format(n)}`
}

export function formatDate(value?: string | null): string {
  if (!value) return "—"
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export const today = () => new Date().toISOString().slice(0, 10)

/** Start of the Indian financial year (1 April) containing today. */
export function fyStart(): string {
  const d = new Date()
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${year}-04-01`
}

export function Money({ value, strong, blankZero }: { value: number | null | undefined; strong?: boolean; blankZero?: boolean }) {
  const n = Number(value || 0)
  return (
    <span className={`tabular-nums whitespace-nowrap ${strong ? "font-semibold text-gray-900" : ""} ${n < 0 ? "text-[#B42318]" : ""}`}>
      {formatINR(n, { blankZero })}
    </span>
  )
}

// ── Data loading ────────────────────────────────────────────────────────────

export interface ApiState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/** Load once per change of `deps`; keeps the last good data visible while reloading. */
export function useApi<T>(loader: () => Promise<T>, deps: React.DependencyList): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let live = true
    setLoading(true)
    loaderRef
      .current()
      .then((result) => {
        if (!live) return
        setData(result)
        setError(null)
      })
      .catch((err: Error) => live && setError(err.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

/** Run a mutation, report its error, and refresh afterwards. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(action: () => Promise<T>, after?: (result: T) => void) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      after?.(result)
      return result
    } catch (err) {
      setError((err as Error).message)
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, setError, run }
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="text-[17px] font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-[12.5px] text-[#64748B] mt-0.5 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({
  title,
  actions,
  children,
  padded = true,
  className = "",
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  padded?: boolean
  className?: string
}) {
  return (
    <section className={`bg-white border border-[#DDE2EC] rounded-none ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#EEF1F6]">
          <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: "default" | "good" | "warn" | "bad"
  onClick?: () => void
}) {
  const toneClass = { default: "text-gray-900", good: "text-[#067647]", warn: "text-[#B54708]", bad: "text-[#B42318]" }[tone]
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      onClick={onClick}
      className={`text-left bg-white border border-[#DDE2EC] rounded-none px-4 py-3 ${onClick ? "hover:border-[#1B4FD8] cursor-pointer" : ""}`}
    >
      <div className="text-[11.5px] text-[#64748B]">{label}</div>
      <div className={`text-[19px] font-semibold tabular-nums mt-1 ${toneClass}`}>{value}</div>
      {hint && <div className="text-[11.5px] text-[#64748B] mt-0.5">{hint}</div>}
    </Tag>
  )
}

export function Grid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const map = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" }
  return <div className={`grid grid-cols-1 ${map[cols]} gap-3`}>{children}</div>
}

// ── Feedback ────────────────────────────────────────────────────────────────

export function ErrorNote({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] rounded-none px-3 py-2 text-[12.5px]">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      )}
    </div>
  )
}

export function Notice({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 bg-[#ECFDF3] border border-[#ABEFC6] text-[#067647] rounded-none px-3 py-2 text-[12.5px]">
      <span className="flex-1">{message}</span>
      <button onClick={onClose} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-[#64748B] py-6 justify-center">
      <Loader2 size={15} className="animate-spin" /> {label}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-[12.5px] text-[#64748B] py-8">{children}</div>
}

/** Standard body for a loaded block: error, first-load spinner, or content. */
export function Loaded<T>({ state, children }: { state: ApiState<T>; children: (data: T) => React.ReactNode }) {
  if (state.error && !state.data) return <ErrorNote message={state.error} onRetry={state.reload} />
  if (!state.data) return <Loading />
  return (
    <>
      {state.error && <ErrorNote message={state.error} onRetry={state.reload} />}
      {children(state.data)}
    </>
  )
}

const PILL_TONES = {
  neutral: "bg-[#F2F4F7] text-[#344054] border-[#E4E7EC]",
  blue: "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]",
  green: "bg-[#ECFDF3] text-[#067647] border-[#ABEFC6]",
  amber: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  red: "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]",
}

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof PILL_TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-none border text-[11px] font-medium whitespace-nowrap ${PILL_TONES[tone]}`}>
      {children}
    </span>
  )
}

// ── Tables ──────────────────────────────────────────────────────────────────

export function Table({ children, dense }: { children: React.ReactNode; dense?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-[12.5px] ${dense ? "[&_td]:py-1.5" : "[&_td]:py-2"} [&_td]:px-3 [&_th]:px-3`}>
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  right,
  align,
  className = "",
}: {
  children?: React.ReactNode
  right?: boolean
  align?: string
  className?: string
}) {
  const isRight = right || align === "right"
  return (
    <th
      className={`py-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] bg-[#F8FAFC] border-b border-[#EEF1F6] ${isRight ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  right,
  align,
  mono,
  bold,
  tone,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode
  right?: boolean
  align?: string
  mono?: boolean
  bold?: boolean
  tone?: string
  className?: string
  colSpan?: number
}) {
  const isRight = right || align === "right"
  const fontClass = `${mono ? "font-mono " : ""}${bold ? "font-semibold " : ""}`
  return (
    <td colSpan={colSpan} className={`border-b border-[#F2F4F7] align-top ${isRight ? "text-right" : ""} ${fontClass} ${className}`}>
      {children}
    </td>
  )
}

export function downloadCsv(
  filename: string,
  headerOrRows: string[] | (string | number | null | undefined)[][],
  maybeRows?: (string | number | null | undefined)[][],
) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const allRows: (string | number | null | undefined)[][] = maybeRows
    ? [headerOrRows as string[], ...maybeRows]
    : (headerOrRows as (string | number | null | undefined)[][])
  const csv = allRows.map((r) => r.map(escape).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Controls ────────────────────────────────────────────────────────────────

export function Button({
  children,
  variant = "secondary",
  size = "md",
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost"
  size?: "sm" | "md"
  busy?: boolean
}) {
  const variants = {
    primary: "bg-[#1B4FD8] text-white border-[#1B4FD8] hover:bg-[#1741B5]",
    secondary: "bg-white text-[#344054] border-[#D0D5DD] hover:bg-[#F9FAFB]",
    danger: "bg-white text-[#B42318] border-[#FDA29B] hover:bg-[#FEF3F2]",
    ghost: "bg-transparent text-[#1B4FD8] border-transparent hover:bg-[#EFF6FF]",
  }
  const sizes = { sm: "px-2 py-1 text-[11.5px]", md: "px-3 py-1.5 text-[12.5px]" }
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 border rounded-none font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${props.className || ""}`}
    >
      {busy && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  )
}

const controlClass =
  "w-full border border-[#D0D5DD] rounded-none bg-white px-2.5 py-1.5 text-[12.5px] text-gray-900 focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/10"

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium text-[#344054] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[#64748B] mt-1">{hint}</span>}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className || ""}`} />
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${controlClass} ${props.className || ""}`}>
      {children}
    </select>
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} ${props.className || ""}`} />
}

export function DateRangeBar({
  from,
  to,
  onChange,
  single,
}: {
  from?: string
  to: string
  onChange: (range: { from?: string; to: string }) => void
  single?: boolean
}) {
  return (
    <div className="flex items-end gap-2">
      {!single && (
        <Field label="From">
          <Input type="date" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} />
        </Field>
      )}
      <Field label={single ? "As of" : "To"}>
        <Input type="date" value={to} min={from} onChange={(e) => onChange({ from, to: e.target.value })} />
      </Field>
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div
        className={`bg-white rounded-none border border-[#DDE2EC] shadow-xl w-full ${wide ? "max-w-4xl" : "max-w-lg"} mt-12`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[#EEF1F6]">
          <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-[#64748B] hover:text-gray-900">
            <X size={16} />
          </button>
        </header>
        <div className="p-4 space-y-3">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-4 py-3 border-t border-[#EEF1F6] bg-[#F8FAFC] rounded-none">{footer}</footer>}
      </div>
    </div>
  )
}
