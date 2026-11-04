import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Btn } from "../shared"
import { apiFetch } from "../../lib/api"
import {
  FLOWSHEET_SECTIONS,
  HOURS,
  TWO_HOURLY,
  type FieldDef,
  type Section,
} from "./flowsheetSchema"
import {
  downloadFlowsheetPdf,
  printFlowsheet,
  type ExportGroup,
} from "./flowsheetExport"
import {
  getPatientStayDays,
  getCurrentDateTimeFormatted,
} from "./icuSeedData"

// Renders the ICU daily flowsheet described by flowsheetSchema.ts: one record
// per patient per calendar day. The chart is wide, so each section keeps its
// own horizontal scroll container and the hour/row label column stays pinned.

export type FlowsheetRecord = {
  patientId: string
  date: string
  fields: Record<string, string>
  tables: Record<string, Array<Record<string, string>>>
  grids: Record<string, Record<string, string>>
  hourly: Record<string, Record<string, string>>
  scales: Record<string, Record<string, string>>
  updatedAt: string
  isCleared?: boolean
}

export const emptyRecord = (patientId: string, date: string): FlowsheetRecord => ({
  patientId,
  date,
  fields: {},
  tables: {},
  grids: {},
  hourly: {},
  scales: {},
  updatedAt: "",
})

const storageKey = (patientId: string, date: string) =>
  `icu.flowsheet.${patientId}.${date}`

// Persistence: the chart lives in the patient's clinical record
// (icu_flowsheets, surfaced on the patient journey). localStorage is kept as a
// write-through cache so a nurse mid-chart never loses entries to a dropped
// network, and so the page still renders offline.
// No demo data is ever generated: a day with nothing charted is an empty
// chart. `totalDays` / `isManualCharting` are kept for call-site compatibility.
export function loadRecord(
  patientId: string,
  date: string,
  _totalDays: number = 10,
  _isManualCharting: boolean = true,
): FlowsheetRecord {
  try {
    const raw = localStorage.getItem(storageKey(patientId, date))
    if (raw) return { ...emptyRecord(patientId, date), ...JSON.parse(raw), patientId, date }
  } catch {}
  return emptyRecord(patientId, date)
}

export function saveRecord(rec: FlowsheetRecord) {
  try {
    localStorage.setItem(
      storageKey(rec.patientId, rec.date),
      JSON.stringify(rec),
    )
    return true
  } catch {
    return false
  }
}

/** Pull one chart day from the clinical record. Null when nothing is stored. */
export async function fetchRecord(
  patientId: string,
  date: string,
): Promise<FlowsheetRecord | null> {
  const res = await apiFetch<{ data: Partial<FlowsheetRecord> | null }>(
    `/api/icu/${encodeURIComponent(patientId)}/flowsheet/${date}`,
  )
  if (!res?.data) return null
  return { ...emptyRecord(patientId, date), ...res.data, patientId, date }
}

/** Write the chart back to the patient's clinical record. */
export async function pushRecord(rec: FlowsheetRecord, entryCount: number) {
  return apiFetch(
    `/api/icu/${encodeURIComponent(rec.patientId)}/flowsheet/${rec.date}`,
    {
      method: "PUT",
      body: JSON.stringify({ data: rec, entry_count: entryCount }),
    },
  )
}

export type FlowsheetDay = {
  chart_date: string
  entry_count: number
  updated_by?: string | null
  updated_at?: string | null
}

/** Day-wise index of every chart recorded for this patient, newest first. */
export async function fetchDays(patientId: string): Promise<FlowsheetDay[]> {
  const res = await apiFetch<{ days: FlowsheetDay[] }>(
    `/api/icu/${encodeURIComponent(patientId)}/flowsheets`,
  )
  return res?.days ?? []
}

// Cross-tab realtime: any tab that saves broadcasts the patient-day it touched
// so other open tabs (a second nurse, a second monitor) reload it immediately.
const CHANNEL = "icu.flowsheet.sync"
export function broadcastSave(patientId: string, date: string) {
  try {
    new BroadcastChannel(CHANNEL).postMessage({
      patientId,
      date,
      at: Date.now(),
    })
  } catch {}
}
export function onFlowsheetSync(
  handler: (m: { patientId: string ;date: string }) => void,
) {
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (e) => handler(e.data)
    return () => ch.close()
  } catch {
    return () => {}
  }
}

/** Number of filled entries in a chart day (what the day index stores). */
export function countEntries(rec: FlowsheetRecord): number {
  let n = Object.values(rec.fields ?? {}).filter(Boolean).length
  for (const group of [rec.grids, rec.hourly, rec.scales])
    for (const cells of Object.values(group ?? {}))
      n += Object.values(cells ?? {}).filter(Boolean).length
  for (const rows of Object.values(rec.tables ?? {}))
    for (const row of rows ?? []) n += Object.values(row).filter(Boolean).length
  return n
}

/**
 * Pull one chart day from the clinical record into the local cache. Returns
 * the server copy when it has one, else the cached copy (offline / unsaved).
 */
export async function syncRecordFromServer(
  patientId: string,
  date: string,
): Promise<FlowsheetRecord> {
  try {
    const remote = await fetchRecord(patientId, date)
    if (remote) {
      const local = loadRecord(patientId, date)
      // Keep a newer local edit that has not reached the server yet.
      if (!local.updatedAt || (remote.updatedAt || "") >= local.updatedAt) {
        saveRecord(remote)
        return remote
      }
      return local
    }
  } catch {}
  return loadRecord(patientId, date)
}

/**
 * Append rows to a table section of one chart day (e.g. a drip or a
 * medication order onto the drug chart) and save it the same way the
 * flowsheet does: local cache, clinical record, then a cross-tab broadcast.
 */
export async function appendChartRows(
  patientId: string,
  date: string,
  tableId: string,
  rows: Record<string, string>[],
): Promise<{ saved: boolean ;record: FlowsheetRecord }> {
  const base = await syncRecordFromServer(patientId, date)
  const record: FlowsheetRecord = {
    ...base,
    tables: {
      ...base.tables,
      [tableId]: [
        ...rows,
        ...(base.tables[tableId] ?? []).filter((r) => Object.values(r).some(Boolean)),
      ],
    },
    updatedAt: new Date().toISOString(),
  }
  saveRecord(record)
  broadcastSave(patientId, date)
  try {
    await pushRecord(record, countEntries(record))
    broadcastSave(patientId, date)
    return { saved: true, record }
  } catch {
    return { saved: false, record }
  }
}

/** Dates (most recent first) that already hold a record for this patient. */
export function recordedDates(patientId: string): string[] {
  const prefix = `icu.flowsheet.${patientId}.`
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) out.push(k.slice(prefix.length))
    }
  } catch {}
  return out.sort().reverse()
}

/** Per-tab charting progress for one patient-day, for the ICU overview card. */
export function flowsheetSummary(patientId: string, date: string) {
  const rec = loadRecord(patientId, date)
  const countIn = (ids: string[]) => {
    let n = 0
    for (const [k, v] of Object.entries(rec.fields))
      if (v && ids.includes(k.split(".")[0])) n++
    for (const id of ids) {
      n += Object.values(rec.grids[id] ?? {}).filter(Boolean).length
      n += Object.values(rec.hourly[id] ?? {}).filter(Boolean).length
      n += Object.values(rec.scales[id] ?? {}).filter(Boolean).length
      for (const row of rec.tables[id] ?? [])
        n += Object.values(row).filter(Boolean).length
    }
    return n
  }
  const tabs = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: countIn(t.sections),
  }))
  return {
    tabs,
    total: tabs.reduce((a, b) => a + b.count, 0),
    updatedAt: rec.updatedAt,
  }
}

const TABS: {
  id: string
  label: string
  sections: string[]
  color: string
  tint: string
}[] = [
  {
    id: "header",
    label: "Chart Header",
    sections: ["admission", "day_plan"],
    color: "#1B4FD8",
    tint: "#EFF6FF",
  },
  {
    id: "neuro",
    label: "Neuro",
    sections: ["gcs", "rass", "pupils", "muscle_power"],
    color: "#7C3AED",
    tint: "#F5F3FF",
  },
  {
    id: "meds",
    label: "Medication",
    sections: ["drug_chart", "sos_medication", "high_risk_medication"],
    color: "#DB2777",
    tint: "#FDF2F8",
  },
  {
    id: "care",
    label: "Care & Lines",
    sections: ["pressure_ulcer", "special_care", "lines_tubes", "handover"],
    color: "#059669",
    tint: "#ECFDF5",
  },
  {
    id: "obs",
    label: "Hourly Observations",
    sections: ["observations"],
    color: "#DC2626",
    tint: "#FEF2F2",
  },
  {
    id: "io",
    label: "Intake / Output",
    sections: ["intake", "output", "balance_24h"],
    color: "#0891B2",
    tint: "#ECFEFF",
  },
  {
    id: "labs",
    label: "Labs & Micro",
    sections: ["labs", "imaging", "microbiology", "antibiotics"],
    color: "#D97706",
    tint: "#FFFBEB",
  },
]

const SYNC: Record<string, { label: string ;color: string ;tint: string }> = {
  loading: { label: "Loading…", color: "#64748B", tint: "#F1F5F9" },
  saving: { label: "Saving…", color: "#B45309", tint: "#FFFBEB" },
  online: { label: "Saved to record", color: "#15803D", tint: "#ECFDF5" },
  offline: {
    label: "Offline — saved locally",
    color: "#B91C1C",
    tint: "#FEF2F2",
  },
}

const inputBase =
  "w-full border border-[#CBD5E1] rounded-none px-2 py-1 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-blue-100"

function Field({
  def,
  value,
  onChange,
  compact,
}: {
  def: FieldDef
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const cls = compact ? `${inputBase} px-1 py-0.5 text-[11.5px]` : inputBase
  if (def.type === "select") {
    return (
      <select
        className={cls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {(def.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  if (def.type === "textarea") {
    return (
      <textarea
        rows={3}
        className={cls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  if (def.type === "check") {
    return (
      <input
        type="checkbox"
        className="w-4 h-4 accent-[#1B4FD8] cursor-pointer"
        checked={value === "1"}
        onChange={(e) => onChange(e.target.checked ? "1" : "")}
      />
    )
  }
  return (
    <input
      type={
        def.type === "number"
          ? "number"
          : def.type === "date"
            ? "date"
            : def.type === "time"
              ? "time"
              : "text"
      }
      className={cls}
      value={value}
      placeholder={def.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

const SectionShell = ({
  title,
  note,
  children,
  color,
  tint,
}: {
  title: string
  note?: string
  children: React.ReactNode
  color?: string
  tint?: string
}) => (
  <section className="bg-white border border-[#DDE2EC] shadow-sm mb-4">
    <div
      className="px-4 py-2.5 border-b flex items-center gap-2"
      style={{ backgroundColor: tint ?? "#F8FAFC", borderColor: "#E2E8F0" }}
    >
      <span
        className="w-1 h-4 flex-shrink-0"
        style={{ backgroundColor: color ?? "#94A3B8" }}
      />
      <div className="min-w-0">
        <h3
          className="text-[13px] font-bold"
          style={{ color: color ?? "#0F172A" }}
        >
          {title}
        </h3>
        {note && (
          <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed">
            {note}
          </p>
        )}
      </div>
    </div>
    <div className="p-4">{children}</div>
  </section>
)

const thCls =
  "px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#475569] bg-[#F1F5F9] border border-[#E2E8F0] whitespace-nowrap"
const tdCls = "border border-[#E2E8F0] p-0.5"
const stickyCol =
  "sticky left-0 z-10 bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-1 text-[11px] font-semibold text-[#334155] whitespace-nowrap"

export default function IcuFlowsheet({
  patientId,
  patientName,
  bed,
  initialDate,
  totalDays = 10,
  isManualCharting = false,
  onClose,
}: {
  patientId: string
  patientName: string
  bed: string
  initialDate?: string
  totalDays?: number
  isManualCharting?: boolean
  onClose?: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const activeDate = initialDate || today
  const [date, setDate] = useState(activeDate)
  const [tab, setTab] = useState(TABS[0].id)

  const [rec, setRec] = useState<FlowsheetRecord>(() =>
    loadRecord(patientId, activeDate, totalDays, isManualCharting),
  )
  const [savedAt, setSavedAt] = useState<string>("")
  const [syncState, setSyncState] =
    useState<"loading" | "saving" | "online" | "offline">("online")
  const [days, setDays] = useState<FlowsheetDay[]>([])
  const [daysTick, setDaysTick] = useState(0)
  const [showReports, setShowReports] = useState(false)
  const dirty = useRef(false)

  // Switching patient or day shows the cached copy immediately, then reconciles
  // with the clinical record so the nurse never stares at a spinner.
  const loadDay = useCallback(async (pid: string, day: string) => {
    setRec(loadRecord(pid, day, totalDays, isManualCharting))
    dirty.current = false
    setSavedAt("")
    setSyncState("online")
    try {
      const remote = await fetchRecord(pid, day)
      if (remote) {
        const hasRemoteData = countEntries(remote) > 0
        // Don't clobber edits the nurse made while the fetch was in flight, and don't overwrite with empty remote data
        if (!dirty.current && hasRemoteData) {
          setRec(remote)
          saveRecord(remote)
        }
      }
      setSyncState("online")
    } catch {
      setSyncState("online")
    }
  }, [totalDays, isManualCharting])

  useEffect(() => {
    loadDay(patientId, date)
  }, [patientId, date, loadDay])

  // Debounced autosave -- a nurse should never lose an entry to a missed click.
  // Local cache first (always succeeds), then the clinical record.
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(async () => {
      const stamped = { ...rec, updatedAt: new Date().toISOString() }
      saveRecord(stamped)
      dirty.current = false
      setSavedAt(new Date().toLocaleTimeString())
      setSyncState("saving")
      try {
        await pushRecord(stamped, entriesFor(TABS.flatMap((t) => t.sections)))
        setSyncState("online")
        broadcastSave(stamped.patientId, stamped.date)
        setDaysTick((n) => n + 1)
      } catch {
        setSyncState("offline")
      }
    }, 600)
    return () => clearTimeout(t)
  }, [rec])

  // Realtime: another tab saving this same patient-day pulls the new version in.
  useEffect(
    () =>
      onFlowsheetSync((m) => {
        if (m.patientId !== patientId || m.date !== date || dirty.current)
          return
        syncRecordFromServer(patientId, date)
          .then((r) => setRec(r))
          .catch(() => {})
      }),
    [patientId, date],
  )

  // Day-wise index for the Reports view.
  useEffect(() => {
    let alive = true
    fetchDays(patientId)
      .then((d) => alive && setDays(d))
      .catch(() => alive && setDays([]))
    return () => {
      alive = false
    }
  }, [patientId, daysTick])

  const mutate = useCallback((fn: (draft: FlowsheetRecord) => void) => {
    setRec((prev) => {
      const next: FlowsheetRecord = {
        ...prev,
        fields: { ...prev.fields },
        tables: { ...prev.tables },
        grids: { ...prev.grids },
        hourly: { ...prev.hourly },
        scales: { ...prev.scales },
      }
      fn(next)
      return next
    })
    dirty.current = true
  }, [])

  const setField = (sid: string, key: string, v: string) =>
    mutate((d) => {
      d.fields[`${sid}.${key}`] = v
    })
  const setGrid = (sid: string, cell: string, v: string) =>
    mutate((d) => {
      d.grids[sid] = { ...(d.grids[sid] ?? {}), [cell]: v }
    })
  const setHourly = (sid: string, cell: string, v: string) =>
    mutate((d) => {
      d.hourly[sid] = { ...(d.hourly[sid] ?? {}), [cell]: v }
    })
  const setScale = (sid: string, cell: string, v: string) =>
    mutate((d) => {
      d.scales[sid] = { ...(d.scales[sid] ?? {}), [cell]: v }
    })
  const setTableCell = (sid: string, row: number, key: string, v: string) =>
    mutate((d) => {
      const rows = [...(d.tables[sid] ?? [])]
      while (rows.length <= row) rows.push({})
      rows[row] = { ...rows[row], [key]: v }
      d.tables[sid] = rows
    })
  const deleteTableRow = (s: Section, row: number, visible: number) => {
    const filled = Object.values(rec.tables[s.id]?.[row] ?? {}).some(Boolean)
    if (
      filled &&
      !window.confirm(`Delete row ${row + 1} from "${s.title}"? Its entries will be removed.`)
    )
      return
    mutate((d) => {
      const rows = [...(d.tables[s.id] ?? [])]
      while (rows.length < visible) rows.push({})
      rows.splice(row, 1)
      d.tables[s.id] = rows
    })
  }

  const entriesFor = (sectionIds: string[]) => {
    let n = 0
    for (const [k, v] of Object.entries(rec.fields))
      if (v && sectionIds.includes(k.split(".")[0])) n++
    for (const sid of sectionIds) {
      n += Object.values(rec.grids[sid] ?? {}).filter(Boolean).length
      n += Object.values(rec.hourly[sid] ?? {}).filter(Boolean).length
      n += Object.values(rec.scales[sid] ?? {}).filter(Boolean).length
      for (const row of rec.tables[sid] ?? [])
        n += Object.values(row).filter(Boolean).length
    }
    return n
  }

  const sectionsById = useMemo(() => {
    const m = new Map<string, Section>()
    for (const s of FLOWSHEET_SECTIONS) m.set(s.id, s)
    return m
  }, [])

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0]

  const [exportMenu, setExportMenu] = useState<"print" | "pdf" | null>(null)
  const [exporting, setExporting] = useState(false)
  const runExport = async (kind: "print" | "pdf", scope: "tab" | "all") => {
    setExportMenu(null)
    const groups: ExportGroup[] = (scope === "tab" ? [activeTab] : TABS).map(
      (t) => ({
        label: t.label,
        sections: t.sections
          .map((id) => sectionsById.get(id))
          .filter((s): s is Section => Boolean(s)),
      }),
    )
    const meta = { patientName, patientId, bed, date }
    if (kind === "print") {
      printFlowsheet(rec, groups, meta)
      return
    }
    setExporting(true)
    try {
      await downloadFlowsheetPdf(rec, groups, meta)
    } catch (err) {
      console.error(err)
      window.alert("Could not generate the PDF. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  const renderSection = (s: Section) => {
    switch (s.kind) {
      case "fields":
        return (
          <SectionShell
            key={s.id}
            title={s.title}
            note={s.note}
            color={activeTab.color}
            tint={activeTab.tint}
          >
            <div
              className={`grid gap-3 grid-cols-1 sm:grid-cols-2 ${
                s.cols === 4
                  ? "lg:grid-cols-4"
                  : s.cols === 3
                    ? "lg:grid-cols-3"
                    : "lg:grid-cols-2"
              }`}
            >
              {s.fields.map((f) => (
                <div
                  key={f.key}
                  className={
                    f.span === 4
                      ? "lg:col-span-4"
                      : f.span === 3
                        ? "lg:col-span-3"
                        : f.span === 2
                          ? "lg:col-span-2"
                          : ""
                  }
                >
                  <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                    {f.label}
                    {f.unit && (
                      <span className="text-[#94A3B8] font-normal">
                        {" "}
                        ({f.unit})
                      </span>
                    )}
                  </label>
                  <Field
                    def={f}
                    value={rec.fields[`${s.id}.${f.key}`] ?? ""}
                    onChange={(v) => setField(s.id, f.key, v)}
                  />
                </div>
              ))}
            </div>
          </SectionShell>
        )

      case "table": {
        const rows = rec.tables[s.id] ?? []
        const count = Math.max(rows.length, s.minRows ?? 3)
        return (
          <SectionShell
            key={s.id}
            title={s.title}
            note={s.note}
            color={activeTab.color}
            tint={activeTab.tint}
          >
            <div className="overflow-x-auto">
              <table className="border-collapse w-full min-w-max">
                <thead>
                  <tr>
                    <th className={thCls}>#</th>
                    {s.columns.map((c) => (
                      <th key={c.key} className={thCls}>
                        {c.label}
                        {c.unit && (
                          <span className="text-[#94A3B8] normal-case">
                            {" "}
                            ({c.unit})
                          </span>
                        )}
                      </th>
                    ))}
                    <th className={`${thCls} w-8`} aria-label="Row actions" />
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: count }, (_, r) => (
                    <tr key={r}>
                      <td
                        className={`${tdCls} text-center text-[11px] text-[#94A3B8] px-2`}
                      >
                        {r + 1}
                      </td>
                      {s.columns.map((c) => (
                        <td
                          key={c.key}
                          className={tdCls}
                          style={{ minWidth: (c.span ?? 1) * 110 }}
                        >
                          <Field
                            def={c}
                            value={rows[r]?.[c.key] ?? ""}
                            onChange={(v) => setTableCell(s.id, r, c.key, v)}
                            compact
                          />
                        </td>
                      ))}
                      <td className={`${tdCls} text-center`}>
                        <button
                          type="button"
                          title={`Delete row ${r + 1}`}
                          aria-label={`Delete row ${r + 1} of ${s.title}`}
                          onClick={() => deleteTableRow(s, r, count)}
                          className="w-6 h-6 inline-flex items-center justify-center text-[14px] leading-none text-[#94A3B8] hover:text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                mutate((d) => {
                  const newRow: Record<string, string> = {}
                  if (s.columns.some((c) => c.key === "time")) {
                    newRow.time = getCurrentDateTimeFormatted().timeStr
                  }
                  if (s.columns.some((c) => c.key === "date")) {
                    newRow.date = date
                  }
                  // Pad to what is on screen first: stored rows can be fewer
                  // than minRows, and appending to those alone left the
                  // visible count unchanged -- the "takes 2-3 clicks" bug.
                  const rows = [...(d.tables[s.id] ?? [])]
                  while (rows.length < count) rows.push({})
                  d.tables[s.id] = [...rows, newRow]
                })
              }
              className="mt-2 text-[11.5px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
            >
              + Add row
            </button>
          </SectionShell>
        )
      }

      case "grid": {
        const slots = s.slotGroups.flatMap((g) => g.slots)
        return (
          <SectionShell
            key={s.id}
            title={s.title}
            note={s.note}
            color={activeTab.color}
            tint={activeTab.tint}
          >
            <div className="overflow-x-auto">
              <table className="border-collapse min-w-max">
                <thead>
                  {s.slotGroups.some((g) => g.label) && (
                    <tr>
                      <th className={`${thCls} sticky left-0 z-20`} rowSpan={2}>
                        Care / Time
                      </th>
                      {s.slotGroups.map((g) => (
                        <th
                          key={g.label}
                          className={thCls}
                          colSpan={g.slots.length}
                        >
                          {g.label}
                        </th>
                      ))}
                    </tr>
                  )}
                  <tr>
                    {!s.slotGroups.some((g) => g.label) && (
                      <th className={`${thCls} sticky left-0 z-20`}>
                        Care / Time
                      </th>
                    )}
                    {s.slotGroups.map((g) =>
                      g.slots.map((sl) => (
                        <th key={`${g.label}-${sl}`} className={thCls}>
                          {sl}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((row) => (
                    <tr key={row}>
                      <td className={stickyCol}>{row}</td>
                      {slots.map((sl) => (
                        <td key={sl} className={tdCls} style={{ minWidth: 62 }}>
                          <input
                            className={`${inputBase} px-1 py-0.5 text-[11px] text-center`}
                            value={rec.grids[s.id]?.[`${row}|${sl}`] ?? ""}
                            onChange={(e) =>
                              setGrid(s.id, `${row}|${sl}`, e.target.value)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionShell>
        )
      }

      case "hourly": {
        const cols = s.groups.flatMap((g) =>
          g.fields.map((f) => ({ group: g.label, f })),
        )
        const hours = s.id === "rass" ? TWO_HOURLY : HOURS
        return (
          <SectionShell
            key={s.id}
            title={s.title}
            note={s.note}
            color={activeTab.color}
            tint={activeTab.tint}
          >
            <div className="overflow-x-auto">
              <table className="border-collapse min-w-max">
                <thead>
                  <tr>
                    <th className={`${thCls} sticky left-0 z-20`} rowSpan={2}>
                      Time
                    </th>
                    {s.groups.map((g) => (
                      <th
                        key={g.label}
                        className={thCls}
                        colSpan={g.fields.length}
                      >
                        {g.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {cols.map(({ group, f }) => (
                      <th key={`${group}-${f.key}`} className={thCls}>
                        {f.label}
                        {f.unit && (
                          <div className="text-[9px] text-[#94A3B8] normal-case">
                            {f.unit}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hours.map((h) => (
                    <tr key={h}>
                      <td className={`${stickyCol} font-mono`}>{h}</td>
                      {cols.map(({ group, f }) => (
                        <td
                          key={`${group}-${f.key}`}
                          className={tdCls}
                          style={{ minWidth: (f.span ?? 1) * 76 }}
                        >
                          <Field
                            def={f}
                            value={rec.hourly[s.id]?.[`${h}|${f.key}`] ?? ""}
                            onChange={(v) =>
                              setHourly(s.id, `${h}|${f.key}`, v)
                            }
                            compact
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionShell>
        )
      }

      case "scale": {
        const hours = s.interval === 2 ? TWO_HOURLY : HOURS
        const scoreOf = (h: string, ck: string) => {
          const comp = s.components.find((c) => c.key === ck)
          const chosen = rec.scales[s.id]?.[`${h}|${ck}`]
          return comp?.options.find((o) => o.label === chosen)?.score ?? 0
        }
        return (
          <SectionShell
            key={s.id}
            title={s.title}
            note={s.note}
            color={activeTab.color}
            tint={activeTab.tint}
          >
            <div className="overflow-x-auto">
              <table className="border-collapse min-w-max">
                <thead>
                  <tr>
                    <th className={`${thCls} sticky left-0 z-20`}>Time</th>
                    {s.components.map((c) => (
                      <th key={c.key} className={thCls}>
                        {c.label}
                      </th>
                    ))}
                    <th className={thCls}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map((h) => {
                    const total = s.components.reduce(
                      (sum, c) => sum + scoreOf(h, c.key),
                      0,
                    )
                    const filled = s.components.every(
                      (c) => rec.scales[s.id]?.[`${h}|${c.key}`],
                    )
                    return (
                      <tr key={h}>
                        <td className={`${stickyCol} font-mono`}>{h}</td>
                        {s.components.map((c) => (
                          <td
                            key={c.key}
                            className={tdCls}
                            style={{ minWidth: 190 }}
                          >
                            <select
                              className={`${inputBase} px-1 py-0.5 text-[11.5px]`}
                              value={rec.scales[s.id]?.[`${h}|${c.key}`] ?? ""}
                              onChange={(e) =>
                                setScale(s.id, `${h}|${c.key}`, e.target.value)
                              }
                            >
                              <option value=""></option>
                              {c.options.map((o) => (
                                <option key={o.label} value={o.label}>
                                  {o.score} — {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                        <td className={`${tdCls} text-center`}>
                          <span
                            className={`inline-block px-2 py-0.5 font-mono text-[12px] font-bold ${
                              !filled
                                ? "text-[#CBD5E1]"
                                : total <= 8
                                  ? "bg-[#FEE2E2] text-[#B91C1C]"
                                  : total <= 12
                                    ? "bg-[#FEF3C7] text-[#B45309]"
                                    : "bg-[#DCFCE7] text-[#15803D]"
                            }`}
                          >
                            {filled ? total : "—"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </SectionShell>
        )
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F0F2F5]">
      {/* Chart header: who, which day, save state */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-bold text-[12px] border border-[#CBD5E1] rounded shadow-2xs cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] flex-shrink-0"
              title="Return to Critical Care Overview Board"
            >
              <span className="text-[14px]">←</span>
              <span>Back to Overview</span>
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-gray-900 truncate flex items-center gap-2">
              <span>ICU Daily Flowsheet — {patientName}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                {bed}
              </span>
            </h2>
            <p className="text-[11px] text-[#64748B]">
              MRN {patientId} · Daily Flowsheet Recording
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <label className="text-[11.5px] font-semibold text-[#475569]">
            Date
          </label>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="border border-[#CBD5E1] rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:border-[#1B4FD8]"
          />
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Clear all entries for ${date} to start with a blank flowsheet?`)) {
                const blank: FlowsheetRecord = {
                  ...emptyRecord(patientId, date),
                  isCleared: true,
                }
                setRec(blank)
                saveRecord(blank)
                dirty.current = false
                setSyncState("online")
              }
            }}
            className="px-2 py-1 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded font-semibold cursor-pointer"
            title="Clear all fields for this date"
          >
            🗑️ Clear Day
          </button>
          <span
            className="text-[11.5px] font-semibold flex items-center gap-1.5 px-2 py-1 rounded"
            style={{
              backgroundColor: SYNC[syncState].tint,
              color: SYNC[syncState].color,
            }}
            title={savedAt ? `Last saved ${savedAt}` : undefined}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: SYNC[syncState].color }}
            />
            {syncState === "online" && savedAt
              ? `Saved ${savedAt}`
              : SYNC[syncState].label}
          </span>
          <Btn
            variant={showReports ? "primary" : "outline"}
            size="sm"
            onClick={() => setShowReports((v) => !v)}
          >
            {showReports
              ? "Back to Chart"
              : `Day Reports${days.length ? ` (${days.length})` : ""}`}
          </Btn>
          {(["print", "pdf"] as const).map((kind) => (
            <div key={kind} className="relative">
              <Btn
                variant="outline"
                size="sm"
                disabled={kind === "pdf" && exporting}
                onClick={() =>
                  setExportMenu((m) => (m === kind ? null : kind))
                }
              >
                {kind === "print"
                  ? "Print ▾"
                  : exporting
                    ? "Generating PDF…"
                    : "PDF ▾"}
              </Btn>
              {exportMenu === kind && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setExportMenu(null)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-[#CBD5E1] shadow-lg py-1">
                    <button
                      type="button"
                      onClick={() => void runExport(kind, "tab")}
                      className="w-full text-left px-3 py-2 text-[12px] text-[#0F172A] hover:bg-[#EFF6FF] cursor-pointer"
                    >
                      This tab — {activeTab.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runExport(kind, "all")}
                      className="w-full text-left px-3 py-2 text-[12px] text-[#0F172A] hover:bg-[#EFF6FF] cursor-pointer"
                    >
                      Full day chart (all tabs)
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[12px] rounded shadow-2xs cursor-pointer transition-all flex items-center gap-1.5"
              title="Close flowsheet and return to ICU overview"
            >
              <span>✕</span>
              <span>Close Flowsheet</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Multi-day stay stepper bar ─────────────────────────────────── */}
      <div className="bg-[#F8FAFC] border-b border-[#DDE2EC] px-6 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex-shrink-0 mr-1">
          Stay Days ({totalDays}d):
        </span>
        {getPatientStayDays(totalDays).map((sd) => {
          const isSelected = sd.dateStr === date
          return (
            <button
              key={sd.dateStr}
              type="button"
              onClick={() => {
                setDate(sd.dateStr)
                setShowReports(false)
              }}
              className={`flex-shrink-0 px-2.5 py-1 text-[11.5px] font-mono font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? "bg-[#1B4FD8] text-white border-[#1B4FD8] shadow-sm ring-2 ring-blue-200"
                  : "bg-white text-[#334155] border-[#CBD5E1] hover:border-[#1B4FD8] hover:text-[#1B4FD8]"
              }`}
            >
              <span>Day {sd.dayNumber}</span>
              <span
                className={`text-[10px] ${
                  isSelected ? "text-blue-100" : "text-[#94A3B8]"
                }`}
              >
                ({sd.dateStr.slice(5)})
              </span>
              {sd.isToday && (
                <span
                  className={`text-[9px] font-bold px-1 py-px ${
                    isSelected
                      ? "bg-white text-[#1B4FD8]"
                      : "bg-[#EFF6FF] text-[#1B4FD8]"
                  }`}
                >
                  TODAY
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Section tabs, each showing how many boxes are filled for this day */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const n = entriesFor(t.sections)
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-3 py-2 text-[12px] font-semibold whitespace-nowrap border-b-2 transition-colors"
              style={{
                borderColor: active ? t.color : "transparent",
                color: active ? t.color : "#64748B",
                backgroundColor: active ? t.tint : "transparent",
              }}
            >
              {t.label}
              {n > 0 && (
                <span
                  className="ml-1.5 px-1.5 py-px text-[10px] font-bold"
                  style={{
                    backgroundColor: active ? "#FFFFFF" : t.tint,
                    color: t.color,
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {showReports ? (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="bg-white border border-[#DDE2EC] shadow-sm">
            <div className="px-4 py-3 border-b border-[#EDF1F7] flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-bold text-[#1E293B]">
                  Day-wise Chart Reports
                </h3>
                <p className="text-[11.5px] text-[#64748B]">
                  Every ICU chart day recorded for {patientName}. Stored in the
                  clinical record and shown on the patient journey.
                </p>
              </div>
              <span className="text-[11.5px] font-semibold text-[#64748B]">
                {days.length} day{days.length === 1 ? "" : "s"}
              </span>
            </div>
            {days.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12px] text-[#94A3B8]">
                No chart days recorded yet. Entries on the chart tabs save
                automatically and appear here.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#F8FAFC]">
                    <th className={thCls}>Chart Date</th>
                    <th className={thCls}>Entries</th>
                    <th className={thCls}>Completeness</th>
                    <th className={thCls}>Last Updated</th>
                    <th className={thCls}>By</th>
                    <th className={thCls}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const isToday = d.chart_date === today
                    const pct = Math.min(
                      100,
                      Math.round(((d.entry_count || 0) / 120) * 100),
                    )
                    return (
                      <tr
                        key={d.chart_date}
                        className={
                          d.chart_date === date
                            ? "bg-[#EFF6FF]"
                            : "hover:bg-[#F8FAFC]"
                        }
                      >
                        <td className="border border-[#E2E8F0] px-2 py-1.5 font-mono font-semibold text-[#0F172A]">
                          {d.chart_date}
                          {isToday && (
                            <span className="ml-1.5 text-[10px] font-bold text-[#1B4FD8]">
                              TODAY
                            </span>
                          )}
                        </td>
                        <td className="border border-[#E2E8F0] px-2 py-1.5 font-mono font-bold text-[#1B4FD8]">
                          {d.entry_count ?? 0}
                        </td>
                        <td className="border border-[#E2E8F0] px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[#EDF1F7] min-w-[80px]">
                              <div
                                className="h-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor:
                                    pct > 60
                                      ? "#16A34A"
                                      : pct > 25
                                        ? "#D97706"
                                        : "#DC2626",
                                }}
                              />
                            </div>
                            <span className="font-mono text-[10.5px] text-[#64748B] w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                        </td>
                        <td className="border border-[#E2E8F0] px-2 py-1.5 font-mono text-[11px] text-[#475569]">
                          {d.updated_at
                            ? new Date(d.updated_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="border border-[#E2E8F0] px-2 py-1.5 text-[11.5px] text-[#475569]">
                          {d.updated_by || "—"}
                        </td>
                        <td className="border border-[#E2E8F0] px-2 py-1.5">
                          <Btn
                            variant={
                              d.chart_date === date ? "secondary" : "outline"
                            }
                            size="xs"
                            onClick={() => {
                              setDate(d.chart_date)
                              setShowReports(false)
                            }}
                          >
                            Open
                          </Btn>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab.sections.map((id) => {
            const s = sectionsById.get(id)
            return s ? renderSection(s) : null
          })}
        </div>
      )}
    </div>
  )
}
