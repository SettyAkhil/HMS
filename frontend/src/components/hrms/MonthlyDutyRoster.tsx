import React, { useState, useEffect } from "react"
import {
  HrmsDatabase,
  DutyRosterEntry,
  StaffMember,
} from "../../services/hrmsDb"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Save,
  Download,
  Copy,
  Users,
  Check,
  Sparkles,
  Info,
} from "lucide-react"

interface MonthlyDutyRosterProps {
  onOpenOutdoorDuty?: () => void
  onOpenOvertime?: () => void
}

export default function MonthlyDutyRoster({
  onOpenOutdoorDuty,
  onOpenOvertime,
}: MonthlyDutyRosterProps = {}) {
  const [selectedMonth, setSelectedMonth] = useState("2026-10")
  const [selectedDept, setSelectedDept] = useState("All")
  const [rosters, setRosters] = useState<DutyRosterEntry[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)
  const [activeCell, setActiveCell] = useState<{ staffId: string; day: number } | null>(null)
  const [savedNotification, setSavedNotification] = useState(false)

  const [yearStr, monthStr] = selectedMonth.split("-")
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await HrmsDatabase.getMonthlyRoster(selectedMonth, selectedDept)
      setRosters(data)
      setStaffList(HrmsDatabase.getStaffList())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedDept])

  const shiftCodeStyles: Record<string, { bg: string; text: string; label: string; border: string }> = {
    M: { bg: "bg-indigo-50", text: "text-indigo-700", label: "Morning (07:00-15:00)", border: "border-indigo-200" },
    E: { bg: "bg-amber-50", text: "text-amber-700", label: "Evening (15:00-23:00)", border: "border-amber-200" },
    N: { bg: "bg-purple-50", text: "text-purple-700", label: "Night (23:00-07:00)", border: "border-purple-200" },
    G: { bg: "bg-emerald-50", text: "text-emerald-700", label: "General (09:00-17:30)", border: "border-emerald-200" },
    WO: { bg: "bg-slate-100", text: "text-slate-600", label: "Weekly Off", border: "border-slate-200" },
    OD: { bg: "bg-rose-50", text: "text-rose-700", label: "Outdoor Duty", border: "border-rose-200" },
    CL: { bg: "bg-blue-50", text: "text-blue-700", label: "Casual Leave", border: "border-blue-200" },
    SL: { bg: "bg-orange-50", text: "text-orange-700", label: "Sick Leave", border: "border-orange-200" },
    LOP: { bg: "bg-red-100", text: "text-red-700", label: "Loss of Pay", border: "border-red-300" },
  }

  const handleShiftSelect = async (staffId: string, day: number, code: string) => {
    await HrmsDatabase.updateRosterDay(staffId, selectedMonth, day, code)
    setActiveCell(null)
    setSavedNotification(true)
    setTimeout(() => setSavedNotification(false), 2000)
    await loadData()
  }

  const handleBulkFill = async (staffId: string, defaultCode: string) => {
    for (let day = 1; day <= daysInMonth; day++) {
      const dayOfWeek = new Date(year, month - 1, day).getDay()
      const codeToSet = dayOfWeek === 0 ? "WO" : defaultCode
      await HrmsDatabase.updateRosterDay(staffId, selectedMonth, day, codeToSet)
    }
    setSavedNotification(true)
    setTimeout(() => setSavedNotification(false), 2000)
    await loadData()
  }

  return (
    <div className="space-y-4">
      {/* ── Top Filter Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg p-1 text-slate-800">
            <button
              onClick={() => {
                const prev = new Date(year, month - 2, 1)
                setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`)
              }}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-bold text-xs px-2 text-slate-900">
              {new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" })}
            </span>
            <button
              onClick={() => {
                const next = new Date(year, month, 1)
                setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`)
              }}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Department:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-2 font-medium outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Hospital Departments</option>
              <option value="Casualty">Casualty / Emergency</option>
              <option value="ICU">ICU Complex</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Cleaning">Cleaning & Sanitation</option>
              <option value="Clinical Pharmacy">Clinical Pharmacy</option>
              <option value="Dialysis">Dialysis Unit</option>
              <option value="Aarogyasri">Aarogyasri Helpdesk</option>
            </select>
          </div>

          {/* Secondary Actions for Shift Coverage */}
          <div className="flex items-center gap-2">
            {onOpenOutdoorDuty && (
              <button
                onClick={onOpenOutdoorDuty}
                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>OD Slips (Ambulance / Camps)</span>
              </button>
            )}
            {onOpenOvertime && (
              <button
                onClick={onOpenOvertime}
                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>OT Register</span>
              </button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {Object.entries(shiftCodeStyles).map(([code, style]) => (
            <span
              key={code}
              className={`px-2 py-0.5 rounded font-mono font-bold border ${style.bg} ${style.text} ${style.border}`}
              title={style.label}
            >
              {code}: {style.label.split(" ")[0]}
            </span>
          ))}
          {savedNotification && (
            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 ml-2">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* ── 1 to 31 Day Duty Roster Matrix Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4 sticky left-0 bg-slate-50 z-20 min-w-[200px] border-r border-slate-200">
                  Staff Member & Dept
                </th>
                <th className="py-2 px-2 text-center text-[10px] text-slate-500 min-w-[70px] border-r border-slate-200">
                  Quick Fill
                </th>
                {daysArray.map((day) => {
                  const dayOfWeek = new Date(year, month - 1, day).getDay()
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                  const dayName = new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "narrow" })
                  return (
                    <th
                      key={day}
                      className={`py-2 px-1 text-center min-w-[34px] border-r border-slate-200 ${
                        isWeekend ? "bg-amber-50 text-amber-700 font-bold" : ""
                      }`}
                    >
                      <div className="text-[10px] opacity-70">{dayName}</div>
                      <div className="font-mono text-xs">{day}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rosters.map((roster) => (
                <tr key={roster.staffId} className="hover:bg-slate-50/70 transition-colors">
                  {/* Sticky Staff Info Column */}
                  <td className="py-3 px-4 sticky left-0 bg-white z-10 border-r border-slate-200">
                    <div className="font-bold text-slate-900">{roster.staffName}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span className="text-blue-600 font-medium">{roster.department}</span>
                      <span>•</span>
                      <span>{roster.designation}</span>
                    </div>
                  </td>

                  {/* Bulk Fill Helper */}
                  <td className="py-2 px-2 text-center border-r border-slate-200">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleBulkFill(roster.staffId, "M")}
                        className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-[10px] font-bold"
                        title="Fill weekdays as Morning"
                      >
                        M
                      </button>
                      <button
                        onClick={() => handleBulkFill(roster.staffId, "G")}
                        className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[10px] font-bold"
                        title="Fill weekdays as General"
                      >
                        G
                      </button>
                    </div>
                  </td>

                  {/* Days 1 to 31 Cells */}
                  {daysArray.map((day) => {
                    const shiftCode = roster.days[day] || "M"
                    const style = shiftCodeStyles[shiftCode] || shiftCodeStyles.M
                    const isActive = activeCell?.staffId === roster.staffId && activeCell?.day === day
                    const dayOfWeek = new Date(year, month - 1, day).getDay()
                    const isSunday = dayOfWeek === 0

                    return (
                      <td
                        key={day}
                        onClick={() => setActiveCell({ staffId: roster.staffId, day })}
                        className={`py-2 px-1 text-center font-mono font-bold cursor-pointer relative border-r border-slate-100 hover:bg-blue-50 transition-colors ${
                          isSunday ? "bg-slate-50/50" : ""
                        }`}
                      >
                        <span className={`inline-block w-7 py-1 rounded text-xs border ${style.bg} ${style.text} ${style.border}`}>
                          {shiftCode}
                        </span>

                        {/* Popover */}
                        {isActive && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl space-y-1 text-left animate-in fade-in zoom-in-95 duration-100"
                          >
                            <p className="text-[10px] font-bold text-slate-500 px-1 border-b border-slate-100 pb-1">
                              Day {day} ({roster.staffName.split(" ")[0]}):
                            </p>
                            {Object.entries(shiftCodeStyles).map(([code, s]) => (
                              <button
                                key={code}
                                onClick={() => handleShiftSelect(roster.staffId, day, code)}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-semibold hover:bg-slate-50 transition-colors ${s.text}`}
                              >
                                <span>{code} - {s.label.split(" ")[0]}</span>
                                {shiftCode === code && <Check className="h-3.5 w-3.5 text-blue-600" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
