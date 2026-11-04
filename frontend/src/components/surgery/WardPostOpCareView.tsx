import React, { useState } from "react"
import { SurgicalCase, SurgeryDatabase } from "../../services/surgeryDb"
import { Btn, StatusBadge } from "../shared"
import { toast } from "react-hot-toast"

interface WardPostOpCareViewProps {
  cases: SurgicalCase[]
  initialCaseId?: string
  onOpenBooklet: (c: SurgicalCase, page?: number) => void
  onInitiateDischarge: (c: SurgicalCase) => void
}

export default function WardPostOpCareView({
  cases,
  initialCaseId,
  onOpenBooklet,
  onInitiateDischarge,
}: WardPostOpCareViewProps) {
  const wardCases = cases.filter(
    (c) => c.status === "Transferred to Ward" || c.status === "Transferred to ICU",
  )

  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    initialCaseId || wardCases[0]?.id || cases[0]?.id || "",
  )

  React.useEffect(() => {
    if (initialCaseId) setSelectedCaseId(initialCaseId)
  }, [initialCaseId])

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || wardCases[0] || cases[0]

  // Daily note modal/form state
  const [showAddNote, setShowAddNote] = useState(false)
  const [pod, setPod] = useState<number>((selectedCase?.wardTransfer?.postOpDay ?? 1) + 1)
  const [drainStatus, setDrainStatus] = useState<string>(selectedCase?.wardTransfer?.drainStatus || "In situ - Serosanguinous 30 mL")
  const [drainOutputMl, setDrainOutputMl] = useState<number>(selectedCase?.wardTransfer?.drainOutputMl || 20)
  const [woundStatus, setWoundStatus] = useState<string>(selectedCase?.wardTransfer?.woundStatus || "Clean, Dry & Intact")
  const [dietStatus, setDietStatus] = useState<string>(selectedCase?.wardTransfer?.dietStatus || "Full Normal Diet")
  const [mobilizationStatus, setMobilizationStatus] = useState<string>(
    selectedCase?.wardTransfer?.mobilizationStatus || "Assisted Ambulation with Walker",
  )
  const [painScoreVas, setPainScoreVas] = useState<number>(selectedCase?.wardTransfer?.painScoreVas || 2)
  const [clinicalNotes, setClinicalNotes] = useState(
    "Patient making excellent post-op progress. Surgical incision clean and dry. Tolerating oral diet well. Ambulated in corridor.",
  )
  const [orders, setOrders] = useState(
    "Continue oral Ultracet 1 tab BD. Remove drain tomorrow if output < 25 mL. Discharge planned POD 3.",
  )
  const [author, setAuthor] = useState(`Dr. ${selectedCase?.surgeon || "Adams"} (Attending Surgeon)`)

  React.useEffect(() => {
    if (selectedCase?.wardTransfer) {
      setPod((selectedCase.wardTransfer.postOpDay ?? 0) + 1)
      if (selectedCase.wardTransfer.drainStatus) setDrainStatus(selectedCase.wardTransfer.drainStatus)
      if (selectedCase.wardTransfer.drainOutputMl !== undefined) setDrainOutputMl(selectedCase.wardTransfer.drainOutputMl)
      if (selectedCase.wardTransfer.woundStatus) setWoundStatus(selectedCase.wardTransfer.woundStatus)
      if (selectedCase.wardTransfer.dietStatus) setDietStatus(selectedCase.wardTransfer.dietStatus)
      if (selectedCase.wardTransfer.mobilizationStatus) setMobilizationStatus(selectedCase.wardTransfer.mobilizationStatus)
      if (selectedCase.wardTransfer.painScoreVas !== undefined) setPainScoreVas(selectedCase.wardTransfer.painScoreVas)
      setAuthor(`Dr. ${selectedCase.surgeon || "Adams"} (Attending Surgeon)`)
    }
  }, [selectedCase?.id])

  const handleRecordMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCase) return

    try {
      await SurgeryDatabase.recordWardDailyMilestone(selectedCase.id, {
        pod,
        drainStatus,
        drainOutputMl,
        woundStatus,
        dietStatus,
        mobilizationStatus,
        painScoreVas,
        clinicalNotes,
        orders,
        author,
      })
      toast.success(`Post-Op Day ${pod} progress note logged for ${selectedCase.patientName}!`)
      setShowAddNote(false)
    } catch {
      toast.error("Failed to save progress note.")
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-lg border border-indigo-200">
            🛏️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#1E3A6E]">
                Inpatient Surgical Ward Post-Op Care &amp; Discharge Desk
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {wardCases.length} Surgical Inpatients
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500">
              Daily Post-Op Progression (POD), Surgical Wound &amp; Drain Monitoring, Diet, Mobilization &amp; Discharge Clearance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Patient:</span>
          <select
            value={selectedCase?.id}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="border border-[#DDE2EC] rounded-lg px-3 py-1.5 font-bold bg-[#F8FAFC] text-slate-800"
          >
            {wardCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.patientName} - {c.procedureName} (
                {c.status === "Transferred to ICU"
                  ? c.icuTransfer?.bedNo || "SICU"
                  : `${c.wardTransfer?.wardName || "Ward"} - ${c.wardTransfer?.bedNo || "Bed"}`}
                )
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedCase ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT 7 COLS: WARD PATIENT CLINICAL STATUS & PROGRESSION */}
          <div className="lg:col-span-7 space-y-4">
            {/* Patient Header Card */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DDE2EC] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#1E3A6E] text-white font-bold text-sm flex items-center justify-center shadow-xs">
                    {selectedCase.patientName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span>{selectedCase.patientName}</span>
                      <span className="text-xs font-mono text-slate-500 font-normal">
                        ({selectedCase.mrn} · {selectedCase.age}y/{selectedCase.gender})
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      <strong className="text-slate-900">{selectedCase.procedureName}</strong> · Surgeon:{" "}
                      <strong>Dr. {selectedCase.surgeon}</strong>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold font-mono px-3 py-1 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-200 block">
                    {selectedCase.status === "Transferred to ICU"
                      ? selectedCase.icuTransfer?.bedNo || "SICU Bed"
                      : `${selectedCase.wardTransfer?.wardName || "Surgical Ward"} (${selectedCase.wardTransfer?.bedNo || "Bed 204-A"})`}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {selectedCase.status === "Transferred to ICU"
                      ? "Critical Care Admission"
                      : `Post-Operative Day ${selectedCase.wardTransfer?.postOpDay ?? 2} (POD)`}
                  </span>
                </div>
              </div>

              {/* 4 Clinical Indicators Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                {/* Drain Status */}
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#DDE2EC]">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                    <span>Drain Status</span>
                    <span>🧪</span>
                  </div>
                  <div className="font-bold text-slate-900 mt-1 truncate">
                    {selectedCase.wardTransfer?.drainStatus || "Drain Removed"}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {selectedCase.wardTransfer?.drainOutputMl !== undefined
                      ? `Output: ${selectedCase.wardTransfer?.drainOutputMl} mL/day`
                      : "No active drains"}
                  </div>
                </div>

                {/* Wound Status */}
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#DDE2EC]">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                    <span>Surgical Incision</span>
                    <span>🩹</span>
                  </div>
                  <div className="font-bold text-emerald-700 mt-1 truncate">
                    {selectedCase.wardTransfer?.woundStatus || "Clean & Dry"}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Dressing Intact</div>
                </div>

                {/* Diet Status */}
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#DDE2EC]">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                    <span>Oral Diet</span>
                    <span>🥣</span>
                  </div>
                  <div className="font-bold text-slate-900 mt-1 truncate">
                    {selectedCase.wardTransfer?.dietStatus || "Normal Diet"}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Tolerating solids</div>
                </div>

                {/* Mobilization */}
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#DDE2EC]">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                    <span>Mobility</span>
                    <span>🚶</span>
                  </div>
                  <div className="font-bold text-slate-900 mt-1 truncate">
                    {selectedCase.wardTransfer?.mobilizationStatus || "Walking"}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Pain: {selectedCase.wardTransfer?.painScoreVas ?? 2}/10</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-[#DDE2EC]">
                <button
                  onClick={() => setShowAddNote(true)}
                  className="px-3 py-1.5 bg-[#1B4FD8] hover:bg-[#1541B0] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>+ Record Daily Surgeon Round Note (POD {pod})</span>
                </button>
                <div className="flex gap-2">
                  <Btn size="xs" variant="outline" onClick={() => onOpenBooklet(selectedCase, 12)}>
                    Operation Notes
                  </Btn>
                  <button
                    onClick={() => onInitiateDischarge(selectedCase)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <span>🎓 Evaluate &amp; Discharge ➔</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Daily Rounds Log */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs space-y-3 text-xs">
              <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider border-b border-[#DDE2EC] pb-2 flex justify-between items-center">
                <span>Daily Surgical Rounds &amp; Milestone Log</span>
                <span className="text-[11px] font-normal text-slate-500">
                  Attending Surgeon &amp; Resident Notes
                </span>
              </h3>

              <div className="space-y-3">
                {(selectedCase.wardTransfer?.dailyProgressNotes || []).length > 0 ? (
                  selectedCase.wardTransfer?.dailyProgressNotes?.map((note) => (
                    <div
                      key={note.id}
                      className="bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 rounded-xl space-y-1.5"
                    >
                      <div className="flex justify-between items-center">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-mono text-[10.5px]">
                            POD {note.pod}
                          </span>
                          <span>{note.author}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(note.date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-[#E2E8F0]">
                        <strong>Vitals / Milestones:</strong> {note.vitalsSummary}
                      </div>
                      <div className="text-slate-800 text-[11.5px]">{note.clinicalNotes}</div>
                      {note.orders && (
                        <div className="text-slate-600 text-[11px] font-mono pt-1 border-t border-slate-200">
                          <strong>Orders:</strong> {note.orders}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-lg">
                    No daily notes logged yet. Click &quot;Record Daily Surgeon Round Note&quot; to log POD progress.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT 5 COLS: DISCHARGE PATHWAY & READINESS */}
          <div className="lg:col-span-5 space-y-4">
            {/* Surgical Discharge Readiness Scorecard */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs space-y-3 text-xs">
              <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider border-b border-[#DDE2EC] pb-2 flex items-center justify-between">
                <span>Surgical Discharge Pathway</span>
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                  POD {(selectedCase.wardTransfer?.postOpDay ?? 2) >= 2 ? "Ready" : "In Progress"}
                </span>
              </h3>

              <div className="space-y-2">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1 text-emerald-950">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>✓</span> Discharge Readiness Criteria:
                  </div>
                  <ul className="text-[11px] space-y-1 pl-4 list-disc text-emerald-800">
                    <li>Afebrile for &gt; 24h on room air</li>
                    <li>Surgical wound clean, dry, no signs of infection</li>
                    <li>Drain removed or serous output &lt; 25 mL/day</li>
                    <li>Tolerating oral diet and fluids</li>
                    <li>Pain controlled with oral analgesics</li>
                    <li>Mobilizing safely with walker / unassisted</li>
                  </ul>
                </div>

                <div className="p-3 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg space-y-1.5">
                  <div className="font-bold text-slate-900">Pre-Discharge Steps Required:</div>
                  <div className="text-[11px] text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">1.</span>
                      <span>Suture removal date scheduled (POD 7-10)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">2.</span>
                      <span>Take-home medications (Antibiotics, Analgesics) reconciled</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">3.</span>
                      <span>Ward Bed released in Bed Management</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">4.</span>
                      <span>Final billing &amp; discharge summary generated</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onInitiateDischarge(selectedCase)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  <span>🎓 Complete Surgical Discharge &amp; Free Bed ➔</span>
                </button>
              </div>
            </div>

            {/* Handover & Ward Bed Details */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs space-y-2 text-xs">
              <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider border-b border-[#DDE2EC] pb-1.5">
                Bed Allocation &amp; Handover Record
              </h3>
              <div className="text-[11.5px] space-y-1.5 text-slate-700">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Ward / Room:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedCase.wardTransfer?.wardName || "Orthopedic Ward"} · Room {selectedCase.wardTransfer?.roomNo || "204"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Bed Number:</span>
                  <span className="font-semibold font-mono text-slate-900">
                    {selectedCase.wardTransfer?.bedNo || "Bed 204-A"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">PACU Handover By:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedCase.wardTransfer?.transferredBy || "Nurse Brenda"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Billing Room Charge:</span>
                  <span className="font-semibold font-mono text-emerald-700">
                    Active Inpatient (Daily Bed Rate Applied)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-white rounded-xl border border-[#DDE2EC] text-slate-500 text-xs">
          No patients currently admitted to surgical wards.
        </div>
      )}

      {/* Modal: Add Daily Round Progress Note */}
      {showAddNote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 border border-[#DDE2EC] space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
              <h3 className="font-bold text-sm text-[#1E3A6E]">
                Record Post-Op Round Note — POD {pod} ({selectedCase?.patientName})
              </h3>
              <button
                onClick={() => setShowAddNote(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordMilestone} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Post-Operative Day (POD)
                  </label>
                  <input
                    type="number"
                    value={pod}
                    onChange={(e) => setPod(Number(e.target.value))}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Attending Author
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Surgical Incision Status
                  </label>
                  <select
                    value={woundStatus}
                    onChange={(e) => setWoundStatus(e.target.value)}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                  >
                    <option value="Clean, Dry & Intact">Clean, Dry &amp; Intact</option>
                    <option value="Mild Serous Soakage - Dressing Changed">Mild Soakage - Dressing Changed</option>
                    <option value="Erythema - Under Observation">Erythema - Under Observation</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Surgical Drain Status
                  </label>
                  <select
                    value={drainStatus}
                    onChange={(e) => setDrainStatus(e.target.value)}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                  >
                    <option value="In situ - Active drain monitoring">In situ - Active monitoring</option>
                    <option value="Removed on POD 2 (Output < 25 mL/day)">Removed on POD 2</option>
                    <option value="Removed on POD 3">Removed on POD 3</option>
                    <option value="No Drains Placed">No Drains Placed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Diet Progression
                  </label>
                  <select
                    value={dietStatus}
                    onChange={(e) => setDietStatus(e.target.value)}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                  >
                    <option value="Full Normal Diet">Full Normal Diet</option>
                    <option value="Soft Diet">Soft Diet</option>
                    <option value="Clear Liquids">Clear Liquids</option>
                    <option value="Sips of Water">Sips of Water</option>
                    <option value="Strict NPO">Strict NPO</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Mobilization Milestone
                  </label>
                  <select
                    value={mobilizationStatus}
                    onChange={(e) => setMobilizationStatus(e.target.value)}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                  >
                    <option value="Independent Walking">Independent Walking</option>
                    <option value="Assisted Ambulation with Walker">Assisted with Walker</option>
                    <option value="Sitting on Edge of Bed">Sitting on Edge of Bed</option>
                    <option value="Bed Rest">Bed Rest</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Surgeon Clinical Progress Note
                </label>
                <textarea
                  rows={2}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Daily Orders (Medications, Physio, Diet)
                </label>
                <input
                  type="text"
                  value={orders}
                  onChange={(e) => setOrders(e.target.value)}
                  className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                />
              </div>

              <div className="pt-2 border-t border-[#DDE2EC] flex justify-end gap-2">
                <Btn type="button" variant="outline" size="xs" onClick={() => setShowAddNote(false)}>
                  Cancel
                </Btn>
                <Btn type="submit" variant="primary" size="xs">
                  Save Progress Note
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
