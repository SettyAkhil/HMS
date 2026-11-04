import React, { useState, useEffect, useMemo } from "react"
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Calendar,
  Layers,
  Sliders,
  TrendingUp,
  FileSpreadsheet,
  X,
  RefreshCw,
  Clock,
} from "lucide-react"
import { LabLisService, QualityControlEntry } from "../../services/labLisService"
import LaboratoryAnalytics from "./LaboratoryAnalytics"
import LaboratoryTATMonitor from "./LaboratoryTATMonitor"

export default function QualityControlView() {
  const [qcRecords, setQcRecords] = useState<QualityControlEntry[]>([])
  const [activeTab, setActiveTab] = useState<"qc_charts" | "analytics" | "tat_monitor">("qc_charts")
  const [selectedAnalyte, setSelectedAnalyte] = useState("Glucose (Fasting)")
  const [isAddQcModalOpen, setIsAddQcModalOpen] = useState(false)

  // New QC Form State
  const [instrumentName, setInstrumentName] = useState("Roche Cobas c501")
  const [analyte, setAnalyte] = useState("Glucose (Fasting)")
  const [department, setDepartment] = useState("Clinical Biochemistry")
  const [controlLevel, setControlLevel] = useState<QualityControlEntry["controlLevel"]>("Level 1 (Normal)")
  const [lotNumber, setLotNumber] = useState("LOT-QC-2026-X1")
  const [targetMean, setTargetMean] = useState("95.0")
  const [targetSd, setTargetSd] = useState("3.2")
  const [observedValue, setObservedValue] = useState("96.4")
  const [technician, setTechnician] = useState("Anjali Gupta (QC Officer)")

  const loadData = () => {
    setQcRecords(LabLisService.getQcRecords())
  }

  useEffect(() => {
    loadData()
    const unsub = LabLisService.subscribe(loadData)
    return () => unsub()
  }, [])

  const handleAddQc = (e: React.FormEvent) => {
    e.preventDefault()
    LabLisService.addQcRecord({
      date: new Date().toISOString().split("T")[0],
      instrumentName,
      department,
      analyte,
      controlLevel,
      lotNumber,
      expiryDate: "2026-12-31",
      targetMean: parseFloat(targetMean) || 100,
      targetSd: parseFloat(targetSd) || 3,
      observedValue: parseFloat(observedValue) || 100,
      technician,
    })
    setIsAddQcModalOpen(false)
  }

  // Filter records for the selected analyte
  const analyteRecords = useMemo(() => {
    return qcRecords.filter((r) => r.analyte === selectedAnalyte)
  }, [qcRecords, selectedAnalyte])

  return (
    <div className="space-y-4">
      {/* ── SUB-TABS: QC CHARTS VS OPERATIONAL ANALYTICS ───────────────────── */}
      <div className="flex border-b border-[#E2E8F0] overflow-x-auto bg-white p-1 rounded-xl shadow-2xs gap-1">
        <button
          onClick={() => setActiveTab("qc_charts")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === "qc_charts"
              ? "bg-[#7552B8] text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Levey-Jennings Quality Control & Westgard Rules</span>
        </button>

        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === "analytics"
              ? "bg-[#7552B8] text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Operational Laboratory Analytics & Utilization</span>
        </button>

        <button
          onClick={() => setActiveTab("tat_monitor")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === "tat_monitor"
              ? "bg-[#7552B8] text-white shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Turnaround Time (TAT) Monitor</span>
        </button>
      </div>

      {activeTab === "analytics" ? (
        <LaboratoryAnalytics />
      ) : activeTab === "tat_monitor" ? (
        <LaboratoryTATMonitor />
      ) : (
        <div className="space-y-4">
          {/* ── TOP CONTROLS ────────────────────────────────────────────────── */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[10.5px] font-bold text-slate-500 uppercase">Selected Analyte</label>
                <select
                  value={selectedAnalyte}
                  onChange={(e) => setSelectedAnalyte(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                >
                  <option value="Glucose (Fasting)">Glucose (Fasting) - Cobas c501</option>
                  <option value="Serum Creatinine">Serum Creatinine - Cobas c501</option>
                  <option value="Hemoglobin (Hb)">Hemoglobin (Hb) - Sysmex XN-1000</option>
                  <option value="hs-Troponin I">hs-Troponin I - Architect ci8200</option>
                </select>
              </div>

              <div className="hidden sm:block text-xs text-slate-500 pt-3">
                Target Mean: <strong className="text-slate-900">{analyteRecords[0]?.targetMean || 95}</strong> · SD:{" "}
                <strong className="text-slate-900">{analyteRecords[0]?.targetSd || 3.2}</strong>
              </div>
            </div>

            <button
              onClick={() => setIsAddQcModalOpen(true)}
              className="px-4 py-2 bg-[#7552B8] hover:bg-[#6240a3] text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Daily QC Run</span>
            </button>
          </div>

          {/* ── LEVEY-JENNINGS VISUAL CHART ─────────────────────────────────── */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Levey-Jennings Control Chart: {selectedAnalyte}</h4>
                <p className="text-[11px] text-slate-500">Evaluated against Westgard Rules (1:2s, 1:3s, 2:2s, R:4s)</p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Instrument in Control
              </span>
            </div>

            {/* Visual Levey-Jennings chart representation */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs space-y-3">
              <div className="flex items-center justify-between text-[11px] text-rose-600 font-bold border-b border-dashed border-rose-300 pb-1">
                <span>+3 SD (Action Limit: {(95 + 3 * 3.2).toFixed(1)})</span>
                <span className="text-[10px]">Reject Run (1:3s)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-amber-600 font-bold border-b border-dashed border-amber-300 pb-1">
                <span>+2 SD (Warning Limit: {(95 + 2 * 3.2).toFixed(1)})</span>
                <span className="text-[10px]">Warning (1:2s)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-blue-600 font-bold border-b border-dashed border-blue-200 pb-1">
                <span>+1 SD ({(95 + 1 * 3.2).toFixed(1)})</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-900 font-black bg-purple-100/60 p-1.5 rounded">
                <span>MEAN (Target: 95.0 mg/dL)</span>
                <span>Active Target</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-blue-600 font-bold border-b border-dashed border-blue-200 pb-1">
                <span>-1 SD ({(95 - 1 * 3.2).toFixed(1)})</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-amber-600 font-bold border-b border-dashed border-amber-300 pb-1">
                <span>-2 SD (Warning Limit: {(95 - 2 * 3.2).toFixed(1)})</span>
                <span className="text-[10px]">Warning (1:2s)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-rose-600 font-bold border-b border-dashed border-rose-300 pb-1">
                <span>-3 SD (Action Limit: {(95 - 3 * 3.2).toFixed(1)})</span>
                <span className="text-[10px]">Reject Run (1:3s)</span>
              </div>
            </div>
          </div>

          {/* ── QC AUDIT RUNS TABLE ─────────────────────────────────────────── */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 bg-slate-50 font-bold text-xs text-slate-700">
              Recent Quality Control Inoculations & Calibrations
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Run ID</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Instrument</th>
                    <th className="py-2.5 px-3">Analyte</th>
                    <th className="py-2.5 px-3">Control Level</th>
                    <th className="py-2.5 px-3">Observed Value</th>
                    <th className="py-2.5 px-3">z-Score</th>
                    <th className="py-2.5 px-3 text-right">Westgard Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qcRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-700">{rec.id}</td>
                      <td className="py-2.5 px-3 text-slate-500">{rec.date}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{rec.instrumentName}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{rec.analyte}</td>
                      <td className="py-2.5 px-3 text-slate-600">{rec.controlLevel}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{rec.observedValue}</td>
                      <td className="py-2.5 px-3 font-mono text-purple-800 font-bold">{rec.zScore}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── LOG QC RUN MODAL ────────────────────────────────────────────────── */}
      {isAddQcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900">Record Daily Quality Control Run</h4>
              <button onClick={() => setIsAddQcModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddQc} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Instrument</label>
                <input
                  type="text"
                  value={instrumentName}
                  onChange={(e) => setInstrumentName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Analyte</label>
                <input
                  type="text"
                  value={analyte}
                  onChange={(e) => setAnalyte(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Target Mean</label>
                  <input
                    type="number"
                    step="any"
                    value={targetMean}
                    onChange={(e) => setTargetMean(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Target SD (1σ)</label>
                  <input
                    type="number"
                    step="any"
                    value={targetSd}
                    onChange={(e) => setTargetSd(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Observed QC Reading</label>
                <input
                  type="number"
                  step="any"
                  value={observedValue}
                  onChange={(e) => setObservedValue(e.target.value)}
                  className="w-full p-2 border border-purple-300 rounded-xl font-mono font-bold text-purple-900 bg-purple-50"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddQcModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#7552B8] hover:bg-[#6240a3] text-white font-bold rounded-xl shadow-2xs"
                >
                  Calculate z-Score & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

