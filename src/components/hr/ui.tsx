// Shared building blocks for the HR workspace following the enterprise hospital design system.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import toast from "react-hot-toast"
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react"
import { HrApiError } from "../../services/hr/client"

export const TEAL = "#1B4FD8" // Standard Hospital Royal Blue
export const PURPLE = "#6366F1"

// ── data ────────────────────────────────────────────────────────────────────

export function useHr<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<HrApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const id = ++seq.current
    if (!data) setLoading(true)
    try {
      const result = await load()
      if (id === seq.current) {
        setData(result)
        setError(null)
      }
    } catch (e) {
      if (id === seq.current) setError(e instanceof HrApiError ? e : new HrApiError(0, String(e)))
    } finally {
      if (id === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** [busyKey, run]: run(key, fn, success?) shows a toast either way and
 *  returns the result, or undefined when it failed. */
export function useRun() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string)) => {
    setBusy(key)
    try {
      const result = await fn()
      if (success) toast.success(typeof success === "function" ? success(result) : success)
      return result
    } catch (e) {
      toast.error(errorText(e))
      return undefined
    } finally {
      setBusy(null)
    }
  }, [])
  return [busy, run] as const
}

export const money = (v?: string | number | null) =>
  v === null || v === undefined || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

export const minutes = (m?: number | null) => (!m ? "0m" : `${Math.floor(m / 60)}h ${m % 60}m`)

// ── formatting ──────────────────────────────────────────────────────────────

export function fmtDate(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export function fmtDateTime(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return isNaN(d.getTime())
    ? v
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function fmtTime(v?: string | null) {
  if (!v) return "—"
  const d = new Date(v)
  return isNaN(d.getTime()) ? v : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
}

export function ago(v?: string | null) {
  if (!v) return "never"
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const humanize = (s?: string | null) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—")

// ── layout ──────────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-[11.5px] text-[#64748B] mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`bg-white border border-[#DDE2EC] rounded shadow-2xs ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#EEF1F6]">
          <h3 className="text-[13px] font-semibold text-gray-900 tracking-tight">{title}</h3>
          {actions}
        </header>
      )}
      <div className="p-4 md:p-5">{children}</div>
    </section>
  )
}

export function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: "neutral" | "good" | "warn" | "bad" | "accent"
  onClick?: () => void
}) {
  const bar = {
    neutral: "bg-gray-300",
    good: "bg-[#16A34A]",
    warn: "bg-[#D97706]",
    bad: "bg-[#DC2626]",
    accent: "bg-[#1B4FD8]",
  }[tone]

  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      onClick={onClick}
      className={`relative text-left bg-white border border-[#DDE2EC] rounded p-4 shadow-2xs overflow-hidden transition-all ${
        onClick ? "hover:border-[#1B4FD8] hover:shadow-xs cursor-pointer" : ""
      }`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} />
      <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold font-mono text-gray-900 mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-[11.5px] text-[#64748B] mt-0.5">{hint}</div>}
    </Tag>
  )
}

const BADGE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  online: "bg-emerald-50 text-emerald-700 border-emerald-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  unknown: "bg-gray-100 text-gray-600 border-gray-200",
  out: "bg-gray-100 text-gray-700 border-gray-300",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  suspended: "bg-amber-50 text-amber-800 border-amber-200",
  not_arrived: "bg-amber-50 text-amber-800 border-amber-200",
  offline: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
  archived: "bg-gray-100 text-gray-500 border-gray-200",
  simulator: "bg-purple-50 text-purple-700 border-purple-200",
}

const BADGE_LABEL: Record<string, string> = {
  in: "Checked In",
  out: "Checked Out",
  not_arrived: "Not Arrived",
}

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap border ${
        BADGE[value] ?? BADGE.draft
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />
      {label ?? BADGE_LABEL[value] ?? humanize(value)}
    </span>
  )
}

// ── states ──────────────────────────────────────────────────────────────────

export function Loading({ label = "Loading data…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[12px] font-medium text-[#64748B]" role="status">
      <Loader2 className="w-4 h-4 animate-spin text-[#1B4FD8]" /> {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center" role="alert">
      <AlertTriangle className="w-5 h-5 text-red-600" />
      <p className="text-[12.5px] font-medium text-gray-800">{errorText(error)}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-[12px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer">
          Try again
        </button>
      )}
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Inbox className="w-6 h-6 text-gray-400" />
      <p className="text-[12.5px] font-bold text-gray-800">{title}</p>
      {hint && <p className="text-[11.5px] text-[#64748B] max-w-md">{hint}</p>}
      {action}
    </div>
  )
}

// ── controls ────────────────────────────────────────────────────────────────

export function Btn({
  children,
  variant = "secondary",
  busy,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost"
  busy?: boolean
}) {
  const styles = {
    primary: "bg-[#1B4FD8] hover:bg-[#1E40AF] text-white border-transparent shadow-2xs font-semibold",
    secondary: "bg-white text-gray-700 border-[#DDE2EC] hover:bg-gray-50 shadow-2xs font-medium",
    danger: "bg-white text-red-700 border-red-200 hover:bg-red-50 shadow-2xs font-medium",
    ghost: "bg-transparent text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900 font-medium",
  }[variant]

  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${styles} ${className}`}
    >
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wider mb-1">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-[11px] text-red-600 mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-[#64748B] mt-1">{hint}</span>
      ) : null}
    </label>
  )
}

const fieldBase =
  "px-3 py-1.5 text-[12px] text-gray-800 bg-white border border-[#DDE2EC] rounded shadow-2xs focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] disabled:bg-gray-50 disabled:text-gray-400 transition-colors"

export const inputCls = `w-full ${fieldBase}`
export const filterCls = `w-auto max-w-[220px] ${fieldBase}`

export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xs" onClick={onClose} />
      <div className={`relative h-full w-full ${wide ? "max-w-3xl" : "max-w-lg"} bg-white shadow-2xl flex flex-col`}>
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-[#DDE2EC]">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        {footer && (
          <footer className="px-5 py-3.5 border-t border-[#DDE2EC] flex justify-end gap-2 bg-[#F8FAFC]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between text-[11.5px] text-[#64748B] pt-3">
      <span className="font-medium">
        {total === 0 ? "No records" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <Btn variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" />
        </Btn>
        <span className="px-2 font-mono font-semibold text-gray-700">
          {page} / {pages}
        </span>
        <Btn variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="w-3.5 h-3.5" />
        </Btn>
      </div>
    </div>
  )
}

export type TableHeadItem = ReactNode | { label: ReactNode; align?: "left" | "right" | "center" }

export function Table({ head, children }: { head: TableHeadItem[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-[#DDE2EC] rounded bg-white shadow-2xs">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-[#F8FAFC] border-b border-[#DDE2EC]">
            {head.map((h, i) => {
              let label: ReactNode = ""
              let align: "left" | "right" | "center" = "left"

              if (h && typeof h === "object" && "label" in (h as any)) {
                label = (h as any).label
                align = (h as any).align || "left"
              } else {
                label = h as ReactNode
                if (typeof h === "string") {
                  const s = h.trim().toLowerCase()
                  if (
                    s === "" ||
                    s === "actions" ||
                    s === "action" ||
                    s === "amount" ||
                    s === "net" ||
                    s === "gross" ||
                    s === "salary" ||
                    s === "hours" ||
                    s === "overtime" ||
                    s === "balance" ||
                    s === "days" ||
                    s === "rate" ||
                    s === "cost"
                  ) {
                    align = "right"
                  }
                }
              }

              const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"

              return (
                <th
                  key={i}
                  className={`px-3.5 py-2.5 font-semibold text-[10.5px] uppercase tracking-wider text-[#64748B] whitespace-nowrap ${alignCls}`}
                >
                  {label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">{children}</tbody>
      </table>
    </div>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (v: T) => void
  items: { id: T; label: string; count?: number }[]
}) {
  return (
    <div className="flex items-center gap-1 border-b border-[#DDE2EC] mb-4 overflow-x-auto" role="tablist">
      {items.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`px-3 py-1.5 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              active
                ? "border-[#1B4FD8] text-[#1B4FD8] font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold ${
                  active ? "bg-blue-100 text-[#1B4FD8]" : "bg-gray-100 text-gray-600"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = (name || "—")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const sizeCls = {
    sm: "w-6 h-6 text-[10px]",
    md: "w-8 h-8 text-xs",
    lg: "w-10 h-10 text-sm font-semibold",
  }[size]

  return (
    <div
      className={`rounded-full bg-blue-100 text-[#1B4FD8] font-semibold flex items-center justify-center shrink-0 ${sizeCls}`}
    >
      {initials}
    </div>
  )
}
