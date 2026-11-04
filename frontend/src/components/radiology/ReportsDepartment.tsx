import React, { useState, useMemo, useEffect } from "react"
import {
  ExtendedRadiologyRecord,
  RadiologyWorkflowDb,
} from "../../services/radiologyWorkflowDb"
import RadiologyReportPdfModal from "./RadiologyReportPdfModal"
import {
  Search,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Printer,
  Edit3,
  Save,
  CheckSquare,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  X,
} from "lucide-react"

interface ReportsDepartmentProps {
  currentTechnician?: string
  currentRole?: string
  onNavigateToDashboard?: () => void
  initialSelectedStudyId?: string | null
}

export default function ReportsDepartment({
  currentTechnician = "Alex Rivera, RT(R)",
  currentRole = "Senior Radiology Technician",
  onNavigateToDashboard,
  initialSelectedStudyId,
}: ReportsDepartmentProps) {
  const [tick, setTick] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [reportTab, setReportTab] = useState<"awaiting" | "drafts" | "finalized" | "all">("awaiting")
  const [activeStudyId, setActiveStudyId] = useState<string | null>(initialSelectedStudyId || null)
  const [showPdfModal, setShowPdfModal] = useState<ExtendedRadiologyRecord | null>(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  // Report Form State (DO NOT AUTO-GENERATE FINDINGS - Start blank for technician entry)
  const [reportForm, setReportForm] = useState({
    indication: "",
    technique: "",
    findingsText: "",
    impressionText: "",
    comparison: "",
    reportingSpecialist: currentTechnician,
    specialistRole: currentRole,
    staffId: "TECH-RAD-401",
  })

  // Load studies from cached service
  const allStudies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  // Filter completed investigations (status: DONE) using fast precomputed property
  const completedStudies = useMemo(() => {
    return allStudies.filter((s) => s.normalizedStatus === "DONE")
  }, [allStudies])

  // Subscribe to changes
  useEffect(() => {
    const unsub = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])

  // If initial study ID provided, open it
  useEffect(() => {
    if (initialSelectedStudyId) {
      setActiveStudyId(initialSelectedStudyId)
    }
  }, [initialSelectedStudyId])

  // Currently active study in editor
  const activeStudy = useMemo(() => {
    if (!activeStudyId) return null
    return allStudies.find((s) => s.id === activeStudyId) || null
  }, [allStudies, activeStudyId])

  // Populate editor form when activeStudy changes
  useEffect(() => {
    if (activeStudy) {
      setReportForm({
        indication: activeStudy.indication || "Diagnostic investigation ordered by physician",
        technique: activeStudy.technique || `Diagnostic ${activeStudy.modality} imaging scan`,
        findingsText: activeStudy.findings && activeStudy.findings.length > 0 ? activeStudy.findings.join("\n") : "",
        impressionText: activeStudy.impression && activeStudy.impression.length > 0 ? activeStudy.impression.join("\n") : "",
        comparison: activeStudy.comparison || "",
        reportingSpecialist: activeStudy.radiologist || activeStudy.finalizedBy || currentTechnician,
        specialistRole: activeStudy.finalizedRole || currentRole,
        staffId: "TECH-RAD-401",
      })
    }
  }, [activeStudyId, tick])

  // Single-pass O(N) calculation for KPI counters
  const kpis = useMemo(() => {
    let awaiting = 0
    let drafts = 0
    let finalized = 0
    const total = completedStudies.length

    for (let i = 0; i < total; i++) {
      const s = completedStudies[i]
      if (s.normalizedReportStatus === "Awaiting Report") awaiting++
      else if (s.normalizedReportStatus === "Draft") drafts++
      else if (s.normalizedReportStatus === "Finalized") finalized++
    }

    return { awaiting, drafts, finalized, total }
  }, [completedStudies])

  // Filter studies by sub-tab and search (instant O(1) checks)
  const filteredStudies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const filterBySearch = q.length > 0

    return completedStudies.filter((study) => {
      if (reportTab === "awaiting" && study.normalizedReportStatus !== "Awaiting Report") return false
      if (reportTab === "drafts" && study.normalizedReportStatus !== "Draft") return false
      if (reportTab === "finalized" && study.normalizedReportStatus !== "Finalized") return false

      if (filterBySearch) {
        const matchPatient = study.patient.toLowerCase().includes(q)
        const matchUmr = (study.umr || "").toLowerCase().includes(q)
        const matchOp = (study.opNumber || "").toLowerCase().includes(q)
        const matchStudy = study.study.toLowerCase().includes(q)
        const matchDoctor = study.provider.toLowerCase().includes(q)
        const matchId = study.id.toLowerCase().includes(q)
        if (!matchPatient && !matchUmr && !matchOp && !matchStudy && !matchDoctor && !matchId) {
          return false
        }
      }

      return true
    })
  }, [completedStudies, reportTab, searchQuery])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Authorization check
  const isAuthorizedToFinalize = useMemo(() => {
    const role = (reportForm.specialistRole || currentRole).toLowerCase()
    return (
      role.includes("radiologist") ||
      role.includes("technician") ||
      role.includes("specialist") ||
      role.includes("doctor") ||
      role.includes("admin")
    )
  }, [reportForm.specialistRole, currentRole])

  // Save report (Draft or Final)
  const handleSaveReport = (isFinal: boolean) => {
    if (!activeStudy) return

    if (isFinal) {
      if (!reportForm.findingsText.trim()) {
        showToast("Please enter actual clinical findings before finalizing the report.", "error")
        return
      }
      if (!reportForm.impressionText.trim()) {
        showToast("Please enter the definitive clinical impression/conclusion.", "error")
        return
      }
      if (!isAuthorizedToFinalize) {
        showToast("Only authorized radiology specialists can finalize clinical reports.", "error")
        return
      }
    }

    try {
      const findings = reportForm.findingsText
        .split("\n")
        .map((l) => l.trim().replace(/^•\s*/, ""))
        .filter(Boolean)
      const impression = reportForm.impressionText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)

      RadiologyWorkflowDb.saveReport({
        studyId: activeStudy.id,
        isFinal,
        specialistName: reportForm.reportingSpecialist || currentTechnician,
        specialistRole: reportForm.specialistRole || currentRole,
        staffId: reportForm.staffId,
        findings,
        impression,
        indication: reportForm.indication,
        technique: reportForm.technique,
        comparison: reportForm.comparison,
      })

      showToast(
        isFinal
          ? `✓ Official radiology report finalized, clinically verified, and signed by ${reportForm.reportingSpecialist}`
          : "✓ Draft report saved successfully.",
        "success",
      )

      if (isFinal) {
        const updatedStudy = RadiologyWorkflowDb.getStudies().find((s) => s.id === activeStudy.id)
        if (updatedStudy) {
          setShowPdfModal(updatedStudy)
        }
      }
    } catch (err: any) {
      showToast(err.message || "Failed to save report", "error")
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-2 ${
            toastMessage.type === "success"
              ? "bg-emerald-950 text-emerald-100 border-emerald-700"
              : toastMessage.type === "error"
                ? "bg-rose-950 text-rose-100 border-rose-700"
                : "bg-slate-900 text-white border-slate-700"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : (
            <AlertTriangle size={16} className="text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Banner & KPI Summary */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                Reports Department
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Radiology Reporting & Clinical Sign-off
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Completed investigations awaiting clinical reports • Genuine technician findings entry • Formatted PDF printing & export
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToDashboard && (
              <button
                type="button"
                onClick={onNavigateToDashboard}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Return to Dashboard</span>
              </button>
            )}
          </div>
        </div>

        {/* KPI Counter Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setReportTab("awaiting")
              setActiveStudyId(null)
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              reportTab === "awaiting"
                ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/50"
                : "bg-white hover:bg-slate-50 border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-700 uppercase">Awaiting Report</span>
              <Clock size={15} className="text-amber-600" />
            </div>
            <div className="text-xl font-extrabold text-amber-950 mt-1">{kpis.awaiting}</div>
            <div className="text-[10px] text-amber-600">Scan DONE, report pending</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportTab("drafts")
              setActiveStudyId(null)
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              reportTab === "drafts"
                ? "bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/50"
                : "bg-white hover:bg-slate-50 border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-700 uppercase">Drafts in Progress</span>
              <Edit3 size={15} className="text-blue-600" />
            </div>
            <div className="text-xl font-extrabold text-blue-950 mt-1">{kpis.drafts}</div>
            <div className="text-[10px] text-blue-600">Findings being entered</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportTab("finalized")
              setActiveStudyId(null)
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              reportTab === "finalized"
                ? "bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/50"
                : "bg-white hover:bg-slate-50 border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase">Finalized & Signed</span>
              <CheckCircle2 size={15} className="text-emerald-600" />
            </div>
            <div className="text-xl font-extrabold text-emerald-950 mt-1">{kpis.finalized}</div>
            <div className="text-[10px] text-emerald-600">Ready for PDF / Print</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportTab("all")
              setActiveStudyId(null)
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              reportTab === "all"
                ? "bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-400/50"
                : "bg-white hover:bg-slate-50 border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 uppercase">Total Completed</span>
              <FileText size={15} className="text-slate-600" />
            </div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">{kpis.total}</div>
            <div className="text-[10px] text-slate-500">All tests marked DONE</div>
          </button>
        </div>
      </div>

      {/* Main Two-Pane Layout: Left = Worklist, Right = Active Report Form */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Investigations Awaiting / Completed Reports */}
        <div
          className={`${
            activeStudy ? "hidden md:flex md:w-96" : "w-full"
          } flex-col bg-white border-r border-slate-200 flex-shrink-0 transition-all`}
        >
          {/* Search Bar */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search completed investigations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Investigations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredStudies.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <FileText size={28} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs font-semibold">No investigations in this queue.</p>
                <p className="text-[11px] mt-0.5">When staff mark investigations DONE, they appear here.</p>
              </div>
            ) : (
              filteredStudies.map((study) => {
                const isSelected = activeStudy?.id === study.id
                const repStatus = study.normalizedReportStatus

                return (
                  <button
                    key={study.id}
                    type="button"
                    onClick={() => setActiveStudyId(study.id)}
                    className={`w-full p-3.5 text-left transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "bg-indigo-50/90 border-l-4 border-indigo-600"
                        : "hover:bg-slate-50 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="space-y-1 overflow-hidden pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {study.patient}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                          {study.modality}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 font-medium truncate">
                        {study.study}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 font-mono">
                        <span>UMR: {study.umr || study.mrn}</span>
                        <span>•</span>
                        <span>OP: {study.opNumber || "OP-1002"}</span>
                      </div>
                      <div className="text-[10.5px] text-slate-400 flex items-center gap-2">
                        <span>Ordered by: {study.provider}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          repStatus === "Finalized"
                            ? "bg-emerald-100 text-emerald-800"
                            : repStatus === "Draft"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {repStatus}
                      </span>
                      <ChevronRight size={14} className="text-slate-400" />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right Pane: Report Workspace */}
        {activeStudy ? (
          <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            {/* Workspace Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveStudyId(null)}
                  className="md:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {activeStudy.patient}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      UMR: {activeStudy.umr || `PAT-${activeStudy.mrn}`}
                    </span>
                    <span className="text-xs text-slate-500">
                      OP: {activeStudy.opNumber || "OP-1002"}
                    </span>
                  </div>
                  <div className="text-xs text-indigo-700 font-semibold mt-0.5">
                    {activeStudy.study} ({activeStudy.modality}) • Room: {activeStudy.room || "Suite 1"}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(true)}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="View Audit Trail"
                >
                  <History size={14} />
                  <span className="hidden sm:inline">Report History</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPdfModal(activeStudy)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Preview / Print PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveReport(false)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Save size={14} />
                  <span>Save Draft</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveReport(true)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <CheckSquare size={14} />
                  <span>Finalize & Sign</span>
                </button>
              </div>
            </div>

            {/* Editable Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Patient Banner Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px] block">Ordering Doctor:</span>
                    <strong className="text-slate-800">{activeStudy.provider}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Order Date:</span>
                    <strong className="text-slate-800">{activeStudy.orderDate || activeStudy.ordered}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Billing Payment:</span>
                    <span
                      className={`inline-block font-bold px-1.5 py-0.2 rounded text-[10.5px] ${
                        activeStudy.isPaid
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {activeStudy.isPaid ? "PAID" : "PENDING"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Report Status:</span>
                    <strong className="text-indigo-700 font-bold uppercase">
                      {activeStudy.normalizedReportStatus}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Authorization Info Strip */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-950">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-indigo-600" />
                  <span>
                    Reporting Specialist: <strong>{reportForm.reportingSpecialist}</strong> ({reportForm.specialistRole})
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-indigo-200/60 text-indigo-800 font-semibold text-[10.5px]">
                  Authorized Reporting Personnel
                </span>
              </div>

              {/* Clinical Indication & Technique */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                    Clinical Indication & History:
                  </label>
                  <input
                    type="text"
                    value={reportForm.indication}
                    onChange={(e) => setReportForm({ ...reportForm, indication: e.target.value })}
                    className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter clinical indication..."
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                    Imaging Technique & Protocol:
                  </label>
                  <input
                    type="text"
                    value={reportForm.technique}
                    onChange={(e) => setReportForm({ ...reportForm, technique: e.target.value })}
                    className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter imaging technique (e.g. Multiplanar high-resolution digital radiographs)..."
                  />
                </div>
              </div>

              {/* Actual Findings (Technician Input - NOT Auto-Generated) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Edit3 size={14} className="text-indigo-600" /> Actual Clinical Findings <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 italic">
                    Enter one finding per line (do not use generic placeholders)
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={reportForm.findingsText}
                  onChange={(e) => setReportForm({ ...reportForm, findingsText: e.target.value })}
                  placeholder={`Enter genuine observations, e.g.:\nLungs: Clear bilaterally, no focal consolidation, pneumothorax or pleural effusion.\nCardiac Silhouette: Normal size (CTR < 0.50). Normal mediastinal vascular contours.\nBones & Soft Tissues: Thoracic cage intact without acute osseous trauma.`}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              {/* Impression & Conclusion (Technician Input) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare size={14} className="text-indigo-600" /> Clinical Impression & Conclusion <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 italic">
                    Definitive radiological conclusions and recommendations
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={reportForm.impressionText}
                  onChange={(e) => setReportForm({ ...reportForm, impressionText: e.target.value })}
                  placeholder={`Enter conclusion, e.g.:\n1. No acute cardiopulmonary abnormality.\n2. Lungs are clear.`}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              {/* Specialist Sign-off Block */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Specialist Attestation & Digital Signature
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Radiologist / Sign-off:</label>
                    <input
                      type="text"
                      value={reportForm.reportingSpecialist}
                      onChange={(e) => setReportForm({ ...reportForm, reportingSpecialist: e.target.value })}
                      className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Clinical Role:</label>
                    <input
                      type="text"
                      value={reportForm.specialistRole}
                      onChange={(e) => setReportForm({ ...reportForm, specialistRole: e.target.value })}
                      className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Staff / Reg ID:</label>
                    <input
                      type="text"
                      value={reportForm.staffId}
                      onChange={(e) => setReportForm({ ...reportForm, staffId: e.target.value })}
                      className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex items-center justify-center p-8 bg-slate-50 text-center">
            <div className="max-w-md space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                <FileText size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Select a Completed Investigation
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Choose any completed investigation from the worklist on the left to prepare, review, or finalize the clinical radiology report.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* PDF Modal */}
      {showPdfModal && (
        <RadiologyReportPdfModal
          study={showPdfModal}
          onClose={() => setShowPdfModal(null)}
        />
      )}

      {/* Report History Modal */}
      {showHistoryModal && activeStudy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History size={18} className="text-indigo-400" />
                <h3 className="text-sm font-bold">Investigation Audit Trail & Report History</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50">
              <div className="border-l-2 border-indigo-500 pl-4 space-y-4">
                {(activeStudy.history || []).map((h, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                    <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span>{h.action}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      By: <strong>{h.actor}</strong> {h.role ? `(${h.role})` : ""}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 bg-white p-2 rounded border border-slate-200">
                      {h.details}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 bg-white border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
