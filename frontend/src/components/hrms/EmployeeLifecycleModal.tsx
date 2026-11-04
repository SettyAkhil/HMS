import React, { useState, useEffect } from "react"
import {
  StaffMember,
  HrmsDatabase,
  EmployeeLifecycleHistory,
  PromotionRecord,
  TransferRecord,
  SalaryRevisionRecord,
  ExitRecord,
} from "../../services/hrmsDb"
import {
  X,
  TrendingUp,
  ArrowRightLeft,
  DollarSign,
  UserMinus,
  History,
  CheckCircle,
  AlertCircle,
  Calendar,
  Building2,
  Briefcase,
  ShieldCheck,
  Clock,
} from "lucide-react"

interface EmployeeLifecycleModalProps {
  staff: StaffMember | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
}

type LifecycleAction = "promote" | "transfer" | "salary" | "exit" | "history"

function EmployeeLifecycleModalBody({
  staff,
  isOpen,
  onClose,
  onSuccess,
}: EmployeeLifecycleModalProps & { staff: NonNullable<EmployeeLifecycleModalProps["staff"]> }) {

  const [activeTab, setActiveTab] = useState<LifecycleAction>("promote")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<EmployeeLifecycleHistory | null>(null)

  // Promotion Form State
  const [newDesignation, setNewDesignation] = useState("")
  const [promotionDate, setPromotionDate] = useState(new Date().toISOString().split("T")[0])
  const [promotionRemarks, setPromotionRemarks] = useState("")

  // Transfer Form State
  const [newDepartment, setNewDepartment] = useState("")
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [transferRemarks, setTransferRemarks] = useState("")

  // Salary Revision Form State
  const [newBaseSalary, setNewBaseSalary] = useState<number>(staff.salary?.basic ? Math.round(staff.salary.basic / 0.6) : 60000)
  const [salaryEffectiveDate, setSalaryEffectiveDate] = useState(new Date().toISOString().split("T")[0])
  const [salaryReason, setSalaryReason] = useState("")

  // Exit Form State
  const [exitType, setExitType] = useState<"Resignation" | "Termination">("Resignation")
  const [resignationDate, setResignationDate] = useState(new Date().toISOString().split("T")[0])
  const [noticePeriodDays, setNoticePeriodDays] = useState(30)
  const [lastWorkingDate, setLastWorkingDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split("T")[0]
  })
  const [exitReason, setExitReason] = useState("")
  const [clearanceStatus, setClearanceStatus] = useState<"Pending" | "In Progress" | "Cleared">("Pending")
  const [settlementStatus, setSettlementStatus] = useState<"Pending" | "Processed">("Pending")

  // Calculated preview for salary revision
  const calculatedSalary = React.useMemo(() => {
    const base = Number(newBaseSalary) || 0
    const basic = Math.round(base * 0.60)
    const hra = Math.round(base * 0.40)
    const allowances = Math.round(base * 0.15)
    const gross = basic + hra + allowances
    const pf = Math.round(basic * 0.12)
    const tax = Math.round(gross * 0.10)
    const deductions = pf + tax
    const net = Math.max(0, gross - deductions)
    return { basic, hra, allowances, gross, pf, tax, deductions, net }
  }, [newBaseSalary])

  const loadHistory = async () => {
    if (!staff) return
    try {
      const data = await HrmsDatabase.getEmployeeLifecycle(staff.id)
      setHistory(data)
    } catch (_) {}
  }

  useEffect(() => {
    if (isOpen && staff) {
      loadHistory()
      setError(null)
    }
  }, [isOpen, staff])

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDesignation.trim()) {
      setError("Please enter a new designation")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await HrmsDatabase.promoteEmployee(staff.id, newDesignation, promotionDate, promotionRemarks)
      onSuccess(`Employee ${staff.name} promoted to ${newDesignation}`)
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to record promotion")
    } finally {
      setLoading(false)
    }
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDepartment.trim()) {
      setError("Please select or enter a new department")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await HrmsDatabase.transferEmployee(staff.id, newDepartment, transferDate, transferRemarks)
      onSuccess(`Employee ${staff.name} transferred to ${newDepartment}`)
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to record transfer")
    } finally {
      setLoading(false)
    }
  }

  const handleSalaryRevision = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBaseSalary || newBaseSalary <= 0) {
      setError("Please enter a valid salary amount")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await HrmsDatabase.reviseSalary(staff.id, newBaseSalary, salaryEffectiveDate, salaryReason)
      onSuccess(`Salary revision recorded for ${staff.name} (Gross: ₹${calculatedSalary.gross.toLocaleString()})`)
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to record salary revision")
    } finally {
      setLoading(false)
    }
  }

  const handleExit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!exitReason.trim()) {
      setError("Please provide a reason for resignation/termination")
      return
    }
    if (confirm(`Are you sure you want to record ${exitType} for ${staff.name}? Their records will be retained in history.`)) {
      setLoading(true)
      setError(null)
      try {
        await HrmsDatabase.recordEmployeeExit(staff.id, {
          exitType,
          resignationDate,
          noticePeriodDays,
          lastWorkingDate,
          exitReason,
          exitClearanceStatus: clearanceStatus,
          finalSettlementStatus: settlementStatus,
        })
        onSuccess(`Exit details recorded for ${staff.name}. Status updated to ${lastWorkingDate <= new Date().toISOString().split("T")[0] ? "Resigned/Terminated" : "Notice Period"}.`)
        onClose()
      } catch (err: any) {
        setError(err.message || "Failed to record employee exit")
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 text-white font-bold flex items-center justify-center text-sm border border-white/20">
              {staff.avatarInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold leading-tight">{staff.name}</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/20">{staff.id}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 font-semibold">{staff.status}</span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                {staff.designation} · {staff.department} · {staff.category}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-[#DDE2EC] bg-[#F8FAFC] flex gap-1 overflow-x-auto">
          {[
            { id: "promote", label: "Promotion", icon: TrendingUp },
            { id: "transfer", label: "Department Transfer", icon: ArrowRightLeft },
            { id: "salary", label: "Salary Revision", icon: DollarSign },
            { id: "exit", label: "Exit / Offboarding", icon: UserMinus },
            { id: "history", label: "Lifecycle History", icon: History },
          ].map((tab) => {
            const active = activeTab === tab.id
            const IconComp = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as LifecycleAction)
                  setError(null)
                  if (tab.id === "history") loadHistory()
                }}
                className={`px-3.5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  active
                    ? "border-[#1B4FD8] text-[#1B4FD8] bg-white"
                    : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* TAB 1: PROMOTION */}
          {activeTab === "promote" && (
            <form onSubmit={handlePromote} className="space-y-4">
              <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900">
                <span className="font-bold">Current Designation:</span> {staff.designation}
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  Promotions update employee clinical title while preserving their Employee ID ({staff.id}) and all previous historical records.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  New Designation / Clinical Rank *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior Consultant, Head of Department, Chief Medical Officer"
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Effective Date *
                </label>
                <input
                  type="date"
                  value={promotionDate}
                  onChange={(e) => setPromotionDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Remarks / Promotion Justification
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Annual clinical review promotion approved by Medical Director"
                  value={promotionRemarks}
                  onChange={(e) => setPromotionRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE2EC]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{loading ? "Recording..." : "Record Promotion"}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: TRANSFER */}
          {activeTab === "transfer" && (
            <form onSubmit={handleTransfer} className="space-y-4">
              <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900">
                <span className="font-bold">Current Department:</span> {staff.department}
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  Inter-departmental transfers re-route duty rosters and departmental billing allocations while keeping the employee ID constant.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  New Department *
                </label>
                <select
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                >
                  <option value="">Select New Department...</option>
                  {[
                    "Cardiology", "Neurology", "Orthopedics", "Pediatrics", "Internal Medicine",
                    "Emergency Medicine", "General Surgery", "Oncology", "Obstetrics & Gynecology",
                    "Radiology", "Laboratory", "Pharmacy", "ICU", "Administration", "Billing & Finance"
                  ].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Effective Date *
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Remarks / Reason for Transfer
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Reassigned to ICU due to critical care expansion requirements"
                  value={transferRemarks}
                  onChange={(e) => setTransferRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE2EC]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>{loading ? "Recording..." : "Record Transfer"}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: SALARY REVISION */}
          {activeTab === "salary" && (
            <form onSubmit={handleSalaryRevision} className="space-y-4">
              <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900">
                <span className="font-bold">Current Base Monthly Salary:</span> ₹{(staff.salary?.basic ? Math.round(staff.salary.basic / 0.6) : 0).toLocaleString()} · Gross: ₹{(staff.salary?.basic ? Math.round(staff.salary.basic + staff.salary.hra + staff.salary.allowances) : 0).toLocaleString()}
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  Salary revisions automatically recalculate statutory HRA (40%), Allowances (15%), PF (12%), and Tax (10%).
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  New Base Monthly Salary (INR) *
                </label>
                <input
                  type="number"
                  min="10000"
                  step="1000"
                  value={newBaseSalary}
                  onChange={(e) => setNewBaseSalary(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              {/* Real-time Calculation Breakdown Preview */}
              <div className="grid grid-cols-4 gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <span className="text-[#64748B] text-[11px]">Basic (60%)</span>
                  <div className="font-mono font-bold text-gray-900">₹{calculatedSalary.basic.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-[#64748B] text-[11px]">HRA (40%)</span>
                  <div className="font-mono font-bold text-gray-900">₹{calculatedSalary.hra.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-[#64748B] text-[11px]">PF (12%)</span>
                  <div className="font-mono font-bold text-red-600">-₹{calculatedSalary.pf.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-[#64748B] text-[11px]">Net Disbursed</span>
                  <div className="font-mono font-bold text-green-700">₹{calculatedSalary.net.toLocaleString()}</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Effective Date *
                </label>
                <input
                  type="date"
                  value={salaryEffectiveDate}
                  onChange={(e) => setSalaryEffectiveDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Reason for Revision *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Annual merit appraisal / promotion-linked increment"
                  value={salaryReason}
                  onChange={(e) => setSalaryReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE2EC]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>{loading ? "Recording..." : "Record Salary Revision"}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: EXIT / OFFBOARDING */}
          {activeTab === "exit" && (
            <form onSubmit={handleExit} className="space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-bold">⚠️ Employee Exit Governance:</span>
                <div className="text-[11px] mt-0.5">
                  Employees are never deleted from the hospital database. Their status is updated to <strong>Notice Period</strong> or <strong>Resigned / Terminated</strong>, while all attendance, leave, payroll, and audit records remain securely accessible.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Exit Type *
                  </label>
                  <select
                    value={exitType}
                    onChange={(e) => setExitType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="Resignation">Voluntary Resignation</option>
                    <option value="Termination">Administrative Termination</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Notice Period (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={noticePeriodDays}
                    onChange={(e) => {
                      const days = Number(e.target.value)
                      setNoticePeriodDays(days)
                      const d = new Date(resignationDate)
                      d.setDate(d.getDate() + days)
                      setLastWorkingDate(d.toISOString().split("T")[0])
                    }}
                    className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Resignation / Notice Date *
                  </label>
                  <input
                    type="date"
                    value={resignationDate}
                    onChange={(e) => {
                      setResignationDate(e.target.value)
                      const d = new Date(e.target.value)
                      d.setDate(d.getDate() + noticePeriodDays)
                      setLastWorkingDate(d.toISOString().split("T")[0])
                    }}
                    className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Last Working Date *
                  </label>
                  <input
                    type="date"
                    value={lastWorkingDate}
                    onChange={(e) => setLastWorkingDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Exit Clearance Status
                  </label>
                  <select
                    value={clearanceStatus}
                    onChange={(e) => setClearanceStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="Pending">Pending Department Handover</option>
                    <option value="In Progress">In Progress (ID Card & Asset Return)</option>
                    <option value="Cleared">Cleared (Full Handover Completed)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Final Settlement Status
                  </label>
                  <select
                    value={settlementStatus}
                    onChange={(e) => setSettlementStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="Pending">Pending Final Payroll Run</option>
                    <option value="Processed">Processed & Settled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Reason for Exit *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Relocating to another city / pursuing higher medical fellowship"
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#DDE2EC]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  <span>{loading ? "Recording..." : "Record Exit"}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: LIFECYCLE HISTORY */}
          {activeTab === "history" && (
            <div className="space-y-4">
              {/* Promotions History */}
              <div className="border border-[#DDE2EC] rounded-xl p-4 bg-white">
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-2.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#1B4FD8]" />
                  <span>Promotion History ({history?.promotions?.length || 0})</span>
                </h4>
                {history?.promotions && history.promotions.length > 0 ? (
                  <div className="space-y-2">
                    {history.promotions.map((p) => (
                      <div key={p.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex justify-between font-bold text-gray-900">
                          <span>{p.old_designation} → <span className="text-[#1B4FD8]">{p.new_designation}</span></span>
                          <span className="text-[#64748B] text-[11px]">{p.effective_date}</span>
                        </div>
                        {p.remarks && <div className="text-[11px] text-[#64748B] mt-0.5">{p.remarks}</div>}
                        <div className="text-[10px] text-slate-400 mt-1">Authorized by: {p.approved_by}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">No promotions recorded yet.</p>
                )}
              </div>

              {/* Department Transfers */}
              <div className="border border-[#DDE2EC] rounded-xl p-4 bg-white">
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-2.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-[#1B4FD8]" />
                  <span>Department Transfers ({history?.transfers?.length || 0})</span>
                </h4>
                {history?.transfers && history.transfers.length > 0 ? (
                  <div className="space-y-2">
                    {history.transfers.map((t) => (
                      <div key={t.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex justify-between font-bold text-gray-900">
                          <span>{t.old_department} → <span className="text-[#1B4FD8]">{t.new_department}</span></span>
                          <span className="text-[#64748B] text-[11px]">{t.effective_date}</span>
                        </div>
                        {t.remarks && <div className="text-[11px] text-[#64748B] mt-0.5">{t.remarks}</div>}
                        <div className="text-[10px] text-slate-400 mt-1">Authorized by: {t.approved_by}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">No departmental transfers recorded yet.</p>
                )}
              </div>

              {/* Salary Revisions */}
              <div className="border border-[#DDE2EC] rounded-xl p-4 bg-white">
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-2.5">
                  <DollarSign className="w-3.5 h-3.5 text-[#1B4FD8]" />
                  <span>Salary Revision History ({history?.salaryRevisions?.length || 0})</span>
                </h4>
                {history?.salaryRevisions && history.salaryRevisions.length > 0 ? (
                  <div className="space-y-2">
                    {history.salaryRevisions.map((s) => (
                      <div key={s.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex justify-between font-bold text-gray-900">
                          <span>Gross: ₹{Number(s.old_salary).toLocaleString()} → <span className="text-green-700">₹{Number(s.new_salary).toLocaleString()}</span></span>
                          <span className="text-[#64748B] text-[11px]">{s.effective_date}</span>
                        </div>
                        {s.reason && <div className="text-[11px] text-[#64748B] mt-0.5">{s.reason}</div>}
                        <div className="text-[10px] text-slate-400 mt-1">Authorized by: {s.approved_by}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">No salary revisions recorded yet.</p>
                )}
              </div>

              {/* Exit Details */}
              <div className="border border-[#DDE2EC] rounded-xl p-4 bg-white">
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-2.5">
                  <UserMinus className="w-3.5 h-3.5 text-amber-600" />
                  <span>Exit & Offboarding Records ({history?.exits?.length || 0})</span>
                </h4>
                {history?.exits && history.exits.length > 0 ? (
                  <div className="space-y-2">
                    {history.exits.map((e) => (
                      <div key={e.id} className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg text-xs">
                        <div className="flex justify-between font-bold text-gray-900">
                          <span>Type: {e.exit_type}</span>
                          <span className="text-[#64748B] text-[11px]">Notice: {e.notice_period_days} Days</span>
                        </div>
                        <div className="text-[11px] text-[#475569] mt-1 space-y-0.5">
                          <div>Resignation Date: <strong>{e.resignation_date}</strong></div>
                          <div>Last Working Date: <strong>{e.last_working_date}</strong></div>
                          <div>Clearance: <span className="font-semibold text-amber-700">{e.exit_clearance_status}</span> · Settlement: <span className="font-semibold text-amber-700">{e.final_settlement_status}</span></div>
                          {e.exit_reason && <div className="italic text-[#64748B] mt-1">"{e.exit_reason}"</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">Employee is in active standing (no exit records).</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// The hooks live in EmployeeLifecycleModalBody. Returning null before them (as this did) gives
// closed and open renders a different hook count, and React throws "Rendered
// more hooks than during the previous render" the moment the modal opens.
export default function EmployeeLifecycleModal(props: EmployeeLifecycleModalProps) {
  if (!props.isOpen || !props.staff) return null
  return <EmployeeLifecycleModalBody {...props} staff={props.staff} />
}
