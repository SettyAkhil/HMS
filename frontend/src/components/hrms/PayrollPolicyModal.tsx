import React, { useState, useEffect } from "react"
import { HrmsDatabase } from "../../services/hrmsDb"
import { X, Settings2, AlertCircle, CheckCircle, Save } from "lucide-react"

interface PayrollPolicyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
}

export default function PayrollPolicyModal({
  isOpen,
  onClose,
  onSuccess,
}: PayrollPolicyModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [policyName, setPolicyName] = useState("Hospital Standard Payroll Policy")
  const [pfPercentage, setPfPercentage] = useState(12.0)
  const [tdsPercentage, setTdsPercentage] = useState(10.0)
  const [dailyPayDivisorType, setDailyPayDivisorType] = useState<"30_days" | "month_days">("30_days")
  const [dailyPayFixedDays, setDailyPayFixedDays] = useState(30.0)
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(1.5)
  const [standardWorkHoursPerDay, setStandardWorkHoursPerDay] = useState(8.0)
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (isOpen) {
      loadPolicy()
    }
  }, [isOpen])

  const loadPolicy = async () => {
    setLoading(true)
    setError(null)
    try {
      const policy = await HrmsDatabase.getPayrollPolicy()
      if (policy) {
        setPolicyName(policy.policy_name || "Hospital Standard Payroll Policy")
        setPfPercentage(parseFloat(policy.pf_percentage) || 12.0)
        setTdsPercentage(parseFloat(policy.tds_percentage) || 10.0)
        setDailyPayDivisorType(policy.daily_pay_divisor_type === "month_days" ? "month_days" : "30_days")
        setDailyPayFixedDays(parseFloat(policy.daily_pay_fixed_days) || 30.0)
        setOvertimeMultiplier(parseFloat(policy.overtime_multiplier) || 1.5)
        setStandardWorkHoursPerDay(parseFloat(policy.standard_work_hours_per_day) || 8.0)
      }
    } catch (err: any) {
      setError(err.message || "Failed to load current payroll policies")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError("Audit justification reason is required when modifying hospital payroll policies.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      await HrmsDatabase.updatePayrollPolicy({
        policyName,
        pfPercentage,
        tdsPercentage,
        dailyPayDivisorType,
        dailyPayFixedDays,
        overtimeMultiplier,
        standardWorkHoursPerDay,
        reason,
      })
      onSuccess("Hospital payroll policy rules updated successfully. Next payroll calculations will adopt these parameters.")
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to update payroll policy")
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-200" />
            <div>
              <h3 className="font-bold text-sm leading-tight">Configurable Payroll Policy Rules</h3>
              <p className="text-[11px] text-blue-100">Hospital-Wide Statutory & Daily Pay Parameters</p>
            </div>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-xs">Loading payroll policy rules...</div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Policy Title / Description
                </label>
                <input
                  type="text"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    PF Rate (%) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={pfPercentage}
                    onChange={(e) => setPfPercentage(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                    required
                  />
                  <span className="text-[10px] text-slate-400">Default: 12.0% on Basic</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    TDS Rate (%) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.1"
                    value={tdsPercentage}
                    onChange={(e) => setTdsPercentage(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                    required
                  />
                  <span className="text-[10px] text-slate-400">Default: 10.0% on Gross</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Daily Pay Divisor *
                  </label>
                  <select
                    value={dailyPayDivisorType}
                    onChange={(e) => setDailyPayDivisorType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="30_days">Fixed 30 Days (Gross / 30)</option>
                    <option value="month_days">Actual Month Days (28-31)</option>
                  </select>
                  <span className="text-[10px] text-slate-400">Used for unpaid leave deduction</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Overtime Multiplier *
                  </label>
                  <input
                    type="number"
                    min="1.0"
                    max="4.0"
                    step="0.05"
                    value={overtimeMultiplier}
                    onChange={(e) => setOvertimeMultiplier(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                    required
                  />
                  <span className="text-[10px] text-slate-400">Default: 1.50× hourly base</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Daily Work Hours Base
                  </label>
                  <input
                    type="number"
                    min="6"
                    max="12"
                    step="0.5"
                    value={standardWorkHoursPerDay}
                    onChange={(e) => setStandardWorkHoursPerDay(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                    required
                  />
                  <span className="text-[10px] text-slate-400">Standard clinical shift duration</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Fixed Days (If Fixed Divisor)
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="31"
                    step="1"
                    disabled={dailyPayDivisorType !== "30_days"}
                    value={dailyPayFixedDays}
                    onChange={(e) => setDailyPayFixedDays(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:border-[#1B4FD8]"
                  />
                  <span className="text-[10px] text-slate-400">Divisor value (typically 30)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Change Reason / Justification (Audit Trail) *
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Annual statutory policy revision approved by Hospital Board"
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1F5F9]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving Policy..." : "Update Payroll Policy"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
