import React, { useState, useEffect, useMemo } from "react"
import {
  LabInventoryDatabase,
  LabInventoryItem,
  LabInventoryCategory,
  LabStockTransaction,
  LabSupplier,
} from "../../services/labInventoryDb"
import { AuditDatabase } from "../../services/auditDb"

interface LaboratoryInventoryProps {
  technician?: string
}

const CATEGORIES: LabInventoryCategory[] = [
  "Reagent",
  "Test Kit",
  "Consumable",
  "Control",
  "Calibrator",
  "Specimen Container",
  "Laboratory Supply",
]

const UNITS = [
  "Vials",
  "Kits",
  "Boxes",
  "Tubes",
  "Bottles",
  "Packs",
  "Units",
  "Strips",
  "Rolls",
]

export default function LaboratoryInventory({
  technician = "Laboratory Specialist",
}: LaboratoryInventoryProps) {
  const [tick, setTick] = useState(0)
  const [activeTab, setActiveTab] = useState<
    "items" | "low_stock" | "expiry" | "transactions" | "suppliers"
  >("items")
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showIssueModal, setShowIssueModal] = useState<LabInventoryItem | null>(null)
  const [showAdjustModal, setShowAdjustModal] = useState<LabInventoryItem | null>(null)
  const [showReturnModal, setShowReturnModal] = useState<LabInventoryItem | null>(null)
  const [showDamageModal, setShowDamageModal] = useState<LabInventoryItem | null>(null)
  const [showSupplierModal, setShowSupplierModal] = useState(false)

  // Forms state
  const [newItemForm, setNewItemForm] = useState({
    name: "",
    category: "Reagent" as LabInventoryCategory,
    itemCode: "",
    batchNumber: "",
    supplier: "",
    quantity: 10,
    unit: "Vials",
    minimumStock: 5,
    expiryDate: "",
    storageLocation: "Reagent Fridge 2-8°C",
    remarks: "Direct receipt into bench inventory",
  })

  const [issueForm, setIssueForm] = useState({
    quantity: 1,
    bench: "Hematology Bench",
    remarks: "Daily test run requirement",
  })

  const [adjustForm, setAdjustForm] = useState({
    newQuantity: 0,
    reason: "Physical audit reconciliation",
  })

  const [returnForm, setReturnForm] = useState({
    quantity: 1,
    remarks: "Defective packaging / recalled batch",
  })

  const [damageForm, setDamageForm] = useState({
    quantity: 1,
    remarks: "Container broken / vial leakage",
  })

  const [supplierForm, setSupplierForm] = useState({
    name: "",
    code: "",
    contact: "",
    email: "",
  })

  const [toastMessage, setToastMessage] = useState<{
    text: string
    type: "success" | "error" | "info"
  } | null>(null)

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Subscribe to DB changes
  useEffect(() => {
    return LabInventoryDatabase.subscribe(() => setTick((t) => t + 1))
  }, [])

  const items = useMemo(() => {
    return LabInventoryDatabase.getItems()
  }, [tick])

  const transactions = useMemo(() => {
    return LabInventoryDatabase.getTransactions()
  }, [tick])

  const suppliers = useMemo(() => {
    return LabInventoryDatabase.getSuppliers()
  }, [tick])

  // KPIs
  const kpis = useMemo(() => {
    const total = items.length
    const inStock = items.filter((i) => i.status === "In Stock").length
    const lowStock = items.filter((i) => i.status === "Low Stock").length
    const expiringSoon = items.filter((i) => i.status === "Expiring Soon").length
    const expired = items.filter((i) => i.status === "Expired").length
    const outOfStock = items.filter((i) => i.status === "Out of Stock").length
    return { total, inStock, lowStock, expiringSoon, expired, outOfStock }
  }, [items])

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false
      if (statusFilter !== "all" && item.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = item.name.toLowerCase().includes(q)
        const matchCode = item.itemCode.toLowerCase().includes(q)
        const matchBatch = item.batchNumber.toLowerCase().includes(q)
        const matchSup = item.supplier.toLowerCase().includes(q)
        if (!matchName && !matchCode && !matchBatch && !matchSup) return false
      }
      return true
    })
  }, [items, categoryFilter, statusFilter, searchQuery])

  // Low stock list
  const lowStockItems = useMemo(() => {
    return items.filter((i) => i.quantity <= i.minimumStock)
  }, [items])

  // Expiry watchlist items
  const expiryWatchlistItems = useMemo(() => {
    return items.filter((i) => i.status === "Expiring Soon" || i.status === "Expired")
  }, [items])

  // Handlers
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemForm.name.trim()) {
      showToast("Please enter item name", "error")
      return
    }
    if (!newItemForm.batchNumber.trim()) {
      showToast("Please enter batch number", "error")
      return
    }
    if (!newItemForm.expiryDate) {
      showToast("Please specify expiry date", "error")
      return
    }

    const created = LabInventoryDatabase.addItem(
      {
        name: newItemForm.name,
        category: newItemForm.category,
        itemCode: newItemForm.itemCode || `LAB-${newItemForm.name.slice(0, 3).toUpperCase()}`,
        batchNumber: newItemForm.batchNumber,
        supplier: newItemForm.supplier || "Standard Diagnostics",
        quantity: Number(newItemForm.quantity),
        unit: newItemForm.unit,
        minimumStock: Number(newItemForm.minimumStock),
        expiryDate: newItemForm.expiryDate,
        storageLocation: newItemForm.storageLocation,
      },
      technician,
      newItemForm.remarks
    )

    AuditDatabase.logEvent(
      "Lab Stock Received",
      "Laboratory",
      `${technician} received ${created.quantity} ${created.unit} of ${created.name} (Batch: ${created.batchNumber}).`,
      "Success"
    )

    showToast(`✓ Received ${created.name} into Laboratory inventory!`, "success")
    setShowAddModal(false)
    setNewItemForm({
      name: "",
      category: "Reagent",
      itemCode: "",
      batchNumber: "",
      supplier: "",
      quantity: 10,
      unit: "Vials",
      minimumStock: 5,
      expiryDate: "",
      storageLocation: "Reagent Fridge 2-8°C",
      remarks: "Direct receipt into bench inventory",
    })
  }

  const handleIssueStock = (e: React.FormEvent) => {
    e.preventDefault()
    if (!showIssueModal) return
    const qty = Number(issueForm.quantity)
    if (qty <= 0) {
      showToast("Quantity must be greater than 0", "error")
      return
    }
    if (qty > showIssueModal.quantity) {
      showToast(`Cannot issue more than available stock (${showIssueModal.quantity})`, "error")
      return
    }

    const updated = LabInventoryDatabase.issueStock(
      showIssueModal.id,
      qty,
      technician,
      issueForm.bench,
      issueForm.remarks
    )

    if (updated) {
      AuditDatabase.logEvent(
        "Lab Stock Issued",
        "Laboratory",
        `${technician} issued ${qty} ${updated.unit} of ${updated.name} to ${issueForm.bench}.`,
        "Success"
      )
      showToast(`✓ Issued ${qty} ${updated.unit} to ${issueForm.bench}`, "info")
      setShowIssueModal(null)
    }
  }

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault()
    if (!showAdjustModal) return
    const qty = Number(adjustForm.newQuantity)
    if (qty < 0) {
      showToast("Quantity cannot be negative", "error")
      return
    }

    const updated = LabInventoryDatabase.adjustStock(
      showAdjustModal.id,
      qty,
      technician,
      adjustForm.reason
    )

    if (updated) {
      AuditDatabase.logEvent(
        "Lab Stock Adjusted",
        "Laboratory",
        `${technician} adjusted stock for ${updated.name} to ${qty} ${updated.unit}. Reason: ${adjustForm.reason}`,
        "Success"
      )
      showToast(`✓ Stock for ${updated.name} adjusted to ${qty} ${updated.unit}`, "info")
      setShowAdjustModal(null)
    }
  }

  const handleReturnStock = (e: React.FormEvent) => {
    e.preventDefault()
    if (!showReturnModal) return
    const qty = Number(returnForm.quantity)
    if (qty <= 0 || qty > showReturnModal.quantity) {
      showToast(`Invalid return quantity. Available: ${showReturnModal.quantity}`, "error")
      return
    }

    const updated = LabInventoryDatabase.returnStock(
      showReturnModal.id,
      qty,
      technician,
      showReturnModal.supplier,
      returnForm.remarks
    )

    if (updated) {
      AuditDatabase.logEvent(
        "Lab Stock Returned",
        "Laboratory",
        `${technician} returned ${qty} ${updated.unit} of ${updated.name} to ${showReturnModal.supplier}.`,
        "Success"
      )
      showToast(`✓ Returned ${qty} ${updated.unit} to vendor`, "info")
      setShowReturnModal(null)
    }
  }

  const handleMarkDamaged = (e: React.FormEvent) => {
    e.preventDefault()
    if (!showDamageModal) return
    const qty = Number(damageForm.quantity)
    if (qty <= 0 || qty > showDamageModal.quantity) {
      showToast(`Invalid quantity. Available: ${showDamageModal.quantity}`, "error")
      return
    }

    const updated = LabInventoryDatabase.markDamaged(
      showDamageModal.id,
      qty,
      technician,
      damageForm.remarks
    )

    if (updated) {
      AuditDatabase.logEvent(
        "Lab Stock Damaged",
        "Laboratory",
        `${technician} marked ${qty} ${updated.unit} of ${updated.name} as damaged. Remarks: ${damageForm.remarks}`,
        "Success"
      )
      showToast(`✓ Recorded ${qty} ${updated.unit} damaged`, "error")
      setShowDamageModal(null)
    }
  }

  const handleMarkExpired = (item: LabInventoryItem) => {
    if (
      !window.confirm(
        `Are you sure you want to mark ${item.name} (Batch: ${item.batchNumber}) as Expired? Available quantity will be written off.`
      )
    ) {
      return
    }

    const updated = LabInventoryDatabase.markExpired(
      item.id,
      technician,
      "Disposed due to expired shelf life"
    )

    if (updated) {
      AuditDatabase.logEvent(
        "Lab Stock Expired",
        "Laboratory",
        `${technician} marked ${updated.name} (Batch: ${updated.batchNumber}) as expired.`,
        "Success"
      )
      showToast(`✓ Marked ${item.name} as expired & written off`, "info")
    }
  }

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierForm.name.trim()) {
      showToast("Please enter supplier name", "error")
      return
    }

    const created = LabInventoryDatabase.addSupplier({
      name: supplierForm.name,
      code: supplierForm.code || `SUP-${supplierForm.name.slice(0, 3).toUpperCase()}`,
      contact: supplierForm.contact || "+91 Laboratory Supply desk",
      email: supplierForm.email || "vendor@labsupplies.com",
    })

    showToast(`✓ Supplier ${created.name} registered`, "success")
    setShowSupplierModal(false)
    setSupplierForm({ name: "", code: "", contact: "", email: "" })
  }

  const statusBadge = (status: LabInventoryItem["status"]) => {
    switch (status) {
      case "In Stock":
        return "bg-emerald-50 text-emerald-800 border-emerald-300"
      case "Low Stock":
        return "bg-amber-50 text-amber-800 border-amber-300"
      case "Expiring Soon":
        return "bg-orange-50 text-orange-800 border-orange-300 font-bold"
      case "Expired":
        return "bg-red-50 text-red-800 border-red-300 font-bold"
      case "Out of Stock":
        return "bg-slate-100 text-slate-700 border-slate-300"
      default:
        return "bg-gray-100 text-gray-700 border-gray-300"
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden text-gray-900 font-sans">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-none text-xs font-semibold shadow-lg border flex items-center gap-2 ${
            toastMessage.type === "success"
              ? "bg-emerald-900 text-white border-emerald-700"
              : toastMessage.type === "error"
              ? "bg-red-900 text-white border-red-700"
              : "bg-slate-900 text-white border-slate-700"
          }`}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Inventory Tabs & Actions Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("items")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-none border transition-colors flex items-center gap-2 cursor-pointer shadow-2xs ${
              activeTab === "items"
                ? "bg-white text-blue-700 border-blue-600 font-bold border-b-2"
                : "bg-slate-200/70 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900"
            }`}
          >
            <span>📦</span> Stock Items
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-gray-700 font-mono font-bold">
              [{kpis.total}]
            </span>
          </button>
          <button
            onClick={() => setActiveTab("low_stock")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-none border transition-colors flex items-center gap-2 cursor-pointer shadow-2xs ${
              activeTab === "low_stock"
                ? "bg-white text-amber-800 border-amber-600 font-bold border-b-2"
                : "bg-slate-200/70 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900"
            }`}
          >
            <span>⚠️</span> Low Stock &amp; Shortages
            <span
              className={`text-[10px] px-1.5 py-0.2 font-mono font-bold ${
                kpis.lowStock > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-gray-700"
              }`}
            >
              [{kpis.lowStock}]
            </span>
          </button>
          <button
            onClick={() => setActiveTab("expiry")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-none border transition-colors flex items-center gap-2 cursor-pointer shadow-2xs ${
              activeTab === "expiry"
                ? "bg-white text-red-700 border-red-600 font-bold border-b-2"
                : "bg-slate-200/70 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900"
            }`}
          >
            <span>⏳</span> Expiry Watchlist
            <span
              className={`text-[10px] px-1.5 py-0.2 font-mono font-bold ${
                kpis.expiringSoon + kpis.expired > 0
                  ? "bg-red-100 text-red-800"
                  : "bg-slate-200 text-gray-700"
              }`}
            >
              [{kpis.expiringSoon + kpis.expired}]
            </span>
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-none border transition-colors flex items-center gap-2 cursor-pointer shadow-2xs ${
              activeTab === "transactions"
                ? "bg-white text-indigo-700 border-indigo-600 font-bold border-b-2"
                : "bg-slate-200/70 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900"
            }`}
          >
            <span>📝</span> Transaction History
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-gray-700 font-mono font-bold">
              [{transactions.length}]
            </span>
          </button>
          <button
            onClick={() => setActiveTab("suppliers")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-none border transition-colors flex items-center gap-2 cursor-pointer shadow-2xs ${
              activeTab === "suppliers"
                ? "bg-white text-teal-800 border-teal-600 font-bold border-b-2"
                : "bg-slate-200/70 text-gray-600 border-gray-300 hover:bg-white hover:text-gray-900"
            }`}
          >
            <span>🏢</span> Suppliers Master
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-gray-700 font-mono font-bold">
              [{suppliers.length}]
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowSupplierModal(true)}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-none border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <span>🏢</span> Suppliers Directory
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-none shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span className="font-bold text-sm leading-none">+</span> Add Stock Item
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5 shrink-0">
          <div className="bg-white border border-gray-200 border-l-4 border-l-blue-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-gray-500 block text-[10.5px] font-semibold uppercase tracking-wider">
              Total Items
            </span>
            <strong className="text-2xl font-bold text-gray-900 mt-1 block">
              {kpis.total}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-emerald-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-emerald-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              In Stock
            </span>
            <strong className="text-2xl font-bold text-emerald-800 mt-1 block">
              {kpis.inStock}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-amber-500 rounded-none p-3.5 shadow-2xs">
            <span className="text-amber-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Low Stock
            </span>
            <strong className="text-2xl font-bold text-amber-800 mt-1 block">
              {kpis.lowStock}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-orange-500 rounded-none p-3.5 shadow-2xs">
            <span className="text-orange-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Expiring Soon
            </span>
            <strong className="text-2xl font-bold text-orange-800 mt-1 block">
              {kpis.expiringSoon}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-red-600 rounded-none p-3.5 shadow-2xs">
            <span className="text-red-700 block text-[10.5px] font-semibold uppercase tracking-wider">
              Expired
            </span>
            <strong className="text-2xl font-bold text-red-800 mt-1 block">
              {kpis.expired}
            </strong>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-slate-500 rounded-none p-3.5 shadow-2xs">
            <span className="text-slate-600 block text-[10.5px] font-semibold uppercase tracking-wider">
              Out of Stock
            </span>
            <strong className="text-2xl font-bold text-slate-800 mt-1 block">
              {kpis.outOfStock}
            </strong>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: STOCK ITEMS TABLE                                                 */}
        {/* ========================================================================= */}
        {activeTab === "items" && (
          <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex-1 flex flex-col overflow-hidden">
            {/* Toolbar Filters */}
            <div className="p-3.5 bg-slate-50/70 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search item name, code, batch, supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-none focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-none focus:outline-none focus:border-blue-600"
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-none focus:outline-none focus:border-blue-600"
                >
                  <option value="all">All Statuses</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Expiring Soon">Expiring Soon</option>
                  <option value="Expired">Expired</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>

                {(categoryFilter !== "all" || statusFilter !== "all" || searchQuery) && (
                  <button
                    onClick={() => {
                      setCategoryFilter("all")
                      setStatusFilter("all")
                      setSearchQuery("")
                    }}
                    className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-300 bg-white"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[360px]">
              {filteredItems.length === 0 ? (
                <div className="py-20 text-center text-gray-500">
                  <div className="text-3xl mb-2">📦</div>
                  <h3 className="text-sm font-bold text-gray-800">
                    No laboratory inventory records available.
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                    {searchQuery || categoryFilter !== "all" || statusFilter !== "all"
                      ? "No stock items match your search or filter criteria."
                      : "Click '+ Add Stock Item' above to register reagents, test kits, or consumables."}
                  </p>
                  {!searchQuery && categoryFilter === "all" && statusFilter === "all" && (
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-none hover:bg-blue-700"
                    >
                      + Add First Stock Item
                    </button>
                  )}
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Item Details</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Batch &amp; Code</th>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3 text-right">Min Stock</th>
                      <th className="py-2.5 px-3">Expiry Date</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-gray-900">
                          <div>{item.name}</div>
                          {item.storageLocation && (
                            <div className="text-[10px] text-gray-500 font-normal">
                              📍 {item.storageLocation}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">{item.category}</td>
                        <td className="py-2.5 px-3 font-mono text-gray-600">
                          <div>{item.batchNumber}</div>
                          <div className="text-[10px] text-gray-400">{item.itemCode}</div>
                        </td>
                        <td className="py-2.5 px-3 text-gray-700">{item.supplier}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                          {item.quantity}{" "}
                          <span className="text-[10px] font-normal text-gray-500 font-sans">
                            {item.unit}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                          {item.minimumStock}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-700">
                          {item.expiryDate}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded-none border font-semibold ${statusBadge(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              disabled={item.quantity <= 0}
                              onClick={() => {
                                setShowIssueModal(item)
                                setIssueForm({
                                  quantity: 1,
                                  bench: "Hematology Bench",
                                  remarks: "Daily test run requirement",
                                })
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              title="Issue to Laboratory Bench"
                            >
                              Issue
                            </button>
                            <button
                              onClick={() => {
                                setShowAdjustModal(item)
                                setAdjustForm({
                                  newQuantity: item.quantity,
                                  reason: "Physical audit reconciliation",
                                })
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-gray-700 bg-slate-100 hover:bg-slate-200 border border-gray-300 rounded-none cursor-pointer"
                              title="Adjust Count"
                            >
                              Adjust
                            </button>
                            <button
                              disabled={item.quantity <= 0}
                              onClick={() => {
                                setShowReturnModal(item)
                                setReturnForm({
                                  quantity: 1,
                                  remarks: "Defective packaging / recalled batch",
                                })
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              title="Return to Supplier"
                            >
                              Return
                            </button>
                            <button
                              disabled={item.quantity <= 0}
                              onClick={() => {
                                setShowDamageModal(item)
                                setDamageForm({
                                  quantity: 1,
                                  remarks: "Container broken / vial leakage",
                                })
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              title="Mark Damaged"
                            >
                              Damage
                            </button>
                            {item.status === "Expired" && item.quantity > 0 && (
                              <button
                                onClick={() => handleMarkExpired(item)}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-none cursor-pointer"
                                title="Write Off Expired Stock"
                              >
                                Write-Off
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: LOW STOCK & SHORTAGES                                             */}
        {/* ========================================================================= */}
        {activeTab === "low_stock" && (
          <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-amber-50/40 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  Critical Low Stock &amp; Depleted Reagents
                </h3>
                <p className="text-xs text-amber-700 mt-0.5">
                  Items where available quantity is at or below the defined minimum buffer
                  threshold.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-amber-800 px-2 py-1 bg-amber-100 border border-amber-300">
                {lowStockItems.length} Shortage Items
              </span>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[360px]">
              {lowStockItems.length === 0 ? (
                <div className="py-20 text-center text-gray-500">
                  <div className="text-3xl mb-2">✓</div>
                  <h3 className="text-sm font-bold text-gray-800">
                    No low stock alerts detected.
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    All reagents, calibrators, and consumables are currently above minimum safety
                    levels.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4">Item Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Current Quantity</th>
                      <th className="py-2.5 px-3 text-right">Minimum Stock</th>
                      <th className="py-2.5 px-3 text-right">Shortage</th>
                      <th className="py-2.5 px-4">Supplier</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Quick Restock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {lowStockItems.map((item) => {
                      const shortage = Math.max(0, item.minimumStock - item.quantity)
                      return (
                        <tr key={item.id} className="hover:bg-amber-50/30">
                          <td className="py-2.5 px-4 font-semibold text-gray-900">
                            <div>{item.name}</div>
                            <span className="font-mono text-[10px] text-gray-500">
                              Batch: {item.batchNumber}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">{item.category}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-red-700">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                            {item.minimumStock} {item.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800">
                            -{shortage} {item.unit}
                          </td>
                          <td className="py-2.5 px-4 text-gray-700">{item.supplier}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold border ${statusBadge(
                                item.status
                              )}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => {
                                setShowAdjustModal(item)
                                setAdjustForm({
                                  newQuantity: item.minimumStock + 10,
                                  reason: "Emergency restock replenishment",
                                })
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] rounded-none cursor-pointer shadow-2xs"
                            >
                              Replenish
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: EXPIRY WATCHLIST                                                  */}
        {/* ========================================================================= */}
        {activeTab === "expiry" && (
          <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-red-50/40 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-red-900">
                  Reagent &amp; Test Kit Expiration Watchlist
                </h3>
                <p className="text-xs text-red-700 mt-0.5">
                  Items expiring within 30 days or past manufacturer viability date. Expired items
                  must not be used for diagnostic testing.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-red-800 px-2 py-1 bg-red-100 border border-red-300">
                {expiryWatchlistItems.length} Monitored Lots
              </span>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[360px]">
              {expiryWatchlistItems.length === 0 ? (
                <div className="py-20 text-center text-gray-500">
                  <div className="text-3xl mb-2">✓</div>
                  <h3 className="text-sm font-bold text-gray-800">
                    No expiring or expired reagents found.
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    All stored inventory lots are safely within their manufacturer validity
                    windows.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4">Item Details</th>
                      <th className="py-2.5 px-3">Batch</th>
                      <th className="py-2.5 px-3">Expiry Date</th>
                      <th className="py-2.5 px-3 text-right">Available Qty</th>
                      <th className="py-2.5 px-4">Storage Location</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {expiryWatchlistItems.map((item) => (
                      <tr key={item.id} className="hover:bg-red-50/30">
                        <td className="py-2.5 px-4 font-semibold text-gray-900">
                          <div>{item.name}</div>
                          <span className="text-[10px] text-gray-500 font-normal">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-700">
                          {item.batchNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-red-800">
                          {item.expiryDate}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-2.5 px-4 text-gray-600">
                          {item.storageLocation || "Standard Storage"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold border ${statusBadge(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {item.status === "Expired" ? (
                            <button
                              onClick={() => handleMarkExpired(item)}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-[11px] rounded-none cursor-pointer"
                            >
                              Dispose / Write-Off
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setShowIssueModal(item)
                                setIssueForm({
                                  quantity: item.quantity,
                                  bench: "Priority Use Bench",
                                  remarks: "Priority utilization before expiration",
                                })
                              }}
                              className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-[11px] rounded-none cursor-pointer"
                            >
                              Prioritize Lot
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 4: TRANSACTION HISTORY                                               */}
        {/* ========================================================================= */}
        {activeTab === "transactions" && (
          <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Laboratory Stock Movement &amp; Audit Trail
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Complete ledger of all receipts, issues, adjustments, returns, and write-offs.
                </p>
              </div>
              <span className="text-xs font-mono text-gray-600">
                Total Transactions: {transactions.length}
              </span>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[360px]">
              {transactions.length === 0 ? (
                <div className="py-20 text-center text-gray-500">
                  <div className="text-3xl mb-2">📋</div>
                  <h3 className="text-sm font-bold text-gray-800">
                    No inventory transactions recorded.
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Every stock movement will be automatically logged here with user and timestamp.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Date &amp; Time</th>
                      <th className="py-2.5 px-3">Tx ID</th>
                      <th className="py-2.5 px-3">Item Name</th>
                      <th className="py-2.5 px-3">Batch</th>
                      <th className="py-2.5 px-3 text-center">Type</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Prev → New</th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {transactions.map((tx) => {
                      const typeBadge =
                        tx.type === "Received"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : tx.type === "Issued"
                          ? "bg-blue-50 text-blue-800 border-blue-300"
                          : tx.type === "Adjusted"
                          ? "bg-purple-50 text-purple-800 border-purple-300"
                          : tx.type === "Returned"
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : "bg-red-50 text-red-800 border-red-300"

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-gray-600 font-sans text-[11px]">
                            {new Date(tx.date).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-gray-500">{tx.id}</td>
                          <td className="py-2.5 px-3 text-gray-900 font-semibold font-sans">
                            {tx.itemName}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600">{tx.batchNumber}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 text-[10px] rounded-none border font-semibold ${typeBadge}`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                            {tx.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-600">
                            {tx.previousQuantity} → {tx.newQuantity}
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 font-sans">{tx.user}</td>
                          <td className="py-2.5 px-3 text-gray-500 font-sans text-[11px]">
                            {tx.remarks || "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 5: SUPPLIERS MASTER                                                  */}
        {/* ========================================================================= */}
        {activeTab === "suppliers" && (
          <div className="bg-white border border-gray-200 rounded-none shadow-2xs flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Approved Diagnostic Vendors &amp; Reagent Suppliers
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manufacturers, authorized distributors, and logistics contacts.
                </p>
              </div>
              <button
                onClick={() => setShowSupplierModal(true)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-none cursor-pointer"
              >
                + Add Supplier
              </button>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[360px]">
              {suppliers.length === 0 ? (
                <div className="py-20 text-center text-gray-500">
                  <div className="text-3xl mb-2">🏢</div>
                  <h3 className="text-sm font-bold text-gray-800">
                    No supplier records available.
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Suppliers are automatically tracked as stock items are added or can be registered
                    manually.
                  </p>
                  <button
                    onClick={() => setShowSupplierModal(true)}
                    className="mt-4 px-3.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-none"
                  >
                    + Register Vendor
                  </button>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-gray-700 text-[11px] uppercase font-bold tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-4">Supplier Name</th>
                      <th className="py-2.5 px-3">Vendor Code</th>
                      <th className="py-2.5 px-4">Contact Phone</th>
                      <th className="py-2.5 px-4">Email</th>
                      <th className="py-2.5 px-4">Items Supplied</th>
                      <th className="py-2.5 px-3">Last Supply Date</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {suppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-gray-900">{s.name}</td>
                        <td className="py-2.5 px-3 font-mono text-gray-600">{s.code}</td>
                        <td className="py-2.5 px-4 text-gray-700">{s.contact}</td>
                        <td className="py-2.5 px-4 text-gray-700">{s.email}</td>
                        <td className="py-2.5 px-4 text-gray-600">
                          {s.itemsSupplied && s.itemsSupplied.length > 0
                            ? s.itemsSupplied.join(", ")
                            : "General Consumables"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-600">
                          {s.lastSupplyDate || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD STOCK ITEM                                                    */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 shadow-2xl w-full max-w-xl rounded-none flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-gray-700">
              <h3 className="text-sm font-bold tracking-tight">
                Add Laboratory Stock / Receive Reagent
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddItem} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CBC Diluent / Hematology Reagent Pack"
                    value={newItemForm.name}
                    onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Category *
                  </label>
                  <select
                    value={newItemForm.category}
                    onChange={(e) =>
                      setNewItemForm({
                        ...newItemForm,
                        category: e.target.value as LabInventoryCategory,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Item Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. REAG-CBC-01"
                    value={newItemForm.itemCode}
                    onChange={(e) => setNewItemForm({ ...newItemForm, itemCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Batch Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BATCH-2026-X9"
                    value={newItemForm.batchNumber}
                    onChange={(e) =>
                      setNewItemForm({ ...newItemForm, batchNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newItemForm.expiryDate}
                    onChange={(e) => setNewItemForm({ ...newItemForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Quantity Received *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newItemForm.quantity}
                    onChange={(e) =>
                      setNewItemForm({ ...newItemForm, quantity: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Packaging Unit
                  </label>
                  <select
                    value={newItemForm.unit}
                    onChange={(e) => setNewItemForm({ ...newItemForm, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs bg-white"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Minimum Stock Alert
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newItemForm.minimumStock}
                    onChange={(e) =>
                      setNewItemForm({ ...newItemForm, minimumStock: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Supplier / Vendor
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Roche Diagnostics / Transasia"
                    value={newItemForm.supplier}
                    onChange={(e) => setNewItemForm({ ...newItemForm, supplier: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Storage Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Reagent Refrigerator 2-8°C / Bench Shelf 3"
                    value={newItemForm.storageLocation}
                    onChange={(e) =>
                      setNewItemForm({ ...newItemForm, storageLocation: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-none cursor-pointer"
                >
                  Receive Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ISSUE STOCK                                                       */}
      {/* ========================================================================= */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 shadow-2xl w-full max-w-md rounded-none overflow-hidden">
            <div className="px-5 py-3.5 bg-blue-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Issue Stock to Bench</h3>
              <button
                onClick={() => setShowIssueModal(null)}
                className="text-gray-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleIssueStock} className="p-5 space-y-3.5 text-xs">
              <div className="bg-slate-50 p-3 border border-gray-200">
                <div className="font-bold text-gray-900">{showIssueModal.name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Batch: {showIssueModal.batchNumber} · Available:{" "}
                  <strong className="text-gray-900">
                    {showIssueModal.quantity} {showIssueModal.unit}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Issue Quantity ({showIssueModal.unit}) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={showIssueModal.quantity}
                  required
                  value={issueForm.quantity}
                  onChange={(e) => setIssueForm({ ...issueForm, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Destination Bench / Section *
                </label>
                <select
                  value={issueForm.bench}
                  onChange={(e) => setIssueForm({ ...issueForm, bench: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs bg-white"
                >
                  <option value="Hematology Bench">Hematology Bench</option>
                  <option value="Biochemistry Analyzer">Biochemistry Analyzer</option>
                  <option value="Microbiology Section">Microbiology Section</option>
                  <option value="Phlebotomy Station">Phlebotomy Station</option>
                  <option value="Urinalysis & Clinical Path">Urinalysis &amp; Clinical Path</option>
                  <option value="Immunoassay & Thyroid Station">Immunoassay &amp; Thyroid Station</option>
                  <option value="Histopathology Lab">Histopathology Lab</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Remarks
                </label>
                <input
                  type="text"
                  value={issueForm.remarks}
                  onChange={(e) => setIssueForm({ ...issueForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(null)}
                  className="px-3.5 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-none"
                >
                  Confirm Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADJUST STOCK                                                     */}
      {/* ========================================================================= */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 shadow-2xl w-full max-w-md rounded-none overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Physical Count Adjustment</h3>
              <button
                onClick={() => setShowAdjustModal(null)}
                className="text-gray-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="p-5 space-y-3.5 text-xs">
              <div className="bg-slate-50 p-3 border border-gray-200">
                <div className="font-bold text-gray-900">{showAdjustModal.name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Current System Quantity:{" "}
                  <strong className="text-gray-900">
                    {showAdjustModal.quantity} {showAdjustModal.unit}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Corrected Physical Count ({showAdjustModal.unit}) *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustForm.newQuantity}
                  onChange={(e) =>
                    setAdjustForm({ ...adjustForm, newQuantity: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Reason for Adjustment *
                </label>
                <input
                  type="text"
                  required
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(null)}
                  className="px-3.5 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-none"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: RETURN STOCK                                                     */}
      {/* ========================================================================= */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 shadow-2xl w-full max-w-md rounded-none overflow-hidden">
            <div className="px-5 py-3.5 bg-amber-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Return Stock to Supplier</h3>
              <button
                onClick={() => setShowReturnModal(null)}
                className="text-gray-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleReturnStock} className="p-5 space-y-3.5 text-xs">
              <div className="bg-amber-50/50 p-3 border border-amber-200">
                <div className="font-bold text-gray-900">{showReturnModal.name}</div>
                <div className="text-[11px] text-gray-600 mt-0.5">
                  Vendor: {showReturnModal.supplier} · Available: {showReturnModal.quantity}{" "}
                  {showReturnModal.unit}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Quantity to Return ({showReturnModal.unit}) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={showReturnModal.quantity}
                  required
                  value={returnForm.quantity}
                  onChange={(e) =>
                    setReturnForm({ ...returnForm, quantity: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Reason for Return *
                </label>
                <input
                  type="text"
                  required
                  value={returnForm.remarks}
                  onChange={(e) => setReturnForm({ ...returnForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(null)}
                  className="px-3.5 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-none"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: MARK DAMAGED                                                     */}
      {/* ========================================================================= */}
      {showDamageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 shadow-2xl w-full max-w-md rounded-none overflow-hidden">
            <div className="px-5 py-3.5 bg-red-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Mark Damaged Consumable</h3>
              <button
                onClick={() => setShowDamageModal(null)}
                className="text-gray-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleMarkDamaged} className="p-5 space-y-3.5 text-xs">
              <div className="bg-red-50/50 p-3 border border-red-200">
                <div className="font-bold text-gray-900">{showDamageModal.name}</div>
                <div className="text-[11px] text-gray-600 mt-0.5">
                  Batch: {showDamageModal.batchNumber} · Available: {showDamageModal.quantity}{" "}
                  {showDamageModal.unit}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Damaged Quantity ({showDamageModal.unit}) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={showDamageModal.quantity}
                  required
                  value={damageForm.quantity}
                  onChange={(e) =>
                    setDamageForm({ ...damageForm, quantity: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Damage Notes / Incident Description *
                </label>
                <input
                  type="text"
                  required
                  value={damageForm.remarks}
                  onChange={(e) => setDamageForm({ ...damageForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDamageModal(null)}
                  className="px-3.5 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded-none"
                >
                  Record Damage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: REGISTER SUPPLIER                                                */}
      {/* ========================================================================= */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 shadow-2xl w-full max-w-md rounded-none overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Register Diagnostic Vendor</h3>
              <button
                onClick={() => setShowSupplierModal(false)}
                className="text-gray-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddSupplier} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Supplier / Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sysmex India / Beckman Coulter"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Vendor Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. SUP-SYS"
                  value={supplierForm.code}
                  onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Contact Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. +91 98200 11223"
                  value={supplierForm.contact}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. orders@diagnosticvendor.com"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-none focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-3.5 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-none"
                >
                  Register Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

