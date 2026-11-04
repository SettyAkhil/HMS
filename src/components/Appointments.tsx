import React, { useState, useEffect, useMemo } from "react"
import toast from "react-hot-toast"
import { StatusBadge, Btn, Card } from "./shared"
import { Icon } from "./icons"
import { db, DBOPEncounter } from "../services/db"
import {
  bookAppointment,
  type AppointmentBooking,
} from "../services/appointmentBooking"
import {
  getDoctorMaster,
  pickDoctorForSpecialty,
  availabilityOf,
  getDoctorByName,
  doctorsForSpecialty,
  MasterDoctor,
} from "../services/doctorMaster"
import PatientJourneyModal from "./PatientJourneyModal"
import MessageDeliveryStatus from "./messaging/MessageDeliveryStatus"
import { normalizeDoctorName } from "../services/doctorPortalDb"

const DEPARTMENTS = [
  "All Departments",
  "Cardiology",
  "Orthopedics",
  "General Medicine",
  "Pediatrics",
  "Neurology",
  "Dermatology",
  "ENT",
  "Emergency / Casualty",
]

function getDynamicWeekDays(): { label: string; dateStr: string; isToday: boolean }[] {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const distanceToMon = (dayOfWeek + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - distanceToMon)

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  const result = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dayName = dayNames[i]
    const monthName = monthNames[d.getMonth()]
    const dateNum = d.getDate()
    const isToday = d.toDateString() === now.toDateString()
    result.push({
      label: `${dayName}\n${monthName} ${dateNum}`,
      dateStr: d.toISOString().split("T")[0],
      isToday,
    })
  }
  return result
}

const SYMPTOM_RULES: { pattern: RegExp ;specialty: string ;urgency: string }[] = [
  {
    pattern:
      /\b(chest|heart|palpitat|breathless|cardio|angina|tachycardia|ecg|hypertens|bp\b|pressure)\b/i,
    specialty: "Cardiology",
    urgency: "High - Same Day",
  },
  {
    pattern:
      /\b(knee|bone|fractur|joint|sprain|ortho|spine|back pain|arthritis|ligament|swollen ankle|shoulder)\b/i,
    specialty: "Orthopedics",
    urgency: "Moderate",
  },
  {
    pattern:
      /\b(pregnan|prenatal|period|menstrua|gynec|pelvic|ovary|uterus|delivery|obstetric)\b/i,
    specialty: "Gynecology",
    urgency: "Routine",
  },
  {
    pattern:
      /\b(child|infant|baby|paediatric|pediatric|toddler|newborn|immunis|immuniz|vaccin)\b/i,
    specialty: "Pediatrics",
    urgency: "Moderate",
  },
  {
    pattern:
      /\b(ear|nose|throat|sinus|tonsil|hearing|deaf|vertigo|snor|hoarse)\b/i,
    specialty: "ENT",
    urgency: "Routine",
  },
  {
    pattern: /\b(diabet|sugar|insulin|thyroid|hba1c|glycem)\b/i,
    specialty: "Diabetology",
    urgency: "Moderate",
  },
  {
    pattern: /\b(tumor|tumour|cancer|oncolog|lump|biopsy|malignan)\b/i,
    specialty: "Surgical Oncology",
    urgency: "High - Same Day",
  },
  {
    pattern:
      /\b(hernia|appendic|gallbladder|piles|fistula|abscess|surgical)\b/i,
    specialty: "General Surgery",
    urgency: "Moderate",
  },
  {
    pattern: /\b(scan|x-ray|xray|mri|ct\b|ultrasound|imaging|radiolog)\b/i,
    specialty: "Radiology",
    urgency: "Routine",
  },
  {
    pattern:
      /\b(fever|cold|cough|weakness|fatigue|infect|body pain|chill|viral|malaise|typhoid|malaria|headache|vomit|diarrhea|nausea|dizz)\b/i,
    specialty: "General Medicine",
    urgency: "Moderate",
  },
]

const detectDepartmentFromSymptoms = (
  text: string,
  load: (doctorName: string) => number,
): {
  dept: string
  doc: string
  urgency: string
  onRequest: boolean
  note?: string
} | null => {
  if (!text || !text.trim()) return null

  const matched = SYMPTOM_RULES.find((r) => r.pattern.test(text))
  const specialty = matched?.specialty || "General Medicine"
  const urgency = matched?.urgency || "Routine"

  const direct = pickDoctorForSpecialty(specialty, load)
  if (direct) {
    return {
      dept: specialty,
      doc: direct.name,
      urgency,
      onRequest: availabilityOf(direct).onRequest,
    }
  }

  const fallback = pickDoctorForSpecialty("General Medicine", load)
  if (!fallback) return null
  return {
    dept: "General Medicine",
    doc: fallback.name,
    urgency,
    onRequest: availabilityOf(fallback).onRequest,
    note: `No bookable ${specialty} consultant on the current doctor master -- routed to General Medicine.`,
  }
}

export function AppointmentBookingModal({
  initialEncounter,
  onClose,
  onSchedule,
  onGoToBilling,
}: {
  initialEncounter?: DBOPEncounter | null
  onClose: () => void
  onSchedule: (appt: any) => void
  onGoToBilling?: () => void
}) {
  const [bookingMode, setBookingMode] = useState<"direct" | "ai">("direct")
  const [registryType, setRegistryType] = useState<"OP" | "IP">("OP")
  const [patient, setPatient] = useState(initialEncounter?.patientName || "")
  const [age, setAge] = useState(
    initialEncounter?.age ? String(initialEncounter.age) : "",
  )
  const [gender, setGender] = useState(initialEncounter?.sex || "Male")
  const [phone, setPhone] = useState(initialEncounter?.phone || "")
  const [complaint, setComplaint] = useState(
    initialEncounter?.chiefComplaint || "",
  )
  const [symptoms, setSymptoms] = useState("")
  const [symptomDuration, setSymptomDuration] = useState("")
  const [symptomSeverity, setSymptomSeverity] = useState("moderate")
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Direct Doctor & Specialty Selection
  const allDoctors = getDoctorMaster().filter((d) => d.verified)
  const allSpecialties = Array.from(
    new Set(allDoctors.map((d) => d.specialty).filter(Boolean)),
  ) as string[]

  const [selectedSpecialty, setSelectedSpecialty] = useState<string>(
    initialEncounter?.dept && allSpecialties.includes(initialEncounter.dept)
      ? initialEncounter.dept
      : allSpecialties[0] || "General Medicine",
  )
  const [selectedDoctorName, setSelectedDoctorName] = useState<string>("")

  const doctorsForSelectedDept = doctorsForSpecialty(selectedSpecialty)

  useEffect(() => {
    if (doctorsForSelectedDept.length > 0) {
      const normInitial = normalizeDoctorName(initialEncounter?.assignedDoctor)
      const match =
        doctorsForSelectedDept.find(
          (d) => normalizeDoctorName(d.name) === normInitial,
        ) || doctorsForSelectedDept[0]
      setSelectedDoctorName(match.name)
    } else {
      setSelectedDoctorName("")
    }
  }, [selectedSpecialty])

  const [result, setResult] = useState<{
    dept: string
    doc: string
    urgency: string
    onRequest?: boolean
    note?: string
  } | null>(null)

  // Auto-set result in direct mode
  useEffect(() => {
    if (bookingMode === "direct" && selectedSpecialty && selectedDoctorName) {
      const docObj = getDoctorByName(selectedDoctorName)
      setResult({
        dept: selectedSpecialty,
        doc: selectedDoctorName,
        urgency: "Routine",
        onRequest: docObj ? availabilityOf(docObj).onRequest : false,
      })
    }
  }, [bookingMode, selectedSpecialty, selectedDoctorName])

  const handleAnalyzeAI = () => {
    if (!symptoms && !complaint) return
    setIsAnalyzing(true)
    setResult(null)

    setTimeout(() => {
      const combined = `${complaint} ${symptoms}`
      const open = db
        .getEncounters()
        .filter(
          (e) =>
            e.status !== "OP Completed" &&
            e.status !== "Consultation Completed",
        )
      const load = (doctorName: string) => {
        const normTarget = normalizeDoctorName(doctorName)
        return open.filter((e) => {
          const encDocNorm = normalizeDoctorName(e.assignedDoctor || (e as any).doctorAssigned)
          return encDocNorm === normTarget || (encDocNorm.length >= 4 && normTarget.length >= 4 && (encDocNorm.includes(normTarget) || normTarget.includes(encDocNorm)))
        }).length
      }

      const res = detectDepartmentFromSymptoms(combined, load)
      if (!res) {
        setIsAnalyzing(false)
        return
      }
      if (registryType === "IP") {
        res.urgency =
          res.urgency === "Routine" ? "Ward Admission" : "ICU Admission"
      }
      setResult(res)
      setIsAnalyzing(false)
    }, 800)
  }

  const handleSchedule = () => {
    if (!patient.trim()) {
      toast.error("Please enter patient full name.")
      return
    }

    let scheduleResult = result
    if (!scheduleResult) {
      if (selectedSpecialty && selectedDoctorName) {
        scheduleResult = {
          dept: selectedSpecialty,
          doc: selectedDoctorName,
          urgency: "Routine",
        }
      } else {
        toast.error("Please select a specialty and doctor, or run AI symptom triage.")
        return
      }
    }

    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`

    onSchedule({
      encounterId: initialEncounter?.id,
      time,
      patient: patient.trim(),
      age: parseInt(age) || 30,
      sex: gender,
      phone,
      complaint: complaint || symptoms || "OP Evaluation",
      dept: scheduleResult.dept,
      doctor: scheduleResult.doc,
      registryType,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-none shadow-2xl border-2 border-[#CBD5E1] w-full max-w-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#DDE2EC] flex items-center justify-between bg-[#0F172A] text-white">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 text-white">
              <span>📅</span> Doctor Appointment & Consultation Booking
            </h2>
            <p className="text-[12px] text-slate-300">
              {initialEncounter
                ? `Booking appointment for registered patient: ${initialEncounter.patientName} (${initialEncounter.umr})`
                : "Book doctor appointment directly or use AI symptom triage"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Mode Switcher Banner */}
        <div className="bg-[#EFF6FF] border-b border-blue-200 px-6 py-2.5 flex items-center justify-between gap-4">
          <span className="text-[12px] font-bold text-[#1B4FD8]">
            Booking Method:
          </span>
          <div className="flex bg-white p-1 rounded-none border border-blue-200 gap-1">
            <button
              type="button"
              onClick={() => setBookingMode("direct")}
              className={`px-3 py-1 text-[12px] font-bold rounded-none transition-colors cursor-pointer ${
                bookingMode === "direct"
                  ? "bg-[#1B4FD8] text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              👨‍⚕️ Direct Doctor Roster
            </button>
            <button
              type="button"
              onClick={() => setBookingMode("ai")}
              className={`px-3 py-1 text-[12px] font-bold rounded-none transition-colors cursor-pointer ${
                bookingMode === "ai"
                  ? "bg-[#1B4FD8] text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              ✨ AI Symptom Triage
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Patient Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                Patient Full Name*
              </label>
              <input
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
                className="w-full h-9 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
                placeholder="e.g. Suresh Bapatla"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="w-full h-9 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
                placeholder="e.g. 9876543210"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                Age
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full h-9 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
                placeholder="27"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                Gender
              </label>
              <select
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value as "Male" | "Female" | "Other")
                }
                className="w-full h-9 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
              >
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                Registry Type
              </label>
              <div className="flex bg-[#F0F2F5] p-0.5 rounded-none h-9">
                <button
                  type="button"
                  onClick={() => setRegistryType("OP")}
                  className={`flex-1 text-[11px] font-bold rounded-none ${
                    registryType === "OP"
                      ? "bg-white text-[#1B4FD8]"
                      : "text-[#64748B]"
                  }`}
                >
                  OP Clinic
                </button>
                <button
                  type="button"
                  onClick={() => setRegistryType("IP")}
                  className={`flex-1 text-[11px] font-bold rounded-none ${
                    registryType === "IP"
                      ? "bg-[#1B4FD8] text-white"
                      : "text-[#64748B]"
                  }`}
                >
                  IP Admission
                </button>
              </div>
            </div>
          </div>

          {/* MODE 1: DIRECT DOCTOR SELECTION */}
          {bookingMode === "direct" && (
            <div className="bg-[#F8FAFC] border border-[#DDE2EC] p-4 rounded-none space-y-4">
              <h3 className="text-[13px] font-bold text-gray-900 border-b border-[#DDE2EC] pb-2 flex items-center justify-between">
                <span>👨‍⚕️ Select Medical Specialty & Attending Doctor</span>
                <span className="text-[11px] text-[#64748B] font-normal">
                  {allDoctors.length} doctors on roster
                </span>
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    Specialty / Department*
                  </label>
                  <select
                    value={selectedSpecialty}
                    onChange={(e) => setSelectedSpecialty(e.target.value)}
                    className="w-full h-10 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    {allSpecialties.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    Attending Doctor*
                  </label>
                  <select
                    value={selectedDoctorName}
                    onChange={(e) => setSelectedDoctorName(e.target.value)}
                    className="w-full h-10 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    {doctorsForSelectedDept.map((doc) => (
                      <option key={doc.id} value={doc.name}>
                        {doc.name} ({doc.qualification}) — {doc.room} [
                        {doc.section}]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected Doctor Summary Pill */}
              {selectedDoctorName && (
                <div className="bg-white p-3 border border-blue-200 rounded-none flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-bold text-gray-900">
                      {selectedDoctorName}
                    </div>
                    <div className="text-[11.5px] text-[#64748B]">
                      {getDoctorByName(selectedDoctorName)?.qualification} •{" "}
                      {getDoctorByName(selectedDoctorName)?.room} (
                      {getDoctorByName(selectedDoctorName)?.section} Consultant)
                    </div>
                  </div>
                  <span className="bg-[#DCFCE7] text-[#15803D] text-[11px] font-bold px-2.5 py-1 rounded-none border border-emerald-200">
                    Available for Booking
                  </span>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: AI SYMPTOM TRIAGE */}
          {bookingMode === "ai" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                  Chief Complaint / Symptoms Narrative*
                </label>
                <textarea
                  rows={2}
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  className="w-full bg-white border border-[#DDE2EC] rounded-none p-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
                  placeholder="e.g. Sharp chest pain, difficulty breathing, sweating since yesterday..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    Symptom Duration
                  </label>
                  <input
                    value={symptomDuration}
                    onChange={(e) => setSymptomDuration(e.target.value)}
                    className="w-full h-9 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
                    placeholder="e.g. 2 days"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    Severity
                  </label>
                  <select
                    value={symptomSeverity}
                    onChange={(e) => setSymptomSeverity(e.target.value)}
                    className="w-full h-9 bg-white border border-[#DDE2EC] rounded-none px-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleAnalyzeAI}
                disabled={isAnalyzing || (!symptoms && !complaint)}
                className="w-full h-10 bg-[#EFF6FF] text-[#1B4FD8] font-bold text-[13px] rounded-none border border-[#BFDBFE] hover:bg-[#DBEAFE] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isAnalyzing ? (
                  <div className="w-4 h-4 border-2 border-[#1B4FD8] border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>✨</span>
                )}
                {isAnalyzing
                  ? "Analyzing Symptoms with AI..."
                  : "Run AI Specialty Recommendation"}
              </button>
            </div>
          )}

          {result && (
            <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-none p-4">
              <h3 className="text-[12.5px] font-bold text-gray-900 mb-2 border-b border-[#DDE2EC] pb-1.5 flex items-center justify-between">
                <span>Appointment Allocation Confirmation</span>
                <span className="text-[11px] font-mono text-[#1B4FD8]">
                  {result.dept}
                </span>
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] text-[#64748B] mb-0.5">
                    Assigned Specialty
                  </div>
                  <div className="text-[13px] font-semibold text-[#1B4FD8]">
                    {result.dept}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B] mb-0.5">
                    Assigned Physician
                  </div>
                  <div className="text-[13px] font-semibold text-gray-900">
                    {result.doc}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B] mb-0.5">
                    Consultation Priority
                  </div>
                  <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none inline-block border border-emerald-200">
                    {result.urgency}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-[#DDE2EC] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12px] text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200">
            <span>📱</span>
            <span>
              <strong>Patient Alert:</strong> the confirmation goes to <strong>{phone || "patient"}</strong> by SMS &amp; WhatsApp after booking; this screen then shows whether it was sent.
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#CBD5E1] bg-white text-gray-700 text-[12.5px] font-bold hover:bg-gray-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSchedule}
              className="px-4 py-2 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <span>⚡</span> Confirm &amp; Send Patient Alert
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getEncounterDateStr(enc: DBOPEncounter): string {
  if (enc.date && /^\d{4}-\d{2}-\d{2}$/.test(enc.date)) return enc.date
  if (enc.createdAt && enc.createdAt.includes("T")) return enc.createdAt.split("T")[0]
  const ts = enc.timestamps?.arrival || enc.timestamps?.registration || enc.registrationTime
  if (ts) {
    if (ts.includes("T")) return ts.split("T")[0]
    if (/^\d{4}-\d{2}-\d{2}/.test(ts)) return ts.substring(0, 10)
  }
  if (enc.umr) {
    try {
      const pt = db.getPatientByUmr(enc.umr)
      if (pt?.createdAt && pt.createdAt.includes("T")) {
        return pt.createdAt.split("T")[0]
      }
    } catch {}
  }
  return new Date().toISOString().split("T")[0]
}

export default function Appointments({
  initialEncounterId,
  onSelect,
  onGoToBilling,
  onNavigateToOPWorkflow,
  onNavigateToDoctorWorkflow,
}: {
  initialEncounterId?: string | null
  onSelect?: () => void
  onGoToBilling?: () => void
  onNavigateToOPWorkflow?: (encId: string, step?: number) => void
  onNavigateToDoctorWorkflow?: (encId: string) => void
}) {
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const [selectedDept, setSelectedDept] = useState<string>("All Departments")
  const [searchQuery, setSearchQuery] = useState("")
  const [view, setView] = useState<"day" | "week" | "month" | "list">("day")

  const [justBooked, setJustBooked] = useState<{
    encounterId: string
    name: string
    umr: string
    doctor: string
    dept: string
    room: string
    phone?: string
    token?: string
    time?: string
  } | null>(null)
  const weekDays = useMemo(() => getDynamicWeekDays(), [])
  const todayIdx = useMemo(() => {
    const idx = weekDays.findIndex((d) => d.isToday)
    return idx >= 0 ? idx : 0
  }, [weekDays])

  const [activeDay, setActiveDay] = useState(todayIdx)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [targetEncounter, setTargetEncounter] = useState<DBOPEncounter | null>(
    null,
  )

  // Journey Modal state
  const [selectedJourneyEncounter, setSelectedJourneyEncounter] =
    useState<DBOPEncounter | null>(null)

  // Open modal automatically if initialEncounterId passed
  useEffect(() => {
    if (initialEncounterId) {
      const enc = db.getEncounterById(initialEncounterId)
      if (enc) {
        setTargetEncounter(enc)
        setIsModalOpen(true)
      }
    }
  }, [initialEncounterId])

  // Sync with live database encounters
  useEffect(() => {
    const syncWithDb = () => {
      const dbEncs = db.getEncounters()
      setEncounters(dbEncs)
    }

    syncWithDb()
    const unsub = db.subscribe(syncWithDb)
    return () => {
      unsub()
    }
  }, [])

  const selectedDateStr = useMemo(
    () => weekDays[activeDay]?.dateStr || new Date().toISOString().split("T")[0],
    [weekDays, activeDay],
  )
  const selectedMonthStr = useMemo(
    () => selectedDateStr.substring(0, 7),
    [selectedDateStr],
  )
  const weekDateStrs = useMemo(
    () => new Set(weekDays.map((w) => w.dateStr)),
    [weekDays],
  )

  // Filtered encounters based on department, search query, and day/week/month view
  const filteredEncounters = useMemo(() => {
    return encounters.filter((enc) => {
      // Dept filter
      if (selectedDept !== "All Departments") {
        const d1 = (enc.dept || "").toLowerCase()
        const d2 = selectedDept.toLowerCase()
        if (!d1.includes(d2) && !d2.includes(d1)) return false
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const name = (enc.patientName || "").toLowerCase()
        const umr = (enc.umr || "").toLowerCase()
        const op = (enc.opNumber || "").toLowerCase()
        const doc = (enc.assignedDoctor || "").toLowerCase()
        const complaint = (enc.chiefComplaint || "").toLowerCase()
        return (
          name.includes(q) ||
          umr.includes(q) ||
          op.includes(q) ||
          doc.includes(q) ||
          complaint.includes(q)
        )
      }
      // Date view filter
      const encDateStr = getEncounterDateStr(enc)
      if (view === "day") {
        if (encDateStr !== selectedDateStr) return false
      } else if (view === "week") {
        if (!weekDateStrs.has(encDateStr)) return false
      } else if (view === "month") {
        if (!encDateStr.startsWith(selectedMonthStr)) return false
      }
      return true
    })
  }, [
    encounters,
    selectedDept,
    searchQuery,
    view,
    selectedDateStr,
    weekDateStrs,
    selectedMonthStr,
  ])

  // Metric counts
  const totalCount = encounters.length
  const completedCount = encounters.filter(
    (e) => e.status === "Consultation Completed" || e.status === "OP Completed",
  ).length
  const inProgressCount = encounters.filter(
    (e) => e.status === "Under Consultation" || e.status === "Doctor Assigned",
  ).length
  const waitingCount = encounters.filter(
    (e) =>
      e.status !== "Consultation Completed" &&
      e.status !== "OP Completed" &&
      e.status !== "Under Consultation" &&
      e.status !== "Doctor Assigned",
  ).length
  const activeDoctorsCount = getDoctorMaster().filter((d) => d.verified).length

  const handleAddAppointment = (booking: AppointmentBooking) => {
    const booked = bookAppointment(booking)
    setJustBooked({
      encounterId: booked.encounterId,
      name: booked.name,
      umr: booked.umr,
      doctor: booked.doctor,
      dept: booked.dept,
      room: booked.room,
      phone: booked.phone,
      token: booked.token,
      time: booked.time,
    })
    toast.success(
      `Appointment confirmed for ${booked.name} with ${booked.doctor}! Token: ${booked.token}`,
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5] overflow-hidden">
      {/* Modals */}
      {isModalOpen && (
        <AppointmentBookingModal
          initialEncounter={targetEncounter}
          onClose={() => {
            setIsModalOpen(false)
            setTargetEncounter(null)
          }}
          onSchedule={handleAddAppointment}
          onGoToBilling={onGoToBilling}
        />
      )}

      {/* Complete Outpatient Clinical Journey Modal */}
      <PatientJourneyModal
        encounter={selectedJourneyEncounter}
        onClose={() => setSelectedJourneyEncounter(null)}
        onNavigateToDoctorPortal={onNavigateToDoctorWorkflow}
        onNavigateToOPWorkflow={onNavigateToOPWorkflow}
      />

      {/* Top Header */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>📅</span> Appointments Schedule & Doctor Allocation
          </h1>
          <p className="text-[11.5px] text-[#64748B]">
            Manage doctor appointments, patient check-ins, and outpatient
            clinical care handoffs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Real-time search bar */}
          <div className="relative w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient, UMR, doctor..."
              className="w-full h-9 bg-[#F8FAFC] border border-[#CBD5E1] rounded-none pl-8 pr-3 text-[12px] focus:outline-none focus:border-[#1B4FD8] focus:bg-white"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
              🔍
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* View Mode Switcher */}
          <div className="flex border border-[#DDE2EC] rounded-none overflow-hidden">
            {(["day", "week", "month", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[12px] font-bold capitalize transition-colors cursor-pointer ${
                  view === v
                    ? "bg-[#1B4FD8] text-white"
                    : "bg-white text-[#64748B] hover:bg-[#F8FAFC]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Book Appointment Trigger */}
          <button
            type="button"
            onClick={() => {
              setTargetEncounter(null)
              setIsModalOpen(true)
            }}
            className="px-3.5 py-2 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-bold rounded-none shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span>+</span> Book New Appointment
          </button>
        </div>
      </div>

      {/* Just Booked Banner with Instant Patient Message Notification */}
      {justBooked && (
        <div className="mx-6 mt-3 rounded-none border border-[#86EFAC] bg-[#F0FDF4] px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0 animate-in fade-in">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base">🎉</span>
              <p className="text-[13.5px] font-bold text-[#166534]">
                Appointment Booked — {justBooked.name} with {justBooked.doctor}
              </p>
              {justBooked.token && (
                <span className="text-[11px] font-bold bg-[#DCFCE7] text-[#15803D] px-2 py-0.5 rounded border border-[#BBF7D0]">
                  Token {justBooked.token}
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#15803D] mt-1">
              UMR: <strong className="font-mono">{justBooked.umr}</strong> · {justBooked.dept} · {justBooked.room}.
            </p>
            {/* What really happened to the patient's confirmation message. */}
            <div className="mt-2">
              <MessageDeliveryStatus encounterId={justBooked.encounterId} kind="appointment_booked" phone={justBooked.phone} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onGoToBilling && (
              <button
                type="button"
                onClick={onGoToBilling}
                className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-bold rounded-none shadow-xs transition-colors cursor-pointer"
              >
                💳 Collect Consultation Fee →
              </button>
            )}
            <button
              type="button"
              onClick={() => setJustBooked(null)}
              className="text-[12px] font-bold text-[#166534] hover:underline cursor-pointer ml-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* KPI Metric Summary Strip */}
      <div className="px-6 py-3 bg-[#F8FAFC] border-b border-[#DDE2EC] grid grid-cols-2 sm:grid-cols-5 gap-3 flex-shrink-0">
        <div className="bg-white border border-[#CBD5E1] border-l-4 border-l-blue-600 p-2.5 rounded-none shadow-2xs">
          <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
            Total Bookings
          </span>
          <span className="font-mono text-lg font-extrabold text-blue-900">
            {totalCount}
          </span>
          <span className="text-[10px] text-gray-500 block">
            Registered today
          </span>
        </div>

        <div className="bg-white border border-[#CBD5E1] border-l-4 border-l-amber-500 p-2.5 rounded-none shadow-2xs">
          <span className="text-[10.5px] uppercase font-bold text-amber-800 block">
            Scheduled / Queue
          </span>
          <span className="font-mono text-lg font-extrabold text-amber-950">
            {waitingCount}
          </span>
          <span className="text-[10px] text-amber-700 block">
            Awaiting doctor
          </span>
        </div>

        <div className="bg-white border border-[#CBD5E1] border-l-4 border-l-sky-500 p-2.5 rounded-none shadow-2xs">
          <span className="text-[10.5px] uppercase font-bold text-sky-800 block">
            In Progress
          </span>
          <span className="font-mono text-lg font-extrabold text-sky-950">
            {inProgressCount}
          </span>
          <span className="text-[10px] text-sky-700 block">
            Under consultation
          </span>
        </div>

        <div className="bg-white border border-[#CBD5E1] border-l-4 border-l-emerald-600 p-2.5 rounded-none shadow-2xs">
          <span className="text-[10.5px] uppercase font-bold text-emerald-800 block">
            Completed
          </span>
          <span className="font-mono text-lg font-extrabold text-emerald-950">
            {completedCount}
          </span>
          <span className="text-[10px] text-emerald-700 block">
            Visits completed
          </span>
        </div>

        <div className="bg-white border border-[#CBD5E1] border-l-4 border-l-indigo-600 p-2.5 rounded-none shadow-2xs">
          <span className="text-[10.5px] uppercase font-bold text-indigo-800 block">
            Onboarded Consultants
          </span>
          <span className="font-mono text-lg font-extrabold text-indigo-950">
            {activeDoctorsCount}
          </span>
          <span className="text-[10px] text-indigo-700 block">
            Active doctor master
          </span>
        </div>
      </div>

      {/* Department Filter Bar */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-2 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
        {DEPARTMENTS.map((d) => {
          const isSel = selectedDept === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDept(d)}
              className={`px-3 py-1 text-[11.5px] font-bold rounded-none whitespace-nowrap transition-colors cursor-pointer ${
                isSel
                  ? "bg-[#1B4FD8] text-white"
                  : "bg-[#F8FAFC] border border-[#CBD5E1] text-[#64748B] hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {d}
            </button>
          )
        })}
      </div>

      {/* Main Appointments Workspace */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {view === "week" && (
          <div className="bg-white border border-[#DDE2EC] rounded-none overflow-x-auto overflow-y-hidden mb-4 shadow-2xs">
            {/* Eight columns can't fit a phone; the strip scrolls instead. */}
            <div
              className="grid border-b border-[#DDE2EC] min-w-[640px]"
              style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}
            >
              <div className="bg-[#F8FAFC] border-r border-[#DDE2EC] flex items-center justify-center font-bold text-[11px] text-[#64748B]">
                SCHEDULE
              </div>
              {weekDays.map((d, i) => {
                const countOnDay = encounters.filter((e) => getEncounterDateStr(e) === d.dateStr).length
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveDay(i)
                      setView("day")
                    }}
                    className={`px-2 py-2.5 text-center border-r border-[#DDE2EC] last:border-r-0 transition-colors cursor-pointer
                      ${
                        i === activeDay
                          ? "bg-[#EFF6FF] text-[#1B4FD8]"
                          : "hover:bg-[#F8FAFC] text-[#64748B]"
                      }`}
                  >
                    <div className="text-[11px] font-bold whitespace-pre-line">
                      {d.label}
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <span className="text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#1B4FD8] px-1.5 py-0.2 rounded border border-blue-200">
                        {countOnDay}
                      </span>
                      {d.isToday && (
                        <div className="w-1.5 h-1.5 bg-[#1B4FD8] rounded-full" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {view === "month" && (
          <div className="bg-white border border-[#DDE2EC] rounded-none p-4 mb-4 shadow-2xs flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-gray-900">
                Month Schedule View — {selectedMonthStr}
              </h3>
              <p className="text-[11.5px] text-[#64748B]">
                Showing all appointments scheduled for this month ({filteredEncounters.length} patients booked)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setView("day")}
              className="px-3 py-1.5 bg-[#EFF6FF] text-[#1B4FD8] border border-[#BFDBFE] text-[12px] font-bold cursor-pointer"
            >
              Switch to Day View
            </button>
          </div>
        )}

        {/* List & Day Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Appointment Table / Cards Column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border-2 border-[#CBD5E1] rounded-none shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13.5px] font-bold text-gray-900">
                    Booked Patient Appointments ({view.toUpperCase()})
                  </h2>
                  <span className="font-mono text-[11px] font-bold bg-blue-100 text-[#1B4FD8] px-2 py-0.5 rounded-none border border-blue-200">
                    {filteredEncounters.length} Patients
                  </span>
                </div>
                <div className="text-[11.5px] text-[#64748B]">
                  Click{" "}
                  <strong className="text-[#1B4FD8]">
                    ✨ Clinical Journey
                  </strong>{" "}
                  to view full patient timeline
                </div>
              </div>

              {filteredEncounters.length === 0 ? (
                <div className="p-8 text-center text-[#64748B] text-[13px]">
                  No appointments found for the selected {view} view, department, or query.
                </div>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {filteredEncounters.map((enc) => {
                    const statusColor =
                      enc.status === "Consultation Completed" ||
                      enc.status === "OP Completed"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : enc.status === "Under Consultation"
                          ? "bg-blue-50 text-blue-800 border-blue-300"
                          : "bg-amber-50 text-amber-800 border-amber-300"

                    return (
                      <div
                        key={enc.id}
                        className="p-4 hover:bg-[#F8FAFC] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        {/* Patient & Doctor Details */}
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[14px] text-gray-900">
                              {enc.patientName}
                            </span>
                            <span className="text-[11.5px] text-[#64748B]">
                              ({enc.age} yrs · {enc.sex})
                            </span>
                            <span className="font-mono text-[11px] font-bold bg-blue-50 text-[#1B4FD8] px-2 py-0.5 rounded-none border border-blue-200">
                              {enc.umr}
                            </span>
                            <span
                              className={`text-[10.5px] font-bold px-2 py-0.5 rounded-none border ${statusColor}`}
                            >
                              {enc.status}
                            </span>
                          </div>

                          <div className="text-[12px] text-[#64748B] flex items-center gap-2 flex-wrap">
                            {/* Height-matched unified Specialty and Room badge */}
                            <span className="bg-[#0F172A] text-white px-2 py-0.5 rounded-none text-[10.5px] font-bold uppercase tracking-wide h-5 flex items-center leading-none">
                              {(enc.dept || "CARDIOLOGY").toUpperCase()} |{" "}
                              {enc.room || "ROOM 107"}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {enc.assignedDoctor || "Dr. Arjun Mehta"}
                            </span>
                            <span>·</span>
                            <span>
                              Reg:{" "}
                              <strong className="font-mono text-gray-800">
                                {enc.date ? `${enc.date} ${enc.registrationTime}` : enc.registrationTime}
                              </strong>
                            </span>
                          </div>

                          {enc.chiefComplaint && (
                            <div className="text-[11.5px] text-gray-700 bg-gray-50 p-2 rounded-none border border-gray-200">
                              <strong>Complaint:</strong> "{enc.chiefComplaint}"
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                          {/* Complete Outpatient Clinical Journey & History Trigger */}
                          <button
                            type="button"
                            onClick={() => setSelectedJourneyEncounter(enc)}
                            className="px-3.5 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1B4FD8] border border-[#BFDBFE] text-[12px] font-bold rounded-none transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                            title="View Outpatient Clinical Journey & Previous Consultation History"
                          >
                            <span>✨</span> View OP Chart & Journey →
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Doctor Master Sidebar Roster */}
          <div className="space-y-4">
            <div className="bg-white border-2 border-[#CBD5E1] rounded-none shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
                  <span>👨‍⚕️</span> Active Doctor Master ({activeDoctorsCount})
                </h3>
                <span className="text-[10.5px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200">
                  LIVE ROSTER
                </span>
              </div>

              <div className="p-3 space-y-2 max-h-[550px] overflow-y-auto">
                {getDoctorMaster()
                  .filter((d) => d.verified)
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 border border-[#E2E8F0] rounded-none bg-[#F8FAFC] text-[12px] hover:border-blue-300 transition-colors"
                    >
                      <div className="font-bold text-[#0F172A] flex items-center justify-between">
                        <span>{doc.name}</span>
                        <span className="text-[10px] font-mono font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded-none border border-blue-200">
                          {doc.room}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center justify-between">
                        <span>
                          {doc.specialty} • {doc.qualification}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold">
                          Available
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
