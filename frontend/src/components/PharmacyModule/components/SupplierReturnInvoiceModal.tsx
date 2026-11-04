import React from "react"
import { Printer, X, CheckCircle2, Building2, Package, ArrowRight, ShieldCheck } from "lucide-react"
import RECEIPT_LOGO_BASE64 from "../../../assets/receiptLogoBase64"
import type { AppSupplierReturn, AppBatch, AppMedicine, AppSupplier } from "../../../services/pharmacyDb"

interface SupplierReturnInvoiceModalProps {
  returnRecord: AppSupplierReturn | null
  supplier?: any | null
  medicine?: any | null
  batch?: any | null
  onClose: () => void
}

export default function SupplierReturnInvoiceModal({
  returnRecord,
  supplier,
  medicine,
  batch,
  onClose,
}: SupplierReturnInvoiceModalProps) {
  if (!returnRecord) return null

  const handlePrint = () => {
    window.print()
  }

  const formattedDate = new Date(returnRecord.createdAt || Date.now()).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  const supplierName = supplier?.supplierName || supplier?.name || returnRecord.supplierName || "AUTHORIZED SUPPLIER"
  const medicineName = medicine?.medicineName || medicine?.name || returnRecord.medicineName || "MEDICINE"
  const batchNumber = batch?.batchNumber || returnRecord.batchNumber || "BATCH"
  const expiryDate = batch?.expiryDate || "N/A"
  const purchaseRate = returnRecord.purchaseRate || batch?.purchasePrice || 0
  const returnAmount = returnRecord.returnAmount || returnRecord.quantity * purchaseRate

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm print:absolute print:inset-0 print:p-0 print:bg-white print:backdrop-blur-none">
      {/* Print isolation styles: ONLY #printable-supplier-return-invoice prints */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-supplier-return-invoice,
          #printable-supplier-return-invoice * {
            visibility: visible !important;
          }
          #printable-supplier-return-invoice {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 12mm 15mm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>

      <div
        id="printable-supplier-return-invoice"
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto print:max-w-none print:shadow-none print:w-full print:m-0 print:overflow-visible relative flex flex-col border border-[#E2E8F0]"
      >
        {/* Modal Top Bar - Hidden when printing */}
        <div className="p-4 px-6 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC] sticky top-0 z-20 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F1624]">
                Supplier Return Invoice & Handover Challan
              </h2>
              <p className="text-xs text-[#64748B]">
                Debit Note No: <span className="font-semibold font-mono text-[#0F766E]">{returnRecord.debitNoteNumber}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#0F766E] hover:bg-[#0d635c] text-white px-4 py-2 text-xs font-semibold flex items-center gap-1.5 rounded transition-colors shadow-sm"
              title="Print Return Invoice for Supplier"
            >
              <Printer size={15} /> Print Return Invoice
            </button>
            <button
              onClick={onClose}
              className="p-2 text-[#64748B] hover:text-[#0F1624] hover:bg-gray-100 rounded transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Return Invoice Body */}
        <div className="p-8 print:p-0 font-sans text-xs text-[#0F1624] relative bg-white">
          {/* Watermark Branding */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center overflow-hidden z-0 opacity-[0.10] print:opacity-[0.15] select-none">
            <img
              src={RECEIPT_LOGO_BASE64}
              alt="Hospital Logo"
              className="w-64 max-w-full object-contain filter grayscale"
            />
            <div className="text-2xl font-extrabold tracking-wider text-gray-800 uppercase -mt-2">
              Varma Hospitals
            </div>
          </div>

          <div className="relative z-10 space-y-5">
            {/* Header: Hospital & Pharmacy Information */}
            <div className="border-b-2 border-[#0F1624] pb-4">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black tracking-wide text-[#0F1624]">
                      VH PHARMACY
                    </span>
                    <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded uppercase">
                      Purchase Return & Debit Note
                    </span>
                  </div>
                  <p className="text-[11px] text-[#475569]">
                    In the premises of Varma Hospitals, J P Road
                  </p>
                  <p className="text-[11px] text-[#475569]">
                    Bhimavaram, West Godavari District, Andhra Pradesh - 534202
                  </p>
                  <p className="text-[11px] font-semibold text-[#334155]">
                    GSTIN: 37AASFV7563M1Z1 | DL No: AP/WG/2024/09871 | Ph: +91 8816 225588
                  </p>
                </div>

                <div className="text-right space-y-1 min-w-[220px]">
                  <h1 className="text-base font-extrabold text-[#0F766E] tracking-tight uppercase">
                    RETURN HANDOVER INVOICE
                  </h1>
                  <p className="text-xs">
                    <span className="text-[#64748B]">Debit Note No:</span>{" "}
                    <span className="font-bold font-mono text-[#0F1624]">{returnRecord.debitNoteNumber}</span>
                  </p>
                  <p className="text-xs">
                    <span className="text-[#64748B]">Date & Time:</span>{" "}
                    <span className="font-semibold text-[#0F1624]">{formattedDate}</span>
                  </p>
                  <p className="text-xs">
                    <span className="text-[#64748B]">Status:</span>{" "}
                    <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px]">
                      {returnRecord.status || "STOCK DEDUCTED"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Two-Column Parties Box: Return From (Pharmacy) & Return To (Supplier) */}
            <div className="grid grid-cols-2 gap-4">
              {/* Return From */}
              <div className="bg-[#F8FAFC] p-3.5 rounded-lg border border-[#E2E8F0] space-y-1">
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[#0F766E]" /> Returning Institution (From)
                </div>
                <div className="text-sm font-bold text-[#0F1624]">VH PHARMACY (Varma Hospitals)</div>
                <div className="text-[11px] text-[#475569]">Premises of Varma Hospitals, Bhimavaram</div>
                <div className="text-[11px] text-[#475569]">GSTIN: 37AASFV7563M1Z1</div>
                <div className="text-[11px] text-[#475569]">DL No: AP/WG/2024/09871</div>
              </div>

              {/* Return To (Supplier) */}
              <div className="bg-[#F8FAFC] p-3.5 rounded-lg border border-[#E2E8F0] space-y-1">
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={13} className="text-[#0F766E]" /> Supplier / Distributor (To)
                </div>
                <div className="text-sm font-bold text-[#0F1624] uppercase">{supplierName}</div>
                <div className="text-[11px] text-[#475569]">
                  {supplier?.address || "Registered Supplier Depot / Logistics Center"}
                </div>
                <div className="text-[11px] text-[#475569]">
                  GSTIN: {supplier?.gstInformation || supplier?.gstin || "N/A"}
                  {supplier?.phone ? ` | Ph: ${supplier.phone}` : ""}
                </div>
                <div className="text-[11px] text-[#475569]">
                  DL No: {supplier?.licenseDetails || "Registered Pharma Vendor"}
                </div>
              </div>
            </div>

            {/* Purchase References Strip */}
            <div className="bg-[#ECFDF5] border border-[#A7F3D0] p-3 rounded-lg flex flex-wrap justify-between items-center text-xs">
              <div>
                <span className="text-[#065F46] font-semibold">Original Invoice Ref:</span>{" "}
                <span className="font-mono font-bold text-[#0F1624]">{returnRecord.invoiceNumber || "N/A"}</span>
              </div>
              <div>
                <span className="text-[#065F46] font-semibold">Purchase Order (PO):</span>{" "}
                <span className="font-mono font-bold text-[#0F1624]">{returnRecord.poNumber || "N/A"}</span>
              </div>
              <div>
                <span className="text-[#065F46] font-semibold">GRN No:</span>{" "}
                <span className="font-mono font-bold text-[#0F1624]">{returnRecord.grnNumber || "N/A"}</span>
              </div>
              <div>
                <span className="text-[#065F46] font-semibold">Return Initiator:</span>{" "}
                <span className="font-bold text-[#0F1624]">{returnRecord.createdBy || "Pharmacist"}</span>
              </div>
            </div>

            {/* Returned Items Table */}
            <div>
              <h3 className="text-xs font-bold text-[#0F1624] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Package size={14} className="text-[#0F766E]" /> Returned Medicine Details (Stock Deducted)
              </h3>
              <table className="w-full border-collapse border border-[#CBD5E1] text-xs">
                <thead>
                  <tr className="bg-[#E2E8F0] text-[#1E293B]">
                    <th className="border border-[#CBD5E1] p-2.5 text-center font-bold w-12">S.No</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-left font-bold">Medicine Description</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-center font-bold">Batch No</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-center font-bold">Expiry</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-center font-bold text-red-700 bg-red-50/50">Return Qty</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-right font-bold">Purchase Rate (₹)</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-right font-bold text-red-700 bg-red-50/50">Total Debit (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-gray-50">
                    <td className="border border-[#CBD5E1] p-2.5 text-center font-semibold">1</td>
                    <td className="border border-[#CBD5E1] p-2.5">
                      <div className="font-bold text-[#0F1624] text-[13px]">{medicineName}</div>
                      <div className="text-[10px] text-[#64748B]">
                        {medicine?.manufacturer ? `Mfr: ${medicine.manufacturer}` : ""}
                        {medicine?.strength ? ` | Strength: ${medicine.strength}` : ""}
                      </div>
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-center font-mono font-bold text-[#0F1624]">
                      {batchNumber}
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-center font-medium">
                      {expiryDate}
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-center font-extrabold text-red-700 bg-red-50/50 text-[13px]">
                      {returnRecord.quantity} Units
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-right font-mono font-medium">
                      ₹{Number(purchaseRate).toFixed(2)}
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-right font-mono font-bold text-red-700 bg-red-50/50 text-[13px]">
                      ₹{Number(returnAmount).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-[#F8FAFC] font-bold">
                    <td colSpan={6} className="border border-[#CBD5E1] p-2.5 text-right uppercase text-[11px] text-[#475569]">
                      Total Debit Note Amount (Payable Adjustment):
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-right font-mono text-sm text-red-700 bg-red-50">
                      ₹{Number(returnAmount).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Reason for Return */}
            <div className="bg-[#F8FAFC] p-3.5 rounded-lg border border-[#E2E8F0]">
              <span className="text-[10px] font-bold uppercase text-[#64748B] block mb-1">
                Reason for Return / Quality Rejection:
              </span>
              <p className="text-xs font-semibold text-[#0F1624] bg-white p-2 rounded border border-[#CBD5E1]">
                {returnRecord.reason}
              </p>
            </div>

            {/* Inventory Ledger & Handover Disclaimer */}
            <div className="text-[10px] text-[#64748B] bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
              <span className="font-bold text-[#334155]">Inventory & Audit Notice:</span> A total of <strong>{returnRecord.quantity} units</strong> has been immediately deducted from active pharmacy inventory under Movement Code <code className="bg-slate-200 px-1 py-0.5 rounded text-[#0F1624]">SUPPLIER_RETURN</code> so these medicines cannot be dispensed to patients. Supplier is required to issue an equivalent <strong>Credit Note (CN)</strong> adjusting the hospital pharmacy accounts payable.
            </div>

            {/* Dual Signature Handover Slip (Handover from Hospital to Supplier) */}
            <div className="pt-6 grid grid-cols-2 gap-8 items-end border-t border-[#CBD5E1]">
              {/* Hospital Pharmacist Dispatched Box */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-[#0F1624] uppercase">
                  1. Dispatched & Handed Over By:
                </p>
                <p className="text-[10px] text-[#64748B]">
                  Hospital Pharmacist / Store In-Charge
                </p>
                <div className="h-12 border-b border-dashed border-[#0F1624] flex items-end pb-1">
                  <span className="text-[10px] text-gray-400 italic">Signature & Date</span>
                </div>
                <div className="pt-1 text-xs">
                  <p className="font-semibold text-[#0F1624]">{returnRecord.createdBy || "Pharmacist"}</p>
                  <p className="text-[10px] text-[#64748B]">VH PHARMACY, Varma Hospitals</p>
                </div>
              </div>

              {/* Supplier Representative Received Box */}
              <div className="space-y-1 border-l border-[#E2E8F0] pl-6">
                <p className="text-[11px] font-bold text-[#0F1624] uppercase">
                  2. Received & Acknowledged By:
                </p>
                <p className="text-[10px] text-[#64748B]">
                  Supplier Representative / Delivery Agent
                </p>
                <div className="h-12 border-b border-dashed border-[#0F1624] flex items-end pb-1">
                  <span className="text-[10px] text-gray-400 italic">Representative Signature & Date</span>
                </div>
                <div className="pt-1 text-xs space-y-0.5">
                  <p className="text-[10px] text-[#475569]">
                    Rep Name: ___________________________
                  </p>
                  <p className="text-[10px] text-[#475569]">
                    Mobile / Contact: ____________________
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Controls - Hidden when printing */}
        <div className="p-4 px-6 border-t border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC] print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#CBD5E1] bg-white hover:bg-gray-50 text-[#334155] text-xs font-semibold rounded transition-colors shadow-sm"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="bg-[#0F766E] hover:bg-[#0d635c] text-white px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded transition-colors shadow-sm"
          >
            <Printer size={15} /> Print Return Invoice for Supplier
          </button>
        </div>
      </div>
    </div>
  )
}
