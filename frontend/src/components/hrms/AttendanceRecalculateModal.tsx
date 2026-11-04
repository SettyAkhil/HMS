import React, { useState } from "react"
import { HrmsDatabase } from "../../services/hrmsDb"
import { Cpu, RefreshCw, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from "lucide-react"

interface AttendanceRecalculateModalProps {
  isOpen: boolean
  onClose: () => void
  onRecalculateComplete?: () => void
}

export default function AttendanceRecalculateModal({
  isOpen,
  onClose,
  onRecalculateComplete,
}: AttendanceRecalculateModalProps) {
  const [month, setMonth] = useState("2026-10")
  const [graceMinutes, setGraceMinutes] = useState(15)
  const [halfDayHours, setHalfDayHours] = useState(4.0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState<any | null>(null)

  if (!isOpen) return null

  const handleRunRecalculation = async () => {
    setIsProcessing(true)
    try {
      const res = await HrmsDatabase.recalculateAttendance(month, graceMinutes)
      setResults(res)
      if (onRecalculateComplete) onRecalculateComplete()
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Re-calculate Biometric Attendance</h3>
              <p className="text-xs text-gray-400">Reconcile raw machine punch logs against the 1-31 monthly duty roster</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          The recalculation engine iterates through all raw punch timestamps, applies hospital shift grace policies,
          detects late arrivals, early exits, half days, and recalculates Loss of Pay (LOP) and Overtime (OT).
        </p>

        {/* Engine Rules Configuration */}
        <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 space-y-3 text-xs">
          <div>
            <label className="block text-gray-400 font-medium mb-1">Roster Calculation Month:</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="2026-10">October 2026 (Active Period)</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-08">August 2026</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 font-medium mb-1">Grace Period (Minutes):</label>
              <input
                type="number"
                min="0"
                max="60"
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(parseInt(e.target.value, 10))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-gray-400">Hospital standard: 15 mins</span>
            </div>

            <div>
              <label className="block text-gray-400 font-medium mb-1">Half-Day Threshold:</label>
              <input
                type="number"
                step="0.5"
                min="2"
                max="6"
                value={halfDayHours}
                onChange={(e) => setHalfDayHours(parseFloat(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-gray-400">Min 4.0 hrs for half-day</span>
            </div>
          </div>
        </div>

        {/* Calculation Results Card */}
        {results && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <CheckCircle2 className="h-4 w-4" />
              <span>{results.message}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                <span className="text-gray-400">Total Staff Processed:</span>
                <span className="float-right font-bold text-white">{results.processedStaff}</span>
              </div>
              <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                <span className="text-gray-400">On-Time Present:</span>
                <span className="float-right font-bold text-emerald-400">{results.results?.onTimePresent}</span>
              </div>
              <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                <span className="text-gray-400">Late Arrivals (&gt;15 min):</span>
                <span className="float-right font-bold text-amber-400">{results.results?.lateArrivals}</span>
              </div>
              <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                <span className="text-gray-400">Total OT Calculated:</span>
                <span className="float-right font-bold text-indigo-400">{results.results?.totalOTHoursComputed} hrs</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium hover:bg-gray-700"
          >
            Close
          </button>
          <button
            onClick={handleRunRecalculation}
            disabled={isProcessing}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            <span>{isProcessing ? "Recalculating Shifts..." : "Execute Recalculation"}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
