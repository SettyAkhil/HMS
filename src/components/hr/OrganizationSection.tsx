import { useState } from "react"
import toast from "react-hot-toast"
import { ChevronDown, ChevronRight, Building2, GitBranch, Layers, Plus, Trash2, Pencil } from "lucide-react"
import { hr, HrApiError } from "../../services/hr/client"
import { EMPLOYEE_CATEGORIES, categoryLabel, type Department, type Designation, type TreeNode } from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, inputCls, Loading, PageHeader, Panel, Table, Tabs, errorText, useHr } from "./ui"
import useOrgRefs from "./useOrgRefs"

type Tab = "tree" | "departments" | "designations" | "sites"

export default function OrganizationSection({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<Tab>("tree")
  const [version, setVersion] = useState(0)
  const refs = useOrgRefs(version)
  const bump = () => setVersion((v) => v + 1)

  return (
    <div>
      <PageHeader title="Organization" subtitle="Hospitals, branches, departments, units and designations" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "tree", label: "Structure" },
          { id: "departments", label: "Departments", count: refs.data?.departments.length },
          { id: "designations", label: "Designations", count: refs.data?.designations.length },
          { id: "sites", label: "Hospitals & branches", count: refs.data?.branches.length },
        ]}
      />
      {refs.loading && !refs.data ? (
        <Loading />
      ) : refs.error ? (
        <ErrorState error={refs.error} onRetry={refs.reload} />
      ) : refs.data ? (
        <>
          {tab === "tree" && <OrgTree version={version} />}
          {tab === "departments" && <Departments refs={refs.data} canEdit={canEdit} onChange={bump} />}
          {tab === "designations" && <Designations items={refs.data.designations} canEdit={canEdit} onChange={bump} />}
          {tab === "sites" && <Sites refs={refs.data} canEdit={canEdit} onChange={bump} />}
        </>
      ) : null}
    </div>
  )
}

// ── tree ────────────────────────────────────────────────────────────────────

function OrgTree({ version }: { version: number }) {
  const tree = useHr(() => hr.get<TreeNode[]>("/api/v1/hr/organization/tree"), [version])
  if (tree.loading && !tree.data) return <Loading />
  if (tree.error) return <ErrorState error={tree.error} onRetry={tree.reload} />
  if (!tree.data?.length)
    return (
      <Panel>
        <Empty title="No organization set up yet" hint="Add a hospital and branch under Hospitals & branches, then create departments." />
      </Panel>
    )
  return (
    <Panel>
      <ul className="space-y-1">
        {tree.data.map((n) => (
          <TreeItem key={n.id} node={n} depth={0} />
        ))}
      </ul>
    </Panel>
  )
}

const ICON = { hospital: Building2, branch: GitBranch, department: Layers, unit: Layers }

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const Icon = ICON[node.type]
  const hasKids = node.children.length > 0
  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50/80 text-left transition-colors cursor-pointer"
        style={{ paddingLeft: 8 + depth * 20 }}
        aria-expanded={hasKids ? open : undefined}
      >
        {hasKids ? open ? <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#64748B]" /> : <span className="w-3.5" />}
        <Icon className={`w-4 h-4 ${node.type === "hospital" ? "text-[#582C5F]" : "text-[#1B4FD8]"}`} />
        <span className="text-sm font-medium text-gray-900">{node.name}</span>
        <span className="text-[11px] text-[#64748B] font-mono">{node.code}</span>
        {node.head_name && <span className="text-[11px] text-[#64748B]">· Head: {node.head_name}</span>}
        {node.type !== "unit" && <span className="ml-auto text-[11px] text-[#64748B] font-mono tabular-nums">{node.headcount} staff</span>}
      </button>
      {open && hasKids && (
        <ul>
          {node.children.map((c) => (
            <TreeItem key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

// ── departments ─────────────────────────────────────────────────────────────

type DeptForm = { code: string; name: string; branch_id: string; parent_id: string; kind: string; cost_center: string; annual_budget: string; hms_module: string; census_wards: string }
const emptyDept: DeptForm = { code: "", name: "", branch_id: "", parent_id: "", kind: "clinical", cost_center: "", annual_budget: "", hms_module: "", census_wards: "" }

function Departments({ refs, canEdit, onChange }: { refs: NonNullable<ReturnType<typeof useOrgRefs>["data"]>; canEdit: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState<Department | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<DeptForm>(emptyDept)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [unitFor, setUnitFor] = useState<Department | null>(null)
  const byId = Object.fromEntries(refs.departments.map((d) => [d.id, d]))
  const branchName = Object.fromEntries(refs.branches.map((b) => [b.id, b.name]))

  const open = (d: Department | null) => {
    setErrors({})
    setEditing(d)
    setCreating(!d)
    setForm(
      d
        ? { code: d.code, name: d.name, branch_id: d.branch_id ?? "", parent_id: d.parent_id ?? "", kind: d.kind, cost_center: d.cost_center ?? "", annual_budget: d.annual_budget ?? "", hms_module: d.hms_module ?? "", census_wards: (d.census_wards ?? []).join(", ") }
        : emptyDept,
    )
  }
  const close = () => {
    setEditing(null)
    setCreating(false)
  }

  const save = async () => {
    setBusy(true)
    const body: Record<string, unknown> = {
      name: form.name,
      branch_id: form.branch_id || null,
      parent_id: form.parent_id || null,
      kind: form.kind,
      cost_center: form.cost_center || null,
      hms_module: form.hms_module || null,
      census_wards: form.census_wards.split(",").map((w) => w.trim()).filter(Boolean),
    }
    if (form.annual_budget) body.annual_budget = form.annual_budget
    try {
      if (editing) await hr.patch(`/api/v1/hr/departments/${editing.id}`, body)
      else await hr.post("/api/v1/hr/departments", { ...body, code: form.code })
      toast.success(editing ? "Department updated" : "Department created")
      close()
      onChange()
    } catch (e) {
      if (e instanceof HrApiError) setErrors(e.fieldErrors)
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (d: Department) => {
    if (!window.confirm(`Delete department ${d.name}? It must have no staff or sub-departments.`)) return
    try {
      await hr.del(`/api/v1/hr/departments/${d.id}`)
      toast.success("Department deleted")
      onChange()
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <Panel
      title="Departments"
      actions={canEdit && (
        <Btn variant="primary" onClick={() => open(null)}>
          <Plus className="w-3.5 h-3.5" /> New department
        </Btn>
      )}
    >
      {refs.departments.length === 0 ? (
        <Empty title="No departments yet" hint="Create departments such as ICU, Emergency, OT and Radiology to assign staff to them." />
      ) : (
        <Table head={["Code", "Department", "Parent", "Branch", "Type", "Head", "Staff", "Budget", ""]}>
          {refs.departments.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50/80 transition-colors">
              <td className="px-4 py-2 font-mono text-xs text-[#64748B]">{d.code}</td>
              <td className="px-4 py-2 font-semibold text-gray-900">{d.name}</td>
              <td className="px-4 py-2 text-gray-700">{d.parent_id ? byId[d.parent_id]?.name ?? "—" : "—"}</td>
              <td className="px-4 py-2 text-gray-700">{d.branch_id ? branchName[d.branch_id] ?? "—" : "All"}</td>
              <td className="px-4 py-2 text-gray-700 capitalize">{d.kind}</td>
              <td className="px-4 py-2 text-gray-700">{d.head_name ?? "—"}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{d.headcount}</td>
              <td className="px-4 py-2 font-mono tabular-nums text-gray-700">{d.annual_budget ? `₹${Number(d.annual_budget).toLocaleString("en-IN")}` : "—"}</td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                {canEdit && (
                  <>
                    <Btn variant="ghost" onClick={() => setUnitFor(d)} title="Add unit">
                      <Plus className="w-3.5 h-3.5" /> Unit
                    </Btn>
                    <Btn variant="ghost" onClick={() => open(d)} aria-label={`Edit ${d.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Btn>
                    <Btn variant="ghost" onClick={() => remove(d)} aria-label={`Delete ${d.name}`}>
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    </Btn>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Drawer
        open={creating || !!editing}
        title={editing ? `Edit ${editing.name}` : "New department"}
        onClose={close}
        footer={
          <>
            <Btn onClick={close}>Cancel</Btn>
            <Btn variant="primary" busy={busy} onClick={save} disabled={!form.name || (!editing && !form.code)}>
              Save
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" required error={errors.code} hint="Short and unique, e.g. ICU">
            <input className={inputCls} value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Type">
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {["clinical", "diagnostic", "support", "administrative"].map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Name" required error={errors.name}>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Parent department" hint="Set to make this a sub-department">
            <select className={inputCls} value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">None</option>
              {refs.departments
                .filter((d) => d.id !== editing?.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Branch">
            <select className={inputCls} value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">All branches</option>
              {refs.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cost centre">
            <input className={inputCls} value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} />
          </Field>
          <Field label="HMS module" hint="Shows this department's on-duty staff in that module">
            <select className={inputCls} value={form.hms_module} onChange={(e) => setForm({ ...form, hms_module: e.target.value })}>
              <option value="">None</option>
              {[["op", "Outpatient"], ["ip", "Inpatient"], ["icu", "ICU"], ["er", "Emergency"], ["ot", "Operation theatre"], ["radiology", "Radiology"], ["laboratory", "Laboratory"], ["pharmacy", "Pharmacy"], ["ward", "Ward"], ["admin", "Administration"]].map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Census wards" hint="Bed-board ward names, comma separated; occupied beds drive nurse-to-patient coverage">
            <input className={inputCls} value={form.census_wards} onChange={(e) => setForm({ ...form, census_wards: e.target.value })} />
          </Field>
          <Field label="Annual budget (₹)" hint="Saved only if you hold payroll rights" error={errors.annual_budget}>
            <input className={inputCls} inputMode="decimal" value={form.annual_budget} onChange={(e) => setForm({ ...form, annual_budget: e.target.value })} />
          </Field>
        </div>
      </Drawer>

      {unitFor && <UnitDrawer dept={unitFor} onClose={() => setUnitFor(null)} onSaved={onChange} />}
    </Panel>
  )
}

function UnitDrawer({ dept, onClose, onSaved }: { dept: Department; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: "", name: "", unit_type: "", bed_capacity: "" })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await hr.post("/api/v1/hr/units", {
        department_id: dept.id,
        code: form.code,
        name: form.name,
        unit_type: form.unit_type || null,
        bed_capacity: form.bed_capacity ? Number(form.bed_capacity) : null,
      })
      toast.success("Unit added")
      onSaved()
      onClose()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      title={`New unit in ${dept.name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!form.code || !form.name} onClick={save}>
            Save
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" required>
          <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="Name" required>
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Unit type" hint="Ward, bay, theatre, desk…">
          <input className={inputCls} value={form.unit_type} onChange={(e) => setForm({ ...form, unit_type: e.target.value })} />
        </Field>
        <Field label="Bed capacity">
          <input className={inputCls} inputMode="numeric" value={form.bed_capacity} onChange={(e) => setForm({ ...form, bed_capacity: e.target.value.replace(/\D/g, "") })} />
        </Field>
      </div>
    </Drawer>
  )
}

// ── designations ────────────────────────────────────────────────────────────

function Designations({ items, canEdit, onChange }: { items: Designation[]; canEdit: boolean; onChange: () => void }) {
  const blank = { code: "", title: "", job_category: "nurse", grade: "", is_clinical: true, requires_registration: false }
  const [form, setForm] = useState<typeof blank | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!form) return
    setBusy(true)
    const body = { ...form, grade: form.grade || null }
    try {
      if (editId) {
        const { code: _code, ...rest } = body
        await hr.patch(`/api/v1/hr/designations/${editId}`, rest)
      } else await hr.post("/api/v1/hr/designations", body)
      toast.success("Designation saved")
      setForm(null)
      onChange()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Designations"
      actions={canEdit && (
        <Btn variant="primary" onClick={() => { setEditId(null); setForm(blank) }}>
          <Plus className="w-3.5 h-3.5" /> New designation
        </Btn>
      )}
    >
      {items.length === 0 ? (
        <Empty title="No designations yet" hint="For example Staff Nurse, Consultant Cardiologist, Lab Technician." />
      ) : (
        <Table head={["Code", "Title", "Category", "Grade", "Clinical", "Registration", "Staff", ""]}>
          {items.map((d) => (
            <tr key={d.id} className="hover:bg-gray-50/80 transition-colors">
              <td className="px-4 py-2 font-mono text-xs text-[#64748B]">{d.code}</td>
              <td className="px-4 py-2 font-semibold text-gray-900">{d.title}</td>
              <td className="px-4 py-2 text-gray-700">{categoryLabel(d.job_category)}</td>
              <td className="px-4 py-2 text-gray-700">{d.grade ?? "—"}</td>
              <td className="px-4 py-2 text-gray-700">{d.is_clinical ? "Yes" : "No"}</td>
              <td className="px-4 py-2 text-gray-700">{d.requires_registration ? "Required" : "—"}</td>
              <td className="px-4 py-2 font-mono tabular-nums">{d.headcount}</td>
              <td className="px-4 py-2 text-right">
                {canEdit && (
                  <Btn
                    variant="ghost"
                    aria-label={`Edit ${d.title}`}
                    onClick={() => {
                      setEditId(d.id)
                      setForm({ code: d.code, title: d.title, job_category: d.job_category, grade: d.grade ?? "", is_clinical: d.is_clinical, requires_registration: d.requires_registration })
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Btn>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Drawer
        open={!!form}
        title={editId ? "Edit designation" : "New designation"}
        onClose={() => setForm(null)}
        footer={
          <>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn variant="primary" busy={busy} disabled={!form?.code || !form?.title} onClick={save}>
              Save
            </Btn>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" required>
              <input className={inputCls} value={form.code} disabled={!!editId} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label="Grade">
              <input className={inputCls} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
            </Field>
            <div className="col-span-2">
              <Field label="Title" required>
                <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Job category">
                <select className={inputCls} value={form.job_category} onChange={(e) => setForm({ ...form, job_category: e.target.value })}>
                  {EMPLOYEE_CATEGORIES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
              <input type="checkbox" checked={form.is_clinical} onChange={(e) => setForm({ ...form, is_clinical: e.target.checked })} /> Clinical role
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
              <input type="checkbox" checked={form.requires_registration} onChange={(e) => setForm({ ...form, requires_registration: e.target.checked })} />
              Needs professional registration
            </label>
          </div>
        )}
      </Drawer>
    </Panel>
  )
}

// ── hospitals & branches ────────────────────────────────────────────────────

function Sites({ refs, canEdit, onChange }: { refs: NonNullable<ReturnType<typeof useOrgRefs>["data"]>; canEdit: boolean; onChange: () => void }) {
  const [hospital, setHospital] = useState({ code: "", name: "" })
  const [branch, setBranch] = useState({ hospital_id: "", code: "", name: "", city: "" })
  const [busy, setBusy] = useState<string | null>(null)

  const submit = async (kind: "hospital" | "branch") => {
    setBusy(kind)
    try {
      if (kind === "hospital") {
        await hr.post("/api/v1/hr/hospitals", hospital)
        setHospital({ code: "", name: "" })
      } else {
        await hr.post("/api/v1/hr/branches", { ...branch, city: branch.city || null })
        setBranch({ hospital_id: branch.hospital_id, code: "", name: "", city: "" })
      }
      toast.success(kind === "hospital" ? "Hospital added" : "Branch added")
      onChange()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Hospitals">
        {refs.hospitals.length === 0 ? (
          <Empty title="No hospital yet" />
        ) : (
          <ul className="divide-y divide-[#EEF1F6] mb-4">
            {refs.hospitals.map((h) => (
              <li key={h.id} className="py-2 text-sm flex justify-between">
                <span className="font-medium text-gray-900">{h.name}</span>
                <span className="font-mono text-xs text-[#64748B]">{h.code}</span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="grid grid-cols-3 gap-2 items-end">
            <Field label="Code">
              <input className={inputCls} value={hospital.code} onChange={(e) => setHospital({ ...hospital, code: e.target.value })} />
            </Field>
            <Field label="Name">
              <input className={inputCls} value={hospital.name} onChange={(e) => setHospital({ ...hospital, name: e.target.value })} />
            </Field>
            <Btn variant="primary" busy={busy === "hospital"} disabled={!hospital.code || !hospital.name} onClick={() => submit("hospital")}>
              Add hospital
            </Btn>
          </div>
        )}
      </Panel>
      <Panel title="Branches">
        {refs.branches.length === 0 ? (
          <Empty title="No branches yet" />
        ) : (
          <ul className="divide-y divide-[#EEF1F6] mb-4">
            {refs.branches.map((b) => (
              <li key={b.id} className="py-2 text-sm flex justify-between">
                <span>
                  <span className="font-medium text-gray-900">{b.name}</span>
                  {b.city && <span className="text-[#64748B]"> · {b.city}</span>}
                </span>
                <span className="font-mono text-xs text-[#64748B]">{b.code}</span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && refs.hospitals.length > 0 && (
          <div className="grid grid-cols-2 gap-2 items-end">
            <Field label="Hospital">
              <select className={inputCls} value={branch.hospital_id} onChange={(e) => setBranch({ ...branch, hospital_id: e.target.value })}>
                <option value="">Select…</option>
                {refs.hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Code">
              <input className={inputCls} value={branch.code} onChange={(e) => setBranch({ ...branch, code: e.target.value })} />
            </Field>
            <Field label="Name">
              <input className={inputCls} value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} />
            </Field>
            <Field label="City">
              <input className={inputCls} value={branch.city} onChange={(e) => setBranch({ ...branch, city: e.target.value })} />
            </Field>
            <div className="col-span-2 flex justify-end">
              <Btn variant="primary" busy={busy === "branch"} disabled={!branch.hospital_id || !branch.code || !branch.name} onClick={() => submit("branch")}>
                Add branch
              </Btn>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
