import React, { useState } from "react"
import { StaffMember, HrmsDatabase, DutyStatus } from "../../services/hrmsDb"
import {
  X,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  CreditCard,
  Clock,
  FileText,
  Edit,
  Trash2,
  CheckCircle,
  AlertCircle,
  Award,
  DollarSign,
} from "lucide-react"

interface EmployeeProfileModalProps {
  staff: StaffMember | null
  isOpen: boolean
  onClose: () => void
  onEdit: (staff: StaffMember) => void
  onViewPayslip: (staff: StaffMember) => void
  isHrAdmin?: boolean
}

function EmployeeProfileModalBody({
  staff,
  isOpen,
  onClose,
  onEdit,
  onViewPayslip,
  isHrAdmin = false,
}: EmployeeProfileModalProps & { staff: NonNullable<EmployeeProfileModalProps["staff"]> }) {

  const [activeTab, setActiveTab] = useState<"overview" | "credentials" | "attendance" | "salary">("overview")
  const [currentDuty, setCurrentDuty] = useState<DutyStatus>(staff.dutyStatus)

  const handleDutyChange = (status: DutyStatus) => {
    setCurrentDuty(status)
    HrmsDatabase.updateStaff(staff.id, { dutyStatus: status })
    if (status === "On Duty") {
      HrmsDatabase.punchClock(staff.id, "checkIn")
    } else if (status === "Off Duty") {
      HrmsDatabase.punchClock(staff.id, "checkOut")
    }
  }

  const handleDelete = () => {
    if (confirm(`Are you sure you want to remove ${staff.name} (${staff.id}) from the active staff directory?`)) {
      HrmsDatabase.deleteStaff(staff.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header Card */}
        <div className="px-6 py-5 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/25 text-white flex items-center justify-center text-xl font-bold shadow-md ring-2 ring-white/20">
              {staff.avatarInitials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">{staff.name}</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/20 text-white border border-white/20">
                  {staff.id}
                </span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-white/20 text-blue-100 border border-white/20">
                  {staff.category}
                </span>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5 flex items-center gap-2">
                <span>{staff.designation}</span>
                <span>•</span>
                <span className="font-semibold text-white">{staff.department}</span>
                <span>•</span>
                <span>{staff.employmentType}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Duty Status Selector - Only HR Admin can override others' status */}
            {isHrAdmin ? (
              <div className="flex bg-black/20 p-1 rounded-xl border border-white/20 backdrop-blur-xs">
                {(["On Duty", "In Surgery", "Off Duty"] as DutyStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleDutyChange(st)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                      currentDuty === st
                        ? st === "On Duty"
                          ? "bg-[#15803D] text-white font-bold shadow-xs"
                          : st === "In Surgery"
                            ? "bg-[#7C3AED] text-white font-bold shadow-xs"
                            : "bg-slate-700 text-white font-bold shadow-xs"
                        : "text-blue-100 hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            ) : (
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  currentDuty === "On Duty"
                    ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]"
                    : currentDuty === "In Surgery"
                      ? "bg-[#EDE9FE] text-[#6D28D9] border-[#DDD6FE]"
                      : "bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]"
                }`}
              >
                ● {currentDuty}
              </span>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-[#DDE2EC] bg-[#F8FAFC] px-6 gap-2 pt-2 text-xs font-semibold">
          {[
            { id: "overview", label: "Overview & Personal Info", icon: Building2 },
            { id: "credentials", label: "Credentials & Clinical License", icon: Award },
            { id: "attendance", label: "Attendance & Leave Balance", icon: Clock },
            ...(isHrAdmin ? [{ id: "salary", label: "Compensation & Payslips", icon: DollarSign }] : []),
          ].map((tab) => {
            const IconComp = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-2.5 px-3 border-b-2 transition-all cursor-pointer ${
                  active
                    ? "border-[#1B4FD8] text-[#1B4FD8] font-bold bg-white rounded-t-lg shadow-xs"
                    : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Contact Details
                  </div>
                  <div className="space-y-2 text-xs text-slate-800">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-blue-600" />
                      <span>{staff.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      <span className="truncate">{staff.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>{staff.address}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Hospital Tenure & Shift
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-800">
                    <div>
                      <span className="text-slate-500">Joining Date:</span>{" "}
                      <span className="font-semibold">{staff.joiningDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Assigned Shift:</span>{" "}
                      <span className="font-semibold">{staff.shift}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Status:</span>{" "}
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        {staff.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Personal Demographics
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-800">
                    <div>
                      <span className="text-slate-500">Gender:</span>{" "}
                      <span className="font-semibold">{staff.gender}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Date of Birth:</span>{" "}
                      <span className="font-semibold">{staff.dob}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Blood Group:</span>{" "}
                      <span className="font-bold text-red-600">{staff.bloodGroup}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-rose-950">Emergency Contact (Next of Kin)</h4>
                    <p className="text-xs text-rose-700">
                      {staff.emergencyContact.name} ({staff.emergencyContact.relation})
                    </p>
                  </div>
                </div>
                <div className="text-xs font-bold text-rose-900 bg-white px-3 py-1.5 rounded-lg border border-rose-200 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-rose-600" />
                  {staff.emergencyContact.phone}
                </div>
              </div>
            </div>
          )}

          {activeTab === "credentials" && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-800 mb-2">Qualifications & Education</h4>
                <div className="text-xs text-slate-700 font-medium bg-white p-3 rounded-lg border border-slate-200">
                  {staff.qualification}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-800">Official Clinical License & Registration</h4>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                    Verified State Board
                  </span>
                </div>
                <div className="p-4 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500 text-[11px]">License / Registration No.</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">{staff.licenseNumber}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">Valid Until</div>
                    <div className="font-bold text-slate-900 mt-0.5">{staff.licenseExpiry}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">Verification Status</div>
                    <div className="flex items-center gap-1 text-emerald-700 font-semibold mt-0.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Active & Good Standing
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "attendance" && (
            <div className="space-y-5">
              {/* Leave Balances */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2">Annual Leave Balances & Quota</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
                    <div className="text-xs font-bold text-blue-900">Casual Leave (CL)</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-blue-950">
                        {staff.leaveBalance.casual - staff.leaveBalance.casualUsed}
                      </span>
                      <span className="text-xs text-blue-700">
                        {staff.leaveBalance.casualUsed} used of {staff.leaveBalance.casual}
                      </span>
                    </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                    <div className="text-xs font-bold text-emerald-900">Sick Leave (SL)</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-emerald-950">
                        {staff.leaveBalance.sick - staff.leaveBalance.sickUsed}
                      </span>
                      <span className="text-xs text-emerald-700">
                        {staff.leaveBalance.sickUsed} used of {staff.leaveBalance.sick}
                      </span>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5">
                    <div className="text-xs font-bold text-purple-900">Earned / Privilege (EL)</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-purple-950">
                        {staff.leaveBalance.earned - staff.leaveBalance.earnedUsed}
                      </span>
                      <span className="text-xs text-purple-700">
                        {staff.leaveBalance.earnedUsed} used of {staff.leaveBalance.earned}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Status & Daily Duty Toggle */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Daily Duty & Attendance Status</h4>
                  <p className="text-xs text-slate-500">Record check-in time or check-out time for today's shift</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleDutyChange("On Duty")
                      alert(`Status Updated: Checked In (On Duty) for ${staff.name}`)
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs cursor-pointer"
                  >
                    Check In (On Duty)
                  </button>
                  <button
                    onClick={() => {
                      handleDutyChange("Off Duty")
                      alert(`Status Updated: Checked Out (Off Duty) for ${staff.name}`)
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Check Out (Off Duty)
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "salary" && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl p-4 text-white flex items-center justify-between">
                <div>
                  <div className="text-xs text-blue-200">Net Monthly Salary Payout</div>
                  <div className="text-2xl font-black mt-0.5">₹{staff.salary.netPay.toLocaleString()}</div>
                </div>
                <button
                  onClick={() => onViewPayslip(staff)}
                  className="px-4 py-2 text-xs font-bold bg-white text-blue-900 hover:bg-blue-50 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-700" />
                  View & Print Payslip
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-800 mb-3">Gross Earnings Breakdown</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Basic Pay:</span>
                      <span className="font-semibold">₹{staff.salary.basic.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">House Rent Allowance (HRA):</span>
                      <span className="font-semibold">₹{staff.salary.hra.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Special & Medical Allowances:</span>
                      <span className="font-semibold">₹{staff.salary.allowances.toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                      <span>Total Gross Earnings:</span>
                      <span className="text-emerald-700">
                        ₹{(staff.salary.basic + staff.salary.hra + staff.salary.allowances).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-800 mb-3">Statutory Deductions</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Provident Fund (PF):</span>
                      <span className="font-semibold text-rose-600">₹{staff.salary.pf.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Income Tax (TDS):</span>
                      <span className="font-semibold text-rose-600">₹{staff.salary.tax.toLocaleString()}</span>
                    </div>
                    <div className="pt-4 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                      <span>Total Deductions:</span>
                      <span className="text-rose-700">
                        ₹{(staff.salary.pf + staff.salary.tax).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-800 mb-2">Direct Deposit Bank Account</h4>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px]">Bank</span>
                    <div className="font-semibold">{staff.bankDetails.bankName}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">Account No</span>
                    <div className="font-mono font-semibold">{staff.bankDetails.accountNo}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">IFSC Code</span>
                    <div className="font-mono font-semibold">{staff.bankDetails.ifsc}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">PAN</span>
                    <div className="font-mono font-semibold">{staff.bankDetails.pan}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-[#DDE2EC] flex items-center justify-between">
          {isHrAdmin ? (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Deactivate Staff
            </button>
          ) : (
            <div className="text-[11px] text-[#64748B]">
              Hospital Directory Card • Read-Only View
            </div>
          )}

          <div className="flex items-center gap-2">
            {isHrAdmin && (
              <button
                onClick={() => onEdit(staff)}
                className="px-4 py-2 text-xs font-semibold text-[#334155] bg-white border border-[#DDE2EC] hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// The hooks live in EmployeeProfileModalBody. Returning null before them (as this did) gives
// closed and open renders a different hook count, and React throws "Rendered
// more hooks than during the previous render" the moment the modal opens.
export default function EmployeeProfileModal(props: EmployeeProfileModalProps) {
  if (!props.isOpen || !props.staff) return null
  return <EmployeeProfileModalBody {...props} staff={props.staff} />
}
