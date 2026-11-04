import React, { useState, useMemo } from "react"
import toast from "react-hot-toast"
import { db, DBPatient } from "../../services/db"
import { IMAGING_CATALOG } from "../Radiology"
import { RadiologyWorkflowDb } from "../../services/radiologyWorkflowDb"
import {
  X,
  Search,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Stethoscope,
  ShieldAlert,
  User,
} from "lucide-react"

interface NewInvestigationOrderModalProps {
  onClose: () => void
  onOrderCreated: (message: string) => void
}

export default function NewInvestigationOrderModal({
  onClose,
  onOrderCreated,
}: NewInvestigationOrderModalProps) {
  const patients = useMemo(() => db.getPatients(), [])
  const encounters = useMemo(() => db.getEncounters(), [])

  const [searchPatient, setSearchPatient] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<DBPatient | null>(
    patients[0] || null,
  )
  const [selectedStudyName, setSelectedStudyName] = useState(
    IMAGING_CATALOG[0]?.study || "Chest X-Ray PA/Lateral",
  )
  const [doctorName, setDoctorName] = useState("Dr. Vikram Seth, MD")
  const [priority, setPriority] = useState<"Routine" | "STAT" | "Elective">("Routine")
  const [indication, setIndication] = useState("")
  const [autoVerifyNurse, setAutoVerifyNurse] = useState(true)
  const [nurseName, setNurseName] = useState("Staff Nurse (OPD)")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Filter patients by search
  const filteredPatients = useMemo(() => {
    if (!searchPatient.trim()) return patients.slice(0, 10)
    const q = searchPatient.toLowerCase().trim()
    return patients
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.umr.toLowerCase().includes(q) ||
          (p.phone && p.phone.includes(q)),
      )
      .slice(0, 10)
  }, [patients, searchPatient])

  // Selected catalog item
  const selectedCatalogItem = useMemo(() => {
    return (
      IMAGING_CATALOG.find((c) => c.study === selectedStudyName) ||
      IMAGING_CATALOG[0]
    )
  }, [selectedStudyName])

  // Duplicate investigation check
  const duplicateCheck = useMemo(() => {
    if (!selectedPatient) return { isDuplicate: false }
    return RadiologyWorkflowDb.checkDuplicateInvestigation(
      selectedPatient.umr,
      selectedStudyName,
    )
  }, [selectedPatient, selectedStudyName])

  // Auto-fill indication from catalog when test changes
  const handleStudyChange = (studyName: string) => {
    setSelectedStudyName(studyName)
    const cat = IMAGING_CATALOG.find((c) => c.study === studyName)
    if (cat && !indication) {
      setIndication(cat.indication || "")
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!selectedPatient) {
      const msg = "Please select a valid patient."
      setErrorMessage(msg)
      toast.error(msg)
      return
    }

    if (!indication.trim()) {
      const msg = "Clinical indication is required for radiology examination."
      setErrorMessage(msg)
      toast.error(msg)
      return
    }

    if (duplicateCheck.isDuplicate) {
      const msg =
        duplicateCheck.message ||
        "Duplicate investigation prevented: This patient already has an active order for this test."
      setErrorMessage(msg)
      toast.error(msg)
      return
    }

    try {
      // Find encounter if any
      const matchingEnc = encounters.find(
        (enc) => enc.umr === selectedPatient.umr,
      )

      RadiologyWorkflowDb.doctorOrdersInvestigation({
        patientName: selectedPatient.name,
        umr: selectedPatient.umr,
        mrn: (selectedPatient as any).mrn || selectedPatient.umr.replace(/\D/g, "") || "100201",
        opNumber: matchingEnc?.opNumber || `OP-${(selectedPatient as any).mrn || selectedPatient.umr.replace(/\D/g, "") || "1002"}`,
        ipNumber: undefined,
        encounterId: matchingEnc?.id,
        studyName: selectedCatalogItem.study,
        modality: selectedCatalogItem.modality,
        priority,
        doctorName,
        department: "Radiology & Imaging",
        indication: indication.trim(),
        price: selectedCatalogItem.price,
        room: selectedCatalogItem.room,
        technique: selectedCatalogItem.technique,
        autoVerifyNurse,
        nurseName: autoVerifyNurse ? nurseName : undefined,
      })

      const successMsg = `✓ Radiology investigation "${selectedCatalogItem.study}" prescribed for ${selectedPatient.name} (UMR: ${selectedPatient.umr}). ${
        autoVerifyNurse
          ? "Verified by nurse & forwarded to Billing & Radiology."
          : "Awaiting nurse verification."
      }`
      toast.success(successMsg)
      onOrderCreated(successMsg)
      onClose()
    } catch (err: any) {
      const msg = err.message || "Failed to create radiology order."
      setErrorMessage(msg)
      toast.error(msg)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Stethoscope size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Prescribe Radiology Investigation
              </h3>
              <p className="text-xs text-slate-300">
                Doctor Investigation Order • Verified Workflow • Central Billing Integrated
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Real Patient Selection */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <User size={14} className="text-indigo-600" /> Select Real Patient
              </label>
              <span className="text-[11px] text-slate-500">Connected to HMS Patients DB</span>
            </div>

            {/* Patient Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search patient by Name, UMR number, phone..."
                value={searchPatient}
                onChange={(e) => setSearchPatient(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Quick Patient Selector Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {filteredPatients.map((p) => {
                const isSelected = selectedPatient?.umr === p.umr
                return (
                  <button
                    key={p.umr}
                    type="button"
                    onClick={() => setSelectedPatient(p)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50/80 border-indigo-400 ring-1 ring-indigo-400"
                        : "bg-slate-50/60 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 truncate">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between mt-0.5 font-mono">
                      <span>UMR: {p.umr}</span>
                      <span>{(p as any).gender || p.sex || "Patient"}, {p.age}y</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {selectedPatient && (
              <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  <span>
                    Selected: <strong>{selectedPatient.name}</strong> (UMR: <span className="font-mono">{selectedPatient.umr}</span>)
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700">Verified Patient</span>
              </div>
            )}
          </div>

          {/* 2. Investigation Selection */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Radiology Test Catalog
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-500 mb-1 block">Test / Examination:</span>
                <select
                  value={selectedStudyName}
                  onChange={(e) => handleStudyChange(e.target.value)}
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {IMAGING_CATALOG.map((cat) => (
                    <option key={cat.code} value={cat.study}>
                      [{cat.category}] {cat.study} (₹{cat.price})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 mb-1 block">Priority / Urgency:</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Routine">Routine (Regular Queue)</option>
                  <option value="STAT">🚨 STAT (Emergency / Immediate)</option>
                  <option value="Elective">Elective / Scheduled</option>
                </select>
              </div>
            </div>

            {/* Test Details Strip */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs grid grid-cols-3 gap-2">
              <div>
                <span className="text-slate-500 block text-[10.5px]">Modality:</span>
                <span className="font-bold text-indigo-700">{selectedCatalogItem.modality} ({selectedCatalogItem.category})</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10.5px]">Tariff Price:</span>
                <span className="font-bold text-slate-900">₹{selectedCatalogItem.price.toLocaleString("en-IN")}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10.5px]">Assigned Suite:</span>
                <span className="font-semibold text-slate-800">{selectedCatalogItem.room}</span>
              </div>
            </div>

            {/* Duplicate Warning Guardrail */}
            {duplicateCheck.isDuplicate && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                <ShieldAlert size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Duplicate Investigation Prevented!</strong>
                  <span>{duplicateCheck.message}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Ordering Doctor & Clinical Indication */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Ordering Doctor
                </label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Examination Room
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedCatalogItem.room}
                  className="w-full p-2 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Clinical Indication / Reason for Study <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={2}
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                placeholder="Enter patient clinical symptoms, provisional diagnosis, or rule-out objective..."
                className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* 4. Nurse Verification Option */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={autoVerifyNurse}
                    onChange={(e) => setAutoVerifyNurse(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Verify by Nurse now & forward to Billing and Radiology</span>
                </label>
                <p className="text-[11px] text-slate-500 ml-5.5 mt-0.5">
                  Per workflow flowchart, verified orders are sent simultaneously to Central Billing and the Radiology worklist.
                </p>
              </div>
            </div>

            {autoVerifyNurse && (
              <div className="pt-2">
                <span className="text-[11px] text-slate-500 block mb-1">Verifying Nurse Staff:</span>
                <input
                  type="text"
                  value={nurseName}
                  onChange={(e) => setNurseName(e.target.value)}
                  className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-200">
          <span className="text-xs text-slate-500 font-medium">
            Tariff Price: <strong>₹{selectedCatalogItem.price.toLocaleString("en-IN")}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={duplicateCheck.isDuplicate}
              onClick={handleSubmit}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ${
                duplicateCheck.isDuplicate
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              <PlusCircle size={15} />
              <span>Prescribe Investigation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
