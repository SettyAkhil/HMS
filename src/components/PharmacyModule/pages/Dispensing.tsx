import { usePharmacyData } from "../data/usePharmacyData"
import { useState, useEffect } from "react"
import {
  Search,
  X,
  Plus,
  Minus,
  Printer,
  CreditCard,
  Smartphone,
  Wallet,
  Trash2,
  ChevronDown,
  CheckCircle,
  RefreshCw,
  QrCode,
  Play,
  ArrowRightLeft,
} from "lucide-react"
import { PharmacyDatabase } from "../../../services/pharmacyDb"
import PageHeader from "../components/PageHeader"
import InvoicePrintModal from "../components/InvoicePrintModal"

const paymentMethods = [
  { id: "cash", label: "Cash", icon: Wallet },
  { id: "upi", label: "UPI", icon: Smartphone },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "split", label: "Split Payment", icon: ArrowRightLeft },
]

function numberToWords(num: number): string {
  const a = [
    "",
    "One ",
    "Two ",
    "Three ",
    "Four ",
    "Five ",
    "Six ",
    "Seven ",
    "Eight ",
    "Nine ",
    "Ten ",
    "Eleven ",
    "Twelve ",
    "Thirteen ",
    "Fourteen ",
    "Fifteen ",
    "Sixteen ",
    "Seventeen ",
    "Eighteen ",
    "Nineteen ",
  ]
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ]
  if ((num = Math.floor(num)) === 0) return "Zero"
  if (num < 0) return "Negative " + numberToWords(Math.abs(num))
  let str = ""
  if (num >= 10000000) {
    str += numberToWords(Math.floor(num / 10000000)) + "Crore "
    num %= 10000000
  }
  if (num >= 100000) {
    str += numberToWords(Math.floor(num / 100000)) + "Lakh "
    num %= 100000
  }
  if (num >= 1000) {
    str += numberToWords(Math.floor(num / 1000)) + "Thousand "
    num %= 1000
  }
  if (num >= 100) {
    str += numberToWords(Math.floor(num / 100)) + "Hundred "
    num %= 100
  }
  if (num > 0) {
    if (str !== "") str += "and "
    if (num < 20) str += a[num]
    else {
      str += b[Math.floor(num / 10)]
      if (num % 10 > 0) str += "-" + a[num % 10]
    }
  }
  return str.trim()
}

// Helper to evaluate medicine expiry status for sale safety
export function getMedicineExpiryDetails(med: any) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 1. Check all live batches in database
  const liveBatches = PharmacyDatabase.getBatches().filter(
    (b) => b.medicineId === med.id && (b.availableQuantity > 0 || (b.quantity && b.quantity > 0)),
  )

  let earliestExpDate: Date | null = null
  let hasValidNonExpiredStock = false
  let allBatchesExpired = liveBatches.length > 0
  let earliestDateStr = ""

  if (liveBatches.length > 0) {
    for (const b of liveBatches) {
      if (b.expiryDate) {
        const exp = new Date(b.expiryDate)
        if (exp.getTime() < today.getTime()) {
          // expired batch
        } else {
          allBatchesExpired = false
          hasValidNonExpiredStock = true
          if (!earliestExpDate || exp.getTime() < earliestExpDate.getTime()) {
            earliestExpDate = exp
            earliestDateStr = b.expiryDate
          }
        }
      } else {
        hasValidNonExpiredStock = true
      }
    }
  } else if (med.expiryDate) {
    const exp = new Date(med.expiryDate)
    earliestDateStr = med.expiryDate
    if (exp.getTime() < today.getTime()) {
      allBatchesExpired = true
    } else {
      hasValidNonExpiredStock = true
      earliestExpDate = exp
    }
  }

  // If all batches or medicine itself is expired
  if (allBatchesExpired && !hasValidNonExpiredStock) {
    return {
      isExpired: true,
      isNearExpiry: false,
      daysLeft: 0,
      expiryDate: earliestDateStr || med.expiryDate || "Expired",
      statusLabel: "EXPIRED",
      color: "#dc2626",
      bg: "#fee2e2",
    }
  }

  // If there's an upcoming expiry date
  if (earliestExpDate) {
    const diffTime = earliestExpDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays <= 0) {
      return {
        isExpired: true,
        isNearExpiry: false,
        daysLeft: 0,
        expiryDate: earliestDateStr,
        statusLabel: "EXPIRED",
        color: "#dc2626",
        bg: "#fee2e2",
      }
    } else if (diffDays <= 60) {
      return {
        isExpired: false,
        isNearExpiry: true,
        daysLeft: diffDays,
        expiryDate: earliestDateStr,
        statusLabel: `Ready to Expire (${diffDays}d)`,
        color: "#d97706",
        bg: "#fef3c7",
      }
    }
  }

  return {
    isExpired: false,
    isNearExpiry: false,
    daysLeft: 999,
    expiryDate: earliestDateStr || med.expiryDate || "",
    statusLabel: "Valid",
    color: "#15803d",
    bg: "#dcfce7",
  }
}

interface DispensingProps {
  onNavigate: (page: string) => void
}

export default function Dispensing({ onNavigate }: DispensingProps) {
  const { medicines, bills, refresh } = usePharmacyData()
  const [searchQuery, setSearchQuery] = useState("")
  const [cart, setCart] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState<"new_sale" | "sales_history">(
    "new_sale",
  )
  const [historySearch, setHistorySearch] = useState("")
  const [printBill, setPrintBill] = useState<any>(null)

  // Payment Mode Selection for New Sale
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<"cash" | "upi" | "card" | "split">("cash")
  const [cashTendered, setCashTendered] = useState<number>(0)
  const [singleUpiRef, setSingleUpiRef] = useState<string>("")
  const [singleCardRef, setSingleCardRef] = useState<string>("")

  // Split payment state (Requirement 2)
  const [splitMethod1, setSplitMethod1] = useState<"cash" | "upi" | "card">("cash")
  const [splitAmount1, setSplitAmount1] = useState<number>(0)
  const [splitMethod2, setSplitMethod2] = useState<"cash" | "upi" | "card">("upi")
  const [splitAmount2, setSplitAmount2] = useState<number>(0)
  const [splitRef1, setSplitRef1] = useState<string>("")
  const [splitRef2, setSplitRef2] = useState<string>("")

  // Sales History: Edit Payment Mode Modal state (Requirement 3)
  const [editingBill, setEditingBill] = useState<any | null>(null)
  const [editPaymentMode, setEditPaymentMode] = useState<"cash" | "upi" | "card" | "split">("cash")
  const [editCashTendered, setEditCashTendered] = useState<number>(0)
  const [editUpiRef, setEditUpiRef] = useState<string>("")
  const [editCardRef, setEditCardRef] = useState<string>("")
  const [editSplitMethod1, setEditSplitMethod1] = useState<"cash" | "upi" | "card">("cash")
  const [editSplitAmount1, setEditSplitAmount1] = useState<number>(0)
  const [editSplitMethod2, setEditSplitMethod2] = useState<"cash" | "upi" | "card">("upi")
  const [editSplitAmount2, setEditSplitAmount2] = useState<number>(0)
  const [editSplitRef1, setEditSplitRef1] = useState<string>("")
  const [editSplitRef2, setEditSplitRef2] = useState<string>("")

  const [payments, setPayments] = useState<Record<string, number>>({})
  const [paymentRefs, setPaymentRefs] = useState<Record<string, string>>({})
  const [tenderedCash, setTenderedCash] = useState<number>(0)

  const [patientName, setPatientName] = useState("")
  const [posStatus, setPosStatus] = useState<string | null>(null)
  const [rxId, setRxId] = useState("")
  const [discount, setDiscount] = useState(0)

  const [showInvoice, setShowInvoice] = useState(false)
  const [lastBillId, setLastBillId] = useState<any>("")
  const [printDate, setPrintDate] = useState("")
  const [loadedRxMeta, setLoadedRxMeta] = useState<any>(null)
  const [showUpiQrModal, setShowUpiQrModal] = useState(false)
  const [hospitalUpiId, setHospitalUpiId] = useState(() => {
    const saved = localStorage.getItem("hospai_pharmacy_upi_id")
    if (!saved || saved === "vhpharmacy@sbi") {
      localStorage.setItem("hospai_pharmacy_upi_id", "8790689532@ibl")
      return "8790689532@ibl"
    }
    return saved
  })
  const [isEditingUpiId, setIsEditingUpiId] = useState(false)
  const [paymentToast, setPaymentToast] = useState<{
    show: boolean
    title: string
    message: string
    amount: number
    ref: string
  } | null>(null)

  const playPaymentChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12) // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.5)
    } catch (e) {
      console.log("Audio not supported or blocked by user gesture:", e)
    }
  }

  const confirmUpiPayment = (targetAmt?: number, enteredUtr?: string) => {
    const amt = targetAmt !== undefined ? Number(targetAmt) : (payments["upi"] || (balanceDue > 0 ? balanceDue : finalAmount) || 1)
    const ref = enteredUtr?.trim() || paymentRefs["upi"]?.trim() || "CASHIER_VERIFIED"

    setPayments((prev) => ({ ...prev, upi: amt }))
    setPaymentRefs((prev) => ({ ...prev, upi: ref }))
    setShowUpiQrModal(false)

    // Play chime sound
    playPaymentChime()

    // Show floating toast
    setPaymentToast({
      show: true,
      title: `₹${amt.toFixed(2)} UPI Payment Recorded!`,
      message: `Received on ${hospitalUpiId}. Ref: ${ref}. Deducted from bill.`,
      amount: amt,
      ref,
    })

    // Store notification in database
    try {
      PharmacyDatabase.addNotification(
        `UPI Payment Received: ₹${amt.toFixed(2)}`,
        `Received ₹${amt.toFixed(2)} on ${hospitalUpiId} for ${patientName || "Mr. G KUMAR"}. Ref: ${ref}`,
        "success",
      )
      window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    } catch (e) {
      console.error(e)
    }

    setTimeout(() => {
      setPaymentToast(null)
    }, 6000)
  }

  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  useEffect(() => {
    const savedRx = localStorage.getItem("_v2_pharmacy_dispense_rx")
    if (savedRx) {
      setRxId(savedRx)
      localStorage.removeItem("_v2_pharmacy_dispense_rx")
      setTimeout(() => autoLoadRx(savedRx), 100)
    }
  }, [])

  const autoLoadRx = (targetRxId: string) => {
    const prescriptions = PharmacyDatabase.getPrescriptions()
    const rx = prescriptions.find((p) => p.id === targetRxId)
    if (!rx) return

    setLoadedRxMeta(rx)
    setPatientName(rx.patientName || (rx as any).patient || "Patient")

    const newCart: any[] = []
    const allMedicines = PharmacyDatabase.getMedicines()

    const outOfStock: string[] = []
    const notFound: string[] = []

    const rawItems = Array.isArray(rx.items) ? rx.items : []
    rawItems.forEach((item) => {
      if (!item || typeof item !== "object") return
      const itemName = typeof item.medicineName === "string" ? item.medicineName.trim() : ""
      if (!itemName) return

      let med = allMedicines.find((m) => m.id === item.medicineId)
      if (!med) {
        med = allMedicines.find((m) => {
          const mMedName = typeof m.medicineName === "string" ? m.medicineName.toLowerCase().trim() : ""
          const mBrandName = typeof m.brandName === "string" ? m.brandName.toLowerCase().trim() : ""
          const target = itemName.toLowerCase()
          return mMedName === target || mBrandName === target
        })
      }
      if (!med) {
        // Looser fallback: match partial names like "Amoxicillin" matching "Amoxicillin 500mg"
        med = allMedicines.find((m) => {
          const mMedName = typeof m.medicineName === "string" ? m.medicineName.toLowerCase().trim() : ""
          const target = itemName.toLowerCase()
          return (
            (mMedName && target.includes(mMedName)) ||
            (target && mMedName.includes(target))
          )
        })
      }

      if (!med) {
        notFound.push(itemName)
        return
      }
      const batches = PharmacyDatabase.getBatches().filter(
        (b) => b && b.medicineId === med!.id,
      )
      let { splits } = PharmacyDatabase.executeFEFOSplit(
        med.id,
        item.quantity || 1,
        batches,
      )

      if (splits.length === 0 && batches.some((b) => (b.availableQuantity || 0) > 0)) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const available = batches
          .filter(
            (b) =>
              (b.availableQuantity || 0) > 0 &&
              (!b.expiryDate || new Date(b.expiryDate).getTime() >= today.getTime()),
          )
          .sort(
            (a, b) =>
              new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
          )
        let remaining = item.quantity || 1
        for (const b of available) {
          if (remaining <= 0) break
          const take = Math.min(b.availableQuantity, remaining)
          splits.push({ batch: b, usedQty: take })
          remaining -= take
        }
      }

      if (splits.length === 0) {
        outOfStock.push(itemName)
      }

      const medMrp = (med as any).mrp !== undefined && (med as any).mrp !== null ? Number((med as any).mrp) : 10
      const medPurchasePrice = (med as any).purchasePrice !== undefined && (med as any).purchasePrice !== null ? Number((med as any).purchasePrice) : +(medMrp * 0.75).toFixed(2)

      splits.forEach((split) => {
        const b = split.batch
        const batchMrp = (b as any).mrp !== undefined && (b as any).mrp !== null ? Number((b as any).mrp) : medMrp
        const batchRate = b.purchasePrice !== undefined && b.purchasePrice !== null ? Number(b.purchasePrice) : (medPurchasePrice || +(batchMrp * 0.75).toFixed(2))
        const qty = split.usedQty || 1
        const taxRate = med!.taxPercentage ?? 5
        const itemTotal = batchMrp * qty * (1 + taxRate / 100)

        newCart.push({
          id: Date.now() + Math.random(),
          medicineId: med!.id,
          batchId: b.id,
          medicine: med!.brandName || med!.medicineName,
          generic: med!.genericName,
          form: med!.dosageForm || (med as any).form || "TABLET",
          packing: (med as any).packing || (med as any).pack || "",
          batch: b.batchNumber,
          expiry: b.expiryDate,
          qty: qty,
          mrp: batchMrp,
          rate: batchRate,
          discount: 0,
          tax: taxRate,
          hsnCode: med!.hsnCode || "3004 039",
          mnf: (med as any).mnfCode || (med!.manufacturer ? med!.manufacturer.substring(0, 4).toUpperCase() : "MANK"),
          sh: med!.scheduleType || "H",
          binNo: (b as any).location || (med as any).binNo || "",
          total: isNaN(itemTotal) ? 0 : itemTotal,
        })
      })
    })
    setCart(newCart)

    if (outOfStock.length > 0 || notFound.length > 0) {
      let msg = "Could not load all items from prescription:\n\n"
      if (outOfStock.length > 0)
        msg += `Out of Stock (Need GRN): ${outOfStock.join(", ")}\n`
      if (notFound.length > 0)
        msg += `Not in Medicine Master: ${notFound.join(", ")}\n`
      alert(msg)
    }
  }

  const loadPrescriptionFEFO = () => {
    if (!rxId) return alert("Enter Prescription ID")
    autoLoadRx(rxId)
  }

  const filteredMeds =
    searchQuery.trim().length > 0
      ? medicines
          .filter((m) => {
            const q = searchQuery.toLowerCase().trim()
            return (
              m.name.toLowerCase().includes(q) ||
              (m.generic && m.generic.toLowerCase().includes(q)) ||
              (m.mnfCode && m.mnfCode.toLowerCase().includes(q)) ||
              (m.hsnCode && m.hsnCode.toLowerCase().includes(q)) ||
              (m.packing && m.packing.toLowerCase().includes(q)) ||
              (m.sku && m.sku.toLowerCase().includes(q)) ||
              (m.barcode && m.barcode.toLowerCase().includes(q))
            )
          })
          .slice(0, 8)
      : []

  const subtotal = cart.reduce((s, i) => s + i.mrp * i.qty, 0)
  const discountAmt = (subtotal * discount) / 100
  // Calculate exact GST splits for invoice based on each item
  let totalCGST = 0
  let totalSGST = 0
  cart.forEach((item) => {
    const taxable =
      item.mrp * item.qty - (item.mrp * item.qty * (item.discount || 0)) / 100
    const taxTotal = taxable * (item.tax / 100)
    totalCGST += taxTotal / 2
    totalSGST += taxTotal / 2
  })

  const grand = subtotal - discountAmt + totalCGST + totalSGST
  const roundOff = Math.round(grand) - grand
  const finalAmount = Math.round(grand)

  const updateQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const newQty = i.qty + delta
        if (newQty < 1) return i

        // Lookup available stock from batch or medicine
        const liveBatches = PharmacyDatabase.getBatches()
        const b = liveBatches.find((bat) => bat.id === i.batchId)
        const med = medicines.find((m) => m.id === i.medicineId)
        const maxStock = b ? (b.availableQuantity ?? b.quantity ?? 0) : (med?.stock ?? 0)

        if (delta > 0 && newQty > maxStock) {
          alert(`Cannot increase quantity! Only ${maxStock} unit(s) available in stock for batch ${i.batch || ""}.`)
          return i
        }

        return {
          ...i,
          qty: newQty,
          maxStock,
          total:
            newQty *
            i.mrp *
            (1 - (i.discount || 0) / 100) *
            (1 + (i.tax || 0) / 100),
        }
      }),
    )
  }
  const removeItem = (id: number) =>
    setCart((prev) => prev.filter((i) => i.id !== id))

  const addMedicine = (med: typeof medicines[0]) => {
    // 1. SAFETY CHECK: Block adding expired medicines
    const expInfo = getMedicineExpiryDetails(med)
    if (expInfo.isExpired) {
      alert(
        `⛔ CANNOT SELL "${med.name.toUpperCase()}"!\n\nThis medicine has EXPIRED (${expInfo.expiryDate}).\n\nSelling expired drugs to patients is strictly prohibited by pharmacy safety standards.\nPlease set aside this medicine and initiate a Supplier Return or Medicine Write-Off.`,
      )
      return
    }

    // 2. WARNING CHECK: Alert if ready to expire within 60 days
    if (expInfo.isNearExpiry) {
      alert(
        `⚠️ ATTENTION: READY TO EXPIRE!\n\n"${med.name}" is READY TO EXPIRE in ${expInfo.daysLeft} day(s) on ${expInfo.expiryDate}.\n\nPlease verify that the prescribed course will finish before the expiry date.`,
      )
    }

    const exists = cart.find((i) => i.medicine === med.name)
    if (exists) {
      const liveBatches = PharmacyDatabase.getBatches()
      const b = liveBatches.find((bat) => bat.id === exists.batchId)
      const maxStock = b ? (b.availableQuantity ?? b.quantity ?? 0) : (med.stock ?? 0)
      if (exists.qty >= maxStock) {
        alert(`Cannot add more "${med.name}". Maximum available stock is ${maxStock} unit(s)!`)
        return
      }
      updateQty(exists.id, 1)
      setSearchQuery("")
      return
    }

    // Use FEFO (First Expiry First Out) to pick the oldest available batch with stock > 0 that is NOT expired
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const allBatches = PharmacyDatabase.getBatches().filter(
      (b) => b.medicineId === med.id && (b.availableQuantity > 0 || (b.quantity && b.quantity > 0)),
    )
    const validBatches = allBatches.filter((b) => {
      if (!b.expiryDate) return true
      return new Date(b.expiryDate).getTime() >= today.getTime()
    })
    const sortedBatches = validBatches.sort(
      (a, b) =>
        new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
    )

    let b = sortedBatches.find((bat) => (bat.availableQuantity ?? bat.quantity ?? 0) > 0)
    if (!b) {
      if (med.stock > 0 && !expInfo.isExpired) {
        // Auto-allocate batch from medicine master stock
        b = {
          id: "BAT_AUTO_" + Date.now(),
          medicineId: med.id,
          batchNumber: (med as any).batchNumber || "B" + Math.floor(100000 + Math.random() * 900000),
          expiryDate: (med as any).expiryDate || "2028-12-31",
          manufacturingDate: new Date().toISOString().split("T")[0],
          quantity: med.stock,
          availableQuantity: med.stock,
          mrp: med.mrp,
          purchasePrice: (med as any).purchasePrice || med.mrp * 0.75,
          createdAt: new Date().toISOString(),
        } as any
        PharmacyDatabase.addBatch(b)
      } else {
        alert(`Cannot add "${med.name}". No non-expired stock available!`)
        return
      }
    }

    if (!b) {
      alert(`Cannot add "${med.name}". No valid batch found!`)
      return
    }

    // Double-check batch expiry
    if (b.expiryDate && new Date(b.expiryDate).getTime() < today.getTime()) {
      alert(`⛔ Cannot sell "${med.name}"! Batch ${b.batchNumber} has expired on ${b.expiryDate}.`)
      return
    }

    const availableStock = b.availableQuantity ?? b.quantity ?? med.stock ?? 0
    if (availableStock <= 0) {
      alert(`Cannot add "${med.name}". Out of stock (0 units available)!`)
      return
    }

    const taxPct = med.gst !== undefined ? med.gst : 5
    const itemMrp = b.mrp || med.mrp || 0

    const newItem = {
      id: Date.now() + Math.random(),
      medicineId: med.id,
      batchId: b.id,
      medicine: med.name,
      form: med.form || (med as any).dosageForm || "TABLET",
      packing: (med as any).packing || (med as any).pack || "",
      generic: med.generic,
      batch: b.batchNumber,
      expiry: b.expiryDate,
      qty: 1,
      maxStock: availableStock,
      mrp: itemMrp,
      rate: b.purchasePrice || (med as any).purchasePrice || +(itemMrp * 0.75).toFixed(2),
      discount: 0,
      tax: taxPct,
      hsnCode: (med as any).hsnCode || med.sku || "3004 039",
      mnf: (med as any).mnfCode || (med.manufacturer ? med.manufacturer.substring(0, 3).toUpperCase() : "MAN"),
      sh: med.schedule || "H",
      binNo: (b as any).location || (med as any).binNo || "",
      total: itemMrp * (1 + taxPct / 100),
    }
    setCart((prev) => [...prev, newItem])
    setSearchQuery("")
  }

  useEffect(() => {
    if (finalAmount > 0) {
      const half = Math.round(finalAmount / 2)
      setSplitAmount1(half)
      setSplitAmount2(finalAmount - half)
    }
  }, [finalAmount])

  const handleSplitAmount1Change = (val: number) => {
    setSplitAmount1(val)
    setSplitAmount2(Math.max(0, finalAmount - val))
  }

  const handleQuickHalfSplit = () => {
    const half = Math.round(finalAmount / 2)
    setSplitAmount1(half)
    setSplitAmount2(finalAmount - half)
  }

  const openChangePaymentModal = (billRecord: any) => {
    setEditingBill(billRecord)
    const mode = (billRecord.paymentMode || "").toLowerCase()
    const total = billRecord.totalAmount || 0

    if (
      mode.includes("split") ||
      Object.keys(billRecord.paymentsData?.amounts || {}).length > 1
    ) {
      setEditPaymentMode("split")
      const amounts = billRecord.paymentsData?.amounts || {}
      const keys = Object.keys(amounts)
      const m1 = (keys[0]?.toLowerCase() as any) || "cash"
      const m2 = (keys[1]?.toLowerCase() as any) || "upi"
      const a1 = Number(amounts[keys[0]]) || Math.round(total / 2)
      const a2 = Number(amounts[keys[1]]) || total - a1
      setEditSplitMethod1(m1 === "card" || m1 === "upi" ? m1 : "cash")
      setEditSplitAmount1(a1)
      setEditSplitMethod2(m2 === "card" || m2 === "cash" ? m2 : "upi")
      setEditSplitAmount2(a2)
      setEditSplitRef1((billRecord.paymentsData?.refs as any)?.[keys[0]] || "")
      setEditSplitRef2((billRecord.paymentsData?.refs as any)?.[keys[1]] || "")
    } else if (mode.includes("upi")) {
      setEditPaymentMode("upi")
      setEditUpiRef((billRecord.paymentsData?.refs as any)?.upi || (billRecord.paymentsData?.refs as any)?.UPI || "")
    } else if (mode.includes("card")) {
      setEditPaymentMode("card")
      setEditCardRef((billRecord.paymentsData?.refs as any)?.card || (billRecord.paymentsData?.refs as any)?.Card || "")
    } else {
      setEditPaymentMode("cash")
      setEditCashTendered(0)
    }
  }

  const handleEditSplitAmount1Change = (val: number) => {
    setEditSplitAmount1(val)
    const total = editingBill?.totalAmount || 0
    setEditSplitAmount2(Math.max(0, total - val))
  }

  const handleEditQuickHalfSplit = () => {
    const total = editingBill?.totalAmount || 0
    const half = Math.round(total / 2)
    setEditSplitAmount1(half)
    setEditSplitAmount2(total - half)
  }

  const saveUpdatedPaymentMode = () => {
    if (!editingBill) return

    const total = editingBill.totalAmount || 0
    let updatedMode = "Cash"
    let updatedPaymentsData: {
      amounts: Record<string, number>
      refs: Record<string, string>
    } = {
      amounts: {},
      refs: {},
    }

    if (editPaymentMode === "cash") {
      updatedMode = "Cash"
      updatedPaymentsData = {
        amounts: { Cash: total },
        refs: {},
      }
    } else if (editPaymentMode === "upi") {
      updatedMode = "UPI"
      updatedPaymentsData = {
        amounts: { UPI: total },
        refs: editUpiRef ? { UPI: editUpiRef } : {},
      }
    } else if (editPaymentMode === "card") {
      updatedMode = "Card"
      updatedPaymentsData = {
        amounts: { Card: total },
        refs: editCardRef ? { Card: editCardRef } : {},
      }
    } else if (editPaymentMode === "split") {
      const a1 = Number(editSplitAmount1) || 0
      const a2 = Number(editSplitAmount2) || 0
      if (a1 + a2 !== total) {
        alert(
          `Split amounts (₹${(a1 + a2).toFixed(2)}) must equal total bill amount (₹${total.toFixed(2)}).`,
        )
        return
      }
      updatedMode = `Split (${editSplitMethod1.toUpperCase()} ₹${a1} + ${editSplitMethod2.toUpperCase()} ₹${a2})`
      updatedPaymentsData = {
        amounts: {
          [editSplitMethod1.toUpperCase()]: a1,
          [editSplitMethod2.toUpperCase()]: a2,
        },
        refs: {
          ...(editSplitRef1 ? { [editSplitMethod1.toUpperCase()]: editSplitRef1 } : {}),
          ...(editSplitRef2 ? { [editSplitMethod2.toUpperCase()]: editSplitRef2 } : {}),
        },
      }
    }

    const updated = PharmacyDatabase.updatePharmacyBill(editingBill.id || editingBill.billNumber, {
      paymentMode: updatedMode,
      billType: updatedMode as any,
      paymentsData: updatedPaymentsData,
    })

    PharmacyDatabase.logAudit(
      "Pharmacist (You)",
      "Updated",
      "Billing",
      editingBill.billNumber,
      `Payment mode changed from ${editingBill.paymentMode} to ${updatedMode}`,
    )

    window.dispatchEvent(new Event("storage"))
    window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    refresh()
    setEditingBill(null)

    const billToPrint = updated || {
      ...editingBill,
      paymentMode: updatedMode,
      billType: updatedMode,
      paymentsData: updatedPaymentsData,
    }
    alert(`Payment mode for bill #${editingBill.billNumber} successfully updated to ${updatedMode}! Opening updated bill receipt...`)
    setPrintBill(billToPrint)
  }

  const totalPaid = Object.values(payments).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  )
  const balanceDue = finalAmount - totalPaid
  const isPaid = balanceDue <= 0 && finalAmount > 0

  const confirmCardPayment = (amount: number, refCode?: string) => {
    const amt = Number(amount) || (balanceDue > 0 ? balanceDue : finalAmount) || 1
    const ref = refCode || "AUTH_" + Math.floor(100000 + Math.random() * 900000)

    setPayments((prev) => ({ ...prev, card: amt }))
    setPaymentRefs((prev) => ({ ...prev, card: ref }))

    // Play chime sound
    playPaymentChime()

    // Show floating toast
    setPaymentToast({
      show: true,
      title: `₹${amt.toFixed(2)} Card Payment Approved!`,
      message: `Card terminal transaction approved. Auth Code: ${ref}. Deducted from bill.`,
      amount: amt,
      ref,
    })

    // Store notification in database
    try {
      PharmacyDatabase.addNotification(
        `Card Payment Received: ₹${amt.toFixed(2)}`,
        `Received ₹${amt.toFixed(2)} via Debit/Credit Card for ${patientName || "Mr. G KUMAR"}. Auth: ${ref}`,
        "success",
      )
      window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    } catch (e) {
      console.error(e)
    }

    setTimeout(() => {
      setPaymentToast(null)
    }, 6000)
  }

  const handlePhysicalPOSPayment = (amount: number) => {
    setPosStatus("Connecting to POS Terminal (192.168.1.100)...")

    // Simulate network delay to POS machine
    setTimeout(
      () => {
        setPosStatus("Waiting for Patient to Swipe/Tap Card...")

        // Simulate patient swiping card and POS sending webhook back
        setTimeout(
          () => {
            setPosStatus("Approved!")
            const authRef = "POS_AUTH_" + Math.floor(100000 + Math.random() * 900000)
            confirmCardPayment(amount, authRef)

            // Clear status after 2 seconds
            setTimeout(() => setPosStatus(null), 2000)
          },
          2500,
        )
      },
      800,
    )
  }

  const handleRazorpayPayment = (method: string, amount: number) => {
    if (!(window as any).Razorpay) {
      alert(
        "Payment Gateway failed to load. Please check your internet connection.",
      )
      return
    }

    const options = {
      // Razorpay key id (public, not a secret): set VITE_RAZORPAY_KEY_ID to the live key in production.
      key: (import.meta as any).env?.VITE_RAZORPAY_KEY_ID || "rzp_test_TYrv3Z5h61z8uC",
      amount: Math.round(amount * 100), // Convert INR to Paisa
      currency: "INR",
      name: "Global Hospital Pharmacy",
      description: "Pharmacy Bill Payment",
      image: "https://cdn-icons-png.flaticon.com/512/3063/3063126.png",
      handler: function (response: any) {
        // Success callback triggered instantly by bank webhook
        confirmCardPayment(amount, response.razorpay_payment_id)
      },
      prefill: {
        name: patientName || "Walk-in Patient",
      },
      theme: {
        color: "#0F766E",
      },
    }

    const rzp1 = new (window as any).Razorpay(options)
    rzp1.on("payment.failed", function (response: any) {
      alert("Payment Failed! " + response.error.description)
    })
    rzp1.open()
  }
  const completeTransaction = () => {
    if (cart.length === 0) return

    // Real-world sequential bill ID generation
    const allBills = PharmacyDatabase.getBills()
    const year = new Date().getFullYear()
    const currentYearBills = allBills.filter((b) =>
      b.billNumber.startsWith(`BILL-${year}-`),
    )

    let nextSeq = 1
    if (currentYearBills.length > 0) {
      const sequences = currentYearBills
        .map((b) => {
          const parts = b.billNumber.split("-")
          return parts.length === 3 ? parseInt(parts[2], 10) : 0
        })
        .filter((n) => !isNaN(n))

      if (sequences.length > 0) {
        nextSeq = Math.max(...sequences) + 1
      }
    }

    const seqString = String(nextSeq).padStart(6, "0")
    const billId = `BILL-${year}-${seqString}`
    setLastBillId(billId)
    setPrintDate(new Date().toLocaleString())

    // Fetch prescription metadata to link the patient history globally
    let rxMeta = null
    if (rxId) {
      rxMeta = PharmacyDatabase.getPrescriptions().find((p) => p.id === rxId)
    }

    let finalPaymentMode = "Cash"
    let finalPaymentsData: {
      amounts: Record<string, number>
      refs: Record<string, string>
    } = { amounts: {}, refs: {} }

    if (selectedPaymentMode === "cash") {
      finalPaymentMode = "Cash"
      finalPaymentsData = {
        amounts: { Cash: finalAmount },
        refs: {},
      }
    } else if (selectedPaymentMode === "upi") {
      finalPaymentMode = "UPI"
      finalPaymentsData = {
        amounts: { UPI: finalAmount },
        refs: singleUpiRef ? { UPI: singleUpiRef } : {},
      }
    } else if (selectedPaymentMode === "card") {
      finalPaymentMode = "Card"
      finalPaymentsData = {
        amounts: { Card: finalAmount },
        refs: singleCardRef ? { Card: singleCardRef } : {},
      }
    } else if (selectedPaymentMode === "split") {
      const a1 = Number(splitAmount1) || 0
      const a2 = Number(splitAmount2) || 0
      finalPaymentMode = `Split (${splitMethod1.toUpperCase()} ₹${a1} + ${splitMethod2.toUpperCase()} ₹${a2})`
      finalPaymentsData = {
        amounts: {
          [splitMethod1.toUpperCase()]: a1,
          [splitMethod2.toUpperCase()]: a2,
        },
        refs: {
          ...(splitRef1 ? { [splitMethod1.toUpperCase()]: splitRef1 } : {}),
          ...(splitRef2 ? { [splitMethod2.toUpperCase()]: splitRef2 } : {}),
        },
      }
    }

    // Pre-validate stock availability and auto-reconcile for all cart items before proceeding
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const liveBatches = PharmacyDatabase.getBatches()
    for (const c of cart) {
      let b = liveBatches.find((bat) => bat.id === c.batchId)
      if (!b) {
        b = liveBatches.find((bat) => bat.medicineId === c.medicineId)
      }
      const available = b ? (b.availableQuantity ?? b.quantity ?? 0) : 0
      if (c.qty > available) {
        if (b) {
          b.availableQuantity = Math.max(c.qty, (b.quantity ?? 0))
          PharmacyDatabase.updateBatch(b.id, b)
        } else {
          const newBatchId = "BAT_" + Date.now() + "_" + Math.floor(Math.random() * 1000)
          PharmacyDatabase.addBatch({
            id: newBatchId,
            medicineId: c.medicineId,
            batchNumber: c.batch || "B" + Math.floor(100000 + Math.random() * 900000),
            expiryDate: c.expiry || "2028-12-31",
            manufacturingDate: new Date().toISOString().split("T")[0],
            quantity: c.qty,
            availableQuantity: c.qty,
            mrp: c.mrp,
            purchasePrice: c.rate || c.mrp * 0.75,
            createdAt: new Date().toISOString(),
          } as any)
          c.batchId = newBatchId
        }
      }
    }

    // Update DB
    const bill = {
      id: billId,
      billNumber: billId,
      patientId: rxMeta?.patientId || "WALK-IN",
      patientName: patientName || "Walk-in Patient",
      uhid: rxMeta?.uhid || "",
      doctorName: rxMeta?.doctorName || "Self",
      department: rxMeta?.department || "Pharmacy",
      billType: finalPaymentMode,
      paymentStatus: "Paid",
      paymentMode: finalPaymentMode,
      paymentsData: finalPaymentsData,
      prescriptionId: rxId || undefined,
      items: cart.map((c: any) => ({
        medicineId: c.medicineId,
        medicineName: c.packing && !c.medicine.includes(c.packing) ? `${c.medicine} (${c.packing})` : c.medicine,
        form: c.form || "TABLET",
        packing: c.packing || "",
        batchNumber: c.batch,
        expiryDate: c.expiry,
        quantity: c.qty,
        unitPrice: c.mrp,
        rate: c.rate || c.mrp,
        grossAmount: c.qty * c.mrp,
        discount: c.discount || 0,
        hsnCode: c.hsnCode || "3004 039",
        mnf: c.mnf || "MANK",
        sh: c.sh || "H",
        binNo: c.binNo || "",
        taxableAmount: c.total - c.total * (c.tax / (100 + c.tax)),
        cgstAmount: (c.total * (c.tax / (100 + c.tax))) / 2,
        sgstAmount: (c.total * (c.tax / (100 + c.tax))) / 2,
        tax: c.tax,
        totalPrice: c.total,
      })),
      subTotal: subtotal,
      discount: discountAmt,
      tax: totalCGST + totalSGST,
      taxableTotal: subtotal - discountAmt,
      cgstTotal: totalCGST,
      sgstTotal: totalSGST,
      totalAmount: finalAmount,
      totalPaid: finalAmount,
      balanceDue: 0,
      createdBy: "Pharmacist",
      createdAt: new Date().toISOString(),
    }

    PharmacyDatabase.addPharmacyBill(bill as any)
    setLastBillId(bill) // Pass the whole bill object to the modal

    // Update Batches & Medicine Stock
    const currentBatches = PharmacyDatabase.getBatches()
    const allMedicines = PharmacyDatabase.getMedicines()
    cart.forEach((c) => {
      const b = currentBatches.find((bat) => bat.id === c.batchId)
      if (b) {
        b.availableQuantity = Math.max(0, (b.availableQuantity ?? 0) - c.qty)
        PharmacyDatabase.updateBatch(b.id, b)

        PharmacyDatabase.addTransaction({
          id: "TXN" + Math.floor(Math.random() * 100000),
          date: new Date().toISOString(),
          medicineId: c.medicineId,
          batchId: c.batchId,
          quantity: c.qty,
          transactionType: "DISPENSED",
          userId: "Pharmacist",
          billId: billId,
        })
      }

      // Deduct from master medicine stock
      const med = allMedicines.find((m) => m.id === c.medicineId)
      if (med) {
        const curStock = (med as any).stock ?? (med as any).currentStock ?? 0
        const updatedStock = Math.max(0, curStock - c.qty)
        PharmacyDatabase.updateMedicine(med.id, {
          stock: updatedStock,
          currentStock: updatedStock,
        } as any)
      }
    })

    if (rxId) {
      PharmacyDatabase.updatePrescription(rxId, {
        status: "Dispensed",
        dispensingStatus: "Dispensed",
        paidAmount: finalAmount,
        remainingDue: 0,
      } as any)
    }

    PharmacyDatabase.logAudit(
      "Pharmacist (You)",
      "Created",
      "Billing",
      billId,
      "Created bill for " + finalAmount,
    )

    // Push real-time notification for sale & dispense completion
    try {
      PharmacyDatabase.addNotification(
        `Sale & Dispense Completed (${billId})`,
        `Successfully dispensed ${cart.length} item(s) for ${patientName || "Walk-in Patient"}. Bill Total: ₹${finalAmount.toFixed(2)} via ${bill.paymentMode}.`,
        "success",
      )
      window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    } catch (e) {
      console.error(e)
    }

    playPaymentChime()
    setPaymentToast({
      show: true,
      title: `Transaction Completed (${billId})`,
      message: `Dispensed ${cart.length} item(s) for ${patientName || "Mr. G KUMAR"}. Bill Total: ₹${finalAmount.toFixed(2)}.`,
      amount: finalAmount,
      ref: billId,
    })

    refresh()
    setShowInvoice(true)
  }

  const closeInvoice = () => {
    setShowInvoice(false)
    setCart([])
    setRxId("")
    setPatientName("")
    setPayments({})
    setPaymentRefs({})
    setTenderedCash(0)
    setDiscount(0)
    setSelectedPaymentMode("cash")
    setCashTendered(0)
    setSingleUpiRef("")
    setSingleCardRef("")
    setSplitMethod1("cash")
    setSplitMethod2("upi")
    setSplitAmount1(0)
    setSplitAmount2(0)
    setSplitRef1("")
    setSplitRef2("")
    refresh()
  }

  // Below lg the payment panel stacks under the cart and the page scrolls as
  // one column; side by side, a phone left the cart about 24px wide.
  return (
    <div className="flex flex-col lg:flex-row lg:h-full lg:overflow-hidden relative">
      {/* Real-time Payment Success Notification Toast */}
      {paymentToast && (
        <div className="fixed top-5 right-5 z-[9999] max-w-md w-full bg-white border-2 border-emerald-500 rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top-4 duration-300">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={22} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-[14px] font-bold text-emerald-900">
                {paymentToast.title}
              </h4>
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                REAL-TIME
              </span>
            </div>
            <p className="text-[12px] text-emerald-700 mt-0.5">
              {paymentToast.message}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-emerald-800 bg-emerald-50 p-1.5 rounded border border-emerald-200">
              <span>Ref / UTR: <strong>{paymentToast.ref}</strong></span>
              <span className="ml-auto font-bold text-emerald-700">Deducted from Bill ✓</span>
            </div>
          </div>
          <button
            onClick={() => setPaymentToast(null)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Invoice Modal Overlay */}
      {showInvoice && lastBillId && (
        <InvoicePrintModal bill={lastBillId as any} onClose={closeInvoice} autoPrint={true} />
      )}

      {printBill && (
        <InvoicePrintModal
          bill={printBill}
          onClose={() => setPrintBill(null)}
          autoPrint={true}
        />
      )}

      {/* Main Container */}

      <div className="flex-1 min-w-0 flex flex-col lg:overflow-hidden print:hidden bg-[#F8FAFC]">
        <div className="p-6 pb-0">
          <PageHeader
            breadcrumbs={[
              { label: "Pharmacy" },
              { label: "Dispensing & Billing" },
            ]}
            title="Dispensing & Billing"
            description={
              activeTab === "new_sale" ? "New sale · POS" : "Past transactions"
            }
            actions={
              <div className="flex rounded border border-[#E2E8F0] overflow-hidden text-[13px]">
                <button
                  onClick={() => setActiveTab("new_sale")}
                  className="px-5 py-2 font-medium transition-colors"
                  style={{
                    background: activeTab === "new_sale" ? "#0F1624" : "#fff",
                    color: activeTab === "new_sale" ? "#fff" : "#64748B",
                  }}
                >
                  New Sale
                </button>
                <button
                  onClick={() => setActiveTab("sales_history")}
                  className="px-5 py-2 font-medium transition-colors"
                  style={{
                    background:
                      activeTab === "sales_history" ? "#0F1624" : "#fff",
                    color: activeTab === "sales_history" ? "#fff" : "#64748B",
                  }}
                >
                  Sales History
                </button>
              </div>
            }
            onNavigate={onNavigate}
          />
        </div>

        {activeTab === "sales_history" ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden flex flex-col">
              <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC]">
                <h3 className="font-bold text-[15px] text-[#0F1624]">
                  Completed Transactions
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("hospai_pharmacy_toast", {
                          detail: { message: "Customer Add modal opened!" },
                        }),
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#E2E8F0] text-[12px] font-medium text-[#334155] hover:bg-[#F5F7FA]"
                  >
                    <Plus size={14} /> Add Customer
                  </button>
                  <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded px-3 py-1.5 w-64">
                    <Search size={14} className="text-[#94A3B8]" />
                    <input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search bill no or patient..."
                      className="text-[13px] outline-none text-[#0F1624] placeholder:text-[#94A3B8] flex-1"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <button
                  onClick={() => {
                    setActiveTab("new_sale")
                    closeInvoice()
                  }}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded text-[13px] font-semibold text-[#1B4FD8] bg-[#EFF6FF] hover:bg-[#DBEAFE] transition-colors"
                >
                  <Plus size={14} /> New Sale
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#F8FAFC] sticky top-0 border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-5 py-3 text-[12px] font-bold text-[#475569] uppercase tracking-wider">
                        Bill No
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold text-[#475569] uppercase tracking-wider">
                        Date & Time
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold text-[#475569] uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold text-[#475569] uppercase tracking-wider">
                        Items
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold text-[#475569] uppercase tracking-wider">
                        Payment
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold text-[#475569] uppercase tracking-wider text-right">
                        Total (₹)
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold text-[#475569] uppercase tracking-wider text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {bills
                      .filter((b) => {
                        if (!historySearch) return true
                        const q = historySearch.toLowerCase().trim()
                        const qDigits = q.replace(/\D/g, "")
                        const bNo = (b.billNumber || "").toLowerCase()
                        const pName = (b.patientName || "").toLowerCase()
                        const uhid = (b.uhid || "").toLowerCase()
                        const bDigits = bNo.replace(/\D/g, "")
                        return (
                          bNo.includes(q) ||
                          pName.includes(q) ||
                          uhid.includes(q) ||
                          (qDigits.length >= 2 && bDigits.endsWith(qDigits))
                        )
                      })
                      .map((inv, i) => {
                        const isModified =
                          inv.isModifiedReturnBill ||
                          inv.billNumber?.startsWith("MOD-")
                        const billReturns = PharmacyDatabase.getReturnsForBill(
                          inv.billNumber,
                        )
                        const hasReturns = billReturns.length > 0
                        const totalRefunded = billReturns.reduce(
                          (s, r) => s + (r.refundAmount || 0),
                          0,
                        )

                        return (
                          <tr
                            key={i}
                            className="hover:bg-[#F0FDFA] transition-colors"
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[12px] font-semibold text-[#0F766E]">
                                  {inv.billNumber}
                                </span>
                                {isModified && (
                                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${(inv.totalAmount || 0) === 0 ? "bg-emerald-100 text-emerald-800" : "bg-purple-100 text-purple-700"}`}>
                                    {(inv.totalAmount || 0) === 0 ? "FULLY RETURNED" : "MODIFIED"}
                                  </span>
                                )}
                                {hasReturns && !isModified && (
                                  <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 font-bold rounded">
                                    RETURN PROCESSED
                                  </span>
                                )}
                              </div>
                              {isModified && inv.originalBillNumber && (
                                <span className="block text-[11px] text-[#94A3B8] font-mono">
                                  Original: {inv.originalBillNumber}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-[12px] text-[#64748B]">
                              {new Date(
                                inv.createdAt ||
                                  (inv as any).date ||
                                  (inv as any).billDate,
                              ).toLocaleString()}
                            </td>
                            <td className="px-5 py-3 font-medium text-[13px] text-[#0F1624]">
                              {inv.patientName}
                            </td>
                            <td className="px-5 py-3 text-[13px] text-center">
                              {inv.items ? inv.items.length : 0}
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#E8EDF5] text-[#0F766E]">
                                {inv.paymentMode || "Cash"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-[13px] font-bold text-[#0F1624] text-right">
                              <div>
                                ₹
                                {(inv.totalAmount || 0).toLocaleString(
                                  "en-IN",
                                  {
                                    minimumFractionDigits: 2,
                                  },
                                )}
                              </div>
                              {hasReturns && !isModified && (
                                <div className="text-[11px] text-red-500 font-normal">
                                  -₹
                                  {totalRefunded.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}{" "}
                                  refund
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openChangePaymentModal(inv)}
                                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-700 transition-colors inline-flex items-center gap-1 shadow-2xs"
                                  title="Change Payment Mode & Reprint"
                                >
                                  <ArrowRightLeft size={12} />
                                  <span>Change Mode</span>
                                </button>
                                <button
                                  onClick={() => setPrintBill(inv)}
                                  className="p-1.5 rounded bg-white border border-[#E2E8F0] hover:bg-[#F0F2F5] text-[#475569] transition-colors inline-flex items-center justify-center shadow-2xs"
                                  title="Print Bill"
                                >
                                  <Printer size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    {bills.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="text-center py-12 text-[#94A3B8] text-[13px]"
                        >
                          No sales recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 flex flex-col">
            {/* Patient / Rx Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                      Prescription ID
                    </label>
                    <input
                      value={rxId}
                      onChange={(e) => setRxId(e.target.value)}
                      placeholder="e.g. RX-2026-1041"
                      className="w-full px-3 py-2 rounded border border-[#E2E8F0] text-[13px] text-[#0F1624] focus:border-[#0F766E] focus:outline-none transition-colors bg-[#F5F7FA] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">
                      Patient Name
                    </label>
                    <input
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-[#E2E8F0] text-[13px] text-[#0F1624] focus:border-[#0F766E] focus:outline-none transition-colors bg-[#F5F7FA] focus:bg-white"
                    />
                  </div>
                </div>
                <button
                  onClick={loadPrescriptionFEFO}
                  className="bg-[#0F766E] text-white px-5 py-2 h-[42px] rounded-lg text-[13px] font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all whitespace-nowrap cursor-pointer"
                >
                  Load Rx & Auto-Allocate
                </button>
              </div>

              {/* Time of Arrival & Prescribing Doctor info pill */}
              {loadedRxMeta && (
                <div className="flex items-center gap-4 text-[12px] bg-teal-50 border border-teal-200/80 rounded-lg px-3 py-2 text-[#0F766E] flex-wrap">
                  <span className="font-semibold">
                    👤 Dr: <span className="font-bold text-[#0F1624]">{loadedRxMeta.doctorName || "Treating Physician"}</span>
                  </span>
                  {loadedRxMeta.department && (
                    <span>Dept: <span className="font-semibold text-[#0F1624]">{loadedRxMeta.department}</span></span>
                  )}
                  {(loadedRxMeta.arrivalTime || loadedRxMeta.time || loadedRxMeta.createdAt) && (
                    <span className="ml-auto font-semibold flex items-center gap-1.5 bg-white px-2.5 py-0.5 rounded border border-teal-200">
                      ⏰ Time of Arrival:{" "}
                      <span className="font-bold text-[#0F766E]">
                        {loadedRxMeta.arrivalTime || loadedRxMeta.time || new Date(loadedRxMeta.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Medicine Search */}
            <div className="relative">
              <div className="flex items-center gap-2 bg-white rounded-xl shadow-sm border border-[#E2E8F0] px-5 py-3 focus-within:border-[#0F766E] focus-within:ring-4 focus-within:ring-[#0F766E]/10 transition-all">
                <Search size={16} className="text-[#64748B] flex-shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search medicine by name, generic, SKU or scan barcode..."
                  className="flex-1 text-[14px] text-[#0F1624] outline-none placeholder:text-[#94A3B8]"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}>
                    <X size={14} className="text-[#94A3B8]" />
                  </button>
                )}
              </div>
              {filteredMeds.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-xl border border-[#E2E8F0] shadow-2xl overflow-hidden max-h-[360px] overflow-y-auto">
                  {filteredMeds.map((m) => {
                    const expInfo = getMedicineExpiryDetails(m)
                    return (
                      <button
                        key={m.id}
                        onClick={() => addMedicine(m)}
                        className={`w-full flex items-center px-4 py-3 transition-colors border-b border-[#F0F2F5] last:border-0 ${
                          expInfo.isExpired
                            ? "bg-red-50/70 hover:bg-red-100/80 border-l-4 border-l-red-500 cursor-not-allowed"
                            : expInfo.isNearExpiry
                              ? "bg-amber-50/60 hover:bg-amber-100/70 border-l-4 border-l-amber-500"
                              : "hover:bg-[#F5F7FA]"
                        }`}
                      >
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-semibold text-[#0F1624]">
                              {m.name}
                            </p>
                            {expInfo.isExpired && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 border border-red-300">
                                ⛔ EXPIRED ({expInfo.expiryDate})
                              </span>
                            )}
                            {expInfo.isNearExpiry && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                ⚠️ Ready to Expire ({expInfo.daysLeft}d left)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            {(m as any).mnfCode || m.manufacturer} · Pack: {(m as any).packing || "1's"} · HSN: {(m as any).hsnCode || m.sku || "3004 039"}{m.generic ? ` · (${m.generic})` : ""}
                            {expInfo.isExpired ? (
                              <span className="text-red-600 font-bold ml-1.5">
                                · DO NOT SELL
                              </span>
                            ) : expInfo.isNearExpiry ? (
                              <span className="text-amber-700 font-semibold ml-1.5">
                                · Expiry: {expInfo.expiryDate}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-[13px] font-bold text-[#0F1624]">
                            ₹{Number(m.mrp).toFixed(2)}
                          </p>
                          <p
                            className="text-[11px]"
                            style={{
                              color: expInfo.isExpired
                                ? "#dc2626"
                                : m.stock > 50
                                  ? "#15803d"
                                  : m.stock > 0
                                    ? "#d97706"
                                    : "#dc2626",
                            }}
                          >
                            {expInfo.isExpired ? "Expired Stock" : m.stock > 0 ? `Stock: ${m.stock}` : "Out of stock"}
                          </p>
                        </div>
                        <div
                          className="ml-3 w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                          style={{
                            background: expInfo.isExpired ? "#FEE2E2" : expInfo.isNearExpiry ? "#FEF3C7" : "#E8EDF5",
                          }}
                        >
                          {expInfo.isExpired ? (
                            <span className="text-red-600 font-bold text-xs" title="Expired - Cannot Add">⛔</span>
                          ) : (
                            <Plus size={14} style={{ color: expInfo.isNearExpiry ? "#D97706" : "#0F766E" }} />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cart Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
              <table>
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="text-left px-5 py-4 bg-[#F8FAFC] text-[12px] font-extrabold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                      Medicine
                    </th>
                    <th className="text-left px-5 py-4 bg-[#F8FAFC] text-[12px] font-extrabold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                      Batch
                    </th>
                    <th className="text-left px-5 py-4 bg-[#F8FAFC] text-[12px] font-extrabold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                      Expiry
                    </th>
                    <th className="text-center px-5 py-4 bg-[#F8FAFC] text-[12px] font-extrabold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                      Qty
                    </th>
                    <th className="text-right px-5 py-4 bg-[#F8FAFC] text-[12px] font-extrabold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                      MRP (₹)
                    </th>
                    <th className="text-center px-5 py-4 bg-[#F8FAFC] text-[12px] font-extrabold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                      Tax%
                    </th>
                    <th className="text-right px-5 py-4 bg-[#F8FAFC] text-[12px] font-extrabold text-[#475569] uppercase tracking-wider border-b border-[#E2E8F0]">
                      Total (₹)
                    </th>
                    <th className="px-5 py-4 bg-[#F8FAFC] border-b border-[#E2E8F0]"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-12 text-center text-[#94A3B8]"
                      >
                        <Search size={28} className="mx-auto mb-2 opacity-40" />
                        <p className="font-medium">No medicines added</p>
                        <p className="text-[12px] mt-1">
                          Search or Load Rx above
                        </p>
                      </td>
                    </tr>
                  ) : (
                    cart.map((item, i) => (
                      <tr key={i} className="hover:bg-[#F0FDFA] transition-colors border-b border-[#E2E8F0] last:border-0 hover:bg-[#F5F7FA]"
                      >
                        <td className="px-5 py-4 font-medium text-[13px] text-[#0F1624]">
                          <div>{item.medicine}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {item.mnf || "MANK"} · Pack: {item.packing || "1's"} · HSN: {item.hsnCode || "3004 039"}{item.rate ? ` · Rate: ₹${Number(item.rate).toFixed(2)}` : ""}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[#64748B] font-mono text-[12px]">
                          {item.batch}
                        </td>
                        <td className="px-5 py-4 text-[13px]">
                          <span className="text-[#64748B] font-mono">{item.expiry}</span>
                          {(() => {
                            if (!item.expiry) return null
                            const exp = new Date(item.expiry)
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                            if (diffDays <= 0) {
                              return (
                                <span className="block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                  ⛔ EXPIRED
                                </span>
                              )
                            }
                            if (diffDays <= 60) {
                              return (
                                <span className="block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  ⚠️ Expiring in {diffDays}d
                                </span>
                              )
                            }
                            return null
                          })()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => updateQty(item.id, -1)}
                                disabled={item.qty <= 1}
                                className="p-1 hover:bg-[#DDE2EC] disabled:opacity-30 rounded text-[#64748B]"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-8 text-center font-bold text-[13px] text-[#0F1624]">
                                {item.qty}
                              </span>
                              <button
                                onClick={() => updateQty(item.id, 1)}
                                disabled={item.maxStock !== undefined && item.qty >= item.maxStock}
                                title={item.maxStock !== undefined && item.qty >= item.maxStock ? `Maximum available stock reached (${item.maxStock} units)` : "Increase quantity"}
                                className="p-1 hover:bg-[#DDE2EC] disabled:opacity-30 disabled:cursor-not-allowed rounded text-[#64748B]"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            {item.maxStock !== undefined && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${item.qty >= item.maxStock ? "bg-amber-100 text-amber-800" : "bg-teal-50 text-teal-700"}`}>
                                Stock: {item.maxStock}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right text-[13px] text-[#0F1624]">
                          {(item.mrp || 0).toFixed(2)}
                        </td>
                        <td className="px-5 py-4 text-center text-[13px] text-[#0F1624]">
                          {item.tax || 0}%
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-[13px] text-[#0F1624]">
                          {(item.total || 0).toFixed(2)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-[#94A3B8] hover:text-[#dc2626] transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Right: Payment summary (Only shown in New Sale tab) */}
      {activeTab === "new_sale" && (
        <div className="w-full lg:w-[420px] flex-shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-[#E2E8F0] shadow-[-10px_0_40px_rgba(0,0,0,0.04)] flex flex-col print:hidden z-10">
          <div className="p-6 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <h3 className="font-black text-[18px] text-[#0F1624] tracking-tight">
              Payment Summary
            </h3>
          </div>

          <div className="p-5 space-y-4 flex-1 overflow-y-auto">
            {/* Bill Breakup */}
            <div className="space-y-3 bg-[#F8FAFC] p-6 rounded-2xl border border-[#E2E8F0]">
              <div className="flex justify-between text-[13px] text-[#475569]">
                <span>Subtotal</span>
                <span className="font-medium text-[#0F1624]">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center text-[13px] text-[#475569]">
                <span>Discount</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-12 px-2 py-1 text-right border border-[#E2E8F0] bg-white text-[#0F1624] focus:border-[#0F766E] focus:outline-none"
                  />
                  <span className="text-[#94A3B8]">%</span>
                  <span className="font-medium text-[#16a34a]">
                    -₹{discountAmt.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between text-[13px] text-[#475569]">
                <span>CGST</span>
                <span className="font-medium text-[#0F1624]">
                  ₹{totalCGST.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[13px] text-[#475569]">
                <span>SGST</span>
                <span className="font-medium text-[#0F1624]">
                  ₹{totalSGST.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[13px] text-[#475569]">
                <span>Round Off</span>
                <span className="font-medium text-[#0F1624]">
                  ₹{roundOff > 0 ? "+" : ""}
                  {roundOff.toFixed(2)}
                </span>
              </div>

              <div className="h-px bg-[#DDE2EC] my-3"></div>

              {/* Total Bill Amount display */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1">
                <div className="flex justify-between items-center text-[12px] text-emerald-800 font-semibold uppercase tracking-wider">
                  <span>Total Amount Payable</span>
                  <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-full font-bold">
                    Net Bill
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-[11px] text-emerald-700">
                    Incl. Taxes & Discounts
                  </span>
                  <span className="text-[28px] font-black text-emerald-800 leading-none">
                    ₹{finalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Mode Selection */}
            <div className="space-y-3">
              <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                Select Payment Mode
              </label>

              {/* 4 Mode Buttons Grid */}
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((pm) => {
                  const Icon = pm.icon
                  const isSelected = selectedPaymentMode === pm.id
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setSelectedPaymentMode(pm.id as any)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                        isSelected
                          ? "bg-teal-700 text-white border-teal-700 shadow-md ring-2 ring-teal-500/30"
                          : "bg-white text-[#334155] border-[#E2E8F0] hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <Icon size={20} className={isSelected ? "text-white" : "text-teal-700"} />
                      <span className="text-[12px] font-bold">{pm.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Mode-Specific Controls */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 space-y-3 shadow-2xs">
                {/* CASH MODE */}
                {selectedPaymentMode === "cash" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-[#64748B]">Cash Payment:</span>
                      <span className="font-bold text-[#0F1624] text-[15px]">
                        ₹{finalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-medium text-[#475569]">
                          Cash Tendered by Patient (₹):
                        </label>
                        <input
                          type="number"
                          value={cashTendered || ""}
                          onChange={(e) => setCashTendered(Number(e.target.value))}
                          placeholder="e.g. 500"
                          className="w-28 px-2.5 py-1 text-right text-[13px] font-bold border border-[#CBD5E1] focus:border-[#0F766E] rounded outline-none"
                        />
                      </div>

                      {cashTendered > 0 && (
                        <div className="flex items-center justify-between text-[12px] pt-1">
                          <span className="text-[#64748B] font-semibold">Change Return:</span>
                          <span
                            className={`font-black text-[14px] px-2 py-0.5 rounded ${
                              cashTendered >= finalAmount
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            ₹{Math.max(0, cashTendered - finalAmount).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* UPI MODE */}
                {selectedPaymentMode === "upi" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-[#64748B]">UPI Payment:</span>
                      <span className="font-bold text-[#0F1624] text-[15px]">
                        ₹{finalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] p-2.5 rounded-lg font-medium flex items-center gap-2">
                        <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                        <span>Patient scans Pharmacy Counter QR Stand / Soundbox. No Transaction ID required.</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* CARD MODE */}
                {selectedPaymentMode === "card" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-[#64748B]">Card POS Payment:</span>
                      <span className="font-bold text-[#0F1624] text-[15px]">
                        ₹{finalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[#475569] mb-1">
                          POS Slip No / Auth Code (Optional):
                        </label>
                        <input
                          type="text"
                          value={singleCardRef}
                          onChange={(e) => setSingleCardRef(e.target.value)}
                          placeholder="e.g. POS-884920"
                          className="w-full px-2.5 py-1.5 text-[12px] border border-[#CBD5E1] focus:border-[#0F766E] rounded font-mono outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* SPLIT PAYMENT MODE */}
                {selectedPaymentMode === "split" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                      <span className="text-[12px] font-bold text-[#334155]">
                        Split Between 2 Methods
                      </span>
                      <button
                        type="button"
                        onClick={handleQuickHalfSplit}
                        className="text-[11px] px-2 py-0.5 bg-teal-100 hover:bg-teal-200 text-teal-800 rounded font-bold transition-colors cursor-pointer"
                        title="Split amount 50% / 50%"
                      >
                        ⚡ 50% / 50% Split
                      </button>
                    </div>

                    {/* Method 1 */}
                    <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#475569] uppercase">
                          Method 1:
                        </span>
                        <select
                          value={splitMethod1}
                          onChange={(e) => setSplitMethod1(e.target.value as any)}
                          className="text-[12px] font-semibold border border-[#CBD5E1] rounded px-2 py-1 bg-white outline-none"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#64748B]">Amount (₹):</span>
                        <input
                          type="number"
                          value={splitAmount1 || ""}
                          onChange={(e) => handleSplitAmount1Change(Number(e.target.value))}
                          placeholder="0.00"
                          className="w-28 px-2.5 py-1 text-right text-[13px] font-bold border border-[#CBD5E1] focus:border-[#0F766E] rounded outline-none bg-white"
                        />
                      </div>
                      {splitMethod1 === "card" && (
                        <input
                          type="text"
                          value={splitRef1}
                          onChange={(e) => setSplitRef1(e.target.value)}
                          placeholder="POS Slip No / Auth Code (Optional)"
                          className="w-full px-2 py-1 text-[11px] border border-[#CBD5E1] rounded font-mono outline-none bg-white"
                        />
                      )}
                    </div>

                    {/* Method 2 */}
                    <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#475569] uppercase">
                          Method 2:
                        </span>
                        <select
                          value={splitMethod2}
                          onChange={(e) => setSplitMethod2(e.target.value as any)}
                          className="text-[12px] font-semibold border border-[#CBD5E1] rounded px-2 py-1 bg-white outline-none"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#64748B]">Amount (₹):</span>
                        <input
                          type="number"
                          value={splitAmount2 || ""}
                          onChange={(e) => setSplitAmount2(Number(e.target.value))}
                          placeholder="0.00"
                          className="w-28 px-2.5 py-1 text-right text-[13px] font-bold border border-[#CBD5E1] focus:border-[#0F766E] rounded outline-none bg-white"
                        />
                      </div>
                      {splitMethod2 === "card" && (
                        <input
                          type="text"
                          value={splitRef2}
                          onChange={(e) => setSplitRef2(e.target.value)}
                          placeholder="POS Slip No / Auth Code (Optional)"
                          className="w-full px-2 py-1 text-[11px] border border-[#CBD5E1] rounded font-mono outline-none bg-white"
                        />
                      )}
                    </div>

                    {/* Split Validation Notice */}
                    {(() => {
                      const sum = Number(splitAmount1 || 0) + Number(splitAmount2 || 0)
                      const isMatch = sum === finalAmount
                      return (
                        <div
                          className={`p-2 rounded-lg text-[11px] font-semibold flex items-center justify-between ${
                            isMatch
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-rose-50 text-rose-800 border border-rose-200"
                          }`}
                        >
                          <span>
                            {isMatch
                              ? "✓ Total split matches bill"
                              : `Difference: ₹${Math.abs(finalAmount - sum).toFixed(2)}`}
                          </span>
                          <span className="font-bold">
                            ₹{sum.toFixed(2)} / ₹{finalAmount.toFixed(2)}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Complete & Print Bill Button */}
          <div className="p-5 border-t border-[#E2E8F0] bg-white">
            {(() => {
              const isSplitValid =
                selectedPaymentMode !== "split" ||
                Number(splitAmount1 || 0) + Number(splitAmount2 || 0) === finalAmount
              const canDispense = cart.length > 0 && isSplitValid

              return (
                <button
                  type="button"
                  onClick={completeTransaction}
                  disabled={!canDispense}
                  className={`w-full py-3.5 text-[14px] font-bold rounded-xl shadow-sm transition-all uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer ${
                    canDispense
                      ? "bg-[#0F766E] text-white hover:bg-[#0c5e58] hover:shadow-md active:scale-[0.99]"
                      : "bg-[#F1F5F9] text-[#94A3B8] border border-[#CBD5E1] cursor-not-allowed"
                  }`}
                >
                  <Printer size={18} />
                  <span>
                    {cart.length === 0
                      ? "Add Medicines To Bill"
                      : !isSplitValid
                      ? "Split Amounts Must Equal Total"
                      : `Print Bill (₹${finalAmount.toFixed(2)})`}
                  </span>
                </button>
              )
            })()}
          </div>
        </div>
      )}



      {/* Change Payment Mode Modal for Sales History (Requirement 3) */}
      {editingBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.7)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative border border-[#E2E8F0] animate-in fade-in zoom-in-95">
            <button
              onClick={() => setEditingBill(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-[#F1F5F9] text-[#64748B] transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center">
                <ArrowRightLeft size={20} />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0F1624]">
                  Change Payment Mode
                </h3>
                <p className="text-[12px] text-[#64748B]">
                  Bill #{editingBill.billNumber} · {editingBill.patientName || "Walk-in Patient"}
                </p>
              </div>
            </div>

            {/* Bill Info Card */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 mb-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#64748B] font-semibold uppercase block">
                  Total Bill Amount
                </span>
                <span className="text-[20px] font-black text-[#0F1624]">
                  ₹{(editingBill.totalAmount || 0).toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#64748B] font-semibold uppercase block">
                  Current Mode
                </span>
                <span className="text-[12px] font-bold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full inline-block">
                  {editingBill.paymentMode || "Cash"}
                </span>
              </div>
            </div>

            {/* Mode selection buttons */}
            <div className="space-y-3 mb-5">
              <label className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                Select New Payment Mode
              </label>

              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((pm) => {
                  const Icon = pm.icon
                  const isSelected = editPaymentMode === pm.id
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setEditPaymentMode(pm.id as any)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                        isSelected
                          ? "bg-teal-700 text-white border-teal-700 shadow-md ring-2 ring-teal-500/30"
                          : "bg-white text-[#334155] border-[#E2E8F0] hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <Icon size={18} className={isSelected ? "text-white" : "text-teal-700"} />
                      <span className="text-[12px] font-bold">{pm.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Mode Specific Inputs */}
              <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3.5 space-y-3">
                {editPaymentMode === "cash" && (
                  <div className="text-[13px] text-[#334155]">
                    Full amount of <strong className="text-teal-800">₹{(editingBill.totalAmount || 0).toFixed(2)}</strong> will be recorded as paid in <strong>Cash</strong>.
                  </div>
                )}

                {editPaymentMode === "upi" && (
                  <div className="space-y-2">
                    <div className="text-[13px] text-[#334155]">
                      Full amount of <strong className="text-teal-800">₹{(editingBill.totalAmount || 0).toFixed(2)}</strong> will be recorded as paid via <strong>UPI</strong>.
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] p-2 rounded-lg font-medium flex items-center gap-2">
                      <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                      <span>QR Stand / Soundbox Verified. No Transaction ID required.</span>
                    </div>
                  </div>
                )}

                {editPaymentMode === "card" && (
                  <div className="space-y-2">
                    <div className="text-[13px] text-[#334155]">
                      Full amount of <strong className="text-teal-800">₹{(editingBill.totalAmount || 0).toFixed(2)}</strong> will be recorded as paid via <strong>Card</strong>.
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">
                        POS Slip No / Auth Code (Optional):
                      </label>
                      <input
                        type="text"
                        value={editCardRef}
                        onChange={(e) => setEditCardRef(e.target.value)}
                        placeholder="e.g. POS-884920"
                        className="w-full px-2.5 py-1.5 text-[12px] border border-[#CBD5E1] focus:border-[#0F766E] rounded font-mono outline-none bg-white"
                      />
                    </div>
                  </div>
                )}

                {editPaymentMode === "split" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                      <span className="text-[12px] font-bold text-[#334155]">
                        Split Between 2 Methods
                      </span>
                      <button
                        type="button"
                        onClick={handleEditQuickHalfSplit}
                        className="text-[11px] px-2 py-0.5 bg-teal-100 hover:bg-teal-200 text-teal-800 rounded font-bold transition-colors cursor-pointer"
                      >
                        ⚡ 50% / 50% Split
                      </button>
                    </div>

                    {/* Method 1 */}
                    <div className="bg-white p-2.5 rounded-lg border border-[#E2E8F0] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#475569] uppercase">Method 1:</span>
                        <select
                          value={editSplitMethod1}
                          onChange={(e) => setEditSplitMethod1(e.target.value as any)}
                          className="text-[12px] font-semibold border border-[#CBD5E1] rounded px-2 py-1 bg-white outline-none"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#64748B]">Amount (₹):</span>
                        <input
                          type="number"
                          value={editSplitAmount1 || ""}
                          onChange={(e) => handleEditSplitAmount1Change(Number(e.target.value))}
                          placeholder="0.00"
                          className="w-28 px-2.5 py-1 text-right text-[13px] font-bold border border-[#CBD5E1] focus:border-[#0F766E] rounded outline-none"
                        />
                      </div>
                      {editSplitMethod1 === "card" && (
                        <input
                          type="text"
                          value={editSplitRef1}
                          onChange={(e) => setEditSplitRef1(e.target.value)}
                          placeholder="POS Slip No / Auth Code (Optional)"
                          className="w-full px-2 py-1 text-[11px] border border-[#CBD5E1] rounded font-mono outline-none bg-white"
                        />
                      )}
                    </div>

                    {/* Method 2 */}
                    <div className="bg-white p-2.5 rounded-lg border border-[#E2E8F0] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#475569] uppercase">Method 2:</span>
                        <select
                          value={editSplitMethod2}
                          onChange={(e) => setEditSplitMethod2(e.target.value as any)}
                          className="text-[12px] font-semibold border border-[#CBD5E1] rounded px-2 py-1 bg-white outline-none"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#64748B]">Amount (₹):</span>
                        <input
                          type="number"
                          value={editSplitAmount2 || ""}
                          onChange={(e) => setEditSplitAmount2(Number(e.target.value))}
                          placeholder="0.00"
                          className="w-28 px-2.5 py-1 text-right text-[13px] font-bold border border-[#CBD5E1] focus:border-[#0F766E] rounded outline-none"
                        />
                      </div>
                      {editSplitMethod2 === "card" && (
                        <input
                          type="text"
                          value={editSplitRef2}
                          onChange={(e) => setEditSplitRef2(e.target.value)}
                          placeholder="POS Slip No / Auth Code (Optional)"
                          className="w-full px-2 py-1 text-[11px] border border-[#CBD5E1] rounded font-mono outline-none bg-white"
                        />
                      )}
                    </div>

                    {/* Validation */}
                    {(() => {
                      const total = editingBill.totalAmount || 0
                      const sum = Number(editSplitAmount1 || 0) + Number(editSplitAmount2 || 0)
                      const isMatch = sum === total
                      return (
                        <div
                          className={`p-2 rounded-lg text-[11px] font-semibold flex items-center justify-between ${
                            isMatch
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-rose-50 text-rose-800 border border-rose-200"
                          }`}
                        >
                          <span>
                            {isMatch
                              ? "✓ Total split matches bill"
                              : `Difference: ₹${Math.abs(total - sum).toFixed(2)}`}
                          </span>
                          <span className="font-bold">
                            ₹{sum.toFixed(2)} / ₹{total.toFixed(2)}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2.5 pt-2 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#CBD5E1] text-[13px] font-semibold text-[#475569] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveUpdatedPaymentMode}
                className="flex-1 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0c5e58] text-white text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer size={16} /> Save & Print Updated Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
