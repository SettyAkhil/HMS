import React, { useState, useEffect } from "react"
import { StatusBadge, Btn, Input } from "./shared"
import { Icon } from "./icons"
import { db, DBPatient, DBOPEncounter } from "../services/db"
import PatientJourneyModal from "./PatientJourneyModal"

export default function PatientSearch({
  onSelect,
  onRegister,
  onNavigateToWorkflow,
}: {
  onSelect: (p: DBPatient) => void
  onRegister: () => void
  onNavigateToWorkflow?: (encounterId: string) => void
}) {
  const [q, setQ] = useState("")
  const [selectedDept, setSelectedDept] = useState("All")
  const [selectedGender, setSelectedGender] = useState("All")
  const [selectedType, setSelectedType] = useState("All")

  const [patients, setPatients] = useState<DBPatient[]>([])
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const [selectedJourneyEncounter, setSelectedJourneyEncounter] =
    useState<DBOPEncounter | null>(null)

  const refreshFromDb = () => {
    setPatients(db.getPatients())
    setEncounters(db.getEncounters())
  }

  useEffect(() => {
    refreshFromDb()
    const unsubscribe = db.subscribe(refreshFromDb)
    return () => {
      unsubscribe()
    }
  }, [])

  // Filter patients live
  const filtered = patients.filter((p) => {
    const pEncounters = encounters.filter((e) => e.umr === p.umr)

    // Search query matching
    if (q.trim()) {
      const query = q.trim().toLowerCase()
      const nameMatch = (p.name || "").toLowerCase().includes(query)
      const umrMatch = (p.umr || "").toLowerCase().includes(query)
      const phoneMatch = (p.phone || "").toLowerCase().includes(query)
      const addressMatch = (p.address || "").toLowerCase().includes(query)
      const bloodMatch = (p.bloodGroup || "").toLowerCase().includes(query)
      const opMatch = pEncounters.some((e) =>
        (e.opNumber || "").toLowerCase().includes(query),
      )
      const deptMatch = pEncounters.some((e) =>
        (e.dept || "").toLowerCase().includes(query),
      )
      const docMatch = pEncounters.some((e) =>
        (e.assignedDoctor || "").toLowerCase().includes(query),
      )
      const complaintMatch = pEncounters.some((e) =>
        (e.chiefComplaint || "").toLowerCase().includes(query),
      )
      const diagnosisMatch = pEncounters.some((e) =>
        (e.diagnosis || "").toLowerCase().includes(query),
      )

      if (
        !nameMatch &&
        !umrMatch &&
        !phoneMatch &&
        !addressMatch &&
        !bloodMatch &&
        !opMatch &&
        !deptMatch &&
        !docMatch &&
        !complaintMatch &&
        !diagnosisMatch
      ) {
        return false
      }
    }

    // Department filter
    if (selectedDept !== "All") {
      const hasDept = pEncounters.some(
        (e) => (e.dept || "").toLowerCase() === selectedDept.toLowerCase(),
      )
      if (!hasDept) return false
    }

    // Gender filter
    if (selectedGender !== "All") {
      if ((p.sex || "").toLowerCase() !== selectedGender.toLowerCase())
        return false
    }

    // Type filter
    if (selectedType === "Pediatric" && (p.age || 0) >= 18) return false
    if (selectedType === "Adult" && ((p.age || 0) < 18 || (p.age || 0) >= 60))
      return false
    if (selectedType === "Senior" && (p.age || 0) < 60) return false

    return true
  })

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ").filter(Boolean)
    if (parts.length === 0) return "PT"
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5]">
      {/* Header */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">
            Patient Directory &amp; Master Search
          </h1>
          <p className="text-[11.5px] text-[#64748B]">
            {patients.length} registered patients in database · Search by
            patient name, permanent UMR, visit OP number, or phone
          </p>
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={onRegister}
          className="rounded-none"
        >
          <Icon.Plus /> + Register New Patient
        </Btn>
      </div>

      <div className="p-6 w-full space-y-4">
        {/* Search & Filter Bar */}
        <div className="bg-white border-2 border-[#CBD5E1] rounded-none p-5 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Query input */}
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide block mb-1">
                Search Patient (Name / UMR / OP No / Phone)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Type patient name (e.g. Zoro), UMR10049, OP034, or phone..."
                  className="w-full border-2 border-[#94A3B8] rounded-none px-3.5 py-2 text-[13px] bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-2 focus:ring-blue-100 font-medium text-gray-900 placeholder:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-gray-400 text-sm">
                  🔍
                </span>
              </div>
            </div>

            {/* Department Filter */}
            <div className="md:col-span-2">
              <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide block mb-1">
                Department
              </label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full border-2 border-[#94A3B8] rounded-none px-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:border-[#1B4FD8] bg-white font-medium"
              >
                <option value="All">All Depts</option>
                <option value="General Medicine">General Med</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Pulmonology">Pulmonology</option>
                <option value="Orthopedics">Orthopedics</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="Emergency">Emergency</option>
              </select>
            </div>

            {/* Gender Filter */}
            <div className="md:col-span-2">
              <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide block mb-1">
                Gender
              </label>
              <select
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value)}
                className="w-full border-2 border-[#94A3B8] rounded-none px-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:border-[#1B4FD8] bg-white font-medium"
              >
                <option value="All">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Age Group Filter */}
            <div className="md:col-span-2">
              <label className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide block mb-1">
                Age Group
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full border-2 border-[#94A3B8] rounded-none px-3 py-2 text-[12.5px] text-gray-700 focus:outline-none focus:border-[#1B4FD8] bg-white font-medium"
              >
                <option value="All">All Ages</option>
                <option value="Pediatric">Pediatric (&lt;18)</option>
                <option value="Adult">Adult (18-59)</option>
                <option value="Senior">Senior (60+)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#E2E8F0] text-[11.5px] text-[#64748B]">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong>{filtered.length}</strong> of{" "}
                <strong>{patients.length}</strong> registered patient profiles
              </span>
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="text-xs text-[#1B4FD8] hover:underline font-semibold ml-2 cursor-pointer"
                >
                  Clear Search
                </button>
              )}
            </div>
            <span className="text-[11px] text-[#94A3B8]">
              Database Live Sync Active ✓
            </span>
          </div>
        </div>

        {/* Results List */}
        <div className="space-y-3">
          {filtered.map((p) => {
            const pEncounters = encounters.filter((e) => e.umr === p.umr)
            const latestEncounter = pEncounters[0]
            const isFemale = p.sex?.toLowerCase() === "female"

            return (
              <div
                key={p.umr}
                className="bg-white border-2 border-[#E2E8F0] hover:border-[#1B4FD8] rounded-none p-5 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div
                    className={`w-12 h-12 rounded-none flex items-center justify-center font-bold text-[15px] flex-shrink-0 shadow-xs ${
                      isFemale
                        ? "bg-pink-100 text-pink-700 border border-pink-200"
                        : "bg-blue-100 text-[#1B4FD8] border border-blue-200"
                    }`}
                  >
                    {getInitials(p.name)}
                  </div>

                  {/* Patient Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-[15px] font-bold text-gray-900">
                            {p.name}
                          </span>
                          <span className="font-mono text-[12px] font-bold text-[#1B4FD8] bg-blue-50 px-2.5 py-0.5 rounded-none border border-blue-200">
                            {p.umr}
                          </span>
                          {p.age < 18 && (
                            <span className="bg-amber-50 text-amber-800 text-[10.5px] font-bold px-2 py-0.5 rounded-none border border-amber-200">
                              Pediatric
                            </span>
                          )}
                          <span
                            className={`text-[10.5px] font-bold px-2 py-0.5 rounded-none border ${
                              isFemale
                                ? "bg-pink-50 text-pink-700 border-pink-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            {p.sex}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-[12px] text-[#64748B] flex-wrap">
                          <span>
                            Age:{" "}
                            <strong className="text-gray-900">
                              {p.age} yrs
                            </strong>
                          </span>
                          <span>·</span>
                          <span>
                            Phone:{" "}
                            <strong className="text-gray-900">{p.phone}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Address:{" "}
                            <span className="text-gray-700">{p.address}</span>
                          </span>
                        </div>
                      </div>

                      {/* Status / Encounter Badge */}
                      <div className="flex flex-col items-end gap-1">
                        {latestEncounter && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase font-bold text-[#64748B]">
                              Active OP:
                            </span>
                            <span className="font-mono text-[13px] font-bold text-[#D97706] bg-amber-50 px-2 py-0.5 rounded-none border border-amber-200">
                              {latestEncounter.opNumber}
                            </span>
                            <StatusBadge
                              status={latestEncounter.status || "Registered"}
                              className="rounded-none"
                            />
                          </div>
                        )}
                        <span className="text-[11px] text-[#94A3B8]">
                          {pEncounters.length} OP Encounter
                          {pEncounters.length !== 1 ? "s" : ""} on Record
                        </span>
                      </div>
                    </div>

                    {/* Active Clinical Encounter Preview Strip */}
                    {latestEncounter && (
                      <div className="mt-3 pt-3 border-t border-[#F1F5F9] flex items-center justify-between flex-wrap gap-2 text-[12px] bg-[#F8FAFC] p-2.5 rounded-none border border-[#E2E8F0]">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div>
                            <span className="text-[#64748B] text-[11px]">
                              Department:{" "}
                            </span>
                            <strong className="text-[#1B4FD8]">
                              {latestEncounter.dept || "General Medicine"}
                            </strong>
                          </div>
                          {latestEncounter.assignedDoctor && (
                            <div>
                              <span className="text-[#64748B] text-[11px]">
                                Attending Doctor:{" "}
                              </span>
                              <strong className="text-gray-900">
                                {latestEncounter.assignedDoctor}
                              </strong>
                              {latestEncounter.room && (
                                <span className="text-[#64748B] font-mono text-[11px] ml-1">
                                  ({latestEncounter.room})
                                </span>
                              )}
                            </div>
                          )}
                          {latestEncounter.chiefComplaint && (
                            <div className="max-w-xs truncate text-[#475569]">
                              <span className="text-[#64748B] text-[11px]">
                                Complaint:{" "}
                              </span>
                              "{latestEncounter.chiefComplaint}"
                            </div>
                          )}
                        </div>

                        {/* Quick Clinical Journey Action */}
                        <button
                          onClick={() =>
                            setSelectedJourneyEncounter(latestEncounter)
                          }
                          className="px-3 py-1 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11.5px] font-bold rounded-none shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <span>✨</span> OP Clinical Journey &amp; History →
                        </button>
                      </div>
                    )}

                    {/* Bottom Action Row */}
                    <div className="flex justify-between items-center mt-3 pt-2">
                      <div className="text-[11px] text-[#94A3B8]">
                        Registered on:{" "}
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        {latestEncounter ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedJourneyEncounter(latestEncounter)
                            }
                            className="px-2.5 py-1 bg-[#EFF6FF] text-[#1B4FD8] hover:bg-blue-100 rounded-none text-[11px] font-bold border border-blue-200 transition-colors cursor-pointer"
                          >
                            View OP Chart
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const syntheticEnc: DBOPEncounter = {
                                id: `enc-${p.umr}`,
                                umr: p.umr,
                                patientName: p.name,
                                age: p.age,
                                sex: p.sex,
                                phone: p.phone,
                                address: p.address || "OP Patient",
                                bloodGroup: p.bloodGroup || "O+",
                                opNumber: `OP-${p.umr}`,
                                dept: "General OP",
                                isNew: true,
                                date: (p.createdAt || new Date().toISOString()).split("T")[0],
                                createdAt: p.createdAt || new Date().toISOString(),
                                registrationTime: new Date(p.createdAt || Date.now()).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                ),
                                chiefComplaint: "Outpatient Consultation",
                                symptoms: ["General Examination"],
                                aiSpecialty: "General Medicine",
                                aiDoctor: "Duty Doctor",
                                doctorGenderPref: "Any",
                                assignedDoctor: "Duty Doctor",
                                room: "Room 101",
                                status: "Registered",
                                bookedAt:
                                  p.createdAt || new Date().toISOString(),
                                timestamps: {
                                  arrival: p.createdAt || new Date().toISOString(),
                                  registration: p.createdAt || new Date().toISOString(),
                                },
                              } as unknown as DBOPEncounter
                              setSelectedJourneyEncounter(syntheticEnc)
                            }}
                            className="px-2.5 py-1 bg-[#EFF6FF] text-[#1B4FD8] hover:bg-blue-100 rounded-none text-[11px] font-bold border border-blue-200 transition-colors cursor-pointer"
                          >
                            View OP Chart &amp; Journey
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete patient record and all history for ${p.name} (${p.umr})?`,
                              )
                            ) {
                              db.deletePatientByUmr(p.umr)
                              refreshFromDb()
                            }
                          }}
                          className="px-2 py-1 text-red-600 hover:bg-red-50 rounded-none text-[11px] font-semibold border border-red-200 transition-colors cursor-pointer"
                          title="Delete patient from database"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="bg-white border-2 border-[#CBD5E1] rounded-none p-12 text-center shadow-sm">
              <div className="text-[#94A3B8] text-4xl mb-3">🔍</div>
              <div className="text-base font-bold text-gray-800 mb-1">
                No patients found
              </div>
              <div className="text-[12.5px] text-[#64748B] mb-5">
                {q
                  ? `No registered patient matched "${q}".`
                  : "No registered patients match the selected filters."}
              </div>
              <Btn
                variant="primary"
                size="sm"
                onClick={onRegister}
                className="rounded-none"
              >
                <Icon.Plus /> Register New Patient
              </Btn>
            </div>
          )}
        </div>
      </div>

      {/* Outpatient Clinical Journey & Consultation History Modal */}
      <PatientJourneyModal
        encounter={selectedJourneyEncounter}
        onClose={() => setSelectedJourneyEncounter(null)}
      />
    </div>
  )
}
