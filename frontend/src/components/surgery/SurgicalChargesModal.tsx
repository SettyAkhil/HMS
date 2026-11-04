import React from "react"
import { SurgicalCase } from "../../services/surgeryDb"
import { Btn } from "../shared"

interface SurgicalChargesModalProps {
  surgicalCase: SurgicalCase
  onClose: () => void
}

export default function SurgicalChargesModal({
  surgicalCase,
  onClose,
}: SurgicalChargesModalProps) {
  const implantsTotal = (surgicalCase.implantsAndConsumables || []).reduce(
    (acc, item) => acc + item.unitCost * item.quantity,
    0,
  )

  const orRoomCharge = 7000
  const surgeonFee = 25000
  const anesthesiaFee = 8500
  const pacuRecoveryFee = 4200
  const generalConsumables = 10000

  const computedTotal =
    surgicalCase.totalAmount > 0
      ? surgicalCase.totalAmount
      : orRoomCharge + surgeonFee + anesthesiaFee + pacuRecoveryFee + generalConsumables + implantsTotal

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-[#DDE2EC] text-xs">
        {/* Header */}
        <div className="bg-emerald-700 text-white px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-base">💰</span>
            <div>
              <h3 className="font-bold text-sm">
                Surgical Charges &amp; Package Invoice
              </h3>
              <p className="text-[10.5px] text-emerald-100 font-mono">
                {surgicalCase.patientName} ({surgicalCase.mrn})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-base font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0] space-y-1">
            <div className="flex justify-between text-slate-800 font-bold">
              <span>Procedure:</span>
              <span className="text-slate-900">{surgicalCase.procedureName}</span>
            </div>
            <div className="flex justify-between text-slate-500 font-mono text-[11px]">
              <span>Specialty / CPT:</span>
              <span>{surgicalCase.specialty} ({surgicalCase.cptCode})</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Primary Surgeon:</span>
              <span className="font-semibold text-slate-800">Dr. {surgicalCase.surgeon}</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Insurance Coverage:</span>
              <span className="font-semibold text-slate-800">{surgicalCase.insuranceProvider}</span>
            </div>
          </div>

          {/* Breakdown Items */}
          <div className="space-y-1.5 divide-y divide-[#F1F5F9] pt-1">
            <div className="flex justify-between py-1 text-slate-700">
              <span>Operating Theatre Room Suite (2 hrs @ ₹3,500/hr)</span>
              <span className="font-mono font-semibold text-slate-900">₹{orRoomCharge.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-1 text-slate-700">
              <span>Surgeon Professional &amp; Operative Fee</span>
              <span className="font-mono font-semibold text-slate-900">₹{surgeonFee.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-1 text-slate-700">
              <span>Anesthesiology Fee &amp; Monitoring Station</span>
              <span className="font-mono font-semibold text-slate-900">₹{anesthesiaFee.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-1 text-slate-700">
              <span>PACU Post-Anesthesia Recovery Care</span>
              <span className="font-mono font-semibold text-slate-900">₹{pacuRecoveryFee.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-1 text-slate-700">
              <span>Standard Surgical Disposables &amp; Drapes</span>
              <span className="font-mono font-semibold text-slate-900">₹{generalConsumables.toLocaleString()}</span>
            </div>

            {(surgicalCase.implantsAndConsumables || []).map((imp) => (
              <div key={imp.id} className="flex justify-between py-1 text-slate-700 font-mono text-[11px]">
                <span className="font-sans">{imp.name} (Lot {imp.lotNumber})</span>
                <span className="font-semibold text-slate-900">
                  ₹{(imp.unitCost * imp.quantity).toLocaleString()}
                </span>
              </div>
            ))}

            <div className="flex justify-between py-2.5 font-bold text-sm text-slate-900 border-t-2 border-[#DDE2EC]">
              <span>Total Surgical Bill</span>
              <span className="font-mono text-emerald-700 text-base">₹{computedTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="p-2.5 bg-blue-50 text-blue-900 rounded-lg border border-blue-200 text-[11px] flex justify-between items-center">
            <span>Billing Status:</span>
            <span className="font-bold font-mono uppercase">
              {surgicalCase.billedAt ? "Invoiced & Settled" : "Auto-Posted to Inpatient Ledger"}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#F8FAFC] border-t border-[#DDE2EC] flex justify-end">
          <Btn variant="primary" size="sm" onClick={onClose}>
            Close Invoice Summary
          </Btn>
        </div>
      </div>
    </div>
  )
}

