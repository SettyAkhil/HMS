import React, { useState, useEffect, useRef } from "react"
import toast from "react-hot-toast"
import { useStickyState } from "../hooks/useStickyState"
import { AppointmentBookingModal } from "./Appointments"
import {
  bookAppointment,
  type BookedAppointment,
} from "../services/appointmentBooking"
import { Icon } from "./icons"
import { Btn, Input } from "./shared"
import {
  db,
  DBPatient,
  DBOPEncounter,
  findMatchingPatient,
} from "../services/db"
import PatientJourneyModal from "./PatientJourneyModal"
import { useBranding } from "./branding/DocumentBranding"
import { OpCardPreview, cardBarcodeValue, opCardDataFor, printOpCard } from "./opcard/OpCard"
import { openJourneyForCode } from "./opcard/JourneyScan"
import MessageDeliveryStatus from "./messaging/MessageDeliveryStatus"

// Accurate age calculation from Date of Birth
const calculateAge = (dobString: string): number => {
  if (!dobString) return 0
  const birthDate = new Date(dobString)
  if (isNaN(birthDate.getTime())) return 0
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return Math.max(0, age)
}

export default function Registration({
  onComplete,
  onBack,
  onBookAppointment,
  onGoToBilling,
  /** Reception's next step: symptom triage picks the doctor on the appointment desk. */
}: {
  onComplete?: () => void
  onBack?: () => void
  onBookAppointment?: (patient: DBOPEncounter) => void
  onGoToBilling?: () => void
}) {
  const [activeTab, setActiveTab] =
    useStickyState<"new" | "revisit" | "appointment" | "records">(
      "registration_tab",
      "new",
    )
  const [searchQuery, setSearchQuery] = useStickyState(
    "registration_search",
    "",
  )

  // Database live state
  const [patients, setPatients] = useState<DBPatient[]>([])
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const branding = useBranding()
  const [cardCode, setCardCode] = useState("")
  const [selectedEncounter, setSelectedEncounter] =
    useState<DBOPEncounter | null>(null)

  // Appointment tab: reception books the doctor without leaving this desk.
  const [bookingOpen, setBookingOpen] = useState(false)
  const [booked, setBooked] = useState<BookedAppointment | null>(null)
  const [selectedJourneyEncounter, setSelectedJourneyEncounter] =
    useState<DBOPEncounter | null>(null)

  // Generation Audit alert state
  const [generationAlert, setGenerationAlert] = useState<{
    type: "new" | "revisit"
    umr: string
    opNumber: string
    name: string
    age: number
    phone: string
  } | null>(null)

  // Sync with DB
  const refreshFromDb = () => {
    const allPatients = db.getPatients()
    const allEncounters = db.getEncounters()
    setPatients(allPatients)
    setEncounters(allEncounters)
    if (!selectedEncounter && allEncounters.length > 0) {
      setSelectedEncounter(allEncounters[0])
    }
  }

  useEffect(() => {
    refreshFromDb()
    const unsubscribe = db.subscribe(refreshFromDb)
    return () => {
      unsubscribe()
    }
  }, [])

  // Form State
  // Draft-backed: App.tsx unmounts this screen when the user navigates, so plain
  // component state meant a half-filled patient form vanished the moment
  // reception glanced at the queue. Cleared by `resetForm` once registered.
  const [formData, setFormData, clearFormDraft] = useStickyState(
    "registration_form",
    {
      // Personal Information
      firstName: "",
      middleName: "",
      lastName: "",
      dob: "",
      age: 0,
      sex: "" as "Male" | "Female" | "Other" | "",
      // Contact Information
      phone: "",
      email: "",
      address: "",
      // Emergency Contact
      emergencyName: "",
      emergencyRelationship: "Spouse",
      emergencyPhone: "",
    },
  )

  const cardPreviewRef = useRef<HTMLDivElement>(null)

  // Handle DOB Change -> Dynamically updates Age
  const handleDobChange = (newDob: string) => {
    const computedAge = calculateAge(newDob)
    setFormData((prev) => ({
      ...prev,
      dob: newDob,
      age: computedAge,
    }))
  }

  // Handle Age Change -> Dynamically updates DOB
  const handleAgeChange = (val: string) => {
    const parsedAge = parseInt(val, 10)
    if (isNaN(parsedAge) || parsedAge < 0) {
      setFormData((prev) => ({ ...prev, age: 0 }))
      return
    }
    const currentYear = new Date().getFullYear()
    const birthYear = Math.max(1900, currentYear - parsedAge)
    const defaultDob = `${birthYear}-01-01`
    setFormData((prev) => ({
      ...prev,
      age: parsedAge,
      dob: prev.dob && calculateAge(prev.dob) === parsedAge ? prev.dob : defaultDob,
    }))
  }

  // Handle Numeric Only Phone Input (strictly numbers only, max 10 digits)
  const handlePhoneChange = (val: string) => {
    const digitsOnly = val.replace(/\D/g, "").slice(0, 10)
    setFormData((prev) => ({ ...prev, phone: digitsOnly }))
  }

  const handleEmergencyPhoneChange = (val: string) => {
    const digitsOnly = val.replace(/\D/g, "").slice(0, 10)
    setFormData((prev) => ({ ...prev, emergencyPhone: digitsOnly }))
  }

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation and edit keys (Backspace, Tab, Delete, Arrow keys, Enter, Ctrl+A/C/V/X)
    if (
      [
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key) ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return
    }
    // Block any non-digit character (words, letters, symbols)
    if (!/^\d$/.test(e.key)) {
      e.preventDefault()
    }
  }

  // Duplicate / Existing Patient Check via Matching Logic
  const enteredFullName = [
    formData.firstName,
    formData.middleName,
    formData.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
  const matchResult = findMatchingPatient(patients, {
    fullName: enteredFullName,
    dob: formData.dob || undefined,
    age: formData.dob ? formData.age : undefined,
    sex: formData.sex || undefined,
    phone: formData.phone.trim() || undefined,
  })

  const matchingExistingPatient = matchResult.match
  const candidatePatient = matchResult.nameMatchedPatient
  const mismatches = matchResult.mismatches

  // 1. Handle New Patient Registration Flow -> Creates Record -> Generates Patient ID (UMR) & OP No -> Next Step
  const handleRegisterNewPatient = (e: React.FormEvent) => {
    e.preventDefault()
    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()
    if (!firstName) {
      toast.error("Please enter patient First Name.")
      return
    }
    if (!lastName) {
      toast.error("Please enter patient Last Name.")
      return
    }

    let finalDob = formData.dob
    let finalAge = formData.age
    if (!finalDob && (!finalAge || finalAge <= 0)) {
      toast.error("Please enter patient Date of Birth or Age.")
      return
    }
    if (!finalDob && finalAge > 0) {
      const birthYear = Math.max(1900, new Date().getFullYear() - finalAge)
      finalDob = `${birthYear}-01-01`
    } else if (finalDob && (!finalAge || finalAge <= 0)) {
      finalAge = calculateAge(finalDob)
    }

    if (!formData.sex) {
      toast.error("Please select patient Sex at Birth.")
      return
    }

    const rawPhone = formData.phone || ""
    const cleanPhone = rawPhone.replace(/\D/g, "")
    const finalPhone = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone
    if (finalPhone.length < 10) {
      toast.error("Please enter a valid 10-digit mobile phone number.")
      return
    }

    // If ALL entered details match an existing record -> Route through Revisit under existing UMR
    if (matchingExistingPatient) {
      handleCreateRevisitEncounter(matchingExistingPatient)
      toast.success(
        `Revisit encounter generated for ${matchingExistingPatient.name} (${matchingExistingPatient.umr})`,
      )
      resetForm()
      return
    }

    const computedAge = finalAge || (finalDob ? calculateAge(finalDob) : 30)

    try {
      const { patient: createdPatient, encounter: createdEncounter } =
        db.registerNewPatient({
          firstName,
          middleName: formData.middleName.trim() || undefined,
          lastName,
          dob: finalDob,
          age: computedAge,
          sex: (formData.sex as "Male" | "Female" | "Other") || "Male",
          phone: finalPhone || "9876543210",
          address: formData.address.trim() || "Local Address",
        })

      setSelectedEncounter(createdEncounter)
      // Registration message: sent by patientMessaging when db announces the
      // registration (after the server write), so every desk path is covered once.
      refreshFromDb()
      toast.success(
        `Patient registered successfully! UMR: ${createdPatient.umr}, OP#: ${createdEncounter.opNumber}`,
      )
      setGenerationAlert({
        type: "new",
        umr: createdPatient.umr,
        opNumber: createdEncounter.opNumber,
        name: createdPatient.name,
        age: computedAge,
        phone: createdPatient.phone,
      })

      // Directly display the Digital Card / OP Pass of the newly registered patient
      setActiveTab("records")
      setTimeout(() => {
        cardPreviewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }, 100)

      resetForm()
    } catch (err: any) {
      console.error("Patient registration error:", err)
      toast.error(err?.message || "Failed to register patient.")
    }
  }

  const resetForm = () => {
    clearFormDraft()
    setFormData({
      firstName: "",
      middleName: "",
      lastName: "",
      dob: "",
      age: 0,
      sex: "",
      phone: "",
      email: "",
      address: "",
      emergencyName: "",
      emergencyRelationship: "Spouse",
      emergencyPhone: "",
    })
  }

  // 2. Handle Existing Patient Workflow -> View Record -> Generate Visit Pass -> Show Digital Card
  const handleCreateRevisitEncounter = (p: DBPatient) => {
    const newEncounter = db.createRevisitEncounter(p.umr)
    // Registration message: sent by patientMessaging when db announces the
    // registration (after the server write), so every desk path is covered once.

    setSelectedEncounter(newEncounter)
    setGenerationAlert({
      type: "revisit",
      umr: p.umr,
      opNumber: newEncounter.opNumber,
      name: p.name,
      age: p.age,
      phone: p.phone,
    })

    // Directly display the Digital Card / OP Pass of the existing patient
    setActiveTab("records")
    setTimeout(() => {
      cardPreviewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 100)
  }

  const handleViewOpBook = (encounter: DBOPEncounter) => {
    setSelectedEncounter(encounter)
    setActiveTab("records")
    setTimeout(() => {
      cardPreviewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 100)
  }

  // Filtered patients for revisit search tab
  const filteredPatients = db.searchPatients(searchQuery)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5] overflow-hidden">
      {/* Top Header */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="text-[#64748B] hover:text-gray-900 transition-colors rotate-180 cursor-pointer"
            >
              <Icon.ChevronRight />
            </button>
          )}
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              Patient Registration Desk
            </h1>
            <p className="text-[11.5px] text-[#64748B]">
              Register new patients, issue permanent UMR &amp; OP passes, or
              manage return revisits.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-[#DDE2EC]">
            <button
              onClick={() => setActiveTab("new")}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
                activeTab === "new"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              + Registration
            </button>
            <button
              onClick={() => setActiveTab("revisit")}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
                activeTab === "revisit"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              🔄 Existing Patient Revisit
            </button>
            <button
              onClick={() => setActiveTab("appointment")}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
                activeTab === "appointment"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              🗓 Book Appointment
            </button>
            <button
              onClick={() => setActiveTab("records")}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${
                activeTab === "records"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              📋 OP Book &amp; Registry ({encounters.length})
            </button>
          </div>
        </div>
      </div>

      {/* Clinical Journey Modal */}
      <PatientJourneyModal
        encounter={selectedJourneyEncounter}
        onClose={() => setSelectedJourneyEncounter(null)}
      />

      {/* Main Workspace */}
      <div className="flex-1 overflow-y-auto p-6 w-full space-y-6">
        {/* ── GENERATION AUDIT BANNER ─────────────────────────────────── */}
        {bookingOpen && (
          <AppointmentBookingModal
            initialEncounter={selectedEncounter}
            onClose={() => setBookingOpen(false)}
            onSchedule={(booking) => {
              const result = bookAppointment(booking)
              setBooked(result)
              setBookingOpen(false)
              setActiveTab("appointment")
              refreshFromDb()
            }}
          />
        )}

        {generationAlert && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between shadow-xs animate-in fade-in ${
              generationAlert.type === "new"
                ? "bg-[#F0FDF4] border-[#86EFAC] text-[#166534]"
                : "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A]"
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">
                  {generationAlert.type === "new"
                    ? "🎉 Patient Registration Completed"
                    : "🔄 Revisit Encounter Generated"}
                </span>
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-white/80 border font-bold">
                  {generationAlert.name} ({generationAlert.age} yrs)
                </span>
              </div>
              <div className="text-[12px] flex items-center gap-3">
                <span>
                  Permanent UMR:{" "}
                  <strong className="font-mono text-[#1B4FD8]">
                    {generationAlert.umr}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Visit OP Number:{" "}
                  <strong className="font-mono text-[#D97706]">
                    {generationAlert.opNumber}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Phone: <strong>{generationAlert.phone}</strong>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Reception's job ends at registration. The doctor is chosen on
                  the appointment desk, where symptom triage runs, and payment is
                  taken at billing -- so those are the two ways out of here. */}
              {onBookAppointment && selectedEncounter && (
                <button
                  type="button"
                  onClick={() => setActiveTab("appointment")}
                  className="text-xs px-3.5 py-1.5 rounded-lg bg-[#1B4FD8] hover:bg-[#1740B4] text-white font-semibold shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  Book appointment &amp; triage →
                </button>
              )}
              {onGoToBilling && (
                <button
                  type="button"
                  onClick={onGoToBilling}
                  className="text-xs px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] border border-[#DDE2EC] text-[#334155] font-semibold transition-colors cursor-pointer"
                >
                  Go to billing →
                </button>
              )}
              <button
                onClick={() => setGenerationAlert(null)}
                className="text-xs px-2.5 py-1.5 rounded bg-white/80 hover:bg-white border font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 1: REGISTRATION FLOW (NAME SEARCH -> EXISTING VS NEW RESOLUTION -> NEXT STEP) ── */}
        {activeTab === "new" && (
          <div className="bg-white border-2 border-[#CBD5E1] rounded p-7 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[12px] flex items-center justify-center font-mono">
                    1
                  </span>
                  Patient Registration &amp; Identity Verification
                </h2>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Enter patient name. The database automatically checks if the
                  patient already exists or is a new patient.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegisterNewPatient} className="space-y-6">
              {/* 1. ENTER PATIENT NAME & AUTO SEARCH DATABASE */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider pb-1 border-b border-[#E2E8F0]">
                  1. Enter Patient Name
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.firstName}
                      onChange={(v) =>
                        setFormData({ ...formData, firstName: v })
                      }
                      placeholder="Given name"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Middle Name{" "}
                      <span className="text-[11px] text-[#64748B] font-normal">
                        (Optional)
                      </span>
                    </label>
                    <Input
                      value={formData.middleName}
                      onChange={(v) =>
                        setFormData({ ...formData, middleName: v })
                      }
                      placeholder="e.g. Robert"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.lastName}
                      onChange={(v) =>
                        setFormData({ ...formData, lastName: v })
                      }
                      placeholder="Family name"
                      required
                    />
                  </div>
                </div>

                {/* ── FLOW BRANCH: SEARCH PATIENT DATABASE ── */}
                {enteredFullName.length >= 2 && (
                  <div className="mt-2">
                    {/* CASE 1: ALL DETAILS MATCH EXACTLY -> EXISTING PATIENT (YES BRANCH) */}
                    {matchingExistingPatient && mismatches.length === 0 ? (
                      <div className="bg-[#EFF6FF] border-2 border-[#3B82F6] rounded p-5 shadow-md space-y-4 animate-in fade-in">
                        <div className="flex items-start justify-between gap-3 flex-wrap border-b border-blue-200/80 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-[#1B4FD8] text-white flex items-center justify-center text-lg font-bold shadow-xs">
                              👤
                            </div>
                            <div>
                              <div className="font-bold text-[15px] text-[#1E3A8A] flex items-center gap-2">
                                <span>Patient Already Exists in Database</span>
                                <span className="text-[11.5px] font-mono font-bold bg-[#1B4FD8] text-white px-2 py-0.5 rounded">
                                  {matchingExistingPatient.umr}
                                </span>
                              </div>
                              <div className="text-[12px] text-[#2563EB] font-medium mt-0.5">
                                Verified Existing Patient:{" "}
                                <strong>{matchingExistingPatient.name}</strong>{" "}
                                ({matchingExistingPatient.age} yrs ·{" "}
                                {matchingExistingPatient.sex} ·{" "}
                                {matchingExistingPatient.phone})
                              </div>
                            </div>
                          </div>

                          {/* Existing Patient Workflow -> Next Step Action */}
                          <button
                            type="button"
                            onClick={() => {
                              handleCreateRevisitEncounter(
                                matchingExistingPatient,
                              )
                              resetForm()
                            }}
                            className="px-5 py-2.5 bg-gradient-to-r from-[#1E3A8A] to-[#1B4FD8] hover:from-[#1E40AF] hover:to-[#2563EB] text-white text-[13px] font-semibold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <span>🔄</span> Continue with Existing Patient (
                            {matchingExistingPatient.umr}) ➔ Proceed to Next
                            Step
                          </button>
                        </div>

                        {/* View Existing Patient Record Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-blue-200 text-[12px]">
                          <div>
                            <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                              Permanent ID (UMR)
                            </span>
                            <span className="font-mono font-bold text-[#1B4FD8]">
                              {matchingExistingPatient.umr}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                              Phone Number
                            </span>
                            <span className="font-semibold text-gray-900">
                              {matchingExistingPatient.phone}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                              Demographics
                            </span>
                            <span className="font-semibold text-gray-900">
                              {matchingExistingPatient.age} yrs ·{" "}
                              {matchingExistingPatient.sex}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                              Address
                            </span>
                            <span className="font-semibold text-gray-900 truncate block">
                              {matchingExistingPatient.address}
                            </span>
                          </div>
                        </div>

                        <div className="text-[11.5px] text-[#64748B]">
                          All details match registered record. Click above to
                          issue an OP visit pass for this patient.
                        </div>
                      </div>
                    ) : candidatePatient && mismatches.length > 0 ? (
                      /* CASE 2: NAME MATCHES BUT DETAILS (AGE/DOB/PHONE/GENDER) DIFFER -> COMPACT NEW PATIENT BADGE */
                      <div className="bg-[#F0FDF4] border border-[#86EFAC] px-3.5 py-2 rounded-xl text-[12px] text-[#166534] flex items-center justify-between shadow-2xs animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <span>✨</span>
                          <span>
                            <strong>New Patient:</strong> (
                            {mismatches.join(", ")}) — Will be registered with a
                            new Patient ID (UMR).
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded">
                          NEW PATIENT
                        </span>
                      </div>
                    ) : candidatePatient &&
                      !formData.dob &&
                      !formData.phone.trim() ? (
                      /* CASE 3: NAME MATCHES, BUT OTHER DETAILS NOT YET ENTERED */
                      <div className="bg-[#EFF6FF] border border-[#93C5FD] rounded-xl p-3 shadow-2xs space-y-2 animate-in fade-in">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="font-bold text-[12.5px] text-[#1E3A8A] flex items-center gap-2">
                              <span>
                                ⚠️ Patient Name "{candidatePatient.name}" on File
                              </span>
                              <span className="text-[10.5px] font-mono font-bold bg-[#1B4FD8] text-white px-1.5 py-0.5 rounded">
                                {candidatePatient.umr}
                              </span>
                            </div>
                            <div className="text-[11.5px] text-[#2563EB] mt-0.5">
                              {candidatePatient.age} yrs ·{" "}
                              {candidatePatient.sex} · {candidatePatient.phone}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              handleCreateRevisitEncounter(candidatePatient)
                              resetForm()
                            }}
                            className="px-3 py-1 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11.5px] font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>🔄</span> Use Existing Record (
                            {candidatePatient.umr}) →
                          </button>
                        </div>
                      </div>
                    ) : enteredFullName.length >= 3 ? (
                      /* CASE 4: PURE NEW PATIENT (NAME NOT IN DB) */
                      <div className="bg-[#F0FDF4] border border-[#86EFAC] px-3.5 py-2 rounded-xl text-[12px] text-[#166534] flex items-center justify-between shadow-2xs animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <span>✓</span>
                          <span>
                            <strong>New Patient:</strong> No existing record
                            found for "{enteredFullName}".
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded">
                          NEW PATIENT
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* 2. ENTER PATIENT DETAILS (DOB, AGE, GENDER) */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider pb-1 border-b border-[#E2E8F0]">
                  2. Patient Details
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Date of Birth (DOB)
                    </label>
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => handleDobChange(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                      className="w-full border border-[#94A3B8] rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-blue-100 font-medium text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5 flex items-center justify-between">
                      <span>Age (Years)</span>
                      {formData.age > 0 && formData.age < 18 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                          Pediatric
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="130"
                        value={formData.age > 0 ? formData.age : ""}
                        onChange={(e) => handleAgeChange(e.target.value)}
                        placeholder="Age"
                        className="w-full border border-[#94A3B8] rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-blue-100 font-bold text-gray-900 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">
                        yrs
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Sex at Birth <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.sex}
                      onChange={(e) =>
                        setFormData({ ...formData, sex: e.target.value as any })
                      }
                      className="w-full border border-[#94A3B8] rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-blue-100 font-medium text-gray-900"
                      required
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 3. CONTACT INFORMATION */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider pb-1 border-b border-[#E2E8F0]">
                  3. Contact Information
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Mobile Phone <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      onKeyDown={handleNumericKeyDown}
                      placeholder="e.g. 9876543210"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Email Address{" "}
                      <span className="text-[11px] text-[#64748B] font-normal">
                        (Optional)
                      </span>
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(v) => setFormData({ ...formData, email: v })}
                      placeholder="patient@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                    Address / City{" "}
                    <span className="text-[11px] text-[#64748B] font-normal">
                      (Street address, City)
                    </span>
                  </label>
                  <Input
                    value={formData.address}
                    onChange={(v) => setFormData({ ...formData, address: v })}
                    placeholder="e.g. 24 Park Avenue, Boston, MA"
                  />
                </div>
              </div>

              {/* 4. EMERGENCY CONTACT */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider pb-1 border-b border-[#E2E8F0]">
                  4. Emergency Contact
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Contact Name
                    </label>
                    <Input
                      value={formData.emergencyName}
                      onChange={(v) =>
                        setFormData({ ...formData, emergencyName: v })
                      }
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Relationship
                    </label>
                    <select
                      value={formData.emergencyRelationship}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergencyRelationship: e.target.value,
                        })
                      }
                      className="w-full border border-[#94A3B8] rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-blue-100 font-medium text-gray-900"
                    >
                      <option value="Spouse">Spouse</option>
                      <option value="Parent">Parent</option>
                      <option value="Child">Child</option>
                      <option value="Sibling">Sibling</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                      Emergency Phone
                    </label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      value={formData.emergencyPhone}
                      onChange={handleEmergencyPhoneChange}
                      onKeyDown={handleNumericKeyDown}
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons (New Patient Flow -> Generate Patient ID & Proceed to Next Step) */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                {onBack && (
                  <Btn variant="outline" type="button" onClick={onBack}>
                    Cancel
                  </Btn>
                )}
                <Btn
                  variant="primary"
                  type="submit"
                >
                  <span>✓</span> Create Patient Record, Generate Patient ID
                  &amp; Proceed to Next Step →
                </Btn>
              </div>
            </form>
          </div>
        )}

        {/* ── TAB 2: EXISTING PATIENT REVISIT ─────────────────────────── */}
        {activeTab === "revisit" && (
          <div className="bg-white border-2 border-[#CBD5E1] rounded p-7 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                  <span>🔄</span> Existing Patient Revisit Search
                </h2>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Search by permanent UMR, Patient Name, or Phone to create a
                  new visit encounter while retaining their lifetime UMR.
                </p>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by UMR (e.g. UMR10001), patient name, or phone number..."
                className="w-full border-2 border-[#94A3B8] rounded px-4 py-2.5 text-[13px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-blue-100 font-medium text-gray-900 placeholder:text-gray-400"
              />
              <span className="absolute right-3.5 top-2.5 text-gray-400 text-sm">
                🔍
              </span>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPatients.length === 0 ? (
                <div className="col-span-2 text-center py-10 text-gray-500 text-[13px]">
                  No registered patients matched your search. Switch to{" "}
                  <strong>Registration</strong> to add them.
                </div>
              ) : (
                filteredPatients.map((p) => {
                  const pEncounters = db.getEncountersForPatient(p.umr)
                  return (
                    <div
                      key={p.umr}
                      className="border-2 border-[#E2E8F0] hover:border-[#1B4FD8] rounded p-4.5 bg-white shadow-sm transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-bold text-[14.5px] text-gray-900">
                              {p.name}
                            </div>
                            <div className="text-[11.5px] text-[#64748B]">
                              {p.age} yrs · {p.sex} · {p.phone}
                            </div>
                          </div>
                          <span className="font-mono text-[12.5px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {p.umr}
                          </span>
                        </div>

                        {/* Past Visits history preview */}
                        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-2.5 my-2.5 text-[11.5px] space-y-1">
                          <div className="font-semibold text-gray-700 flex justify-between">
                            <span>Past OP Visits On Record:</span>
                            <span className="font-mono text-[#D97706]">
                              {pEncounters.length} Visits in Database
                            </span>
                          </div>
                          {pEncounters.length > 0 ? (
                            pEncounters.slice(0, 3).map((pv) => (
                              <div
                                key={pv.id}
                                className="flex justify-between text-[#475569]"
                              >
                                <span>
                                  • {pv.opNumber} ({pv.date || pv.createdAt?.split("T")[0] || pv.registrationTime})
                                </span>
                                <span className="text-[#64748B]">
                                  {pv.dept}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 italic">
                              No past encounters
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-[#F1F5F9] mt-2">
                        <span className="text-[11.5px] text-[#166534] font-semibold">
                          ✓ Retain {p.umr}
                        </span>
                        <button
                          onClick={() => handleCreateRevisitEncounter(p)}
                          className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-semibold rounded transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <span>🔄</span> Generate New Visit OP Number ➔
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: DIGITAL OP BOOK & TODAYS REGISTRATIONS ───────────── */}
        {/* ── TAB: BOOK APPOINTMENT ──────────────────────────────────────────
            Reception registers and books in one place. The doctor is chosen
            here (directly off the roster, or by AI symptom triage), the visit
            moves to "Doctor Assigned", and the OP nurse and the assigned doctor
            both see the patient immediately -- the nurse in her waiting list,
            the doctor in their workspace inbox. */}
        {activeTab === "appointment" && (
          <div className="p-5 space-y-4">
            {booked ? (
              <div className="rounded border border-[#BBF7D0] bg-[#F0FDF4] p-5">
                <h3 className="text-[15px] font-bold text-[#15803D]">
                  Appointment booked — {booked.name} with {booked.doctor}
                </h3>
                <p className="text-[12.5px] text-[#166534] mt-1">
                  {booked.umr} · {booked.opNumber} · {booked.dept} ·{" "}
                  {booked.room} · token{" "}
                  <span className="font-mono">{booked.token}</span>
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <div className="bg-white border border-[#BBF7D0] rounded px-3 py-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#15803D]">
                      Sent to OP department
                    </p>
                    <p className="text-[11.5px] text-[#166534] mt-0.5">
                      Nurse station, for baseline vitals
                    </p>
                  </div>
                  <div className="bg-white border border-[#BBF7D0] rounded px-3 py-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#15803D]">
                      Doctor notified
                    </p>
                    <p className="text-[11.5px] text-[#166534] mt-0.5">
                      {booked.doctor} — in their workspace
                    </p>
                  </div>
                  <div className="bg-white border border-[#86EFAC] rounded px-3 py-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#15803D]">
                      📱 Patient Alert
                    </p>
                    <div className="mt-0.5">
                      <MessageDeliveryStatus encounterId={booked.encounterId} kind="appointment_booked" phone={booked.phone} compact />
                    </div>
                  </div>
                  <div className="bg-white border border-[#FDE68A] rounded px-3 py-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#92400E]">
                      Next at this desk
                    </p>
                    <p className="text-[11.5px] text-[#B45309] mt-0.5">
                      Collect the consultation fee
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {onGoToBilling && (
                    <button
                      type="button"
                      onClick={onGoToBilling}
                      className="px-4 py-2 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold rounded shadow-xs transition-colors cursor-pointer"
                    >
                      💳 Collect consultation fee →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBooked(null)
                      setActiveTab("new")
                    }}
                    className="px-4 py-2 bg-white hover:bg-[#F8FAFC] border border-[#DDE2EC] text-[#334155] text-[12.5px] font-semibold rounded transition-colors cursor-pointer"
                  >
                    Register next patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setBooked(null)}
                    className="text-[11.5px] font-semibold text-[#15803D] cursor-pointer"
                  >
                    Book another appointment
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white border border-[#DDE2EC] rounded p-4">
                  <h3 className="text-[13px] font-bold text-gray-900">
                    Book a doctor for this patient
                  </h3>
                  <p className="text-[11.5px] text-[#64748B] mt-0.5">
                    {selectedEncounter
                      ? `Booking for ${selectedEncounter.patientName} (${selectedEncounter.umr} · ${selectedEncounter.opNumber}).`
                      : "Register a patient or pick one from the OP book first, or book a walk-in below."}
                  </p>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setBookingOpen(true)}
                      className="px-4 py-2 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold rounded shadow-xs transition-colors cursor-pointer"
                    >
                      🗓{" "}
                      {selectedEncounter
                        ? "Choose doctor & book"
                        : "Book walk-in appointment"}
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-[#DDE2EC] rounded">
                  <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
                    <h3 className="text-[12.5px] font-bold text-gray-900">
                      Registered today, no doctor booked yet (
                      {
                        encounters.filter((e) => !e.assignedDoctor?.trim())
                          .length
                      }
                      )
                    </h3>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {encounters
                      .filter((e) => !e.assignedDoctor?.trim())
                      .slice(0, 25)
                      .map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            setSelectedEncounter(e)
                            setBookingOpen(true)
                          }}
                          className="w-full text-left px-4 py-2.5 border-b border-[#F1F5F9] hover:bg-[#F8FAFC] flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-gray-900 truncate">
                              {e.patientName}
                            </p>
                            <p className="text-[11px] font-mono text-[#64748B]">
                              {e.umr} · {e.opNumber} · {e.age}
                              {e.sex?.[0]} ·{" "}
                              {e.chiefComplaint || "No complaint recorded"}
                            </p>
                          </div>
                          <span className="text-[11.5px] font-semibold text-[#1B4FD8] whitespace-nowrap">
                            Book →
                          </span>
                        </button>
                      ))}
                    {encounters.filter((e) => !e.assignedDoctor?.trim())
                      .length === 0 && (
                      <p className="p-5 text-center text-[12px] text-[#94A3B8]">
                        Everyone registered today already has a doctor booked.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "records" && (
          <div className="space-y-6">
            {/* OP Book Card Preview */}
            {selectedEncounter && (
              <div
                ref={cardPreviewRef}
                className="bg-white border-2 border-[#CBD5E1] rounded p-6 shadow-md space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 border-b border-[#E2E8F0] pb-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                      <span>🪪</span> OP Card
                    </h3>
                    <p className="text-[11.5px] text-[#64748B]">
                      One card for life, valid at every department. Scanning its
                      QR opens the patient&apos;s complete record &mdash; no login needed.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveTab("new")}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>+</span> New Registration
                    </button>
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        printOpCard(
                          opCardDataFor(selectedEncounter.umr, {
                            patientName: selectedEncounter.patientName,
                            age: selectedEncounter.age,
                            sex: selectedEncounter.sex,
                            phone: selectedEncounter.phone,
                            bloodGroup: selectedEncounter.bloodGroup,
                          }),
                          branding,
                        )
                      }
                    >
                      <Icon.Download /> Print OP Card
                    </Btn>
                    {/* Reception's next desk is Appointments, where symptom triage
                        picks the doctor. This used to open the OP Clinical Journey
                        -- a six-panel clinical pathway that is not reception's
                        screen -- so registering a patient dumped the front desk
                        into a workflow meant for the wards. */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedJourneyEncounter(selectedEncounter)
                      }
                      className="px-3 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1B4FD8] text-[12px] font-bold rounded-none border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>✨</span> Clinical Journey →
                    </button>
                    {onBookAppointment && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("appointment")}
                        className="px-4 py-2 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold rounded-none shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>✨</span> Book appointment &amp; triage →
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3 py-2">
                  <OpCardPreview
                    card={opCardDataFor(selectedEncounter.umr, {
                      patientName: selectedEncounter.patientName,
                      age: selectedEncounter.age,
                      sex: selectedEncounter.sex,
                      phone: selectedEncounter.phone,
                      bloodGroup: selectedEncounter.bloodGroup,
                    })}
                    branding={branding}
                  />
                  <button
                    type="button"
                    onClick={() => openJourneyForCode(cardBarcodeValue(selectedEncounter.umr))}
                    title="Opens the patient's complete record in a new tab"
                    className="text-[12px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
                  >
                    Open patient record (same as scanning the card) →
                  </button>
                  {/* The registration message: sent automatically once the
                      registration reaches the server; its real outcome here. */}
                  <div className="w-full max-w-xl border-t border-[#E2E8F0] pt-2">
                    <MessageDeliveryStatus
                      encounterId={selectedEncounter.id}
                      kind="op_registered"
                      phone={selectedEncounter.phone}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Card scan / lookup. A USB or Bluetooth scanner works on any
                screen; this field is for typing a code by hand. */}
            <form
              className="bg-white border-2 border-[#CBD5E1] rounded p-4 shadow-md flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (cardCode.trim()) openJourneyForCode(cardCode.trim())
                setCardCode("")
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-gray-900">Scan OP card</div>
                <div className="text-[11.5px] text-[#64748B]">
                  Scan the card&apos;s QR with a phone or a 2-D desk scanner, or type the UMR / OP number here. Opens the
                  patient&apos;s complete record in a new tab, with the full history download and card print.
                </div>
              </div>
              <input
                value={cardCode}
                onChange={(e) => setCardCode(e.target.value)}
                placeholder="UMR or OP number"
                className="border border-[#CBD5E1] rounded px-3 py-2 text-[12.5px] font-mono w-56 focus:outline-none focus:border-[#1B4FD8]"
              />
              <Btn variant="primary" size="sm" type="submit" disabled={!cardCode.trim()}>
                Open record
              </Btn>
            </form>

            {/* Today's Registration Log Table */}
            <div className="bg-white border-2 border-[#CBD5E1] rounded shadow-md overflow-hidden">
              <div className="px-5 py-3 border-b border-[#DDE2EC] bg-[#F8FAFC] flex justify-between items-center">
                <div>
                  <h3 className="text-[13.5px] font-bold text-gray-900">
                    Database Encounter Registry
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    All registered outpatients with permanent UMR and visit OP
                    numbers.
                  </p>
                </div>
                <span className="text-[11.5px] text-[#64748B]">
                  Total: {encounters.length} Records
                </span>
              </div>
              <table className="w-full text-left">
                <thead className="border-b border-[#DDE2EC] bg-[#FAFAFA]">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Permanent UMR
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Current OP No
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Patient Name
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Age
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                  {encounters.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => handleViewOpBook(e)}
                      className={`hover:bg-[#F8FAFC] cursor-pointer transition-colors ${
                        selectedEncounter?.id === e.id ? "bg-[#EFF6FF]" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-[#1B4FD8]">
                        {e.umr}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-[#D97706]">
                        {e.opNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {e.patientName}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {e.age} yrs
                      </td>
                      <td className="px-4 py-3 text-gray-700">{e.phone}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                            e.isNew
                              ? "bg-[#DCFCE7] text-[#15803D]"
                              : "bg-[#FEF3C7] text-[#B45309]"
                          }`}
                        >
                          {e.isNew ? "New Patient" : "Revisit Encounter"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">
                        {e.date ? `${e.date} ${e.registrationTime}` : e.registrationTime}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setSelectedJourneyEncounter(e)
                            }}
                            className="px-2.5 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-none text-[11.5px] font-bold border border-purple-200 transition-colors cursor-pointer"
                            title="View Complete Outpatient Clinical Journey Timeline"
                          >
                            ✨ Journey →
                          </button>
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation()
                              handleViewOpBook(e)
                            }}
                            className="px-2.5 py-1 bg-blue-50 text-[#1B4FD8] hover:bg-blue-100 rounded-none text-[11.5px] font-semibold border border-blue-200 transition-colors"
                          >
                            View Pass
                          </button>
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation()
                              if (
                                window.confirm(
                                  `Delete patient record and encounter for ${e.patientName} (${e.umr})?`,
                                )
                              ) {
                                db.deletePatientByUmr(e.umr)
                                refreshFromDb()
                              }
                            }}
                            className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-[11px] font-semibold border border-red-200 transition-colors"
                            title="Delete patient and encounter from database"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
