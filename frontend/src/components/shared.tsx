import React from "react"

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, {
  dot: string
  bg: string
  text: string
  label?: string
}> = {
  active: { dot: "#16A34A", bg: "#DCFCE7", text: "#15803D" },
  inprogress: {
    dot: "#0284C7",
    bg: "#E0F2FE",
    text: "#0369A1",
    label: "In Progress",
  },
  pending: { dot: "#D97706", bg: "#FEF3C7", text: "#B45309" },
  completed: { dot: "#6B7280", bg: "#F3F4F6", text: "#4B5563" },
  cancelled: { dot: "#DC2626", bg: "#FEE2E2", text: "#B91C1C" },
  critical: { dot: "#DC2626", bg: "#FEE2E2", text: "#B91C1C" },
  draft: { dot: "#9CA3AF", bg: "#F9FAFB", text: "#6B7280" },
  checkedin: {
    dot: "#0EA5E9",
    bg: "#E0F2FE",
    text: "#0284C7",
    label: "Checked In",
  },
  waiting: { dot: "#D97706", bg: "#FEF3C7", text: "#B45309" },
  admitted: { dot: "#7C3AED", bg: "#EDE9FE", text: "#6D28D9" },
  discharged: { dot: "#6B7280", bg: "#F3F4F6", text: "#374151" },
  available: { dot: "#16A34A", bg: "#DCFCE7", text: "#15803D" },
  occupied: { dot: "#DC2626", bg: "#FEE2E2", text: "#B91C1C" },
  cleaning: { dot: "#D97706", bg: "#FEF3C7", text: "#B45309" },
  reserved: { dot: "#0284C7", bg: "#E0F2FE", text: "#0369A1" },
  isolation: { dot: "#7C3AED", bg: "#EDE9FE", text: "#6D28D9" },
  noshow: { dot: "#6B7280", bg: "#F3F4F6", text: "#4B5563", label: "No Show" },
  paid: { dot: "#16A34A", bg: "#DCFCE7", text: "#15803D" },
  denied: { dot: "#DC2626", bg: "#FEE2E2", text: "#B91C1C" },
  submitted: { dot: "#0284C7", bg: "#E0F2FE", text: "#0369A1" },
  appeal: { dot: "#D97706", bg: "#FEF3C7", text: "#B45309" },
  ordered: { dot: "#0284C7", bg: "#E0F2FE", text: "#0369A1" },
  resolved: { dot: "#16A34A", bg: "#DCFCE7", text: "#15803D" },
  superseded: { dot: "#9CA3AF", bg: "#F9FAFB", text: "#6B7280" },
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const key = status.toLowerCase().replace(/[\s-]/g, "")
  const s = STATUS_MAP[key] || {
    dot: "#6B7280",
    bg: "#F3F4F6",
    text: "#4B5563",
  }
  const label =
    STATUS_MAP[key]?.label ||
    status.charAt(0).toUpperCase() + status.slice(1).replace(/([A-Z])/g, " $1")
  return (
    <span
      style={{ backgroundColor: s.bg, color: s.text }}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${className || ""}`}
    >
      <span className="status-dot" style={{ backgroundColor: s.dot }} />
      {label}
    </span>
  )
}

// ─── Acuity Badge ─────────────────────────────────────────────────────────────
export function AcuityBadge({ level }: { level: number }) {
  const map: Record<number, { bg: string ;text: string }> = {
    1: { bg: "#1F2937", text: "#F9FAFB" },
    2: { bg: "#DC2626", text: "#FFF" },
    3: { bg: "#D97706", text: "#FFF" },
    4: { bg: "#15803D", text: "#FFF" },
    5: { bg: "#1B4FD8", text: "#FFF" },
  }
  const s = map[level] || map[5]
  return (
    <span
      style={{ backgroundColor: s.bg, color: s.text }}
      className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-sm"
    >
      ESI {level}
    </span>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
export function SectionHeader({
  title,
  actions,
}: {
  title: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-gray-800 tracking-tight">
        {title}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
export function MetricCard({
  label,
  value,
  sub,
  trend,
  color,
  action,
  onClick,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: string
  color?: string
  action?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-[#DDE2EC] rounded p-3.5 hover:border-[#1B4FD8] transition-colors cursor-pointer"
    >
      <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="flex items-end gap-2">
        <span
          className="text-2xl font-semibold leading-none"
          style={{ color: color || "#0F1624" }}
        >
          {value}
        </span>
        {trend && (
          <span
            className={`text-[11px] font-mono mb-0.5 ${
              trend.startsWith("↑")
                ? "text-[#DC2626]"
                : trend.startsWith("↓")
                  ? "text-[#16A34A]"
                  : "text-[#64748B]"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
      {sub && <div className="text-[11px] text-[#94A3B8] mt-1">{sub}</div>}
      {action && (
        <div className="text-[11px] text-[#1B4FD8] font-medium mt-2 hover:underline">
          {action} →
        </div>
      )}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({
  headers,
  children,
}: {
  headers: string[]
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-[#DDE2EC] bg-[#F8FAFC]">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 font-semibold text-[#64748B] uppercase text-[10.5px] tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function TR({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-[#F1F5F9] tr-hover ${
        onClick ? "cursor-pointer" : ""
      } ${className || ""}`}
    >
      {children}
    </tr>
  )
}

export function TD({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode
  className?: string
  colSpan?: number
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2.5 ${className || ""}`}>
      {children}
    </td>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  title,
  children,
  actions,
  className,
}: {
  title?: string
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white border border-[#DDE2EC] rounded ${className || ""}`}
    >
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#DDE2EC]">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            {title}
          </span>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
export function Btn({
  children,
  variant = "primary",
  size = "sm",
  onClick,
  className,
  disabled,
  type = "button",
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"
  size?: "xs" | "sm" | "md"
  onClick?: () => void
  className?: string
  disabled?: boolean
  type?: "button" | "submit" | "reset"
}) {
  const variants = {
    primary:
      "bg-[#1B4FD8] text-white hover:bg-[#1740B4] border border-[#1B4FD8] disabled:opacity-50 disabled:cursor-not-allowed",
    secondary:
      "bg-[#E8EDF5] text-[#1E3A6E] hover:bg-[#D5DFF0] border border-[#C7D2E7] disabled:opacity-50 disabled:cursor-not-allowed",
    ghost:
      "bg-transparent text-[#64748B] hover:bg-[#F1F5F9] border border-transparent disabled:opacity-50 disabled:cursor-not-allowed",
    danger:
      "bg-[#DC2626] text-white hover:bg-[#B91C1C] border border-[#DC2626] disabled:opacity-50 disabled:cursor-not-allowed",
    outline:
      "bg-white text-[#374151] hover:bg-[#F8FAFC] border border-[#DDE2EC] disabled:opacity-50 disabled:cursor-not-allowed",
  }
  const sizes = {
    xs: "px-2 py-1 text-[11px]",
    sm: "px-3 py-1.5 text-[12px]",
    md: "px-4 py-2 text-[13px]",
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${variants[variant]} ${sizes[size]} rounded font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${className || ""}`}
    >
      {children}
    </button>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({
  placeholder,
  value,
  onChange,
  icon,
  className,
  type = "text",
  required,
  disabled,
  name,
  readOnly,
  maxLength,
  inputMode,
  pattern,
  onKeyDown,
}: {
  placeholder?: string
  value?: string
  onChange?: (v: string) => void
  icon?: React.ReactNode
  className?: string
  type?: string
  required?: boolean
  disabled?: boolean
  name?: string
  readOnly?: boolean
  maxLength?: number
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  pattern?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <div className={`relative ${className || ""}`}>
      {icon && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]">
          {icon}
        </span>
      )}
      <input
        type={type}
        required={required}
        disabled={disabled}
        name={name}
        readOnly={readOnly}
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        pattern={pattern}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-[#DDE2EC] rounded bg-white text-[12.5px] text-gray-800 placeholder:text-[#94A3B8] focus:border-[#1B4FD8] focus:outline-none py-1.5 ${
          icon ? "pl-8 pr-3" : "px-3"
        }`}
      />
    </div>
  )
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────
export function AlertBanner({
  type,
  title,
  body,
  action,
  onAction,
}: {
  type: "info" | "warning" | "critical"
  title: string
  body?: string
  action?: string
  onAction?: () => void
}) {
  const map = {
    info: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", icon: "ℹ" },
    warning: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", icon: "⚠" },
    critical: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", icon: "⚠" },
  }
  const s = map[type]
  return (
    <div
      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text }}
      className="border rounded px-3.5 py-2.5 flex items-start gap-2.5"
    >
      <span className="font-bold mt-px text-sm">{s.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-xs">{title}</div>
        {body && <div className="text-[11.5px] mt-0.5 opacity-80">{body}</div>}
      </div>
      {action && (
        <button
          onClick={onAction}
          className="text-[11px] font-semibold underline underline-offset-2 whitespace-nowrap"
        >
          {action}
        </button>
      )}
    </div>
  )
}

// ─── Timeline Item ────────────────────────────────────────────────────────────
export function TimelineItem({
  time,
  type,
  title,
  detail,
  isLast,
}: {
  time: string
  type: string
  title: string
  detail?: string
  isLast?: boolean
}) {
  const typeColors: Record<string, string> = {
    clinical: "#1B4FD8",
    lab: "#7C3AED",
    imaging: "#0284C7",
    medication: "#16A34A",
    billing: "#D97706",
    default: "#64748B",
  }
  const color = typeColors[type] || typeColors.default
  return (
    <div className="flex gap-3 relative">
      <div className="flex flex-col items-center">
        <div
          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        {!isLast && <div className="w-px flex-1 bg-[#E2E8F0] mt-1" />}
      </div>
      <div className={`pb-4 ${isLast ? "" : ""}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[10.5px] text-[#94A3B8]">{time}</span>
          <span
            className="text-[11px] px-1.5 py-px rounded-sm font-medium"
            style={{ color, backgroundColor: `${color}18` }}
          >
            {type}
          </span>
        </div>
        <div className="text-[12.5px] font-medium text-gray-800">{title}</div>
        {detail && (
          <div className="text-[11.5px] text-[#64748B] mt-0.5">{detail}</div>
        )}
      </div>
    </div>
  )
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  return (
    <div className="flex items-end border-b border-[#DDE2EC] bg-white px-5 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-3 py-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors -mb-px
            ${
              active === tab
                ? "border-[#1B4FD8] text-[#1B4FD8]"
                : "border-transparent text-[#64748B] hover:text-gray-700 hover:border-[#CBD5E1]"
            }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

// ─── Queue Counter ─────────────────────────────────────────────────────────────
export function QueueTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap border-b-2 -mb-px ${
        active
          ? "border-blue-600 text-blue-600 font-bold"
          : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
      }`}
    >
      <span>{label}</span>
      <span
        className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono transition-colors ${
          active
            ? "bg-blue-100 text-blue-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {count}
      </span>
    </button>
  )
}
