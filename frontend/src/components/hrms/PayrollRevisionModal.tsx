import React, { useState } from "react"
import { PayrollEntry, HrmsDatabase } from "../../services/hrmsDb"
import { X, DollarSign, AlertCircle, CheckCircle } from "lucide-react"

interface PayrollRevisionModalProps {
  item: PayrollEntry | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
}

function PayrollRevisionModalBody({
  item,
  isOpen,
  onClose,
  onSuccess,
}: PayrollRevisionModalProps & { item: NonNullable<PayrollRevisionModalProps["item"]> }) {

  const [gross, setGross] = useState(item.gross)
  const [deductions, setDeductions] = useState(item.totalDeductions)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const netPay = Math.max(0, gross - deductions)

  const handleRevise = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError("Revision reason is mandatory for audit compliance")
      return
    }

    setLoading(true)
    setError(null)
    try {
      await HrmsDatabase.revisePayroll(
        item.payrollRunId || `PR-${item.year}-${item.month.slice(0, 3).toUpperCase()}`,
        item.staffId,
        { gross, totalDeductions: deductions },
        reason
      )
      onSuccess(`Payroll revised for ${item.staffName}. Revision #${(item.revisionNumber || 1) + 1} recorded.`)
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to revise payroll")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm leading-tight">Controlled Payroll Revision</h3>
            <p className="text-[11px] text-blue-100">{item.staffName} · {item.month} {item.year}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRevise} className="p-6 space-y-4 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <div className="font-bold text-gray-900">{item.staffName} ({item.staffId})</div>
            <div className="text-[11px] text-[#64748B]">Department: {item.department} · Current Net: ₹{item.netPay.toLocaleString()}</div>
            <div className="text-[10px] text-amber-700 font-semibold">Active Revision: #{item.revisionNumber || 1}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Adjusted Gross (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={gross}
                onChange={(e) => setGross(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Total Deductions (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={deductions}
                onChange={(e) => setDeductions(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                required
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex justify-between items-center text-xs">
            <span className="font-bold text-blue-900">New Net Payable Take-Home:</span>
            <span className="font-mono text-base font-bold text-[#1B4FD8]">₹{netPay.toLocaleString()}</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Revision Reason / Justification *
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Overtime calculation adjustment after biometric sync or leave quota reconciliation"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE2EC]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{loading ? "Saving..." : "Apply Revision"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// The hooks live in PayrollRevisionModalBody. Returning null before them (as this did) gives
// closed and open renders a different hook count, and React throws "Rendered
// more hooks than during the previous render" the moment the modal opens.
export default function PayrollRevisionModal(props: PayrollRevisionModalProps) {
  if (!props.isOpen || !props.item) return null
  return <PayrollRevisionModalBody {...props} item={props.item} />
}
