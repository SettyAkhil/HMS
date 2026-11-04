import React from "react"
import { SurgicalCase, SurgeryStatus } from "../../services/surgeryDb"

interface SurgicalFlowStepperProps {
  cases: SurgicalCase[]
  activeStageFilter: string | null
  onSelectStage: (stage: string | null) => void
}

export const SURGICAL_FLOW_STAGES = [
  {
    id: "pac",
    label: "1. Pre-Op & PAC",
    shortLabel: "PAC Clearance",
    icon: "🩺",
    description: "Pre-Anesthetic Checkup, Airway & ASA Risk, Consents & NPO Fasting",
    matchStatuses: ["PAC Pending", "PAC Cleared"],
    color: "amber",
  },
  {
    id: "holding",
    label: "2. Holding Bay",
    shortLabel: "Holding Bay",
    icon: "🏥",
    description: "Ward Handover, Surgical Site Marking, Pre-Op Antibiotic Prophylaxis (<60m)",
    matchStatuses: ["Pre-Op Holding"],
    color: "sky",
  },
  {
    id: "or",
    label: "3. Operating Theatre",
    shortLabel: "In Surgery (OR)",
    icon: "✂️",
    description: "WHO Safety Checklist (Sign-In, Time-Out, Sign-Out), Live Telemetry & Implants",
    matchStatuses: ["In Surgery"],
    color: "purple",
  },
  {
    id: "pacu",
    label: "4. PACU Recovery",
    shortLabel: "PACU Recovery",
    icon: "💊",
    description: "Post-Anesthesia Care Unit, Modified Aldrete Score (≥9/10), Pain & Airway",
    matchStatuses: ["PACU Recovery"],
    color: "pink",
  },
  {
    id: "ward",
    label: "5. Inpatient Ward",
    shortLabel: "Ward Post-Op",
    icon: "🛏️",
    description: "Bed Allocated Inpatient Care, POD Milestones, Drain/Wound Care & Diet",
    matchStatuses: ["Transferred to Ward"],
    color: "indigo",
  },
  {
    id: "icu",
    label: "6. SICU Critical",
    shortLabel: "SICU Critical",
    icon: "🫀",
    description: "Intubated / Guarded High-Risk Cases, Arterial Line, Ventilator & Inotropes",
    matchStatuses: ["Transferred to ICU"],
    color: "rose",
  },
  {
    id: "discharge",
    label: "7. Discharge & Cleared",
    shortLabel: "Discharged",
    icon: "✅",
    description: "Discharge Criteria Met, Take-Home Meds, Bed Released & Final Billing",
    matchStatuses: ["Discharged", "Completed"],
    color: "emerald",
  },
]

export default function SurgicalFlowStepper({
  cases,
  activeStageFilter,
  onSelectStage,
}: SurgicalFlowStepperProps) {
  const getStageCount = (matchStatuses: string[]) => {
    return cases.filter((c) => matchStatuses.includes(c.status)).length
  }

  return (
    <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 shadow-2xs">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#1E3A6E] tracking-tight uppercase">
            End-to-End Surgical Patient Journey Pipeline
          </span>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-none font-mono font-medium">
            Real-Time Clinical Flow
          </span>
        </div>
        {activeStageFilter && (
          <button
            onClick={() => onSelectStage(null)}
            className="text-[11px] font-semibold text-[#1B4FD8] hover:underline flex items-center gap-1 cursor-pointer"
          >
            ✕ Clear stage filter (Show all {cases.length} cases)
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {SURGICAL_FLOW_STAGES.map((stage, idx) => {
          const count = getStageCount(stage.matchStatuses)
          const isSelected = activeStageFilter === stage.id

          return (
            <button
              key={stage.id}
              onClick={() => onSelectStage(isSelected ? null : stage.id)}
              className={`text-left p-2.5 rounded-none border transition-all cursor-pointer relative overflow-hidden group ${
                isSelected
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-blue-500/30"
                  : count > 0
                    ? "bg-[#F8FAFC] border-[#DDE2EC] hover:bg-white hover:border-slate-400 text-slate-800"
                    : "bg-white border-[#E2E8F0] opacity-60 hover:opacity-100 text-slate-600"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-sm">{stage.icon}</span>
                <span
                  className={`text-xs font-bold font-mono px-1.5 py-0.2 rounded-none ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : count > 0
                        ? "bg-white text-slate-900 border border-slate-200"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </div>
              <div
                className={`text-[11.5px] font-bold truncate ${
                  isSelected ? "text-white" : "text-slate-900"
                }`}
              >
                {stage.shortLabel}
              </div>
              <div
                className={`text-[9.5px] truncate mt-0.5 ${
                  isSelected ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {idx + 1} of 7 in Flow
              </div>

              {/* Progress connection arrow indicator */}
              {idx < SURGICAL_FLOW_STAGES.length - 1 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-[10px] text-slate-300 pointer-events-none">
                  ▶
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

