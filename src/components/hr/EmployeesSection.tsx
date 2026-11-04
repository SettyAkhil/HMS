import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { Download, Fingerprint, LayoutGrid, List, Phone, Plus, Search, Upload, X } from "lucide-react"
import { hr, HrApiError } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES, EMPLOYMENT_TYPES, categoryLabel, type EmployeeDetail, type EmployeeListItem, type Page } from "../../services/hr/types"
import { Avatar, Btn, Drawer, Empty, ErrorState, Field, fmtDate, filterCls, inputCls, Loading, PageHeader, Pager, Panel, StatusBadge, Table, errorText, useHr } from "./ui"
import useOrgRefs, { type OrgRefs } from "./useOrgRefs"
import EmployeeProfile from "./EmployeeProfile"

type Filters = { search: string; status: string; employee_category: string; department_id: string; branch_id: string; employment_type: string; unmapped: boolean }
const NO_FILTERS: Filters = { search: "", status: "active", employee_category: "", department_id: "", branch_id: "", employment_type: "", unmapped: false }

export default function EmployeesSection({ canEdit, initialFilters, openEmployeeId, onCloseEmployee, can }: {
  canEdit: boolean
  can?: (p: string) => boolean
  initialFilters?: Partial<Filters>
  openEmployeeId?: string | null
  onCloseEmployee?: () => void
}) {
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, ...initialFilters })
  const [search, setSearch] = useState(filters.search)
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<string | null>(openEmployeeId ?? null)
  const refs = useOrgRefs()

  useEffect(() => setSelected(openEmployeeId ?? null), [openEmployeeId])
  useEffect(() => {
    if (!search) {
      setFilters((f) => ({ ...f, search: "" }))
      setPage(1)
      return
    }
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search }))
      setPage(1)
    }, 60)
    return () => clearTimeout(t)
  }, [search])

  const list = useHr(
    () => hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { ...filters, unmapped: filters.unmapped || undefined, page, page_size: 25 }),
    [filters, page, version],
  )
  const facets = useHr(
    () => hr.get<{ employee_category: Record<string, number>; status: Record<string, number> }>("/api/v1/hr/employees/facets", { ...filters, unmapped: filters.unmapped || undefined }),
    [filters, version],
  )
  const [view, setView] = useState<"table" | "cards">(() => {
    try {
      return (localStorage.getItem("hr.directory.view") as "table" | "cards") || "table"
    } catch {
      return "table"
    }
  })
  const chooseView = (v: "table" | "cards") => {
    setView(v)
    try {
      localStorage.setItem("hr.directory.view", v)
    } catch {
      /* per-browser preference only */
    }
  }
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  if (selected)
    return (
      <EmployeeProfile
        employeeId={selected}
        canEdit={canEdit}
        refs={refs.data}
        can={can}
        onBack={() => {
          setSelected(null)
          onCloseEmployee?.()
          setVersion((v) => v + 1)
        }}
      />
    )

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="One employee master for every HR area"
        actions={
          <>
            {canEdit && (
              <>
                <Btn onClick={() => window.open(hr.href("/api/v1/hr/employees/export.csv", { ...filters, unmapped: filters.unmapped || undefined }), "_blank")}>
                  <Download className="w-3.5 h-3.5" /> Export
                </Btn>
                <Btn onClick={() => setImporting(true)}>
                  <Upload className="w-3.5 h-3.5" /> Import
                </Btn>
                <Btn variant="primary" onClick={() => setCreating(true)}>
                  <Plus className="w-3.5 h-3.5" /> New employee
                </Btn>
              </>
            )}
          </>
        }
      />
      <Panel>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#64748B]" />
            <input
              className={`${inputCls} pl-8 ${search ? "pr-8" : ""}`}
              placeholder="Search name, code, email, phone (instant)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearch("")}
              aria-label="Search employees"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-[#64748B] hover:text-gray-900 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <select className={filterCls} value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            {["active", "draft", "suspended", "terminated", "archived"].map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select className={filterCls} value={filters.employee_category} onChange={(e) => set({ employee_category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {EMPLOYEE_CATEGORIES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select className={filterCls} value={filters.department_id} onChange={(e) => set({ department_id: e.target.value })} aria-label="Department">
            <option value="">All departments</option>
            {refs.data?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select className={filterCls} value={filters.branch_id} onChange={(e) => set({ branch_id: e.target.value })} aria-label="Branch">
            <option value="">All branches</option>
            {refs.data?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select className={filterCls} value={filters.employment_type} onChange={(e) => set({ employment_type: e.target.value })} aria-label="Employment type">
            <option value="">All types</option>
            {EMPLOYMENT_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-700 px-1 font-medium cursor-pointer">
            <input type="checkbox" checked={filters.unmapped} onChange={(e) => set({ unmapped: e.target.checked })} /> No biometric ID
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <Chip active={!filters.employee_category} onClick={() => set({ employee_category: "" })} label="All" n={Object.values(facets.data?.employee_category ?? {}).reduce((a, b) => a + b, 0)} />
          {Object.entries(facets.data?.employee_category ?? {})
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => (
              <Chip key={k} active={filters.employee_category === k} onClick={() => set({ employee_category: filters.employee_category === k ? "" : k })} label={categoryLabel(k)} n={n} />
            ))}
          <div className="ml-auto inline-flex rounded border border-[#DDE2EC] bg-[#F8FAFC] p-0.5" role="group" aria-label="View">
            {(["table", "cards"] as const).map((v) => (
              <button key={v} onClick={() => chooseView(v)} aria-pressed={view === v} className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${view === v ? "bg-[#1B4FD8] text-white shadow-2xs" : "text-gray-600 hover:text-gray-900"}`}>
                {v === "table" ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
                {v === "table" ? "Table" : "Cards"}
              </button>
            ))}
          </div>
        </div>

        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : !list.data?.items.length ? (
          <Empty
            title={list.data?.total === 0 && !filters.search && filters.status === "active" ? "No employees yet" : "No employees match these filters"}
            hint={canEdit ? "Add employees one by one, or import a CSV." : undefined}
          />
        ) : (
          <>
            {view === "cards" ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {list.data.items.map((e) => (
                  <button key={e.id} onClick={() => setSelected(e.id)} className="text-left flex gap-3 p-3.5 rounded border border-[#DDE2EC] hover:border-[#1B4FD8] hover:shadow-xs transition bg-white cursor-pointer shadow-2xs">
                    <Avatar name={e.full_name} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900 truncate">{e.full_name}</span>
                        {e.status !== "active" && <StatusBadge value={e.status} />}
                      </span>
                      <span className="block text-xs text-gray-700 truncate mt-0.5">{e.designation ?? categoryLabel(e.employee_category)}</span>
                      <span className="block text-[11px] text-[#64748B] truncate">{e.department ?? "No department"}{e.branch ? ` · ${e.branch}` : ""}</span>
                      <span className="flex items-center gap-3 mt-2 text-[11px] text-[#64748B]">
                        <span className="font-mono">{e.employee_code}</span>
                        {e.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{e.phone}</span>}
                        <Fingerprint className={`w-3.5 h-3.5 ml-auto ${e.biometric_mapped ? "text-[#1B4FD8]" : "text-gray-300"}`} aria-label={e.biometric_mapped ? "Biometric ID mapped" : "No biometric ID"} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
            <Table head={["Employee", "Category", "Designation", "Department", "Branch", "Joined", "Status", { label: "", align: "right" }]}>
              {list.data.items.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50/80 cursor-pointer transition-colors" onClick={() => setSelected(e.id)}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={e.full_name} size="sm" />
                      <span>
                        <span className="block text-gray-900 font-semibold">{e.full_name}</span>
                        <span className="block font-mono text-[11px] text-[#64748B]">{e.employee_code}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{categoryLabel(e.employee_category)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{e.designation ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700">{e.department ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700">{e.branch ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(e.joining_date)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge value={e.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right" title={e.biometric_mapped ? "Biometric ID mapped" : "No biometric ID"}>
                    <Fingerprint className={`w-4 h-4 inline ${e.biometric_mapped ? "text-[#1B4FD8]" : "text-gray-300"}`} />
                  </td>
                </tr>
              ))}
            </Table>
            )}
            <Pager page={page} pageSize={25} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Panel>

      {creating && refs.data && (
        <CreateEmployee
          refs={refs.data}
          onClose={() => setCreating(false)}
          onCreated={(emp) => {
            setCreating(false)
            setVersion((v) => v + 1)
            setSelected(emp.id)
          }}
        />
      )}
      {importing && <ImportEmployees onClose={() => setImporting(false)} onDone={() => setVersion((v) => v + 1)} />}
    </div>
  )
}

// ── create ──────────────────────────────────────────────────────────────────

const blank = {
  first_name: "",
  middle_name: "",
  last_name: "",
  gender: "",
  date_of_birth: "",
  email: "",
  phone: "",
  employee_category: "nurse",
  employment_type: "permanent",
  joining_date: new Date().toISOString().slice(0, 10),
  contract_end_date: "",
  branch_id: "",
  designation_id: "",
  department_id: "",
  qualification: "",
  specialization: "",
  hms_username: "",
  reg_type: "",
  reg_number: "",
  reg_authority: "",
  reg_expires: "",
  emergency_name: "",
  emergency_phone: "",
  emergency_relationship: "",
  activate: true,
}

function CreateEmployee({ refs, onClose, onCreated }: { refs: OrgRefs; onClose: () => void; onCreated: (e: EmployeeDetail) => void }) {
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof blank>) => setF((cur) => ({ ...cur, ...patch }))
  const designation = refs.designations.find((d) => d.id === f.designation_id)
  const n = (v: string) => (v.trim() ? v.trim() : null)

  const submit = async () => {
    setBusy(true)
    setErrors({})
    try {
      const emp = await hr.post<EmployeeDetail>("/api/v1/hr/employees", {
        first_name: f.first_name.trim(),
        middle_name: n(f.middle_name),
        last_name: n(f.last_name),
        gender: f.gender || null,
        date_of_birth: f.date_of_birth || null,
        email: n(f.email),
        phone: n(f.phone),
        employee_category: f.employee_category,
        employment_type: f.employment_type,
        joining_date: f.joining_date,
        contract_end_date: f.contract_end_date || null,
        branch_id: f.branch_id || null,
        designation_id: f.designation_id || null,
        hms_username: n(f.hms_username),
        departments: f.department_id ? [{ department_id: f.department_id, is_primary: true }] : [],
        profile: { qualification: n(f.qualification), specialization: n(f.specialization) },
        credentials: f.reg_number
          ? [{ credential_type: f.reg_type || "licence", number: f.reg_number.trim(), issuing_authority: n(f.reg_authority), expires_on: f.reg_expires || null }]
          : [],
        contacts: f.emergency_name
          ? [{ kind: "emergency", name: f.emergency_name.trim(), phone: n(f.emergency_phone), relationship: n(f.emergency_relationship) }]
          : [],
        activate: f.activate,
      })
      toast.success(`${emp.full_name} created as ${emp.employee_code}`)
      onCreated(emp)
    } catch (e) {
      if (e instanceof HrApiError) setErrors(e.fieldErrors)
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const err = (k: string) => errors[k]
  return (
    <Drawer
      open
      wide
      title="New employee"
      onClose={onClose}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-gray-700 font-medium">
            <input type="checkbox" checked={f.activate} onChange={(e) => set({ activate: e.target.checked })} />
            Activate now (otherwise saved as draft)
          </label>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!f.first_name || !f.joining_date} onClick={submit}>
            Create employee
          </Btn>
        </>
      }
    >
      <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">Personal</h4>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Field label="First name" required error={err("first_name")}>
          <input className={inputCls} value={f.first_name} onChange={(e) => set({ first_name: e.target.value })} />
        </Field>
        <Field label="Middle name">
          <input className={inputCls} value={f.middle_name} onChange={(e) => set({ middle_name: e.target.value })} />
        </Field>
        <Field label="Last name">
          <input className={inputCls} value={f.last_name} onChange={(e) => set({ last_name: e.target.value })} />
        </Field>
        <Field label="Gender">
          <select className={inputCls} value={f.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="undisclosed">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Date of birth" error={err("date_of_birth")}>
          <input type="date" className={inputCls} value={f.date_of_birth} onChange={(e) => set({ date_of_birth: e.target.value })} />
        </Field>
        <Field label="Phone" error={err("phone")}>
          <input className={inputCls} value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <div className="col-span-3">
          <Field label="Email" error={err("email")}>
            <input type="email" className={inputCls} value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
      </div>

      <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">Employment</h4>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Field label="Category" required error={err("employee_category")}>
          <select className={inputCls} value={f.employee_category} onChange={(e) => set({ employee_category: e.target.value })}>
            {EMPLOYEE_CATEGORIES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employment type">
          <select className={inputCls} value={f.employment_type} onChange={(e) => set({ employment_type: e.target.value })}>
            {EMPLOYMENT_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Joining date" required error={err("joining_date")}>
          <input type="date" className={inputCls} value={f.joining_date} onChange={(e) => set({ joining_date: e.target.value })} />
        </Field>
        {f.employment_type === "contract" && (
          <Field label="Contract ends" required error={err("contract_end_date")}>
            <input type="date" className={inputCls} value={f.contract_end_date} onChange={(e) => set({ contract_end_date: e.target.value })} />
          </Field>
        )}
        <Field label="Branch">
          <select className={inputCls} value={f.branch_id} onChange={(e) => set({ branch_id: e.target.value })}>
            <option value="">—</option>
            {refs.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Primary department">
          <select className={inputCls} value={f.department_id} onChange={(e) => set({ department_id: e.target.value })}>
            <option value="">—</option>
            {refs.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Designation">
          <select className={inputCls} value={f.designation_id} onChange={(e) => set({ designation_id: e.target.value })}>
            <option value="">—</option>
            {refs.designations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="HMS login username" hint="Links this record to an existing HMS account">
          <input className={inputCls} value={f.hms_username} onChange={(e) => set({ hms_username: e.target.value })} />
        </Field>
      </div>

      <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">Professional</h4>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Qualification">
          <input className={inputCls} value={f.qualification} onChange={(e) => set({ qualification: e.target.value })} />
        </Field>
        <Field label="Specialization">
          <input className={inputCls} value={f.specialization} onChange={(e) => set({ specialization: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <Field label="Registration type">
          <select className={inputCls} value={f.reg_type} onChange={(e) => set({ reg_type: e.target.value })}>
            <option value="">—</option>
            <option value="medical_registration">Medical council</option>
            <option value="nursing_registration">Nursing council</option>
            <option value="pharmacy_registration">Pharmacy council</option>
            <option value="licence">Licence</option>
            <option value="certification">Certification</option>
          </select>
        </Field>
        <Field label="Registration no." error={designation?.requires_registration && f.activate && !f.reg_number ? "Required to activate this designation" : undefined}>
          <input className={inputCls} value={f.reg_number} onChange={(e) => set({ reg_number: e.target.value })} />
        </Field>
        <Field label="Issuing authority">
          <input className={inputCls} value={f.reg_authority} onChange={(e) => set({ reg_authority: e.target.value })} />
        </Field>
        <Field label="Expires on">
          <input type="date" className={inputCls} value={f.reg_expires} onChange={(e) => set({ reg_expires: e.target.value })} />
        </Field>
      </div>

      <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">Emergency contact</h4>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Name">
          <input className={inputCls} value={f.emergency_name} onChange={(e) => set({ emergency_name: e.target.value })} />
        </Field>
        <Field label="Relationship">
          <input className={inputCls} value={f.emergency_relationship} onChange={(e) => set({ emergency_relationship: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={f.emergency_phone} onChange={(e) => set({ emergency_phone: e.target.value })} />
        </Field>
      </div>
    </Drawer>
  )
}

// ── import ──────────────────────────────────────────────────────────────────

type ImportResult = { dry_run: boolean; total_rows: number; created: number; errors: { row: number; error: string }[] }

function ImportEmployees({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    const form = new FormData()
    form.append("file", file)
    try {
      const r = await hr.post<ImportResult>("/api/v1/hr/employees/import", form, { dry_run: dryRun })
      setResult(r)
      if (!dryRun && r.created) {
        toast.success(`${r.created} employees imported`)
        onDone()
      }
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      title="Import employees"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Close</Btn>
          <Btn busy={busy} disabled={!file} onClick={() => run(true)}>
            Validate
          </Btn>
          <Btn variant="primary" busy={busy} disabled={!file || !result || result.errors.length > 0 || result.created > 0} onClick={() => run(false)}>
            Import
          </Btn>
        </>
      }
    >
      <p className="text-xs text-gray-700 mb-3">
        UTF-8 CSV with a header row. Required: <code>first_name</code>, <code>employee_category</code>, <code>joining_date</code> (YYYY-MM-DD). Optional:{" "}
        <code>last_name, employment_type, email, phone, gender, department_code, designation_code, contract_end_date</code>. Validate first; nothing is saved if any row has
        an error.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null)
          setResult(null)
        }}
        className="text-sm"
      />
      {result && (
        <div className="mt-4 text-sm">
          <p className="text-gray-800 font-medium">
            {result.total_rows} rows · {result.created ? `${result.created} created` : result.errors.length ? `${result.errors.length} with errors` : "all valid — ready to import"}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-rose-700 max-h-64 overflow-y-auto">
              {result.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Drawer>
  )
}

function Chip({ label, n, active, onClick }: { label: string; n?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={`px-2.5 py-1 rounded text-xs font-semibold border transition cursor-pointer ${active ? "bg-blue-50 border-[#1B4FD8] text-[#1B4FD8] shadow-2xs" : "bg-white border-[#DDE2EC] text-gray-700 hover:border-gray-400 hover:text-gray-900"}`}>
      {label}
      {n !== undefined && <span className={`ml-1.5 tabular-nums ${active ? "text-[#1B4FD8]" : "text-[#64748B]"}`}>{n}</span>}
    </button>
  )
}
