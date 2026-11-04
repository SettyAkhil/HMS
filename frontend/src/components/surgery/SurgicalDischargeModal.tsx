import React, { useState } from "react"
import { SurgicalCase, SurgeryDatabase } from "../../services/surgeryDb"
import { Btn } from "../shared"
import { toast } from "react-hot-toast"

interface SurgicalDischargeModalProps {
  surgicalCase: SurgicalCase
  onClose: () => void
  onSuccess: () => void
}

export default function SurgicalDischargeModal({
  surgicalCase,
  onClose,
  onSuccess,
}: SurgicalDischargeModalProps) {
  // Clinical discharge readiness checklist
  const [criteria, setCriteria] = useState({
    afebrile: true,
    oralDiet: true,
    painManaged: true,
    woundClean: true,
    drainManaged: true,
    ambulating: true,
    labsReviewed: true,
  })

  const [dischargedBy, setDischargedBy] = useState(`Dr. ${surgicalCase.surgeon}`)
  const [dischargeType, setDischargeType] = useState<
    "Routine Discharge Home" | "Transferred to Step-Down Facility" | "Discharged on Request"
  >("Routine Discharge Home")
  const [conditionAtDischarge, setConditionAtDischarge] = useState(
    "Hemodynamically stable, afebrile, surgical incision clean and dry, walking independently, tolerating oral diet.",
  )
  const [sutureRemovalDate, setSutureRemovalDate] = useState("2026-10-08 (POD 8)")
  const [followUpDate, setFollowUpDate] = useState("2026-10-08 at 10:00 AM (Surgical OPD)")
  const [followUpClinic, setFollowUpClinic] = useState("General & Laparoscopic Surgery Outpatient Clinic")
  const [woundCareInstructions, setWoundCareInstructions] = useState(
    "Keep dressing dry and clean. Do not scrub or soak incision in bathtub. Avoid heavy lifting (> 5 kg) for 4 weeks.",
  )

  const [meds, setMeds] = useState([
    {
      drug: "Tab Cefuroxime Axetil",
      dose: "500 mg",
      route: "Oral",
      frequency: "Twice daily (BD)",
      duration: "5 days",
      instructions: "Take after meals",
    },
    {
      drug: "Tab Aceclofenac + Paracetamol",
      dose: "100mg / 325mg",
      route: "Oral",
      frequency: "Twice daily (BD)",
      duration: "3 days",
      instructions: "Take after food with plenty of water",
    },
    {
      drug: "Tab Pantoprazole",
      dose: "40 mg",
      route: "Oral",
      frequency: "Once daily (OD)",
      duration: "7 days",
      instructions: "Take 30 mins before breakfast in the morning",
    },
  ])

  const warningSigns = [
    "High fever (> 101°F) or persistent chills",
    "Increasing erythema, warmth, or purulent soakage from wound",
    "Intractable pain not relieved by prescribed analgesics",
    "Persistent vomiting or inability to retain fluids",
    "Calf pain, swelling, or shortness of breath (DVT/PE alert)",
  ]

  const [submitting, setSubmitting] = useState(false)

  const allCriteriaPassed = Object.values(criteria).every(Boolean)

  const handleAddMed = () => {
    setMeds([
      ...meds,
      {
        drug: "",
        dose: "",
        route: "Oral",
        frequency: "Once daily (OD)",
        duration: "5 days",
        instructions: "",
      },
    ])
  }

  const handleMedChange = (index: number, field: string, val: string) => {
    const updated = [...meds]
    updated[index] = { ...updated[index], [field]: val }
    setMeds(updated)
  }

  const handleRemoveMed = (index: number) => {
    setMeds(meds.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allCriteriaPassed) {
      toast.error("Please verify all clinical discharge criteria before executing discharge.")
      return
    }

    setSubmitting(true)
    try {
      await SurgeryDatabase.dischargeSurgicalPatient(surgicalCase.id, {
        dischargedAt: new Date().toISOString(),
        dischargedBy,
        dischargeType,
        conditionAtDischarge,
        sutureRemovalDate,
        followUpDate,
        followUpClinic,
        dischargeMedications: meds.filter((m) => m.drug.trim()),
        woundCareInstructions,
        warningSigns,
        emergencyHelpline: "+91 800-419-7700 (24x7 Surgical Emergency)",
        billingSettled: true,
        totalBillAmount: surgicalCase.totalAmount,
      })

      toast.success(
        `Patient ${surgicalCase.patientName} successfully discharged! Ward bed released & summary generated.`,
      )
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || "Failed to process surgical discharge.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden border border-[#DDE2EC] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-emerald-800 text-white px-6 py-4 flex items-center justify-between border-b border-emerald-900">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🎓</span>
            <div>
              <h3 className="font-bold text-sm tracking-wide">
                Surgical Discharge Readiness Evaluation &amp; Release
              </h3>
              <p className="text-[11px] text-emerald-200 font-mono">
                {surgicalCase.patientName} ({surgicalCase.mrn}) · {surgicalCase.procedureName} · Ward: {surgicalCase.wardTransfer?.wardName || "Inpatient Ward"} ({surgicalCase.wardTransfer?.bedNo || "Bed"})
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Section 1: Clinical Discharge Criteria */}
          <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#DDE2EC] pb-2">
              <span className="font-bold text-slate-900 text-xs">
                ✅ Surgical Discharge Readiness Criteria Checklist
              </span>
              <span
                className={`text-[10.5px] font-bold px-2 py-0.5 rounded font-mono ${
                  allCriteriaPassed
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                }`}
              >
                {allCriteriaPassed ? "All Criteria Satisfied ✓" : "Pending Checklist Items"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={criteria.afebrile}
                  onChange={(e) => setCriteria({ ...criteria, afebrile: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Afebrile for &gt; 24 hours without antipyretics</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={criteria.oralDiet}
                  onChange={(e) => setCriteria({ ...criteria, oralDiet: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Tolerating full oral diet without nausea/vomiting</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={criteria.painManaged}
                  onChange={(e) => setCriteria({ ...criteria, painManaged: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Pain adequately controlled on oral analgesics (VAS &lt; 3)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={criteria.woundClean}
                  onChange={(e) => setCriteria({ ...criteria, woundClean: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Surgical wound clean, dry, edges approximated</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={criteria.drainManaged}
                  onChange={(e) => setCriteria({ ...criteria, drainManaged: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Surgical drain removed OR patient educated on home drain care</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={criteria.ambulating}
                  onChange={(e) => setCriteria({ ...criteria, ambulating: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Mobilizing independently / baseline functional mobility</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                <input
                  type="checkbox"
                  checked={criteria.labsReviewed}
                  onChange={(e) => setCriteria({ ...criteria, labsReviewed: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Post-op blood labs &amp; imaging reviewed &amp; satisfactory</span>
              </label>
            </div>
          </div>

          {/* Section 2: Discharge Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Discharging Surgeon / Consultant
              </label>
              <input
                type="text"
                value={dischargedBy}
                onChange={(e) => setDischargedBy(e.target.value)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Discharge Disposition Type
              </label>
              <select
                value={dischargeType}
                onChange={(e) => setDischargeType(e.target.value as any)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
              >
                <option value="Routine Discharge Home">Routine Discharge Home</option>
                <option value="Transferred to Step-Down Facility">Transferred to Step-Down Facility</option>
                <option value="Discharged on Request">Discharged on Request</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-700 block mb-1">
              Condition at Discharge Summary
            </label>
            <textarea
              rows={2}
              value={conditionAtDischarge}
              onChange={(e) => setConditionAtDischarge(e.target.value)}
              className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
            />
          </div>

          {/* Section 3: Take-Home Medications Table */}
          <div className="border border-[#DDE2EC] rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">
                💊 Take-Home Discharge Medication Prescription
              </span>
              <button
                type="button"
                onClick={handleAddMed}
                className="text-[11px] font-bold text-[#1B4FD8] hover:underline cursor-pointer"
              >
                + Add Medicine
              </button>
            </div>

            <div className="space-y-2">
              {meds.map((med, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Medicine name"
                      value={med.drug}
                      onChange={(e) => handleMedChange(idx, "drug", e.target.value)}
                      className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="Dose"
                      value={med.dose}
                      onChange={(e) => handleMedChange(idx, "dose", e.target.value)}
                      className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="Freq (e.g. BD)"
                      value={med.frequency}
                      onChange={(e) => handleMedChange(idx, "frequency", e.target.value)}
                      className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Duration"
                      value={med.duration}
                      onChange={(e) => handleMedChange(idx, "duration", e.target.value)}
                      className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveMed(idx)}
                      className="text-slate-400 hover:text-rose-600 font-bold text-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Follow-up & Suture Removal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Suture / Staple Removal Scheduled Date
              </label>
              <input
                type="text"
                value={sutureRemovalDate}
                onChange={(e) => setSutureRemovalDate(e.target.value)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white font-mono focus:outline-none focus:border-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Follow-up Clinic &amp; Appointment
              </label>
              <input
                type="text"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
              />
            </div>
          </div>

          {/* Warning Signs */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
            <span className="font-bold flex items-center gap-1.5 mb-1">
              ⚠️ Red-Flag Warning Signs Provided to Patient
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10.5px] text-amber-800">
              {warningSigns.map((w, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span>•</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-[#DDE2EC] flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              Releases Ward Bed in BedDatabase · Closes Billing · Saves Discharge Summary
            </span>
            <div className="flex gap-2">
              <Btn type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Btn>
              <Btn type="submit" variant="primary" size="sm" disabled={submitting}>
                {submitting ? "Processing Discharge..." : "Complete Discharge & Release Bed ➔"}
              </Btn>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

