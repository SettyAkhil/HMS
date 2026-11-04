import React, { useState } from "react"
import { SurgeryDatabase, UrgencyLevel } from "../../services/surgeryDb"
import { Btn } from "../shared"
import { toast } from "react-hot-toast"

interface ScheduleSurgeryModalProps {
  initialOrRoom?: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function ScheduleSurgeryModal({
  initialOrRoom,
  onClose,
  onSuccess,
}: ScheduleSurgeryModalProps) {
  const [patientName, setPatientName] = useState("")
  const [mrn, setMrn] = useState(`UMR${Math.floor(100100 + Math.random() * 899000)}`)
  const [ipNo, setIpNo] = useState(`IP-${Math.floor(884900 + Math.random() * 900)}`)
  const [age, setAge] = useState("45")
  const [gender, setGender] = useState<"Male" | "Female" | "Other">("Male")
  const [source, setSource] = useState<"OPD Consultation" | "Inpatient Ward" | "Emergency Department">("OPD Consultation")
  const [procedure, setProcedure] = useState("")
  const [specialty, setSpecialty] = useState("General Surgery")
  const [cptCode, setCptCode] = useState("47562")
  const [icd10Code, setIcd10Code] = useState("K80.20")
  const [surgeon, setSurgeon] = useState("Dr. Adams")
  const [assistantSurgeon, setAssistantSurgeon] = useState("Dr. Williams")
  const [anesthesiologist, setAnesthesiologist] = useState("Dr. Rodriguez")
  const [orRoom, setOrRoom] = useState(initialOrRoom || "OR 1")
  const [scheduledTime, setScheduledTime] = useState("09:00 AM")
  const [durationEst, setDurationEst] = useState("120 mins")
  const [urgency, setUrgency] = useState<UrgencyLevel>("Elective")
  const [insuranceProvider, setInsuranceProvider] = useState("Star Health")
  const [totalAmount, setTotalAmount] = useState(48000)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientName.trim() || !procedure.trim()) {
      toast.error("Please enter patient name and surgical procedure.")
      return
    }

    setSubmitting(true)
    try {
      await SurgeryDatabase.createCase({
        patientId: mrn,
        patientName,
        mrn,
        ipNo,
        age: parseInt(age) || 45,
        gender,
        procedureName: procedure,
        specialty,
        cptCode,
        icd10Code,
        surgeon,
        assistantSurgeon,
        anesthesiologist,
        scrubNurse: "RN Murphy",
        circulatingNurse: "RN Davis",
        orRoom,
        scheduledTime,
        durationEst,
        urgency,
        insuranceProvider,
        totalAmount,
        status: urgency === "Emergency STAT" ? "Pre-Op Holding" : "PAC Pending",
      })

      toast.success(`Surgery case scheduled successfully for ${patientName} in ${orRoom}!`)
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || "Failed to schedule surgery case.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[#DDE2EC] flex flex-col max-h-[92vh] text-xs">
        {/* Header */}
        <div className="bg-[#1E3A6E] text-white px-6 py-4 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📅</span>
            <div>
              <h3 className="font-bold text-sm tracking-wide">
                Schedule New Surgical Case
              </h3>
              <p className="text-[11px] text-slate-300">
                Operating Theatre Booking &amp; Pre-Anesthetic Workup Intake
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Patient Demographics */}
          <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-3.5 space-y-3">
            <div className="font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex items-center justify-between">
              <span>Patient Demographics &amp; Origin</span>
              <span className="text-[10.5px] font-normal text-slate-500">
                Origin: {source}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Patient Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Meera Subramanian"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Patient Source
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as any)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                >
                  <option value="OPD Consultation">OPD Consultation</option>
                  <option value="Inpatient Ward">Inpatient Ward</option>
                  <option value="Emergency Department">Emergency (ER)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">MRN / UMR</label>
                <input
                  type="text"
                  value={mrn}
                  onChange={(e) => setMrn(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">IP Number</label>
                <input
                  type="text"
                  value={ipNo}
                  onChange={(e) => setIpNo(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Age</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Procedure & Surgical Team */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Surgical Procedure Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Laparoscopic Cholecystectomy"
                  value={procedure}
                  onChange={(e) => setProcedure(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Surgical Specialty
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                >
                  <option value="General Surgery">General Surgery</option>
                  <option value="Orthopedics">Orthopedics</option>
                  <option value="Neurosurgery">Neurosurgery</option>
                  <option value="Cardiothoracic">Cardiothoracic</option>
                  <option value="Urology">Urology</option>
                  <option value="ENT">ENT</option>
                  <option value="Ophthalmology">Ophthalmology</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Primary Chief Surgeon
                </label>
                <select
                  value={surgeon}
                  onChange={(e) => setSurgeon(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                >
                  <option value="Dr. Adams">Dr. Adams (Orthopedics)</option>
                  <option value="Dr. Williams">Dr. Williams (General &amp; Lap)</option>
                  <option value="Dr. Vikram Seth">Dr. Vikram Seth (Laparoscopy)</option>
                  <option value="Dr. Patel">Dr. Patel (Cardiothoracic)</option>
                  <option value="Dr. Vance">Dr. Vance (Trauma Surgery)</option>
                  <option value="Dr. Park">Dr. Park (Ophthalmology)</option>
                  <option value="Dr. Gupta">Dr. Gupta (Neurosurgery)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Assistant Surgeon
                </label>
                <input
                  type="text"
                  value={assistantSurgeon}
                  onChange={(e) => setAssistantSurgeon(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Lead Anesthesiologist
                </label>
                <select
                  value={anesthesiologist}
                  onChange={(e) => setAnesthesiologist(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                >
                  <option value="Dr. Rodriguez">Dr. Rodriguez, MD</option>
                  <option value="Dr. Kim">Dr. Kim, MD</option>
                  <option value="Dr. Brody">Dr. Brody, MD</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Operating Room
                </label>
                <select
                  value={orRoom}
                  onChange={(e) => setOrRoom(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                >
                  <option value="OR 1">OR 1 (General)</option>
                  <option value="OR 2">OR 2 (Cardio/Laminar)</option>
                  <option value="OR 3">OR 3 (Ortho/Joint)</option>
                  <option value="OR 4">OR 4 (Urology)</option>
                  <option value="Emergency OR 1">Emergency OR 1</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Scheduled Time
                </label>
                <input
                  type="text"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Estimated Duration
                </label>
                <input
                  type="text"
                  value={durationEst}
                  onChange={(e) => setDurationEst(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Urgency Level
                </label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as any)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-semibold"
                >
                  <option value="Elective">Elective</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Emergency STAT">Emergency STAT</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Insurance Provider / TPA
                </label>
                <input
                  type="text"
                  value={insuranceProvider}
                  onChange={(e) => setInsuranceProvider(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Estimated Surgical Package Amount (₹)
                </label>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(Number(e.target.value))}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-[#DDE2EC] flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              Auto-initiates Stage 1: Pre-Op PAC Assessment &amp; Consents
            </span>
            <div className="flex gap-2">
              <Btn type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Btn>
              <Btn type="submit" variant="primary" size="sm" disabled={submitting}>
                {submitting ? "Booking Case..." : "Confirm & Schedule Surgery ➔"}
              </Btn>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

