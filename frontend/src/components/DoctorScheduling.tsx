import React, { useState, useMemo, useEffect } from "react"
import { HrmsDatabase, StaffMember, LeaveRequest } from "../services/hrmsDb"
import {
  Calendar,
  User,
  Clock,
  Plus,
  X,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Building2,
  Search,
  ArrowLeft,
  Phone,
  Mail,
  ShieldCheck,
} from "lucide-react"

type ShiftCategory = "Outpatient" | "Inpatient" | "Off Duty"

interface Shift {
  id: string
  doctorId?: string
  dayIndex: number
  startHour: number
  durationHours: number
  category: ShiftCategory
  type: string
  details: string
}

const DEFAULT_SHIFTS: Shift[] = []

export interface DoctorSchedulingProps {
  initialDoctorId?: string
  onSelectDoctor?: (doctorId: string) => void
  embedded?: boolean
}

export default function DoctorScheduling({
  initialDoctorId,
  onSelectDoctor,
  embedded = false,
}: DoctorSchedulingProps) {
  // Real registered doctors from HRMS database
  const [registeredDoctors, setRegisteredDoctors] = useState<StaffMember[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(initialDoctorId || "")
  const [searchDoctor, setSearchDoctor] = useState("")

  // Shift & Leave records
  const [shifts, setShifts] = useState<Shift[]>(DEFAULT_SHIFTS)
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeViewMode, setActiveViewMode] = useState<"Day" | "Week" | "Month">("Week")
  const [weekOffset, setWeekOffset] = useState(0)

  // Shift form state
  const [formCategory, setFormCategory] = useState<ShiftCategory>("Outpatient")
  const [formType, setFormType] = useState("OPD Consults")
  const [formDay, setFormDay] = useState(0)
  const [formStart, setFormStart] = useState(9)
  const [formDuration, setFormDuration] = useState(2)
  const [formDetails, setFormDetails] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const loadData = () => {
    const docs = HrmsDatabase.getStaffList().filter((s) => s.category === "Doctor")
    setRegisteredDoctors(docs)
    setAllLeaves(HrmsDatabase.getLeaves())
  }

  useEffect(() => {
    loadData()
    const unsubscribe = HrmsDatabase.subscribe(() => {
      loadData()
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (initialDoctorId) {
      setSelectedDoctorId(initialDoctorId)
    }
  }, [initialDoctorId])

  const currentDoctor = useMemo(() => {
    if (!selectedDoctorId) return null
    return (
      registeredDoctors.find((d) => d.id === selectedDoctorId) ||
      registeredDoctors.find((d) => d.name === selectedDoctorId) ||
      null
    )
  }, [registeredDoctors, selectedDoctorId])

  const doctorLeaves = useMemo(() => {
    if (!currentDoctor) return []
    return allLeaves.filter(
      (l) => l.staffId === currentDoctor.id || l.staffName === currentDoctor.name
    )
  }, [allLeaves, currentDoctor])

  const handleSelectDoctor = (docId: string) => {
    setSelectedDoctorId(docId)
    if (onSelectDoctor) {
      onSelectDoctor(docId)
    }
  }

  const handleAddShift = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    // 1. Validation: Prevent clinical scheduling when medical license is expired
    if (currentDoctor?.licenseExpiry) {
      const expDate = new Date(currentDoctor.licenseExpiry)
      if (!isNaN(expDate.getTime()) && expDate < new Date()) {
        setFormError(
          `Regulatory Block: Dr. ${currentDoctor.name}'s medical license expired on ${currentDoctor.licenseExpiry}. Clinical scheduling is strictly barred until license renewal.`
        )
        return
      }
    }

    // 2. Validation: Prevent scheduling employee on approved leave
    const approvedLeave = doctorLeaves.find((l) => l.status === "Approved")
    if (approvedLeave && formCategory !== "Off Duty") {
      setFormError(
        `Leave Conflict: Dr. ${currentDoctor?.name} has approved leave (${approvedLeave.startDate} to ${approvedLeave.endDate}) for ${approvedLeave.leaveType}. Cannot assign clinical duty.`
      )
      return
    }

    // 3. Validation: Prevent overlapping shifts and simultaneous OPD / Surgery assignments
    const newStart = formStart
    const newEnd = formStart + formDuration
    const conflict = shifts.find((s) => {
      if (s.doctorId && currentDoctor?.id && s.doctorId !== currentDoctor.id) return false
      if (s.dayIndex !== formDay) return false
      const sStart = s.startHour
      const sEnd = s.startHour + s.durationHours
      return newStart < sEnd && newEnd > sStart
    })

    if (conflict) {
      setFormError(
        `Conflict Block: Dr. ${currentDoctor?.name} already has "${conflict.type}" assigned from ${conflict.startHour}:00 to ${
          conflict.startHour + conflict.durationHours
        }:00 on this day. Overlapping shifts and concurrent OPD/Surgery assignments are not permitted.`
      )
      return
    }

    const newShift: Shift = {
      id: Math.random().toString(36).substr(2, 9),
      doctorId: currentDoctor?.id,
      dayIndex: formDay,
      startHour: formStart,
      durationHours: formDuration,
      category: formCategory,
      type: formType,
      details: formDetails,
    }
    setShifts([...shifts, newShift])
    setShowAddModal(false)
    setFormDetails("")
    setFormError(null)
  }

  const handleReviewLeave = async (leaveId: string, status: "Approved" | "Rejected") => {
    await HrmsDatabase.reviewLeave(leaveId, status, "HR Administrator", `Timetable Review: ${status}`)
    setAllLeaves(HrmsDatabase.getLeaves())
  }

  const getShiftStyles = (category: ShiftCategory, type: string) => {
    if (category === "Off Duty") {
      return {
        bg: "bg-[#F1F5F9]",
        border: "border-[#CBD5E1]",
        text: "text-[#475569]",
        badge: "bg-slate-200 text-slate-700",
      }
    }
    if (category === "Outpatient") {
      if (type.includes("Tele")) {
        return {
          bg: "bg-[#FAF5FF]",
          border: "border-[#E9D5FF]",
          text: "text-[#7E22CE]",
          badge: "bg-[#F3E8FF] text-[#7E22CE]",
        }
      }
      return {
        bg: "bg-[#EFF6FF]",
        border: "border-[#BFDBFE]",
        text: "text-[#1E3A8A]",
        badge: "bg-[#DBEAFE] text-[#1E3A8A]",
      }
    }
    // Inpatient / Surgical
    if (type.includes("Surge") || type.includes("OR")) {
      return {
        bg: "bg-[#FFFBEB]",
        border: "border-[#FDE68A]",
        text: "text-[#92400E]",
        badge: "bg-[#FEF3C7] text-[#92400E]",
      }
    }
    return {
      bg: "bg-[#F0FDF4]",
      border: "border-[#BBF7D0]",
      text: "text-[#15803D]",
      badge: "bg-[#DCFCE7] text-[#15803D]",
    }
  }

  // Filtered doctors for selection screen
  const filteredDoctors = useMemo(() => {
    if (!searchDoctor.trim()) return registeredDoctors
    const q = searchDoctor.toLowerCase()
    return registeredDoctors.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.department.toLowerCase().includes(q) ||
        d.designation.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q)
    )
  }, [registeredDoctors, searchDoctor])

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 1: NO DOCTOR SELECTED YET -> RENDER DOCTOR SELECTION VIEW
  // ──────────────────────────────────────────────────────────────────────────
  if (!currentDoctor) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto w-full space-y-6">
          {/* Header Banner */}
          <div className="bg-white border border-[#DDE2EC] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#1B4FD8] flex items-center justify-center flex-shrink-0 shadow-xs">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">
                  Doctor Clinical Timetable & Shift Rostering
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Select any physician below to view their weekly timetable, consultation blocks, surgical roster, and leave requests.
                </p>
              </div>
            </div>

            {/* Quick Search */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search physician by name, dept..."
                value={searchDoctor}
                onChange={(e) => setSearchDoctor(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-[#DDE2EC] rounded-xl bg-white focus:outline-none focus:border-[#1B4FD8] transition-colors"
              />
            </div>
          </div>

          {/* Doctor Selection Grid */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <span>Hospital Physicians ({filteredDoctors.length})</span>
                <span className="text-[11px] font-normal text-[#64748B]">Click a doctor to load calendar</span>
              </div>
            </div>

            {filteredDoctors.length === 0 ? (
              <div className="bg-white border border-dashed border-[#DDE2EC] rounded-2xl p-12 text-center">
                <Stethoscope className="w-12 h-12 text-[#94A3B8] mx-auto mb-3 opacity-60" />
                <h3 className="text-sm font-bold text-gray-800">No Doctors Found</h3>
                <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
                  {searchDoctor
                    ? `No registered physicians match "${searchDoctor}". Try clearing your search.`
                    : "No doctors have been registered yet. Add a new doctor in the Staff Directory to generate their clinical timetable."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDoctors.map((doc) => {
                  const pendingDocLeaves = allLeaves.filter(
                    (l) => (l.staffId === doc.id || l.staffName === doc.name) && l.status === "Pending"
                  )

                  return (
                    <div
                      key={doc.id}
                      onClick={() => handleSelectDoctor(doc.id)}
                      className="bg-white border border-[#DDE2EC] hover:border-[#1B4FD8] hover:shadow-md rounded-2xl p-5 transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        {/* Top Badge & Duty Status */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1B4FD8] border border-[#BFDBFE]">
                            {doc.department}
                          </span>
                          <span
                            className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              doc.dutyStatus === "On Duty"
                                ? "bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]"
                                : "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                doc.dutyStatus === "On Duty" ? "bg-[#16A34A]" : "bg-slate-400"
                              }`}
                            />
                            {doc.dutyStatus}
                          </span>
                        </div>

                        {/* Doctor Avatar & Identity */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1B4FD8] to-[#1E40AF] text-white font-bold text-sm flex items-center justify-center shadow-xs flex-shrink-0">
                            {doc.avatarInitials || "DR"}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-[#0F172A] group-hover:text-[#1B4FD8] transition-colors truncate">
                              {doc.name}
                            </h4>
                            <p className="text-[11.5px] text-[#64748B] truncate">{doc.designation}</p>
                          </div>
                        </div>

                        {/* Schedule & Contact Details */}
                        <div className="text-[11.5px] text-[#475569] space-y-1.5 py-2.5 border-t border-[#F1F5F9]">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                            <span className="font-medium text-slate-800">{doc.shift.split("(")[0]}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#94A3B8]" />
                            <span>Reg No: <span className="font-mono text-slate-700">{doc.licenseNumber}</span></span>
                          </div>
                        </div>

                        {pendingDocLeaves.length > 0 && (
                          <div className="mt-2 text-[11px] font-semibold text-[#B45309] bg-[#FEF3C7] border border-[#FDE68A] px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{pendingDocLeaves.length} Pending Leave Request(s)</span>
                          </div>
                        )}
                      </div>

                      {/* Select Action Button */}
                      <div className="pt-3 border-t border-[#F1F5F9] mt-3">
                        <button
                          type="button"
                          className="w-full py-2 bg-[#F8FAFC] group-hover:bg-[#1B4FD8] text-[#1B4FD8] group-hover:text-white border border-[#DDE2EC] group-hover:border-[#1B4FD8] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>View Weekly Timetable</span>
                          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 2: DOCTOR IS SELECTED -> RENDER FULL WEEKLY TIMETABLE CALENDAR
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-hidden relative">
      {/* Sub-header / Top Navigation Bar for Selected Doctor */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3 flex flex-wrap items-center justify-between gap-3 flex-shrink-0 shadow-2xs">
        {/* Left: Back button & Doctor info */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedDoctorId("")}
            className="px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:text-[#0F172A] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Return to physician directory"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Select Another Doctor</span>
          </button>

          <div className="h-5 w-[1px] bg-[#DDE2EC] hidden sm:block" />

          {/* Quick Doctor Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B] font-medium hidden sm:inline">Active Doctor:</span>
            <select
              value={currentDoctor.id}
              onChange={(e) => handleSelectDoctor(e.target.value)}
              className="text-xs font-bold text-gray-900 bg-white border border-[#DDE2EC] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
            >
              {registeredDoctors.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name} ({doc.department})
                </option>
              ))}
            </select>
          </div>

          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
              currentDoctor.dutyStatus === "On Duty"
                ? "bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]"
                : "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                currentDoctor.dutyStatus === "On Duty" ? "bg-[#16A34A]" : "bg-slate-400"
              }`}
            />
            {currentDoctor.dutyStatus}
          </span>
        </div>

        {/* Right: Roster actions & Add Shift */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="h-8 px-3.5 bg-[#1B4FD8] hover:bg-[#1541B8] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Doctor Shift</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 overflow-auto p-5 flex flex-col lg:flex-row gap-5 max-w-7xl mx-auto w-full">
        {/* Left Column: Doctor Profile & Real Leave Requests */}
        <div className="w-full lg:w-80 flex flex-col gap-5 flex-shrink-0">
          {/* Physician Card */}
          <div className="bg-white border border-[#DDE2EC] rounded-2xl shadow-2xs p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1B4FD8] to-[#1E40AF] text-white font-bold text-base flex items-center justify-center shadow-xs flex-shrink-0">
                {currentDoctor.avatarInitials}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[#0F172A] truncate">{currentDoctor.name}</h3>
                <p className="text-xs text-[#1B4FD8] font-semibold">{currentDoctor.department}</p>
                <p className="text-[11px] text-[#64748B] truncate">{currentDoctor.designation}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs py-3 border-t border-b border-[#F1F5F9]">
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">Staff ID</span>
                <span className="font-mono font-semibold text-gray-800">{currentDoctor.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">Shift Type</span>
                <span className="font-medium text-gray-800">{currentDoctor.shift.split("(")[0]}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">License Reg</span>
                <span className="font-mono text-[#1B4FD8] font-semibold">{currentDoctor.licenseNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">Standard Slot</span>
                <span className="font-semibold text-gray-800">15 mins</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">Max Daily OPD</span>
                <span className="font-semibold text-gray-800">32 Patients</span>
              </div>
            </div>

            <div className="mt-3 pt-1 flex items-center justify-between text-[11px] text-[#64748B]">
              <span>Annual Leave Quota:</span>
              <span className="font-bold text-gray-800">
                {currentDoctor.leaveBalance
                  ? (currentDoctor.leaveBalance.casual || 0) +
                    (currentDoctor.leaveBalance.sick || 0) +
                    (currentDoctor.leaveBalance.earned || 0)
                  : 0}{" "}
                Days Remaining
              </span>
            </div>
          </div>

          {/* Pending Leave Requests for this Doctor */}
          <div className="bg-white border border-[#DDE2EC] rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-[#DDE2EC] bg-[#F8FAFC] flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1B4FD8]" />
                <span>Leave Status for {currentDoctor.name.split(" ")[1] || "Doctor"}</span>
              </h4>
              <span className="text-[10.5px] font-bold px-1.5 py-0.2 rounded-full bg-[#EFF6FF] text-[#1B4FD8]">
                {doctorLeaves.length}
              </span>
            </div>

            <div className="p-4 space-y-3 text-xs max-h-72 overflow-y-auto">
              {doctorLeaves.length === 0 ? (
                <div className="text-center py-6 text-[#94A3B8]">
                  <CheckCircle className="w-8 h-8 text-[#22C55E] mx-auto mb-2 opacity-80" />
                  <p className="font-medium text-xs text-gray-700">No Leave Requests</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">Doctor is available for regular clinical timetable.</p>
                </div>
              ) : (
                doctorLeaves.map((leave) => (
                  <div
                    key={leave.id}
                    className={`border rounded-xl p-3 text-xs ${
                      leave.status === "Pending"
                        ? "border-[#FDE68A] bg-[#FFFBEB]"
                        : leave.status === "Approved"
                        ? "border-[#BBF7D0] bg-[#F0FDF4]"
                        : "border-[#FECDD3] bg-[#FFF1F2]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-900">{leave.leaveType}</span>
                      <span
                        className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                          leave.status === "Pending"
                            ? "bg-[#FEF3C7] text-[#92400E]"
                            : leave.status === "Approved"
                            ? "bg-[#DCFCE7] text-[#15803D]"
                            : "bg-[#FFE4E6] text-[#BE123C]"
                        }`}
                      >
                        {leave.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#475569] mb-1.5">
                      📅 {leave.startDate} to {leave.endDate} ({leave.days} day{leave.days > 1 ? "s" : ""})
                    </div>
                    {leave.reason && (
                      <div className="text-[11px] text-[#64748B] italic mb-2">"{leave.reason}"</div>
                    )}

                    {leave.status === "Pending" && (
                      <div className="flex gap-2 pt-2 border-t border-amber-200/60">
                        <button
                          onClick={() => handleReviewLeave(leave.id, "Approved")}
                          className="flex-1 py-1 bg-[#15803D] hover:bg-[#166534] text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Approve Leave
                        </button>
                        <button
                          onClick={() => handleReviewLeave(leave.id, "Rejected")}
                          className="flex-1 py-1 bg-white border border-[#DDE2EC] hover:bg-slate-50 text-gray-700 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Weekly Timetable Calendar */}
        <div className="flex-1 bg-white border border-[#DDE2EC] rounded-2xl shadow-2xs flex flex-col overflow-hidden min-h-[580px]">
          {/* Calendar Header with navigation and view toggles */}
          <div className="px-5 py-3.5 border-b border-[#DDE2EC] flex flex-wrap justify-between items-center gap-3 bg-[#F8FAFC]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="w-7 h-7 rounded-lg border border-[#DDE2EC] bg-white flex items-center justify-center text-[#64748B] hover:text-gray-900 hover:bg-slate-50 transition-colors cursor-pointer"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1B4FD8]" />
                <span>
                  {weekOffset === 0
                    ? "August 24 - August 28, 2026"
                    : weekOffset > 0
                    ? `Week +${weekOffset} (Aug - Sep 2026)`
                    : `Week ${weekOffset} (August 2026)`}
                </span>
              </h3>
              <button
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="w-7 h-7 rounded-lg border border-[#DDE2EC] bg-white flex items-center justify-center text-[#64748B] hover:text-gray-900 hover:bg-slate-50 transition-colors cursor-pointer"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-[11px] text-[#1B4FD8] font-bold hover:underline ml-1"
                >
                  Current Week
                </button>
              )}
            </div>

            {/* View switcher buttons */}
            <div className="flex gap-1 bg-[#F1F5F9] p-1 rounded-xl border border-[#DDE2EC]">
              {(["Day", "Week", "Month"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setActiveViewMode(mode)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeViewMode === mode
                      ? "bg-white text-[#1B4FD8] shadow-xs font-bold"
                      : "text-[#64748B] hover:text-gray-900"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {shifts.filter((s) => !s.doctorId || s.doctorId === currentDoctor.id).length === 0 && (
            <div className="bg-[#EFF6FF] border-b border-[#BFDBFE] px-5 py-2 flex items-center justify-between text-xs text-[#1E40AF]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#1B4FD8]" />
                <span>
                  No clinical shifts rostered for {currentDoctor.name} this week.
                  Click <strong>+ Add Doctor Shift</strong> to schedule OPD slots or ward rounds.
                </span>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-2.5 py-1 bg-[#1B4FD8] text-white font-bold rounded-lg hover:bg-[#1541B8] transition-colors text-[11px] cursor-pointer"
              >
                + Schedule Shift
              </button>
            </div>
          )}

          {/* Calendar Timetable Grid */}
          <div className="flex-1 overflow-auto bg-gray-50 flex">
            {/* Time Column (08:00 to 18:00) */}
            <div className="w-16 border-r border-[#DDE2EC] bg-white flex flex-col text-[11px] text-[#94A3B8] font-mono items-center pt-10 select-none flex-shrink-0">
              {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => (
                <div key={h} className="h-16 relative w-full text-center">
                  <span className="absolute -top-2.5 left-0 right-0">{h < 10 ? `0${h}:00` : `${h}:00`}</span>
                </div>
              ))}
            </div>

            {/* 5-Day Columns (Mon through Fri) */}
            <div className="flex-1 grid grid-cols-5 divide-x divide-[#DDE2EC] min-w-[600px]">
              {[
                { name: "Mon 24", dayIndex: 0 },
                { name: "Tue 25", dayIndex: 1 },
                { name: "Wed 26", dayIndex: 2 },
                { name: "Thu 27", dayIndex: 3 },
                { name: "Fri 28", dayIndex: 4 },
              ].map(({ name, dayIndex }) => (
                <div key={dayIndex} className="flex flex-col relative min-w-[120px]">
                  {/* Day Header */}
                  <div className="h-10 border-b border-[#DDE2EC] bg-white flex items-center justify-center text-xs font-bold text-gray-800 sticky top-0 z-10 shadow-2xs">
                    {name}
                  </div>

                  {/* Hour slots background grid */}
                  <div className="relative h-[704px] bg-white bg-[linear-gradient(#F1F5F9_1px,transparent_1px)] bg-[size:100%_64px]">
                    {/* Render shifts for this doctor and day */}
                    {shifts
                      .filter(
                        (s) =>
                          s.dayIndex === dayIndex &&
                          (!s.doctorId || s.doctorId === currentDoctor.id),
                      )
                      .map((shift) => {
                        const top = (shift.startHour - 8) * 64
                        const height = shift.durationHours * 64
                        const styles = getShiftStyles(shift.category, shift.type)

                        if (shift.category === "Off Duty") {
                          return (
                            <div
                              key={shift.id}
                              className={`absolute left-1 right-1 border rounded-xl flex items-center justify-center shadow-2xs ${styles.bg} ${styles.border}`}
                              style={{ top, height }}
                            >
                              <div className={`text-xs font-bold ${styles.text} rotate-[-90deg] whitespace-nowrap tracking-wider uppercase`}>
                                {shift.type}
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={shift.id}
                            className={`absolute left-1 right-1 border rounded-xl p-2.5 shadow-2xs flex flex-col justify-between overflow-hidden ${styles.bg} ${styles.border} group`}
                            style={{ top, height }}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${styles.badge}`}>
                                  {shift.category}
                                </span>
                                <button
                                  className="text-[#94A3B8] hover:text-[#EF4444] opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setShifts(shifts.filter((s) => s.id !== shift.id))
                                  }}
                                  title="Remove shift slot"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className={`text-xs font-bold ${styles.text} mt-1 leading-tight`}>
                                {shift.type}
                              </div>
                              {shift.details && (
                                <div className={`text-[10.5px] ${styles.text} opacity-80 mt-0.5 line-clamp-2`}>
                                  {shift.details}
                                </div>
                              )}
                            </div>

                            <div className="text-[10px] font-mono font-medium text-slate-500 mt-1">
                              {shift.startHour}:00 - {shift.startHour + shift.durationHours}:00
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: Add Doctor Shift ────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-full overflow-hidden flex flex-col border border-[#DDE2EC] animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#DDE2EC] flex justify-between items-center bg-[#F8FAFC]">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Add Doctor Shift Block</h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Roster clinical hours for {currentDoctor.name}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-lg text-[#94A3B8] hover:text-gray-900 hover:bg-[#E2E8F0] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddShift} className="p-6 flex flex-col gap-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
                  <span className="text-xs font-semibold leading-relaxed">{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Shift Category
                </label>
                <div className="flex gap-2">
                  {(["Outpatient", "Inpatient", "Off Duty"] as ShiftCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setFormCategory(cat)
                        setFormType(
                          cat === "Outpatient"
                            ? "OPD Consults"
                            : cat === "Inpatient"
                            ? "Ward Rounds (3N)"
                            : "OFF DUTY"
                        )
                      }}
                      className={`flex-1 py-2 border rounded-xl text-xs font-bold transition-all ${
                        formCategory === cat
                          ? "bg-[#1B4FD8] border-[#1B4FD8] text-white shadow-xs"
                          : "bg-white border-[#DDE2EC] text-gray-700 hover:bg-[#F8FAFC]"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {formCategory !== "Off Duty" && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Shift Activity Type
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full border border-[#DDE2EC] rounded-xl bg-white text-xs px-3 py-2 focus:outline-none focus:border-[#1B4FD8]"
                  >
                    {formCategory === "Outpatient" ? (
                      <>
                        <option>OPD Consults</option>
                        <option>Teleconsults</option>
                        <option>Specialty Clinic</option>
                        <option>Follow-up Reviews</option>
                      </>
                    ) : (
                      <>
                        <option>Ward Rounds (3N)</option>
                        <option>Surgery (OR 2)</option>
                        <option>ICU Cover</option>
                        <option>Emergency On-Call</option>
                      </>
                    )}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Day of Week
                  </label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(Number(e.target.value))}
                    className="w-full border border-[#DDE2EC] rounded-xl bg-white text-xs px-3 py-2 focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value={0}>Monday (Aug 24)</option>
                    <option value={1}>Tuesday (Aug 25)</option>
                    <option value={2}>Wednesday (Aug 26)</option>
                    <option value={3}>Thursday (Aug 27)</option>
                    <option value={4}>Friday (Aug 28)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Start Time
                  </label>
                  <select
                    value={formStart}
                    onChange={(e) => setFormStart(Number(e.target.value))}
                    className="w-full border border-[#DDE2EC] rounded-xl bg-white text-xs px-3 py-2 focus:outline-none focus:border-[#1B4FD8]"
                  >
                    {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => (
                      <option key={h} value={h}>
                        {h < 10 ? `0${h}:00` : `${h}:00`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Duration (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formDuration}
                  onChange={(e) => setFormDuration(Number(e.target.value))}
                  className="w-full border border-[#DDE2EC] rounded-xl bg-white text-xs px-3 py-2 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              {formCategory !== "Off Duty" && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Shift Details & Room Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Room 104, 8 slots reserved, ICU Floor"
                    value={formDetails}
                    onChange={(e) => setFormDetails(e.target.value)}
                    className="w-full border border-[#DDE2EC] rounded-xl bg-white text-xs px-3 py-2 focus:outline-none focus:border-[#1B4FD8]"
                  >
                  </input>
                </div>
              )}

              <div className="flex gap-2.5 pt-3 mt-2 border-t border-[#DDE2EC]">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setFormError(null)
                  }}
                  className="flex-1 py-2 bg-white border border-[#DDE2EC] hover:bg-slate-50 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#1B4FD8] hover:bg-[#1541B8] text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                >
                  Assign Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
