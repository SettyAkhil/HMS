import React, { useState, useEffect } from "react"
import { HrmsDatabase, OutdoorDutyEntry, StaffMember } from "../../services/hrmsDb"
import { Ambulance, Check, X, Plus, Calendar, Clock, MapPin, FileText, CheckCircle2 } from "lucide-react"

interface OutdoorDutyModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OutdoorDutyModal({ isOpen, onClose }: OutdoorDutyModalProps) {
  const [entries, setEntries] = useState<OutdoorDutyEntry[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [isApplying, setIsApplying] = useState(false)

  // Form State
  const [staffId, setStaffId] = useState("")
  const [purpose, setPurpose] = useState("Ambulance Patient Transfer")
  const [destination, setDestination] = useState("")
  const [dutyDate, setDutyDate] = useState(new Date().toISOString().substring(0, 10))
  const [outTime, setOutTime] = useState("09:00 AM")
  const [inTime, setInTime] = useState("03:00 PM")
  const [remarks, setRemarks] = useState("")

  const loadData = async () => {
    const list = await HrmsDatabase.getOutdoorEntries()
    setEntries(list)
    const staff = HrmsDatabase.getStaffList()
    setStaffList(staff)
    if (staff.length > 0 && !staffId) setStaffId(staff[0].id)
  }

  useEffect(() => {
    if (isOpen) loadData()
  }, [isOpen])

  if (!isOpen) return null

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    const member = staffList.find((s) => s.id === staffId)
    await HrmsDatabase.addOutdoorEntry({
      staffId,
      staffName: member?.name || staffId,
      department: member?.department || "General",
      dutyDate,
      purpose,
      destination,
      outTime,
      inTime,
      approvedBy: "Medical Superintendent",
      status: "Approved",
      remarks,
    })
    setIsApplying(false)
    setDestination("")
    setRemarks("")
    await loadData()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <Ambulance className="h-5 w-5 text-rose-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Employee OutDoor Entries (OD Slips)</h3>
              <p className="text-xs text-gray-400">Track staff on ambulance escorts, medical camps, and off-site hospital duties</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Approved OD slips prevent staff from being flagged as Absent in biometric attendance.
          </p>
          <button
            onClick={() => setIsApplying(!isApplying)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isApplying ? "View OD List" : "Issue New OD Slip"}</span>
          </button>
        </div>

        {/* New OD Form */}
        {isApplying ? (
          <form onSubmit={handleApply} className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider text-rose-400">
              New Outdoor Duty Slip
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-medium">Select Staff Member:</label>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.department} • {s.designation})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Purpose of External Duty:</label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="Ambulance Patient Transfer">Ambulance Critical Patient Escort</option>
                  <option value="External Medical Camp">Aarogyasri External Screening Camp</option>
                  <option value="Blood Bank Duty">Blood Bank Emergency Collection</option>
                  <option value="Court Witness / MLC">Court Testimony / Medico-Legal Duty</option>
                  <option value="Bio-Med Equipment Inspection">External Bio-Medical Calibrations</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Destination / Hospital Center:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apollo Jubilee Hills / Gram Panchayat Camp"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Duty Date:</label>
                <input
                  type="date"
                  value={dutyDate}
                  onChange={(e) => setDutyDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Departure (Out Time):</label>
                <input
                  type="text"
                  value={outTime}
                  onChange={(e) => setOutTime(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">Expected Return (In Time):</label>
                <input
                  type="text"
                  value={inTime}
                  onChange={(e) => setInTime(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-400 mb-1 font-medium text-xs">Medical Case Notes / Handover Remarks:</label>
              <textarea
                rows={2}
                placeholder="Patient ECMO monitor / Emergency kit details..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsApplying(false)}
                className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
              >
                Approve & Issue OD Slip
              </button>
            </div>
          </form>
        ) : null}

        {/* Existing OD Records Table */}
        <div className="rounded-xl border border-gray-800 bg-gray-950/60 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-900 text-gray-400 border-b border-gray-800 font-medium">
                <th className="py-2.5 px-3">Slip ID</th>
                <th className="py-2.5 px-3">Staff Member</th>
                <th className="py-2.5 px-3">Purpose</th>
                <th className="py-2.5 px-3">Destination</th>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {entries.map((od) => (
                <tr key={od.id} className="hover:bg-gray-800/30">
                  <td className="py-2.5 px-3 font-mono font-semibold text-rose-400">{od.id}</td>
                  <td className="py-2.5 px-3 font-medium text-white">
                    {od.staffName}
                    <div className="text-[10px] text-gray-400">{od.department}</div>
                  </td>
                  <td className="py-2.5 px-3">{od.purpose}</td>
                  <td className="py-2.5 px-3 text-gray-400">{od.destination}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px]">
                    {od.dutyDate} <br />
                    <span className="text-gray-400">{od.outTime} - {od.inTime}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3" />
                      {od.status}
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
