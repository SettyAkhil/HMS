/**
 * Enterprise Hospital Management System - Staff Global Profile & Activity View
 * Path: src/components/reports/StaffGlobalProfileView.tsx
 *
 * Full-width staff profile and role-tailored activity view:
 * - Employee Information Card (Designation, Department, Shift, Contact, Status)
 * - Date Range Preset Selector
 * - Role-Specific KPI Cards (Nursing, Pharmacy, Laboratory, Radiology, Administrative)
 * - Tailored Activity & Operations Log
 */

import React, { useState, useMemo } from "react"
import {
  ArrowLeft,
  Printer,
  Calendar,
  Users,
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Activity,
  Award,
  Layers,
  Sparkles,
  ClipboardList,
} from "lucide-react"
import {
  GlobalSearchService,
  StaffActivityProfile,
} from "../../services/globalSearchService"
import { DateRangePreset } from "../../services/generalReportsDb"

interface StaffGlobalProfileViewProps {
  staffId: string
  onBack: () => void
}

const DATE_PRESET_OPTIONS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 Days",
  last30: "Last 30 Days",
  thisMonth: "This Month",
  lastMonth: "Previous Month",
  custom: "Custom Range",
}

export const StaffGlobalProfileView: React.FC<StaffGlobalProfileViewProps> = ({
  staffId,
  onBack,
}) => {
  const [preset, setPreset] = useState<DateRangePreset>("today")

  const profile: StaffActivityProfile = useMemo(() => {
    return GlobalSearchService.getStaffActivityProfile(staffId, preset)
  }, [staffId, preset])

  const { staff, kpis, activityLog } = profile

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
              Staff Member Dossier & Audit
            </span>
            <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              ID: {staff.id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
          <div className="relative">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DateRangePreset)}
              className="appearance-none bg-white border border-[#CBD5E1] hover:border-slate-400 text-slate-800 text-xs font-semibold py-1.5 pl-3 pr-8 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#1B4FD8] transition cursor-pointer"
            >
              {(Object.keys(DATE_PRESET_OPTIONS) as DateRangePreset[])
                .filter((p) => p !== "custom")
                .map((key) => (
                  <option key={key} value={key}>
                    {DATE_PRESET_OPTIONS[key]}
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
            <span>Print Dossier</span>
          </button>
        </div>
      </div>

      {/* ── 2. STAFF EMPLOYEE INFORMATION CARD ────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-amber-500/20 shrink-0">
              {staff.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  {staff.name}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {staff.category}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {staff.dutyStatus}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                <span>{staff.designation} · {staff.department}</span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {staff.email}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {staff.phone}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Shift: {staff.shift}
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg">
            Joined: <strong className="text-slate-800">{staff.joiningDate}</strong>
          </div>
        </div>
      </div>

      {/* ── 3. ROLE-SPECIFIC KPI CARDS ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(kpis).map(([key, kpi]) => (
          <div
            key={key}
            className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs space-y-1"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {kpi.label}
            </div>
            <div className="text-xl font-black text-slate-900">
              {kpi.value}
            </div>
            <div className="pt-1">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  kpi.badgeColor || "bg-slate-100 text-slate-700"
                }`}
              >
                {profile.dateRangeLabel}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 4. ROLE-TAILORED ACTIVITY LOG ─────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#1B4FD8]" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              {staff.category} Department Operational Activity Log
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {activityLog.length} recent actions logged
          </span>
        </div>

        <div className="p-5">
          {activityLog.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No operations or audit events recorded for this staff member during this period.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3.5">Timestamp</th>
                    <th className="py-2.5 px-3.5">Action Type</th>
                    <th className="py-2.5 px-3.5">Activity Description</th>
                    <th className="py-2.5 px-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activityLog.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3.5 font-medium text-slate-600 whitespace-nowrap">
                        {log.dateTimeFormatted}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {log.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-slate-900">
                          {log.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {log.description}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

