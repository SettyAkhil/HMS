import React, { useState, useEffect, useMemo } from "react"
import {
  NursingWorkflowDb,
  PREDEFINED_NURSES,
  PREDEFINED_DOCTORS,
  NurseStaff,
  DoctorStaff,
  NurseAssignmentRecord,
  DoctorInstructionRecord,
  NursingNoteRecord,
  ClinicalMessageRecord,
  ShiftHandoverRecord,
  NursingTimelineEvent,
} from "../../services/nursingWorkflowDb"
import { BedDatabase } from "../../services/bedDb"

type ActiveTab = "overview" | "instructions" | "care" | "messages" | "handover"

export default function NursingPortal() {
  // Authentication & Current Staff
  const [currentUserType, setCurrentUserType] =
    useState<"nurse" | "doctor" | "admin">("nurse")
  const [activeNurse, setActiveNurse] = useState<NurseStaff>(
    PREDEFINED_NURSES[0],
  ) // Jessica Carter, RN
  const [activeDoctor, setActiveDoctor] = useState<DoctorStaff>(
    PREDEFINED_DOCTORS[0],
  ) // Dr. Arjun Rao

  // Workspace Data State
  const [assignments, setAssignments] = useState<NurseAssignmentRecord[]>([])
  const [instructions, setInstructions] = useState<DoctorInstructionRecord[]>(
    [],
  )
  const [notes, setNotes] = useState<NursingNoteRecord[]>([])
  const [messages, setMessages] = useState<ClinicalMessageRecord[]>([])
  const [handovers, setHandovers] = useState<ShiftHandoverRecord[]>([])

  // Active Patient View
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  )
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")

  // Form & Interaction States
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [handoverModalOpen, setHandoverModalOpen] = useState(false)
  const [doctorInstructionModalOpen, setDoctorInstructionModalOpen] =
    useState(false)
  const [reassignModalOpen, setReassignModalOpen] = useState(false)

  // New Note Form State
  const [noteAssessment, setNoteAssessment] = useState("")
  const [noteObservation, setNoteObservation] = useState("")
  const [noteIntervention, setNoteIntervention] = useState("")
  const [notePatientResponse, setNotePatientResponse] = useState("")
  const [noteFollowUp, setNoteFollowUp] = useState("")
  const [noteRemarks, setNoteRemarks] = useState("")
  const [noteBp, setNoteBp] = useState("128/82")
  const [noteHr, setNoteHr] = useState("78")
  const [noteSpo2, setNoteSpo2] = useState("97")
  const [noteTemp, setNoteTemp] = useState("98.4°F")
  const [noteRr, setNoteRr] = useState("18")

  // New Message State
  const [newMessageText, setNewMessageText] = useState("")

  // New Handover Form State
  const [handoverIncomingNurseId, setHandoverIncomingNurseId] = useState(
    PREDEFINED_NURSES[1].id,
  ) // Michael Lee
  const [handoverCondition, setHandoverCondition] =
    useState<"Stable" | "Guarded" | "Critical" | "Improving">("Stable")
  const [handoverPendingTasks, setHandoverPendingTasks] = useState(
    "Repeat ECG at 16:00. Telemetry continuous.",
  )
  const [handoverMedDue, setHandoverMedDue] = useState(
    "Atorvastatin 40mg PO at 21:00.",
  )
  const [handoverObservations, setHandoverObservations] = useState(
    "Patient comfortable. No chest pain during shift.",
  )
  const [handoverNotes, setHandoverNotes] = useState(
    "Continue regular vitals and notify Dr. Rao if SBP < 90.",
  )

  // New Doctor Instruction Form State
  const [newInstructionText, setNewInstructionText] = useState("")
  const [newInstructionPriority, setNewInstructionPriority] =
    useState<"routine" | "urgent" | "stat">("routine")

  // Reassignment Form State
  const [reassignNurseId, setReassignNurseId] = useState(
    PREDEFINED_NURSES[0].id,
  )
  const [reassignShift, setReassignShift] =
    useState<"morning" | "evening" | "night">("morning")

  // Load all persistent records
  const loadData = () => {
    const asg = NursingWorkflowDb.getAssignments()
    setAssignments(asg)
    setInstructions(NursingWorkflowDb.getDoctorInstructions())
    setNotes(NursingWorkflowDb.getNotes())
    setMessages(NursingWorkflowDb.getMessages())
    setHandovers(NursingWorkflowDb.getHandovers())

    // Auto-select first patient if none selected
    if (!selectedPatientId && asg.length > 0) {
      // Find patient matching current nurse
      const nursePatient = asg.find(
        (a) => a.nurseId === activeNurse.id && a.status === "active",
      )
      if (nursePatient) {
        setSelectedPatientId(nursePatient.patientId)
      } else {
        setSelectedPatientId(asg[0].patientId)
      }
    }
  }

  useEffect(() => {
    loadData()
  }, [activeNurse.id, currentUserType])

  // Authenticated Nurse Patients for current shift
  const myPatients = useMemo(() => {
    if (activeNurse.role === "Supervisor") {
      return assignments.filter((a) => a.status === "active")
    }
    return assignments.filter(
      (a) => a.nurseId === activeNurse.id && a.status === "active",
    )
  }, [assignments, activeNurse])

  // Selected Patient Record
  const selectedAssignment = useMemo(() => {
    return (
      assignments.find(
        (a) => a.patientId === selectedPatientId && a.status === "active",
      ) || assignments.find((a) => a.patientId === selectedPatientId)
    )
  }, [assignments, selectedPatientId])

  // Selected Patient Instructions
  const patientInstructions = useMemo(() => {
    if (!selectedPatientId) return []
    return instructions.filter((i) => i.patientId === selectedPatientId)
  }, [instructions, selectedPatientId])

  // Selected Patient Notes
  const patientNotes = useMemo(() => {
    if (!selectedPatientId) return []
    return notes.filter((n) => n.patientId === selectedPatientId)
  }, [notes, selectedPatientId])

  // Selected Patient Messages
  const patientMessages = useMemo(() => {
    if (!selectedPatientId) return []
    return messages.filter((m) => m.patientId === selectedPatientId)
  }, [messages, selectedPatientId])

  // Unified Timeline for Selected Patient
  const patientTimeline = useMemo(() => {
    if (!selectedPatientId) return []
    return NursingWorkflowDb.getPatientTimeline(selectedPatientId)
  }, [selectedPatientId, assignments, instructions, notes, messages, handovers])

  // Nurse Dashboard Workload Summary
  const workloadSummary = useMemo(() => {
    const assignedIds = myPatients.map((p) => p.patientId)
    const pendingIns = instructions.filter(
      (i) =>
        assignedIds.includes(i.patientId) &&
        (i.status === "pending" || i.status === "acknowledged"),
    ).length
    const unreadMsgs = messages.filter(
      (m) =>
        assignedIds.includes(m.patientId) &&
        m.senderRole === "doctor" &&
        !m.read,
    ).length

    return {
      myPatientsCount: myPatients.length,
      pendingInstructionsCount: pendingIns,
      tasksDueCount: myPatients.length > 0 ? myPatients.length * 2 : 0,
      unreadMessagesCount: unreadMsgs,
      pendingHandoverCount: myPatients.length > 0 ? 1 : 0,
    }
  }, [myPatients, instructions, messages])

  // Handlers for Doctor Instruction Actions
  const handleAcknowledgeInstruction = (instructionId: string) => {
    NursingWorkflowDb.updateInstructionStatus(
      instructionId,
      "acknowledged",
      activeNurse,
    )
    loadData()
  }

  const handleStartInstruction = (instructionId: string) => {
    NursingWorkflowDb.updateInstructionStatus(
      instructionId,
      "in_progress",
      activeNurse,
    )
    loadData()
  }

  const handleCompleteInstruction = (instructionId: string) => {
    const note = window.prompt(
      "Enter completion summary note:",
      "Order carried out as specified. Patient tolerated well.",
    )
    if (note !== null) {
      NursingWorkflowDb.updateInstructionStatus(
        instructionId,
        "completed",
        activeNurse,
        note,
      )
      loadData()
    }
  }

  // Handler for Adding Nursing Note
  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAssignment) return

    NursingWorkflowDb.addNote({
      patientId: selectedAssignment.patientId,
      patientName: selectedAssignment.patientName,
      mrn: selectedAssignment.mrn,
      admissionId: selectedAssignment.admissionId,
      ward: selectedAssignment.ward,
      bedNo: selectedAssignment.bedNo,
      assessment:
        noteAssessment ||
        "Patient resting comfortably in bed. Alert and oriented x4.",
      observation:
        noteObservation ||
        `BP ${noteBp}, HR ${noteHr}, SpO2 ${noteSpo2}%. No acute distress noted.`,
      intervention:
        noteIntervention ||
        "Administered scheduled oral medications. Maintained continuous monitoring.",
      patientResponse:
        notePatientResponse ||
        "Patient reports feeling well. Denies pain or nausea.",
      followUp:
        noteFollowUp ||
        "Continue vital checks every 4 hours. Re-evaluate as per doctor order.",
      remarks: noteRemarks || "IV site clean, dry, and intact.",
      vitals: {
        bp: noteBp,
        hr: parseInt(noteHr) || 78,
        spo2: parseInt(noteSpo2) || 97,
        temp: noteTemp,
        rr: parseInt(noteRr) || 18,
        recordedAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      authorNurseId: activeNurse.id,
      authorNurseName: activeNurse.name,
      shiftLabel: `${activeNurse.defaultShift.toUpperCase()} · ${activeNurse.unit}`,
    })

    setNoteModalOpen(false)
    // Reset form
    setNoteAssessment("")
    setNoteObservation("")
    setNoteIntervention("")
    setNotePatientResponse("")
    setNoteFollowUp("")
    setNoteRemarks("")
    loadData()
  }

  // Handler for Sending Clinical Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessageText.trim() || !selectedAssignment) return

    if (currentUserType === "nurse") {
      NursingWorkflowDb.sendMessage({
        patientId: selectedAssignment.patientId,
        patientName: selectedAssignment.patientName,
        admissionId: selectedAssignment.admissionId,
        bedNo: selectedAssignment.bedNo,
        senderId: activeNurse.id,
        senderName: activeNurse.name,
        senderRole: "nurse",
        recipientId: selectedAssignment.attendingDoctorId || "DOC-101",
        recipientName: selectedAssignment.attendingDoctor || "Dr. Arjun Rao",
        recipientRole: "doctor",
        messageText: newMessageText.trim(),
      })
    } else {
      NursingWorkflowDb.sendMessage({
        patientId: selectedAssignment.patientId,
        patientName: selectedAssignment.patientName,
        admissionId: selectedAssignment.admissionId,
        bedNo: selectedAssignment.bedNo,
        senderId: activeDoctor.id,
        senderName: activeDoctor.name,
        senderRole: "doctor",
        recipientId: selectedAssignment.nurseId || "N001",
        recipientName: selectedAssignment.nurseName || "Jessica Carter, RN",
        recipientRole: "nurse",
        messageText: newMessageText.trim(),
      })
    }

    setNewMessageText("")
    loadData()
  }

  // Handler for Shift Handover
  const handleSaveHandover = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAssignment) return

    const incomingNurse =
      PREDEFINED_NURSES.find((n) => n.id === handoverIncomingNurseId) ||
      PREDEFINED_NURSES[1]

    NursingWorkflowDb.createHandover({
      patientId: selectedAssignment.patientId,
      patientName: selectedAssignment.patientName,
      mrn: selectedAssignment.mrn,
      bedNo: selectedAssignment.bedNo,
      ward: selectedAssignment.ward,
      outgoingNurseId: activeNurse.id,
      outgoingNurseName: activeNurse.name,
      outgoingShift: activeNurse.defaultShift.toUpperCase(),
      incomingNurseId: incomingNurse.id,
      incomingNurseName: incomingNurse.name,
      incomingShift: incomingNurse.defaultShift.toUpperCase(),
      condition: handoverCondition,
      latestBp: noteBp || "128/82",
      pendingInstructionsCount: patientInstructions.filter(
        (i) => i.status !== "completed",
      ).length,
      medicationDue: handoverMedDue,
      pendingTasks: handoverPendingTasks,
      importantObservations: handoverObservations,
      handoverNote: handoverNotes,
    })

    setHandoverModalOpen(false)
    loadData()
  }

  // Handler for Doctor Creating Instruction
  const handleCreateDoctorInstruction = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newInstructionText.trim() || !selectedAssignment) return

    NursingWorkflowDb.createDoctorInstruction({
      patientId: selectedAssignment.patientId,
      patientName: selectedAssignment.patientName,
      admissionId: selectedAssignment.admissionId,
      bedNo: selectedAssignment.bedNo,
      ward: selectedAssignment.ward,
      doctorId: activeDoctor.id,
      doctorName: activeDoctor.name,
      doctorDept: activeDoctor.department,
      instructionText: newInstructionText.trim(),
      priority: newInstructionPriority,
    })

    setDoctorInstructionModalOpen(false)
    setNewInstructionText("")
    loadData()
  }

  // Handler for Reassignment (Charge Nurse / Supervisor)
  const handleSaveReassignment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAssignment) return

    NursingWorkflowDb.reassignPatient(
      selectedAssignment.patientId,
      reassignNurseId,
      reassignShift,
      activeNurse.name,
    )

    setReassignModalOpen(false)
    loadData()
  }

  return (
    <div className="w-full bg-[#F8FAFC] min-h-screen text-[#0F172A] font-sans pb-24">
      {/* ── 1. ENTERPRISE AUTHENTICATED STAFF CONTEXT BAR ── */}
      <div className="w-full bg-[#0F172A] text-white px-6 sm:px-8 py-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#1B4FD8] flex items-center justify-center font-bold text-white text-base shadow-xs">
            {currentUserType === "doctor" ? "👨‍⚕️" : "👩‍⚕️"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-sm sm:text-base">
                {currentUserType === "doctor"
                  ? activeDoctor.name
                  : activeNurse.name}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#1E293B] text-[#93C5FD] rounded uppercase">
                {currentUserType === "doctor"
                  ? activeDoctor.id
                  : activeNurse.id}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-[#166534] text-[#BBF7D0] rounded">
                {currentUserType === "doctor"
                  ? activeDoctor.department
                  : activeNurse.title}
              </span>
            </div>
            <div className="text-xs text-[#94A3B8] flex items-center gap-2 mt-0.5">
              <span>
                {currentUserType === "doctor"
                  ? activeDoctor.specialty
                  : activeNurse.unit}
              </span>
              <span>•</span>
              <span className="text-[#38BDF8] font-medium">
                {currentUserType === "doctor"
                  ? "Attending Consultant"
                  : `${activeNurse.defaultShift.toUpperCase()} Shift (07:00–15:00)`}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Shift / Staff Switcher for interactive role demo */}
        <div className="flex items-center gap-2 bg-[#1E293B] p-1.5 rounded-lg border border-[#334155]">
          <span className="text-[11px] font-semibold text-[#94A3B8] px-1 hidden sm:inline">
            Role Switch:
          </span>
          <select
            value={
              currentUserType === "doctor"
                ? `doc_${activeDoctor.id}`
                : `nurse_${activeNurse.id}`
            }
            onChange={(e) => {
              const val = e.target.value
              if (val.startsWith("doc_")) {
                const docId = val.replace("doc_", "")
                const doc =
                  PREDEFINED_DOCTORS.find((d) => d.id === docId) ||
                  PREDEFINED_DOCTORS[0]
                setActiveDoctor(doc)
                setCurrentUserType("doctor")
              } else {
                const nurseId = val.replace("nurse_", "")
                const nurse =
                  PREDEFINED_NURSES.find((n) => n.id === nurseId) ||
                  PREDEFINED_NURSES[0]
                setActiveNurse(nurse)
                setCurrentUserType("nurse")
              }
            }}
            className="bg-[#0F172A] text-white text-xs font-semibold px-2.5 py-1 rounded border border-[#475569] focus:outline-none focus:border-[#38BDF8]"
          >
            <optgroup label="Nursing Staff (Individual Accounts)">
              <option value="nurse_N001">
                Jessica Carter, RN (Morning · Cardiology CCU)
              </option>
              <option value="nurse_N002">
                Michael Lee, RN (Evening · Cardiology CCU)
              </option>
              <option value="nurse_N003">
                Sarah Wilson, RN (Morning · 3N Med/Surg)
              </option>
              <option value="nurse_N004">
                Priya Sharma, RN (Night · ICU Specialist)
              </option>
              <option value="nurse_N005">
                David Miller, RN (Morning · 4S Surgical)
              </option>
              <option value="nurse_N000">
                Elena Rostova, RN (Charge Nurse / Supervisor)
              </option>
            </optgroup>
            <optgroup label="Attending Doctors (Clinical Loop)">
              <option value="doc_DOC-101">
                Dr. Arjun Rao (Cardiology Consultant)
              </option>
              <option value="doc_DOC-4401">
                Dr. Vikram Seth (Critical Care / Internal Medicine)
              </option>
              <option value="doc_DOC-3001">
                Dr. M. Anderson (General Inpatient Medicine)
              </option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* ── 2. NURSE DASHBOARD WORKLOAD SUMMARY ── */}
      <div className="px-6 sm:px-8 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-6">
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              My Patients
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] font-mono mt-1">
              {workloadSummary.myPatientsCount}
            </div>
            <div className="text-[11px] text-[#16A34A] font-semibold mt-1">
              Active Bed Stays
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Pending Instructions
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#1B4FD8] font-mono mt-1">
              {workloadSummary.pendingInstructionsCount}
            </div>
            <div className="text-[11px] text-[#1B4FD8] font-semibold mt-1">
              Doctor Orders Due
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Tasks Due
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#D97706] font-mono mt-1">
              {workloadSummary.tasksDueCount}
            </div>
            <div className="text-[11px] text-[#D97706] font-semibold mt-1">
              Vitals & Meds
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Unread Messages
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#7C3AED] font-mono mt-1">
              {workloadSummary.unreadMessagesCount}
            </div>
            <div className="text-[11px] text-[#7C3AED] font-semibold mt-1">
              Doctor Updates
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs col-span-2 sm:col-span-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Handover Status
            </div>
            <div className="text-lg font-extrabold text-[#0F172A] mt-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] animate-pulse"></span>
              Shift Active
            </div>
            <div className="text-[11px] text-[#64748B] mt-0.5">
              Ready for Transfer
            </div>
          </div>
        </div>

        {/* ── 3. MAIN WORKSPACE CONTAINER (MY PATIENTS + PATIENT CLINICAL WORKSPACE) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: MY PATIENTS LIST (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="p-4 bg-white border-b border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-[#0F172A] uppercase tracking-wider m-0">
                    My Patients ({myPatients.length})
                  </h2>
                  <p className="text-[11px] text-[#64748B] m-0 mt-0.5">
                    {activeNurse.unit} ·{" "}
                    {activeNurse.defaultShift.toUpperCase()} Shift
                  </p>
                </div>
                {activeNurse.role === "Supervisor" && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-[#EFF6FF] text-[#1B4FD8] rounded">
                    Supervisor View
                  </span>
                )}
              </div>

              {/* Patient Cards List */}
              <div className="divide-y divide-[#F1F5F9] max-h-[calc(100vh-280px)] overflow-y-auto">
                {myPatients.length === 0 ? (
                  <div className="p-8 text-center text-[#64748B]">
                    <div className="text-3xl mb-2">🛏️</div>
                    <p className="text-xs font-bold text-[#0F172A]">
                      No Assigned Patients
                    </p>
                    <p className="text-[11px] text-[#64748B] mt-1">
                      When patients are admitted to beds in {activeNurse.unit},
                      they will appear here.
                    </p>
                  </div>
                ) : (
                  myPatients.map((patient) => {
                    const isSelected = patient.patientId === selectedPatientId
                    const patientPendingIns = instructions.filter(
                      (i) =>
                        i.patientId === patient.patientId &&
                        i.status !== "completed",
                    ).length
                    const patientUnreadMsgs = messages.filter(
                      (m) =>
                        m.patientId === patient.patientId &&
                        m.senderRole === "doctor" &&
                        !m.read,
                    ).length

                    return (
                      <div
                        key={patient.id}
                        onClick={() => setSelectedPatientId(patient.patientId)}
                        className={`p-4 cursor-pointer transition-all ${
                          isSelected
                            ? "bg-[#EFF6FF] border-l-4 border-[#1B4FD8]"
                            : "hover:bg-[#F8FAFC]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 text-xs font-mono font-extrabold bg-[#0F172A] text-white rounded">
                              Bed {patient.bedNo}
                            </span>
                            <span className="text-xs text-[#64748B] font-mono">
                              MRN #{patient.mrn}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              patient.acuity === 1
                                ? "bg-[#FEE2E2] text-[#DC2626]"
                                : "bg-[#DCFCE7] text-[#15803D]"
                            }`}
                          >
                            Acuity {patient.acuity}
                          </span>
                        </div>

                        <div className="mt-2">
                          <div className="font-extrabold text-[14px] text-[#0F172A]">
                            {patient.patientName}
                          </div>
                          <div className="text-xs text-[#64748B] mt-0.5">
                            {patient.department} · {patient.ward}
                          </div>
                          <div className="text-xs font-medium text-[#334155] mt-0.5">
                            Attending:{" "}
                            <strong>{patient.attendingDoctor}</strong>
                          </div>
                        </div>

                        {/* Badges & Workload Indicators */}
                        <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
                          {patientPendingIns > 0 && (
                            <span className="px-2 py-0.5 rounded bg-[#FEF3C7] text-[#92400E] font-bold border border-[#FDE68A]">
                              {patientPendingIns} Instruction
                              {patientPendingIns > 1 ? "s" : ""}
                            </span>
                          )}
                          {patientUnreadMsgs > 0 && (
                            <span className="px-2 py-0.5 rounded bg-[#F3E8FF] text-[#7C3AED] font-bold border border-[#E9D5FF]">
                              {patientUnreadMsgs} Message
                              {patientUnreadMsgs > 1 ? "s" : ""}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] font-mono font-medium">
                            BP 128/82 · HR 78
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-[#E2E8F0]/60">
                          <span className="text-[11px] text-[#64748B]">
                            Nurse:{" "}
                            <strong className="text-[#0F172A]">
                              {patient.nurseName}
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedPatientId(patient.patientId)
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold text-[#1B4FD8] hover:text-white bg-white hover:bg-[#1B4FD8] border border-[#BFDBFE] rounded transition-colors"
                          >
                            Open Patient →
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column: PATIENT NURSING WORKSPACE (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {selectedAssignment ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden flex flex-col">
                {/* ── PATIENT CLINICAL BANNER ── */}
                <div className="p-5 bg-[#0F172A] text-white border-b border-[#1E293B]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 text-xs font-mono font-extrabold bg-[#1B4FD8] text-white rounded">
                          Bed {selectedAssignment.bedNo}
                        </span>
                        <span className="text-xs text-[#94A3B8] font-mono">
                          Room {selectedAssignment.roomNo} ·{" "}
                          {selectedAssignment.ward}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-[#DCFCE7] text-[#15803D] rounded">
                          Active Inpatient
                        </span>
                      </div>
                      <h1 className="text-xl sm:text-2xl font-extrabold text-white m-0">
                        {selectedAssignment.patientName}
                      </h1>
                      <div className="text-xs text-[#94A3B8] font-mono mt-1">
                        MRN: #{selectedAssignment.mrn} · Admission ID:{" "}
                        {selectedAssignment.admissionId}
                      </div>
                    </div>

                    {/* Quick Action Controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setNoteModalOpen(true)}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#153eb3] rounded-md transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        + Add Nursing Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setHandoverModalOpen(true)}
                        className="px-3.5 py-2 text-xs font-bold text-[#0F172A] bg-white hover:bg-[#F1F5F9] rounded-md transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        ⇄ Shift Handover
                      </button>
                      {currentUserType === "doctor" && (
                        <button
                          type="button"
                          onClick={() => setDoctorInstructionModalOpen(true)}
                          className="px-3.5 py-2 text-xs font-bold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-md transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          + Doctor Instruction
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setReassignModalOpen(true)}
                        className="px-2.5 py-2 text-xs font-bold text-[#CBD5E1] bg-[#1E293B] hover:bg-[#334155] rounded-md transition-colors"
                        title="Reassign Bed to another Nurse"
                      >
                        ⚙ Assign
                      </button>
                    </div>
                  </div>

                  {/* Clinical Subheader: Doctor, Assigned Nurse, Shift, Alerts */}
                  <div className="mt-4 pt-3 border-t border-[#1E293B] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-[#94A3B8] block text-[11px]">
                        Attending Doctor
                      </span>
                      <strong className="text-white">
                        {selectedAssignment.attendingDoctor}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#94A3B8] block text-[11px]">
                        Current Nurse
                      </span>
                      <strong className="text-[#38BDF8]">
                        {selectedAssignment.nurseName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#94A3B8] block text-[11px]">
                        Active Shift
                      </span>
                      <strong className="text-white">
                        {selectedAssignment.shiftLabel}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#94A3B8] block text-[11px]">
                        Clinical Alerts
                      </span>
                      <span className="text-[#FCA5A5] font-bold">
                        {selectedAssignment.allergies || "Penicillin"} ·{" "}
                        {selectedAssignment.codeStatus || "Full Code"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── FIVE CLEAN MAIN NAVIGATION TABS ── */}
                <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-5 flex items-center gap-2 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === "overview"
                        ? "border-[#1B4FD8] text-[#1B4FD8]"
                        : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    📊 Overview
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("instructions")}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      activeTab === "instructions"
                        ? "border-[#1B4FD8] text-[#1B4FD8]"
                        : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    <span>🩺 Doctor Instructions</span>
                    {patientInstructions.filter((i) => i.status !== "completed")
                      .length > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[#FEF3C7] text-[#92400E] font-bold font-mono">
                        {
                          patientInstructions.filter(
                            (i) => i.status !== "completed",
                          ).length
                        }
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("care")}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      activeTab === "care"
                        ? "border-[#1B4FD8] text-[#1B4FD8]"
                        : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    <span>📝 Nursing Care & Notes</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[#F1F5F9] text-[#64748B] font-mono">
                      {patientNotes.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("messages")}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      activeTab === "messages"
                        ? "border-[#1B4FD8] text-[#1B4FD8]"
                        : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    <span>💬 Messages</span>
                    {patientMessages.filter((m) => !m.read).length > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[#DCFCE7] text-[#15803D] font-bold font-mono">
                        {patientMessages.filter((m) => !m.read).length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("handover")}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === "handover"
                        ? "border-[#1B4FD8] text-[#1B4FD8]"
                        : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    📜 Handover & Timeline
                  </button>
                </div>

                {/* ── TAB CONTENT AREAS ── */}
                <div className="p-6">
                  {/* TAB 1: OVERVIEW */}
                  {activeTab === "overview" && (
                    <div className="space-y-6">
                      {/* Priority Alerts */}
                      <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-none p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#1B4FD8]">
                            Current Nursing Priorities
                          </div>
                          <div className="text-xs text-[#1E3A8A] font-medium mt-1">
                            {
                              patientInstructions.filter(
                                (i) =>
                                  i.status === "pending" ||
                                  i.status === "in_progress",
                              ).length
                            }{" "}
                            Active Doctor Instructions · 1 Medication Due at
                            21:00 · Telemetry Continuous
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab("instructions")}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-[#1B4FD8] rounded shadow-xs"
                          >
                            Review Orders
                          </button>
                          <button
                            type="button"
                            onClick={() => setNoteModalOpen(true)}
                            className="px-3 py-1.5 text-xs font-bold text-[#1B4FD8] bg-white border border-[#BFDBFE] rounded"
                          >
                            Record Vitals
                          </button>
                        </div>
                      </div>

                      {/* Observations / Vitals Grid */}
                      <div>
                        <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">
                          Latest Clinical Observations
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-none">
                            <span className="text-[11px] text-[#64748B] block">
                              Blood Pressure
                            </span>
                            <strong className="text-lg font-mono text-[#0F172A] block mt-0.5">
                              128/82
                            </strong>
                            <span className="text-[10px] text-[#16A34A] font-semibold">
                              Normal Baseline
                            </span>
                          </div>
                          <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-none">
                            <span className="text-[11px] text-[#64748B] block">
                              Heart Rate
                            </span>
                            <strong className="text-lg font-mono text-[#0F172A] block mt-0.5">
                              78 bpm
                            </strong>
                            <span className="text-[10px] text-[#16A34A] font-semibold">
                              Sinus Rhythm
                            </span>
                          </div>
                          <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-none">
                            <span className="text-[11px] text-[#64748B] block">
                              Oxygen (SpO₂)
                            </span>
                            <strong className="text-lg font-mono text-[#0F172A] block mt-0.5">
                              97%
                            </strong>
                            <span className="text-[10px] text-[#16A34A] font-semibold">
                              Room Air
                            </span>
                          </div>
                          <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-none">
                            <span className="text-[11px] text-[#64748B] block">
                              Temperature
                            </span>
                            <strong className="text-lg font-mono text-[#0F172A] block mt-0.5">
                              98.4°F
                            </strong>
                            <span className="text-[10px] text-[#16A34A] font-semibold">
                              Afebrile
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Latest Signed Nursing Update */}
                      <div>
                        <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                          Latest Shift Update
                        </div>
                        {patientNotes.length > 0 ? (
                          <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-none p-4">
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="font-bold text-[#0F172A]">
                                {patientNotes[0].authorNurseName} (
                                {patientNotes[0].authorNurseId})
                              </span>
                              <span className="text-[#64748B] font-mono">
                                {new Date(
                                  patientNotes[0].createdAt,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-[#334155] m-0 leading-relaxed">
                              <strong>Assessment:</strong>{" "}
                              {patientNotes[0].assessment}
                              <br />
                              <strong>Observation:</strong>{" "}
                              {patientNotes[0].observation}
                              <br />
                              <strong>Intervention:</strong>{" "}
                              {patientNotes[0].intervention}
                              <br />
                              <strong>Follow-Up:</strong>{" "}
                              {patientNotes[0].followUp}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-[#64748B]">
                            No nursing notes recorded yet for this patient.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: DOCTOR INSTRUCTIONS */}
                  {activeTab === "instructions" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-[#0F172A] m-0">
                            Attending Doctor Instructions (
                            {patientInstructions.length})
                          </h3>
                          <p className="text-xs text-[#64748B] m-0">
                            Prescribed by {selectedAssignment.attendingDoctor}.
                            Instructions belong permanently to this patient.
                          </p>
                        </div>
                        {currentUserType === "doctor" && (
                          <button
                            type="button"
                            onClick={() => setDoctorInstructionModalOpen(true)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-[#16A34A] rounded shadow-xs cursor-pointer"
                          >
                            + Issue New Order
                          </button>
                        )}
                      </div>

                      {patientInstructions.length === 0 ? (
                        <div className="p-8 text-center text-[#64748B] bg-[#F8FAFC] rounded-none border border-[#E2E8F0]">
                          <p className="text-xs font-medium">
                            No pending doctor instructions for this patient.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {patientInstructions.map((ins) => (
                            <div
                              key={ins.id}
                              className={`p-4 rounded-lg border transition-all ${
                                ins.status === "completed"
                                  ? "bg-[#F8FAFC] border-[#E2E8F0] opacity-80"
                                  : ins.priority === "urgent"
                                    ? "bg-[#FEF2F2] border-[#FECACA]"
                                    : "bg-white border-[#CBD5E1]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-[#64748B]">
                                      {new Date(
                                        ins.createdAt,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    <span className="text-xs font-extrabold text-[#0F172A]">
                                      {ins.doctorName}
                                    </span>
                                    <span className="text-[11px] text-[#64748B]">
                                      ({ins.doctorDept})
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                                        ins.priority === "urgent"
                                          ? "bg-[#DC2626] text-white"
                                          : "bg-[#EFF6FF] text-[#1B4FD8]"
                                      }`}
                                    >
                                      {ins.priority}
                                    </span>
                                  </div>

                                  {/* Immutable Original Instruction */}
                                  <p className="text-sm font-semibold text-[#0F172A] mt-2 mb-1">
                                    {ins.instructionText}
                                  </p>

                                  {/* Status & Acknowledgement Log */}
                                  <div className="text-xs text-[#64748B] mt-2 space-y-0.5">
                                    {ins.acknowledgedAt && (
                                      <div>
                                        ✓ Acknowledged by{" "}
                                        <strong>
                                          {ins.acknowledgedByNurseName}
                                        </strong>{" "}
                                        at{" "}
                                        {new Date(
                                          ins.acknowledgedAt,
                                        ).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </div>
                                    )}
                                    {ins.completedAt && (
                                      <div className="text-[#166534] font-medium">
                                        ✓ Completed by{" "}
                                        <strong>
                                          {ins.completedByNurseName}
                                        </strong>
                                        : {ins.completionNote}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Lifecycle Action Buttons */}
                                <div className="flex items-center gap-1.5 self-start">
                                  {ins.status === "pending" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAcknowledgeInstruction(ins.id)
                                      }
                                      className="px-3 py-1.5 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#153eb3] rounded shadow-xs"
                                    >
                                      Acknowledge
                                    </button>
                                  )}
                                  {ins.status === "acknowledged" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStartInstruction(ins.id)
                                      }
                                      className="px-3 py-1.5 text-xs font-bold text-[#1B4FD8] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] rounded"
                                    >
                                      Start Care
                                    </button>
                                  )}
                                  {ins.status === "in_progress" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCompleteInstruction(ins.id)
                                      }
                                      className="px-3 py-1.5 text-xs font-bold text-white bg-[#16A34A] hover:bg-[#15803D] rounded shadow-xs"
                                    >
                                      Mark Done
                                    </button>
                                  )}
                                  {ins.status === "completed" && (
                                    <span className="px-2.5 py-1 text-[11px] font-bold bg-[#DCFCE7] text-[#15803D] rounded-full">
                                      ✓ Completed
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: NURSING CARE & NOTES */}
                  {activeTab === "care" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-[#0F172A] m-0">
                            Nursing Clinical Care & Signed Notes (
                            {patientNotes.length})
                          </h3>
                          <p className="text-xs text-[#64748B] m-0">
                            Permanent clinical notes retain authentic nurse
                            authorship and shift timeline.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNoteModalOpen(true)}
                          className="px-3.5 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#153eb3] rounded shadow-xs cursor-pointer"
                        >
                          + Add Nursing Note
                        </button>
                      </div>

                      {patientNotes.length === 0 ? (
                        <div className="p-8 text-center text-[#64748B] bg-[#F8FAFC] rounded-none border border-[#E2E8F0]">
                          <p className="text-xs font-medium">
                            No nursing notes entered yet. Click "+ Add Nursing
                            Note" above.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {patientNotes.map((n) => (
                            <div
                              key={n.id}
                              className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-none"
                            >
                              <div className="flex items-center justify-between text-xs pb-2 border-b border-[#E2E8F0]">
                                <div>
                                  <strong className="text-[#0F172A]">
                                    {n.authorNurseName}
                                  </strong>
                                  <span className="text-[#64748B] font-mono ml-1.5">
                                    ({n.authorNurseId})
                                  </span>
                                  <span className="text-[#1B4FD8] font-semibold ml-2">
                                    [{n.shiftLabel}]
                                  </span>
                                </div>
                                <span className="text-[#64748B] font-mono">
                                  {new Date(n.createdAt).toLocaleDateString()}{" "}
                                  {new Date(n.createdAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#334155]">
                                <div>
                                  <span className="font-bold text-[#0F172A] block">
                                    Assessment:
                                  </span>
                                  {n.assessment}
                                </div>
                                <div>
                                  <span className="font-bold text-[#0F172A] block">
                                    Observation:
                                  </span>
                                  {n.observation}
                                </div>
                                <div>
                                  <span className="font-bold text-[#0F172A] block">
                                    Intervention:
                                  </span>
                                  {n.intervention}
                                </div>
                                <div>
                                  <span className="font-bold text-[#0F172A] block">
                                    Patient Response:
                                  </span>
                                  {n.patientResponse}
                                </div>
                              </div>

                              {n.vitals && (
                                <div className="mt-3 p-2 bg-white rounded border border-[#E2E8F0] flex items-center gap-4 text-xs font-mono">
                                  <span>
                                    BP: <strong>{n.vitals.bp}</strong>
                                  </span>
                                  <span>
                                    HR: <strong>{n.vitals.hr}</strong>
                                  </span>
                                  <span>
                                    SpO₂: <strong>{n.vitals.spo2}%</strong>
                                  </span>
                                  <span>
                                    Temp: <strong>{n.vitals.temp}</strong>
                                  </span>
                                  <span>
                                    RR: <strong>{n.vitals.rr}</strong>
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: CLINICAL MESSAGES (Doctor <-> Nurse) */}
                  {activeTab === "messages" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-[#0F172A] m-0">
                          Doctor ↔ Nurse Clinical Communication
                        </h3>
                        <p className="text-xs text-[#64748B] m-0">
                          Patient-specific direct chat between Attending
                          Physician ({selectedAssignment.attendingDoctor}) and
                          Assigned Nurse ({selectedAssignment.nurseName}).
                        </p>
                      </div>

                      {/* Chat Messages Thread */}
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-none p-4 h-80 overflow-y-auto space-y-3">
                        {patientMessages.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-[#64748B]">
                            No clinical messages exchanged yet for this patient.
                          </div>
                        ) : (
                          patientMessages.map((m) => (
                            <div
                              key={m.id}
                              className={`flex flex-col max-w-[80%] ${
                                m.senderRole === "nurse"
                                  ? "ml-auto items-end"
                                  : "mr-auto items-start"
                              }`}
                            >
                              <div className="flex items-center gap-2 text-[10px] text-[#64748B] mb-1">
                                <span className="font-bold text-[#0F172A]">
                                  {m.senderName}
                                </span>
                                <span>•</span>
                                <span>
                                  {new Date(m.createdAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                              </div>
                              <div
                                className={`p-3 rounded-xl text-xs leading-relaxed ${
                                  m.senderRole === "nurse"
                                    ? "bg-[#1B4FD8] text-white rounded-br-none"
                                    : "bg-white text-[#0F172A] border border-[#CBD5E1] rounded-bl-none shadow-2xs"
                                }`}
                              >
                                {m.messageText}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Message Input Box */}
                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <input
                          type="text"
                          placeholder={
                            currentUserType === "doctor"
                              ? `Message assigned nurse (${selectedAssignment.nurseName})...`
                              : `Message attending doctor (${selectedAssignment.attendingDoctor})...`
                          }
                          value={newMessageText}
                          onChange={(e) => setNewMessageText(e.target.value)}
                          className="flex-1 px-3.5 py-2 text-xs bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#1B4FD8]"
                        />
                        <button
                          type="submit"
                          disabled={!newMessageText.trim()}
                          className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#153eb3] disabled:opacity-50 rounded-md transition-colors shadow-xs cursor-pointer"
                        >
                          Send Message
                        </button>
                      </form>
                    </div>
                  )}

                  {/* TAB 5: HANDOVER & UNIFIED TIMELINE */}
                  {activeTab === "handover" && (
                    <div className="space-y-6">
                      {/* Handover Action Banner */}
                      <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-none p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">
                            Shift Handover Protocol
                          </div>
                          <div className="text-xs text-[#15803D] mt-0.5">
                            Transfer active patient care safely to the incoming
                            shift nurse. All clinical notes and history remain
                            permanent.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHandoverModalOpen(true)}
                          className="px-4 py-2 text-xs font-bold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-md shadow-xs cursor-pointer whitespace-nowrap"
                        >
                          ⇄ Complete Shift Handover
                        </button>
                      </div>

                      {/* Unified Chronological Patient Timeline */}
                      <div>
                        <h3 className="text-sm font-bold text-[#0F172A] mb-3">
                          Unified Patient Nursing Timeline (
                          {patientTimeline.length} Events)
                        </h3>
                        <div className="space-y-3 relative pl-4 border-l-2 border-[#CBD5E1]">
                          {patientTimeline.map((ev) => (
                            <div key={ev.id} className="relative group">
                              {/* Timeline Dot */}
                              <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#1B4FD8] border-2 border-white ring-2 ring-[#CBD5E1]"></div>
                              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-xs">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[#64748B] font-bold">
                                      {ev.timeDisplay}
                                    </span>
                                    <strong className="text-[#0F172A]">
                                      {ev.authorName}
                                    </strong>
                                    <span className="text-[11px] text-[#64748B]">
                                      ({ev.authorRole})
                                    </span>
                                  </div>
                                  {ev.badge && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-[#EFF6FF] text-[#1B4FD8] rounded">
                                      {ev.badge}
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-[#1E293B] mt-1">
                                  {ev.title}
                                </div>
                                <p className="text-[#475569] m-0 mt-0.5 leading-relaxed">
                                  {ev.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-[#64748B]">
                <div className="text-4xl mb-3">📋</div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  No Patient Selected
                </h3>
                <p className="text-xs text-[#64748B] max-w-sm mx-auto mt-1">
                  Select an assigned patient from the list on the left to view
                  the clinical nursing workspace.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MODAL 1: ADD NURSING NOTE ── */}
      {noteModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-[#E2E8F0] overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 bg-[#0F172A] text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold m-0">
                  Add Clinical Nursing Note
                </h2>
                <div className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  {selectedAssignment.patientName} · Bed{" "}
                  {selectedAssignment.bedNo} · Author: {activeNurse.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="text-[#94A3B8] hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="p-6 space-y-3 text-xs">
              {/* Quick Vitals Row */}
              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                <span className="font-bold text-[#0F172A] block mb-1.5 uppercase text-[10px] tracking-wider">
                  Vital Signs
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  <div>
                    <label className="text-[10px] text-[#64748B] block">
                      BP
                    </label>
                    <input
                      type="text"
                      value={noteBp}
                      onChange={(e) => setNoteBp(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#64748B] block">
                      HR (bpm)
                    </label>
                    <input
                      type="text"
                      value={noteHr}
                      onChange={(e) => setNoteHr(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#64748B] block">
                      SpO₂ (%)
                    </label>
                    <input
                      type="text"
                      value={noteSpo2}
                      onChange={(e) => setNoteSpo2(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#64748B] block">
                      Temp
                    </label>
                    <input
                      type="text"
                      value={noteTemp}
                      onChange={(e) => setNoteTemp(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#64748B] block">
                      RR
                    </label>
                    <input
                      type="text"
                      value={noteRr}
                      onChange={(e) => setNoteRr(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-[#CBD5E1] rounded text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Assessment
                </label>
                <input
                  type="text"
                  placeholder="e.g. Patient resting comfortably, alert and oriented x4..."
                  value={noteAssessment}
                  onChange={(e) => setNoteAssessment(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Observation
                </label>
                <input
                  type="text"
                  placeholder="e.g. Telemetry normal sinus rhythm, denies chest pain or shortness of breath..."
                  value={noteObservation}
                  onChange={(e) => setNoteObservation(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Intervention
                </label>
                <input
                  type="text"
                  placeholder="e.g. Administered morning maintenance medication as ordered..."
                  value={noteIntervention}
                  onChange={(e) => setNoteIntervention(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Patient Response
                </label>
                <input
                  type="text"
                  placeholder="e.g. Patient tolerated well, no adverse symptoms reported..."
                  value={notePatientResponse}
                  onChange={(e) => setNotePatientResponse(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Follow-Up & Plan
                </label>
                <input
                  type="text"
                  placeholder="e.g. Continue cardiac monitoring, repeat BP in 30 mins per Dr. Rao order..."
                  value={noteFollowUp}
                  onChange={(e) => setNoteFollowUp(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNoteModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#64748B] hover:bg-[#F1F5F9] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#153eb3] rounded shadow-xs"
                >
                  Sign & Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: SHIFT HANDOVER ── */}
      {handoverModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-[#E2E8F0] overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 bg-[#166534] text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold m-0">
                  Shift Handover Protocol
                </h2>
                <div className="text-xs text-[#BBF7D0] font-mono mt-0.5">
                  Outgoing Nurse: {activeNurse.name} (
                  {activeNurse.defaultShift.toUpperCase()})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHandoverModalOpen(false)}
                className="text-[#BBF7D0] hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSaveHandover}
              className="p-6 space-y-3 text-xs"
            >
              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Incoming Shift Nurse
                </label>
                <select
                  value={handoverIncomingNurseId}
                  onChange={(e) => setHandoverIncomingNurseId(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs font-semibold text-[#0F172A]"
                >
                  {PREDEFINED_NURSES.filter((n) => n.id !== activeNurse.id).map(
                    (n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} · {n.defaultShift.toUpperCase()} Shift (
                        {n.unit})
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#0F172A] block mb-1">
                    Current Condition
                  </label>
                  <select
                    value={handoverCondition}
                    onChange={(e) =>
                      setHandoverCondition(e.target.value as any)
                    }
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs font-semibold"
                  >
                    <option value="Stable">Stable</option>
                    <option value="Improving">Improving</option>
                    <option value="Guarded">Guarded</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[#0F172A] block mb-1">
                    Medication Due Next
                  </label>
                  <input
                    type="text"
                    value={handoverMedDue}
                    onChange={(e) => setHandoverMedDue(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Pending Care & Tasks
                </label>
                <input
                  type="text"
                  value={handoverPendingTasks}
                  onChange={(e) => setHandoverPendingTasks(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Important Observations
                </label>
                <input
                  type="text"
                  value={handoverObservations}
                  onChange={(e) => setHandoverObservations(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Handover Instructions Note
                </label>
                <textarea
                  rows={2}
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHandoverModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#64748B] hover:bg-[#F1F5F9] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#16A34A] hover:bg-[#15803D] rounded shadow-xs"
                >
                  Complete Handover
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: CREATE DOCTOR INSTRUCTION ── */}
      {doctorInstructionModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-[#E2E8F0] overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 bg-[#0F172A] text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold m-0">
                  Issue Doctor Instruction
                </h2>
                <div className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  Doctor: {activeDoctor.name} ➔ Patient:{" "}
                  {selectedAssignment.patientName} (Bed{" "}
                  {selectedAssignment.bedNo})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDoctorInstructionModalOpen(false)}
                className="text-[#94A3B8] hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateDoctorInstruction}
              className="p-6 space-y-3 text-xs"
            >
              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Priority Level
                </label>
                <select
                  value={newInstructionPriority}
                  onChange={(e) =>
                    setNewInstructionPriority(e.target.value as any)
                  }
                  className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded text-xs font-semibold"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT / Emergency</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Clinical Instruction Details
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Monitor BP every 30 minutes. Repeat ECG at 11:00 AM. Notify if systolic BP < 90..."
                  value={newInstructionText}
                  onChange={(e) => setNewInstructionText(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded text-xs"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDoctorInstructionModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#64748B] hover:bg-[#F1F5F9] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newInstructionText.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 rounded shadow-xs"
                >
                  Issue Instruction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 4: REASSIGN NURSE (SUPERVISOR / CHARGE NURSE) ── */}
      {reassignModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-[#E2E8F0] overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 bg-[#0F172A] text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold m-0">
                  Assign Bed to Nurse
                </h2>
                <div className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  Patient: {selectedAssignment.patientName} · Bed{" "}
                  {selectedAssignment.bedNo}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="text-[#94A3B8] hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSaveReassignment}
              className="p-6 space-y-3 text-xs"
            >
              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Select Nurse Staff
                </label>
                <select
                  value={reassignNurseId}
                  onChange={(e) => setReassignNurseId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded text-xs font-semibold text-[#0F172A]"
                >
                  {PREDEFINED_NURSES.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} · {n.unit} ({n.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-[#0F172A] block mb-1">
                  Shift
                </label>
                <select
                  value={reassignShift}
                  onChange={(e) => setReassignShift(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded text-xs font-semibold"
                >
                  <option value="morning">Morning (07:00–15:00)</option>
                  <option value="evening">Evening (15:00–23:00)</option>
                  <option value="night">Night (23:00–07:00)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReassignModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#64748B] hover:bg-[#F1F5F9] rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#153eb3] rounded shadow-xs"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
