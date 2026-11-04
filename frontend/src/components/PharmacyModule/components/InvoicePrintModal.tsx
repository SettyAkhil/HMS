import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { CheckCircle, Printer, RotateCcw, X, Download, FileText } from "lucide-react"
import { PharmacyDatabase } from "../../../services/pharmacyDb"
import RECEIPT_LOGO_BASE64 from "../../../assets/receiptLogoBase64"
import {
  downloadPharmacyInvoicePdf,
  printPharmacyInvoicePdfDirect,
} from "./invoicePdfGenerator"

function numberToWords(amount: number): string {
  if (!amount || amount === 0) return "Zero Rupees Only"
  const total = Math.round(Number(amount) * 100) / 100
  const rupees = Math.floor(total)
  const paise = Math.round((total - rupees) * 100)

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ]
  const tens = [
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

  function convertLessThanOneThousand(n: number): string {
    let current = ""
    if (n >= 100) {
      current += ones[Math.floor(n / 100)] + " Hundred "
      n %= 100
    }
    if (n > 0) {
      if (n < 20) {
        current += ones[n] + " "
      } else {
        current += tens[Math.floor(n / 10)] + " "
        if (n % 10 > 0) {
          current += ones[n % 10] + " "
        }
      }
    }
    return current.trim()
  }

  let words = ""
  let n = rupees

  if (n >= 10000000) {
    const crore = Math.floor(n / 10000000)
    words += convertLessThanOneThousand(crore) + " Crore "
    n %= 10000000
  }
  if (n >= 100000) {
    const lakh = Math.floor(n / 100000)
    words += convertLessThanOneThousand(lakh) + " Lakh "
    n %= 100000
  }
  if (n >= 1000) {
    const thousand = Math.floor(n / 1000)
    words += convertLessThanOneThousand(thousand) + " Thousand "
    n %= 1000
  }
  if (n > 0) {
    words += convertLessThanOneThousand(n) + " "
  }

  words = words.trim()
  let result = words ? `${words} Rupees` : "Zero Rupees"

  if (paise > 0) {
    const paiseWords = convertLessThanOneThousand(paise)
    result += ` and ${paiseWords} Paise`
  }

  return `${result} Only`
}

function formatExpDate(exp?: string): string {
  if (!exp) return "Dec-26"
  const trimmed = String(exp).trim()
  if (/^[A-Za-z]{3}-\d{2}$/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return trimmed
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const m = months[d.getMonth()]
  const y = String(d.getFullYear()).slice(-2)
  return `${m}-${y}`
}

function formatReceiptDate(val?: any): string {
  if (!val) return "10-Sep-2026"
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  const day = String(d.getDate()).padStart(2, "0")
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const m = months[d.getMonth()]
  const y = d.getFullYear()
  return `${day}-${m}-${y}`
}

function formatReceiptDateTime(val?: any): string {
  if (!val) return "10-Sep-2026 07:14:38"
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  const day = String(d.getDate()).padStart(2, "0")
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const m = months[d.getMonth()]
  const y = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, "0")
  const mins = String(d.getMinutes()).padStart(2, "0")
  const secs = String(d.getSeconds()).padStart(2, "0")
  return `${day}-${m}-${y} ${hours}:${mins}:${secs}`
}

interface InvoicePrintModalProps {
  bill?: any
  returnRecord?: any
  onClose: () => void
  autoPrint?: boolean
  initialView?: "bill" | "return_voucher"
}

export default function InvoicePrintModal({
  bill,
  returnRecord,
  onClose,
  autoPrint = false,
  initialView,
}: InvoicePrintModalProps) {
  const [isPdfLoading, setIsPdfLoading] = useState(false)

  if (!bill && !returnRecord) return null

  let effectiveBill = bill || {}
  if (typeof effectiveBill === "string") {
    const found = PharmacyDatabase.getBills().find(
      (b) => b.id === effectiveBill || b.billNumber === effectiveBill,
    )
    if (found) {
      effectiveBill = found
    }
  }

  const activeReturn = returnRecord || effectiveBill.returnRecord
  const hasBoth = Boolean(activeReturn && effectiveBill && (effectiveBill.items?.length > 0 || effectiveBill.billNumber))

  const [activeDocType, setActiveDocType] = useState<"bill" | "return_voucher">(() => {
    if (initialView) return initialView
    if (returnRecord && (!bill || !bill.items || bill.items.length === 0)) return "return_voucher"
    return "bill"
  })

  const isReturnVoucher = activeDocType === "return_voucher" || Boolean(returnRecord && (!bill || !bill.items || bill.items.length === 0))
  const isModifiedBill = !isReturnVoucher && Boolean(
    effectiveBill.isModifiedReturnBill ||
    effectiveBill.billNumber?.startsWith("MOD-") ||
    activeReturn
  )
  const isReturnBill = isReturnVoucher || isModifiedBill

  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [autoPrint])

  // Compute item rows with all hospital fields accurately mapped
  let rawItems: any[] = []
  if (isReturnVoucher && activeReturn?.items && activeReturn.items.length > 0) {
    rawItems = activeReturn.items
  } else if (Array.isArray(effectiveBill.items) && effectiveBill.items.length > 0) {
    rawItems = effectiveBill.items
  } else if (activeReturn?.items && activeReturn.items.length > 0) {
    rawItems = activeReturn.items
  }

  const processedItems = rawItems.map((c: any) => {
    let medName = c.medicineName || c.medicine || ""
    if (!medName && c.medicineId) {
      const med = PharmacyDatabase.getMedicines().find((m) => m.id === c.medicineId)
      if (med) medName = med.brandName || med.medicineName
    }
    medName = medName || "Unknown Medicine"

    const qty = Number(c.quantity || c.qty || c.returnQuantity || 1)
    const rate = Number(c.unitPrice || c.mrp || c.rate || 0)
    const amount = Number(c.grossAmount !== undefined ? c.grossAmount : qty * rate)
    const discountPercent = Number(c.discount || 0)
    const discAmt = Number(
      c.discountAmount !== undefined
        ? c.discountAmount
        : amount * (discountPercent / 100),
    )
    const taxableAmt = Number(
      c.taxableAmount !== undefined ? c.taxableAmount : amount - discAmt,
    )
    const taxRate = Number(c.tax !== undefined ? c.tax : 5)
    const cgstRate = Number(c.cgstRate !== undefined ? c.cgstRate : taxRate / 2)
    const sgstRate = Number(c.sgstRate !== undefined ? c.sgstRate : taxRate / 2)
    const cgstAmt = Number(
      c.cgstAmount !== undefined ? c.cgstAmount : taxableAmt * (cgstRate / 100),
    )
    const sgstAmt = Number(
      c.sgstAmount !== undefined ? c.sgstAmount : taxableAmt * (sgstRate / 100),
    )
    const billAmt = Number(
      c.totalPrice !== undefined
        ? c.totalPrice
        : taxableAmt + cgstAmt + sgstAmt,
    )

    // Clean HSN code
    const hsnCode = c.hsnCode || c.hsn || "3004 039"

    // Short manufacturer code (e.g. MAN, SUN H, COR)
    let mnf = c.mnf || c.manufacturer || ""
    if (!mnf || mnf.length > 6) {
      mnf = medName.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "MAN"
    }

    // Short shelf code
    const sh = c.sh || ""

    // Batch and expiry
    const batchNo = c.batchNumber || c.batch || "-"
    const expDt = formatExpDate(c.expiryDate || c.expiry)

    // Bin No: avoid printing large department strings like "MAIN PHARMACY"
    const rawBin = String(c.binNo || c.bin || "").trim()
    const binNo =
      rawBin.length <= 5 && !rawBin.toLowerCase().includes("pharmacy")
        ? rawBin
        : ""

    return {
      medName,
      hsnCode,
      mnf,
      sh,
      batchNo,
      expDt,
      binNo,
      qty,
      rate,
      amount,
      discAmt,
      taxableAmt,
      cgstRate,
      cgstAmt,
      sgstRate,
      sgstAmt,
      billAmt,
      // For return items
      origQty: c.originalQuantity || qty,
      retQty: c.returnQuantity || 0,
      finQty: c.finalQuantity !== undefined ? c.finalQuantity : qty,
      refundAmount: c.refundAmount || 0,
    }
  })

  // Calculate table totals
  const totalQty = processedItems.reduce((s, i) => s + (i.qty || 0), 0)
  const totalGrossAmount = processedItems.reduce((s, i) => s + (i.amount || 0), 0)
  const totalDiscAmt = processedItems.reduce((s, i) => s + (i.discAmt || 0), 0)
  const totalTaxableAmt = processedItems.reduce(
    (s, i) => s + (i.taxableAmt || 0),
    0,
  )
  const totalCgstAmt = processedItems.reduce((s, i) => s + (i.cgstAmt || 0), 0)
  const totalSgstAmt = processedItems.reduce((s, i) => s + (i.sgstAmt || 0), 0)
  const totalBillAmt = isReturnVoucher
    ? Number(activeReturn?.totalRefund || activeReturn?.refundAmount || processedItems.reduce((s, i) => s + (i.refundAmount || i.billAmt || 0), 0))
    : effectiveBill.totalAmount !== undefined
    ? Number(effectiveBill.totalAmount)
    : processedItems.reduce((s, i) => s + (i.billAmt || 0), 0)

  const handlePrintReceipt = () => {
    window.print()
  }

  const handleDownloadPdf = async () => {
    try {
      setIsPdfLoading(true)
      await downloadPharmacyInvoicePdf(
        effectiveBill,
        isReturnBill,
        processedItems,
        {
          totalQty,
          totalGrossAmount,
          totalDiscAmt,
          totalTaxableAmt,
          totalCgstAmt,
          totalSgstAmt,
          totalBillAmt,
        },
        numberToWords(totalBillAmt),
      )
    } catch (err) {
      console.error("PDF generation error, falling back to print dialog:", err)
      handlePrintReceipt()
    } finally {
      setIsPdfLoading(false)
    }
  }

  const handleDirectPrintPdf = async () => {
    try {
      setIsPdfLoading(true)
      await printPharmacyInvoicePdfDirect(
        effectiveBill,
        isReturnBill,
        processedItems,
        {
          totalQty,
          totalGrossAmount,
          totalDiscAmt,
          totalTaxableAmt,
          totalCgstAmt,
          totalSgstAmt,
          totalBillAmt,
        },
        numberToWords(totalBillAmt),
      )
    } catch (err) {
      console.error("Direct PDF print error, falling back to receipt print:", err)
      handlePrintReceipt()
    } finally {
      setIsPdfLoading(false)
    }
  }

  return createPortal(
    <div
      id="pharmacy-modal-portal"
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white"
    >
      <style>{`
        @media print {
          body > *:not(#pharmacy-modal-portal) {
            display: none !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #pharmacy-modal-portal {
            position: static !important;
            inset: auto !important;
            display: block !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            z-index: 99999 !important;
          }
          #printable-invoice {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
          }
          .print\\:hidden, .print\\:hidden * {
            display: none !important;
            visibility: hidden !important;
          }
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
        }
      `}</style>

      <div
        id="printable-invoice"
        className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto print:max-w-none print:shadow-none print:w-full print:m-0 print:border-none print:outline-none print:overflow-visible relative"
      >
        {/* Modal Controls (Hidden in Print) */}
        <div className="p-4 print:p-0 border-b border-[#DDE2EC] flex flex-wrap justify-between items-center gap-3 print:hidden bg-[#F8FAFC] sticky top-0 z-20">
          <div className="flex items-center gap-2">
            {isReturnVoucher ? (
              <RotateCcw className="text-purple-600" size={20} />
            ) : (
              <CheckCircle className="text-teal-600" size={20} />
            )}
            <h2 className="text-base font-bold text-[#0F1624]">
              {isReturnVoucher
                ? `Return Refund Voucher (${activeReturn?.returnNumber || effectiveBill.billNumber})`
                : isModifiedBill
                ? `Pharmacy Receipt — Modified Bill (${effectiveBill.billNumber})`
                : `Pharmacy Receipt (${effectiveBill.billNumber})`}
            </h2>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                isReturnVoucher
                  ? "bg-purple-100 text-purple-800"
                  : isModifiedBill
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {isReturnVoucher ? "CREDIT NOTE" : isModifiedBill ? "MODIFIED INVOICE" : "TAX INVOICE"}
            </span>

            {/* If both modified bill and return voucher are available, allow 1-click toggle */}
            {hasBoth && (
              <div className="ml-3 flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                <button
                  type="button"
                  onClick={() => setActiveDocType("bill")}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    activeDocType === "bill"
                      ? "bg-white text-teal-800 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📄 Modified Bill
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDocType("return_voucher")}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    activeDocType === "return_voucher"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ↩ Refund Voucher
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="bg-white border border-[#CBD5E1] hover:bg-slate-100 text-[#334155] px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <X size={14} /> Close
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isPdfLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Download official PDF invoice document"
            >
              <Download size={14} /> {isPdfLoading ? "Generating..." : "Download PDF"}
            </button>
            <button
              onClick={handleDirectPrintPdf}
              disabled={isPdfLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Print PDF directly via browser printer"
            >
              <Printer size={14} /> Print PDF
            </button>
            <button
              onClick={handlePrintReceipt}
              className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-1.5 text-xs font-bold flex items-center gap-2 rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Open browser print dialog for receipt format"
            >
              <FileText size={14} /> Print Receipt
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div
          id="pharmacy-invoice-printable-content"
          className="p-8 print:p-4 font-sans text-xs print:text-[9px] text-black w-full mx-auto bg-white relative leading-normal"
        >
          {/* Subtle Full-Page Background Watermark */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center overflow-hidden z-0 select-none">
            <img
              src={RECEIPT_LOGO_BASE64}
              alt="Hospital Logo Watermark"
              className="w-[480px] max-w-full object-contain opacity-[0.06] print:opacity-[0.06] grayscale contrast-50 brightness-125"
            />
            <div className="text-[34px] font-black tracking-widest text-slate-500 uppercase -mt-4 font-sans opacity-[0.05] print:opacity-[0.05]">
              IMPERIAL HOSPITALS
            </div>
          </div>

          <div className="relative z-10">
            {/* Header: Left Pharmacy info + Right Invoice meta table */}
            <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3 gap-6">
              {/* Left Details */}
              <div className="flex-1">
                <h1 className="text-xl font-black tracking-wider text-black font-sans leading-tight">
                  VH PHARMACY
                </h1>
                <div className="text-[10px] print:text-[8.5px] text-gray-800 leading-tight mt-1 space-y-0.5">
                  <p>27-1-7/3/1, Premises Of Imperial Hospital,</p>
                  <p>J P Road, Bhimavaram, West Godavari,</p>
                  <p>Andhra Pradesh-534202</p>
                  <p className="font-bold text-black pt-0.5">
                    GST No : 37AASFV7563M1Z1
                  </p>
                </div>
                <div className="mt-2">
                  <h2 className="text-[12px] print:text-[9.5px] font-black uppercase text-black tracking-wide">
                    {isReturnVoucher
                      ? "CREDIT NOTE / RETURN REFUND VOUCHER"
                      : isModifiedBill
                      ? "Pharmacy Receipt — Modified Bill"
                      : "Pharmacy Receipt"}
                  </h2>
                  <h3 className="text-[11px] print:text-[8.5px] font-black uppercase text-black tracking-wider">
                    {isReturnVoucher ? "RETURN REFUND VOUCHER" : "TAX INVOICE"}
                  </h3>
                </div>
              </div>

              {/* Right Metadata Table (Exact layout as photo) */}
              <div className="shrink-0 text-[10px] print:text-[8.5px]">
                <table className="text-left border-collapse leading-snug">
                  <tbody>
                    <tr>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        {isReturnVoucher ? "Voucher No" : "Bill No"}
                      </td>
                      <td className="py-0.5 pr-5 font-mono font-bold text-black whitespace-nowrap">
                        : {isReturnVoucher ? (activeReturn?.returnNumber || effectiveBill.billNumber) : effectiveBill.billNumber}
                      </td>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        {isReturnVoucher ? "Return Date" : "Bill Date"}
                      </td>
                      <td className="py-0.5 font-mono text-black whitespace-nowrap">
                        : {formatReceiptDate(activeReturn?.createdAt || effectiveBill.createdAt || effectiveBill.date)}
                      </td>
                    </tr>
                    {isReturnVoucher && (
                      <tr>
                        <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                          Orig Bill No
                        </td>
                        <td colSpan={3} className="py-0.5 font-mono font-bold text-blue-900 whitespace-nowrap">
                          : {activeReturn?.originalBillNumber || effectiveBill.originalBillNumber || effectiveBill.billNumber}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        UMR No
                      </td>
                      <td className="py-0.5 pr-5 font-mono font-bold text-black whitespace-nowrap">
                        : {effectiveBill.uhid || "UMR112320"}
                      </td>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        Dt of Supply
                      </td>
                      <td className="py-0.5 font-mono text-black whitespace-nowrap">
                        : {formatReceiptDateTime(effectiveBill.createdAt || effectiveBill.date)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        Patient Name
                      </td>
                      <td colSpan={3} className="py-0.5 font-bold uppercase text-black">
                        : {effectiveBill.patientName || "Mr . G KUMAR"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        Doctor Name
                      </td>
                      <td className="py-0.5 pr-5 font-bold text-black whitespace-nowrap">
                        : {effectiveBill.doctorName || "Dr. CHAITANYA BANDARU"}
                      </td>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        D.L.No.
                      </td>
                      <td className="py-0.5 font-mono text-black whitespace-nowrap">
                        : AP/05/02/2017-13965
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        RCM Invoice
                      </td>
                      <td className="py-0.5 pr-5 text-black">
                        : NO
                      </td>
                      <td className="py-0.5 pr-2 font-bold whitespace-nowrap text-gray-900">
                        Payment Mode
                      </td>
                      <td className="py-0.5 font-mono font-bold uppercase text-black whitespace-nowrap">
                        : {effectiveBill.paymentMode || "Cash"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Main Medicines Table (Exact column alignment as Image 2) */}
            <div className="w-full my-2">
              <table className="w-full text-[9.5px] print:text-[8px] border-collapse leading-tight table-auto">
                <thead>
                  <tr className="border-t-2 border-b border-black text-black font-bold uppercase text-[9px] print:text-[7.5px]">
                    <th rowSpan={2} className="text-left py-1.5 pr-2 font-bold">
                      Item Desc
                    </th>
                    <th rowSpan={2} className="text-left py-1.5 px-1.5 font-bold whitespace-nowrap">
                      HSN Code
                    </th>
                    <th rowSpan={2} className="text-left py-1.5 px-1.5 font-bold">
                      Mnf
                    </th>
                    <th rowSpan={2} className="text-center py-1.5 px-1 font-bold">
                      Sh
                    </th>
                    <th rowSpan={2} className="text-left py-1.5 px-2 font-bold whitespace-nowrap">
                      Batch No
                    </th>
                    <th rowSpan={2} className="text-left py-1.5 px-1.5 font-bold whitespace-nowrap">
                      Exp Dt
                    </th>
                    <th rowSpan={2} className="text-center py-1.5 px-1 font-bold whitespace-nowrap">
                      Bin No
                    </th>
                    <th rowSpan={2} className="text-right py-1.5 px-1.5 font-bold">
                      Qty
                    </th>
                    <th rowSpan={2} className="text-right py-1.5 px-1.5 font-bold">
                      Rate
                    </th>
                    <th rowSpan={2} className="text-right py-1.5 px-2 font-bold">
                      Amount
                    </th>
                    <th rowSpan={2} className="text-right py-1.5 px-1.5 font-bold whitespace-nowrap">
                      Disc Amt
                    </th>
                    <th rowSpan={2} className="text-right py-1.5 px-2 font-bold whitespace-nowrap">
                      Taxable Amt
                    </th>
                    <th colSpan={2} className="text-center py-0.5 px-1 font-bold border-b border-black">
                      CGST
                    </th>
                    <th colSpan={2} className="text-center py-0.5 px-1 font-bold border-b border-black">
                      SGST
                    </th>
                    <th rowSpan={2} className="text-right py-1.5 pl-2 font-bold whitespace-nowrap">
                      Bill Amt
                    </th>
                  </tr>
                  <tr className="border-b-2 border-black text-black font-bold text-[8px] print:text-[7px] uppercase">
                    <th className="text-right py-0.5 px-1 font-bold">%</th>
                    <th className="text-right py-0.5 px-1 font-bold">Amt</th>
                    <th className="text-right py-0.5 px-1 font-bold">%</th>
                    <th className="text-right py-0.5 px-1 font-bold">Amt</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {processedItems.map((c, i) => (
                    <tr key={i} className="align-top hover:bg-slate-50/50">
                      <td className="text-left py-1.5 pr-2 font-medium max-w-[200px] break-words">
                        {c.medName}
                      </td>
                      <td className="text-left py-1.5 px-1.5 font-mono whitespace-nowrap">
                        {c.hsnCode}
                      </td>
                      <td className="text-left py-1.5 px-1.5 font-mono uppercase">
                        {c.mnf}
                      </td>
                      <td className="text-center py-1.5 px-1">
                        {c.sh}
                      </td>
                      <td className="text-left py-1.5 px-2 font-mono whitespace-nowrap font-medium">
                        {c.batchNo}
                      </td>
                      <td className="text-left py-1.5 px-1.5 whitespace-nowrap">
                        {c.expDt}
                      </td>
                      <td className="text-center py-1.5 px-1 whitespace-nowrap">
                        {c.binNo}
                      </td>
                      <td className="text-right py-1.5 px-1.5 font-semibold">
                        {c.qty}
                      </td>
                      <td className="text-right py-1.5 px-1.5 font-mono">
                        {c.rate.toFixed(2)}
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono">
                        {c.amount.toFixed(2)}
                      </td>
                      <td className="text-right py-1.5 px-1.5 font-mono">
                        {c.discAmt > 0 ? `-${c.discAmt.toFixed(2)}` : "0.00"}
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono">
                        {c.taxableAmt.toFixed(2)}
                      </td>
                      <td className="text-right py-1.5 px-1 font-mono">
                        {c.cgstRate}
                      </td>
                      <td className="text-right py-1.5 px-1 font-mono">
                        {c.cgstAmt.toFixed(2)}
                      </td>
                      <td className="text-right py-1.5 px-1 font-mono">
                        {c.sgstRate}
                      </td>
                      <td className="text-right py-1.5 px-1 font-mono">
                        {c.sgstAmt.toFixed(2)}
                      </td>
                      <td className="text-right py-1.5 pl-2 font-bold font-mono">
                        {c.billAmt.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>

                <tfoot className="border-t-2 border-b-2 border-black text-[9.5px] print:text-[8px] font-bold">
                  <tr>
                    <td colSpan={7} className="py-1.5 px-1 text-right font-bold uppercase">
                      Total:
                    </td>
                    <td className="py-1.5 px-1.5 text-right font-bold">
                      {totalQty}
                    </td>
                    <td className="py-1.5 px-1.5 text-right"></td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold">
                      {totalGrossAmount.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-1.5 text-right font-mono font-bold">
                      {totalDiscAmt > 0 ? `-${totalDiscAmt.toFixed(2)}` : "0.00"}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold">
                      {totalTaxableAmt.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-1"></td>
                    <td className="py-1.5 px-1 text-right font-mono font-bold">
                      {totalCgstAmt.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-1"></td>
                    <td className="py-1.5 px-1 text-right font-mono font-bold">
                      {totalSgstAmt.toFixed(2)}
                    </td>
                    <td className="py-1.5 pl-2 text-right font-mono font-black text-[10.5px] print:text-[9px]">
                      {totalBillAmt.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bottom Section: Amount in words, Payment mode breakdown, and Signatures */}
            <div className="mt-4 flex justify-between items-start text-[10px] print:text-[8.5px] leading-relaxed">
              <div className="space-y-2 max-w-xl">
                <p className="font-semibold text-black">
                  {isReturnVoucher ? "Total Refunded sum of " : "Received sum of "}
                  <span className="font-bold uppercase">
                    {numberToWords(totalBillAmt)}
                  </span>{" "}
                  {isReturnVoucher ? "towards Returned Medicines" : "towards Above Bill"}
                </p>

                <div className="pt-2 border-t border-dashed border-gray-400 space-y-1 font-mono text-[9.5px] print:text-[8.5px]">
                  <div className="flex items-center gap-6">
                    <span className="w-28 font-bold text-gray-900">
                      {isReturnVoucher
                        ? "Refund Mode :"
                        : effectiveBill.paymentMode?.toLowerCase().includes("card")
                        ? "Card Amount :"
                        : effectiveBill.paymentMode?.toLowerCase().includes("upi")
                        ? "UPI Amount :"
                        : "Cash Amount :"}
                    </span>
                    <span className="font-bold text-black">
                      ₹{totalBillAmt.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="w-28 font-bold text-gray-900">
                      {isReturnVoucher ? "Total Refund :" : "Receipt Amount :"}
                    </span>
                    <span className="font-bold text-black">
                      ₹{totalBillAmt.toFixed(2)}
                    </span>
                  </div>

                  {effectiveBill.paymentsData?.refs &&
                    Object.keys(effectiveBill.paymentsData.refs).length > 0 && (
                      <div className="text-[8.5px] print:text-[7.5px] text-gray-600 font-sans">
                        POS Slip No / Auth Code:{" "}
                        {Object.entries(effectiveBill.paymentsData.refs)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")}
                      </div>
                    )}
                </div>
              </div>

              <div className="text-right pt-6 pr-4 shrink-0">
                <div className="w-48 border-b border-black mb-1.5 ml-auto"></div>
                <p className="font-bold text-[9px] print:text-[8px] uppercase tracking-wider text-black">
                  Authorized Signatory / Pharmacist
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Dialog Action Controls (Hidden on Print) */}
          <div className="mt-8 pt-4 border-t border-[#DDE2EC] flex justify-between items-center print:hidden">
            <button
              onClick={onClose}
              className="bg-white border border-[#CBD5E1] hover:bg-slate-100 text-[#334155] px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              ← Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadPdf}
                disabled={isPdfLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold flex items-center gap-2 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Download size={16} /> {isPdfLoading ? "Generating PDF..." : "Print / Download PDF"}
              </button>
              <button
                onClick={handlePrintReceipt}
                className="bg-teal-700 hover:bg-teal-800 text-white px-5 py-2 text-sm font-bold flex items-center gap-2 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Printer size={16} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
