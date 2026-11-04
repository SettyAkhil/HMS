import React from "react"
import { BedDouble, HeartPulse, Siren } from "lucide-react"
import { formatDate, type PatientStatus, type StayEpisode } from "../../services/dischargeSummaryCompiler"

// Small pieces shared by the discharge-summary screens.

export const STATUS_STYLE: Record<PatientStatus, { pill: string ;avatar: string }> = {
  Admitted: { pill: "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]", avatar: "bg-[#DBEAFE] text-[#1D4ED8]" },
  Discharged: { pill: "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]", avatar: "bg-[#DCFCE7] text-[#15803D]" },
  "ICU discharge": { pill: "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]", avatar: "bg-[#DCFCE7] text-[#15803D]" },
  Emergency: { pill: "bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]", avatar: "bg-[#FFE4E6] text-[#BE123C]" },
  Outpatient: { pill: "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]", avatar: "bg-[#F1F5F9] text-[#475569]" },
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "P"

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function StatusPill({ status }: { status: PatientStatus }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-[1px] rounded-[4px] border text-[10px] font-semibold whitespace-nowrap ${STATUS_STYLE[status].pill}`}>
      {status}
    </span>
  )
}

export function Avatar({ name, status, size = 36 }: { name: string ;status: PatientStatus ;size?: number }) {
  return (
    <span
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${STATUS_STYLE[status].avatar}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  )
}

/** Wraps the part of `text` that matches `query` in a highlight. */
export function Highlight({ text, query }: { text: string ;query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-[#FEF3C7] text-inherit rounded-[2px] px-[1px]">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

export function FlagChip({ flag }: { flag?: string }) {
  if (!flag) return null
  const f = flag.toUpperCase()
  const style = f.startsWith("C")
    ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
    : f === "H"
      ? "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
      : "bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]"
  return <span className={`px-1.5 py-[1px] rounded-[4px] border text-[10.5px] font-semibold whitespace-nowrap ${style}`}>{flagLabel(flag)}</span>
}

export const flagLabel = (flag: string) => {
  const f = flag.toUpperCase()
  return f.startsWith("C") ? "Critical" : f === "H" ? "High" : f === "L" ? "Low" : flag
}

export const episodeIcon = (e: StayEpisode) => (e.kind === "ICU" ? HeartPulse : e.kind === "Emergency" ? Siren : BedDouble)
export const episodeRange = (e: StayEpisode) =>
  `${e.admittedAt ? formatDate(e.admittedAt) : "—"} → ${e.dischargedAt ? formatDate(e.dischargedAt) : "now"}`

/** The signed-in person, for the "reviewed by" stamp. */
export function currentUserName(): string {
  try {
    const raw = localStorage.getItem("hospai_current_user")
    const u = raw ? (JSON.parse(raw) as { name?: string ;user?: string }) : null
    return u?.name || u?.user || "Treating doctor"
  } catch {
    return "Treating doctor"
  }
}
