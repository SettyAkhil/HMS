import { useState } from "react"
import { Plus } from "lucide-react"
import { hr } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES, type EmployeeListItem, type Page } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, filterCls, fmtDate, inputCls, useHr, useRun } from "./ui"
import useOrgRefs from "./useOrgRefs"

export type LeaveType = { id: string; code: string; name: string; paid: boolean; allow_half_day: boolean; max_consecutive_days: number | null; document_required_after_days: number | null; is_emergency: boolean; color: string | null }
export type LeaveRequest = { id: string; employee_id: string; employee_name: string; employee_code: string; leave_type: string; start_date: string; end_date: string; half_day: string | null; days: string; reason: string; status: string; approval_instance_id: string | null; created_at: string }
export type Balance = { leave_type_id: string; code: string; name: string; paid: boolean; allocated: string; accrued: string; carried_forward: string; adjusted: string; used: string; pending: string; available: string }

export default function LeaveSection({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<"requests" | "calendar" | "balances" | "setup">("requests")
  return (
    <div>
      <PageHeader title="Leave" subtitle="Requests, team calendar, balances, leave types and policies" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "requests", label: "Requests" },
          { id: "calendar", label: "Leave calendar" },
          { id: "balances", label: "Balances" },
          ...(canEdit ? [{ id: "setup" as const, label: "Types & policies" }] : []),
        ]}
      />
      {tab === "requests" && <Requests canEdit={canEdit} />}
      {tab === "calendar" && <Calendar />}
      {tab === "balances" && <Balances canEdit={canEdit} />}
      {tab === "setup" && <Setup />}
    </div>
  )
}

function Requests({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState("pending")
  const [version, setVersion] = useState(0)
  const list = useHr(() => hr.get<LeaveRequest[]>("/api/v1/hr/leave/requests", { status: status || undefined }), [status, version])
  const [applying, setApplying] = useState(false)
  const [busy, run] = useRun()
  return (
    <Panel
      title="Leave requests"
      actions={
        <div className="flex gap-2">
          <select className={filterCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All</option>
            {["pending", "approved", "rejected", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {canEdit && (
            <Btn variant="primary" onClick={() => setApplying(true)}>
              <Plus className="w-3.5 h-3.5" /> Enter leave for an employee
            </Btn>
          )}
        </div>
      }
    >
      <p className="text-[11px] text-[#64748B] mb-2">Approve or reject from Approvals; each request follows the leave approval rule (manager, then HR for longer leave).</p>
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <Empty title="No leave requests" />
      ) : (
        <Table head={["Employee", "Type", "Dates", "Days", "Reason", "Status", ""]}>
          {list.data.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">
                <span className="font-semibold text-gray-900">{r.employee_name}</span> <span className="text-[11px] text-[#64748B] font-mono">{r.employee_code}</span>
              </td>
              <td className="px-4 py-2 font-medium">{r.leave_type}</td>
              <td className="px-4 py-2 whitespace-nowrap">
                {fmtDate(r.start_date)}
                {r.end_date !== r.start_date && ` – ${fmtDate(r.end_date)}`}
                {r.half_day && <span className="text-[11px] text-[#64748B]"> ({r.half_day} half)</span>}
              </td>
              <td className="px-4 py-2 tabular-nums font-mono">{Number(r.days)}</td>
              <td className="px-4 py-2 text-gray-700 max-w-xs truncate" title={r.reason}>
                {r.reason}
              </td>
              <td className="px-4 py-2">
                <StatusBadge value={r.status === "approved" ? "success" : r.status} label={r.status} />
              </td>
              <td className="px-4 py-2 text-right">
                {canEdit && ["pending", "approved"].includes(r.status) && (
                  <Btn
                    variant="ghost"
                    busy={busy === r.id}
                    onClick={() => {
                      const reason = window.prompt("Reason for cancelling this leave?")
                      if (reason && reason.trim().length >= 3) run(r.id, () => hr.post(`/api/v1/hr/leave/requests/${r.id}/cancel`, { reason }), "Leave cancelled").then(() => setVersion((v) => v + 1))
                    }}
                  >
                    Cancel
                  </Btn>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {applying && <ApplyLeave onClose={() => setApplying(false)} onDone={() => { setApplying(false); setVersion((v) => v + 1) }} onBehalf />}
    </Panel>
  )
}

export function ApplyLeave({ onClose, onDone, onBehalf }: { onClose: () => void; onDone: () => void; onBehalf?: boolean }) {
  const types = useHr(() => hr.get<LeaveType[]>("/api/v1/hr/leave/types"), [])
  const [f, setF] = useState({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", half_day: "", reason: "", emergency: false })
  const [q, setQ] = useState("")
  const people = useHr(() => (onBehalf && q.length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, status: "active", page_size: 8 }) : Promise.resolve(null)), [q])
  const [busy, run] = useRun()
  const type = types.data?.find((t) => t.id === f.leave_type_id)
  const submit = () =>
    run(
      "go",
      () =>
        hr.post("/api/v1/hr/leave/requests", {
          employee_id: onBehalf ? f.employee_id : undefined,
          leave_type_id: f.leave_type_id,
          start_date: f.start_date,
          end_date: f.half_day ? f.start_date : f.end_date || f.start_date,
          half_day: f.half_day || null,
          reason: f.reason,
          emergency: f.emergency,
        }),
      "Leave request submitted for approval",
    ).then((r) => r && onDone())
  return (
    <Drawer
      open
      title={onBehalf ? "Enter leave for an employee" : "Apply for leave"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy === "go"} disabled={!f.leave_type_id || !f.start_date || f.reason.trim().length < 3 || (onBehalf && !f.employee_id)} onClick={submit}>
            Submit
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        {onBehalf && (
          <>
            <Field label="Employee" required>
              <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search active staff (instant)" />
            </Field>
            {people.data?.items.map((p) => (
              <button key={p.id} onClick={() => setF({ ...f, employee_id: p.id })} className={`block w-full text-left px-3 py-1.5 text-sm rounded cursor-pointer transition-colors ${f.employee_id === p.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <span className="font-semibold text-gray-900">{p.full_name}</span> <span className="text-[11px] text-[#64748B] font-mono">{p.employee_code}</span>
              </button>
            ))}
          </>
        )}
        <Field label="Leave type" required>
          <select className={inputCls} value={f.leave_type_id} onChange={(e) => setF({ ...f, leave_type_id: e.target.value })}>
            <option value="">Select…</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.paid ? "" : " (unpaid)"}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" required>
            <input type="date" className={inputCls} value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className={inputCls} disabled={!!f.half_day} value={f.half_day ? f.start_date : f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
          </Field>
        </div>
        {type?.allow_half_day && (
          <Field label="Half day">
            <select className={inputCls} value={f.half_day} onChange={(e) => setF({ ...f, half_day: e.target.value })}>
              <option value="">Full day(s)</option>
              <option value="first">First half</option>
              <option value="second">Second half</option>
            </select>
          </Field>
        )}
        <Field label="Reason" required>
          <textarea rows={3} className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.emergency} onChange={(e) => setF({ ...f, emergency: e.target.checked })} /> Emergency leave
        </label>
        {type?.document_required_after_days !== null && type?.document_required_after_days !== undefined && (
          <p className="text-[11px] text-[#64748B]">A supporting document is needed beyond {type.document_required_after_days} days; upload it under Documents first.</p>
        )}
      </div>
    </Drawer>
  )
}

function Calendar() {
  const refs = useOrgRefs()
  const [dept, setDept] = useState("")
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("en-CA").slice(0, 7))
  const first = `${month}-01`
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toLocaleDateString("en-CA")
  const list = useHr(() => hr.get<LeaveRequest[]>("/api/v1/hr/leave/calendar", { date_from: first, date_to: last, department_id: dept || undefined }), [month, dept])
  const days = Array.from({ length: Number(last.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)
  const people = Array.from(new Map((list.data ?? []).map((r) => [r.employee_id, r.employee_name])).entries())
  return (
    <Panel
      title="Leave calendar"
      actions={
        <div className="flex gap-2">
          <input type="month" className={filterCls} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <select className={filterCls} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {refs.data?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {list.loading && !list.data ? (
        <Loading />
      ) : !people.length ? (
        <Empty title="No leave this month" />
      ) : (
        <div className="overflow-x-auto -mx-4">
          <table className="text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white px-4 py-1 text-left font-medium text-[#64748B] min-w-[160px]">Employee</th>
                {days.map((d) => (
                  <th key={d} className="w-6 text-center font-normal text-[#64748B]">
                    {Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map(([id, name]) => (
                <tr key={id}>
                  <td className="sticky left-0 bg-white px-4 py-1 text-sm text-gray-900 font-medium border-t border-[#EEF1F6]">{name}</td>
                  {days.map((d) => {
                    const r = list.data!.find((x) => x.employee_id === id && x.start_date <= d && x.end_date >= d)
                    return (
                      <td key={d} className="border-t border-[#EEF1F6] p-0.5" title={r ? `${r.leave_type} (${r.status})` : ""}>
                        {r && <div className={`h-4 rounded-xs ${r.status === "approved" ? "bg-[#16A34A]" : "bg-amber-400"}`} />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 pt-2 text-[11px] text-[#64748B]">
            <span className="inline-block w-3 h-3 bg-[#16A34A] rounded-xs align-middle" /> approved <span className="inline-block w-3 h-3 bg-amber-400 rounded-xs align-middle ml-3" /> pending
          </p>
        </div>
      )}
    </Panel>
  )
}

function Balances({ canEdit }: { canEdit: boolean }) {
  const [q, setQ] = useState("")
  const [emp, setEmp] = useState<EmployeeListItem | null>(null)
  const year = new Date().getFullYear()
  const people = useHr(() => (q.length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, page_size: 8 }) : Promise.resolve(null)), [q])
  const bal = useHr(() => (emp ? hr.get<Balance[]>(`/api/v1/hr/leave/balances/${emp.id}`, { year }) : Promise.resolve(null)), [emp?.id])
  const [busy, run] = useRun()
  const adjust = (b: Balance) => {
    const delta = window.prompt(`Adjust ${b.name} for ${emp!.full_name} by how many days? (negative to deduct)`)
    if (!delta || isNaN(Number(delta)) || Number(delta) === 0) return
    const reason = window.prompt("Reason for the adjustment?")
    if (!reason || reason.trim().length < 3) return
    run(b.leave_type_id, () => hr.post("/api/v1/hr/leave/balances/adjust", { employee_id: emp!.id, leave_type_id: b.leave_type_id, year, delta: Number(delta), reason }), "Balance adjusted").then(() => bal.reload())
  }
  const accrue = () => {
    const now = new Date()
    run("accrue", () => hr.post<{ balances_credited: number }>("/api/v1/hr/leave/accrual", { year: now.getFullYear(), month: now.getMonth() + 1 }), (r) => `Monthly accrual credited to ${r.balances_credited} balances`)
  }
  return (
    <Panel title="Leave balances" actions={canEdit && <Btn busy={busy === "accrue"} onClick={accrue}>Run this month's accrual</Btn>}>
      <div className="max-w-sm mb-3">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an employee (instant)" />
        {people.data?.items.map((p) => (
          <button key={p.id} onClick={() => { setEmp(p); setQ("") }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded transition-colors cursor-pointer">
            <span className="font-semibold text-gray-900">{p.full_name}</span> <span className="text-[11px] text-[#64748B] font-mono">{p.employee_code}</span>
          </button>
        ))}
      </div>
      {!emp ? (
        <Empty title="Choose an employee to see their balances" />
      ) : bal.loading && !bal.data ? (
        <Loading />
      ) : (
        <>
          <h4 className="text-sm font-medium mb-2">
            {emp.full_name} · {year}
          </h4>
          <Table head={["Leave type", "Allocated", "Accrued", "Carried", "Adjusted", "Used", "Pending", "Available", ""]}>
            {bal.data?.map((b) => (
              <tr key={b.leave_type_id}>
                <td className="px-4 py-2">{b.name}</td>
                {(["allocated", "accrued", "carried_forward", "adjusted", "used", "pending"] as const).map((k) => (
                  <td key={k} className="px-4 py-2 tabular-nums">
                    {Number(b[k])}
                  </td>
                ))}
                <td className="px-4 py-2 tabular-nums font-medium">{Number(b.available)}</td>
                <td className="px-4 py-2 text-right">{canEdit && <Btn variant="ghost" busy={busy === b.leave_type_id} onClick={() => adjust(b)}>Adjust</Btn>}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Panel>
  )
}

function Setup() {
  const types = useHr(() => hr.get<LeaveType[]>("/api/v1/hr/leave/types"), [])
  const policies = useHr(() => hr.get<any[]>("/api/v1/hr/leave/policies"), [])
  const [t, setT] = useState<any>(null)
  const [p, setP] = useState<any>(null)
  const [busy, run] = useRun()
  const tname = (id: string) => types.data?.find((x) => x.id === id)?.name ?? "—"
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Leave types" actions={<Btn variant="primary" onClick={() => setT({ code: "", name: "", paid: true, allow_half_day: true, max_consecutive_days: "", document_required_after_days: "", is_emergency: false })}><Plus className="w-3.5 h-3.5" /> New type</Btn>}>
        {!types.data?.length ? (
          <Empty title="No leave types" hint="e.g. Casual, Sick, Earned, Maternity, Loss of pay." />
        ) : (
          <Table head={["Code", "Name", "Paid", "Half day", "Max days", "Doc after"]}>
            {types.data.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-2 font-mono text-xs">{x.code}</td>
                <td className="px-4 py-2">{x.name}</td>
                <td className="px-4 py-2">{x.paid ? "Paid" : "Unpaid"}</td>
                <td className="px-4 py-2">{x.allow_half_day ? "Yes" : "No"}</td>
                <td className="px-4 py-2">{x.max_consecutive_days ?? "—"}</td>
                <td className="px-4 py-2">{x.document_required_after_days ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel title="Policies" actions={<Btn variant="primary" disabled={!types.data?.length} onClick={() => setP({ leave_type_id: types.data?.[0]?.id, employee_category: "", annual_allocation: "12", accrual: "annual", carry_forward_max: "0", min_service_days: "0", effective_from: `${new Date().getFullYear()}-01-01` })}><Plus className="w-3.5 h-3.5" /> New policy</Btn>}>
        {!policies.data?.length ? (
          <Empty title="No policies" hint="A policy sets the yearly entitlement for a leave type, for everyone or one staff category." />
        ) : (
          <Table head={["Type", "Applies to", "Per year", "Accrual", "Carry forward", "From"]}>
            {policies.data.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-2">{tname(x.leave_type_id)}</td>
                <td className="px-4 py-2">{x.employee_category ?? "Everyone"}</td>
                <td className="px-4 py-2 tabular-nums">{Number(x.annual_allocation)}</td>
                <td className="px-4 py-2 capitalize">{x.accrual}</td>
                <td className="px-4 py-2 tabular-nums">{Number(x.carry_forward_max)}</td>
                <td className="px-4 py-2">{fmtDate(x.effective_from)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {t && (
        <Drawer open title="New leave type" onClose={() => setT(null)} footer={<><Btn onClick={() => setT(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "t"} disabled={!t.code || !t.name} onClick={() => run("t", () => hr.post("/api/v1/hr/leave/types", { ...t, max_consecutive_days: t.max_consecutive_days ? Number(t.max_consecutive_days) : null, document_required_after_days: t.document_required_after_days !== "" ? Number(t.document_required_after_days) : null }), "Leave type created").then((r) => { if (r) { setT(null); types.reload() } })}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required><input className={inputCls} value={t.code} onChange={(e) => setT({ ...t, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name" required><input className={inputCls} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
            <Field label="Max consecutive days"><input className={inputCls} inputMode="numeric" value={t.max_consecutive_days} onChange={(e) => setT({ ...t, max_consecutive_days: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Document needed beyond (days)"><input className={inputCls} inputMode="numeric" value={t.document_required_after_days} onChange={(e) => setT({ ...t, document_required_after_days: e.target.value.replace(/\D/g, "") })} /></Field>
            {(["paid", "allow_half_day", "is_emergency"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.checked })} />{{ paid: "Paid", allow_half_day: "Half days allowed", is_emergency: "Emergency (may be backdated)" }[k]}</label>
            ))}
          </div>
        </Drawer>
      )}
      {p && (
        <Drawer open title="New leave policy" onClose={() => setP(null)} footer={<><Btn onClick={() => setP(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "p"} onClick={() => run("p", () => hr.post("/api/v1/hr/leave/policies", { ...p, employee_category: p.employee_category || null, min_service_days: Number(p.min_service_days) }), "Policy created").then((r) => { if (r) { setP(null); policies.reload() } })}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Leave type"><select className={inputCls} value={p.leave_type_id} onChange={(e) => setP({ ...p, leave_type_id: e.target.value })}>{types.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Applies to"><select className={inputCls} value={p.employee_category} onChange={(e) => setP({ ...p, employee_category: e.target.value })}><option value="">Everyone</option>{EMPLOYEE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Days per year"><input className={inputCls} inputMode="decimal" value={p.annual_allocation} onChange={(e) => setP({ ...p, annual_allocation: e.target.value })} /></Field>
            <Field label="Accrual"><select className={inputCls} value={p.accrual} onChange={(e) => setP({ ...p, accrual: e.target.value })}><option value="annual">All at start of year</option><option value="monthly">Monthly (1/12 each month)</option></select></Field>
            <Field label="Carry forward up to"><input className={inputCls} inputMode="decimal" value={p.carry_forward_max} onChange={(e) => setP({ ...p, carry_forward_max: e.target.value })} /></Field>
            <Field label="Minimum service (days)"><input className={inputCls} inputMode="numeric" value={p.min_service_days} onChange={(e) => setP({ ...p, min_service_days: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Effective from"><input type="date" className={inputCls} value={p.effective_from} onChange={(e) => setP({ ...p, effective_from: e.target.value })} /></Field>
          </div>
        </Drawer>
      )}
    </div>
  )
}
