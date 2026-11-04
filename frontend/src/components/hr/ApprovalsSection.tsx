import { useState } from "react"
import { Check, Forward, X as XIcon } from "lucide-react"
import { hr } from "../../services/hr/client"
import { Btn, Drawer, Empty, ErrorState, Field, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, fmtDateTime, humanize, inputCls, useHr, useRun } from "./ui"

export type Approval = {
  id: string
  workflow_code: string
  title: string
  status: string
  requester_username: string
  requester_name: string | null
  steps: { name: string; approver_type: string; permission: string | null }[]
  current_index: number
  delegated_to: string | null
  escalated: boolean
  created_at: string
  decided_at: string | null
  can_act: boolean
  waiting_reason: string | null
  actions: { actor: string; action: string; comment: string | null; at: string; delegated_to: string | null }[]
}

type Workflow = {
  code: string
  name: string
  active: boolean
  allow_self_approval: boolean
  steps: { sequence: number; name: string; approver_type: string; permission: string | null; condition: any; escalate_after_hours: number | null }[]
}

export default function ApprovalsSection({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<"inbox" | "mine" | "decided" | "rules">("inbox")
  const [version, setVersion] = useState(0)
  const list = useHr(
    () =>
      tab === "rules"
        ? Promise.resolve([] as Approval[])
        : hr.get<Approval[]>("/api/v1/hr/approvals", tab === "inbox" ? { status: "pending" } : tab === "mine" ? { status: "", mine: true } : { status: "approved" }),
    [tab, version],
  )
  const [open, setOpen] = useState<Approval | null>(null)

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Leave, corrections, swaps, overtime, requisitions, payroll and grievance closures" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "inbox", label: "Waiting for me", count: tab === "inbox" ? list.data?.length : undefined },
          { id: "mine", label: "My requests" },
          { id: "decided", label: "Recently approved" },
          ...(isAdmin ? [{ id: "rules" as const, label: "Approval rules" }] : []),
        ]}
      />
      {tab === "rules" ? (
        <Rules />
      ) : list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <Panel>
          <Empty title={tab === "inbox" ? "Nothing is waiting for you" : "No requests"} />
        </Panel>
      ) : (
        <Panel>
          <Table head={["Request", "Type", "Raised by", "Step", "Status", "Raised", ""]}>
            {list.data.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50/80 cursor-pointer transition-colors" onClick={() => setOpen(a)}>
                <td className="px-4 py-2 font-semibold text-gray-900">{a.title}</td>
                <td className="px-4 py-2 text-gray-700">{humanize(a.workflow_code)}</td>
                <td className="px-4 py-2 text-gray-700">{a.requester_name ?? a.requester_username}</td>
                <td className="px-4 py-2 text-gray-700">
                  {a.status === "pending" ? `${a.current_index + 1}/${a.steps.length}: ${a.steps[a.current_index]?.name}` : "—"}
                  {a.escalated && <span className="ml-1 text-[11px] text-rose-700">escalated</span>}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge value={a.status === "approved" ? "success" : a.status} label={humanize(a.status)} />
                </td>
                <td className="px-4 py-2 text-xs text-[#64748B] whitespace-nowrap">{fmtDateTime(a.created_at)}</td>
                <td className="px-4 py-2 text-right text-xs font-semibold text-[#1B4FD8]">{a.can_act ? "Review" : "View"}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
      {open && (
        <ApprovalDrawer
          approval={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

export function ApprovalDrawer({ approval, onClose, onDone }: { approval: Approval; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = useState("")
  const [delegate, setDelegate] = useState("")
  const [busy, run] = useRun()
  const act = (action: string) =>
    run(action, () => hr.post(`/api/v1/hr/approvals/${approval.id}/act`, { action, comment: comment || null, delegate_to: delegate || null }), `Request ${action === "approve" ? "approved" : action + "ed"}`).then(
      (r) => r && onDone(),
    )
  return (
    <Drawer
      open
      title={approval.title}
      onClose={onClose}
      footer={
        approval.can_act ? (
          <>
            <Btn variant="danger" busy={busy === "reject"} disabled={!comment.trim()} onClick={() => act("reject")} title={comment.trim() ? "" : "Give a reason to reject"}>
              <XIcon className="w-3.5 h-3.5" /> Reject
            </Btn>
            <Btn variant="primary" busy={busy === "approve"} onClick={() => act("approve")}>
              <Check className="w-3.5 h-3.5" /> Approve
            </Btn>
          </>
        ) : approval.status === "pending" && approval.actions.length === 0 ? (
          <Btn busy={busy === "cancel"} onClick={() => act("cancel")}>
            Withdraw request
          </Btn>
        ) : undefined
      }
    >
      <ol className="space-y-2 mb-4">
        {approval.steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-semibold ${
                i < approval.current_index || approval.status === "approved"
                  ? "bg-[#1B4FD8] text-white"
                  : i === approval.current_index && approval.status === "pending"
                    ? "border-2 border-[#1B4FD8] text-[#1B4FD8]"
                    : "bg-gray-100 text-[#64748B]"
              }`}
            >
              {i + 1}
            </span>
            <span className="font-medium text-gray-900">{s.name}</span>
            <span className="text-[11px] text-[#64748B] font-mono">({humanize(s.approver_type)})</span>
          </li>
        ))}
      </ol>
      {approval.waiting_reason && approval.status === "pending" && <p className="text-xs text-[#64748B] mb-3">{approval.waiting_reason}</p>}
      {approval.delegated_to && <p className="text-xs text-[#64748B] mb-3">Delegated to {approval.delegated_to}</p>}
      <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">History</h4>
      <ul className="text-sm space-y-1 mb-4">
        <li className="text-gray-700">
          Raised by <strong className="text-gray-900">{approval.requester_name ?? approval.requester_username}</strong> · {fmtDateTime(approval.created_at)}
        </li>
        {approval.actions.map((a, i) => (
          <li key={i} className="text-gray-700">
            {humanize(a.action)} by <span className="font-medium text-gray-900">{a.actor}</span>
            {a.delegated_to && ` → ${a.delegated_to}`} · {fmtDateTime(a.at)}
            {a.comment && <div className="text-xs text-[#64748B] italic">“{a.comment}”</div>}
          </li>
        ))}
      </ul>
      {approval.can_act && (
        <div className="space-y-3">
          <Field label="Comment" hint="Required when rejecting">
            <textarea rows={2} className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Delegate this step to (HMS username)">
              <input className={inputCls} value={delegate} onChange={(e) => setDelegate(e.target.value.trim())} />
            </Field>
            <Btn busy={busy === "delegate"} disabled={!delegate} onClick={() => act("delegate")}>
              <Forward className="w-3.5 h-3.5" /> Delegate
            </Btn>
          </div>
        </div>
      )}
    </Drawer>
  )
}

const PERMS = ["hr.leaves.write", "hr.attendance.write", "hr.shifts.write", "hr.payroll.write", "hr.recruitment.write", "employees.profile.write", "hr.grievances.manage"]

function Rules() {
  const wfs = useHr(() => hr.get<Workflow[]>("/api/v1/hr/workflows"), [])
  const [edit, setEdit] = useState<Workflow | null>(null)
  const [busy, run] = useRun()
  if (wfs.loading && !wfs.data) return <Loading />
  if (wfs.error) return <ErrorState error={wfs.error} onRetry={wfs.reload} />
  const save = () =>
    edit &&
    run(
      "save",
      () =>
        hr.put(`/api/v1/hr/workflows/${edit.code}`, {
          active: edit.active,
          allow_self_approval: edit.allow_self_approval,
          steps: edit.steps.map(({ name, approver_type, permission, condition, escalate_after_hours }) => ({ name, approver_type, permission, condition, escalate_after_hours })),
        }),
      "Approval rule saved",
    ).then((r) => {
      if (r) {
        setEdit(null)
        wfs.reload()
      }
    })
  return (
    <Panel>
      <Table head={["Workflow", "Steps", "Self-approval", "Active", ""]}>
        {wfs.data!.map((w) => (
          <tr key={w.code}>
            <td className="px-4 py-2 font-semibold text-gray-900">{w.name}</td>
            <td className="px-4 py-2 text-gray-700 text-xs">
              {w.steps.map((s) => `${s.name}${s.condition ? ` (if ${s.condition.field} ${s.condition.op} ${s.condition.value})` : ""}`).join(" → ")}
            </td>
            <td className="px-4 py-2">{w.allow_self_approval ? "Allowed" : "No"}</td>
            <td className="px-4 py-2">{w.active ? "Yes" : "No"}</td>
            <td className="px-4 py-2 text-right">
              <Btn variant="ghost" onClick={() => setEdit(JSON.parse(JSON.stringify(w)))}>
                Edit
              </Btn>
            </td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Drawer
          open
          wide
          title={`Approval rule: ${edit.name}`}
          onClose={() => setEdit(null)}
          footer={
            <>
              <Btn onClick={() => setEdit(null)}>Cancel</Btn>
              <Btn variant="primary" busy={busy === "save"} onClick={save}>
                Save
              </Btn>
            </>
          }
        >
          <div className="flex gap-4 mb-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={edit.allow_self_approval} onChange={(e) => setEdit({ ...edit, allow_self_approval: e.target.checked })} /> Allow requesters to approve their own
            </label>
          </div>
          {edit.steps.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end mb-2">
              <div className="col-span-3">
                <Field label={`Step ${i + 1}`}>
                  <input className={inputCls} value={s.name} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                </Field>
              </div>
              <div className="col-span-3">
                <Field label="Approver">
                  <select className={inputCls} value={s.approver_type} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, approver_type: e.target.value } : x)) })}>
                    <option value="reporting_manager">Reporting manager</option>
                    <option value="department_head">Department head</option>
                    <option value="permission">Anyone with permission</option>
                  </select>
                </Field>
              </div>
              <div className="col-span-3">
                <Field label="Permission (fallback)">
                  <select className={inputCls} value={s.permission ?? ""} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, permission: e.target.value || null } : x)) })}>
                    <option value="">—</option>
                    {PERMS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Escalate after (h)">
                  <input className={inputCls} inputMode="numeric" value={s.escalate_after_hours ?? ""} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, escalate_after_hours: e.target.value ? Number(e.target.value) : null } : x)) })} />
                </Field>
              </div>
              <div className="col-span-1">
                <Btn variant="ghost" onClick={() => setEdit({ ...edit, steps: edit.steps.filter((_, j) => j !== i) })} aria-label="Remove step">
                  <XIcon className="w-3.5 h-3.5" />
                </Btn>
              </div>
              {s.condition && <p className="col-span-12 text-[11px] text-[#64748B]">Applies only when {s.condition.field} {s.condition.op} {String(s.condition.value)}</p>}
            </div>
          ))}
          <Btn onClick={() => setEdit({ ...edit, steps: [...edit.steps, { sequence: edit.steps.length + 1, name: "HR", approver_type: "permission", permission: PERMS[0], condition: null, escalate_after_hours: null }] })}>
            Add step
          </Btn>
        </Drawer>
      )}
    </Panel>
  )
}
