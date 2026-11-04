import { usePharmacyData } from "../data/usePharmacyData"
import { useState, useEffect } from "react"
import { Plus, Edit2, ToggleRight, ToggleLeft, Shield, X } from "lucide-react"

import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import PhoneInput from "../../ui/PhoneInput"

const permMatrix = [
  {
    module: "Billing",
    view: true,
    create: true,
    edit: true,
    delete: false,
    approve: false,
  },
  {
    module: "Medicines",
    view: true,
    create: true,
    edit: true,
    delete: true,
    approve: false,
  },
  {
    module: "Purchase",
    view: true,
    create: true,
    edit: true,
    delete: false,
    approve: true,
  },
  {
    module: "Inventory",
    view: true,
    create: true,
    edit: true,
    delete: false,
    approve: true,
  },
  {
    module: "Reports",
    view: true,
    create: false,
    edit: false,
    delete: false,
    approve: false,
  },
  {
    module: "Users",
    view: true,
    create: false,
    edit: false,
    delete: false,
    approve: false,
  },
]

interface UserManagementProps {
  onNavigate: (page: string) => void
}

import { PharmacyDatabase } from "../../../services/pharmacyDb"

export default function UserManagement({ onNavigate }: UserManagementProps) {
  const { users, refresh } = usePharmacyData()
  const [tab, setTab] = useState<"users" | "permissions">("users")
  const [showAdd, setShowAdd] = useState(false)
  const [editingUser, setEditingUser] = useState<any | null>(null)


  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "Pharmacist",
    branch: "Main Pharmacy",
  })

  const openAddUser = () => {
    setEditingUser(null)
    setForm({
      name: "",
      email: "",
      phone: "",
      role: "Pharmacist",
      branch: "Main Pharmacy",
    })
    setShowAdd(true)
  }

  const openEditUser = (user: any) => {
    setEditingUser(user)
    setForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone && user.phone !== "N/A" ? user.phone : "",
      role: user.role || "Pharmacist",
      branch: user.branch || user.department || "Main Pharmacy",
    })
    setShowAdd(true)
  }

  const handleSaveUser = () => {
    if (!form.name || !form.email) return alert("Name and Email are required.")

    if (editingUser) {
      PharmacyDatabase.updateUser(editingUser.id, {
        name: form.name,
        email: form.email,
        phone: form.phone || "N/A",
        role: form.role,
        department: form.branch,
      })
      PharmacyDatabase.logAudit(
        "System",
        "Updated",
        "User",
        `Updated user ${form.name}`,
        `Role: ${form.role}, Branch: ${form.branch}`,
      )
    } else {
      PharmacyDatabase.addUser({
        id: "USR" + Date.now(),
        name: form.name,
        email: form.email,
        phone: form.phone || "N/A",
        role: form.role,
        department: form.branch,
        status: "Active",
        lastLogin: new Date().toISOString(),
      })
      PharmacyDatabase.logAudit(
        "System",
        "Created",
        "User",
        `Created user ${form.name}`,
        `Assigned role ${form.role}`,
      )
    }

    setShowAdd(false)
    setEditingUser(null)
    setForm({
      name: "",
      email: "",
      phone: "",
      role: "Pharmacist",
      branch: "Main Pharmacy",
    })
    refresh()
  }

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const isCurrentlyActive = (currentStatus || "").toLowerCase() === "active"
    const newStatus = isCurrentlyActive ? "Inactive" : "Active"
    PharmacyDatabase.updateUser(id, { status: newStatus })
    PharmacyDatabase.logAudit(
      "System",
      "Updated",
      "User",
      `Updated user ${id}`,
      `Changed status to ${newStatus}`,
    )
    refresh()
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Administration" },
          { label: "User Management" },
        ]}
        title="User Management"
        description={`${users.length} users · ${users.filter((u) => u.status === "active").length} active`}
        actions={
          <button
            onClick={openAddUser}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-[13px] font-medium cursor-pointer"
            style={{ background: "#0F766E" }}
          >
            <Plus size={14} /> Add User
          </button>
        }
        onNavigate={onNavigate}
      />

      {/* Tabs */}
      <div className="flex rounded border border-[#E2E8F0] overflow-hidden w-fit text-[13px]">
        {(["users", "permissions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-2.5 font-medium capitalize transition-colors"
            style={{
              background: tab === t ? "#0F1624" : "#fff",
              color: tab === t ? "#fff" : "#64748B",
            }}
          >
            {t === "users" ? "Users" : "Permission Matrix"}
          </button>
        ))}
      </div>

      {tab === "users" ? (
        <>
          {/* Role legend */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              "Super Admin",
              "Pharmacy Manager",
              "Pharmacist",
              "Billing Operator",
              "Inventory Manager",
              "Store Keeper",
            ].map((role) => (
              <span
                key={role}
                className="text-[11px] font-medium px-2.5 py-1 rounded border border-[#E2E8F0] bg-white text-[#334155]"
              >
                {role}
              </span>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            <table>
              <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
                <tr>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">User</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Role</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Branch</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Last Login</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr className="hover:bg-[#F0FDFA] transition-colors" key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                          style={{ background: "#E8EDF5", color: "#0F766E" }}
                        >
                          {u.avatar}
                        </div>
                        <div>
                          <p className="font-semibold text-[13px] text-[#0F1624]">
                            {u.name}
                          </p>
                          <p className="text-[11px] text-[#94A3B8]">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="text-[12px] font-medium px-2.5 py-1 rounded"
                        style={{ background: "#F5F7FA", color: "#334155" }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="text-[13px] text-[#334155]">{u.branch}</td>
                    <td className="text-[12px] text-[#64748B]">
                      {u.lastLogin}
                    </td>
                    <td>
                      <StatusBadge status={u.status} size="sm" />
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditUser(u)}
                          className="p-1.5 rounded hover:bg-[#E8EDF5] text-[#0F766E] transition-colors cursor-pointer"
                          title="Edit User"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => setTab("permissions")}
                          className="p-1.5 rounded hover:bg-[#faf5ff] text-[#7c3aed] transition-colors cursor-pointer"
                          title="View Permission Matrix"
                        >
                          <Shield size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u.id, u.status)}
                          className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#64748B] transition-colors cursor-pointer"
                          title="Toggle Active Status"
                        >
                          {u.status === "active" ? (
                            <ToggleRight
                              size={14}
                              style={{ color: "#16a34a" }}
                            />
                          ) : (
                            <ToggleLeft size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F0F2F5] flex items-center gap-3">
            <Shield size={16} className="text-[#7c3aed]" />
            <p className="font-semibold text-[14px] text-[#0F1624]">
              Pharmacist Role Permissions
            </p>
            <select className="ml-auto text-[13px] px-3 py-1.5 rounded border border-[#E2E8F0] focus:border-[#0F766E] focus:outline-none">
              <option>Pharmacist</option>
              <option>Pharmacy Manager</option>
              <option>Billing Operator</option>
              <option>Inventory Manager</option>
              <option>Store Keeper</option>
            </select>
          </div>
          <table>
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Module</th>
                {["View", "Create", "Edit", "Delete", "Approve"].map((p) => (
                  <th key={p} className="text-center">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permMatrix.map((row) => (
                <tr className="hover:bg-[#F0FDFA] transition-colors" key={row.module}>
                  <td className="font-semibold text-[13px] text-[#0F1624]">
                    {row.module}
                  </td>
                  {([
                    "view",
                    "create",
                    "edit",
                    "delete",
                    "approve",
                  ] as const).map((perm) => (
                    <td key={perm} className="text-center">
                      <span
                        className="text-[15px]"
                        style={{ color: row[perm] ? "#15803d" : "#DDE2EC" }}
                      >
                        {row[perm] ? "✓" : "—"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.6)" }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F2F5]">
              <p className="font-bold text-[16px] text-[#0F1624]">
                {editingUser ? "Edit User Details" : "Add New User"}
              </p>
              <button
                onClick={() => setShowAdd(false)}
                className="p-2 rounded hover:bg-[#F0F2F5] text-[#94A3B8]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  Full Name *
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-[#E2E8F0] text-[13px] focus:border-[#0F766E] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  Email Address *
                </label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-[#E2E8F0] text-[13px] focus:border-[#0F766E] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  Phone Number *
                </label>
                <PhoneInput
                  value={form.phone}
                  onChange={(val) => setForm({ ...form, phone: val })}
                  placeholder="98765 43210"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Role *
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 rounded border border-[#E2E8F0] text-[13px] focus:border-[#0F766E] focus:outline-none"
                  >
                    <option>Pharmacist</option>
                    <option>Pharmacy Manager</option>
                    <option>Billing Operator</option>
                    <option>Inventory Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Branch *
                  </label>
                  <select
                    value={form.branch}
                    onChange={(e) =>
                      setForm({ ...form, branch: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded border border-[#E2E8F0] text-[13px] focus:border-[#0F766E] focus:outline-none"
                  >
                    <option>Main Pharmacy</option>
                    <option>IP Pharmacy</option>
                    <option>All Branches</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveUser}
                  className="flex-1 py-2.5 rounded text-white font-semibold text-[13px] cursor-pointer"
                  style={{ background: "#0F766E" }}
                >
                  {editingUser ? "Save Changes" : "Create User"}
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 rounded border border-[#E2E8F0] text-[13px] font-medium text-[#334155] hover:bg-[#F5F7FA] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
