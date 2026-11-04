import React from "react"
import { Printer, X, AlertOctagon, CheckCircle2 } from "lucide-react"
import RECEIPT_LOGO_BASE64 from "../../../assets/receiptLogoBase64"
import type { AppMedicineWriteOff } from "../../../services/pharmacyDb"

interface WriteOffReceiptModalProps {
  writeOff: AppMedicineWriteOff | null
  onClose: () => void
}

export default function WriteOffReceiptModal({
  writeOff,
  onClose,
}: WriteOffReceiptModalProps) {
  if (!writeOff) return null

  const handlePrint = () => {
    window.print()
  }

  const formattedDate = new Date(writeOff.date || writeOff.createdAt).toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  )

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm print:absolute print:inset-0 print:p-0 print:bg-white print:backdrop-blur-none">
      {/* Print isolation styles: ONLY #printable-write-off prints */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-write-off,
          #printable-write-off * {
            visibility: visible !important;
          }
          #printable-write-off {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16mm 20mm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      <div
        id="printable-write-off"
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto print:max-w-none print:shadow-none print:w-full print:m-0 print:overflow-visible relative flex flex-col border border-[#E2E8F0]"
      >
        {/* Modal Top Bar - Hidden when printing */}
        <div className="p-4 px-6 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC] sticky top-0 z-20 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center font-bold">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F1624]">
                Medicine Write-Off Receipt
              </h2>
              <p className="text-xs text-[#64748B]">
                Receipt No: <span className="font-semibold text-[#0F766E]">{writeOff.receiptNumber}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-[#0F766E] hover:bg-[#0d635c] text-white px-4 py-2 text-xs font-semibold flex items-center gap-1.5 rounded transition-colors shadow-sm"
              title="Print Receipt"
            >
              <Printer size={15} /> Print Receipt
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

        {/* Printable Receipt Body */}
        <div className="p-8 print:p-0 font-sans text-xs text-[#0F1624] relative bg-white">
          {/* Watermark Branding */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center overflow-hidden z-0 opacity-[0.14] print:opacity-[0.18] select-none">
            <img
              src={RECEIPT_LOGO_BASE64}
              alt="Hospital Logo"
              className="w-64 max-w-full object-contain filter grayscale"
            />
            <div className="text-2xl font-extrabold tracking-wider text-gray-800 uppercase -mt-2">
              Imperial Hospitals
            </div>
          </div>

          <div className="relative z-10 space-y-6">
            {/* Header: Hospital & Facility Branding */}
            <div className="border-b-2 border-[#0F1624] pb-4">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black tracking-wide text-[#0F1624]">
                      VH PHARMACY
                    </span>
                    <span className="text-[10px] bg-teal-100 text-[#0F766E] font-bold px-2 py-0.5 rounded">
                      STOCK DISPOSAL & WRITE-OFF
                    </span>
                  </div>
                  <p className="text-[11px] text-[#475569]">
                    27-1-7/3/1, Premises Of Imperial Hospital, J P Road
                  </p>
                  <p className="text-[11px] text-[#475569]">
                    Bhimavaram, West Godavari, Andhra Pradesh - 534202
                  </p>
                  <p className="text-[11px] font-semibold text-[#334155]">
                    GSTIN: 37AASFV7563M1Z1 | DL No: AP/WG/2024/09871
                  </p>
                </div>
                <div className="text-right space-y-1 min-w-[200px]">
                  <h1 className="text-base font-extrabold text-[#0F766E] tracking-tight uppercase">
                    MEDICINE WRITE-OFF RECEIPT
                  </h1>
                  <p className="text-xs">
                    <span className="text-[#64748B]">Receipt No:</span>{" "}
                    <span className="font-bold text-[#0F1624]">{writeOff.receiptNumber}</span>
                  </p>
                  <p className="text-xs">
                    <span className="text-[#64748B]">Date & Time:</span>{" "}
                    <span className="font-semibold text-[#0F1624]">{formattedDate}</span>
                  </p>
                  <p className="text-xs">
                    <span className="text-[#64748B]">Status:</span>{" "}
                    <span className="font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px]">
                      {writeOff.status || "COMPLETED"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Transaction & Batch Specifics */}
            <div className="grid grid-cols-2 gap-4 bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0]">
              <div className="space-y-1.5">
                <h3 className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Medicine Information
                </h3>
                <div className="text-sm font-bold text-[#0F1624]">
                  {writeOff.medicineName}
                </div>
                {writeOff.genericName && (
                  <div className="text-xs text-[#64748B] italic">
                    Generic: {writeOff.genericName}
                  </div>
                )}
                {writeOff.medicineCode && (
                  <div className="text-xs text-[#64748B]">
                    Code / HSN: <span className="font-mono font-medium text-[#0F1624]">{writeOff.medicineCode}</span>
                  </div>
                )}
                <div className="text-xs text-[#64748B]">
                  Unit: <span className="font-medium text-[#0F1624]">{writeOff.unitOfMeasure}</span>
                </div>
              </div>

              <div className="space-y-1.5 border-l border-[#E2E8F0] pl-4">
                <h3 className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Batch & Expiry Details
                </h3>
                <div className="text-xs">
                  <span className="text-[#64748B]">Batch Number:</span>{" "}
                  <span className="font-bold text-[#0F1624] font-mono">{writeOff.batchNumber}</span>
                </div>
                <div className="text-xs">
                  <span className="text-[#64748B]">Expiry Date:</span>{" "}
                  <span className="font-semibold text-[#0F1624]">
                    {writeOff.expiryDate ? new Date(writeOff.expiryDate).toLocaleDateString("en-IN") : "N/A"}
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-[#64748B]">Written Off By:</span>{" "}
                  <span className="font-semibold text-[#0F1624]">{writeOff.writtenOffBy}</span>
                </div>
                <div className="text-xs">
                  <span className="text-[#64748B]">Transaction Ref:</span>{" "}
                  <span className="font-mono text-[#0F766E]">{writeOff.id}</span>
                </div>
              </div>
            </div>

            {/* Inventory Movement & Stock Deduction Breakdown */}
            <div>
              <h3 className="text-xs font-bold text-[#0F1624] uppercase tracking-wider mb-2">
                Stock & Valuation Breakdown
              </h3>
              <table className="w-full border-collapse border border-[#CBD5E1] text-xs">
                <thead>
                  <tr className="bg-[#E2E8F0] text-[#1E293B]">
                    <th className="border border-[#CBD5E1] p-2.5 text-left font-bold">Particulars</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-center font-bold">Previous Stock</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-center font-bold text-red-700">Write-Off Qty</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-center font-bold text-emerald-800">Remaining Stock</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-right font-bold">Est. Unit Cost</th>
                    <th className="border border-[#CBD5E1] p-2.5 text-right font-bold text-red-700">Total Loss Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-gray-50">
                    <td className="border border-[#CBD5E1] p-2.5">
                      <div className="font-bold text-[#0F1624]">{writeOff.medicineName}</div>
                      <div className="text-[11px] text-[#64748B]">Batch: {writeOff.batchNumber}</div>
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-center font-medium">
                      {writeOff.previousStock} {writeOff.unitOfMeasure}
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-center font-extrabold text-red-700 bg-red-50/50">
                      -{writeOff.quantity} {writeOff.unitOfMeasure}
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-center font-bold text-emerald-800 bg-emerald-50/50">
                      {writeOff.remainingStock} {writeOff.unitOfMeasure}
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-right font-mono">
                      ₹{(writeOff.unitCost || 0).toFixed(2)}
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-right font-mono font-bold text-red-700 bg-red-50/50">
                      ₹{(writeOff.totalLossValue || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-[#F8FAFC] font-bold">
                    <td colSpan={5} className="border border-[#CBD5E1] p-2.5 text-right uppercase text-[11px] text-[#475569]">
                      Total Financial Loss Amount:
                    </td>
                    <td className="border border-[#CBD5E1] p-2.5 text-right font-mono text-sm text-red-700">
                      ₹{(writeOff.totalLossValue || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Justification: Reason */}
            <div className="space-y-3 bg-[#F8FAFC] p-4 rounded-lg border border-[#E2E8F0]">
              <div>
                <span className="text-[11px] font-bold uppercase text-[#64748B] block mb-1">
                  Reason for Write-Off:
                </span>
                <p className="text-xs font-semibold text-[#0F1624] bg-white p-2.5 rounded border border-[#CBD5E1]">
                  {writeOff.reason}
                </p>
              </div>
            </div>

            {/* Audit & Compliance Disclaimer */}
            <div className="text-[10px] text-[#64748B] bg-slate-50 p-2.5 rounded border border-slate-200">
              <span className="font-bold text-[#334155]">Audit Note:</span> This stock write-off was recorded directly in the Hospital Management System inventory ledger with movement code <code className="bg-slate-200 px-1 py-0.5 rounded text-[#0F1624]">WRITE_OFF</code>. Stock was deducted immediately from Batch {writeOff.batchNumber}. This transaction is non-saleable stock disposal and is not counted toward sales revenue or customer refunds.
            </div>

            {/* Signatures & Authorization */}
            <div className="pt-10 grid grid-cols-2 gap-8 items-end">
              <div>
                <p className="text-[11px] text-[#64748B]">Prepared & Verified By:</p>
                <div className="mt-6 border-b border-[#0F1624] w-48"></div>
                <p className="text-xs font-bold text-[#0F1624] mt-1">{writeOff.writtenOffBy}</p>
                <p className="text-[10px] text-[#64748B]">Pharmacy In-Charge / Pharmacist</p>
              </div>

              <div className="text-right flex flex-col items-end">
                <p className="text-[11px] text-[#64748B]">Authorized Signatory:</p>
                <div className="mt-6 border-b border-[#0F1624] w-48"></div>
                <p className="text-xs font-bold text-[#0F1624] mt-1">Medical Superintendent / Director</p>
                <p className="text-[10px] text-[#64748B]">Imperial Hospitals, Bhimavaram</p>
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
            <Printer size={15} /> Print Receipt
          </button>
        </div>
      </div>
    </div>
  )
}
