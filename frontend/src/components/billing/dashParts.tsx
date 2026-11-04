import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react"
import type { DepartmentType, PaymentRecord } from "../../services/billingDb"

// Shared pieces of the Billing Dashboard and the Revenue & Dues page, so the
// two read as one product: same cards, same number formats, same colours.
//
// Colour is by job: collections are always series-1 blue; payment methods use
// the validated categorical order (dataviz palette check passed) and always
// carry a text label beside the colour.

export const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`

export const compact = (n: number) =>
  n >= 1e7
    ? `₹${(n / 1e7).toFixed(1)}Cr`
    : n >= 1e5
      ? `₹${(n / 1e5).toFixed(1)}L`
      : n >= 1e3
        ? `₹${(n / 1e3).toFixed(1)}k`
        : `₹${Math.round(n)}`

export const BLUE = "#2a78d6"
export const ORANGE = "#eb6834"
export const MODE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"]
export const OTHER = "#94A3B8"
export const AXIS = { fontSize: 11, fill: "#64748B" }

export type Payment = PaymentRecord & {
  patientName: string
  patientId: string
  invoiceNo: string
  department: DepartmentType
}

export type IconType = React.ComponentType<{ size?: number ;className?: string }>

/** Local calendar day. UTC keys shifted Indian evenings/nights onto the wrong day. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export const ageDays = (iso?: string) => {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

export const MODE_ICON: Record<string, IconType> = {
  Cash: Banknote,
  "UPI / Digital": Smartphone,
  "Credit Card": CreditCard,
  "Debit Card": Wallet,
  "Bank Transfer": Landmark,
  "Insurance Copay": ShieldCheck,
}

/** Payments grouped by local calendar day. */
export function dailyTotals(payments: Payment[]) {
  const m = new Map<string, { amount: number ;count: number }>()
  for (const p of payments) {
    if (!p.paymentDate) continue
    const when = new Date(p.paymentDate)
    if (Number.isNaN(when.getTime())) continue
    const k = dayKey(when)
    const r = m.get(k) ?? { amount: 0, count: 0 }
    r.amount += p.amount || 0
    r.count++
    m.set(k, r)
  }
  return m
}

/** A continuous window of days ending today, zeros included. */
export function dayWindow(
  daily: Map<string, { amount: number }>,
  days: number,
  now: Date,
) {
  const out: { d: string ;label: string ;amount: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000)
    const k = dayKey(d)
    out.push({
      d: k,
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      amount: daily.get(k)?.amount ?? 0,
    })
  }
  return out
}

export const cardShadow =
  "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.10)]"

export function Sparkline({ values, color = BLUE }: { values: number[] ;color?: string }) {
  const max = Math.max(1, ...values)
  const w = 96
  const h = 28
  const step = values.length > 1 ? w / (values.length - 1) : w
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={color} fillOpacity={0.1} stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

export function Delta({
  now,
  before,
  invert,
  onDark,
}: {
  now: number
  before: number
  invert?: boolean
  onDark?: boolean
}) {
  const muted = onDark ? "text-blue-200" : "text-slate-400"
  if (!before && !now) return <span className={`text-[11px] ${muted}`}>no change vs yesterday</span>
  const pct = before ? Math.round(((now - before) / before) * 100) : 100
  const up = pct >= 0
  const good = invert ? !up : up
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
        good ? (onDark ? "text-emerald-300" : "text-emerald-700") : onDark ? "text-rose-300" : "text-rose-700"
      }`}
    >
      <Arrow size={13} />
      {Math.abs(pct)}%<span className={`font-medium ml-1 ${muted}`}>vs yesterday</span>
    </span>
  )
}

export function Ring({ pct, size = 104 }: { pct: number ;size?: number }) {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={10} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#34D399"
        strokeWidth={10}
        strokeDasharray={`${(clamped / 100) * c} ${c}`}
      />
    </svg>
  )
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`bg-white border border-[#E2E8F0] ${cardShadow} min-w-0 ${className}`}>
      <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11.5px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function LinkBtn({ label, onClick }: { label: string ;onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-[12px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer inline-flex items-center gap-1"
    >
      {label} <ArrowRight size={13} />
    </button>
  )
}

export function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name?: string ;value?: number ;color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 text-white px-3 py-2 text-[12px] shadow-lg">
      <div className="text-slate-300">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          {payload.length > 1 && <span className="w-2 h-2" style={{ backgroundColor: p.color }} />}
          {payload.length > 1 && <span className="text-slate-300">{p.name}</span>}
          <span className="font-mono font-bold ml-auto">{inr(p.value || 0)}</span>
        </div>
      ))}
    </div>
  )
}

/** Dark hero band shared by the billing landing pages. */
export function HeroBand({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-[#0B1B3F] text-white shadow-[0_10px_30px_-12px_rgba(11,27,63,0.6)]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(900px 300px at 85% -10%, rgba(59,130,246,0.45), transparent 60%), radial-gradient(600px 260px at 0% 120%, rgba(16,185,129,0.25), transparent 60%)",
        }}
      />
      <div className="relative">{children}</div>
    </section>
  )
}
