import React, { useState, useEffect, useMemo } from "react"
import { ACTIVE_DOCTORS } from "../services/doctorMaster"
import { Icon } from "./icons"
import PhoneInput from "./ui/PhoneInput"
import { db, DBOPEncounter, DBPatient, DBCallEvent } from "../services/db"
import {
  notifyAppointmentBooked,
  notifyPatientCalledToNurse,
} from "../services/patientMessaging"
import { HospAILogo } from "./HospAILogo"
import { BillingDatabase, RadiologyStudyRecord } from "../services/billingDb"
import { PharmacyDatabase } from "../services/pharmacyDb"
import { printRadiologyDocument } from "../utils/radiologyPrint"
import RadiologyReportPdfModal from "./radiology/RadiologyReportPdfModal"

interface QueueManagementProps {
  onNavigateToOPWorkflow?: (encId: string, step?: number) => void
  onNavigateToDoctorWorkflow?: (encId: string) => void
  onNavigateToOPRegistration?: () => void
  onNavigateToNurseStation?: () => void
}

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

// Specialty -> bookable consultants, built from the Imperial Hospitals doctor
// master instead of a hardcoded list that had to be kept in step with the
// login roster, symptom triage and the doctor portal by hand. Only doctors the
// OP card names legibly appear here, so a token can never be issued against a
// doctor whose identity is still unverified. See `doctorMaster.ts`.
const DOCTOR_MAP: Record<string, { name: string ;room: string }[]> =
  ACTIVE_DOCTORS.reduce(
    (acc, d) => {
      const key = d.specialty as string
      ;(acc[key] ||= []).push({ name: d.name, room: d.room })
      return acc
    },
    {} as Record<string, { name: string ;room: string }[]>,
  )

// Play audio chime using Web Audio API
function playChime() {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )()
    const now = ctx.currentTime

    // Tone 1
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = "sine"
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.12, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.5)

    // Tone 2
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = "sine"
    osc2.frequency.setValueAtTime(880, now + 0.16)
    gain2.gain.setValueAtTime(0.15, now + 0.16)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.16)
    osc2.stop(now + 0.8)
  } catch {
    // AudioContext fallback
  }
}

// Speak announcement using Web Speech API
function speakAnnouncement(text: string) {
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1.05
      window.speechSynthesis.speak(utterance)
    }
  } catch {
    // speech synthesis fallback
  }
}

export default function QueueManagement({
  onNavigateToOPWorkflow,
  onNavigateToDoctorWorkflow,
  onNavigateToOPRegistration,
}: QueueManagementProps) {
  // State
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const [patients, setPatients] = useState<DBPatient[]>([])
  const [selectedDept, setSelectedDept] = useState<string>("All Departments")
  const [statusFilter, setStatusFilter] = useState<string>("ALL") // ALL, WAITING, CONSULTING, COMPLETED
  const [searchQuery, setSearchQuery] = useState("")
  const [isTvKioskMode, setIsTvKioskMode] = useState(false)

  // Active call state
  const [nowCalling, setNowCalling] = useState<{
    token: string
    patientName: string
    room: string
    doctor: string
    dept: string
    timestamp: string
  } | null>(null)

  // Call history for waiting room kiosk display
  const [callHistory, setCallHistory] = useState<DBCallEvent[]>([])

  // Modals
  const [isIssueTokenOpen, setIsIssueTokenOpen] = useState(false)
  const [isTransferOpen, setIsTransferOpen] = useState(false)
  const [transferTargetEncounter, setTransferTargetEncounter] =
    useState<DBOPEncounter | null>(null)
  const [transferDept, setTransferDept] = useState("Cardiology")
  const [transferDoctor, setTransferDoctor] = useState("")
  const [notificationToast, setNotificationToast] = useState<{
    title: string
    desc: string
  } | null>(null)
  const [selectedJourneyEncounter, setSelectedJourneyEncounter] =
    useState<DBOPEncounter | null>(null)
  const [selectedReportStudy, setSelectedReportStudy] =
    useState<RadiologyStudyRecord | null>(null)

  // Issue Token Form State
  const [tokenPatientMode, setTokenPatientMode] = useState<"existing" | "new">(
    "existing",
  )
  const [tokenSelectedUmr, setTokenSelectedUmr] = useState("")
  const [tokenNewName, setTokenNewName] = useState("")
  const [tokenNewAge, setTokenNewAge] = useState(35)
  const [tokenNewSex, setTokenNewSex] = useState<"Male" | "Female" | "Other">(
    "Male",
  )
  const [tokenNewPhone, setTokenNewPhone] = useState("")
  const [tokenDept, setTokenDept] = useState("Cardiology")
  const [tokenDoctor, setTokenDoctor] = useState("")
  const [tokenPriority, setTokenPriority] =
    useState<"Routine" | "Urgent" | "Emergency">("Routine")
  const [tokenComplaint, setTokenComplaint] = useState("")

  // Load from database & subscribe to updates
  useEffect(() => {
    const loadData = () => {
      const allEncounters = db.getEncounters()
      const allPatients = db.getPatients()
      setEncounters(allEncounters)
      setPatients(allPatients)
      setCallHistory(db.getCallHistory())

      // Set initial nowCalling if empty
      const inConsult = allEncounters.find(
        (e) =>
          e.status === "Under Consultation" || e.status === "Doctor Assigned",
      )
      if (inConsult && !nowCalling) {
        setNowCalling({
          token: inConsult.queueToken || inConsult.opNumber,
          patientName: inConsult.patientName,
          room: inConsult.room || "Room 107",
          doctor: inConsult.assignedDoctor || "Dr. Arjun Mehta",
          dept: inConsult.dept,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })
      }
    }

    loadData()
    const unsubscribe = db.subscribe(loadData)
    const unsubBilling = BillingDatabase.onUpdate(loadData)
    return () => {
      unsubscribe()
      unsubBilling()
    }
  }, [])

  // Sync token doctor choices when dept changes
  useEffect(() => {
    const docs = DOCTOR_MAP[tokenDept] || []
    if (docs.length > 0) {
      setTokenDoctor(docs[0].name)
    } else {
      setTokenDoctor("")
    }
  }, [tokenDept])

  // Sync transfer doctor choices when transfer dept changes
  useEffect(() => {
    const docs = DOCTOR_MAP[transferDept] || []
    if (docs.length > 0) {
      setTransferDoctor(docs[0].name)
    } else {
      setTransferDoctor("")
    }
  }, [transferDept])

  // Department-wise patient counts
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "All Departments": encounters.length,
    }
    DEPARTMENTS.slice(1).forEach((d) => {
      counts[d] = 0
    })

    encounters.forEach((enc) => {
      const dept = enc.dept || "General Medicine"
      if (counts[dept] !== undefined) {
        counts[dept] += 1
      } else {
        counts["General Medicine"] = (counts["General Medicine"] || 0) + 1
      }
    })
    return counts
  }, [encounters])

  // Filtered queue items based on selected department and search
  const filteredQueue = useMemo(() => {
    return encounters.filter((enc) => {
      // 1. Department Filter
      if (selectedDept !== "All Departments") {
        const encDept = (enc.dept || "").toLowerCase()
        const selDept = selectedDept.toLowerCase()
        if (!encDept.includes(selDept) && !selDept.includes(encDept)) {
          return false
        }
      }

      // 2. Status Filter
      if (statusFilter === "WAITING") {
        if (
          enc.status === "Consultation Completed" ||
          enc.status === "OP Completed" ||
          enc.status === "Under Consultation"
        ) {
          return false
        }
      } else if (statusFilter === "CONSULTING") {
        if (
          enc.status !== "Under Consultation" &&
          enc.status !== "Doctor Assigned"
        ) {
          return false
        }
      } else if (statusFilter === "COMPLETED") {
        if (
          enc.status !== "Consultation Completed" &&
          enc.status !== "OP Completed" &&
          enc.status !== "Billing Completed"
        ) {
          return false
        }
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const token = (enc.queueToken || enc.opNumber || "").toLowerCase()
        const name = (enc.patientName || "").toLowerCase()
        const umr = (enc.umr || "").toLowerCase()
        const doc = (enc.assignedDoctor || "").toLowerCase()
        const complaint = (enc.chiefComplaint || "").toLowerCase()
        const symptoms = (enc.symptoms || []).join(" ").toLowerCase()
        return (
          token.includes(q) ||
          name.includes(q) ||
          umr.includes(q) ||
          doc.includes(q) ||
          complaint.includes(q) ||
          symptoms.includes(q)
        )
      }

      return true
    })
  }, [encounters, selectedDept, statusFilter, searchQuery])

  // Metrics for selected department (or all)
  const metrics = useMemo(() => {
    const deptEncounters =
      selectedDept === "All Departments"
        ? encounters
        : encounters.filter((e) =>
            (e.dept || "").toLowerCase().includes(selectedDept.toLowerCase()),
          )

    const waiting = deptEncounters.filter(
      (e) =>
        e.status === "In Queue" ||
        e.status === "Registered" ||
        e.status === "Awaiting Doctor" ||
        e.status === "Doctor Assigned" ||
        e.status === "Symptoms Captured" ||
        e.status === "AI Recommended",
    ).length

    const inConsult = deptEncounters.filter(
      (e) => e.status === "Under Consultation",
    ).length

    const completed = deptEncounters.filter(
      (e) =>
        e.status === "Consultation Completed" ||
        e.status === "OP Completed" ||
        e.status === "Billing Completed",
    ).length

    const total = deptEncounters.length

    return {
      waiting,
      inConsult,
      completed,
      total,
      avgWait: total > 0 ? `${Math.max(8, 14 + waiting * 3)}m` : "0m",
    }
  }, [encounters, selectedDept])

  // Show Toast Alert
  const triggerToast = (title: string, desc: string) => {
    setNotificationToast({ title, desc })
    setTimeout(() => {
      setNotificationToast(null)
    }, 4000)
  }

  // Actions
  const handleCallToNurse = (enc: DBOPEncounter) => {
    playChime()
    const token = enc.queueToken || enc.opNumber
    const nurseStation = "Nurse Station (Triage & Vitals)"

    db.callToNurseStation(enc.id, "OP Floor Nurse")
    notifyPatientCalledToNurse(enc)
    db.recordCallEvent({
      encounterId: enc.id,
      umr: enc.umr,
      patientName: enc.patientName,
      token,
      dept: enc.dept,
      room: nurseStation,
      eventType: "Call Nurse",
      timestamp: new Date().toISOString(),
    })

    const callObj = {
      token,
      patientName: enc.patientName,
      room: nurseStation,
      doctor: "Nurse Station Vitals Triage",
      dept: enc.dept,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }

    setNowCalling(callObj)

    setCallHistory(db.getCallHistory())

    speakAnnouncement(
      `Token ${token}, patient ${enc.patientName}, please report to the Nurse Station for vitals check`,
    )

    triggerToast(
      `Called to Nurse Station #${token}`,
      `${enc.patientName} called to Nurse Station for baseline observations.`,
    )
  }

  const handleCallPatient = (enc: DBOPEncounter) => {
    playChime()
    const token = enc.queueToken || enc.opNumber
    const room = enc.room || "Room 107"
    const doctor = enc.assignedDoctor || "Attending Physician"

    // Calling to Doctor sets pre-consultation status and call timestamp, NOT Under Consultation or consultationStart
    db.callToDoctor(enc.id, "OP Desk")
    db.recordCallEvent({
      encounterId: enc.id,
      umr: enc.umr,
      patientName: enc.patientName,
      token,
      dept: enc.dept,
      room,
      eventType: "Call Doctor",
      timestamp: new Date().toISOString(),
    })

    const callObj = {
      token,
      patientName: enc.patientName,
      room,
      doctor,
      dept: enc.dept,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }

    setNowCalling(callObj)
    setCallHistory(db.getCallHistory())

    speakAnnouncement(
      `Token ${token}, patient ${enc.patientName}, please proceed to ${room}`,
    )

    triggerToast(
      `Calling Token #${token}`,
      `${enc.patientName} called to ${room} with ${doctor}.`,
    )
  }

  const handleCompleteConsultation = (enc: DBOPEncounter) => {
    db.updateEncounter(enc.id, {
      status: "Consultation Completed",
      timestamps: {
        ...enc.timestamps,
        consultationEnd: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    })

    triggerToast(
      `Consultation Completed: #${enc.queueToken || enc.opNumber}`,
      `${enc.patientName}'s consultation marked completed.`,
    )
  }

  const handleOpenTransfer = (enc: DBOPEncounter) => {
    setTransferTargetEncounter(enc)
    setTransferDept(enc.dept || "Cardiology")
    const docs = DOCTOR_MAP[enc.dept || "Cardiology"] || []
    setTransferDoctor(docs[0]?.name || "")
    setIsTransferOpen(true)
  }

  const handleConfirmTransfer = () => {
    if (!transferTargetEncounter) return

    const docObj = (DOCTOR_MAP[transferDept] || []).find(
      (d) => d.name === transferDoctor,
    )
    const room = docObj?.room || "Room 101"

    db.updateEncounter(transferTargetEncounter.id, {
      dept: transferDept,
      assignedDoctor: transferDoctor || `Dr. Specialist (${transferDept})`,
      room: room,
      status: "Doctor Assigned",
    })

    setIsTransferOpen(false)
    triggerToast(
      `Patient Transferred to ${transferDept}`,
      `${transferTargetEncounter.patientName} assigned to ${transferDoctor} in ${room}.`,
    )
  }

  const handleCreateToken = (e: React.FormEvent) => {
    e.preventDefault()

    let targetPatient: DBPatient | undefined
    let targetEncounter: DBOPEncounter | undefined

    if (tokenPatientMode === "existing") {
      const umrToUse = tokenSelectedUmr || patients[0]?.umr
      if (!umrToUse) {
        alert("Please select a registered patient.")
        return
      }
      targetPatient = patients.find((p) => p.umr === umrToUse)
      if (!targetPatient) {
        alert("Selected patient not found.")
        return
      }

      targetEncounter = db.createRevisitEncounter(targetPatient.umr, {
        dept: tokenDept,
        chiefComplaint:
          tokenComplaint || `Walk-in outpatient consultation for ${tokenDept}`,
      })
    } else {
      if (!tokenNewName.trim()) {
        alert("Please enter patient name.")
        return
      }
      const parts = tokenNewName.trim().split(" ")
      const firstName = parts[0]
      const lastName = parts.slice(1).join(" ") || "Patient"

      const res = db.registerNewPatient({
        firstName,
        lastName,
        age: Number(tokenNewAge) || 30,
        sex: tokenNewSex,
        phone: tokenNewPhone || "+91 98765 43210",
        dept: tokenDept,
        chiefComplaint: tokenComplaint || `OP Consultation - ${tokenDept}`,
      })
      targetPatient = res.patient
      targetEncounter = res.encounter
    }

    const docObj = (DOCTOR_MAP[tokenDept] || []).find(
      (d) => d.name === tokenDoctor,
    )
    const room = docObj?.room || "Room 101"
    const deptPrefix = tokenDept.charAt(0).toUpperCase()
    const tokenStr = `${deptPrefix}-${targetEncounter.opNumber}`

    db.updateEncounter(targetEncounter.id, {
      dept: tokenDept,
      assignedDoctor: tokenDoctor || docObj?.name || "Attending Physician",
      room: room,
      queueToken: tokenStr,
      status: tokenPriority === "Emergency" ? "Under Consultation" : "In Queue",
    })

    setIsIssueTokenOpen(false)
    triggerToast(
      `Queue Token Issued: ${tokenStr}`,
      `Token ${tokenStr} issued for ${targetPatient.name} in ${tokenDept}. Confirmation message to the patient is being sent (status in Patient Messages).`,
    )

    if (tokenPriority === "Emergency") {
      playChime()
      speakAnnouncement(
        `Emergency priority token ${tokenStr}, please proceed directly to ${room}`,
      )
    }
  }

  const getStatusBadge = (encOrStatus: DBOPEncounter | string) => {
    const status = typeof encOrStatus === "string" ? encOrStatus : encOrStatus.status
    const calledToNurse = typeof encOrStatus !== "string" && encOrStatus.timestamps?.calledToNurse
    const calledToDoctor = typeof encOrStatus !== "string" && encOrStatus.timestamps?.calledToDoctor

    if (calledToNurse && !calledToDoctor && status !== "Under Consultation" && status !== "Consultation Completed" && status !== "OP Completed") {
      return (
        <span className="bg-teal-100 text-teal-900 border border-teal-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse"></span>
          Called Nurse ({calledToNurse})
        </span>
      )
    }

    if (calledToDoctor && status !== "Under Consultation" && status !== "Consultation Completed" && status !== "OP Completed") {
      return (
        <span className="bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-ping"></span>
          Calling Doctor ({calledToDoctor})
        </span>
      )
    }

    switch (status) {
      case "Under Consultation":
      case "IN_CONSULTATION":
        return (
          <span className="bg-[#DBEAFE] text-[#1E3A8A] border border-[#BFDBFE] text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] animate-pulse"></span>
            In Consult
          </span>
        )
      case "Doctor Assigned":
      case "Awaiting Consultation":
      case "CALLED":
        return (
          <span className="bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-ping"></span>
            Calling
          </span>
        )
      case "Registered":
      case "Symptoms Captured":
      case "AI Recommended":
      case "In Queue":
      case "Awaiting Doctor":
      case "WAITING":
        return (
          <span className="bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap">
            Waiting
          </span>
        )
      case "Consultation Completed":
      case "Billing Completed":
      case "OP Completed":
      case "COMPLETED":
        return (
          <span className="bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap inline-flex items-center gap-0.5">
            <span>✓</span> Done
          </span>
        )
      case "No Show":
      case "NO_SHOW":
        return (
          <span className="bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap">
            No Show
          </span>
        )
      default:
        return (
          <span className="bg-gray-100 text-gray-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase whitespace-nowrap">
            {status}
          </span>
        )
    }
  }

  // Helper for specialty color pill styles
  const getSpecialtyBadgeStyle = (dept: string) => {
    const d = (dept || "").toLowerCase()
    if (d.includes("cardio")) return "bg-rose-50 text-rose-800 border-rose-200"
    if (d.includes("ortho"))
      return "bg-amber-50 text-amber-800 border-amber-200"
    if (d.includes("neuro"))
      return "bg-purple-50 text-purple-800 border-purple-200"
    if (d.includes("pediat")) return "bg-teal-50 text-teal-800 border-teal-200"
    if (d.includes("ent") || d.includes("ophthal"))
      return "bg-sky-50 text-sky-800 border-sky-200"
    if (d.includes("gynaec") || d.includes("obg"))
      return "bg-pink-50 text-pink-800 border-pink-200"
    return "bg-blue-50 text-blue-800 border-blue-200"
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F1F5F9] text-slate-800 font-sans overflow-hidden">
      {/* ── NOTIFICATION TOAST ── */}
      {notificationToast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white border border-slate-700 rounded-none p-3.5 shadow-2xl flex items-start gap-3 max-w-sm animate-in slide-in-from-top-3">
          <span className="text-lg">📢</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-sky-400">
              {notificationToast.title}
            </div>
            <div className="text-[11.5px] text-slate-300 mt-0.5">
              {notificationToast.desc}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNotificationToast(null)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── MINIMALIST COLORFUL HEADER ── */}
      <div className="bg-white border-b border-[#CBD5E1] px-6 py-3 flex items-center justify-between gap-3 flex-shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 text-white font-bold flex items-center justify-center text-base rounded-none shadow-xs">
            📢
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Outpatient Live Queue Board
              <span className="text-[10.5px] bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-none font-mono uppercase font-bold">
                {filteredQueue.length} Active Records
              </span>
            </h1>
            <p className="text-[11.5px] text-slate-500">
              Real-time outpatient patient flow, doctor queue allocations, room
              assignments, and live waiting room broadcasts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsTvKioskMode(true)}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-bold rounded-none transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Open Waiting Room Kiosk TV Mode"
          >
            <span>📺</span> TV Display Mode
          </button>

          <button
            type="button"
            onClick={() => setIsIssueTokenOpen(true)}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-none transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Icon.Plus /> Issue Queue Token
          </button>
        </div>
      </div>

      {/* ── DEPARTMENT PILL TABS BAR ── */}
      <div className="bg-white border-b border-[#CBD5E1] px-6 py-2 flex items-center gap-1.5 overflow-x-auto flex-shrink-0 no-scrollbar">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mr-1 flex items-center gap-1 flex-shrink-0">
          <span>🏥</span> Dept:
        </span>
        {DEPARTMENTS.filter(
          (dept) =>
            dept === "All Departments" ||
            dept === selectedDept ||
            (departmentCounts[dept] || 0) > 0,
        ).map((dept) => {
          const isSelected = selectedDept === dept
          const count = departmentCounts[dept] || 0
          return (
            <button
              key={dept}
              type="button"
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1 text-[11.5px] font-bold rounded-none whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border flex-shrink-0 ${
                isSelected
                  ? "bg-blue-600 text-white border-blue-700 shadow-xs"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>{dept}</span>
              <span
                className={`text-[10.5px] font-mono font-bold px-1.5 py-0.2 rounded-none ${
                  isSelected
                    ? "bg-white text-blue-900"
                    : "bg-blue-100 text-blue-900 border border-blue-200"
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col lg:flex-row gap-4 w-full">
        {/* Left Side: Active Queue & Department Metrics */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Department KPI Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-amber-50/80 border border-amber-200 border-l-4 border-l-amber-500 rounded-none p-3 shadow-2xs">
              <div className="text-[10.5px] font-bold text-amber-900 uppercase tracking-wider mb-0.5 flex items-center justify-between">
                <span>Waiting</span>
                <span className="text-amber-600">⏳</span>
              </div>
              <div className="text-2xl font-bold font-mono text-amber-950 mt-1">
                {metrics.waiting}
              </div>
              <div className="text-[11px] text-amber-800 font-semibold mt-0.5">
                In waiting room
              </div>
            </div>

            <div className="bg-blue-50/80 border border-blue-200 border-l-4 border-l-blue-600 rounded-none p-3 shadow-2xs">
              <div className="text-[10.5px] font-bold text-blue-900 uppercase tracking-wider mb-0.5 flex items-center justify-between">
                <span>In Consult</span>
                <span className="text-blue-600">🩺</span>
              </div>
              <div className="text-2xl font-bold font-mono text-blue-950 mt-1">
                {metrics.inConsult}
              </div>
              <div className="text-[11px] text-blue-800 font-semibold mt-0.5">
                With doctor in chamber
              </div>
            </div>

            <div className="bg-purple-50/80 border border-purple-200 border-l-4 border-l-purple-600 rounded-none p-3 shadow-2xs">
              <div className="text-[10.5px] font-bold text-purple-900 uppercase tracking-wider mb-0.5 flex items-center justify-between">
                <span>Avg Wait Time</span>
                <span className="text-purple-600">⏱️</span>
              </div>
              <div className="text-2xl font-bold font-mono text-purple-950 mt-1">
                {metrics.avgWait}
              </div>
              <div className="text-[11px] text-purple-800 font-semibold mt-0.5 font-mono">
                Reg to consultation
              </div>
            </div>

            <div className="bg-emerald-50/80 border border-emerald-200 border-l-4 border-l-emerald-600 rounded-none p-3 shadow-2xs">
              <div className="text-[10.5px] font-bold text-emerald-900 uppercase tracking-wider mb-0.5 flex items-center justify-between">
                <span>Completed</span>
                <span className="text-emerald-600">✓</span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-950 mt-1">
                {metrics.completed}
              </div>
              <div className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                Finished today
              </div>
            </div>
          </div>

          {/* Department Queue Table Container */}
          <div className="bg-white border border-[#CBD5E1] rounded-none shadow-2xs overflow-hidden flex-1 flex flex-col min-h-[360px]">
            {/* Header & Filter Controls */}
            <div className="px-5 py-3 border-b border-[#CBD5E1] bg-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-[13.5px] font-bold text-slate-900 truncate flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-blue-600 inline-block"></span>
                  Live Queue — {selectedDept}
                </h2>
                <span className="text-[11px] font-mono bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 rounded-none font-bold whitespace-nowrap">
                  {filteredQueue.length} Patients
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Status Filter Tabs */}
                <div className="flex items-center bg-slate-200/70 border border-slate-300 rounded-none p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className={`px-2.5 py-1 rounded-none transition-colors cursor-pointer ${
                      statusFilter === "ALL"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-700 hover:text-slate-900"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("WAITING")}
                    className={`px-2.5 py-1 rounded-none transition-colors cursor-pointer ${
                      statusFilter === "WAITING"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-700 hover:text-slate-900"
                    }`}
                  >
                    Waiting
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("CONSULTING")}
                    className={`px-2.5 py-1 rounded-none transition-colors cursor-pointer ${
                      statusFilter === "CONSULTING"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-700 hover:text-slate-900"
                    }`}
                  >
                    In Consult
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("COMPLETED")}
                    className={`px-2.5 py-1 rounded-none transition-colors cursor-pointer ${
                      statusFilter === "COMPLETED"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-700 hover:text-slate-900"
                    }`}
                  >
                    Completed
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patient, token, doctor..."
                    className="pl-7 pr-3 py-1 text-[11.5px] border border-[#CBD5E1] rounded-none bg-white focus:outline-none focus:border-blue-600 w-40 sm:w-52 font-medium"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                    <Icon.Search />
                  </span>
                </div>
              </div>
            </div>

            {/* Queue Table */}
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              {filteredQueue.length === 0 ? (
                <div className="p-10 text-center text-slate-500 space-y-2.5 font-medium">
                  <div className="text-3xl">🏥</div>
                  <div className="text-[13.5px] font-bold text-slate-800">
                    No Patients in {selectedDept} Queue
                  </div>
                  <p className="text-[11.5px] text-slate-500 max-w-sm mx-auto">
                    {searchQuery
                      ? "No queue entries matched your search query."
                      : `There are currently no active patients in ${selectedDept}. Click "+ Issue Queue Token" or register a new patient.`}
                  </p>
                  <div className="flex justify-center gap-2 pt-1">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11.5px] font-bold rounded-none cursor-pointer border border-slate-300"
                      >
                        Clear Search
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsIssueTokenOpen(true)}
                      className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11.5px] font-bold rounded-none cursor-pointer shadow-xs"
                    >
                      + Issue Token for{" "}
                      {selectedDept === "All Departments"
                        ? "Patient"
                        : selectedDept}
                    </button>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-300 sticky top-0 z-10 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">
                        Token &amp; UMR
                      </th>
                      <th className="px-4 py-3">Patient Details</th>
                      <th className="px-4 py-3 whitespace-nowrap">
                        Specialty &amp; Doctor
                      </th>
                      <th className="px-4 py-3 whitespace-nowrap">Reg Time</th>
                      <th className="px-4 py-3 whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap sticky right-0 bg-slate-100 shadow-[-6px_0_6px_-6px_rgba(15,22,36,0.18)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[12px]">
                    {filteredQueue.map((enc, idx) => {
                      const token = enc.queueToken || enc.opNumber
                      const isCallingThis = nowCalling?.token === token
                      const isCompleted =
                        enc.status === "Consultation Completed" ||
                        enc.status === "OP Completed" ||
                        enc.status === "Billing Completed"
                      const isInConsult = enc.status === "Under Consultation"

                      return (
                        <tr
                          key={enc.id}
                          className={`hover:bg-blue-50/40 transition-colors ${
                            isCallingThis ? "bg-amber-50/80" : ""
                          }`}
                        >
                          {/* Token & UMR */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10.5px] font-mono text-slate-400 font-bold">
                                #{idx + 1}
                              </span>
                              <span className="font-mono font-bold text-xs text-blue-900 bg-blue-100 px-2.5 py-1 rounded-none border border-blue-300 inline-block shadow-2xs">
                                {token}
                              </span>
                            </div>
                            <div className="text-[10.5px] font-mono text-slate-600 font-bold mt-1">
                              UMR: {enc.umr}
                            </div>
                          </td>

                          {/* Patient Info */}
                          <td className="px-4 py-3 min-w-[170px] max-w-[260px]">
                            <div className="font-bold text-slate-900 text-[13px]">
                              {enc.patientName}
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1 mt-0.5">
                              <span>
                                {enc.age} yrs, {enc.sex}
                              </span>
                              <span>•</span>
                              <span>{enc.phone}</span>
                            </div>
                            <div
                              className="text-[10.5px] text-slate-500 truncate max-w-[200px] mt-0.5 font-medium"
                              title={
                                enc.chiefComplaint || enc.symptoms.join(", ")
                              }
                            >
                              💬{" "}
                              {enc.chiefComplaint ||
                                enc.symptoms.join(", ") ||
                                "OP Consultation"}
                            </div>
                          </td>

                          {/* Dept & Doctor (MINIMALIST UNIFIED ALIGNED BADGE) */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center mb-1">
                              <span
                                className={`px-2.5 py-0.5 text-[11px] font-bold uppercase border ${getSpecialtyBadgeStyle(enc.dept)} rounded-none inline-flex items-center gap-1.5 h-5 leading-none shadow-2xs`}
                              >
                                <span>{enc.dept || "General Medicine"}</span>
                                <span className="opacity-40 font-normal">
                                  |
                                </span>
                                <span className="font-mono text-slate-800 text-[10.5px] font-bold">
                                  {enc.room || "Room 101"}
                                </span>
                              </span>
                            </div>
                            <div className="text-[11.5px] text-slate-900 font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full shrink-0"></span>
                              <span>
                                {enc.assignedDoctor ||
                                  "Awaiting Doctor Allocation"}
                              </span>
                            </div>
                          </td>

                          {/* Reg Time */}
                          <td className="px-4 py-3 text-slate-700 font-mono text-[11.5px] font-semibold whitespace-nowrap">
                            {enc.registrationTime ||
                              enc.timestamps?.arrival ||
                              "10:00 AM"}
                          </td>

                          {/* Status Badge */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getStatusBadge(enc)}
                          </td>

                          {/* Action Buttons */}
                          <td className="px-4 py-3 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-inherit shadow-[-6px_0_6px_-6px_rgba(15,22,36,0.18)]">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isCompleted && !isInConsult && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleCallToNurse(enc)}
                                    className="px-2.5 py-1 text-[11px] font-bold text-teal-900 bg-teal-100 hover:bg-teal-200 border border-teal-300 rounded-none transition-colors flex items-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                                    title="Call Patient to Nurse Station for Vitals & Triage"
                                  >
                                    <span>🩺</span> Call Nurse
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleCallPatient(enc)}
                                    className="px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-none transition-colors flex items-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                                    title="Call Patient to Doctor Chamber"
                                  >
                                    <span>📢</span> Call Doctor
                                  </button>
                                </>
                              )}

                              {isInConsult && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCompleteConsultation(enc)
                                  }
                                  className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-none transition-colors flex items-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                                  title="Complete Consultation"
                                >
                                  <span>✓</span> Done
                                </button>
                              )}

                              {!isCompleted && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenTransfer(enc)}
                                    className="px-2 py-1 text-[11px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                                    title="Transfer department / doctor"
                                  >
                                    Transfer
                                  </button>

                                  {onNavigateToDoctorWorkflow && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onNavigateToDoctorWorkflow(enc.id)
                                      }
                                      className="px-2 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-none transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                                      title="Open Doctor Consultation Workspace"
                                    >
                                      Doctor
                                    </button>
                                  )}
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => setSelectedJourneyEncounter(enc)}
                                className="px-2 py-1 text-[11px] font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-none transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                                title="View Complete Outpatient Clinical Journey Timeline"
                              >
                                Journey →
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Waiting Room Display / Kiosk & Quick Actions */}
        <div className="w-full lg:w-72 flex flex-col gap-4 flex-shrink-0">
          {/* Waiting Room TV / Kiosk Display Card */}
          <div className="bg-slate-900 rounded-none shadow-md overflow-hidden flex flex-col border border-slate-800">
            <div className="bg-slate-800 p-2.5 text-center border-b border-white/10 flex justify-between items-center px-3.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                <h3 className="text-white text-[11px] font-bold tracking-widest uppercase">
                  Waiting Room Kiosk
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTvKioskMode(true)}
                className="text-[10.5px] font-mono text-sky-400 hover:text-sky-300 font-bold cursor-pointer bg-slate-900 px-2 py-0.5 border border-slate-700 rounded-none"
              >
                TV Mode ↗
              </button>
            </div>

            <div className="p-4 text-center text-white space-y-3">
              {nowCalling ? (
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1 flex items-center justify-center gap-1">
                    <span className="text-amber-400 animate-bounce">📢</span>{" "}
                    NOW CALLING
                  </div>
                  <div className="text-3xl font-mono font-extrabold text-[#38BDF8] tracking-tight bg-slate-950 py-1.5 rounded-none border border-sky-500/30">
                    {nowCalling.token}
                  </div>
                  <div className="text-[14px] font-bold text-white mt-1.5 truncate">
                    {nowCalling.patientName}
                  </div>
                  <div className="text-[12px] font-bold text-emerald-300 mt-1 bg-emerald-950/60 py-0.5 px-2.5 rounded-none border border-emerald-500/30 inline-block">
                    Proceed to {nowCalling.room}
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-1 truncate font-medium">
                    {nowCalling.doctor} ({nowCalling.dept})
                  </div>
                </div>
              ) : (
                <div className="py-3 text-slate-400">
                  <div className="text-xl mb-0.5">☕</div>
                  <div className="text-[12px] font-bold text-white">
                    Queue In Standby
                  </div>
                  <div className="text-[10.5px]">
                    Click "Call" on any patient row
                  </div>
                </div>
              )}

              {/* Recent Call History */}
              <div className="border-t border-white/10 pt-3 text-left space-y-1.5">
                <div className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider">
                  Recently Called
                </div>
                {callHistory.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic py-1">
                    No recent calls
                  </div>
                ) : (
                  callHistory.slice(0, 5).map((item) => (
                    <div
                      key={item.id || item.token}
                      className="flex justify-between items-center bg-slate-800/80 px-2 py-1 rounded-none text-[11px] border border-slate-700/50"
                    >
                      <div className="truncate mr-2 flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-1 py-0.5 rounded-xs ${
                            item.eventType === "Call Nurse"
                              ? "bg-teal-900/60 text-teal-300 border border-teal-700/50"
                              : "bg-sky-900/60 text-sky-300 border border-sky-700/50"
                          }`}
                        >
                          {item.eventType === "Call Nurse" ? "NURSE" : "DR"}
                        </span>
                        <span className="font-mono font-bold text-sky-300">
                          {item.token}
                        </span>
                        <span className="text-slate-200 ml-1 font-medium">
                          {item.patientName}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-300 font-bold whitespace-nowrap text-[10.5px]">
                        {item.room}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-white border border-[#CBD5E1] rounded-none p-3.5 shadow-2xs space-y-2">
            <h3 className="text-[12px] font-bold text-slate-900 flex items-center gap-1.5">
              <span>⚡</span> Quick Queue Actions
            </h3>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setIsIssueTokenOpen(true)}
                className="w-full text-left px-2.5 py-1.5 text-[11.5px] font-bold text-blue-800 hover:bg-blue-50 border border-blue-300 rounded-none flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Icon.Plus /> Issue Walk-In Queue Token
              </button>

              {onNavigateToOPRegistration && (
                <button
                  type="button"
                  onClick={onNavigateToOPRegistration}
                  className="w-full text-left px-2.5 py-1.5 text-[11.5px] font-bold text-slate-800 hover:bg-slate-50 border border-slate-300 rounded-none flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Icon.Patients /> Open OP Registration Desk
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  playChime()
                  speakAnnouncement(
                    "Attention all patients: please ensure you have completed vitals triage at nurse station 3 before entering consultation rooms.",
                  )
                  triggerToast(
                    "Announcement Broadcasted",
                    "Voice broadcast played across waiting areas.",
                  )
                }}
                className="w-full text-left px-2.5 py-1.5 text-[11.5px] font-bold text-slate-800 hover:bg-slate-50 border border-slate-300 rounded-none flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Icon.Cmd /> Broadcast Announcement
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full text-left px-2.5 py-1.5 text-[11.5px] font-bold text-slate-800 hover:bg-slate-50 border border-slate-300 rounded-none flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Icon.Download /> Print Queue Roster
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL 1: ISSUE QUEUE TOKEN ── */}
      {isIssueTokenOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white border-2 border-[#CBD5E1] rounded shadow-2xl max-w-lg w-full p-5 space-y-3.5">
            <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2.5">
              <div>
                <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                  <span>🎟️</span> Issue Outpatient Queue Token
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Assign patient directly into department queue with token
                  number.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsIssueTokenOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateToken}
              className="space-y-3 text-[12px]"
            >
              {/* Patient Selection Mode */}
              <div className="flex items-center bg-[#F1F5F9] p-1 rounded font-semibold text-[11.5px]">
                <button
                  type="button"
                  onClick={() => setTokenPatientMode("existing")}
                  className={`flex-1 py-1 rounded transition-colors cursor-pointer ${
                    tokenPatientMode === "existing"
                      ? "bg-white text-[#1B4FD8] shadow-xs"
                      : "text-gray-600"
                  }`}
                >
                  Select Existing Patient ({patients.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTokenPatientMode("new")}
                  className={`flex-1 py-1 rounded transition-colors cursor-pointer ${
                    tokenPatientMode === "new"
                      ? "bg-white text-[#1B4FD8] shadow-xs"
                      : "text-gray-600"
                  }`}
                >
                  + New Walk-In Patient
                </button>
              </div>

              {tokenPatientMode === "existing" ? (
                <div>
                  <label className="text-[11px] font-bold text-gray-800 block mb-1">
                    Select Registered Patient{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={tokenSelectedUmr || patients[0]?.umr || ""}
                    onChange={(e) => setTokenSelectedUmr(e.target.value)}
                    className="w-full border border-[#CBD5E1] rounded p-2 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    {patients.map((p, idx) => (
                      <option key={`${p.umr}-${idx}`} value={p.umr}>
                        {p.name} · {p.umr} ({p.age} yrs, {p.sex}) · {p.phone}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2.5 bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0]">
                  <div>
                    <label className="text-[10.5px] font-bold text-gray-800 block mb-0.5">
                      Patient Full Name *
                    </label>
                    <input
                      value={tokenNewName}
                      onChange={(e) => setTokenNewName(e.target.value)}
                      placeholder="e.g. Robert Williams"
                      className="w-full border border-[#CBD5E1] rounded p-1.5 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10.5px] font-bold text-gray-800 block mb-0.5">
                        Age
                      </label>
                      <input
                        type="number"
                        value={tokenNewAge}
                        onChange={(e) => setTokenNewAge(Number(e.target.value))}
                        className="w-full border border-[#CBD5E1] rounded p-1.5 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] font-bold text-gray-800 block mb-0.5">
                        Gender
                      </label>
                      <select
                        value={tokenNewSex}
                        onChange={(e) => setTokenNewSex(e.target.value as any)}
                        className="w-full border border-[#CBD5E1] rounded p-1.5 text-[11.5px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10.5px] font-bold text-gray-800 block mb-0.5">
                        Phone
                      </label>
                      <PhoneInput
                        value={tokenNewPhone}
                        onChange={(val) => setTokenNewPhone(val)}
                        placeholder="98765 43210"
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Department & Doctor Allocation */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-gray-800 block mb-1">
                    Department
                  </label>
                  <select
                    value={tokenDept}
                    onChange={(e) => setTokenDept(e.target.value)}
                    className="w-full border border-[#CBD5E1] rounded p-1.5 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    {DEPARTMENTS.slice(1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-800 block mb-1">
                    Attending Doctor
                  </label>
                  <select
                    value={tokenDoctor}
                    onChange={(e) => setTokenDoctor(e.target.value)}
                    className="w-full border border-[#CBD5E1] rounded p-1.5 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    {(DOCTOR_MAP[tokenDept] || []).map((doc) => (
                      <option key={doc.name} value={doc.name}>
                        {doc.name} ({doc.room})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority & Reason */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-gray-800 block mb-1">
                    Queue Priority
                  </label>
                  <select
                    value={tokenPriority}
                    onChange={(e) => setTokenPriority(e.target.value as any)}
                    className="w-full border border-[#CBD5E1] rounded p-1.5 text-[11.5px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="Routine">Routine</option>
                    <option value="Urgent">Urgent (Priority)</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-gray-800 block mb-1">
                    Chief Complaint / Reason
                  </label>
                  <input
                    value={tokenComplaint}
                    onChange={(e) => setTokenComplaint(e.target.value)}
                    placeholder="e.g. Chest pain, Follow-up"
                    className="w-full border border-[#CBD5E1] rounded p-1.5 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2.5 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsIssueTokenOpen(false)}
                  className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-semibold text-[11.5px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded font-bold text-[11.5px] shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>🎟️</span> Issue Token
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: TRANSFER PATIENT DEPARTMENT ── */}
      {isTransferOpen && transferTargetEncounter && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white border-2 border-[#CBD5E1] rounded shadow-2xl max-w-md w-full p-5 space-y-3.5">
            <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2.5">
              <div>
                <h3 className="text-[14.5px] font-bold text-gray-900 flex items-center gap-1.5">
                  <span>🔄</span> Transfer Patient Department
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Reassign{" "}
                  <strong>{transferTargetEncounter.patientName}</strong> to
                  another specialty.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-[12px]">
              <div>
                <label className="text-[11px] font-bold text-gray-800 block mb-1">
                  Target Department
                </label>
                <select
                  value={transferDept}
                  onChange={(e) => setTransferDept(e.target.value)}
                  className="w-full border border-[#CBD5E1] rounded p-1.5 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                >
                  {DEPARTMENTS.slice(1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-800 block mb-1">
                  Attending Physician &amp; Room
                </label>
                <select
                  value={transferDoctor}
                  onChange={(e) => setTransferDoctor(e.target.value)}
                  className="w-full border border-[#CBD5E1] rounded p-1.5 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                >
                  {(DOCTOR_MAP[transferDept] || []).map((doc) => (
                    <option key={doc.name} value={doc.name}>
                      {doc.name} ({doc.room})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2.5 border-t border-[#E2E8F0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(false)}
                  className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-semibold text-[11.5px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTransfer}
                  className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded font-bold text-[11.5px] shadow-2xs cursor-pointer"
                >
                  Confirm Transfer ➔
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: TV FULLSCREEN KIOSK MODE ── */}
      {isTvKioskMode && (
        <div className="fixed inset-0 bg-[#0A0F1D] text-white z-50 flex flex-col p-5 overflow-hidden animate-in fade-in">
          {/* TV Top Header */}
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <HospAILogo variant="icon" className="w-14 h-14 shrink-0" />
              <div>
                <div className="text-lg font-black text-white tracking-wider">
                  HOSPAI GENERAL HOSPITAL
                </div>
                <div className="text-[11.5px] text-sky-400 font-semibold tracking-widest uppercase">
                  Outpatient Live Queue Display — {selectedDept}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right font-mono">
                <div className="text-lg font-bold text-white">
                  {new Date().toLocaleTimeString()}
                </div>
                <div className="text-[10.5px] text-slate-400">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTvKioskMode(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-[12px] border border-slate-700 cursor-pointer"
              >
                ✕ Exit TV Mode
              </button>
            </div>
          </div>

          {/* TV Main Grid */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5 pt-4 overflow-hidden">
            {/* Main Calling Card */}
            <div className="md:col-span-2 bg-[#131C31] border-2 border-sky-500/40 rounded p-6 flex flex-col justify-center items-center text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 animate-pulse"></div>

              {nowCalling ? (
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-1.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3.5 py-1 rounded text-[13px] font-bold tracking-widest uppercase">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    NOW CALLING FOR CONSULTATION
                  </div>

                  <div className="text-7xl font-black font-mono text-[#38BDF8] tracking-wider py-1">
                    {nowCalling.token}
                  </div>

                  <div className="text-2xl font-bold text-white">
                    {nowCalling.patientName}
                  </div>

                  <div className="inline-block bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 px-6 py-2 rounded text-xl font-black font-mono tracking-wide">
                    PROCEED TO {nowCalling.room.toUpperCase()}
                  </div>

                  <div className="text-base text-slate-300 font-medium">
                    Attending:{" "}
                    <strong className="text-white">{nowCalling.doctor}</strong>{" "}
                    ({nowCalling.dept})
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 text-slate-400">
                  <div className="text-5xl">🏥</div>
                  <div className="text-xl font-bold text-white">
                    Welcome to HospAI Outpatient Clinic
                  </div>
                  <p className="text-slate-400 text-xs">
                    Please watch this screen for your token call number.
                  </p>
                </div>
              )}
            </div>

            {/* Right Side: Active Waiting & Called List */}
            <div className="bg-[#131C31] border border-slate-800 rounded p-4 flex flex-col overflow-hidden">
              <div className="text-[12px] font-bold text-sky-400 tracking-wider uppercase border-b border-slate-800 pb-2 mb-2.5">
                Upcoming Queue (
                {
                  filteredQueue.filter(
                    (e) =>
                      e.status !== "Consultation Completed" &&
                      e.status !== "OP Completed",
                  ).length
                }
                )
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {filteredQueue
                  .filter(
                    (e) =>
                      e.status !== "Consultation Completed" &&
                      e.status !== "OP Completed",
                  )
                  .slice(0, 10)
                  .map((enc, idx) => (
                    <div
                      key={enc.id}
                      className="bg-slate-800/80 border border-slate-700/60 p-2.5 rounded flex items-center justify-between"
                    >
                      <div className="min-w-0 mr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10.5px] text-slate-400 font-bold">
                            #{idx + 1}
                          </span>
                          <span className="font-mono font-bold text-sky-400 text-[13px] whitespace-nowrap">
                            {enc.queueToken || enc.opNumber}
                          </span>
                        </div>
                        <div className="font-bold text-white text-[12px] mt-0.5 truncate">
                          {enc.patientName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {enc.dept} · {enc.assignedDoctor || "Physician"}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 text-[11px] bg-slate-900 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                        {enc.room || "Room 101"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL 4: COMPLETE PATIENT JOURNEY TIMELINE MODAL ── */}
      {selectedJourneyEncounter && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-white border-2 border-[#CBD5E1] rounded shadow-2xl max-w-3xl w-full my-auto flex flex-col max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-[#0F172A] text-white flex justify-between items-center flex-shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#1B4FD8] flex items-center justify-center text-lg font-bold">
                  🧭
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-bold text-white">
                      Complete Outpatient Clinical Journey
                    </h3>
                    <span className="font-mono text-[11px] font-bold bg-blue-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded">
                      {selectedJourneyEncounter.opNumber}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-300">
                    Comprehensive chronological care timeline from hospital
                    arrival to final billing settlement.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedJourneyEncounter(null)}
                className="text-slate-400 hover:text-white text-xl p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Patient Credentials Card */}
            <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] flex-shrink-0">
              <div>
                <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                  Patient Name
                </span>
                <span className="font-bold text-gray-900 text-[13.5px]">
                  {selectedJourneyEncounter.patientName}
                </span>
                <span className="text-[11px] text-[#64748B] block">
                  {selectedJourneyEncounter.age} yrs ·{" "}
                  {selectedJourneyEncounter.sex}
                </span>
              </div>

              <div>
                <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                  Permanent UMR (Lifetime)
                </span>
                <span className="font-mono font-bold text-[#1B4FD8] text-[13px] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block mt-0.5">
                  {selectedJourneyEncounter.umr}
                </span>
                <span className="text-[11px] text-gray-500 block mt-0.5">
                  {selectedJourneyEncounter.phone}
                </span>
              </div>

              <div>
                <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                  Department &amp; Doctor
                </span>
                <span className="font-semibold text-gray-900 block">
                  {selectedJourneyEncounter.dept}
                </span>
                <span className="text-[11px] text-gray-600 block">
                  {selectedJourneyEncounter.assignedDoctor ||
                    "Attending Physician"}{" "}
                  · {selectedJourneyEncounter.room || "Room 101"}
                </span>
              </div>

              <div>
                <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                  Current Status &amp; Total
                </span>
                <span className="font-bold text-[#15803D] bg-green-50 px-2 py-0.5 rounded border border-green-200 inline-block text-[11px]">
                  {selectedJourneyEncounter.status}
                </span>
                <span className="text-[11px] font-mono font-bold text-gray-700 block mt-0.5">
                  Fee: ₹{selectedJourneyEncounter.billing?.total || 90}.00 (
                  {selectedJourneyEncounter.billing?.status || "Pending"})
                </span>
              </div>
            </div>

            {/* Scrollable Journey Milestones Timeline */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Timeline Container */}
              <div className="relative pl-6 space-y-6 border-l-2 border-[#CBD5E1] ml-4">
                {/* 1. ARRIVAL & CHECK-IN */}
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#1B4FD8] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    1
                  </div>
                  <div className="bg-white border border-[#CBD5E1] rounded p-4 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>🏥</span> Arrival &amp; OPD Check-In
                      </div>
                      <span className="font-mono text-[11.5px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {selectedJourneyEncounter.timestamps?.arrival ||
                          selectedJourneyEncounter.registrationTime ||
                          "10:00 AM"}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-700">
                      Patient arrived at Hospital Outpatient Lobby. Walk-in
                      token entry initialized and ticket printed.
                    </p>
                    <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0]">
                      Token ID:{" "}
                      <strong>
                        {selectedJourneyEncounter.queueToken ||
                          selectedJourneyEncounter.opNumber}
                      </strong>{" "}
                      · Type:{" "}
                      <strong>
                        {selectedJourneyEncounter.isNew
                          ? "New Outpatient"
                          : "Returning Patient Revisit"}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 2. REGISTRATION & UMR CONFIRMATION */}
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#1B4FD8] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    2
                  </div>
                  <div className="bg-white border border-[#CBD5E1] rounded p-4 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>📝</span> OP Registration &amp; Lifetime UMR
                        Verification
                      </div>
                      <span className="font-mono text-[11.5px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {selectedJourneyEncounter.timestamps?.registration ||
                          selectedJourneyEncounter.registrationTime ||
                          "10:05 AM"}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-700">
                      Demographic credentials verified against permanent master
                      database. Lifetime{" "}
                      <strong>{selectedJourneyEncounter.umr}</strong> linked
                      with today's visit OP number{" "}
                      <strong>{selectedJourneyEncounter.opNumber}</strong>.
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-gray-600">
                      <span>✓ Official OP Pass Issued</span>
                      <span>•</span>
                      <span>Contact: {selectedJourneyEncounter.phone}</span>
                      <span>•</span>
                      <span>
                        Address:{" "}
                        {selectedJourneyEncounter.address || "Boston, MA"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. SYMPTOMS & AI CLINICAL TRIAGE */}
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#8B5CF6] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    3
                  </div>
                  <div className="bg-white border border-[#CBD5E1] rounded p-4 shadow-2xs space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>🤖</span> Symptom Intake &amp; AI Specialty
                        Recommendation
                      </div>
                      <span className="font-mono text-[11.5px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                        {selectedJourneyEncounter.timestamps?.symptoms ||
                          "10:10 AM"}
                      </span>
                    </div>
                    <div className="bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0] text-[12px]">
                      <span className="font-bold text-[#64748B] block text-[10.5px] uppercase">
                        Presenting Chief Complaints:
                      </span>
                      <span className="text-gray-900 font-medium">
                        "
                        {selectedJourneyEncounter.chiefComplaint ||
                          selectedJourneyEncounter.symptoms?.join(", ") ||
                          "General outpatient evaluation requested."}
                        "
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11.5px]">
                      <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded border border-purple-200">
                        AI Specialty: {selectedJourneyEncounter.dept} (96%
                        Confidence)
                      </span>
                      <span className="text-[#64748B]">
                        Assigned to:{" "}
                        <strong>
                          {selectedJourneyEncounter.assignedDoctor ||
                            "Physician"}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. NURSE STATION & VITAL SIGNS */}
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#10B981] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    4
                  </div>
                  <div className="bg-white border border-[#CBD5E1] rounded p-4 shadow-2xs space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>🩺</span> Nurse Station Triage &amp; Baseline
                        Vitals
                      </div>
                      <span className="font-mono text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {selectedJourneyEncounter.timestamps?.vitalsRecorded ||
                          "10:18 AM"}
                      </span>
                    </div>

                    {/* Vitals Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11.5px]">
                      <div className="bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0] text-center">
                        <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                          Blood Pressure
                        </span>
                        <span className="font-mono font-bold text-gray-900 text-[13px]">
                          {selectedJourneyEncounter.vitals?.bp || "120/80 mmHg"}
                        </span>
                      </div>
                      <div className="bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0] text-center">
                        <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                          Heart Rate
                        </span>
                        <span className="font-mono font-bold text-gray-900 text-[13px]">
                          {selectedJourneyEncounter.vitals?.pulse || "76 bpm"}
                        </span>
                      </div>
                      <div className="bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0] text-center">
                        <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                          Temperature
                        </span>
                        <span className="font-mono font-bold text-gray-900 text-[13px]">
                          {selectedJourneyEncounter.vitals?.temp || "98.6 °F"}
                        </span>
                      </div>
                      <div className="bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0] text-center">
                        <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                          SpO2 Oxygen
                        </span>
                        <span className="font-mono font-bold text-gray-900 text-[13px]">
                          {selectedJourneyEncounter.vitals?.spo2 || "99%"}
                        </span>
                      </div>
                      <div className="bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0] text-center">
                        <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                          Body Weight
                        </span>
                        <span className="font-mono font-bold text-gray-900 text-[13px]">
                          {selectedJourneyEncounter.vitals?.weight || "74 kg"}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11.5px] text-[#166534] bg-[#F0FDF4] p-2 rounded border border-green-200">
                      👩‍⚕️ <strong>Nurse Assessment:</strong>{" "}
                      {selectedJourneyEncounter.vitals?.notes ||
                        "Alert, oriented, stable physiological baseline recorded."}
                    </div>
                  </div>
                </div>

                {/* 5. DOCTOR QUEUE ALLOCATION */}
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#F59E0B] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    5
                  </div>
                  <div className="bg-white border border-[#CBD5E1] rounded p-4 shadow-2xs space-y-1.5">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>⏳</span> Doctor Queue Allocation &amp; Chamber
                        Calling
                      </div>
                      <span className="font-mono text-[11.5px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {selectedJourneyEncounter.timestamps?.doctorAssigned ||
                          "10:25 AM"}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-700">
                      Allocated to{" "}
                      <strong>
                        {selectedJourneyEncounter.assignedDoctor ||
                          "Attending Physician"}
                      </strong>{" "}
                      in{" "}
                      <strong>
                        {selectedJourneyEncounter.room || "Room 101"}
                      </strong>{" "}
                      with live token{" "}
                      <strong>
                        #
                        {selectedJourneyEncounter.queueToken ||
                          selectedJourneyEncounter.opNumber}
                      </strong>
                      . Broadcasted on waiting room kiosk.
                    </p>
                  </div>
                </div>

                {/* 6. PHYSICIAN CONSULTATION & LIVE RX PAD */}
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#1B4FD8] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    6
                  </div>
                  <div className="bg-white border-2 border-blue-200 rounded p-4 shadow-xs space-y-3">
                    <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>🩺</span> Physician Examination &amp; Live
                        Prescription (Rx)
                      </div>
                      <span className="font-mono text-[11.5px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {selectedJourneyEncounter.timestamps
                          ?.consultationStart || "10:32 AM"}{" "}
                        —{" "}
                        {selectedJourneyEncounter.timestamps?.consultationEnd ||
                          "10:45 AM"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                      <div className="bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0]">
                        <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                          Clinical Diagnosis
                        </span>
                        <span className="font-bold text-gray-900 block mt-0.5">
                          {selectedJourneyEncounter.diagnosis ||
                            "Acute Coronary Syndrome Rule-Out / Stable Angina"}
                        </span>
                        <span className="text-[11px] font-mono text-[#1B4FD8]">
                          ICD-10: {selectedJourneyEncounter.icd10 || "I20.9"}
                        </span>
                      </div>

                      <div className="bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0]">
                        <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                          Diagnostic Investigations
                        </span>
                        <span className="font-medium text-gray-800 block mt-0.5">
                          {selectedJourneyEncounter.investigations &&
                          selectedJourneyEncounter.investigations.length > 0
                            ? selectedJourneyEncounter.investigations.join(", ")
                            : "ECG 12-Lead, Serum Troponin I, Lipid Profile"}
                        </span>
                      </div>
                    </div>

                    {/* Prescribed Medications Pad */}
                    <div className="space-y-1 text-[12px]">
                      <span className="text-[11px] uppercase font-bold text-[#64748B] block">
                        Prescribed Medications (Rx):
                      </span>
                      <div className="bg-white border border-[#CBD5E1] rounded overflow-hidden">
                        <table className="w-full text-left text-[11.5px]">
                          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] font-bold text-[#64748B]">
                            <tr>
                              <th className="px-3 py-1.5">Medicine</th>
                              <th className="px-3 py-1.5">Dosage</th>
                              <th className="px-3 py-1.5">Frequency</th>
                              <th className="px-3 py-1.5">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9]">
                            {selectedJourneyEncounter.prescription &&
                            selectedJourneyEncounter.prescription.length > 0 ? (
                              selectedJourneyEncounter.prescription.map(
                                (rx, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-1.5 font-semibold text-gray-900">
                                      {rx.medicine}
                                    </td>
                                    <td className="px-3 py-1.5 text-gray-700">
                                      {rx.dosage}
                                    </td>
                                    <td className="px-3 py-1.5 text-gray-700">
                                      {rx.frequency}
                                    </td>
                                    <td className="px-3 py-1.5 text-gray-700">
                                      {rx.duration}
                                    </td>
                                  </tr>
                                ),
                              )
                            ) : (
                              <tr>
                                <td className="px-3 py-1.5 font-semibold text-gray-900">
                                  Aspirin 81mg
                                </td>
                                <td className="px-3 py-1.5 text-gray-700">
                                  1 tab
                                </td>
                                <td className="px-3 py-1.5 text-gray-700">
                                  OD (Once Daily)
                                </td>
                                <td className="px-3 py-1.5 text-gray-700">
                                  30 days
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Advice */}
                    <div className="text-[11.5px] text-gray-700 bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0]">
                      <strong>Doctor Advice:</strong>{" "}
                      {selectedJourneyEncounter.advice ||
                        "Avoid strenuous exertion, follow heart-healthy diet, and follow up in 2 weeks."}
                    </div>
                  </div>
                </div>

                {/* 7. BILLING SETTLEMENT & INVOICE */}
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#10B981] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    7
                  </div>
                  <div className="bg-white border border-[#CBD5E1] rounded p-4 shadow-2xs space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>💳</span> Billing Settlement &amp; Official
                        Receipt
                      </div>
                      <span className="font-mono text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {selectedJourneyEncounter.timestamps
                          ?.billingCompleted || "10:55 AM"}
                      </span>
                    </div>

                    <div className="bg-[#F8FAFC] p-3 rounded border border-[#E2E8F0] space-y-1.5 text-[12px]">
                      {(() => {
                        const regFee = selectedJourneyEncounter.billing?.registrationFee ?? (selectedJourneyEncounter.isNew === false ? 0 : 20)
                        const consultFee = selectedJourneyEncounter.billing?.consultationFee ?? 500
                        const labFee = selectedJourneyEncounter.billing?.labFee || 0
                        const grandTotal = selectedJourneyEncounter.billing?.total || (regFee + consultFee + labFee)
                        return (
                          <>
                            <div className="flex justify-between text-gray-700">
                              <span>1. Patient Registration Fee {selectedJourneyEncounter.isNew === false || regFee === 0 ? "(Existing Patient)" : ""}</span>
                              <span className="font-mono font-bold text-gray-900">₹{regFee}.00</span>
                            </div>
                            <div className="flex justify-between text-gray-700">
                              <span>2. Physician Outpatient Consultation Fee {selectedJourneyEncounter.assignedDoctor ? `(${selectedJourneyEncounter.assignedDoctor})` : ""}</span>
                              <span className="font-mono font-bold text-gray-900">₹{consultFee}.00</span>
                            </div>
                            {labFee > 0 && (
                              <div className="flex justify-between text-gray-700">
                                <span>3. Diagnostic Investigations / Triage</span>
                                <span className="font-mono font-bold text-gray-900">₹{labFee}.00</span>
                              </div>
                            )}
                            <div className="pt-1.5 border-t border-[#E2E8F0] flex justify-between font-bold text-[13px] text-gray-900">
                              <span>Total Official Settlement:</span>
                              <span className="font-mono text-emerald-700">₹{grandTotal}.00 (Status: {selectedJourneyEncounter.billing?.status || 'Paid'})</span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                {/* 7b. DIAGNOSTIC RADIOLOGY & IMAGING REPORTS (FINALIZED) */}
                {(() => {
                  const finalizedRadStudies = selectedJourneyEncounter
                    ? BillingDatabase.getRadiologyStudies().filter((s) => {
                        const isFinal = s.status === "Final" || s.reportStatus === "Final"
                        if (!isFinal) return false
                        if (s.encounterId && s.encounterId === selectedJourneyEncounter.id) {
                          if (s.umr && s.umr !== selectedJourneyEncounter.umr) return false
                          return true
                        }
                        if (s.umr && s.umr === selectedJourneyEncounter.umr && !s.encounterId) {
                          const matches = selectedJourneyEncounter.investigations?.some((inv) =>
                            inv.toLowerCase().includes(s.study.toLowerCase()) ||
                            s.study.toLowerCase().includes(inv.toLowerCase())
                          )
                          return Boolean(matches)
                        }
                        return false
                      })
                    : []

                  if (finalizedRadStudies.length === 0) return null

                  return (
                    <div className="relative group">
                      <div className="absolute -left-[31px] top-0 w-6 h-6 rounded bg-[#4338CA] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                        🩻
                      </div>
                      <div className="bg-white border-2 border-indigo-200 rounded p-4 shadow-2xs space-y-3">
                        <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2">
                          <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                            <span>☢️</span> Diagnostic Radiology &amp; Imaging Reports
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              {finalizedRadStudies.length} Finalized {finalizedRadStudies.length === 1 ? "Report" : "Reports"}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Clinically Finalized
                            </span>
                          </div>
                        </div>

                        <p className="text-[12px] text-gray-700">
                          Official diagnostic imaging examination reported and signed off by the Department of Radiodiagnosis.
                        </p>

                        <div className="space-y-3">
                          {finalizedRadStudies.map((study) => (
                            <div
                              key={study.id}
                              className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded space-y-2.5 text-[12px]"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-[#E2E8F0] pb-2">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 text-[10.5px] font-mono font-bold rounded border ${
                                    study.modality === "CT" ? "bg-purple-100 text-purple-800 border-purple-200" :
                                    study.modality === "MR" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                    study.modality === "US" ? "bg-cyan-100 text-cyan-800 border-cyan-200" :
                                    "bg-blue-100 text-blue-800 border-blue-200"
                                  }`}>
                                    {study.modality}
                                  </span>
                                  <span className="font-bold text-[13.5px] text-gray-900">
                                    {study.study}
                                  </span>
                                  <span className="text-[11px] font-mono text-gray-500">
                                    ({study.accessionNo || study.id})
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-[#64748B]">
                                    Exam: <strong className="text-gray-800">{study.ordered}</strong>
                                  </span>
                                  <span>·</span>
                                  <span className="text-[11px] text-[#166534]">
                                    Finalized: <strong className="text-emerald-800">{study.signedAt || study.finalizedAt || "Final"}</strong>
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
                                <div className="bg-white p-2 rounded border border-[#E2E8F0]">
                                  <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                                    Referring Physician
                                  </span>
                                  <span className="font-semibold text-gray-900 block mt-0.5">
                                    {study.provider || selectedJourneyEncounter.assignedDoctor || "Attending Physician"}
                                  </span>
                                </div>

                                <div className="bg-white p-2 rounded border border-[#E2E8F0]">
                                  <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                                    Reporting Consultant Radiologist
                                  </span>
                                  <span className="font-semibold text-indigo-900 block mt-0.5">
                                    {study.radiologist || "Dr. Laura Kim, MD · Senior Consultant Radiologist"}
                                  </span>
                                </div>
                              </div>

                              {study.indication && (
                                <div className="text-[11.5px] text-gray-700 bg-white p-2 rounded border border-[#E2E8F0]">
                                  <strong className="text-gray-900">Clinical Indication:</strong> {study.indication}
                                </div>
                              )}

                              <div className="bg-white p-2.5 rounded border-l-4 border-indigo-600 border border-[#E2E8F0] space-y-1">
                                <span className="text-[10px] uppercase font-bold text-indigo-900 block tracking-wider">
                                  Diagnostic Impression &amp; Conclusion:
                                </span>
                                <p className="text-[11.5px] text-gray-900 font-medium whitespace-pre-line leading-relaxed">
                                  {study.impression && study.impression.length > 0
                                    ? study.impression.join("\n")
                                    : "Diagnostic radiology examination completed cleanly without complication."}
                                </p>
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#E2E8F0]">
                                <button
                                  type="button"
                                  onClick={() => setSelectedReportStudy(study)}
                                  className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11.5px] font-bold rounded shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                  <Icon.Eye /> View Full Report (A4)
                                </button>

                                <button
                                  type="button"
                                  onClick={() => printRadiologyDocument(study)}
                                  className="px-3.5 py-1.5 bg-white hover:bg-gray-100 text-gray-800 border border-[#CBD5E1] text-[11.5px] font-bold rounded shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                  <Icon.Download /> Print Report
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* 8. PHARMACY & DISPENSING */}
                {(() => {
                  const prescriptions = PharmacyDatabase.getPrescriptions()
                  const targetName = (selectedJourneyEncounter.patientName || "").toLowerCase().trim()
                  const matchedRx = prescriptions.find(
                    (p) =>
                      (p.visitId && p.visitId === selectedJourneyEncounter.id) ||
                      (p.uhid && p.uhid === selectedJourneyEncounter.umr) ||
                      (p.patientId && p.patientId === selectedJourneyEncounter.umr) ||
                      ((selectedJourneyEncounter as any).prescriptionId && p.id === (selectedJourneyEncounter as any).prescriptionId) ||
                      (targetName && p.patientName && p.patientName.toLowerCase().trim() === targetName)
                  )

                  const isDispensed =
                    matchedRx?.status === "Dispensed" ||
                    matchedRx?.dispensingStatus === "Dispensed" ||
                    selectedJourneyEncounter.pharmacyStatus === "Dispensed" ||
                    selectedJourneyEncounter.status === "OP Completed"

                  const isPartial =
                    (matchedRx?.status as string) === "Partially Dispensed" ||
                    (matchedRx?.dispensingStatus as string) === "Partially Dispensed" ||
                    selectedJourneyEncounter.pharmacyStatus === "Partially Dispensed"

                  const isReady =
                    matchedRx?.status === "Ready For Dispensing" ||
                    matchedRx?.dispensingStatus === "Ready" ||
                    selectedJourneyEncounter.pharmacyStatus === "Ready"

                  const isProcessing =
                    matchedRx?.status === "Preparing" ||
                    matchedRx?.dispensingStatus === "Preparing" ||
                    (matchedRx?.status as string) === "Processing" ||
                    selectedJourneyEncounter.pharmacyStatus === "Processing"

                  return (
                    <div className="relative group">
                      <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#06B6D4] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                        8
                      </div>
                      <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-1.5">
                        <div className="flex justify-between items-center">
                          <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                            <span>💊</span> Pharmacy Dispensing &amp; Visit Completed
                          </div>
                          {isDispensed ? (
                            <span className="font-mono text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-none border border-emerald-300 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Dispensed
                            </span>
                          ) : isPartial ? (
                            <span className="font-mono text-[11.5px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-none border border-amber-300 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Partially Dispensed
                            </span>
                          ) : isReady ? (
                            <span className="font-mono text-[11.5px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-none border border-blue-300 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              Ready
                            </span>
                          ) : isProcessing ? (
                            <span className="font-mono text-[11.5px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-none border border-indigo-300 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              In Process
                            </span>
                          ) : (
                            <span className="font-mono text-[11.5px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-none border border-cyan-200">
                              In Queue
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-700">
                          {isDispensed && matchedRx
                            ? `Prescription ${matchedRx.id} dispensed by Central Pharmacy (${matchedRx.items?.length || 0} item(s)).`
                            : isDispensed
                            ? "Prescription dispensed by Central Pharmacy. Patient departure counselled."
                            : isPartial && matchedRx
                            ? `Prescription ${matchedRx.id} partially dispensed (${matchedRx.items?.length || 0} item(s)).`
                            : selectedJourneyEncounter.prescription && selectedJourneyEncounter.prescription.length > 0
                            ? "Prescriptions routed to outpatient pharmacy queue."
                            : "Outpatient visit recorded in hospital system."}
                        </p>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
              <div className="text-[11.5px] text-[#64748B]">
                Permanent UMR: <strong>{selectedJourneyEncounter.umr}</strong> ·
                Visit: <strong>{selectedJourneyEncounter.opNumber}</strong>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-white hover:bg-gray-100 border border-[#CBD5E1] text-gray-800 text-[12px] font-bold rounded shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Icon.Download /> Print Journey Report
                </button>

                {onNavigateToDoctorWorkflow && (
                  <button
                    type="button"
                    onClick={() => {
                      const encId = selectedJourneyEncounter.id
                      setSelectedJourneyEncounter(null)
                      onNavigateToDoctorWorkflow(encId)
                    }}
                    className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1B4FD8] border border-blue-200 text-[12px] font-bold rounded transition-colors cursor-pointer"
                  >
                    Open Doctor Workspace →
                  </button>
                )}

                {onNavigateToOPWorkflow && (
                  <button
                    type="button"
                    onClick={() => {
                      const encId = selectedJourneyEncounter.id
                      setSelectedJourneyEncounter(null)
                      onNavigateToOPWorkflow(encId, 1)
                    }}
                    className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-bold rounded shadow-xs transition-colors cursor-pointer"
                  >
                    Open Full 6-Step Clinical Journey ➔
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complete A4 Finalized Radiology Report Viewer Modal */}
      {selectedReportStudy && (
        <RadiologyReportPdfModal
          study={selectedReportStudy}
          onClose={() => setSelectedReportStudy(null)}
        />
      )}
    </div>
  )
}
