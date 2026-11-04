import React, { useState, useMemo, useEffect } from "react"
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Calendar,
  Filter,
  Download,
  Users,
} from "lucide-react"
import { UniversalRadiologyDb } from "../../services/universalRadiologyDb"
import { RadiologyWorkflowDb } from "../../services/radiologyWorkflowDb"
import { RADIOLOGY_MODALITIES } from "../../services/radiologyTariffsData"

export default function RadiologyAnalyticsView() {
  const [tick, setTick] = useState(0)
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days">("7days")
  const [modalityFilter, setModalityFilter] = useState("all")

  useEffect(() => {
    const unsub = UniversalRadiologyDb.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])

  const analytics = useMemo(() => UniversalRadiologyDb.getDepartmentAnalytics(dateRange), [tick, dateRange])
  const studies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  const completionRate = useMemo(() => {
    if (!analytics.totalStudies) return 100
    return Math.round((analytics.completedStudies / analytics.totalStudies) * 100)
  }, [analytics])

  const reportRate = useMemo(() => {
    if (!analytics.completedStudies) return 100
    return Math.round((analytics.finalizedReports / analytics.completedStudies) * 100)
  }, [analytics])

  return (
    <div className="space-y-6">
      {/* ── Toolbar ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1B4FD8]" />
            <span>Radiology Department Operational Analytics & TAT Metrics</span>
          </h3>
          <p className="text-[12px] text-[#64748B]">
            Turnaround time distribution, examination completion efficiency, and modality throughput KPIs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex border border-[#CBD5E1] rounded overflow-hidden text-[12px] font-semibold bg-white">
            <button
              onClick={() => setDateRange("today")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                dateRange === "today" ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange("7days")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                dateRange === "7days" ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setDateRange("30days")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                dateRange === "30days" ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Last 30 Days
            </button>
          </div>
        </div>
      </div>

      {/* ── Top Metric Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Studies</span>
          <div className="text-2xl font-extrabold text-[#0F172A] mt-1 font-mono">{analytics.totalStudies}</div>
          <span className="text-[10.5px] text-emerald-600 font-semibold mt-1 block">Active across 11 modalities</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Exam Complete Rate</span>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">{completionRate}%</div>
          <span className="text-[10.5px] text-slate-500 mt-1 block">{analytics.completedStudies} scanned</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Report Complete Rate</span>
          <div className="text-2xl font-extrabold text-purple-700 mt-1 font-mono">{reportRate}%</div>
          <span className="text-[10.5px] text-slate-500 mt-1 block">{analytics.finalizedReports} signed off</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Order → Scan Avg</span>
          <div className="text-2xl font-extrabold text-[#1B4FD8] mt-1 font-mono">{analytics.turnaroundTime.orderToScan}</div>
          <span className="text-[10.5px] text-slate-500 mt-1 block">Holding bay wait time</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Scan → Report Avg</span>
          <div className="text-2xl font-extrabold text-purple-700 mt-1 font-mono">{analytics.turnaroundTime.scanToReport}</div>
          <span className="text-[10.5px] text-slate-500 mt-1 block">Diagnostic transcription</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Overall Median TAT</span>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">{analytics.turnaroundTime.medianTat}</div>
          <span className="text-[10.5px] text-slate-500 mt-1 block">End-to-end dispatch</span>
        </div>
      </div>

      {/* ── Chronological Examination Throughput Trend ── */}
      {analytics.chronologicalTrend && analytics.chronologicalTrend.length > 0 && (
        <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-[13px] text-[#0F172A] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1B4FD8]" />
                <span>Chronological Examination Workflow Progression ({dateRange === "today" ? "Today" : dateRange === "7days" ? "7-Day Daily Trend" : "30-Day Daily Trend"})</span>
              </h4>
              <p className="text-[11.5px] text-[#64748B]">
                Timeline distribution of registered examination orders, completed scans, and finalized diagnostic reports
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 font-bold">
              {analytics.chronologicalTrend.reduce((acc, d) => acc + d.count, 0)} total in range
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="grid grid-flow-col auto-cols-fr gap-2 min-w-[500px] text-center pt-2">
              {analytics.chronologicalTrend.map((d) => (
                <div key={d.date} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 flex flex-col items-center">
                  <span className="text-[11px] font-bold text-slate-700">{d.label}</span>
                  <div className="text-lg font-black text-[#0F172A] font-mono mt-1">{d.count}</div>
                  <span className="text-[10px] text-slate-500 font-medium">orders</span>
                  <div className="w-full mt-2 pt-2 border-t border-slate-200 flex items-center justify-around text-[10.5px]">
                    <span className="text-emerald-700 font-bold" title="Scans Completed">✓ {d.completed}</span>
                    <span className="text-purple-700 font-bold" title="Reports Finalized">★ {d.finalized}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Charts & Modality Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Modality Volume Distribution Bar Chart */}
        <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-[13px] text-[#0F172A]">Volume Breakdown by Clinical Modality</h4>
              <p className="text-[11.5px] text-[#64748B]">All registered active examinations across the hospital</p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 font-bold">{analytics.totalStudies} total</span>
          </div>

          <div className="space-y-2.5">
            {RADIOLOGY_MODALITIES.map((mod) => {
              const count = analytics.modalityCounts[mod] || 0
              const percentage = analytics.totalStudies > 0 ? Math.round((count / analytics.totalStudies) * 100) : 0
              return (
                <div key={mod} className="space-y-1">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="font-semibold text-slate-800">{mod}</span>
                    <span className="font-mono text-slate-600 font-bold">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#1B4FD8] h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(percentage, count > 0 ? 3 : 0)}%` }}
                    ></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Turnaround Time Stage Analysis & Suite Utilization */}
        <div className="space-y-6">
          {/* Turnaround Time Breakdown */}
          <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h4 className="font-bold text-[13px] text-[#0F172A]">Turnaround Time Stage Progression</h4>
              <p className="text-[11.5px] text-[#64748B]">Time elapsed from physician order to approved report delivery</p>
            </div>

            <div className="space-y-3 text-[12px]">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-md flex items-center justify-between">
                <div>
                  <span className="font-bold text-blue-950 block">Stage 1: Order to Gantry Scan</span>
                  <span className="text-[11px] text-blue-800">Nurse verification, billing clearance & patient positioning</span>
                </div>
                <span className="text-base font-extrabold text-blue-900 font-mono">
                  {analytics.turnaroundTime.orderToScan}
                </span>
              </div>

              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-md flex items-center justify-between">
                <div>
                  <span className="font-bold text-purple-950 block">Stage 2: Scanning to Diagnostic Report</span>
                  <span className="text-[11px] text-purple-800">Technician transcription, findings entry & impression drafting</span>
                </div>
                <span className="text-base font-extrabold text-purple-900 font-mono">
                  {analytics.turnaroundTime.scanToReport}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-md flex items-center justify-between">
                <div>
                  <span className="font-bold text-emerald-950 block">Stage 3: End-to-End Operational TAT</span>
                  <span className="text-[11px] text-emerald-800">Complete journey to authorized patient report availability</span>
                </div>
                <span className="text-base font-extrabold text-emerald-900 font-mono">
                  {analytics.turnaroundTime.overall}
                </span>
              </div>
            </div>
          </div>

          {/* Gantry & Suite Availability Card */}
          <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs flex items-center justify-between">
            <div>
              <h4 className="font-bold text-[13px] text-[#0F172A]">Gantry & Suite Operational Capacity</h4>
              <p className="text-[11.5px] text-[#64748B]">Active room utilization across all 11 suites</p>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <span className="text-[11px] text-slate-500 uppercase block">In Scanning</span>
                <span className="text-xl font-extrabold text-blue-700 font-mono">{analytics.suitesInUse}</span>
              </div>
              <div className="h-8 w-px bg-slate-200"></div>
              <div>
                <span className="text-[11px] text-slate-500 uppercase block">Available</span>
                <span className="text-xl font-extrabold text-emerald-700 font-mono">{analytics.suitesAvailable}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
