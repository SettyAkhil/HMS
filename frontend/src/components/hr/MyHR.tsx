// Employee self-service. Every request is answered from the signed-in login
// (the server resolves "me"), so nothing here can show a colleague's record.
import { useState } from "react"
import { CalendarDays, Clock, FileText, GraduationCap, Home, Inbox, MessageSquareWarning, Printer, Repeat, Star, Wallet } from "lucide-react"
import { hr } from "../../services/hr/client"
import { Btn, Drawer, Empty, ErrorState, Field, Kpi, Loading, PageHeader, Panel, StatusBadge, Table, fmtDate, fmtDateTime, fmtTime, humanize, inputCls, minutes, money, useHr, useRun } from "./ui"
import { ApplyLeave, type Balance, type LeaveRequest } from "./LeaveSection"
import { CorrectionDrawer, MonthlyCalendar } from "./AttendanceRecords"
import { DocumentsTab, TrainingTab } from "./ProfileTabs"
import { Reviews } from "./PerformanceSection"
import { Cases } from "./GrievancesSection"
import { PayslipBody } from "./PayrollSection"
import ApprovalsSection from "./ApprovalsSection"

type Section = "home" | "attendance" | "shifts" | "leave" | "payslips" | "documents" | "training" | "performance" | "grievances" | "requests"
type Overview = {
  employee: { id: string; full_name: string; employee_code: string; designation: string | null; departments: { department_name: string; is_primary: boolean; effective_to: string | null }[] }
  today: { status: string | null; first_in: string | null; worked_minutes: number }
  upcoming_shifts: { id: string; work_date: string; shift_name: string | null; start_time: string | null; end_time: string | null; is_weekly_off: boolean; department_id: string }[]
  leave_balances: Balance[]
  pending_leave: LeaveRequest[]
  announcements: { id: string; title: string; body: string; priority: string; published_at: string; by: string }[]
}

export default function MyHR() {
  const [section, setSection] = useState<Section>("home")
  const me = useHr(() => hr.get<Overview>("/api/v1/me"), [section])
  const items: { id: Section; label: string; Icon: typeof Home }[] = [
    { id: "home", label: "Overview", Icon: Home },
    { id: "attendance", label: "My attendance", Icon: Clock },
    { id: "shifts", label: "My shifts", Icon: CalendarDays },
    { id: "leave", label: "My leave", Icon: CalendarDays },
    { id: "payslips", label: "My payslips", Icon: Wallet },
    { id: "documents", label: "My documents", Icon: FileText },
    { id: "training", label: "My training", Icon: GraduationCap },
    { id: "performance", label: "My reviews", Icon: Star },
    { id: "grievances", label: "Grievances", Icon: MessageSquareWarning },
    { id: "requests", label: "Requests & approvals", Icon: Inbox },
  ]
  if (me.error)
    return (
      <Panel>
        <ErrorState error={me.error} onRetry={me.reload} />
      </Panel>
    )
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <nav className="lg:w-52 shrink-0 flex lg:flex-col gap-1 overflow-x-auto" aria-label="My HR sections">
        {items.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined} className={`flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap text-left ${section === id ? "bg-[#1B4FD8] text-white font-medium" : "text-gray-600 hover:bg-[#F0F2F5] hover:text-gray-900"}`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-w-0">
        {!me.data ? (
          <Loading />
        ) : (
          <>
            {section === "home" && <Home_ me={me.data} go={setSection} />}
            {section === "attendance" && <MyAttendance employeeId={me.data.employee.id} />}
            {section === "shifts" && <MyShifts me={me.data} />}
            {section === "leave" && <MyLeave onChange={me.reload} />}
            {section === "payslips" && <MyPayslips name={me.data.employee.full_name} />}
            {section === "documents" && (
              <>
                <PageHeader title="My documents" subtitle="Upload renewals here; HR verifies them" />
                <DocumentsTab employeeId={me.data.employee.id} canManage={false} self />
              </>
            )}
            {section === "training" && (
              <>
                <PageHeader title="My training" />
                <TrainingTab employeeId={me.data.employee.id} />
              </>
            )}
            {section === "performance" && (
              <>
                <PageHeader title="My reviews" subtitle="Self-assessments and reviews you give as a manager" />
                <Reviews mine />
              </>
            )}
            {section === "grievances" && (
              <>
                <PageHeader title="Grievances" subtitle="Confidential" />
                <Cases own />
              </>
            )}
            {section === "requests" && <ApprovalsSection isAdmin={false} />}
          </>
        )}
      </div>
    </div>
  )
}

function Home_({ me, go }: { me: Overview; go: (s: Section) => void }) {
  const dept = me.employee.departments.find((d) => d.is_primary && !d.effective_to)?.department_name
  const next = me.upcoming_shifts.filter((s) => !s.is_weekly_off).slice(0, 5)
  return (
    <div className="space-y-4">
      <PageHeader title={`Hello, ${me.employee.full_name.split(" ")[0]}`} subtitle={`${me.employee.employee_code} · ${me.employee.designation ?? ""}${dept ? ` · ${dept}` : ""}`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Today" value={me.today.status ? humanize(me.today.status) : "—"} hint={me.today.first_in ? `In at ${fmtTime(me.today.first_in)}` : undefined} tone="good" onClick={() => go("attendance")} />
        <Kpi label="Worked today" value={minutes(me.today.worked_minutes)} />
        <Kpi label="Leave available" value={me.leave_balances.filter((b) => b.paid).reduce((a, b) => a + Number(b.available), 0)} hint="paid days, all types" onClick={() => go("leave")} />
        <Kpi label="Pending leave" value={me.pending_leave.length} tone={me.pending_leave.length ? "warn" : "neutral"} onClick={() => go("leave")} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Next shifts" actions={<Btn variant="ghost" onClick={() => go("shifts")}>Roster</Btn>}>
          {!next.length ? <Empty title="No upcoming shifts published" /> : (
            <ul className="divide-y divide-[#DDE2EC] text-sm">
              {next.map((s) => (
                <li key={s.id} className="py-2 flex justify-between">
                  <span className="font-medium text-gray-900">{fmtDate(s.work_date)}</span>
                  <span className="text-gray-600">{s.shift_name} {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Announcements">
          {!me.announcements.length ? <Empty title="No announcements" /> : (
            <ul className="space-y-2">
              {me.announcements.map((a) => (
                <li key={a.id} className="py-1">
                  <div className="text-sm font-medium text-gray-900">{a.title}{a.priority === "important" && <span className="ml-2 text-[11px] text-rose-700 font-semibold">important</span>}</div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap mt-0.5">{a.body}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{fmtDateTime(a.published_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function MyAttendance({ employeeId }: { employeeId: string }) {
  const [correcting, setCorrecting] = useState(false)
  const corrections = useHr(() => hr.get<any[]>("/api/v1/me/corrections"), [correcting])
  return (
    <div className="space-y-4">
      <PageHeader title="My attendance" subtitle="Calculated from your biometric punches and roster" actions={<Btn variant="primary" onClick={() => setCorrecting(true)}>Request a correction</Btn>} />
      <MonthlyCalendar employeeId={employeeId} />
      <Panel title="My correction requests">
        {!corrections.data?.length ? <Empty title="None" /> : (
          <Table head={["Date", "Punches", "Reason", "Status"]}>
            {corrections.data.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">{fmtDate(c.work_date)}</td>
                <td className="px-4 py-2">{c.punch_times.map((t: string) => fmtTime(t)).join(", ")}</td>
                <td className="px-4 py-2 text-gray-600">{c.reason}</td>
                <td className="px-4 py-2"><StatusBadge value={c.status === "approved" ? "success" : c.status} label={c.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {correcting && <CorrectionDrawer onClose={() => setCorrecting(false)} onDone={() => setCorrecting(false)} />}
    </div>
  )
}

function MyShifts({ me }: { me: Overview }) {
  const [swap, setSwap] = useState<Overview["upcoming_shifts"][number] | null>(null)
  const [handover, setHandover] = useState(false)
  return (
    <div className="space-y-4">
      <PageHeader title="My shifts" subtitle="Published roster for the next two weeks" actions={<Btn onClick={() => setHandover(true)}>Record handover</Btn>} />
      <Panel>
        {!me.upcoming_shifts.length ? <Empty title="No published shifts" /> : (
          <Table head={["Date", "Shift", "Hours", ""]}>
            {me.upcoming_shifts.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(s.work_date)}</td>
                <td className="px-4 py-2">{s.is_weekly_off ? "Weekly off" : s.shift_name}</td>
                <td className="px-4 py-2">{s.start_time ? `${s.start_time.slice(0, 5)}–${s.end_time?.slice(0, 5)}` : "—"}</td>
                <td className="px-4 py-2 text-right">{!s.is_weekly_off && <Btn variant="ghost" onClick={() => setSwap(s)}><Repeat className="w-3.5 h-3.5" /> Swap / cover</Btn>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {swap && <SwapDrawer shift={swap} onClose={() => setSwap(null)} />}
      {handover && <HandoverDrawer me={me} onClose={() => setHandover(false)} />}
    </div>
  )
}

function SwapDrawer({ shift, onClose }: { shift: Overview["upcoming_shifts"][number]; onClose: () => void }) {
  const peers = useHr(() => hr.get<{ employee_id: string; name: string; state: string }[]>("/api/v1/me/colleagues", { day: shift.work_date }), [shift.id])
  const [f, setF] = useState({ counterpart_employee_id: "", reason: "" })
  const [busy, run] = useRun()
  return (
    <Drawer open title={`Ask for cover: ${fmtDate(shift.work_date)} ${shift.shift_name ?? ""}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.counterpart_employee_id || f.reason.length < 3} onClick={() => run("s", () => hr.post("/api/v1/workforce/swaps", { kind: "replacement", requester_assignment_id: shift.id, counterpart_employee_id: f.counterpart_employee_id, reason: f.reason }), "Request sent to your department head").then((r) => r && onClose())}>Send request</Btn></>}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">A colleague who is free that day covers your shift. Your department head approves it and the roster updates itself.</p>
        {peers.loading && !peers.data ? <Loading /> : !peers.data?.length ? <Empty title="No colleagues in your department" /> : (
          <ul className="border border-[#DDE2EC] rounded divide-y divide-[#DDE2EC] max-h-64 overflow-y-auto">
            {peers.data.map((p) => (
              <li key={p.employee_id}>
                <button disabled={p.state !== "free"} onClick={() => setF({ ...f, counterpart_employee_id: p.employee_id })} className={`w-full flex justify-between px-3 py-2 text-sm text-left disabled:opacity-50 ${f.counterpart_employee_id === p.employee_id ? "bg-[#1B4FD8]/10 text-[#1B4FD8] font-medium" : "hover:bg-[#F8FAFC] text-gray-800"}`}>
                  <span>{p.name}</span>
                  <StatusBadge value={p.state === "free" ? "success" : "draft"} label={humanize(p.state)} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Field label="Reason" required><textarea rows={3} className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
    </Drawer>
  )
}

function HandoverDrawer({ me, onClose }: { me: Overview; onClose: () => void }) {
  const today = new Date().toLocaleDateString("en-CA")
  const todayShift = me.upcoming_shifts.find((s) => s.work_date === today)
  const [notes, setNotes] = useState("")
  const [busy, run] = useRun()
  return (
    <Drawer open title="Shift handover" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!todayShift || notes.length < 3} onClick={() => run("s", () => hr.post("/api/v1/workforce/handovers", { department_id: todayShift!.department_id, work_date: today, from_employee_id: me.employee.id, notes }), "Handover recorded").then((r) => r && onClose())}>Save</Btn></>}>
      {!todayShift ? <Empty title="You have no shift today to hand over" /> : <Field label="Handover notes" hint="Pending tasks, patients to watch, equipment issues"><textarea rows={8} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>}
    </Drawer>
  )
}

function MyLeave({ onChange }: { onChange: () => void }) {
  const data = useHr(() => hr.get<{ balances: Balance[]; requests: LeaveRequest[] }>("/api/v1/me/leave"), [])
  const [applying, setApplying] = useState(false)
  const [busy, run] = useRun()
  const reload = () => { data.reload(); onChange() }
  return (
    <div className="space-y-4">
      <PageHeader title="My leave" actions={<Btn variant="primary" onClick={() => setApplying(true)}>Apply for leave</Btn>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.data?.balances.map((b) => <Kpi key={b.leave_type_id} label={b.name} value={Number(b.available)} hint={`${Number(b.used)} used · ${Number(b.pending)} pending`} />)}
      </div>
      <Panel title="My requests">
        {!data.data?.requests.length ? <Empty title="No leave requests" /> : (
          <Table head={["Type", "Dates", "Days", "Status", ""]}>
            {data.data.requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">{r.leave_type}</td>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(r.start_date)}{r.end_date !== r.start_date && ` – ${fmtDate(r.end_date)}`}</td>
                <td className="px-4 py-2 tabular-nums">{Number(r.days)}</td>
                <td className="px-4 py-2"><StatusBadge value={r.status === "approved" ? "success" : r.status} label={r.status} /></td>
                <td className="px-4 py-2 text-right">
                  {(r.status === "pending" || (r.status === "approved" && r.start_date > new Date().toLocaleDateString("en-CA"))) && (
                    <Btn variant="ghost" busy={busy === r.id} onClick={() => run(r.id, () => hr.post(`/api/v1/hr/leave/requests/${r.id}/cancel`, { reason: "Cancelled by employee" }), "Leave cancelled").then(reload)}>Cancel</Btn>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {applying && <ApplyLeave onClose={() => setApplying(false)} onDone={() => { setApplying(false); reload() }} />}
    </div>
  )
}

function MyPayslips({ name }: { name: string }) {
  const list = useHr(() => hr.get<{ id: string; number: string; period: string; net: string }[]>("/api/v1/me/payslips"), [])
  const [open, setOpen] = useState<string | null>(null)
  const slip = useHr(() => (open ? hr.get<any>(`/api/v1/payroll/payslips/${open}`) : Promise.resolve(null)), [open])
  return (
    <div className="space-y-4">
      <PageHeader title="My payslips" />
      <Panel>
        {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No payslips yet" /> : (
          <Table head={["Period", "Number", "Net pay", ""]}>
            {list.data.map((p) => (
              <tr key={p.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setOpen(p.id)}>
                <td className="px-4 py-2">{p.period}</td>
                <td className="px-4 py-2 font-mono text-xs">{p.number}</td>
                <td className="px-4 py-2 tabular-nums font-semibold text-gray-900">{money(p.net)}</td>
                <td className="px-4 py-2 text-right text-xs text-[#1B4FD8] font-medium">View</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {open && (
        <Drawer open title="Payslip" onClose={() => setOpen(null)} footer={<Btn onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print</Btn>}>
          {slip.loading || !slip.data ? <Loading /> : (
            <div className="printable-area">
              <h3 className="text-base font-semibold">{slip.data.snapshot.period}</h3>
              <p className="text-xs text-gray-500 mb-3">{name} · {slip.data.snapshot.employee.code} · {slip.data.snapshot.employee.designation ?? ""} · {slip.data.number}{slip.data.snapshot.employee.bank && ` · ${slip.data.snapshot.employee.bank}`}</p>
              <PayslipBody item={slip.data.snapshot} />
            </div>
          )}
        </Drawer>
      )}
    </div>
  )
}
