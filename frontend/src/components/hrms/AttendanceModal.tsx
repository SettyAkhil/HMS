import React, { useState, useEffect } from "react"
import {
  AttendanceRecord,
  StaffMember,
  HrmsDatabase,
  AttendanceStatusType,
} from "../../services/hrmsDb"
import {
  X,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle,
  History,
  Edit2,
  Plus,
} from "lucide-react"

interface AttendanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  recordToEdit?: AttendanceRecord | null
  staffList: StaffMember[]
}

function AttendanceModalBody({
  isOpen,
  onClose,
  onSuccess,
  recordToEdit,
  staffList,
}: AttendanceModalProps) {

  const isEditMode = Boolean(recordToEdit)

  // Form State
  const [selectedStaffId, setSelectedStaffId] = useState(recordToEdit?.staffId || (staffList[0]?.id || ""))
  const [date, setDate] = useState(recordToEdit?.date ? recordToEdit.date.split("T")[0] : new Date().toISOString().split("T")[0])
  const [status, setStatus] = useState<AttendanceStatusType>(recordToEdit?.status || "Present")
  const [clockIn, setClockIn] = useState(recordToEdit?.checkIn || "07:00 AM")
  const [clockOut, setClockOut] = useState(recordToEdit?.checkOut || "03:00 PM")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<any[]>([])

  useEffect(() => {
    if (recordToEdit) {
      setSelectedStaffId(recordToEdit.staffId)
      setDate(recordToEdit.date ? recordToEdit.date.split("T")[0] : "")
      setStatus(recordToEdit.status)
      setClockIn(recordToEdit.checkIn || "")
      setClockOut(recordToEdit.checkOut || "")
      setReason("")
      // Load past corrections
      HrmsDatabase.getAttendanceCorrections(recordToEdit.id).then(setCorrections).catch(() => {})
    } else {
      setSelectedStaffId(staffList[0]?.id || "")
      setDate(new Date().toISOString().split("T")[0])
      setStatus("Present")
      setClockIn("07:00 AM")
      setClockOut("03:00 PM")
      setReason("")
      setCorrections([])
    }
    setError(null)
  }, [recordToEdit, staffList, isOpen])

  const selectedStaff = staffList.find((s) => s.id === selectedStaffId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError(isEditMode ? "Correction reason is mandatory" : "Attendance reason / remarks is required")
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (isEditMode && recordToEdit) {
        await HrmsDatabase.correctAttendance(recordToEdit.id, {
          newClockIn: clockIn || undefined,
          newClockOut: clockOut || undefined,
          newStatus: status,
          correctionReason: reason,
        })
        onSuccess(`Attendance corrected for ${recordToEdit.staffName} (${recordToEdit.date})`)
      } else {
        await HrmsDatabase.markAttendanceManual({
          employeeId: selectedStaffId,
          date,
          status,
          shift: selectedStaff?.shift,
          clockIn: ["Present", "Late", "Half Day"].includes(status) ? clockIn : undefined,
          clockOut: ["Present", "Late", "Half Day"].includes(status) ? clockOut : undefined,
          reason,
        })
        onSuccess(`Manual attendance record created for ${selectedStaff?.name || selectedStaffId}`)
      }
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to save attendance")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-blue-200" />
            <div>
              <h3 className="font-bold text-sm leading-tight">
                {isEditMode ? "Correct Attendance Record" : "Mark Attendance Manually"}
              </h3>
              <p className="text-[11px] text-blue-100">
                {isEditMode
                  ? `Editing: ${recordToEdit?.staffName} (${recordToEdit?.date})`
                  : "Record shift attendance with audit tracking"}
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

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Employee Selector (in manual mode) */}
          {!isEditMode ? (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Select Employee *
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
                required
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id}) · {s.department} · {s.category}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-gray-900">{recordToEdit?.staffName} ({recordToEdit?.staffId})</div>
              <div className="text-[11px] text-[#64748B]">
                Department: {recordToEdit?.department} · Shift: {recordToEdit?.shift}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Current Record: {recordToEdit?.checkIn || "No In"} → {recordToEdit?.checkOut || "No Out"} ({recordToEdit?.status})
              </div>
            </div>
          )}

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Attendance Date *
            </label>
            <input
              type="date"
              value={date}
              disabled={isEditMode}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8] disabled:bg-slate-100 disabled:text-slate-500"
              required
            />
          </div>

          {/* Attendance Status */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Attendance Status *
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AttendanceStatusType)}
              className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
            >
              <option value="Present">Present (Full Day)</option>
              <option value="Late">Late Arrival</option>
              <option value="Half Day">Half Day (4 hrs)</option>
              <option value="Absent">Absent</option>
              <option value="On Leave">On Leave</option>
              <option value="Weekly Off">Weekly Off</option>
              <option value="Holiday">Hospital Holiday</option>
              <option value="Missed Punch">Missed Punch</option>
            </select>
          </div>

          {/* Times if status warrants punch times */}
          {["Present", "Late", "Half Day", "Missed Punch"].includes(status) && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Actual Check-In Time
                </label>
                <input
                  type="text"
                  placeholder="e.g. 07:25 AM"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-[#DDE2EC] rounded-lg bg-white focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  Actual Check-Out Time
                </label>
                <input
                  type="text"
                  placeholder="e.g. 03:30 PM"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-[#DDE2EC] rounded-lg bg-white focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>
            </div>
          )}

          {/* Reason / Remarks */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              {isEditMode ? "Correction Reason / Remarks *" : "Reason / Remarks *"}
            </label>
            <textarea
              rows={2}
              placeholder={isEditMode ? "e.g. Doctor was attending emergency surgery; adjusted check-out" : "e.g. Biometric device offline; verified by Nursing Supervisor"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8]"
              required
            />
          </div>

          {/* Past Corrections History if available */}
          {corrections.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
              <div className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
                <History className="w-3 h-3 text-[#1B4FD8]" />
                <span>Correction Audit History ({corrections.length})</span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1.5 text-[10.5px]">
                {corrections.map((c) => (
                  <div key={c.id} className="p-1.5 bg-white border border-slate-200 rounded text-slate-700">
                    <div>
                      {c.old_status} ({c.old_clock_in || "--"} → {c.old_clock_out || "--"}) ➔ <strong>{c.new_status} ({c.new_clock_in || "--"} → {c.new_clock_out || "--"})</strong>
                    </div>
                    <div className="text-[#64748B] italic">"{c.correction_reason}"</div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">By {c.corrected_by} at {new Date(c.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{loading ? "Saving..." : isEditMode ? "Save Correction" : "Save Attendance"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// The hooks live in AttendanceModalBody. Returning null before them (as this did) gives
// closed and open renders a different hook count, and React throws "Rendered
// more hooks than during the previous render" the moment the modal opens.
export default function AttendanceModal(props: AttendanceModalProps) {
  if (!props.isOpen) return null
  return <AttendanceModalBody {...props} />
}
