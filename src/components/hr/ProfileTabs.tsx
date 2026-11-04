// Employee profile tabs for Phases 2–5 data. Each reads only what the
// server lets the caller see; the tab list itself hides what they cannot.
import { useState } from "react"
import { Download, Upload } from "lucide-react"
import { hr } from "../../services/hr/client"
import { Btn, Drawer, Empty, Field, Loading, Panel, StatusBadge, Table, fmtDate, humanize, inputCls, money, useHr, useRun } from "./ui"
import { MonthlyCalendar } from "./AttendanceRecords"
import type { Balance, LeaveRequest } from "./LeaveSection"

const iso = (d: Date) => d.toLocaleDateString("en-CA")

export function ShiftTab({ employeeId }: { employeeId: string }) {
  const from = iso(new Date(Date.now() - 7 * 864e5))
  const to = iso(new Date(Date.now() + 27 * 864e5))
  const list = useHr(() => hr.get<any[]>("/api/v1/workforce/assignments", { employee_id: employeeId, date_from: from, date_to: to }), [employeeId])
  return (
    <div className="space-y-4">
      <Panel title="Duty roster (last week and next four)">
        {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="Not rostered" /> : (
          <Table head={["Date", "Shift", "Hours", "Status"]}>
            {list.data.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(a.work_date)}</td>
                <td className="px-4 py-2">{a.is_weekly_off ? "Weekly off" : a.shift_name}</td>
                <td className="px-4 py-2">{a.start_time ? `${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}` : "—"}</td>
                <td className="px-4 py-2"><StatusBadge value={a.status === "published" ? "success" : "draft"} label={a.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <MonthlyCalendar employeeId={employeeId} />
    </div>
  )
}

export function LeaveTab({ employeeId }: { employeeId: string }) {
  const bal = useHr(() => hr.get<Balance[]>(`/api/v1/hr/leave/balances/${employeeId}`), [employeeId])
  const req = useHr(() => hr.get<LeaveRequest[]>("/api/v1/hr/leave/requests", { employee_id: employeeId }), [employeeId])
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title={`Balances ${new Date().getFullYear()}`}>
        {!bal.data?.length ? <Empty title="No leave types configured" /> : (
          <Table head={["Type", "Entitled", "Used", "Pending", "Available"]}>
            {bal.data.map((b) => (
              <tr key={b.leave_type_id}>
                <td className="px-4 py-2">{b.name}</td>
                <td className="px-4 py-2 tabular-nums">{Number(b.allocated) + Number(b.accrued) + Number(b.carried_forward) + Number(b.adjusted)}</td>
                <td className="px-4 py-2 tabular-nums">{Number(b.used)}</td>
                <td className="px-4 py-2 tabular-nums">{Number(b.pending)}</td>
                <td className="px-4 py-2 tabular-nums font-medium">{Number(b.available)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel title="Requests">
        {!req.data?.length ? <Empty title="No leave taken" /> : (
          <Table head={["Type", "Dates", "Days", "Status"]}>
            {req.data.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">{r.leave_type}</td>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(r.start_date)}{r.end_date !== r.start_date && ` – ${fmtDate(r.end_date)}`}</td>
                <td className="px-4 py-2 tabular-nums">{Number(r.days)}</td>
                <td className="px-4 py-2"><StatusBadge value={r.status === "approved" ? "success" : r.status} label={r.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  )
}

export function CompensationTab({ employeeId }: { employeeId: string }) {
  const hist = useHr(() => hr.get<any[]>(`/api/v1/payroll/compensation/${employeeId}`), [employeeId])
  const slips = useHr(() => hr.get<any[]>("/api/v1/payroll/payslips", { employee_id: employeeId }), [employeeId])
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Compensation history">
        {!hist.data?.length ? <Empty title="No compensation on record" hint="Set it under Payroll → Compensation." /> : (
          <Table head={["From", "To", "Monthly gross", "Bank"]}>
            {hist.data.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">{fmtDate(c.effective_from)}</td>
                <td className="px-4 py-2">{c.effective_to ? fmtDate(c.effective_to) : "Current"}</td>
                <td className="px-4 py-2 tabular-nums">{money(c.monthly_gross)}</td>
                <td className="px-4 py-2 font-mono text-xs">{c.bank_account ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel title="Payslips">
        {!slips.data?.length ? <Empty title="No payslips" /> : (
          <Table head={["Number", "Period", "Net"]}>
            {slips.data.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 font-mono text-xs">{p.number}</td>
                <td className="px-4 py-2">{p.month}/{p.year}</td>
                <td className="px-4 py-2 tabular-nums">{money(p.net)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  )
}

const DOC_CATEGORIES = ["identity", "address_proof", "education", "registration", "experience", "medical", "contract", "offer_letter", "training_certificate", "leave_support", "other"]

export function DocumentsTab({ employeeId, canManage, self }: { employeeId: string; canManage: boolean; self?: boolean }) {
  const [history, setHistory] = useState(false)
  const list = useHr(() => hr.get<any[]>("/api/v1/hr/documents", { employee_id: employeeId, history }), [employeeId, history])
  const [up, setUp] = useState<any>(null)
  const [busy, run] = useRun()
  const upload = () =>
    run("up", () => {
      const form = new FormData()
      form.append("file", up.file)
      for (const k of ["category", "title", "issue_date", "expiry_date", "access_level", "replaces"]) if (up[k]) form.append(k, up[k])
      form.append("employee_id", employeeId)
      return hr.post("/api/v1/hr/documents", form)
    }, "Document uploaded").then((r) => {
      if (r) {
        setUp(null)
        list.reload()
      }
    })
  return (
    <Panel
      title="Documents"
      actions={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Older versions</label>
          {(canManage || self) && <Btn variant="primary" onClick={() => setUp({ file: null, category: "registration", title: "", issue_date: "", expiry_date: "", access_level: "employee", replaces: "" })}><Upload className="w-3.5 h-3.5" /> Upload</Btn>}
        </div>
      }
    >
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No documents" /> : (
        <Table head={["Document", "Category", "Version", "Expires", "Visibility", "Verified", ""]}>
          {list.data.map((d) => (
            <tr key={d.id} className={d.is_current ? "" : "text-gray-400"}>
              <td className="px-4 py-2">{d.title}<div className="text-[11px] text-gray-400">{d.filename} · {Math.ceil(d.size_bytes / 1024)} KB</div></td>
              <td className="px-4 py-2">{humanize(d.category)}</td>
              <td className="px-4 py-2">v{d.version}{!d.is_current && " (old)"}</td>
              <td className={`px-4 py-2 whitespace-nowrap ${d.days_to_expiry !== null && d.days_to_expiry < 30 ? "text-rose-700" : ""}`}>{fmtDate(d.expiry_date)}</td>
              <td className="px-4 py-2 text-xs">{d.access_level === "hr_only" ? "HR only" : d.access_level === "confidential" ? "Confidential" : "Employee & HR"}</td>
              <td className="px-4 py-2"><StatusBadge value={d.verification_status === "verified" ? "success" : d.verification_status} label={d.verification_status} /></td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <Btn variant="ghost" onClick={() => window.open(hr.href(`/api/v1/hr/documents/${d.id}/download`), "_blank")} aria-label={`Download ${d.title}`}><Download className="w-3.5 h-3.5" /></Btn>
                {canManage && d.is_current && d.verification_status === "pending" && (
                  <Btn variant="ghost" busy={busy === d.id} onClick={() => run(d.id, () => hr.post(`/api/v1/hr/documents/${d.id}/verified`), "Verified").then(() => list.reload())}>Verify</Btn>
                )}
                {(canManage || self) && d.is_current && <Btn variant="ghost" onClick={() => setUp({ file: null, category: d.category, title: d.title, issue_date: "", expiry_date: "", access_level: d.access_level, replaces: d.id })}>New version</Btn>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {up && (
        <Drawer open title={up.replaces ? `New version of ${up.title}` : "Upload document"} onClose={() => setUp(null)} footer={<><Btn onClick={() => setUp(null)}>Cancel</Btn><Btn variant="primary" busy={busy === "up"} disabled={!up.file || !up.title} onClick={upload}>Upload</Btn></>}>
          <div className="space-y-3">
            <Field label="File" hint="PDF, PNG, JPEG or DOCX, up to 10 MB; stored privately"><input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={(e) => setUp({ ...up, file: e.target.files?.[0] ?? null })} className="text-sm" /></Field>
            <Field label="Title" required><input className={inputCls} value={up.title} onChange={(e) => setUp({ ...up, title: e.target.value })} /></Field>
            <Field label="Category"><select className={inputCls} value={up.category} disabled={!!up.replaces} onChange={(e) => setUp({ ...up, category: e.target.value })}>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Issued"><input type="date" className={inputCls} value={up.issue_date} onChange={(e) => setUp({ ...up, issue_date: e.target.value })} /></Field>
              <Field label="Expires"><input type="date" className={inputCls} value={up.expiry_date} onChange={(e) => setUp({ ...up, expiry_date: e.target.value })} /></Field>
            </div>
            {canManage && <Field label="Who can see it"><select className={inputCls} value={up.access_level} onChange={(e) => setUp({ ...up, access_level: e.target.value })}><option value="employee">Employee and HR</option><option value="hr_only">HR only</option></select></Field>}
          </div>
        </Drawer>
      )}
    </Panel>
  )
}

export function TrainingTab({ employeeId }: { employeeId: string }) {
  const certs = useHr(() => hr.get<any[]>("/api/v1/training/certifications", { employee_id: employeeId }), [employeeId])
  return (
    <Panel title="Training & certificates">
      {!certs.data?.length ? <Empty title="No certificates" /> : (
        <Table head={["Programme", "Certificate", "Issued", "Expires"]}>
          {certs.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2">{c.program}</td>
              <td className="px-4 py-2 font-mono text-xs">{c.certificate_number ?? "—"}</td>
              <td className="px-4 py-2">{fmtDate(c.issued_on)}</td>
              <td className={`px-4 py-2 ${c.days_to_expiry !== null && c.days_to_expiry < 60 ? "text-rose-700" : ""}`}>{c.expires_on ? fmtDate(c.expires_on) : "No expiry"}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

export function PerformanceTab({ employeeId }: { employeeId: string }) {
  const reviews = useHr(() => hr.get<any[]>("/api/v1/performance/reviews"), [employeeId])
  const mine = reviews.data?.filter((r) => r.employee_id === employeeId) ?? []
  return (
    <Panel title="Performance reviews">
      {!mine.length ? <Empty title="No reviews" /> : (
        <Table head={["Cycle", "Stage", "Manager rating", "Final"]}>
          {mine.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">{r.cycle}</td>
              <td className="px-4 py-2">{humanize(r.status)}</td>
              <td className="px-4 py-2 tabular-nums">{r.overall_rating ? Number(r.overall_rating) : "—"}</td>
              <td className="px-4 py-2 tabular-nums">{r.final_rating ? Number(r.final_rating) : "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}
