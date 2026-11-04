import React, { useEffect, useState } from "react"
import toast from "react-hot-toast"
import {
  FiArrowRight,
  FiUserPlus,
  FiUser,
  FiHelpCircle,
  FiSearch,
  FiAlertCircle,
} from "react-icons/fi"
import { Input, Label, Select, Button, Textarea, PhoneInput } from "./ui"
import { apiFetch, reportError } from "../lib/api"
import type { Notice, Patient, TriageCategory } from "../types"

export default function ErRegistrationForm({
  setNotice,
  categories,
  onCreated,
  onCancel,
}: {
  setNotice: (notice: Notice | null) => void
  categories: TriageCategory[]
  onCreated: (visitId: number) => void
  onCancel: () => void
}) {
  const [patientMode, setPatientMode] =
    useState<"existing" | "new" | "unknown">("new")

  // Existing-patient search
  const [existingQuery, setExistingQuery] = useState("")
  const [existingResults, setExistingResults] = useState<Patient[]>([])
  const [existingSearching, setExistingSearching] = useState(false)
  const [selectedExisting, setSelectedExisting] = useState<Patient | null>(
    null,
  )

  useEffect(() => {
    if (patientMode !== "existing" || !existingQuery.trim()) {
      setExistingResults([])
      return
    }
    let cancelled = false
    setExistingSearching(true)
    const timer = setTimeout(() => {
      apiFetch<{ patients: Patient[] }>(
        `/api/patients?q=${encodeURIComponent(existingQuery.trim())}`,
      )
        .then((res) => {
          if (!cancelled) setExistingResults(res.patients || [])
        })
        .catch(() => {
          if (!cancelled) setExistingResults([])
        })
        .finally(() => {
          if (!cancelled) setExistingSearching(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [existingQuery, patientMode])

  // Duplicate-patient resolution when registering as "new"
  const [duplicateMatch, setDuplicateMatch] = useState<Patient | null>(null)

  // Demographics
  const [name, setName] = useState("")
  const [lastName, setLastName] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("Male")
  const [phone, setPhone] = useState("")
  const [unknownDesc, setUnknownDesc] = useState("")

  // Arrival & Time
  const [arrivalMode, setArrivalMode] = useState("Walk-in")
  const [incidentDate, setIncidentDate] = useState("")
  const [incidentTime, setIncidentTime] = useState("")
  const [hospitalArrivalTime, setHospitalArrivalTime] = useState("")

  // History & Complaints
  const [caseCategory, setCaseCategory] = useState("General Medical")
  const [chiefComplaint, setChiefComplaint] = useState("")
  const [symptomOnset, setSymptomOnset] = useState("")
  const [symptomDuration, setSymptomDuration] = useState("")
  const [severity, setSeverity] = useState("")

  // Vitals
  const [vitals, setVitals] = useState({
    bp: "",
    hr: "",
    rr: "",
    temp: "",
    spo2: "",
    pain: "",
  })

  // Triage
  const [esi, setEsi] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const ESI_GUIDE = [
    {
      level: 1,
      label: "Immediate (B1)",
      color: "#1F2937",
      border: "#374151",
      bg: "#F3F4F6",
      desc: "Life-saving intervention required",
    },
    {
      level: 2,
      label: "Emergent (B2)",
      color: "#DC2626",
      border: "#F87171",
      bg: "#FEF2F2",
      desc: "High-risk, severe pain, or altered mental status",
    },
    {
      level: 3,
      label: "Urgent (B3)",
      color: "#D97706",
      border: "#FBBF24",
      bg: "#FFFBEB",
      desc: "Stable, needs multiple resources",
    },
    {
      level: 4,
      label: "Less Urgent (B4)",
      color: "#16A34A",
      border: "#4ADE80",
      bg: "#F0FDF4",
      desc: "Stable, needs one resource",
    },
    {
      level: 5,
      label: "Non-Urgent (B4)",
      color: "#2563EB",
      border: "#60A5FA",
      bg: "#EFF6FF",
      desc: "Stable, no resources anticipated",
    },
  ]

  const submit = async (confirmDuplicate = false) => {
    if (!esi || !chiefComplaint) {
      const msg = "Please enter chief complaint and select Triage ESI level."
      setNotice({
        type: "error",
        message: msg,
      })
      toast.error(msg)
      return
    }
    if (patientMode === "existing" && !selectedExisting) {
      const msg = "Search for and select the existing patient before registering."
      setNotice({
        type: "error",
        message: msg,
      })
      toast.error(msg)
      return
    }
    setSaving(true)
    if (!confirmDuplicate) setDuplicateMatch(null)
    try {
      let patientId = null
      let unknownLabel = null

      if (patientMode === "unknown") {
        unknownLabel = unknownDesc || "Unknown Patient"
      } else if (patientMode === "existing") {
        patientId = selectedExisting!.patient_id
      } else if (patientMode === "new") {
        try {
          const pData = await apiFetch<{ id: number ;patient_id: string }>(
            "/api/patients",
            {
              method: "POST",
              body: JSON.stringify({
                name,
                last_name: lastName,
                age: age ? parseInt(age) : null,
                gender,
                phone,
                confirm_duplicate: confirmDuplicate,
              }),
            },
          )
          patientId = pData.patient_id
        } catch (createErr: any) {
          const duplicate = createErr?.payload?.duplicate
          if (createErr?.status === 409 && duplicate) {
            setDuplicateMatch(duplicate)
            const dupMsg = "A matching patient already exists -- use the existing-patient search instead, or confirm below to register anyway."
            setNotice({
              type: "error",
              message: dupMsg,
            })
            toast.error(dupMsg)
            setSaving(false)
            return
          }
          throw createErr
        }
      }

      const vData = await apiFetch<any>("/api/er/visits", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          is_unknown_patient: patientMode === "unknown",
          unknown_patient_label: unknownLabel,
          arrival_mode: arrivalMode,
          incident_date: incidentDate || undefined,
          incident_time: incidentTime || undefined,
          arrival_date: new Date().toISOString().split("T")[0],
          arrival_time:
            hospitalArrivalTime ||
            `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`,
          arrival_at: hospitalArrivalTime || undefined,
        }),
      })
      const visitId = vData?.id || vData?.visit_id || vData?.visit?.id

      await apiFetch(`/api/er/visits/${visitId}/complaints`, {
        method: "POST",
        body: JSON.stringify({
          complaint: chiefComplaint,
          case_category: caseCategory,
          onset_time: symptomOnset || undefined,
          duration: symptomDuration || undefined,
          severity: severity || undefined,
        }),
      })

      if (vitals.hr || vitals.bp || vitals.spo2 || vitals.temp) {
        const vBody: any = {}
        if (vitals.hr) vBody.heart_rate = parseInt(vitals.hr)
        if (vitals.bp && vitals.bp.includes("/")) {
          vBody.bp_systolic = parseInt(vitals.bp.split("/")[0])
          vBody.bp_diastolic = parseInt(vitals.bp.split("/")[1])
        }
        if (vitals.spo2) vBody.spo2 = parseInt(vitals.spo2)
        if (vitals.rr) vBody.respiratory_rate = parseInt(vitals.rr)
        if (vitals.temp) vBody.temperature = parseFloat(vitals.temp)
        if (vitals.pain) vBody.pain_score = parseInt(vitals.pain)
        await apiFetch(`/api/er/visits/${visitId}/vitals`, {
          method: "POST",
          body: JSON.stringify(vBody),
        })
      }

      await apiFetch(`/api/er/visits/${visitId}/triage`, {
        method: "POST",
        body: JSON.stringify({
          category: `B${esi}`,
          triage_bed_label: ESI_GUIDE[esi - 1].label.includes("B")
            ? ESI_GUIDE[esi - 1].label.split("(")[1].replace(")", "")
            : "B1",
          reason: chiefComplaint,
        }),
      })
      toast.success("Emergency patient registered and triaged successfully!")
      onCreated(visitId)
    } catch (error: any) {
      toast.error(error?.message || "Failed to complete ER registration.")
      reportError(setNotice, error, "Failed to complete ER registration.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[#F0F2F5] flex flex-col h-[85vh] rounded-md overflow-hidden">
      {/* Header */}
      <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-[#DDE2EC] shrink-0">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Emergency Room Registration
          </h2>
        </div>
        <Button variant="ghost" onClick={onCancel} className="text-gray-600">
          Close
        </Button>
      </div>

      <div className="p-6 overflow-y-auto flex-1 space-y-5">
        {/* Section 1: Patient Identity */}
        <div className="bg-white border border-[#DDE2EC] rounded shadow-sm">
          <div className="px-5 py-2.5 border-b border-[#DDE2EC] flex justify-between items-center">
            <h3 className="text-xs font-semibold text-gray-900 uppercase">
              1. Patient Identity
            </h3>
            <div className="flex bg-gray-100 p-0.5 rounded border border-[#DDE2EC]">
              {(["new", "existing", "unknown"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPatientMode(mode)}
                  className={`px-3 py-1 text-[11px] font-semibold uppercase rounded transition-all ${
                    patientMode === mode
                      ? "bg-white text-[#1B4FD8] shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {patientMode === "new" && (
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                    First Name
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 text-sm border-[#DDE2EC]"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                    Last Name
                  </label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-8 text-sm border-[#DDE2EC]"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                    Age / Sex
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Yrs"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="h-8 text-sm w-16 border-[#DDE2EC]"
                    />
                    <Select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="h-8 text-sm flex-1 border-[#DDE2EC]"
                    >
                      <option value="Male">M</option>
                      <option value="Female">F</option>
                    </Select>
                  </div>
                </div>
                <div className="col-span-1">
                  <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                    Phone Number
                  </label>
                  <PhoneInput
                    value={phone}
                    onChange={(val) => setPhone(val)}
                    size="sm"
                    placeholder="98765 43210"
                  />
                </div>
                {duplicateMatch && (
                  <div className="col-span-4 mt-2 p-3 bg-amber-50 border border-amber-300 rounded flex items-center justify-between gap-3">
                    <div className="text-[11.5px] text-amber-900">
                      <FiAlertCircle className="inline mr-1.5 -mt-0.5" />
                      A matching patient already exists:{" "}
                      <strong>
                        {duplicateMatch.name} {duplicateMatch.last_name || ""}
                      </strong>{" "}
                      ({duplicateMatch.patient_id})
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSelectedExisting(duplicateMatch)
                          setPatientMode("existing")
                          setExistingQuery(duplicateMatch.name)
                          setDuplicateMatch(null)
                        }}
                        className="h-7 text-[11px] px-2.5"
                      >
                        Use existing patient
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => submit(true)}
                        className="h-7 text-[11px] px-2.5 text-amber-800"
                      >
                        Register anyway
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {patientMode === "existing" && (
              <div>
                <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                  Search by name, phone, or patient ID
                </label>
                <div className="relative">
                  <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                  <Input
                    placeholder="Start typing to search registered patients..."
                    value={existingQuery}
                    onChange={(e) => {
                      setExistingQuery(e.target.value)
                      setSelectedExisting(null)
                    }}
                    className="h-8 text-sm pl-8 border-[#DDE2EC]"
                  />
                </div>
                {selectedExisting ? (
                  <div className="mt-2 p-3 bg-emerald-50 border border-emerald-300 rounded flex items-center justify-between">
                    <div className="text-[11.5px] text-emerald-900">
                      <strong>
                        {selectedExisting.name} {selectedExisting.last_name || ""}
                      </strong>{" "}
                      · {selectedExisting.patient_id} ·{" "}
                      {selectedExisting.age ? `${selectedExisting.age} yrs` : ""}{" "}
                      {selectedExisting.gender || ""}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedExisting(null)}
                      className="h-6 text-[11px] px-2"
                    >
                      Change
                    </Button>
                  </div>
                ) : existingSearching ? (
                  <p className="text-[11px] text-gray-500 mt-2">Searching...</p>
                ) : existingResults.length > 0 ? (
                  <div className="mt-2 border border-[#DDE2EC] rounded divide-y divide-[#F0F2F5] max-h-48 overflow-y-auto">
                    {existingResults.map((p) => (
                      <button
                        key={p.patient_id}
                        onClick={() => setSelectedExisting(p)}
                        className="w-full text-left px-3 py-2 text-[11.5px] hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span>
                          <strong>
                            {p.name} {p.last_name || ""}
                          </strong>{" "}
                          {p.phone && <span className="text-gray-400">· {p.phone}</span>}
                        </span>
                        <span className="font-mono text-gray-500">{p.patient_id}</span>
                      </button>
                    ))}
                  </div>
                ) : existingQuery.trim() ? (
                  <p className="text-[11px] text-gray-500 mt-2">
                    No matching patients found.
                  </p>
                ) : null}
              </div>
            )}
            {patientMode === "unknown" && (
              <div>
                <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                  Unidentified Patient Description
                </label>
                <Input
                  placeholder="e.g. Unknown male, approx 30-40, wearing blue shirt, found unconscious..."
                  value={unknownDesc}
                  onChange={(e) => setUnknownDesc(e.target.value)}
                  className="h-8 text-sm border-red-300 focus:border-red-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Clinical Incident & History */}
        <div className="bg-white border border-[#DDE2EC] rounded shadow-sm">
          <div className="px-5 py-2.5 border-b border-[#DDE2EC]">
            <h3 className="text-xs font-semibold text-gray-900 uppercase">
              2. Clinical Incident & History
            </h3>
          </div>

          <div className="p-5 grid grid-cols-4 gap-4">
            <div className="col-span-1">
              <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                Arrival Mode
              </label>
              <Select
                value={arrivalMode}
                onChange={(e) => setArrivalMode(e.target.value)}
                className="h-8 text-sm border-[#DDE2EC]"
              >
                <option value="Walk-in">Walk-in</option>
                <option value="Ambulance">Ambulance</option>
                <option value="Police / MLC">Police / MLC</option>
                <option value="Referral">Hospital Referral</option>
              </Select>
            </div>
            <div className="col-span-1">
              <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                Case Category
              </label>
              <Select
                value={caseCategory}
                onChange={(e) => setCaseCategory(e.target.value)}
                className="h-8 text-sm border-[#DDE2EC]"
              >
                <option value="General Medical">General Medical</option>
                <option value="Cardiac">Cardiac Emergency</option>
                <option value="Trauma / RTA">Trauma / RTA</option>
                <option value="Poisoning">Poisoning</option>
                <option value="Neurological">Neurological / Stroke</option>
              </Select>
            </div>
            <div className="col-span-1">
              <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                Incident Time
              </label>
              <Input
                type="time"
                value={incidentTime}
                onChange={(e) => setIncidentTime(e.target.value)}
                className="h-8 text-sm font-mono text-gray-800 border-[#DDE2EC]"
              />
            </div>
            <div className="col-span-1">
              <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                Arrival Time
              </label>
              <Input
                type="time"
                value={hospitalArrivalTime}
                onChange={(e) => setHospitalArrivalTime(e.target.value)}
                className="h-8 text-sm font-mono text-gray-800 border-[#DDE2EC]"
              />
            </div>

            <div className="col-span-4 border-t border-[#F0F2F5] pt-4 mt-1">
              <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                Chief Complaint *
              </label>
              <Input
                placeholder="Describe the primary reason for ER visit..."
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="h-9 text-sm font-medium border-[#DDE2EC]"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Vitals & Triage Grid */}
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-white border border-[#DDE2EC] rounded shadow-sm">
            <div className="px-5 py-2.5 border-b border-[#DDE2EC]">
              <h3 className="text-xs font-semibold text-gray-900 uppercase">
                3. Initial Vitals
              </h3>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { k: "bp", l: "Blood Pressure", p: "120/80", u: "mmHg" },
                { k: "hr", l: "Heart Rate", p: "72", u: "bpm" },
                { k: "spo2", l: "Oxygen (SpO₂)", p: "98", u: "%" },
                { k: "temp", l: "Temperature", p: "98.6", u: "°F" },
              ].map((v) => (
                <div key={v.k}>
                  <label className="text-[11px] font-semibold text-gray-600 mb-1 block">
                    {v.l}
                  </label>
                  <div className="relative">
                    <Input
                      value={vitals[(v.k as keyof typeof vitals)]}
                      onKeyDown={(e) => {
                        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
                          e.preventDefault()
                        }
                      }}
                      onChange={(e) => {
                        const k = v.k
                        let clean = e.target.value
                        if (k === "bp") clean = clean.replace(/[^0-9/]/g, "")
                        else if (k === "temp" || k === "weight") {
                          const s = clean.replace(/[^0-9.]/g, "")
                          const p = s.split(".")
                          clean = p.length > 2 ? p[0] + "." + p.slice(1).join("") : s
                        } else {
                          clean = clean.replace(/[^0-9]/g, "")
                        }
                        setVitals((p) => ({ ...p, [k]: clean }))
                      }}
                      placeholder={v.p}
                      className="h-8 font-mono text-sm pr-10 border-[#DDE2EC]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                      {v.u}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#DDE2EC] rounded shadow-sm">
            <div className="px-5 py-2.5 border-b border-[#DDE2EC]">
              <h3 className="text-xs font-semibold text-gray-900 uppercase">
                4. ESI Triage & Bed Allocation *
              </h3>
            </div>
            <div className="p-5 flex flex-col gap-2">
              {ESI_GUIDE.map((g) => (
                <button
                  key={g.level}
                  onClick={() => setEsi(g.level)}
                  className={`w-full text-left px-3 py-2 rounded border transition-all flex justify-between items-center ${
                    esi === g.level
                      ? "shadow-sm"
                      : "border-[#DDE2EC] hover:bg-gray-50"
                  }`}
                  style={
                    esi === g.level
                      ? { backgroundColor: g.bg, borderColor: g.border }
                      : {}
                  }
                >
                  <div>
                    <span
                      className="font-semibold text-sm"
                      style={{ color: esi === g.level ? g.color : "#374151" }}
                    >
                      ESI {g.level} — {g.label}
                    </span>
                    <p className="text-[10px] text-gray-500 mt-0.5">{g.desc}</p>
                  </div>
                  {esi === g.level && (
                    <div className="text-gray-900">
                      <FiArrowRight className="text-sm" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white px-6 py-3 border-t border-[#DDE2EC] flex justify-end shrink-0">
        <Button
          onClick={() => submit()}
          disabled={saving}
          className="bg-[#1B4FD8] hover:bg-blue-700 text-white px-6 h-9 text-sm font-semibold"
        >
          {saving ? "Registering..." : "Assign Triage Bed & Admit"}
        </Button>
      </div>
    </div>
  )
}
