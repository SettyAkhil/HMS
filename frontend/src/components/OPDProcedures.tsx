import React, { useState, useEffect, useMemo } from "react"
import { db, DBOPEncounter } from "../services/db"
import { Icon } from "./icons"

interface OPDProceduresProps {
  onNavigateToOPManagement?: () => void
}

export default function OPDProcedures({
  onNavigateToOPManagement,
}: OPDProceduresProps) {
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const [selectedProcType, setSelectedProcType] = useState<string>("All")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const load = () => setEncounters(db.getEncounters())
    load()
    const unsub = db.subscribe(load)
    return () => {
      unsub()
    }
  }, [])

  const handleToggleProcedure = (encId: string, procedureName: string) => {
    const enc = encounters.find((e) => e.id === encId)
    if (!enc) return
    const currentProcs = enc.opdProcedures || []
    const existing = currentProcs.find((p) => p.name === procedureName)

    let updatedProcs = []
    if (!existing) {
      updatedProcs = [
        ...currentProcs,
        {
          name: procedureName,
          status: "In Progress" as const,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]
    } else if (existing.status === "In Progress") {
      updatedProcs = currentProcs.map((p) =>
        p.name === procedureName ? { ...p, status: "Completed" as const } : p,
      )
    } else {
      updatedProcs = currentProcs.filter((p) => p.name !== procedureName)
    }

    db.updateEncounter(encId, { opdProcedures: updatedProcs })
    setEncounters(db.getEncounters())
  }

  const activeProcedureEncounters = useMemo(() => {
    return encounters.filter((enc) => {
      const procs = enc.opdProcedures || []
      if (selectedProcType !== "All") {
        if (
          !procs.some((p) =>
            p.name.toLowerCase().includes(selectedProcType.toLowerCase()),
          )
        ) {
          return false
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        return (
          enc.patientName.toLowerCase().includes(q) ||
          enc.umr.toLowerCase().includes(q) ||
          enc.opNumber.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [encounters, selectedProcType, searchQuery])

  const stats = useMemo(() => {
    let dressing = 0,
      nebulization = 0,
      injection = 0,
      ecg = 0
    encounters.forEach((e) => {
      ;(e.opdProcedures || []).forEach((p) => {
        if (p.name === "Dressing") dressing++
        if (p.name === "Nebulization") nebulization++
        if (p.name === "Injection") injection++
        if (p.name === "ECG") ecg++
      })
    })
    return {
      dressing,
      nebulization,
      injection,
      ecg,
      total: dressing + nebulization + injection + ecg,
    }
  }, [encounters])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5] overflow-hidden">
      {/* ── TOP HEADER ── */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-gray-900">
              OPD Minor Procedures &amp; POCT Services
            </h1>
            <span className="text-[11px] font-mono font-bold bg-blue-50 text-[#1B4FD8] border border-blue-200 px-2.5 py-0.5 rounded">
              💉 Nursing Execution Station
            </span>
          </div>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">
            Dedicated outpatient nursing procedures: Wound Dressing,
            Nebulization, Injections, &amp; ECG 12-Lead.
          </p>
        </div>

        {onNavigateToOPManagement && (
          <button
            type="button"
            onClick={onNavigateToOPManagement}
            className="px-3.5 py-1.5 bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#1B4FD8] text-[12.5px] font-bold rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <span>🏥</span> OP Management Hub →
          </button>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 w-full">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              name: "Nebulization",
              icon: "💨",
              count: stats.nebulization,
              filterKey: "Nebulization",
            },
            {
              name: "Wound Dressing",
              icon: "🩹",
              count: stats.dressing,
              filterKey: "Dressing",
            },
            {
              name: "IM / IV Injections",
              icon: "💉",
              count: stats.injection,
              filterKey: "Injection",
            },
            {
              name: "ECG 12-Lead",
              icon: "📈",
              count: stats.ecg,
              filterKey: "ECG",
            },
          ].map((item) => (
            <div
              key={item.name}
              onClick={() =>
                setSelectedProcType(
                  selectedProcType === item.filterKey ? "All" : item.filterKey,
                )
              }
              className={`bg-white border rounded p-4 shadow-2xs cursor-pointer transition-all ${
                selectedProcType === item.filterKey
                  ? "border-[#1B4FD8] ring-2 ring-blue-100"
                  : "border-[#DDE2EC] hover:border-gray-300"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-2xl">{item.icon}</span>
                <span className="font-mono font-bold text-xl text-[#1B4FD8]">
                  {item.count}
                </span>
              </div>
              <h3 className="font-bold text-gray-900 text-[14px] mt-2">
                {item.name}
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">
                Click to filter worklist
              </p>
            </div>
          ))}
        </div>

        {/* Worklist Table Container */}
        <div className="bg-white border border-[#DDE2EC] rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#DDE2EC] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-bold text-gray-900">
                OPD Nursing Procedure Worklist
              </h2>
              <p className="text-[11.5px] text-[#64748B]">
                Click procedure badges to update status from Ordered ➔ In
                Progress ➔ Completed.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patient, UMR, OP Token..."
                  className="pl-7 pr-3 py-1.5 text-[12px] border border-[#CBD5E1] rounded bg-white focus:outline-none focus:border-[#1B4FD8] w-56 sm:w-64"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  <Icon.Search />
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {activeProcedureEncounters.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-[13px]">
                No OPD procedures active matching the selected filter.
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#DDE2EC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">OP Token &amp; UMR</th>
                    <th className="px-4 py-3">Patient Details</th>
                    <th className="px-4 py-3">Assigned Doctor &amp; Room</th>
                    <th className="px-4 py-3">OPD Procedure Statuses</th>
                    <th className="px-4 py-3 text-right">Procedure Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                  {activeProcedureEncounters.map((enc) => (
                    <tr
                      key={enc.id}
                      className="hover:bg-[#F8FAFC] transition-colors"
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-[12.5px] text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {enc.opNumber}
                        </span>
                        <div className="text-[11px] font-mono text-gray-500 mt-0.5">
                          UMR: {enc.umr}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-gray-900">
                          {enc.patientName}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          {enc.age}y / {enc.sex} · {enc.phone}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap font-medium text-gray-800">
                        <div>
                          👨‍⚕️ {enc.assignedDoctor || "Attending Consultant"}
                        </div>
                        <span className="font-mono text-[11px] text-gray-500">
                          📍 {enc.room || "Room 101"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {["Dressing", "Nebulization", "ECG", "Injection"].map(
                            (proc) => {
                              const active = (enc.opdProcedures || []).find(
                                (p) => p.name === proc,
                              )
                              const isDone = active?.status === "Completed"
                              const isInProg = active?.status === "In Progress"

                              return (
                                <button
                                  key={proc}
                                  type="button"
                                  onClick={() =>
                                    handleToggleProcedure(enc.id, proc)
                                  }
                                  className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                                    isDone
                                      ? "bg-green-100 text-[#15803D] border border-green-300"
                                      : isInProg
                                        ? "bg-blue-100 text-[#1B4FD8] border border-blue-300 animate-pulse"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                                  }`}
                                >
                                  {isDone
                                    ? `✓ ${proc}`
                                    : isInProg
                                      ? `⏳ ${proc} (In Progress)`
                                      : `+ Order ${proc}`}
                                </button>
                              )
                            },
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          {(enc.opdProcedures || []).length} Active Orders
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
