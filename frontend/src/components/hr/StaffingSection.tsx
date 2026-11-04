import { useState } from "react"
import { Plus, Trash2, Users } from "lucide-react"
import { hr } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES, categoryLabel, type EmployeeListItem, type Page } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Kpi, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, filterCls, fmtDate, fmtTime, inputCls, useHr, useRun } from "./ui"
import useOrgRefs from "./useOrgRefs"
import type { ShiftTemplate } from "./ShiftsSection"

type CoverageRow = { department_id: string; department: string; date: string; shift: string; category: string; required: number; assigned: number; shortage: number; patients: number | null; staff: { name: string; source: string }[] }
type Requirement = { id: string; department_id: string; shift_template_id: string | null; employee_category: string; min_count: number; patients_per_staff: string | null; required_competency: string | null; effective_from: string }

const today = () => new Date().toLocaleDateString("en-CA")

export default function StaffingSection({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<"coverage" | "duty" | "requirements" | "allocations">("coverage")
  return (
    <div>
      <PageHeader title="Staffing & allocation" subtitle="Requirements, coverage against census, temporary deployment and who is on duty" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "coverage", label: "Coverage" },
          { id: "duty", label: "On duty now" },
          { id: "requirements", label: "Requirements" },
          { id: "allocations", label: "Allocations" },
        ]}
      />
      {tab === "coverage" && <Coverage />}
      {tab === "duty" && <OnDuty />}
      {tab === "requirements" && <Requirements canEdit={canEdit} />}
      {tab === "allocations" && <Allocations canEdit={canEdit} />}
    </div>
  )
}

function Coverage() {
  const [day, setDay] = useState(today())
  const live = day === today()
  const cov = useHr(
    () => (live ? hr.get<{ rows: CoverageRow[]; total_shortage: number; census_error: string | null }>("/api/v1/workforce/coverage/live") : hr.get<{ rows: CoverageRow[]; total_shortage: number }>("/api/v1/workforce/coverage", { date_from: day })),
    [day],
  )
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <Field label="Date">
          <input type="date" className={filterCls} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </Field>
        {live && <span className="text-xs text-gray-500 pb-2">Today uses the live bed census from the bed board</span>}
      </div>
      {cov.loading && !cov.data ? (
        <Loading />
      ) : cov.error ? (
        <ErrorState error={cov.error} onRetry={cov.reload} />
      ) : (
        <>
          {"census_error" in (cov.data as any) && (cov.data as any).census_error && <p className="text-xs text-amber-700">{(cov.data as any).census_error} — ratios use the minimum counts.</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Requirements checked" value={cov.data!.rows.length} />
            <Kpi label="Short by" value={cov.data!.total_shortage} tone={cov.data!.total_shortage ? "bad" : "good"} hint="staff across all shifts" />
          </div>
          <Panel title="Coverage by department and shift">
            {!cov.data!.rows.length ? (
              <Empty title="No staffing requirements set" hint="Add requirements per department, shift and staff category under Requirements." />
            ) : (
              <Table head={["Department", "Shift", "Category", "Patients", "Required", "Rostered", "Status", "Staff"]}>
                {cov.data!.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{r.department}</td>
                    <td className="px-4 py-2">{r.shift}</td>
                    <td className="px-4 py-2">{categoryLabel(r.category)}</td>
                    <td className="px-4 py-2 tabular-nums">{r.patients ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{r.required}</td>
                    <td className="px-4 py-2 tabular-nums">{r.assigned}</td>
                    <td className="px-4 py-2">{r.shortage ? <StatusBadge value="failed" label={`Short ${r.shortage}`} /> : <StatusBadge value="success" label="Covered" />}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 max-w-xs truncate" title={r.staff.map((s) => s.name).join(", ")}>
                      {r.staff.map((s) => s.name + (s.source !== "roster" ? ` (${s.source})` : "")).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

export function OnDutyList({ hmsModule, departmentId, compact }: { hmsModule?: string; departmentId?: string; compact?: boolean }) {
  const duty = useHr(
    () =>
      hr.get<{ departments: { department: string; rostered: number; checked_in: number }[]; staff: { employee_id: string; name: string; designation: string | null; category: string; department: string; shift: string; shift_end: string; checked_in: boolean }[] }>(
        "/api/v1/workforce/on-duty",
        { hms_module: hmsModule, department_id: departmentId },
      ),
    [hmsModule, departmentId],
  )
  if (duty.loading && !duty.data) return <Loading label="Loading duty roster…" />
  if (duty.error) return <ErrorState error={duty.error} onRetry={duty.reload} />
  if (!duty.data!.staff.length) return <Empty title="Nobody is rostered on duty right now" hint="Duty comes from published HR rosters." />
  return (
    <ul className={`divide-y divide-[#DDE2EC] ${compact ? "text-xs" : "text-sm"}`}>
      {duty.data!.staff.map((s) => (
        <li key={s.employee_id} className="py-2 flex items-center justify-between gap-2">
          <span>
            <span className="text-gray-900 font-medium">{s.name}</span>
            <span className="text-gray-500"> · {s.designation ?? categoryLabel(s.category)}</span>
            {!compact && <span className="text-gray-400"> · {s.department}</span>}
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[11px] text-gray-400">
              {s.shift} until {fmtTime(s.shift_end)}
            </span>
            <StatusBadge value={s.checked_in ? "in" : "not_arrived"} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function OnDuty() {
  const refs = useOrgRefs()
  const [dept, setDept] = useState("")
  return (
    <Panel
      title={<span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-[#007078]" /> On duty now</span>}
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
      <OnDutyList departmentId={dept || undefined} />
    </Panel>
  )
}

function Requirements({ canEdit }: { canEdit: boolean }) {
  const refs = useOrgRefs()
  const shifts = useHr(() => hr.get<ShiftTemplate[]>("/api/v1/workforce/shifts"), [])
  const list = useHr(() => hr.get<Requirement[]>("/api/v1/workforce/requirements"), [])
  const blank = { department_id: "", shift_template_id: "", employee_category: "nurse", min_count: "2", patients_per_staff: "", required_competency: "", effective_from: today() }
  const [f, setF] = useState<typeof blank | null>(null)
  const [busy, run] = useRun()
  const dname = (id: string) => refs.data?.departments.find((d) => d.id === id)?.name ?? "—"
  const sname = (id: string | null) => (id ? shifts.data?.find((s) => s.id === id)?.name ?? "—" : "Any shift")
  const save = () =>
    f &&
    run(
      "save",
      () =>
        hr.post("/api/v1/workforce/requirements", {
          ...f,
          shift_template_id: f.shift_template_id || null,
          min_count: Number(f.min_count),
          patients_per_staff: f.patients_per_staff || null,
          required_competency: f.required_competency || null,
        }),
      "Requirement added",
    ).then((r) => {
      if (r) {
        setF(null)
        list.reload()
      }
    })
  return (
    <Panel title="Staffing requirements" actions={canEdit && <Btn variant="primary" onClick={() => setF(blank)}><Plus className="w-3.5 h-3.5" /> Add requirement</Btn>}>
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.filter((r) => !("effective_to" in r) || !(r as any).effective_to).length ? (
        <Empty title="No requirements yet" hint="e.g. ICU, night shift: at least 4 nurses, or 1 nurse per 2 patients when the census is higher." />
      ) : (
        <Table head={["Department", "Shift", "Category", "Minimum", "Patients per staff", "Competency", "From", ""]}>
          {list.data!.filter((r) => !(r as any).effective_to).map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">{dname(r.department_id)}</td>
              <td className="px-4 py-2">{sname(r.shift_template_id)}</td>
              <td className="px-4 py-2">{categoryLabel(r.employee_category)}</td>
              <td className="px-4 py-2 tabular-nums">{r.min_count}</td>
              <td className="px-4 py-2 tabular-nums">{r.patients_per_staff ? `1 : ${Number(r.patients_per_staff)}` : "—"}</td>
              <td className="px-4 py-2">{r.required_competency ?? "—"}</td>
              <td className="px-4 py-2">{fmtDate(r.effective_from)}</td>
              <td className="px-4 py-2 text-right">
                {canEdit && (
                  <Btn variant="ghost" onClick={() => run(r.id, () => hr.del(`/api/v1/workforce/requirements/${r.id}`), "Requirement ended").then(() => list.reload())} aria-label="End requirement">
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  </Btn>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Drawer open={!!f} title="New staffing requirement" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "save"} disabled={!f?.department_id} onClick={save}>Save</Btn></>}>
        {f && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department" required>
              <select className={inputCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
                <option value="">Select…</option>
                {refs.data?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Shift">
              <select className={inputCls} value={f.shift_template_id} onChange={(e) => setF({ ...f, shift_template_id: e.target.value })}>
                <option value="">Any shift</option>
                {shifts.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Staff category">
              <select className={inputCls} value={f.employee_category} onChange={(e) => setF({ ...f, employee_category: e.target.value })}>
                {EMPLOYEE_CATEGORIES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Minimum on duty">
              <input className={inputCls} inputMode="numeric" value={f.min_count} onChange={(e) => setF({ ...f, min_count: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="Patients per staff member" hint="Nurse-to-patient planning; used when a census is known">
              <input className={inputCls} inputMode="decimal" value={f.patients_per_staff} onChange={(e) => setF({ ...f, patients_per_staff: e.target.value })} />
            </Field>
            <Field label="Required competency" hint="e.g. ACLS, ventilator">
              <input className={inputCls} value={f.required_competency} onChange={(e) => setF({ ...f, required_competency: e.target.value })} />
            </Field>
            <Field label="Effective from">
              <input type="date" className={inputCls} value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} />
            </Field>
          </div>
        )}
      </Drawer>
    </Panel>
  )
}

function Allocations({ canEdit }: { canEdit: boolean }) {
  const refs = useOrgRefs()
  const shifts = useHr(() => hr.get<ShiftTemplate[]>("/api/v1/workforce/shifts"), [])
  const [from, setFrom] = useState(today())
  const to = new Date(new Date(`${from}T00:00:00`).getTime() + 13 * 864e5).toLocaleDateString("en-CA")
  const list = useHr(() => hr.get<any[]>("/api/v1/workforce/allocations", { date_from: from, date_to: to }), [from])
  const [f, setF] = useState<any>(null)
  const [q, setQ] = useState("")
  const people = useHr(() => (q.length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, status: "active", page_size: 8 }) : Promise.resolve(null)), [q])
  const [busy, run] = useRun()
  const save = () =>
    run("save", () => hr.post("/api/v1/workforce/allocations", { ...f, shift_template_id: f.shift_template_id || null, reason: f.reason || null }), "Allocation recorded").then((r) => {
      if (r) {
        setF(null)
        list.reload()
      }
    })
  return (
    <Panel
      title="Temporary and replacement allocations"
      actions={
        <div className="flex gap-2">
          <input type="date" className={filterCls} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
          {canEdit && (
            <Btn variant="primary" onClick={() => setF({ employee_id: "", department_id: "", work_date: from, shift_template_id: "", allocation_type: "temporary", reason: "" })}>
              <Plus className="w-3.5 h-3.5" /> Allocate staff
            </Btn>
          )}
        </div>
      }
    >
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.length ? (
        <Empty title="No allocations in the next two weeks" />
      ) : (
        <Table head={["Date", "Employee", "Deployed to", "Type", "Reason", ""]}>
          {list.data.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2">{fmtDate(a.work_date)}</td>
              <td className="px-4 py-2">{a.employee_name}</td>
              <td className="px-4 py-2">{a.department_name}</td>
              <td className="px-4 py-2 capitalize">{a.allocation_type}</td>
              <td className="px-4 py-2 text-gray-600">{a.reason ?? "—"}</td>
              <td className="px-4 py-2 text-right">
                {canEdit && (
                  <Btn variant="ghost" onClick={() => run(a.id, () => hr.del(`/api/v1/workforce/allocations/${a.id}`), "Allocation cancelled").then(() => list.reload())}>
                    Cancel
                  </Btn>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {f && (
        <Drawer open title="Allocate staff" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "save"} disabled={!f.employee_id || !f.department_id} onClick={save}>Save</Btn></>}>
          <div className="space-y-3">
            <Field label="Employee" required>
              <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search active staff" />
            </Field>
            {people.data?.items.map((p) => (
              <button key={p.id} onClick={() => setF({ ...f, employee_id: p.id })} className={`block w-full text-left px-3 py-1.5 text-sm rounded ${f.employee_id === p.id ? "bg-[#1B4FD8]/10 text-[#1B4FD8] font-medium" : "hover:bg-[#F8FAFC] text-gray-800"}`}>
                {p.full_name} <span className="text-[11px] text-gray-400">{p.department} · {p.designation}</span>
              </button>
            ))}
            <Field label="Deploy to department" required>
              <select className={inputCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
                <option value="">Select…</option>
                {refs.data?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" className={inputCls} value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} />
              </Field>
              <Field label="Shift">
                <select className={inputCls} value={f.shift_template_id} onChange={(e) => setF({ ...f, shift_template_id: e.target.value })}>
                  <option value="">—</option>
                  {shifts.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Type">
              <select className={inputCls} value={f.allocation_type} onChange={(e) => setF({ ...f, allocation_type: e.target.value })}>
                <option value="temporary">Temporary (moves them for the day)</option>
                <option value="replacement">Replacement (covers someone)</option>
              </select>
            </Field>
            <Field label="Reason">
              <input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            </Field>
          </div>
        </Drawer>
      )}
    </Panel>
  )
}
