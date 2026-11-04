import React, { useEffect, useMemo, useRef, useState } from "react"
import { FileSearch, Loader2, Search, X } from "lucide-react"
import { formatDate, type PatientStatus, type SummaryPatientHit } from "../../services/dischargeSummaryCompiler"
import { Avatar, Highlight, StatusPill } from "./ui"

type Filter = "All" | "Admitted" | "Discharged" | "Emergency" | "Outpatient"

const FILTERS: Filter[] = ["All", "Admitted", "Discharged", "Emergency", "Outpatient"]
const inFilter = (s: PatientStatus, f: Filter) =>
  f === "All" || (f === "Discharged" ? s === "Discharged" || s === "ICU discharge" : s === f)

const GROUP_ORDER: Filter[] = ["Admitted", "Discharged", "Emergency", "Outpatient"]
const GROUP_TITLE: Record<Filter, string> = {
  All: "",
  Admitted: "Currently admitted",
  Discharged: "Discharged",
  Emergency: "Emergency",
  Outpatient: "Outpatient",
}
const groupOf = (s: PatientStatus): Filter => (s === "ICU discharge" ? "Discharged" : (s as Filter))

export default function PatientSearchPanel({
  query,
  onQuery,
  hits,
  selectedKey,
  onChoose,
  searchingBackend,
  inputRef,
  className = "",
}: {
  query: string
  onQuery: (q: string) => void
  hits: SummaryPatientHit[]
  selectedKey: string | null
  onChoose: (hit: SummaryPatientHit) => void
  searchingBackend: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  className?: string
}) {
  const [filter, setFilter] = useState<Filter>("All")
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { All: hits.length, Admitted: 0, Discharged: 0, Emergency: 0, Outpatient: 0 }
    for (const h of hits) c[groupOf(h.status)]++
    return c
  }, [hits])

  // Grouped (admitted first) so the list reads as a ward round, newest first inside each group.
  const shown = useMemo(() => {
    const list = hits.filter((h) => inFilter(h.status, filter))
    if (query.trim()) return list
    return [...list].sort((a, b) => GROUP_ORDER.indexOf(groupOf(a.status)) - GROUP_ORDER.indexOf(groupOf(b.status)))
  }, [hits, filter, query])

  useEffect(() => setActive(0), [query, filter])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault()
      onChoose(shown[active])
    } else if (e.key === "Escape" && query) {
      onQuery("")
    }
  }

  return (
    <aside className={`no-print lg:w-[320px] shrink-0 bg-white border border-[#DDE2EC] rounded-[12px] flex-col min-h-0 ${className}`}>
      <div className="px-3.5 pt-3.5 pb-2.5 border-b border-[#EEF1F6]">
        <div className="flex items-baseline justify-between mb-2.5">
          <h2 className="text-[13.5px] font-semibold text-[#0F172A]">Patients</h2>
          {searchingBackend ? (
            <span className="text-[10.5px] text-[#94A3B8] inline-flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Searching hospital EMR
            </span>
          ) : (
            <span className="text-[11px] text-[#94A3B8]">{query.trim() ? `${shown.length} found` : "Admitted & discharged"}</span>
          )}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Name, UMR or phone"
            aria-label="Search patient"
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls="ds-patient-list"
            aria-activedescendant={shown[active] ? `ds-hit-${active}` : undefined}
            className="w-full h-10 pl-9 pr-10 rounded-[8px] border border-[#DDE2EC] bg-[#F8FAFC] text-[13px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1B4FD8] focus:bg-white focus:ring-[3px] focus:ring-[#1B4FD8]/10 transition-colors"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-[6px] flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] cursor-pointer"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#94A3B8] border border-[#E2E8F0] bg-white rounded-[4px] px-1.5 py-[1px]">/</kbd>
          )}
        </div>
        <div className="mt-2.5 flex gap-1 overflow-x-auto -mx-0.5 px-0.5 pb-0.5" role="tablist" aria-label="Filter patients">
          {FILTERS.filter((f) => f === "All" || counts[f] > 0).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`h-7 px-2.5 rounded-full text-[11.5px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                filter === f ? "bg-[#0F172A] text-white" : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
              }`}
            >
              {f}
              <span className={`text-[10.5px] ${filter === f ? "text-white/70" : "text-[#94A3B8]"}`}>{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} id="ds-patient-list" role="listbox" aria-label="Patients" className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {shown.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileSearch size={26} className="mx-auto text-[#CBD5E1]" />
            <p className="text-[12.5px] text-[#475569] mt-2.5 font-medium">
              {query.trim() ? <>No patient matches “{query.trim()}”</> : "No admissions or discharges yet"}
            </p>
            <p className="text-[11.5px] text-[#94A3B8] mt-1">Try a UMR, a phone number or part of the name.</p>
          </div>
        ) : (
          shown.map((h, i) => {
            const group = groupOf(h.status)
            const newGroup = !query.trim() && filter === "All" && (i === 0 || groupOf(shown[i - 1].status) !== group)
            const isSelected = selectedKey === h.key
            const isActive = active === i
            return (
              <React.Fragment key={h.key}>
                {newGroup && (
                  <div className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                    {GROUP_TITLE[group]}
                  </div>
                )}
                <button
                  type="button"
                  id={`ds-hit-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onChoose(h)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left flex items-center gap-3 px-2.5 py-2.5 rounded-[8px] transition-colors cursor-pointer ${
                    isSelected ? "bg-[#EFF6FF] ring-1 ring-[#BFDBFE]" : isActive ? "bg-[#F8FAFC]" : ""
                  }`}
                >
                  <Avatar name={h.name} status={h.status} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#0F172A] truncate">
                        <Highlight text={h.name} query={query} />
                      </span>
                      <StatusPill status={h.status} />
                    </span>
                    <span className="block text-[11.5px] text-[#64748B] truncate mt-0.5">
                      {[h.ids[0], h.age != null ? `${h.age} yrs` : "", h.gender || ""].filter(Boolean).join(" · ")}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
                      <span className="truncate">{h.detail}</span>
                      {h.lastDate && <span className="ml-auto shrink-0">{formatDate(h.lastDate)}</span>}
                    </span>
                  </span>
                </button>
              </React.Fragment>
            )
          })
        )}
      </div>
      <div className="hidden lg:flex items-center gap-3 px-3.5 py-2 border-t border-[#EEF1F6] text-[10.5px] text-[#94A3B8]">
        <span><kbd className="font-mono">↑↓</kbd> move</span>
        <span><kbd className="font-mono">Enter</kbd> open</span>
        <span><kbd className="font-mono">/</kbd> search</span>
      </div>
    </aside>
  )
}
