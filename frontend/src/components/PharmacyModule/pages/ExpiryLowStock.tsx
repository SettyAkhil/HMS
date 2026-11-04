import { usePharmacyData } from "../data/usePharmacyData"
import { PharmacyDatabase } from "../../../services/pharmacyDb"
import { useState, useEffect, useMemo } from "react"
import {
  AlertTriangle,
  Clock,
  XCircle,
  TrendingDown,
  Eye,
  X,
  Package,
  Layers,
  Calendar,
  DollarSign,
  Tag,
  Building,
  Info,
  ShoppingCart,
  Send,
  Printer,
  CheckCircle2,
  Phone,
  Truck,
  FileText,
  PackageCheck,
  Check,
  Download,
  Share2,
} from "lucide-react"
import PageHeader from "../components/PageHeader"

function cleanExpiryDate(val: string | undefined): string {
  if (!val) return "N/A"
  let trimmed = String(val).trim().replace(/^00(\d{2})/, "20$1")
  const parts = trimmed.split(/[-/]/)
  if (parts.length === 3) {
    let year = parseInt(parts[0], 10)
    if (year < 100) {
      year += 2000
      trimmed = `${year}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`
    }
  }
  return trimmed
}

function urgencyLabel(
  days: number,
): { label: string; color: string; bg: string } {
  if (days <= 0) return { label: "Expired", color: "#B91C1C", bg: "#FEE2E2" }
  if (days <= 30)
    return { label: `${days}d • Urgent`, color: "#dc2626", bg: "#FEE2E2" }
  if (days <= 60)
    return { label: `${days}d • Soon`, color: "#D97706", bg: "#FEF3C7" }
  return { label: "Valid", color: "#065F46", bg: "#ECFDF5" }
}

interface ExpiryLowStockProps {
  onNavigate: (page: string) => void
}

// Generate Official Purchase Order PDF (optional download)
async function generatePoPdfDoc(po: any, shouldDownload: boolean = false) {
  try {
    const [jspdfModule, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])

    const jsPDF = jspdfModule.jsPDF || jspdfModule.default || jspdfModule
    const autoTableFn =
      (autoTableModule as any).default ||
      (autoTableModule as any).autoTable ||
      autoTableModule

    const doc = new jsPDF({ unit: "mm", format: "a4" })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 14

    // Header: Hospital Name
    doc.setFont("helvetica", "bold")
    doc.setFontSize(18)
    doc.setTextColor(15, 23, 42) // Slate 900
    doc.text("VARMA ENTERPRISE HOSPITAL", margin, 20)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text("Multi-Speciality Healthcare & Research Institute • Pharmacy Procurement", margin, 26)
    doc.text("27-1-7/3/1, Premises Of Imperial Hospital, J P Road, Bhimavaram, AP - 534202", margin, 31)

    // Document Title Banner
    doc.setFillColor(15, 118, 110) // Teal
    doc.roundedRect(margin, 36, pageW - margin * 2, 8, 2, 2, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text("OFFICIAL PURCHASE ORDER", margin + 6, 41.5)

    // Order Info Grid
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text("PO Number:", margin, 52)
    doc.setFont("helvetica", "normal")
    doc.text(String(po.id), margin + 25, 52)

    doc.setFont("helvetica", "bold")
    doc.text("Order Date:", margin, 58)
    doc.setFont("helvetica", "normal")
    doc.text(String(po.poDate), margin + 25, 58)

    doc.setFont("helvetica", "bold")
    doc.text("Expected Delivery:", margin, 64)
    doc.setFont("helvetica", "normal")
    doc.text(String(po.expectedDeliveryDate || "In 2-3 Days"), margin + 35, 64)

    // Supplier details on the right
    const rightCol = 115
    doc.setFont("helvetica", "bold")
    doc.text("Supplier / Vendor:", rightCol, 52)
    doc.setFont("helvetica", "normal")
    doc.text(String(po.supplierName || "—"), rightCol + 32, 52)

    doc.setFont("helvetica", "bold")
    doc.text("WhatsApp Phone:", rightCol, 58)
    doc.setFont("helvetica", "normal")
    doc.text(String(po.supplierPhone || "—"), rightCol + 32, 58)

    // Table of Items
    const tableBody = (po.items || []).map((it: any, index: number) => {
      const rate = Number(it.purchasePrice || 0)
      const qty = Number(it.quantity || 1)
      const tax = it.taxPercentage ?? 5
      const total = Number(it.totalAmount || rate * qty * (1 + tax / 100))
      return [
        index + 1,
        `${it.medicineName}${it.packing ? ` (${it.packing})` : ""}`,
        it.form || "TABLET",
        qty,
        `Rs. ${rate.toFixed(2)}`,
        `${tax}%`,
        `Rs. ${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      ]
    })

    const runAutoTable = (options: any) => {
      if (typeof (doc as any).autoTable === "function") {
        ;(doc as any).autoTable(options)
      } else if (typeof autoTableFn === "function") {
        autoTableFn(doc, options)
      }
    }

    runAutoTable({
      startY: 72,
      head: [["#", "Medicine Description", "Form", "Qty", "Unit Rate", "GST", "Total Amount"]],
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        3: { cellWidth: 16, halign: "center", fontStyle: "bold" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 16, halign: "center" },
        6: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      },
    })

    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 120

    // Grand Total box
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(15, 118, 110)
    doc.text(
      `Total Estimated Order Value: Rs. ${Number(po.totalOrderValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      pageW - margin - 85,
      finalY,
    )

    // Notes
    if (po.notes) {
      doc.setFont("helvetica", "italic")
      doc.setFontSize(8.5)
      doc.setTextColor(100, 116, 139)
      doc.text(`Procurement Notes: ${po.notes}`, margin, finalY + 12)
    }

    // Signatures
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(51, 65, 85)
    doc.text("Authorized Pharmacist Signature", margin, finalY + 30)
    doc.line(margin, finalY + 28, margin + 55, finalY + 28)

    doc.text("Supplier Acceptance / Stamp", rightCol + 20, finalY + 30)
    doc.line(rightCol + 20, finalY + 28, rightCol + 75, finalY + 28)

    // Filename
    const filename = `PO_${po.id}_${(po.items?.[0]?.medicineName || "Order").replace(/\s+/g, "_")}.pdf`

    // Only download to user disk if explicitly requested
    if (shouldDownload) {
      doc.save(filename)
    }

    const blob = doc.output("blob")
    return { doc, blob, filename }
  } catch (err) {
    console.error("PDF generation failed:", err)
    return null
  }
}

export default function ExpiryLowStock({ onNavigate }: ExpiryLowStockProps) {
  const { medicines, suppliers, expiringMedicines, refresh } =
    usePharmacyData()

  const [selectedMedicine, setSelectedMedicine] = useState<any | null>(null)

  // Order Modal State
  const [orderingMedicine, setOrderingMedicine] = useState<any | null>(null)
  const [orderQty, setOrderQty] = useState<number | string>(1) // Default strictly to 1 as requested
  const [selectedSupplierName, setSelectedSupplierName] = useState("")
  const [supplierPhone, setSupplierPhone] = useState("")
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("")
  const [orderPurchaseRate, setOrderPurchaseRate] = useState<number>(0)
  const [orderNotes, setOrderNotes] = useState("")

  // PO Invoice / WhatsApp Modal State
  const [generatedPO, setGeneratedPO] = useState<any | null>(null)

  // Receive Stock Inward Modal State
  const [receivingOrder, setReceivingOrder] = useState<any | null>(null)
  const [receivingMedicine, setReceivingMedicine] = useState<any | null>(null)
  const [receiveQty, setReceiveQty] = useState<number | string>(1)
  const [receiveBatchNo, setReceiveBatchNo] = useState("")
  const [receiveExpiryDate, setReceiveExpiryDate] = useState("")
  const [receiveInvoiceNo, setReceiveInvoiceNo] = useState("")
  const [receivePurchaseRate, setReceivePurchaseRate] = useState<number | string>(0)
  const [receiveMrp, setReceiveMrp] = useState<number | string>(0)

  // Bill print specific fields - kept empty by default for user entry
  const [receiveHsnCode, setReceiveHsnCode] = useState("")
  const [receiveMnfCode, setReceiveMnfCode] = useState("")
  const [receiveSchedule, setReceiveSchedule] = useState("")
  const [receiveBinNo, setReceiveBinNo] = useState("")
  const [receiveGst, setReceiveGst] = useState<number>(5)

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Close modals on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedMedicine(null)
        setOrderingMedicine(null)
        setGeneratedPO(null)
        setReceivingOrder(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const outOfStock = useMemo(() => medicines.filter((m) => m.stock === 0), [medicines])
  const lowStock = useMemo(
    () => medicines.filter((m) => m.stock > 0 && m.stock < m.reorderLevel),
    [medicines],
  )
  const expiredMeds = useMemo(
    () => expiringMedicines.filter((m) => m.status === "expired"),
    [expiringMedicines],
  )
  const expiringSoon = useMemo(
    () => expiringMedicines.filter((m) => m.status === "expiring"),
    [expiringMedicines],
  )

  // Active / Pending orders
  const activeOrders = useMemo(() => {
    const allPOs = PharmacyDatabase.getPurchaseOrders()
    return allPOs.filter(
      (po) => po.status === "Ordered" || po.status === "Submitted",
    )
  }, [medicines])

  const tabs = [
    {
      id: "low",
      label: "Low Stock",
      icon: TrendingDown,
      count: lowStock.length,
      color: "#d97706",
    },
    {
      id: "expiring",
      label: "Expiring Soon",
      icon: Clock,
      count: expiringSoon.length,
      color: "#D97706",
    },
    {
      id: "expired",
      label: "Expired",
      icon: XCircle,
      count: expiredMeds.length,
      color: "#dc2626",
    },
    {
      id: "outofstock",
      label: "Out of Stock",
      icon: AlertTriangle,
      count: outOfStock.length,
      color: "#7c3aed",
    },
    {
      id: "orders",
      label: "Active Orders",
      icon: Truck,
      count: activeOrders.length,
      color: "#0F766E",
    },
  ]

  const [activeTab, setActiveTab] = useState("low")

  // Find if an active order already exists for a medicine
  const findActiveOrderForMed = (medItem: any) => {
    const medName = (medItem.name || medItem.medicine || "").trim().toLowerCase()
    const medId = medItem.id || medItem.medicineId
    return activeOrders.find(
      (po: any) =>
        po.items &&
        po.items.some(
          (it: any) =>
            (medId && it.medicineId === medId) ||
            (it.medicineName &&
              it.medicineName.trim().toLowerCase() === medName),
        ),
    )
  }

  // Open Details Modal
  const handleOpenDetails = (item: any) => {
    const found = medicines.find(
      (m) =>
        (item.medicineId && m.id === item.medicineId) ||
        (item.id && m.id === item.id) ||
        (item.name &&
          m.name?.trim().toLowerCase() === item.name?.trim().toLowerCase()) ||
        (item.medicine &&
          m.name?.trim().toLowerCase() === item.medicine?.trim().toLowerCase()),
    )

    if (found) {
      setSelectedMedicine(found)
    } else {
      setSelectedMedicine({
        id: item.id || item.medicineId || "MED-" + Date.now(),
        name: item.name || item.medicine || "Unknown Medicine",
        generic: item.generic || "",
        form: item.form || "",
        packing: item.packing || "",
        manufacturer: item.manufacturer || "",
        mnfCode: item.mnfCode || "",
        hsnCode: item.hsnCode || item.sku || "",
        supplierName: item.supplierName || "",
        mrp: item.mrp || 0,
        purchasePrice: item.purchasePrice || 0,
        gst: item.gst || 5,
        stock: item.stock ?? item.quantity ?? 0,
      })
    }
  }

  // Open Reorder Modal (Expanded & default Qty = 1)
  const handleOpenOrderModal = (item: any) => {
    const foundMed =
      medicines.find(
        (m) =>
          (item.id && m.id === item.id) ||
          (item.medicineId && m.id === item.medicineId) ||
          (item.name &&
            m.name?.trim().toLowerCase() === item.name?.trim().toLowerCase()) ||
          (item.medicine &&
            m.name?.trim().toLowerCase() ===
              item.medicine?.trim().toLowerCase()),
      ) || item

    setOrderingMedicine(foundMed)

    // Requirement: Default order quantity to 1
    setOrderQty(1)

    // Find supplier from medicine catalog or keep blank for user entry
    const supName =
      foundMed.supplierName && foundMed.supplierName.trim() !== ""
        ? foundMed.supplierName.trim()
        : ""
    setSelectedSupplierName(supName)

    const matchedSup = supName
      ? suppliers.find(
          (s) => s.name?.toLowerCase() === supName?.toLowerCase(),
        )
      : null
    setSupplierPhone(
      matchedSup?.phone || (matchedSup as any)?.contact || "",
    )

    // Expected delivery date: blank for user to pick
    setExpectedDeliveryDate("")

    const rate = Number(foundMed.purchasePrice || foundMed.price || 0)
    setOrderPurchaseRate(rate)

    // Notes: blank by default
    setOrderNotes("")
  }

  // Submit Purchase Order & Auto-generate PDF
  const handleCreatePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderingMedicine) return

    const qty = Number(orderQty) || 1
    const rate = Number(orderPurchaseRate) || 0
    const taxRate = orderingMedicine.gst ?? 5
    const subtotal = qty * rate
    const taxVal = +(subtotal * (taxRate / 100)).toFixed(2)
    const totalOrderVal = +(subtotal + taxVal).toFixed(2)

    const poId =
      "PO-" +
      new Date().getFullYear() +
      "-" +
      Math.floor(1000 + Math.random() * 9000)

    const newPO: any = {
      id: poId,
      supplierId: "SUP-" + Date.now(),
      supplierName: selectedSupplierName.trim(),
      supplierPhone: supplierPhone.trim(),
      poDate: new Date().toISOString().split("T")[0],
      expectedDeliveryDate: expectedDeliveryDate,
      status: "Ordered",
      items: [
        {
          medicineId: orderingMedicine.id,
          medicineName: orderingMedicine.name,
          form: orderingMedicine.form || "TABLET",
          packing: orderingMedicine.packing || "",
          quantity: qty,
          purchasePrice: rate,
          taxPercentage: taxRate,
          discount: 0,
          totalAmount: totalOrderVal,
        },
      ],
      totalOrderValue: totalOrderVal,
      createdAt: new Date().toISOString(),
      createdBy: "Pharmacist",
      notes: orderNotes,
    }

    PharmacyDatabase.addPurchaseOrder(newPO)

    window.dispatchEvent(new Event("storage"))
    window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    refresh()

    setOrderingMedicine(null)
    setGeneratedPO(newPO)

    // Automatically launch WhatsApp to the supplier directly
    if (newPO.supplierPhone && newPO.supplierPhone.trim() !== "") {
      await handleSharePdfToWhatsApp(newPO)
    } else {
      setToastMessage(`PO ${poId} generated successfully!`)
      setTimeout(() => setToastMessage(null), 4000)
    }
  }

  // Open Receive Stock Modal (Only auto-fill known PO details, keep inward batch/hsn/etc. empty)
  const handleOpenReceiveModal = (po: any, med?: any) => {
    setReceivingOrder(po)
    const item = po.items?.[0]
    const foundMed =
      med ||
      medicines.find(
        (m) =>
          m.id === item?.medicineId ||
          m.name?.trim().toLowerCase() === item?.medicineName?.trim().toLowerCase(),
      ) || {
        id: item?.medicineId || "MED-" + Date.now(),
        name: item?.medicineName || "Medicine",
        mrp: 0,
        purchasePrice: item?.purchasePrice || 0,
      }

    setReceivingMedicine(foundMed)

    // 1. AUTO-FILL ONLY KNOWN DETAILS FROM PO & MEDICINE CATALOG:
    // Quantity ordered:
    setReceiveQty(item?.quantity || 1)

    // Purchase rate from PO:
    const pRate =
      Number(item?.purchasePrice) || Number(foundMed.purchasePrice) || 0
    setReceivePurchaseRate(pRate)

    // Selling Rate / M.R.P. from catalog (if known, else calculated from purchase price):
    setReceiveMrp(Number(foundMed.mrp) || (pRate > 0 ? +(pRate * 1.35).toFixed(2) : 0))

    // GST percentage from PO or medicine:
    setReceiveGst(item?.taxPercentage ?? (foundMed.gst !== undefined ? foundMed.gst : 5))

    // 2. KEEP UNKNOWN INWARD DETAILS EMPTY (TO BE FILLED FROM PHYSICAL DELIVERY / INVOICE):
    setReceiveBatchNo("")
    setReceiveExpiryDate("")
    setReceiveInvoiceNo("")
    setReceiveHsnCode("")
    setReceiveMnfCode("")
    setReceiveBinNo("")
    setReceiveSchedule("")
  }

  // Confirm Inward Stock (saving all bill print fields to batch & medicine)
  const handleConfirmReceive = (e: React.FormEvent) => {
    e.preventDefault()
    if (!receivingOrder || !receiveBatchNo.trim() || !receiveExpiryDate) {
      alert("Please enter Batch Number and Expiry Date from the medicine package.")
      return
    }

    const medId =
      receivingOrder.items?.[0]?.medicineId || receivingMedicine?.id
    const targetMed = medicines.find(
      (m) =>
        m.id === medId ||
        m.name?.trim().toLowerCase() ===
          (receivingOrder.items?.[0]?.medicineName || receivingMedicine?.name)
            ?.trim()
            .toLowerCase(),
    )

    if (!targetMed) {
      alert("Could not locate medicine record in catalog.")
      return
    }

    const qty =
      Number(receiveQty) ||
      Number(receivingOrder.items?.[0]?.quantity) ||
      1
    const rate = Number(receivePurchaseRate) || Number(targetMed.purchasePrice) || 0
    const mrp =
      Number(receiveMrp) ||
      Number(targetMed.mrp) ||
      +(rate * 1.35).toFixed(2)
    const batchId = "BAT" + Date.now()

    // 1. Add batch to PharmacyDatabase with all inward fields
    PharmacyDatabase.addBatch({
      id: batchId,
      medicineId: targetMed.id,
      batchNumber: receiveBatchNo.trim().toUpperCase(),
      expiryDate: receiveExpiryDate,
      manufacturingDate: new Date().toISOString().split("T")[0],
      quantity: qty,
      availableQuantity: qty,
      mrp: mrp,
      purchasePrice: rate,
      discount: 0,
      supplierName:
        receivingOrder.supplierName ||
        targetMed.supplierName ||
        "Supplier",
      invoiceNumber: receiveInvoiceNo.trim() || undefined,
      location: receiveBinNo.trim() || targetMed.binNo || "",
      createdAt: new Date().toISOString(),
    })

    // 2. Update medicine total stock & all bill print identifiers
    const allBatches = PharmacyDatabase.getBatches().filter(
      (b) => b.medicineId === targetMed.id,
    )
    const totalStock = allBatches.reduce(
      (acc, b) => acc + (b.availableQuantity || 0),
      0,
    )

    PharmacyDatabase.updateMedicine(targetMed.id, {
      stock: totalStock,
      mrp: mrp > 0 ? mrp : targetMed.mrp,
      purchasePrice: rate > 0 ? rate : targetMed.purchasePrice,
      batchNumber: receiveBatchNo.trim().toUpperCase(),
      expiryDate: receiveExpiryDate,
      hsnCode: receiveHsnCode.trim() || targetMed.hsnCode || "",
      mnfCode: receiveMnfCode.trim().toUpperCase() || targetMed.mnfCode || "",
      scheduleType: receiveSchedule.trim().toUpperCase() || targetMed.schedule || "",
      binNo: receiveBinNo.trim() || targetMed.binNo || "",
      taxPercentage: Number(receiveGst),
    })

    // 3. Log stock transaction
    PharmacyDatabase.addTransaction({
      id: "TXN" + Date.now(),
      date: new Date().toISOString(),
      medicineId: targetMed.id,
      batchId: batchId,
      quantity: qty,
      transactionType: "PURCHASE_RECEIVED",
      userId: "Pharmacist",
      reason: `Inward delivery from PO ${receivingOrder.id} (${receivingOrder.supplierName})`,
    })

    // 4. Update PO status to Received
    PharmacyDatabase.updatePurchaseOrder(receivingOrder.id, {
      status: "Received",
    })

    // 5. Notify & Refresh
    window.dispatchEvent(new Event("storage"))
    window.dispatchEvent(new CustomEvent("hospai_pharmacy_updated"))
    refresh()

    setReceivingOrder(null)
    setToastMessage(
      `Stock Inwarded! ${qty} units of "${targetMed.name}" added to inventory with bill print specifications.`,
    )
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Handle WhatsApp sharing directly as an actual PDF document
  const handleSharePdfToWhatsApp = async (po: any) => {
    // 1. Generate PDF in memory (as a real application/pdf binary file)
    const pdfResult = await generatePoPdfDoc(po, false)
    if (!pdfResult?.blob) {
      setToastMessage("Could not generate Purchase Order PDF.")
      setTimeout(() => setToastMessage(null), 4000)
      return
    }

    // 2. Format supplier phone number with country code (defaults to 91 for 10-digit Indian numbers)
    let cleanPhone = (po.supplierPhone || "").replace(/\D/g, "")
    if (cleanPhone.length === 10) {
      cleanPhone = "91" + cleanPhone
    } else if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
      cleanPhone = "91" + cleanPhone.slice(1)
    }

    const item = po.items?.[0]
    const itemLine = item
      ? `• *${item.medicineName}* (${item.form || "MED"}${item.packing ? ` - ${item.packing}` : ""}) - Qty: *${item.quantity} units*\n  Purchase Rate: Rs. ${Number(item.purchasePrice || 0).toFixed(2)} + ${item.taxPercentage ?? 5}% GST`
      : "• Medical Supplies"

    // Clean plain text without emoji symbols that corrupt into replacement characters on WhatsApp
    const message = `*VARMA ENTERPRISE HOSPITAL - PURCHASE ORDER*
----------------------------------------
*PO Number:* ${po.id}
*Order Date:* ${po.poDate}
${po.expectedDeliveryDate ? `*Expected Delivery:* ${po.expectedDeliveryDate}\n` : ""}*Ordered Medicine:*
${itemLine}

*Estimated Order Total:* Rs. ${Number(po.totalOrderValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}

*Official Purchase Order Desk:*
Please find attached our official signed Purchase Order PDF (${pdfResult.filename}). Kindly confirm order receipt and expedite delivery with original tax invoice and batch details.

Thank you!
— *Main Pharmacy Procurement Desk*
*Varma Enterprise Hospital*`

    // Auto-copy supplier phone to clipboard for quick paste/search if needed
    if (cleanPhone && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(cleanPhone)
      } catch (e) {
        // clipboard access restricted
      }
    }

    // 3. Share the actual PDF document file directly to WhatsApp
    if (typeof navigator !== "undefined" && (navigator as any).canShare) {
      try {
        const file = new File([pdfResult.blob], pdfResult.filename, {
          type: "application/pdf",
        })
        if ((navigator as any).canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `PO ${po.id} - ${po.supplierName || "Supplier"}`,
            text: message,
          })
          setToastMessage(
            cleanPhone
              ? `PO PDF ready! Selected WhatsApp - number +${cleanPhone} copied to clipboard.`
              : "PO PDF shared directly to WhatsApp!",
          )
          setTimeout(() => setToastMessage(null), 4000)
          return
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return // User cancelled share sheet
        console.warn("Direct file share not supported or cancelled:", err)
      }
    }

    // 4. Fallback if browser doesn't support Web Share API file attachment (e.g. desktop Chrome):
    // Open WhatsApp directly with supplier and notify user to attach the generated PDF
    const waLink = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`

    window.open(waLink, "_blank")

    setToastMessage(
      cleanPhone
        ? `WhatsApp chat opened for +${cleanPhone}! (Use 'Download PDF' to attach file)`
        : "WhatsApp chat opened! (Use 'Download PDF' to attach file)",
    )
    setTimeout(() => setToastMessage(null), 4000)
  }


  // Find all batches associated with the selected medicine
  const selectedMedBatches = selectedMedicine
    ? PharmacyDatabase.getBatches().filter(
        (b) =>
          b.medicineId === selectedMedicine.id ||
          (selectedMedicine.batchNumber &&
            b.batchNumber === selectedMedicine.batchNumber) ||
          (selectedMedicine.name &&
            (b as any).medicineName?.trim().toLowerCase() ===
              selectedMedicine.name?.trim().toLowerCase()),
      )
    : []

  const hasDistinctGeneric =
    selectedMedicine?.generic &&
    selectedMedicine.generic.trim() !== "" &&
    selectedMedicine.generic.trim().toLowerCase() !== "n/a" &&
    selectedMedicine.generic.trim().toLowerCase() !==
      selectedMedicine.name?.trim().toLowerCase()

  const hasRealSupplier = !!(
    selectedMedicine?.supplierName &&
    selectedMedicine.supplierName.trim() !== ""
  )

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Stock" },
          { label: "Expiry & Low Stock" },
        ]}
        title="Inventory Alert Center"
        description="Monitor critical stock levels, reorder from suppliers via WhatsApp PDF, and inward stock with billing specifications"
        onNavigate={onNavigate}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-700 text-white rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2 text-[13px] font-semibold">
          <CheckCircle2 size={18} className="text-emerald-200 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded border font-medium text-[13px] transition-all cursor-pointer shadow-sm"
            style={{
              background: activeTab === t.id ? "#0F1624" : "#fff",
              color: activeTab === t.id ? "#fff" : "#334155",
              borderColor: activeTab === t.id ? "#0F1624" : "#DDE2EC",
            }}
          >
            <t.icon
              size={14}
              style={{ color: activeTab === t.id ? "#fff" : t.color }}
            />
            {t.label}
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{
                background:
                  activeTab === t.id ? "rgba(255,255,255,0.2)" : `${t.color}20`,
                color: activeTab === t.id ? "#fff" : t.color,
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        {/* TAB 1: LOW STOCK */}
        {activeTab === "low" && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Medicine</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Current Stock</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Reorder Level</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Order Action</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((m: any, i: number) => {
                const pendingPO = findActiveOrderForMed(m)
                return (
                  <tr
                    key={i}
                    onClick={() => handleOpenDetails(m)}
                    className="hover:bg-[#F0FDFA] transition-colors cursor-pointer group border-b border-[#F1F5F9] last:border-0"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-[#0F1624] group-hover:text-[#0F766E] transition-colors">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-[#0F766E] bg-[#CCFBF1] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-medium">
                          <Eye size={11} /> View Details
                        </span>
                      </div>
                    </td>
                    <td
                      className="py-3 px-4 text-[13px] font-bold"
                      style={{ color: "#d97706" }}
                    >
                      {m.stock}
                    </td>
                    <td className="py-3 px-4 text-[13px] text-[#64748B]">
                      {m.reorderLevel}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        Low Stock
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {pendingPO ? (
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] font-semibold px-2 py-1 rounded bg-teal-50 text-[#0F766E] border border-teal-200">
                            Ordered ({pendingPO.id})
                          </span>
                          <button
                            onClick={() => handleOpenReceiveModal(pendingPO, m)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                            title="Receive stock delivery"
                          >
                            <PackageCheck size={12} /> Receive
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenOrderModal(m)
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0D9488] text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                        >
                          <ShoppingCart size={13} /> Order
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {lowStock.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center p-8 text-[#64748B] text-[13px]"
                  >
                    No low stock medicines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* TAB 2: OUT OF STOCK */}
        {activeTab === "outofstock" && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Medicine</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Current Stock</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Order Action</th>
              </tr>
            </thead>
            <tbody>
              {outOfStock.map((m: any, i: number) => {
                const pendingPO = findActiveOrderForMed(m)
                return (
                  <tr
                    key={i}
                    onClick={() => handleOpenDetails(m)}
                    className="hover:bg-[#FAF5FF] transition-colors cursor-pointer group border-b border-[#F1F5F9] last:border-0"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-[#0F1624] group-hover:text-purple-700 transition-colors">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-medium">
                          <Eye size={11} /> View Details
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[13px] font-bold text-[#dc2626]">
                      {m.stock}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                        Out of Stock
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {pendingPO ? (
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] font-semibold px-2 py-1 rounded bg-teal-50 text-[#0F766E] border border-teal-200">
                            Ordered ({pendingPO.id})
                          </span>
                          <button
                            onClick={() => handleOpenReceiveModal(pendingPO, m)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                          >
                            <PackageCheck size={12} /> Receive
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenOrderModal(m)
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                        >
                          <ShoppingCart size={13} /> Order Urgent
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {outOfStock.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center p-8 text-[#64748B] text-[13px]"
                  >
                    No out of stock medicines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* TAB 3 & 4: EXPIRING SOON & EXPIRED */}
        {(activeTab === "expiring" || activeTab === "expired") && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Medicine</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Batch No.</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Stock Left</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Expiry Date</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Time Left</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Order Action</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === "expiring" ? expiringSoon : expiredMeds).map(
                (m: any, i: number) => {
                  const cleanedExp = cleanExpiryDate(m.expiry)
                  const expTime = new Date(cleanedExp).getTime()
                  const daysLeft = isNaN(expTime)
                    ? 0
                    : Math.ceil((expTime - Date.now()) / (1000 * 60 * 60 * 24))
                  const urg = urgencyLabel(daysLeft)
                  const pendingPO = findActiveOrderForMed(m)

                  return (
                    <tr
                      key={i}
                      onClick={() => handleOpenDetails(m)}
                      className="hover:bg-[#F0FDFA] transition-colors cursor-pointer group border-b border-[#F1F5F9] last:border-0"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[13px] text-[#0F1624] group-hover:text-[#0F766E] transition-colors">
                            {m.name}
                          </span>
                          <span className="text-[10px] text-[#0F766E] bg-[#CCFBF1] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-medium">
                            <Eye size={11} /> View Details
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#64748B]">
                        {m.batch}
                      </td>
                      <td className="py-3 px-4 text-[13px] font-medium text-[#334155]">
                        {m.stock}
                      </td>
                      <td className="py-3 px-4 text-[12px] font-medium text-[#0F1624]">
                        {cleanedExp}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
                          style={{ background: urg.bg, color: urg.color }}
                        >
                          {urg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {pendingPO ? (
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[10px] font-semibold px-2 py-1 rounded bg-teal-50 text-[#0F766E] border border-teal-200">
                              Ordered
                            </span>
                            <button
                              onClick={() => handleOpenReceiveModal(pendingPO, m)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                            >
                              <PackageCheck size={12} /> Receive
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenOrderModal(m)
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F766E] hover:bg-[#0D9488] text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                          >
                            <ShoppingCart size={12} /> Reorder Fresh
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                },
              )}
              {(activeTab === "expiring" ? expiringSoon : expiredMeds)
                .length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center p-8 text-[#64748B] text-[13px]"
                  >
                    No matching medicines found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* TAB 5: ACTIVE ORDERS TAB */}
        {activeTab === "orders" && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
              <tr>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">PO Number</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Medicine & Qty</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Supplier</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Order Date</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Expected Delivery</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Est. Value</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeOrders.map((po: any, i: number) => {
                const item = po.items?.[0] as any
                return (
                  <tr
                    key={i}
                    className="hover:bg-[#F0FDFA] transition-colors border-b border-[#F1F5F9] last:border-0"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[12px] text-[#0F1624]">
                      {po.id}
                    </td>
                    <td className="py-3 px-4 text-[13px] font-semibold text-[#0F1624]">
                      {item ? `${item.medicineName} (${item.quantity} units)` : "Medicines"}
                    </td>
                    <td className="py-3 px-4 text-[12px] text-slate-700">
                      <div className="font-medium text-slate-900">{po.supplierName || "Supplier"}</div>
                      {po.supplierPhone && (
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                          <Phone size={10} /> {po.supplierPhone}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[12px] text-slate-600">
                      {po.poDate}
                    </td>
                    <td className="py-3 px-4 text-[12px] font-medium text-amber-700">
                      {po.expectedDeliveryDate || "In 2-3 Days"}
                    </td>
                    <td className="py-3 px-4 text-[13px] font-bold text-slate-900">
                      ₹{Number(po.totalOrderValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        {po.status || "Ordered"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSharePdfToWhatsApp(po)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white text-[11px] font-bold shadow-sm transition-colors cursor-pointer"
                          title="Share Official PDF to WhatsApp"
                        >
                          <Send size={12} /> WhatsApp PDF
                        </button>

                        <button
                          onClick={() => setGeneratedPO(po)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold border border-slate-300 transition-colors cursor-pointer"
                          title="View Purchase Order Slip"
                        >
                          <Printer size={12} /> PO Slip
                        </button>

                        <button
                          onClick={() => handleOpenReceiveModal(po)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm transition-colors cursor-pointer"
                          title="Inward delivery into inventory"
                        >
                          <PackageCheck size={12} /> Receive Stock
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {activeOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center p-8 text-[#64748B] text-[13px]"
                  >
                    No active purchase orders pending delivery.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL 1: PLACE PURCHASE ORDER (EXPANDED TO MAX-W-2XL / 3XL, DEFAULT QTY = 1) */}
      {orderingMedicine && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setOrderingMedicine(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-[#0F1624]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-[#0F766E] via-[#0D9488] to-[#0F1624] text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-sm">
                    Stock Reorder Request
                  </span>
                  {orderingMedicine.form && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-black/20 text-teal-100">
                      {orderingMedicine.form}
                    </span>
                  )}
                  {orderingMedicine.packing && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-white">
                      Pack: {orderingMedicine.packing}
                    </span>
                  )}
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                  {orderingMedicine.name}
                </h2>
                <p className="text-xs text-teal-100/90 mt-1">
                  Current In-Hand Stock: <strong className="text-white">{orderingMedicine.stock} units</strong> | Reorder Alert Level: <strong className="text-white">{orderingMedicine.reorderLevel || 10} units</strong>
                </p>
              </div>
              <button
                onClick={() => setOrderingMedicine(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreatePurchaseOrder} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Order Quantity (Units) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={orderQty}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === "") {
                        setOrderQty("")
                      } else {
                        const parsed = parseInt(val, 10)
                        setOrderQty(isNaN(parsed) ? "" : Math.max(1, parsed))
                      }
                    }}
                    onBlur={() => {
                      if (!orderQty || Number(orderQty) < 1) {
                        setOrderQty(1)
                      }
                    }}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Default order quantity: 1 unit
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Est. Unit Purchase Rate (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={orderPurchaseRate}
                    onChange={(e) => setOrderPurchaseRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Current Catalog M.R.P.: ₹{Number(orderingMedicine.mrp || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Supplier / Vendor Name *
                  </label>
                  <input
                    type="text"
                    required
                    list="registered-suppliers-list"
                    value={selectedSupplierName}
                    onChange={(e) => {
                      const val = e.target.value
                      setSelectedSupplierName(val)
                      const match = suppliers.find(
                        (s) => s.name?.toLowerCase() === val.trim().toLowerCase(),
                      )
                      if (match && (match.phone || (match as any).contact)) {
                        setSupplierPhone(match.phone || (match as any).contact)
                      }
                    }}
                    placeholder="Enter or select supplier"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                  />
                  <datalist id="registered-suppliers-list">
                    {suppliers.map((s, idx) => (
                      <option key={idx} value={s.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Supplier WhatsApp Contact *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full px-3.5 py-2.5 pl-9 border border-slate-300 rounded-xl text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                    <Phone size={15} className="absolute left-3 top-3 text-slate-400" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Expected Delivery Date *
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={expectedDeliveryDate}
                      onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Applicable Tax / GST (%)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`${orderingMedicine.gst ?? 5}% (CGST ${(Number(orderingMedicine.gst ?? 5) / 2).toFixed(1)}% + SGST ${(Number(orderingMedicine.gst ?? 5) / 2).toFixed(1)}%)`}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Procurement Notes (Optional)
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Enter procurement notes (optional)"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                />
              </div>

              {/* Order Summary Box */}
              <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-teal-900 font-bold block text-sm">Estimated Order Total:</span>
                  <span className="text-[11px] text-teal-700">
                    {orderQty || 1} units × ₹{Number(orderPurchaseRate || 0).toFixed(2)} + {orderingMedicine.gst ?? 5}% GST
                  </span>
                </div>
                <div className="text-xl font-black text-[#0F766E] font-mono">
                  ₹{((Number(orderQty) || 1) * Number(orderPurchaseRate || 0) * (1 + (orderingMedicine.gst ?? 5) / 100)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setOrderingMedicine(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0D9488] text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FileText size={15} /> Generate PO & Open PDF / WhatsApp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PURCHASE ORDER SLIP & WHATSAPP PDF (EXPANDED TO MAX-W-3XL) */}
      {generatedPO && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setGeneratedPO(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-[#0F1624]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-teal-400" />
                <span className="font-bold text-sm">Official Purchase Order Slip: {generatedPO.id}</span>
              </div>
              <button
                onClick={() => setGeneratedPO(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Notification Banner: PDF Ready */}
            <div className="bg-teal-50 border-b border-teal-200 px-6 py-2.5 flex items-center justify-between text-xs text-[#0F766E]">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 size={15} className="text-teal-600" />
                Official PO PDF is generated and ready to transmit to supplier.
              </span>
              <button
                onClick={() => generatePoPdfDoc(generatedPO, true)}
                className="font-bold underline hover:text-teal-900 flex items-center gap-1 cursor-pointer"
              >
                <Download size={12} /> Download PDF
              </button>
            </div>

            {/* Printable Letterhead & PO Content */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="border-b border-slate-200 pb-4 text-center">
                <h1 className="text-2xl font-black tracking-tight text-[#0F1624]">
                  VARMA ENTERPRISE HOSPITAL
                </h1>
                <p className="text-xs text-slate-500">
                  Multi-Speciality Healthcare & Research Institute • Pharmacy Procurement Desk
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  27-1-7/3/1, Premises Of Imperial Hospital, J P Road, Bhimavaram, AP - 534202 • GSTIN: 37AASFV7563M1Z1
                </p>
                <div className="mt-2.5 inline-block px-3 py-1 bg-teal-50 text-[#0F766E] font-bold text-xs rounded-full border border-teal-200">
                  OFFICIAL PURCHASE ORDER
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Purchase Order Number:</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">{generatedPO.id}</span>
                  <span className="text-slate-500 block mt-2">Order Date:</span>
                  <span className="font-semibold text-slate-900">{generatedPO.poDate}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Supplier / Vendor:</span>
                  <span className="font-bold text-slate-900">{generatedPO.supplierName}</span>
                  <span className="text-slate-500 block mt-2">WhatsApp Contact:</span>
                  <span className="font-mono font-semibold text-slate-900 flex items-center gap-1">
                    <Phone size={11} className="text-emerald-600" /> {generatedPO.supplierPhone}
                  </span>
                  <span className="text-slate-500 block mt-2">Expected Delivery:</span>
                  <span className="font-semibold text-amber-700">{generatedPO.expectedDeliveryDate}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Rate</th>
                      <th className="py-2.5 px-3 text-right">Tax</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(generatedPO.items || []).map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {it.medicineName}
                          {it.packing && <span className="text-slate-500 font-normal ml-1">({it.packing})</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                          {it.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          ₹{Number(it.purchasePrice || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {it.taxPercentage ?? 5}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                          ₹{Number(it.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end text-xs">
                <div className="w-72 p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex justify-between font-bold text-sm text-[#0F1624]">
                    <span>Total Order Value:</span>
                    <span className="font-mono text-[#0F766E] text-base">
                      ₹{Number(generatedPO.totalOrderValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {generatedPO.notes && (
                <div className="text-[11px] text-slate-500 bg-amber-50/60 p-3 rounded-lg border border-amber-200">
                  <strong>Notes:</strong> {generatedPO.notes}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Check size={14} className="text-emerald-600" /> Transmit PO directly to supplier
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generatePoPdfDoc(generatedPO, true)}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer size={14} /> Print Slip
                </button>
                <button
                  onClick={() => handleSharePdfToWhatsApp(generatedPO)}
                  className="px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  title="Share official Purchase Order PDF document directly to WhatsApp"
                >
                  <Send size={14} /> Send PO as PDF to WhatsApp
                </button>
                <button
                  onClick={() => setGeneratedPO(null)}
                  className="px-4 py-2 rounded-xl bg-[#0F1624] hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: RECEIVE STOCK INWARD (EXPANDED HORIZONTALLY TO MAX-W-5XL / 6XL) */}
      {receivingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setReceivingOrder(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-[#0F1624]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-[#0F1624] text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                    Stock Inward & Billing Setup
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-black/20 text-emerald-200">
                    PO #{receivingOrder.id}
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                  Receive Stock Delivery
                </h2>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Medicine: <strong className="text-white">{receivingOrder.items?.[0]?.medicineName || receivingMedicine?.name}</strong> • Supplier: <strong className="text-white">{receivingOrder.supplierName || "Supplier"}</strong>
                </p>
              </div>
              <button
                onClick={() => setReceivingOrder(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmReceive} className="p-6 space-y-4 overflow-y-auto">
              {/* HORIZONTAL 2-COLUMN GRID (SIDE-BY-SIDE WIDESCREEN) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                {/* LEFT COLUMN: DELIVERY & BATCH DETAILS */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-4 flex flex-col justify-between">
                  {/* SECTION 1: INVENTORY & QUANTITY */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <Package size={14} className="text-[#0D9488]" /> 1. Delivery & Quantity (Auto-filled from PO)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Quantity (Units) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={receiveQty}
                          onChange={(e) => {
                            const val = e.target.value
                            setReceiveQty(val === "" ? "" : Math.max(1, parseInt(val) || 1))
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        />
                        <span className="text-[10px] text-emerald-700 mt-0.5 block font-medium">
                          Auto-filled: {receivingOrder.items?.[0]?.quantity || 1} units
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Challan / Invoice
                        </label>
                        <input
                          type="text"
                          value={receiveInvoiceNo}
                          onChange={(e) => setReceiveInvoiceNo(e.target.value)}
                          placeholder="e.g. INV-90412"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          From delivery paper
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Supplier Name
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={receivingOrder.supplierName || "Supplier"}
                          className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Auto-filled from PO
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: BATCH & EXPIRY */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <Calendar size={14} className="text-[#0D9488]" /> 2. Package Batch & Expiry (Enter from Delivered Box)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Batch No. *
                        </label>
                        <input
                          type="text"
                          required
                          value={receiveBatchNo}
                          onChange={(e) => setReceiveBatchNo(e.target.value.toUpperCase())}
                          placeholder="e.g. B-89210"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 uppercase shadow-sm"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Printed on box
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Expiry Date (Exp Dt) *
                        </label>
                        <input
                          type="date"
                          required
                          value={receiveExpiryDate}
                          onChange={(e) => setReceiveExpiryDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Expiry from strip
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Storage Rack / Bin No
                        </label>
                        <input
                          type="text"
                          value={receiveBinNo}
                          onChange={(e) => setReceiveBinNo(e.target.value)}
                          placeholder="e.g. Rack A-02"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Optional shelf location
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: PRICING, TAX & BILL IDENTIFIERS */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-4 flex flex-col justify-between">
                  {/* SECTION 3: PRICING & TAX (AUTO-FILLED KNOWN RATES) */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <DollarSign size={14} className="text-[#0D9488]" /> 3. Pricing & Tax (Auto-filled Known Rates)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Bill Rate / M.R.P. (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={receiveMrp}
                          onChange={(e) => setReceiveMrp(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        />
                        <span className="text-[10px] text-emerald-700 mt-0.5 block font-medium">
                          Selling price on bill
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Purchase Rate (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={receivePurchaseRate}
                          onChange={(e) => setReceivePurchaseRate(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        />
                        <span className="text-[10px] text-emerald-700 mt-0.5 block font-medium">
                          From PO cost
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          GST Rate (%) *
                        </label>
                        <select
                          value={receiveGst}
                          onChange={(e) => setReceiveGst(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        >
                          <option value={0}>0% (Exempt)</option>
                          <option value={5}>5% (CGST 2.5% + SGST 2.5%)</option>
                          <option value={12}>12% (CGST 6% + SGST 6%)</option>
                          <option value={18}>18% (CGST 9% + SGST 9%)</option>
                        </select>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Splits into CGST & SGST
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 4: BILL PRINT REGULATORY CODES (EMPTY SPACE FOR MANUAL ENTRY) */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <FileText size={14} className="text-[#0D9488]" /> 4. Patient Bill Print Codes (Optional / Manual Entry)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          HSN Code
                        </label>
                        <input
                          type="text"
                          value={receiveHsnCode}
                          onChange={(e) => setReceiveHsnCode(e.target.value)}
                          placeholder="e.g. 3004 039"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          GST classification
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Manufacturer (Mnf)
                        </label>
                        <input
                          type="text"
                          value={receiveMnfCode}
                          onChange={(e) => setReceiveMnfCode(e.target.value.toUpperCase())}
                          placeholder="e.g. MANK, CIPLA"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 uppercase shadow-sm"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Mnf short code
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Drug Schedule (Sh)
                        </label>
                        <input
                          type="text"
                          value={receiveSchedule}
                          onChange={(e) => setReceiveSchedule(e.target.value.toUpperCase())}
                          placeholder="e.g. H, H1, G, OTC"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 uppercase shadow-sm"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Prints under 'Sh'
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Inward Confirmation Note */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  Confirming will inward <strong>{receiveQty} units</strong> into live inventory and attach all bill specifications (HSN, Batch, Expiry, Rate, Schedule, Bin) so subsequent sales print 100% complete tax invoices.
                </span>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReceivingOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <PackageCheck size={15} /> Confirm Inward & Add to Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: MEDICINE DETAILS MODAL */}
      {selectedMedicine && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedMedicine(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-[#0F1624]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-[#0F766E] via-[#0D9488] to-[#0F1624] text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {selectedMedicine.form && selectedMedicine.form !== "N/A" && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/20 text-white backdrop-blur-sm">
                      {selectedMedicine.form}
                    </span>
                  )}
                  {selectedMedicine.packing && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-black/20 text-teal-100">
                      Pack: {selectedMedicine.packing}
                    </span>
                  )}
                  {selectedMedicine.stock === 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/30 text-rose-200 border border-rose-400/30">
                      Out of Stock
                    </span>
                  ) : selectedMedicine.stock < (selectedMedicine.reorderLevel || 10) ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/30 text-amber-200 border border-amber-300/30">
                      Low Stock Alert
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400/30 text-emerald-200 border border-emerald-300/30">
                      In Stock
                    </span>
                  )}
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
                  {selectedMedicine.name}
                </h2>
                {hasDistinctGeneric && (
                  <p className="text-sm text-teal-100/90 mt-0.5">
                    Generic: <span className="font-semibold text-white">{selectedMedicine.generic}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedMedicine(null)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Key Important Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <Package size={13} className="text-[#0D9488]" /> Current Stock
                  </div>
                  <div
                    className="text-xl font-bold mt-1"
                    style={{
                      color:
                        selectedMedicine.stock === 0
                          ? "#DC2626"
                          : selectedMedicine.stock < (selectedMedicine.reorderLevel || 10)
                          ? "#D97706"
                          : "#0F766E",
                    }}
                  >
                    {selectedMedicine.stock}{" "}
                    <span className="text-xs font-medium text-slate-500">units</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <DollarSign size={13} className="text-emerald-600" /> M.R.P.
                  </div>
                  <div className="text-xl font-bold mt-1 text-slate-900">
                    ₹{Number(selectedMedicine.mrp || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <Tag size={13} className="text-indigo-600" /> Purchase Rate
                  </div>
                  <div className="text-xl font-bold mt-1 text-slate-900">
                    ₹{Number(selectedMedicine.purchasePrice || selectedMedicine.price || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <Layers size={13} className="text-blue-600" /> GST Rate
                  </div>
                  <div className="text-xl font-bold mt-1 text-slate-900">
                    {selectedMedicine.gst ?? 5}%
                  </div>
                </div>
              </div>

              {/* Core Medicine Information */}
              <div className="flex items-center gap-6 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] flex-wrap">
                {selectedMedicine.manufacturer && (
                  <div>
                    <span className="text-slate-500 block text-[11px] font-medium">Manufacturer</span>
                    <span className="font-semibold text-slate-900">
                      {selectedMedicine.manufacturer}
                      {selectedMedicine.mnfCode && selectedMedicine.mnfCode !== selectedMedicine.manufacturer && (
                        <span className="text-slate-500 text-[11px] ml-1">({selectedMedicine.mnfCode})</span>
                      )}
                    </span>
                  </div>
                )}

                {(selectedMedicine.hsnCode || selectedMedicine.sku) && (
                  <div>
                    <span className="text-slate-500 block text-[11px] font-medium">HSN Code</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {selectedMedicine.hsnCode || selectedMedicine.sku}
                    </span>
                  </div>
                )}

                {hasRealSupplier && (
                  <div>
                    <span className="text-slate-500 block text-[11px] font-medium">Supplier</span>
                    <span className="font-semibold text-slate-900 flex items-center gap-1">
                      <Building size={12} className="text-slate-400" />
                      {selectedMedicine.supplierName}
                    </span>
                  </div>
                )}
              </div>

              {/* Batches Table */}
              <div>
                <h3 className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5 mb-2.5">
                  <Calendar size={14} className="text-[#0D9488]" />
                  Registered Batches & Expiry Dates ({selectedMedBatches.length})
                </h3>

                {selectedMedBatches.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Batch Number</th>
                          <th className="py-2.5 px-3">Expiry Date</th>
                          <th className="py-2.5 px-3">Available Stock</th>
                          <th className="py-2.5 px-3">Cost Rate</th>
                          <th className="py-2.5 px-3">M.R.P.</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedMedBatches.map((b, idx) => {
                          const cleanedExp = cleanExpiryDate(b.expiryDate)
                          const expTime = new Date(cleanedExp).getTime()
                          const daysLeft = isNaN(expTime)
                            ? 0
                            : Math.ceil((expTime - Date.now()) / (1000 * 60 * 60 * 24))
                          const urg = urgencyLabel(daysLeft)
                          return (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2 px-3 font-mono font-medium text-slate-900">
                                {b.batchNumber}
                              </td>
                              <td className="py-2 px-3 text-slate-700 font-medium">
                                {cleanedExp}
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-900">
                                {b.availableQuantity ?? b.quantity ?? 0}
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                ₹{Number(b.purchasePrice || selectedMedicine.purchasePrice || 0).toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                ₹{Number(b.mrp || selectedMedicine.mrp || 0).toFixed(2)}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
                                  style={{ background: urg.bg, color: urg.color }}
                                >
                                  {urg.label}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-[12px] flex items-center gap-2">
                    <Info size={15} className="text-slate-400 shrink-0" />
                    <span>
                      Tracked directly in catalog with stock: <strong>{selectedMedicine.stock} units</strong>.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => {
                  const m = selectedMedicine
                  setSelectedMedicine(null)
                  handleOpenOrderModal(m)
                }}
                className="px-4 py-2 rounded-lg bg-[#0F766E] hover:bg-[#0D9488] text-white text-[12px] font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ShoppingCart size={13} /> Order From Supplier
              </button>
              <button
                onClick={() => setSelectedMedicine(null)}
                className="px-4 py-2 rounded-lg bg-[#0F1624] hover:bg-slate-800 text-white text-[12px] font-semibold transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
