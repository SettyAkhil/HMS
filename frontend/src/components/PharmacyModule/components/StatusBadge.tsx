const configs: Record<string, {
  bg: string
  color: string
  dot: string
  label?: string
}> = {
  active: { bg: "#DCFCE7", color: "#15803d", dot: "#16A34A" },
  inactive: { bg: "#F5F7FA", color: "#64748B", dot: "#94A3B8" },
  pending: { bg: "#FEF3C7", color: "#b45309", dot: "#f59e0b" },
  processing: { bg: "#E8EDF5", color: "#1742B8", dot: "#1B4FD8" },
  ready: { bg: "#DCFCE7", color: "#15803d", dot: "#16A34A" },
  dispensed: { bg: "#DCFCE7", color: "#166534", dot: "#16a34a" },
  rejected: { bg: "#FEE2E2", color: "#b91c1c", dot: "#ef4444" },
  draft: { bg: "#F5F7FA", color: "#64748B", dot: "#94A3B8" },
  ordered: { bg: "#E8EDF5", color: "#1742B8", dot: "#1B4FD8" },
  partially_received: {
    bg: "#FEF3C7",
    color: "#B45309",
    dot: "#D97706",
    label: "Partial",
  },
  completed: { bg: "#DCFCE7", color: "#15803d", dot: "#16A34A" },
  pending_approval: {
    bg: "#FEF3C7",
    color: "#b45309",
    dot: "#f59e0b",
    label: "Needs Approval",
  },
  in_transit: {
    bg: "#E8EDF5",
    color: "#0369a1",
    dot: "#0ea5e9",
    label: "In Transit",
  },
  received: { bg: "#DCFCE7", color: "#15803d", dot: "#16A34A" },
  requested: { bg: "#faf5ff", color: "#7c3aed", dot: "#a855f7" },
  normal: { bg: "#F5F7FA", color: "#64748B", dot: "#94A3B8" },
  urgent: { bg: "#FEE2E2", color: "#b91c1c", dot: "#ef4444" },
}

interface StatusBadgeProps {
  status?: string | null
  size?: "sm" | "md"
}

export default function StatusBadge({ status = "active", size = "md" }: StatusBadgeProps) {
  const cleanStatus = typeof status === "string" && status.trim() ? status.trim().toLowerCase() : "active"
  const cfg = configs[cleanStatus] ?? {
    bg: "#F5F7FA",
    color: "#64748B",
    dot: "#94A3B8",
  }
  const label =
    cfg.label ??
    (cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1).replace(/_/g, " "))
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded font-medium whitespace-nowrap"
      style={{
        background: cfg.bg,
        color: cfg.color,
        padding: size === "sm" ? "2px 7px" : "3px 9px",
        fontSize: size === "sm" ? 11 : 12,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: cfg.dot }}
      />
      {label}
    </span>
  )
}
