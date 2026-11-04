import React, { useState, useEffect } from "react"
import { HrmsDatabase, StaffMember } from "../../services/hrmsDb"
import { X, Calendar, Send, Clock, User, ShieldCheck, Lock, CheckCircle, AlertCircle, FileText } from "lucide-react"

interface ApplyLeaveModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  loggedInStaffId?: string
  loggedInStaffName?: string
  isSelfService?: boolean
}

function ApplyLeaveModalBody({
  isOpen,
  onClose,
  onSuccess,
  loggedInStaffId,
  loggedInStaffName,
  isSelfService = false,
}: ApplyLeaveModalProps) {

  const staffList = HrmsDatabase.getStaffList()

  // Find logged-in staff member if in self-service mode
  const resolvedInitialStaff = () => {
    if (isSelfService) {
      if (loggedInStaffId) {
        const found = staffList.find((s) => s.id === loggedStaffIdMatch(loggedInStaffId))
        if (found) return found.id
      }
      if (loggedInStaffName) {
        const found = staffList.find((s) =>
          s.name.toLowerCase().includes(loggedInStaffName.toLowerCase()) ||
          loggedInStaffName.toLowerCase().includes(s.name.toLowerCase())
        )
        if (found) return found.id
      }
    }
    return staffList[0]?.id || ""
  }

  function loggedStaffIdMatch(id: string) {
    const direct = staffList.find((s) => s.id === id)
    if (direct) return direct.id
    // If it's a doc ID or username, find by name
    return staffList[0]?.id || ""
  }

  const [selectedStaffId, setSelectedStaffId] = useState(resolvedInitialStaff())
  const [modalTab, setModalTab] = useState<"apply" | "history">("apply")
  const [demoSwitchStaff, setDemoSwitchStaff] = useState(false)
  const [leaveType, setLeaveType] = useState<"Casual Leave" | "Sick Leave" | "Earned Leave" | "Maternity/Paternity" | "Emergency Leave">("Casual Leave")
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0])
  const [reason, setReason] = useState("")

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setSelectedStaffId(resolvedInitialStaff())
    setErrorMessage(null)
  }, [loggedInStaffId, loggedInStaffName, isSelfService, modalTab])

  const fallbackStaff = {
    id: loggedInStaffId || "EMP-DOC",
    name: loggedInStaffName || "Staff Member",
    department: "Clinical Care",
    designation: "Staff Member",
    avatarInitials: (loggedInStaffName || "SM").split(" ").map(n => n[0]).join("").slice(0, 2),
    leaveBalance: { casual: 12, casualUsed: 0, sick: 10, sickUsed: 0, earned: 15, earnedUsed: 0 },
  }

  const selectedStaff = staffList.find((s) => s.id === selectedStaffId) ||
    (loggedInStaffName ? {
      ...fallbackStaff,
      name: loggedInStaffName,
      id: loggedInStaffId || "EMP-STAFF",
    } : staffList[0]) || fallbackStaff

  // Calculate day difference
  const calculateDays = () => {
    try {
      const d1 = new Date(startDate)
      const d2 = new Date(endDate)
      const diffTime = d2.getTime() - d1.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
      return diffDays > 0 ? diffDays : 1
    } catch {
      return 1
    }
  }

  const days = calculateDays()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff || isSubmitting) return
    if (!reason.trim()) {
      setErrorMessage("Please enter a reason or clinical handover note for the leave application.")
      return
    }

    setErrorMessage(null)
    setIsSubmitting(true)
    try {
      const res = await HrmsDatabase.applyLeave({
        staffId: selectedStaff.id,
        staffName: selectedStaff.name,
        department: selectedStaff.department,
        leaveType,
        startDate,
        endDate,
        days,
        reason: reason.trim(),
      })

      if (res && res.status === "success") {
        if (onSuccess) onSuccess()
        onClose()
      } else {
        setErrorMessage(res?.message || "Failed to submit leave application.")
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Clinical Header */}
        <div className="px-6 py-4 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-white shadow-2xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                {isSelfService ? "Employee Leave Self-Service" : "Log Staff Leave Application"}
              </h2>
              <p className="text-[11px] text-blue-100">
                {isSelfService ? "Submit your absence request for HR approval" : "HR administrative leave entry"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        {staffList.length > 0 && (
          <div className="flex border-b border-[#DDE2EC] bg-[#F8FAFC] px-6 pt-2">
            <button
              type="button"
              onClick={() => setModalTab("apply")}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                modalTab === "apply"
                  ? "border-[#1B4FD8] text-[#1B4FD8]"
                  : "border-transparent text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Apply for Leave</span>
            </button>
            <button
              type="button"
              onClick={() => setModalTab("history")}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                modalTab === "history"
                  ? "border-[#1B4FD8] text-[#1B4FD8]"
                  : "border-transparent text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>My Leave Status & History</span>
              {(() => {
                const myLeaves = HrmsDatabase.getLeaves().filter(
                  (l) => l.staffId === selectedStaff?.id || l.staffName.toLowerCase() === selectedStaff?.name.toLowerCase()
                )
                if (myLeaves.length === 0) return null
                const pendingCount = myLeaves.filter((l) => l.status === "Pending").length
                return (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1 ${
                      pendingCount > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {myLeaves.length}
                  </span>
                )
              })()}
            </button>
          </div>
        )}

        {staffList.length === 0 ? (
          <div className="p-8 text-center bg-white space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#EFF6FF] text-[#1B4FD8] flex items-center justify-center mx-auto border border-[#BFDBFE]">
              <User className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-[#0F172A]">No Staff Members Registered Yet</h3>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto">
              Before submitting a leave request, hospital employees must first be registered in the system via HR Admin.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-lg shadow-xs cursor-pointer"
            >
              Understood
            </button>
          </div>
        ) : modalTab === "history" ? (
          <div className="p-6 space-y-4 bg-white max-h-[70vh] overflow-y-auto">
            {/* Live Remaining Leave Quotas */}
            {selectedStaff && (
              <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-3 text-xs flex justify-between">
                <div>
                  <span className="text-[#64748B] block text-[10.5px]">Casual Leave (CL)</span>
                  <span className="font-bold text-[#1B4FD8]">
                    {selectedStaff.leaveBalance.casual - selectedStaff.leaveBalance.casualUsed} Left
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10.5px]">Sick Leave (SL)</span>
                  <span className="font-bold text-[#15803D]">
                    {selectedStaff.leaveBalance.sick - selectedStaff.leaveBalance.sickUsed} Left
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10.5px]">Earned Leave (EL)</span>
                  <span className="font-bold text-[#7C3AED]">
                    {selectedStaff.leaveBalance.earned - selectedStaff.leaveBalance.earnedUsed} Left
                  </span>
                </div>
              </div>
            )}

            {(() => {
              const myLeaves = HrmsDatabase.getLeaves().filter(
                (l) => l.staffId === selectedStaff?.id || l.staffName.toLowerCase() === selectedStaff?.name.toLowerCase()
              )

              if (myLeaves.length === 0) {
                return (
                  <div className="py-8 text-center space-y-2">
                    <FileText className="w-8 h-8 text-[#94A3B8] mx-auto" />
                    <h4 className="text-xs font-bold text-[#0F172A]">No Leave Applications Found</h4>
                    <p className="text-[11.5px] text-[#64748B]">You have not submitted any leave requests yet.</p>
                    <button
                      type="button"
                      onClick={() => setModalTab("apply")}
                      className="mt-2 px-3 py-1.5 text-xs font-bold text-[#1B4FD8] bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                    >
                      Apply for Leave Now ➔
                    </button>
                  </div>
                )
              }

              return (
                <div className="space-y-3">
                  {myLeaves.map((l) => (
                    <div key={l.id} className="border border-[#DDE2EC] rounded-xl p-3.5 bg-white shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[#0F172A]">{l.leaveType}</span>
                          <span className="text-[11px] font-mono text-[#64748B]">({l.id})</span>
                        </div>
                        <span
                          className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                            l.status === "Approved"
                              ? "bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]"
                              : l.status === "Pending"
                              ? "bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]"
                              : "bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]"
                          }`}
                        >
                          {l.status === "Approved" && <CheckCircle className="w-3 h-3" />}
                          {l.status === "Pending" && <Clock className="w-3 h-3" />}
                          {l.status === "Rejected" && <AlertCircle className="w-3 h-3" />}
                          <span>{l.status}</span>
                        </span>
                      </div>

                      <div className="bg-[#F8FAFC] p-2.5 rounded-lg text-xs flex justify-between items-center text-[#334155]">
                        <div>
                          <span className="text-[10.5px] text-[#64748B] block">Dates Requested:</span>
                          <span className="font-semibold text-[#0F172A]">
                            {new Date(l.startDate).toLocaleDateString()} ➔ {new Date(l.endDate).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded">
                          {l.days} Day{l.days > 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="text-xs text-[#64748B]">
                        <span className="font-semibold text-[#334155]">Reason: </span>
                        {l.reason}
                      </div>

                      {/* HR Approval Details Banner */}
                      {l.status === "Approved" && (
                        <div className="p-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-[11px] text-[#166534] space-y-1">
                          <div className="flex justify-between items-center font-bold">
                            <span>✓ Approved by HR Administration</span>
                            <span className="font-normal text-[10px] text-[#15803D]">
                              {l.reviewedAt ? new Date(l.reviewedAt).toLocaleDateString() : "Reviewed"}
                            </span>
                          </div>
                          {l.remarks && <div className="text-[10.5px] italic text-[#14532D]">HR Remarks: "{l.remarks}"</div>}
                          <div className="text-[10px] text-[#15803D] font-medium">
                            ✓ Your shift schedule for these dates is automatically marked as "On Leave" in the hospital roster.
                          </div>
                        </div>
                      )}

                      {l.status === "Pending" && (
                        <div className="p-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-[11px] text-[#92400E] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#D97706] flex-shrink-0" />
                          <span>Submitted on {new Date(l.appliedOn).toLocaleDateString()}. Waiting in the HR Administrator review queue.</span>
                        </div>
                      )}

                      {l.status === "Rejected" && (
                        <div className="p-2 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-[11px] text-[#991B1B] space-y-1">
                          <div className="font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-[#DC2626]" />
                            <span>Request Not Approved</span>
                          </div>
                          {l.remarks && <div>Reason: {l.remarks}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}

            <div className="pt-3 border-t border-[#DDE2EC] flex justify-between items-center">
              <button
                type="button"
                onClick={() => setModalTab("apply")}
                className="px-4 py-2 text-xs font-bold text-[#1B4FD8] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
              >
                + Apply for Another Leave
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] bg-white border border-[#DDE2EC] rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}
          {/* Employee Identification: Strictly Locked for Self-Service, Selectable only for HR Admin */}
          {isSelfService && selectedStaff ? (
            <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] text-[#1B4FD8] font-bold text-xs flex items-center justify-center border border-[#BFDBFE]">
                  {selectedStaff.avatarInitials}
                </div>
                <div>
                  <div className="font-bold text-xs text-[#0F172A] flex items-center gap-1.5">
                    <span>{selectedStaff.name}</span>
                    <span className="font-mono text-[10.5px] text-[#64748B]">({selectedStaff.id})</span>
                  </div>
                  <div className="text-[11px] text-[#64748B]">{selectedStaff.designation} • {selectedStaff.department}</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] flex items-center gap-1">
                <Lock className="w-3 h-3" /> Self-Service (Verified)
              </span>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#334155]">
                  Applying Staff Member <span className="text-[#DC2626] font-bold">*</span>
                </label>
                {isSelfService && (
                  <button
                    type="button"
                    onClick={() => setDemoSwitchStaff(false)}
                    className="text-[10.5px] text-[#1B4FD8] font-bold hover:underline cursor-pointer"
                  >
                    Done selecting
                  </button>
                )}
              </div>
              <select
                value={selectedStaffId}
                onChange={(e) => {
                  setSelectedStaffId(e.target.value)
                  if (isSelfService) setDemoSwitchStaff(false)
                }}
                className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id}) — {s.department} [{s.designation}]
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Real-Time Leave Quota Display */}
          {selectedStaff && (
            <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-3 text-xs flex justify-between">
              <div>
                <span className="text-[#64748B] block text-[10.5px]">Casual Leave (CL)</span>
                <span className="font-bold text-[#1B4FD8]">
                  {selectedStaff.leaveBalance.casual - selectedStaff.leaveBalance.casualUsed} Left
                </span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[10.5px]">Sick Leave (SL)</span>
                <span className="font-bold text-[#15803D]">
                  {selectedStaff.leaveBalance.sick - selectedStaff.leaveBalance.sickUsed} Left
                </span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[10.5px]">Earned Leave (EL)</span>
                <span className="font-bold text-[#7C3AED]">
                  {selectedStaff.leaveBalance.earned - selectedStaff.leaveBalance.earnedUsed} Left
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Leave Category <span className="text-[#DC2626] font-bold">*</span>
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as any)}
              className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
            >
              <option value="Casual Leave">Casual Leave (CL)</option>
              <option value="Sick Leave">Sick Leave (SL)</option>
              <option value="Earned Leave">Earned / Annual Leave (EL)</option>
              <option value="Maternity/Paternity">Maternity / Paternity Leave</option>
              <option value="Emergency Leave">Emergency Medical Leave</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                Start Date <span className="text-[#DC2626] font-bold">*</span>
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1">
                End Date <span className="text-[#DC2626] font-bold">*</span>
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
              />
            </div>
          </div>

          <div className="bg-[#EFF6FF] text-[#1B4FD8] border border-[#BFDBFE] rounded-lg px-3.5 py-2 text-xs flex justify-between items-center">
            <span className="font-medium">Total Duration Requested:</span>
            <span className="font-bold font-mono text-sm bg-white px-2.5 py-0.5 rounded border border-[#BFDBFE]">
              {days} Day{days > 1 ? "s" : ""}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Reason for Absence & Handover Notes <span className="text-[#DC2626] font-bold">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="State reason for leave and specify which colleague is covering your shift/ward rounds..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none resize-none placeholder:text-[#94A3B8]"
            />
          </div>

          <div className="pt-3 border-t border-[#DDE2EC] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] bg-white border border-[#DDE2EC] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isSubmitting ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {isSubmitting ? "Submitting Application..." : isSelfService ? "Submit Application to HR" : "Save Leave Application"}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}

// The hooks live in ApplyLeaveModalBody. Returning null before them (as this did) gives
// closed and open renders a different hook count, and React throws "Rendered
// more hooks than during the previous render" the moment the modal opens.
export default function ApplyLeaveModal(props: ApplyLeaveModalProps) {
  if (!props.isOpen) return null
  return <ApplyLeaveModalBody {...props} />
}
