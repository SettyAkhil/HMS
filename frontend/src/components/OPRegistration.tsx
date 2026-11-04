import React, { useState, useEffect } from "react"
import toast from "react-hot-toast"
import { Icon } from "./icons"
import { StatusBadge, Btn, Input } from "./shared"
import PhoneInput from "./ui/PhoneInput"
import {
  db,
  DBPatient,
  DBOPEncounter,
  findMatchingPatient,
} from "../services/db"
import { HospAILogo } from "./HospAILogo"

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

export default function OPRegistration({
  onProceedToQueue,
  onBookAppointment,
  onGoToBilling,
}: {
  onProceedToQueue?: (patient: DBOPEncounter) => void
  onBookAppointment?: (patient: DBOPEncounter) => void
  onGoToBilling?: () => void
}) {
  const [activeTab, setActiveTab] = useState<"new" | "revisit" | "records">(
    "new",
  )
  const [searchQuery, setSearchQuery] = useState("")

  // Database live state
  const [patients, setPatients] = useState<DBPatient[]>([])
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const [selectedEncounter, setSelectedEncounter] =
    useState<DBOPEncounter | null>(null)

  // Generation Audit state
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

  // Form State: First Name, Middle Name (optional), Last Name, DOB, Age (locked), Gender, Phone
  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dob: "",
    age: 0,
    sex: "" as "Male" | "Female" | "Other" | "",
    phone: "",
  })

  const cardPreviewRef = React.useRef<HTMLDivElement>(null)

  // Handle DOB Change -> Dynamically updates and fixes Age
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

  // Duplicate / Existing Patient Check via Robust Matching Logic
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

  // 1. Handle New Patient Registration -> Generates UMR -> then generates Global OP Number
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
      toast.error("Please select patient Gender / Sex.")
      return
    }

    const rawPhone = formData.phone || ""
    const cleanDigits = rawPhone.replace(/\D/g, "")
    if (cleanDigits.length < 7) {
      toast.error("Please enter a valid mobile phone number.")
      return
    }
    const finalPhone = rawPhone.trim() || "+91 98765 43210"

    // If ALL entered details match an existing record with 0 mismatches -> Revisit under existing UMR
    if (matchingExistingPatient) {
      handleCreateRevisitEncounter(matchingExistingPatient)
      toast.success(
        `Revisit encounter generated for ${matchingExistingPatient.name} (${matchingExistingPatient.umr})`,
      )
      // Reset Form
      setFormData({
        firstName: "",
        middleName: "",
        lastName: "",
        dob: "",
        age: 0,
        sex: "",
        phone: "",
      })
      return
    }

    // If new patient OR if ANY detail mismatches from database -> Register as a BRAND NEW patient with new permanent UMR
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
          phone: finalPhone || "+91 98765 43210",
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
      setActiveTab("records")
      setTimeout(() => {
        cardPreviewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }, 100)

      // Reset Form
      setFormData({
        firstName: "",
        middleName: "",
        lastName: "",
        dob: "",
        age: 0,
        sex: "",
        phone: "",
      })
    } catch (err: any) {
      console.error("Patient registration error:", err)
      toast.error(err?.message || "Failed to register patient.")
    }
  }

  // 2. Handle Existing Patient Revisit -> Retains Permanent UMR -> generates new OP Number
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

  // Filtered patients for revisit search
  const filteredPatients = db.searchPatients(searchQuery)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5] overflow-hidden">
      {/* Top Header */}
      {/* Top Header */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-900">
            OP Management — Registration Desk
          </h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-[#DDE2EC]">
            <button
              onClick={() => setActiveTab("new")}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${
                activeTab === "new"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              + New OP Registration
            </button>
            <button
              onClick={() => setActiveTab("revisit")}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${
                activeTab === "revisit"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              🔄 Existing Patient Revisit
            </button>
            <button
              onClick={() => setActiveTab("records")}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${
                activeTab === "records"
                  ? "bg-white text-[#1B4FD8] shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              📋 OP Book &amp; Log ({encounters.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 overflow-y-auto p-6 w-full space-y-6">
        {/* ── GENERATION AUDIT BANNER ─────────────────────────────────── */}
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
                    ? "🎉 OP Registration Successfully Completed"
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
                  Current Visit OP Number:{" "}
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
              {onProceedToQueue && selectedEncounter && (
                <button
                  type="button"
                  onClick={() => onProceedToQueue(selectedEncounter)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#1B4FD8] hover:bg-[#1740B4] text-white font-semibold shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  Proceed to Symptoms &amp; AI Triage →
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

        {/* ── TAB 1: NEW PATIENT REGISTRATION FORM (EXACT REQUESTED FIELDS) ── */}
        {activeTab === "new" && (
          <div className="bg-white border-2 border-[#CBD5E1] rounded p-7 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[12px] flex items-center justify-center font-mono">
                    1
                  </span>
                  OP Patient Registration Form
                </h2>
              </div>
            </div>

            <form onSubmit={handleRegisterNewPatient} className="space-y-5">
              {/* Name Fields: First Name, Middle Name (optional), Last Name */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formData.firstName}
                    onChange={(v) => setFormData({ ...formData, firstName: v })}
                    placeholder="e.g. John"
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
                    onChange={(v) => setFormData({ ...formData, lastName: v })}
                    placeholder="e.g. Smith"
                  />
                </div>
              </div>

              {/* DOB, Age (Editable & Bidirectional), Gender, Phone Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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
                      <span className="text-[9.5px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
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
                    Gender / Sex <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.sex}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sex: e.target.value as "Male" | "Female" | "Other",
                      })
                    }
                    className="w-full border border-[#94A3B8] rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-blue-100 font-medium text-gray-900"
                    required
                  >
                    <option value="" disabled>
                      Select
                    </option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-gray-800 block mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <PhoneInput
                    value={formData.phone}
                    onChange={(v) => setFormData({ ...formData, phone: v })}
                    placeholder="98765 43210"
                  />
                </div>
              </div>

              {/* Patient Identity State Warning / Confirmation */}
              {matchingExistingPatient ? (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 shadow-sm animate-in fade-in">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚠️</span>
                      <span className="text-[13px] font-bold text-amber-950">
                        Patient Already Exists in Database!
                      </span>
                      <span className="text-[11px] font-mono font-bold bg-amber-200/80 px-2 py-0.5 rounded border border-amber-400 text-amber-900">
                        {matchingExistingPatient.umr}
                      </span>
                    </div>
                    <div className="text-[12px] text-amber-900">
                      All details match existing record for{" "}
                      <strong>{matchingExistingPatient.name}</strong> (
                      {matchingExistingPatient.age} yrs ·{" "}
                      {matchingExistingPatient.sex} · Phone:{" "}
                      {matchingExistingPatient.phone}).
                    </div>
                    <div className="text-[11.5px] text-amber-800">
                      To preserve lifetime medical history under{" "}
                      <strong>{matchingExistingPatient.umr}</strong>, submitting
                      will generate a <strong>Revisit OP Number</strong>.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCreateRevisitEncounter(matchingExistingPatient)
                    }
                    className="px-4 py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white text-[12.5px] font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>🔄</span> Generate Revisit (
                    {matchingExistingPatient.umr})
                  </button>
                </div>
              ) : (
                enteredFullName.length >= 2 && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-emerald-900 text-[12px] animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold text-sm">
                        ✓
                      </span>
                      <span>
                        <strong>New Patient:</strong> System will issue a new
                        permanent UMR &amp; visit OP Number for{" "}
                        <strong>{enteredFullName}</strong>.
                      </span>
                    </div>
                    <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                      ✨ New Patient
                    </span>
                  </div>
                )
              )}

              {/* Submit Action (Centered) */}
              <div className="pt-4 border-t border-[#E2E8F0] flex justify-center items-center">
                <button
                  type="submit"
                  className={`px-8 py-3 font-bold text-[14px] rounded-lg shadow-md transition-all flex items-center gap-2 ${
                    matchingExistingPatient
                      ? "bg-[#D97706] hover:bg-[#B45309] text-white"
                      : "bg-[#16A34A] hover:bg-[#15803D] text-white"
                  }`}
                >
                  {matchingExistingPatient ? (
                    <>
                      <span>🔄</span> Patient Exists — Generate Revisit
                      Encounter ({matchingExistingPatient.umr})
                    </>
                  ) : (
                    <>
                      <span>✓</span> Register OP &amp; Generate UMR / OP Number
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── TAB 2: EXISTING PATIENT REVISIT WORKFLOW ───────────────── */}
        {activeTab === "revisit" && (
          <div className="bg-white border-2 border-[#CBD5E1] rounded p-7 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
              <div>
                <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[12px] flex items-center justify-center font-mono">
                    2
                  </span>
                  Existing Patient Revisit (Keep Old UMR ➔ Generate New OP
                  Number)
                </h2>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Search patient in database. The permanent{" "}
                  <strong>UMR remains unchanged</strong>, and a{" "}
                  <strong>new OP number</strong> is generated for today's visit.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#1E40AF] bg-[#DBEAFE] px-2.5 py-1 rounded font-bold border border-[#BFDBFE]">
                Permanent UMR Retained + New OP Generated
              </span>
            </div>

            {/* Search & Barcode Scan Bar */}
            <div className="flex gap-3 max-w-2xl">
              <div className="flex-1">
                <Input
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search database by Patient Name, UMR (e.g. UMR10001), or Phone..."
                  icon={<Icon.Search />}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const firstPatient = patients[0]
                  if (firstPatient) {
                    setSearchQuery(firstPatient.umr)
                  }
                }}
                className="px-4 py-2 bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] text-[#1D4ED8] text-[12.5px] font-bold rounded transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap"
              >
                <span>📷</span> Scan Card Barcode
              </button>
            </div>

            {/* Existing Database Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPatients.map((p) => {
                const pEncounters = db.getEncountersForPatient(p.umr)
                return (
                  <div
                    key={p.umr}
                    className="p-4 border border-[#DDE2EC] rounded hover:border-[#1B4FD8] transition-all bg-white shadow-xs"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-bold text-[14px] text-gray-900">
                          {p.name}
                        </div>
                        <div className="text-[12px] text-[#64748B]">
                          {p.age} yrs · {p.phone}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[11.5px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded block">
                          {p.umr}
                        </span>
                        <span className="text-[10px] text-[#64748B]">
                          Permanent UMR
                        </span>
                      </div>
                    </div>

                    {/* Previous OP visits history */}
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
                            <span className="text-[#64748B]">{pv.dept}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-400 italic">
                          No past encounters
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-[#F1F5F9]">
                      <span className="text-[11.5px] text-[#166534] font-semibold">
                        ✓ Retain {p.umr}
                      </span>
                      <button
                        onClick={() => handleCreateRevisitEncounter(p)}
                        className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-semibold rounded transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <span>🔄</span> Generate New Visit OP Number ➔
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── TAB 3: DIGITAL OP BOOK & TODAYS REGISTRATIONS ───────────── */}
        {activeTab === "records" && (
          <div className="space-y-6">
            {/* OP Book Card Preview */}
            {selectedEncounter && (
              <div
                ref={cardPreviewRef}
                className="bg-white border-2 border-[#CBD5E1] rounded p-6 shadow-md space-y-4"
              >
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                      <span>📖</span> Official Outpatient OP Book Pass
                    </h3>
                    <p className="text-[11.5px] text-[#64748B]">
                      Shows patient permanent UMR alongside the active visit OP
                      number.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                    >
                      <Icon.Download /> Print OP Pass
                    </Btn>
                    {onBookAppointment && selectedEncounter && (
                      <button
                        type="button"
                        onClick={() => onBookAppointment(selectedEncounter)}
                        className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-semibold rounded shadow-xs transition-colors cursor-pointer"
                      >
                        📅 Book Doctor Appointment →
                      </button>
                    )}
                    {onProceedToQueue && selectedEncounter && (
                      <button
                        type="button"
                        onClick={() => onProceedToQueue(selectedEncounter)}
                        className="px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-[#DDE2EC] text-[#1B4FD8] text-[12px] font-semibold rounded transition-colors cursor-pointer"
                      >
                        ✨ OP Clinical Journey (AI Triage) →
                      </button>
                    )}
                    {onGoToBilling && (
                      <button
                        type="button"
                        onClick={onGoToBilling}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-semibold rounded transition-colors cursor-pointer"
                      >
                        Go to Billing →
                      </button>
                    )}
                  </div>
                </div>

                <div
                  id="printable-op-pass"
                  className="printable-card printable-area max-w-xl mx-auto bg-white border-2 border-[#94A3B8] text-gray-900 rounded p-6 shadow-lg relative overflow-hidden"
                >
                  {/* Top Header Accent Strip */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1B4FD8]"></div>

                  <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-3.5 mb-4">
                    <div className="flex items-center gap-2.5">
                      <HospAILogo variant="icon" className="w-10 h-10 shrink-0" />
                      <div>
                        <div className="font-bold text-[14px] text-gray-900">
                          HospAI General Hospital
                        </div>
                        <div className="text-[10px] text-[#64748B]">
                          Official Outpatient (OP) Record Pass
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-[#64748B]">
                        Registration Date
                      </div>
                      <div className="text-[12px] font-mono font-bold text-gray-900">
                        {selectedEncounter.date
                          ? `${selectedEncounter.date} ${selectedEncounter.registrationTime}`
                          : selectedEncounter.createdAt?.split("T")[0] || selectedEncounter.registrationTime}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-[12.5px] mb-4">
                    <div>
                      <div className="text-[10px] uppercase text-[#64748B] font-bold tracking-wider">
                        Patient Name
                      </div>
                      <div className="text-[16px] font-bold text-gray-900 mt-0.5">
                        {selectedEncounter.patientName}
                      </div>
                      <div className="text-[11.5px] text-gray-600 mt-0.5 font-medium">
                        Age: <strong>{selectedEncounter.age} yrs</strong> · Sex:{" "}
                        <strong>{selectedEncounter.sex}</strong> · Phone:{" "}
                        <strong>{selectedEncounter.phone}</strong>
                      </div>
                      <div className="text-[11px] font-semibold mt-1">
                        Dept:{" "}
                        <span
                          className={
                            selectedEncounter.dept &&
                            selectedEncounter.dept !== "Awaiting Triage"
                              ? "text-[#1B4FD8]"
                              : "text-amber-600"
                          }
                        >
                          {selectedEncounter.dept || "Awaiting AI Triage"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase text-[#64748B] font-bold tracking-wider">
                        Permanent UMR (Lifetime)
                      </div>
                      <div className="text-[15px] font-mono font-bold text-[#1B4FD8] bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200 inline-block mt-0.5">
                        {selectedEncounter.umr}
                      </div>
                      <div className="text-[10px] uppercase text-[#64748B] font-bold tracking-wider mt-2.5">
                        Current Visit OP Number
                      </div>
                      <div className="text-[15px] font-mono font-bold text-[#D97706] bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200 inline-block mt-0.5">
                        {selectedEncounter.opNumber}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
                    <span>
                      Status:{" "}
                      <strong className="text-[#166534] font-mono font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">
                        {selectedEncounter.status}
                      </strong>
                    </span>
                    <span className="font-mono text-gray-900 font-bold tracking-wider text-[12px]">
                      Barcode: |||| ||| ||||| |||
                    </span>
                  </div>
                </div>
              </div>
            )}

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
                  Total: {encounters.length} Database Records
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
                              handleViewOpBook(e)
                            }}
                            className="px-2.5 py-1 bg-blue-50 text-[#1B4FD8] hover:bg-blue-100 rounded text-[11.5px] font-semibold border border-blue-200 transition-colors"
                          >
                            View OP Book
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
