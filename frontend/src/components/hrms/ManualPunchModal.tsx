import React, { useState, useEffect } from "react"
import { HrmsDatabase, StaffMember } from "../../services/hrmsDb"
import { Fingerprint, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react"

interface ManualPunchModalProps {
  isOpen: boolean
  onClose: () => void
  onPunchAdded?: () => void
}

export default function ManualPunchModal({ isOpen, onClose, onPunchAdded }: ManualPunchModalProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffId, setStaffId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10))
  const [time, setTime] = useState("07:05")
  const [direction, setDirection] = useState<"IN" | "OUT">("IN")
  const [reason, setReason] = useState("Biometric Machine Fingerprint Unreadable")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const list = HrmsDatabase.getStaffList()
      setStaffList(list)
      if (list.length > 0 && !staffId) setStaffId(list[0].id)
      setSuccess(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const staff = staffList.find((s) => s.id === staffId)
      await HrmsDatabase.recordManualPunch({
        staffId,
        staffName: staff?.name || staffId,
        department: staff?.department || "General",
        date,
        time,
        direction,
        reason,
      })
      setSuccess(true)
      if (onPunchAdded) onPunchAdded()
      setTimeout(() => {
        onClose()
      }, 1000)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Manual Punch Log Adjustment</h3>
              <p className="text-xs text-gray-400">Supervisor override for failed scan or forgotten card</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-semibold text-white">Manual Punch Recorded</h4>
            <p className="text-xs text-gray-400">Audited under HR Supervisor Override Log</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block text-gray-400 mb-1 font-medium">Select Staff Member:</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.department} • {s.designation})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1 font-medium">Punch Date:</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Punch Time (HH:MM):</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-400 mb-1 font-medium">Punch Direction:</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="IN">Clock IN (Start of Shift)</option>
                <option value="OUT">Clock OUT (End of Shift)</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-1 font-medium">Supervisor Authorization Reason:</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Biometric Machine Fingerprint Unreadable">Biometric Scanner Fingerprint Unreadable</option>
                <option value="Forgot RFID Staff Badge / Card">Forgot RFID Staff Badge / Card</option>
                <option value="Direct Emergency Patient Admission Admission Call">Direct Emergency Patient Admission Call</option>
                <option value="Biometric Device Network Cable Offline">Biometric Device Network Cable Offline</option>
                <option value="Approved Off-Duty Recall">Approved Off-Duty Emergency Recall</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                {isSubmitting ? "Saving..." : "Record Manual Punch"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
