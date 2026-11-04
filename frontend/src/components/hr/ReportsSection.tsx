import { useState } from "react"
import { Download, Megaphone, Play } from "lucide-react"
import { hr } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Loading, PageHeader, Panel, Table, Tabs, filterCls, fmtDateTime, inputCls, useHr, useRun } from "./ui"
import useOrgRefs from "./useOrgRefs"

type Report = { key: string; title: string; filters: any; columns: { key: string; label: string }[]; rows: Record<string, any>[]; generated_at: string }
const RANGE_REPORTS = ["attendance_summary", "overtime", "leave_register", "shift_coverage"]
const PERIOD_REPORTS = ["payroll_register"]

export default function ReportsSection() {
  const [tab, setTab] = useState<"reports" | "scheduled">("reports")
  return (
    <div>
      <PageHeader title="Reports & analytics" subtitle="Computed from live HR records; exports are audited" />
      <Tabs value={tab} onChange={setTab} items={[{ id: "reports", label: "Reports" }, { id: "scheduled", label: "Scheduled & delivered" }]} />
      {tab === "reports" ? <Runner /> : <Scheduled />}
    </div>
  )
}

function Runner() {
  const cat = useHr(() => hr.get<{ key: string; title: string; available: boolean }[]>("/api/v1/reports/hr"), [])
  const refs = useOrgRefs()
  const today = new Date().toLocaleDateString("en-CA")
  const [key, setKey] = useState("")
  const [f, setF] = useState({ date_from: today.slice(0, 8) + "01", date_to: today, department_id: "", branch_id: "", employee_category: "", year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1) })
  const [report, setReport] = useState<Report | null>(null)
  const [busy, run] = useRun()
  const params = () => {
    const p: Record<string, string> = {}
    if (RANGE_REPORTS.includes(key)) Object.assign(p, { date_from: f.date_from, date_to: f.date_to })
    if (PERIOD_REPORTS.includes(key) || key === "leave_balances") Object.assign(p, { year: f.year, ...(PERIOD_REPORTS.includes(key) ? { month: f.month } : {}) })
    for (const k of ["department_id", "branch_id", "employee_category"] as const) if (f[k]) p[k] = f[k]
    return p
  }
  const go = () => run("run", () => hr.get<Report>(`/api/v1/reports/hr/${key}`, params())).then((r) => r && setReport(r))
  if (cat.loading && !cat.data) return <Loading />
  if (cat.error) return <ErrorState error={cat.error} />
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Report">
            <select className={filterCls + " max-w-none"} value={key} onChange={(e) => { setKey(e.target.value); setReport(null) }}>
              <option value="">Choose…</option>
              {cat.data!.map((r) => <option key={r.key} value={r.key} disabled={!r.available}>{r.title}{r.available ? "" : " (no access)"}</option>)}
            </select>
          </Field>
          {RANGE_REPORTS.includes(key) && (
            <>
              <Field label="From"><input type="date" className={filterCls} value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></Field>
              <Field label="To"><input type="date" className={filterCls} value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></Field>
            </>
          )}
          {(PERIOD_REPORTS.includes(key) || key === "leave_balances") && (
            <>
              {PERIOD_REPORTS.includes(key) && <Field label="Month"><input className={filterCls + " w-16"} value={f.month} onChange={(e) => setF({ ...f, month: e.target.value.replace(/\D/g, "") })} /></Field>}
              <Field label="Year"><input className={filterCls + " w-20"} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, "") })} /></Field>
            </>
          )}
          {["employees", "headcount", "attendance_summary", "leave_balances"].includes(key) && (
            <>
              <Field label="Department"><select className={filterCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">All</option>{refs.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Category"><select className={filterCls} value={f.employee_category} onChange={(e) => setF({ ...f, employee_category: e.target.value })}><option value="">All</option>{EMPLOYEE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            </>
          )}
          <Btn variant="primary" busy={busy === "run"} disabled={!key} onClick={go}><Play className="w-3.5 h-3.5" /> Run</Btn>
          {report && <Btn onClick={() => window.open(hr.href(`/api/v1/reports/hr/${key}/export.csv`, params()), "_blank")}><Download className="w-3.5 h-3.5" /> CSV</Btn>}
          {key && <ScheduleButton reportKey={key} filters={params()} />}
        </div>
      </Panel>
      {report && (
        <Panel title={`${report.title} · ${report.rows.length} rows · ${fmtDateTime(report.generated_at)}`}>
          {!report.rows.length ? <Empty title="No rows" /> : (
            <Table head={report.columns.map((c) => c.label)}>
              {report.rows.slice(0, 500).map((r, i) => (
                <tr key={i}>{report.columns.map((c) => <td key={c.key} className="px-4 py-1.5 whitespace-nowrap">{r[c.key] === null || r[c.key] === undefined ? "—" : String(r[c.key])}</td>)}</tr>
              ))}
            </Table>
          )}
          {report.rows.length > 500 && <p className="text-xs text-gray-500 mt-2">Showing 500 of {report.rows.length}; the CSV has all rows.</p>}
        </Panel>
      )}
    </div>
  )
}

function ScheduleButton({ reportKey, filters }: { reportKey: string; filters: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ frequency: "weekly", recipients: "" })
  const [busy, run] = useRun()
  return (
    <>
      <Btn onClick={() => setOpen(true)}>Schedule</Btn>
      {open && (
        <Drawer open title="Schedule this report" onClose={() => setOpen(false)} footer={<><Btn onClick={() => setOpen(false)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.recipients.trim()} onClick={() => run("s", () => hr.post("/api/v1/reports/hr/schedules", { report: reportKey, filters, frequency: f.frequency, recipients: f.recipients.split(",").map((x) => x.trim()).filter(Boolean) }), "Scheduled; first run within 10 minutes").then((r) => r && setOpen(false))}>Save</Btn></>}>
          <div className="space-y-3">
            <Field label="Frequency"><select className={inputCls} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
            <Field label="Recipients (HMS usernames, comma separated)" hint="They download it from Reports → Scheduled & delivered; nothing is emailed."><input className={inputCls} value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} /></Field>
          </div>
        </Drawer>
      )}
    </>
  )
}

function Scheduled() {
  const runs = useHr(() => hr.get<any[]>("/api/v1/reports/hr/runs"), [])
  return (
    <Panel title="Delivered reports">
      {runs.loading && !runs.data ? <Loading /> : !runs.data?.length ? <Empty title="No scheduled report runs for you yet" /> : (
        <Table head={["Report", "Generated", "Rows", "Status", ""]}>
          {runs.data.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">{r.report}</td>
              <td className="px-4 py-2">{fmtDateTime(r.created_at)}</td>
              <td className="px-4 py-2 tabular-nums">{r.rows}</td>
              <td className="px-4 py-2">{r.status === "ok" ? "Ready" : `Failed: ${r.error}`}</td>
              <td className="px-4 py-2 text-right">{r.has_file && <Btn variant="ghost" onClick={() => window.open(hr.href(`/api/v1/reports/hr/runs/${r.id}/download`), "_blank")}><Download className="w-3.5 h-3.5" /></Btn>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

export function Announcements({ canEdit }: { canEdit: boolean }) {
  const refs = useOrgRefs()
  const list = useHr(() => hr.get<any[]>("/api/v1/hr/announcements"), [])
  const [f, setF] = useState<any>(null)
  const [busy, run] = useRun()
  return (
    <div>
      <PageHeader title="Announcements" subtitle="Shown in My HR and the notification bell for the audience you choose" actions={canEdit && <Btn variant="primary" onClick={() => setF({ title: "", body: "", priority: "normal", everyone: true, departments: [] as string[], expires_at: "" })}><Megaphone className="w-3.5 h-3.5" /> New announcement</Btn>} />
      <Panel>
        {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No announcements" /> : (
          <ul className="divide-y divide-[#DDE2EC]">
            {list.data.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex justify-between gap-2"><span className="font-medium text-gray-900">{a.title}{a.priority === "important" && <span className="ml-2 text-[11px] text-rose-700 font-semibold">important</span>}</span><span className="text-[11px] text-gray-400">{fmtDateTime(a.published_at)} · {a.created_by}</span></div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap mt-0.5">{a.body}</p>
                <p className="text-[11px] text-gray-400 mt-1">{a.audience.all ? "Everyone" : `${(a.audience.departments ?? []).length} departments`}{a.expires_at && ` · until ${fmtDateTime(a.expires_at)}`}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {f && (
        <Drawer open title="New announcement" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={f.title.length < 3 || f.body.length < 3 || (!f.everyone && !f.departments.length)} onClick={() => run("s", () => hr.post("/api/v1/hr/announcements", { title: f.title, body: f.body, priority: f.priority, audience: f.everyone ? { all: true } : { departments: f.departments }, expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null }), "Announcement published").then((r) => { if (r) { setF(null); list.reload() } })}>Publish</Btn></>}>
          <div className="space-y-3">
            <Field label="Title" required><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Message" required><textarea rows={5} className={inputCls} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <Field label="Priority"><select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option></select></Field>
            <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.everyone} onChange={(e) => setF({ ...f, everyone: e.target.checked })} /> Everyone</label>
            {!f.everyone && (
              <div className="max-h-48 overflow-y-auto border border-[#DDE2EC] rounded p-2 space-y-1 bg-white">
                {refs.data?.departments.map((d) => <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.departments.includes(d.id)} onChange={(e) => setF({ ...f, departments: e.target.checked ? [...f.departments, d.id] : f.departments.filter((x: string) => x !== d.id) })} />{d.name}</label>)}
              </div>
            )}
            <Field label="Expires"><input type="datetime-local" className={inputCls} value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} /></Field>
          </div>
        </Drawer>
      )}
    </div>
  )
}
