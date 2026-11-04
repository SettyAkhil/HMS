import { usePharmacyData } from "../data/usePharmacyData"
import { PharmacyDatabase, type AppSupplierReturn } from "../../../services/pharmacyDb"
import { useState, useMemo, useRef, useEffect } from "react"
import {
  Search,
  X,
  Plus,
  Printer,
  RefreshCw,
  Undo2,
  ArrowRight,
  CheckCircle2,
  FileText,
  Send,
  Building2,
  Package,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Check,
  Tag,
} from "lucide-react"
import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import SupplierInvoiceModal from "../components/SupplierInvoiceModal"
import SupplierReturnInvoiceModal from "../components/SupplierReturnInvoiceModal"
import toast from "react-hot-toast"

const RETURN_REASONS = [
  "Expired",
  "Near Expiry",
  "Damaged",
  "Manufacturer Recall",
  "Wrong Supply",
  "Quality Issue",
  "Excess Stock",
]

const STATUS_ORDER = [
  "Submitted (Stock Deducted)",
  "Supplier Picked Up",
  "Credit Note Pending",
  "Credit Received",
  "Closed",
]

interface UnifiedSupplier {
  id: string
  name: string
  source: "registered" | "medicine_master"
  phone?: string
  gstin?: string
  address?: string
  medicineCount: number
  batchCount: number
}

export default function SupplierReturns({
  onNavigate,
}: {
  onNavigate: (page: string) => void
}) {
  const { supplierReturns, suppliers, batches, medicines, refresh } =
    usePharmacyData()


  const [viewState, setViewState] = useState<"list" | "create" | "print">(
    "list",
  )

  // Search filter for table
  const [tableSearchQuery, setTableSearchQuery] = useState("")

  // Create Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState("")
  const [selectedSupplierName, setSelectedSupplierName] = useState("")
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("")
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false)
  const supplierDropdownRef = useRef<HTMLDivElement>(null)

  const [selectedMedicineId, setSelectedMedicineId] = useState("")
  const [selectedBatchId, setSelectedBatchId] = useState("")
  const [returnQuantity, setReturnQuantity] = useState("")
  const [returnReason, setReturnReason] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [grnNumber, setGrnNumber] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")

  // Print State
  const [printReturnId, setPrintReturnId] = useState("")
  const [selectedReturnForInvoice, setSelectedReturnForInvoice] = useState<AppSupplierReturn | null>(null)
  const [invoiceModalData, setInvoiceModalData] = useState<any | null>(null)

  // Credit Note Popup Modal State (replacing window.prompt)
  const [creditNoteModalData, setCreditNoteModalData] = useState<{
    returnId: string
    returnRecord?: any
  } | null>(null)
  const [creditNoteNumberInput, setCreditNoteNumberInput] = useState("")
  const [creditNoteDateInput, setCreditNoteDateInput] = useState("")
  const [creditNoteAmountInput, setCreditNoteAmountInput] = useState<number | string>("")
  const [creditNoteRemarksInput, setCreditNoteRemarksInput] = useState("")

  // Close supplier dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        supplierDropdownRef.current &&
        !supplierDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSupplierDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // 1. Unified Suppliers List: Merges Suppliers module + Medicine Master + Batches
  const unifiedSuppliers = useMemo<UnifiedSupplier[]>(() => {
    const map = new Map<string, UnifiedSupplier>()

    // Registered suppliers
    suppliers.forEach((s) => {
      const name = (s.supplierName || s.name || "").trim()
      if (!name) return
      const key = name.toLowerCase()
      map.set(key, {
        id: s.id,
        name: name,
        source: "registered",
        phone: s.phone || (s as any).contactPerson || "",
        gstin: s.gstInformation || s.gstin || "",
        address: s.address || "",
        medicineCount: 0,
        batchCount: 0,
      })
    })

    // Direct suppliers entered in Medicine Master
    medicines.forEach((m) => {
      const name = (m.supplierName || (m as any).supplier || "").trim()
      if (!name) return
      const key = name.toLowerCase()
      if (!map.has(key)) {
        map.set(key, {
          id: (m as any).supplierId || `adhoc_${name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`,
          name: name,
          source: "medicine_master",
          medicineCount: 0,
          batchCount: 0,
        })
      }
    })

    // Direct suppliers saved in Batches
    batches.forEach((b) => {
      const name = (b.supplierName || "").trim()
      if (!name) return
      const key = name.toLowerCase()
      if (!map.has(key)) {
        map.set(key, {
          id: b.supplierId || `adhoc_${name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`,
          name: name,
          source: "medicine_master",
          medicineCount: 0,
          batchCount: 0,
        })
      }
    })

    const list = Array.from(map.values())

    // Compute active medicines and batch counts with available stock
    list.forEach((sup) => {
      const supNameLower = sup.name.toLowerCase()
      const supBatches = batches.filter((b) => {
        if (b.availableQuantity <= 0) return false
        if (b.supplierId && b.supplierId === sup.id) return true
        if (b.supplierName && b.supplierName.toLowerCase().trim() === supNameLower) return true
        const parentMed = medicines.find((m) => m.id === b.medicineId)
        if (
          parentMed &&
          (parentMed.supplierName || (parentMed as any).supplier || "")
            .toLowerCase()
            .trim() === supNameLower
        ) {
          return true
        }
        return false
      })

      const medIds = new Set(supBatches.map((b) => b.medicineId))
      // Also add any medicines where supplier matches directly and stock > 0
      medicines.forEach((m) => {
        const mSup = (m.supplierName || (m as any).supplier || "").toLowerCase().trim()
        if (mSup === supNameLower && Number(m.stock || 0) > 0) {
          medIds.add(m.id)
        }
      })

      sup.batchCount = supBatches.length
      sup.medicineCount = medIds.size
    })

    // Sort: suppliers with stock first, then alphabetically
    return list.sort((a, b) => {
      if (b.batchCount !== a.batchCount) return b.batchCount - a.batchCount
      return a.name.localeCompare(b.name)
    })
  }, [suppliers, medicines, batches])

  // Filtered suppliers based on user typing in search box
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearchQuery.toLowerCase().trim()
    if (!q) return unifiedSuppliers
    return unifiedSuppliers.filter((s) => s.name.toLowerCase().includes(q))
  }, [unifiedSuppliers, supplierSearchQuery])

  // 2. Batches strictly bought from the selected supplier with available stock
  const supplierBatches = useMemo(() => {
    if (!selectedSupplierName && !selectedSupplierId) return []
    const normName = (selectedSupplierName || "").toLowerCase().trim()

    return batches.filter((b) => {
      if (b.availableQuantity <= 0) return false
      if (selectedSupplierId && b.supplierId === selectedSupplierId) return true
      if (normName && b.supplierName && b.supplierName.toLowerCase().trim() === normName)
        return true
      const parentMed = medicines.find((m) => m.id === b.medicineId)
      if (
        parentMed &&
        normName &&
        (parentMed.supplierName || (parentMed as any).supplier || "")
          .toLowerCase()
          .trim() === normName
      ) {
        return true
      }
      return false
    })
  }, [batches, medicines, selectedSupplierId, selectedSupplierName])

  // 3. Distinct medicines bought from the selected supplier
  const supplierMedicines = useMemo(() => {
    if (!selectedSupplierName && !selectedSupplierId) return []
    const normName = (selectedSupplierName || "").toLowerCase().trim()
    const medIdsWithBatches = new Set(supplierBatches.map((b) => b.medicineId))

    return medicines.filter((m) => {
      if (medIdsWithBatches.has(m.id)) return true
      const mSup = (m.supplierName || (m as any).supplier || "").toLowerCase().trim()
      if (normName && mSup === normName && Number(m.stock || 0) > 0) return true
      return false
    })
  }, [supplierBatches, medicines, selectedSupplierId, selectedSupplierName])

  // 4. Active batches for the chosen medicine from this supplier
  const activeBatches = useMemo(() => {
    if (!selectedMedicineId) return supplierBatches
    const filtered = supplierBatches.filter((b) => b.medicineId === selectedMedicineId)
    // If no explicit batch in batches table, check if the medicine has its own batch info & stock
    if (filtered.length === 0) {
      const med = medicines.find((m) => m.id === selectedMedicineId)
      if (med && Number(med.stock || 0) > 0) {
        return [
          {
            id: `synth_${med.id}`,
            medicineId: med.id,
            batchNumber: med.batchNumber || "B" + String(med.id).slice(-6),
            expiryDate: med.expiryDate || "2028-03-31",
            availableQuantity: Number(med.stock),
            quantity: Number(med.stock),
            purchasePrice: Number(med.purchasePrice) || (med.mrp ? Math.round(med.mrp * 0.7) : 0),
            mrp: Number(med.mrp) || 0,
            supplierName: selectedSupplierName,
          } as any,
        ]
      }
    }
    return filtered
  }, [supplierBatches, selectedMedicineId, medicines, selectedSupplierName])

  const selectedMedicine = medicines.find((m) => m.id === selectedMedicineId)
  const selectedBatch = activeBatches.find((b) => b.id === selectedBatchId) || batches.find((b) => b.id === selectedBatchId)
  const purchaseRate = selectedBatch?.purchasePrice || Number(selectedMedicine?.purchasePrice) || 0
  const qtyNum = parseInt(returnQuantity || "0", 10) || 0
  const returnAmountPreview = qtyNum * purchaseRate || 0

  const openOriginalInvoice = (customInvNo?: string, customSupId?: string) => {
    const invNo = customInvNo || invoiceNumber
    if (!invNo) {
      toast.error("No original supplier invoice recorded for this batch.")
      return
    }

    const supObj = unifiedSuppliers.find(
      (s) => s.id === customSupId || s.name.toLowerCase() === (selectedSupplierName || "").toLowerCase(),
    ) || suppliers.find((s) => s.id === customSupId)

    const med = medicines.find((m) => m.id === selectedMedicineId) || selectedMedicine
    const rate = selectedBatch?.purchasePrice || purchaseRate || 0
    const qty = selectedBatch?.quantity || 1
    const gross = rate * qty
    const gstRate = med?.gst || 5
    const gstAmt = (gross * gstRate) / 100
    const total = gross + gstAmt

    setInvoiceModalData({
      supplierName: (supObj?.name || (supObj as any)?.supplierName || selectedSupplierName || "SUPPLIER").toUpperCase(),
      supplierAddress: supObj?.address || "Registered Supplier Depot",
      supplierPhone: supObj?.phone || "",
      supplierLicence: (supObj as any)?.licenseDetails || "",
      supplierGstin: supObj?.gstin || (supObj as any)?.gstInformation || "",
      partyName: "VH PHARMACY",
      partyAddress: "In the premises of Varma Hospitals, Bhimavaram",
      partyLicence: "",
      partyGstin: "",
      invoiceNo: invNo,
      invoiceDate: new Date().toLocaleDateString("en-IN"),
      dueDate: new Date().toLocaleDateString("en-IN"),
      paymentMode: "CREDIT",
      items: [
        {
          sNo: 1,
          qty: qty,
          discountPercent: 0,
          mfr: med?.manufacturer || "",
          pack: med?.strength || "1 Unit",
          productName: (med?.name || (med as any)?.medicineName || "MEDICINE").toUpperCase(),
          oMrp: 0,
          batch: selectedBatch?.batchNumber || "BATCH",
          exp: selectedBatch?.expiryDate || "N/A",
          hsn: (med as any)?.hsnCode || "300490",
          mrp: (selectedBatch?.mrp || rate).toString(),
          rate: rate,
          dis: 0,
          sgstPercent: gstRate / 2,
          sgstVal: (gstAmt / 2).toFixed(2),
          cgstPercent: gstRate / 2,
          cgstVal: (gstAmt / 2).toFixed(2),
          amount: gross.toFixed(2),
          netAmount: total.toFixed(2),
        },
      ],
      gstRate: `${gstRate}%`,
      totalGross: gross.toFixed(2),
      totalDiscount: "0.00",
      taxableAmt: gross.toFixed(2),
      sgstAmt: (gstAmt / 2).toFixed(2),
      cgstAmt: (gstAmt / 2).toFixed(2),
      totalGst: gstAmt.toFixed(2),
      roundOff: 0,
      grandTotal: total.toFixed(2),
      amountInWords: `₹${total.toFixed(2)}`,
      bankName: "",
      ifscCode: "",
    })
  }

  const handleInitiateReturn = () => {
    if (!selectedSupplierName || !selectedMedicineId || !selectedBatchId || !returnQuantity) {
      toast.error("Please fill all required fields (Supplier, Medicine, Batch, Quantity)")
      return
    }

    if (!returnReason.trim()) {
      toast.error("Please select or type the reason for returning this medicine")
      return
    }

    const qty = parseInt(returnQuantity, 10)
    if (isNaN(qty) || qty <= 0) {
      toast.error("Invalid return quantity")
      return
    }

    if (selectedBatch && qty > selectedBatch.availableQuantity) {
      toast.error(
        `Return quantity cannot exceed available stock (${selectedBatch.availableQuantity})`,
      )
      return
    }

    try {
      let finalBatchId = selectedBatchId

      // Auto-materialize synthetic batch if medicine had stock but no batch record
      if (finalBatchId.startsWith("synth_")) {
        const med = medicines.find((m) => m.id === selectedMedicineId)
        if (med) {
          finalBatchId = PharmacyDatabase.addBatch({
            medicineId: med.id,
            batchNumber: med.batchNumber || "B" + Math.floor(100000 + Math.random() * 900000),
            expiryDate: med.expiryDate || "2028-03-31",
            manufacturingDate: new Date().toISOString().split("T")[0],
            quantity: Number(med.stock) || qty,
            availableQuantity: Number(med.stock) || qty,
            mrp: Number(med.mrp) || 0,
            purchasePrice: Number(med.purchasePrice) || 0,
            supplierName: selectedSupplierName,
            location: (med as any).binNo || "Main Pharmacy",
            grnId: "MED_MASTER_ENTRY",
            createdAt: new Date().toISOString(),
          })
        }
      }

      const activeBatchObj =
        batches.find((b) => b.id === finalBatchId) || selectedBatch
      const medObj =
        medicines.find((m) => m.id === selectedMedicineId) || selectedMedicine

      const newReturn = PharmacyDatabase.processSupplierReturn(
        {
          supplierId:
            selectedSupplierId ||
            `adhoc_${selectedSupplierName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`,
          supplierName: selectedSupplierName,
          medicineId: medObj!.id,
          medicineName: (medObj as any)?.medicineName || medObj?.name || "Medicine",
          batchId: finalBatchId,
          batchNumber: activeBatchObj?.batchNumber || "Batch",
          quantity: qty,
          reason: returnReason.trim(),
          poNumber,
          grnNumber,
          invoiceNumber,
          createdBy: "Pharmacist",
        },
        "Pharmacist",
      )

      toast.success("Supplier Return Submitted! Stock deducted from inventory.")
      setSelectedReturnForInvoice(newReturn)
      setViewState("list")

      // Reset Form
      setSelectedSupplierId("")
      setSelectedSupplierName("")
      setSupplierSearchQuery("")
      setSelectedMedicineId("")
      setSelectedBatchId("")
      setReturnQuantity("")
      setReturnReason("")
      setPoNumber("")
      setGrnNumber("")
      setInvoiceNumber("")
      refresh()
    } catch (err: any) {
      toast.error(err.message || "Failed to process return")
    }
  }

  const advanceStatus = (returnId: string, currentStatus: string) => {
    let currentIndex = STATUS_ORDER.indexOf(currentStatus)
    if (currentIndex === -1) {
      if (currentStatus === "Draft") currentIndex = 0
      else if (currentStatus === "Approved" || currentStatus === "Sent To Supplier")
        currentIndex = 1
      else currentIndex = 0
    }
    if (currentIndex >= STATUS_ORDER.length - 1) return

    const nextStatus = STATUS_ORDER[currentIndex + 1] as any

    // If next status is Credit Received, open the popup modal instead of window.prompt
    if (nextStatus === "Credit Received") {
      const targetReturn = supplierReturns.find((r) => r.id === returnId)
      setCreditNoteNumberInput("")
      setCreditNoteDateInput(new Date().toISOString().split("T")[0])
      setCreditNoteAmountInput(
        targetReturn ? Number(targetReturn.returnAmount || (targetReturn as any).totalAmount || 0) : ""
      )
      setCreditNoteRemarksInput("")
      setCreditNoteModalData({
        returnId,
        returnRecord: targetReturn,
      })
      return
    }

    try {
      PharmacyDatabase.updateSupplierReturnStatus(
        returnId,
        nextStatus,
        "Pharmacy Manager",
      )
      toast.success(`Status updated to: ${nextStatus}`)
      refresh()
    } catch (err: any) {
      toast.error(err.message || "Failed to advance status")
    }
  }

  // Handle Credit Note confirmation from the popup modal
  const handleConfirmCreditNote = (e: React.FormEvent) => {
    e.preventDefault()
    if (!creditNoteModalData) return
    const cnNo = creditNoteNumberInput.trim()
    if (!cnNo) {
      toast.error("Credit Note number is required to confirm credit received from supplier.")
      return
    }

    try {
      PharmacyDatabase.updateSupplierReturnStatus(
        creditNoteModalData.returnId,
        "Credit Received",
        "Pharmacy Manager",
      )
      const returns = PharmacyDatabase.getSupplierReturns()
      const target = returns.find((r) => r.id === creditNoteModalData.returnId) as any
      if (target) {
        target.creditNoteId = cnNo
        target.creditReceivedDate = creditNoteDateInput || new Date().toISOString().split("T")[0]
        if (creditNoteAmountInput !== "") {
          target.creditAmount = Number(creditNoteAmountInput)
        }
        if (creditNoteRemarksInput.trim()) {
          target.creditRemarks = creditNoteRemarksInput.trim()
        }
        PharmacyDatabase.saveSupplierReturns(returns)
      }
      toast.success(`Credit Note "${cnNo}" recorded! Status updated to Credit Received.`)
      setCreditNoteModalData(null)
      refresh()
    } catch (err: any) {
      toast.error(err.message || "Failed to update credit note")
    }
  }

  const getSupplierName = (id: string, storedName?: string) => {
    if (storedName && storedName.trim()) return storedName
    const match = unifiedSuppliers.find(
      (s) => s.id === id || s.name.toLowerCase() === id.toLowerCase(),
    )
    if (match) return match.name
    const sup = suppliers.find((s) => s.id === id)
    if (sup?.supplierName || sup?.name) return sup.supplierName || sup.name
    if (id.startsWith("adhoc_")) {
      return id.replace("adhoc_", "").replace(/_/g, " ").toUpperCase()
    }
    return id || "Authorized Supplier"
  }

  const getMedicineName = (id: string, storedName?: string) => {
    if (storedName && storedName.trim()) return storedName
    const m = medicines.find((x) => x.id === id)
    return (m as any)?.medicineName || m?.name || id
  }

  const getBatchNumber = (id: string, storedBatch?: string) => {
    if (storedBatch && storedBatch.trim()) return storedBatch
    return batches.find((b) => b.id === id)?.batchNumber || id
  }

  const filteredSupplierReturns = useMemo(() => {
    const q = tableSearchQuery.toLowerCase().trim()
    if (!q) return supplierReturns
    return supplierReturns.filter((rtn) => {
      const sup = (rtn.supplierName || getSupplierName(rtn.supplierId)).toLowerCase()
      const med = (rtn.medicineName || getMedicineName(rtn.medicineId)).toLowerCase()
      const bat = (rtn.batchNumber || getBatchNumber(rtn.batchId)).toLowerCase()
      const dn = (rtn.debitNoteNumber || "").toLowerCase()
      const r = (rtn.reason || "").toLowerCase()
      const st = (rtn.status || "").toLowerCase()
      const inv = (rtn.invoiceNumber || "").toLowerCase()
      return (
        dn.includes(q) ||
        sup.includes(q) ||
        med.includes(q) ||
        bat.includes(q) ||
        r.includes(q) ||
        st.includes(q) ||
        inv.includes(q)
      )
    })
  }, [supplierReturns, tableSearchQuery, unifiedSuppliers, medicines, batches])

  if (viewState === "create") {
    return (
      <div className="space-y-6 font-sans text-[#0F1624]">
        <PageHeader
          breadcrumbs={[
            { label: "Pharmacy" },
            { label: "Inventory" },
            { label: "Supplier Returns" },
            { label: "Initiate Return" },
          ]}
          title="Initiate Supplier Return (Debit Note)"
          description="Return expired, damaged, or excess medicines to suppliers and deduct from live inventory"
          onNavigate={onNavigate}
        />

        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6 space-y-8">
          {/* Section 1: Supplier & Product */}
          <div className="space-y-4">
            <h3 className="font-semibold text-[14px] text-[#0F1624] flex items-center gap-2">
              <Building2 size={16} className="text-[#0F766E]" /> 1. Select Supplier & Product
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 1. Supplier Search / Combobox with suggestions */}
              <div className="relative" ref={supplierDropdownRef}>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1 flex items-center justify-between">
                  <span>1. Supplier *</span>
                  {selectedSupplierName && (
                    <span className="text-[#0F766E] font-medium lowercase text-[10.5px]">
                      ✓ selected
                    </span>
                  )}
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                    <Search size={14} />
                  </div>
                  <input
                    type="text"
                    value={
                      isSupplierDropdownOpen
                        ? supplierSearchQuery
                        : selectedSupplierName || supplierSearchQuery
                    }
                    onChange={(e) => {
                      setSupplierSearchQuery(e.target.value)
                      if (!isSupplierDropdownOpen) setIsSupplierDropdownOpen(true)
                    }}
                    onFocus={() => {
                      setIsSupplierDropdownOpen(true)
                      if (!supplierSearchQuery && selectedSupplierName) {
                        setSupplierSearchQuery(selectedSupplierName)
                      }
                    }}
                    placeholder="Search supplier (e.g. VH Medicals)..."
                    className="w-full pl-9 pr-9 py-2 border border-[#CBD5E1] text-[13px] rounded focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E] focus:outline-none bg-white font-medium text-[#0F1624]"
                  />
                  {selectedSupplierName || supplierSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSupplierId("")
                        setSelectedSupplierName("")
                        setSupplierSearchQuery("")
                        setSelectedMedicineId("")
                        setSelectedBatchId("")
                        setIsSupplierDropdownOpen(true)
                      }}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#94A3B8] hover:text-[#64748B]"
                      title="Clear supplier"
                    >
                      <X size={15} />
                    </button>
                  ) : (
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-[#94A3B8]">
                      <ChevronDown size={15} />
                    </div>
                  )}
                </div>

                {/* Suggestion Dropdown */}
                {isSupplierDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#CBD5E1] rounded-lg shadow-xl max-h-64 overflow-y-auto divide-y divide-[#F1F5F9]">
                    <div className="px-3 py-1.5 bg-[#F8FAFC] text-[10px] font-bold text-[#64748B] flex justify-between items-center tracking-wide">
                      <span>SUPPLIERS ({filteredSuppliers.length})</span>
                      <span>Click to select</span>
                    </div>

                    {filteredSuppliers.length === 0 ? (
                      <div className="p-3 text-center">
                        <p className="text-[12px] text-[#64748B]">
                          No supplier matching "{supplierSearchQuery}".
                        </p>
                        {supplierSearchQuery.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              const qName = supplierSearchQuery.trim().toUpperCase()
                              setSelectedSupplierName(qName)
                              setSelectedSupplierId(
                                `adhoc_${qName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`,
                              )
                              setSelectedMedicineId("")
                              setSelectedBatchId("")
                              setIsSupplierDropdownOpen(false)
                            }}
                            className="mt-2 text-[12px] font-semibold text-[#0F766E] bg-[#F0FDFA] border border-[#99F6E4] px-3 py-1.5 rounded hover:bg-[#CCFBF1] transition-colors inline-flex items-center gap-1.5"
                          >
                            <Plus size={13} /> Select "{supplierSearchQuery.trim().toUpperCase()}"
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredSuppliers.map((s) => {
                        const isSelected =
                          selectedSupplierName.toLowerCase() === s.name.toLowerCase()
                        return (
                          <div
                            key={s.id}
                            onMouseDown={() => {
                              setSelectedSupplierId(s.id)
                              setSelectedSupplierName(s.name)
                              setSupplierSearchQuery("")
                              setSelectedMedicineId("")
                              setSelectedBatchId("")
                              setIsSupplierDropdownOpen(false)
                            }}
                            className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                              isSelected
                                ? "bg-[#F0FDFA] text-[#0F766E]"
                                : "hover:bg-[#F8FAFC] text-[#1E293B]"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[13px]">{s.name}</span>
                                {s.source === "registered" ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]">
                                    Depot
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[#EDE9FE] text-[#6D28D9] border border-[#DDD6FE]">
                                    Medicine Master
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-2">
                                {s.medicineCount > 0 ? (
                                  <span className="text-[#059669] font-medium">
                                    ✓ {s.medicineCount} {s.medicineCount === 1 ? "medicine" : "medicines"} ({s.batchCount} batches in stock)
                                  </span>
                                ) : (
                                  <span className="text-[#94A3B8]">No active stock on shelf</span>
                                )}
                                {s.gstin && <span>• GST: {s.gstin}</span>}
                              </div>
                            </div>
                            {isSelected && (
                              <Check size={16} className="text-[#0F766E] shrink-0" />
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {/* Quick Select Chips */}
                {!selectedSupplierName && unifiedSuppliers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                    <span className="text-[10px] font-semibold text-[#94A3B8] uppercase">
                      Quick:
                    </span>
                    {unifiedSuppliers.slice(0, 3).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSupplierId(s.id)
                          setSelectedSupplierName(s.name)
                          setSelectedMedicineId("")
                          setSelectedBatchId("")
                        }}
                        className="text-[11px] px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] font-medium transition-colors"
                      >
                        {s.name} {s.batchCount > 0 && `(${s.batchCount})`}
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Supplier Badge */}
                {selectedSupplierName && (
                  <div className="mt-1.5 bg-[#F0FDFA] border border-[#CCFBF1] rounded p-1.5 px-2 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#0F766E] truncate">
                      {selectedSupplierName} ({supplierMedicines.length} in-stock medicines)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSupplierId("")
                        setSelectedSupplierName("")
                        setSupplierSearchQuery("")
                        setSelectedMedicineId("")
                        setSelectedBatchId("")
                      }}
                      className="text-[#EF4444] hover:underline font-semibold ml-2 shrink-0 cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                )}
              </div>

              {/* 2. Purchased Medicine */}
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  2. Purchased Medicine *
                </label>
                <select
                  value={selectedMedicineId}
                  onChange={(e) => {
                    const mId = e.target.value
                    setSelectedMedicineId(mId)
                    setSelectedBatchId("")
                  }}
                  disabled={!selectedSupplierName}
                  className="w-full px-3 py-2 border border-[#CBD5E1] text-[13px] rounded disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] focus:border-[#0F766E] focus:outline-none bg-white font-medium text-[#0F1624]"
                >
                  <option value="">
                    {!selectedSupplierName
                      ? "-- Select Supplier First --"
                      : (supplierMedicines?.length || 0) === 0
                      ? "-- No in-stock medicines found for this supplier --"
                      : "-- Choose Medicine --"}
                  </option>
                  {(supplierMedicines || []).map((m) => {
                    const matchingBatches = (supplierBatches || []).filter(
                      (b) => b.medicineId === m.id,
                    )
                    const totalStock =
                      matchingBatches.reduce(
                        (sum, b) => sum + (b.availableQuantity || 0),
                        0,
                      ) || (m.stock || 0)
                    return (
                      <option key={m.id} value={m.id}>
                        {(m as any).medicineName || m.name}{" "}
                        {m.strength ? `(${m.strength})` : ""} - In-Stock: {totalStock}
                      </option>
                    )
                  })}
                </select>
                {selectedSupplierName && supplierMedicines.length === 0 && (
                  <p className="text-[11px] text-[#B45309] mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> No active medicines on shelf bought from {selectedSupplierName}.
                  </p>
                )}
              </div>

              {/* 3. Batch (In Stock) */}
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  3. Batch (In Stock) *
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => {
                    const bId = e.target.value
                    setSelectedBatchId(bId)
                    const b =
                      activeBatches.find((x) => x.id === bId) ||
                      batches.find((x) => x.id === bId)
                    if (b) {
                      if (b.invoiceNumber && !invoiceNumber)
                        setInvoiceNumber(b.invoiceNumber)
                      if (b.grnId && !grnNumber) setGrnNumber(b.grnId)
                      if (!returnQuantity || Number(returnQuantity) > b.availableQuantity) {
                        setReturnQuantity(String(Math.min(b.availableQuantity, 10)))
                      }
                    }
                  }}
                  disabled={!selectedMedicineId}
                  className="w-full px-3 py-2 border border-[#CBD5E1] text-[13px] rounded disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] focus:border-[#0F766E] focus:outline-none bg-white font-medium text-[#0F1624]"
                >
                  <option value="">
                    {!selectedMedicineId
                      ? "-- Select Medicine First --"
                      : (activeBatches?.length || 0) === 0
                      ? "-- No active batches found --"
                      : "-- Choose Batch --"}
                  </option>
                  {(activeBatches || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber} (Exp: {b.expiryDate} | Stock: {b.availableQuantity} | Rate: ₹{b.purchasePrice})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Product & Batch Summary Card */}
            {selectedBatch && (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-[12px] grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                <div>
                  <span className="text-[#64748B] text-[11px] block">Selected Product</span>
                  <span className="font-bold text-[#0F1624] text-[13px]">
                    {(selectedMedicine as any)?.medicineName || selectedMedicine?.name}
                  </span>
                  {selectedMedicine?.strength && (
                    <span className="text-[11px] text-[#64748B] block">
                      Pack: {selectedMedicine.strength}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[#64748B] text-[11px] block">Batch & Expiry</span>
                  <span className="font-semibold text-[#0F1624]">
                    {selectedBatch.batchNumber}
                  </span>
                  <span className="text-[11px] text-[#0F766E] font-medium block">
                    Exp: {selectedBatch.expiryDate}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] text-[11px] block">Available Stock</span>
                  <span className="font-bold text-[#059669] text-[14px]">
                    {selectedBatch.availableQuantity} Units
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] text-[11px] block">Purchase Rate</span>
                  <span className="font-bold text-[#0F1624] text-[14px]">
                    ₹{Number(purchaseRate).toFixed(2)}
                  </span>
                  {selectedBatch.mrp > 0 && (
                    <span className="text-[11px] text-[#64748B] block">
                      MRP: ₹{Number(selectedBatch.mrp).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <hr className="border-[#F0F2F5]" />

          {/* Section 2: Reference Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-[14px] text-[#0F1624] flex items-center gap-2">
              <FileText size={16} className="text-[#1B4FD8]" /> 2. Original Purchase Details (Optional)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  PO Number
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="PO-2026-..."
                  className="w-full px-3 py-2 border border-[#CBD5E1] text-[13px] rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  GRN Number
                </label>
                <input
                  type="text"
                  value={grnNumber}
                  onChange={(e) => setGrnNumber(e.target.value)}
                  placeholder="GRN-2026-..."
                  className="w-full px-3 py-2 border border-[#CBD5E1] text-[13px] rounded"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">
                    Supplier Invoice
                  </label>
                  {invoiceNumber && (
                    <button
                      type="button"
                      onClick={() => openOriginalInvoice()}
                      className="text-[11px] font-semibold text-[#0F766E] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <FileText size={12} /> View Original Receipt
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-..."
                  className="w-full px-3 py-2 border border-[#CBD5E1] text-[13px] rounded"
                />
              </div>
            </div>
          </div>

          <hr className="border-[#F0F2F5]" />

          {/* Section 3: Return Specifics */}
          <div className="space-y-4">
            <h3 className="font-semibold text-[14px] text-[#0F1624] flex items-center gap-2">
              <Package size={16} className="text-[#1B4FD8]" /> 3. Return Details & Quantity
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">
                    Return Quantity *
                  </label>
                  {selectedBatch && (
                    <button
                      type="button"
                      onClick={() =>
                        setReturnQuantity(String(selectedBatch.availableQuantity))
                      }
                      className="text-[11px] font-bold text-[#0F766E] hover:underline cursor-pointer"
                    >
                      Max Available: {selectedBatch.availableQuantity} Units
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  max={selectedBatch?.availableQuantity || 9999}
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(e.target.value)}
                  className="w-full px-3 py-2 border border-[#CBD5E1] text-[13px] rounded font-semibold text-[#0F1624]"
                  placeholder="Enter quantity to return..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                  Reason for Return *
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Choose quick reason below or type specific defect..."
                  className="w-full px-3 py-2 border border-[#CBD5E1] text-[13px] rounded focus:border-[#0F766E] focus:outline-none bg-white"
                />
              </div>
            </div>

            {/* Quick Reason Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10.5px] font-semibold text-[#64748B] uppercase">
                Quick Reasons:
              </span>
              {RETURN_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setReturnReason(reason)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    returnReason === reason
                      ? "bg-[#0F766E] text-white border-[#0F766E] font-semibold"
                      : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            {/* Financial Valuation Card */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-4 flex justify-between items-center mt-4">
              <div>
                <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">
                  Purchase Rate per Unit
                </p>
                <p className="text-[16px] font-bold text-[#334155]">
                  ₹{Number(purchaseRate).toFixed(2)}
                </p>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Quantity: {qtyNum} units
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">
                  Total Debit Note Credit Value
                </p>
                <p className="text-[22px] font-bold text-[#dc2626]">
                  ₹{returnAmountPreview.toFixed(2)}
                </p>
                <p className="text-[11px] text-[#059669] font-medium mt-0.5">
                  To be credited back by supplier
                </p>
              </div>
            </div>
          </div>

          {/* Submission Notice Banner */}
          <div className="bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] p-4 rounded-lg text-[12px] flex gap-3 items-start">
            <CheckCircle2 size={20} className="shrink-0 mt-0.5 text-[#059669]" />
            <div>
              <p className="font-bold text-[13px] text-[#065F46]">
                What Happens When You Submit:
              </p>
              <ul className="list-disc list-inside mt-1.5 space-y-1 text-[11.5px] text-[#047857] leading-relaxed">
                <li>
                  <strong>Immediate Live Stock Deduction:</strong> Exactly <strong>{returnQuantity || 0} units</strong> are immediately deducted from batch <strong>{selectedBatch?.batchNumber || "selected"}</strong> and total medicine stock so damaged/expired stock is off the shelf.
                </li>
                <li>
                  <strong>Official Debit Note Generation:</strong> A unique Debit Note (e.g. <code>DN-2026-XXXXX</code>) is issued for <strong>₹{returnAmountPreview.toFixed(2)}</strong>.
                </li>
                <li>
                  <strong>Audit Ledger Recorded:</strong> Transaction type <code>SUPPLIER_RETURN</code> is recorded in the Inventory Ledger for compliance.
                </li>
                <li>
                  <strong>Printable Handover Voucher:</strong> Instant printable Supplier Return Tax Invoice / Debit Note opens for the delivery representative.
                </li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#F0F2F5]">
            <button
              onClick={() => setViewState("list")}
              className="px-6 py-2.5 rounded border border-[#CBD5E1] text-[13px] font-medium text-[#334155] hover:bg-[#F5F7FA] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInitiateReturn}
              className="px-6 py-2.5 rounded text-white font-semibold text-[13px] hover:opacity-95 transition-opacity flex items-center gap-2 shadow-xs cursor-pointer"
              style={{ background: "#0F766E" }}
            >
              <Send size={14} /> Submit Return & Deduct Stock
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (viewState === "print" && printReturnId) {
    const rtn = supplierReturns.find((r) => r.id === printReturnId)
    if (!rtn) return null

    return (
      <div className="p-6">
        <div
          className="max-w-2xl mx-auto bg-white border border-[#E2E8F0] p-10 shadow-sm"
          style={{ fontFamily: "monospace" }}
        >
          <div className="text-center mb-8 border-b-2 border-dashed border-[#94A3B8] pb-4">
            <h1 className="text-xl font-bold">VH PHARMACY</h1>
            <h2 className="text-lg mt-2">SUPPLIER RETURN DEBIT NOTE</h2>
          </div>

          <div className="flex justify-between mb-8">
            <div>
              <p>
                Debit Note No: <strong>{rtn.debitNoteNumber}</strong>
              </p>
              <p>Date: {new Date(rtn.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p>
                Supplier: <strong>{getSupplierName(rtn.supplierId, rtn.supplierName)}</strong>
              </p>
              {rtn.poNumber && <p>PO Ref: {rtn.poNumber}</p>}
              {rtn.invoiceNumber && <p>Inv Ref: {rtn.invoiceNumber}</p>}
            </div>
          </div>

          <div className="border-t-2 border-b-2 border-dashed border-[#94A3B8] py-2 mb-8">
            <table className="w-full text-left">
              <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
                <tr>
                  <th className="py-2 px-2 text-[11px] font-bold text-[#065F46] uppercase">Medicine</th>
                  <th className="py-2 px-2 text-[11px] font-bold text-[#065F46] uppercase">Batch</th>
                  <th className="py-2 px-2 text-[11px] font-bold text-[#065F46] uppercase">Qty</th>
                  <th className="py-2 px-2 text-[11px] font-bold text-[#065F46] uppercase">Rate</th>
                  <th className="py-2 px-2 text-right text-[11px] font-bold text-[#065F46] uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="mt-2">
                <tr>
                  <td className="pt-2 px-2">{getMedicineName(rtn.medicineId, rtn.medicineName)}</td>
                  <td className="pt-2 px-2">{getBatchNumber(rtn.batchId, rtn.batchNumber)}</td>
                  <td className="pt-2 px-2">{rtn.quantity}</td>
                  <td className="pt-2 px-2">₹{rtn.purchaseRate}</td>
                  <td className="pt-2 px-2 text-right">₹{rtn.returnAmount}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-right mb-8">
            <p>
              Total Return Credit: <strong>₹{rtn.returnAmount}</strong>
            </p>
          </div>

          <div className="mb-12">
            <p>Reason: {rtn.reason}</p>
            <p>Status: {rtn.status}</p>
          </div>

          <div className="border-t-2 border-dashed border-[#94A3B8] pt-4 mt-16 flex justify-between">
            <div>
              <p>Prepared By: {rtn.createdBy}</p>
            </div>
            <div className="text-center">
              <p className="mt-8 border-t border-black pt-1">Authorized Pharmacist</p>
              <p>{rtn.approvedBy || "Pharmacy Manager"}</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-6 flex justify-between">
          <button
            onClick={() => setViewState("list")}
            className="px-4 py-2 border rounded cursor-pointer"
          >
            Back to List
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-blue-600 text-white rounded flex items-center gap-2 cursor-pointer"
          >
            <Printer size={16} /> Print Document
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 font-sans text-[#0F1624]">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Inventory" },
          { label: "Supplier Returns" },
        ]}
        title="Purchase Returns (Debit Notes)"
        description={`${supplierReturns.length} supplier return debit notes recorded`}
        actions={
          <button
            onClick={() => setViewState("create")}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-white text-[13px] font-medium shadow-xs hover:opacity-95 transition-opacity cursor-pointer"
            style={{ background: "#0F766E" }}
          >
            <Plus size={14} /> Initiate Return
          </button>
        }
        onNavigate={onNavigate}
      />

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-[#E2E8F0] flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
            <Search size={15} />
          </div>
          <input
            type="text"
            value={tableSearchQuery}
            onChange={(e) => setTableSearchQuery(e.target.value)}
            placeholder="Search Debit Note #, Supplier, Medicine, Batch, Reason..."
            className="w-full pl-9 pr-3 py-2 border border-[#CBD5E1] text-[13px] rounded focus:border-[#0F766E] focus:outline-none bg-white"
          />
          {tableSearchQuery && (
            <button
              onClick={() => setTableSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#94A3B8] hover:text-[#64748B]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="text-[12px] text-[#64748B] flex items-center gap-2">
          <span>
            Showing <strong>{filteredSupplierReturns.length}</strong> of{" "}
            <strong>{supplierReturns.length}</strong> returns
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
            <tr>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Debit Note No
              </th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Date
              </th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Supplier
              </th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Medicine / Batch
              </th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Return Val
              </th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Reason
              </th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Status
              </th>
              <th className="text-right py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {filteredSupplierReturns.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-10 text-[#94A3B8] text-[13px]"
                >
                  {supplierReturns.length === 0
                    ? "No supplier returns recorded. Click 'Initiate Return' to start."
                    : "No matching supplier returns found for your search."}
                </td>
              </tr>
            ) : (
              filteredSupplierReturns.map((rtn) => {
                const nextStatus =
                  STATUS_ORDER[STATUS_ORDER.indexOf(rtn.status) + 1]
                const supName = getSupplierName(rtn.supplierId, rtn.supplierName)
                const medName = getMedicineName(rtn.medicineId, rtn.medicineName)
                const batchNum = getBatchNumber(rtn.batchId, rtn.batchNumber)

                return (
                  <tr className="hover:bg-[#F0FDFA] transition-colors" key={rtn.id}>
                    <td className="py-3 px-4">
                      <p className="font-mono text-[13px] font-bold text-[#0F766E]">
                        {rtn.debitNoteNumber}
                      </p>
                      {(rtn.poNumber || rtn.grnNumber) && (
                        <p className="text-[10.5px] text-[#64748B] mt-0.5">
                          PO: {rtn.poNumber || "-"} | GRN: {rtn.grnNumber || "-"}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[13px] text-[#334155]">
                      {new Date(rtn.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4 text-[13px] font-semibold text-[#0F1624]">
                      {supName}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-[13px] text-[#0F1624]">
                        {medName}
                      </p>
                      <p className="text-[11px] text-[#64748B]">
                        Batch: <strong>{batchNum}</strong> | Qty:{" "}
                        <strong className="text-[#dc2626]">{rtn.quantity}</strong>
                      </p>
                    </td>
                    <td className="py-3 px-4 text-[13px] font-bold text-[#dc2626]">
                      ₹{Number(rtn.returnAmount || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 px-4 text-[12.5px] text-[#64748B]">
                      {rtn.reason}
                    </td>
                    <td className="py-3 px-4">
                      <div
                        className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          rtn.status.includes("Credit Received") || rtn.status === "Closed"
                            ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]"
                            : rtn.status.includes("Stock Deducted")
                            ? "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]"
                            : "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"
                        }`}
                      >
                        {rtn.status}
                      </div>
                      {rtn.creditNoteId && (
                        <p className="text-[10px] text-[#059669] font-mono mt-0.5 font-bold">
                          CN: {rtn.creditNoteId}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        {nextStatus && (
                          <button
                            onClick={() => advanceStatus(rtn.id, rtn.status)}
                            className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#0F766E] cursor-pointer"
                            title={`Advance stage to: ${nextStatus}`}
                          >
                            <ArrowRight size={15} />
                          </button>
                        )}
                        {rtn.invoiceNumber && (
                          <button
                            onClick={() =>
                              openOriginalInvoice(rtn.invoiceNumber, rtn.supplierId)
                            }
                            className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#0F766E] cursor-pointer"
                            title={`View Original Supplier Invoice (${rtn.invoiceNumber})`}
                          >
                            <FileText size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedReturnForInvoice(rtn)}
                          className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#0F766E] cursor-pointer"
                          title="Print Supplier Return Invoice & Handover Challan"
                        >
                          <Printer size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Supplier Return Handover Invoice & Debit Note Modal */}
      {selectedReturnForInvoice && (
        <SupplierReturnInvoiceModal
          returnRecord={selectedReturnForInvoice}
          supplier={
            suppliers.find((s) => s.id === selectedReturnForInvoice.supplierId) ||
            unifiedSuppliers.find(
              (s) =>
                s.id === selectedReturnForInvoice.supplierId ||
                s.name.toLowerCase() ===
                  (selectedReturnForInvoice.supplierName || "").toLowerCase(),
            )
          }
          medicine={medicines.find(
            (m) => m.id === selectedReturnForInvoice.medicineId,
          )}
          batch={batches.find((b) => b.id === selectedReturnForInvoice.batchId)}
          onClose={() => setSelectedReturnForInvoice(null)}
        />
      )}

      {/* Original Supplier Invoice Modal */}
      {invoiceModalData && (
        <SupplierInvoiceModal
          invoice={
            typeof invoiceModalData === "object" ? invoiceModalData : undefined
          }
          onClose={() => setInvoiceModalData(null)}
        />
      )}

      {/* Supplier Credit Note Entry Popup Modal (No more window.prompt) */}
      {creditNoteModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setCreditNoteModalData(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-[#0F1624] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-700 via-teal-700 to-[#0F1624] text-white flex items-start justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                  Supplier Credit Note Confirmation
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white mt-1">
                  Record Credit Received
                </h2>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Return ID: <strong className="text-white font-mono">{creditNoteModalData.returnId}</strong>
                </p>
              </div>
              <button
                onClick={() => setCreditNoteModalData(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Return Summary Box */}
            {creditNoteModalData.returnRecord && (
              <div className="mx-6 mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Supplier:</span>
                  <span className="font-bold text-slate-800">
                    {creditNoteModalData.returnRecord.supplierName || "Supplier"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Medicine & Qty:</span>
                  <span className="font-bold text-slate-800">
                    {creditNoteModalData.returnRecord.medicineName || "Medicine"} ({creditNoteModalData.returnRecord.quantity || 1} units)
                  </span>
                </div>
              </div>
            )}

            {/* Credit Note Form */}
            <form onSubmit={handleConfirmCreditNote} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Supplier Credit Note Number *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={creditNoteNumberInput}
                  onChange={(e) => setCreditNoteNumberInput(e.target.value.toUpperCase())}
                  placeholder="e.g. CN-2026-0042"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 uppercase"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Reference number from supplier's physical credit note document
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Credit Note Date
                  </label>
                  <input
                    type="date"
                    required
                    value={creditNoteDateInput}
                    onChange={(e) => setCreditNoteDateInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Credit Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={creditNoteAmountInput}
                    onChange={(e) => setCreditNoteAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Accounting Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={creditNoteRemarksInput}
                  onChange={(e) => setCreditNoteRemarksInput(e.target.value)}
                  placeholder="e.g. Adjusted in next purchase invoice"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreditNoteModalData(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  Confirm Credit Received
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
