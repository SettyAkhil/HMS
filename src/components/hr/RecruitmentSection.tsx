import { useState } from "react"
import { CheckCircle2, Circle, Copy, Plus } from "lucide-react"
import toast from "react-hot-toast"
import { hr } from "../../services/hr/client"
import { Btn, Drawer, Empty, ErrorState, Field, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, fmtDate, fmtDateTime, humanize, filterCls, inputCls, money, useHr, useRun } from "./ui"
import useOrgRefs from "./useOrgRefs"
import type { ShiftTemplate } from "./ShiftsSection"

type Req = { id: string; code: string; department_id: string; designation_id: string; positions: number; employment_type: string; justification: string; status: string; created_by: string; created_at: string }
type Vacancy = { id: string; requisition_id: string; title: string; description: string; openings: number; status: string; closes_on: string | null; pipeline: Record<string, number>; hired: number }
type Appl = { id: string; stage: string; rejection_reason: string | null; employee_id: string | null; vacancy_id: string; vacancy: string; candidate_id: string; candidate_name: string; email: string | null; phone: string | null; experience_years: string | null; source: string | null; interviews: any[]; offer: { id: string; status: string; offered_gross: string; joining_date: string; expires_on: string } | null; created_at: string }
const STAGES = ["applied", "screening", "interview", "selected", "offered", "hired"]

export default function RecruitmentSection({ canManage, canActivate }: { canManage: boolean; canActivate: boolean }) {
  const [tab, setTab] = useState<"pipeline" | "vacancies" | "requisitions">("pipeline")
  return (
    <div>
      <PageHeader title="Recruitment & onboarding" subtitle="Requisitions, vacancies, candidates, interviews, offers and activation" />
      <Tabs value={tab} onChange={setTab} items={[{ id: "pipeline", label: "Candidate pipeline" }, { id: "vacancies", label: "Vacancies" }, { id: "requisitions", label: "Requisitions" }]} />
      {tab === "pipeline" && <Pipeline canManage={canManage} canActivate={canActivate} />}
      {tab === "vacancies" && <Vacancies canManage={canManage} />}
      {tab === "requisitions" && <Requisitions />}
    </div>
  )
}

function Requisitions() {
  const refs = useOrgRefs()
  const list = useHr(() => hr.get<Req[]>("/api/v1/recruitment/requisitions"), [])
  const [f, setF] = useState<any>(null)
  const [busy, run] = useRun()
  const dn = (id: string) => refs.data?.departments.find((d) => d.id === id)?.name ?? "—"
  const des = (id: string) => refs.data?.designations.find((d) => d.id === id)?.title ?? "—"
  return (
    <Panel title="Manpower requisitions" actions={<Btn variant="primary" onClick={() => setF({ department_id: "", designation_id: "", positions: "1", employment_type: "permanent", justification: "" })}><Plus className="w-3.5 h-3.5" /> Raise requisition</Btn>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No requisitions" hint="A department raises one; approval (department head, then HR) lets recruiters open a vacancy." /> : (
        <Table head={["Code", "Department", "Role", "Positions", "Justification", "Raised by", "Status"]}>
          {list.data.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
              <td className="px-4 py-2 font-medium">{dn(r.department_id)}</td>
              <td className="px-4 py-2">{des(r.designation_id)}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{r.positions}</td>
              <td className="px-4 py-2 text-gray-700 max-w-xs truncate" title={r.justification}>{r.justification}</td>
              <td className="px-4 py-2 text-xs text-[#64748B]">{r.created_by} · {fmtDate(r.created_at)}</td>
              <td className="px-4 py-2"><StatusBadge value={r.status === "approved" || r.status === "filled" ? "success" : r.status} label={r.status} /></td>
            </tr>
          ))}
        </Table>
      )}
      {f && (
        <Drawer open title="Raise a manpower requisition" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.department_id || !f.designation_id || f.justification.length < 10} onClick={() => run("s", () => hr.post("/api/v1/recruitment/requisitions", { ...f, positions: Number(f.positions) }), "Requisition sent for approval").then((r) => { if (r) { setF(null); list.reload() } })}>Submit</Btn></>}>
          <div className="space-y-3">
            <Field label="Department" required><select className={inputCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">Select…</option>{refs.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Designation" required><select className={inputCls} value={f.designation_id} onChange={(e) => setF({ ...f, designation_id: e.target.value })}><option value="">Select…</option>{refs.data?.designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Positions"><input className={inputCls} inputMode="numeric" value={f.positions} onChange={(e) => setF({ ...f, positions: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Employment type"><select className={inputCls} value={f.employment_type} onChange={(e) => setF({ ...f, employment_type: e.target.value })}>{["permanent", "contract", "probation", "visiting", "intern", "part_time"].map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</select></Field>
            </div>
            <Field label="Justification" required hint="Why the hire is needed (vacancy, new service, workload)"><textarea rows={4} className={inputCls} value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} /></Field>
          </div>
        </Drawer>
      )}
    </Panel>
  )
}

function Vacancies({ canManage }: { canManage: boolean }) {
  const list = useHr(() => hr.get<Vacancy[]>("/api/v1/recruitment/vacancies"), [])
  const reqs = useHr(() => hr.get<Req[]>("/api/v1/recruitment/requisitions", { status: "approved" }), [])
  const [f, setF] = useState<any>(null)
  const [busy, run] = useRun()
  return (
    <Panel title="Vacancies" actions={canManage && <Btn variant="primary" disabled={!reqs.data?.length} onClick={() => setF({ requisition_id: reqs.data?.[0]?.id, title: "", description: "", requirements: "", openings: "1", closes_on: "" })}><Plus className="w-3.5 h-3.5" /> Open vacancy</Btn>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No vacancies" hint={reqs.data?.length ? undefined : "A vacancy needs an approved requisition."} /> : (
        <Table head={["Vacancy", "Openings", "Applications", "Interview", "Offered", "Hired", "Closes", "Status", ""]}>
          {list.data.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-2">{v.title}</td>
              <td className="px-4 py-2 tabular-nums">{v.openings}</td>
              <td className="px-4 py-2 tabular-nums">{Object.values(v.pipeline).reduce((a, b) => a + b, 0)}</td>
              <td className="px-4 py-2 tabular-nums">{v.pipeline.interview ?? 0}</td>
              <td className="px-4 py-2 tabular-nums">{v.pipeline.offered ?? 0}</td>
              <td className="px-4 py-2 tabular-nums">{v.hired}</td>
              <td className="px-4 py-2">{fmtDate(v.closes_on)}</td>
              <td className="px-4 py-2"><StatusBadge value={v.status === "open" ? "success" : "draft"} label={humanize(v.status)} /></td>
              <td className="px-4 py-2 text-right">{canManage && v.status !== "closed" && <Btn variant="ghost" onClick={() => run(v.id, () => hr.post(`/api/v1/recruitment/vacancies/${v.id}/${v.status === "open" ? "on_hold" : "open"}`), "Updated").then(() => list.reload())}>{v.status === "open" ? "Hold" : "Reopen"}</Btn>}</td>
            </tr>
          ))}
        </Table>
      )}
      {f && (
        <Drawer open wide title="Open a vacancy" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={f.title.length < 3 || f.description.length < 10} onClick={() => run("s", () => hr.post("/api/v1/recruitment/vacancies", { ...f, openings: Number(f.openings), closes_on: f.closes_on || null, requirements: f.requirements || null }), "Vacancy opened").then((r) => { if (r) { setF(null); list.reload() } })}>Open</Btn></>}>
          <div className="space-y-3">
            <Field label="Requisition"><select className={inputCls} value={f.requisition_id} onChange={(e) => setF({ ...f, requisition_id: e.target.value })}>{reqs.data?.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.positions} position(s)</option>)}</select></Field>
            <Field label="Title" required><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Job description" required><textarea rows={5} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Requirements"><textarea rows={3} className={inputCls} value={f.requirements} onChange={(e) => setF({ ...f, requirements: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Openings"><input className={inputCls} inputMode="numeric" value={f.openings} onChange={(e) => setF({ ...f, openings: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Closes on"><input type="date" className={inputCls} value={f.closes_on} onChange={(e) => setF({ ...f, closes_on: e.target.value })} /></Field>
            </div>
          </div>
        </Drawer>
      )}
    </Panel>
  )
}

function Pipeline({ canManage, canActivate }: { canManage: boolean; canActivate: boolean }) {
  const vacancies = useHr(() => hr.get<Vacancy[]>("/api/v1/recruitment/vacancies", { status: "open" }), [])
  const [vac, setVac] = useState("")
  const [version, setVersion] = useState(0)
  const apps = useHr(() => hr.get<Appl[]>("/api/v1/recruitment/applications", { vacancy_id: vac || undefined }), [vac, version])
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Appl | null>(null)
  const reload = () => setVersion((v) => v + 1)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select className={filterCls + " max-w-xs"} value={vac} onChange={(e) => setVac(e.target.value)} aria-label="Vacancy">
          <option value="">All open vacancies</option>
          {vacancies.data?.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
        </select>
        {canManage && <Btn variant="primary" disabled={!vacancies.data?.length} onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5" /> Add candidate</Btn>}
      </div>
      {apps.loading && !apps.data ? <Loading /> : apps.error ? <ErrorState error={apps.error} onRetry={apps.reload} /> : (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          {STAGES.map((st) => {
            const col = apps.data?.filter((a) => a.stage === st) ?? []
            return (
              <div key={st} className="bg-[#F8FAFC] border border-[#DDE2EC] rounded p-2 min-h-[160px]">
                <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">{humanize(st)} · {col.length}</div>
                <div className="space-y-1.5">
                  {col.map((a) => (
                    <button key={a.id} onClick={() => setOpen(a)} className="w-full text-left bg-white border border-[#DDE2EC] rounded p-2 hover:border-[#1B4FD8] shadow-2xs transition-colors cursor-pointer">
                      <div className="text-sm font-semibold text-gray-900">{a.candidate_name}</div>
                      <div className="text-[11px] text-[#64748B] truncate">{a.vacancy}</div>
                      {a.experience_years && <div className="text-[11px] text-[#64748B]">{Number(a.experience_years)} yrs</div>}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!!apps.data?.filter((a) => ["rejected", "withdrawn"].includes(a.stage)).length && (
        <p className="text-xs text-[#64748B]">{apps.data.filter((a) => ["rejected", "withdrawn"].includes(a.stage)).length} rejected or withdrawn applications are hidden from the board.</p>
      )}
      {adding && <AddCandidate vacancies={vacancies.data ?? []} defaultVacancy={vac} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
      {open && <ApplicationDrawer app={open} canManage={canManage} canActivate={canActivate} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload() }} />}
    </div>
  )
}

function AddCandidate({ vacancies, defaultVacancy, onClose, onDone }: { vacancies: Vacancy[]; defaultVacancy: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ vacancy_id: defaultVacancy || vacancies[0]?.id || "", first_name: "", last_name: "", email: "", phone: "", source: "", experience_years: "", qualification: "", current_employer: "" })
  const [resume, setResume] = useState<File | null>(null)
  const [busy, run] = useRun()
  const save = () =>
    run("s", async () => {
      const { vacancy_id, ...rest } = f
      const cand = await hr.post<{ id: string }>("/api/v1/recruitment/candidates", Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : k === "experience_years" ? Number(v) : v])))
      if (resume) {
        const form = new FormData()
        form.append("file", resume)
        form.append("category", "resume")
        form.append("title", `Resume – ${f.first_name}`)
        form.append("candidate_id", cand.id)
        await hr.post("/api/v1/hr/documents", form)
      }
      return hr.post("/api/v1/recruitment/applications", { vacancy_id, candidate_id: cand.id })
    }, "Candidate added").then((r) => r && onDone())
  return (
    <Drawer open title="Add candidate" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.first_name || !f.vacancy_id} onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Vacancy"><select className={inputCls} value={f.vacancy_id} onChange={(e) => setF({ ...f, vacancy_id: e.target.value })}>{vacancies.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}</select></Field></div>
        <Field label="First name" required><input className={inputCls} value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
        <Field label="Last name"><input className={inputCls} value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Experience (years)"><input className={inputCls} inputMode="decimal" value={f.experience_years} onChange={(e) => setF({ ...f, experience_years: e.target.value })} /></Field>
        <Field label="Source"><input className={inputCls} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Referral, job portal…" /></Field>
        <Field label="Qualification"><input className={inputCls} value={f.qualification} onChange={(e) => setF({ ...f, qualification: e.target.value })} /></Field>
        <Field label="Current employer"><input className={inputCls} value={f.current_employer} onChange={(e) => setF({ ...f, current_employer: e.target.value })} /></Field>
        <div className="col-span-2"><Field label="Resume (PDF/DOCX, kept in private storage)"><input type="file" accept=".pdf,.docx" onChange={(e) => setResume(e.target.files?.[0] ?? null)} className="text-sm" /></Field></div>
      </div>
    </Drawer>
  )
}

function ApplicationDrawer({ app, canManage, canActivate, onClose, onChanged }: { app: Appl; canManage: boolean; canActivate: boolean; onClose: () => void; onChanged: () => void }) {
  const [busy, run] = useRun()
  const [iv, setIv] = useState<any>(null)
  const [fb, setFb] = useState<any>(null)
  const [offer, setOffer] = useState<any>(null)
  const [activation, setActivation] = useState<any>(null)
  const [password, setPassword] = useState<string | null>(null)
  const tasks = useHr(() => (app.offer?.status === "accepted" ? hr.get<any[]>(`/api/v1/onboarding/${app.id}/tasks`) : Promise.resolve([])), [app.id])
  const shifts = useHr(() => hr.get<ShiftTemplate[]>("/api/v1/workforce/shifts"), [])
  const structures = useHr(() => hr.get<{ id: string; name: string }[]>("/api/v1/payroll/structures").catch(() => []), [])
  const move = (stage: string) => {
    const reason = stage === "rejected" ? window.prompt("Reason for rejecting?") : null
    if (stage === "rejected" && !reason) return
    run(stage, () => hr.post(`/api/v1/recruitment/applications/${app.id}/stage`, { stage, reason }), `Moved to ${humanize(stage)}`).then((r) => r && onChanged())
  }
  const activate = () =>
    run("act", () => hr.post<any>(`/api/v1/onboarding/${app.id}/activate`, Object.fromEntries(Object.entries(activation).map(([k, v]) => [k, v === "" ? null : v]))), "Employee activated").then((r) => {
      if (!r) return
      if (r.temporary_password) setPassword(r.temporary_password)
      else onChanged()
      Object.entries(r.steps ?? {}).forEach(([k, v]) => toast(`${humanize(k)}: ${v}`, { duration: 6000 }))
    })
  const blocking = tasks.data?.filter((t) => t.required_for_activation && !["done", "waived"].includes(t.status)) ?? []
  return (
    <Drawer open wide title={`${app.candidate_name} · ${app.vacancy}`} onClose={onClose}>
      <p className="text-sm text-gray-700 mb-3">
        <StatusBadge value={app.stage === "hired" ? "success" : app.stage === "rejected" ? "failed" : "pending"} label={humanize(app.stage)} /> {app.email} {app.phone && `· ${app.phone}`} {app.source && `· via ${app.source}`}
      </p>
      {app.rejection_reason && <p className="text-xs text-rose-700 mb-3">Rejected: {app.rejection_reason}</p>}
      {canManage && !["hired", "rejected", "withdrawn"].includes(app.stage) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {app.stage === "applied" && <Btn busy={busy === "screening"} onClick={() => move("screening")}>Shortlist</Btn>}
          {["applied", "screening", "interview"].includes(app.stage) && <Btn onClick={() => setIv({ round_name: "Technical", scheduled_at: "", mode: "in_person", interviewers: "" })}>Schedule interview</Btn>}
          {["screening", "interview"].includes(app.stage) && <Btn variant="primary" busy={busy === "selected"} onClick={() => move("selected")}>Select</Btn>}
          {app.stage === "selected" && <Btn variant="primary" onClick={() => setOffer({ offered_gross: "", joining_date: "", expires_on: "", terms: "" })}>Make offer</Btn>}
          <Btn variant="danger" busy={busy === "rejected"} onClick={() => move("rejected")}>Reject</Btn>
        </div>
      )}
      <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">Interviews</h4>
      {!app.interviews.length ? <p className="text-sm text-[#64748B] mb-4">None scheduled</p> : (
        <ul className="text-sm mb-4 space-y-1">
          {app.interviews.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span>{i.round_name} · {fmtDateTime(i.scheduled_at)} {i.interviewers.length > 0 && <span className="text-[#64748B]">({i.interviewers.join(", ")})</span>}{i.feedback && <span className="block text-xs text-[#64748B]">{i.rating}/5 · {i.recommendation} — {i.feedback}</span>}</span>
              {i.status === "scheduled" && <Btn variant="ghost" onClick={() => setFb({ id: i.id, rating: 3, recommendation: "hold", feedback: "" })}>Record feedback</Btn>}
            </li>
          ))}
        </ul>
      )}
      {app.offer && (
        <div className="mb-4 text-sm">
          <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">Offer</h4>
          {money(app.offer.offered_gross)}/month · joins {fmtDate(app.offer.joining_date)} · expires {fmtDate(app.offer.expires_on)} · <StatusBadge value={app.offer.status === "accepted" ? "success" : app.offer.status === "sent" ? "pending" : "failed"} label={app.offer.status} />
          {app.offer.status === "sent" && canManage && (
            <div className="flex gap-2 mt-2">
              <Btn variant="primary" busy={busy === "acc"} onClick={() => run("acc", () => hr.post(`/api/v1/recruitment/offers/${app.offer!.id}/respond`, { response: "accepted" }), "Offer accepted; onboarding checklist created").then((r) => r && onChanged())}>Candidate accepted</Btn>
              <Btn busy={busy === "dec"} onClick={() => run("dec", () => hr.post(`/api/v1/recruitment/offers/${app.offer!.id}/respond`, { response: "declined" }), "Offer declined").then((r) => r && onChanged())}>Declined</Btn>
            </div>
          )}
        </div>
      )}
      {app.offer?.status === "accepted" && app.stage !== "hired" && (
        <div className="mb-4">
          <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">Onboarding checklist</h4>
          <ul className="space-y-1 mb-3">
            {tasks.data?.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  {["done", "waived"].includes(t.status) ? <CheckCircle2 className="w-4 h-4 text-[#16A34A]" /> : <Circle className="w-4 h-4 text-gray-300" />}
                  {t.title} {!t.required_for_activation && <span className="text-[11px] text-[#64748B]">(optional)</span>}
                  {t.status === "waived" && <span className="text-[11px] text-[#64748B]">waived: {t.notes}</span>}
                </span>
                {canManage && t.status === "pending" && (
                  <span className="flex gap-1">
                    <Btn variant="ghost" onClick={() => run(t.id, () => hr.patch(`/api/v1/onboarding/tasks/${t.id}`, { status: "done" }), "Done").then(() => tasks.reload())}>Done</Btn>
                    <Btn variant="ghost" onClick={() => { const n = window.prompt("Why waive this step?"); n && run(t.id, () => hr.patch(`/api/v1/onboarding/tasks/${t.id}`, { status: "waived", notes: n }), "Waived").then(() => tasks.reload()) }}>Waive</Btn>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canActivate && (
            <Btn variant="primary" disabled={blocking.length > 0} title={blocking.length ? "Complete the required steps first" : ""} onClick={() => setActivation({ hms_username: "", biometric_pin: "", shift_template_id: "", structure_id: "" })}>
              Activate as employee
            </Btn>
          )}
        </div>
      )}
      {iv && (
        <div className="border-t border-[#DDE2EC] pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Round"><input className={inputCls} value={iv.round_name} onChange={(e) => setIv({ ...iv, round_name: e.target.value })} /></Field>
            <Field label="When"><input type="datetime-local" className={inputCls} value={iv.scheduled_at} onChange={(e) => setIv({ ...iv, scheduled_at: e.target.value })} /></Field>
            <Field label="Mode"><select className={inputCls} value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })}><option value="in_person">In person</option><option value="video">Video</option><option value="phone">Phone</option></select></Field>
            <Field label="Interviewers (HMS usernames, comma separated)"><input className={inputCls} value={iv.interviewers} onChange={(e) => setIv({ ...iv, interviewers: e.target.value })} /></Field>
          </div>
          <Btn variant="primary" busy={busy === "iv"} disabled={!iv.scheduled_at} onClick={() => run("iv", () => hr.post("/api/v1/recruitment/interviews", { ...iv, application_id: app.id, scheduled_at: new Date(iv.scheduled_at).toISOString(), interviewers: iv.interviewers.split(",").map((x: string) => x.trim()).filter(Boolean) }), "Interview scheduled").then((r) => r && onChanged())}>Schedule</Btn>
        </div>
      )}
      {fb && (
        <div className="border-t border-[#DDE2EC] pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rating (1–5)"><input className={inputCls} inputMode="numeric" value={fb.rating} onChange={(e) => setFb({ ...fb, rating: Number(e.target.value.replace(/\D/g, "")) })} /></Field>
            <Field label="Recommendation"><select className={inputCls} value={fb.recommendation} onChange={(e) => setFb({ ...fb, recommendation: e.target.value })}><option value="hire">Hire</option><option value="hold">Hold</option><option value="reject">Reject</option></select></Field>
          </div>
          <Field label="Feedback"><textarea rows={3} className={inputCls} value={fb.feedback} onChange={(e) => setFb({ ...fb, feedback: e.target.value })} /></Field>
          <Btn variant="primary" busy={busy === "fb"} disabled={fb.feedback.length < 3} onClick={() => run("fb", () => hr.post(`/api/v1/recruitment/interviews/${fb.id}/feedback`, { rating: fb.rating, recommendation: fb.recommendation, feedback: fb.feedback }), "Feedback recorded").then((r) => r && onChanged())}>Save feedback</Btn>
        </div>
      )}
      {offer && (
        <div className="border-t border-[#DDE2EC] pt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Monthly gross (₹)"><input className={inputCls} inputMode="decimal" value={offer.offered_gross} onChange={(e) => setOffer({ ...offer, offered_gross: e.target.value })} /></Field>
            <Field label="Joining date"><input type="date" className={inputCls} value={offer.joining_date} onChange={(e) => setOffer({ ...offer, joining_date: e.target.value })} /></Field>
            <Field label="Offer expires"><input type="date" className={inputCls} value={offer.expires_on} onChange={(e) => setOffer({ ...offer, expires_on: e.target.value })} /></Field>
          </div>
          <Field label="Terms"><textarea rows={3} className={inputCls} value={offer.terms} onChange={(e) => setOffer({ ...offer, terms: e.target.value })} /></Field>
          <Btn variant="primary" busy={busy === "of"} disabled={!offer.offered_gross || !offer.joining_date || !offer.expires_on} onClick={() => run("of", () => hr.post("/api/v1/recruitment/offers", { ...offer, application_id: app.id, offered_gross: Number(offer.offered_gross), terms: offer.terms || null }), "Offer sent").then((r) => r && onChanged())}>Send offer</Btn>
        </div>
      )}
      {activation && !password && (
        <div className="border-t border-[#DDE2EC] pt-3 space-y-2">
          <p className="text-xs text-[#64748B]">Creates the employee record from the offer. Optional: an HMS login (created as you, through the HMS user service), the eSSL PIN to map, a first-week shift, and the salary structure to set pay from the offer.</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="HMS username"><input className={inputCls} value={activation.hms_username} onChange={(e) => setActivation({ ...activation, hms_username: e.target.value.trim() })} /></Field>
            <Field label="eSSL device user ID (PIN)"><input className={inputCls} value={activation.biometric_pin} onChange={(e) => setActivation({ ...activation, biometric_pin: e.target.value.trim() })} /></Field>
            <Field label="First-week shift"><select className={inputCls} value={activation.shift_template_id} onChange={(e) => setActivation({ ...activation, shift_template_id: e.target.value })}><option value="">—</option>{shifts.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Salary structure"><select className={inputCls} value={activation.structure_id} onChange={(e) => setActivation({ ...activation, structure_id: e.target.value })}><option value="">—</option>{structures.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          </div>
          <Btn variant="primary" busy={busy === "act"} onClick={activate}>Activate</Btn>
        </div>
      )}
      {password && (
        <div className="border-t border-[#DDE2EC] pt-3 space-y-2">
          <p className="text-sm text-gray-900 font-medium">HMS login created. Temporary password — shown once, not stored anywhere; hand it to the employee and ask them to change it:</p>
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">{password}</code>
            <Btn variant="ghost" onClick={() => navigator.clipboard?.writeText(password).then(() => toast.success("Copied"))}><Copy className="w-3.5 h-3.5" /></Btn>
          </div>
          <Btn variant="primary" onClick={() => { setPassword(null); onChanged() }}>Done</Btn>
        </div>
      )}
    </Drawer>
  )
}
