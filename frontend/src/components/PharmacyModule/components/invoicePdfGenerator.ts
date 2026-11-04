function formatReceiptDateShort(val?: any): string {
  if (!val) return "—"
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatReceiptDateTime(val?: any): string {
  if (!val) return "—"
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  const dt = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  const tm = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
  return `${dt} ${tm}`
}

export interface PharmacyInvoiceTotals {
  totalQty: number
  totalGrossAmount: number
  totalDiscAmt: number
  totalTaxableAmt: number
  totalCgstAmt: number
  totalSgstAmt: number
  totalBillAmt: number
}

const pdfSafe = (str: any) =>
  String(str ?? "")
    .replace(/₹\s?/g, "Rs ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→⟶]/g, "->")
    .replace(/[•·]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")

export async function buildPharmacyInvoicePdf(
  bill: any,
  isReturnBill: boolean,
  processedItems: any[],
  totals: PharmacyInvoiceTotals,
  amountInWords: string,
) {
  const [jspdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])

  const jsPDF = jspdfModule.jsPDF || jspdfModule.default || jspdfModule
  const autoTableFn =
    (autoTableModule as any).default ||
    (autoTableModule as any).autoTable ||
    autoTableModule

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 10
  let y = 12

  // 1. Header - Pharmacy Brand
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(15, 23, 42)
  doc.text("VH PHARMACY", margin, y)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(51, 65, 85)
  y += 4.5
  doc.text("27-1-7/3/1, Premises Of Imperial Hospital, J P Road, Bhimavaram, West Godavari, AP-534202", margin, y)
  y += 3.5
  doc.text("GST No : 37AASFV7563M1Z1 | DL No : 04/WGV/AP/2021-11843, 04/WGV/AP/2021-11844", margin, y)

  y += 5
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)

  // Title
  y += 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.setTextColor(0, 0, 0)
  const titleText = isReturnBill
    ? "PHARMACY RECEIPT — MODIFIED BILL (TAX INVOICE)"
    : "PHARMACY RECEIPT — TAX INVOICE"
  doc.text(titleText, margin, y)

  // 2. Invoice Meta Table / Grid (2-column layout)
  y += 3
  const billNo = bill.billNumber || "PH-BILL"
  const billDate = formatReceiptDateShort(bill.createdAt || bill.date)
  const uhid = bill.uhid || "UMR112320"
  const supplyDate = formatReceiptDateTime(bill.createdAt || bill.date)
  const patientName = bill.patientName || "Mr. G KUMAR"
  const ageGender = `${bill.age || 45} Y / ${bill.gender || "Male"}`
  const doctor = bill.doctorName || bill.prescribedBy || "Dr. Rajesh Varma"
  const ipOp = bill.ipOpNumber || bill.encounterId || "OP89124"

  const metaData = [
    [
      `Bill No: ${billNo}`,
      `Bill Date: ${billDate}`,
      `Dt of Supply: ${supplyDate}`,
      `UMR No: ${uhid}`,
    ],
    [
      `Patient Name: ${patientName}`,
      `Age / Sex: ${ageGender}`,
      `Consultant: ${doctor}`,
      `IP/OP No: ${ipOp}`,
    ],
  ]

  const runAutoTable = (options: any) => {
    if (typeof (doc as any).autoTable === "function") {
      ;(doc as any).autoTable(options)
    } else if (typeof autoTableFn === "function") {
      autoTableFn(doc, options)
    }
  }

  runAutoTable({
    startY: y,
    margin: { left: margin, right: margin },
    body: metaData,
    theme: "plain",
    styles: {
      fontSize: 7.5,
      cellPadding: 1,
      textColor: [15, 23, 42],
      font: "helvetica",
    },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: "bold" },
      1: { cellWidth: 45 },
      2: { cellWidth: 55 },
      3: { cellWidth: 45, fontStyle: "bold" },
    },
  })

  y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 2 : y + 30

  // 3. Item Details Table
  const tableHead = [
    [
      "#",
      "Item Description",
      "HSN",
      "Batch",
      "Exp",
      "Qty",
      "Rate",
      "Disc",
      "Taxable",
      "CGST",
      "SGST",
      "Total",
    ],
  ]

  const tableBody = processedItems.map((item, idx) => [
    String(idx + 1),
    pdfSafe(item.medName || "Item"),
    pdfSafe(item.hsnCode || "-"),
    pdfSafe(item.batchNo || "-"),
    pdfSafe(item.expDt || "-"),
    String(item.qty || 1),
    Number(item.rate || 0).toFixed(2),
    Number(item.discAmt || 0).toFixed(2),
    Number(item.taxableAmt || 0).toFixed(2),
    Number(item.cgstAmt || 0).toFixed(2),
    Number(item.sgstAmt || 0).toFixed(2),
    Number(item.billAmt || 0).toFixed(2),
  ])

  const tableFoot = [
    [
      "Total",
      "",
      "",
      "",
      "",
      String(totals.totalQty),
      "",
      totals.totalDiscAmt.toFixed(2),
      totals.totalTaxableAmt.toFixed(2),
      totals.totalCgstAmt.toFixed(2),
      totals.totalSgstAmt.toFixed(2),
      totals.totalBillAmt.toFixed(2),
    ],
  ]

  runAutoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: tableHead,
    body: tableBody,
    foot: tableFoot,
    theme: "grid",
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [0, 0, 0],
      fontSize: 7,
      fontStyle: "bold",
      halign: "center",
      lineWidth: 0.2,
      lineColor: [100, 116, 139],
    },
    bodyStyles: {
      fontSize: 6.8,
      cellPadding: 1.2,
      textColor: [15, 23, 42],
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [0, 0, 0],
      fontSize: 7,
      fontStyle: "bold",
      lineWidth: 0.2,
      lineColor: [100, 116, 139],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 7 },
      1: { cellWidth: 46 },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "center", cellWidth: 14 },
      4: { halign: "center", cellWidth: 12 },
      5: { halign: "right", cellWidth: 9 },
      6: { halign: "right", cellWidth: 14 },
      7: { halign: "right", cellWidth: 12 },
      8: { halign: "right", cellWidth: 16 },
      9: { halign: "right", cellWidth: 14 },
      10: { halign: "right", cellWidth: 14 },
      11: { halign: "right", cellWidth: 18, fontStyle: "bold" },
    },
  })

  y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 4 : y + 40

  // 4. Summary & Totals Box
  const summaryBoxWidth = 75
  const summaryX = pageW - margin - summaryBoxWidth

  // Left Details: Amount in words & payment details
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(30, 41, 59)
  doc.text(`Amount in Words:`, margin, y)
  doc.setFont("helvetica", "bold")
  const splitWords = doc.splitTextToSize(pdfSafe(amountInWords), summaryX - 10)
  doc.text(splitWords, margin, y + 4)

  const paymentMode = String(bill.paymentMethod || bill.mode || "Cash").toUpperCase()
  doc.setFont("helvetica", "normal")
  doc.text(`Payment Mode: ${paymentMode}`, margin, y + 14)
  if (bill.cashTendered || bill.tenderedCash) {
    const tendered = Number(bill.cashTendered || bill.tenderedCash || 0)
    const change = Number(bill.changeDue || Math.max(0, tendered - totals.totalBillAmt))
    doc.text(`Tendered: Rs. ${tendered.toFixed(2)}  |  Change: Rs. ${change.toFixed(2)}`, margin, y + 18)
  }

  // Right Details: Financial Summary
  doc.setFont("helvetica", "normal")
  doc.text("Gross Amount:", summaryX, y)
  doc.text(`Rs. ${totals.totalGrossAmount.toFixed(2)}`, pageW - margin, y, { align: "right" })

  doc.text("Total Discount:", summaryX, y + 4)
  doc.text(`- Rs. ${totals.totalDiscAmt.toFixed(2)}`, pageW - margin, y + 4, { align: "right" })

  doc.text("Taxable Value:", summaryX, y + 8)
  doc.text(`Rs. ${totals.totalTaxableAmt.toFixed(2)}`, pageW - margin, y + 8, { align: "right" })

  doc.text("Total CGST:", summaryX, y + 12)
  doc.text(`Rs. ${totals.totalCgstAmt.toFixed(2)}`, pageW - margin, y + 12, { align: "right" })

  doc.text("Total SGST:", summaryX, y + 16)
  doc.text(`Rs. ${totals.totalSgstAmt.toFixed(2)}`, pageW - margin, y + 16, { align: "right" })

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(summaryX, y + 19, pageW - margin, y + 19)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.text("Net Bill Amount:", summaryX, y + 23)
  doc.text(`Rs. ${totals.totalBillAmt.toFixed(2)}`, pageW - margin, y + 23, { align: "right" })

  // 5. Signatory Footer
  y += 34
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.line(pageW - margin - 50, y, pageW - margin, y)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text("Authorized Signatory / Pharmacist", pageW - margin - 50, y + 4)

  doc.setFont("helvetica", "italic")
  doc.setFontSize(6.5)
  doc.setTextColor(100, 116, 139)
  doc.text("Computer generated invoice. Requires no physical signature. Goods once sold will be accepted back per pharmacy policy.", margin, y + 4)

  return doc
}

export async function downloadPharmacyInvoicePdf(
  bill: any,
  isReturnBill: boolean,
  processedItems: any[],
  totals: PharmacyInvoiceTotals,
  amountInWords: string,
) {
  const doc = await buildPharmacyInvoicePdf(
    bill,
    isReturnBill,
    processedItems,
    totals,
    amountInWords,
  )
  const filename = `Pharmacy_Receipt_${bill.billNumber || "Invoice"}.pdf`
  doc.save(filename)
}

export async function printPharmacyInvoicePdfDirect(
  bill: any,
  isReturnBill: boolean,
  processedItems: any[],
  totals: PharmacyInvoiceTotals,
  amountInWords: string,
) {
  const doc = await buildPharmacyInvoicePdf(
    bill,
    isReturnBill,
    processedItems,
    totals,
    amountInWords,
  )
  doc.autoPrint()
  const blob = doc.output("blob")
  const blobUrl = URL.createObjectURL(blob)
  const printWindow = window.open(blobUrl, "_blank")
  if (!printWindow) {
    window.print()
  }
}
