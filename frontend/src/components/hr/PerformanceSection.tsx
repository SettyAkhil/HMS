import { useState } from "react"
import { Plus } from "lucide-react"
import { hr } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES } from "../../services/hr/types"
import { Btn, Drawer, Empty, Field, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, fmtDate, humanize, filterCls, inputCls, useHr, useRun } from "./ui"

type Cycle = { id: string; name: string; period_start: string; period_end: string; status: string; criteria: Record<string, { code: string; label: string; weight: number }[]>; rating_scale: number }
export type Review = { id: string; cycle: string; employee_id: string; employee_name: string; reviewer_name: string | null; status: string; self_comments: string | null; manager_comments: string | null; hr_comments: string | null; overall_rating: string | null; final_rating: string | null; rating_scale: number; scores: { criterion: string; label: string; weight: number; self_score: number | null; manager_score: number | null }[]; goals: { id: string; title: string; target: string | null; weight: number; progress: number; status: string }[] }

export default function PerformanceSection({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<"reviews" | "cycles">("reviews")
  return (
    <div>
      <PageHeader title="Performance" subtitle="Review cycles, self-assessment, manager evaluation, HR approval and goals" />
      <Tabs value={tab} onChange={setTab} items={[{ id: "reviews", label: "Reviews" }, ...(canManage ? [{ id: "cycles" as const, label: "Review cycles" }] : [])]} />
      {tab === "reviews" && <Reviews />}
      {tab === "cycles" && <Cycles />}
    </div>
  )
}

export function Reviews({ mine }: { mine?: boolean }) {
  const list = useHr(() => hr.get<Review[]>("/api/v1/performance/reviews", { mine: mine || undefined }), [])
  const [open, setOpen] = useState<Review | null>(null)
  return (
    <Panel title={mine ? "My reviews" : "Performance reviews"}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No reviews" hint={mine ? "Reviews appear when HR launches a cycle." : "Launch a review cycle to create reviews."} /> : (
        <Table head={["Employee", "Cycle", "Reviewer", "Stage", "Manager rating", "Final"]}>
          {list.data.map((r) => (
            <tr key={r.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setOpen(r)}>
              <td className="px-4 py-2">{r.employee_name}</td>
              <td className="px-4 py-2">{r.cycle}</td>
              <td className="px-4 py-2">{r.reviewer_name ?? "HR"}</td>
              <td className="px-4 py-2"><StatusBadge value={r.status === "completed" ? "success" : "pending"} label={humanize(r.status)} /></td>
              <td className="px-4 py-2 tabular-nums">{r.overall_rating ? `${Number(r.overall_rating)} / ${r.rating_scale}` : "—"}</td>
              <td className="px-4 py-2 tabular-nums">{r.final_rating ? Number(r.final_rating) : "—"}</td>
            </tr>
          ))}
        </Table>
      )}
      {open && <ReviewDrawer review={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); list.reload() }} />}
    </Panel>
  )
}

function ReviewDrawer({ review, onClose, onDone }: { review: Review; onClose: () => void; onDone: () => void }) {
  const field = review.status === "self_assessment" ? "self_score" : "manager_score"
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(review.scores.map((s) => [s.criterion, (s[field] as number) ?? 0])))
  const [comments, setComments] = useState("")
  const [busy, run] = useRun()
  const submit = () =>
    run("s", () => hr.post(`/api/v1/performance/reviews/${review.id}/submit`, { scores: review.status === "hr_review" ? {} : Object.fromEntries(Object.entries(scores).filter(([, v]) => v > 0)), comments: comments || null }), "Review submitted").then((r) => r && onDone())
  const editable = review.status !== "completed"
  const stepLabel: Record<string, string> = { self_assessment: "Self-assessment", manager_review: "Manager review", hr_review: "HR approval" }
  return (
    <Drawer open wide title={`${review.employee_name} · ${review.cycle}`} onClose={onClose} footer={editable && <><Btn onClick={onClose}>Close</Btn><Btn variant="primary" busy={busy === "s"} onClick={submit}>Submit {stepLabel[review.status]?.toLowerCase()}</Btn></>}>
      <p className="text-xs text-gray-500 mb-3">Stage: {humanize(review.status)} · scale 1–{review.rating_scale}. Only the person whose step it is can submit; the server enforces it.</p>
      <Table head={["Criterion", "Weight", "Self", "Manager"]}>
        {review.scores.map((s) => (
          <tr key={s.criterion}>
            <td className="px-4 py-2">{s.label}</td>
            <td className="px-4 py-2 tabular-nums">{s.weight}%</td>
            {(["self_score", "manager_score"] as const).map((k) => (
              <td key={k} className="px-4 py-2">
                {editable && k === field && review.status !== "hr_review" ? (
                  <select className={filterCls + " w-20"} value={scores[s.criterion] || ""} onChange={(e) => setScores({ ...scores, [s.criterion]: Number(e.target.value) })}>
                    <option value="">—</option>
                    {Array.from({ length: review.rating_scale }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
                  </select>
                ) : (
                  s[k] ?? "—"
                )}
              </td>
            ))}
          </tr>
        ))}
      </Table>
      {review.self_comments && <p className="text-sm mt-3"><span className="text-gray-500 font-medium">Employee:</span> {review.self_comments}</p>}
      {review.manager_comments && <p className="text-sm mt-1"><span className="text-gray-500 font-medium">Manager:</span> {review.manager_comments}</p>}
      {review.hr_comments && <p className="text-sm mt-1"><span className="text-gray-500 font-medium">HR:</span> {review.hr_comments}</p>}
      {!!review.goals.length && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Goals</h4>
          <ul className="text-sm space-y-1">{review.goals.map((g) => <li key={g.id}>{g.title} {g.target && <span className="text-gray-400">(target {g.target})</span>} — {g.progress}%</li>)}</ul>
        </div>
      )}
      {editable && <div className="mt-4"><Field label="Comments"><textarea rows={3} className={inputCls} value={comments} onChange={(e) => setComments(e.target.value)} /></Field></div>}
    </Drawer>
  )
}

function Cycles() {
  const list = useHr(() => hr.get<Cycle[]>("/api/v1/performance/cycles"), [])
  const [f, setF] = useState<any>(null)
  const [goal, setGoal] = useState<any>(null)
  const [busy, run] = useRun()
  const total = (rows: { weight: number }[]) => rows.reduce((a, b) => a + Number(b.weight || 0), 0)
  return (
    <Panel title="Review cycles" actions={<Btn variant="primary" onClick={() => setF({ name: "", period_start: "", period_end: "", rating_scale: 5, criteria: { default: [{ code: "quality", label: "Quality of work", weight: 40 }, { code: "teamwork", label: "Teamwork", weight: 30 }, { code: "reliability", label: "Reliability & attendance", weight: 30 }] } })}><Plus className="w-3.5 h-3.5" /> New cycle</Btn>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No review cycles" /> : (
        <Table head={["Cycle", "Period", "Criteria sets", "Status", ""]}>
          {list.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2">{c.name}</td>
              <td className="px-4 py-2">{fmtDate(c.period_start)} – {fmtDate(c.period_end)}</td>
              <td className="px-4 py-2 text-xs">{Object.keys(c.criteria).map(humanize).join(", ")}</td>
              <td className="px-4 py-2"><StatusBadge value={c.status === "active" ? "success" : "draft"} label={humanize(c.status)} /></td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {c.status !== "closed" && <Btn variant="ghost" busy={busy === c.id} onClick={() => run(c.id, () => hr.post<{ reviews_created: number }>(`/api/v1/performance/cycles/${c.id}/launch`), (r) => `${r.reviews_created} reviews created`).then(() => list.reload())}>Launch reviews</Btn>}
                <Btn variant="ghost" onClick={() => setGoal({ cycle_id: c.id, title: "", target: "", weight: "0", department_id: null })}>Add KPI</Btn>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {f && (
        <Drawer open wide title="New review cycle" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "s"} disabled={!f.name || !f.period_start || !f.period_end || Object.values(f.criteria).some((rows: any) => total(rows) !== 100)} onClick={() => run("s", () => hr.post("/api/v1/performance/cycles", f), "Cycle created").then((r) => { if (r) { setF(null); list.reload() } })}>Save</Btn></>}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Field label="Name" required><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="From"><input type="date" className={inputCls} value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} /></Field>
            <Field label="To"><input type="date" className={inputCls} value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} /></Field>
          </div>
          {Object.entries(f.criteria as Record<string, any[]>).map(([key, rows]) => (
            <div key={key} className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{key === "default" ? "Default criteria" : humanize(key)} <span className={total(rows) === 100 ? "text-[#1B4FD8]" : "text-rose-700"}>· {total(rows)}%</span></h4>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-6 gap-2 mb-1">
                  <input className={inputCls + " col-span-4"} value={r.label} onChange={(e) => setF({ ...f, criteria: { ...f.criteria, [key]: rows.map((x, j) => (j === i ? { ...x, label: e.target.value, code: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || x.code } : x)) } })} />
                  <input className={inputCls} inputMode="numeric" value={r.weight} onChange={(e) => setF({ ...f, criteria: { ...f.criteria, [key]: rows.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value.replace(/\D/g, "")) } : x)) } })} />
                  <Btn variant="ghost" onClick={() => setF({ ...f, criteria: { ...f.criteria, [key]: rows.filter((_, j) => j !== i) } })}>Remove</Btn>
                </div>
              ))}
              <Btn variant="ghost" onClick={() => setF({ ...f, criteria: { ...f.criteria, [key]: [...rows, { code: `c${rows.length + 1}`, label: "", weight: 0 }] } })}>Add criterion</Btn>
            </div>
          ))}
          <select className={filterCls + " max-w-xs"} value="" onChange={(e) => e.target.value && setF({ ...f, criteria: { ...f.criteria, [e.target.value]: [{ code: "care", label: "Patient care", weight: 100 }] } })} aria-label="Add category criteria">
            <option value="">Add criteria for a staff category…</option>
            {EMPLOYEE_CATEGORIES.filter(([k]) => !(k in f.criteria)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Drawer>
      )}
      {goal && (
        <Drawer open title="Add department KPI or goal" onClose={() => setGoal(null)} footer={<><Btn onClick={() => setGoal(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "g"} disabled={goal.title.length < 3 || !goal.department_id} onClick={() => run("g", () => hr.post("/api/v1/performance/goals", { ...goal, weight: Number(goal.weight), target: goal.target || null }), "KPI added").then((r) => r && setGoal(null))}>Save</Btn></>}>
          <DeptPicker value={goal.department_id} onChange={(id) => setGoal({ ...goal, department_id: id })} />
          <div className="space-y-3 mt-3">
            <Field label="KPI" required><input className={inputCls} value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} placeholder="e.g. Hand-hygiene compliance" /></Field>
            <Field label="Target"><input className={inputCls} value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} placeholder="≥ 95%" /></Field>
          </div>
        </Drawer>
      )}
    </Panel>
  )
}

function DeptPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const depts = useHr(() => hr.get<{ id: string; name: string }[]>("/api/v1/hr/departments"), [])
  return (
    <Field label="Department" required>
      <select className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </Field>
  )
}
