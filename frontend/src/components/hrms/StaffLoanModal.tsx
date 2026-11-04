import React, { useState, useEffect } from "react"
import { HrmsDatabase, StaffLoan, StaffMember } from "../../services/hrmsDb"
import {
  DollarSign,
  Plus,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Calendar,
  Search,
  Check,
  X,
  ShieldCheck,
  TrendingUp,
  Clock,
  ArrowRight,
} from "lucide-react"

export function formatRecoveryPeriod(periodStr?: string): string {
  if (!periodStr) return ""
  const parts = periodStr.split("-")
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10)
    const monthNum = parseInt(parts[1], 10)
    if (!isNaN(year) && !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ]
      return `${monthNames[monthNum - 1]} ${year}`
    }
  }
  return periodStr
}

export function buildEmiSuccessMessage(staffLoan?: Partial<StaffLoan>): string {
  const rawAmount = staffLoan?.amountPaid
  const amountNum = typeof rawAmount === "number" && !isNaN(rawAmount) ? rawAmount : undefined
  const formattedAmount = amountNum !== undefined
    ? `₹${amountNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : undefined
  const formattedMonth = formatRecoveryPeriod(staffLoan?.recoveryPeriod)

  if (formattedAmount && formattedMonth) {
    return `EMI of ${formattedAmount} for ${formattedMonth} recovered successfully.`
  }
  if (formattedAmount) {
    return `EMI of ${formattedAmount} recovered successfully.`
  }
  if (formattedMonth) {
    return `EMI for ${formattedMonth} recovered successfully.`
  }
  return "1 Monthly Installment EMI recorded and recovered successfully."
}

interface StaffLoanModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function StaffLoanModal({ isOpen, onClose }: StaffLoanModalProps) {
  const [loans, setLoans] = useState<StaffLoan[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [isApplying, setIsApplying] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Closed">("All")
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [processingLoanId, setProcessingLoanId] = useState<string | null>(null)

  // Form State
  const [staffId, setStaffId] = useState("")
  const [loanType, setLoanType] = useState("Salary Advance")
  const [sanctionedAmount, setSanctionedAmount] = useState("20000")
  const [totalTenureMonths, setTotalTenureMonths] = useState("5")

  const showNotice = (msg: string) => {
    setActionNotice(msg)
    setTimeout(() => setActionNotice(null), 3500)
  }

  const loadData = async () => {
    const list = await HrmsDatabase.getStaffLoans()
    setLoans(Array.isArray(list) ? list : [])
    const staff = HrmsDatabase.getStaffList()
    setStaffList(Array.isArray(staff) ? staff : [])
    if (staff.length > 0 && !staffId) setStaffId(staff[0].id)
  }

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  if (!isOpen) return null

  const principal = parseFloat(sanctionedAmount || "0")
  const tenure = parseInt(totalTenureMonths || "1", 10)
  const calculatedMonthlyEmi = tenure > 0 ? Math.round(principal / tenure) : principal

  const selectedMember = staffList.find((s) => s.id === staffId)

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || !staffId || principal <= 0) return

    setIsSubmitting(true)
    try {
      const res = await HrmsDatabase.addStaffLoan({
        staffId,
        staffName: selectedMember?.name || staffId,
        department: selectedMember?.department || "General",
        loanType,
        sanctionedAmount: principal,
        monthlyEmi: calculatedMonthlyEmi,
        totalTenureMonths: tenure,
      })

      if (res && res.status === "error") {
        showNotice(`Error: ${res.message || "Failed to sanction staff advance"}`)
        return
      }

      showNotice(`Loan sanctioned successfully for ${selectedMember?.name || staffId}. Monthly EMI ₹${calculatedMonthlyEmi.toLocaleString()} will be deducted in payroll.`)
      setIsApplying(false)
      await loadData()
    } catch (err: any) {
      showNotice(`Error: ${err.message || "Failed to sanction staff advance"}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRepayEmi = async (loanId: string) => {
    if (processingLoanId) return
    setProcessingLoanId(loanId)
    try {
      const res = await HrmsDatabase.repayStaffLoanEmi(loanId)
      if (res && res.status === "success") {
        const successMessage = buildEmiSuccessMessage(res.staffLoan)
        showNotice(successMessage)
        await loadData()
      } else {
        showNotice(`Error: ${res?.message || "Failed to process loan repayment"}`)
      }
    } catch (err: any) {
      showNotice(`Error: ${err.message || "Failed to process loan repayment"}`)
    } finally {
      setProcessingLoanId(null)
    }
  }

  const handleCloseLoan = async (loanId: string) => {
    if (processingLoanId) return
    setProcessingLoanId(loanId)
    try {
      const res = await HrmsDatabase.closeStaffLoan(loanId)
      if (res && res.status === "success") {
        showNotice("Staff advance / loan settled and marked Completed.")
        await loadData()
      } else {
        showNotice(`Error: ${res?.message || "Failed to settle staff loan"}`)
      }
    } catch (err: any) {
      showNotice(`Error: ${err.message || "Failed to settle staff loan"}`)
    } finally {
      setProcessingLoanId(null)
    }
  }

  const totalSanctioned = loans.reduce((acc, l) => acc + Number(l.sanctionedAmount ?? (l as any).sanctioned_amount ?? 0), 0)
  const totalOutstanding = loans.filter((l) => (l.status || "Active") === "Active").reduce((acc, l) => acc + Number(l.balanceOutstanding ?? (l as any).balance_outstanding ?? 0), 0)
  const totalMonthlyEmi = loans.filter((l) => (l.status || "Active") === "Active").reduce((acc, l) => acc + Number(l.monthlyEmi ?? (l as any).monthly_emi ?? 0), 0)
  const activeCount = loans.filter((l) => (l.status || "Active") === "Active").length

  const filteredLoans = loans.filter((l) => {
    if (!l) return false
    const sName = String(l.staffName || (l as any).employee_name || "").toLowerCase()
    const sId = String(l.staffId || (l as any).employee_id || "").toLowerCase()
    const lId = String(l.id || "").toLowerCase()
    const lType = String(l.loanType || (l as any).loan_type || "").toLowerCase()
    const dept = String(l.department || "").toLowerCase()
    const sTerm = (search || "").toLowerCase().trim()

    const matchesSearch =
      !sTerm ||
      sName.includes(sTerm) ||
      sId.includes(sTerm) ||
      lId.includes(sTerm) ||
      lType.includes(sTerm) ||
      dept.includes(sTerm)
    const currentStatus = l.status || "Active"
    const matchesStatus = statusFilter === "All" || currentStatus === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Staff Loans & Salary Advance Ledger</h3>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Automated Payroll Recovery
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Hospital staff advances, festival loans, emergency assistance & monthly EMI salary deductions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Notice Toast */}
        {actionNotice && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-medium animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Total Sanctioned</span>
            <div className="text-xl font-extrabold text-slate-900 mt-1">₹{totalSanctioned.toLocaleString()}</div>
            <span className="text-[10.5px] text-slate-400">All-time Hospital Advances</span>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 shadow-2xs">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700">Outstanding Balance</span>
            <div className="text-xl font-extrabold text-amber-900 mt-1">₹{totalOutstanding.toLocaleString()}</div>
            <span className="text-[10.5px] text-amber-600">Pending Recovery</span>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 shadow-2xs">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">Monthly EMI Deduction</span>
            <div className="text-xl font-extrabold text-emerald-900 mt-1">₹{totalMonthlyEmi.toLocaleString()}</div>
            <span className="text-[10.5px] text-emerald-600">Auto-deducted in Payslips</span>
          </div>

          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 shadow-2xs">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-blue-700">Active Advance Count</span>
            <div className="text-xl font-extrabold text-blue-900 mt-1">
              {activeCount} <span className="text-xs font-normal text-slate-500">/ {loans.length} total</span>
            </div>
            <span className="text-[10.5px] text-blue-600">Staff Accounts Active</span>
          </div>
        </div>

        {/* Action Header & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search staff, ID, loan type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {(["All", "Active", "Closed"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    statusFilter === filter
                      ? "bg-white text-emerald-700 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setIsApplying(!isApplying)}
            className="w-full sm:w-auto px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{isApplying ? "Close Sanction Form" : "Sanction New Advance / Loan"}</span>
          </button>
        </div>

        {/* Sanction New Loan Form */}
        {isApplying && (
          <form onSubmit={handleApply} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Sanction Staff Advance / Loan Entry
              </span>
              <span className="text-[11px] text-slate-500">
                Hospital Finance Rules: Zero interest on advances; deducted via equal monthly salary installments.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Select Staff Member:</label>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id} · {s.department})
                    </option>
                  ))}
                </select>
                {selectedMember && (
                  <div className="text-[10.5px] text-slate-500 mt-1 font-mono">
                    Basic: ₹{selectedMember.salary.basic.toLocaleString()} · Net: ₹{selectedMember.salary.netPay.toLocaleString()}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Advance / Loan Type:</label>
                <select
                  value={loanType}
                  onChange={(e) => setLoanType(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
                >
                  <option value="Salary Advance">Salary Advance (1-Month Pay)</option>
                  <option value="Festival Advance">Festival Advance (Deepavali / Dussehra / Eid)</option>
                  <option value="Medical Emergency Loan">Family Medical Emergency Assistance</option>
                  <option value="Education Assistance">Children Tuition & Education Loan</option>
                  <option value="General Staff Loan">General Staff Purpose Loan</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Sanctioned Amount (₹):</label>
                <input
                  type="number"
                  step="1000"
                  min="1000"
                  value={sanctionedAmount}
                  onChange={(e) => setSanctionedAmount(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold outline-none focus:border-emerald-500"
                />
                <div className="flex gap-1.5 mt-1">
                  {["10000", "25000", "50000", "100000"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSanctionedAmount(preset)}
                      className="px-1.5 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
                    >
                      ₹{(parseInt(preset, 10) / 1000)}k
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tenure (Installment Months):</label>
                <select
                  value={totalTenureMonths}
                  onChange={(e) => setTotalTenureMonths(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-emerald-500"
                >
                  <option value="1">1 Month (Lump sum recovery)</option>
                  <option value="3">3 Months</option>
                  <option value="5">5 Months</option>
                  <option value="6">6 Months</option>
                  <option value="10">10 Months</option>
                  <option value="12">12 Months (1 Year)</option>
                  <option value="24">24 Months (2 Years)</option>
                </select>
              </div>

              <div className="md:col-span-2 flex flex-col justify-end">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 uppercase">Monthly Payroll EMI Deduction:</span>
                    <p className="text-[10px] text-emerald-600">Will be automatically deducted from staff payslip under Other Deductions</p>
                  </div>
                  <div className="text-base font-extrabold text-emerald-700 font-mono">
                    ₹{calculatedMonthlyEmi.toLocaleString()} / mo
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsApplying(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !staffId || principal <= 0}
                className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-all ${
                  isSubmitting || !staffId || principal <= 0
                    ? "bg-slate-400 cursor-not-allowed opacity-75"
                    : "bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Sanctioning Advance...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Sanction & Disburse Advance</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Ledger Table */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3">Loan ID</th>
                <th className="py-2.5 px-3">Staff Member</th>
                <th className="py-2.5 px-3">Advance Type</th>
                <th className="py-2.5 px-3 text-right">Sanctioned</th>
                <th className="py-2.5 px-3 text-right">Monthly EMI</th>
                <th className="py-2.5 px-3 text-center">Tenure Progress</th>
                <th className="py-2.5 px-3 text-right">Balance Due</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm text-slate-700">No Staff Loan Records Found</p>
                    <p className="text-xs text-slate-500 mt-0.5">Click "+ Sanction New Advance / Loan" to create an entry.</p>
                  </td>
                </tr>
              ) : (
                filteredLoans.map((l) => {
                  const sName = l.staffName || (l as any).employee_name || "Unknown Staff"
                  const sId = l.staffId || (l as any).employee_id || ""
                  const dept = l.department || "General"
                  const lType = l.loanType || (l as any).loan_type || "Salary Advance"
                  const sanctioned = Number(l.sanctionedAmount ?? (l as any).sanctioned_amount ?? 0)
                  const emi = Number(l.monthlyEmi ?? (l as any).monthly_emi ?? 0)
                  const balance = Number(l.balanceOutstanding ?? (l as any).balance_outstanding ?? 0)
                  const totalMonths = Number(l.totalTenureMonths ?? (l as any).total_tenure_months ?? 1)
                  const remainingMonths = Number(l.remainingTenureMonths ?? (l as any).remaining_tenure_months ?? 0)
                  const paidMonths = Math.max(0, totalMonths - remainingMonths)
                  const progressPct = totalMonths > 0 ? Math.round((paidMonths / totalMonths) * 100) : 0
                  const status = l.status || "Active"
                  const disbursedDate = l.disbursedDate || (l as any).disbursed_date || "-"

                  return (
                    <tr key={l.id || Math.random().toString()} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {l.id}
                        <div className="text-[10px] text-slate-400 font-normal">{disbursedDate}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{sName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{sId} · {dept}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{lType}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        ₹{sanctioned.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                        ₹{emi.toLocaleString()}
                        <div className="text-[9.5px] text-slate-400 font-normal">payroll cut</div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="text-[11px] text-slate-600 font-medium">
                          {paidMonths} / {totalMonths} mos ({progressPct}%)
                        </div>
                        <div className="w-20 mx-auto bg-slate-200 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-full ${status === "Closed" ? "bg-slate-400" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(100, Math.max(5, progressPct))}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                        ₹{balance.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                            status === "Active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {status === "Active" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              disabled={processingLoanId !== null}
                              onClick={() => handleRepayEmi(l.id)}
                              className={`px-2 py-1 text-[11px] font-semibold border rounded transition-colors ${
                                processingLoanId === l.id
                                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                  : processingLoanId !== null
                                  ? "bg-emerald-50/50 text-emerald-400 border-emerald-100 cursor-not-allowed"
                                  : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 cursor-pointer"
                              }`}
                              title="Manually record recovery of 1 month EMI"
                            >
                              {processingLoanId === l.id ? "Processing..." : "Repay EMI"}
                            </button>
                            <button
                              disabled={processingLoanId !== null}
                              onClick={() => handleCloseLoan(l.id)}
                              className={`px-2 py-1 text-[11px] font-semibold border rounded transition-colors ${
                                processingLoanId !== null
                                  ? "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                                  : "text-slate-600 bg-white hover:bg-slate-100 border-slate-200 cursor-pointer"
                              }`}
                              title="Pre-close loan account"
                            >
                              Settle
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Closed</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Hospital Audit Policy: All sanctioned advances and EMI repayments are logged for finance reconciliation.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
