import React, { useState } from "react"
import { SurgicalCase, SurgeryDatabase } from "../../services/surgeryDb"
import { BedDatabase } from "../../services/bedDb"
import { Btn } from "../shared"
import { toast } from "react-hot-toast"

interface TransferToIcuModalProps {
  surgicalCase: SurgicalCase
  onClose: () => void
  onSuccess: () => void
}

export default function TransferToIcuModal({
  surgicalCase,
  onClose,
  onSuccess,
}: TransferToIcuModalProps) {
  const [icuUnit, setIcuUnit] = useState<"SICU" | "MICU" | "CCU" | "PICU">("SICU")
  const [bedNo, setBedNo] = useState("SICU Bed 3")
  const [transferredBy, setTransferredBy] = useState("Dr. Rodriguez (Anesthesiology)")
  const [intubated, setIntubated] = useState(true)
  const [ventilatorMode, setVentilatorMode] = useState("SIMV-VC: TV 480mL, RR 16, PEEP 8, FiO2 50%")
  const [inotropes, setInotropes] = useState("Norepinephrine 0.08 mcg/kg/min titrated for MAP > 65")
  const [arterialLine, setArterialLine] = useState(true)
  const [centralVenousLine, setCentralVenousLine] = useState(true)
  const [handoverNotes, setHandoverNotes] = useState(
    "High-risk surgery with significant fluid shift. Arterial line in right radial artery. Requires close hemodynamic and ventilatory support.",
  )
  const [criticalConcerns, setCriticalConcerns] = useState(
    "Monitor for coagulopathy, metabolic acidosis, serial ABG Q2H, and closed suction drain output Q1H.",
  )
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await SurgeryDatabase.transferToIcu(surgicalCase.id, {
        icuUnit,
        bedNo,
        transferredAt: new Date().toISOString(),
        transferredBy,
        intubated,
        ventilatorMode: intubated ? ventilatorMode : undefined,
        inotropes: inotropes.trim() || undefined,
        arterialLine,
        centralVenousLine,
        handoverNotes,
        criticalConcerns,
      })

      toast.success(
        `Patient ${surgicalCase.patientName} safely transferred to ${icuUnit} (${bedNo})!`,
      )
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.message || "Failed to transfer patient to ICU.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[#DDE2EC] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-rose-900 text-white px-6 py-4 flex items-center justify-between border-b border-rose-800">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🫀</span>
            <div>
              <h3 className="font-bold text-sm tracking-wide">
                Critical Care Transfer to Surgical ICU (SICU)
              </h3>
              <p className="text-[11px] text-rose-200 font-mono">
                {surgicalCase.patientName} ({surgicalCase.mrn}) · {surgicalCase.procedureName}
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
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs">
            <div className="font-bold flex items-center gap-1.5">
              <span>⚠️ High-Risk Intensive Care Handover</span>
            </div>
            <p className="text-[11px] text-rose-800 mt-0.5">
              Patient requires invasive monitoring, mechanical ventilation, or active vasoactive support. Direct transfer to Critical Care Unit.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Target Intensive Care Unit
              </label>
              <select
                value={icuUnit}
                onChange={(e) => setIcuUnit(e.target.value as any)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
              >
                <option value="SICU">SICU (Surgical Intensive Care Unit)</option>
                <option value="MICU">MICU (Medical Intensive Care Unit)</option>
                <option value="CCU">CCU (Coronary Care Unit)</option>
                <option value="PICU">PICU (Pediatric Intensive Care Unit)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                ICU Bed Allocation
              </label>
              <input
                type="text"
                value={bedNo}
                onChange={(e) => setBedNo(e.target.value)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
                required
              />
            </div>
          </div>

          <div className="p-3.5 bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                <input
                  type="checkbox"
                  checked={intubated}
                  onChange={(e) => setIntubated(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <span>Patient Intubated / On Mechanical Ventilator</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                <input
                  type="checkbox"
                  checked={arterialLine}
                  onChange={(e) => setArterialLine(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span>Arterial Line In Situ</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                <input
                  type="checkbox"
                  checked={centralVenousLine}
                  onChange={(e) => setCentralVenousLine(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                />
                <span>CVC Line</span>
              </label>
            </div>

            {intubated && (
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Ventilator Mode &amp; Settings
                </label>
                <input
                  type="text"
                  value={ventilatorMode}
                  onChange={(e) => setVentilatorMode(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white font-mono focus:outline-none focus:border-slate-800"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Inotrope / Vasopressor Infusions
              </label>
              <input
                type="text"
                value={inotropes}
                onChange={(e) => setInotropes(e.target.value)}
                className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white font-mono focus:outline-none focus:border-slate-800"
                placeholder="e.g. Norepinephrine 0.05 mcg/kg/min or None"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-700 block mb-1">
              Critical Concerns &amp; Monitoring Orders
            </label>
            <textarea
              rows={2}
              value={criticalConcerns}
              onChange={(e) => setCriticalConcerns(e.target.value)}
              className="w-full border border-[#DDE2EC] rounded-lg p-2 text-xs bg-white focus:outline-none focus:border-slate-800"
            />
          </div>

          <div className="pt-3 border-t border-[#DDE2EC] flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              Status will advance to &quot;Transferred to ICU&quot;
            </span>
            <div className="flex gap-2">
              <Btn type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Btn>
              <Btn type="submit" variant="danger" size="sm" disabled={submitting}>
                {submitting ? "Transferring..." : "Confirm SICU Transfer ➔"}
              </Btn>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

