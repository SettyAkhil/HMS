import React, { useState, useEffect } from "react"
import { HrmsDatabase, OvertimeRecord, StaffMember } from "../../services/hrmsDb"
import { Clock, Plus, CheckCircle2, AlertCircle, DollarSign, Check } from "lucide-react"

interface OvertimeRegisterModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OvertimeRegisterModal({ isOpen, onClose }: OvertimeRegisterModalProps) {
  const [records, setRecords] = useState<OvertimeRecord[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [isAdding, setIsAdding] = useState(false)

  // Form State
  const [staffId, setStaffId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10))
  const [extraHours, setExtraHours] = useState("3")
  const [hourlyRate, setHourlyRate] = useState("250")
  const [reason, setReason] = useState("Relieving Staff Absent (Ward Surge)")

  const loadData = async () => {
    const list = await HrmsDatabase.getOvertimeRecords()
    setRecords(list)
    const staff = HrmsDatabase.getStaffList()
    setStaffList(staff)
    if (staff.length > 0 && !staffId) setStaffId(staff[0].id)
  }

  useEffect(() => {
    if (isOpen) loadData()
  }, [isOpen])

  if (!isOpen) return null

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const member = staffList.find((s) => s.id === staffId)
    await HrmsDatabase.addOvertimeRecord({
      staffId,
      staffName: member?.name || staffId,
      department: member?.department || "General",
      date,
      extraHours: parseFloat(extraHours),
      hourlyRate: parseFloat(hourlyRate),
      reason,
      status: "Approved",
    })
    setIsAdding(false)
    await loadData()
  }

  const totalOTHours = records.reduce((acc, r) => acc + r.extraHours, 0)
  const totalOTPpaout = records.reduce((acc, r) => acc + r.totalAmount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Employee OT (Overtime) Register</h3>
              <p className="text-xs text-gray-400">Manage extra hours worked by ward boys, nurses, and emergency staff</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        {/* Top Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10">
            <p className="text-[11px] text-indigo-300 uppercase font-semibold">Total Approved OT Hours</p>
            <h4 className="text-2xl font-bold text-white mt-1">{totalOTHours} hrs</h4>
          </div>
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <p className="text-[11px] text-emerald-300 uppercase font-semibold">Total OT Disbursement</p>
            <h4 className="text-2xl font-bold text-emerald-400 mt-1">₹{totalOTPpaout.toLocaleString()}</h4>
          </div>
        </div>

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            OT hours are audited and linked directly into the monthly payroll calculation.
          </p>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAdding ? "View OT List" : "Log New OT Hours"}</span>
          </button>
        </div>

        {/* New OT Form */}
        {isAdding && (
          <form onSubmit={handleAdd} className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider text-indigo-400">
              Log Overtime Hours
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-medium">Select Staff Member:</label>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.department} • {s.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Duty Date:</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Extra Hours Worked:</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  value={extraHours}
                  onChange={(e) => setExtraHours(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Hourly OT Rate (₹):</label>
                <input
                  type="number"
                  step="10"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-400 mb-1 font-medium text-xs">Reason for Overtime:</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Emergency OT Case surgery extension">Emergency OT Case surgery extension</option>
                <option value="Relieving Staff Absent (Ward Surge)">Relieving Staff Absent (Ward Surge)</option>
                <option value="Mass Casualty / Disaster Emergency">Mass Casualty / Disaster Emergency</option>
                <option value="Bio-Med Maintenance Night Shutdown">Bio-Med Maintenance Night Shutdown</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                Approve & Record OT
              </button>
            </div>
          </form>
        )}

        {/* Existing OT Records Table */}
        <div className="rounded-xl border border-gray-800 bg-gray-950/60 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-900 text-gray-400 border-b border-gray-800 font-medium">
                <th className="py-2.5 px-3">Record ID</th>
                <th className="py-2.5 px-3">Staff Member</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Hours</th>
                <th className="py-2.5 px-3">Rate</th>
                <th className="py-2.5 px-3">Total Amount</th>
                <th className="py-2.5 px-3">Reason</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/30">
                  <td className="py-2.5 px-3 font-mono font-semibold text-indigo-400">{r.id}</td>
                  <td className="py-2.5 px-3 font-medium text-white">
                    {r.staffName}
                    <div className="text-[10px] text-gray-400">{r.department}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px]">{r.date}</td>
                  <td className="py-2.5 px-3 font-bold text-white">{r.extraHours} hrs</td>
                  <td className="py-2.5 px-3 font-mono">₹{r.hourlyRate}/hr</td>
                  <td className="py-2.5 px-3 font-bold text-emerald-400">₹{r.totalAmount.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-gray-400 text-[11px]">{r.reason}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        r.status === "Approved"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
