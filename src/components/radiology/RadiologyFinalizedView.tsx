import React, { useState, useMemo, useEffect } from "react"
import {
  FileText,
  Search,
  Printer,
  Download,
  CheckCircle2,
  Calendar,
  History,
  Edit3,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Filter,
} from "lucide-react"
import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "../../services/radiologyWorkflowDb"
import { UniversalRadiologyDb } from "../../services/universalRadiologyDb"
import { RADIOLOGY_MODALITIES } from "../../services/radiologyTariffsData"
import { getCanonicalRadiologyModality } from "../../utils/testClassifier"
import RadiologyReportPdfModal from "./RadiologyReportPdfModal"

function formatTimestamp(dateStr?: string): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function RadiologyFinalizedView() {
  const [tick, setTick] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [modalityFilter, setModalityFilter] = useState("all")
  const [doctorFilter, setDoctorFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [pdfStudy, setPdfStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [amendStudy, setAmendStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [amendmentText, setAmendmentText] = useState("")
  const [amendedBy, setAmendedBy] = useState("Dr. Rajesh Sharma, MD")
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  useEffect(() => {
    const unsub = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])

  const allStudies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  // Predefined Standardized Sorting: Most recently finalized reports strictly first (descending).
  // Uses actual report finalization timestamp (finalizedAt / signedAt / history finalization event).
  // Amending a report preserves the original finalization timestamp and does not displace report position.
  // Stable secondary sort: Examination ID descending.
  const finalizedStudies = useMemo(() => {
    return allStudies
      .filter((s) => s.normalizedReportStatus === "Finalized")
      .sort((a, b) => {
        const timeA = RadiologyWorkflowDb.getReportFinalizedTimestamp(a)
        const timeB = RadiologyWorkflowDb.getReportFinalizedTimestamp(b)
        if (timeA !== timeB) {
          return timeB - timeA // Newest finalized first (descending)
        }
        return (b.id || "").localeCompare(a.id || "")
      })
  }, [allStudies])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  const doctorsList = useMemo(() => {
    const set = new Set<string>()
    finalizedStudies.forEach((s) => {
      const doc = s.finalizedBy || s.radiologist
      if (doc) set.add(doc)
    })
    return Array.from(set)
  }, [finalizedStudies])

  const filteredStudies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return finalizedStudies.filter((s) => {
      if (modalityFilter !== "all") {
        if (getCanonicalRadiologyModality(s) !== modalityFilter) return false
      }

      if (doctorFilter !== "all") {
        const doc = s.finalizedBy || s.radiologist || ""
        if (doc !== doctorFilter) return false
      }

      if (q) {
        const matches =
          (s.patient || "").toLowerCase().includes(q) ||
          (s.study || "").toLowerCase().includes(q) ||
          (s.umr || "").toLowerCase().includes(q) ||
          (s.id || "").toLowerCase().includes(q) ||
          (s.encounterId || "").toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [finalizedStudies, modalityFilter, doctorFilter, searchQuery])

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, modalityFilter, doctorFilter])

  const totalPages = Math.max(1, Math.ceil(filteredStudies.length / pageSize))
  const paginatedStudies = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredStudies.slice(start, start + pageSize)
  }, [filteredStudies, currentPage, pageSize])

  const handleSaveAmendment = () => {
    if (!amendStudy || !amendmentText.trim()) {
      showToast("Please enter the amendment text addendum.", "error")
      return
    }

    try {
      RadiologyWorkflowDb.amendFinalizedReport(
        {
          studyId: amendStudy.id,
          reason: "Clinical amendment addendum",
          content: amendmentText.trim(),
          amendedBy: amendedBy,
        },
        "Senior Radiologist"
      )

      UniversalRadiologyDb.logAudit({
        studyId: amendStudy.id,
        patientName: amendStudy.patient,
        action: "Report Amended",
        actor: amendedBy,
        role: "Senior Radiologist",
        details: `Authorized amendment addendum added to finalized report: ${amendmentText.slice(0, 60)}...`,
      })

      showToast(`✓ Clinical amendment addendum saved to record.`, "success")
      setAmendStudy(null)
      setAmendmentText("")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to save amendment", "error")
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3 rounded-md text-[13px] font-semibold border flex items-center justify-between shadow-md transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : toastMessage.type === "error"
              ? "bg-red-50 border-red-300 text-red-900"
              : "bg-blue-50 border-blue-300 text-blue-900"
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="cursor-pointer ml-3 font-bold">✕</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Finalized Diagnostic Reports Archive</span>
              <span className="text-[12px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full font-mono">
                {finalizedStudies.length} reports
              </span>
            </h3>
            <p className="text-[12px] text-[#64748B]">
              Searchable clinical record repository linked to the patient journey and encounter timelines
            </p>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient, UMR, report ID, exam..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[12.5px] text-[#0F172A] focus:outline-none focus:border-emerald-600"
            />
          </div>

          <select
            value={modalityFilter}
            onChange={(e) => setModalityFilter(e.target.value)}
            className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 rounded text-[12px] text-slate-700 font-semibold cursor-pointer focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Modalities</option>
            {RADIOLOGY_MODALITIES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 rounded text-[12px] text-slate-700 font-semibold cursor-pointer focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Radiologists</option>
            {doctorsList.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Finalized Reports Table ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] table-fixed text-left text-[12.5px] border-collapse">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[21%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[19%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#F8FAFC] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
                <th className="py-3 px-3.5 text-left">Patient Name & UMR</th>
                <th className="py-3 px-3.5 text-left">Examination & Modality</th>
                <th className="py-3 px-3 text-left">Encounter ID</th>
                <th className="py-3 px-3 text-left">Timestamps (Scan / Finalized)</th>
                <th className="py-3 px-3 text-left">Finalized By</th>
                <th className="py-3 px-1 text-center">Status</th>
                <th className="py-3 px-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {paginatedStudies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                      <span className="text-[13px] font-semibold text-slate-600">
                        No finalized radiology reports found
                      </span>
                      <span className="text-[11.5px] text-slate-400">
                        Try adjusting your search query, modality filter, or radiologist selection.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedStudies.map((study) => {
                  const scannedDate =
                    study.completedAt ||
                    study.scanCompletedAt ||
                    study.sentToReportingAt ||
                    study.orderedAt ||
                    study.ordered
                  const finalizedDate =
                    study.finalizedAt ||
                    study.signedAt ||
                    (study as any).updatedAt ||
                    (study as any).date

                  return (
                    <tr key={study.id} className="hover:bg-slate-50 transition-colors">
                      {/* 1. Patient Name & UMR (13%) */}
                      <td className="py-3 px-3.5 text-left align-middle">
                        <div
                          className="font-bold text-[#0F172A] truncate"
                          title={study.patient}
                        >
                          {study.patient}
                        </div>
                        <div
                          className="text-[11px] text-slate-500 font-mono truncate mt-0.5"
                          title={study.umr || study.mrn || "—"}
                        >
                          UMR: {study.umr || study.mrn || "—"}
                        </div>
                      </td>

                      {/* 2. Examination & Modality (21%) */}
                      <td className="py-3 px-3.5 text-left align-middle">
                        <div
                          className="font-semibold text-slate-900 truncate"
                          title={study.study}
                        >
                          {study.study}
                        </div>
                        <div
                          className="text-[11px] text-[#1B4FD8] font-semibold truncate mt-0.5"
                          title={getCanonicalRadiologyModality(study)}
                        >
                          {getCanonicalRadiologyModality(study)}
                        </div>
                      </td>

                      {/* 3. Encounter ID (12%) */}
                      <td className="py-3 px-3 text-left align-middle">
                        <div
                          className="font-mono text-[11.5px] font-medium text-slate-700 whitespace-nowrap truncate"
                          title={study.encounterId || "OP-1002"}
                        >
                          {study.encounterId || "OP-1002"}
                        </div>
                      </td>

                      {/* 4. Timestamps (Scan / Finalized) (16%) */}
                      <td className="py-3 px-3 text-left align-middle">
                        <div className="text-[11px] leading-snug space-y-1">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider inline-block w-[52px]">
                              Scanned:
                            </span>
                            <span
                              className="font-medium text-slate-700 truncate"
                              title={formatTimestamp(scannedDate)}
                            >
                              {formatTimestamp(scannedDate)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider inline-block w-[52px]">
                              Finalized:
                            </span>
                            <span
                              className="font-semibold text-emerald-700 truncate"
                              title={formatTimestamp(finalizedDate)}
                            >
                              {formatTimestamp(finalizedDate)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 5. Finalized By (19%) */}
                      <td className="py-3 px-3 text-left align-middle">
                        <div
                          className="font-semibold text-slate-800 truncate"
                          title={study.finalizedBy || study.radiologist || "Dr. Rajesh Sharma, MD"}
                        >
                          {study.finalizedBy || study.radiologist || "Dr. Rajesh Sharma, MD"}
                        </div>
                        <div
                          className="text-[10.5px] text-slate-400 font-mono truncate mt-0.5"
                          title={study.finalizedRole || "Senior Radiologist"}
                        >
                          {study.finalizedRole || "Senior Radiologist"}
                        </div>
                      </td>

                      {/* 6. Status (8%) */}
                      <td className="py-3 px-1 text-center align-middle">
                        <div className="flex items-center justify-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Finalized</span>
                          </span>
                        </div>
                      </td>

                      {/* 7. Actions (11%) */}
                      <td className="py-3 px-2 text-center align-middle">
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => setPdfStudy(study)}
                            className="h-7 px-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-2xs whitespace-nowrap transition-colors"
                            title="View & Print Official PDF"
                          >
                            <Printer className="w-3 h-3 shrink-0" />
                            <span>Print</span>
                          </button>

                          <button
                            onClick={() => setAmendStudy(study)}
                            className="h-7 px-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                            title="Add Clinical Amendment Addendum"
                          >
                            <Edit3 className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>Amend</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Table Pagination Bar ── */}
        <div className="py-2.5 px-4 border-t border-[#DDE2EC] bg-[#F8FAFC] flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-[#64748B]">
          <div>
            Showing{" "}
            <span className="font-semibold text-slate-800">
              {filteredStudies.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-slate-800">
              {Math.min(currentPage * pageSize, filteredStudies.length)}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-800">
              {filteredStudies.length}
            </span>{" "}
            finalized reports
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="w-7 h-7 rounded border border-[#DDE2EC] bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-7 h-7 rounded font-semibold text-[11.5px] flex items-center justify-center cursor-pointer transition-colors ${
                    currentPage === i + 1
                      ? "bg-[#1B4FD8] text-white"
                      : "bg-white border border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {i + 1}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="w-7 h-7 rounded border border-[#DDE2EC] bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Amendment Modal ── */}
      {amendStudy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Authorized Report Amendment</h3>
              <button onClick={() => setAmendStudy(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <div className="p-5 space-y-3.5 text-[12.5px]">
              <p className="text-slate-700">
                You are adding an amendment addendum to the finalized report for <strong>{amendStudy.patient}</strong> (Study: {amendStudy.study}). Historical report content will be preserved.
              </p>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Authorizing Radiologist</label>
                <input
                  type="text"
                  value={amendedBy}
                  onChange={(e) => setAmendedBy(e.target.value)}
                  className="w-full p-2 border rounded font-semibold text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Amendment Addendum Notes *</label>
                <textarea
                  required
                  rows={4}
                  value={amendmentText}
                  onChange={(e) => setAmendmentText(e.target.value)}
                  placeholder="State the additional or amended clinical findings/impression and rationale..."
                  className="w-full p-2.5 border rounded text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setAmendStudy(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAmendment}
                  className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded font-bold cursor-pointer"
                >
                  Save Amendment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PDF Preview Modal ── */}
      {pdfStudy && (
        <RadiologyReportPdfModal study={pdfStudy} onClose={() => setPdfStudy(null)} />
      )}
    </div>
  )
}
