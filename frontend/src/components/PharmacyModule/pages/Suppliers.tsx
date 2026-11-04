import { usePharmacyData } from "../data/usePharmacyData"
import { PharmacyDatabase } from "../../../services/pharmacyDb"
import { useState, useEffect } from "react"
import { toast } from "react-hot-toast"
import {
  Plus,
  Eye,
  Edit2,
  Phone,
  Mail,
  X,
  Building2,
  CreditCard,
  History,
  Trash2,
} from "lucide-react"

import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import PhoneInput from "../../ui/PhoneInput"

interface SuppliersProps {
  onNavigate: (page: string) => void
}

export default function Suppliers({ onNavigate }: SuppliersProps) {
  const { suppliers, refresh } = usePharmacyData()
  const [selected, setSelected] = useState<typeof suppliers[0] | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    supplierName: "",
    contactInformation: "",
    phone: "",
    email: "",
    address: "",
    gstInformation: "",
    licenseDetails: "",
    paymentTerms: "",
    status: "Active" as any,
  })

  const handleEdit = (s: typeof suppliers[0]) => {
    setEditingId(s.id)
    setForm({
      supplierName: s.supplierName || s.name || "",
      contactInformation: s.contactInformation || s.contact || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      gstInformation: s.gstInformation || s.gstin || "",
      licenseDetails: s.licenseDetails || s.drugLicense || "",
      paymentTerms: s.paymentTerms || "Net 30",
      status: (s.status as any) || "Active",
    })
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingId(null)
    setForm({
      supplierName: "",
      contactInformation: "",
      phone: "",
      email: "",
      address: "",
      gstInformation: "",
      licenseDetails: "",
      paymentTerms: "Net 30",
      status: "Active",
    })
    setShowModal(true)
  }

  const handleSave = () => {
    if (editingId) {
      PharmacyDatabase.updateSupplier(editingId, form)
    } else {
      PharmacyDatabase.addSupplier({
        id: "SUP" + Date.now(),
        ...form,
        createdAt: new Date().toISOString(),
      })
    }
    refresh()
    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    if (confirm("Delete supplier?")) {
      PharmacyDatabase.deleteSupplier(id)
      refresh()
      toast.success("Supplier deleted successfully")
    }
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Inventory" },
          { label: "Suppliers" },
        ]}
        title="Supplier Management"
        description={`${suppliers.length} suppliers`}
        actions={
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-[13px] font-medium"
            style={{ background: "#0F766E" }}
          >
            <Plus size={14} /> Add Supplier
          </button>
        }
        onNavigate={onNavigate}
      />

      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <table>
          <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
            <tr>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Supplier</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Contact Person</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Phone / Email</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">GSTIN</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Status</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr className="hover:bg-[#F0FDFA] transition-colors" key={s.id}>
                <td>
                  <p className="font-semibold text-[13px] text-[#0F1624]">
                    {s.supplierName || s.name}
                  </p>
                  <p className="text-[11px] text-[#94A3B8]">{s.address}</p>
                </td>
                <td className="text-[13px] text-[#334155]">
                  {s.contactInformation || s.contact}
                </td>
                <td>
                  <p className="text-[12px] flex items-center gap-1 text-[#334155]">
                    <Phone size={11} /> {s.phone || "N/A"}
                  </p>
                  <p className="text-[12px] flex items-center gap-1 text-[#64748B] mt-0.5">
                    <Mail size={11} /> {s.email || "N/A"}
                  </p>
                </td>
                <td className="font-mono text-[12px] text-[#64748B]">
                  {s.gstInformation || s.gstin}
                </td>
                <td>
                  <StatusBadge status={s.status} size="sm" />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelected(s)}
                      className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#64748B] transition-colors"
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      onClick={() => handleEdit(s)}
                      className="p-1.5 rounded hover:bg-[#E8EDF5] text-[#0F766E] transition-colors"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1.5 rounded hover:bg-[#FEE2E2] text-[#dc2626] transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Supplier Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1" onClick={() => setSelected(null)} />
          <div className="w-[480px] bg-white shadow-2xl border-l border-[#E2E8F0] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F2F5]">
              <p className="font-bold text-[16px] text-[#0F1624]">
                {selected.supplierName || selected.name}
              </p>
              <button
                onClick={() => setSelected(null)}
                className="p-2 rounded hover:bg-[#F0F2F5] text-[#94A3B8]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <Section
                icon={<Building2 size={14} />}
                title="Company Information"
              >
                <Row
                  label="Supplier Name"
                  value={selected.supplierName || selected.name}
                />
                <Row label="Address" value={selected.address} />
                <Row
                  label="GSTIN"
                  value={selected.gstInformation || selected.gstin}
                  mono
                />
                <Row
                  label="Drug License"
                  value={selected.licenseDetails || selected.drugLicense}
                  mono
                />
              </Section>
              <Section icon={<Phone size={14} />} title="Contact">
                <Row
                  label="Contact Person"
                  value={selected.contactInformation || selected.contact}
                />
              </Section>
              <Section icon={<CreditCard size={14} />} title="Financial">
                <Row label="Payment Terms" value={selected.paymentTerms} />
              </Section>
            </div>
            <div className="p-5 border-t border-[#E2E8F0] flex gap-3">
              <button
                onClick={() => {
                  setSelected(null)
                  handleEdit(selected)
                }}
                className="flex-1 py-2.5 rounded border border-[#E2E8F0] text-[13px] font-medium text-[#334155] hover:bg-[#F5F7FA] transition-colors"
              >
                Edit Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.6)" }}
        >
          <div
            className="bg-white rounded shadow-2xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F2F5]">
              <p className="font-bold text-[16px] text-[#0F1624]">
                {editingId ? "Edit Supplier" : "Add Supplier"}
              </p>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded hover:bg-[#F0F2F5] text-[#94A3B8]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Supplier Name
                  </label>
                  <input
                    value={form.supplierName}
                    onChange={(e) =>
                      setForm({ ...form, supplierName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Contact Person
                  </label>
                  <input
                    value={form.contactInformation}
                    onChange={(e) =>
                      setForm({ ...form, contactInformation: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Phone
                  </label>
                  <PhoneInput
                    value={form.phone}
                    onChange={(val) =>
                      setForm({ ...form, phone: val })
                    }
                    placeholder="98765 43210"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Email
                  </label>
                  <input
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Address
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    GSTIN
                  </label>
                  <input
                    value={form.gstInformation}
                    onChange={(e) =>
                      setForm({ ...form, gstInformation: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Drug License
                  </label>
                  <input
                    value={form.licenseDetails}
                    onChange={(e) =>
                      setForm({ ...form, licenseDetails: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Payment Terms
                  </label>
                  <input
                    value={form.paymentTerms}
                    onChange={(e) =>
                      setForm({ ...form, paymentTerms: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-[#E2E8F0] text-[13px]"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded text-white font-semibold text-[13px]"
                  style={{ background: "#0F766E" }}
                >
                  Save
                </button>
                <button
                  onClick={() => setShowModal(false)}
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

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#0F1624] uppercase tracking-wide">
        {icon} {title}
      </p>
      <div className="space-y-2 border-l-2 border-[#F0F2F5] pl-3 ml-1">
        {children}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string
  value: string | React.ReactNode
  mono?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-[12px] font-medium text-[#64748B]">{label}</span>
      <span
        className={`text-[13px] text-right ${mono ? "font-mono" : ""} ${
          highlight ? "font-bold text-[#d97706]" : "font-medium text-[#0F1624]"
        }`}
      >
        {value}
      </span>
    </div>
  )
}
