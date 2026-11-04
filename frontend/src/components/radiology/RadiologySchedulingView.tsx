import React, { useState, useMemo, useEffect } from "react"
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Plus,
  User,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  FileText,
  AlertCircle,
} from "lucide-react"
import {
  UniversalRadiologyDb,
  RadiologyAppointment,
  RadiologySuite,
} from "../../services/universalRadiologyDb"
import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "../../services/radiologyWorkflowDb"
import { RADIOLOGY_MODALITIES } from "../../services/radiologyTariffsData"
import { getCanonicalRadiologyModality } from "../../utils/testClassifier"

interface RadiologySchedulingViewProps {
  initialStudyId?: string | null
  onNavigateToWorklist?: () => void
}

export default function RadiologySchedulingView({
  initialStudyId,
  onNavigateToWorklist,
}: RadiologySchedulingViewProps) {
  const [tick, setTick] = useState(0)
  const [activeDate, setActiveDate] = useState(() => new Date().toISOString().split("T")[0])
  const [activeViewMode, setActiveViewMode] = useState<"daily" | "suites" | "list">("daily")
  const [modalityFilter, setModalityFilter] = useState("all")
  const [suiteFilter, setSuiteFilter] = useState("all")

  // Modal State
  const [showBookModal, setShowBookModal] = useState(false)
  const [bookingForm, setBookingForm] = useState({
    studyId: initialStudyId || "",
    patientName: "",
    umr: "",
    studyName: "",
    modality: "X-Ray",
    scheduledDate: new Date().toISOString().split("T")[0],
    scheduledTime: "10:00",
    durationMinutes: 30,
    room: "Room 101",
    suiteId: "suite_xr_1",
    technicianName: "Alex Rivera, RT(R)",
    priority: "Routine" as "Routine" | "Urgent" | "STAT",
    prepInstructions: "Standard preparation instructions",
    notes: "",
  })

  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  useEffect(() => {
    const unsub1 = UniversalRadiologyDb.subscribe(() => setTick((t) => t + 1))
    const unsub2 = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const appointments = useMemo(() => UniversalRadiologyDb.getAppointments(), [tick])
  const suites = useMemo(() => UniversalRadiologyDb.getSuites(), [tick])
  const studies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  // Pre-fill booking form if initialStudyId was provided
  useEffect(() => {
    if (initialStudyId) {
      const match = studies.find((s) => s.id === initialStudyId)
      if (match) {
        setBookingForm((prev) => ({
          ...prev,
          studyId: match.id,
          patientName: match.patient,
          umr: match.umr || match.mrn || "",
          studyName: match.study,
          modality: getCanonicalRadiologyModality(match),
          room: match.room || "Room 101",
          priority: match.priority === "STAT" ? "STAT" : (match.priority as string) === "Urgent" ? "Urgent" : "Routine",
        }))
        setShowBookModal(true)
      }
    }
  }, [initialStudyId, studies])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Filtered appointments for selected date and filters - Chronologically sorted
  const filteredAppointments = useMemo(() => {
    const list = appointments.filter((appt) => {
      if (activeViewMode !== "list" && appt.scheduledDate !== activeDate) return false
      if (modalityFilter !== "all" && !appt.modality.toLowerCase().includes(modalityFilter.toLowerCase())) return false
      if (suiteFilter !== "all" && appt.suiteId !== suiteFilter) return false
      return true
    })

    return list.sort((a, b) => {
      const timeA = new Date(`${a.scheduledDate}T${a.scheduledTime || "00:00"}`).getTime()
      const timeB = new Date(`${b.scheduledDate}T${b.scheduledTime || "00:00"}`).getTime()
      if (timeA !== timeB) return timeA - timeB // Chronological (earliest first)
      return (a.id || "").localeCompare(b.id || "")
    })
  }, [appointments, activeDate, activeViewMode, modalityFilter, suiteFilter])

  // Time Slots 8:00 AM to 6:00 PM (30 min increments)
  const timeSlots = useMemo(() => {
    const slots: string[] = []
    for (let h = 8; h <= 18; h++) {
      slots.push(`${h < 10 ? "0" + h : h}:00`)
      if (h < 18) slots.push(`${h < 10 ? "0" + h : h}:30`)
    }
    return slots
  }, [])

  // Check for Booking Conflicts
  const checkConflict = (suiteRoom: string, date: string, time: string, duration: number) => {
    const startHour = parseInt(time.split(":")[0], 10)
    const startMin = parseInt(time.split(":")[1], 10)
    const startTotal = startHour * 60 + startMin
    const endTotal = startTotal + duration

    return appointments.find((a) => {
      if (a.room !== suiteRoom || a.scheduledDate !== date || a.status === "Cancelled") return false
      const aHour = parseInt(a.scheduledTime.split(":")[0], 10)
      const aMin = parseInt(a.scheduledTime.split(":")[1], 10)
      const aStartTotal = aHour * 60 + aMin
      const aEndTotal = aStartTotal + a.durationMinutes
      return Math.max(startTotal, aStartTotal) < Math.min(endTotal, aEndTotal)
    })
  }

  const handleSaveAppointment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bookingForm.patientName.trim() || !bookingForm.studyName.trim()) {
      showToast("Please provide patient name and study name.", "error")
      return
    }

    // Conflict detection unless STAT priority
    const conflict = checkConflict(
      bookingForm.room,
      bookingForm.scheduledDate,
      bookingForm.scheduledTime,
      bookingForm.durationMinutes
    )

    if (conflict && bookingForm.priority !== "STAT") {
      showToast(
        `Slot Conflict: ${conflict.room} is already booked by ${conflict.patientName} (${conflict.studyName}) at ${conflict.scheduledTime}. Choose another slot or room.`,
        "error"
      )
      return
    }

    try {
      UniversalRadiologyDb.createAppointment({
        studyId: bookingForm.studyId || `RAD-GEN-${Date.now()}`,
        patientName: bookingForm.patientName.trim(),
        umr: bookingForm.umr.trim() || "UMR-NEW",
        studyName: bookingForm.studyName.trim(),
        modality: bookingForm.modality,
        scheduledDate: bookingForm.scheduledDate,
        scheduledTime: bookingForm.scheduledTime,
        durationMinutes: bookingForm.durationMinutes,
        room: bookingForm.room,
        suiteId: bookingForm.suiteId,
        technicianName: bookingForm.technicianName,
        status: "Scheduled",
        priority: bookingForm.priority,
        prepInstructions: bookingForm.prepInstructions,
        notes: bookingForm.notes,
      })

      showToast(`✓ Examination successfully scheduled for ${bookingForm.patientName} in ${bookingForm.room}.`, "success")
      setShowBookModal(false)
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to book appointment", "error")
    }
  }

  const handleCancelAppointment = (id: string, patient: string) => {
    const reason = prompt(`Reason for cancelling appointment for ${patient}:`)
    if (!reason) return
    UniversalRadiologyDb.updateAppointmentStatus(id, "Cancelled", reason)
    showToast(`Appointment for ${patient} cancelled.`, "info")
    setTick((t) => t + 1)
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3 rounded-md text-[13px] font-semibold border flex items-center justify-between shadow-md transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : toastMessage.type === "error"
              ? "bg-red-50 border-red-300 text-red-900"
              : "bg-blue-50 border-blue-300 text-blue-900"
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="cursor-pointer ml-3 font-bold">✕</button>
        </div>
      )}

      {/* ── Header Controls ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#1B4FD8]" />
              <span>Examination Scheduling & Room Allocations</span>
            </h3>
            <p className="text-[12px] text-[#64748B]">Manage gantry slots, technician assignments, and emergency overrides</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex border border-[#CBD5E1] rounded overflow-hidden text-[12px] font-semibold bg-white">
              <button
                onClick={() => setActiveViewMode("daily")}
                className={`px-3 py-1.5 transition-colors cursor-pointer ${
                  activeViewMode === "daily" ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Daily Schedule
              </button>
              <button
                onClick={() => setActiveViewMode("suites")}
                className={`px-3 py-1.5 transition-colors cursor-pointer ${
                  activeViewMode === "suites" ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Suites View
              </button>
              <button
                onClick={() => setActiveViewMode("list")}
                className={`px-3 py-1.5 transition-colors cursor-pointer ${
                  activeViewMode === "list" ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                All Bookings ({appointments.length})
              </button>
            </div>

            <button
              onClick={() => setShowBookModal(true)}
              className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white px-3.5 py-1.5 rounded text-[12.5px] font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule Slot</span>
            </button>
          </div>
        </div>

        {/* ── Date Navigator & Filters Bar ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const prev = new Date(activeDate)
                prev.setDate(prev.getDate() - 1)
                setActiveDate(prev.toISOString().split("T")[0])
              }}
              className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
            </button>

            <input
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
              className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1 rounded text-[12.5px] font-bold text-slate-900 focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
            />

            <button
              onClick={() => {
                const next = new Date(activeDate)
                next.setDate(next.getDate() + 1)
                setActiveDate(next.toISOString().split("T")[0])
              }}
              className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            </button>

            <button
              onClick={() => setActiveDate(new Date().toISOString().split("T")[0])}
              className="text-[12px] text-[#1B4FD8] hover:underline font-bold ml-1 cursor-pointer"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Modality Filter */}
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value)}
              className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1 rounded text-[12px] text-slate-700 font-semibold cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
            >
              <option value="all">All Modalities</option>
              {RADIOLOGY_MODALITIES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {/* Suite Filter */}
            <select
              value={suiteFilter}
              onChange={(e) => setSuiteFilter(e.target.value)}
              className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1 rounded text-[12px] text-slate-700 font-semibold cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
            >
              <option value="all">All Rooms & Suites</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.room})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Daily Schedule View ── */}
      {activeViewMode === "daily" && (
        <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-[#DDE2EC] flex items-center justify-between text-[12px]">
            <span className="font-bold text-slate-700">
              Schedule for {new Date(activeDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
            </span>
            <span className="text-slate-500 font-mono">{filteredAppointments.length} Booked Appointments</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {timeSlots.map((time) => {
              const matchedAppts = filteredAppointments.filter((a) => a.scheduledTime === time)
              return (
                <div key={time} className="flex items-start p-3 hover:bg-slate-50/50 transition-colors">
                  <div className="w-20 font-mono text-[12px] font-bold text-slate-500 shrink-0 pt-1">
                    {time}
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {matchedAppts.length === 0 ? (
                      <span className="text-[11.5px] text-slate-300 italic py-1">Available Slot</span>
                    ) : (
                      matchedAppts.map((appt) => (
                        <div
                          key={appt.id}
                          className={`p-2.5 border rounded-md text-[12px] shadow-2xs flex flex-col justify-between ${
                            appt.priority === "STAT"
                              ? "bg-red-50/80 border-red-200 text-red-900"
                              : appt.status === "Cancelled"
                              ? "bg-slate-100 border-slate-200 text-slate-500 opacity-60"
                              : "bg-blue-50/70 border-blue-200 text-blue-900"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between font-bold">
                              <span>{appt.patientName}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-current">
                                {appt.room}
                              </span>
                            </div>
                            <div className="text-[11.5px] font-semibold mt-0.5">{appt.studyName}</div>
                            <div className="text-[10.5px] opacity-75 mt-1">
                              {appt.modality} • {appt.durationMinutes} mins • {appt.technicianName}
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-1 border-t border-current/10 text-[10.5px]">
                            <span className="font-bold uppercase">{appt.status}</span>
                            {appt.status !== "Cancelled" && (
                              <button
                                onClick={() => handleCancelAppointment(appt.id, appt.patientName)}
                                className="text-red-700 hover:underline cursor-pointer font-semibold"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Suites Allocation Grid View ── */}
      {activeViewMode === "suites" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suites.map((suite) => {
            const suiteAppts = filteredAppointments.filter((a) => a.room === suite.room || a.suiteId === suite.id)
            return (
              <div key={suite.id} className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden flex flex-col">
                <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-[13px]">{suite.name}</h4>
                    <span className="text-[11px] text-slate-300 font-mono">{suite.room} • {suite.modality}</span>
                  </div>
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                      suite.status === "Available"
                        ? "bg-emerald-500 text-white"
                        : suite.status === "In Use"
                        ? "bg-blue-500 text-white"
                        : "bg-amber-500 text-white"
                    }`}
                  >
                    {suite.status}
                  </span>
                </div>

                <div className="p-3 flex-1 overflow-y-auto max-h-[260px] space-y-2">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Today's Bookings ({suiteAppts.length})
                  </div>
                  {suiteAppts.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-[12px]">
                      No scheduled slots for this suite today.
                    </div>
                  ) : (
                    suiteAppts.map((a) => (
                      <div key={a.id} className="p-2 border rounded bg-slate-50 text-[12px]">
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span>{a.scheduledTime} ({a.durationMinutes}m)</span>
                          <span className="text-[10.5px] text-[#1B4FD8]">{a.patientName}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">{a.studyName}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── All Bookings List View ── */}
      {activeViewMode === "list" && (
        <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
          <table className="w-full text-left text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
                <th className="py-3 px-3">Date & Time</th>
                <th className="py-3 px-4">Patient Name & UMR</th>
                <th className="py-3 px-3">Study & Modality</th>
                <th className="py-3 px-3">Room / Suite</th>
                <th className="py-3 px-3">Technician</th>
                <th className="py-3 px-2 text-center">Priority</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No bookings found matching selected filters.
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-mono text-[11.5px] text-slate-700 whitespace-nowrap">
                      {appt.scheduledDate} {appt.scheduledTime}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {appt.patientName}
                      <span className="block text-[11px] font-mono text-slate-500 font-normal">UMR: {appt.umr}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-800">{appt.studyName}</span>
                      <span className="block text-[11px] text-[#1B4FD8]">{appt.modality}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">{appt.room}</td>
                    <td className="py-3 px-3 text-slate-700">{appt.technicianName}</td>
                    <td className="py-3 px-2 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                        appt.priority === "STAT" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"
                      }`}>
                        {appt.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        appt.status === "Cancelled" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                      }`}>
                        {appt.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {appt.status !== "Cancelled" && (
                        <button
                          onClick={() => handleCancelAppointment(appt.id, appt.patientName)}
                          className="text-red-600 hover:underline text-[11.5px] font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Schedule Booking Modal ── */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#CBD5E1] rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Schedule Examination Appointment</h3>
              <button onClick={() => setShowBookModal(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSaveAppointment} className="p-5 space-y-3.5 text-[12.5px]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Patient Name *</label>
                  <input
                    required
                    type="text"
                    value={bookingForm.patientName}
                    onChange={(e) => setBookingForm({ ...bookingForm, patientName: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full p-2 border rounded text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">UMR Number</label>
                  <input
                    type="text"
                    value={bookingForm.umr}
                    onChange={(e) => setBookingForm({ ...bookingForm, umr: e.target.value })}
                    placeholder="e.g. UMR-8021"
                    className="w-full p-2 border rounded font-mono text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Examination Name *</label>
                  <input
                    required
                    type="text"
                    value={bookingForm.studyName}
                    onChange={(e) => setBookingForm({ ...bookingForm, studyName: e.target.value })}
                    placeholder="e.g. CT Scan Brain Plain"
                    className="w-full p-2 border rounded text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Modality</label>
                  <select
                    value={bookingForm.modality}
                    onChange={(e) => setBookingForm({ ...bookingForm, modality: e.target.value })}
                    className="w-full p-2 border rounded text-slate-900 font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    {RADIOLOGY_MODALITIES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Date *</label>
                  <input
                    required
                    type="date"
                    value={bookingForm.scheduledDate}
                    onChange={(e) => setBookingForm({ ...bookingForm, scheduledDate: e.target.value })}
                    className="w-full p-2 border rounded text-slate-900 font-mono focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Time *</label>
                  <select
                    value={bookingForm.scheduledTime}
                    onChange={(e) => setBookingForm({ ...bookingForm, scheduledTime: e.target.value })}
                    className="w-full p-2 border rounded text-slate-900 font-mono font-bold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    {timeSlots.map((ts) => (
                      <option key={ts} value={ts}>{ts}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Duration</label>
                  <select
                    value={bookingForm.durationMinutes}
                    onChange={(e) => setBookingForm({ ...bookingForm, durationMinutes: Number(e.target.value) })}
                    className="w-full p-2 border rounded text-slate-900 focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Room / Suite</label>
                  <select
                    value={bookingForm.room}
                    onChange={(e) => setBookingForm({ ...bookingForm, room: e.target.value })}
                    className="w-full p-2 border rounded text-slate-900 font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    {suites.map((s) => (
                      <option key={s.id} value={s.room}>{s.name} ({s.room})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={bookingForm.priority}
                    onChange={(e) => setBookingForm({ ...bookingForm, priority: e.target.value as any })}
                    className="w-full p-2 border rounded text-slate-900 font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    <option value="Routine">Routine</option>
                    <option value="Urgent">Urgent</option>
                    <option value="STAT">STAT Emergency (Override)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Patient Preparation Instructions</label>
                <input
                  type="text"
                  value={bookingForm.prepInstructions}
                  onChange={(e) => setBookingForm({ ...bookingForm, prepInstructions: e.target.value })}
                  placeholder="e.g. 4-hour fasting, remove metallic items"
                  className="w-full p-2 border rounded text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBookModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-slate-700 font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded font-bold cursor-pointer shadow-sm"
                >
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
