import React from "react"
import { SurgicalCase } from "../../services/surgeryDb"
import { SURGICAL_FLOW_STAGES } from "./SurgicalFlowStepper"
import { Btn, StatusBadge } from "../shared"

interface PatientJourneyKanbanViewProps {
  cases: SurgicalCase[]
  onOpenBooklet: (c: SurgicalCase, page?: number) => void
  onAdvanceStatus: (caseId: string, status: SurgicalCase["status"]) => void
  onTransferToWard: (c: SurgicalCase) => void
  onTransferToIcu: (c: SurgicalCase) => void
  onInitiateDischarge: (c: SurgicalCase) => void
  onOpenLiveMonitor: (caseId: string) => void
}

export default function PatientJourneyKanbanView({
  cases,
  onOpenBooklet,
  onAdvanceStatus,
  onTransferToWard,
  onTransferToIcu,
  onInitiateDischarge,
  onOpenLiveMonitor,
}: PatientJourneyKanbanViewProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1E3A6E]">
            Surgical Patient Lifecycle &amp; Journey Board
          </h2>
          <p className="text-[11.5px] text-slate-500">
            Real-time track board: Intake ➔ PAC Gate ➔ Holding Bay ➔ Operating Theatre ➔ PACU ➔ Inpatient Ward ➔ Discharge
          </p>
        </div>
      </div>

      {/* Horizontal scrolling Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-3 overflow-x-auto pb-4">
        {SURGICAL_FLOW_STAGES.map((stage) => {
          const stageCases = cases.filter((c) => stage.matchStatuses.includes(c.status))

          return (
            <div
              key={stage.id}
              className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl flex flex-col min-w-[270px] max-h-[80vh] shadow-2xs overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-[#DDE2EC] bg-white flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span>{stage.icon}</span>
                  <span className="font-bold text-xs text-slate-900">{stage.shortLabel}</span>
                </div>
                <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full border border-slate-200">
                  {stageCases.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="p-2 space-y-2.5 overflow-y-auto flex-1 text-xs">
                {stageCases.length > 0 ? (
                  stageCases.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white border border-[#DDE2EC] hover:border-[#1B4FD8] rounded-xl p-3.5 space-y-2 shadow-2xs transition-all"
                    >
                      {/* Patient top row */}
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                            <span>{c.patientName}</span>
                            <span className="text-[10px] font-mono text-slate-400 font-normal">
                              ({c.age}y/{c.gender[0]})
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            UMR: {c.mrn} · {c.orRoom}
                          </div>
                        </div>
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded ${
                            c.urgency === "Emergency STAT"
                              ? "bg-rose-100 text-rose-700 animate-pulse border border-rose-300"
                              : c.urgency === "Urgent"
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {c.urgency}
                        </span>
                      </div>

                      {/* Procedure & Surgeon */}
                      <div className="text-[11px] text-slate-700">
                        <div className="font-semibold text-slate-900 line-clamp-1">
                          {c.procedureName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Surgeon: <strong>Dr. {c.surgeon}</strong>
                        </div>
                      </div>

                      {/* Stage-Specific Clinical Telemetry Badge */}
                      {stage.id === "pac" && (
                        <div className="p-1.5 bg-amber-50 rounded border border-amber-200 text-[10px] text-amber-900 font-mono">
                          {c.status === "PAC Cleared"
                            ? `✓ Cleared · ASA ${c.pac?.opinionAsa?.asaGrade || "II"} · Mallampati I`
                            : "⏳ Awaiting Pre-Anesthetic Exam"}
                        </div>
                      )}

                      {stage.id === "holding" && (
                        <div className="p-1.5 bg-sky-50 rounded border border-sky-200 text-[10px] text-sky-900 font-mono">
                          ✓ Prepped · Antibiotic Prophylaxis given
                        </div>
                      )}

                      {stage.id === "or" && (
                        <div className="p-2 bg-slate-900 text-white rounded-lg border border-slate-800 text-[10px] font-mono space-y-1">
                          <div className="flex justify-between text-emerald-400 font-bold">
                            <span>HR {c.currentTelemetry?.hr || 74} bpm</span>
                            <span>SpO2 {c.currentTelemetry?.spo2 || 99}%</span>
                          </div>
                          <div className="flex justify-between text-blue-300">
                            <span>BP {c.currentTelemetry?.bpSys || 118}/{c.currentTelemetry?.bpDia || 76}</span>
                            <span>EtCO2 {c.currentTelemetry?.etco2 || 36}</span>
                          </div>
                        </div>
                      )}

                      {stage.id === "pacu" && (
                        <div className="p-1.5 bg-pink-50 rounded border border-pink-200 text-[10px] flex items-center justify-between">
                          <span className="font-bold text-pink-900">Modified Aldrete Score:</span>
                          <span className="font-mono font-bold bg-pink-600 text-white px-2 py-0.5 rounded text-[10px]">
                            {c.recoveryAldrete?.aldreteScore?.totalScore ?? 9} / 10
                          </span>
                        </div>
                      )}

                      {stage.id === "ward" && (
                        <div className="p-1.5 bg-indigo-50 rounded border border-indigo-200 text-[10.5px] text-indigo-900 space-y-0.5">
                          <div className="font-bold truncate">
                            {c.wardTransfer?.wardName || "Surgical Ward"} ({c.wardTransfer?.bedNo || "Bed 204-A"})
                          </div>
                          <div className="text-[10px] font-mono text-indigo-700">
                            POD {c.wardTransfer?.postOpDay ?? 2} · {c.wardTransfer?.drainStatus || "Drain Removed"}
                          </div>
                        </div>
                      )}

                      {stage.id === "icu" && (
                        <div className="p-1.5 bg-rose-50 rounded border border-rose-200 text-[10.5px] text-rose-900 space-y-0.5">
                          <div className="font-bold">{c.icuTransfer?.bedNo || "SICU Bed 3"}</div>
                          <div className="text-[10px] font-mono text-rose-700 truncate">
                            {c.icuTransfer?.intubated ? "Intubated / SIMV" : "Extubated"}
                          </div>
                        </div>
                      )}

                      {stage.id === "discharge" && (
                        <div className="p-1.5 bg-emerald-50 rounded border border-emerald-200 text-[10px] text-emerald-900 space-y-0.5">
                          <div className="font-bold truncate">✓ Discharged &amp; Bed Released</div>
                          <div className="text-[9.5px] text-emerald-700">
                            F/U: {c.dischargeRecord?.followUpDate?.split("at")[0] || "POD 8"}
                          </div>
                        </div>
                      )}

                      {/* Card Action Buttons */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                        <button
                          onClick={() => onOpenBooklet(c, 1)}
                          className="text-[10.5px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          📘 Booklet
                        </button>

                        {/* Context-aware stage progression action */}
                        {c.status === "PAC Pending" && (
                          <button
                            onClick={() => onAdvanceStatus(c.id, "PAC Cleared")}
                            className="text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded cursor-pointer"
                          >
                            Approve PAC ➔
                          </button>
                        )}
                        {c.status === "PAC Cleared" && (
                          <button
                            onClick={() => onAdvanceStatus(c.id, "Pre-Op Holding")}
                            className="text-[10px] font-bold bg-sky-600 hover:bg-sky-700 text-white px-2 py-0.5 rounded cursor-pointer"
                          >
                            To Holding ➔
                          </button>
                        )}
                        {c.status === "Pre-Op Holding" && (
                          <button
                            onClick={() => onAdvanceStatus(c.id, "In Surgery")}
                            className="text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white px-2 py-0.5 rounded cursor-pointer"
                          >
                            Start Surgery ➔
                          </button>
                        )}
                        {c.status === "In Surgery" && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => onOpenLiveMonitor(c.id)}
                              className="text-[10px] font-bold bg-slate-900 hover:bg-black text-white px-2 py-0.5 rounded cursor-pointer"
                            >
                              Live Monitor 📈
                            </button>
                            <button
                              onClick={() => onAdvanceStatus(c.id, "PACU Recovery")}
                              className="text-[10px] font-bold bg-pink-600 hover:bg-pink-700 text-white px-2 py-0.5 rounded cursor-pointer"
                            >
                              To PACU ➔
                            </button>
                          </div>
                        )}
                        {c.status === "PACU Recovery" && (
                          <button
                            onClick={() => onTransferToWard(c)}
                            className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded cursor-pointer"
                          >
                            To Ward Bed ➔
                          </button>
                        )}
                        {c.status === "Transferred to Ward" && (
                          <button
                            onClick={() => onInitiateDischarge(c)}
                            className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded cursor-pointer"
                          >
                            Discharge ➔
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-slate-400 text-xs italic bg-white/40 rounded-lg border border-dashed border-slate-200">
                    No patients currently in this stage
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

