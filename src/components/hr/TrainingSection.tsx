import { useState } from "react"
import { Plus } from "lucide-react"
import { hr } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES, type EmployeeListItem, type Page } from "../../services/hr/types"
import { Btn, Drawer, Empty, Field, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, filterCls, fmtDate, fmtDateTime, humanize, inputCls, useHr, useRun } from "./ui"
import useOrgRefs from "./useOrgRefs"

type Program = { id: string; code: string; title: string; category: string; validity_months: number | null; mandatory_for: string[]; pass_score: number | null }
type Session = { id: string; program_id: string; program: string; category: string; starts_at: string; ends_at: string; location: string | null; trainer: string | null; capacity: number | null; enrolled: number; status: string }

export default function TrainingSection({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<"matrix" | "sessions" | "programs" | "certs">("matrix")
  return (
    <div>
      <PageHeader title="Training & certification" subtitle="BLS, ACLS, fire safety, infection control and clinical training, with renewals" />
      <Tabs value={tab} onChange={setTab} items={[{ id: "matrix", label: "Mandatory training" }, { id: "sessions", label: "Sessions" }, { id: "programs", label: "Programmes" }, { id: "certs", label: "Certificates" }]} />
      {tab === "matrix" && <Matrix />}
      {tab === "sessions" && <Sessions canManage={canManage} />}
      {tab === "programs" && <Programs canManage={canManage} />}
      {tab === "certs" && <Certificates canManage={canManage} />}
    </div>
  )
}

const CELL: Record<string, string> = { valid: "bg-[#1B4FD8] text-white", expiring: "bg-amber-100 text-amber-900 border border-amber-300", expired: "bg-rose-600 text-white", missing: "bg-[#F0F2F5] text-gray-400" }

function Matrix() {
  const refs = useOrgRefs()
  const [dept, setDept] = useState("")
  const m = useHr(() => hr.get<{ programs: { id: string; code: string; title: string }[]; rows: { employee_id: string; employee_name: string; category: string; cells: Record<string, { state: string; expires_on: string | null }> }[]; gaps: number }>("/api/v1/training/matrix", { department_id: dept || undefined }), [dept])
  return (
    <Panel title={m.data ? `Mandatory training · ${m.data.gaps} gaps` : "Mandatory training"} actions={<select className={filterCls} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">All departments</option>{refs.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}>
      {m.loading && !m.data ? <Loading /> : !m.data?.programs.length ? <Empty title="No mandatory programmes" hint="Mark a programme mandatory for staff categories (e.g. BLS for nurses) to see who is covered." /> : (
        <div className="overflow-x-auto -mx-4">
          <table className="text-xs">
            <thead><tr><th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Employee</th>{m.data.programs.map((p) => <th key={p.id} className="px-2 py-2 font-semibold text-gray-500 uppercase tracking-wider" title={p.title}>{p.code}</th>)}</tr></thead>
            <tbody>
              {m.data.rows.map((r) => (
                <tr key={r.employee_id} className="border-t border-[#DDE2EC]">
                  <td className="px-4 py-1 text-sm text-gray-900 font-medium">{r.employee_name}</td>
                  {m.data!.programs.map((p) => {
                    const c = r.cells[p.id]
                    return <td key={p.id} className="px-1 py-1 text-center">{c ? <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${CELL[c.state]}`} title={c.expires_on ? `expires ${c.expires_on}` : ""}>{c.state === "valid" ? "✓" : humanize(c.state)}</span> : <span className="text-gray-300">n/a</span>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function Programs({ canManage }: { canManage: boolean }) {
  const list = useHr(() => hr.get<Program[]>("/api/v1/training/programs"), [])
  const [f, setF] = useState<any>(null)
  const [busy, run] = useRun()
  return (
    <Panel title="Training programmes" actions={canManage && <Btn variant="primary" onClick={() => setF({ code: "", title: "", category: "bls", validity_months: "24", mandatory_for: [] as string[], pass_score: "" })}><Plus className="w-3.5 h-3.5" /> Programme</Btn>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No programmes" /> : (
        <Table head={["Code", "Title", "Category", "Valid for", "Mandatory for", "Pass mark"]}>
          {list.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
              <td className="px-4 py-2">{p.title}</td>
              <td className="px-4 py-2">{humanize(p.category)}</td>
              <td className="px-4 py-2">{p.validity_months ? `${p.validity_months} months` : "No expiry"}</td>
              <td className="px-4 py-2 text-xs">{p.mandatory_for.length ? p.mandatory_for.map(humanize).join(", ") : "—"}</td>
              <td className="px-4 py-2">{p.pass_score ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
      {f && (
        <Drawer open title="New training programme" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.code || f.title.length < 3} onClick={() => run("s", () => hr.post("/api/v1/training/programs", { ...f, validity_months: f.validity_months ? Number(f.validity_months) : null, pass_score: f.pass_score ? Number(f.pass_score) : null }), "Programme created").then((r) => { if (r) { setF(null); list.reload() } })}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required><input className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Category"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["bls", "acls", "fire_safety", "infection_control", "clinical", "department", "other"].map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select></Field>
            <div className="col-span-2"><Field label="Title" required><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
            <Field label="Certificate valid for (months)"><input className={inputCls} inputMode="numeric" value={f.validity_months} onChange={(e) => setF({ ...f, validity_months: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Pass mark"><input className={inputCls} inputMode="numeric" value={f.pass_score} onChange={(e) => setF({ ...f, pass_score: e.target.value.replace(/\D/g, "") })} /></Field>
            <div className="col-span-2">
              <Field label="Mandatory for">
                <div className="flex flex-wrap gap-2">
                  {[["all", "Everyone"], ...EMPLOYEE_CATEGORIES].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.mandatory_for.includes(k)} onChange={(e) => setF({ ...f, mandatory_for: e.target.checked ? [...f.mandatory_for, k] : f.mandatory_for.filter((x: string) => x !== k) })} />{l}</label>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </Drawer>
      )}
    </Panel>
  )
}

function Sessions({ canManage }: { canManage: boolean }) {
  const programs = useHr(() => hr.get<Program[]>("/api/v1/training/programs"), [])
  const list = useHr(() => hr.get<Session[]>("/api/v1/training/sessions"), [])
  const [f, setF] = useState<any>(null)
  const [open, setOpen] = useState<Session | null>(null)
  const [busy, run] = useRun()
  return (
    <Panel title="Training sessions" actions={canManage && <Btn variant="primary" disabled={!programs.data?.length} onClick={() => setF({ program_id: programs.data?.[0]?.id, starts_at: "", ends_at: "", location: "", trainer: "", capacity: "" })}><Plus className="w-3.5 h-3.5" /> Schedule session</Btn>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No sessions" /> : (
        <Table head={["Programme", "When", "Where", "Trainer", "Enrolled", ""]}>
          {list.data.map((s) => (
            <tr key={s.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setOpen(s)}>
              <td className="px-4 py-2">{s.program}</td>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(s.starts_at)}</td>
              <td className="px-4 py-2">{s.location ?? "—"}</td>
              <td className="px-4 py-2">{s.trainer ?? "—"}</td>
              <td className="px-4 py-2 tabular-nums">{s.enrolled}{s.capacity ? ` / ${s.capacity}` : ""}</td>
              <td className="px-4 py-2 text-right text-xs text-[#007078]">Open</td>
            </tr>
          ))}
        </Table>
      )}
      {f && (
        <Drawer open title="Schedule a session" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.starts_at || !f.ends_at} onClick={() => run("s", () => hr.post("/api/v1/training/sessions", { ...f, starts_at: new Date(f.starts_at).toISOString(), ends_at: new Date(f.ends_at).toISOString(), capacity: f.capacity ? Number(f.capacity) : null, location: f.location || null, trainer: f.trainer || null }), "Session scheduled").then((r) => { if (r) { setF(null); list.reload() } })}>Save</Btn></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Programme"><select className={inputCls} value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>{programs.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field></div>
            <Field label="Starts"><input type="datetime-local" className={inputCls} value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
            <Field label="Ends"><input type="datetime-local" className={inputCls} value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
            <Field label="Location"><input className={inputCls} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
            <Field label="Trainer"><input className={inputCls} value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} /></Field>
            <Field label="Capacity"><input className={inputCls} inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value.replace(/\D/g, "") })} /></Field>
          </div>
        </Drawer>
      )}
      {open && <SessionDrawer session={open} canManage={canManage} onClose={() => { setOpen(null); list.reload() }} />}
    </Panel>
  )
}

function SessionDrawer({ session, canManage, onClose }: { session: Session; canManage: boolean; onClose: () => void }) {
  const enr = useHr(() => hr.get<{ id: string; employee_name: string; status: string; score: number | null }[]>(`/api/v1/training/sessions/${session.id}/enrollments`), [session.id])
  const [q, setQ] = useState("")
  const people = useHr(() => (q.length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, status: "active", page_size: 8 }) : Promise.resolve(null)), [q])
  const [busy, run] = useRun()
  const result = (id: string, status: string) => {
    let score: number | null = null
    if (status === "passed" || status === "failed") {
      const s = window.prompt("Score (0–100)?")
      if (s === null) return
      score = Number(s)
    }
    run(id, () => hr.post(`/api/v1/training/enrollments/${id}/result`, { status, score }), status === "passed" ? "Passed; certificate issued" : "Result recorded").then(() => enr.reload())
  }
  return (
    <Drawer open wide title={`${session.program} · ${fmtDate(session.starts_at)}`} onClose={onClose}>
      {canManage && (
        <div className="max-w-sm mb-4">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Enrol staff: search" />
          {people.data?.items.map((p) => (
            <button key={p.id} onClick={() => run("enrol", () => hr.post(`/api/v1/training/sessions/${session.id}/enroll`, { employee_ids: [p.id] }), `${p.full_name} enrolled`).then(() => { setQ(""); enr.reload() })} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[#F8FAFC] rounded text-gray-800">
              {p.full_name} <span className="text-[11px] text-gray-400">{p.department}</span>
            </button>
          ))}
        </div>
      )}
      {!enr.data?.length ? <Empty title="Nobody enrolled" /> : (
        <Table head={["Employee", "Status", "Score", ""]}>
          {enr.data.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-2">{e.employee_name}</td>
              <td className="px-4 py-2"><StatusBadge value={e.status === "passed" || e.status === "attended" ? "success" : e.status === "enrolled" ? "pending" : "failed"} label={humanize(e.status)} /></td>
              <td className="px-4 py-2">{e.score ?? "—"}</td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {canManage && e.status === "enrolled" && (
                  <>
                    <Btn variant="ghost" busy={busy === e.id} onClick={() => result(e.id, "passed")}>Passed</Btn>
                    <Btn variant="ghost" onClick={() => result(e.id, "attended")}>Attended</Btn>
                    <Btn variant="ghost" onClick={() => result(e.id, "failed")}>Failed</Btn>
                    <Btn variant="ghost" onClick={() => result(e.id, "no_show")}>No-show</Btn>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Drawer>
  )
}

function Certificates({ canManage }: { canManage: boolean }) {
  const [within, setWithin] = useState("90")
  const list = useHr(() => hr.get<any[]>("/api/v1/training/certifications", { expiring_within: within ? Number(within) : undefined }), [within])
  return (
    <Panel title="Certificates" actions={<select className={filterCls} value={within} onChange={(e) => setWithin(e.target.value)} aria-label="Expiring"><option value="30">Expiring in 30 days</option><option value="90">Expiring in 90 days</option><option value="">All valid</option></select>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No certificates in this range" /> : (
        <Table head={["Employee", "Programme", "Number", "Issued", "Expires"]}>
          {list.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2">{c.employee_name}</td>
              <td className="px-4 py-2">{c.program}</td>
              <td className="px-4 py-2 font-mono text-xs">{c.certificate_number ?? "—"}</td>
              <td className="px-4 py-2">{fmtDate(c.issued_on)}</td>
              <td className={`px-4 py-2 ${c.days_to_expiry !== null && c.days_to_expiry < 30 ? "text-rose-700 font-medium" : ""}`}>{c.expires_on ? `${fmtDate(c.expires_on)} (${c.days_to_expiry} d)` : "No expiry"}</td>
            </tr>
          ))}
        </Table>
      )}
      {canManage && <p className="text-[11px] text-gray-500 mt-2">Certificates are issued automatically when a session result is marked passed; renewal reminders come from the nightly compliance scan.</p>}
    </Panel>
  )
}
