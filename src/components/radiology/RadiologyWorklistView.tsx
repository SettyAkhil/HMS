import React, { useState, useMemo, useEffect } from "react"
import {
  Search,
  Filter,
  RefreshCw,
  PlusCircle,
  Play,
  CheckCircle2,
  FileText,
  Clock,
  Printer,
  ChevronRight,
  ChevronLeft,
  X,
  AlertTriangle,
  ArrowUpDown,
  Download,
  Calendar,
  Layers,
  User,
  ShieldCheck,
  Check,
} from "lucide-react"
import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "../../services/radiologyWorkflowDb"
import { BillingDatabase, RadiologyStudyRecord } from "../../services/billingDb"
import { UniversalRadiologyDb } from "../../services/universalRadiologyDb"
import { RADIOLOGY_MODALITIES } from "../../services/radiologyTariffsData"
import { getCanonicalRadiologyModality } from "../../utils/testClassifier"
import { RadiologyTemplateDatabase } from "../../services/radiologyTemplateDb"
import PatientDetailsModal from "./PatientDetailsModal"
import RadiologyReportPdfModal from "./RadiologyReportPdfModal"

export type DisplayReportingStatus =
  | "Awaiting Scan"
  | "Awaiting Report"
  | "Draft Saved"
  | "Under Review"
  | "Correction Required"
  | "Finalized"

export interface ReportingStatusBadgeInfo {
  status: DisplayReportingStatus
  label: DisplayReportingStatus
  badgeClass: string
  dotClass: string
}

export function resolveReportingStatus(study: ExtendedRadiologyRecord): ReportingStatusBadgeInfo {
  const overrideKey = `hospai_rad_rep_status_${study.id}`
  const override = typeof window !== "undefined" ? localStorage.getItem(overrideKey) : null
  const normRep = (override || study.normalizedReportStatus || study.reportStatus || "").toString().trim()

  if (normRep === "Finalized" || normRep === "Final" || (study.status as string) === "Finalized") {
    return {
      status: "Finalized",
      label: "Finalized",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
      dotClass: "bg-emerald-600",
    }
  }

  if (
    normRep === "Needs Correction" ||
    normRep === "Correction" ||
    normRep === "Correction Required" ||
    study.workflowStatus === "CORRECTION_REQUIRED" ||
    Boolean(study.returnedForCorrectionAt) ||
    Boolean(study.correctionNotes)
  ) {
    return {
      status: "Correction Required",
      label: "Correction Required",
      badgeClass: "bg-amber-50 text-amber-900 border-amber-300",
      dotClass: "bg-amber-600",
    }
  }

  if (
    normRep === "Submitted for Review" ||
    normRep === "Submitted" ||
    normRep === "Under Review" ||
    study.workflowStatus === "SUBMITTED_FOR_REVIEW"
  ) {
    return {
      status: "Under Review",
      label: "Under Review",
      badgeClass: "bg-blue-50 text-blue-800 border-blue-300",
      dotClass: "bg-blue-600",
    }
  }

  if (normRep === "Draft" || normRep === "Draft Saved") {
    return {
      status: "Draft Saved",
      label: "Draft Saved",
      badgeClass: "bg-purple-50 text-purple-800 border-purple-300",
      dotClass: "bg-purple-600",
    }
  }

  // Also check if a report draft/final exists in RadiologyTemplateDatabase
  try {
    const savedRep = RadiologyTemplateDatabase.getReportByStudyId(study.id)
    if (savedRep) {
      if (savedRep.status === "Final") {
        return {
          status: "Finalized",
          label: "Finalized",
          badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
          dotClass: "bg-emerald-600",
        }
      }
      if (savedRep.status === "Submitted") {
        return {
          status: "Under Review",
          label: "Under Review",
          badgeClass: "bg-blue-50 text-blue-800 border-blue-300",
          dotClass: "bg-blue-600",
        }
      }
      if (savedRep.status === "Needs Correction") {
        return {
          status: "Correction Required",
          label: "Correction Required",
          badgeClass: "bg-rose-50 text-rose-800 border-rose-300",
          dotClass: "bg-rose-600",
        }
      }
      if (savedRep.status === "Draft") {
        return {
          status: "Draft Saved",
          label: "Draft Saved",
          badgeClass: "bg-purple-50 text-purple-800 border-purple-300",
          dotClass: "bg-purple-600",
        }
      }
    }
  } catch { }

  const isScanComplete =
    study.sentToReporting ||
    study.status === "Sent for Reporting" ||
    (study as any).workflowStatus === "SENT_TO_REPORTING" ||
    study.normalizedStatus === "DONE" ||
    study.status === "Images Ready" ||
    study.scanningStage === 3 ||
    (study.id && typeof window !== "undefined" && localStorage.getItem(`hospai_rad_sent_${study.id}`) === "true")

  if (!isScanComplete && normRep === "Awaiting Scan") {
    return {
      status: "Awaiting Scan",
      label: "Awaiting Scan",
      badgeClass: "bg-slate-50 text-slate-700 border-slate-300",
      dotClass: "bg-slate-400",
    }
  }

  return {
    status: "Awaiting Report",
    label: "Awaiting Report",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300",
    dotClass: "bg-amber-500",
  }
}

function getStudyTimestamp(study: Partial<ExtendedRadiologyRecord>): number {
  return RadiologyWorkflowDb.getOrderCreationTimestamp(study)
}

interface RadiologyWorklistViewProps {
  onNavigateToScanning: (studyId: string) => void
  onNavigateToReporting: (studyId: string) => void
  onOpenOrderModal: () => void
  initialModalityFilter?: string
  initialStatusFilter?: string
}

function resolveValidModality(mod?: string | null): string {
  if (!mod || mod === "all") return "all"
  const trimmed = mod.trim()
  if ((RADIOLOGY_MODALITIES as readonly string[]).includes(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  if (lower === "xr" || lower === "xray" || lower === "x-ray") return "X-Ray"
  if (lower === "ct" || lower === "ct scan") return "CT Scan"
  if (lower === "mr" || lower === "mri") return "MRI"
  if (lower === "us" || lower === "usg" || lower === "ultrasound" || lower === "ultrasound (usg)") return "Ultrasound (USG)"
  if (lower === "mammo" || lower === "mammography") return "Mammography"
  if (lower === "dop" || lower === "doppler") return "Doppler"
  if (lower === "nm" || lower === "nuclear medicine") return "Nuclear Medicine"
  if (lower === "fl" || lower === "fluoroscopy" || lower === "fluoroscopy / special procedures") return "Fluoroscopy / Special Procedures"
  return "all"
}

export default function RadiologyWorklistView({
  onNavigateToScanning,
  onNavigateToReporting,
  onOpenOrderModal,
  initialModalityFilter = "all",
  initialStatusFilter = "all",
}: RadiologyWorklistViewProps) {
  const [tick, setTick] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [modalityFilter, setModalityFilter] = useState<string>(() => resolveValidModality(initialModalityFilter))
  const [priorityFilter, setPriorityFilter] = useState<string>("all")

  useEffect(() => {
    setModalityFilter(resolveValidModality(initialModalityFilter))
    setCurrentPage(1)
  }, [initialModalityFilter])

  useEffect(() => {
    if (initialStatusFilter === "verify" || initialStatusFilter === "unverified") {
      setOrderStatusFilter("unverified")
      setCurrentPage(1)
    } else if (initialStatusFilter === "ready" || initialStatusFilter === "in_progress") {
      setExamStatusFilter(initialStatusFilter)
      setCurrentPage(1)
    } else if (initialStatusFilter === "awaiting" || initialStatusFilter === "drafts") {
      setReportStatusFilter(initialStatusFilter)
      setCurrentPage(1)
    }
  }, [initialStatusFilter])

  // 4 Independent Status Filters
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>(
    initialStatusFilter === "verify" || initialStatusFilter === "unverified" ? "unverified" : "all"
  )
  const [billingStatusFilter, setBillingStatusFilter] = useState<string>("all")
  const [examStatusFilter, setExamStatusFilter] = useState<string>(
    initialStatusFilter === "ready" ? "ready" : initialStatusFilter === "in_progress" ? "in_progress" : "all"
  )
  const [reportStatusFilter, setReportStatusFilter] = useState<string>(
    initialStatusFilter === "awaiting" ? "awaiting" : initialStatusFilter === "drafts" ? "drafts" : "all"
  )

  // Drawer / Modal states
  const [selectedDrawerStudy, setSelectedDrawerStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [patientModalStudy, setPatientModalStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [pdfStudy, setPdfStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  // Mark Done modal state
  const [markDoneStudy, setMarkDoneStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [completionNotes, setCompletionNotes] = useState("Standard diagnostic protocol completed.")

  // Incomplete exam modal state
  const [incompleteStudy, setIncompleteStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [incompleteReason, setIncompleteReason] = useState("Patient unable to tolerate scan")

  // Authorized Exception modal state
  const [authExceptionStudy, setAuthExceptionStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [authUserName, setAuthUserName] = useState("Dr. Supervisor, MD")
  const [authUserRole, setAuthUserRole] = useState("Clinical Supervisor")
  const [authReason, setAuthReason] = useState("Emergency clinical urgency / supervisor authorization")
  const [authRef, setAuthRef] = useState("AUTH-RAD-" + Math.floor(1000 + Math.random() * 9000))

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [sortField, setSortField] = useState<"ordered" | "patient" | "priority" | "modality">("ordered")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    const unsub = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])

  const allStudies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Filter Studies across all 4 lifecycle dimensions
  const filteredStudies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return allStudies.filter((study) => {
      // 1. Search Query
      if (q) {
        const matches =
          (study.patient || "").toLowerCase().includes(q) ||
          (study.mrn || "").toLowerCase().includes(q) ||
          (study.umr || "").toLowerCase().includes(q) ||
          (study.id || "").toLowerCase().includes(q) ||
          (study.study || "").toLowerCase().includes(q) ||
          (study.accessionNo || "").toLowerCase().includes(q) ||
          (study.provider || "").toLowerCase().includes(q)
        if (!matches) return false
      }

      // 2. Modality Filter
      if (modalityFilter !== "all") {
        if (getCanonicalRadiologyModality(study) !== modalityFilter) return false
      }

      // 3. Priority Filter
      if (priorityFilter !== "all") {
        if (study.priority !== priorityFilter) return false
      }

      // 4. Order Status Filter
      if (orderStatusFilter === "verified" && !study.nurseVerified) return false
      if (orderStatusFilter === "unverified" && study.nurseVerified) return false

      // 5. Billing Status Filter
      if (billingStatusFilter === "paid" && !study.isPaid && study.billingStatus !== "Authorized Exception") return false
      if (billingStatusFilter === "pending" && study.isPaid) return false
      if (billingStatusFilter === "exception" && study.billingStatus !== "Authorized Exception") return false

      // 6. Examination Status Filter
      if (examStatusFilter === "ready") {
        if (study.normalizedStatus !== "ORDERED" || (!study.isPaid && study.billingStatus !== "Authorized Exception")) return false
      } else if (examStatusFilter === "in_progress") {
        if (study.normalizedStatus !== "IN PROGRESS") return false
      } else if (examStatusFilter === "done") {
        if (study.normalizedStatus !== "DONE") return false
      }

      // 7. Report Status Filter
      if (reportStatusFilter !== "all") {
        const rep = resolveReportingStatus(study).status
        if (reportStatusFilter === "awaiting_scan" && rep !== "Awaiting Scan") return false
        if (reportStatusFilter === "awaiting" && rep !== "Awaiting Report") return false
        if (reportStatusFilter === "drafts" && rep !== "Draft Saved") return false
        if (reportStatusFilter === "review" && rep !== "Under Review") return false
        if (reportStatusFilter === "correction" && rep !== "Correction Required") return false
        if (reportStatusFilter === "finalized" && rep !== "Finalized") return false
      }

      return true
    })
  }, [
    allStudies,
    searchQuery,
    modalityFilter,
    priorityFilter,
    orderStatusFilter,
    billingStatusFilter,
    examStatusFilter,
    reportStatusFilter,
  ])

  // Predefined Standardized Sorting: Newest examination orders strictly first (descending).
  // Uses actual examination order creation / received timestamps (orderedAt / createdAt / history[0].timestamp).
  // Includes all radiology examination orders (Paid, Unpaid, and Exceptions).
  // Newly created examinations immediately appear at the top and survive browser refreshes.
  // Stable secondary tie-breaker: Examination ID descending.
  const sortedStudies = useMemo(() => {
    if (orderStatusFilter === "unverified") {
      return RadiologyWorkflowDb.sortNurseVerificationQueue(filteredStudies)
    }
    return RadiologyWorkflowDb.sortWorklistOrders(filteredStudies)
  }, [filteredStudies, orderStatusFilter])

  const paginatedStudies = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedStudies.slice(start, start + pageSize)
  }, [sortedStudies, currentPage, pageSize])

  const totalPages = Math.ceil(sortedStudies.length / pageSize) || 1

  // Operational Transitions
  const handleOpenScanning = (study: ExtendedRadiologyRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    // Policy Check: If clearance is required and study is neither paid nor authorized exception, open exception modal
    if (
      RadiologyWorkflowDb.isBillingClearanceRequired(study) &&
      !study.isPaid &&
      study.billingStatus !== "Authorized Exception"
    ) {
      setAuthExceptionStudy(study)
      setAuthRef("AUTH-RAD-" + Math.floor(1000 + Math.random() * 9000))
      return
    }

    // Opening an examination does not mark it as scanned, it opens Scanning Operations
    onNavigateToScanning(study.id)
  }

  const handleConfirmAuthorizeException = () => {
    if (!authExceptionStudy) return
    if (!authUserName.trim() || !authReason.trim() || !authRef.trim()) {
      showToast("All authorization fields are required.", "error")
      return
    }
    try {
      RadiologyWorkflowDb.recordAuthorizedException({
        studyId: authExceptionStudy.id,
        user: authUserName,
        role: authUserRole,
        reason: authReason,
        authorizationRef: authRef,
      })
      showToast(`✓ Authorized exception recorded for "${authExceptionStudy.patient}". Scanning clearance granted.`, "success")
      const authorizedId = authExceptionStudy.id
      setAuthExceptionStudy(null)
      setTick((t) => t + 1)
      onNavigateToScanning(authorizedId)
    } catch (err: any) {
      showToast(err.message || "Failed to record authorized exception", "error")
    }
  }

  const handleConfirmDone = () => {
    if (!markDoneStudy) return
    try {
      RadiologyWorkflowDb.markStudyDone(
        markDoneStudy.id,
        completionNotes,
        "Technician",
        "Senior Radiologic Technologist"
      )
      UniversalRadiologyDb.logAudit({
        studyId: markDoneStudy.id,
        patientName: markDoneStudy.patient,
        action: "Examination Completed",
        actor: "Technician",
        role: "Senior Radiologic Technologist",
        details: `Scanning completed. Moved to diagnostic reporting queue.`
      })
      showToast(`✓ Marked "${markDoneStudy.study}" as DONE! Awaiting report.`, "success")
      setMarkDoneStudy(null)
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to complete study", "error")
    }
  }

  const handleConfirmIncomplete = () => {
    if (!incompleteStudy) return
    try {
      RadiologyWorkflowDb.updateStudyStatus(incompleteStudy.id, "ORDERED", "Technician")
      UniversalRadiologyDb.createException({
        category: "Incomplete Examination",
        severity: "High",
        studyId: incompleteStudy.id,
        patientName: incompleteStudy.patient,
        umr: incompleteStudy.umr,
        description: `Examination interrupted/incomplete: ${incompleteReason}`,
        assignedOwner: "Radiology In-Charge / Supervisor"
      })
      showToast(`Recorded incomplete examination. Logged exception for supervisor review.`, "error")
      setIncompleteStudy(null)
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to record incomplete study", "error")
    }
  }

  const handleVerifyOrder = (study: ExtendedRadiologyRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      RadiologyWorkflowDb.verifyNurseInvestigation(study.id, "Nurse In-Charge")
      showToast(`✓ Order verified for ${study.patient}. Forwarded to Billing & Scan.`, "success")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to verify order", "error")
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3 rounded-md text-[13px] font-semibold border flex items-center justify-between shadow-md transition-all ${toastMessage.type === "success"
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

      {/* ── Toolbar & Multi-Lifecycle Filters ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <span>Universal Examination Worklist</span>
              <span className="text-[12px] bg-blue-100 text-[#1B4FD8] font-bold px-2 py-0.5 rounded-full font-mono">
                {filteredStudies.length} matching
              </span>
            </h3>
            <p className="text-[12px] text-[#64748B]">All incoming orders, active scanning rooms, and reporting statuses</p>
          </div>


        </div>

        {/* ── Search & Primary Filters Row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
          {/* Global Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search patient, UMR, order ID, exam..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
            />
          </div>

          {/* Priority */}
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 rounded text-[12px] text-[#334155] font-semibold cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
          >
            <option value="all">Priority: All Priorities</option>
            <option value="STAT">STAT Emergency</option>
            <option value="Urgent">Urgent</option>
            <option value="Routine">Routine</option>
          </select>

          {/* Billing State Filter */}
          <select
            value={billingStatusFilter}
            onChange={(e) => {
              setBillingStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 rounded text-[12px] text-[#334155] font-semibold cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
          >
            <option value="all">Billing: All States</option>
            <option value="paid">Cleared / Paid</option>
            <option value="pending">Payment Pending</option>
            <option value="exception">Authorized Exception</option>
          </select>

          {/* Exam / Scan State Filter */}
          <select
            value={examStatusFilter}
            onChange={(e) => {
              setExamStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 rounded text-[12px] text-[#334155] font-semibold cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
          >
            <option value="all">Scanning: All States</option>
            <option value="ready">Ready to Scan (Paid/Cleared)</option>
            <option value="in_progress">In Scanning Progress</option>
            <option value="done">Scanning Done / Completed</option>
          </select>

          {/* Reporting Status Filter */}
          <select
            value={reportStatusFilter}
            onChange={(e) => {
              setReportStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 rounded text-[12px] text-[#334155] font-semibold cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
          >
            <option value="all">Reporting: All States</option>
            <option value="awaiting_scan">Awaiting Scan</option>
            <option value="awaiting">Awaiting Report</option>
            <option value="drafts">Draft Saved</option>
            <option value="review">Under Review</option>
            <option value="correction">Correction Required</option>
            <option value="finalized">Finalized</option>
          </select>
        </div>

        {/* ── Modality Pills Strip ── */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[#F1F5F9] text-[11px]">
          <span className="text-[#64748B] font-bold uppercase tracking-wider text-[10px] mr-1">Modalities:</span>
          <button
            onClick={() => {
              setModalityFilter("all")
              setCurrentPage(1)
            }}
            className={`px-2.5 py-0.5 rounded border transition-colors font-semibold cursor-pointer ${modalityFilter === "all"
              ? "bg-[#0F172A] text-white border-[#0F172A]"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
              }`}
          >
            All Modalities ({allStudies.length})
          </button>
          {RADIOLOGY_MODALITIES.map((mod) => {
            const count = allStudies.filter((s) => getCanonicalRadiologyModality(s) === mod).length
            const isSelected = modalityFilter === mod
            return (
              <button
                key={mod}
                onClick={() => {
                  setModalityFilter(mod)
                  setCurrentPage(1)
                }}
                className={`px-2 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-1 ${isSelected
                  ? "bg-[#1B4FD8] text-white border-blue-600 font-bold"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
              >
                <span>{mod}</span>
                <span className={`px-1 py-0.2 rounded text-[9.5px] ${isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Universal Worklist Table ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
                <th className="py-3 px-3 w-32">Order Date & Time</th>
                <th className="py-3 px-4">Patient Name & UMR</th>
                <th className="py-3 px-4">Examination & Modality</th>
                <th className="py-3 px-2 w-24 text-center">Priority</th>
                <th className="py-3 px-3 w-36">Billing Status</th>
                <th className="py-3 px-3 w-36">Scanning Status</th>
                <th className="py-3 px-3 w-40">Reporting Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {paginatedStudies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64748B]">
                    No examination records match the selected filters.
                  </td>
                </tr>
              ) : (
                paginatedStudies.map((study) => {
                  const isReadyToScan = study.normalizedStatus === "ORDERED"
                  const isScanning = study.normalizedStatus === "IN PROGRESS"
                  const isDone = study.normalizedStatus === "DONE"
                  const canReport =
                    isDone ||
                    study.sentToReporting ||
                    study.normalizedReportStatus === "Draft" ||
                    study.normalizedReportStatus === "Awaiting Report" ||
                    study.normalizedReportStatus === "Submitted for Review" ||
                    study.normalizedReportStatus === "Finalized"

                  return (
                    <tr
                      key={study.id}
                      onClick={() => setSelectedDrawerStudy(study)}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                    >
                      {/* Order Time */}
                      <td className="py-3 px-3 font-mono text-[11.5px] text-[#64748B] whitespace-nowrap">
                        {study.ordered || "—"}
                      </td>

                      {/* Patient & UMR */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#0F172A] group-hover:text-[#1B4FD8] transition-colors flex items-center gap-1.5">
                          <span>{study.patient}</span>
                          {study.priority === "STAT" && (
                            <span className="bg-red-100 text-red-800 text-[9.5px] px-1.5 py-0.2 rounded font-bold uppercase animate-pulse">
                              STAT
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#64748B] font-mono mt-0.5 flex items-center gap-2">
                          <span>UMR: {study.umr || study.mrn || "—"}</span>
                          {study.encounterId && <span>• {study.encounterId}</span>}
                        </div>
                      </td>

                      {/* Examination & Modality */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#0F172A]">{study.study}</div>
                        <div className="text-[11px] text-[#1B4FD8] font-medium mt-0.5 flex items-center gap-1.5">
                          <span>{getCanonicalRadiologyModality(study)}</span>
                          {study.department && study.department !== getCanonicalRadiologyModality(study) && (
                            <span className="text-slate-400 font-normal">• {study.department}</span>
                          )}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-2 text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${study.priority === "STAT"
                            ? "bg-red-100 text-red-800 border border-red-300"
                            : (study.priority as string) === "Urgent"
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                        >
                          {study.priority || "Routine"}
                        </span>
                      </td>

                      {/* Billing State */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {study.isPaid ? (
                            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              ✓ Cleared (Paid)
                            </span>
                          ) : study.billingStatus === "Authorized Exception" ? (
                            <span className="text-[11px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded" title={study.authorizedException ? `Authorized by ${study.authorizedException.user}: ${study.authorizedException.reason}` : "Authorized Exception"}>
                              ★ Auth Exception
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              ⏳ Pending Billing
                            </span>
                          )}
                          {study.hasBillingDiscrepancy && (
                            <span
                              className="text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-300 px-1.5 py-0.2 rounded flex items-center gap-1"
                              title={study.billingDiscrepancyReason || "Scan completed while billing was pending without authorized exception"}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                              <span>⚠️ Billing Discrepancy</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Scanning State */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isScanning ? (
                          <span className="text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 w-max">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
                            In Scanning
                          </span>
                        ) : study.sentToReporting || study.status === "Sent for Reporting" ? (
                          <span className="text-[11px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded flex items-center gap-1 w-max">
                            ✓ Sent for Reporting
                          </span>
                        ) : isDone ? (
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            ✓ Scan Done
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                            Awaiting Scan
                          </span>
                        )}
                      </td>

                      {/* Reporting Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {(() => {
                          const repInfo = resolveReportingStatus(study)
                          return (
                            <span
                              className={`text-[11px] font-bold px-2.5 py-1 rounded border flex items-center gap-1.5 w-max ${repInfo.badgeClass}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${repInfo.dotClass}`} />
                              <span>{repInfo.label}</span>
                            </span>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Table Pagination Bar ── */}
        <div className="p-3 border-t border-[#DDE2EC] bg-[#F8FAFC] flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-[#64748B]">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, sortedStudies.length)} of {sortedStudies.length} studies
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded border border-[#CBD5E1] bg-white text-[#334155] font-semibold disabled:opacity-50 cursor-pointer hover:bg-slate-50"
            >
              Previous
            </button>
            <span className="font-mono font-bold text-[#0F172A]">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded border border-[#CBD5E1] bg-white text-[#334155] font-semibold disabled:opacity-50 cursor-pointer hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── Slide-Out Examination Detail Drawer ── */}
      {selectedDrawerStudy && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex justify-end transition-all">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-blue-300 uppercase tracking-wider">
                  Examination Dossier • {selectedDrawerStudy.id}
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">{selectedDrawerStudy.study}</h3>
              </div>
              <button
                onClick={() => setSelectedDrawerStudy(null)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-[13px]">
              {/* Patient Identity Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[#0F172A] text-base">{selectedDrawerStudy.patient}</div>
                  <span className="text-[11px] font-mono bg-white border border-slate-300 px-2 py-0.5 rounded font-bold">
                    UMR: {selectedDrawerStudy.umr || selectedDrawerStudy.mrn || "—"}
                  </span>
                </div>
                <div className="text-[12px] text-slate-600 grid grid-cols-2 gap-2">
                  <div>Referring Doctor: <span className="font-semibold text-slate-900">{selectedDrawerStudy.provider || "Attending Physician"}</span></div>
                  <div>Encounter ID: <span className="font-mono text-slate-900">{selectedDrawerStudy.encounterId || "OP-1002"}</span></div>
                  <div>Modality: <span className="font-semibold text-[#1B4FD8]">{getCanonicalRadiologyModality(selectedDrawerStudy)}</span></div>
                  <div>Room / Suite: <span className="font-mono text-slate-900">{selectedDrawerStudy.room || "Unassigned"}</span></div>
                </div>
              </div>

              {/* Clinical Indication */}
              <div className="space-y-1.5">
                <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">Clinical Indication</div>
                <div className="p-3 bg-white border border-slate-200 rounded text-slate-800 text-[12.5px]">
                  {selectedDrawerStudy.indication || "Diagnostic investigation ordered per clinical consultation."}
                </div>
              </div>

              {/* Status Timelines */}
              <div className="space-y-2">
                <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">Lifecycle Status</div>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div className="p-2.5 border rounded bg-slate-50">
                    <span className="text-slate-500 block text-[10.5px]">Billing Clearance:</span>
                    <span className={`font-bold ${selectedDrawerStudy.isPaid ? "text-emerald-700" : "text-amber-700"}`}>
                      {selectedDrawerStudy.isPaid ? "Paid (Cleared)" : "Payment Pending"}
                    </span>
                  </div>
                  <div className="p-2.5 border rounded bg-slate-50">
                    <span className="text-slate-500 block text-[10.5px]">Scanning Progress:</span>
                    <span className="font-bold text-slate-900">{selectedDrawerStudy.normalizedStatus}</span>
                  </div>
                  <div className="p-2.5 border rounded bg-slate-50">
                    <span className="text-slate-500 block text-[10.5px]">Report State:</span>
                    <span className="font-bold text-purple-900">{resolveReportingStatus(selectedDrawerStudy).label}</span>
                  </div>
                  <div className="p-2.5 border rounded bg-slate-50">
                    <span className="text-slate-500 block text-[10.5px]">Nurse Verification:</span>
                    <span className="font-bold text-slate-900">
                      {selectedDrawerStudy.nurseVerified ? "Verified" : "Pending Verification"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Billing Discrepancy Card if present */}
              {selectedDrawerStudy.hasBillingDiscrepancy && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded text-rose-900 text-[12px] space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-rose-950">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Billing Discrepancy Detected</span>
                  </div>
                  <p className="text-[11.5px] text-rose-800">
                    {selectedDrawerStudy.billingDiscrepancyReason || "Examination scan was completed while billing clearance was pending. Unresolved financial balance."}
                  </p>
                  <button
                    onClick={() => {
                      setAuthExceptionStudy(selectedDrawerStudy)
                      setAuthRef("AUTH-RAD-" + Math.floor(1000 + Math.random() * 9000))
                    }}
                    className="mt-1 bg-purple-700 hover:bg-purple-800 text-white px-3 py-1 rounded text-[11.5px] font-bold cursor-pointer transition-colors shadow-2xs"
                  >
                    Authorize Clinical / Billing Exception
                  </button>
                </div>
              )}

              {/* Suite & Priority Assignment */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">Suite & Priority Assignment</div>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">Scan Suite</label>
                    <select
                      value={selectedDrawerStudy.room || "Suite 1"}
                      onChange={(e) => {
                        const updated = RadiologyWorkflowDb.updateStudyAssignment(selectedDrawerStudy.id, { room: e.target.value })
                        setSelectedDrawerStudy(updated)
                        showToast(`Assigned ${updated.study} to ${e.target.value}`, "success")
                        setTick((t) => t + 1)
                      }}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-[12px] font-semibold text-slate-800 cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
                    >
                      <option value="Suite 1">Suite 1 (X-Ray)</option>
                      <option value="Suite 2">Suite 2 (X-Ray)</option>
                      <option value="Suite 3">Suite 3 (X-Ray / Emergency)</option>
                      <option value="CT Suite 1">CT Suite 1 (Somatom)</option>
                      <option value="CT Suite 2">CT Suite 2 (Revolution)</option>
                      <option value="MRI Suite">MRI Suite (3.0T Magnetom)</option>
                      <option value="USG Suite">USG Suite (Philips EPIQ)</option>
                      <option value="Mammo Suite">Mammo Suite (Hologic 3D)</option>
                      <option value="DEXA Suite">DEXA Suite (Horizon)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">Clinical Priority</label>
                    <select
                      value={selectedDrawerStudy.priority || "Routine"}
                      onChange={(e) => {
                        const updated = RadiologyWorkflowDb.updateStudyAssignment(selectedDrawerStudy.id, { priority: e.target.value as any })
                        setSelectedDrawerStudy(updated)
                        showToast(`Updated priority to ${e.target.value} for ${updated.patient}`, "success")
                        setTick((t) => t + 1)
                      }}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-[12px] font-semibold text-slate-800 cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
                    >
                      <option value="Routine">Routine</option>
                      <option value="Urgent">Urgent</option>
                      <option value="STAT">STAT Emergency</option>
                      <option value="Elective">Elective</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons inside Drawer */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#64748B] mb-2">Available Actions</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      onNavigateToScanning(selectedDrawerStudy.id)
                      setSelectedDrawerStudy(null)
                    }}
                    className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white py-2 px-3 rounded text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs col-span-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>Open in Scanning Operations →</span>
                  </button>

                  {selectedDrawerStudy.normalizedStatus === "DONE" && (
                    <button
                      onClick={() => {
                        onNavigateToReporting(selectedDrawerStudy.id)
                        setSelectedDrawerStudy(null)
                      }}
                      className="bg-purple-700 hover:bg-purple-800 text-white py-2 px-3 rounded text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs col-span-2"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Open Patient Report →</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setPdfStudy(selectedDrawerStudy)
                      setSelectedDrawerStudy(null)
                    }}
                    className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 py-2 px-3 rounded text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Dossier / PDF</span>
                  </button>

                  {!selectedDrawerStudy.isPaid && selectedDrawerStudy.billingStatus !== "Authorized Exception" && (
                    <button
                      onClick={() => {
                        setAuthExceptionStudy(selectedDrawerStudy)
                        setAuthRef("AUTH-RAD-" + Math.floor(1000 + Math.random() * 9000))
                      }}
                      className="bg-white hover:bg-purple-50 text-purple-800 border border-purple-300 py-2 px-3 rounded text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <ShieldCheck className="w-4 h-4 text-purple-700" />
                      <span>Authorize Exception</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Completion Confirmation Modal ── */}
      {markDoneStudy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#CBD5E1] rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Confirm Scanning Completion</h3>
              <button onClick={() => setMarkDoneStudy(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <div className="p-5 space-y-4 text-[13px]">
              <p className="text-slate-700">
                Mark <strong>{markDoneStudy.study}</strong> for patient <strong>{markDoneStudy.patient}</strong> as DONE?
              </p>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">Technician Operational Notes</label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full h-20 p-2.5 border rounded text-[12.5px] text-slate-800 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setMarkDoneStudy(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 text-[12.5px] font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDone}
                  className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[12.5px] font-bold cursor-pointer"
                >
                  Confirm & Move to Reports
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Incomplete Examination Modal ── */}
      {incompleteStudy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-red-300 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-red-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Record Incomplete Examination</h3>
              <button onClick={() => setIncompleteStudy(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <div className="p-5 space-y-4 text-[13px]">
              <p className="text-slate-700">
                Please specify the reason why <strong>{incompleteStudy.study}</strong> could not be completed for <strong>{incompleteStudy.patient}</strong>:
              </p>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1">Reason for Incomplete Scan</label>
                <select
                  value={incompleteReason}
                  onChange={(e) => setIncompleteReason(e.target.value)}
                  className="w-full p-2 border rounded text-[12.5px] text-slate-800 focus:outline-none focus:border-red-600 mb-2 cursor-pointer"
                >
                  <option value="Patient unable to tolerate scan">Patient unable to tolerate scan</option>
                  <option value="Severe motion artifact / uncooperative">Severe motion artifact / uncooperative</option>
                  <option value="Contrast adverse reaction / allergy">Contrast adverse reaction / allergy</option>
                  <option value="Equipment malfunction / power fault">Equipment malfunction / power fault</option>
                  <option value="Patient hemodynamically unstable">Patient hemodynamically unstable</option>
                  <option value="Other clinical contraindication">Other clinical contraindication</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIncompleteStudy(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 text-[12.5px] font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmIncomplete}
                  className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded text-[12.5px] font-bold cursor-pointer"
                >
                  Record Exception
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Authorized Billing Exception Modal ── */}
      {authExceptionStudy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-purple-300 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-purple-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Authorize Billing Exception</h3>
              <button onClick={() => setAuthExceptionStudy(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <div className="p-5 space-y-3.5 text-[12.5px]">
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11.5px]">
                <strong>Hospital Clearance Policy:</strong> Payment for examination <strong>"{authExceptionStudy.study}"</strong> (₹{authExceptionStudy.price || 0}) is pending at Central Billing. An authorized supervisor exception is required to clear scanning.
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-0.5">Authorizing User / Supervisor *</label>
                <input
                  type="text"
                  value={authUserName}
                  onChange={(e) => setAuthUserName(e.target.value)}
                  className="w-full p-2 border rounded text-slate-900 focus:outline-none focus:border-purple-600 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-0.5">Professional Role</label>
                <input
                  type="text"
                  value={authUserRole}
                  onChange={(e) => setAuthUserRole(e.target.value)}
                  className="w-full p-2 border rounded text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-0.5">Clinical Exception Reason *</label>
                <select
                  value={authReason}
                  onChange={(e) => setAuthReason(e.target.value)}
                  className="w-full p-2 border rounded text-slate-900 focus:outline-none focus:border-purple-600 mb-1 cursor-pointer"
                >
                  <option value="Emergency clinical urgency / supervisor authorization">Emergency clinical urgency / supervisor authorization</option>
                  <option value="Inpatient / OP transfer urgent scan authorization">Inpatient / OP transfer urgent scan authorization</option>
                  <option value="Attending Doctor verbal instruction - post-facto billing settlement">Attending Doctor verbal instruction - post-facto billing settlement</option>
                  <option value="VIP / Corporate account waiver pre-approved">VIP / Corporate account waiver pre-approved</option>
                  <option value="Cashless insurance pre-auth in progress">Cashless insurance pre-auth in progress</option>
                </select>
                <input
                  type="text"
                  value={authReason}
                  onChange={(e) => setAuthReason(e.target.value)}
                  placeholder="Or enter custom authorization justification..."
                  className="w-full p-1.5 border rounded text-[11.5px] text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-0.5">Authorization Reference / Memo # *</label>
                <input
                  type="text"
                  value={authRef}
                  onChange={(e) => setAuthRef(e.target.value)}
                  className="w-full p-2 border rounded font-mono text-slate-900 focus:outline-none focus:border-purple-600 font-semibold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setAuthExceptionStudy(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 text-[12.5px] font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAuthorizeException}
                  className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded text-[12.5px] font-bold cursor-pointer"
                >
                  Record Authorization
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
