// Calculated attendance (from the attendance engine): daily register,
// monthly calendar, exceptions, corrections, overtime, recalculation.
import { useState } from "react"
import { hr } from "../../services/hr/client"
import type { EmployeeListItem, Page } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Kpi, Loading, Pager, Panel, StatusBadge, Table, filterCls, fmtDate, fmtTime, humanize, inputCls, minutes, useHr, useRun } from "./ui"
import useOrgRefs from "./useOrgRefs"

type Rec = { id: string; employee_id: string; employee_name: string; employee_code: string; department: string | null; work_date: string; status: string; shift_code: string | null; first_in: string | null; last_out: string | null; worked_minutes: number; late_minutes: number; early_minutes: number; overtime_minutes: number; punch_count: number; locked: boolean }

const STATUS_BADGE: Record<string, string> = { present: "success", half_day: "partial", absent: "failed", on_leave: "pending", half_day_leave: "pending", holiday: "draft", weekly_off: "draft", missing_punch: "failed", in_progress: "in", scheduled: "unknown", not_scheduled: "unknown" }
const today = () => new Date().toLocaleDateString("en-CA")

export function DailyRegister({ canManage }: { canManage: boolean }) {
  const refs = useOrgRefs()
  const [day, setDay] = useState(today())
  const [f, setF] = useState({ status: "", department_id: "", late_only: false, overtime_only: false })
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const data = useHr(() => hr.get<Page<Rec> & { summary: Record<string, number> }>("/api/v1/attendance/daily", { day, ...f, late_only: f.late_only || undefined, overtime_only: f.overtime_only || undefined, page, page_size: 50 }), [day, f, page, version])
  const [open, setOpen] = useState<string | null>(null)
  const [busy, run] = useRun()
  const s = data.data?.summary ?? {}
  const recalc = () => run("recalc", () => hr.post<{ records: number }>("/api/v1/attendance/recalculate", { date_from: day, date_to: day }), (r) => `${r.records} records recalculated`).then(() => setVersion((v) => v + 1))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Present" value={(s.present ?? 0) + (s.in_progress ?? 0)} tone="good" onClick={() => setF({ ...f, status: "present" })} />
        <Kpi label="Absent" value={s.absent ?? 0} tone="bad" onClick={() => setF({ ...f, status: "absent" })} />
        <Kpi label="On leave" value={(s.on_leave ?? 0) + (s.half_day_leave ?? 0)} onClick={() => setF({ ...f, status: "on_leave" })} />
        <Kpi label="Missing punch" value={s.missing_punch ?? 0} tone="warn" onClick={() => setF({ ...f, status: "missing_punch" })} />
        <Kpi label="Late" value={s.late ?? 0} tone="warn" onClick={() => setF({ ...f, late_only: true })} />
        <Kpi label="Overtime" value={s.overtime ?? 0} tone="accent" onClick={() => setF({ ...f, overtime_only: true })} />
      </div>
      <Panel
        title="Daily attendance"
        actions={
          <div className="flex flex-wrap gap-2">
            <input type="date" className={filterCls} value={day} max={today()} onChange={(e) => { e.target.value && setDay(e.target.value); setPage(1) }} aria-label="Date" />
            <select className={filterCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })} aria-label="Department">
              <option value="">All departments</option>
              {refs.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select className={filterCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
              <option value="">All statuses</option>
              {Object.keys(STATUS_BADGE).map((k) => (
                <option key={k} value={k}>
                  {humanize(k)}
                </option>
              ))}
            </select>
            {(f.status || f.late_only || f.overtime_only) && <Btn variant="ghost" onClick={() => setF({ status: "", department_id: f.department_id, late_only: false, overtime_only: false })}>Clear</Btn>}
            {canManage && <Btn busy={busy === "recalc"} onClick={recalc}>Recalculate day</Btn>}
          </div>
        }
      >
        {data.loading && !data.data ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} onRetry={data.reload} />
        ) : !data.data?.items.length ? (
          <Empty title="No calculated attendance for this day" hint="Records appear once a roster is published or punches are received." />
        ) : (
          <>
            <Table head={["Employee", "Department", "Shift", "In", "Out", "Worked", "Late", "Early", "OT", "Status"]}>
              {data.data.items.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/80 cursor-pointer transition-colors" onClick={() => setOpen(r.id)}>
                  <td className="px-4 py-2">
                    <span className="font-semibold text-gray-900">{r.employee_name}</span> <span className="text-[11px] text-[#64748B] font-mono">{r.employee_code}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{r.department ?? "—"}</td>
                  <td className="px-4 py-2">{r.shift_code ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtTime(r.first_in)}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtTime(r.last_out)}</td>
                  <td className="px-4 py-2 tabular-nums font-mono">{minutes(r.worked_minutes)}</td>
                  <td className={`px-4 py-2 tabular-nums font-mono ${r.late_minutes ? "text-amber-700 font-semibold" : "text-[#64748B]"}`}>{r.late_minutes ? `${r.late_minutes}m` : "—"}</td>
                  <td className={`px-4 py-2 tabular-nums font-mono ${r.early_minutes ? "text-amber-700 font-semibold" : "text-[#64748B]"}`}>{r.early_minutes ? `${r.early_minutes}m` : "—"}</td>
                  <td className="px-4 py-2 tabular-nums font-mono">{r.overtime_minutes ? minutes(r.overtime_minutes) : "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge value={STATUS_BADGE[r.status] ?? "draft"} label={humanize(r.status)} />
                    {r.locked && <span className="ml-1 text-[10px] text-[#64748B]">locked</span>}
                  </td>
                </tr>
              ))}
            </Table>
            <Pager page={page} pageSize={50} total={data.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
      {open && <RecordDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function RecordDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const rec = useHr(() => hr.get<Rec & { sessions: { check_in: string; check_out: string | null; minutes: number }[]; exceptions: { kind: string; detail: string; status: string }[] }>(`/api/v1/attendance/records/${id}`), [id])
  return (
    <Drawer open title={rec.data ? `${rec.data.employee_name} · ${fmtDate(rec.data.work_date)}` : "Attendance"} onClose={onClose}>
      {rec.loading ? (
        <Loading />
      ) : rec.error ? (
        <ErrorState error={rec.error} />
      ) : (
        <div className="space-y-4 text-sm">
          <p>
            <StatusBadge value={STATUS_BADGE[rec.data!.status] ?? "draft"} label={humanize(rec.data!.status)} /> · worked {minutes(rec.data!.worked_minutes)} from {rec.data!.punch_count} punches
          </p>
          <div>
            <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">Work sessions</h4>
            {rec.data!.sessions.length ? (
              <ul className="space-y-1">
                {rec.data!.sessions.map((s, i) => (
                  <li key={i}>
                    {fmtTime(s.check_in)} → {s.check_out ? fmtTime(s.check_out) : <span className="text-rose-700">no check-out</span>} {s.check_out && <span className="text-[#64748B]">({minutes(s.minutes)})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[#64748B]">No punches</p>
            )}
          </div>
          {!!rec.data!.exceptions.length && (
            <div>
              <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">Exceptions</h4>
              <ul className="space-y-1">
                {rec.data!.exceptions.map((x, i) => (
                  <li key={i} className={x.status === "open" ? "text-amber-800" : "text-[#64748B]"}>
                    {humanize(x.kind)} — {x.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-[#64748B]">Sessions are paired from the raw device punches; the punches themselves are never edited. Corrections add a manual punch once approved.</p>
        </div>
      )}
    </Drawer>
  )
}

export function MonthlyCalendar({ employeeId }: { employeeId?: string }) {
  const [q, setQ] = useState("")
  const [emp, setEmp] = useState<string | undefined>(employeeId)
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const people = useHr(() => (!employeeId && q.length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, page_size: 8 }) : Promise.resolve(null)), [q])
  const data = useHr(() => (emp ? hr.get<any>(`/api/v1/attendance/monthly/${emp}`, { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) }) : Promise.resolve(null)), [emp, month])
  const first = new Date(`${month}-01T00:00:00`)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const byDate = Object.fromEntries((data.data?.days ?? []).map((d: Rec) => [d.work_date, d]))
  return (
    <Panel
      title={data.data ? `${data.data.employee_name} · monthly attendance` : "Monthly attendance"}
      actions={<input type="month" className={filterCls} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />}
    >
      {!employeeId && (
        <div className="max-w-sm mb-3">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an employee (instant)" />
          {people.data?.items.map((p) => (
            <button key={p.id} onClick={() => { setEmp(p.id); setQ("") }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded transition-colors cursor-pointer">
              {p.full_name}
            </button>
          ))}
        </div>
      )}
      {!emp ? (
        <Empty title="Choose an employee" />
      ) : data.loading && !data.data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-[11px]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-center text-[#64748B] font-semibold py-1">
                {d}
              </div>
            ))}
            {Array.from({ length: lead }).map((_, i) => (
              <div key={`l${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = `${month}-${String(i + 1).padStart(2, "0")}`
              const r = byDate[d]
              return (
                <div key={d} className={`min-h-[56px] rounded border p-1 ${r ? "border-[#DDE2EC] bg-white shadow-2xs" : "border-dashed border-[#EEF1F6] bg-[#F8FAFC]"}`}>
                  <div className="text-[#64748B] font-medium">{i + 1}</div>
                  {r && (
                    <>
                      <StatusBadge value={STATUS_BADGE[r.status] ?? "draft"} label={humanize(r.status)} />
                      {r.worked_minutes > 0 && <div className="text-[#64748B] mt-0.5 font-mono">{minutes(r.worked_minutes)}</div>}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {data.data && (
            <p className="text-xs text-gray-700 mt-3 font-medium">
              Present {data.data.totals.present} · Half day {data.data.totals.half_day} · Absent {data.data.totals.absent} · Leave {data.data.totals.on_leave} · Late days {data.data.totals.late_days} · Overtime {minutes(data.data.totals.overtime_minutes)}
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

export function Exceptions({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState("open")
  const [page, setPage] = useState(1)
  const data = useHr(() => hr.get<Page<any>>("/api/v1/attendance/exceptions", { status, page, page_size: 50 }), [status, page])
  const [busy, run] = useRun()
  const dismiss = (x: any) => {
    const reason = window.prompt(`Dismiss "${humanize(x.kind)}" for ${x.employee_name} on ${x.work_date}? Reason:`)
    if (reason && reason.trim().length >= 3) run(x.id, () => hr.post(`/api/v1/attendance/exceptions/${x.id}/dismiss`, { reason }), "Exception dismissed").then(() => data.reload())
  }
  return (
    <Panel title="Attendance exceptions" actions={<select className={filterCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="open">Open</option><option value="dismissed">Dismissed</option></select>}>
      {data.loading && !data.data ? (
        <Loading />
      ) : !data.data?.items.length ? (
        <Empty title="No exceptions" />
      ) : (
        <>
          <Table head={["Date", "Employee", "Exception", "Detail", ""]}>
            {data.data.items.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(x.work_date)}</td>
                <td className="px-4 py-2 font-medium">{x.employee_name}</td>
                <td className="px-4 py-2">{humanize(x.kind)}</td>
                <td className="px-4 py-2 text-gray-700">{x.detail}</td>
                <td className="px-4 py-2 text-right">{canManage && x.status === "open" && <Btn variant="ghost" busy={busy === x.id} onClick={() => dismiss(x)}>Dismiss</Btn>}</td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={50} total={data.data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}

export function Corrections() {
  const [status, setStatus] = useState("pending")
  const data = useHr(() => hr.get<any[]>("/api/v1/attendance/corrections", { status: status || undefined }), [status])
  return (
    <Panel title="Attendance corrections" actions={<select className={filterCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>}>
      <p className="text-[11px] text-[#64748B] mb-2">Staff request corrections from My HR. Approval (under Approvals) adds a manual punch to the ledger and recalculates the day.</p>
      {data.loading && !data.data ? (
        <Loading />
      ) : !data.data?.length ? (
        <Empty title="No correction requests" />
      ) : (
        <Table head={["Date", "Employee", "Punches to add", "Reason", "Status"]}>
          {data.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDate(c.work_date)}</td>
              <td className="px-4 py-2 font-medium">{c.employee_name}</td>
              <td className="px-4 py-2 font-mono text-xs">{c.punch_times.map((t: string) => fmtTime(t)).join(", ")}</td>
              <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{c.reason}</td>
              <td className="px-4 py-2">
                <StatusBadge value={c.status === "approved" ? "success" : c.status} label={c.status} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

export function Overtime({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState("")
  const data = useHr(() => hr.get<any[]>("/api/v1/attendance/overtime", { status: status || undefined }), [status])
  const [busy, run] = useRun()
  return (
    <Panel title="Overtime" actions={<select className={filterCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>}>
      <p className="text-[11px] text-[#64748B] mb-2">Overtime is detected from attendance against the shift. Only approved minutes are paid.</p>
      {data.loading && !data.data ? (
        <Loading />
      ) : !data.data?.length ? (
        <Empty title="No overtime recorded" />
      ) : (
        <Table head={["Date", "Employee", "Detected", "Approved", "Status", ""]}>
          {data.data.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-2">{fmtDate(o.work_date)}</td>
              <td className="px-4 py-2">{o.employee_name}</td>
              <td className="px-4 py-2 tabular-nums">{minutes(o.minutes)}</td>
              <td className="px-4 py-2 tabular-nums">{o.approved_minutes != null ? minutes(o.approved_minutes) : "—"}</td>
              <td className="px-4 py-2">
                <StatusBadge value={o.status === "approved" ? "success" : o.status} label={o.approval_instance_id || o.status !== "pending" ? o.status : "not submitted"} />
              </td>
              <td className="px-4 py-2 text-right">
                {canManage && !o.approval_instance_id && o.status === "pending" && (
                  <Btn variant="ghost" busy={busy === o.id} onClick={() => run(o.id, () => hr.post(`/api/v1/attendance/overtime/${o.id}/submit`), "Sent for approval").then(() => data.reload())}>
                    Send for approval
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

export function CorrectionDrawer({ workDate, onClose, onDone }: { workDate?: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ work_date: workDate ?? today(), times: "", reason: "" })
  const [busy, run] = useRun()
  const offset = (() => {
    const m = -new Date().getTimezoneOffset()
    return `${m >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`
  })()
  const submit = () => {
    const punch_times = f.times
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.includes("T") ? t : `${f.work_date}T${t.length === 5 ? `${t}:00` : t}${offset}`))
    run("go", () => hr.post("/api/v1/attendance/corrections", { work_date: f.work_date, punch_times, reason: f.reason }), "Correction sent for approval").then((r) => r && onDone())
  }
  return (
    <Drawer open title="Request an attendance correction" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy === "go"} disabled={!f.times || f.reason.trim().length < 5} onClick={submit}>Submit</Btn></>}>
      <div className="space-y-3">
        <Field label="Date">
          <input type="date" className={inputCls} value={f.work_date} max={today()} onChange={(e) => setF({ ...f, work_date: e.target.value })} />
        </Field>
        <Field label="Missing punch times" hint="24-hour, comma separated, e.g. 17:05 or 08:58, 17:05. For a night shift's next-morning punch use a full date-time.">
          <input className={inputCls} value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} />
        </Field>
        <Field label="Reason" required>
          <textarea rows={3} className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>
      </div>
    </Drawer>
  )
}
