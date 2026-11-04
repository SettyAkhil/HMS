import { useState } from "react"
import toast from "react-hot-toast"
import { AlertTriangle, ArrowLeft, Plus } from "lucide-react"
import { hr } from "../../services/hr/client"
import type { EmployeeListItem, Page } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Kpi, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, filterCls, fmtDate, fmtDateTime, humanize, inputCls, money, useHr, useRun } from "./ui"

type Run = { id: string; code: string; kind: string; year: number; month: number; status: string; totals: Record<string, any>; calculated_at: string | null; approval_instance_id: string | null; finalized_at: string | null; finalized_by: string | null; posting_status: string | null; posting_reference: any; reverses_run_id: string | null; reversal_reason: string | null }
type Line = { code: string; name: string; amount: string }
type Item = { id: string; employee_id: string; employee_name: string; employee_code: string; payable_days: string; lop_days: string; overtime_minutes: number; night_shifts: number; earnings: Line[]; deductions: Line[]; employer_contributions: Line[]; gross: string; total_deductions: string; net: string; warnings: string[]; status: string }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const RUN_BADGE: Record<string, string> = { draft: "draft", calculated: "pending", in_review: "partial", approved: "in", finalized: "success", reversed: "archived" }

export default function PayrollSection() {
  const [tab, setTab] = useState<"runs" | "compensation" | "structures" | "statutory" | "loans">("runs")
  return (
    <div>
      <PageHeader title="Payroll" subtitle="Monthly runs from approved attendance and leave, compensation and statutory settings" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "runs", label: "Payroll runs" },
          { id: "compensation", label: "Compensation" },
          { id: "structures", label: "Salary structures" },
          { id: "statutory", label: "Statutory settings" },
          { id: "loans", label: "Loans & adjustments" },
        ]}
      />
      {tab === "runs" && <Runs />}
      {tab === "compensation" && <Compensation />}
      {tab === "structures" && <Structures />}
      {tab === "statutory" && <Statutory />}
      {tab === "loans" && <LoansAdjustments />}
    </div>
  )
}

function Runs() {
  const [open, setOpen] = useState<string | null>(null)
  const runs = useHr(() => hr.get<Run[]>("/api/v1/payroll/runs"), [open])
  const now = new Date()
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() === 0 ? 12 : now.getMonth() })
  const [busy, run] = useRun()
  if (open) return <RunDetail id={open} onBack={() => setOpen(null)} />
  const create = () => run("create", () => hr.post<Run>("/api/v1/payroll/runs", period), "Payroll run created").then((r) => r && setOpen(r.id))
  return (
    <Panel
      title="Payroll runs"
      actions={
        <div className="flex items-center gap-2">
          <select className={filterCls} value={period.month} onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })} aria-label="Month">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <input className={filterCls + " w-20"} inputMode="numeric" value={period.year} onChange={(e) => setPeriod({ ...period, year: Number(e.target.value.replace(/\D/g, "")) })} aria-label="Year" />
          <Btn variant="primary" busy={busy === "create"} onClick={create}>
            <Plus className="w-3.5 h-3.5" /> New run
          </Btn>
        </div>
      }
    >
      {runs.loading && !runs.data ? (
        <Loading />
      ) : runs.error ? (
        <ErrorState error={runs.error} onRetry={runs.reload} />
      ) : !runs.data?.length ? (
        <Empty title="No payroll runs yet" hint="Set up salary structures, statutory settings and employee compensation first." />
      ) : (
        <Table head={["Run", "Period", "Staff", "Gross", "Net", "Status", "Accounts", ""]}>
          {runs.data.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50/80 cursor-pointer transition-colors" onClick={() => setOpen(r.id)}>
              <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
              <td className="px-4 py-2">
                {MONTHS[r.month - 1]} {r.year}
                {r.kind === "reversal" && <span className="text-[11px] text-rose-700"> reversal</span>}
              </td>
              <td className="px-4 py-2 tabular-nums">{r.totals.employees ?? "—"}</td>
              <td className="px-4 py-2 tabular-nums">{money(r.totals.gross)}</td>
              <td className="px-4 py-2 tabular-nums">{money(r.totals.net)}</td>
              <td className="px-4 py-2">
                <StatusBadge value={RUN_BADGE[r.status] ?? "draft"} label={humanize(r.status)} />
              </td>
              <td className="px-4 py-2 text-xs">{r.posting_status ? humanize(r.posting_status) : "—"}</td>
              <td className="px-4 py-2 text-right text-xs text-[#007078]">Open</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

function RunDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const data = useHr(() => hr.get<Run & { items: Item[] }>(`/api/v1/payroll/runs/${id}`), [id])
  const [item, setItem] = useState<Item | null>(null)
  const [busy, run] = useRun()
  if (data.loading && !data.data) return <Loading />
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />
  const r = data.data!
  const t = r.totals
  const act = (key: string, path: string, msg: string, body?: unknown) => run(key, () => hr.post(`/api/v1/payroll/runs/${id}/${path}`, body), msg).then(() => data.reload())
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-[#64748B] hover:text-gray-900 cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Payroll runs
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {MONTHS[r.month - 1]} {r.year} <span className="font-mono text-sm text-[#64748B]">{r.code}</span>
          </h3>
          <p className="text-xs text-[#64748B]">
            <StatusBadge value={RUN_BADGE[r.status] ?? "draft"} label={humanize(r.status)} />
            {r.calculated_at && ` · calculated ${fmtDateTime(r.calculated_at)}`}
            {r.finalized_at && ` · finalized ${fmtDateTime(r.finalized_at)} by ${r.finalized_by}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["draft", "calculated"].includes(r.status) && (
            <Btn busy={busy === "calc"} onClick={() => act("calc", "calculate", "Payroll calculated")}>
              {r.status === "draft" ? "Calculate" : "Recalculate"}
            </Btn>
          )}
          {r.status === "calculated" && (
            <Btn variant="primary" busy={busy === "submit"} onClick={() => act("submit", "submit", "Sent for approval")}>
              Submit for approval
            </Btn>
          )}
          {r.status === "in_review" && <span className="text-xs text-[#64748B] self-center">Waiting for approval (Approvals)</span>}
          {r.status === "approved" && (
            <Btn variant="primary" busy={busy === "fin"} onClick={() => window.confirm("Finalize? Payslips are issued, the month's attendance is locked and the journal is posted to Accounts. A finalized run can only be reversed.") && act("fin", "finalize", "Payroll finalized")}>
              Finalize
            </Btn>
          )}
          {r.status === "finalized" && r.posting_status === "pending" && (
            <Btn busy={busy === "post"} onClick={() => act("post", "retry-posting", "Posting retried")}>
              Retry Accounts posting
            </Btn>
          )}
          {r.status === "finalized" && r.kind === "regular" && (
            <Btn
              variant="danger"
              busy={busy === "rev"}
              onClick={() => {
                const reason = window.prompt("Why is this payroll being reversed?")
                if (reason && reason.trim().length >= 5) act("rev", "reverse", "Payroll reversed; the month can be run again", { reason })
              }}
            >
              Reverse
            </Btn>
          )}
        </div>
      </div>
      {r.posting_status === "pending" && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          Journal not posted to Accounts: {r.posting_reference?.error ?? "unknown error"}. Someone with Accounts ledger rights can retry.
        </p>
      )}
      {r.reversal_reason && <p className="text-xs text-rose-700">Reversal: {r.reversal_reason}</p>}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Employees" value={t.employees ?? 0} />
        <Kpi label="Gross" value={money(t.gross)} />
        <Kpi label="Deductions" value={money(t.deductions)} />
        <Kpi label="Net pay" value={money(t.net)} tone="good" />
        <Kpi label="Employer contributions" value={money(t.employer_contribution)} />
        <Kpi label="Errors / warnings" value={`${t.errors ?? 0} / ${t.warnings ?? 0}`} tone={t.errors ? "bad" : t.warnings ? "warn" : "neutral"} />
      </div>
      {!!t.skipped_no_compensation?.length && <p className="text-xs text-amber-800">Not included (no compensation on record): {t.skipped_no_compensation.join(", ")}</p>}
      <Panel title="Employees">
        {!r.items.length ? (
          <Empty title={r.status === "draft" ? "Calculate the run to see employees" : "No employees in this run"} />
        ) : (
          <Table head={["Employee", "Paid days", "LOP", "OT", "Gross", "Deductions", "Net", "Status"]}>
            {r.items.map((i) => (
              <tr key={i.id} className="hover:bg-gray-50/80 cursor-pointer transition-colors" onClick={() => setItem(i)}>
                <td className="px-4 py-2">
                  <span className="font-semibold text-gray-900">{i.employee_name}</span> <span className="text-[11px] text-[#64748B] font-mono">{i.employee_code}</span>
                </td>
                <td className="px-4 py-2 tabular-nums">{Number(i.payable_days)}</td>
                <td className="px-4 py-2 tabular-nums">{Number(i.lop_days) || "—"}</td>
                <td className="px-4 py-2 tabular-nums">{i.overtime_minutes ? `${Math.round(i.overtime_minutes / 6) / 10}h` : "—"}</td>
                <td className="px-4 py-2 tabular-nums">{money(i.gross)}</td>
                <td className="px-4 py-2 tabular-nums">{money(i.total_deductions)}</td>
                <td className="px-4 py-2 tabular-nums font-medium">{money(i.net)}</td>
                <td className="px-4 py-2">
                  <StatusBadge value={i.status === "ok" ? "success" : i.status === "error" ? "failed" : "partial"} label={i.status === "ok" ? "OK" : i.status} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {item && (
        <Drawer open title={`${item.employee_name} · ${MONTHS[r.month - 1]} ${r.year}`} onClose={() => setItem(null)}>
          <PayslipBody item={item} />
        </Drawer>
      )}
    </div>
  )
}

export function PayslipBody({ item }: { item: { earnings: Line[]; deductions: Line[]; employer_contributions: Line[]; gross: string; total_deductions: string; net: string; warnings?: string[]; payable_days?: string; lop_days?: string } }) {
  const lines = (title: string, rows: Line[], total?: string) => (
    <div>
      <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">{title}</h4>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((l, i) => (
            <tr key={i}>
              <td className="py-0.5 text-gray-700">{l.name}</td>
              <td className="py-0.5 text-right font-mono tabular-nums">{money(l.amount)}</td>
            </tr>
          ))}
          {total !== undefined && (
            <tr className="border-t border-[#DDE2EC] font-semibold text-gray-900">
              <td className="py-1">Total</td>
              <td className="py-1 text-right font-mono tabular-nums">{money(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
  return (
    <div className="space-y-4">
      {item.payable_days !== undefined && (
        <p className="text-xs text-[#64748B]">
          Paid days {Number(item.payable_days)} · loss of pay {Number(item.lop_days)}
        </p>
      )}
      {!!item.warnings?.length && (
        <ul className="text-xs text-amber-800 space-y-0.5">
          {item.warnings.map((w, i) => (
            <li key={i} className="flex gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
      {lines("Earnings", item.earnings, item.gross)}
      {lines("Deductions", item.deductions, item.total_deductions)}
      {!!item.employer_contributions.length && lines("Employer contributions (not deducted)", item.employer_contributions)}
      <div className="flex justify-between items-center p-3 rounded bg-blue-50 text-[#1B4FD8]">
        <span className="font-semibold text-sm">Net pay</span>
        <span className="text-lg font-bold font-mono tabular-nums">{money(item.net)}</span>
      </div>
    </div>
  )
}

function EmployeePicker({ value, onPick }: { value: EmployeeListItem | null; onPick: (e: EmployeeListItem) => void }) {
  const [q, setQ] = useState("")
  const people = useHr(() => (q.length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, page_size: 8, status: "" }) : Promise.resolve(null)), [q])
  return (
    <div className="max-w-sm">
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={value ? `${value.full_name} (${value.employee_code})` : "Find an employee (instant)"} />
      {people.data?.items.map((p) => (
        <button key={p.id} onClick={() => { onPick(p); setQ("") }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded transition-colors cursor-pointer">
          <span className="font-semibold text-gray-900">{p.full_name}</span> <span className="text-[11px] text-[#64748B] font-mono">{p.employee_code}</span>
        </button>
      ))}
    </div>
  )
}

function Compensation() {
  const [emp, setEmp] = useState<EmployeeListItem | null>(null)
  const structures = useHr(() => hr.get<{ id: string; code: string; name: string }[]>("/api/v1/payroll/structures"), [])
  const hist = useHr(() => (emp ? hr.get<any[]>(`/api/v1/payroll/compensation/${emp.id}`) : Promise.resolve(null)), [emp?.id])
  const [f, setF] = useState<any>(null)
  const [busy, run] = useRun()
  const save = () =>
    run(
      "save",
      () =>
        hr.post(`/api/v1/payroll/compensation/${emp!.id}`, {
          ...f,
          monthly_gross: Number(f.monthly_gross),
          pt_state: f.pt_state || null,
          uan: f.uan || null,
          esi_number: f.esi_number || null,
          pan: f.pan || null,
          bank_account: f.bank_account || null,
          bank_ifsc: f.bank_ifsc || null,
          bank_name: f.bank_name || null,
          reason: f.reason || null,
        }),
      "Compensation saved",
    ).then((r) => {
      if (r) {
        setF(null)
        hist.reload()
      }
    })
  return (
    <Panel title="Employee compensation" actions={emp && <Btn variant="primary" disabled={!structures.data?.length} onClick={() => setF({ structure_id: structures.data?.[0]?.id, monthly_gross: "", effective_from: new Date().toLocaleDateString("en-CA"), pf_enabled: true, esi_enabled: true, pt_state: "", uan: "", esi_number: "", pan: "", bank_account: "", bank_ifsc: "", bank_name: "", reason: "" })}><Plus className="w-3.5 h-3.5" /> New revision</Btn>}>
      <EmployeePicker value={emp} onPick={setEmp} />
      <div className="mt-4">
        {!emp ? (
          <Empty title="Choose an employee" hint="Compensation is effective-dated: a revision closes the previous record the day before." />
        ) : hist.loading && !hist.data ? (
          <Loading />
        ) : !hist.data?.length ? (
          <Empty title="No compensation on record" />
        ) : (
          <Table head={["From", "To", "Monthly gross", "PF", "ESI", "PT state", "Bank", "Reason"]}>
            {hist.data.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">{fmtDate(c.effective_from)}</td>
                <td className="px-4 py-2">{c.effective_to ? fmtDate(c.effective_to) : "Current"}</td>
                <td className="px-4 py-2 tabular-nums">{money(c.monthly_gross)}</td>
                <td className="px-4 py-2">{c.pf_enabled ? "Yes" : "No"}</td>
                <td className="px-4 py-2">{c.esi_enabled ? "Yes" : "No"}</td>
                <td className="px-4 py-2">{c.pt_state ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.bank_account ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{c.reason ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {f && (
        <Drawer open title={`Compensation for ${emp!.full_name}`} onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "save"} disabled={!f.monthly_gross} onClick={save}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary structure"><select className={inputCls} value={f.structure_id} onChange={(e) => setF({ ...f, structure_id: e.target.value })}>{structures.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Monthly gross (₹)" required><input className={inputCls} inputMode="decimal" value={f.monthly_gross} onChange={(e) => setF({ ...f, monthly_gross: e.target.value })} /></Field>
            <Field label="Effective from"><input type="date" className={inputCls} value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} /></Field>
            <Field label="Professional-tax state" hint="Must match a state in PT settings"><input className={inputCls} value={f.pt_state} onChange={(e) => setF({ ...f, pt_state: e.target.value.toUpperCase() })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pf_enabled} onChange={(e) => setF({ ...f, pf_enabled: e.target.checked })} /> PF applies</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.esi_enabled} onChange={(e) => setF({ ...f, esi_enabled: e.target.checked })} /> ESI applies (if under ceiling)</label>
            <Field label="UAN"><input className={inputCls} value={f.uan} onChange={(e) => setF({ ...f, uan: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="ESI number"><input className={inputCls} value={f.esi_number} onChange={(e) => setF({ ...f, esi_number: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="PAN" hint="Stored encrypted"><input className={inputCls} value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} /></Field>
            <Field label="Bank account" hint="Stored encrypted; shown as last 4 digits"><input className={inputCls} autoComplete="off" value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="IFSC"><input className={inputCls} value={f.bank_ifsc} onChange={(e) => setF({ ...f, bank_ifsc: e.target.value.toUpperCase() })} /></Field>
            <Field label="Bank name"><input className={inputCls} value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Reason"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field></div>
          </div>
        </Drawer>
      )}
    </Panel>
  )
}

function Structures() {
  const comps = useHr(() => hr.get<{ id: string; code: string; name: string; kind: string; prorate: boolean; pf_wage: boolean }[]>("/api/v1/payroll/components"), [])
  const structs = useHr(() => hr.get<{ id: string; code: string; name: string; lines: { component: string; calc: string; value: string | null }[] }[]>("/api/v1/payroll/structures"), [])
  const [c, setC] = useState<any>(null)
  const [s, setS] = useState<any>(null)
  const [busy, run] = useRun()
  const calcLabel: Record<string, string> = { percent_of_ctc: "% of gross", percent_of_basic: "% of basic", fixed: "fixed ₹", balance: "balance" }
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Salary components" actions={<Btn variant="primary" onClick={() => setC({ code: "", name: "", kind: "earning", prorate: true, taxable: true, pf_wage: false })}><Plus className="w-3.5 h-3.5" /> Component</Btn>}>
        {!comps.data?.length ? (
          <Empty title="No components" hint="Start with BASIC (counts for PF), HRA and a special allowance." />
        ) : (
          <Table head={["Code", "Name", "Kind", "Prorated", "PF wage"]}>
            {comps.data.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-2 font-mono text-xs">{x.code}</td>
                <td className="px-4 py-2">{x.name}</td>
                <td className="px-4 py-2 capitalize">{x.kind}</td>
                <td className="px-4 py-2">{x.prorate ? "Yes" : "No"}</td>
                <td className="px-4 py-2">{x.pf_wage ? "Yes" : "No"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel title="Salary structures" actions={<Btn variant="primary" disabled={!comps.data?.length} onClick={() => setS({ code: "", name: "", lines: [{ component: "BASIC", calc: "percent_of_ctc", value: "40" }] })}><Plus className="w-3.5 h-3.5" /> Structure</Btn>}>
        {!structs.data?.length ? (
          <Empty title="No structures" />
        ) : (
          <ul className="divide-y divide-[#EEF1F6]">
            {structs.data.map((x) => (
              <li key={x.id} className="py-2 text-sm">
                <span className="font-semibold text-gray-900">{x.name}</span> <span className="font-mono text-xs text-[#64748B]">{x.code}</span>
                <div className="text-xs text-[#64748B]">{x.lines.map((l) => `${l.component}: ${l.calc === "balance" ? "balance" : `${Number(l.value)} ${calcLabel[l.calc]}`}`).join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {c && (
        <Drawer open title="New salary component" onClose={() => setC(null)} footer={<><Btn onClick={() => setC(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "c"} disabled={!c.code || !c.name} onClick={() => run("c", () => hr.post("/api/v1/payroll/components", c), "Component created").then((r) => { if (r) { setC(null); comps.reload() } })}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required><input className={inputCls} value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} /></Field>
            <Field label="Name" required><input className={inputCls} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
            <Field label="Kind"><select className={inputCls} value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })}><option value="earning">Earning</option><option value="deduction">Deduction</option></select></Field>
            <div />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.prorate} onChange={(e) => setC({ ...c, prorate: e.target.checked })} /> Prorate for loss of pay</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.pf_wage} onChange={(e) => setC({ ...c, pf_wage: e.target.checked })} /> Counts toward PF wages</label>
          </div>
        </Drawer>
      )}
      {s && (
        <Drawer open wide title="New salary structure" onClose={() => setS(null)} footer={<><Btn onClick={() => setS(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!s.code || !s.name} onClick={() => run("s", () => hr.post("/api/v1/payroll/structures", { ...s, lines: s.lines.map((l: any) => ({ ...l, value: l.calc === "balance" ? null : Number(l.value) })) }), "Structure created").then((r) => { if (r) { setS(null); structs.reload() } })}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Code" required><input className={inputCls} value={s.code} onChange={(e) => setS({ ...s, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name" required><input className={inputCls} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          </div>
          {s.lines.map((l: any, i: number) => (
            <div key={i} className="grid grid-cols-3 gap-2 mb-2">
              <select className={inputCls} value={l.component} onChange={(e) => setS({ ...s, lines: s.lines.map((x: any, j: number) => (j === i ? { ...x, component: e.target.value } : x)) })}>{comps.data?.filter((x) => x.kind === "earning").map((x) => <option key={x.code}>{x.code}</option>)}</select>
              <select className={inputCls} value={l.calc} onChange={(e) => setS({ ...s, lines: s.lines.map((x: any, j: number) => (j === i ? { ...x, calc: e.target.value } : x)) })}>{Object.entries(calcLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input className={inputCls} disabled={l.calc === "balance"} inputMode="decimal" value={l.value ?? ""} onChange={(e) => setS({ ...s, lines: s.lines.map((x: any, j: number) => (j === i ? { ...x, value: e.target.value } : x)) })} />
            </div>
          ))}
          <Btn onClick={() => setS({ ...s, lines: [...s.lines, { component: comps.data?.find((x) => x.kind === "earning")?.code, calc: "balance", value: null }] })}>Add line</Btn>
          <p className="text-[11px] text-[#64748B] mt-3">One line may take the balance (the remainder of the gross), typically a special allowance.</p>
        </Drawer>
      )}
    </div>
  )
}

const TEMPLATES: Record<string, { label: string; hint: string; example: object }> = {
  pf: { label: "Provident fund", hint: "Rates in percent; the ceiling caps the PF wage base when applied.", example: { employee_rate: "", employer_rate: "", wage_ceiling: "", apply_ceiling: true } },
  esi: { label: "ESI", hint: "Applies only to employees whose monthly gross is at or under the ceiling.", example: { employee_rate: "", employer_rate: "", gross_ceiling: "" } },
  pt: { label: "Professional tax", hint: "Slabs per state on monthly gross. Optional february_amount for states that collect a different amount in February.", example: { states: { STATE: [{ min: 0, max: null, amount: 0 }] } } },
  overtime: { label: "Overtime & night allowance", hint: "Hourly rate = monthly gross ÷ days in month ÷ hours per day; paid at the multiplier.", example: { multiplier: "", hours_per_day: "", night_allowance_per_shift: 0 } },
}

function Statutory() {
  const list = useHr(() => hr.get<{ id: string; kind: string; config: any; effective_from: string; source_note: string | null; created_by: string }[]>("/api/v1/payroll/statutory"), [])
  const [edit, setEdit] = useState<{ kind: string; text: string; effective_from: string; source_note: string } | null>(null)
  const [busy, run] = useRun()
  const save = () => {
    let config
    try {
      config = JSON.parse(edit!.text)
    } catch {
      toast.error("The settings are not valid JSON")
      return
    }
    run("save", () => hr.put(`/api/v1/payroll/statutory/${edit!.kind}`, { config, effective_from: edit!.effective_from, source_note: edit!.source_note || null }), "Settings saved").then((r) => {
      if (r) {
        setEdit(null)
        list.reload()
      }
    })
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
        Statutory rates are not built in. Enter the rates your hospital is bound by, with the notification or circular they come from, and an effective date. Payroll refuses to deduct PF or ESI when no setting applies to the month.
      </p>
      <div className="grid lg:grid-cols-2 gap-4">
        {Object.entries(TEMPLATES).map(([kind, t]) => {
          const rows = list.data?.filter((x) => x.kind === kind) ?? []
          const current = rows[0]
          return (
            <Panel key={kind} title={t.label} actions={<Btn onClick={() => setEdit({ kind, text: JSON.stringify(current?.config ?? t.example, null, 2), effective_from: new Date().toLocaleDateString("en-CA"), source_note: "" })}>{current ? "New version" : "Configure"}</Btn>}>
              {!current ? (
                <Empty title="Not configured" hint={t.hint} />
              ) : (
                <>
                  <pre className="text-[11px] bg-[#F8FAFC] border border-[#DDE2EC] rounded p-2 overflow-x-auto">{JSON.stringify(current.config, null, 2)}</pre>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    From {fmtDate(current.effective_from)} · {current.source_note ?? "no source noted"} · {current.created_by}
                    {rows.length > 1 && ` · ${rows.length - 1} earlier version(s)`}
                  </p>
                </>
              )}
            </Panel>
          )
        })}
      </div>
      {edit && (
        <Drawer open wide title={TEMPLATES[edit.kind].label} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "save"} onClick={save}>Save</Btn></>}>
          <p className="text-xs text-[#64748B] mb-2">{TEMPLATES[edit.kind].hint}</p>
          <textarea rows={14} className={inputCls + " font-mono text-xs"} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Effective from"><input type="date" className={inputCls} value={edit.effective_from} onChange={(e) => setEdit({ ...edit, effective_from: e.target.value })} /></Field>
            <Field label="Source (notification / circular)"><input className={inputCls} value={edit.source_note} onChange={(e) => setEdit({ ...edit, source_note: e.target.value })} /></Field>
          </div>
        </Drawer>
      )}
    </div>
  )
}

function LoansAdjustments() {
  const loans = useHr(() => hr.get<any[]>("/api/v1/payroll/loans"), [])
  const adjs = useHr(() => hr.get<any[]>("/api/v1/payroll/adjustments"), [])
  const [emp, setEmp] = useState<EmployeeListItem | null>(null)
  const [mode, setMode] = useState<"loan" | "adj" | null>(null)
  const now = new Date()
  const [f, setF] = useState<any>({})
  const [busy, run] = useRun()
  const open = (m: "loan" | "adj") => {
    setMode(m)
    setEmp(null)
    setF(m === "loan" ? { kind: "advance", principal: "", installment: "", start_year: now.getFullYear(), start_month: now.getMonth() + 1, reason: "" } : { kind: "earning", code: "ARREARS", amount: "", year: now.getFullYear(), month: now.getMonth() + 1, reason: "" })
  }
  const save = () =>
    run("save", () => hr.post(mode === "loan" ? "/api/v1/payroll/loans" : "/api/v1/payroll/adjustments", { ...f, employee_id: emp!.id, ...(mode === "loan" ? { principal: Number(f.principal), installment: Number(f.installment) } : { amount: Number(f.amount) }) }), "Saved").then((r) => {
      if (r) {
        setMode(null)
        loans.reload()
        adjs.reload()
      }
    })
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Salary advances & loans" actions={<Btn variant="primary" onClick={() => open("loan")}><Plus className="w-3.5 h-3.5" /> New</Btn>}>
        {!loans.data?.length ? <Empty title="None" /> : (
          <Table head={["Type", "Principal", "Instalment", "Recovered", "From", "Status"]}>
            {loans.data.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 capitalize">{l.kind}</td>
                <td className="px-4 py-2 tabular-nums">{money(l.principal)}</td>
                <td className="px-4 py-2 tabular-nums">{money(l.installment)}</td>
                <td className="px-4 py-2 tabular-nums">{money(l.recovered)}</td>
                <td className="px-4 py-2">{MONTHS[l.start_month - 1].slice(0, 3)} {l.start_year}</td>
                <td className="px-4 py-2 capitalize">{l.status}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel title="Payroll adjustments" actions={<Btn variant="primary" onClick={() => open("adj")}><Plus className="w-3.5 h-3.5" /> New</Btn>}>
        <p className="text-[11px] text-[#64748B] mb-2">Arrears, incentives, recoveries or TDS, applied by the first run for that month (or later) that includes the employee.</p>
        {!adjs.data?.length ? <Empty title="None" /> : (
          <Table head={["Period", "Code", "Kind", "Amount", "Reason", "Status"]}>
            {adjs.data.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2">{MONTHS[a.month - 1].slice(0, 3)} {a.year}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.code}</td>
                <td className="px-4 py-2 capitalize">{a.kind}</td>
                <td className="px-4 py-2 tabular-nums font-mono">{money(a.amount)}</td>
                <td className="px-4 py-2 text-gray-700">{a.reason}</td>
                <td className="px-4 py-2 capitalize">{a.status}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {mode && (
        <Drawer open title={mode === "loan" ? "New advance or loan" : "New payroll adjustment"} onClose={() => setMode(null)} footer={<><Btn onClick={() => setMode(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "save"} disabled={!emp || !(mode === "loan" ? f.principal && f.installment : f.amount && f.reason.length >= 3)} onClick={save}>Save</Btn></>}>
          <div className="space-y-3">
            <Field label="Employee" required><EmployeePicker value={emp} onPick={setEmp} /></Field>
            {mode === "loan" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="advance">Salary advance</option><option value="loan">Loan</option></select></Field>
                <Field label="Principal (₹)"><input className={inputCls} inputMode="decimal" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} /></Field>
                <Field label="Monthly instalment (₹)"><input className={inputCls} inputMode="decimal" value={f.installment} onChange={(e) => setF({ ...f, installment: e.target.value })} /></Field>
                <Field label="First recovery"><select className={inputCls} value={f.start_month} onChange={(e) => setF({ ...f, start_month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
                <div className="col-span-2"><Field label="Reason"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="earning">Earning</option><option value="deduction">Deduction</option></select></Field>
                <Field label="Code"><select className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })}>{["ARREARS", "INCENTIVE", "BONUS", "RECOVERY", "TDS", "OTHER"].map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Amount (₹)"><input className={inputCls} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
                <Field label="For month"><select className={inputCls} value={f.month} onChange={(e) => setF({ ...f, month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
                <div className="col-span-2"><Field label="Reason" required><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field></div>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  )
}
