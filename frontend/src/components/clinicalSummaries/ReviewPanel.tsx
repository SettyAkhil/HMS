import React from "react"
import { BadgeCheck, Check, ClipboardCheck, RotateCcw } from "lucide-react"
import { formatDateTimeIST } from "../../lib/format"
import type { SummaryReview } from "../../services/dischargeSummaryCompiler"
import type { ReviewItem } from "./useDischargeReview"

const TARGET: Record<ReviewItem, string> = {
  course: "ds-course",
  diagnosis: "ds-diagnosis",
  medicines: "ds-medicines",
  advice: "ds-advice",
}

/**
 * "Review before signing": one tick per part the AI wrote. The summary can be
 * stamped as reviewed only once every one of them has been checked.
 */
export default function ReviewPanel({
  items,
  checks,
  reviewed,
  hasEdits,
  onToggle,
  onMarkReviewed,
  onReopen,
  onDiscardEdits,
}: {
  items: { key: ReviewItem ;label: string }[]
  checks: Partial<Record<ReviewItem, boolean>>
  reviewed: SummaryReview | null
  hasEdits: boolean
  onToggle: (item: ReviewItem) => void
  onMarkReviewed: () => void
  onReopen: () => void
  onDiscardEdits: () => void
}) {
  if (reviewed) {
    return (
      <div className="no-print shrink-0 mb-3 rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 flex flex-wrap items-center gap-3">
        <BadgeCheck size={18} className="text-[#15803D] shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#14532D]">Reviewed by {reviewed.by}</div>
          <div className="text-[11.5px] text-[#15803D]">{formatDateTimeIST(reviewed.at)} · any further edit reopens the review</div>
        </div>
        <button
          type="button"
          onClick={onReopen}
          className="ml-auto h-8 px-3 rounded-[7px] border border-[#BBF7D0] bg-white text-[12px] font-medium text-[#15803D] hover:bg-[#ECFDF5] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw size={13} /> Reopen review
        </button>
      </div>
    )
  }
  if (!items.length) return null

  const done = items.filter((i) => checks[i.key]).length
  const complete = done === items.length

  return (
    <div className="no-print shrink-0 mb-3 rounded-[12px] border border-[#DDE2EC] bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-[#EEF1F6]">
        <span className="w-8 h-8 rounded-[8px] bg-[#FFFBEB] text-[#B45309] flex items-center justify-center shrink-0">
          <ClipboardCheck size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#0F172A]">Review before signing</div>
          <div className="text-[11.5px] text-[#64748B]">Check each AI-written part. Use Edit on a section to correct it.</div>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden" aria-hidden>
            <div className="h-full bg-[#16A34A] transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <span className="text-[11.5px] font-medium text-[#475569] tabular-nums">
            {done}/{items.length}
          </span>
        </div>
      </div>
      <ul className="px-2 py-1.5">
        {items.map((it) => {
          const on = Boolean(checks[it.key])
          return (
            <li key={it.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] hover:bg-[#F8FAFC]">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(it.key)}
                className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                  on ? "bg-[#16A34A] border-[#16A34A] text-white" : "border-[#CBD5E1] bg-white hover:border-[#16A34A]"
                }`}
              >
                {on && <Check size={12} strokeWidth={3} />}
              </button>
              <button
                type="button"
                onClick={() => onToggle(it.key)}
                className={`text-[12.5px] text-left cursor-pointer ${on ? "text-[#64748B] line-through decoration-[#CBD5E1]" : "text-[#1E293B]"}`}
              >
                {it.label}
              </button>
              <button
                type="button"
                onClick={() => document.getElementById(TARGET[it.key])?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="ml-auto text-[11.5px] font-medium text-[#1B4FD8] hover:underline cursor-pointer"
              >
                View
              </button>
            </li>
          )
        })}
      </ul>
      <div className="px-4 py-2.5 bg-[#FAFBFD] border-t border-[#EEF1F6] flex flex-wrap items-center gap-2">
        {hasEdits && (
          <button type="button" onClick={onDiscardEdits} className="h-8 px-2.5 rounded-[7px] text-[12px] font-medium text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer">
            Discard my edits
          </button>
        )}
        <button
          type="button"
          onClick={onMarkReviewed}
          disabled={!complete}
          title={complete ? "Stamp this summary as reviewed" : "Tick every item first"}
          className="ml-auto h-8 px-3.5 rounded-[7px] bg-[#16A34A] text-white text-[12px] font-semibold hover:bg-[#15803D] inline-flex items-center gap-1.5 cursor-pointer disabled:bg-[#CBD5E1] disabled:cursor-not-allowed"
        >
          <BadgeCheck size={14} /> Mark as reviewed
        </button>
      </div>
    </div>
  )
}
