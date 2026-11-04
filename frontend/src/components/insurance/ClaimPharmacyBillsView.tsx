import React, { useState, useEffect } from "react"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import { PharmacyDatabase, AppPharmacyBill } from "../../services/pharmacyDb"
import { BillingDatabase } from "../../services/billingDb"
import { inr, fmtDateTime, type Notify } from "./ui"
import { Pill, Receipt, AlertCircle, PlusCircle, CheckCircle2, Package } from "lucide-react"

export default function ClaimPharmacyBillsView({
  c,
  notify,
  onOpenEnhancement,
}: {
  c: ComprehensiveClaimRecord
  notify: Notify
  onOpenEnhancement?: () => void
}) {
  const [bills, setBills] = useState<AppPharmacyBill[]>([])
  const [loading, setLoading] = useState(true)

  const loadPharmacyBills = () => {
    try {
      const allBills = PharmacyDatabase.getBills()
      const pName = (c.patientName || "").toLowerCase().trim()
      const pId = (c.patientId || "").toLowerCase().trim()
      const uhid = (c.policy?.memberId || "").toLowerCase().trim()

      const matched = allBills.filter((b) => {
        const bName = (b.patientName || "").toLowerCase().trim()
        const bUhid = (b.uhid || "").toLowerCase().trim()
        const bId = (b.patientId || "").toLowerCase().trim()
        return (
          (pName && bName.includes(pName)) ||
          (pId && bId === pId) ||
          (uhid && bUhid === uhid)
        )
      })

      setBills(matched)
    } catch {
      setBills([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPharmacyBills()
    const handleStorage = () => loadPharmacyBills()
    window.addEventListener("storage", handleStorage)
    window.addEventListener("hospai_pharmacy_updated", handleStorage)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("hospai_pharmacy_updated", handleStorage)
    }
  }, [c])

  const hospitalBillRecord = c.billingClaimId ? BillingDatabase.getClaimById(c.billingClaimId) : undefined
  const totalPharmacyAmount = bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0)
  const hospitalChargesAmount = c.totalHospitalBill || (hospitalBillRecord?.totalAmount ?? 0)
  const combinedTotal = hospitalChargesAmount + totalPharmacyAmount
  const approvedLimit = c.approvedPreAuthAmount || 0
  const remainingLimit = Math.max(0, approvedLimit - combinedTotal)
  const isOverLimit = approvedLimit > 0 && combinedTotal > approvedLimit
  const percentUsed = approvedLimit > 0 ? Math.min(100, Math.round((combinedTotal / approvedLimit) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* ── TOP METRIC: RUNNING TOTAL VS PRE-AUTH LIMIT GAUGE ── */}
      <div className="bg-white border border-slate-200 rounded-[8px] p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="text-blue-600" size={18} />
              <h3 className="text-[15px] font-bold text-slate-900">
                Insurance Bill &amp; Pharmacy Ledger
              </h3>
            </div>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Live aggregated hospital expenses, dispensed medicines, and pre-auth headroom for {c.patientName}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isOverLimit && onOpenEnhancement && (
              <button
                type="button"
                onClick={onOpenEnhancement}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[12.5px] font-semibold rounded-[6px] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <PlusCircle size={14} /> Request Pre-Auth Enhancement (+₹{(combinedTotal - approvedLimit).toLocaleString("en-IN")})
              </button>
            )}
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-[6px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Pre-Auth Approved
            </span>
            <div className="text-[19px] font-bold text-slate-900 mt-1 tabular-nums">
              {approvedLimit > 0 ? inr(approvedLimit) : "—"}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {c.preAuth?.approvalCode ? `Auth Code: ${c.preAuth.approvalCode}` : "Sanctioned Limit"}
            </span>
          </div>

          <div className="bg-blue-50/50 border border-blue-100 p-3.5 rounded-[6px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Hospital Charges
            </span>
            <div className="text-[19px] font-bold text-blue-900 mt-1 tabular-nums">
              {inr(hospitalChargesAmount)}
            </div>
            <span className="text-[11px] text-blue-600 mt-0.5 block">
              Room, Doctor, OT &amp; Labs
            </span>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-100 p-3.5 rounded-[6px]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Pharmacy Dispensed
            </span>
            <div className="text-[19px] font-bold text-emerald-900 mt-1 tabular-nums">
              {inr(totalPharmacyAmount)}
            </div>
            <span className="text-[11px] text-emerald-600 mt-0.5 block">
              {bills.length} Dispense Invoices
            </span>
          </div>

          <div className={`p-3.5 rounded-[6px] border ${isOverLimit ? "bg-rose-50/80 border-rose-200" : "bg-slate-50 border-slate-100"}`}>
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isOverLimit ? "text-rose-700" : "text-slate-500"}`}>
              {isOverLimit ? "Over Pre-Auth Limit" : "Remaining Headroom"}
            </span>
            <div className={`text-[19px] font-bold mt-1 tabular-nums ${isOverLimit ? "text-rose-700 font-extrabold" : "text-slate-900"}`}>
              {approvedLimit > 0 ? (isOverLimit ? `+${inr(combinedTotal - approvedLimit)}` : inr(remainingLimit)) : "—"}
            </div>
            <span className={`text-[11px] mt-0.5 block ${isOverLimit ? "text-rose-600 font-medium" : "text-slate-400"}`}>
              Total Billed: {inr(combinedTotal)}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        {approvedLimit > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex justify-between text-[11.5px] font-medium text-slate-600 mb-1.5">
              <span>Insurance Limit Utilization</span>
              <span className="tabular-nums font-semibold">
                {percentUsed}% ({inr(combinedTotal)} of {inr(approvedLimit)})
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, (hospitalChargesAmount / approvedLimit) * 100)}%` }}
                className="bg-blue-600 h-full"
                title={`Hospital Charges: ${inr(hospitalChargesAmount)}`}
              />
              <div
                style={{ width: `${Math.min(100 - (hospitalChargesAmount / approvedLimit) * 100, (totalPharmacyAmount / approvedLimit) * 100)}%` }}
                className="bg-emerald-500 h-full"
                title={`Pharmacy Dispensed: ${inr(totalPharmacyAmount)}`}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Hospital Services
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Pharmacy Medicines
              </span>
              {isOverLimit && (
                <span className="flex items-center gap-1.5 text-rose-600 font-bold ml-auto">
                  <AlertCircle size={13} /> Limit Exceeded by {inr(combinedTotal - approvedLimit)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── PHARMACY DISPENSED INVOICES TABLE ── */}
      <div className="bg-white border border-slate-200 rounded-[8px] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Pill className="text-emerald-600" size={17} />
            <h4 className="text-[14px] font-bold text-slate-900">
              Pharmacy Dispensed Prescriptions &amp; Bills
            </h4>
          </div>
          <span className="text-[12px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            {bills.length} Invoices · Total: {inr(totalPharmacyAmount)}
          </span>
        </div>

        {bills.length === 0 ? (
          <div className="py-8 text-center bg-slate-50/60 rounded-[6px] border border-dashed border-slate-200">
            <Package size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-[13px] font-medium text-slate-600">No Pharmacy Dispenses Yet</p>
            <p className="text-[11.5px] text-slate-400 mt-0.5">
              When the pharmacy desk dispenses medicines for this inpatient, their cashless bill items will show here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Bill No / Date</th>
                  <th className="py-2.5 px-3">Doctor / Dept</th>
                  <th className="py-2.5 px-3">Medicines Dispensed</th>
                  <th className="py-2.5 px-3">Coverage Status</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 align-top">
                      <div className="font-semibold text-slate-900">{bill.billNumber}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{fmtDateTime(bill.createdAt)}</div>
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="font-medium text-slate-800">{bill.doctorName || "Treating Physician"}</div>
                      <div className="text-[11px] text-slate-500">{bill.department || "Inpatient Ward"}</div>
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="space-y-1">
                        {bill.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-3 text-[11.5px]">
                            <span className="font-medium text-slate-800">
                              {item.medicineName} <span className="text-slate-400">×{item.quantity}</span>
                            </span>
                            <span className="tabular-nums text-slate-600">{inr(item.totalPrice)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 align-top">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={11} /> Bill to Insurance (Cashless)
                      </span>
                    </td>
                    <td className="py-3 px-3 align-top text-right font-bold text-slate-900 tabular-nums">
                      {inr(bill.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── HOSPITAL BILL ITEMS BREAKDOWN ── */}
      {hospitalBillRecord && hospitalBillRecord.items && hospitalBillRecord.items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[8px] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="text-blue-600" size={17} />
              <h4 className="text-[14px] font-bold text-slate-900">
                Hospital &amp; Clinical Service Charges (Bill #{hospitalBillRecord.invoiceNo})
              </h4>
            </div>
            <span className="text-[12px] font-semibold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              Total: {inr(hospitalChargesAmount)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Service / Line Item</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Insurance Share</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hospitalBillRecord.items.map((it, idx) => (
                  <tr key={it.id || idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-800">{it.description || it.category}</td>
                    <td className="py-2.5 px-3 text-slate-500">{it.category}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{inr(it.unitPrice)}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums">{it.quantity}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700 font-medium">
                      {inr(it.insuranceCovered || it.total)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                      {inr(it.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
