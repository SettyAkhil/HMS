import React from "react"
import {
  X,
  Printer,
  Download,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Building2,
  Calendar,
  CreditCard,
  Pill,
  User,
  CheckCircle2,
  Clock,
} from "lucide-react"

export interface RevenueReceiptData {
  transactionNumber: string
  invoiceNo: string
  claimId?: string
  umr: string
  patientName: string
  department: string
  revenueSource: string
  paymentMethod: string
  paymentStatus: string
  amount: number
  totalAmount?: number
  date: string
  doctor: string
  description: string
  payer?: string
  sourceType?: string
}

export interface DamagedStockData {
  adjustmentNumber: string
  medicineName: string
  batchNumber: string
  expiryDate: string
  category: string
  supplierName: string
  reason: string
  quantity: number
  unitCost: number
  lossValue: number
  disposalMethod: string
  location: string
  witnessName: string
  approvedBy: string
  reportedBy: string
  date: string
  status: string
}

export interface SupplierReturnData {
  returnNumber: string
  debitNoteNumber: string
  creditNoteId: string
  supplierName: string
  medicineName: string
  batchNumber: string
  reason: string
  quantity: number
  unitCost: number
  returnAmount: number
  status: string
  requestedBy: string
  approvedBy: string
  date: string
  notes: string
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML PRINTER & PDF HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function printHtmlDocument(html: string) {
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1500)
  }, 350)
}

export function downloadPdfWindow(html: string) {
  const win = window.open("", "_blank")
  if (!win) {
    printHtmlDocument(html)
    return
  }
  win.document.open()
  win.document.write(`
    ${html}
    <script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 400);
      };
    </script>
  `)
  win.document.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REVENUE RECEIPT MODAL
// ─────────────────────────────────────────────────────────────────────────────

export const RevenueReceiptModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  data: RevenueReceiptData | null
}> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null

  const fmtInr = (n: any) => {
    if (n === null || n === undefined || n === "") return "₹0"
    if (typeof n === "number")
      return `₹${Math.round(n).toLocaleString("en-IN")}`
    if (String(n).trim().startsWith("₹")) return String(n).trim()
    const num = Number(String(n).replace(/[^0-9.-]+/g, ""))
    return isNaN(num) ? "₹0" : `₹${Math.round(num).toLocaleString("en-IN")}`
  }

  const generateReceiptHtml = () => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Official Revenue Receipt - ${data.transactionNumber}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; margin: 0; padding: 20px; font-size: 11px; }
          .header { border-bottom: 2px solid #0284C7; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
          .brand { font-size: 18px; font-weight: 800; color: #0369A1; letter-spacing: 0.5px; }
          .sub { font-size: 10px; color: #64748B; margin-top: 2px; }
          .voucher-title { font-size: 13px; font-weight: 700; color: #0F172A; text-align: right; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; }
          .card { border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 12px; background-color: #F8FAFC; }
          .lbl { font-size: 9.5px; color: #64748B; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
          .val { font-size: 12px; font-weight: 600; color: #0F172A; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #0F172A; color: #FFF; padding: 8px 10px; text-align: left; font-size: 10px; }
          td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; }
          .total-box { margin-top: 15px; border-top: 2px solid #0284C7; padding-top: 10px; text-align: right; }
          .total-lbl { font-size: 11px; color: #64748B; font-weight: 600; }
          .total-val { font-size: 18px; font-weight: 800; color: #0369A1; }
          .stamp { margin-top: 25px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px dashed #CBD5E1; padding-top: 15px; }
          .footer { margin-top: 25px; text-align: center; font-size: 8.5px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">IMPERIAL HOSPITALS</div>
            <div style="font-size: 11px; font-weight: 700; color: #1E293B; margin-top: 1px;">A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED</div>
            <div class="sub"># 27-14-13/A, OPP. GANESH CANTEN STREET, BESIDE BHASYAM SCHOOL,</div>
            <div class="sub">BHIMAVARAM-534202, W.G. DIST.(A.P) • Ph: 08816-279999, 279988</div>
            <div class="sub" style="font-weight: 700; color: #0369A1; margin-top: 2px;">GST No - 37AALCM2238A1ZQ • Financial Services &amp; Central Revenue Operations</div>
          </div>
          <div>
            <div class="voucher-title">OFFICIAL REVENUE RECEIPT</div>
            <div style="font-size: 10px; color: #0284C7; font-weight: 700; text-align: right;">Receipt #: ${data.transactionNumber}</div>
            <div style="font-size: 9px; color: #64748B; text-align: right;">Date: ${data.date}</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="lbl">Patient Information</div>
            <div class="val">${data.patientName}</div>
            <div style="font-size: 10px; color: #475569; margin-top: 2px;">UMR / MRN: <strong>${data.umr}</strong></div>
            <div style="font-size: 10px; color: #475569;">Payer / Sponsor: ${data.payer || "Self-Pay"}</div>
          </div>
          <div class="card">
            <div class="lbl">Encounter &amp; Billing Details</div>
            <div class="val">Invoice #: ${data.invoiceNo}</div>
            <div style="font-size: 10px; color: #475569; margin-top: 2px;">Department: <strong>${data.department}</strong> (${data.revenueSource})</div>
            <div style="font-size: 10px; color: #475569;">Attending Doctor: ${data.doctor}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 10%;">#</th>
              <th style="width: 50%;">Description / Service Line</th>
              <th style="width: 20%;">Channel / Mode</th>
              <th style="width: 20%; text-align: right;">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><strong>${data.description}</strong><br/><span style="color: #64748B; font-size: 9.5px;">Revenue recognized under ${data.department}</span></td>
              <td>${data.paymentMethod}</td>
              <td style="text-align: right; font-weight: 700;">${fmtInr(data.amount)}</td>
            </tr>
          </tbody>
        </table>

        <div class="total-box">
          <div class="total-lbl">TOTAL SETTLED AMOUNT</div>
          <div class="total-val">${fmtInr(data.amount)}</div>
          <div style="font-size: 9.5px; color: #059669; font-weight: 600; margin-top: 2px;">✓ Payment Received &amp; Settled in Hospital Accounts</div>
        </div>

        <div class="stamp">
          <div>
            <div style="font-size: 9px; color: #64748B;">Audit &amp; System Authorization:</div>
            <div style="font-size: 9.5px; color: #059669; font-weight: 700;">Verified in Central Revenue Ledger</div>
            <div style="font-size: 8.5px; color: #94A3B8;">System Timestamp: ${new Date().toISOString()}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 700; color: #0F172A;">Authorized Cashier / Accounts Officer</div>
            <div style="font-size: 9px; color: #64748B;">Imperial Hospitals</div>
          </div>
        </div>

        <div class="footer">
          This is an electronically authenticated hospital revenue receipt generated by Imperial Hospitals HMS. No signature required. Valid for insurance reimbursement &amp; medical claims.
        </div>
      </body>
    </html>
  `

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Official Revenue Receipt
              </h3>
              <p className="text-xs text-slate-500">
                Transaction #{data.transactionNumber} • Invoice #
                {data.invoiceNo}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Main Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Patient Details
              </span>
              <div className="text-sm font-bold text-slate-900">
                {data.patientName}
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">UMR:</span>{" "}
                {data.umr}
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Payer:</span>{" "}
                {data.payer || "Self-Pay"}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Encounter &amp; Service
              </span>
              <div className="text-sm font-bold text-slate-900">
                {data.department} ({data.revenueSource})
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Doctor:</span>{" "}
                {data.doctor}
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Date:</span>{" "}
                {data.date}
              </div>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Service Description</th>
                  <th className="py-2.5 px-4">Payment Method</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Recognized Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                <tr>
                  <td className="py-3 px-4 font-medium">
                    {data.description}
                    <div className="text-[10px] text-slate-400">
                      Department of {data.department}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                      <CreditCard className="w-3 h-3" />
                      {data.paymentMethod}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                      <CheckCircle2 className="w-3 h-3" />
                      {data.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 text-sm">
                    {fmtInr(data.amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Total Box */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                Settled Recognized Revenue
              </span>
              <span className="text-[11px] text-emerald-600">
                Reconciled against hospital ledger accounts
              </span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-700">
              {fmtInr(data.amount)}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Audited &amp; Authenticated</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printHtmlDocument(generateReceiptHtml())}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              Print Receipt
            </button>
            <button
              onClick={() => downloadPdfWindow(generateReceiptHtml())}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PHARMACY DAMAGED STOCK MODAL
// ─────────────────────────────────────────────────────────────────────────────

export const DamagedStockModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  data: DamagedStockData | null
}> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null

  const fmtInr = (n: any) => {
    if (n === null || n === undefined || n === "") return "₹0"
    if (typeof n === "number")
      return `₹${Math.round(n).toLocaleString("en-IN")}`
    if (String(n).trim().startsWith("₹")) return String(n).trim()
    const num = Number(String(n).replace(/[^0-9.-]+/g, ""))
    return isNaN(num) ? "₹0" : `₹${Math.round(num).toLocaleString("en-IN")}`
  }

  const generateLossCertHtml = () => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Pharmacy Inventory Write-Off Certificate - ${data.adjustmentNumber}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; margin: 0; padding: 20px; font-size: 11px; }
          .header { border-bottom: 2px solid #DC2626; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
          .brand { font-size: 18px; font-weight: 800; color: #991B1B; }
          .sub { font-size: 10px; color: #64748B; margin-top: 2px; }
          .voucher-title { font-size: 13px; font-weight: 700; color: #DC2626; text-align: right; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; }
          .card { border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 12px; background-color: #F8FAFC; }
          .lbl { font-size: 9.5px; color: #64748B; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
          .val { font-size: 12px; font-weight: 600; color: #0F172A; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #1E293B; color: #FFF; padding: 8px 10px; text-align: left; font-size: 10px; }
          td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; }
          .loss-total { margin-top: 15px; border-top: 2px solid #DC2626; padding-top: 10px; text-align: right; }
          .loss-val { font-size: 18px; font-weight: 800; color: #DC2626; }
          .signatures { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; border-top: 1px dashed #CBD5E1; padding-top: 15px; }
          .footer { margin-top: 25px; text-align: center; font-size: 8.5px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">IMPERIAL HOSPITALS • PHARMACY DIVISION</div>
            <div style="font-size: 11px; font-weight: 700; color: #1E293B; margin-top: 1px;">A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED</div>
            <div class="sub"># 27-14-13/A, OPP. GANESH CANTEN STREET, BESIDE BHASYAM SCHOOL,</div>
            <div class="sub">BHIMAVARAM-534202, W.G. DIST.(A.P) • Ph: 08816-279999, 279988</div>
            <div class="sub" style="font-weight: 700; color: #DC2626; margin-top: 2px;">GST No - 37AALCM2238A1ZQ • Stock Loss &amp; Damage Write-Off Protocol</div>
          </div>
          <div>
            <div class="voucher-title">DAMAGED STOCK WRITE-OFF CERTIFICATE</div>
            <div style="font-size: 10px; color: #DC2626; font-weight: 700; text-align: right;">Write-off Ref: ${data.adjustmentNumber}</div>
            <div style="font-size: 9px; color: #64748B; text-align: right;">Incident Date: ${data.date}</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="lbl">Item &amp; Batch Specifications</div>
            <div class="val">${data.medicineName}</div>
            <div style="font-size: 10px; color: #475569; margin-top: 2px;">Batch Number: <strong>${data.batchNumber}</strong></div>
            <div style="font-size: 10px; color: #475569;">Expiry Date: ${data.expiryDate} • Category: ${data.category}</div>
          </div>
          <div class="card">
            <div class="lbl">Damage Classification &amp; Location</div>
            <div class="val" style="color: #DC2626;">${data.reason}</div>
            <div style="font-size: 10px; color: #475569; margin-top: 2px;">Incident Ward / Unit: <strong>${data.location}</strong></div>
            <div style="font-size: 10px; color: #475569;">Origin Supplier: ${data.supplierName}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 10%;">#</th>
              <th style="width: 40%;">Medicine / Product Item</th>
              <th style="width: 15%;">Units Lost</th>
              <th style="width: 15%;">Unit Cost (INR)</th>
              <th style="width: 20%; text-align: right;">Total Loss Valuation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><strong>${data.medicineName}</strong><br/><span style="color: #64748B; font-size: 9px;">Batch: ${data.batchNumber}</span></td>
              <td style="font-weight: 700; color: #DC2626;">${data.quantity} units</td>
              <td>${fmtInr(data.unitCost)}</td>
              <td style="text-align: right; font-weight: 800; color: #DC2626;">${fmtInr(data.lossValue)}</td>
            </tr>
          </tbody>
        </table>

        <div class="loss-total">
          <div style="font-size: 11px; color: #64748B; font-weight: 600;">TOTAL FINANCIAL INVENTORY LOSS</div>
          <div class="loss-val">${fmtInr(data.lossValue)}</div>
          <div style="font-size: 9.5px; color: #64748B; margin-top: 2px;">Disposal Method: <strong>${data.disposalMethod}</strong></div>
        </div>

        <div class="signatures">
          <div>
            <div style="font-size: 9.5px; font-weight: 700;">Reported By:</div>
            <div style="font-size: 11px; color: #0F172A; margin-top: 2px;">${data.reportedBy}</div>
            <div style="font-size: 8.5px; color: #64748B;">Ward Pharmacist</div>
          </div>
          <div>
            <div style="font-size: 9.5px; font-weight: 700;">Witness / Clinical Verifier:</div>
            <div style="font-size: 11px; color: #0F172A; margin-top: 2px;">${data.witnessName}</div>
            <div style="font-size: 8.5px; color: #64748B;">Staff Verification</div>
          </div>
          <div>
            <div style="font-size: 9.5px; font-weight: 700;">Approved By:</div>
            <div style="font-size: 11px; color: #059669; font-weight: 700; margin-top: 2px;">${data.approvedBy}</div>
            <div style="font-size: 8.5px; color: #64748B;">Chief Pharmacist • Imperial Hospitals</div>
          </div>
        </div>

        <div class="footer">
          Imperial Hospitals Internal Audit Document • Authorized for Inventory Scrap &amp; Material Loss Accounting • Status: ${data.status}
        </div>
      </body>
    </html>
  `

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700 border border-rose-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Damaged Stock Loss Certificate
              </h3>
              <p className="text-xs text-slate-500">
                Adjustment #{data.adjustmentNumber} • Written off on {data.date}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Medicine Information
              </span>
              <div className="text-sm font-bold text-slate-900">
                {data.medicineName}
              </div>
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Batch:</span>{" "}
                {data.batchNumber} •{" "}
                <span className="font-semibold text-slate-700">Expiry:</span>{" "}
                {data.expiryDate}
              </div>
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Category:</span>{" "}
                {data.category}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Incident Classification
              </span>
              <div className="text-sm font-bold text-rose-600">
                {data.reason}
              </div>
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Location:</span>{" "}
                {data.location}
              </div>
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Supplier:</span>{" "}
                {data.supplierName}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Item</th>
                  <th className="py-2.5 px-4">Written-off Qty</th>
                  <th className="py-2.5 px-4">Unit Cost</th>
                  <th className="py-2.5 px-4 text-right">Loss Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                <tr>
                  <td className="py-3 px-4 font-medium">{data.medicineName}</td>
                  <td className="py-3 px-4 font-bold text-rose-600">
                    {data.quantity} units
                  </td>
                  <td className="py-3 px-4">{fmtInr(data.unitCost)}</td>
                  <td className="py-3 px-4 text-right font-extrabold text-rose-600 text-sm">
                    {fmtInr(data.lossValue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider block">
                Total Financial Loss
              </span>
              <span className="text-[11px] text-rose-600">
                Disposal: {data.disposalMethod}
              </span>
            </div>
            <div className="text-2xl font-extrabold text-rose-600">
              {fmtInr(data.lossValue)}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Reported By
              </span>
              <span className="font-medium text-slate-800">
                {data.reportedBy}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Witnessed By
              </span>
              <span className="font-medium text-slate-800">
                {data.witnessName}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Approved By
              </span>
              <span className="font-semibold text-emerald-700">
                {data.approvedBy}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-rose-600" />
            <span>Regulated Pharmacy Biohazard Protocol</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printHtmlDocument(generateLossCertHtml())}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              Print Certificate
            </button>
            <button
              onClick={() => downloadPdfWindow(generateLossCertHtml())}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SUPPLIER RETURN LEDGER MODAL
// ─────────────────────────────────────────────────────────────────────────────

export const SupplierReturnModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  data: SupplierReturnData | null
}> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null

  const fmtInr = (n: any) => {
    if (n === null || n === undefined || n === "") return "₹0"
    if (typeof n === "number")
      return `₹${Math.round(n).toLocaleString("en-IN")}`
    if (String(n).trim().startsWith("₹")) return String(n).trim()
    const num = Number(String(n).replace(/[^0-9.-]+/g, ""))
    return isNaN(num) ? "₹0" : `₹${Math.round(num).toLocaleString("en-IN")}`
  }

  const generateDebitNoteHtml = () => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Supplier Debit Note Voucher - ${data.debitNoteNumber}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; margin: 0; padding: 20px; font-size: 11px; }
          .header { border-bottom: 2px solid #2563EB; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
          .brand { font-size: 18px; font-weight: 800; color: #1E40AF; }
          .sub { font-size: 10px; color: #64748B; margin-top: 2px; }
          .voucher-title { font-size: 13px; font-weight: 700; color: #2563EB; text-align: right; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; }
          .card { border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 12px; background-color: #F8FAFC; }
          .lbl { font-size: 9.5px; color: #64748B; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
          .val { font-size: 12px; font-weight: 600; color: #0F172A; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #1E293B; color: #FFF; padding: 8px 10px; text-align: left; font-size: 10px; }
          td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; }
          .ret-total { margin-top: 15px; border-top: 2px solid #2563EB; padding-top: 10px; text-align: right; }
          .ret-val { font-size: 18px; font-weight: 800; color: #1E40AF; }
          .signatures { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; border-top: 1px dashed #CBD5E1; padding-top: 15px; }
          .footer { margin-top: 25px; text-align: center; font-size: 8.5px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">IMPERIAL HOSPITALS</div>
            <div style="font-size: 11px; font-weight: 700; color: #1E293B; margin-top: 1px;">A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED</div>
            <div class="sub"># 27-14-13/A, OPP. GANESH CANTEN STREET, BESIDE BHASYAM SCHOOL,</div>
            <div class="sub">BHIMAVARAM-534202, W.G. DIST.(A.P) • Ph: 08816-279999, 279988</div>
            <div class="sub" style="font-weight: 700; color: #2563EB; margin-top: 2px;">GST No - 37AALCM2238A1ZQ • Pharmaceutical Procurement &amp; Inventory Accounting</div>
          </div>
          <div>
            <div class="voucher-title">DEBIT NOTE / RETURN VOUCHER</div>
            <div style="font-size: 10px; color: #2563EB; font-weight: 700; text-align: right;">Debit Note #: ${data.debitNoteNumber}</div>
            <div style="font-size: 9px; color: #64748B; text-align: right;">Return Date: ${data.date}</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="lbl">Recipient Supplier / Vendor</div>
            <div class="val">${data.supplierName}</div>
            <div style="font-size: 10px; color: #475569; margin-top: 2px;">Return Ref: <strong>${data.returnNumber}</strong></div>
            <div style="font-size: 10px; color: #475569;">Credit Note Ref: ${data.creditNoteId}</div>
          </div>
          <div class="card">
            <div class="lbl">Return Reason &amp; Status</div>
            <div class="val">${data.reason}</div>
            <div style="font-size: 10px; color: #475569; margin-top: 2px;">Status: <strong>${data.status}</strong></div>
            <div style="font-size: 10px; color: #475569;">Notes: ${data.notes}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 10%;">#</th>
              <th style="width: 45%;">Medicine / Item Description</th>
              <th style="width: 15%;">Batch #</th>
              <th style="width: 15%;">Quantity</th>
              <th style="width: 15%; text-align: right;">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><strong>${data.medicineName}</strong></td>
              <td>${data.batchNumber}</td>
              <td style="font-weight: 700;">${data.quantity} units</td>
              <td style="text-align: right; font-weight: 800; color: #1E40AF;">${fmtInr(data.returnAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div class="ret-total">
          <div style="font-size: 11px; color: #64748B; font-weight: 600;">TOTAL DEBIT VALUATION</div>
          <div class="ret-val">${fmtInr(data.returnAmount)}</div>
          <div style="font-size: 9.5px; color: #2563EB; margin-top: 2px;">Amount to be credited to hospital vendor account</div>
        </div>

        <div class="signatures">
          <div>
            <div style="font-size: 9.5px; font-weight: 700;">Dispatched &amp; Requested By:</div>
            <div style="font-size: 11px; color: #0F172A; margin-top: 2px;">${data.requestedBy}</div>
            <div style="font-size: 8.5px; color: #64748B;">Central Drug Store Keeper</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 9.5px; font-weight: 700;">Verified &amp; Approved By:</div>
            <div style="font-size: 11px; color: #059669; font-weight: 700; margin-top: 2px;">${data.approvedBy}</div>
            <div style="font-size: 8.5px; color: #64748B;">Head of Pharmacy &amp; Procurement • Imperial Hospitals</div>
          </div>
        </div>

        <div class="footer">
          Valid for vendor ledger adjustment &amp; GST debit note claim • Imperial Hospitals HMS
        </div>
      </body>
    </html>
  `

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-blue-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-700 border border-blue-200">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Supplier Debit Note Voucher
              </h3>
              <p className="text-xs text-slate-500">
                Return #{data.returnNumber} • Debit Note #{data.debitNoteNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Vendor Information
              </span>
              <div className="text-sm font-bold text-slate-900">
                {data.supplierName}
              </div>
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">
                  Credit Note Ref:
                </span>{" "}
                {data.creditNoteId}
              </div>
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">
                  Return Date:
                </span>{" "}
                {data.date}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Return Reason &amp; Status
              </span>
              <div className="text-sm font-bold text-blue-700">
                {data.reason}
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Status:</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                  {data.status}
                </span>
              </div>
              <div className="text-xs text-slate-500 italic truncate">
                {data.notes}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Returned Item</th>
                  <th className="py-2.5 px-4">Batch Number</th>
                  <th className="py-2.5 px-4">Quantity</th>
                  <th className="py-2.5 px-4">Unit Rate</th>
                  <th className="py-2.5 px-4 text-right">Debit Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                <tr>
                  <td className="py-3 px-4 font-medium">{data.medicineName}</td>
                  <td className="py-3 px-4">{data.batchNumber}</td>
                  <td className="py-3 px-4 font-bold text-blue-700">
                    {data.quantity} units
                  </td>
                  <td className="py-3 px-4">{fmtInr(data.unitCost)}</td>
                  <td className="py-3 px-4 text-right font-extrabold text-blue-700 text-sm">
                    {fmtInr(data.returnAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider block">
                Total Credit / Debit Value
              </span>
              <span className="text-[11px] text-blue-600">
                Credit adjustment against vendor outstanding balance
              </span>
            </div>
            <div className="text-2xl font-extrabold text-blue-700">
              {fmtInr(data.returnAmount)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Dispatched By
              </span>
              <span className="font-medium text-slate-800">
                {data.requestedBy}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Authorized By
              </span>
              <span className="font-semibold text-emerald-700">
                {data.approvedBy}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Official Vendor Debit Note</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printHtmlDocument(generateDebitNoteHtml())}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              Print Debit Note
            </button>
            <button
              onClick={() => downloadPdfWindow(generateDebitNoteHtml())}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
