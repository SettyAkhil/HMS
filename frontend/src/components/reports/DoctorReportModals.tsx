import React, { useState, useMemo } from "react"
import {
  X,
  Printer,
  Download,
  FileText,
  Stethoscope,
  Building2,
  Calendar,
  Activity,
  HeartPulse,
  Clock,
  ShieldCheck,
  Search,
  Users,
  CheckCircle2,
  ExternalLink,
} from "lucide-react"
import {
  DoctorReportData,
  printDoctorReport,
  downloadDoctorReportPdf,
  resolveDoctorReportData,
} from "../../utils/generalReportsExporter"

/**
 * Official Doctor Clinical Productivity & Caseload Report - A4 PDF Form Preview Modal
 */
export function DoctorReportPdfModal({
  data,
  onClose,
}: {
  data: DoctorReportData | null
  onClose: () => void
}) {
  if (!data) return null

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-100 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden border border-slate-700 animate-in fade-in zoom-in duration-150">
        {/* PDF Viewer Top Bar */}
        <div className="px-6 py-3 bg-[#0F172A] text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 font-bold text-xs">
              PDF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">
                  Physician Performance &amp; Caseload Report
                </h3>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded text-[10px] font-mono">
                  {data.id}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Official Clinical Practice Audit • {data.doctor} •{" "}
                {data.department}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => printDoctorReport(data)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              title="Print this physician report"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={() => downloadDoctorReportPdf(data)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B4FD8] hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
              title="Download / Save as PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save / Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PDF Document Canvas (A4 Paper View) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/90 flex justify-center">
          <div className="bg-white text-slate-900 shadow-2xl rounded-sm max-w-[800px] w-full p-8 sm:p-12 border border-slate-300 font-sans text-xs flex flex-col justify-between min-h-[1050px]">
            {/* Form Header */}
            <div>
              <div className="flex justify-between items-start border-b-2 border-[#1E3A8A] pb-3 mb-4">
                <div>
                  <div className="text-xl font-black text-[#1E3A8A] tracking-tight uppercase">
                    IMPERIAL HOSPITALS
                  </div>
                  <div className="text-xs font-semibold text-slate-600 mt-0.5">
                    A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED • Physician
                    Productivity Report
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    # 27-14-13/A, Opp. Ganesh Canten Street, Beside Bhasyam
                    School, Bhimavaram-534202 • GST No - 37AALCM2238A1ZQ
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 font-bold text-[10px] rounded uppercase">
                    {data.dateRangeLabel}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Generated: {new Date().toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Doctor Profile Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3 mb-4 text-[11px]">
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">
                    Attending Physician
                  </div>
                  <div className="font-bold text-[#1E3A8A] text-sm mt-0.5">
                    {data.doctor}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">
                    Specialty / Dept
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {data.department}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">
                    Qualifications
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {data.qualification}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">
                    Staff ID &amp; Room
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {data.staffId || data.id} • {data.room || "Room 101"}
                  </div>
                </div>
              </div>

              {/* Workload Summary KPI Grid */}
              <div className="mb-4">
                <div className="text-[10px] font-bold text-[#1E3A8A] uppercase border-b border-slate-200 pb-1 mb-2">
                  Clinical Workload &amp; Consultation Summary
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white border border-slate-200 rounded p-2">
                    <div className="text-[9px] text-slate-500 font-bold uppercase">
                      OP Consultations
                    </div>
                    <div className="text-base font-black text-slate-900 mt-0.5">
                      {data.opVisits}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded p-2">
                    <div className="text-[9px] text-slate-500 font-bold uppercase">
                      ER Cases
                    </div>
                    <div className="text-base font-black text-slate-900 mt-0.5">
                      {data.erCases}
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded p-2">
                    <div className="text-[9px] text-slate-500 font-bold uppercase">
                      Inpatient (IP)
                    </div>
                    <div className="text-base font-black text-slate-900 mt-0.5">
                      {data.ipPatients}
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded p-2">
                    <div className="text-[9px] text-blue-800 font-bold uppercase">
                      Total Caseload
                    </div>
                    <div className="text-base font-black text-[#1E3A8A] mt-0.5">
                      {data.totalConsultations}
                    </div>
                  </div>
                </div>
              </div>

              {/* Itemized Patient Caseload Table */}
              <div className="mb-4">
                <div className="text-[10px] font-bold text-[#1E3A8A] uppercase border-b border-slate-200 pb-1 mb-2 flex justify-between items-center">
                  <span>Itemized Patient Consultations Log</span>
                  <span className="text-[9px] font-normal text-slate-500">
                    Showing {data.recentCases.length} recorded patient
                    encounters
                  </span>
                </div>

                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-left text-[10.5px]">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="py-1.5 px-2 text-center w-8">#</th>
                        <th className="py-1.5 px-2">Date</th>
                        <th className="py-1.5 px-2">Patient Name</th>
                        <th className="py-1.5 px-2">UMR / MRN</th>
                        <th className="py-1.5 px-2">Care Stream</th>
                        <th className="py-1.5 px-2">Diagnosis / Condition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.recentCases.length > 0 ? (
                        data.recentCases.map((c, i) => (
                          <tr
                            key={i}
                            className={
                              i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                            }
                          >
                            <td className="py-1.5 px-2 font-bold text-center text-slate-500">
                              {i + 1}
                            </td>
                            <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">
                              {c.date}
                            </td>
                            <td className="py-1.5 px-2 font-semibold text-slate-900">
                              {c.patientName}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[9.5px] text-slate-600">
                              {c.umr}
                            </td>
                            <td className="py-1.5 px-2">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  c.careStream.includes("Emergency")
                                    ? "bg-rose-100 text-rose-800"
                                    : c.careStream.includes("Inpatient")
                                      ? "bg-indigo-100 text-indigo-800"
                                      : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {c.careStream}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-slate-700">
                              {c.diagnosis}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-4 text-center text-slate-400 text-xs"
                          >
                            No consultation records logged for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Attestation & Signature Footer */}
            <div>
              <div className="flex justify-between items-end border-t border-dashed border-slate-300 pt-4 mt-6">
                <div>
                  <div className="text-[9px] text-slate-500">
                    Clinical Audit &amp; Governance Verification:
                  </div>
                  <div className="text-[10px] font-bold text-emerald-700">
                    ✓ Verified against Hospital Encounter Registry
                  </div>
                  <div className="text-[8.5px] text-slate-400 mt-0.5">
                    Report Period: {data.dateRangeLabel}
                  </div>
                </div>
                <div className="text-right min-w-[200px]">
                  <div className="border-t border-slate-800 pt-1 font-bold text-xs text-slate-900">
                    {data.doctor}
                  </div>
                  <div className="text-[9.5px] text-slate-600">
                    {data.department} Specialist
                  </div>
                  <div className="text-[8.5px] text-slate-400">
                    Staff ID: {data.staffId || data.id}
                  </div>
                </div>
              </div>

              <div className="text-center text-[8.5px] text-slate-400 border-t border-slate-100 pt-3 mt-4">
                CONFIDENTIAL CLINICAL RECORD • Imperial Hospitals HMS • Valid
                for Performance Audit
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Interactive Doctor Productivity & Caseload Report Modal
 */
export function DoctorReportModal({
  item,
  dateRangeLabel = "All Time",
  onClose,
  onOpenPdf,
}: {
  item: any | null
  dateRangeLabel?: string
  onClose: () => void
  onOpenPdf?: (data: DoctorReportData) => void
}) {
  const [activeTab, setActiveTab] = useState<"caseload" | "schedule">(
    "caseload",
  )
  const [searchQuery, setSearchQuery] = useState("")

  const data = useMemo(() => {
    if (!item) return null
    return resolveDoctorReportData(item, dateRangeLabel)
  }, [item, dateRangeLabel])

  const filteredCases = useMemo(() => {
    if (!data?.recentCases) return []
    if (!searchQuery.trim()) return data.recentCases
    const q = searchQuery.toLowerCase()
    return data.recentCases.filter(
      (c) =>
        c.patientName.toLowerCase().includes(q) ||
        c.umr.toLowerCase().includes(q) ||
        c.careStream.toLowerCase().includes(q) ||
        c.diagnosis.toLowerCase().includes(q),
    )
  }, [data, searchQuery])

  if (!data) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="px-6 py-3.5 bg-[#0F172A] text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 font-black text-sm">
              <Stethoscope className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">
                  {data.doctor}
                </h3>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded text-[10px] font-medium">
                  {data.department}
                </span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded text-[10px] font-medium">
                  {data.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Physician Productivity Report • Staff ID:{" "}
                {data.staffId || data.id} • {data.dateRangeLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-2 bg-slate-50 border-b border-slate-200 flex gap-4 shrink-0">
          <button
            onClick={() => setActiveTab("caseload")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "caseload"
                ? "border-[#1B4FD8] text-[#1B4FD8]"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>
              Caseload &amp; Consultations ({data.totalConsultations})
            </span>
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "schedule"
                ? "border-[#1B4FD8] text-[#1B4FD8]"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Department &amp; Practice Info</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === "caseload" ? (
            <>
              {/* Doctor Summary Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Specialist
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {data.doctor}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Department
                  </span>
                  <div className="font-bold text-blue-900 text-sm mt-0.5">
                    {data.department}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Qualifications
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {data.qualification}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Clinic Room
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {data.room || "Room 101"}
                  </div>
                </div>
              </div>

              {/* KPI Cards Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      Outpatient (OP)
                    </span>
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {data.opVisits}
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-0.5">
                    Encounter visits
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      Emergency (ER)
                    </span>
                    <HeartPulse className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {data.erCases}
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-0.5">
                    Urgent triage cases
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      Inpatient (IP)
                    </span>
                    <Building2 className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {data.ipPatients}
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-0.5">
                    Admissions &amp; Discharges
                  </div>
                </div>

                <div className="bg-blue-50/80 p-3.5 rounded-xl border border-blue-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-900 uppercase">
                      Total Volume
                    </span>
                    <Activity className="w-4 h-4 text-[#1B4FD8]" />
                  </div>
                  <div className="text-2xl font-black text-[#1B4FD8] mt-1">
                    {data.totalConsultations}
                  </div>
                  <div className="text-[10.5px] text-blue-700 mt-0.5">
                    Total clinical encounters
                  </div>
                </div>
              </div>

              {/* Itemized Encounters Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Patient Consultation History ({filteredCases.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Cross-department recorded encounters for this doctor
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter by patient, UMR, diagnosis..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Patient Name</th>
                        <th className="py-2 px-3">UMR / MRN</th>
                        <th className="py-2 px-3">Care Stream</th>
                        <th className="py-2 px-3">
                          Diagnosis / Chief Complaint
                        </th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCases.length > 0 ? (
                        filteredCases.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition">
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                              {c.date}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {c.patientName}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                              {c.umr}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  c.careStream.includes("Emergency")
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : c.careStream.includes("Inpatient")
                                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                      : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}
                              >
                                {c.careStream}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              {c.diagnosis}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {c.status || "Completed"}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-8 text-center text-slate-400 text-xs"
                          >
                            {searchQuery
                              ? "No matching patients found."
                              : "No consultation records logged for this doctor."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* Department & Practice Info Tab */
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-blue-950">
                    Department of {data.department}
                  </h4>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Clinical appointment schedule &amp; facility assignment
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-blue-200 rounded-lg text-xs font-semibold text-blue-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Credentialed Specialist</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Consulting Details
                  </span>
                  <div className="text-xs text-slate-700 space-y-1 pt-1">
                    <div>
                      <strong>Assigned Chamber:</strong>{" "}
                      {data.room || "Room 101, OPD Floor"}
                    </div>
                    <div>
                      <strong>Specialty Focus:</strong> {data.department}
                    </div>
                    <div>
                      <strong>Qualifications:</strong> {data.qualification}
                    </div>
                    <div>
                      <strong>Staff Registration:</strong>{" "}
                      {data.staffId || data.id}
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Clinical Governance Status
                  </span>
                  <div className="text-xs text-slate-700 space-y-1 pt-1">
                    <div>
                      <strong>Practice Status:</strong>{" "}
                      <span className="text-emerald-700 font-bold">
                        {data.status}
                      </span>
                    </div>
                    <div>
                      <strong>EHR Integration:</strong> Active with OP, ER &amp;
                      Inpatient wards
                    </div>
                    <div>
                      <strong>Audit Verification:</strong> Passed clinical peer
                      review
                    </div>
                    <div>
                      <strong>Last Activity:</strong>{" "}
                      {data.recentCases[0]?.date || "Today"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs transition cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => onOpenPdf?.(data)}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 border border-rose-200"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>View PDF Form</span>
          </button>
          <button
            onClick={() => printDoctorReport(data)}
            className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>
    </div>
  )
}
