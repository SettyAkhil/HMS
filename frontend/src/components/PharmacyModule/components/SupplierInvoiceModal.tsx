import { Printer, X, Download } from "lucide-react"

interface SupplierInvoiceModalProps {
  invoice?: any
  onClose: () => void
}

export default function SupplierInvoiceModal({
  invoice,
  onClose,
}: SupplierInvoiceModalProps) {
  if (!invoice) return null
  const inv = invoice

  const handlePrint = () => window.print()

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm print:p-0 print:bg-white print:static">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #supplier-gst-invoice, #supplier-gst-invoice * { visibility: visible; }
          #supplier-gst-invoice { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 10px; }
          @page { size: portrait; margin: 8mm; }
        }
      `}</style>

      <div
        id="supplier-gst-invoice"
        className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto print:max-w-none print:shadow-none print:m-0 print:overflow-visible flex flex-col font-sans border border-[#CBD5E1]"
      >
        {/* Modal Toolbar (hidden in print) */}
        <div className="px-6 py-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between print:hidden sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="font-bold text-[14px] text-[#0F1624]">
              Original Supplier Purchase Invoice ({inv.invoiceNo})
            </span>
            <span className="text-[11px] font-mono bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded">
              GST INVOICE - {inv.paymentMode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1B4FD8] text-white text-[12px] font-semibold hover:bg-blue-700 shadow-sm transition-colors"
            >
              <Printer size={14} /> Print Invoice
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Invoice Printable Body (Exact match to Original Vendor Invoice) */}
        <div className="p-6 print:p-2 text-[#0F1624] text-[11px] leading-snug">
          {/* Header */}
          <div className="border border-black p-3 mb-2 flex justify-between items-start">
            <div className="w-[58%]">
              <h1 className="text-[17px] font-black tracking-wide text-black uppercase">
                {inv.supplierName}
              </h1>
              <p className="text-[10px] mt-0.5 font-medium">{inv.supplierAddress}</p>
              <p className="text-[10px] font-medium">
                Phone : <span className="font-bold">{inv.supplierPhone}</span>
              </p>
              <p className="text-[10px]">
                Licence No. : <span className="font-mono font-semibold">{inv.supplierLicence}</span>
              </p>
              <p className="text-[10px] font-bold">
                GSTIN : <span className="font-mono">{inv.supplierGstin}</span>
              </p>
            </div>

            <div className="w-[40%] text-right border-l border-black pl-3 flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-600">Original</p>
                <h2 className="text-[15px] font-black uppercase text-black tracking-wider border-b border-black pb-1 mb-1">
                  GST INVOICE
                </h2>
                <p className="font-bold text-[12px]">{inv.paymentMode}</p>
              </div>
              <div className="text-[10px] space-y-0.5 text-left mt-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice No:</span>
                  <span className="font-bold font-mono text-[12px] text-blue-900">{inv.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice Date:</span>
                  <span className="font-semibold">{inv.invoiceDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Due Date:</span>
                  <span className="font-semibold">{inv.dueDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">L.R. No / Date:</span>
                  <span className="font-semibold">{inv.invoiceDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Buyer Details (Party Name) */}
          <div className="border border-black p-2.5 mb-2 bg-[#FAFCFF] flex justify-between items-center text-[10.5px]">
            <div>
              <span className="text-[9px] font-bold uppercase text-gray-500 block">Party Name (Buyer):</span>
              <p className="font-black text-[13px] text-black uppercase">{inv.partyName}</p>
              <p className="text-[10px] text-gray-700">{inv.partyAddress}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px]">
                <span className="text-gray-600">Licence No: </span>
                <span className="font-mono font-semibold">{inv.partyLicence}</span>
              </p>
              <p className="text-[10px] font-bold">
                <span className="text-gray-600">GSTIN: </span>
                <span className="font-mono text-black">{inv.partyGstin}</span>
              </p>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-black overflow-x-auto mb-2">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead className="bg-[#F1F5F9] border-b border-black text-[9px] uppercase tracking-wider font-bold">
                <tr className="divide-x divide-black text-center">
                  <th className="py-1 px-1 w-6">S.</th>
                  <th className="py-1 px-1 w-10">Qty.</th>
                  <th className="py-1 px-1 w-10">Mfr</th>
                  <th className="py-1 px-1 w-12">Pack</th>
                  <th className="py-1 px-2 text-left">Product Name</th>
                  <th className="py-1 px-1 w-18">Batch</th>
                  <th className="py-1 px-1 w-12">Exp</th>
                  <th className="py-1 px-1 w-16">HSN</th>
                  <th className="py-1 px-1 w-14 text-right">M.R.P</th>
                  <th className="py-1 px-1 w-14 text-right">Rate</th>
                  <th className="py-1 px-1 w-10 text-right">Dis%</th>
                  <th className="py-1 px-1 w-14 text-right">SGST</th>
                  <th className="py-1 px-1 w-14 text-right">CGST</th>
                  <th className="py-1 px-2 w-20 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/30">
                {inv.items.map((item: any, idx: number) => (
                  <tr key={idx} className="divide-x divide-black/30 font-medium">
                    <td className="py-1.5 px-1 text-center">{item.sNo || idx + 1}</td>
                    <td className="py-1.5 px-1 text-center font-bold">{item.qty}</td>
                    <td className="py-1.5 px-1 text-center font-bold text-gray-700">{item.mfr}</td>
                    <td className="py-1.5 px-1 text-center font-mono">{item.pack}</td>
                    <td className="py-1.5 px-2 font-bold text-black uppercase">{item.productName}</td>
                    <td className="py-1.5 px-1 text-center font-mono font-bold text-blue-900">{item.batch}</td>
                    <td className="py-1.5 px-1 text-center font-mono text-purple-900">{item.exp}</td>
                    <td className="py-1.5 px-1 text-center font-mono text-gray-600">{item.hsn}</td>
                    <td className="py-1.5 px-1 text-right font-mono">₹{Number(item.mrp).toFixed(2)}</td>
                    <td className="py-1.5 px-1 text-right font-mono font-bold">₹{Number(item.rate).toFixed(2)}</td>
                    <td className="py-1.5 px-1 text-right font-mono">{Number(item.dis || 0).toFixed(2)}</td>
                    <td className="py-1.5 px-1 text-right font-mono">{item.sgstVal ? `₹${item.sgstVal.toFixed(2)}` : "2.5%"}</td>
                    <td className="py-1.5 px-1 text-right font-mono">{item.cgstVal ? `₹${item.cgstVal.toFixed(2)}` : "2.5%"}</td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-black">
                      ₹{Number(item.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tax Summary & Totals */}
          <div className="grid grid-cols-2 gap-2 border border-black p-2.5 mb-2 bg-[#FAFCFF]">
            {/* Left: GST Breakdown */}
            <div className="border border-black/40 p-2 text-[9.5px]">
              <p className="font-bold text-[10px] uppercase border-b border-black/30 pb-1 mb-1">
                GST Tax Classification
              </p>
              <div className="grid grid-cols-5 gap-1 font-mono text-center font-semibold text-[9px] mb-1">
                <div>CLASS</div>
                <div>TOTAL</div>
                <div>DISCOUNT</div>
                <div>TAXABLE</div>
                <div>TOTAL GST</div>
              </div>
              <div className="grid grid-cols-5 gap-1 font-mono text-center text-[9px] border-t border-black/20 pt-1">
                <div className="font-bold">GST 5.00%</div>
                <div>₹{inv.totalGross.toFixed(2)}</div>
                <div>₹{inv.totalDiscount.toFixed(2)}</div>
                <div>₹{inv.taxableAmt.toFixed(2)}</div>
                <div className="font-bold text-black">₹{inv.totalGst.toFixed(2)}</div>
              </div>
              <div className="mt-2 text-[9px] text-gray-600 border-t border-black/20 pt-1 flex justify-between">
                <span>SGST Payable: ₹{inv.sgstAmt.toFixed(2)}</span>
                <span>CGST Payable: ₹{inv.cgstAmt.toFixed(2)}</span>
              </div>
            </div>

            {/* Right: Net Settlement */}
            <div className="flex flex-col justify-between text-[11px] font-mono">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Items / Qty:</span>
                  <span className="font-bold text-black">{inv.items.length} item(s) · {inv.items.reduce((s: number, i: any) => s + (i.qty || 0), 0)} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sub Total:</span>
                  <span>₹{inv.totalGross.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Trade Discount (3%):</span>
                  <span className="text-emerald-700">-₹{inv.totalDiscount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total GST (5%):</span>
                  <span>+₹{inv.totalGst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Round Off:</span>
                  <span>₹{inv.roundOff.toFixed(2)}</span>
                </div>
              </div>
              <div className="border-t-2 border-black pt-1.5 flex justify-between items-baseline mt-2">
                <span className="font-black text-[13px] uppercase">Grand Total:</span>
                <span className="font-black text-[18px] text-blue-900 font-mono">
                  ₹{Number(inv.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Amount in words & Bank info */}
          <div className="border border-black p-2 mb-2 text-[10px]">
            <p className="font-bold text-black">
              Amount in Words: <span className="font-serif italic font-semibold">{inv.amountInWords}</span>
            </p>
            <p className="mt-1 text-gray-700">
              Bank Details: <span className="font-semibold text-black">{inv.bankName}</span> | IFSC: <span className="font-mono font-semibold">{inv.ifscCode}</span>
            </p>
          </div>

          {/* Footer Terms & Signatures */}
          <div className="border border-black p-2 flex justify-between items-end text-[9px] text-gray-600">
            <div className="w-[60%]">
              <p className="font-bold text-black uppercase">Terms & Conditions:</p>
              <p>1. Goods once sold will not be taken back or exchanged.</p>
              <p>2. All disputes subject to BHIMAVARAM Jurisdiction only.</p>
            </div>
            <div className="text-center w-[35%]">
              <p className="font-bold text-black uppercase mb-8">FOR {inv.supplierName}</p>
              <p className="border-t border-dashed border-black pt-1 font-bold text-black">
                Authorised Signatory
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
