import React, { useState } from "react"
import { SurgicalCase, SurgeryDatabase, RecoveryAldreteDetail } from "../../services/surgeryDb"
import { Btn, StatusBadge } from "../shared"
import { toast } from "react-hot-toast"

interface PacuRecoveryViewProps {
  cases: SurgicalCase[]
  initialCaseId?: string
  onOpenBooklet: (c: SurgicalCase, page?: number) => void
  onTransferToWard: (c: SurgicalCase) => void
  onTransferToIcu: (c: SurgicalCase) => void
}

export default function PacuRecoveryView({
  cases,
  initialCaseId,
  onOpenBooklet,
  onTransferToWard,
  onTransferToIcu,
}: PacuRecoveryViewProps) {
  const pacuCases = cases.filter(
    (c) => c.status === "PACU Recovery" || (c.status === "In Surgery" && c.whoChecklist?.signOut?.procedureNameRecorded),
  )

  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    initialCaseId || pacuCases[0]?.id || cases[0]?.id || "",
  )

  React.useEffect(() => {
    if (initialCaseId) setSelectedCaseId(initialCaseId)
  }, [initialCaseId])

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || pacuCases[0] || cases[0]

  // Interactive Aldrete state for selected case
  const [activity, setActivity] = useState<number>(selectedCase?.recoveryAldrete?.aldreteScore?.activity ?? 2)
  const [respiration, setRespiration] = useState<number>(selectedCase?.recoveryAldrete?.aldreteScore?.respiration ?? 2)
  const [circulation, setCirculation] = useState<number>(selectedCase?.recoveryAldrete?.aldreteScore?.circulation ?? 2)
  const [consciousness, setConsciousness] = useState<number>(selectedCase?.recoveryAldrete?.aldreteScore?.consciousness ?? 2)
  const [o2Sat, setO2Sat] = useState<number>(selectedCase?.recoveryAldrete?.aldreteScore?.o2Saturation ?? 1)

  // Pain & PONV state
  const [painScore, setPainScore] = useState<number>(2)
  const [nauseaStatus, setNauseaStatus] = useState<"None" | "Mild" | "Severe">("None")
  const [drainOutput, setDrainOutput] = useState<number>(25)
  const [dressingStatus, setDressingStatus] = useState<"Dry & Intact" | "Mild Serosanguinous" | "Soaked">("Dry & Intact")

  const totalAldrete = activity + respiration + circulation + consciousness + o2Sat
  const isCleared = totalAldrete >= 9

  React.useEffect(() => {
    if (selectedCase?.recoveryAldrete?.aldreteScore) {
      const s = selectedCase.recoveryAldrete.aldreteScore
      setActivity(s.activity ?? 2)
      setRespiration(s.respiration ?? 2)
      setCirculation(s.circulation ?? 2)
      setConsciousness(s.consciousness ?? 2)
      setO2Sat(s.o2Saturation ?? 2)
      const anyRec = selectedCase.recoveryAldrete as any
      if (anyRec.painScoreVas !== undefined) {
        setPainScore(anyRec.painScoreVas)
      }
      if (anyRec.drainOutputMl !== undefined) {
        setDrainOutput(anyRec.drainOutputMl)
      }
    }
  }, [selectedCase?.id])

  const handleSaveScore = async () => {
    if (!selectedCase) return
    const rec: RecoveryAldreteDetail = {
      bedNumber: selectedCase.recoveryAldrete?.bedNumber || "PACU Bay 1",
      admissionTime: selectedCase.recoveryAldrete?.admissionTime || "11:45 AM",
      dischargeTime: isCleared ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined,
      aldreteScore: {
        activity,
        respiration,
        circulation,
        consciousness,
        o2Saturation: o2Sat,
        totalScore: totalAldrete,
      },
      vitals: {
        bp: "124/80",
        hr: 76,
        spo2: o2Sat === 2 ? 99 : 95,
      },
      dischargeStatus: isCleared ? "Cleared for Ward" : "In PACU",
      wardHandoverNurse: "RN Brenda (PACU)",
      dischargedBy: selectedCase.anesthesiologist || "Dr. Rodriguez",
    }
    try {
      await SurgeryDatabase.savePacuRecord(selectedCase.id, rec)
      toast.success(`Modified Aldrete Score (${totalAldrete}/10) saved to chart!`)
    } catch {
      toast.error("Failed to save recovery record.")
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-700 font-bold flex items-center justify-center text-lg border border-pink-200">
            💊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#1E3A6E]">
                Post-Anesthesia Care Unit (PACU) Recovery &amp; Aldrete Scoring
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                {pacuCases.length} Patients in Recovery
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500">
              Modified Aldrete Score threshold gate ($\ge 9 / 10$) required for transfer to Inpatient Ward or SICU
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Recovery Bay:</span>
          <select
            value={selectedCase?.id}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="border border-[#DDE2EC] rounded-lg px-3 py-1.5 font-bold bg-[#F8FAFC] text-slate-800"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.patientName} - {c.procedureName} ({c.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedCase ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT 7 COLS: ALDRETE SCORE MATRIX */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-[#DDE2EC] pb-3">
                <div>
                  <h3 className="font-bold text-sm text-[#1E3A6E] flex items-center gap-2">
                    <span>Modified Aldrete Score Matrix</span>
                    <span className="font-mono text-xs font-normal text-slate-500">
                      (Patient: {selectedCase.patientName})
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">5 Essential criteria · Max score: 10 points</p>
                </div>
                <div className="text-right">
                  <div
                    className={`text-2xl font-bold font-mono leading-none ${
                      isCleared ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {totalAldrete} / 10
                  </div>
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-2 py-0.5 rounded ${
                      isCleared
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    }`}
                  >
                    {isCleared ? "✓ Cleared for Ward" : "⚠️ Observation Needed"}
                  </div>
                </div>
              </div>

              {/* Parameter 1: Motor Activity */}
              <div className="p-3 bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>1. Motor Activity</span>
                  <span className="font-mono text-blue-600">Score: {activity}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setActivity(2)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      activity === 2
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">2 pts: Moves 4 extremities</div>
                    <div className="text-[10px] opacity-80">Voluntary or command</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivity(1)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      activity === 1
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">1 pt: Moves 2 extremities</div>
                    <div className="text-[10px] opacity-80">Weak spontaneous</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivity(0)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      activity === 0
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">0 pts: Unable to move</div>
                    <div className="text-[10px] opacity-80">No movement</div>
                  </button>
                </div>
              </div>

              {/* Parameter 2: Respiration */}
              <div className="p-3 bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>2. Respiration &amp; Airway</span>
                  <span className="font-mono text-blue-600">Score: {respiration}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRespiration(2)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      respiration === 2
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">2 pts: Breathes deeply</div>
                    <div className="text-[10px] opacity-80">Coughs freely</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRespiration(1)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      respiration === 1
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">1 pt: Dyspneic / shallow</div>
                    <div className="text-[10px] opacity-80">Limited effort</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRespiration(0)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      respiration === 0
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">0 pts: Apneic</div>
                    <div className="text-[10px] opacity-80">Requires bag/mask</div>
                  </button>
                </div>
              </div>

              {/* Parameter 3: Circulation (BP) */}
              <div className="p-3 bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>3. Circulation (Blood Pressure Stability)</span>
                  <span className="font-mono text-blue-600">Score: {circulation}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCirculation(2)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      circulation === 2
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">2 pts: BP ± 20% of pre-op</div>
                    <div className="text-[10px] opacity-80">Hemodynamically stable</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCirculation(1)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      circulation === 1
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">1 pt: BP ± 20% - 49%</div>
                    <div className="text-[10px] opacity-80">Mild hypo/hypertension</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCirculation(0)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      circulation === 0
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">0 pts: BP ± ≥ 50%</div>
                    <div className="text-[10px] opacity-80">Severe hemodynamic swing</div>
                  </button>
                </div>
              </div>

              {/* Parameter 4: Consciousness */}
              <div className="p-3 bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>4. Consciousness Level</span>
                  <span className="font-mono text-blue-600">Score: {consciousness}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setConsciousness(2)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      consciousness === 2
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">2 pts: Fully alert</div>
                    <div className="text-[10px] opacity-80">Oriented to time/place</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsciousness(1)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      consciousness === 1
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">1 pt: Arousable on calling</div>
                    <div className="text-[10px] opacity-80">Responds to vocal stimuli</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsciousness(0)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      consciousness === 0
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">0 pts: Not responding</div>
                    <div className="text-[10px] opacity-80">Unarousable</div>
                  </button>
                </div>
              </div>

              {/* Parameter 5: O2 Saturation */}
              <div className="p-3 bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>5. Oxygen Saturation (SpO2)</span>
                  <span className="font-mono text-blue-600">Score: {o2Sat}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setO2Sat(2)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      o2Sat === 2
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">2 pts: SpO2 &gt; 92% on Room Air</div>
                    <div className="text-[10px] opacity-80">No supplemental O2</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setO2Sat(1)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      o2Sat === 1
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">1 pt: Needs supplemental O2</div>
                    <div className="text-[10px] opacity-80">Nasal cannula 2-4 L/min</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setO2Sat(0)}
                    className={`p-2 rounded border text-left cursor-pointer transition-all ${
                      o2Sat === 0
                        ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                        : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">0 pts: SpO2 &lt; 90% despite O2</div>
                    <div className="text-[10px] opacity-80">Severe desaturation</div>
                  </button>
                </div>
              </div>

              {/* Actions row */}
              <div className="pt-2 border-t border-[#DDE2EC] flex items-center justify-between">
                <Btn size="xs" variant="outline" onClick={() => onOpenBooklet(selectedCase, 14)}>
                  Page 14 Recovery Booklet
                </Btn>
                <Btn size="xs" variant="primary" onClick={handleSaveScore}>
                  Save Aldrete Score ({totalAldrete}/10)
                </Btn>
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: RECOVERY DISPOSITION & POST-OP CHECKS */}
          <div className="lg:col-span-5 space-y-4">
            {/* Transfer Clearance Gate Card */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs space-y-3">
              <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider border-b border-[#DDE2EC] pb-2">
                PACU Exit Handover &amp; Disposition
              </h3>

              {isCleared ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                    <span>🎉</span>
                    <span>Patient Ready for Ward Transfer!</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Modified Aldrete Score of <strong>{totalAldrete} / 10</strong> meets institutional criteria for transfer to Inpatient Surgical Ward.
                  </p>
                  <div className="pt-2 space-y-2">
                    <button
                      onClick={() => onTransferToWard(selectedCase)}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-2"
                    >
                      <span>🛏️ Allocate Inpatient Ward Bed &amp; Transfer ➔</span>
                    </button>
                    <button
                      onClick={() => onTransferToIcu(selectedCase)}
                      className="w-full py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                    >
                      <span>🫀 Guarded Patient: Transfer to SICU instead</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-bold">
                    <span>⚠️</span>
                    <span>Observation in PACU Required</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Current score is <strong>{totalAldrete} / 10</strong>. Clinical policy requires $\ge 9 / 10$ prior to ward discharge to ensure patient airway and hemodynamic safety.
                  </p>
                  <div className="pt-1">
                    <button
                      onClick={() => onTransferToIcu(selectedCase)}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      <span>🫀 Complicated: Transfer to SICU Critical Care</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Post-Op Pain & Comfort Monitoring */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs space-y-3 text-xs">
              <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider border-b border-[#DDE2EC] pb-1.5 flex justify-between items-center">
                <span>Pain &amp; PONV Comfort Assessment</span>
                <span className="text-[10px] font-mono text-slate-500 font-normal">Hourly Reassessment</span>
              </h3>

              {/* Visual Analog Scale Pain */}
              <div>
                <div className="flex justify-between items-center text-[11px] font-semibold text-slate-700 mb-1">
                  <span>VAS Pain Scale (0-10):</span>
                  <span className="font-bold font-mono text-blue-700">{painScore} / 10</span>
                </div>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setPainScore(num)}
                      className={`flex-1 py-1 rounded text-center text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                        painScore === num
                          ? num <= 3
                            ? "bg-emerald-600 text-white"
                            : num <= 6
                              ? "bg-amber-600 text-white"
                              : "bg-rose-600 text-white"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                  <span>0: No Pain</span>
                  <span>5: Moderate</span>
                  <span>10: Worst Pain</span>
                </div>
              </div>

              {/* PONV Status */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Post-Op Nausea / Vomiting (PONV)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["None", "Mild", "Severe"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setNauseaStatus(status)}
                      className={`py-1.5 rounded border text-center text-[11px] font-semibold cursor-pointer ${
                        nauseaStatus === status
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drain & Wound Soakage */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#DDE2EC]">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Drain Output (mL)
                  </label>
                  <input
                    type="number"
                    value={drainOutput}
                    onChange={(e) => setDrainOutput(Number(e.target.value))}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Incision Dressing
                  </label>
                  <select
                    value={dressingStatus}
                    onChange={(e) => setDressingStatus(e.target.value as any)}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                  >
                    <option value="Dry & Intact">Dry &amp; Intact</option>
                    <option value="Mild Serosanguinous">Mild Soakage</option>
                    <option value="Soaked">Soaked (Needs Dressing)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-white rounded-xl border border-[#DDE2EC] text-slate-500 text-xs">
          No patients currently recovering in PACU.
        </div>
      )}
    </div>
  )
}
