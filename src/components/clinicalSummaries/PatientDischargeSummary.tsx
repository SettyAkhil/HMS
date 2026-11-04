import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileText,
  History,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import {
  compileDischargeSummary,
  fetchBackendEmr,
  generateDischargeNarrative,
  mergeBackendHits,
  recordBasedNarrative,
  searchBackendPatients,
  searchSummaryPatients,
  summaryAsText,
  type BackendEmr,
  type DischargeSummaryData,
  type SummaryPatientHit,
} from "../../services/dischargeSummaryCompiler"
import { buildCompiledDischargeSummaryDocument } from "../../lib/patientDocuments"
import { downloadPatientDocument } from "../../lib/patientDocumentPdf"
import { SendToPatientButton } from "../messaging/SendToPatientDialog"
import PatientSearchPanel from "./PatientSearchPanel"
import ReviewPanel from "./ReviewPanel"
import SummaryDocument, { sectionsFor, type NarrativeState, type SectionId } from "./SummaryDocument"
import { effectiveAdvice, reviewItems, useDischargeReview, withEdits } from "./useDischargeReview"
import { Avatar, StatusPill, currentUserName, episodeIcon, episodeRange } from "./ui"

export default function PatientDischargeSummary() {
  const [query, setQuery] = useState("")
  const [version, setVersion] = useState(0)
  const [backendHits, setBackendHits] = useState<SummaryPatientHit[]>([])
  const [searchingBackend, setSearchingBackend] = useState(false)
  const [selected, setSelected] = useState<SummaryPatientHit | null>(null)
  const [episodeId, setEpisodeId] = useState<string | undefined>()
  const [scope, setScope] = useState<"stay" | "history" | undefined>()
  const [emr, setEmr] = useState<BackendEmr | null>(null)
  const [emrLoading, setEmrLoading] = useState(false)
  const [narrative, setNarrative] = useState<NarrativeState>({ status: "idle" })
  const [regenTick, setRegenTick] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionId>("overview")
  const forceRef = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Other desks write to the same stores -- recompute when they do.
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    window.addEventListener("storage", bump)
    return () => window.removeEventListener("storage", bump)
  }, [])

  // "/" jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t?.closest("input, textarea, select, [contenteditable='true']")) return
      e.preventDefault()
      setSelected((s) => (window.innerWidth < 1024 ? null : s))
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(t)
  }, [toast])

  // Local stores answer instantly; the backend EMR joins in after a pause.
  const localHits = useMemo(() => searchSummaryPatients(query), [query, version])
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setBackendHits([])
      setSearchingBackend(false)
      return
    }
    setSearchingBackend(true)
    let cancelled = false
    const t = window.setTimeout(async () => {
      const hits = await searchBackendPatients(q)
      if (!cancelled) {
        setBackendHits(hits)
        setSearchingBackend(false)
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query])
  const hits = useMemo(() => mergeBackendHits(localHits, backendHits), [localHits, backendHits])

  const choose = (hit: SummaryPatientHit) => {
    setSelected(hit)
    setEpisodeId(undefined)
    setScope(undefined)
    setEmr(null)
    setActiveSection("overview")
    // Set now, not in the effect: otherwise the first render starts a model
    // call without the EMR, only to cancel it a moment later.
    setEmrLoading(Boolean(hit.backendId))
    setNarrative({ status: "idle" })
    document.getElementById("ds-scroll")?.scrollTo({ top: 0 })
  }

  // The backend EMR, for patients the backend actually returned.
  useEffect(() => {
    if (!selected?.backendId) {
      setEmrLoading(false)
      return
    }
    let cancelled = false
    setEmrLoading(true)
    fetchBackendEmr(selected.backendId).then((e) => {
      if (cancelled) return
      setEmr(e)
      setEmrLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selected?.key, selected?.backendId])

  const data: DischargeSummaryData | null = useMemo(
    () => (selected ? compileDischargeSummary(selected.key, { episodeId, scope, emr }) : null),
    [selected, episodeId, scope, emr, version],
  )

  // One model call per patient / stay / scope -- never a burst.
  const narrativeKey = data && !emrLoading
    ? `${selected?.key}|${data.episode?.id ?? "-"}|${data.scope}|${emr?.patient.patient_id ?? "-"}|${regenTick}`
    : ""
  useEffect(() => {
    if (!narrativeKey || !data) return
    const controller = new AbortController()
    setNarrative({ status: "loading" })
    const force = forceRef.current
    forceRef.current = false
    generateDischargeNarrative(data, { force, signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setNarrative({ status: "ready", value })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setNarrative({
          status: "fallback",
          value: recordBasedNarrative(data),
          reason: err instanceof Error ? err.message : "AI service unavailable",
        })
      })
    return () => controller.abort()
    // data is derived from the same inputs narrativeKey encodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrativeKey])

  const narrativeValue = narrative.status === "ready" || narrative.status === "fallback" ? narrative.value : null
  const loading = narrative.status === "loading" || narrative.status === "idle"

  // The doctor's review of this exact stay.
  const reviewKey = data && selected ? `${selected.key}|${data.episode?.id ?? "-"}|${data.scope}` : null
  const review = useDischargeReview(reviewKey)
  const out = data ? withEdits(data, narrativeValue, review.edits) : null
  const advice = data ? effectiveAdvice(data, narrativeValue, review.edits) : []
  const items = data ? reviewItems(data, narrativeValue) : []
  const tabs = data ? sectionsFor(data, out?.narrative ?? null, advice, loading).filter((s) => s.present) : []

  // Highlight the tab of the section in view.
  useEffect(() => {
    if (!data) return
    const els = [...document.querySelectorAll<HTMLElement>("#printable-discharge-summary [data-section]")]
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveSection(top.target.getAttribute("data-section") as SectionId)
      },
      { rootMargin: "-200px 0px -55% 0px" },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [data, narrative.status])

  const regenerate = () => {
    forceRef.current = true
    setRegenTick((t) => t + 1)
  }

  const copy = async () => {
    if (!out) return
    try {
      await navigator.clipboard.writeText(summaryAsText(out.data, out.narrative, review.reviewed))
      setToast("Summary copied to the clipboard")
    } catch {
      setToast("This browser blocked copying")
    }
  }

  const downloadPdf = async () => {
    if (!out) return
    setPdfBusy(true)
    try {
      downloadPatientDocument(await buildCompiledDischargeSummaryDocument(out.data, out.narrative, review.reviewed))
    } catch {
      setToast("Could not build the PDF")
    } finally {
      setPdfBusy(false)
    }
  }

  const iconBtn =
    "h-9 w-9 rounded-[8px] border border-[#DDE2EC] bg-white text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] inline-flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
  const chip = (on: boolean) =>
    `h-8 px-3 rounded-full border text-[12px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
      on ? "bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]" : "bg-white border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A]"
    }`

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-3 sm:p-4 lg:p-5 print:p-0 overflow-y-auto lg:overflow-hidden">
      <PatientSearchPanel
        query={query}
        onQuery={setQuery}
        hits={hits}
        selectedKey={selected?.key ?? null}
        onChoose={choose}
        searchingBackend={searchingBackend}
        inputRef={searchRef}
        className={selected ? "hidden lg:flex" : "flex flex-1 lg:flex-none"}
      />

      <section id="ds-scroll" className={`flex-1 min-w-0 min-h-0 flex-col lg:overflow-y-auto ${selected ? "flex" : "hidden lg:flex"}`}>
        {!selected || !data || !out ? (
          <EmptyState onSearch={() => searchRef.current?.focus()} />
        ) : (
          <>
            {/* Sticky case header: who, which stay, actions, sections */}
            {/* Sticky on desktop only: on a phone it would cover half the screen. */}
            <div className="no-print lg:sticky top-0 z-20 shrink-0 bg-[#F0F2F5] pb-3">
              <div className="bg-white border border-[#DDE2EC] rounded-[12px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="px-3 sm:px-4 pt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="lg:hidden h-9 w-9 -ml-1 rounded-[8px] text-[#475569] hover:bg-[#F1F5F9] inline-flex items-center justify-center cursor-pointer"
                    aria-label="Back to patients"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <Avatar name={data.patient.name} status={selected.status} size={40} />
                  <div className="min-w-[150px] flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15.5px] font-semibold text-[#0F172A] truncate">{data.patient.name}</span>
                      <StatusPill status={selected.status} />
                      {review.reviewed && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-1.5 py-[1px] rounded-[4px]">
                          <CheckCircle2 size={11} /> Reviewed
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[#64748B] truncate">
                      {[data.patient.ids[0], data.patient.age != null ? `${data.patient.age} yrs` : "", data.patient.gender || "", data.episode?.ward || ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto justify-end">
                    <button
                      type="button"
                      className={iconBtn}
                      onClick={regenerate}
                      disabled={loading || review.hasEdits}
                      title={review.hasEdits ? "Discard your edits before regenerating" : "Write the narrative again"}
                      aria-label="Regenerate AI narrative"
                    >
                      <RefreshCw size={15} className={narrative.status === "loading" ? "animate-spin" : ""} />
                    </button>
                    <button type="button" className={iconBtn} onClick={copy} title="Copy as text" aria-label="Copy as text">
                      <Copy size={15} />
                    </button>
                    <button type="button" className={iconBtn} onClick={() => window.print()} title="Print" aria-label="Print">
                      <Printer size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={downloadPdf}
                      disabled={pdfBusy}
                      className="h-9 px-3 rounded-[8px] border border-[#DDE2EC] bg-white text-[12.5px] font-medium text-[#334155] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {pdfBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                    </button>
                    <SendToPatientButton
                      label="Send"
                      patient={{ name: data.patient.name, phone: data.patient.phone || "", id: data.patient.ids[0] }}
                      kind="discharge_summary"
                      buildDocument={() => buildCompiledDischargeSummaryDocument(out.data, out.narrative, review.reviewed)}
                      documentLabel="Discharge summary"
                      className="h-9 px-3.5 rounded-[8px] bg-[#1B4FD8] text-[12.5px] font-semibold text-white hover:bg-[#1740B4] inline-flex items-center gap-1.5 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Which stay */}
                <div className="px-3 sm:px-4 pt-3">
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Stay">
                    {data.episodes.map((e) => {
                      const I = episodeIcon(e)
                      const on = data.scope === "stay" && data.episode?.id === e.id
                      return (
                        <button
                          key={e.id}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => {
                            setEpisodeId(e.id)
                            setScope("stay")
                          }}
                          title={`${e.kind} stay${e.ward ? ` · ${e.ward}` : ""}`}
                          className={chip(on)}
                        >
                          <I size={13} /> {e.kind} <span className="opacity-60 font-normal">{episodeRange(e)}</span>
                        </button>
                      )
                    })}
                    <button type="button" role="tab" aria-selected={data.scope === "history"} onClick={() => setScope("history")} className={chip(data.scope === "history")}>
                      <History size={13} /> Complete history
                    </button>
                  </div>
                </div>

                {/* Sections */}
                <nav className="mt-2 px-1.5 sm:px-2.5 flex overflow-x-auto border-t border-[#EEF1F6]" aria-label="Summary sections">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => document.getElementById(`ds-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className={`h-10 px-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 -mb-px cursor-pointer transition-colors inline-flex items-center gap-1 ${
                        activeSection === t.id ? "border-[#1B4FD8] text-[#1B4FD8]" : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                      }`}
                    >
                      {t.id === "course" && <Sparkles size={11} className="text-[#7C3AED]" />}
                      {t.label}
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {!loading && (
              <ReviewPanel
                items={items}
                checks={review.checks}
                reviewed={review.reviewed}
                hasEdits={review.hasEdits}
                onToggle={review.toggleCheck}
                onMarkReviewed={() => {
                  review.markReviewed(currentUserName())
                  setToast("Marked as reviewed")
                }}
                onReopen={review.reopen}
                onDiscardEdits={review.clearEdits}
              />
            )}

            <SummaryDocument
              key={`${selected.key}|${data.episode?.id ?? "-"}|${data.scope}`}
              data={data}
              narrative={narrative}
              n={out.narrative}
              advice={advice}
              edits={review.edits}
              review={review.reviewed}
              emrLoading={emrLoading}
              onEdit={(field, value) => {
                review.setEdit(field, value)
                setToast("Saved — included in print, PDF and send")
              }}
              onRegenerate={regenerate}
            />
            <div className="h-6 shrink-0" />
          </>
        )}
      </section>

      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[10px] bg-[#0F172A] text-white text-[12.5px] shadow-lg inline-flex items-center gap-2"
        >
          <CheckCircle2 size={14} className="text-[#4ADE80]" /> {toast}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onSearch }: { onSearch: () => void }) {
  const points = [
    { icon: ClipboardList, title: "Compiled from every desk", text: "Admission, ER, OP, ICU, OT, lab and pharmacy records for the stay." },
    { icon: Sparkles, title: "AI drafts, doctor approves", text: "Qwen writes the narrative from the record; you review, edit and sign it off." },
    { icon: Printer, title: "Print, PDF or send", text: "A clean A4 summary to sign, download or send to the patient." },
  ]
  return (
    <div className="flex-1 bg-white border border-[#DDE2EC] rounded-[14px] flex items-center justify-center p-8 min-h-[460px]">
      <div className="max-w-[580px] text-center">
        <div className="w-14 h-14 mx-auto rounded-[16px] bg-gradient-to-br from-[#EFF6FF] to-[#F5F3FF] border border-[#E0E7FF] flex items-center justify-center">
          <FileText size={24} className="text-[#1B4FD8]" />
        </div>
        <h2 className="mt-4 text-[18px] font-semibold text-[#0F172A] tracking-[-0.01em]">Pick a patient to build their discharge summary</h2>
        <p className="mt-1.5 text-[13px] text-[#64748B]">Search by name, UMR or phone, then choose the patient. Their latest stay opens here.</p>
        <button
          type="button"
          onClick={onSearch}
          className="mt-4 h-9 px-4 rounded-[8px] bg-[#0F172A] text-white text-[12.5px] font-medium hover:bg-[#1E293B] inline-flex items-center gap-2 cursor-pointer"
        >
          Search patients <kbd className="font-mono text-[10.5px] text-white/60 border border-white/20 rounded-[4px] px-1">/</kbd>
        </button>
        <div className="mt-7 grid sm:grid-cols-3 gap-3 text-left">
          {points.map(({ icon: I, title, text }) => (
            <div key={title} className="rounded-[10px] border border-[#EEF1F6] bg-[#FAFBFD] p-3.5">
              <I size={16} className="text-[#1B4FD8]" />
              <div className="mt-2 text-[12.5px] font-semibold text-[#0F172A]">{title}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-[#64748B]">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
