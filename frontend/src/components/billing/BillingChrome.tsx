import React from "react"

// Page chrome for every Billing page, matching the house style the other
// departments use (OP Management, Surgery, Laboratory): a square blue icon
// tile, a bold title with a small status pill, and squared tinted KPI tiles
// with a 4px coloured left rule.

export function BillingHeader({
  icon: Icon,
  title,
  pill,
  subtitle,
  actions,
}: {
  icon: React.ComponentType<{ size?: number ;className?: string }>
  title: string
  pill?: string
  subtitle: string
  actions?: React.ReactNode
}) {
  return (
    <div className="bg-white border-b border-[#CBD5E1] px-6 py-3 flex flex-wrap items-center justify-between gap-4 flex-shrink-0 shadow-2xs">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
            {title}
            {pill && (
              <span className="text-[10.5px] bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 font-mono uppercase font-bold">
                {pill}
              </span>
            )}
          </h1>
          <p className="text-[11.5px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  )
}

export type KpiTone = "blue" | "amber" | "sky" | "purple" | "emerald" | "rose" | "slate"

// Full class strings (not interpolated) so Tailwind can see every one.
const TONES: Record<KpiTone, { card: string ;label: string ;value: string ;sub: string }> = {
  blue: {
    card: "bg-blue-50/80 border-blue-200 border-l-blue-600",
    label: "text-blue-900",
    value: "text-blue-950",
    sub: "text-blue-700",
  },
  amber: {
    card: "bg-amber-50/80 border-amber-200 border-l-amber-500",
    label: "text-amber-900",
    value: "text-amber-950",
    sub: "text-amber-800",
  },
  sky: {
    card: "bg-sky-50/80 border-sky-200 border-l-sky-600",
    label: "text-sky-900",
    value: "text-sky-950",
    sub: "text-sky-800",
  },
  purple: {
    card: "bg-purple-50/80 border-purple-200 border-l-purple-600",
    label: "text-purple-900",
    value: "text-purple-950",
    sub: "text-purple-800",
  },
  emerald: {
    card: "bg-emerald-50/80 border-emerald-200 border-l-emerald-600",
    label: "text-emerald-900",
    value: "text-emerald-950",
    sub: "text-emerald-800",
  },
  rose: {
    card: "bg-rose-50/80 border-rose-200 border-l-rose-600",
    label: "text-rose-900",
    value: "text-rose-950",
    sub: "text-rose-800",
  },
  slate: {
    card: "bg-slate-50 border-slate-200 border-l-slate-600",
    label: "text-slate-700",
    value: "text-slate-900",
    sub: "text-slate-600",
  },
}

export function KpiTile({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone: KpiTone
  icon?: React.ComponentType<{ size?: number ;className?: string }>
  onClick?: () => void
}) {
  const t = TONES[tone]
  return (
    <div
      onClick={onClick}
      className={`border border-l-4 p-3 shadow-2xs ${t.card} ${
        onClick ? "cursor-pointer hover:brightness-[0.98] transition" : ""
      }`}
    >
      <div
        className={`text-[10.5px] font-bold uppercase tracking-wider flex justify-between items-center gap-2 ${t.label}`}
      >
        <span className="truncate">{label}</span>
        {Icon && <Icon size={14} className="shrink-0 opacity-70" />}
      </div>
      <div className={`text-2xl font-bold font-mono mt-1 ${t.value}`}>{value}</div>
      {sub && (
        <div className={`text-[11px] mt-0.5 font-medium truncate ${t.sub}`}>{sub}</div>
      )}
    </div>
  )
}

/** Section title bar used above tables and panels. */
export function PanelTitle({
  title,
  count,
  actions,
}: {
  title: string
  count?: number | string
  actions?: React.ReactNode
}) {
  return (
    <div className="px-4 py-2.5 border-b border-[#E2E8F0] bg-slate-50/70 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 bg-blue-600 shrink-0" />
        <h3 className="text-[13px] font-bold text-slate-900 truncate">{title}</h3>
        {count !== undefined && (
          <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 px-1.5">
            {count}
          </span>
        )}
      </div>
      {actions}
    </div>
  )
}

/** Outline action button in the header style used across departments. */
export const headerBtnSoft =
  "px-3.5 h-8 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 text-[12px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
export const headerBtnSolid =
  "px-3.5 h-8 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white text-[12px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
