import { useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, ArrowRight, CalendarCheck2, CheckCircle2, Clock, Info, ShieldAlert, UserPlus, Users, Wallet } from "lucide-react"
import { hr } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES, categoryLabel, type Dashboard } from "../../services/hr/types"
import { Avatar, Empty, ErrorState, Loading, Panel, TEAL, ago, filterCls, fmtDate, fmtDateTime, humanize, useHr } from "./ui"
import useOrgRefs from "./useOrgRefs"

export type DashboardNav = {
  section: "employees" | "attendance" | "leave" | "approvals" | "payroll" | "recruitment" | "training" | "compliance" | "shifts"
  filters?: Record<string, string>
  employeeId?: string
}

// Validated status palette (light & dark, CVD-safe in this order): present, absent, leave, missed punch.
const SERIES = [
  { key: "present", label: "Present", color: "#0D9488" },
  { key: "absent", label: "Absent", color: "#E11D48" },
  { key: "leave", label: "On leave", color: "#8B5CF6" },
  { key: "exceptions", label: "Missed punch", color: "#D97706" },
] as const

type Extra = {
  attendance_trend: { date: string; present: number; absent: number; leave: number; exceptions: number; late: number }[]
  department_presence: { department_id: string; department: string; scheduled: number; present: number; absent: number; not_arrived: number; leave: number }[]
  attention: { kind: string; severity: "critical" | "warning" | "info"; count: number; title: string; detail: string; section: string }[]
}

export default function HrDashboard({ onNavigate }: { onNavigate: (to: DashboardNav) => void }) {
  const refs = useOrgRefs()
  const [f, setF] = useState({ branch_id: "", department_id: "", employee_category: "" })
  const d = useHr(() => hr.get<Dashboard & Extra>("/api/v1/hr/dashboard", f), [f])
  const now = new Date()
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">{greeting}</h2>
          <p className="text-[11.5px] text-[#64748B] font-medium">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · Real-time workforce metrics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={filterCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })} aria-label="Branch">
            <option value="">All branches</option>
            {refs.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className={filterCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })} aria-label="Department">
            <option value="">All departments</option>
            {refs.data?.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select className={filterCls} value={f.employee_category} onChange={(e) => setF({ ...f, employee_category: e.target.value })} aria-label="Category">
            <option value="">All staff types</option>
            {EMPLOYEE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      {d.loading && !d.data ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : d.data && d.data.employees.total === 0 ? (
        <Panel><Empty title="No employees recorded yet" hint="Set up departments under Organization, then add or import employees. Every figure here is computed from those records." /></Panel>
      ) : d.data ? <Body d={d.data} onNavigate={onNavigate} /> : null}
    </div>
  )
}

function Body({ d, onNavigate }: { d: Dashboard & Extra; onNavigate: (to: DashboardNav) => void }) {
  const a = d.attendance_today
  const w = d.workforce
  const punched = a.in + a.out + a.not_arrived
  const presentPct = punched ? Math.round(((a.in + a.out) / punched) * 100) : 0
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Hero icon={Users} label="Active staff" value={d.employees.active} sub={`${d.employees.total} on record · ${d.employees.inactive} inactive`} onClick={() => onNavigate({ section: "employees", filters: { status: "active" } })} />
        <Hero icon={Clock} label="Checked in now" value={a.in} sub={`${presentPct}% have punched today · ${a.not_arrived} not yet`} tone="teal" onClick={() => onNavigate({ section: "attendance" })} />
        <Hero icon={CalendarCheck2} label="On leave today" value={w.on_leave_today} sub={`${w.pending_leave} request${w.pending_leave === 1 ? "" : "s"} waiting`} tone="purple" onClick={() => onNavigate({ section: "leave" })} />
        <Hero icon={Wallet} label="Last payroll" value={w.last_payroll?.period ?? "—"} sub={w.last_payroll ? `${humanize(w.last_payroll.status)}${w.last_payroll.net ? ` · net ₹${Number(w.last_payroll.net).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : ""}` : "No run yet"} onClick={() => onNavigate({ section: "payroll" })} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Panel title="Needs attention">
          {!d.attention.length ? (
            <div className="flex items-center gap-2 text-sm text-[#16A34A] py-6 justify-center"><CheckCircle2 className="w-4 h-4" /> Nothing needs attention right now</div>
          ) : (
            <ul className="space-y-2">
              {d.attention.map((x) => {
                const Icon = x.severity === "critical" ? ShieldAlert : x.severity === "warning" ? AlertTriangle : Info
                const tone = x.severity === "critical" ? "border-rose-200 bg-rose-50 text-rose-900" : x.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[#DDE2EC] bg-[#F8FAFC] text-gray-800"
                return (
                  <li key={x.kind}>
                    <button onClick={() => onNavigate({ section: x.section as DashboardNav["section"] })} className={`w-full text-left flex gap-2.5 p-2.5 rounded border ${tone} hover:brightness-[0.98] transition cursor-pointer`}>
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">{x.title}</span>
                        <span className="block text-xs text-[#64748B]">{x.detail}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 mt-1 text-[#64748B]" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Attendance — last 14 days" className="xl:col-span-2">
          {d.attendance_trend.every((x) => !x.present && !x.absent && !x.leave) ? (
            <Empty title="No calculated attendance yet" hint="Publish rosters and connect devices; daily attendance appears here." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="88%">
                <BarChart data={d.attendance_trend.map((x) => ({ ...x, day: new Date(`${x.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }))} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#EEF1F6" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={{ fontSize: 12, borderRadius: 4, borderColor: "#DDE2EC" }}
                    formatter={(v, n) => [v as number, SERIES.find((s) => s.key === n)?.label ?? String(n)]}
                    labelFormatter={(l, p) => `${l}${p?.[0]?.payload?.late ? ` · ${p[0].payload.late} late` : ""}`} />
                  {SERIES.map((s, i) => (
                    <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="#fff" strokeWidth={1} radius={i === SERIES.length - 1 ? [2, 2, 0, 0] : 0} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <ul className="flex flex-wrap justify-center gap-4 text-xs text-[#64748B] -mt-1">
                {SERIES.map((s) => (
                  <li key={s.key} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.label}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Panel title="Today by department" className="xl:col-span-2">
          {!d.department_presence.length ? <Empty title="No one rostered today" /> : (
            <div className="space-y-2.5">
              {d.department_presence.map((x) => {
                const pct = x.scheduled ? Math.round((x.present / x.scheduled) * 100) : 0
                return (
                  <button key={x.department_id} onClick={() => onNavigate({ section: "attendance" })} className="w-full grid grid-cols-12 items-center gap-3 text-left group cursor-pointer hover:bg-gray-50/60 p-1 rounded transition-colors">
                    <span className="col-span-4 text-sm font-medium text-gray-700 truncate group-hover:text-gray-900">{x.department}</span>
                    <span className="col-span-5 h-2 rounded-full bg-gray-100 overflow-hidden flex" aria-label={`${pct}% present`}>
                      <span className="h-full" style={{ width: `${x.scheduled ? (x.present / x.scheduled) * 100 : 0}%`, background: "#0D9488" }} />
                      <span className="h-full border-l-2 border-white" style={{ width: `${x.scheduled ? (x.absent / x.scheduled) * 100 : 0}%`, background: "#E11D48" }} />
                    </span>
                    <span className="col-span-3 text-xs text-[#64748B] tabular-nums text-right">
                      <span className="text-gray-900 font-semibold">{x.present}</span>/{x.scheduled} present{x.not_arrived ? ` · ${x.not_arrived} pending` : ""}{x.absent ? ` · ${x.absent} absent` : ""}{x.leave ? ` · ${x.leave} leave` : ""}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Workforce mix">
          {(() => {
            const rows = Object.entries(d.employees.by_category).sort((x, y) => y[1] - x[1])
            const max = Math.max(1, ...rows.map((r) => r[1]))
            return !rows.length ? <Empty title="No active staff" /> : (
              <ul className="space-y-1.5">
                {rows.map(([k, v]) => (
                  <li key={k}>
                    <button onClick={() => onNavigate({ section: "employees", filters: { employee_category: k, status: "active" } })} className="w-full flex items-center gap-2 text-sm group cursor-pointer hover:bg-gray-50/60 p-1 rounded transition-colors">
                      <span className="w-32 text-left text-gray-600 truncate group-hover:text-gray-900 font-medium">{categoryLabel(k)}</span>
                      <span className="flex-1 h-2 rounded-full bg-gray-100"><span className="block h-2 rounded-full" style={{ width: `${(v / max) * 100}%`, background: TEAL }} /></span>
                      <span className="w-8 text-right font-mono tabular-nums text-gray-900 font-semibold">{v}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          })()}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Pipeline & development">
          <dl className="grid grid-cols-2 gap-2">
            <Stat label="Open vacancies" value={w.open_vacancies} onClick={() => onNavigate({ section: "recruitment" })} />
            <Stat label="Candidates in pipeline" value={w.candidates_in_pipeline} onClick={() => onNavigate({ section: "recruitment" })} />
            <Stat label="Training gaps" value={w.training_gaps} warn={w.training_gaps > 0} onClick={() => onNavigate({ section: "training" })} />
            <Stat label="Certificates expiring (60 d)" value={w.certificates_expiring_60d} warn={w.certificates_expiring_60d > 0} onClick={() => onNavigate({ section: "compliance" })} />
            <Stat label="Approvals pending" value={w.pending_approvals} onClick={() => onNavigate({ section: "approvals" })} />
            <Stat label="Devices online" value={`${a.devices.online ?? 0}/${Object.values(a.devices).reduce((s, n) => s + n, 0)}`} sub={`last sync ${ago(a.last_sync_at)}`} />
          </dl>
        </Panel>
        <Panel title="Registrations expiring">
          {!d.credentials.expiring.length ? <p className="text-sm text-[#64748B] py-4 text-center">None in the next 60 days</p> : (
            <ul className="divide-y divide-[#EEF1F6]">
              {d.credentials.expiring.slice(0, 6).map((c) => (
                <li key={`${c.employee_id}-${c.number}`}>
                  <button className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-gray-50 rounded transition-colors cursor-pointer" onClick={() => onNavigate({ section: "employees", employeeId: c.employee_id })}>
                    <Avatar name={c.employee_name} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{c.employee_name}</span>
                      <span className="block text-[11px] text-[#64748B]">{humanize(c.credential_type)} · {fmtDate(c.expires_on)}</span>
                    </span>
                    <span className={`text-xs font-mono tabular-nums ${c.days_left < 0 ? "text-rose-700 font-semibold" : c.days_left < 15 ? "text-amber-700 font-semibold" : "text-[#64748B]"}`}>{c.days_left < 0 ? "expired" : `${c.days_left} d`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent activity">
          {!d.recent_activity.length ? <p className="text-sm text-[#64748B]">Nothing yet.</p> : (
            <ul className="space-y-2.5">
              {d.recent_activity.slice(0, 7).map((r, i) => (
                <li key={i}>
                  <button className="w-full flex gap-2.5 text-left hover:bg-gray-50 p-1.5 rounded transition-colors cursor-pointer" onClick={() => onNavigate({ section: "employees", employeeId: r.employee_id })}>
                    <Avatar name={r.employee_name} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-xs text-gray-800"><span className="font-semibold text-gray-900">{r.employee_name}</span> · {r.summary}</span>
                      <span className="block text-[10.5px] text-[#64748B]">{fmtDateTime(r.occurred_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <QuickActions onNavigate={onNavigate} />
    </>
  )
}

function Hero({ icon: Icon, label, value, sub, tone, onClick }: { icon: typeof Users; label: string; value: React.ReactNode; sub: string; tone?: "teal" | "purple"; onClick?: () => void }) {
  const accent = tone === "teal" ? "bg-blue-50 text-[#1B4FD8] border border-blue-100" : tone === "purple" ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-gray-50 text-gray-600 border border-[#DDE2EC]"
  return (
    <button onClick={onClick} className="text-left bg-white border border-[#DDE2EC] rounded p-4 shadow-2xs hover:border-[#1B4FD8] hover:shadow-xs transition cursor-pointer">
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded inline-flex items-center justify-center shrink-0 ${accent}`}><Icon className="w-4 h-4" /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">{label}</span>
      </div>
      <div className="text-2xl font-bold font-mono text-gray-900 mt-2 tabular-nums">{value}</div>
      <div className="text-[11.5px] text-[#64748B] mt-0.5">{sub}</div>
    </button>
  )
}

function Stat({ label, value, sub, warn, onClick }: { label: string; value: React.ReactNode; sub?: string; warn?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag onClick={onClick} className={`text-left p-3 rounded bg-[#F8FAFC] border border-[#DDE2EC] transition ${onClick ? "hover:bg-gray-100/80 cursor-pointer" : ""}`}>
      <dt className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">{label}</dt>
      <dd className={`text-base md:text-lg font-bold font-mono tabular-nums mt-0.5 ${warn ? "text-[#D97706]" : "text-gray-900"}`}>{value}</dd>
      {sub && <dd className="text-[10px] text-[#64748B] mt-0.5">{sub}</dd>}
    </Tag>
  )
}

function QuickActions({ onNavigate }: { onNavigate: (to: DashboardNav) => void }) {
  const items: { label: string; to: DashboardNav; Icon: typeof Users }[] = [
    { label: "Add employee", to: { section: "employees" }, Icon: UserPlus },
    { label: "Build roster", to: { section: "shifts" }, Icon: CalendarCheck2 },
    { label: "Review approvals", to: { section: "approvals" }, Icon: CheckCircle2 },
    { label: "Run payroll", to: { section: "payroll" }, Icon: Wallet },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ label, to, Icon }) => (
        <button key={label} onClick={() => onNavigate(to)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded border border-[#DDE2EC] bg-white text-gray-700 hover:border-[#1B4FD8] hover:text-[#1B4FD8] shadow-2xs transition-colors cursor-pointer">
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
  )
}
