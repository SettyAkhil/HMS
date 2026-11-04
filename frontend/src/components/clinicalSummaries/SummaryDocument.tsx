import React, { useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  Loader2,
  NotebookPen,
  Pencil,
  Pill,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react"
import {
  formatDate,
  type DischargeNarrative,
  type DischargeSummaryData,
  type SummaryReview,
} from "../../services/dischargeSummaryCompiler"
import { formatDateTimeIST } from "../../lib/format"
import { DocumentBrandHeader, PoweredByKalpra, useBranding } from "../branding/DocumentBranding"
import type { EditableField, NarrativeEdits } from "./useDischargeReview"
import { FlagChip, plural, sentenceCase } from "./ui"

export type NarrativeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" ;value: DischargeNarrative }
  | { status: "fallback" ;value: DischargeNarrative ;reason: string }

export type SectionId = "overview" | "diagnosis" | "presentation" | "course" | "treatment" | "results" | "medicines" | "advice" | "notes"

/** The sections this summary has, in page order -- the page's tab bar reads this. */
export function sectionsFor(
  data: DischargeSummaryData,
  n: DischargeNarrative | null,
  advice: string[],
  loading: boolean,
): { id: SectionId ;label: string ;present: boolean ;missingLabel?: string }[] {
  const condition = n?.conditionAtDischarge || data.episode?.condition || data.episode?.dischargeReason
  return [
    { id: "overview", label: "Overview", present: true },
    { id: "diagnosis", label: "Diagnosis", present: true },
    {
      id: "presentation",
      label: "Presentation",
      present: data.complaints.length + data.vitals.length > 0 || Boolean(data.arrival),
      missingLabel: "Complaints and vitals",
    },
    { id: "course", label: "Hospital course", present: true },
    { id: "treatment", label: "Treatment", present: data.procedures.length + data.treatments.length > 0, missingLabel: "Procedures and treatment" },
    { id: "results", label: "Results", present: data.investigations.length > 0, missingLabel: "Investigations" },
    {
      id: "medicines",
      label: "Medicines",
      present: data.dischargeMedications.length + data.stayMedications.length + (n?.dischargeMedications.length || 0) > 0 || loading,
      missingLabel: "Discharge medications",
    },
    {
      id: "advice",
      label: "Advice",
      present: advice.length > 0 || Boolean(n?.followUp) || (n?.warningSigns.length || 0) > 0 || Boolean(condition) || loading,
      missingLabel: "Advice and follow-up",
    },
    { id: "notes", label: "Notes", present: data.notes.length > 0, missingLabel: "Clinical notes" },
  ]
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Section({
  id,
  icon: IconCmp,
  title,
  ai,
  meta,
  action,
  children,
}: {
  /** Anchor for the tab bar; sub-sections inside an anchored block leave it out. */
  id?: SectionId
  icon: React.ComponentType<{ size?: number ;className?: string }>
  title: string
  ai?: boolean
  meta?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id ? `ds-${id}` : undefined} data-section={id} className="scroll-mt-4 lg:scroll-mt-[190px] break-inside-avoid">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 ${ai ? "bg-[#F5F3FF] text-[#6D28D9]" : "bg-[#F1F5F9] text-[#475569]"}`}>
          <IconCmp size={15} />
        </span>
        <h3 className="text-[14px] font-semibold text-[#0F172A] tracking-[-0.01em]">{title}</h3>
        {meta && <div className="text-[11px] text-[#64748B]">{meta}</div>}
        {action && <div className="ml-auto no-print">{action}</div>}
      </div>
      <div className="sm:pl-[38px]">{children}</div>
    </section>
  )
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] text-[#94A3B8]">{children}</p>

function EditButton({ onClick, disabled }: { onClick: () => void ;disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 px-2 rounded-[6px] text-[11.5px] font-medium text-[#475569] hover:bg-[#F1F5F9] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Pencil size={12} /> Edit
    </button>
  )
}

/** In-place editor for one narrative field; a list is edited one point per line. */
function Editor({
  initial,
  list,
  onSave,
  onCancel,
}: {
  initial: string | string[]
  list?: boolean
  onSave: (v: string | string[]) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(Array.isArray(initial) ? initial.join("\n") : initial)
  const save = () => onSave(list ? draft.split("\n").map((l) => l.trim()).filter(Boolean) : draft.trim())
  return (
    <div className="no-print rounded-[10px] border border-[#BFDBFE] bg-[#F8FBFF] p-3">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save()
          if (e.key === "Escape") onCancel()
        }}
        rows={list ? Math.max(4, draft.split("\n").length + 1) : 7}
        className="w-full resize-y rounded-[8px] border border-[#DDE2EC] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] focus:ring-[3px] focus:ring-[#1B4FD8]/10"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} className="h-8 px-3 rounded-[7px] bg-[#1B4FD8] text-white text-[12px] font-medium hover:bg-[#1740B4] cursor-pointer">
          Save
        </button>
        <button type="button" onClick={onCancel} className="h-8 px-3 rounded-[7px] border border-[#DDE2EC] bg-white text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] cursor-pointer">
          Cancel
        </button>
        <span className="text-[11px] text-[#94A3B8]">{list ? "One point per line · " : ""}Ctrl+Enter to save, Esc to cancel</span>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string ;value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-medium text-[#64748B] uppercase tracking-[0.07em]">{label}</div>
      <div className="text-[13px] font-medium text-[#0F172A] mt-0.5 break-words">{value}</div>
    </div>
  )
}

const TH = "text-left font-medium px-3 py-2"

const COURSE_LABELS = ["Presentation", "Findings", "Assessment", "Treatment", "Progress", "Outcome"]

/** The hospital course as labelled paragraphs ("Presentation: …"), plain text otherwise. */
function CourseText({ text }: { text: string }) {
  const label = new RegExp(`(?:^|\\n|\\s)(?=(?:${COURSE_LABELS.join("|")}):)`, "g")
  const parts = text
    .split(label)
    .map((p) => p.trim())
    .filter(Boolean)
  return (
    <div className="space-y-3">
      {parts.map((p, i) => {
        const m = p.match(new RegExp(`^(${COURSE_LABELS.join("|")}):\\s*([\\s\\S]*)$`))
        return m ? (
          <div key={i}>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6D28D9] mb-0.5">{m[1]}</div>
            <p className="text-[13.5px] leading-[1.75] text-[#1E293B] whitespace-pre-line">{m[2]}</p>
          </div>
        ) : (
          <p key={i} className="text-[13.5px] leading-[1.75] text-[#1E293B] whitespace-pre-line">{p}</p>
        )
      })}
    </div>
  )
}

const VITAL_COLUMNS = ["BP", "Pulse", "Resp. rate", "SpO₂", "Temp", "GCS", "Pain", "Weight"]

/** Every recorded reading, one row each; only the measures someone recorded get a column. */
function VitalsTable({ vitals }: { vitals: DischargeSummaryData["vitals"] }) {
  const cols = VITAL_COLUMNS.filter((c) => vitals.some((v) => v.values.some(([k]) => k === c)))
  return (
    <div className="rounded-[10px] border border-[#EEF1F6] overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[#F8FAFC] text-[#64748B] text-[10.5px] uppercase tracking-[0.06em]">
            <th className="text-left font-medium px-3 py-2">When</th>
            {cols.map((c) => (
              <th key={c} className="text-left font-medium px-3 py-2 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vitals.map((v, i) => (
            <tr key={`${v.at}-${i}`} className="border-t border-[#F1F5F9]">
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="text-[#0F172A]">{formatDateTimeIST(v.at)}</div>
                <div className="text-[10.5px] text-[#94A3B8]">{v.label}</div>
              </td>
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 text-[#1E293B] whitespace-nowrap">
                  {v.values.find(([k]) => k === c)?.[1] || <span className="text-[#CBD5E1]">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Document ─────────────────────────────────────────────────────────────────

export default function SummaryDocument({
  data,
  narrative,
  n,
  advice,
  edits,
  review,
  emrLoading,
  onEdit,
  onRegenerate,
}: {
  data: DischargeSummaryData
  narrative: NarrativeState
  /** The narrative with the doctor's edits applied. */
  n: DischargeNarrative | null
  advice: string[]
  edits: NarrativeEdits
  review: SummaryReview | null
  emrLoading: boolean
  onEdit: (field: EditableField, value: string | string[]) => void
  onRegenerate: () => void
}) {
  const [editing, setEditing] = useState<EditableField | null>(null)
  const [showAllNotes, setShowAllNotes] = useState(false)
  const ep = data.episode
  const p = data.patient
  const loading = narrative.status === "loading" || narrative.status === "idle"
  const branding = useBranding()
  const generatedAt = useMemo(() => new Date().toISOString(), [data])
  const status = !ep ? "No admission on record" : ep.dischargedAt ? "Discharged" : "Currently admitted"
  const condition = n?.conditionAtDischarge || ep?.condition || ep?.dischargeReason || ""
  const sections = sectionsFor(data, n, advice, loading)
  const has = (id: SectionId) => sections.find((s) => s.id === id)?.present
  const missing = sections.filter((s) => !s.present && s.missingLabel).map((s) => s.missingLabel!)
  const flagged = data.investigations.filter((i) => i.flag && i.result)
  const NOTE_LIMIT = 3

  const save = (field: EditableField) => (v: string | string[]) => {
    onEdit(field, v)
    setEditing(null)
  }
  const edit = (field: EditableField) => <EditButton onClick={() => setEditing(field)} disabled={loading} />

  // Banner: what is recorded up front, what is not in one quiet line.
  const fields: [string, string | null | undefined][] = [
    ["UMR / patient ID", p.ids.slice(0, 2).join(" · ")],
    ["Age / sex", p.age != null || p.gender ? `${p.age ?? "—"} yrs / ${p.gender || "—"}` : null],
    ["Blood group", p.bloodGroup],
    ["Phone", p.phone],
    ["Admitted", ep?.admittedAt ? formatDateTimeIST(ep.admittedAt) : null],
    ["Discharged", ep ? (ep.dischargedAt ? formatDateTimeIST(ep.dischargedAt) : "Still admitted") : null],
    ["Ward / bed", ep ? [ep.ward, ep.bed].filter(Boolean).join(" · ") : null],
    ["Length of stay", ep?.lengthOfStayDays ? plural(ep.lengthOfStayDays, "day") : null],
    ["Consultant", ep?.attendingDoctor],
    ["Discharge type", ep?.dischargeType],
    ["Address", p.address],
    ["Emergency contact", p.emergencyContact],
  ]
  const recorded = fields.filter(([, v]) => v)
  const unrecorded = fields.filter(([, v]) => !v).map(([k]) => k.toLowerCase())

  return (
    <article
      id="printable-discharge-summary"
      className="ds-fade-in printable-area shrink-0 bg-white border border-[#DDE2EC] rounded-[14px] shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden print:border-0 print:shadow-none print:rounded-none"
    >
      {/* Letterhead -- a div, not <header>: the app's print stylesheet hides every header. */}
      <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-[#EEF1F6]">
        <DocumentBrandHeader
          branding={branding}
          title="Discharge summary"
          meta={`${ep ? `Ref ${ep.id}` : "Patient history"} · ${formatDateTimeIST(generatedAt)}`}
        />
      </div>

      {/* Patient banner */}
      <div id="ds-overview" data-section="overview" className="scroll-mt-4 lg:scroll-mt-[190px] px-6 sm:px-8 py-5 bg-gradient-to-b from-[#F8FAFF] to-white border-b border-[#EEF1F6]">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[21px] font-bold text-[#0F172A] tracking-[-0.02em] mr-1">{p.name}</h2>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              status === "Discharged"
                ? "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]"
                : status === "Currently admitted"
                  ? "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]"
                  : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]"
            }`}
          >
            {status}
          </span>
          {review ? (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0] inline-flex items-center gap-1">
              <BadgeCheck size={12} /> Reviewed by {review.by} · {formatDate(review.at)}
            </span>
          ) : n ? (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium border bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]">
              Draft · awaiting doctor’s review
            </span>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3.5">
          {recorded.map(([k, v]) => (
            <Field key={k} label={k} value={v} />
          ))}
          {p.allergies && <Field label="Allergies" value={<span className="text-[#B91C1C]">{p.allergies}</span>} />}
        </div>
        {unrecorded.length > 0 && (
          <p className="mt-3.5 text-[11.5px] text-[#94A3B8]">Not recorded: {unrecorded.join(", ")}.</p>
        )}
        {data.scope === "history" && <p className="mt-2 text-[11.5px] text-[#64748B]">Showing the patient’s complete history, not a single stay.</p>}
        {emrLoading && (
          <p className="mt-2 text-[11.5px] text-[#64748B] inline-flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Reading the hospital EMR…
          </p>
        )}
      </div>

      <div className="px-6 sm:px-8 py-7 space-y-8">
        {/* Diagnosis + key findings */}
        <Section id="diagnosis" icon={Stethoscope} title="Diagnosis" ai={!data.diagnoses.length && Boolean(n?.diagnoses.length)}>
          {data.diagnoses.length > 0 ? (
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[16px] font-semibold text-[#0F172A]">{data.diagnoses[0].text}</span>
                {data.diagnoses[0].code && (
                  <span className="text-[11px] font-mono text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] px-1.5 rounded-[4px]">{data.diagnoses[0].code}</span>
                )}
                <span className="text-[11px] text-[#94A3B8]">Primary</span>
              </div>
              {data.diagnoses.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.diagnoses.slice(1).map((d) => (
                    <span key={d.text} className="text-[12px] text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded-[6px]">
                      {d.text}
                      {d.code && <span className="ml-1 font-mono text-[10.5px] text-[#64748B]">{d.code}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : n && n.diagnoses.length > 0 ? (
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[16px] font-semibold text-[#0F172A]">{n.diagnoses[0]}</span>
                <span className="text-[10.5px] font-medium text-[#6D28D9] bg-[#F5F3FF] border border-[#DDD6FE] px-1.5 rounded-[4px]">Read from the notes by AI · confirm</span>
              </div>
              {n.diagnoses.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {n.diagnoses.slice(1).map((d) => (
                    <span key={d} className="text-[12px] text-[#334155] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded-[6px]">{d}</span>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <Muted>Looking for a stated diagnosis in the notes…</Muted>
          ) : (
            <Muted>No diagnosis recorded for this stay.</Muted>
          )}
          {flagged.length > 0 && (
            <div className="mt-4 rounded-[10px] border border-[#FDE8E8] bg-[#FFFAFA] px-3.5 py-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B91C1C] mb-2">Key findings</div>
              <div className="flex flex-wrap gap-1.5">
                {flagged.slice(0, 6).map((f, i) => (
                  <span key={`${f.test}-${i}`} className="text-[12px] bg-white border border-[#F1E3E3] rounded-[6px] px-2 py-1 inline-flex items-center gap-1.5">
                    <span className="text-[#475569]">{f.test}</span>
                    <span className="font-semibold text-[#0F172A]">{f.result}</span>
                    <FlagChip flag={f.flag} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Presentation: arrival, complaints, every vitals reading */}
        {has("presentation") && (
          <Section id="presentation" icon={ClipboardList} title="Presentation">
            <div className="space-y-5">
              {data.arrival && (
                <div className="rounded-[10px] border border-[#EEF1F6] bg-[#FAFBFD] px-3.5 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2.5">
                  {(
                    [
                      ["Arrived", data.arrival.at ? formatDateTimeIST(data.arrival.at) : null],
                      ["Mode of arrival", data.arrival.mode],
                      ["Brought by", data.arrival.broughtBy],
                      ["Condition on arrival", data.arrival.condition],
                      ["Consciousness", data.arrival.consciousness],
                      ["Triage", [data.arrival.triage, data.arrival.triageReason].filter(Boolean).join(" — ") || null],
                    ] as [string, string | null][]
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className={`min-w-0 ${k === "Triage" ? "col-span-2 sm:col-span-3" : ""}`}>
                        <div className="text-[10.5px] font-medium text-[#64748B] uppercase tracking-[0.06em]">{k}</div>
                        <div className="text-[12.5px] text-[#0F172A] mt-0.5">{v}</div>
                      </div>
                    ))}
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold text-[#64748B] mb-2">Presenting complaints</div>
                {data.complaints.length === 0 ? (
                  <Muted>Not recorded.</Muted>
                ) : (
                  <ul className="space-y-1.5">
                    {data.complaints.map((c, i) => (
                      <li key={`${c.text}-${i}`} className="flex gap-2 text-[13px] text-[#334155]">
                        <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#94A3B8] shrink-0" />
                        <span>
                          <span className="font-medium text-[#0F172A]">{c.text}</span>
                          {c.detail && <span className="text-[#64748B]"> — {c.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-[#64748B] mb-2 flex items-center gap-1.5">
                  <Activity size={12} /> Vitals {data.vitals.length > 1 && <span className="font-normal text-[#94A3B8]">· {plural(data.vitals.length, "reading")}, oldest first</span>}
                </div>
                {data.vitals.length === 0 ? <Muted>Not recorded.</Muted> : <VitalsTable vitals={data.vitals} />}
              </div>
            </div>
          </Section>
        )}

        {/* Hospital course */}
        <Section
          id="course"
          icon={Sparkles}
          title="Hospital course"
          ai
          meta={
            edits.hospitalCourse ? (
              <span className="text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] px-2 py-0.5 rounded-full font-medium no-print">Edited by doctor</span>
            ) : narrative.status === "ready" ? (
              <span className="text-[#6D28D9] bg-[#F5F3FF] border border-[#DDD6FE] px-2 py-0.5 rounded-full font-medium no-print">Clinical Summary Draft</span>
            ) : narrative.status === "fallback" ? (
              <span className="text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full font-medium no-print" title={narrative.reason}>
                From the record
              </span>
            ) : null
          }
          action={!loading && editing !== "hospitalCourse" ? edit("hospitalCourse") : undefined}
        >
          {loading ? (
            <div className="rounded-[12px] border border-[#EDE9FE] bg-[#FBFAFF] p-4">
              <div className="flex items-center gap-2 text-[12px] text-[#6D28D9] font-medium">
                <Loader2 size={13} className="animate-spin" /> Writing the hospital course from {plural(data.sources.length, "record")}…
              </div>
              <div className="mt-3 space-y-2 animate-pulse">
                <div className="h-2.5 rounded bg-[#EDE9FE] w-[96%]" />
                <div className="h-2.5 rounded bg-[#EDE9FE] w-[88%]" />
                <div className="h-2.5 rounded bg-[#EDE9FE] w-[92%]" />
                <div className="h-2.5 rounded bg-[#EDE9FE] w-[58%]" />
              </div>
            </div>
          ) : editing === "hospitalCourse" ? (
            <Editor initial={n?.hospitalCourse || ""} onSave={save("hospitalCourse")} onCancel={() => setEditing(null)} />
          ) : (
            <div className="rounded-[12px] border border-[#EDE9FE] bg-gradient-to-br from-[#FBFAFF] to-white p-4">
              <CourseText text={n?.hospitalCourse || ""} />
              {narrative.status === "fallback" && (
                <button type="button" onClick={onRegenerate} className="no-print mt-3 text-[11.5px] font-medium text-[#6D28D9] hover:underline inline-flex items-center gap-1 cursor-pointer">
                  <RefreshCw size={11} /> Try the AI again
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Procedures & treatment */}
        {has("treatment") && (
          <Section id="treatment" icon={Scissors} title="Procedures and treatment" meta={plural(data.procedures.length + data.treatments.length, "entry", "entries")}>
            <ol className="relative border-l border-[#E2E8F0] ml-1 space-y-3.5">
              {[
                ...data.procedures.map((x) => ({ date: x.date, title: x.name, sub: [x.by, x.notes].filter(Boolean).join(" · "), strong: true })),
                ...data.treatments.map((x) => ({ date: x.date, title: x.kind, sub: [x.text !== x.kind ? x.text : "", x.author].filter(Boolean).join(" · "), strong: false })),
              ]
                .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
                .map((x, i) => (
                  <li key={i} className="pl-4 relative">
                    <span className={`absolute -left-[5px] top-[6px] w-2.5 h-2.5 rounded-full border-2 border-white ${x.strong ? "bg-[#1B4FD8]" : "bg-[#94A3B8]"}`} />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`text-[13px] ${x.strong ? "font-semibold text-[#0F172A]" : "font-medium text-[#1E293B]"}`}>{x.title}</span>
                      {x.date && <span className="text-[11px] text-[#94A3B8]">{formatDateTimeIST(x.date)}</span>}
                    </div>
                    {x.sub && <div className="text-[12px] text-[#64748B] mt-0.5">{x.sub}</div>}
                  </li>
                ))}
            </ol>
          </Section>
        )}

        {/* Investigations */}
        {has("results") && (
          <Section id="results" icon={FlaskConical} title="Investigations" meta={plural(data.investigations.length, "result")}>
            <div className="rounded-[10px] border border-[#EEF1F6] overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[#F8FAFC] text-[#64748B] text-[10.5px] uppercase tracking-[0.06em]">
                    <th className={TH}>Test</th>
                    <th className={TH}>Result</th>
                    <th className={TH}>Reference</th>
                    <th className={TH}>Flag</th>
                    <th className="text-right font-medium px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.investigations.map((iv, i) => (
                    <tr key={`${iv.test}-${i}`} className={`border-t border-[#F1F5F9] ${iv.flag ? "bg-[#FFFCFC]" : ""}`}>
                      <td className="px-3 py-2.5 font-medium text-[#0F172A]">{iv.test}</td>
                      <td className={`px-3 py-2.5 ${iv.flag ? "font-semibold text-[#0F172A]" : "text-[#334155]"}`}>
                        {iv.result || <span className="text-[11px] text-[#64748B] bg-[#F1F5F9] px-1.5 py-[1px] rounded-[4px]">{iv.status}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[#64748B]">{iv.range || "—"}</td>
                      <td className="px-3 py-2.5">{iv.flag ? <FlagChip flag={iv.flag} /> : <span className="text-[#CBD5E1]">—</span>}</td>
                      <td className="px-3 py-2.5 text-right text-[#94A3B8] whitespace-nowrap">{iv.date ? formatDate(iv.date) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Discharge medications */}
        {has("medicines") && (
          <Section
            id="medicines"
            icon={Pill}
            title="Discharge medications"
            ai={!data.dischargeMedications.length && Boolean(n?.dischargeMedications.length)}
            meta={data.dischargeMedications.length ? plural(data.dischargeMedications.length, "medicine") : undefined}
          >
            {data.dischargeMedications.length > 0 || (n && n.dischargeMedications.length > 0) ? (
              <>
                {!data.dischargeMedications.length && (
                  <div className="mb-2 text-[11px] font-medium text-[#6D28D9] bg-[#F5F3FF] border border-[#DDD6FE] px-2 py-1 rounded-[6px] inline-flex items-center gap-1.5">
                    <Sparkles size={11} /> No prescription on record · read from the notes by AI · confirm before dispensing
                  </div>
                )}
                <div className={`rounded-[10px] border overflow-x-auto ${data.dischargeMedications.length ? "border-[#EEF1F6]" : "border-[#EDE9FE]"}`}>
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F8FAFC] text-[#64748B] text-[10.5px] uppercase tracking-[0.06em]">
                        <th className={`${TH} w-8`}>#</th>
                        <th className={TH}>Medicine</th>
                        <th className={TH}>Dose</th>
                        <th className={TH}>Frequency</th>
                        <th className={TH}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.dischargeMedications.length
                        ? data.dischargeMedications
                        : (n?.dischargeMedications || []).map((m) => ({ ...m, instructions: "" }))
                      ).map((m, i) => (
                        <tr key={`${m.medicine}-${i}`} className="border-t border-[#F1F5F9] align-top">
                          <td className="px-3 py-2.5 text-[#94A3B8]">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-[#0F172A]">{m.medicine}</div>
                            {m.instructions && <div className="text-[11.5px] text-[#64748B]">{m.instructions}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-[#334155]">{m.dose || "—"}</td>
                          <td className="px-3 py-2.5">
                            {m.frequency ? (
                              <span className="font-mono text-[11.5px] bg-[#EFF6FF] text-[#1D4ED8] border border-[#DBEAFE] px-1.5 py-[1px] rounded-[4px]">{m.frequency}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[#334155]">{m.duration || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : loading ? (
              <Muted>Checking the notes for discharge medicines…</Muted>
            ) : (
              <Muted>No discharge medications recorded.</Muted>
            )}
            {data.stayMedications.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-medium text-[#64748B] mb-1.5">Also given during the stay</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.stayMedications.map((m) => (
                    <span key={m.medicine} className="text-[11.5px] text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded-[6px]">
                      {m.medicine}
                      {m.dose && <span className="text-[#94A3B8]"> {m.dose}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Advice, follow-up, warning signs, condition */}
        {has("advice") && (
          <div id="ds-advice" data-section="advice" className="scroll-mt-4 lg:scroll-mt-[190px] space-y-6">
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
              <Section
                icon={ShieldCheck}
                title="Advice on discharge"
                ai={!edits.advice && Boolean(n?.advice.length)}
                action={!loading && editing !== "advice" ? edit("advice") : undefined}
              >
                {editing === "advice" ? (
                  <Editor initial={advice} list onSave={save("advice")} onCancel={() => setEditing(null)} />
                ) : advice.length === 0 ? (
                  <Muted>{loading ? "Drafting advice…" : "No advice recorded."}</Muted>
                ) : (
                  <ul className="space-y-1.5">
                    {advice.map((a, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-[#334155]">
                        <CheckCircle2 size={14} className="text-[#16A34A] mt-[3px] shrink-0" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <div className="space-y-5">
                <Section
                  icon={CalendarClock}
                  title="Follow-up"
                  ai={!edits.followUp && Boolean(n?.followUp)}
                  action={!loading && editing !== "followUp" ? edit("followUp") : undefined}
                >
                  {editing === "followUp" ? (
                    <Editor initial={n?.followUp || ""} onSave={save("followUp")} onCancel={() => setEditing(null)} />
                  ) : n?.followUp ? (
                    <p className="text-[13px] text-[#334155] leading-relaxed">{n.followUp}</p>
                  ) : (
                    <Muted>{loading ? "Drafting…" : "No follow-up recorded."}</Muted>
                  )}
                </Section>

                {editing === "warningSigns" ? (
                  <Editor initial={n?.warningSigns || []} list onSave={save("warningSigns")} onCancel={() => setEditing(null)} />
                ) : n && n.warningSigns.length > 0 ? (
                  <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] p-3.5 break-inside-avoid">
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#B91C1C]">
                      <AlertTriangle size={14} /> Return to hospital immediately if
                      <span className="ml-auto no-print">
                        <EditButton onClick={() => setEditing("warningSigns")} />
                      </span>
                    </div>
                    <ul className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                      {n.warningSigns.map((w, i) => (
                        <li key={i} className="text-[12.5px] text-[#7F1D1D] flex gap-2">
                          <span className="mt-[7px] w-1 h-1 rounded-full bg-[#DC2626] shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            {(condition || editing === "conditionAtDischarge") &&
              (editing === "conditionAtDischarge" ? (
                <Editor initial={condition} onSave={save("conditionAtDischarge")} onCancel={() => setEditing(null)} />
              ) : (
                <div className="rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 flex gap-3 break-inside-avoid">
                  <HeartPulse size={16} className="text-[#15803D] mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#15803D]">Condition at discharge</div>
                    <div className="text-[13px] text-[#14532D] mt-0.5">{condition}</div>
                  </div>
                  <span className="no-print">
                    <EditButton onClick={() => setEditing("conditionAtDischarge")} disabled={loading} />
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Clinical notes */}
        {has("notes") && (
          <Section id="notes" icon={NotebookPen} title="Clinical notes" meta={plural(data.notes.length, "note")}>
            <div className="space-y-2">
              {data.notes.map((note, i) => (
                <div
                  key={`${note.source}-${i}`}
                  className={`rounded-[10px] border border-[#EEF1F6] p-3 ${i >= NOTE_LIMIT && !showAllNotes ? "hidden print:block" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-semibold text-[#334155] bg-[#F1F5F9] px-1.5 py-[1px] rounded-[4px]">{sentenceCase(note.kind)}</span>
                    {note.author && <span className="text-[#64748B]">{note.author}</span>}
                    {note.date && <span className="ml-auto text-[#94A3B8]">{formatDateTimeIST(note.date)}</span>}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#334155] whitespace-pre-line">{note.text}</p>
                </div>
              ))}
            </div>
            {data.notes.length > NOTE_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllNotes((v) => !v)}
                className="no-print mt-2 text-[12px] font-medium text-[#1B4FD8] hover:underline cursor-pointer"
              >
                {showAllNotes ? "Show fewer notes" : `Show all ${data.notes.length} notes`}
              </button>
            )}
          </Section>
        )}



        {/* Signatures */}
        <div className="pt-4 grid grid-cols-3 gap-6 break-inside-avoid">
          {[
            ["Treating consultant", review?.by || ep?.attendingDoctor || ""],
            ["Medical officer", ""],
            ["Date & time", review ? formatDateTimeIST(review.at) : ""],
          ].map(([label, name]) => (
            <div key={label}>
              <div className="h-9 border-b border-dashed border-[#CBD5E1] flex items-end pb-1 text-[12.5px] font-medium text-[#0F172A]">{name}</div>
              <div className="mt-1 text-[11px] text-[#64748B]">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 sm:px-8 py-4 bg-[#FAFBFD] border-t border-[#EEF1F6] space-y-2.5">
        {data.nameOnlyLinks && (
          <div className="no-print flex gap-2 text-[11.5px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-[1px]" />
            Some records were matched to this patient by name, not by a shared ID. Confirm they belong to {p.name} before signing.
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-[#64748B]">
          {review
            ? `Compiled from the hospital clinical record and reviewed by ${review.by} on ${formatDateTimeIST(review.at)}.`
            : "Compiled from the hospital clinical record."}{" "}
          Continue medicines only as advised by the treating doctor.
        </p>
        <div className="pt-2.5 border-t border-[#EEF1F6] flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10.5px] text-[#94A3B8]">Confidential Patient Clinical Record · {branding.hospitalName}</span>
          <PoweredByKalpra branding={branding} />
        </div>
      </footer>
    </article>
  )
}
