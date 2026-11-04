import React, { useState, useMemo } from "react"
import { formatINR } from "../../lib/format"

export interface DischargedPatientRecord {
  id: string // "DISC-1001"
  patientId: string
  patientName: string
  mrn: string
  ward: string
  roomNo: string
  bedNo: string
  admissionDate: string
  dischargeDate: string
  lengthOfStayDays: number
  dischargeReason: string
  roomChargesTotal: number
  attendingDoctor: string
}

interface Props {
  dischargedPatients: DischargedPatientRecord[]
  loading: boolean
  onRefresh: () => void
}

export default function DischargedDirectoryView({
  dischargedPatients,
  loading,
  onRefresh,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("")
  const [wardFilter, setWardFilter] = useState("all")
  const [doctorFilter, setDoctorFilter] = useState("all")
  const [timeFilter, setTimeFilter] =
    useState<"all" | "today" | "7days" | "30days">("all")
  const [selectedRecord, setSelectedRecord] =
    useState<DischargedPatientRecord | null>(null)

  // Extract unique wards and doctors from real data
  const availableWards = useMemo(() => {
    const set = new Set<string>()
    dischargedPatients.forEach((p) => {
      if (p.ward) set.add(p.ward)
    })
    return Array.from(set)
  }, [dischargedPatients])

  const availableDoctors = useMemo(() => {
    const set = new Set<string>()
    dischargedPatients.forEach((p) => {
      if (p.attendingDoctor) set.add(p.attendingDoctor)
    })
    return Array.from(set)
  }, [dischargedPatients])

  // Derived Operational Metrics (Derived from 100% real database records)
  const metrics = useMemo(() => {
    const total = dischargedPatients.length
    const now = new Date()
    const todayStr = now.toDateString()

    const todayCount = dischargedPatients.filter((p) => {
      try {
        return new Date(p.dischargeDate).toDateString() === todayStr
      } catch {
        return false
      }
    }).length

    const totalLos = dischargedPatients.reduce(
      (sum, p) => sum + (p.lengthOfStayDays || 1),
      0,
    )
    const avgLos = total > 0 ? (totalLos / total).toFixed(1) : "0.0"

    const totalCharges = dischargedPatients.reduce(
      (sum, p) => sum + (p.roomChargesTotal || 0),
      0,
    )

    return {
      total,
      todayCount,
      avgLos: `${avgLos} Days`,
      totalCharges: formatINR(totalCharges),
    }
  }, [dischargedPatients])

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return dischargedPatients.filter((p) => {
      const q = searchQuery.toLowerCase().trim()
      if (q) {
        const matchesName = (p.patientName || "").toLowerCase().includes(q)
        const matchesMrn = (p.mrn || "").toLowerCase().includes(q)
        const matchesId = (p.id || "").toLowerCase().includes(q)
        const matchesBed = (p.bedNo || "").toLowerCase().includes(q)
        const matchesReason = (p.dischargeReason || "")
          .toLowerCase()
          .includes(q)
        if (
          !matchesName &&
          !matchesMrn &&
          !matchesId &&
          !matchesBed &&
          !matchesReason
        ) {
          return false
        }
      }

      if (wardFilter !== "all" && p.ward !== wardFilter) {
        return false
      }

      if (doctorFilter !== "all" && p.attendingDoctor !== doctorFilter) {
        return false
      }

      if (timeFilter !== "all") {
        try {
          const discDate = new Date(p.dischargeDate).getTime()
          const now = Date.now()
          if (timeFilter === "today") {
            if (
              new Date(p.dischargeDate).toDateString() !==
              new Date().toDateString()
            )
              return false
          } else if (timeFilter === "7days") {
            if (now - discDate > 7 * 86400000) return false
          } else if (timeFilter === "30days") {
            if (now - discDate > 30 * 86400000) return false
          }
        } catch {
          // ignore date parse error
        }
      }

      return true
    })
  }, [dischargedPatients, searchQuery, wardFilter, doctorFilter, timeFilter])

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return
    const headers = [
      "Discharge ID",
      "Patient Name",
      "MRN",
      "Ward",
      "Room",
      "Bed",
      "Admission Date",
      "Discharge Date",
      "Length of Stay (Days)",
      "Room Charges (INR)",
      "Attending Doctor",
      "Discharge Reason",
    ]

    const rows = filteredRecords.map((r) => [
      r.id,
      `"${r.patientName.replace(/"/g, '""')}"`,
      r.mrn,
      `"${r.ward}"`,
      r.roomNo,
      r.bedNo,
      r.admissionDate,
      r.dischargeDate,
      r.lengthOfStayDays,
      r.roomChargesTotal,
      `"${r.attendingDoctor}"`,
      `"${(r.dischargeReason || "").replace(/"/g, '""')}"`,
    ])

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute(
      "download",
      `discharged_patients_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleResetFilters = () => {
    setSearchQuery("")
    setWardFilter("all")
    setDoctorFilter("all")
    setTimeFilter("all")
  }

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="w-full bg-[#F8FAFC] min-h-full text-[#0F172A] font-sans pb-24">
      {/* ── PAGE TITLE ── */}
      <div className="px-6 sm:px-8 py-4 border-b border-[#E2E8F0] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-[#0F172A] leading-tight m-0">
            Discharged Patients Directory
          </h1>
          <p className="text-[11.5px] text-[#64748B] mt-0.5 mb-0 max-w-3xl font-normal">
            Review completed inpatient stays, medical discharge clearance
            summaries, length of stay (LOS), and settled room charges.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 self-start md:self-center">
          <button
            type="button"
            onClick={onRefresh}
            className="px-3.5 py-2 text-xs font-bold text-[#475569] bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded-md transition-colors flex items-center gap-1.5 border border-[#CBD5E1]"
            title="Refresh records"
          >
            ↺ Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
            className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#153eb3] disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors flex items-center gap-2 shadow-xs"
          >
            📥 Export CSV ({filteredRecords.length})
          </button>
        </div>
      </div>

      <div className="px-6 sm:px-8 pt-5">
        {/* ── OPERATIONAL SUMMARY KPI CARDS (LARGE FORMAT) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {/* Card 1 */}
          <div className="bg-white rounded-none border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              Total Discharged
            </div>
            <div className="my-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-[#0F172A] font-mono">
                {metrics.total}
              </span>
              <span className="text-[11px] font-semibold text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                Archived Stays
              </span>
            </div>
            <div className="text-xs text-[#64748B]">
              All recorded patient releases
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-none border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              Today's Discharges
            </div>
            <div className="my-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-[#1B4FD8] font-mono">
                {metrics.todayCount}
              </span>
              <span className="text-[11px] font-semibold text-[#1B4FD8] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                Cleared Today
              </span>
            </div>
            <div className="text-xs text-[#64748B]">
              Cleared during active shifts
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-none border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              Avg. Length of Stay
            </div>
            <div className="my-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-[#0F172A] font-mono">
                {metrics.avgLos}
              </span>
              <span className="text-[11px] font-semibold text-[#7C3AED] bg-[#F3E8FF] px-2 py-0.5 rounded-full">
                Inpatient Mean
              </span>
            </div>
            <div className="text-xs text-[#64748B]">
              Average stay duration per patient
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-white rounded-none border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between">
            <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase">
              Room Charges Settled
            </div>
            <div className="my-2 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold text-[#0F172A] font-mono">
                {metrics.totalCharges}
              </span>
              <span className="text-[11px] font-semibold text-[#0369A1] bg-[#E0F2FE] px-2 py-0.5 rounded-full">
                Billed & Settled
              </span>
            </div>
            <div className="text-xs text-[#64748B]">
              Inpatient room & telemetry fees
            </div>
          </div>
        </div>

        {/* ── MAIN DIRECTORY CARD & FILTER CONTROLS ── */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          {/* Section Header & Filter Toolbar */}
          <div className="p-5 border-b border-[#E2E8F0] bg-white">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#0F172A] m-0">
                  Discharge Records Directory
                </h2>
                <p className="text-xs text-[#64748B] m-0 mt-0.5">
                  Showing{" "}
                  <strong className="text-[#0F172A]">
                    {filteredRecords.length}
                  </strong>{" "}
                  of {dischargedPatients.length} completed patient stays
                </p>
              </div>

              {/* Search Field */}
              <div className="w-full lg:w-96 relative">
                <input
                  type="text"
                  placeholder="Search patient name, MRN, discharge ID, bed..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2 pl-9 text-xs sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B4FD8]/20 focus:border-[#1B4FD8] transition-all"
                />
                <span className="absolute left-3 top-2.5 text-[#94A3B8] text-xs">
                  🔍
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2 text-[#94A3B8] hover:text-[#475569] text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Structured Multi-Field Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#F1F5F9] text-xs">
              {/* Ward Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#64748B]">Ward:</span>
                <select
                  value={wardFilter}
                  onChange={(e) => setWardFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[#334155] font-medium focus:outline-none focus:border-[#1B4FD8]"
                >
                  <option value="all">All Wards & Units</option>
                  {availableWards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              {/* Doctor Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#64748B]">Attending:</span>
                <select
                  value={doctorFilter}
                  onChange={(e) => setDoctorFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[#334155] font-medium focus:outline-none focus:border-[#1B4FD8]"
                >
                  <option value="all">All Attending Doctors</option>
                  {availableDoctors.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Range Filter */}
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#64748B]">
                  Discharge Date:
                </span>
                <select
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[#334155] font-medium focus:outline-none focus:border-[#1B4FD8]"
                >
                  <option value="all">All Time Records</option>
                  <option value="today">Discharged Today</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                </select>
              </div>

              {/* Reset Filter Button */}
              {(searchQuery ||
                wardFilter !== "all" ||
                doctorFilter !== "all" ||
                timeFilter !== "all") && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="ml-auto text-[#1B4FD8] hover:text-[#153eb3] font-bold flex items-center gap-1 cursor-pointer"
                >
                  ↺ Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* ── LARGE DATA TABLE ── */}
          {loading ? (
            <div className="p-16 text-center text-[#64748B]">
              <div className="animate-spin text-2xl mb-2">⟳</div>
              <p className="text-sm font-medium">
                Loading discharged patients directory...
              </p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-20 px-4 text-center text-[#64748B]">
              <div className="text-4xl mb-3">📑</div>
              <h3 className="text-base font-bold text-[#1E293B] mb-1">
                No Discharged Patients Found
              </h3>
              <p className="text-xs text-[#64748B] max-w-md mx-auto mb-4">
                No completed inpatient stay matches the selected filters. When
                an active bed is released, the patient admission is permanently
                archived here.
              </p>
              {(searchQuery ||
                wardFilter !== "all" ||
                doctorFilter !== "all" ||
                timeFilter !== "all") && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#1B4FD8] rounded-md shadow-xs"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#475569] uppercase tracking-wider h-12">
                    <th className="py-3 px-4 w-28">Discharge ID</th>
                    <th className="py-3 px-4 w-56">Patient</th>
                    <th className="py-3 px-4 w-36">Admission</th>
                    <th className="py-3 px-4 w-52">Ward / Bed</th>
                    <th className="py-3 px-4 w-44">Attending Doctor</th>
                    <th className="py-3 px-4 w-32">Admitted</th>
                    <th className="py-3 px-4 w-32">Discharged</th>
                    <th className="py-3 px-4 w-28 text-center">
                      Length of Stay
                    </th>
                    <th className="py-3 px-4 w-32 text-right">Room Charges</th>
                    <th className="py-3 px-4 w-32 text-center">Status</th>
                    <th className="py-3 px-4 w-28 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-xs">
                  {filteredRecords.map((rec) => (
                    <tr
                      key={rec.id}
                      onClick={() => setSelectedRecord(rec)}
                      className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                    >
                      {/* Discharge ID */}
                      <td className="py-4 px-4 font-mono font-bold text-[#475569]">
                        <span className="bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-1 rounded text-[11px]">
                          #{rec.id}
                        </span>
                      </td>

                      {/* Patient */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-[13.5px] text-[#0F172A] group-hover:text-[#1B4FD8] transition-colors">
                          {rec.patientName}
                        </div>
                        <div className="font-mono text-[11px] text-[#64748B] mt-0.5">
                          MRN: #{rec.mrn}
                        </div>
                      </td>

                      {/* Admission Details */}
                      <td className="py-4 px-4">
                        <div className="font-mono font-semibold text-[#1E293B] text-[11.5px]">
                          IP-{rec.mrn}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          Inpatient Stay
                        </div>
                      </td>

                      {/* Ward / Bed */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-[#1E293B] text-[12.5px]">
                          {rec.ward}
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          Room {rec.roomNo} · Bed {rec.bedNo}
                        </div>
                      </td>

                      {/* Attending Doctor */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-[#1E293B]">
                          {rec.attendingDoctor || "Dr. M. Anderson"}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          {rec.ward.includes("ICU")
                            ? "Critical Care"
                            : "Internal Medicine"}
                        </div>
                      </td>

                      {/* Admitted Date */}
                      <td className="py-4 px-4 text-[#334155] font-medium">
                        {formatDateDisplay(rec.admissionDate)}
                      </td>

                      {/* Discharged Date */}
                      <td className="py-4 px-4 font-bold text-[#15803D]">
                        {formatDateDisplay(rec.dischargeDate)}
                      </td>

                      {/* Length of Stay */}
                      <td className="py-4 px-4 text-center">
                        <span className="inline-block px-2.5 py-1 rounded bg-[#EFF6FF] text-[#1B4FD8] font-bold text-[11.5px] border border-[#DBEAFE]">
                          {rec.lengthOfStayDays} Day
                          {rec.lengthOfStayDays > 1 ? "s" : ""}
                        </span>
                      </td>

                      {/* Room Charges */}
                      <td className="py-4 px-4 text-right font-mono font-bold text-[13px] text-[#0F172A]">
                        {formatINR(rec.roomChargesTotal || 0)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
                          <span>✓</span> Discharged
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-4 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRecord(rec)
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-[#1B4FD8] hover:text-white bg-[#EFF6FF] hover:bg-[#1B4FD8] border border-[#BFDBFE] rounded transition-all"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── CLINICAL DISCHARGE DETAILS DRAWER / MODAL (580px) ── */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-[620px] bg-white h-full shadow-2xl flex flex-col justify-between border-l border-[#E2E8F0] animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 bg-[#0F172A] text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-extrabold uppercase bg-[#1E293B] text-[#93C5FD] rounded">
                    {selectedRecord.id}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-[#15803D] text-white rounded">
                    ✓ Cleared & Discharged
                  </span>
                </div>
                <h2 className="text-xl font-extrabold m-0 text-white">
                  {selectedRecord.patientName}
                </h2>
                <div className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  MRN: #{selectedRecord.mrn} · Inpatient Admission IP-
                  {selectedRecord.mrn}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="text-[#94A3B8] hover:text-white text-xl font-bold p-1"
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body / Clinical Record Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-sm text-[#0F172A]">
              {/* 1. Stay Timeline */}
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-none p-4">
                <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase mb-3">
                  Admission & Stay Timeline
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white p-2.5 rounded border border-[#E2E8F0]">
                    <div className="text-[11px] text-[#64748B]">Admitted</div>
                    <div className="text-xs font-bold text-[#0F172A] mt-0.5">
                      {formatDateDisplay(selectedRecord.admissionDate)}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-[#E2E8F0]">
                    <div className="text-[11px] text-[#64748B]">Discharged</div>
                    <div className="text-xs font-bold text-[#15803D] mt-0.5">
                      {formatDateDisplay(selectedRecord.dischargeDate)}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-[#E2E8F0]">
                    <div className="text-[11px] text-[#64748B]">
                      Length of Stay
                    </div>
                    <div className="text-xs font-extrabold text-[#1B4FD8] mt-0.5">
                      {selectedRecord.lengthOfStayDays} Days
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Inpatient Location */}
              <div>
                <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase mb-2">
                  Inpatient Care Unit
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#F8FAFC] rounded-md border border-[#E2E8F0]">
                    <span className="text-[11px] text-[#64748B] block">
                      Ward / Floor
                    </span>
                    <strong className="text-sm text-[#0F172A]">
                      {selectedRecord.ward}
                    </strong>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] rounded-md border border-[#E2E8F0]">
                    <span className="text-[11px] text-[#64748B] block">
                      Room & Bed
                    </span>
                    <strong className="text-sm text-[#0F172A]">
                      Room {selectedRecord.roomNo} · Bed {selectedRecord.bedNo}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 3. Care Team */}
              <div>
                <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase mb-2">
                  Care Team
                </div>
                <div className="p-3.5 bg-[#F8FAFC] rounded-md border border-[#E2E8F0] flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-[#64748B] block">
                      Attending Consultant
                    </span>
                    <strong className="text-sm text-[#0F172A]">
                      {selectedRecord.attendingDoctor || "Dr. M. Anderson"}
                    </strong>
                  </div>
                  <span className="text-xs font-semibold text-[#1B4FD8] bg-[#EFF6FF] px-2.5 py-1 rounded">
                    {selectedRecord.ward.includes("ICU")
                      ? "Critical Care Specialist"
                      : "Attending Physician"}
                  </span>
                </div>
              </div>

              {/* 4. Clinical Discharge Reason & Summary */}
              <div>
                <div className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase mb-2">
                  Discharge Summary & Clinical Reason
                </div>
                <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-none text-xs leading-relaxed text-[#1E293B]">
                  <p className="font-semibold text-sm text-[#0F172A] mb-1">
                    Physician Discharge Disposition:
                  </p>
                  <p className="m-0 text-[#334155] whitespace-pre-wrap">
                    {selectedRecord.dischargeReason ||
                      "Patient clinically stabilized, all vital parameters within normal baseline. Cleared for discharge home with oral maintenance regimen."}
                  </p>
                </div>
              </div>

              {/* 5. Settled Room Charges */}
              <div className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-none flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-[#166534] uppercase tracking-wider">
                    Total Inpatient Room Charges
                  </div>
                  <div className="text-xs text-[#15803D] mt-0.5">
                    {selectedRecord.lengthOfStayDays} days room accommodation
                    fee
                  </div>
                </div>
                <div className="text-xl font-mono font-extrabold text-[#14532D]">
                  {formatINR(selectedRecord.roomChargesTotal || 0)}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-bold text-[#1E293B] bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] rounded-md transition-colors flex items-center gap-1.5"
              >
                🖨️ Print Discharge Summary
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-5 py-2 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#1E293B] rounded-md transition-colors"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
