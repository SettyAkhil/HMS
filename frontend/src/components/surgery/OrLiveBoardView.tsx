import React from "react"
import { SurgicalCase } from "../../services/surgeryDb"
import { Btn, StatusBadge } from "../shared"
import { OtPackageLink } from "../insurance/integrations"

interface OrLiveBoardViewProps {
  cases: SurgicalCase[]
  searchQuery: string
  specialtyFilter: string
  onOpenBooklet: (c: SurgicalCase, page?: number) => void
  onOpenCharges: (c: SurgicalCase) => void
  onAdvanceStatus: (caseId: string, status: SurgicalCase["status"]) => void
  onScheduleInRoom: (roomName: string) => void
  onOpenLiveMonitor: (caseId: string) => void
  onTransferToWard: (c: SurgicalCase) => void
  onInitiateDischarge: (c: SurgicalCase) => void
}

const OR_ROOMS = [
  { name: "OR 1", label: "General & Laparoscopic Suite", type: "Major OR", color: "blue" },
  { name: "OR 2", label: "Cardiothoracic & Vascular Suite", type: "Ultra-Clean Laminar", color: "purple" },
  { name: "OR 3", label: "Orthopedic & Joint Replacement", type: "Laminar Airflow", color: "emerald" },
  { name: "OR 4", label: "Urology & Endourology Suite", type: "Standard OR", color: "amber" },
  { name: "Emergency OR 1", label: "STAT Trauma & Emergency Suite", type: "STAT Code Red", color: "rose" },
]

export default function OrLiveBoardView({
  cases,
  searchQuery,
  specialtyFilter,
  onOpenBooklet,
  onOpenCharges,
  onAdvanceStatus,
  onScheduleInRoom,
  onOpenLiveMonitor,
  onTransferToWard,
  onInitiateDischarge,
}: OrLiveBoardViewProps) {
  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      (c.patientName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.mrn || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.procedureName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.surgeon || "").toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSpecialty =
      specialtyFilter === "All Specialities" || c.specialty === specialtyFilter
    return matchesSearch && matchesSpecialty
  })

  return (
    <div className="space-y-4">
      {OR_ROOMS.map((room) => {
        const activeCase = filteredCases.find(
          (c) =>
            c.orRoom === room.name &&
            c.status !== "Completed" &&
            c.status !== "Discharged",
        )

        if (activeCase) {
          const isOngoing = activeCase.status === "In Surgery"
          const isHolding = activeCase.status === "Pre-Op Holding"
          const isPacu = activeCase.status === "PACU Recovery"
          const isWard = activeCase.status === "Transferred to Ward"

          return (
            <div
              key={room.name}
              className="bg-white border border-[#DDE2EC] rounded-xl overflow-hidden shadow-2xs transition-all hover:border-slate-400"
            >
              {/* Room Top Header Bar */}
              <div
                className={`px-5 py-3 border-b border-[#DDE2EC] flex items-center justify-between flex-wrap gap-2 ${
                  room.color === "blue"
                    ? "bg-blue-50/70"
                    : room.color === "purple"
                      ? "bg-purple-50/70"
                      : room.color === "emerald"
                        ? "bg-emerald-50/70"
                        : room.color === "rose"
                          ? "bg-rose-50/80"
                          : "bg-amber-50/70"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md font-mono ${
                      room.color === "blue"
                        ? "bg-blue-600 text-white"
                        : room.color === "purple"
                          ? "bg-purple-600 text-white"
                          : room.color === "emerald"
                            ? "bg-emerald-600 text-white"
                            : room.color === "rose"
                              ? "bg-rose-600 text-white"
                              : "bg-amber-600 text-white"
                    }`}
                  >
                    {room.name}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-800 bg-white px-2.5 py-0.5 rounded-md border border-[#DDE2EC]">
                    {room.label}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${
                      activeCase.urgency === "Emergency STAT"
                        ? "bg-rose-100 text-rose-700 border border-rose-200 animate-pulse font-bold"
                        : activeCase.urgency === "Urgent"
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    {activeCase.urgency}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isOngoing && (
                    <button
                      onClick={() => onOpenLiveMonitor(activeCase.id)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs font-mono"
                    >
                      <span>📈 Live OR Monitor</span>
                    </button>
                  )}
                  <Btn variant="outline" size="xs" onClick={() => onOpenBooklet(activeCase, 1)}>
                    📘 OT Booklet
                  </Btn>
                  <Btn variant="outline" size="xs" onClick={() => onOpenCharges(activeCase)}>
                    💰 Charges
                  </Btn>
                </div>
              </div>

              {/* Case Demographics & Details */}
              <div className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-[#1E3A6E] text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-blue-100">
                    {(activeCase.patientName || "PT")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{activeCase.patientName}</span>
                      <span className="font-mono text-xs font-normal text-slate-500">
                        (UMR: {activeCase.mrn} · {activeCase.age}y/{activeCase.gender})
                      </span>
                    </div>
                    <div className="text-[12px] text-slate-700 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{activeCase.procedureName}</span>
                      <span>·</span>
                      <span>
                        Surgeon: <strong>Dr. {activeCase.surgeon}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Anesthesia: <strong>Dr. {activeCase.anesthesiologist}</strong>
                      </span>
                    </div>
                    <div className="mt-2">
                      <OtPackageLink
                        patientId={activeCase.mrn || activeCase.patientId}
                        patientName={activeCase.patientName}
                        procedureName={activeCase.procedureName}
                        surgeon={activeCase.surgeon ? `Dr. ${activeCase.surgeon}` : undefined}
                      />
                    </div>
                  </div>
                </div>

                {/* Stage Indicator & Advancement Action */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <StatusBadge
                      status={
                        activeCase.status === "In Surgery"
                          ? "inprogress"
                          : activeCase.status.toLowerCase()
                      }
                    />
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {activeCase.scheduledTime || "Scheduled"}
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    {activeCase.status === "PAC Pending" && (
                      <Btn
                        variant="primary"
                        size="xs"
                        onClick={() => onAdvanceStatus(activeCase.id, "PAC Cleared")}
                      >
                        Approve PAC ➔
                      </Btn>
                    )}
                    {activeCase.status === "PAC Cleared" && (
                      <Btn
                        variant="primary"
                        size="xs"
                        onClick={() => onAdvanceStatus(activeCase.id, "Pre-Op Holding")}
                      >
                        To Pre-Op Holding ➔
                      </Btn>
                    )}
                    {activeCase.status === "Pre-Op Holding" && (
                      <Btn
                        variant="primary"
                        size="xs"
                        onClick={() => onAdvanceStatus(activeCase.id, "In Surgery")}
                      >
                        Start Surgery ➔
                      </Btn>
                    )}
                    {activeCase.status === "In Surgery" && (
                      <Btn
                        variant="primary"
                        size="xs"
                        onClick={() => onAdvanceStatus(activeCase.id, "PACU Recovery")}
                      >
                        Transfer to PACU ➔
                      </Btn>
                    )}
                    {activeCase.status === "PACU Recovery" && (
                      <button
                        onClick={() => onTransferToWard(activeCase)}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      >
                        Transfer to Ward ➔
                      </button>
                    )}
                    {activeCase.status === "Transferred to Ward" && (
                      <button
                        onClick={() => onInitiateDischarge(activeCase)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      >
                        Surgical Discharge ➔
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Real-time intra-op telemetry bar if case is active in surgery or holding */}
              {(isOngoing || isHolding || isPacu) && (
                <div className="mx-5 mb-4 p-3.5 bg-[#0B132B] rounded-xl border border-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shadow-xs font-mono text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20"></span>
                    <span className="font-bold text-emerald-400 tracking-wider text-[11px] font-sans uppercase">
                      Live Telemetry Stream
                    </span>
                    <span className="text-[10px] text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-md border border-slate-800 font-sans">
                      ⏱️ 01h 14m Operating
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] flex-wrap">
                    <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                      <span className="text-slate-400 font-sans text-[10px] font-bold uppercase">
                        HR:
                      </span>
                      <span className="font-bold text-emerald-400">
                        {activeCase.currentTelemetry?.hr || 74} bpm
                      </span>
                      <span className="text-[10px]">📈</span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                      <span className="text-slate-400 font-sans text-[10px] font-bold uppercase">
                        NIBP / MAP:
                      </span>
                      <span className="font-bold text-blue-400">
                        {activeCase.currentTelemetry?.bpSys || 118}/{activeCase.currentTelemetry?.bpDia || 76}{" "}
                        ({activeCase.currentTelemetry?.map || 90})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                      <span className="text-slate-400 font-sans text-[10px] font-bold uppercase">
                        SpO2:
                      </span>
                      <span className="font-bold text-cyan-400">
                        {activeCase.currentTelemetry?.spo2 || 99}%
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                      <span className="text-slate-400 font-sans text-[10px] font-bold uppercase">
                        EtCO2:
                      </span>
                      <span className="font-bold text-amber-400">
                        {activeCase.currentTelemetry?.etco2 || 36} mmHg
                      </span>
                    </div>

                    <div className="hidden lg:flex items-center gap-1 text-[10px] text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800 font-sans">
                      <span className="text-slate-400 font-bold uppercase">Agent:</span>
                      <span className="text-white font-semibold">
                        {activeCase.currentTelemetry?.anestheticAgent || "Sevoflurane 2.0%"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        }

        {/* Empty Available Operating Suite */}
        return (
          <div
            key={room.name}
            className="bg-white border border-[#DDE2EC] rounded-xl overflow-hidden shadow-2xs"
          >
            <div className="px-5 py-2.5 border-b border-[#DDE2EC] bg-[#F8FAFC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                  {room.name}
                </span>
                <span className="text-[11px] text-slate-500 font-sans">· {room.label}</span>
              </div>
              <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ✓ Available &amp; Sterile
              </span>
            </div>
            <div className="p-4 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
              <span>Operating Suite sterilized, ventilated &amp; ready for next scheduled surgery</span>
              <Btn variant="outline" size="xs" onClick={() => onScheduleInRoom(room.name)}>
                + Schedule Case in {room.name}
              </Btn>
            </div>
          </div>
        )
      })}
    </div>
  )
}

