import { usePharmacyData } from "../data/usePharmacyData"
import { useState, useEffect, useMemo } from "react"
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ArrowUpRight,
  Package,
  Layers,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ShoppingCart,
  ArrowRightLeft,
  X,
} from "lucide-react"
import PageHeader from "../components/PageHeader"

const typeColors: Record<string, { color: string; bg: string }> = {
  Sale: { color: "#0F766E", bg: "#E8EDF5" },
  Purchase: { color: "#15803d", bg: "#DCFCE7" },
  Return: { color: "#7c3aed", bg: "#faf5ff" },
  Transfer: { color: "#0284c7", bg: "#E8EDF5" },
  Adjustment: { color: "#d97706", bg: "#FEF3C7" },
  Damage: { color: "#dc2626", bg: "#FEE2E2" },
  Expiry: { color: "#B91C1C", bg: "#FEE2E2" },
  "Write-Off": { color: "#be123c", bg: "#ffe4e6" },
}

interface InventoryLedgerProps {
  onNavigate: (page: string) => void
}

export default function InventoryLedger({ onNavigate }: InventoryLedgerProps) {
  const { stockTransactions, medicines, batches, bills, refresh } = usePharmacyData()
  const [activeTab, setActiveTab] = useState<"inventory" | "ledger">("inventory")

  // Filter states for Ledger
  const [ledgerSearch, setLedgerSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("All")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  // Filter states for Stock Inventory
  const [stockSearch, setStockSearch] = useState("")
  const [stockStatusFilter, setStockStatusFilter] = useState<"All" | "InStock" | "LowStock" | "OutOfStock">("All")
  const [formFilter, setFormFilter] = useState("All")

  // Memoized movement ledger with O(1) indexed lookups
  const ledgerData = useMemo(() => {
    const medMap = new Map(medicines.map((m) => [m.id, m]))
    const batchMap = new Map()
    batches.forEach((b) => {
      batchMap.set(b.id, b)
      batchMap.set(b.batchNumber, b)
    })

    const list: any[] = []
    const handledBatches = new Set<string>()
    const handledBills = new Set<string>()

    stockTransactions.forEach((tx) => {
      handledBatches.add(tx.batchId)
      if (tx.billId) handledBills.add(tx.billId)

      const med = medMap.get(tx.medicineId)
      let typeName: string = tx.transactionType
      if (typeName === "PURCHASE_RECEIVED") typeName = "Purchase"
      if (typeName === "DISPENSED") typeName = "Sale"
      if (typeName === "RETURNED") typeName = "Return"
      if (typeName === "WRITE_OFF") typeName = "Write-Off"
      if (typeName === "SUPPLIER_RETURN") typeName = "Return"

      const isIn =
        ["PURCHASE_RECEIVED", "RETURNED", "TRANSFER_IN", "ADJUSTMENT"].includes(
          tx.transactionType,
        ) &&
        (tx.transactionType !== "ADJUSTMENT" || tx.quantity > 0)
      const isOut =
        ["DISPENSED", "EXPIRED", "DAMAGED", "TRANSFER_OUT", "WRITE_OFF", "SUPPLIER_RETURN"].includes(
          tx.transactionType,
        ) ||
        (tx.transactionType === "ADJUSTMENT" && tx.quantity < 0)

      const targetBatch = batchMap.get(tx.batchId)
      const batchDisplay = targetBatch ? targetBatch.batchNumber : tx.batchId

      list.push({
        date: new Date(tx.date).toLocaleString(),
        ref:
          tx.billId || tx.reason?.split(":")[1]?.trim() || tx.id.substring(0, 8),
        medicine: med ? med.name : (targetBatch?.medicineId ? (medMap.get(targetBatch.medicineId)?.name || "Medicine") : "Medicine"),
        batch: batchDisplay,
        type: typeName,
        in: isIn ? Math.abs(tx.quantity) : 0,
        out: isOut ? Math.abs(tx.quantity) : 0,
        user: tx.userId || "Pharmacist",
      })
    })

    // Ensure all stocked batches have their initial GRN / Opening Stock logged
    batches.forEach((b) => {
      if (handledBatches.has(b.id) || handledBatches.has(b.batchNumber)) return
      handledBatches.add(b.id)
      handledBatches.add(b.batchNumber)

      const med = medMap.get(b.medicineId)
      list.push({
        date: new Date(b.createdAt || new Date()).toLocaleString(),
        ref: b.grnId || "INIT_STOCK",
        medicine: med ? med.name : "Medicine",
        batch: b.batchNumber,
        type: "Purchase",
        in: b.quantity || b.availableQuantity || 0,
        out: 0,
        user: "Pharmacist",
      })
    })

    // Synthesize legacy data for bills that have no transaction
    bills.forEach((bill) => {
      if (bill.isModifiedReturnBill || bill.billNumber?.startsWith("MOD-")) return
      if (!handledBills.has(bill.id) && !handledBills.has(bill.billNumber)) {
        bill.items.forEach((item) => {
          list.push({
            date: new Date(bill.createdAt).toLocaleString(),
            ref: bill.billNumber || bill.id,
            medicine: item.medicineName,
            batch: item.batchNumber,
            type: "Sale",
            in: 0,
            out: item.quantity,
            user: bill.pharmacistId || bill.createdBy || "Pharmacist",
          })
        })
      }
    })

    // Sort by date descending
    return list.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
  }, [stockTransactions, medicines, batches, bills])

  const types = [
    "All",
    "Sale",
    "Purchase",
    "Return",
    "Transfer",
    "Adjustment",
    "Expiry",
    "Write-Off",
  ]

  const filteredLedger = ledgerData.filter((r) => {
    const matchSearch =
      !ledgerSearch ||
      r.medicine.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      r.ref.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      r.batch.toLowerCase().includes(ledgerSearch.toLowerCase())
    const matchType = typeFilter === "All" || r.type === typeFilter

    const rDate = new Date(r.date)
    const matchFrom = !fromDate || rDate >= new Date(fromDate)
    const matchTo = !toDate || rDate <= new Date(toDate + "T23:59:59")

    return matchSearch && matchType && matchFrom && matchTo
  })

  // Filtered Stock Inventory List
  const filteredStock = useMemo(() => {
    return medicines.filter((m) => {
      const q = stockSearch.toLowerCase()
      const matchSearch =
        !stockSearch ||
        m.name?.toLowerCase().includes(q) ||
        m.generic?.toLowerCase().includes(q) ||
        (m as any).supplierName?.toLowerCase().includes(q) ||
        m.manufacturer?.toLowerCase().includes(q) ||
        m.mnfCode?.toLowerCase().includes(q) ||
        m.hsnCode?.toLowerCase().includes(q) ||
        m.batchNumber?.toLowerCase().includes(q)

      const stockVal = m.stock || 0
      let matchStatus = true
      if (stockStatusFilter === "InStock") matchStatus = stockVal > (m.reorderLevel || 10)
      if (stockStatusFilter === "LowStock") matchStatus = stockVal > 0 && stockVal <= (m.reorderLevel || 10)
      if (stockStatusFilter === "OutOfStock") matchStatus = stockVal === 0

      const formVal = (m.form || "").toLowerCase()
      const matchForm = formFilter === "All" || formVal.includes(formFilter.toLowerCase())

      return matchSearch && matchStatus && matchForm
    })
  }, [medicines, stockSearch, stockStatusFilter, formFilter])

  // Summary Metrics
  const totalIn = ledgerData
    .filter((r) => r.type === "Purchase")
    .reduce((sum, r) => sum + r.in, 0)
  const totalOut = ledgerData
    .filter((r) => r.type === "Sale")
    .reduce((sum, r) => sum + r.out, 0)
  const currentStockOnHand = batches.reduce(
    (sum, b) => sum + (b.availableQuantity ?? b.quantity ?? 0),
    0,
  )
  const fallbackMedStock = medicines.reduce((sum, m) => sum + (m.stock || 0), 0)
  const liveStockTotal = Math.max(currentStockOnHand, fallbackMedStock)

  const totalInventoryValuation = medicines.reduce((sum, m) => {
    const rate = (m as any).purchasePrice || ((m.mrp || 0) * 0.7)
    return sum + (m.stock || 0) * rate
  }, 0)

  const inStockCount = medicines.filter((m) => (m.stock || 0) > (m.reorderLevel || 10)).length
  const lowStockCount = medicines.filter((m) => (m.stock || 0) > 0 && (m.stock || 0) <= (m.reorderLevel || 10)).length
  const outOfStockCount = medicines.filter((m) => (m.stock || 0) === 0).length

  const handleExportLedger = () => {
    if (filteredLedger.length === 0) return alert("No ledger data to export.")
    const headers = [
      "Date & Time",
      "Reference",
      "Medicine",
      "Batch",
      "Type",
      "IN",
      "OUT",
      "User",
    ]
    const rows = [headers.join(",")]
    filteredLedger.forEach((r) => {
      rows.push(
        `"${r.date}","${r.ref}","${r.medicine}","${r.batch}","${r.type}",${r.in},${r.out},"${r.user}"`,
      )
    })
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `inventory_movement_ledger_${Date.now()}.csv`
    a.click()
  }

  const handleExportStock = () => {
    if (filteredStock.length === 0) return alert("No inventory data to export.")
    const headers = [
      "Product Name",
      "Generic",
      "Formulation",
      "Pack",
      "Mfr",
      "Supplier",
      "Stock (Units)",
      "Batch",
      "Expiry",
      "MRP",
      "Purchase Rate",
      "Status",
    ]
    const rows = [headers.join(",")]
    filteredStock.forEach((m: any) => {
      const st = m.stock === 0 ? "Out of Stock" : m.stock <= (m.reorderLevel || 10) ? "Low Stock" : "In Stock"
      rows.push(
        `"${m.name}","${m.generic || ""}","${m.form || ""}","${m.packing || ""}","${m.mnfCode || ""}","${m.supplierName || ""}","${m.stock || 0}","${m.batchNumber || ""}","${m.expiryDate || ""}","${m.mrp || 0}","${m.purchasePrice || 0}","${st}"`,
      )
    })
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `current_inventory_stock_${Date.now()}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Stock & Inventory" },
          { label: "Inventory Ledger" },
        ]}
        title="Pharmacy Inventory & Stock Movement"
        description="Real-time on-hand inventory levels and chronological stock movement passbook"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate("medicines")}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-[#E2E8F0] bg-white text-[13px] font-medium text-[#0F766E] hover:bg-teal-50 transition-colors"
            >
              <Plus size={14} /> Add Medicine
            </button>
            <button
              onClick={activeTab === "inventory" ? handleExportStock : handleExportLedger}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-[#E2E8F0] bg-white text-[13px] text-[#334155] hover:bg-[#F5F7FA] transition-colors"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        }
        onNavigate={onNavigate}
      />

      {/* Primary View Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all ${
              activeTab === "inventory"
                ? "bg-[#0F766E] text-white shadow-sm"
                : "bg-white text-[#64748B] hover:text-[#0F1624] border border-[#E2E8F0]"
            }`}
          >
            <Package size={15} />
            <span>Current Stock Inventory ({medicines.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("ledger")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all ${
              activeTab === "ledger"
                ? "bg-[#0F766E] text-white shadow-sm"
                : "bg-white text-[#64748B] hover:text-[#0F1624] border border-[#E2E8F0]"
            }`}
          >
            <Layers size={15} />
            <span>Stock Movement Ledger ({ledgerData.length})</span>
          </button>
        </div>

        <div className="text-[12px] text-[#64748B] font-medium">
          Live sync: <span className="text-emerald-600 font-bold">● Active Real-Time</span>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Stock On Hand */}
        <div
          onClick={() => setActiveTab("inventory")}
          className="bg-white rounded-xl shadow-sm p-4 border border-[#CBD5E1] hover:border-[#0F766E] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[#0F766E] font-bold uppercase tracking-wide">
              Total Stock Units
            </p>
            <span className="text-[10px] font-bold text-[#0F766E] bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              {medicines.length} Medicines
            </span>
          </div>
          <p className="text-[22px] font-black mt-2 text-[#0F766E]">
            {liveStockTotal.toLocaleString("en-IN")}{" "}
            <span className="text-[12px] font-semibold text-[#64748B]">units</span>
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">Live physical units in dispensary</p>
        </div>

        {/* Card 2: Inventory Valuation */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-[#E2E8F0]">
          <p className="text-[11px] text-[#0369A1] font-bold uppercase tracking-wide">
            Inventory Valuation (Cost)
          </p>
          <p className="text-[22px] font-black mt-2 text-[#0369A1]">
            ₹{totalInventoryValuation.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">Acquisition cost of active stock</p>
        </div>

        {/* Card 3: In Stock / Healthy */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[#15803D] font-bold uppercase tracking-wide">
              Stock Status
            </p>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {inStockCount} Healthy
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div>
              <span className="text-[16px] font-black text-amber-600">{lowStockCount}</span>
              <span className="text-[11px] text-[#64748B] ml-1">Low</span>
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <div>
              <span className="text-[16px] font-black text-red-600">{outOfStockCount}</span>
              <span className="text-[11px] text-[#64748B] ml-1">Out</span>
            </div>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Items below reorder threshold</p>
        </div>

        {/* Card 4: Total IN vs OUT */}
        <div
          onClick={() => setActiveTab("ledger")}
          className="bg-white rounded-xl shadow-sm p-4 border border-[#E2E8F0] hover:border-slate-400 cursor-pointer transition-all"
        >
          <p className="text-[11px] text-[#475569] font-bold uppercase tracking-wide">
            Lifetime Movement
          </p>
          <div className="flex items-center gap-3 mt-2">
            <div>
              <span className="text-[16px] font-black text-emerald-700">+{totalIn}</span>
              <span className="text-[11px] text-[#64748B] ml-1">IN</span>
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <div>
              <span className="text-[16px] font-black text-rose-700">-{totalOut}</span>
              <span className="text-[11px] text-[#64748B] ml-1">OUT</span>
            </div>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">Purchases vs Sales/Dispensed</p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: CURRENT STOCK INVENTORY (ALL MEDICINES IN HOSPITAL)      */}
      {/* ============================================================== */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 flex-1 max-w-sm">
              <Search size={14} className="text-[#94A3B8] flex-shrink-0" />
              <input
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search medicine name, generic, supplier, batch..."
                className="text-[13px] outline-none text-[#0F1624] placeholder:text-[#94A3B8] w-full"
              />
              {stockSearch && (
                <button onClick={() => setStockSearch("")}>
                  <X size={12} className="text-[#94A3B8]" />
                </button>
              )}
            </div>

            {/* Stock status filter buttons */}
            <div className="flex bg-white rounded-lg border border-[#E2E8F0] p-1 text-[12px]">
              {(["All", "InStock", "LowStock", "OutOfStock"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStockStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    stockStatusFilter === st
                      ? "bg-[#0F1624] text-white"
                      : "text-[#64748B] hover:text-[#0F1624]"
                  }`}
                >
                  {st === "All" && `All (${medicines.length})`}
                  {st === "InStock" && `In Stock (${inStockCount})`}
                  {st === "LowStock" && `Low Stock (${lowStockCount})`}
                  {st === "OutOfStock" && `Out of Stock (${outOfStockCount})`}
                </button>
              ))}
            </div>

            {/* Formulation filter */}
            <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-lg px-3 py-2">
              <Filter size={14} className="text-[#0F766E] flex-shrink-0" />
              <span className="text-[11px] font-bold text-[#64748B] uppercase">Type:</span>
              <select
                value={formFilter}
                onChange={(e) => setFormFilter(e.target.value)}
                className="text-[13px] text-[#0F1624] bg-transparent outline-none cursor-pointer font-medium"
              >
                <option value="All">All Formulations</option>
                <option value="Tablet">Tablets (TAB)</option>
                <option value="Capsule">Capsules (CAP)</option>
                <option value="Injection">Injections (INJ)</option>
                <option value="Syrup">Syrups & Liquids</option>
                <option value="Ointment">Ointments & Creams</option>
                <option value="Drops">Eye/Ear Drops</option>
                <option value="Infusion">IV Infusions</option>
              </select>
            </div>

            <div className="ml-auto text-[13px] text-[#64748B]">
              Showing <span className="font-bold text-[#0F1624]">{filteredStock.length}</span> of {medicines.length} medicines
            </div>
          </div>

          {/* Current Stock Inventory Table */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
                <tr>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-left">Product Name & Generic</th>
                  <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-left">Type & Pack</th>
                  <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-left">Mfr</th>
                  <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-left">Supplier</th>
                  <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-center">Batch & Exp</th>
                  <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Available Stock</th>
                  <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Rate</th>
                  <th className="py-3 px-3 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">M.R.P</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-center">Status</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredStock.map((m: any) => {
                  const stockVal = m.stock || 0
                  const isOut = stockVal === 0
                  const isLow = stockVal > 0 && stockVal <= (m.reorderLevel || 10)
                  const isHealthy = stockVal > (m.reorderLevel || 10)

                  return (
                    <tr key={m.id} className="hover:bg-[#F0FDFA] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-[13px] text-[#0F1624]">{m.name}</div>
                        <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 mt-0.5">
                          <span>{m.generic || "Generic formulation"}</span>
                          {m.hsnCode && (
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                              HSN: {m.hsnCode}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-bold text-[11px]">
                          {m.form || "TABLET"}
                        </span>
                        {m.packing && (
                          <div className="text-[11px] text-[#64748B] mt-0.5 font-medium">
                            {m.packing}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-[12px] text-[#0F766E]">
                        {m.mnfCode || (m.manufacturer ? m.manufacturer.substring(0, 4).toUpperCase() : "MANK")}
                      </td>

                      <td className="py-3 px-3 text-[12px] text-[#334155] whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-[11px]">
                          {m.supplierName || "—"}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="font-mono text-[11px] font-bold text-[#0F1624]">
                          {m.batchNumber || "—"}
                        </div>
                        <div className="text-[10px] text-[#64748B]">
                          {m.expiryDate ? `Exp: ${m.expiryDate}` : "—"}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className={`font-black text-[14px] ${isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-emerald-700"}`}>
                          {stockVal.toLocaleString("en-IN")}{" "}
                          <span className="text-[11px] font-normal text-[#64748B]">units</span>
                        </div>
                        <div className="text-[10px] text-[#94A3B8]">
                          Reorder: {m.reorderLevel || 10}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-semibold text-[13px] text-[#15803D]">
                        ₹{Number(m.purchasePrice || (m.mrp * 0.7)).toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-[13px] text-[#0F1624]">
                        ₹{Number(m.mrp || 0).toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isOut && (
                          <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                            Out of Stock
                          </span>
                        )}
                        {isLow && (
                          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                            Low Stock
                          </span>
                        )}
                        {isHealthy && (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                            In Stock
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setLedgerSearch(m.name)
                              setActiveTab("ledger")
                            }}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                            title="View all IN/OUT movements for this medicine"
                          >
                            Ledger
                          </button>
                          <button
                            onClick={() => onNavigate("dispensing")}
                            className="px-2.5 py-1 rounded bg-teal-50 hover:bg-teal-100 text-[#0F766E] text-[11px] font-semibold transition-colors flex items-center gap-1"
                            title="Open in Dispensing point of sale"
                          >
                            <ShoppingCart size={11} /> Sale
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredStock.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-[#64748B]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Package size={32} className="text-[#94A3B8]" />
                        <p className="font-bold text-[14px] text-[#0F1624]">No medicines found matching criteria.</p>
                        <p className="text-[12px] text-[#64748B]">Click "Add Medicine" to create new catalog entries.</p>
                        <button
                          onClick={() => onNavigate("medicines")}
                          className="mt-2 px-4 py-2 rounded-lg bg-[#0F766E] text-white font-bold text-[12px]"
                        >
                          Go to Medicine Master
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: MOVEMENT LEDGER (CHRONOLOGICAL PASSBOOK OF ALL TRANSACTIONS) */}
      {/* ============================================================== */}
      {activeTab === "ledger" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
              />
              <input
                placeholder="Search medicine, batch, or ref…"
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="pl-9 pr-4 py-2 w-64 rounded-lg border border-[#E2E8F0] text-[13px] focus:border-[#0F766E] focus:outline-none transition-colors bg-white"
              />
              {ledgerSearch && (
                <button
                  onClick={() => setLedgerSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X size={12} className="text-[#94A3B8]" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-lg border border-[#E2E8F0]">
              <span className="text-[11px] font-bold text-[#64748B] uppercase">Dates:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2 py-1 rounded text-[12px] text-[#0F1624] focus:outline-none"
              />
              <span className="text-[#94A3B8]">-</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2 py-1 rounded text-[12px] text-[#0F1624] focus:outline-none"
              />
              {(fromDate || toDate) && (
                <button
                  onClick={() => {
                    setFromDate("")
                    setToDate("")
                  }}
                  className="text-[11px] text-teal-700 underline font-semibold ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex bg-white rounded-lg border border-[#E2E8F0] p-1 flex-wrap">
              {types.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 rounded text-[12px] font-medium transition-colors ${
                    typeFilter === t
                      ? "bg-[#0F1624] text-white"
                      : "text-[#64748B] hover:text-[#0F1624]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="ml-auto text-[13px] text-[#64748B]">
              Showing <span className="font-bold text-[#0F1624]">{filteredLedger.length}</span> movements
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
                <tr>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-left">Date & Time</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-left">Reference</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-left">Medicine</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-center">Batch</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-center">Movement Type</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-emerald-700 uppercase tracking-wider text-right">IN (+)</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-rose-700 uppercase tracking-wider text-right">OUT (-)</th>
                  <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-center">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredLedger.map((r, i) => (
                  <tr className="hover:bg-[#F0FDFA] transition-colors" key={i}>
                    <td className="py-3 px-4 text-[12px] text-[#64748B] whitespace-nowrap">
                      {r.date}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] font-bold text-[#0F766E]">
                      {r.ref}
                    </td>
                    <td className="py-3 px-4 font-bold text-[13px] text-[#0F1624]">
                      {r.medicine}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#64748B] text-center">
                      {r.batch}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                        style={{
                          background: typeColors[r.type]?.bg,
                          color: typeColors[r.type]?.color,
                        }}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-[13px] font-bold text-emerald-700">
                      {r.in > 0 ? `+${r.in}` : "-"}
                    </td>
                    <td className="py-3 px-4 text-right text-[13px] font-bold text-rose-600">
                      {r.out > 0 ? `-${r.out}` : "-"}
                    </td>
                    <td className="py-3 px-4 text-[12px] text-[#64748B] text-center">
                      {r.user}
                    </td>
                  </tr>
                ))}
                {filteredLedger.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#64748B] text-[13px]">
                      No movement transactions found matching your filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
