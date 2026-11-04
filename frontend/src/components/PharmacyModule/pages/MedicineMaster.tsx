import { usePharmacyData } from "../data/usePharmacyData"
import { PharmacyDatabase, cleanupStorageQuota } from "../../../services/pharmacyDb"
import { useState, useEffect } from "react"
import {
  Search,
  Plus,
  Upload,
  Download,
  Filter,
  Edit2,
  Trash2,
  Eye,
  ChevronDown,
  X,
} from "lucide-react"

import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import ImportMedicinesModal from "../components/ImportMedicinesModal"

interface MedicineMasterProps {
  onNavigate: (page: string) => void
}

function toDateInputValue(val?: string): string {
  if (!val) return "2028-03-31"
  const trimmed = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
  const mMatch = trimmed.match(/^([A-Za-z]{3})-(\d{2,4})$/)
  if (mMatch) {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    const monthIdx = monthNames.indexOf(mMatch[1].toLowerCase())
    if (monthIdx >= 0) {
      let yr = Number(mMatch[2])
      if (yr < 100) yr += 2000
      const mm = String(monthIdx + 1).padStart(2, "0")
      return `${yr}-${mm}-28`
    }
  }
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0]
  }
  return "2028-03-31"
}

export default function MedicineMaster({ onNavigate }: MedicineMasterProps) {
  const { medicines, suppliers, refresh } = usePharmacyData()
  const [search, setSearch] = useState("")
  const [formFilter, setFormFilter] = useState("All")
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [selected, setSelected] = useState<typeof medicines[0] | null>(null)
  const [editingMedicine, setEditingMedicine] = useState<any>(null)

  const handleEdit = (m: any) => {
    const totalGst = m.gst ?? 5
    const half = +(totalGst / 2).toFixed(2)
    const formattedExp = toDateInputValue(m.expiryDate)
    setEditingMedicine({
      ...m,
      name: m.name || m.medicineName || "",
      supplierName: m.supplierName || (m as any).supplier || "",
      form: m.dosageForm || m.form || "TABLET",
      packing: m.packing || m.pack || "10's",
      mnfCode: m.mnfCode || (m.manufacturer ? m.manufacturer.substring(0, 4).toUpperCase() : "MANK"),
      hsnCode: m.hsnCode || m.sku || "3004 039",
      stock: m.stock !== undefined && m.stock !== null ? m.stock : "",
      batchNumber: m.batchNumber || "",
      expiryDate: formattedExp,
      mrp: m.mrp !== undefined && m.mrp !== null ? m.mrp : "",
      purchasePrice: m.purchasePrice ?? m.price ?? "",
      purchaseDiscount: m.discount ?? m.purchaseDiscount ?? 0,
      sgst: half,
      cgst: half,
      gst: totalGst,
    })
    setShowModal(true)
  }

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this medicine?")) {
      PharmacyDatabase.deleteMedicine(id)
      refresh()
    }
  }

  const openAddModal = () => {
    setEditingMedicine({
      name: "",
      supplierName: suppliers[0]?.supplierName || "",
      form: "TABLET",
      packing: "10's",
      mnfCode: "",
      hsnCode: "",
      stock: "",
      batchNumber: "",
      expiryDate: "",
      mrp: "",
      purchasePrice: "",
      purchaseDiscount: 0,
      sgst: 2.5,
      cgst: 2.5,
      gst: 5,
    })
    setShowModal(true)
  }

  const handleSave = () => {
    const prodName = (editingMedicine?.name || editingMedicine?.medicineName || "").trim()
    if (!prodName) {
      alert("Product Name is required")
      return
    }

    const packVal = (editingMedicine?.packing || editingMedicine?.pack || "1's").trim() || "1's"
    const sgstVal = parseFloat(editingMedicine?.sgst) || 0
    const cgstVal = parseFloat(editingMedicine?.cgst) || 0
    const taxVal = editingMedicine?.gst !== undefined ? Number(editingMedicine.gst) : +(sgstVal + cgstVal).toFixed(2)
    const mnfShort = (editingMedicine?.mnfCode || "").toUpperCase()
    const selectedForm = (editingMedicine?.form || "TABLET").toUpperCase()
    const supplierVal = (editingMedicine?.supplierName || suppliers[0]?.supplierName || "").trim()

    try {
      if (editingMedicine.id) {
        const updatedStock = editingMedicine.stock !== undefined && editingMedicine.stock !== "" ? Math.max(0, Number(editingMedicine.stock)) : 0
        const updatedMrp = editingMedicine.mrp !== undefined && editingMedicine.mrp !== "" ? Number(editingMedicine.mrp) : 0
        const updatedPurchasePrice = editingMedicine.purchasePrice !== undefined && editingMedicine.purchasePrice !== "" ? Number(editingMedicine.purchasePrice) : (updatedMrp > 0 ? +(updatedMrp * 0.7).toFixed(2) : 0)
        const updatedBatchNum = editingMedicine.batchNumber?.trim() || "B" + Math.floor(100000 + Math.random() * 900000)
        const updatedExpDate = toDateInputValue(editingMedicine.expiryDate)

        PharmacyDatabase.updateMedicine(editingMedicine.id, {
          brandName: prodName,
          medicineName: prodName,
          name: prodName,
          genericName: editingMedicine.generic || prodName,
          supplierName: supplierVal,
          strength: packVal,
          packing: packVal,
          dosageForm: selectedForm,
          form: selectedForm,
          manufacturer: mnfShort,
          mnfCode: mnfShort,
          taxPercentage: taxVal,
          hsnCode: editingMedicine.hsnCode || "3004 039",
          binNo: editingMedicine.binNo || "",
          barcode: editingMedicine.barcode || "",
          scheduleType: editingMedicine.schedule || "H",
          controlledSubstanceFlag: editingMedicine.prescription || false,
          categoryId: editingMedicine.category || selectedForm,
          reorderLevel: Number(editingMedicine.reorderLevel) || 10,
          mrp: updatedMrp,
          purchasePrice: updatedPurchasePrice,
          stock: updatedStock,
          batchNumber: updatedBatchNum,
          expiryDate: updatedExpDate,
        } as any)

        // Also synchronize the batch record for this medicine
        const allBatches = PharmacyDatabase.getBatches()
        const medBatches = allBatches.filter((b) => b.medicineId === editingMedicine.id || b.medicineId?.toLowerCase() === editingMedicine.id?.toLowerCase())

        if (medBatches.length > 0) {
          const latestBatch = medBatches[medBatches.length - 1]
          // Zero out any older batch quantities so total medicine stock matches the user's input
          for (let i = 0; i < medBatches.length - 1; i++) {
            PharmacyDatabase.updateBatch(medBatches[i].id, {
              availableQuantity: 0,
              quantity: 0,
            })
          }
          PharmacyDatabase.updateBatch(latestBatch.id, {
            batchNumber: updatedBatchNum,
            expiryDate: updatedExpDate,
            mrp: updatedMrp || latestBatch.mrp,
            purchasePrice: updatedPurchasePrice || latestBatch.purchasePrice,
            supplierName: supplierVal,
            quantity: updatedStock,
            availableQuantity: updatedStock,
            discount: Number(editingMedicine.purchaseDiscount) || latestBatch.discount || 0,
          })
        } else {
          const batchId = "BAT" + Date.now()
          PharmacyDatabase.addBatch({
            id: batchId,
            medicineId: editingMedicine.id,
            batchNumber: updatedBatchNum,
            expiryDate: updatedExpDate,
            manufacturingDate: new Date().toISOString().split("T")[0],
            quantity: updatedStock,
            availableQuantity: updatedStock,
            mrp: updatedMrp,
            purchasePrice: updatedPurchasePrice,
            discount: Number(editingMedicine.purchaseDiscount) || 0,
            supplierName: supplierVal,
            location: editingMedicine.binNo || "Main Pharmacy",
            grnId: "EDIT_SYNC",
            createdAt: new Date().toISOString(),
          })
        }

        PharmacyDatabase.logAudit(
          "Pharmacist",
          "Update",
          "Medicine Master",
          editingMedicine.id,
          `Updated medicine "${prodName}" (${selectedForm}), Batch: ${updatedBatchNum}, Exp: ${updatedExpDate}, Stock: ${updatedStock}`,
        )
      } else {
        const stockQty = editingMedicine.stock !== undefined && editingMedicine.stock !== "" ? Math.max(0, Number(editingMedicine.stock)) : 0
        const mrpVal = editingMedicine.mrp !== undefined && editingMedicine.mrp !== "" ? Number(editingMedicine.mrp) : 0
        const purchaseRate = editingMedicine.purchasePrice !== undefined && editingMedicine.purchasePrice !== "" ? Number(editingMedicine.purchasePrice) : (mrpVal > 0 ? +(mrpVal * 0.7).toFixed(2) : 0)
        const batchNum = editingMedicine.batchNumber?.trim() || "B" + Math.floor(100000 + Math.random() * 900000)
        const expDate = toDateInputValue(editingMedicine.expiryDate)

        const newMed = {
          id: "MED" + Date.now(),
          brandName: prodName,
          medicineName: prodName,
          name: prodName,
          genericName: editingMedicine.generic || prodName,
          supplierName: supplierVal,
          strength: packVal,
          packing: packVal,
          dosageForm: selectedForm,
          form: selectedForm,
          manufacturer: mnfShort,
          mnfCode: mnfShort,
          taxPercentage: taxVal,
          activeStatus: "Active" as const,
          hsnCode: editingMedicine.hsnCode || "3004 039",
          binNo: editingMedicine.binNo || "",
          barcode: editingMedicine.barcode || "890" + Math.floor(1000000000 + Math.random() * 9000000000),
          scheduleType: editingMedicine.schedule || "H",
          controlledSubstanceFlag: editingMedicine.prescription || false,
          categoryId: selectedForm,
          reorderLevel: Number(editingMedicine.reorderLevel) || 10,
          stock: stockQty,
          mrp: mrpVal,
          purchasePrice: purchaseRate,
          batchNumber: batchNum,
          expiryDate: expDate,
          createdAt: new Date().toISOString(),
        }
        PharmacyDatabase.addMedicine(newMed as any)

        const batchId = "BAT" + Date.now()
        PharmacyDatabase.addBatch({
          id: batchId,
          medicineId: newMed.id,
          batchNumber: batchNum,
          expiryDate: expDate,
          manufacturingDate: new Date().toISOString().split("T")[0],
          quantity: stockQty,
          availableQuantity: stockQty,
          mrp: mrpVal,
          purchasePrice: purchaseRate,
          discount: Number(editingMedicine.purchaseDiscount) || 0,
          supplierName: supplierVal,
          location: editingMedicine.binNo || "Main Pharmacy",
          grnId: "INIT_STOCK",
          createdAt: new Date().toISOString(),
        })

        if (stockQty > 0) {
          PharmacyDatabase.addTransaction({
            id: "TXN" + Math.floor(100000 + Math.random() * 900000),
            date: new Date().toISOString(),
            medicineId: newMed.id,
            batchId: batchId,
            quantity: stockQty,
            transactionType: "PURCHASE_RECEIVED",
            userId: "Pharmacist",
            reason: `Initial Stock Entry: ${supplierVal} (${stockQty} units)`,
          })
        }

        PharmacyDatabase.logAudit(
          "Pharmacist",
          "Create",
          "Medicine Master",
          newMed.id,
          `Added medicine "${newMed.medicineName}" (${newMed.dosageForm}) with ${stockQty} units stock`,
        )

        PharmacyDatabase.addNotification(
          "Medicine Added to Catalog",
          `Added "${newMed.medicineName}" (${newMed.packing}) with ${stockQty} units stock into inventory.`,
          "success",
          "Medicine Master",
        )
      }
    } catch (err: any) {
      console.error("Error saving medicine:", err)
      if (String(err?.message || err).toLowerCase().includes("quota")) {
        cleanupStorageQuota()
      }
      alert("Failed to save medicine: " + (err.message || String(err)))
      return
    }

    setShowModal(false)
    setEditingMedicine(null)
    window.dispatchEvent(new Event("storage"))
    window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    window.dispatchEvent(
      new CustomEvent("hospai_pharmacy_toast", {
        detail: {
          message: `Medicine "${prodName}" saved permanently!`,
          type: "success",
        },
      }),
    )
    alert(`Medicine "${prodName}" saved successfully in catalog!`)
    refresh()
  }

  const handleExport = () => {
    const headers = [
      "Qty",
      "Supplier Name",
      "Mfr",
      "Type",
      "Pack",
      "Product Name",
      "Batch",
      "Exp",
      "HSN",
      "M.R.P",
      "Rate",
      "DIS",
      "SGST",
      "CGST",
    ]

    const rows = filtered.map((m: any) => {
      const g = m.gst ?? 5
      const half = +(g / 2).toFixed(2)
      return [
        m.stock || 0,
        `"${(m.supplierName || "").replace(/"/g, '""')}"`,
        `"${(m.mnfCode || (m.manufacturer ? m.manufacturer.substring(0, 4).toUpperCase() : "")).replace(/"/g, '""')}"`,
        `"${(m.form || m.dosageForm || "TABLET").replace(/"/g, '""')}"`,
        `"${(m.packing || m.pack || "").replace(/"/g, '""')}"`,
        `"${(m.name || "").replace(/"/g, '""')}"`,
        `"${(m.batchNumber || "B" + Math.floor(100000 + Math.random() * 900000)).replace(/"/g, '""')}"`,
        `"${(m.expiryDate || "2028-03-31").replace(/"/g, '""')}"`,
        `"${(m.hsnCode || m.sku || "3004 039").replace(/"/g, '""')}"`,
        m.mrp || 0,
        m.purchasePrice ?? m.price ?? +(m.mrp * 0.75).toFixed(2),
        m.purchaseDiscount ?? m.discount ?? 0,
        half,
        half,
      ]
    })

    const csvContent =
      headers.join(",") +
      "\n" +
      rows.map((r) => r.join(",")).join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `hospital_medicines_export_${new Date().toISOString().split("T")[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    window.dispatchEvent(
      new CustomEvent("hospai_pharmacy_toast", {
        detail: { message: `Exported ${filtered.length} medicines to CSV!` },
      }),
    )
  }

  const handleImport = () => {
    setShowImportModal(true)
  }

  const filtered = medicines.filter((m) => {
    const q = search.toLowerCase()
    const matchSearch =
      !search ||
      (m.name || "").toLowerCase().includes(q) ||
      ((m as any).supplierName && (m as any).supplierName.toLowerCase().includes(q)) ||
      (m.mnfCode && m.mnfCode.toLowerCase().includes(q)) ||
      (m.hsnCode && m.hsnCode.toLowerCase().includes(q)) ||
      (m.packing && m.packing.toLowerCase().includes(q)) ||
      (m.generic || "").toLowerCase().includes(q)

    const formVal = (m.form || "").toLowerCase()
    const packVal = (m.packing || "").toLowerCase()
    const matchForm =
      formFilter === "All" ||
      formVal.includes(formFilter.toLowerCase()) ||
      packVal.includes(formFilter.toLowerCase())

    return matchSearch && matchForm
  })

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Inventory" },
          { label: "Medicine Master" },
        ]}
        title="Medicine Master"
        description={`${medicines.length} medicines · ${medicines.filter((m) => m.status === "active").length} active · Aligned with Supplier Invoice`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-[#E2E8F0] bg-white text-[13px] text-[#334155] hover:bg-[#F5F7FA] transition-colors"
            >
              <Upload size={13} /> Import
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#E2E8F0] text-[13px] font-medium text-[#334155] hover:bg-[#F5F7FA] transition-colors"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-white font-medium text-[13px] transition-colors"
              style={{ background: "#0F766E" }}
            >
              <Plus size={14} /> Add Medicine
            </button>
          </div>
        }
        onNavigate={onNavigate}
      />

      {/* Filters: Search & Formulation Type Dropdown */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded px-3 py-2 flex-1 max-w-xs">
          <Search size={14} className="text-[#94A3B8] flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product name, mfr, HSN…"
            className="text-[13px] outline-none text-[#0F1624] placeholder:text-[#94A3B8] w-full"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X size={12} className="text-[#94A3B8]" />
            </button>
          )}
        </div>

        {/* Dosage Form / Formulation Filter Dropdown */}
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded px-3 py-2">
          <Filter size={14} className="text-[#0F766E] flex-shrink-0" />
          <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">Type:</span>
          <select
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value)}
            className="text-[13px] text-[#0F1624] bg-transparent outline-none cursor-pointer font-medium"
          >
            <option value="All">All Types & Formulations</option>
            <option value="Tablet">Tablets (TAB)</option>
            <option value="Capsule">Capsules (CAP)</option>
            <option value="Injection">Injections (INJ / VIAL / AMP)</option>
            <option value="Syrup">Syrups & Liquids (SYR / SUSP)</option>
            <option value="Ointment">Ointments & Creams (OINT / GEL)</option>
            <option value="Drops">Eye / Ear Drops (DROPS)</option>
            <option value="Infusion">IV Fluids & Infusions</option>
            <option value="Inhaler">Inhalers & Respules</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2 text-[13px] text-[#64748B]">
          <span className="font-medium text-[#0F1624]">{filtered.length}</span>{" "}
          results {formFilter !== "All" && <span className="text-[#0F766E]">({formFilter})</span>}
        </div>
      </div>

      {/* Table (Supplier Invoice Aligned) */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <table>
          <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
            <tr>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Qty</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Mfr</th>
              <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Type</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Pack</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Product Name</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Supplier</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider font-mono">HSN Code</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">MRP (₹)</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Rate (₹)</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Status</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr className="hover:bg-[#F0FDFA] transition-colors" key={m.id}>
                <td className="text-right">
                  <span
                    className="font-bold text-[13px]"
                    style={{
                      color:
                        (m.stock || 0) <= 0
                          ? "#dc2626"
                          : m.stock < m.reorderLevel
                            ? "#d97706"
                            : "#15803d",
                    }}
                  >
                    {Math.max(0, m.stock || 0)}
                  </span>
                </td>
                <td className="text-[13px] font-bold font-mono text-[#0F766E]">
                  {m.mnfCode || "MANK"}
                </td>
                <td className="text-[12px] whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                    {m.form || (m as any).dosageForm || "TABLET"}
                  </span>
                </td>
                <td className="text-[12px] text-[#0F766E] font-medium whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200">
                    {m.packing || "1's"}
                  </span>
                </td>
                <td className="cursor-pointer group" onClick={() => handleEdit(m)} title="Click to edit medicine">
                  <p className="font-semibold text-[13px] text-[#0F1624] group-hover:text-[#0F766E] group-hover:underline flex items-center gap-1.5">
                    {m.name}
                    <Edit2 size={11} className="opacity-0 group-hover:opacity-100 text-[#0F766E] transition-opacity" />
                  </p>
                </td>
                <td className="text-[12px] whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
                    {(m as any).supplierName || "—"}
                  </span>
                </td>
                <td className="text-[12px] font-mono text-[#64748B]">
                  {m.hsnCode || m.sku || "-"}
                </td>
                <td className="text-[13px] font-medium text-[#0F1624] text-right">
                  ₹{m.mrp.toFixed(2)}
                </td>
                <td className="text-[13px] font-semibold text-[#15803D] text-right">
                  ₹{((m as any).purchasePrice ?? m.price ?? +(m.mrp * 0.75)).toFixed(2)}
                </td>
                <td>
                  <StatusBadge status={m.status} size="sm" />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(m)}
                      className="px-2.5 py-1 rounded bg-teal-50 border border-teal-200 text-[#0F766E] hover:bg-teal-100 flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
                      title="Edit medicine"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => setSelected(m)}
                      className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#64748B] transition-colors cursor-pointer"
                      title="View Details"
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-1.5 rounded hover:bg-[#FEE2E2] text-[#dc2626] transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-[#94A3B8]">
                  No medicines found in master catalog.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Medicine Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.6)" }}
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F2F5]">
              <div>
                <p className="font-bold text-[16px] text-[#0F1624]">
                  {selected.name}
                </p>
                <p className="text-[12px] text-[#64748B]">
                  {selected.generic} · SKU: {selected.sku}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const toEdit = selected
                    setSelected(null)
                    handleEdit(toEdit)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-[#0F766E] text-[12px] font-bold hover:bg-teal-100 transition-colors cursor-pointer"
                  title="Edit this medicine"
                >
                  <Edit2 size={13} /> Edit Medicine
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="p-2 rounded hover:bg-[#F0F2F5] text-[#94A3B8] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              <Grid
                title="Product Details (Supplier Invoice Aligned)"
                rows={[
                  ["Product Name", selected.name],
                  ["Supplier Name", (selected as any).supplierName || "—"],
                  ["Type / Formulation", (selected as any).dosageForm || selected.form || "TABLET"],
                  ["Pack", (selected as any).packing || (selected as any).pack || "-"],
                  ["Mfr (Manufacturer)", (selected as any).mnfCode || selected.manufacturer || "-"],
                  ["HSN Code", (selected as any).hsnCode || "-"],
                ]}
              />
              <Grid
                title="Pricing & Tax"
                rows={[
                  ["MRP", `₹${selected.mrp.toFixed(2)}`],
                  ["Rate (Purchase Price)", (selected as any).purchasePrice ? `₹${(selected as any).purchasePrice.toFixed(2)}` : `₹${selected.price.toFixed(2)}`],
                  ["GST Rate", `${selected.gst}% (${(selected.gst / 2).toFixed(1)}% SGST + ${(selected.gst / 2).toFixed(1)}% CGST)`],
                ]}
              />
              <Grid
                title="Stock"
                rows={[
                  ["Current Stock (Qty)", `${selected.stock} units`],
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Medicine Modal (Clean Horizontal Layout Matching Receipt Order) */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(2px)" }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden border border-[#CBD5E1]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <div>
                <h3 className="font-bold text-[18px] text-[#0F1624]">
                  {editingMedicine?.id ? "Edit Medicine" : "Add New Medicine"}
                </h3>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Enter medicine details matching supplier invoice format.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg hover:bg-[#E2E8F0] text-[#64748B] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body - Horizontal Row-Based Layout */}
            <div className="p-6 space-y-5 bg-white overflow-y-auto max-h-[75vh]">
              {/* Row 1: Qty, Mfr, Pack, Product Name, Batch, Exp */}
              <div>
                <p className="text-[11px] font-bold text-[#0F766E] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0F766E]"></span>
                  Product & Batch Identification
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#15803D] uppercase tracking-wide mb-1">
                      Qty *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 36"
                      value={editingMedicine?.stock !== undefined ? editingMedicine.stock : ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          stock: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#86EFAC] rounded-lg text-[13px] font-bold text-[#15803D] focus:outline-[#15803D]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      Mfr *
                    </label>
                    <input
                      placeholder="e.g. MANK"
                      maxLength={6}
                      value={editingMedicine?.mnfCode || ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          mnfCode: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] uppercase font-mono font-bold text-[#0F766E] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#0F766E] uppercase tracking-wide mb-1">
                      Type *
                    </label>
                    <select
                      value={editingMedicine?.form || "TABLET"}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          form: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg text-[13px] font-semibold text-[#0F172A] focus:outline-[#0F766E]"
                    >
                      <option value="TABLET">Tablet</option>
                      <option value="INJECTION">Injection</option>
                      <option value="CAPSULE">Capsule</option>
                      <option value="SYRUP">Syrup</option>
                      <option value="OINTMENT">Ointment</option>
                      <option value="DROPS">Drops</option>
                      <option value="IV FLUID">IV Fluid</option>
                      <option value="INHALER">Inhaler</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      Pack *
                    </label>
                    <input
                      placeholder="e.g. 2 ML"
                      value={editingMedicine?.packing || ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          packing: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-semibold text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-[#0F766E] uppercase tracking-wide mb-1">
                      Product Name *
                    </label>
                    <input
                      placeholder="e.g. DROTICIND INJ, VOMIKIND INJ"
                      value={editingMedicine?.name || ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          name: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg text-[13px] font-semibold text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-[#0F766E] uppercase tracking-wide mb-1">
                      Supplier Name *
                    </label>
                    <input
                      list="supplier-options"
                      placeholder="e.g. Apollo / Sun / Cipla"
                      value={editingMedicine?.supplierName || ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          supplierName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg text-[13px] font-semibold text-[#0F172A] focus:outline-[#0F766E]"
                    />
                    <datalist id="supplier-options">
                      {suppliers.map((s: any) => (
                        <option key={s.id} value={s.supplierName} />
                      ))}
                    </datalist>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      Batch *
                    </label>
                    <input
                      placeholder="e.g. B51Y016"
                      value={editingMedicine?.batchNumber || ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          batchNumber: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-mono uppercase font-bold text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      Exp *
                    </label>
                    <input
                      type="date"
                      value={editingMedicine?.expiryDate || ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          expiryDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      HSN *
                    </label>
                    <input
                      placeholder="e.g. 30049099"
                      value={editingMedicine?.hsnCode || ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          hsnCode: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-mono text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Pricing, Discount, SGST %, CGST % (Exact Receipt Order) */}
              <div className="pt-2 border-t border-[#F1F5F9]">
                <p className="text-[11px] font-bold text-[#0F766E] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0F766E]"></span>
                  Pricing & GST Tax Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-bold text-[#0F766E] uppercase tracking-wide mb-1">
                      M.R.P (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 39.74"
                      value={editingMedicine?.mrp !== undefined ? editingMedicine.mrp : ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          mrp: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg text-[13px] font-bold text-[#0F766E] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-bold text-[#15803D] uppercase tracking-wide mb-1">
                      Rate (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 19.94"
                      value={editingMedicine?.purchasePrice !== undefined ? editingMedicine.purchasePrice : ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          purchasePrice: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#86EFAC] rounded-lg text-[13px] font-bold text-[#15803D] focus:outline-[#15803D]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      DIS %
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 0.00"
                      value={editingMedicine?.purchaseDiscount !== undefined ? editingMedicine.purchaseDiscount : ""}
                      onChange={(e) =>
                        setEditingMedicine({
                          ...editingMedicine,
                          purchaseDiscount: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      SGST %
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 2.50"
                      value={editingMedicine?.sgst !== undefined ? editingMedicine.sgst : ""}
                      onChange={(e) => {
                        const val = e.target.value
                        const num = parseFloat(val) || 0
                        setEditingMedicine({
                          ...editingMedicine,
                          sgst: val,
                          cgst: val,
                          gst: +(num * 2).toFixed(2),
                        })
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-bold text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wide mb-1">
                      CGST %
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 2.50"
                      value={editingMedicine?.cgst !== undefined ? editingMedicine.cgst : ""}
                      onChange={(e) => {
                        const val = e.target.value
                        const numC = parseFloat(val) || 0
                        const numS = parseFloat(editingMedicine?.sgst) || 0
                        setEditingMedicine({
                          ...editingMedicine,
                          cgst: val,
                          gst: +(numS + numC).toFixed(2),
                        })
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-bold text-[#0F172A] focus:outline-[#0F766E]"
                    />
                  </div>
                </div>

                {/* Auto Calculated GST Summary Pill */}
                <div className="mt-3 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs">
                  <span className="text-[#64748B]">
                    GST Auto Calculation:
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[#0F172A]">
                      SGST: {editingMedicine?.sgst ?? 2.5}% + CGST: {editingMedicine?.cgst ?? 2.5}%
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full font-bold bg-teal-100 text-[#0F766E] border border-teal-200">
                      Total GST: {editingMedicine?.gst ?? 5}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-[13px] font-semibold text-[#475569] hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 rounded-xl text-white font-semibold text-[13px] shadow-sm hover:opacity-95 transition-opacity"
                style={{ background: "#0F766E" }}
              >
                Save Medicine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Medicines Modal */}
      <ImportMedicinesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          setSearch("")
          setFormFilter("All")
          refresh()
        }}
        existingMedicines={medicines}
      />
    </div>
  )
}

function Grid({ title, rows }: { title: string ;rows: [string, string][] }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide mb-2">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="p-3 rounded bg-[#F5F7FA]">
            <p className="text-[11px] text-[#94A3B8]">{label}</p>
            <p className="text-[13px] font-semibold text-[#0F1624] mt-0.5">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
