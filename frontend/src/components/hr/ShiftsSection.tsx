import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { hr } from "../../services/hr/client"
import type { EmployeeListItem, Page } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, filterCls, fmtDate, fmtDateTime, inputCls, useHr, useRun } from "./ui"
import useOrgRefs from "./useOrgRefs"

export type ShiftTemplate = {
  id: string
  code: string
  name: string
  kind: string
  start_time: string
  end_time: string
  break_minutes: number
  grace_in_minutes: number
  grace_out_minutes: number
  full_day_minutes: number
  half_day_minutes: number
  overtime_after_minutes: number
  min_rest_minutes: number
  is_night: boolean
  crosses_midnight: boolean
  color: string | null
}
type Roster = { id: string; department_id: string; department_name: string; period_start: string; period_end: string; status: string; published_at: string | null; assignment_count: number }
type Cell = { id: string; employee_id: string; employee_name: string; work_date: string; is_weekly_off: boolean; shift_template_id: string | null; shift_code: string | null; status: string }

const iso = (d: Date) => d.toLocaleDateString("en-CA")
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const hhmm = (t: string) => t.slice(0, 5)

export default function ShiftsSection({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<"roster" | "templates" | "holidays" | "swaps" | "handovers">("roster")
  return (
    <div>
      <PageHeader title="Shifts & rosters" subtitle="Shift templates, duty rosters, holidays, swaps and handovers" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "roster", label: "Duty roster" },
          { id: "templates", label: "Shift templates" },
          { id: "holidays", label: "Holidays" },
          { id: "swaps", label: "Swaps & replacements" },
          { id: "handovers", label: "Handovers" },
        ]}
      />
      {tab === "roster" && <RosterBuilder canEdit={canEdit} />}
      {tab === "templates" && <Templates canEdit={canEdit} />}
      {tab === "holidays" && <Holidays canEdit={canEdit} />}
      {tab === "swaps" && <Swaps />}
      {tab === "handovers" && <Handovers />}
    </div>
  )
}

// ── roster builder ──────────────────────────────────────────────────────────

function RosterBuilder({ canEdit }: { canEdit: boolean }) {
  const refs = useOrgRefs()
  const [dept, setDept] = useState("")
  const [start, setStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
    return iso(d)
  })
  const [days, setDays] = useState(7)
  const end = addDays(start, days - 1)
  useEffect(() => {
    if (!dept && refs.data?.departments.length) setDept(refs.data.departments[0].id)
  }, [refs.data, dept])

  const templates = useHr(() => hr.get<ShiftTemplate[]>("/api/v1/workforce/shifts"), [])
  const rosters = useHr(() => (dept ? hr.get<Roster[]>("/api/v1/workforce/rosters", { department_id: dept }) : Promise.resolve([])), [dept])
  const roster = rosters.data?.find((r) => r.period_start <= start && r.period_end >= end) ?? null
  const staff = useHr(
    () => (dept ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { department_id: dept, status: "active", page_size: 200 }) : Promise.resolve(null)),
    [dept],
  )
  const [version, setVersion] = useState(0)
  const cells = useHr(
    () => (roster ? hr.get<Cell[]>("/api/v1/workforce/assignments", { date_from: start, date_to: end, roster_id: roster.id }) : Promise.resolve([] as Cell[])),
    [roster?.id, start, end, version],
  )
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [validation, setValidation] = useState<{ errors: { issue: string }[]; warnings: { issue: string }[] } | null>(null)
  const [rotation, setRotation] = useState(false)
  const [busy, run] = useRun()
  useEffect(() => {
    setDraft({})
    setValidation(null)
  }, [roster?.id, start, days])

  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days])
  const value = (emp: string, d: string) => {
    const key = `${emp}|${d}`
    if (key in draft) return draft[key]
    const c = cells.data?.find((x) => x.employee_id === emp && x.work_date === d)
    return c ? (c.is_weekly_off ? "OFF" : c.shift_template_id ?? "") : ""
  }
  const tmplById = Object.fromEntries((templates.data ?? []).map((t) => [t.id, t]))
  const dirty = Object.keys(draft).length

  const createRoster = () =>
    run("create", () => hr.post("/api/v1/workforce/rosters", { department_id: dept, period_start: start, period_end: end }), "Roster created").then((r) => r && rosters.reload())
  const save = () =>
    roster &&
    run(
      "save",
      () =>
        hr.put(
          `/api/v1/workforce/rosters/${roster.id}/assignments`,
          Object.entries(draft).map(([k, v]) => {
            const [employee_id, work_date] = k.split("|")
            return { employee_id, work_date, shift_template_id: v && v !== "OFF" ? v : null, is_weekly_off: v === "OFF" }
          }),
        ),
      "Roster saved as draft",
    ).then((r) => {
      if (r) {
        setDraft({})
        setVersion((v) => v + 1)
        rosters.reload()
      }
    })
  const validate = () =>
    roster && run("validate", () => hr.get<{ errors: any[]; warnings: any[] }>(`/api/v1/workforce/rosters/${roster.id}/validate`)).then((r) => r && setValidation(r))
  const publish = () =>
    roster &&
    run("publish", () => hr.post(`/api/v1/workforce/rosters/${roster.id}/publish`), "Roster published; staff and attendance updated").then((r) => {
      if (r) {
        setValidation(null)
        setVersion((v) => v + 1)
        rosters.reload()
      } else validate()
    })

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Department">
            <select className={filterCls} value={dept} onChange={(e) => setDept(e.target.value)}>
              {refs.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input type="date" className={filterCls} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </Field>
          <Field label="Length">
            <select className={filterCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
              <option value={28}>4 weeks</option>
            </select>
          </Field>
          <div className="flex gap-1 ml-auto">
            <Btn onClick={() => setStart(addDays(start, -days))}>← Previous</Btn>
            <Btn onClick={() => setStart(addDays(start, days))}>Next →</Btn>
          </div>
        </div>
      </Panel>

      {!dept ? (
        <Empty title="Create a department first" />
      ) : rosters.loading || staff.loading || templates.loading ? (
        <Loading />
      ) : !roster ? (
        <Panel>
          <Empty
            title={`No roster for ${fmtDate(start)} – ${fmtDate(end)}`}
            hint="A roster groups this department's shifts for a period; it is published once checked."
            action={canEdit && <Btn variant="primary" busy={busy === "create"} onClick={createRoster}>Create roster</Btn>}
          />
        </Panel>
      ) : (
        <Panel
          title={
            <span className="flex items-center gap-2">
              {roster.department_name} · {fmtDate(roster.period_start)} – {fmtDate(roster.period_end)}
              <StatusBadge value={roster.status === "published" ? "success" : "draft"} label={roster.status === "published" ? `Published ${fmtDateTime(roster.published_at)}` : "Draft"} />
            </span>
          }
          actions={
            canEdit && (
              <div className="flex gap-1.5">
                <Btn onClick={() => setRotation(true)}>
                  <RefreshCw className="w-3.5 h-3.5" /> Rotation
                </Btn>
                <Btn busy={busy === "save"} disabled={!dirty} onClick={save}>
                  Save draft{dirty ? ` (${dirty})` : ""}
                </Btn>
                <Btn busy={busy === "validate"} disabled={!!dirty} onClick={validate}>
                  Check
                </Btn>
                <Btn variant="primary" busy={busy === "publish"} disabled={!!dirty} onClick={publish}>
                  Publish
                </Btn>
              </div>
            )
          }
        >
          {validation && (
            <div className="mb-3 space-y-1 text-xs">
              {validation.errors.length === 0 && validation.warnings.length === 0 && (
                <p className="flex items-center gap-1 text-[#007078]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> No problems found
                </p>
              )}
              {validation.errors.map((x, i) => (
                <p key={`e${i}`} className="flex items-start gap-1 text-rose-700">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> {x.issue}
                </p>
              ))}
              {validation.warnings.map((x, i) => (
                <p key={`w${i}`} className="flex items-start gap-1 text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> {x.issue}
                </p>
              ))}
            </div>
          )}
          {!staff.data?.items.length ? (
            <Empty title="No active staff in this department" />
          ) : (
            <div className="overflow-x-auto -mx-4">
              <table className="text-xs border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white px-4 py-2 text-left font-medium text-[#64748B] min-w-[180px]">Staff</th>
                    {dates.map((d) => {
                      const dt = new Date(`${d}T00:00:00`)
                      return (
                        <th key={d} className={`px-1 py-2 font-medium text-center min-w-[64px] ${[0, 6].includes(dt.getDay()) ? "text-[#1B4FD8]" : "text-[#64748B]"}`}>
                          {dt.toLocaleDateString("en-IN", { weekday: "short" })}
                          <div className="text-[10px] font-normal">{dt.getDate()}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staff.data.items.map((e) => (
                    <tr key={e.id}>
                      <td className="sticky left-0 bg-white px-4 py-1 border-t border-[#EEF1F6]">
                        <div className="text-gray-900 text-sm font-semibold">{e.full_name}</div>
                        <div className="text-[10px] text-[#64748B]">{e.designation ?? e.employee_category}</div>
                      </td>
                      {dates.map((d) => {
                        const v = value(e.id, d)
                        const t = tmplById[v]
                        const changed = `${e.id}|${d}` in draft
                        return (
                          <td key={d} className="px-0.5 py-1 border-t border-[#EEF1F6]">
                            <select
                              disabled={!canEdit}
                              aria-label={`${e.full_name} ${d}`}
                              value={v}
                              onChange={(ev) => setDraft({ ...draft, [`${e.id}|${d}`]: ev.target.value })}
                              className={`w-full rounded border px-1 py-1 text-[11px] text-center appearance-none ${changed ? "ring-2 ring-amber-300" : ""} ${
                                v === "OFF" ? "bg-gray-100 text-[#64748B] border-[#DDE2EC]" : t ? "border-transparent text-white font-medium" : "bg-white border-dashed border-[#DDE2EC] text-gray-300"
                              }`}
                              style={t ? { background: t.color ?? (t.is_night ? "#582C5F" : "#1B4FD8") } : undefined}
                            >
                              <option value="">—</option>
                              <option value="OFF">Off</option>
                              {templates.data?.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.code}
                                </option>
                              ))}
                            </select>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-[#64748B]">
            {templates.data?.map((t) => (
              <span key={t.id} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-xs" style={{ background: t.color ?? (t.is_night ? "#582C5F" : "#1B4FD8") }} />
                {t.code} {hhmm(t.start_time)}–{hhmm(t.end_time)}
                {t.crosses_midnight ? " (+1)" : ""}
              </span>
            ))}
          </div>
        </Panel>
      )}
      {rotation && roster && (
        <RotationDrawer
          rosterId={roster.id}
          staff={staff.data?.items ?? []}
          templates={templates.data ?? []}
          onClose={() => setRotation(false)}
          onDone={() => {
            setRotation(false)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

function RotationDrawer({ rosterId, staff, templates, onClose, onDone }: { rosterId: string; staff: EmployeeListItem[]; templates: ShiftTemplate[]; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>(staff.map((s) => s.id))
  const [pattern, setPattern] = useState(templates.length >= 3 ? `${templates[0].code},${templates[0].code},${templates[1].code},${templates[1].code},${templates[2].code},${templates[2].code},OFF,OFF` : "")
  const [stagger, setStagger] = useState(true)
  const [busy, run] = useRun()
  const go = () =>
    run("go", () => hr.post(`/api/v1/workforce/rosters/${rosterId}/rotation`, { employee_ids: picked, pattern: pattern.split(",").map((p) => p.trim()).filter(Boolean), stagger }), "Rotation applied as a draft").then(
      (r) => r && onDone(),
    )
  return (
    <Drawer
      open
      title="Fill roster from a rotation"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy === "go"} disabled={!picked.length || !pattern} onClick={go}>
            Apply
          </Btn>
        </>
      }
    >
      <Field label="Pattern" hint={`Shift codes or OFF, comma separated, repeated across the period. Codes: ${templates.map((t) => t.code).join(", ")}`}>
        <input className={inputCls} value={pattern} onChange={(e) => setPattern(e.target.value.toUpperCase())} />
      </Field>
      <label className="flex items-center gap-2 text-sm my-3">
        <input type="checkbox" checked={stagger} onChange={(e) => setStagger(e.target.checked)} /> Stagger staff so coverage spreads across the pattern
      </label>
      <Field label="Staff">
        <div className="max-h-72 overflow-y-auto border border-[#DDE2EC] rounded p-2 space-y-1">
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
              {s.full_name}
            </label>
          ))}
        </div>
      </Field>
    </Drawer>
  )
}

// ── templates ───────────────────────────────────────────────────────────────

function Templates({ canEdit }: { canEdit: boolean }) {
  const list = useHr(() => hr.get<ShiftTemplate[]>("/api/v1/workforce/shifts"), [])
  const blank = { code: "", name: "", kind: "general", start_time: "09:00", end_time: "17:00", break_minutes: 30, grace_in_minutes: 10, grace_out_minutes: 10, full_day_minutes: 420, half_day_minutes: 240, overtime_after_minutes: 30, min_rest_minutes: 480, is_night: false, color: "" }
  const [form, setForm] = useState<typeof blank | null>(null)
  const [busy, run] = useRun()
  const save = () =>
    form &&
    run("save", () => hr.post("/api/v1/workforce/shifts", { ...form, color: form.color || null }), "Shift created").then((r) => {
      if (r) {
        setForm(null)
        list.reload()
      }
    })
  const del = (t: ShiftTemplate) => window.confirm(`Delete shift ${t.name}?`) && run(`del-${t.id}`, () => hr.del(`/api/v1/workforce/shifts/${t.id}`), "Shift deleted").then(() => list.reload())
  if (list.loading && !list.data) return <Loading />
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  const num = (k: keyof typeof blank, label: string) =>
    form && (
      <Field label={label}>
        <input className={inputCls} inputMode="numeric" value={String(form[k])} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value.replace(/\D/g, "")) })} />
      </Field>
    )
  return (
    <Panel title="Shift templates" actions={canEdit && <Btn variant="primary" onClick={() => setForm(blank)}><Plus className="w-3.5 h-3.5" /> New shift</Btn>}>
      {!list.data?.length ? (
        <Empty title="No shifts defined" hint="For example General 09:00–17:00, Morning 07:00–14:00, Evening 14:00–21:00, Night 21:00–07:00." />
      ) : (
        <Table head={["Code", "Name", "Hours", "Break", "Grace in/out", "Full / half day", "OT after", "Rest", ""]}>
          {list.data.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2 font-mono text-xs">{t.code}</td>
              <td className="px-4 py-2">
                {t.name} {t.is_night && <StatusBadge value="simulator" label="Night" />}
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                {hhmm(t.start_time)}–{hhmm(t.end_time)}
                {t.crosses_midnight && <span className="text-[11px] text-[#64748B]"> next day</span>}
              </td>
              <td className="px-4 py-2">{t.break_minutes}m</td>
              <td className="px-4 py-2">
                {t.grace_in_minutes}/{t.grace_out_minutes}m
              </td>
              <td className="px-4 py-2">
                {t.full_day_minutes / 60}h / {t.half_day_minutes / 60}h
              </td>
              <td className="px-4 py-2">{t.overtime_after_minutes}m</td>
              <td className="px-4 py-2">{t.min_rest_minutes / 60}h</td>
              <td className="px-4 py-2 text-right">
                {canEdit && (
                  <Btn variant="ghost" busy={busy === `del-${t.id}`} onClick={() => del(t)} aria-label={`Delete ${t.name}`}>
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  </Btn>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Drawer
        open={!!form}
        title="New shift template"
        onClose={() => setForm(null)}
        footer={
          <>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn variant="primary" busy={busy === "save"} disabled={!form?.code || !form?.name} onClick={save}>
              Save
            </Btn>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required>
              <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Name" required>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Starts">
              <input type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="Ends" hint="Earlier than the start means it ends next day">
              <input type="time" className={inputCls} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, is_night: e.target.value === "night" || form.is_night })}>
                {["general", "morning", "evening", "night", "rotational"].map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Colour">
              <input type="color" className="h-9 w-full" value={form.color || "#007078"} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </Field>
            {num("break_minutes", "Break (min)")}
            {num("overtime_after_minutes", "Overtime after (min)")}
            {num("grace_in_minutes", "Late grace (min)")}
            {num("grace_out_minutes", "Early-exit grace (min)")}
            {num("full_day_minutes", "Full day (min worked)")}
            {num("half_day_minutes", "Half day (min worked)")}
            {num("min_rest_minutes", "Minimum rest before (min)")}
            <label className="flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={form.is_night} onChange={(e) => setForm({ ...form, is_night: e.target.checked })} /> Night shift (allowance)
            </label>
          </div>
        )}
      </Drawer>
    </Panel>
  )
}

// ── holidays ────────────────────────────────────────────────────────────────

function Holidays({ canEdit }: { canEdit: boolean }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const list = useHr(() => hr.get<{ id: string; holiday_date: string; name: string; branch_id: string | null; optional: boolean }[]>("/api/v1/workforce/holidays", { year }), [year])
  const [f, setF] = useState({ holiday_date: "", name: "", optional: false })
  const [busy, run] = useRun()
  const add = () =>
    run("add", () => hr.post("/api/v1/workforce/holidays", f), "Holiday added; attendance on that day recalculated").then((r) => {
      if (r) {
        setF({ holiday_date: "", name: "", optional: false })
        list.reload()
      }
    })
  return (
    <Panel title="Holiday calendar" actions={<select className={filterCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((y) => <option key={y}>{y}</option>)}</select>}>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <Field label="Date">
            <input type="date" className={filterCls} value={f.holiday_date} onChange={(e) => setF({ ...f, holiday_date: e.target.value })} />
          </Field>
          <Field label="Name">
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <label className="flex items-center gap-1.5 text-xs pb-2">
            <input type="checkbox" checked={f.optional} onChange={(e) => setF({ ...f, optional: e.target.checked })} /> Optional
          </label>
          <Btn variant="primary" busy={busy === "add"} disabled={!f.holiday_date || !f.name} onClick={add}>
            Add holiday
          </Btn>
        </div>
      )}
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.length ? (
        <Empty title={`No holidays in ${year}`} />
      ) : (
        <Table head={["Date", "Holiday", "Type", ""]}>
          {list.data.map((h) => (
            <tr key={h.id}>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDate(h.holiday_date)}</td>
              <td className="px-4 py-2">{h.name}</td>
              <td className="px-4 py-2">{h.optional ? "Optional" : "Hospital holiday"}</td>
              <td className="px-4 py-2 text-right">
                {canEdit && (
                  <Btn variant="ghost" onClick={() => run(`d${h.id}`, () => hr.del(`/api/v1/workforce/holidays/${h.id}`), "Holiday removed").then(() => list.reload())} aria-label="Delete holiday">
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  </Btn>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

// ── swaps & handovers ───────────────────────────────────────────────────────

function Swaps() {
  const list = useHr(() => hr.get<{ id: string; kind: string; status: string; reason: string; work_date: string; requester: string; counterpart: string; created_at: string }[]>("/api/v1/workforce/swaps"), [])
  if (list.loading && !list.data) return <Loading />
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  return (
    <Panel title="Swap and replacement requests" actions={<span className="text-[11px] text-[#64748B]">Staff raise these from My HR; decisions are made under Approvals</span>}>
      {!list.data?.length ? (
        <Empty title="No swap requests" />
      ) : (
        <Table head={["Date", "Type", "Requested by", "With", "Reason", "Status"]}>
          {list.data.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2">{fmtDate(s.work_date)}</td>
              <td className="px-4 py-2 capitalize">{s.kind}</td>
              <td className="px-4 py-2 font-medium text-gray-900">{s.requester}</td>
              <td className="px-4 py-2 text-gray-700">{s.counterpart}</td>
              <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{s.reason}</td>
              <td className="px-4 py-2">
                <StatusBadge value={s.status === "approved" ? "success" : s.status} label={s.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

function Handovers() {
  const refs = useOrgRefs()
  const [dept, setDept] = useState("")
  const list = useHr(() => hr.get<{ id: string; work_date: string; notes: string; from_name: string; to_name: string | null; acknowledged_at: string | null; created_at: string }[]>("/api/v1/workforce/handovers", { department_id: dept || undefined }), [dept])
  const [busy, run] = useRun()
  return (
    <Panel
      title="Shift handovers"
      actions={
        <select className={filterCls} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {refs.data?.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      }
    >
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.length ? (
        <Empty title="No handovers recorded" hint="Staff record handovers at the end of their shift from My HR." />
      ) : (
        <ul className="divide-y divide-[#EEF1F6]">
          {list.data.map((h) => (
            <li key={h.id} className="py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-gray-900 font-medium">
                  {h.from_name} → {h.to_name ?? "next shift"} · {fmtDate(h.work_date)}
                </span>
                {h.acknowledged_at ? (
                  <StatusBadge value="success" label="Acknowledged" />
                ) : (
                  <Btn variant="ghost" busy={busy === h.id} onClick={() => run(h.id, () => hr.post(`/api/v1/workforce/handovers/${h.id}/acknowledge`), "Acknowledged").then(() => list.reload())}>
                    Acknowledge
                  </Btn>
                )}
              </div>
              <p className="text-gray-700 whitespace-pre-wrap mt-1 text-xs">{h.notes}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
