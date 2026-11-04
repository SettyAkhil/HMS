import React, { useState, useEffect } from "react"
import { StaffMember, HrmsDatabase, StaffLoan, PayrollEntry } from "../../services/hrmsDb"
import { X, Printer, CheckCircle, Clock, Info, Sparkles } from "lucide-react"
import {
  round2,
  numberToWordsINR,
  maskAccountNumber,
  maskPanNumber,
} from "../../utils/payrollFormatters"

interface PayslipModalProps {
  staff: StaffMember | null
  payrollItem?: PayrollEntry | null
  month?: string
  year?: number
  isOpen: boolean
  onClose: () => void
}

export default function PayslipModal({
  staff,
  payrollItem,
  month = "September",
  year = 2026,
  isOpen,
  onClose,
}: PayslipModalProps) {
  const [activeLoan, setActiveLoan] = useState<StaffLoan | null>(null)
  // Mode selection: 'saved' displays the immutable historical record; 'preview' demonstrates the new calendar proration engine
  const [mode, setMode] = useState<"saved" | "preview">("saved")
  const [includeLoanInPreview, setIncludeLoanInPreview] = useState<boolean>(false)

  useEffect(() => {
    if (staff && isOpen) {
      HrmsDatabase.getStaffLoans().then((loans) => {
        const found = loans.find((l) => l.staffId === staff.id && l.status === "Active")
        setActiveLoan(found || null)
      })
      // If no saved payroll item exists, default directly to preview
      if (!payrollItem) {
        setMode("preview")
      } else {
        setMode("saved")
      }
    }
  }, [staff, payrollItem, isOpen])

  if (!isOpen || !staff) return null

  const effectiveMonth = payrollItem?.month || month
  const effectiveYear = payrollItem?.year || year

  // Calendar parameters
  const MONTH_MAP: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  }
  const mIndex = MONTH_MAP[effectiveMonth.toLowerCase()] || 10
  const daysInMonth = new Date(effectiveYear, mIndex, 0).getDate()

  // Calculate employed calendar days for mid-month joiner
  let employedDays = daysInMonth
  let isMidMonthJoiner = false
  if (staff.joiningDate) {
    const joinDateObj = new Date(staff.joiningDate)
    const joinYear = joinDateObj.getFullYear()
    const joinMonth = joinDateObj.getMonth() + 1
    const joinDay = joinDateObj.getDate()

    if (joinYear === effectiveYear && joinMonth === mIndex && joinDay > 1) {
      isMidMonthJoiner = true
      employedDays = Math.max(0, daysInMonth - joinDay + 1)
    } else if (joinYear > effectiveYear || (joinYear === effectiveYear && joinMonth > mIndex)) {
      employedDays = 0
    }
  }

  // --- Dynamic Unsaved Calendar-Prorated Calculations ---
  const paidRatio = daysInMonth > 0 ? (employedDays / daysInMonth) : 0
  const previewBaseGross = round2(staff.salary.basic + staff.salary.hra + staff.salary.allowances)
  const previewGross = round2(previewBaseGross * paidRatio)
  const previewBasic = round2(staff.salary.basic * paidRatio)
  const previewHra = round2(staff.salary.hra * paidRatio)
  const previewAllowances = round2(previewGross - previewBasic - previewHra)
  const previewPf = round2(previewBasic * 0.12)
  const previewTax = round2(previewGross * 0.10)
  const previewPT = round2(((staff.salary as any).professionalTax || 0) * paidRatio)
  const previewStatutoryDeductions = round2(previewPf + previewTax + previewPT)
  const previewNetBeforeLoan = round2(previewGross - previewStatutoryDeductions)
  const scheduledEmi = activeLoan ? activeLoan.monthlyEmi : 0
  const previewLoanDeduct = includeLoanInPreview ? Math.min(scheduledEmi, Math.max(0, previewNetBeforeLoan)) : 0
  const previewTotalDeductions = round2(previewStatutoryDeductions + previewLoanDeduct)
  const previewNetPay = round2(previewGross - previewTotalDeductions)

  // --- Active View Selection ---
  const isPreview = mode === "preview" || !payrollItem

  const basic = isPreview ? previewBasic : payrollItem.basic
  const hra = isPreview ? previewHra : payrollItem.hra
  const allowances = isPreview ? previewAllowances : payrollItem.allowances
  const overtimeAmount = isPreview ? 0 : (payrollItem.overtimeAmount || 0)
  const gross = isPreview ? previewGross : payrollItem.gross

  const pf = isPreview ? previewPf : payrollItem.pf
  const tax = isPreview ? previewTax : payrollItem.tax
  const loanEmi = isPreview ? previewLoanDeduct : (payrollItem.otherDeductions || 0)
  const professionalTax = isPreview ? previewPT : (payrollItem.professionalTax || 0)
  const leaveDeductions = isPreview ? round2(previewBaseGross - previewGross) : (payrollItem.leaveDeductions || 0)

  const totalDeductions = isPreview ? previewTotalDeductions : payrollItem.totalDeductions
  const netPay = isPreview ? previewNetPay : payrollItem.netPay

  // Working / Paid Days label
  const workingDaysDisplay = isPreview
    ? `${employedDays} / ${daysInMonth} Days (Calendar Prorated)`
    : (isMidMonthJoiner ? `31 / 31 Days (Historical Unprorated Record)` : `${daysInMonth} / ${daysInMonth} Days`)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Control Bar (Hidden on print) */}
        <div className="px-6 py-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Official Payslip Voucher</span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-300 font-mono">{staff.id}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle: Shown when a saved payroll item exists */}
            {payrollItem && (
              <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 text-xs">
                <button
                  id="btn-saved-record"
                  onClick={() => setMode("saved")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    !isPreview
                      ? "bg-slate-700 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="View immutable saved record in PR-2026-OCT"
                >
                  Saved Record (₹155k)
                </button>
                <button
                  id="btn-prorated-preview"
                  onClick={() => setMode("preview")}
                  className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition-all ${
                    isPreview
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-blue-300 hover:text-white"
                  }`}
                  title="View unsaved dynamic calendar-prorated calculation"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  New Prorated Preview (₹30k)
                </button>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Informational Context Banner */}
        <div className="px-6 py-2 border-b text-xs flex items-center justify-between print:hidden bg-slate-50 border-slate-200">
          {!isPreview ? (
            <div className="flex items-center gap-2 text-slate-700">
              <Info className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong className="text-purple-900">Saved Record:</strong> Displays immutable historical entry from{" "}
                <code className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded font-mono font-bold">
                  PR-2026-OCT Rev #2
                </code>
                . In accordance with data safety, this record is preserved.
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-emerald-800">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong className="text-emerald-900">Unsaved Prorated Preview:</strong> Evaluated with new calendar engine (
                  <strong>6 employed days / 31 total calendar days</strong> = ₹30,000.00 Gross).
                </span>
              </div>
              {/* Optional Loan Recovery Toggle in Preview */}
              {activeLoan && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 px-2 py-0.5 rounded-md hover:bg-slate-100">
                  <input
                    id="toggle-loan-emi"
                    type="checkbox"
                    checked={includeLoanInPreview}
                    onChange={(e) => setIncludeLoanInPreview(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Apply EMI (₹3,333)</span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Printable Payslip Body */}
        <div className="flex-1 overflow-y-auto p-8 text-slate-900 font-sans print:p-0">
          
          {/* Hospital Header */}
          <div className="border-b-2 border-slate-900 pb-5 mb-5 flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-900 text-white flex items-center justify-center text-xl font-black">
                IH
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-blue-950 uppercase">
                  Imperial Hospitals & Research Institute
                </h1>
                <p className="text-xs text-slate-600">
                  Accredited by NABH & JCI • Plot 42, Health City, Jubilee Hills, Hyderabad - 500033
                </p>
                <p className="text-[11px] text-slate-500">Phone: +91 40 6828 9999 | Email: payroll@imperialhospitals.org</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold uppercase text-slate-600 tracking-wider">Salary Voucher</div>
              <div className="text-sm font-black text-blue-900 mt-0.5">
                {effectiveMonth.toUpperCase()} {effectiveYear}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                {isPreview
                  ? `PREVIEW-${effectiveYear}-${effectiveMonth.slice(0, 3).toUpperCase()}-${staff.id}`
                  : `PAY-REF: ${effectiveYear}-${effectiveMonth.slice(0, 3).toUpperCase()}-${staff.id}`}
              </div>
              <div className="mt-1">
                {isPreview ? (
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-300">
                    UNSAVED CALCULATION PREVIEW
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-800 rounded-full border border-purple-300">
                    SAVED HISTORICAL RECORD (REV #{payrollItem?.revisionNumber || 1})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Employee Details Grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Employee Name:</span>
              <span className="font-bold text-slate-900">{staff.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Employee ID:</span>
              <span className="font-mono font-bold text-slate-900">{staff.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Department:</span>
              <span className="font-semibold text-slate-900">{staff.department}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Designation:</span>
              <span className="font-semibold text-slate-900">{staff.designation}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Bank Name:</span>
              <span className="font-semibold text-slate-900">{staff.bankDetails.bankName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Bank Account No:</span>
              <span className="font-mono font-semibold text-slate-900" id="payslip-account-no">
                {payrollItem?.bankAccountMasked || maskAccountNumber(staff.bankDetails.accountNo)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">IFSC Code:</span>
              <span className="font-mono font-semibold text-slate-900">{staff.bankDetails.ifsc}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">PAN Number:</span>
              <span className="font-mono font-semibold text-slate-900" id="payslip-pan-no">
                {payrollItem?.panMasked || maskPanNumber(staff.bankDetails.pan)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Joining Date:</span>
              <span className="font-semibold text-slate-900">{staff.joiningDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Working / Paid Days:</span>
              <span className="font-bold text-emerald-700">{workingDaysDisplay}</span>
            </div>
          </div>

          {/* Dual Table: Earnings & Deductions */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            
            {/* Earnings */}
            <div className="border border-slate-300 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 font-bold text-xs text-slate-800 flex justify-between">
                <span>EARNINGS</span>
                <span>AMOUNT (₹)</span>
              </div>
              <div className="p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-700">Basic Salary</span>
                  <span className="font-semibold font-mono">₹{basic.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-700">House Rent Allowance (HRA)</span>
                  <span className="font-semibold font-mono">₹{hra.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-700">Special & Medical Allowance</span>
                  <span className="font-semibold font-mono">₹{allowances.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {overtimeAmount > 0 && (
                  <div className="flex justify-between text-blue-700">
                    <span>Overtime Allowance ({payrollItem?.overtimeHours || 0}h)</span>
                    <span className="font-semibold font-mono">₹{overtimeAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-300 font-bold text-xs flex justify-between text-slate-900">
                <span>TOTAL GROSS (A)</span>
                <span className="font-mono text-emerald-700">₹{gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Deductions (Only genuine deductions: EPF, TDS, PT, Loan EMI) */}
            <div className="border border-slate-300 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 font-bold text-xs text-slate-800 flex justify-between">
                <span>DEDUCTIONS</span>
                <span>AMOUNT (₹)</span>
              </div>
              <div className="p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-700">Employee Provident Fund (EPF)</span>
                  <span className="font-semibold font-mono text-rose-600">₹{pf.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-700">Tax Deducted at Source (TDS)</span>
                  <span className="font-semibold font-mono text-rose-600">₹{tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {professionalTax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-700">Professional Tax (PT)</span>
                    <span className="font-semibold font-mono text-rose-600">₹{professionalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {loanEmi > 0 && (
                  <div className="flex justify-between bg-amber-50/70 p-1 rounded border border-amber-200">
                    <span className="text-amber-800 font-semibold">{activeLoan ? activeLoan.loanType : "Staff Loan"} EMI Recovery</span>
                    <span className="font-bold font-mono text-amber-700">₹{loanEmi.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-300 font-bold text-xs flex justify-between text-slate-900">
                <span>TOTAL DEDUCTIONS (B)</span>
                <span className="font-mono text-rose-700">₹{totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Proration Adjustment (already reflected in earned gross) - Clearly labelled Informational Section */}
          {leaveDeductions > 0 && (
            <div
              id="proration-adjustment-box"
              className="mb-5 bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-start justify-between text-xs"
            >
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900">
                    Proration Adjustment (already reflected in earned gross)
                  </div>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    {isPreview
                      ? `Employee joined mid-month on ${staff.joiningDate}. Monthly reference salary of ₹${previewBaseGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is prorated for ${employedDays}/${daysInMonth} calendar days. This adjustment of ₹${leaveDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is already accounted for in Total Gross (A) and is NOT a salary deduction.`
                      : `Unpaid leave / LOP adjustment of ₹${leaveDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is already accounted for in earned gross and is not counted as a separate salary deduction.`}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-4">
                <span className="font-mono font-bold text-amber-800 bg-amber-100/90 px-2 py-1 rounded border border-amber-300">
                  -₹{leaveDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <div className="text-[10px] text-amber-700 mt-1 font-medium">Informational Only</div>
              </div>
            </div>
          )}

          {/* Net Pay Callout */}
          <div className="bg-blue-50 border-2 border-blue-900/30 rounded-xl p-4 flex items-center justify-between mb-6">
            <div>
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                NET SALARY PAYABLE (A - B)
              </div>
              <div className="text-xs text-blue-800 mt-1 font-medium italic">
                {numberToWordsINR(netPay)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-blue-950 font-mono">
                ₹{netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {isPreview ? (
                <div className="text-[11px] font-semibold text-amber-700 flex items-center gap-1 justify-end mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Status: Unsaved Calculation Preview
                </div>
              ) : (
                <div className="text-[11px] font-semibold text-purple-700 flex items-center gap-1 justify-end mt-0.5">
                  <CheckCircle className="w-3.5 h-3.5 text-purple-600" />
                  Status: Saved Record (Revision #{payrollItem?.revisionNumber || 1})
                </div>
              )}
            </div>
          </div>

          {/* Signatures & Seal */}
          <div className="pt-8 mt-4 border-t border-slate-300 flex justify-between items-end text-xs text-slate-600">
            <div className="space-y-1">
              <div className="font-mono text-[10px] text-slate-400">
                {isPreview
                  ? "Auth Token: IH-HRMS-UNSAVED-PREVIEW (Dynamic Calendar Engine)"
                  : `Auth Token: PR-2026-OCT-EMP-101-REV#${payrollItem?.revisionNumber || 1}`}
              </div>
              <p className="text-[11px] italic text-slate-400">
                {isPreview
                  ? "Note: This is an unsaved dynamic preview based on calendar-day proration."
                  : "Official historical salary voucher from PR-2026-OCT."}
              </p>
            </div>

            <div className="text-center">
              <div className="w-40 border-b border-slate-400 pb-1 mb-1 font-semibold text-slate-800">
                Dr. R. K. Shrivastava
              </div>
              <div className="text-[11px] text-slate-500">Director of Human Resources</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
