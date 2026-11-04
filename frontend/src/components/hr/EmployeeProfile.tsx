import { useState } from "react"
import toast from "react-hot-toast"
import { ArrowLeft, BadgeCheck, Fingerprint, Mail, Pencil, Phone, Plus, Repeat, ShieldAlert, XCircle } from "lucide-react"
import { hr, HrApiError } from "../../services/hr/client"
import {
  EMPLOYEE_CATEGORIES,
  EMPLOYMENT_TYPES,
  categoryLabel,
  type AuditEntry,
  type EmployeeDetail,
  type EmploymentRecord,
  type HistoryEntry,
  type Integration,
  type Mapping,
  type Page,
  type Punch,
} from "../../services/hr/types"
import { Avatar, Btn, Drawer, Empty, ErrorState, Field, fmtDate, fmtDateTime, humanize, inputCls, Loading, Pager, Panel, StatusBadge, Table, Tabs, errorText, useHr } from "./ui"
import PhoneInput from "../ui/PhoneInput"
import type { OrgRefs } from "./useOrgRefs"
import { CompensationTab, DocumentsTab, LeaveTab, PerformanceTab, ShiftTab, TrainingTab } from "./ProfileTabs"

type Tab = "overview" | "personal" | "employment" | "credentials" | "departments" | "attendance" | "shifts" | "leave" | "compensation" | "documents" | "training" | "performance" | "history" | "audit"

const ACTIONS: Record<string, { action: string; label: string; danger?: boolean }[]> = {
  draft: [{ action: "activate", label: "Activate" }, { action: "terminate", label: "Cancel hire", danger: true }],
  active: [{ action: "suspend", label: "Suspend" }, { action: "terminate", label: "Terminate", danger: true }],
  suspended: [{ action: "activate", label: "Reinstate" }, { action: "terminate", label: "Terminate", danger: true }],
  terminated: [{ action: "archive", label: "Archive" }],
  archived: [],
}

export default function EmployeeProfile({ employeeId, canEdit, refs, onBack, can = () => false }: { employeeId: string; canEdit: boolean; refs: OrgRefs | null; onBack: () => void; can?: (p: string) => boolean }) {
  const [tab, setTab] = useState<Tab>("overview")
  const emp = useHr(() => hr.get<EmployeeDetail>(`/api/v1/hr/employees/${employeeId}`), [employeeId])
  const [drawer, setDrawer] = useState<null | "edit" | "transfer" | "credential" | "biometric" | { action: string; label: string }>(null)

  if (emp.loading && !emp.data) return <Loading />
  if (emp.error) return <ErrorState error={emp.error} onRetry={emp.reload} />
  const e = emp.data!
  const refresh = (updated?: EmployeeDetail) => (updated ? emp.setData(updated) : emp.reload())
  const readOnly = !canEdit || e.status === "archived"

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-[#1B4FD8] hover:text-[#1E40AF] mb-3 cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Employees Directory
      </button>
      <div className="bg-white border border-[#DDE2EC] rounded p-5 mb-4 shadow-2xs flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <Avatar name={e.full_name} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 tracking-tight">{e.full_name}</h2>
              <StatusBadge value={e.status} />
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              <span className="font-mono font-medium text-gray-700">{e.employee_code}</span> · {e.designation ?? categoryLabel(e.employee_category)} ·{" "}
              {e.departments.find((d) => d.is_primary && !d.effective_to)?.department_name ?? "No department"}
              {e.branch && ` · ${e.branch}`}
            </p>
            <p className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#64748B]">
              {e.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 text-[#64748B]" />{e.phone}</span>}
              {e.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3 text-[#64748B]" />{e.email}</span>}
              {e.reporting_manager && <span>Reports to <strong className="text-gray-900">{e.reporting_manager}</strong></span>}
            </p>
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => setDrawer("edit")}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Btn>
            {(e.status === "active" || e.status === "suspended") && (
              <Btn onClick={() => setDrawer("transfer")}>
                <Repeat className="w-3.5 h-3.5" /> Transfer
              </Btn>
            )}
            {ACTIONS[e.status]?.map((a) => (
              <Btn key={a.action} variant={a.danger ? "danger" : "secondary"} onClick={() => setDrawer(a)}>
                {a.label}
              </Btn>
            ))}
          </div>
        )}
      </div>

      <SummaryStrip employeeId={e.id} version={e.updated_at} />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "personal", label: "Personal" },
          { id: "employment", label: "Employment" },
          { id: "credentials", label: "Credentials", count: e.credentials.length },
          { id: "departments", label: "Departments" },
          { id: "attendance", label: "Attendance" },
          { id: "shifts", label: "Shift & duty" },
          { id: "leave", label: "Leave" },
          ...(can("hr.payroll.write") ? [{ id: "compensation" as Tab, label: "Compensation" }] : []),
          { id: "documents", label: "Documents" },
          { id: "training", label: "Training" },
          { id: "performance", label: "Performance" },
          { id: "history", label: "History" },
          ...(canEdit ? [{ id: "audit" as Tab, label: "Audit" }] : []),
        ]}
      />

      {tab === "overview" && <Overview e={e} />}
      {tab === "personal" && <Personal e={e} canEdit={!readOnly} onSaved={refresh} />}
      {tab === "employment" && <Employment e={e} refs={refs} />}
      {tab === "credentials" && (
        <Credentials e={e} canEdit={!readOnly} onAdd={() => setDrawer("credential")} onChange={() => refresh()} />
      )}
      {tab === "departments" && <Departments e={e} />}
      {tab === "attendance" && <Attendance e={e} canEdit={!readOnly} onMap={() => setDrawer("biometric")} />}
      {tab === "shifts" && <ShiftTab employeeId={e.id} />}
      {tab === "leave" && <LeaveTab employeeId={e.id} />}
      {tab === "compensation" && <CompensationTab employeeId={e.id} />}
      {tab === "documents" && <DocumentsTab employeeId={e.id} canManage={can("hr.documents.write")} />}
      {tab === "training" && <TrainingTab employeeId={e.id} />}
      {tab === "performance" && <PerformanceTab employeeId={e.id} />}
      {tab === "history" && <History id={e.id} />}
      {tab === "audit" && canEdit && <Audit id={e.id} />}

      {drawer === "edit" && <EditDrawer e={e} onClose={() => setDrawer(null)} onSaved={(u) => { setDrawer(null); refresh(u) }} />}
      {drawer === "transfer" && refs && <TransferDrawer e={e} refs={refs} onClose={() => setDrawer(null)} onSaved={(u) => { setDrawer(null); refresh(u) }} />}
      {drawer === "credential" && <CredentialDrawer e={e} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); refresh() }} />}
      {drawer === "biometric" && <BiometricDrawer e={e} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); refresh() }} />}
      {drawer && typeof drawer === "object" && (
        <StatusDrawer e={e} action={drawer.action} label={drawer.label} onClose={() => setDrawer(null)} onSaved={(u) => { setDrawer(null); refresh(u) }} />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm border-b border-[#EEF1F6] last:border-0">
      <span className="text-[#64748B]">{label}</span>
      <span className="text-gray-900 text-right">{value || "—"}</span>
    </div>
  )
}

function Overview({ e }: { e: EmployeeDetail }) {
  const expiring = e.credentials.filter((c) => c.days_to_expiry !== null && c.days_to_expiry <= 60)
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Panel title="Employment">
        <Row label="Category" value={categoryLabel(e.employee_category)} />
        <Row label="Employment type" value={humanize(e.employment_type)} />
        <Row label="Joined" value={fmtDate(e.joining_date)} />
        {e.contract_end_date && <Row label="Contract ends" value={fmtDate(e.contract_end_date)} />}
        {e.exit_date && <Row label="Exit date" value={fmtDate(e.exit_date)} />}
        <Row label="Reports to" value={e.reporting_manager} />
      </Panel>
      <Panel title="Professional">
        <Row label="Qualification" value={e.profile.qualification} />
        <Row label="Specialization" value={e.profile.specialization} />
        <Row label="Competencies" value={e.profile.clinical_competencies.join(", ")} />
        <Row label="Registrations" value={e.credentials.length} />
      </Panel>
      <Panel title="System">
        <Row label="HMS login" value={e.hms_username} />
        <Row label="Biometric IDs" value={e.biometric_ids.join(", ") || <span className="text-amber-700">Not mapped</span>} />
        <Row label="Record created" value={fmtDateTime(e.created_at)} />
        <Row label="Last updated" value={fmtDateTime(e.updated_at)} />
      </Panel>
      {expiring.length > 0 && (
        <div className="lg:col-span-3 flex items-start gap-2 p-3 rounded-[8px] border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <ShieldAlert className="w-4 h-4 mt-0.5" />
          <div>
            {expiring.map((c) => (
              <div key={c.id}>
                {humanize(c.credential_type)} {c.number} {c.days_to_expiry! < 0 ? `expired ${-c.days_to_expiry!} days ago` : `expires in ${c.days_to_expiry} days`} ({fmtDate(c.expires_on)})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Personal({ e, canEdit, onSaved }: { e: EmployeeDetail; canEdit: boolean; onSaved: () => void }) {
  const [contacts, setContacts] = useState(e.contacts.map(({ kind, name, relationship, phone, email }) => ({ kind, name, relationship: relationship ?? "", phone: phone ?? "", email: email ?? "" })))
  const [busy, setBusy] = useState(false)
  if (e.personal_restricted)
    return (
      <Panel>
        <Empty title="Personal details are restricted" hint="Only HR staff who manage employee records, and the employee themselves, can see date of birth, address and contacts." />
      </Panel>
    )
  const save = async () => {
    setBusy(true)
    try {
      await hr.put(
        `/api/v1/hr/employees/${e.id}/contacts`,
        contacts.filter((c) => c.name.trim()).map((c) => ({ ...c, relationship: c.relationship || null, phone: c.phone || null, email: c.email || null })),
      )
      toast.success("Contacts saved")
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Personal information">
        <Row label="Full name" value={e.full_name} />
        <Row label="Gender" value={humanize(e.gender)} />
        <Row label="Date of birth" value={fmtDate(e.date_of_birth)} />
        <Row label="Blood group" value={e.profile.blood_group} />
        <Row label="Phone" value={e.phone} />
        <Row label="Email" value={e.email} />
        <Row label="Address" value={[e.address_line, e.city, e.state, e.postal_code].filter(Boolean).join(", ")} />
      </Panel>
      <Panel
        title="Emergency contacts"
        actions={canEdit && (
          <Btn variant="ghost" onClick={() => setContacts([...contacts, { kind: "emergency", name: "", relationship: "", phone: "", email: "" }])}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Btn>
        )}
      >
        {contacts.length === 0 ? (
          <Empty title="No contacts recorded" />
        ) : (
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                <input className={inputCls} disabled={!canEdit} placeholder="Name" value={c.name} onChange={(ev) => setContacts(contacts.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} />
                <input className={inputCls} disabled={!canEdit} placeholder="Relationship" value={c.relationship} onChange={(ev) => setContacts(contacts.map((x, j) => (j === i ? { ...x, relationship: ev.target.value } : x)))} />
                <PhoneInput size="sm" disabled={!canEdit} placeholder="98765 43210" value={c.phone} onChange={(val) => setContacts(contacts.map((x, j) => (j === i ? { ...x, phone: val } : x)))} />
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="flex justify-end mt-3">
            <Btn variant="primary" busy={busy} onClick={save}>
              Save contacts
            </Btn>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Employment({ e, refs }: { e: EmployeeDetail; refs: OrgRefs | null }) {
  const records = useHr(() => hr.get<EmploymentRecord[]>(`/api/v1/hr/employees/${e.id}/employment`), [e.id, e.updated_at])
  const branch = (id: string | null) => refs?.branches.find((b) => b.id === id)?.name ?? "—"
  const des = (id: string | null) => refs?.designations.find((d) => d.id === id)?.title ?? "—"
  if (records.loading && !records.data) return <Loading />
  if (records.error) return <ErrorState error={records.error} onRetry={records.reload} />
  return (
    <Panel title="Employment records">
      <Table head={["Change", "From", "To", "Status", "Type", "Branch", "Designation", "Reason", "By"]}>
        {records.data!.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-2 font-medium">{humanize(r.change_type)}</td>
            <td className="px-4 py-2 whitespace-nowrap">{fmtDate(r.effective_from)}</td>
            <td className="px-4 py-2 whitespace-nowrap">{r.effective_to ? fmtDate(r.effective_to) : <span className="text-[#007078]">Current</span>}</td>
            <td className="px-4 py-2">
              <StatusBadge value={r.status} />
            </td>
            <td className="px-4 py-2">{humanize(r.employment_type)}</td>
            <td className="px-4 py-2">{branch(r.branch_id)}</td>
            <td className="px-4 py-2">{des(r.designation_id)}</td>
            <td className="px-4 py-2 text-gray-700 max-w-xs truncate" title={r.reason ?? ""}>
              {r.reason ?? "—"}
            </td>
            <td className="px-4 py-2 text-[#64748B] text-xs">{r.created_by}</td>
          </tr>
        ))}
      </Table>
    </Panel>
  )
}

function Credentials({ e, canEdit, onAdd, onChange }: { e: EmployeeDetail; canEdit: boolean; onAdd: () => void; onChange: () => void }) {
  const verify = async (id: string, verdict: "verified" | "rejected") => {
    try {
      await hr.post(`/api/v1/hr/employees/${e.id}/credentials/${id}/${verdict}`)
      toast.success(verdict === "verified" ? "Credential verified" : "Credential rejected")
      onChange()
    } catch (err) {
      toast.error(errorText(err))
    }
  }
  return (
    <Panel
      title="Professional credentials"
      actions={canEdit && (
        <Btn variant="primary" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" /> Add credential
        </Btn>
      )}
    >
      {e.credentials.length === 0 ? (
        <Empty title="No credentials recorded" hint="Registrations, licences and certifications with expiry dates appear here." />
      ) : (
        <Table head={["Type", "Number", "Authority", "Issued", "Expires", "Verification", ""]}>
          {e.credentials.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2">{humanize(c.credential_type)}</td>
              <td className="px-4 py-2 font-mono text-xs">{c.number}</td>
              <td className="px-4 py-2 text-gray-700">{c.issuing_authority ?? "—"}</td>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDate(c.issued_on)}</td>
              <td className={`px-4 py-2 whitespace-nowrap ${c.days_to_expiry !== null && c.days_to_expiry < 60 ? "text-rose-700 font-medium" : ""}`}>
                {fmtDate(c.expires_on)}
                {c.days_to_expiry !== null && c.days_to_expiry < 60 && <span className="text-[11px]"> ({c.days_to_expiry < 0 ? "expired" : `${c.days_to_expiry} d`})</span>}
              </td>
              <td className="px-4 py-2">
                <StatusBadge value={c.verification_status} />
                {c.verified_by && <div className="text-[11px] text-[#64748B]">{c.verified_by}</div>}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {canEdit && c.verification_status === "pending" && (
                  <>
                    <Btn variant="ghost" onClick={() => verify(c.id, "verified")} title="Mark verified">
                      <BadgeCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                    </Btn>
                    <Btn variant="ghost" onClick={() => verify(c.id, "rejected")} title="Reject">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    </Btn>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

function Departments({ e }: { e: EmployeeDetail }) {
  return (
    <Panel title="Department assignments">
      {e.departments.length === 0 ? (
        <Empty title="Not assigned to a department" />
      ) : (
        <Table head={["Department", "Primary", "Allocation", "From", "To"]}>
          {e.departments.map((d) => (
            <tr key={d.id} className={d.effective_to ? "text-gray-400" : ""}>
              <td className="px-4 py-2">{d.department_name}</td>
              <td className="px-4 py-2">{d.is_primary ? "Primary" : "—"}</td>
              <td className="px-4 py-2 tabular-nums">{d.allocation_percent}%</td>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDate(d.effective_from)}</td>
              <td className="px-4 py-2 whitespace-nowrap">{d.effective_to ? fmtDate(d.effective_to) : "Current"}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

function Attendance({ e, canEdit, onMap }: { e: EmployeeDetail; canEdit: boolean; onMap: () => void }) {
  const [page, setPage] = useState(1)
  const punches = useHr(() => hr.get<Page<Punch>>("/api/v1/attendance/punches", { employee_id: e.id, page, page_size: 25 }), [e.id, page])
  return (
    <div className="space-y-4">
      <Panel
        title="Biometric IDs"
        actions={canEdit && e.status !== "terminated" && (
          <Btn onClick={onMap}>
            <Fingerprint className="w-3.5 h-3.5" /> Map biometric ID
          </Btn>
        )}
      >
        {e.biometric_ids.length ? (
          <p className="text-sm">Device user IDs: <span className="font-mono">{e.biometric_ids.join(", ")}</span></p>
        ) : (
          <p className="text-sm text-amber-700">No biometric ID mapped — this employee's punches will appear as unmapped until one is.</p>
        )}
      </Panel>
      <Panel title="Punch history (raw device events)">
        {punches.loading && !punches.data ? (
          <Loading />
        ) : punches.error ? (
          <ErrorState error={punches.error} onRetry={punches.reload} />
        ) : !punches.data?.items.length ? (
          <Empty title="No punches received" />
        ) : (
          <>
            <Table head={["Time", "Device", "Device user", "Verify", "Received"]}>
              {punches.data.items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(p.punch_time)}</td>
                  <td className="px-4 py-2">{p.device_name ?? p.device_serial ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.device_user_id}</td>
                  <td className="px-4 py-2 text-gray-700">{p.verify_mode ?? "—"}</td>
                  <td className="px-4 py-2 text-[#64748B] text-xs whitespace-nowrap">{fmtDateTime(p.received_at)}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={punches.data.total} pageSize={25} onPage={setPage} />
          </>
        )}
      </Panel>
    </div>
  )
}

function History({ id }: { id: string }) {
  const h = useHr(() => hr.get<HistoryEntry[]>(`/api/v1/hr/employees/${id}/history`), [id])
  if (h.loading && !h.data) return <Loading />
  if (h.error) return <ErrorState error={h.error} onRetry={h.reload} />
  return (
    <Panel title="Employment history">
      <ol className="relative border-l border-[#DDE2EC] ml-2">
        {h.data!.map((x) => (
          <li key={x.id} className="ml-4 pb-4">
            <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-blue-100 border-2 border-[#1B4FD8]" />
            <div className="text-sm font-medium text-gray-900">{x.summary}</div>
            <div className="text-[11px] text-[#64748B]">
              {fmtDateTime(x.occurred_at)} · {x.created_by}
              {x.details?.reason && ` · ${x.details.reason}`}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function Audit({ id }: { id: string }) {
  const a = useHr(() => hr.get<AuditEntry[]>(`/api/v1/hr/employees/${id}/audit`), [id])
  if (a.loading && !a.data) return <Loading />
  if (a.error) return <ErrorState error={a.error} onRetry={a.reload} />
  return (
    <Panel title="Audit trail">
      <Table head={["When", "Who", "Action", "Changes"]}>
        {a.data!.map((x) => (
          <tr key={x.id}>
            <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(x.created_at)}</td>
            <td className="px-4 py-2 font-medium">{x.actor}</td>
            <td className="px-4 py-2">{humanize(x.action)}</td>
            <td className="px-4 py-2 text-xs text-gray-700 font-mono max-w-lg truncate" title={JSON.stringify(x.changes)}>
              {x.changes ? Object.keys(x.changes).join(", ") : "—"}
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  )
}

// ── drawers ─────────────────────────────────────────────────────────────────

function EditDrawer({ e, onClose, onSaved }: { e: EmployeeDetail; onClose: () => void; onSaved: (u: EmployeeDetail) => void }) {
  const [f, setF] = useState({
    first_name: e.first_name,
    middle_name: e.middle_name ?? "",
    last_name: e.last_name ?? "",
    phone: e.phone ?? "",
    email: e.email ?? "",
    date_of_birth: e.date_of_birth ?? "",
    address_line: e.address_line ?? "",
    city: e.city ?? "",
    state: e.state ?? "",
    postal_code: e.postal_code ?? "",
    employee_category: e.employee_category,
    employment_type: e.employment_type,
    contract_end_date: e.contract_end_date ?? "",
    hms_username: e.hms_username ?? "",
    qualification: e.profile.qualification ?? "",
    specialization: e.profile.specialization ?? "",
    blood_group: e.profile.blood_group ?? "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const n = (v: string) => (v.trim() ? v.trim() : null)
  const save = async () => {
    setBusy(true)
    const body: Record<string, unknown> = {
      first_name: f.first_name.trim(),
      middle_name: n(f.middle_name),
      last_name: n(f.last_name),
      phone: n(f.phone),
      email: n(f.email),
      employee_category: f.employee_category,
      employment_type: f.employment_type,
      contract_end_date: f.contract_end_date || null,
      hms_username: n(f.hms_username),
      profile: {
        qualification: n(f.qualification),
        specialization: n(f.specialization),
        blood_group: f.blood_group || null,
        clinical_competencies: e.profile.clinical_competencies,
        languages: e.profile.languages,
      },
    }
    if (!e.personal_restricted) Object.assign(body, { date_of_birth: f.date_of_birth || null, address_line: n(f.address_line), city: n(f.city), state: n(f.state), postal_code: n(f.postal_code) })
    try {
      onSaved(await hr.patch<EmployeeDetail>(`/api/v1/hr/employees/${e.id}`, body))
      toast.success("Employee updated")
    } catch (err) {
      if (err instanceof HrApiError) setErrors(err.fieldErrors)
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  const input = (k: keyof typeof f, label: string, type = "text") => (
    <Field label={label} error={errors[k] ?? errors[`profile.${k}`]}>
      {k === "phone" ? (
        <PhoneInput
          size="sm"
          value={f.phone}
          onChange={(val) => setF({ ...f, phone: val })}
          placeholder="98765 43210"
        />
      ) : (
        <input type={type} className={inputCls} value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} />
      )}
    </Field>
  )
  return (
    <Drawer
      open
      wide
      title={`Edit ${e.full_name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} onClick={save} disabled={!f.first_name.trim()}>
            Save changes
          </Btn>
        </>
      }
    >
      <p className="text-xs text-[#64748B] mb-3">Branch, department, designation and manager change through Transfer, and status through the lifecycle actions, so the history is kept.</p>
      <div className="grid grid-cols-3 gap-3">
        {input("first_name", "First name")}
        {input("middle_name", "Middle name")}
        {input("last_name", "Last name")}
        {input("phone", "Phone")}
        {input("email", "Email", "email")}
        {!e.personal_restricted && input("date_of_birth", "Date of birth", "date")}
        <Field label="Category">
          <select className={inputCls} value={f.employee_category} onChange={(ev) => setF({ ...f, employee_category: ev.target.value })}>
            {EMPLOYEE_CATEGORIES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employment type">
          <select className={inputCls} value={f.employment_type} onChange={(ev) => setF({ ...f, employment_type: ev.target.value })}>
            {EMPLOYMENT_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {input("contract_end_date", "Contract ends", "date")}
        {!e.personal_restricted && (
          <>
            <div className="col-span-3">{input("address_line", "Address")}</div>
            {input("city", "City")}
            {input("state", "State")}
            {input("postal_code", "Postal code")}
          </>
        )}
        {input("qualification", "Qualification")}
        {input("specialization", "Specialization")}
        <Field label="Blood group">
          <select className={inputCls} value={f.blood_group} onChange={(ev) => setF({ ...f, blood_group: ev.target.value })}>
            <option value="">—</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        {input("hms_username", "HMS login username")}
      </div>
    </Drawer>
  )
}

function TransferDrawer({ e, refs, onClose, onSaved }: { e: EmployeeDetail; refs: OrgRefs; onClose: () => void; onSaved: (u: EmployeeDetail) => void }) {
  const current = e.departments.filter((d) => !d.effective_to)
  const [f, setF] = useState({
    effective_from: new Date().toISOString().slice(0, 10),
    branch_id: e.branch_id ?? "",
    designation_id: e.designation_id ?? "",
    primary: current.find((d) => d.is_primary)?.department_id ?? "",
    secondary: current.filter((d) => !d.is_primary).map((d) => d.department_id),
    reason: "",
  })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const updated = await hr.post<EmployeeDetail>(`/api/v1/hr/employees/${e.id}/transfer`, {
        effective_from: f.effective_from,
        branch_id: f.branch_id || null,
        designation_id: f.designation_id || null,
        reason: f.reason,
        departments: [
          { department_id: f.primary, is_primary: true },
          ...f.secondary.filter((d) => d !== f.primary).map((d) => ({ department_id: d, is_primary: false, allocation_percent: 50 })),
        ],
      })
      toast.success("Transfer recorded")
      onSaved(updated)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      title={`Transfer ${e.full_name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!f.primary || f.reason.trim().length < 3} onClick={save}>
            Record transfer
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Effective from" required>
          <input type="date" className={inputCls} value={f.effective_from} onChange={(ev) => setF({ ...f, effective_from: ev.target.value })} />
        </Field>
        <Field label="Primary department" required>
          <select className={inputCls} value={f.primary} onChange={(ev) => setF({ ...f, primary: ev.target.value })}>
            <option value="">Select…</option>
            {refs.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Additional departments" hint="Shared staff, e.g. a nurse covering ICU and ER">
          <div className="max-h-36 overflow-y-auto border border-[#DDE2EC] rounded p-2 space-y-1">
            {refs.departments
              .filter((d) => d.id !== f.primary)
              .map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.secondary.includes(d.id)}
                    onChange={(ev) => setF({ ...f, secondary: ev.target.checked ? [...f.secondary, d.id] : f.secondary.filter((x) => x !== d.id) })}
                  />
                  {d.name}
                </label>
              ))}
          </div>
        </Field>
        <Field label="Branch">
          <select className={inputCls} value={f.branch_id} onChange={(ev) => setF({ ...f, branch_id: ev.target.value })}>
            <option value="">Unchanged</option>
            {refs.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Designation">
          <select className={inputCls} value={f.designation_id} onChange={(ev) => setF({ ...f, designation_id: ev.target.value })}>
            <option value="">Unchanged</option>
            {refs.designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" required>
          <textarea rows={3} className={inputCls} value={f.reason} onChange={(ev) => setF({ ...f, reason: ev.target.value })} />
        </Field>
      </div>
    </Drawer>
  )
}

function StatusDrawer({ e, action, label, onClose, onSaved }: { e: EmployeeDetail; action: string; label: string; onClose: () => void; onSaved: (u: EmployeeDetail) => void }) {
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const updated = await hr.post<EmployeeDetail>(`/api/v1/hr/employees/${e.id}/${action}`, { reason, effective_date: date })
      toast.success(`${e.full_name}: ${label.toLowerCase()} recorded`)
      onSaved(updated)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      title={`${label} ${e.full_name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant={action === "terminate" ? "danger" : "primary"} busy={busy} disabled={reason.trim().length < 3} onClick={save}>
            {label}
          </Btn>
        </>
      }
    >
      {action === "terminate" && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-[6px] p-2 mb-3">
          Ends department assignments and biometric mappings from the exit date. The record is kept, not deleted.
        </p>
      )}
      <div className="space-y-3">
        <Field label={action === "terminate" ? "Exit date" : "Effective date"}>
          <input type="date" className={inputCls} value={date} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
        <Field label="Reason" required>
          <textarea rows={3} className={inputCls} value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </Field>
      </div>
    </Drawer>
  )
}

function CredentialDrawer({ e, onClose, onSaved }: { e: EmployeeDetail; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ credential_type: "medical_registration", number: "", issuing_authority: "", issued_on: "", expires_on: "" })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await hr.post(`/api/v1/hr/employees/${e.id}/credentials`, {
        ...f,
        issuing_authority: f.issuing_authority || null,
        issued_on: f.issued_on || null,
        expires_on: f.expires_on || null,
      })
      toast.success("Credential added")
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      title="Add credential"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!f.number} onClick={save}>
            Save
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Type">
            <select className={inputCls} value={f.credential_type} onChange={(ev) => setF({ ...f, credential_type: ev.target.value })}>
              <option value="medical_registration">Medical council registration</option>
              <option value="nursing_registration">Nursing council registration</option>
              <option value="pharmacy_registration">Pharmacy council registration</option>
              <option value="licence">Licence</option>
              <option value="certification">Certification</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Number" required>
          <input className={inputCls} value={f.number} onChange={(ev) => setF({ ...f, number: ev.target.value })} />
        </Field>
        <Field label="Issuing authority">
          <input className={inputCls} value={f.issuing_authority} onChange={(ev) => setF({ ...f, issuing_authority: ev.target.value })} />
        </Field>
        <Field label="Issued on">
          <input type="date" className={inputCls} value={f.issued_on} onChange={(ev) => setF({ ...f, issued_on: ev.target.value })} />
        </Field>
        <Field label="Expires on">
          <input type="date" className={inputCls} value={f.expires_on} onChange={(ev) => setF({ ...f, expires_on: ev.target.value })} />
        </Field>
      </div>
    </Drawer>
  )
}

function BiometricDrawer({ e, onClose, onSaved }: { e: EmployeeDetail; onClose: () => void; onSaved: () => void }) {
  const integrations = useHr(() => hr.get<Integration[]>("/api/v1/attendance/integrations"), [])
  const [f, setF] = useState({ integration_id: "", device_user_id: "", effective_from: e.joining_date ?? "" })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const m = await hr.post<Mapping>("/api/v1/attendance/mappings", { ...f, employee_id: e.id, effective_from: f.effective_from || null })
      toast.success(m.claimed_punches ? `Mapped; ${m.claimed_punches} earlier punches attributed` : "Biometric ID mapped")
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      title="Map biometric ID"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!f.integration_id || !f.device_user_id} onClick={save}>
            Map
          </Btn>
        </>
      }
    >
      {integrations.error ? (
        <ErrorState error={integrations.error} />
      ) : integrations.data?.length === 0 ? (
        <Empty title="No attendance integration configured" hint="Set one up under Attendance → Devices & integrations first." />
      ) : (
        <div className="space-y-3">
          <Field label="Integration" required>
            <select className={inputCls} value={f.integration_id} onChange={(ev) => setF({ ...f, integration_id: ev.target.value })}>
              <option value="">Select…</option>
              {integrations.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.is_simulator ? " (simulator)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Device user ID (PIN)" required hint="The enrolment number on the eSSL device — no fingerprint or face data is stored here">
            <input className={inputCls} value={f.device_user_id} onChange={(ev) => setF({ ...f, device_user_id: ev.target.value.trim() })} />
          </Field>
          <Field label="Valid from" hint="Earlier unmapped punches from this date are attributed to this employee">
            <input type="date" className={inputCls} value={f.effective_from} onChange={(ev) => setF({ ...f, effective_from: ev.target.value })} />
          </Field>
        </div>
      )}
    </Drawer>
  )
}


function SummaryStrip({ employeeId, version }: { employeeId: string; version: string }) {
  const s = useHr(
    () => hr.get<{ tenure: string; attendance_rate: number | null; days_worked: number; absences: number; late_days: number; leave_available: number; next_shift: { date: string; name: string; start: string } | null; open_exceptions: number }>(`/api/v1/hr/employees/${employeeId}/summary`),
    [employeeId, version],
  )
  if (!s.data) return null
  const d = s.data
  const cell = (label: string, value: React.ReactNode, sub?: string, tone = "text-gray-900") => (
    <div className="px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">{label}</div>
      <div className={`text-base font-bold font-mono tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#64748B]">{sub}</div>}
    </div>
  )
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 divide-x divide-[#EEF1F6] bg-white border border-[#DDE2EC] rounded mb-4 shadow-2xs">
      {cell("Tenure", d.tenure)}
      {cell("Attendance this month", d.attendance_rate !== null ? `${d.attendance_rate}%` : "—", `${d.days_worked} days worked`, d.attendance_rate !== null && d.attendance_rate < 90 ? "text-amber-700" : "text-[#16A34A]")}
      {cell("Absences", d.absences, "this month", d.absences ? "text-rose-700" : undefined)}
      {cell("Late days", d.late_days, "this month", d.late_days > 2 ? "text-amber-700" : undefined)}
      {cell("Leave available", d.leave_available, "paid days")}
      {cell("Next shift", d.next_shift ? fmtDate(d.next_shift.date) : "—", d.next_shift ? `${d.next_shift.name} ${d.next_shift.start.slice(0, 5)}` : "not rostered")}
    </div>
  )
}
