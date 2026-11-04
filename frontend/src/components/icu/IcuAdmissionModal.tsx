import React, { useState, useEffect } from "react"
import type { IcuPatient } from "../ICU"
import { db, DBPatient } from "../../services/db"
import { getCurrentDateTimeFormatted } from "./icuSeedData"

interface IcuAdmissionModalProps {
  isOpen: boolean
  onClose: () => void
  availableBeds: string[]
  initialBed?: string
  onAdmit: (patient: IcuPatient) => void
}

export default function IcuAdmissionModal({
  isOpen,
  onClose,
  availableBeds,
  initialBed,
  onAdmit,
}: IcuAdmissionModalProps) {
  const [patients, setPatients] = useState<DBPatient[]>([])
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatientUmr, setSelectedPatientUmr] = useState<string>("")

  // Form fields
  const [selectedBed, setSelectedBed] = useState(initialBed || availableBeds[0] || "MICU-5")
  const [patientName, setPatientName] = useState("")
  const [mrn, setMrn] = useState("")
  const [age, setAge] = useState<number>(46)
  const [sex, setSex] = useState<"M" | "F">("M")
  const [diagnosis, setDiagnosis] = useState("Severe ARDS & Bilateral Bronchopneumonia — Type 1 Respiratory Failure")
  const [provider, setProvider] = useState("Dr. K. Lokesh Kumar Raju (Critical Care)")
  const [nurse, setNurse] = useState("RN Murphy")
  const [stayDays, setStayDays] = useState<number>(1)
  const [ventMode, setVentMode] = useState<string>("SIMV+PS")
  const [bp, setBp] = useState("114/72")
  const [hr, setHr] = useState("88")
  const [rr, setRr] = useState("20")
  const [spo2, setSpo2] = useState("96%")
  const [temp, setTemp] = useState("37.4°C")
  const [isManualCharting, setIsManualCharting] = useState(true)

  useEffect(() => {
    try {
      const list = db.getPatients()
      setPatients(list)
    } catch {
      setPatients([])
    }
  }, [isOpen])

  useEffect(() => {
    if (initialBed) setSelectedBed(initialBed)
    else if (availableBeds.length > 0 && !availableBeds.includes(selectedBed)) {
      setSelectedBed(availableBeds[0])
    }
  }, [initialBed, availableBeds])

  if (!isOpen) return null

  const handleSelectPatient = (p: DBPatient) => {
    setSelectedPatientUmr(p.umr)
    setPatientName(p.name)
    setMrn(p.mrn || p.umr.replace("UMR", "100"))
    setAge(p.age || 45)
    setSex(p.sex === "Female" ? "F" : "M")
    setPatientSearch(p.name)
  }

  const handleQuickLokesh = () => {
    setPatientName("Lokesh P")
    setMrn("100992")
    setAge(46)
    setSex("M")
    setDiagnosis("Severe ARDS & Bilateral Bronchopneumonia — Type 1 Respiratory Failure")
    setProvider("Dr. K. Lokesh Kumar Raju (Critical Care)")
    setNurse("RN Murphy")
    setStayDays(7)
    setVentMode("SIMV+PS")
    setBp("114/72")
    setHr("88")
    setRr("20")
    setSpo2("96%")
    setTemp("37.4°C")
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientName.trim()) {
      alert("Please provide or select a patient name.")
      return
    }

    const unitType = selectedBed.split("-")[0] as any
    const unitName =
      unitType === "MICU"
        ? "Medical ICU"
        : unitType === "SICU"
        ? "Surgical ICU"
        : unitType === "CCU"
        ? "Cardiac ICU"
        : unitType === "NICU"
        ? "Neuro ICU"
        : "Pediatric ICU"

    const newPatient: IcuPatient = {
      bed: selectedBed,
      unit: unitName,
      unitType: unitType || "MICU",
      name: patientName.trim(),
      mrn: mrn.trim() || `MRN-${Math.floor(100000 + Math.random() * 900000)}`,
      age: Number(age) || 45,
      sex: sex,
      dx: diagnosis.trim() || "Critical Care Admission",
      provider: provider.trim() || "Dr. Shah (Critical Care)",
      nurse: nurse.trim() || "RN Murphy",
      los: `${stayDays}d (Day 1 Admission)`,
      totalDays: Number(stayDays) || 1,
      code: "Full Code",
      vitals: {
        bp,
        hr,
        rr,
        temp,
        spo2,
        cvp: "10",
      },
      vent: {
        mode: ventMode,
        fio2: "40%",
        peep: "6",
        tv: "460mL",
        rr: "16",
        pip: "26",
      },
      infusions: [
        {
          drug: "Norepinephrine",
          rate: "0.04 mcg/kg/min",
          concentration: "8mg/250mL",
        },
        {
          drug: "Meropenem",
          rate: "1g Q8H",
          concentration: "1g/100mL",
        },
        {
          drug: "Midazolam",
          rate: "2 mg/hr",
          concentration: "50mg/50mL",
        },
      ],
      alerts: [
        "✅ Ventilator weaning in progress — CPAP trial scheduled",
        "🧪 ABG: pH 7.39, PaO2 84, PaCO2 41, HCO3 24",
      ],
      score: { sofa: 5, apache: 14, rass: -1 },
      hrTrend: [
        { t: "07", v: 92 },
        { t: "08", v: 90 },
        { t: "09", v: 88 },
        { t: "10", v: 86 },
        { t: "11", v: 88 },
      ],
      bpTrend: [
        { t: "07", v: 110 },
        { t: "08", v: 112 },
        { t: "09", v: 116 },
        { t: "10", v: 114 },
        { t: "11", v: 114 },
      ],
      isManualCharting,
    }

    onAdmit(newPatient)
    onClose()
  }

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.umr.toLowerCase().includes(patientSearch.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white border border-[#DDE2EC] rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛏️</span>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                Critical Care — Patient Admission
              </h2>
              <p className="text-[11px] text-slate-300">
                Admit a patient from the hospital master or register emergency ICU occupancy.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
          {/* Quick Preset for Lokesh P */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <div>
                <span className="font-bold text-blue-900">Quick Test Preset: Lokesh P</span>
                <p className="text-[11px] text-blue-700">
                  Pre-fill form with Lokesh P (46y M, Severe ARDS, Dr. K. Lokesh Kumar Raju).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleQuickLokesh}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md shadow-2xs transition-all cursor-pointer"
            >
              Apply Lokesh P
            </button>
          </div>

          {/* Select Registered Hospital Patient */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 flex items-center justify-between">
              <span>Select Registered Patient (from Hospital DB)</span>
              <span className="text-[10.5px] text-slate-400 font-normal">
                {patients.length} patients registered
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by patient name or UMR..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {patientSearch.trim() && filteredPatients.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20 divide-y divide-slate-100">
                  {filteredPatients.slice(0, 6).map((p) => (
                    <button
                      key={p.umr}
                      type="button"
                      onClick={() => handleSelectPatient(p)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <span className="font-semibold text-slate-800">
                        {p.name} ({p.age}y {p.sex})
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">{p.umr}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bed & Demographics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-800 block mb-1">Target ICU Bed *</label>
              <select
                value={selectedBed}
                onChange={(e) => setSelectedBed(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {availableBeds.length > 0 ? (
                  availableBeds.map((b) => (
                    <option key={b} value={b}>
                      {b} (Available)
                    </option>
                  ))
                ) : (
                  <option value={selectedBed}>{selectedBed}</option>
                )}
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-800 block mb-1">Patient Name *</label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Lokesh P"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="font-bold text-slate-800 block mb-1">MRN / Hospital ID</label>
              <input
                type="text"
                value={mrn}
                onChange={(e) => setMrn(e.target.value)}
                placeholder="e.g. 100992"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-800 block mb-1">Age &amp; Sex</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-20 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as any)}
                  className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
            </div>
            <div>
              <label className="font-bold text-slate-800 block mb-1">Attending Physician</label>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="font-bold text-slate-800 block mb-1">Stay Days for Flowsheet</label>
              <select
                value={stayDays}
                onChange={(e) => setStayDays(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
              >
                <option value={10}>10 Days (Full Extended ICU Stay)</option>
                <option value={7}>7 Days (1 Week Stay)</option>
                <option value={5}>5 Days (Moderate Stay)</option>
                <option value={3}>3 Days (Acute Stay)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-800 block mb-1">ICU Admission Diagnosis *</label>
            <input
              type="text"
              required
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          {/* Manual Entry Option */}
          <label className="flex items-start gap-2.5 cursor-pointer bg-amber-50/70 border border-amber-200 p-2.5 rounded-lg">
            <input
              type="checkbox"
              checked={isManualCharting}
              onChange={(e) => setIsManualCharting(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-amber-600 rounded"
            />
            <div>
              <span className="font-bold text-amber-900 block">
                Start with 100% Blank Flowsheet (Enter clinical data manually)
              </span>
              <p className="text-[11px] font-normal text-amber-700">
                Keeps all day-wise rows empty so nurses/doctors can record hourly vitals and notes day-by-day.
              </p>
            </div>
          </label>

          {/* Clinical Telemetry Preview */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
            <span className="font-bold text-slate-900 text-xs block">
              📊 Baseline Critical Care Telemetry &amp; Ventilator
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <div>
                <span className="text-[10px] text-slate-500 font-bold">BP (Sys/Dia)</span>
                <input
                  type="text"
                  value={bp}
                  onChange={(e) => setBp(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold">HR (bpm)</span>
                <input
                  type="text"
                  value={hr}
                  onChange={(e) => setHr(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold">RR (/min)</span>
                <input
                  type="text"
                  value={rr}
                  onChange={(e) => setRr(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold">SpO2</span>
                <input
                  type="text"
                  value={spo2}
                  onChange={(e) => setSpo2(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold">Temp</span>
                <input
                  type="text"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold">Ventilator</span>
                <input
                  type="text"
                  value={ventMode}
                  onChange={(e) => setVentMode(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>✓ Admit Patient to {selectedBed}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
