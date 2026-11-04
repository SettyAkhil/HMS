import React, { useMemo } from "react"

import { ClaimRecord, PaymentRecord } from "../services/billingDb"

import {
  formatReceiptDateTime,
  formatReceiptDateShort,
  formatReceiptTimeWithSeconds,
  groupReceiptItems,
  numberToWordsINR,
} from "../utils/receiptFormatter"
import { RECEIPT_LOGO_BASE64 } from "../assets/receiptLogoBase64"
import { SendToPatientButton } from "./messaging/SendToPatientDialog"
import { billMessageVars, buildBillDocument } from "../lib/patientDocuments"

interface HospitalReceiptModalProps {
  claim: ClaimRecord

  payment?: PaymentRecord | null

  onClose: () => void

  hospitalDetails?: {
    name?: string

    unitOf?: string

    addressLine1?: string

    addressLine2?: string

    addressLine3?: string

    gstNo?: string

    phone?: string
  }
}

export default function HospitalReceiptModal({
  claim,

  payment,

  onClose,

  hospitalDetails,
}: HospitalReceiptModalProps) {
  // Hospital Information Defaults

  const hospital = {
    name: hospitalDetails?.name || "IMPERIAL HOSPITALS",

    unitOf:
      hospitalDetails?.unitOf || "A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED",

    addressLine1:
      hospitalDetails?.addressLine1 ||
      "# 27-14-13/A, OPP. GANESH CANTEN STREET,",

    addressLine2:
      hospitalDetails?.addressLine2 ||
      "BESIDE BHASYAM SCHOOL, BHIMAVARAM-534202,",

    addressLine3:
      hospitalDetails?.addressLine3 || "W.G. DIST.(A.P) 08816-279999,279988.",

    gstNo: hospitalDetails?.gstNo || "GST No - 37AALCM2238A1ZQ",
  }

  // Determine Title based on Department / Care Pathway

  const billTitle = useMemo(() => {
    const d = claim.department

    if (d === "Inpatient" || d === "ICU" || d === "Surgery") {
      return "In Patient Final Bill"
    }

    if (d === "Outpatient") {
      return "Out Patient Consultation Bill"
    }

    if (d === "Emergency") {
      return "Emergency Services Bill"
    }

    if (d === "Laboratory") {
      return "Laboratory Diagnostic Bill"
    }

    if (d === "Radiology") {
      return "Radiology & Imaging Bill"
    }

    return "Hospital Bill & Receipt"
  }, [claim.department])

  // Generate or Format Receipt and Bill metadata

  const billNo =
    claim.invoiceNo || `FB${Math.floor(20000 + Math.random() * 80000)}`

  const admissionNo =
    claim.encounterId ||
    claim.hospitalStayId ||
    (claim.department === "Inpatient"
      ? `IP${Math.floor(20000 + Math.random() * 80000)}`
      : `OP${Math.floor(10000 + Math.random() * 90000)}`)

  const billDateTimeStr = formatReceiptDateTime(
    payment?.paymentDate || claim.updatedAt || claim.createdAt,
  )

  const billDateShortStr = formatReceiptDateShort(
    payment?.paymentDate || claim.updatedAt || claim.createdAt,
  )

  const admissionDateTimeStr = formatReceiptDateTime(
    claim.dateOfService || claim.createdAt,
  )

  const startPeriodStr = `${formatReceiptDateShort(claim.dateOfService || claim.createdAt)} 11:14:50AM`

  const endPeriodStr = `${billDateShortStr} ${formatReceiptTimeWithSeconds(payment?.paymentDate || claim.updatedAt || new Date())}`

  // Patient Info

  const prefix =
    claim.gender === "Female" ? (claim.age > 25 ? "Mrs." : "Ms.") : "Mr."

  const patientDisplayName = `${prefix} ${claim.patientName.toUpperCase()}`

  const consultantName = (
    claim.attendingDoctor || "DR. M.RAMA KRISHNA M.S. ENT"
  ).toUpperCase()

  const departmentName = (claim.department || "ENT").toUpperCase()

  const admittedWard =
    claim.department === "Inpatient"
      ? `RECOVERY ROOM 5 FLOOR / BED-${claim.bedId || "204"}`
      : claim.department === "ICU"
        ? "ICU CRITICAL CARE BED-04"
        : claim.department === "Emergency"
          ? "EMERGENCY TRIAGE BED-02"
          : "OP CONSULTATION SUITE #102"

  // Itemized Groups

  const groupedSections = useMemo(
    () => groupReceiptItems(claim.items || []),
    [claim.items],
  )

  // Payment Rows (Receipt / Payment Details Table)
  const isInsuranceClaim =
    !!claim.tpa?.billedAt ||
    (!!claim.insuranceProvider && claim.insuranceProvider !== "Self-Pay" && (claim.amountPaid || 0) === 0)

  const paymentsList = useMemo(() => {
    if (claim.payments && claim.payments.length > 0) {
      return claim.payments
    }

    if (payment) {
      return [payment]
    }

    if (isInsuranceClaim) {
      return [
        {
          id: `INS-${claim.id}`,
          invoiceId: claim.id,
          receiptNo: `INS-${Math.floor(1000 + Math.random() * 9000)}`,
          amount: 0,
          paymentDate: claim.tpa?.billedAt || claim.dateOfService || new Date().toISOString(),
          paymentMethod: "Insurance / Cashless",
          collectedBy: "INS-DESK",
          notes: `Billed to ${claim.insuranceProvider || "Insurance"} - Cashless (Patient Pays ₹0)`,
        },
      ]
    }

    return [
      {
        id: `PAY-${claim.id}`,
        invoiceId: claim.id,
        receiptNo: `59${Math.floor(8500 + Math.random() * 900)}`,
        amount: claim.amountPaid || 0,
        paymentDate: claim.dateOfService || new Date().toISOString(),
        paymentMethod: "Cash",
        collectedBy: "VHC70251",
        notes: claim.amountPaid ? "Payment Collection" : "Pending Bill",
      },
    ]
  }, [
    claim.payments,
    payment,
    claim.id,
    claim.amountPaid,
    claim.totalAmount,
    claim.dateOfService,
    claim.insuranceProvider,
    claim.tpa?.billedAt,
    isInsuranceClaim,
  ])

  const totalReceiptAmount = paymentsList.reduce(
    (sum, p) => sum + (p.amount || 0),
    0,
  )

  const grossAmount = claim.totalAmount || totalReceiptAmount

  const totalReceivedWords =
    totalReceiptAmount === 0 && isInsuranceClaim
      ? "Zero Rupees Only (Cashless Insurance Claim — Patient Payable: ₹0.00)"
      : numberToWordsINR(totalReceiptAmount)

  const grossAmountWords = numberToWordsINR(grossAmount)

  const staffCode = payment?.collectedBy?.includes("VHC")
    ? payment.collectedBy
    : "VHC70251"

  const printedOnStr = `${formatReceiptDateShort(new Date())} ${formatReceiptTimeWithSeconds(new Date())}`

  // The bill as a PDF, by SMS (as a link) and/or WhatsApp (attached).
  const sendBillProps = {
    patient: { name: claim.patientName, phone: claim.phone, id: claim.patientId },
    kind: "bill" as const,
    vars: billMessageVars(claim),
    buildDocument: () => buildBillDocument(claim, payment),
    documentLabel: `${billTitle} ${claim.invoiceNo}`,
  }

  const handlePrint = () => {
    const printEl = document.getElementById("printable-receipt")

    if (!printEl) {
      window.print()

      return
    }

    try {
      const existingFrame = document.getElementById("receipt-print-frame")

      if (existingFrame) existingFrame.remove()

      const iframe = document.createElement("iframe")

      iframe.id = "receipt-print-frame"

      iframe.style.position = "fixed"

      iframe.style.right = "0"

      iframe.style.bottom = "0"

      iframe.style.width = "0"

      iframe.style.height = "0"

      iframe.style.border = "0"

      iframe.style.visibility = "hidden"

      document.body.appendChild(iframe)

      const frameDoc = iframe.contentWindow?.document

      if (frameDoc) {
        frameDoc.open()

        const styleTags = Array.from(
          document.querySelectorAll("style, link[rel='stylesheet']"),
        )

          .map((el) => el.outerHTML)

          .join("\n")

        frameDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>${hospital.name} - ${billTitle}</title>
              ${styleTags}
              <style>
                @page {
                  size: A4 portrait;
                  margin: 8mm 10mm;
                }
                * {
                  box-sizing: border-box;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                html, body {
                  background: #ffffff !important;
                  color: #0f172a !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                }
                #printable-receipt,
                #hospital-printable-receipt {
                  width: 100% !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 6px 10px !important;
                  background: #ffffff !important;
                  color: #0f172a !important;
                }
                table {
                  width: 100% !important;
                  border-collapse: collapse !important;
                }
                th, td {
                  vertical-align: top;
                }
              </style>
            </head>
            <body>
              ${printEl.outerHTML}
            </body>
          </html>
        `)

        frameDoc.close()

        setTimeout(() => {
          iframe.contentWindow?.focus()

          iframe.contentWindow?.print()

          setTimeout(() => {
            iframe.remove()
          }, 2000)
        }, 250)

        return
      }
    } catch (e) {
      console.warn("Iframe printing failed, falling back to window.print():", e)
    }

    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible">
      {/* Standalone Print Style Rules */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #hospital-printable-receipt,
          #hospital-printable-receipt *,
          #printable-receipt,
          #printable-receipt * {
            visibility: visible !important;
          }
          #printable-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
        }
      `}</style>

      {/* Container Card */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[850px] my-auto overflow-hidden border border-slate-300 print:border-0 print:shadow-none print:max-w-none print:w-full">
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-5 py-2.5 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="font-bold text-xs uppercase tracking-wider">
              Hospital Receipt &amp; Tax Invoice · Official Record
            </span>
          </div>

          <div className="flex items-center gap-2">
            <SendToPatientButton
              label="Send"
              className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              {...sendBillProps}
            />
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>🖨️</span> Print Slip
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas */}
        <div
          id="printable-receipt"
          className="p-4 sm:p-8 bg-white text-slate-900 font-sans print:p-0 relative"
        >
          {/* RECEIPT CANVAS */}
          <div
            id="hospital-printable-receipt"
            className="space-y-3 text-[12px] leading-tight select-text relative"
          >
              {/* Background Watermark Logo */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center overflow-hidden z-0 opacity-[0.22] print:opacity-[0.25] select-none">
                <img
                  src={RECEIPT_LOGO_BASE64}
                  alt="Hospital Logo Watermark"
                  className="w-[400px] max-w-full object-contain filter brightness-110 contrast-105"
                />
                <div className="text-[34px] font-extrabold tracking-wider text-slate-700 uppercase -mt-4 font-sans tracking-tight opacity-95">
                  Imperial Hospitals
                </div>
              </div>

              <div className="relative z-10 space-y-3">
                {/* 1. Header Section */}
                <div className="text-center space-y-0.5">
                  <h1 className="text-lg sm:text-xl font-extrabold tracking-wide text-slate-900 uppercase">
                    {hospital.name}
                  </h1>
                  <div className="text-[12px] font-bold tracking-tight text-slate-800 uppercase">
                    {hospital.unitOf}
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium">
                    {hospital.addressLine1}
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium">
                    {hospital.addressLine2}
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium">
                    {hospital.addressLine3}
                  </div>
                  <div className="text-[11.5px] font-bold text-slate-800 tracking-wider pt-0.5">
                    {hospital.gstNo}
                  </div>
                </div>

                {/* Title with "Detailed" mark */}
                <div className="pt-2 pb-1 flex items-center justify-between border-b border-slate-300">
                  <div className="w-16"></div>
                  <h2 className="text-[14px] sm:text-[15px] font-bold text-slate-900 tracking-wide text-center uppercase underline underline-offset-4">
                    {billTitle}
                  </h2>
                  <div className="w-16 text-right text-[11px] font-semibold text-slate-600">
                    Detailed
                  </div>
                </div>

                {/* 2. Two-Column Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[11.5px] py-1">
                  {/* Left Column */}
                  <div className="space-y-0.5">
                    <div className="flex">
                      <span className="w-36 text-slate-700 font-semibold">
                        Bill No
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-bold text-slate-900">{billNo}</span>
                    </div>
                    <div className="flex">
                      <span className="w-36 text-slate-700 font-semibold">
                        Bill Date
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-semibold text-slate-900">
                        {billDateTimeStr}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-36 text-slate-700 font-semibold">
                        Patient Name
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-bold text-slate-900">
                        {patientDisplayName}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-36 text-slate-700 font-semibold">
                        Date Of Admission
                      </span>
                      <span className="mr-2">:</span>
                      <span className="text-slate-900">{admissionDateTimeStr}</span>
                    </div>
                    <div className="flex">
                      <span className="w-36 text-slate-700 font-semibold">
                        Consultant
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-bold text-slate-900">
                        {consultantName}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-36 text-slate-700 font-semibold">
                        Department
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-bold text-slate-900">
                        {departmentName}
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="w-36 text-slate-700 font-semibold shrink-0">
                        Address
                      </span>
                      <span className="mr-2">:</span>
                      <span className="text-slate-800">
                        VEDANGI
                        <br />
                        BHIMAVARAM, ANDHRA PRADESH
                      </span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-0.5">
                    <div className="flex">
                      <span className="w-32 text-slate-700 font-semibold">
                        Admission No
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-bold text-slate-900">
                        {admissionNo}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-700 font-semibold">
                        Bill Date
                      </span>
                      <span className="mr-2">:</span>
                      <span className="text-slate-900">{billDateShortStr}</span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-700 font-semibold">
                        S-W-D-B/O
                      </span>
                      <span className="mr-2">:</span>
                      <span className="text-slate-900"></span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-700 font-semibold">
                        UMR No
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {claim.patientId || claim.mrn}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-700 font-semibold">
                        Age / Sex
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-semibold text-slate-900">
                        {claim.age}Y(s)/{claim.gender}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-700 font-semibold">
                        Admitted Ward
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-bold text-slate-900 uppercase">
                        {admittedWard}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-32 text-slate-700 font-semibold">
                        Referral
                      </span>
                      <span className="mr-2">:</span>
                      <span className="font-semibold text-slate-900">WALKIN</span>
                    </div>
                  </div>
                </div>

                {/* 3. Hospitalisation Charges Banner Box */}
                <div className="border border-slate-400 py-1 px-3 text-center text-[12px] font-bold text-slate-900 my-2">
                  <span>Hospitalisation Charges From &nbsp;&nbsp;</span>
                  <span className="font-mono">{startPeriodStr}</span>
                  <span>&nbsp;&nbsp; To &nbsp;&nbsp;</span>
                  <span className="font-mono">{endPeriodStr}</span>
                </div>

                {/* 4. Itemized Services & Charges Table */}
                <div className="border-t border-b border-slate-400 py-1 my-2">
                  <table className="w-full text-left text-[11.5px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-300 font-bold text-slate-900">
                        <th className="py-1 px-2 text-center w-24">Service Code</th>
                        <th className="py-1 px-2">Services / Investigation</th>
                        <th className="py-1 px-2 text-center w-24">HSN/SAC Code</th>
                        <th className="py-1 px-2 text-center w-12">Qty.</th>
                        <th className="py-1 px-2 text-right w-24">Rate</th>
                        <th className="py-1 px-2 text-right w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-transparent">
                      {groupedSections.map((section, sIdx) => (
                        <React.Fragment key={sIdx}>
                          <tr className="font-bold text-slate-900">
                            <td colSpan={5} className="pt-2 px-2">
                              {section.mainCategory}
                            </td>
                            <td className="pt-2 px-2 text-right font-mono font-bold">
                              {section.subTotal.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>

                          <tr className="font-bold text-slate-800">
                            <td
                              colSpan={5}
                              className="pt-0.5 pl-6 px-2 text-[11px]"
                            >
                              {section.subCategory}
                            </td>
                            <td className="pt-0.5 px-2 text-right font-mono font-bold text-[11px]">
                              {section.subTotal.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>

                          {section.items.map((item, iIdx) => (
                            <tr key={iIdx} className="text-slate-800 text-[11px]">
                              <td className="py-0.5 px-2 text-center font-mono font-medium">
                                {item.serviceCode}
                              </td>
                              <td className="py-0.5 pl-10 px-2 font-medium">
                                {item.description}
                              </td>
                              <td className="py-0.5 px-2 text-center font-mono text-slate-500">
                                {item.hsnSacCode}
                              </td>
                              <td className="py-0.5 px-2 text-center font-mono">
                                {item.qty}
                              </td>
                              <td className="py-0.5 px-2 text-right font-mono">
                                *{" "}
                                {item.rate.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-0.5 px-2 text-right font-mono font-semibold">
                                {item.amount.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}

                      <tr className="border-t border-slate-300">
                        <td
                          colSpan={5}
                          className="pt-2 text-right font-bold text-slate-800 pr-4"
                        >
                          Gross Amount
                        </td>
                        <td className="pt-2 text-right font-mono font-bold text-slate-900 px-2">
                          {grossAmount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                      <tr>
                        <td
                          colSpan={5}
                          className="pb-1 text-right font-bold text-slate-800 pr-4"
                        >
                          Total Receipt
                        </td>
                        <td className="pb-1 text-right font-mono font-bold text-slate-900 px-2">
                          {totalReceiptAmount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 5. Receipt / Payment Details (Advances & Settlements Table) */}
                <div className="pt-2">
                  <div className="font-bold text-slate-900 text-[12px] mb-1">
                    Receipt / Payment Details
                  </div>
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-t border-b border-slate-400 font-bold text-slate-900">
                        <th className="py-1 px-2 w-24">Recpt. No.</th>
                        <th className="py-1 px-2 w-24">Recpt. Dt.</th>
                        <th className="py-1 px-2 text-right w-24">Cash Amt</th>
                        <th className="py-1 px-2 text-right w-24">Cheque Amt</th>
                        <th className="py-1 px-2 text-right w-24">Card Amt</th>
                        <th className="py-1 px-2 text-right w-24">Recpt. Amt.</th>
                        <th className="py-1 px-2 pl-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {paymentsList.map((p, pIdx) => {
                        const isCash = p.paymentMethod === "Cash"

                        const isCard =
                          p.paymentMethod === "Credit Card" ||
                          p.paymentMethod === "Debit Card" ||
                          p.paymentMethod === "UPI / Digital" ||
                          p.paymentMethod as any === "Card"

                        const isCheque =
                          p.paymentMethod === "Cheque" ||
                          p.paymentMethod === "Bank Transfer"

                        const cashAmt = isCash ? p.amount : 0

                        const cardAmt = isCard ? p.amount : 0

                        const chequeAmt = isCheque ? p.amount : 0

                        const recptDate = formatReceiptDateShort(p.paymentDate)

                        const remarks =
                          p.notes ||
                          (pIdx === 0 && paymentsList.length > 1
                            ? "Advances : ADVANCE"
                            : "Advances : INVESTIGATIONS / SETTLEMENT")

                        return (
                          <tr key={pIdx} className="font-mono text-[11px]">
                            <td className="py-1 px-2 font-bold text-slate-900">
                              {p.receiptNo || "598566"}
                            </td>
                            <td className="py-1 px-2 text-slate-700">
                              {recptDate}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {cashAmt.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {chequeAmt.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {cardAmt.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-1 px-2 text-right font-bold text-slate-900">
                              {p.amount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-1 px-2 pl-4 font-sans text-slate-800">
                              {remarks}
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="border-t border-b border-slate-400 font-bold">
                        <td
                          colSpan={5}
                          className="py-1 px-2 text-center font-sans text-slate-900"
                        >
                          Total
                        </td>
                        <td className="py-1 px-2 text-right font-mono text-slate-900">
                          {totalReceiptAmount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 6. Amounts in Words */}
                <div className="pt-2 space-y-1 text-[11.5px]">
                  <div className="flex items-start">
                    <span className="font-bold text-slate-900 w-60 shrink-0">
                      Total Received Amount in Words:
                    </span>
                    <span className="font-semibold text-slate-800 lowercase first-letter:uppercase">
                      {totalReceivedWords}
                    </span>
                  </div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start">
                      <span className="font-bold text-slate-900 w-60 shrink-0">
                        Gross Amount in Words:
                      </span>
                      <span className="font-semibold text-slate-800 lowercase first-letter:uppercase">
                        {grossAmountWords}
                      </span>
                    </div>
                    <div className="text-right font-bold text-slate-900 hidden sm:block">
                      (Authorized Signatory)
                    </div>
                  </div>
                </div>

                {/* 7. Signatures and Prepared Metadata Footer */}
                <div className="pt-4 border-t border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700">
                  <div className="space-y-0.5">
                    <div className="flex">
                      <span className="w-24 font-bold text-slate-900">
                        Prepared By
                      </span>
                      <span className="mr-2 font-bold">:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {staffCode}
                      </span>
                    </div>
                    <div className="flex">
                      <span className="w-24 font-bold text-slate-900">
                        Printed By
                      </span>
                      <span className="mr-2 font-bold">:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {staffCode}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5 sm:text-right">
                    <div className="flex sm:justify-end">
                      <span className="w-24 font-bold text-slate-900 text-left sm:text-right sm:mr-2">
                        Prepared Dt
                      </span>
                      <span className="mr-2 font-bold">:</span>
                      <span className="font-semibold text-slate-900">
                        {billDateTimeStr}
                      </span>
                    </div>
                    <div className="flex sm:justify-end">
                      <span className="w-24 font-bold text-slate-900 text-left sm:text-right sm:mr-2">
                        Printed On
                      </span>
                      <span className="mr-2 font-bold">:</span>
                      <span className="font-semibold text-slate-900">
                        {printedOnStr}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Page Number */}
                <div className="pt-2 text-right text-[10.5px] text-slate-500 font-medium">
                  Page 1 of 1
                </div>
              </div>
            </div>
        </div>

        {/* Modal Action Buttons Footer (Hidden in Print) */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 print:hidden">
          <div className="text-[11.5px] text-slate-500 font-medium flex items-center gap-1.5">
            <span>ℹ️</span> Official Receipt with Backside Logo (A4 Thermal / Laser Ready).
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-xs cursor-pointer transition-colors"
            >
              Close
            </button>
            <SendToPatientButton
              label="Send to patient"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
              {...sendBillProps}
            />
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <span>🖨️</span> Print Official Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
