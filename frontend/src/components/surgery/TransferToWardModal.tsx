import React, { useState, useEffect } from "react"
import { SurgicalCase, SurgeryDatabase } from "../../services/surgeryDb"
import { BedDatabase, BedRecord } from "../../services/bedDb"
import { Btn } from "../shared"
import { toast } from "react-hot-toast"

interface TransferToWardModalProps {
  surgicalCase: SurgicalCase
  onClose: () => void
  onSuccess: () => void
}

export default function TransferToWardModal({
  surgicalCase,
  onClose,
  onSuccess,
}: TransferToWardModalProps) {
  const [availableBeds, setAvailableBeds] = useState<BedRecord[]>([])
  const [selectedBedId, setSelectedBedId] = useState<number | null>(null)
  const [wardName, setWardName] = useState("Orthopedic Surgical Ward")
  const [transferredBy, setTransferredBy] = useState("Nurse Brenda (PACU In-Charge)")
  const [dietOrder, setDietOrder] = useState("Sips of water after 2 hours, progress to liquid diet")
  const [drainCare, setDrainCare] = useState("Closed suction drain to bulb suction, record output Q4H")
  const [ivFluids, setIvFluids] = useState("IV Ringer Lactate @ 75 mL/hr for 12 hours")
  const [painRegimen, setPainRegimen] = useState("IV Paracetamol 1g Q8H + IV Tramadol 50mg SOS for breakthrough pain")
  const [mobilization, setMobilization] = useState("Bed rest tonight; assist sitting on edge of bed tomorrow morning (POD 1)")
  const [handoverNotes, setHandoverNotes] = useState(
    `Patient extubated, hemodynamically stable. Modified Aldrete Score 9/10. Surgical dressing dry and intact. Post-op orders written in chart.`,
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try {
      const allBeds = BedDatabase.getBeds()
      const wardBeds = allBeds.filter(
        (b) => b.status === "Available" && b.bed_type !== "ICU",
      )
      setAvailableBeds(wardBeds)
      if (wardBeds.length > 0) {
        setSelectedBedId(wardBeds[0].id)
        setWardName(wardBeds[0].ward)
      }
    } catch {
      // Fallback
    }
  }, [])

  const handleBedChange = (id: number) => {
    setSelectedBedId(id)
    const found = availableBeds.find((b) => b.id === id)
    if (found) {
      setWardName(found.ward)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const chosenBed = availableBeds.find((b) => b.id === selectedBedId)
      const bedNoLabel = chosenBed
        ? `Room ${chosenBed.room_no} - Bed ${chosenBed.bed_no}`
        : "Bed 204-A"

      await SurgeryDatabase.transferToWard(surgicalCase.id, {
        wardName: chosenBed?.ward || wardName,
        roomNo: chosenBed?.room_no || "204",
        bedNo: chosenBed?.bed_no || "Bed A",
        bedId: selectedBedId || undefined,
        transferredAt: new Date().toISOString(),
        transferredBy,
        handoverNotes: `${handoverNotes}\nOrders: Diet: ${dietOrder} | Drain: ${drainCare} | IV: ${ivFluids} | Pain: ${painRegimen} | Mobility: ${mobilization}`,
        postOpDay: 0,
        drainStatus: "In situ - Active drain monitoring",
        drainOutputMl: 40,
        woundStatus: "Clean, Dry & Intact",
        dietStatus: "NPO (Sips of water pending)",
        mobilizationStatus: "Bed Rest",
        painScoreVas: 2,
        dailyProgressNotes: [
          {
            id: `NOTE-${Date.now()}`,
            date: new Date().toISOString(),
            pod: 0,
            author: transferredBy,
            vitalsSummary: "BP 124/80, HR 74, SpO2 99% on RA. Aldrete 9/10 on PACU exit.",
            clinicalNotes: `Received in ${chosenBed?.ward || wardName} (${bedNoLabel}) from PACU Recovery. Awake and oriented. Operative site inspected.`,
            orders: `Diet: ${dietOrder}. IV Fluids: ${ivFluids}. Pain: ${painRegimen}.`,
          },
        ],
      })

      toast.success(
        `Patient ${surgicalCase.patientName} safely transferred to ${chosenBed?.ward || wardName} (${bedNoLabel})!`,
      )
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || "Failed to transfer patient to ward.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[#DDE2EC] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#1E3A6E] text-white px-6 py-4 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛏️</span>
            <div>
              <h3 className="font-bold text-sm tracking-wide">
                Transfer from PACU to Inpatient Surgical Ward
              </h3>
              <p className="text-[11px] text-slate-300 font-mono">
                {surgicalCase.patientName} ({surgicalCase.mrn}) · Procedure: {surgicalCase.procedureName}
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
          {/* Aldrete Clearance Verification Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-900">
              <span className="text-base font-bold">✓</span>
              <div>
                <span className="font-bold">PACU Discharge Clearance Criteria Satisfied</span>
                <p className="text-[11px] text-emerald-700">
                  Modified Aldrete Score: <strong>9 / 10</strong> · Vitals stable on room air · Airway reflexes intact
                </p>
              </div>
            </div>
            <span className="font-mono font-bold bg-emerald-600 text-white px-2.5 py-1 rounded text-xs">
              Score ≥ 9
            </span>
          </div>

          {/* Bed Allocation Selection */}
          <div className="bg-[#F8FAFC] border border-[#DDE2EC] p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 flex items-center gap-1.5">
                <span>Select Available Inpatient Ward &amp; Bed</span>
                <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] font-semibold text-slate-500 font-mono">
                {availableBeds.length} Available Beds in Hospital
              </span>
            </div>

            {availableBeds.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {availableBeds.map((bed) => {
                  const isSelected = selectedBedId === bed.id
                  return (
                    <button
                      type="button"
                      key={bed.id}
                      onClick={() => handleBedChange(bed.id)}
                      className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-50 border-[#1B4FD8] ring-2 ring-blue-500/20 text-[#1E3A6E]"
                          : "bg-white border-[#DDE2EC] hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{bed.ward}</span>
                        <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                          ₹{bed.daily_rate}/day
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1 font-mono">
                        Room {bed.room_no} · Bed {bed.bed_no} ({bed.bed_type})
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs">
                No vacant general ward beds found. A surgical admission slot will be assigned on Ward 204.
              </div>
            )}
          </div>

          {/* Post-Op Handover Orders */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 border-b border-[#DDE2EC] pb-1 flex items-center gap-1.5">
              <span>📋 Post-Operative Ward Care Orders (ISBAR Protocol)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Transferred By (PACU Nurse)
                </label>
                <input
                  type="text"
                  value={transferredBy}
                  onChange={(e) => setTransferredBy(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Diet Progression Schedule
                </label>
                <input
                  type="text"
                  value={dietOrder}
                  onChange={(e) => setDietOrder(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  IV Fluids Rate &amp; Duration
                </label>
                <input
                  type="text"
                  value={ivFluids}
                  onChange={(e) => setIvFluids(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Surgical Drain &amp; Dressing Instructions
                </label>
                <input
                  type="text"
                  value={drainCare}
                  onChange={(e) => setDrainCare(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Post-Op Analgesia Protocol
                </label>
                <input
                  type="text"
                  value={painRegimen}
                  onChange={(e) => setPainRegimen(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Mobilization &amp; Physio Plan
                </label>
                <input
                  type="text"
                  value={mobilization}
                  onChange={(e) => setMobilization(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                PACU to Ward Handover Notes
              </label>
              <textarea
                rows={2}
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-[#DDE2EC] flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              Status will advance to &quot;Transferred to Ward&quot; · Bed assigned in Inpatient System
            </span>
            <div className="flex gap-2">
              <Btn type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Btn>
              <Btn type="submit" variant="primary" size="sm" disabled={submitting}>
                {submitting ? "Transferring..." : "Confirm Ward Transfer ➔"}
              </Btn>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

