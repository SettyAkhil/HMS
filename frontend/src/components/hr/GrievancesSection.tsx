import { useState } from "react"
import { Lock, Plus } from "lucide-react"
import { hr } from "../../services/hr/client"
import type { EmployeeListItem, Page } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, fmtDate, fmtDateTime, humanize, inputCls, useHr, useRun } from "./ui"

type CaseRow = { id: string; case_number: string; category: string; severity: string; subject: string; status: string; created_at: string; assigned_to: string | null; view: "manager" | "submitter" }
const CATEGORIES = ["harassment", "workload", "safety", "pay", "discrimination", "conduct", "other"]

export default function GrievancesSection({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<"cases" | "actions">("cases")
  return (
    <div>
      <PageHeader title="Grievances & discipline" subtitle="Confidential: visible only to the grievance committee, the assigned investigator and the person who raised the case" />
      <Tabs value={tab} onChange={setTab} items={[{ id: "cases", label: "Cases" }, ...(canManage ? [{ id: "actions" as const, label: "Disciplinary actions" }] : [])]} />
      {tab === "cases" && <Cases />}
      {tab === "actions" && <Actions />}
    </div>
  )
}

export function Cases({ own }: { own?: boolean }) {
  const list = useHr(() => hr.get<CaseRow[]>("/api/v1/hr/grievances"), [])
  const [open, setOpen] = useState<string | null>(null)
  const [raising, setRaising] = useState(false)
  return (
    <Panel title={own ? "My grievances" : "Cases"} actions={<Btn variant="primary" onClick={() => setRaising(true)}><Plus className="w-3.5 h-3.5" /> Raise a grievance</Btn>}>
      {list.loading && !list.data ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.length ? <Empty title={own ? "You have not raised any grievances" : "No cases you can see"} hint="Anonymous submissions are not linked to anyone, including in your own list." /> : (
        <Table head={["Case", "Subject", "Category", "Severity", "Assigned", "Status", "Raised"]}>
          {list.data.map((c) => (
            <tr key={c.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setOpen(c.id)}>
              <td className="px-4 py-2 font-mono text-xs">{c.case_number}</td>
              <td className="px-4 py-2">{c.subject}</td>
              <td className="px-4 py-2">{humanize(c.category)}</td>
              <td className="px-4 py-2">{humanize(c.severity)}</td>
              <td className="px-4 py-2">{c.assigned_to ?? (c.view === "manager" ? "—" : "")}</td>
              <td className="px-4 py-2"><StatusBadge value={c.status === "resolved" || c.status === "closed" ? "success" : "pending"} label={humanize(c.status)} /></td>
              <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(c.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
      {raising && <RaiseDrawer onClose={() => setRaising(false)} onDone={() => { setRaising(false); list.reload() }} />}
      {open && <CaseDrawer id={open} onClose={() => { setOpen(null); list.reload() }} />}
    </Panel>
  )
}

function RaiseDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ category: "workload", severity: "medium", subject: "", description: "", anonymous: false })
  const [busy, run] = useRun()
  return (
    <Drawer open title="Raise a grievance" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={f.subject.length < 5 || f.description.length < 20} onClick={() => run("s", () => hr.post<{ case_number: string }>("/api/v1/hr/grievances", f), (r) => `Submitted as ${r.case_number}`).then((r) => r && onDone())}>Submit</Btn></>}>
      <div className="space-y-3">
        <p className="text-xs text-gray-600 flex gap-1.5"><Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Only the grievance committee and the investigator assigned to your case can read it.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select></Field>
          <Field label="Severity"><select className={inputCls} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
        </div>
        <Field label="Subject" required><input className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="What happened" required hint="At least 20 characters"><textarea rows={6} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /> Submit anonymously — your name is not stored with the case, so you will not be able to follow it up here.</label>
      </div>
    </Drawer>
  )
}

function CaseDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const c = useHr(() => hr.get<any>(`/api/v1/hr/grievances/${id}`), [id])
  const [comment, setComment] = useState("")
  const [internal, setInternal] = useState(true)
  const [busy, run] = useRun()
  if (c.loading && !c.data) return <Drawer open title="Case" onClose={onClose}><Loading /></Drawer>
  if (c.error) return <Drawer open title="Case" onClose={onClose}><ErrorState error={c.error} /></Drawer>
  const k = c.data
  const manager = "investigation" in k
  return (
    <Drawer open wide title={`${k.case_number} · ${k.subject}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-2">{humanize(k.category)} · {humanize(k.severity)} · <StatusBadge value={["resolved", "closed"].includes(k.status) ? "success" : "pending"} label={humanize(k.status)} /> · raised {fmtDateTime(k.created_at)}{manager && ` by ${k.submitted_by ?? "—"}`}{manager && k.against && ` · concerning ${k.against}`}</p>
      <p className="text-sm whitespace-pre-wrap bg-[#F8FAFC] border border-[#DDE2EC] rounded p-3 mb-4 text-gray-800">{k.description}</p>
      {k.resolution && <p className="text-sm mb-4"><span className="text-gray-500 font-medium">Resolution:</span> {k.resolution}</p>}
      {manager && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Btn onClick={() => { const a = window.prompt("Assign to (HMS username)?", k.assigned_to ?? ""); a && run("assign", () => hr.post(`/api/v1/hr/grievances/${id}/assign`, { assignee: a }), `Assigned to ${a}`).then(() => c.reload()) }}>Assign</Btn>
          <Btn onClick={() => { const s = window.prompt("Investigation note / finding?"); s && run("inv", () => hr.post(`/api/v1/hr/grievances/${id}/investigation`, { kind: "finding", summary: s }), "Recorded").then(() => c.reload()) }}>Add finding</Btn>
          {!["resolved", "closed"].includes(k.status) && <Btn variant="primary" onClick={() => { const r = window.prompt("Proposed resolution (needs committee approval)?"); r && r.length >= 10 && run("res", () => hr.post(`/api/v1/hr/grievances/${id}/resolve`, { resolution: r }), "Resolution sent for approval").then(() => c.reload()) }}>Propose resolution</Btn>}
        </div>
      )}
      {manager && !!k.investigation.length && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Investigation</h4>
          <ul className="text-sm space-y-1">{k.investigation.map((i: any) => <li key={i.id}>{humanize(i.kind)}: {i.summary} <span className="text-[11px] text-gray-400">— {i.by}, {fmtDateTime(i.at)}</span></li>)}</ul>
        </div>
      )}
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Messages</h4>
      <ul className="text-sm space-y-2 mb-3">
        {k.comments.map((m: any, i: number) => (
          <li key={i} className={m.internal ? "pl-2 border-l-2 border-amber-400" : ""}>
            <span className="text-gray-500 text-xs">{m.author} · {fmtDateTime(m.at)}{m.internal && " · internal"}</span>
            <div className="text-gray-900 mt-0.5">{m.body}</div>
          </li>
        ))}
        {!k.comments.length && <li className="text-gray-500 text-sm">No messages yet</li>}
      </ul>
      <textarea rows={2} className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={manager ? "Add a note" : "Reply to HR"} />
      <div className="flex items-center justify-between mt-2">
        {manager ? <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal (hidden from the person who raised it)</label> : <span />}
        <Btn variant="primary" busy={busy === "c"} disabled={!comment.trim()} onClick={() => run("c", () => hr.post(`/api/v1/hr/grievances/${id}/comments`, { body: comment, internal }), "Sent").then(() => { setComment(""); c.reload() })}>Send</Btn>
      </div>
    </Drawer>
  )
}

function Actions() {
  const list = useHr(() => hr.get<any[]>("/api/v1/hr/grievances/actions"), [])
  const [f, setF] = useState<any>(null)
  const [q, setQ] = useState("")
  const people = useHr(() => (q.length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, page_size: 8 }) : Promise.resolve(null)), [q])
  const [busy, run] = useRun()
  return (
    <Panel title="Disciplinary actions" actions={<Btn variant="primary" onClick={() => setF({ employee_id: "", action_type: "written_warning", details: "", effective_from: new Date().toLocaleDateString("en-CA") })}><Plus className="w-3.5 h-3.5" /> Issue action</Btn>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No disciplinary actions" /> : (
        <Table head={["Issued", "Type", "Details", "From", "Status", "By"]}>
          {list.data.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2">{fmtDate(a.created_at)}</td>
              <td className="px-4 py-2">{humanize(a.action_type)}</td>
              <td className="px-4 py-2 text-gray-600 max-w-sm truncate">{a.details}</td>
              <td className="px-4 py-2">{fmtDate(a.effective_from)}</td>
              <td className="px-4 py-2 capitalize">{a.status}</td>
              <td className="px-4 py-2 text-xs text-gray-500">{a.created_by}</td>
            </tr>
          ))}
        </Table>
      )}
      {f && (
        <Drawer open title="Issue a disciplinary action" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.employee_id || f.details.length < 10} onClick={() => run("s", () => hr.post("/api/v1/hr/grievances/actions", f), "Action issued and added to the employee's history").then((r) => { if (r) { setF(null); list.reload() } })}>Issue</Btn></>}>
          <div className="space-y-3">
            <Field label="Employee" required><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee" /></Field>
            {people.data?.items.map((p) => <button key={p.id} onClick={() => setF({ ...f, employee_id: p.id })} className={`block w-full text-left px-3 py-1.5 text-sm rounded ${f.employee_id === p.id ? "bg-[#1B4FD8]/10 text-[#1B4FD8] font-medium" : "hover:bg-[#F8FAFC] text-gray-800"}`}>{p.full_name}</button>)}
            <Field label="Action"><select className={inputCls} value={f.action_type} onChange={(e) => setF({ ...f, action_type: e.target.value })}>{["verbal_warning", "written_warning", "memo", "suspension", "termination"].map((a) => <option key={a} value={a}>{humanize(a)}</option>)}</select></Field>
            <Field label="Details" required><textarea rows={4} className={inputCls} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
            <Field label="Effective from"><input type="date" className={inputCls} value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} /></Field>
            <p className="text-[11px] text-gray-500">Suspension or termination of employment itself is done from the employee's profile, which also revokes HMS access.</p>
          </div>
        </Drawer>
      )}
    </Panel>
  )
}
