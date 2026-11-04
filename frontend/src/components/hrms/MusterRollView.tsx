import React, { useState, useEffect } from "react"
import { HrmsDatabase, DutyRosterEntry, StaffMember } from "../../services/hrmsDb"
import { FileSpreadsheet, Download, Printer, Filter, ShieldCheck, ChevronLeft, ChevronRight, FileText, HardDrive } from "lucide-react"

interface MusterRollViewProps {
  onOpenMemos?: () => void
  onOpenDataSync?: () => void
}

export default function MusterRollView({ onOpenMemos, onOpenDataSync }: MusterRollViewProps) {
  const [selectedMonth, setSelectedMonth] = useState("2026-10")
  const [selectedDept, setSelectedDept] = useState("All")
  const [rosters, setRosters] = useState<DutyRosterEntry[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)

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

  const handleExportCSV = () => {
    let csv = `STATUTORY MUSTER ROLL - FORM J / FORM T (GOVT. OF TELANGANA / INDIA)\n`
    csv += `Hospital: Varma Enterprise Hospital & Research Centre\n`
    csv += `Month: ${selectedMonth}\n\n`
    csv += `Emp ID,Employee Name,Department,Designation,${daysArray.join(",")},Present Days,Absent,Weekly Offs,Paid Leaves,LOP,OT Hours\n`

    rosters.forEach((r) => {
      let pCount = 0
      let aCount = 0
      let woCount = 0
      let leaveCount = 0
      let lopCount = 0

      const dayCols = daysArray.map((day) => {
        const code = (r.days[day] || "M") as string
        if (code === "M" || code === "E" || code === "N" || code === "G" || code === "P") pCount++
        else if (code === "WO") woCount++
        else if (code === "OD") pCount++
        else if (code === "CL" || code === "SL") leaveCount++
        else if (code === "LOP") lopCount++
        else aCount++
        return code
      })

      csv += `"${r.staffId}","${r.staffName}","${r.department}","${r.designation}",${dayCols.join(",")},${pCount},${aCount},${woCount},${leaveCount},${lopCount},4.5\n`
    })

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `Muster_Roll_Form_J_${selectedMonth}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-4">
      {/* ── Top Filter Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Month Navigator */}
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
            <span className="text-slate-500 font-semibold">Department:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 font-medium rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Departments</option>
              <option value="Casualty">Casualty</option>
              <option value="ICU">ICU</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Cleaning">Cleaning & Sanitation</option>
              <option value="Clinical Pharmacy">Clinical Pharmacy</option>
              <option value="Dialysis">Dialysis</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onOpenMemos && (
            <button
              onClick={onOpenMemos}
              className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-amber-600" />
              <span>Disciplinary Memos</span>
            </button>
          )}

          {onOpenDataSync && (
            <button
              onClick={onOpenDataSync}
              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <HardDrive className="h-3.5 w-3.5 text-blue-600" />
              <span>USB Data Ingestion</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
          >
            <Printer className="h-3.5 w-3.5 text-slate-600" />
            <span>Print Form J</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export to Excel (Form J/T)</span>
          </button>
        </div>
      </div>

      {/* ── Statutory Muster Roll Header ── */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-1 shadow-xs print:border-none print:shadow-none">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          FORM J & FORM T — STATUTORY MUSTER ROLL OF HOSPITAL EMPLOYEES
        </h2>
        <p className="text-xs text-slate-500">
          [Rule 27(1) of the Minimum Wages & Hospital Establishments Act]
        </p>
        <p className="text-[11px] text-slate-500 font-mono">
          Hospital: Varma Enterprise Hospital & Research Centre • Month:{" "}
          <span className="text-blue-600 font-bold">
            {new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" })}
          </span>
        </p>
      </div>

      {/* ── High-Density 1 to 31 Days Muster Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs print:text-[10px]">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">
                  Employee Details
                </th>
                {daysArray.map((day) => (
                  <th key={day} className="py-2 px-1 text-center font-mono border-r border-slate-200 min-w-[28px] text-[11px]">
                    {day}
                  </th>
                ))}
                <th className="py-2.5 px-2 text-center text-emerald-700 font-bold border-l border-slate-200">P</th>
                <th className="py-2.5 px-2 text-center text-rose-700 font-bold">A</th>
                <th className="py-2.5 px-2 text-center text-slate-500 font-bold">WO</th>
                <th className="py-2.5 px-2 text-center text-blue-700 font-bold">LV</th>
                <th className="py-2.5 px-2 text-center text-red-700 font-bold">LOP</th>
                <th className="py-2.5 px-2 text-center text-indigo-700 font-bold">OT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rosters.map((roster) => {
                let pCount = 0
                let aCount = 0
                let woCount = 0
                let leaveCount = 0
                let lopCount = 0

                daysArray.forEach((day) => {
                  const code = (roster.days[day] || "M") as string
                  if (code === "M" || code === "E" || code === "N" || code === "G" || code === "P") pCount++
                  else if (code === "WO") woCount++
                  else if (code === "OD") pCount++
                  else if (code === "CL" || code === "SL") leaveCount++
                  else if (code === "LOP") lopCount++
                  else aCount++
                })

                return (
                  <tr key={roster.staffId} className="hover:bg-slate-50/70 transition-colors">
                    {/* Sticky Name Col */}
                    <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 font-medium">
                      <div className="font-bold text-slate-900">{roster.staffName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {roster.staffId} • {roster.department}
                      </div>
                    </td>

                    {/* Days 1 to 31 Attendance Symbols */}
                    {daysArray.map((day) => {
                      const shift = roster.days[day] || "P"
                      let symbol = "P"
                      let color = "text-emerald-700 font-bold"

                      if (shift === "WO") {
                        symbol = "WO"
                        color = "text-slate-400 font-normal"
                      } else if (shift === "OD") {
                        symbol = "OD"
                        color = "text-rose-700 font-bold"
                      } else if (shift === "CL" || shift === "SL") {
                        symbol = "L"
                        color = "text-blue-700 font-bold"
                      } else if (shift === "LOP") {
                        symbol = "A"
                        color = "text-red-700 font-bold"
                      }

                      return (
                        <td
                          key={day}
                          className={`py-2 px-1 text-center font-mono text-[11px] border-r border-slate-100 ${color}`}
                        >
                          {symbol}
                        </td>
                      )
                    })}

                    {/* Totals Summary */}
                    <td className="py-2.5 px-2 text-center font-bold text-emerald-700 border-l border-slate-200 bg-emerald-50/30">
                      {pCount}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-rose-700 bg-rose-50/30">{aCount}</td>
                    <td className="py-2.5 px-2 text-center font-medium text-slate-500">{woCount}</td>
                    <td className="py-2.5 px-2 text-center font-medium text-blue-700">{leaveCount}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-red-700 bg-red-50/30">{lopCount}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-indigo-700 font-mono">4.5</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
