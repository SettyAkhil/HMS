import React, { useState, useMemo, useEffect } from "react"
import {
  AlertTriangle,
  Search,
  CheckCircle2,
  FileText,
  Printer,
  History,
  PlusCircle,
  Package,
  Layers,
  Calendar,
  AlertOctagon,
  ArrowRight,
  RotateCcw,
  Info,
  ShieldAlert,
} from "lucide-react"
import PageHeader from "../components/PageHeader"
import WriteOffReceiptModal from "../components/WriteOffReceiptModal"
import { usePharmacyData } from "../data/usePharmacyData"
import { PharmacyDatabase, type AppMedicineWriteOff } from "../../../services/pharmacyDb"

interface MedicineWriteOffProps {
  onNavigate?: (page: string) => void
}

export default function MedicineWriteOff({ onNavigate }: MedicineWriteOffProps) {
  const { medicines, batches, writeOffs, refresh } = usePharmacyData()



  // Active Tab: "form" | "history"
  const [activeTab, setActiveTab] = useState<"form" | "history">("form")

  // Form State
  const [selectedMedicineId, setSelectedMedicineId] = useState<string>("")
  const [medicineSearch, setMedicineSearch] = useState<string>("")
  const [isMedicineDropdownOpen, setIsMedicineDropdownOpen] = useState(false)

  const [selectedBatchId, setSelectedBatchId] = useState<string>("")
  const [quantityInput, setQuantityInput] = useState<string>("")
  const [reasonInput, setReasonInput] = useState<string>("")

  // Form Feedback
  const [formError, setFormError] = useState<string>("")

  // Confirmation Modal State
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<AppMedicineWriteOff | null>(null)

  // History Search & Filter State
  const [historySearch, setHistorySearch] = useState<string>("")
  const [historyFromDate, setHistoryFromDate] = useState<string>("")
  const [historyToDate, setHistoryToDate] = useState<string>("")

  // Selected Medicine Object
  const selectedMedicine = useMemo(() => {
    return medicines.find((m) => m.id === selectedMedicineId) || null
  }, [medicines, selectedMedicineId])

  // Filtered Batches for the Selected Medicine with stock
  const medicineBatches = useMemo(() => {
    if (!selectedMedicineId) return []
    return batches.filter(
      (b) => b.medicineId === selectedMedicineId && (b.availableQuantity ?? 0) >= 0,
    )
  }, [batches, selectedMedicineId])

  // Selected Batch Object
  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || null
  }, [batches, selectedBatchId])

  // Available Stock for the Selected Batch
  const availableStock = selectedBatch?.availableQuantity ?? 0

  // Quantity numeric
  const numericQuantity = parseFloat(quantityInput) || 0

  // Filtered medicines list for search dropdown
  const filteredMedicines = useMemo(() => {
    if (!medicineSearch.trim()) return medicines.slice(0, 30)
    const q = medicineSearch.toLowerCase()
    return medicines.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.generic?.toLowerCase().includes(q) ||
        m.sku?.toLowerCase().includes(q),
    ).slice(0, 50)
  }, [medicines, medicineSearch])

  // Validate form before opening confirmation
  const handleInitiateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")

    if (!selectedMedicineId) {
      setFormError("Please select a medicine from Pharmacy Inventory.")
      return
    }
    if (!selectedBatchId || !selectedBatch) {
      setFormError("Please select a valid batch.")
      return
    }
    if (!quantityInput || isNaN(numericQuantity) || numericQuantity <= 0) {
      setFormError("Write-off quantity must be greater than zero.")
      return
    }
    if (numericQuantity > availableStock) {
      setFormError(
        `Quantity cannot exceed available stock (${availableStock} ${selectedMedicine?.form || "units"}).`,
      )
      return
    }
    if (!reasonInput.trim()) {
      setFormError("Reason for write-off is mandatory. Please enter a reason.")
      return
    }

    setIsConfirmOpen(true)
  }

  // Execute Write-Off
  const handleConfirmWriteOff = async () => {
    setIsSubmitting(true)
    setFormError("")
    try {
      const result = PharmacyDatabase.executeMedicineWriteOff(
        {
          medicineId: selectedMedicineId,
          batchId: selectedBatchId,
          quantity: numericQuantity,
          reason: reasonInput.trim(),
        },
        "Pharmacist",
      )

      if (result && result.success) {
        setIsConfirmOpen(false)
        // Reset form
        setSelectedMedicineId("")
        setSelectedBatchId("")
        setMedicineSearch("")
        setQuantityInput("")
        setReasonInput("")
        refresh()

        // Display generated receipt
        setActiveReceipt(result.writeOff)
      } else {
        throw new Error("Failed to process medicine write-off.")
      }
    } catch (err: any) {
      setFormError(err?.message || "An unexpected error occurred during write-off.")
      setIsConfirmOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtered History
  const filteredHistory = useMemo(() => {
    return (writeOffs || []).filter((w) => {
      const matchSearch =
        !historySearch ||
        w.receiptNumber.toLowerCase().includes(historySearch.toLowerCase()) ||
        w.medicineName.toLowerCase().includes(historySearch.toLowerCase()) ||
        w.batchNumber.toLowerCase().includes(historySearch.toLowerCase()) ||
        w.reason.toLowerCase().includes(historySearch.toLowerCase())

      const wDate = (w.date || w.createdAt || "").split("T")[0]
      const matchFrom = !historyFromDate || wDate >= historyFromDate
      const matchTo = !historyToDate || wDate <= historyToDate

      return matchSearch && matchFrom && matchTo
    })
  }, [writeOffs, historySearch, historyFromDate, historyToDate])

  // Summary Metrics for History
  const totalWrittenOffUnits = useMemo(() => {
    return (writeOffs || []).reduce((sum, w) => sum + (w.quantity || 0), 0)
  }, [writeOffs])

  const totalLossValue = useMemo(() => {
    return (writeOffs || []).reduce((sum, w) => sum + (w.totalLossValue || 0), 0)
  }, [writeOffs])

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Inventory" },
          { label: "Medicine Write-Off" },
        ]}
        title="Medicine Write-Off / Non-Saleable Stock"
        description="Permanently deduct expired, damaged, broken, or contaminated stock from inventory with audit tracking and printable receipts."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("form")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === "form"
                  ? "bg-[#0F766E] text-white shadow-sm"
                  : "bg-white border border-[#E2E8F0] text-[#475569] hover:bg-gray-50"
              }`}
            >
              <PlusCircle size={14} /> New Write-Off
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === "history"
                  ? "bg-[#0F766E] text-white shadow-sm"
                  : "bg-white border border-[#E2E8F0] text-[#475569] hover:bg-gray-50"
              }`}
            >
              <History size={14} /> Write-Off History ({(writeOffs || []).length})
            </button>
          </div>
        }
        onNavigate={onNavigate}
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
              Total Write-Off Units
            </span>
            <div className="w-7 h-7 rounded bg-red-50 text-red-600 flex items-center justify-center">
              <Package size={15} />
            </div>
          </div>
          <p className="text-[22px] font-extrabold text-[#0F1624] mt-2">
            {totalWrittenOffUnits.toLocaleString("en-IN")} units
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">
            Total quantity deducted across all batches.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
              Total Loss Valuation
            </span>
            <div className="w-7 h-7 rounded bg-rose-50 text-rose-700 flex items-center justify-center">
              <ShieldAlert size={15} />
            </div>
          </div>
          <p className="text-[22px] font-extrabold text-rose-700 mt-2">
            ₹{totalLossValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">
            Calculated at batch procurement cost.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
              Recorded Write-Offs
            </span>
            <div className="w-7 h-7 rounded bg-teal-50 text-[#0F766E] flex items-center justify-center">
              <FileText size={15} />
            </div>
          </div>
          <p className="text-[22px] font-extrabold text-[#0F1624] mt-2">
            {(writeOffs || []).length}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">
            Official write-off transaction receipts generated.
          </p>
        </div>
      </div>

      {/* Main Tab Views */}
      {activeTab === "form" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Form */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6 space-y-6">
            <div className="border-b border-[#F1F5F9] pb-4">
              <h2 className="text-base font-bold text-[#0F1624] flex items-center gap-2">
                <AlertOctagon size={18} className="text-rose-600" />
                Submit Medicine Stock Write-Off
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Deduct damaged, expired, or non-saleable medicines directly from specific batch inventory.
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleInitiateSubmit} className="space-y-5">
              {/* 1. Medicine Selector with Live Search */}
              <div className="space-y-1.5 relative">
                <label className="text-xs font-bold text-[#334155] flex items-center justify-between">
                  <span>Medicine Name *</span>
                  <span className="text-[11px] text-[#64748B] font-normal">
                    Search from Pharmacy Master
                  </span>
                </label>
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                  />
                  <input
                    type="text"
                    value={
                      isMedicineDropdownOpen
                        ? medicineSearch
                        : selectedMedicine
                          ? `${selectedMedicine.name} (${selectedMedicine.generic || "N/A"})`
                          : medicineSearch
                    }
                    onChange={(e) => {
                      setMedicineSearch(e.target.value)
                      setIsMedicineDropdownOpen(true)
                    }}
                    onFocus={() => {
                      setIsMedicineDropdownOpen(true)
                      setMedicineSearch("")
                    }}
                    placeholder="Search medicine by name, generic, or SKU..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[#CBD5E1] text-xs text-[#0F1624] focus:outline-none focus:border-[#0F766E] transition-colors"
                  />
                  {selectedMedicine && !isMedicineDropdownOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMedicineId("")
                        setSelectedBatchId("")
                        setMedicineSearch("")
                        setIsMedicineDropdownOpen(true)
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#64748B] hover:text-red-600"
                    >
                      Change
                    </button>
                  )}
                </div>

                {/* Dropdown Options */}
                {isMedicineDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-[#CBD5E1] max-h-56 overflow-y-auto z-30 divide-y divide-[#F1F5F9]">
                    {filteredMedicines.length > 0 ? (
                      filteredMedicines.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => {
                            setSelectedMedicineId(m.id)
                            setSelectedBatchId("")
                            setIsMedicineDropdownOpen(false)
                            setMedicineSearch("")
                          }}
                          className="p-2.5 px-3 hover:bg-[#F0FDFA] cursor-pointer text-xs transition-colors flex justify-between items-center"
                        >
                          <div>
                            <span className="font-bold text-[#0F1624]">{m.name}</span>
                            <span className="text-[#64748B] block text-[11px]">
                              {m.generic} · Form: {m.form || "Unit"}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-[#0F766E] text-[11px] block">
                              Stock: {m.stock}
                            </span>
                            <span className="text-[10px] text-[#94A3B8]">
                              MRP: ₹{(m.mrp || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-xs text-[#94A3B8]">
                        No medicines matched your query.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Batch Number Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#334155] flex items-center justify-between">
                    <span>Batch Number *</span>
                    <span className="text-[11px] text-[#64748B] font-normal">
                      {medicineBatches.length} batch(es) in stock
                    </span>
                  </label>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    disabled={!selectedMedicineId}
                    className="w-full px-3 py-2.5 rounded-lg border border-[#CBD5E1] text-xs text-[#0F1624] bg-white focus:outline-none focus:border-[#0F766E] disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">-- Select Specific Batch --</option>
                    {medicineBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} (Stock: {b.availableQuantity} | Exp:{" "}
                        {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString("en-IN") : "N/A"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Available Stock Display */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#334155]">
                    Available Stock for Selected Batch
                  </label>
                  <div className="px-3 py-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
                    <span className="text-xs text-[#64748B]">Batch Stock:</span>
                    <span
                      className={`text-sm font-extrabold ${
                        availableStock > 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {availableStock} {selectedMedicine?.form || "units"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Write-Off Quantity */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#334155] flex items-center justify-between">
                  <span>Write-Off Quantity *</span>
                  {selectedBatch && (
                    <span className="text-[11px] text-teal-700 font-semibold">
                      Max deductible: {availableStock}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="1"
                  max={availableStock || undefined}
                  step="1"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  placeholder="Enter exact quantity to write off..."
                  className="w-full px-3 py-2.5 rounded-lg border border-[#CBD5E1] text-xs text-[#0F1624] focus:outline-none focus:border-[#0F766E]"
                />
              </div>

              {/* 5. Reason: Strictly Manually Typed Text Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#334155] flex items-center justify-between">
                  <span>Reason for Write-Off *</span>
                  <span className="text-[11px] text-[#64748B] font-normal">
                    Manually typed text (e.g. Broken vial during handling, chemical leak, past expiry)
                  </span>
                </label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Type specific write-off reason here..."
                  className="w-full px-3 py-2.5 rounded-lg border border-[#CBD5E1] text-xs text-[#0F1624] focus:outline-none focus:border-[#0F766E]"
                />
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {[
                    "Broken vial / ampoule",
                    "Seal damaged / contaminated",
                    "Cold chain / fridge failure",
                    "Expired non-returnable",
                    "Spillage / dropped by staff",
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReasonInput(r)}
                      className="text-[10px] px-2 py-0.5 rounded bg-gray-100 hover:bg-teal-50 text-gray-700 hover:text-[#0F766E] border border-gray-200 transition-colors"
                    >
                      + {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={!selectedMedicineId || !selectedBatchId || !quantityInput || !reasonInput.trim()}
                  className="bg-[#0F766E] hover:bg-[#0d635c] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
                >
                  <AlertOctagon size={15} /> Submit Write-Off & Generate Receipt
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live Summary & Safety Information */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 space-y-4">
              <h3 className="text-xs font-bold text-[#0F1624] uppercase tracking-wider flex items-center gap-1.5">
                <Info size={14} className="text-[#0F766E]" />
                Transaction Summary
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span className="text-[#64748B]">Selected Medicine:</span>
                  <span className="font-semibold text-[#0F1624] text-right">
                    {selectedMedicine ? selectedMedicine.name : "None"}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span className="text-[#64748B]">Batch:</span>
                  <span className="font-mono font-semibold text-[#0F1624]">
                    {selectedBatch ? selectedBatch.batchNumber : "None"}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span className="text-[#64748B]">Expiry Date:</span>
                  <span className="font-semibold text-[#0F1624]">
                    {selectedBatch?.expiryDate
                      ? new Date(selectedBatch.expiryDate).toLocaleDateString("en-IN")
                      : "N/A"}
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span className="text-[#64748B]">Stock Before:</span>
                  <span className="font-semibold text-[#0F1624]">
                    {availableStock} units
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span className="text-[#64748B]">Deducting:</span>
                  <span className="font-bold text-red-600">
                    -{numericQuantity || 0} units
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span className="text-[#64748B]">Remaining Stock:</span>
                  <span className="font-bold text-emerald-700">
                    {Math.max(0, availableStock - numericQuantity)} units
                  </span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span className="text-[#64748B]">Est. Unit Cost:</span>
                  <span className="font-mono text-[#0F1624]">
                    ₹{(selectedBatch?.purchasePrice || 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between py-2 bg-rose-50 px-3 rounded-lg border border-rose-100">
                  <span className="font-bold text-rose-800">Total Loss Value:</span>
                  <span className="font-extrabold text-rose-800 font-mono">
                    ₹{((selectedBatch?.purchasePrice || 0) * numericQuantity).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#F8FAFC] rounded-xl border border-[#CBD5E1] p-4 space-y-2 text-xs text-[#475569]">
              <div className="flex items-center gap-1.5 font-bold text-[#0F1624]">
                <ShieldAlert size={14} className="text-teal-700" />
                Inventory Accounting & Audit Guarantee
              </div>
              <p className="text-[11px] leading-relaxed">
                Stock deduction is atomic and cannot be undone without authorization.
                Submitting this form deducts the stock from the inventory database, records a movement of type <code className="bg-white px-1 py-0.5 rounded border border-[#E2E8F0] font-bold text-[#0F766E]">WRITE_OFF</code> in the ledger, and enters an audit log entry.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-base font-bold text-[#0F1624]">
                Medicine Write-Off History & Receipts
              </h2>
              <p className="text-xs text-[#64748B]">
                View all historical stock write-offs and reprint official disposal receipts.
              </p>
            </div>

            {/* History Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                />
                <input
                  type="text"
                  placeholder="Search receipt, medicine, batch, reason..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#0F1624] w-64 focus:outline-none focus:border-[#0F766E]"
                />
              </div>

              <input
                type="date"
                value={historyFromDate}
                onChange={(e) => setHistoryFromDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#475569] focus:outline-none focus:border-[#0F766E]"
              />
              <span className="text-[#94A3B8] text-xs">to</span>
              <input
                type="date"
                value={historyToDate}
                onChange={(e) => setHistoryToDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#475569] focus:outline-none focus:border-[#0F766E]"
              />

              {(historySearch || historyFromDate || historyToDate) && (
                <button
                  onClick={() => {
                    setHistorySearch("")
                    setHistoryFromDate("")
                    setHistoryToDate("")
                  }}
                  className="p-1.5 text-xs text-[#64748B] hover:text-[#0F1624] flex items-center gap-1"
                >
                  <RotateCcw size={12} /> Reset
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="border border-[#CBD5E1] rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#ECFDF5] border-b border-[#A7F3D0] text-[#065F46]">
                <tr>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Receipt No</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Date & Time</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Medicine</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Batch</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-center">Qty</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-center">Stock (Prev/Rem)</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-right">Loss Value</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Reason</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Staff</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredHistory.length > 0 ? (
                  filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F0FDFA] transition-colors">
                      <td className="p-3 font-bold text-[#0F766E] font-mono whitespace-nowrap">
                        {item.receiptNumber}
                      </td>
                      <td className="p-3 text-[#64748B] whitespace-nowrap">
                        {new Date(item.date || item.createdAt).toLocaleDateString("en-IN")}{" "}
                        <span className="text-[10px] text-[#94A3B8]">
                          {new Date(item.date || item.createdAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-[#0F1624]">
                        {item.medicineName}
                        {item.genericName && (
                          <span className="block text-[10px] text-[#94A3B8]">
                            {item.genericName}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[#475569]">{item.batchNumber}</td>
                      <td className="p-3 text-center font-bold text-red-600">
                        -{item.quantity} {item.unitOfMeasure}
                      </td>
                      <td className="p-3 text-center text-[#475569]">
                        {item.previousStock} →{" "}
                        <span className="font-semibold text-emerald-700">
                          {item.remainingStock}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-700">
                        ₹{(item.totalLossValue || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-3 text-[#334155] max-w-xs truncate" title={item.reason}>
                        {item.reason}
                      </td>
                      <td className="p-3 text-[#64748B] whitespace-nowrap">{item.writtenOffBy}</td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => setActiveReceipt(item)}
                          className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-[#0F766E] font-bold rounded text-[11px] inline-flex items-center gap-1 transition-colors border border-teal-200"
                        >
                          <Printer size={12} /> Receipt
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-[#94A3B8]">
                      No write-off transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isConfirmOpen && selectedMedicine && selectedBatch && (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertOctagon size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F1624]">
                  Confirm Medicine Write-Off
                </h3>
                <p className="text-xs text-[#64748B]">
                  This operation permanently removes stock from the inventory database.
                </p>
              </div>
            </div>

            <div className="bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0] space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Medicine:</span>
                <span className="font-bold text-[#0F1624]">{selectedMedicine.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Batch:</span>
                <span className="font-mono font-semibold text-[#0F1624]">
                  {selectedBatch.batchNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Write-Off Qty:</span>
                <span className="font-extrabold text-red-600">
                  {numericQuantity} {selectedMedicine.form || "units"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Stock Reduction:</span>
                <span className="font-medium text-[#0F1624]">
                  {availableStock} → {availableStock - numericQuantity} units
                </span>
              </div>
              <div className="flex justify-between border-t border-[#CBD5E1] pt-1.5">
                <span className="text-[#64748B]">Loss Valuation:</span>
                <span className="font-mono font-bold text-rose-700">
                  ₹{((selectedBatch.purchasePrice || 0) * numericQuantity).toFixed(2)}
                </span>
              </div>
              <div className="border-t border-[#CBD5E1] pt-1.5">
                <span className="text-[#64748B] block mb-0.5">Reason:</span>
                <p className="font-semibold text-[#0F1624] bg-white p-2 rounded border border-[#E2E8F0]">
                  {reasonInput.trim()}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 border border-[#CBD5E1] text-[#334155] rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWriteOff}
                disabled={isSubmitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
              >
                {isSubmitting ? "Processing..." : "Confirm & Deduct Stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {activeReceipt && (
        <WriteOffReceiptModal
          writeOff={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  )
}
