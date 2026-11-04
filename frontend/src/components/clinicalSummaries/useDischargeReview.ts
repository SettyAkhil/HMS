import { useCallback, useEffect, useState } from "react"
import type {
  DischargeNarrative,
  DischargeSummaryData,
  SummaryReview,
} from "../../services/dischargeSummaryCompiler"

/**
 * The doctor's review of one summary: edits to the AI-written parts, the
 * checklist of what was checked, and the "reviewed" stamp. Kept per patient,
 * stay and scope in localStorage, so a summary reopened later is still the
 * reviewed one rather than a fresh AI draft.
 *
 * Only the narrative is editable. Recorded facts (results, medicines on a
 * prescription, vitals) are corrected at the desk that recorded them.
 */

export type EditableField = "hospitalCourse" | "followUp" | "conditionAtDischarge" | "advice" | "warningSigns"
export type NarrativeEdits = Partial<Pick<DischargeNarrative, EditableField>>
export type ReviewItem = "course" | "diagnosis" | "medicines" | "advice"

interface StoredReview {
  edits: NarrativeEdits
  checks: Partial<Record<ReviewItem, boolean>>
  reviewed?: SummaryReview
}

const PREFIX = "hospai_discharge_review_v1:"
const EMPTY: StoredReview = { edits: {}, checks: {} }

function load(key: string | null): StoredReview {
  if (!key) return EMPTY
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as StoredReview) } : EMPTY
  } catch {
    return EMPTY
  }
}

export function useDischargeReview(key: string | null) {
  const [state, setState] = useState<StoredReview>(() => load(key))
  useEffect(() => setState(load(key)), [key])

  const update = useCallback(
    (fn: (s: StoredReview) => StoredReview) => {
      setState((prev) => {
        const next = fn(prev)
        try {
          if (key) localStorage.setItem(PREFIX + key, JSON.stringify(next))
        } catch {
          // storage full or blocked -- the review still holds for this visit
        }
        return next
      })
    },
    [key],
  )

  return {
    edits: state.edits,
    checks: state.checks,
    reviewed: state.reviewed ?? null,
    hasEdits: Object.keys(state.edits).length > 0,
    // Any change after sign-off reopens the review: a stamp must cover what is on the page.
    setEdit: (field: EditableField, value: string | string[]) =>
      update((s) => ({ ...s, edits: { ...s.edits, [field]: value }, reviewed: undefined })),
    clearEdits: () => update((s) => ({ ...s, edits: {}, reviewed: undefined })),
    toggleCheck: (item: ReviewItem) =>
      update((s) => ({ ...s, checks: { ...s.checks, [item]: !s.checks[item] }, reviewed: undefined })),
    markReviewed: (by: string) => update((s) => ({ ...s, reviewed: { by, at: new Date().toISOString() } })),
    reopen: () => update((s) => ({ ...s, reviewed: undefined })),
  }
}

/** Which parts of this summary the AI wrote, and so need a doctor's check. */
export function reviewItems(data: DischargeSummaryData, n: DischargeNarrative | null): { key: ReviewItem ;label: string }[] {
  if (!n) return []
  const items: { key: ReviewItem ;label: string }[] = [
    { key: "course", label: n.aiGenerated ? "Hospital course written by AI" : "Hospital course compiled from the record" },
  ]
  if (!data.diagnoses.length && n.diagnoses.length) items.push({ key: "diagnosis", label: "Diagnosis read from the notes" })
  if (!data.dischargeMedications.length && n.dischargeMedications.length) {
    items.push({ key: "medicines", label: "Discharge medicines read from the notes" })
  }
  if (n.advice.length || n.followUp || n.warningSigns.length) items.push({ key: "advice", label: "Advice, follow-up and warning signs" })
  return items
}

/** Advice as shown: the doctor's edited list, else recorded advice then the AI's. */
export function effectiveAdvice(data: DischargeSummaryData, n: DischargeNarrative | null, edits: NarrativeEdits): string[] {
  if (edits.advice) return edits.advice
  const all = [...data.advice.map((a) => a.text), ...(n?.advice || [])]
  return all.filter((a, i) => all.findIndex((x) => x.toLowerCase() === a.toLowerCase()) === i)
}

/**
 * The summary as it should leave the page (print, PDF, copy, send): the
 * narrative with the doctor's edits applied. An edited advice list replaces the
 * recorded one too, since the doctor edited the list as a whole.
 */
export function withEdits(
  data: DischargeSummaryData,
  n: DischargeNarrative | null,
  edits: NarrativeEdits,
): { data: DischargeSummaryData ;narrative: DischargeNarrative | null } {
  if (!n) return { data, narrative: n }
  return {
    data: edits.advice ? { ...data, advice: [] } : data,
    narrative: { ...n, ...edits },
  }
}
