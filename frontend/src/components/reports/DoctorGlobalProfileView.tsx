/**
 * Enterprise Hospital Management System - Doctor Global Profile & Performance View
 * Path: src/components/reports/DoctorGlobalProfileView.tsx
 *
 * Full-width physician performance and encounter registry:
 * - Physician Profile Header with specialty, room, staff ID, fee
 * - Dynamic Period Selector: Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Previous Month, All History
 * - Top Synchronized KPI Strip (8 Metrics)
 * - Sub-tabs:
 *   1. Consultation & Encounter Registry (Itemized with formatted date/time & badges)
 *   2. Prescriptions Issued
 *   3. Diagnostic Orders Placed
 */

import React, { useState, useMemo } from "react"
import {
  ArrowLeft,
  Printer,
  Calendar,
  Stethoscope,
  Building2,
  Users,
  CheckCircle2,
  Clock,
  Pill,
  TestTube,
  Activity,
  FileText,
  BadgeAlert,
  ChevronDown,
  Sparkles,
} from "lucide-react"
import {
  GlobalSearchService,
  DoctorActivityStats,
} from "../../services/globalSearchService"
import { DateRangePreset } from "../../services/generalReportsDb"

interface DoctorGlobalProfileViewProps {
  doctorId: string
  onBack: () => void
}

type PeriodOption = DateRangePreset | "all"

const PERIOD_LABELS: Record<PeriodOption, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 Days",
  last30: "Last 30 Days",
  thisMonth: "This Month",
  lastMonth: "Previous Month",
  all: "All History",
  custom: "Custom",
}

export const DoctorGlobalProfileView: React.FC<DoctorGlobalProfileViewProps> = ({
  doctorId,
  onBack,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>("today")
  const [activeTab, setActiveTab] = useState<
    "encounters" | "prescriptions" | "lab_orders"
  >("encounters")

  const stats: DoctorActivityStats = useMemo(() => {
    return GlobalSearchService.getDoctorActivityStats(doctorId, selectedPeriod)
  }, [doctorId, selectedPeriod])

  const { doctor, kpis, encounters, prescriptions, labOrders } = stats

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="w-full space-y-4 animate-in fade-in-50 duration-150">
      {/* ── 1. TOP ACTION BAR ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E2E8F0] rounded-xl px-5 py-3.5 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Reports Overview</span>
          </button>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-tight text-slate-900">
              Physician Performance File
            </span>
            <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
              {doctor.id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Period Selector */}
          <div className="relative">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as PeriodOption)}
              className="appearance-none bg-white border border-[#CBD5E1] hover:border-slate-400 text-slate-800 text-xs font-semibold py-1.5 pl-3 pr-8 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#1B4FD8] transition cursor-pointer"
            >
              {(Object.keys(PERIOD_LABELS) as PeriodOption[])
                .filter((p) => p !== "custom")
                .map((key) => (
                  <option key={key} value={key}>
                    {PERIOD_LABELS[key]}
                  </option>
                ))}
            </select>
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* ── 2. DOCTOR INFORMATION HEADER CARD ─────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center font-black text-xl shadow-md shadow-purple-500/20 shrink-0">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  {doctor.name}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  {doctor.specialty || "Specialist"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                <span>{doctor.qualification}</span>
                <span>Room: <strong className="text-slate-700">{doctor.room || "Room 201"}</strong></span>
                <span>Staff ID: <strong className="text-slate-700">{doctor.staffId || doctor.id}</strong></span>
                <span>Fee: <strong className="text-slate-700">₹{doctor.consultationFee || 500}</strong></span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
            Active Period: <strong className="text-slate-800">{stats.dateRangeLabel}</strong>
          </div>
        </div>
      </div>

      {/* ── 3. TOP KPI STRIP (8 METRICS) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Patients Today
          </div>
          <div className="text-lg font-black text-blue-600 mt-0.5">
            {kpis.patientsTreatedToday}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Completed Today
          </div>
          <div className="text-lg font-black text-emerald-600 mt-0.5">
            {kpis.consultationsCompletedToday}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Unique Patients
          </div>
          <div className="text-lg font-black text-indigo-600 mt-0.5">
            {kpis.uniquePatientsPeriod}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Consultations
          </div>
          <div className="text-lg font-black text-purple-600 mt-0.5">
            {kpis.totalConsultationsPeriod}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            OP Clinic
          </div>
          <div className="text-lg font-black text-teal-600 mt-0.5">
            {kpis.opConsultations}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            ER Encounters
          </div>
          <div className="text-lg font-black text-rose-600 mt-0.5">
            {kpis.erEncounters}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Prescriptions
          </div>
          <div className="text-lg font-black text-amber-600 mt-0.5">
            {kpis.prescriptionsIssued}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Lab Orders
          </div>
          <div className="text-lg font-black text-cyan-600 mt-0.5">
            {kpis.labOrdersPlaced}
          </div>
        </div>
      </div>

      {/* ── 4. WORKSPACE SUB-TABS ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="flex border-b border-[#E2E8F0] overflow-x-auto bg-slate-50/70 p-1 gap-1">
          <button
            onClick={() => setActiveTab("encounters")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === "encounters"
                ? "bg-white text-[#1B4FD8] shadow-2xs border border-[#E2E8F0]"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Consultation & Encounter Registry ({encounters.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("prescriptions")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === "prescriptions"
                ? "bg-white text-[#1B4FD8] shadow-2xs border border-[#E2E8F0]"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Pill className="w-3.5 h-3.5" />
            <span>Prescriptions Issued ({prescriptions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("lab_orders")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === "lab_orders"
                ? "bg-white text-[#1B4FD8] shadow-2xs border border-[#E2E8F0]"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <TestTube className="w-3.5 h-3.5" />
            <span>Diagnostic Orders Placed ({labOrders.length})</span>
          </button>
        </div>

        <div className="p-5">
          {/* ── SUB-TAB 1: ENCOUNTERS ──────────────────────────────────────── */}
          {activeTab === "encounters" && (
            <div className="space-y-3">
              {encounters.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No patient encounters conducted during this period ({stats.dateRangeLabel}).
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3.5">Encounter ID</th>
                        <th className="py-2.5 px-3.5">Patient & MRN</th>
                        <th className="py-2.5 px-3.5">Date & Time</th>
                        <th className="py-2.5 px-3.5">Visit Type</th>
                        <th className="py-2.5 px-3.5">Diagnosis / Complaint</th>
                        <th className="py-2.5 px-3.5">Fee</th>
                        <th className="py-2.5 px-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {encounters.map((enc) => {
                        let statusColor = "bg-slate-100 text-slate-700 border-slate-200"
                        if (
                          enc.status === "Consultation Completed" ||
                          enc.status === "OP Completed" ||
                          enc.status === "Billing Completed"
                        ) {
                          statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200"
                        } else if (enc.status === "Awaiting Billing" || enc.status === "Awaiting Investigation") {
                          statusColor = "bg-amber-50 text-amber-700 border-amber-200"
                        } else if (enc.status === "Under Consultation") {
                          statusColor = "bg-blue-50 text-blue-700 border-blue-200"
                        } else if (enc.status === "In Queue") {
                          statusColor = "bg-purple-50 text-purple-700 border-purple-200"
                        }

                        return (
                          <tr key={enc.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                              {enc.id}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-bold text-slate-900">
                                {enc.patientName}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                UMR: {enc.umr}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 font-medium text-slate-600 whitespace-nowrap">
                              {enc.dateTimeFormatted}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span className="font-semibold text-slate-700">
                                {enc.visitType}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 max-w-xs">
                              <div className="font-semibold text-slate-800 truncate">
                                {enc.diagnosis}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {enc.complaint}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-slate-700">
                              ₹{enc.fee}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusColor}`}>
                                {enc.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SUB-TAB 2: PRESCRIPTIONS ───────────────────────────────────── */}
          {activeTab === "prescriptions" && (
            <div className="space-y-4">
              {prescriptions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No prescriptions issued during this period.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                          <div className="text-xs font-black text-slate-900">
                            {rx.patientName}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            UMR: {rx.umr} · Date: {rx.date}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          {rx.status}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Prescribed Medications ({rx.items.length})
                        </div>
                        {rx.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-50 rounded-lg p-2 text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-slate-800">
                                {item.medicineName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {item.dosage} · {item.frequency || "1-0-1"} · {item.duration}
                              </div>
                            </div>
                            {item.instructions && (
                              <span className="text-[10px] text-slate-500 italic">
                                {item.instructions}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SUB-TAB 3: DIAGNOSTIC ORDERS ───────────────────────────────── */}
          {activeTab === "lab_orders" && (
            <div className="space-y-3">
              {labOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No diagnostic laboratory investigations placed during this period.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3.5">Order ID</th>
                        <th className="py-2.5 px-3.5">Patient</th>
                        <th className="py-2.5 px-3.5">Date</th>
                        <th className="py-2.5 px-3.5">Urgency</th>
                        <th className="py-2.5 px-3.5">Tests Ordered</th>
                        <th className="py-2.5 px-3.5">Billing Total</th>
                        <th className="py-2.5 px-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {labOrders.map((lo) => (
                        <tr key={lo.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">
                            {lo.id}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-bold text-slate-900">
                              {lo.patientName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              UMR: {lo.umr}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            {lo.date}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                lo.urgency === "STAT"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {lo.urgency}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="flex flex-wrap gap-1">
                              {lo.tests.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                            ₹{lo.total}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {lo.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

