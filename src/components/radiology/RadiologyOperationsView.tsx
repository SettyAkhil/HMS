import React, { useState, useMemo, useEffect } from "react"
import {
  Home,
  ChevronRight,
  RefreshCw,
  Plus,
  Search,
  ClipboardList,
  Play,
  Settings,
  Clock,
  Check,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  MoreHorizontal,
  FileText,
  User,
  Calendar,
  Layers,
  AlertTriangle,
  Save,
  Activity,
  CheckSquare,
  Square,
  AlertCircle,
  Phone,
  MapPin,
  Send,
  Info,
} from "lucide-react"

import { RadiologyWorkflowDb, ExtendedRadiologyRecord } from "../../services/radiologyWorkflowDb"
import { UniversalRadiologyDb } from "../../services/universalRadiologyDb"
import { BillingDatabase } from "../../services/billingDb"
import { RadiologyTemplateDatabase } from "../../services/radiologyTemplateDb"
import { getCanonicalRadiologyModality } from "../../utils/testClassifier"

interface RadiologyOperationsViewProps {
  onNavigateToReporting: (studyId: string) => void
  onNavigateToWorklist?: () => void
  onOpenOrderModal?: () => void
  initialStudyId?: string | null
  initialTab?: ScanningStatusCategory
}

export type ScanningStatusCategory = "all" | "ready_to_scan" | "in_progress" | "awaiting_clearance"
export type DetailTabType = "scanning_details" | "patient_info" | "clinical_indication" | "attachments"

/**
 * Hospital Billing & Safety Clearance Policy:
 * Only examinations that are PAID or CLEARED (e.g. authorized clinical exception)
 * are eligible to enter Scanning Operations.
 * Pending Billing, Payment Pending, Billing Discrepancy, and Cancelled orders
 * are strictly excluded from the scanning queue and remain in the Examination Worklist.
 */
export const isPaidOrClearedStudy = (s: ExtendedRadiologyRecord): boolean => {
  // 1. Exclude cancelled or rejected orders
  if ((s as any).isCancelled || (s as any).status === "Cancelled" || (s as any).billingStatus === "Cancelled" || (s as any).paymentStatus === "Cancelled") {
    return false
  }
  if ((s as any).billingStatus === "Rejected" || (s as any).paymentStatus === "Rejected") {
    return false
  }

  // 2. Exclude billing discrepancy
  if (s.hasBillingDiscrepancy) {
    return false
  }

  // 3. Strictly exclude pending payment unless authorized clinical exception is present
  const pStatus = (s.paymentStatus || "").toLowerCase().trim()
  const bStatus = (s.billingStatus || "").toLowerCase().trim()

  if (
    pStatus === "payment pending" ||
    pStatus === "pending" ||
    bStatus === "pending" ||
    bStatus === "pending billing" ||
    bStatus === "payment pending"
  ) {
    if (!s.authorizedException && bStatus !== "authorized exception" && !(s as any).authorizedExceptionRef) {
      return false
    }
  }

  const isPaid = Boolean(
    s.isPaid === true ||
    pStatus === "paid" ||
    (s.paymentStatusDisplay || "").toUpperCase() === "PAID" ||
    bStatus === "paid" ||
    bStatus === "cleared" ||
    bStatus === "authorized exception" ||
    Boolean(s.paidReceiptNo) ||
    Boolean(s.authorizedException)
  )

  return isPaid
}

/**
 * Helper to determine exact workflow category (mutually exclusive):
 * - "completed": scan done / images ready (stage 3)
 * - "in_progress": actively scanning in room (stage 2)
 * - "ready_to_scan": paid & cleared, ready to start (stage 1)
 */
export function getStudyStatusCategory(
  s: ExtendedRadiologyRecord,
  overrideStage: Record<string, number> = {}
): "in_progress" | "completed" | "ready_to_scan" {
  if (!s) return "ready_to_scan"
  const targetId = (s.id || "").toLowerCase()
  const targetUmr = (s.umr || s.mrn || "").toLowerCase()
  const targetAccession = (s.accessionNo || "").toLowerCase()

  for (const [k, v] of Object.entries(overrideStage)) {
    const kLower = k.toLowerCase()
    if (
      kLower === targetId ||
      (targetUmr && kLower === targetUmr) ||
      (targetAccession && kLower === targetAccession)
    ) {
      if (v === 3) return "completed"
      if (v === 2) return "in_progress"
      return "ready_to_scan"
    }
  }

  try {
    if (typeof localStorage !== "undefined") {
      const pStage =
        localStorage.getItem(`hospai_rad_stage_${s.id}`) ||
        (s.umr ? localStorage.getItem(`hospai_rad_stage_${s.umr}`) : null) ||
        (s.accessionNo ? localStorage.getItem(`hospai_rad_stage_${s.accessionNo}`) : null) ||
        (s.mrn ? localStorage.getItem(`hospai_rad_stage_${s.mrn}`) : null)
      if (pStage === "3") return "completed"
      if (pStage === "2") return "in_progress"
    }
  } catch { }

  if ((s as any).workflowStatus === "COMPLETED") return "completed"
  if ((s as any).workflowStatus === "IN_PROGRESS") return "in_progress"
  if ((s as any).workflowStatus === "READY_TO_START") return "ready_to_scan"

  if (s.normalizedStatus === "DONE" || s.status === "Images Ready" || s.status === "Done" || s.scanningStage === 3) return "completed"
  if (s.normalizedStatus === "IN PROGRESS" || s.status === "In Progress" || s.scanningStage === 2) return "in_progress"
  return "ready_to_scan"
}

export default function RadiologyOperationsView({
  onNavigateToReporting,
  onNavigateToWorklist,
  onOpenOrderModal,
  initialStudyId = null,
  initialTab,
}: RadiologyOperationsViewProps) {
  const [tick, setTick] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(initialStudyId || null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [overrideStage, setOverrideStage] = useState<Record<string, number>>({})

  useEffect(() => {
    if (initialStudyId) {
      setSelectedStudyId(initialStudyId)
    }
  }, [initialStudyId])

  useEffect(() => {
    if (initialTab) {
      setStatusTab(initialTab)
    }
  }, [initialTab])

  // Filters
  const [statusTab, setStatusTab] = useState<ScanningStatusCategory>(initialTab || "all")
  const [searchQuery, setSearchQuery] = useState("")
  const [modalityFilter, setModalityFilter] = useState("all")
  const [suiteFilter, setSuiteFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")

  // Detail panel tab
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTabType>("scanning_details")

  // Safety checklist states keyed by study ID
  const [checklistStore, setChecklistStore] = useState<
    Record<
      string,
      {
        twoPointId: boolean
        pregnancySafety: boolean
        metallicImplant: boolean
        protocolReconciled: boolean
        contrastAllergy: boolean
        ivAccess: boolean
      }
    >
  >({})

  // Modals
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showIncompleteModal, setShowIncompleteModal] = useState(false)
  const [showAuthExceptionModal, setShowAuthExceptionModal] = useState(false)
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null)

  // Technologist & completion form states
  const [performingTech, setPerformingTech] = useState("Alex Rivera, RT(R)")
  const [actualProtocol, setActualProtocol] = useState("Standard diagnostic protocol as ordered")
  const [operationalNotes, setOperationalNotes] = useState("Diagnostic images acquired successfully. Artifact free.")
  const [incompleteReason, setIncompleteReason] = useState("Patient motion artifact / claustrophobia")
  const [authExceptionReason, setAuthExceptionReason] = useState("Emergency clinical urgency / supervisor authorization")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12

  // Send to Reporting submission state & feedback notices
  const [isSubmittingToReporting, setIsSubmittingToReporting] = useState(false)
  const [justSentId, setJustSentId] = useState<string | null>(null)
  const [sentNotice, setSentNotice] = useState<{ id: string; patient: string; study: string } | null>(null)
  const [queueExhaustedNotice, setQueueExhaustedNotice] = useState<string | null>(null)

  // In-memory set of study identifiers that have been sent to reporting in this session
  const [sentStudyKeys, setSentStudyKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith("hospai_rad_sent_") && localStorage.getItem(k) === "true") {
          const keyVal = k.replace("hospai_rad_sent_", "")
          if (keyVal.toUpperCase().startsWith("RAD-")) {
            initial.add(keyVal.toLowerCase())
          } else {
            // Clean up legacy non-ID key
            keysToRemove.push(k)
          }
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    } catch {}
    return initial
  })

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Multi-tab and backend update listener
  useEffect(() => {
    const unsub1 = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    const unsub2 = UniversalRadiologyDb.subscribe(() => setTick((t) => t + 1))
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  // Close overflow menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActionMenuOpenId(null)
    window.addEventListener("click", handleOutsideClick)
    return () => window.removeEventListener("click", handleOutsideClick)
  }, [])

  // 1. All studies in hospital system
  const allHospitalStudies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  // Helper to determine exact workflow category (mutually exclusive) bound to component overrideStage state
  const getStudyCategory = (s: ExtendedRadiologyRecord) => getStudyStatusCategory(s, overrideStage)

  // 2. Active shift examination worklist for Scanning Operations
  // ONLY display examinations whose billing status is PAID or CLEARED
  // Excludes Pending Billing, Payment Pending, Billing Discrepancy, Cancelled
  // Excludes examinations that have completed testing and have been sent to Reporting Workspace
  // Excludes completed examinations from the active worklist (Total Active Queue = readyToScan + inProgress)
  const studies = useMemo(() => {
    return allHospitalStudies.filter((s) => {
      // 1. Must be paid / cleared
      if (!isPaidOrClearedStudy(s)) return false

      // 2. Exclude cancelled
      if ((s as any).status === "Cancelled" || (s as any).isCancelled) return false

      // 3. Exclude transferred / sent to reporting
      if (
        s.sentToReporting ||
        s.status === "Sent for Reporting" ||
        (s as any).workflowStatus === "SENT_TO_REPORTING" ||
        (s as any).status === "SENT_TO_REPORTING"
      ) {
        return false
      }

      // Check in-memory sent keys to guarantee immediate disappearance upon click
      const sId = (s.id || "").toLowerCase()

      if (sId && sentStudyKeys.has(sId)) {
        return false
      }

      // Exclude if marked as sent in localStorage
      try {
        if (s.id && localStorage.getItem(`hospai_rad_sent_${s.id}`) === "true") {
          return false
        }
      } catch { }

      // 4. Exclude finalized reports
      if (
        s.reportStatus === "Finalized" ||
        s.reportStatus === "Final" ||
        s.normalizedReportStatus === "Finalized"
      ) {
        return false
      }

      // 5. Exclude reports already under review or drafted in reporting workspace
      if (
        s.normalizedReportStatus === "Draft" ||
        s.normalizedReportStatus === "Submitted for Review" ||
        s.reportStatus === "Draft" ||
        s.reportStatus === "Submitted for Review"
      ) {
        return false
      }

      // 6. Active Queue: Include only active scanning examinations (READY_TO_START or IN_PROGRESS)
      // Exclude completed examinations from the active queue table
      // (Retain only if currently selected by technician in drawer to allow immediate transfer)
      const cat = getStudyCategory(s)
      if (cat === "completed") {
        const isCurrentOpen = selectedStudyId && (
          s.id?.toLowerCase() === selectedStudyId.toLowerCase() ||
          (s.umr && s.umr.toLowerCase() === selectedStudyId.toLowerCase())
        )
        if (isCurrentOpen) return true
        return false
      }

      return true
    })
  }, [allHospitalStudies, tick, sentStudyKeys, selectedStudyId, overrideStage])

  // Derive counts for examination summary cards (strictly mutually exclusive)
  // Total Active Queue = readyToScan + inProgress (completed & transferred strictly excluded)
  const counts = useMemo(() => {
    let readyToScan = 0
    let inProgress = 0

    allHospitalStudies.forEach((s) => {
      if (!isPaidOrClearedStudy(s)) return
      if ((s as any).status === "Cancelled" || (s as any).isCancelled) return
      if (
        s.sentToReporting ||
        s.status === "Sent for Reporting" ||
        (s as any).workflowStatus === "SENT_TO_REPORTING" ||
        (s as any).status === "SENT_TO_REPORTING"
      ) return
      const sId = (s.id || "").toLowerCase()
      if (sId && sentStudyKeys.has(sId)) return
      try {
        if (s.id && localStorage.getItem(`hospai_rad_sent_${s.id}`) === "true") return
      } catch {}
      if (
        s.reportStatus === "Finalized" ||
        s.reportStatus === "Final" ||
        s.normalizedReportStatus === "Finalized" ||
        s.normalizedReportStatus === "Draft" ||
        s.normalizedReportStatus === "Submitted for Review" ||
        s.reportStatus === "Draft" ||
        s.reportStatus === "Submitted for Review"
      ) return

      const cat = getStudyCategory(s)
      if (cat === "ready_to_scan") readyToScan++
      else if (cat === "in_progress") inProgress++
    })

    // Count pending billing examinations across all hospital orders for summary awareness
    const awaitingClearance = allHospitalStudies.filter(
      (s) => !isPaidOrClearedStudy(s) && !s.sentToReporting && (s as any).status !== "Cancelled"
    ).length

    return {
      total: readyToScan + inProgress,
      readyToScan,
      inProgress,
      awaitingClearance,
      completed: 0,
    }
  }, [allHospitalStudies, tick, sentStudyKeys, overrideStage])

  // Filtered studies based on search, modality, suite, and status tabs
  const filteredStudies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return studies.filter((study) => {
      // 1. Status Tab filter
      if (statusTab !== "all" && statusTab !== "awaiting_clearance") {
        const cat = getStudyCategory(study)
        if (cat !== statusTab) return false
      }

      // 2. Modality filter
      if (modalityFilter !== "all") {
        const canonical = getCanonicalRadiologyModality(study)
        if (canonical !== modalityFilter && study.modality !== modalityFilter) return false
      }

      // 3. Suite filter
      if (suiteFilter !== "all") {
        const room = study.room || ""
        if (!room.toLowerCase().includes(suiteFilter.toLowerCase())) return false
      }

      // 4. Payment filter
      if (paymentFilter !== "all") {
        const isPaid = study.isPaid || study.paymentStatus === "Paid"
        if (paymentFilter === "Paid" && !isPaid) return false
        if (paymentFilter === "Pending" && isPaid) return false
      }

      // 5. Search query (patient name, UMR, ID, examination, provider)
      if (q) {
        const match =
          (study.patient || "").toLowerCase().includes(q) ||
          (study.umr || "").toLowerCase().includes(q) ||
          (study.mrn || "").toLowerCase().includes(q) ||
          (study.id || "").toLowerCase().includes(q) ||
          (study.study || "").toLowerCase().includes(q) ||
          (study.provider || "").toLowerCase().includes(q) ||
          (study.room || "").toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [studies, statusTab, modalityFilter, suiteFilter, paymentFilter, searchQuery])

  // FIFO Queue Ordering: Oldest eligible examination appears at the top.
  // Newly eligible examinations are added at the bottom.
  // Sorted strictly by scanning eligibility timestamp (billingClearedAt / eligibleAt / paidAt).
  // Stable secondary sort: Examination ID ascending.
  const sortedStudies = useMemo(() => {
    return [...filteredStudies].sort((a, b) => {
      const timeA = RadiologyWorkflowDb.getScanningEligibilityTimestamp(a)
      const timeB = RadiologyWorkflowDb.getScanningEligibilityTimestamp(b)
      if (timeA !== timeB) {
        return timeA - timeB // FIFO: Oldest eligible first
      }
      return (a.id || "").localeCompare(b.id || "")
    })
  }, [filteredStudies])

  // Selected study selection logic
  const selectedStudy = useMemo(() => {
    if (selectedStudyId) {
      const target = selectedStudyId.toLowerCase().trim()
      const found = studies.find(
        (s) =>
          (s.id && s.id.toLowerCase() === target) ||
          (s.accessionNo && s.accessionNo.toLowerCase() === target) ||
          (s.invoiceNo && s.invoiceNo.toLowerCase() === target) ||
          (s.umr && s.umr.toLowerCase() === target) ||
          (s.mrn && s.mrn.toLowerCase() === target),
      )
      if (found) return found
    }
    if (queueExhaustedNotice) {
      return null
    }
    // Default to first eligible study or RAD-1030 if present
    const defaultStudy =
      sortedStudies.find((s) => s.normalizedStatus !== "DONE" && !s.sentToReporting && s.status !== "Sent for Reporting") ||
      sortedStudies[0] ||
      studies[0] ||
      null
    return defaultStudy
  }, [studies, selectedStudyId, sortedStudies, queueExhaustedNotice])

  // Pagination bounds
  const totalPages = Math.max(1, Math.ceil(sortedStudies.length / pageSize))
  const paginatedStudies = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedStudies.slice(start, start + pageSize)
  }, [sortedStudies, currentPage, pageSize])

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [statusTab, modalityFilter, suiteFilter, paymentFilter, searchQuery])

  // Initialize or get safety checklist for selected study from persistent record or memory
  const currentChecklist = useMemo(() => {
    if (!selectedStudy) {
      return {
        twoPointId: true,
        pregnancySafety: true,
        metallicImplant: true,
        protocolReconciled: true,
        contrastAllergy: true,
        ivAccess: true,
      }
    }
    if (selectedStudy.safetyChecklist) {
      return selectedStudy.safetyChecklist
    }
    if (checklistStore[selectedStudy.id]) {
      return checklistStore[selectedStudy.id]
    }
    return {
      twoPointId: selectedStudy.patientVerified ?? true,
      pregnancySafety: true,
      metallicImplant: true,
      protocolReconciled: true,
      contrastAllergy: true,
      ivAccess: true,
    }
  }, [selectedStudy, checklistStore])

  const allChecklistPassed = Object.values(currentChecklist).every(Boolean)

  // Toggle individual checklist item and persist
  const toggleChecklistItem = (key: keyof typeof currentChecklist) => {
    if (!selectedStudy) return
    const updated = {
      ...currentChecklist,
      [key]: !currentChecklist[key],
    }
    setChecklistStore((prev) => ({
      ...prev,
      [selectedStudy.id]: updated,
    }))
    const allPassed = Object.values(updated).every(Boolean)
    // Persist to database
    BillingDatabase.updateRadiologyStudy(selectedStudy.id, {
      safetyChecklist: updated,
      patientVerified: updated.twoPointId,
      safetyCleared: allPassed,
      scanningStage: selectedStudy.normalizedStatus === "DONE" ? 3 :
        selectedStudy.normalizedStatus === "IN PROGRESS" ? 2 : 1,
    })
    setTick((t) => t + 1)
  }

  // Quick Action: Confirm all safety checks (Stage 1 requirement)
  const handleVerifyAllChecks = () => {
    if (!selectedStudy) return
    const allTrue = {
      twoPointId: true,
      pregnancySafety: true,
      metallicImplant: true,
      protocolReconciled: true,
      contrastAllergy: true,
      ivAccess: true,
    }
    setChecklistStore((prev) => ({
      ...prev,
      [selectedStudy.id]: allTrue,
    }))
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    BillingDatabase.updateRadiologyStudy(selectedStudy.id, {
      safetyChecklist: allTrue,
      patientVerified: true,
      patientVerifiedAt: nowTime,
      safetyCleared: true,
      safetyClearedAt: nowTime,
      scanningStage: selectedStudy.normalizedStatus === "DONE" ? 3 :
        selectedStudy.normalizedStatus === "IN PROGRESS" ? 2 : 1,
    })
    showToast("All pre-procedure safety checks verified & cleared.", "success")
    setTick((t) => t + 1)
  }

  // Determine current active scanning stage: EXACTLY THREE STAGES
  // Stage 1: Ready to Start
  // Stage 2: Scanning In Progress
  // Stage 3: Scanning Completed
  const currentScanningStage = useMemo(() => {
    if (!selectedStudy) return 1

    const targetId = (selectedStudy.id || "").toLowerCase()
    const targetUmr = (selectedStudy.umr || selectedStudy.mrn || "").toLowerCase()
    const targetAccession = (selectedStudy.accessionNo || "").toLowerCase()

    // 1. Check in-memory override (supports id, UMR, or accession lookup)
    for (const [k, v] of Object.entries(overrideStage)) {
      const kLower = k.toLowerCase()
      if (
        kLower === targetId ||
        (targetUmr && kLower === targetUmr) ||
        (targetAccession && kLower === targetAccession)
      ) {
        return v
      }
    }

    // 2. Check localStorage persistent stage
    try {
      const pStage =
        localStorage.getItem(`hospai_rad_stage_${selectedStudy.id}`) ||
        (selectedStudy.umr ? localStorage.getItem(`hospai_rad_stage_${selectedStudy.umr}`) : null) ||
        (selectedStudy.accessionNo ? localStorage.getItem(`hospai_rad_stage_${selectedStudy.accessionNo}`) : null) ||
        (selectedStudy.mrn ? localStorage.getItem(`hospai_rad_stage_${selectedStudy.mrn}`) : null)
      if (pStage) {
        const parsed = parseInt(pStage, 10)
        if (parsed >= 1 && parsed <= 3) return parsed
      }
    } catch { }

    // 3. Check study properties
    if (
      selectedStudy.sentToReporting ||
      selectedStudy.status === "Sent for Reporting" ||
      selectedStudy.normalizedStatus === "DONE" ||
      selectedStudy.status === "Images Ready" ||
      selectedStudy.status === "Done" ||
      selectedStudy.scanningStage === 3
    ) {
      return 3
    }
    if (
      selectedStudy.normalizedStatus === "IN PROGRESS" ||
      selectedStudy.status === "In Progress" ||
      selectedStudy.scanningStage === 2
    ) {
      return 2
    }
    return 1
  }, [selectedStudy, overrideStage, tick])

  // Row selection checkboxes
  const toggleRowCheckbox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

  const toggleAllRowsOnPage = () => {
    if (selectedRowIds.size === paginatedStudies.length) {
      setSelectedRowIds(new Set())
    } else {
      setSelectedRowIds(new Set(paginatedStudies.map((s) => s.id)))
    }
  }

  // Manual worklist refresh action
  const handleRefresh = () => {
    setIsRefreshing(true)
    RadiologyWorkflowDb.invalidateCache()
    setTick((t) => t + 1)
    setTimeout(() => {
      setIsRefreshing(false)
      showToast("Scanning operations refreshed with latest hospital data.", "info")
    }, 450)
  }

  // Start Scanning procedure (Stage 1 -> Stage 2)
  const handleStartScan = (rawStudy?: ExtendedRadiologyRecord | null) => {
    const study = rawStudy || selectedStudy || (selectedStudyId ? studies.find((s) => s.id === selectedStudyId) : null) || studies[0]
    if (!study) {
      showToast("No eligible examination selected for scanning.", "error")
      return
    }

    try {
      const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      const studyId = study.id || (study.umr ? `RAD-${study.umr}` : `RAD-${Date.now()}`)

      // 1. Immediately lock selection and transition UI to Stage 2
      setSelectedStudyId(studyId)
      setOverrideStage((prev) => ({
        ...prev,
        [studyId]: 2,
        ...(study.id ? { [study.id]: 2 } : {}),
        ...(study.umr ? { [study.umr]: 2 } : {}),
        ...(study.accessionNo ? { [study.accessionNo]: 2 } : {}),
      }))

      // Persist stage to localStorage
      try {
        localStorage.setItem(`hospai_rad_stage_${studyId}`, "2")
        if (study.id) localStorage.setItem(`hospai_rad_stage_${study.id}`, "2")
        if (study.umr) localStorage.setItem(`hospai_rad_stage_${study.umr}`, "2")
        if (study.accessionNo) localStorage.setItem(`hospai_rad_stage_${study.accessionNo}`, "2")
      } catch { }

      // 2. Ensure all safety checklist items are verified
      const allTrue = {
        twoPointId: true,
        pregnancySafety: true,
        metallicImplant: true,
        protocolReconciled: true,
        contrastAllergy: true,
        ivAccess: true,
      }
      setChecklistStore((prev) => ({
        ...prev,
        [studyId]: allTrue,
        ...(study.id ? { [study.id]: allTrue } : {}),
        ...(study.umr ? { [study.umr]: allTrue } : {}),
      }))

      // 3. Persist to persistent database
      BillingDatabase.updateRadiologyStudy(study.id || studyId, {
        status: "In Progress",
        workflowStatus: "IN_PROGRESS",
        scanningStage: 2,
        scanStartedAt: study.scanStartedAt || nowTime,
        patientVerified: true,
        patientVerifiedAt: nowTime,
        safetyCleared: true,
        safetyClearedAt: nowTime,
        safetyChecklist: allTrue,
        technician: performingTech,
        room: study.room || "Scan Suite 1",
      })

      try {
        RadiologyWorkflowDb.updateStudyStatus(study.id || studyId, "IN PROGRESS", performingTech, study.room || "Scan Suite 1")
      } catch (err: any) {
        console.warn("RadiologyWorkflowDb.updateStudyStatus notice:", err)
      }

      UniversalRadiologyDb.logAudit({
        studyId: study.id || studyId,
        patientName: study.patient,
        action: "Scanning Procedure Started",
        actor: performingTech,
        role: "Senior Radiologic Technologist",
        details: `Scan started in ${study.room || "Scan Suite 1"}. Pre-procedure safety verification completed. Start time: ${nowTime}.`,
      })

      UniversalRadiologyDb.occupySuiteForStudy(study.id || studyId, study.room)
      RadiologyWorkflowDb.invalidateCache()
      showToast(`✓ Scan started for ${study.patient} (${study.study}). Stage 2: In Progress.`, "success")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to start scanning.", "error")
    }
  }

  // Stage 2 -> Stage 3: Mark as Completed
  const handleConfirmComplete = () => {
    const study = selectedStudy || (selectedStudyId ? studies.find((s) => s.id === selectedStudyId) : null)
    if (!study) return

    try {
      const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      const studyId = study.id || (study.umr ? `RAD-${study.umr}` : `RAD-${Date.now()}`)
      const targetId = study.id || studyId

      // 1. Immediately transition UI to Stage 3 (COMPLETED)
      setSelectedStudyId(targetId)
      setOverrideStage((prev) => ({
        ...prev,
        [studyId]: 3,
        [targetId]: 3,
        ...(study.id ? { [study.id]: 3 } : {}),
        ...(study.umr ? { [study.umr]: 3 } : {}),
        ...(study.accessionNo ? { [study.accessionNo]: 3 } : {}),
      }))

      // Persist stage to localStorage so it stays completed across refreshes
      try {
        localStorage.setItem(`hospai_rad_stage_${studyId}`, "3")
        localStorage.setItem(`hospai_rad_stage_${targetId}`, "3")
        if (study.id) localStorage.setItem(`hospai_rad_stage_${study.id}`, "3")
        if (study.umr) localStorage.setItem(`hospai_rad_stage_${study.umr}`, "3")
        if (study.accessionNo) localStorage.setItem(`hospai_rad_stage_${study.accessionNo}`, "3")
      } catch { }

      // 2. Persist to persistent storage: BillingDatabase & RadiologyWorkflowDb
      BillingDatabase.updateRadiologyStudy(targetId, {
        status: "Images Ready",
        workflowStatus: "COMPLETED" as any,
        scanningStage: 3,
        scanCompletedAt: study.scanCompletedAt || nowTime,
        actualProtocol,
        operationalNotes,
        technician: performingTech,
      })

      try {
        RadiologyWorkflowDb.markStudyDone(
          targetId,
          `${actualProtocol}. Operator Notes: ${operationalNotes}`,
          performingTech,
          "Senior Radiologic Technologist"
        )
      } catch (err: any) {
        console.warn("RadiologyWorkflowDb.markStudyDone notice:", err)
      }

      // 3. Prepare report draft with approved template in readiness for Reporting Workspace
      try {
        RadiologyWorkflowDb.getOrInitializeReportDraft(
          targetId,
          performingTech,
          "Senior Radiologic Technologist"
        )
      } catch (err: any) {
        console.warn("RadiologyWorkflowDb.getOrInitializeReportDraft notice:", err)
      }

      UniversalRadiologyDb.logAudit({
        studyId: targetId,
        patientName: study.patient,
        action: "Scan Completed",
        actor: performingTech,
        role: "Senior Radiologic Technologist",
        details: `Scan complete for ${study.study} (Time: ${nowTime}). Protocol: ${actualProtocol}. Status: COMPLETED. Ready to send to Reporting Workspace.`,
      })

      UniversalRadiologyDb.releaseSuiteForStudy(targetId)
      RadiologyWorkflowDb.invalidateCache()
      setShowCompleteModal(false)
      showToast("Scan marked as completed. Click 'Send to Reporting Workspace' to transfer.", "info")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to mark scanning as completed.", "error")
    }
  }

  // Helper to find next pending examination eligible for scanning in the worklist
  const findNextEligibleStudy = (
    currentStudyId: string,
    studyList: ExtendedRadiologyRecord[]
  ): ExtendedRadiologyRecord | null => {
    const isEligible = (s: ExtendedRadiologyRecord) => {
      if (s.id === currentStudyId) return false
      if (!isPaidOrClearedStudy(s)) return false
      if (
        s.sentToReporting ||
        s.status === "Sent for Reporting" ||
        (s as any).workflowStatus === "SENT_TO_REPORTING" ||
        (s as any).status === "SENT_TO_REPORTING"
      ) return false
      try {
        if (s.id && localStorage.getItem(`hospai_rad_sent_${s.id}`) === "true") return false
      } catch { }
      if (s.reportStatus === "Finalized" || s.reportStatus === "Final" || s.normalizedReportStatus === "Finalized") return false
      if (s.normalizedReportStatus === "Draft" || s.normalizedReportStatus === "Submitted for Review") return false
      return true
    }

    const currentIndex = studyList.findIndex((s) => s.id === currentStudyId)
    if (currentIndex >= 0) {
      // 1. Search forward in queue order
      for (let i = currentIndex + 1; i < studyList.length; i++) {
        if (isEligible(studyList[i])) return studyList[i]
      }
      // 2. Wrap around from top of queue
      for (let i = 0; i < currentIndex; i++) {
        if (isEligible(studyList[i])) return studyList[i]
      }
    } else {
      const found = studyList.find(isEligible)
      if (found) return found
    }
    return null
  }

  // Dispatch study report to Reporting Workspace and advance to next eligible examination (Stage 3 -> SENT_TO_REPORTING)
  const handleSendToReporting = async (studyId: string, isResend = false) => {
    if (isSubmittingToReporting) return
    setIsSubmittingToReporting(true)

    try {
      const targetQuery = (studyId || "").trim()
      const allStudiesList = RadiologyWorkflowDb.getStudies()
      const foundStudy =
        RadiologyWorkflowDb.getStudyById(targetQuery) ||
        allStudiesList.find(
          (s) =>
            (s.id && s.id.toLowerCase() === targetQuery.toLowerCase()) ||
            (s.accessionNo && s.accessionNo.toLowerCase() === targetQuery.toLowerCase()) ||
            (s.invoiceNo && s.invoiceNo.toLowerCase() === targetQuery.toLowerCase())
        ) ||
        (selectedStudy?.id?.toLowerCase() === targetQuery.toLowerCase() ? selectedStudy : null) ||
        selectedStudy

      if (!foundStudy) {
        throw new Error("Examination record not found in system.")
      }

      const study = foundStudy
      const targetId = study.id || targetQuery
      const nowIso = new Date().toISOString()
      const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

      // Ensure scan acquisition is explicitly registered as completed DONE
      try {
        RadiologyWorkflowDb.markStudyDone(
          targetId,
          `${actualProtocol || "Standard diagnostic protocol as ordered"}. Operator notes: ${operationalNotes || "Diagnostic images acquired successfully."}`,
          performingTech,
          "Senior Radiologic Technologist"
        )
      } catch {
        BillingDatabase.updateRadiologyStudy(targetId, {
          status: "Images Ready",
          normalizedStatus: "DONE",
          scanningStage: 3,
        } as any)
      }

      // 1. Persistently submit examination in backend workflow database
      RadiologyWorkflowDb.sendInvestigationToReporting(
        targetId,
        performingTech,
        isResend
          ? "Re-dispatched imaging data to Reporting Workspace."
          : `Scan complete. Protocol: ${actualProtocol}. Operator notes: ${operationalNotes}`
      )

      BillingDatabase.updateRadiologyStudy(targetId, {
        status: "Sent for Reporting" as any,
        workflowStatus: "SENT_TO_REPORTING" as any,
        scanningStage: 3,
        scanCompletedAt: study.scanCompletedAt || nowTime,
        actualProtocol,
        operationalNotes,
        technician: performingTech,
        reportStatus: "Awaiting Report" as any,
        normalizedReportStatus: "Awaiting Report" as any,
        sentToReporting: true,
        sentToReportingAt: study.sentToReportingAt || nowIso,
        transferredToReportingAt: study.transferredToReportingAt || nowIso,
        reportingQueuedAt: study.reportingQueuedAt || nowIso,
        sentToReportingBy: performingTech,
      } as any)

      // 2. Set in-memory and persistent sent tracking to immediately exclude this examination from scanning operations
      setSentStudyKeys((prev) => {
        const next = new Set(prev)
        if (targetId) next.add(targetId.toLowerCase())
        if (study.id) next.add(study.id.toLowerCase())
        return next
      })

      try {
        if (targetId) localStorage.setItem(`hospai_rad_sent_${targetId}`, "true")
        if (study.id) localStorage.setItem(`hospai_rad_sent_${study.id}`, "true")
      } catch { }

      UniversalRadiologyDb.logAudit({
        studyId: targetId,
        patientName: study.patient,
        action: isResend ? "Re-sent to Reporting Workspace" : "Sent to Reporting Workspace",
        actor: performingTech,
        role: "Senior Radiologic Technologist",
        details: `Examination ${study.study} for ${study.patient} (${study.umr || study.mrn}) sent to Reporting Workspace. Status updated to Awaiting Report.`,
      })

      UniversalRadiologyDb.releaseSuiteForStudy(targetId)

      // Clean up override stage for this study
      setOverrideStage((prev) => {
        const next = { ...prev }
        delete next[studyId]
        delete next[targetId]
        if (study.id) delete next[study.id]
        return next
      })

      try {
        localStorage.removeItem(`hospai_rad_stage_${studyId}`)
        localStorage.removeItem(`hospai_rad_stage_${targetId}`)
        if (study.id) localStorage.removeItem(`hospai_rad_stage_${study.id}`)
      } catch { }

      // Initialize and persist corresponding reporting record in template reports DB
      try {
        const templateDb = RadiologyTemplateDatabase || (typeof globalThis !== "undefined" ? (globalThis as any).RadiologyTemplateDatabase : undefined)
        templateDb?.initializeReportingRecord?.({
          studyId: targetId,
          patientName: study.patient,
          mrn: study.mrn,
          umr: study.umr || study.mrn,
          patientId: (study as any).patientId || study.umr || study.mrn,
          examinationId: (study as any).examinationId || study.accessionNo || targetId,
          testId: targetId,
          testName: study.study,
          templateId: study.templateId,
          technicianName: performingTech,
        })
      } catch (templateInitErr) {
        console.warn("RadiologyTemplateDatabase.initializeReportingRecord notice:", templateInitErr)
      }

      RadiologyWorkflowDb.invalidateCache()
      RadiologyWorkflowDb.notifyUpdate()

      // Visual feedback states
      setJustSentId(targetId)
      setSentNotice({
        id: targetId,
        patient: study.patient,
        study: study.study,
      })
      setTimeout(() => setSentNotice(null), 6000)

      // Confirmation message: "Patient examination successfully sent to Reporting Workspace."
      showToast("Patient examination successfully sent to Reporting Workspace.", "success")
      setTick((t) => t + 1)

      // Automatically advance to the next eligible examination in scanning queue after brief visual feedback
      const nextEligible =
        findNextEligibleStudy(targetId, filteredStudies) ||
        findNextEligibleStudy(targetId, studies)

      setTimeout(() => {
        setJustSentId(null)
        setIsSubmittingToReporting(false)
        if (nextEligible) {
          setSelectedStudyId(nextEligible.id)
          setActiveDetailTab("scanning_details")
          setQueueExhaustedNotice(null)
        } else {
          setSelectedStudyId(null)
          setQueueExhaustedNotice("All eligible examinations have been processed.")
        }
      }, 700)
    } catch (err: any) {
      setIsSubmittingToReporting(false)
      setJustSentId(null)
      showToast(
        err.message || "Failed to send examination to Reporting Workspace. Please try again.",
        "error"
      )
    }
  }

  // Abort / Incomplete Scan
  const handleConfirmIncomplete = () => {
    if (!selectedStudy) return
    try {
      RadiologyWorkflowDb.updateStudyStatus(selectedStudy.id, "ORDERED", performingTech)
      UniversalRadiologyDb.releaseSuiteForStudy(selectedStudy.id)
      UniversalRadiologyDb.createException({
        category: "Incomplete Examination",
        severity: "High",
        studyId: selectedStudy.id,
        patientName: selectedStudy.patient,
        umr: selectedStudy.umr,
        description: `Procedure incomplete/delayed: ${incompleteReason}. Protocol attempted: ${actualProtocol}.`,
        assignedOwner: "Radiology Supervisor",
      })
      showToast("Procedure marked as Incomplete/Delayed. Supervisor exception created.", "error")
      setShowIncompleteModal(false)
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to log incomplete examination.", "error")
    }
  }

  // Authorize Clinical Override for pending billing
  const handleAuthorizeException = () => {
    if (!selectedStudy) return
    try {
      RadiologyWorkflowDb.recordAuthorizedException({
        studyId: selectedStudy.id,
        user: performingTech,
        role: "Clinical Supervisor",
        reason: authExceptionReason,
        authorizationRef: `AUTH-OVERRIDE-${Math.floor(1000 + Math.random() * 9000)}`,
      })
      showToast(`✓ Clinical exception authorized for ${selectedStudy.patient}. Cleared to scan.`, "success")
      setShowAuthExceptionModal(false)
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to authorize exception.", "error")
    }
  }

  // Save Progress as Draft
  const handleSaveDraft = () => {
    if (!selectedStudy) return
    BillingDatabase.updateRadiologyStudy(selectedStudy.id, {
      safetyChecklist: currentChecklist,
      patientVerified: currentChecklist.twoPointId,
      safetyCleared: allChecklistPassed,
      actualProtocol,
      operationalNotes,
      technician: performingTech,
    })
    RadiologyWorkflowDb.invalidateCache()
    showToast(`✓ Scanning progress snapshot saved for ${selectedStudy.id}.`, "info")
    setTick((t) => t + 1)
  }

  return (
    <div className="space-y-4">
      {/* Floating Toast Notification - Always Visible Across Viewport & Scroll */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-[9999] max-w-md animate-in slide-in-from-top-2 fade-in duration-200 pointer-events-auto">
          <div
            className={`px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border text-[13px] font-semibold ${
              toastMessage.type === "success"
                ? "bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/25"
                : toastMessage.type === "error"
                  ? "bg-rose-600 text-white border-rose-500 shadow-rose-900/25"
                  : "bg-slate-900 text-white border-slate-700 shadow-slate-950/30"
            }`}
          >
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
            ) : toastMessage.type === "error" ? (
              <AlertTriangle className="w-5 h-5 text-rose-200 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-blue-300 shrink-0" />
            )}
            <span className="flex-1">{toastMessage.text}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-white/80 hover:text-white ml-2 text-xs cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Sent Confirmation Banner */}
      {sentNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Sent to Reporting Workspace:</strong> Examination for <strong>{sentNotice.patient}</strong> ({sentNotice.study}) has been transferred. Status updated to <strong>Awaiting Report</strong>.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateToReporting(sentNotice.id)}
              className="text-[11.5px] px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold cursor-pointer transition-colors shadow-2xs"
            >
              Open in Reporting →
            </button>
            <button
              type="button"
              onClick={() => setSentNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 text-xs font-bold px-1.5 py-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Queue Complete Notification */}
      {queueExhaustedNotice && (
        <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-[12.5px] font-medium flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0" />
            <span><strong>Queue Complete:</strong> All eligible examinations have been processed.</span>
          </div>
          <button
            onClick={() => setQueueExhaustedNotice(null)}
            className="text-purple-700 hover:text-purple-950 text-xs font-semibold px-2 py-1 rounded hover:bg-purple-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 1. Page Header & Action Toolbar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[12px] text-[#64748B] mb-1 font-medium">
            <Home className="w-3.5 h-3.5 text-slate-400" />
            <span className="hover:text-slate-700 cursor-pointer">Home</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="hover:text-slate-700 cursor-pointer">Radiology</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="text-[#1B4FD8] font-semibold">Scanning Operations</span>
          </div>

          {/* Title & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-[#1B4FD8] flex items-center justify-center shadow-2xs shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
                <circle cx="7" cy="15" r="1" />
                <circle cx="12" cy="15" r="1" />
              </svg>
            </div>
            <div>
              <h1 className="text-[22px] font-bold text-[#0F172A] tracking-tight leading-tight">
                Scanning Operations
              </h1>
              <p className="text-[12.5px] text-[#64748B]">
                Radiology Department · Paid & Cleared Examination Worklist
              </p>
            </div>
          </div>
        </div>


      </div>

      {/* ── 2. Examination Summary Cards (4 Cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Active Queue */}
        <div
          onClick={() => setStatusTab("all")}
          className={`bg-white border rounded-xl p-4 shadow-2xs flex items-center gap-3.5 cursor-pointer transition-all ${statusTab === "all" ? "border-[#1B4FD8] ring-1 ring-[#1B4FD8]" : "border-[#E2E8F0] hover:border-blue-200"
            }`}
        >
          <div className="w-11 h-11 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1B4FD8] flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5 text-[#1B4FD8]" />
          </div>
          <div>
            <div className="text-[12px] font-medium text-[#64748B]">Total Active Queue</div>
            <div className="text-[26px] font-bold text-[#0F172A] leading-tight">{counts.total}</div>
            <div className="text-[11.5px] text-emerald-600 font-semibold">Paid Queue</div>
          </div>
        </div>

        {/* Card 2: Ready to Scan */}
        <div
          onClick={() => setStatusTab("ready_to_scan")}
          className={`bg-white border rounded-xl p-4 shadow-2xs flex items-center gap-3.5 cursor-pointer transition-all ${statusTab === "ready_to_scan" ? "border-emerald-500 ring-1 ring-emerald-500" : "border-[#E2E8F0] hover:border-emerald-200"
            }`}
        >
          <div className="w-11 h-11 rounded-full bg-[#10B981] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Play className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="text-[12px] font-medium text-[#64748B]">Ready to Start</div>
            <div className="text-[26px] font-bold text-[#0F172A] leading-tight">{counts.readyToScan}</div>
            <div className="text-[11.5px] text-[#64748B]">Paid & Cleared</div>
          </div>
        </div>

        {/* Card 3: In Progress */}
        <div
          onClick={() => setStatusTab("in_progress")}
          className={`bg-white border rounded-xl p-4 shadow-2xs flex items-center gap-3.5 cursor-pointer transition-all ${statusTab === "in_progress" ? "border-blue-500 ring-1 ring-blue-500" : "border-[#E2E8F0] hover:border-blue-200"
            }`}
        >
          <div className="w-11 h-11 rounded-full bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Settings className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="text-[12px] font-medium text-[#64748B]">In Progress</div>
            <div className="text-[26px] font-bold text-[#0F172A] leading-tight">{counts.inProgress}</div>
            <div className="text-[11.5px] text-[#64748B]">Currently scanning</div>
          </div>
        </div>

        {/* Card 4: Awaiting Clearance */}
        <div
          onClick={() => setStatusTab("awaiting_clearance")}
          className={`bg-white border rounded-xl p-4 shadow-2xs flex items-center gap-3.5 cursor-pointer transition-all ${statusTab === "awaiting_clearance" ? "border-amber-500 ring-1 ring-amber-500" : "border-[#E2E8F0] hover:border-amber-200"
            }`}
          title="Orders with pending billing at Central Cashier (View in Examination Worklist)"
        >
          <div className="w-11 h-11 rounded-full bg-[#F59E0B] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Clock className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="text-[12px] font-medium text-[#64748B]">Awaiting Clearance</div>
            <div className="text-[26px] font-bold text-[#0F172A] leading-tight">{counts.awaitingClearance}</div>
            <div className="text-[11.5px] text-amber-700 font-medium">Pending Billing (Cashier)</div>
          </div>
        </div>
      </div>

      {/* ── 3. Horizontal Filter Toolbar ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
        {/* Left Quick Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <button
            onClick={() => setStatusTab("all")}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors cursor-pointer shrink-0 ${statusTab === "all" ? "bg-[#1B4FD8] text-white shadow-2xs" : "bg-transparent text-slate-700 hover:bg-slate-100"
              }`}
          >
            All ({counts.total})
          </button>

          <button
            onClick={() => setStatusTab("ready_to_scan")}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors cursor-pointer shrink-0 ${statusTab === "ready_to_scan" ? "bg-[#1B4FD8] text-white shadow-2xs" : "bg-transparent text-slate-700 hover:bg-slate-100"
              }`}
          >
            Ready to Start ({counts.readyToScan})
          </button>

          <button
            onClick={() => setStatusTab("in_progress")}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors cursor-pointer shrink-0 ${statusTab === "in_progress" ? "bg-[#1B4FD8] text-white shadow-2xs" : "bg-transparent text-slate-700 hover:bg-slate-100"
              }`}
          >
            In Progress ({counts.inProgress})
          </button>
        </div>

        {/* Right Search & Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by patient name, UMR, test..."
              className="w-56 sm:w-64 pl-8 pr-3 py-1.5 text-[12px] border border-[#DDE2EC] rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1B4FD8]"
            />
          </div>

          {/* Modality Filter Dropdown */}
          <select
            value={modalityFilter}
            onChange={(e) => setModalityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] border border-[#DDE2EC] rounded-lg bg-white text-slate-700 focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
          >
            <option value="all">All Modalities</option>
            <option value="X-Ray">X-Ray</option>
            <option value="CT Scan">CT Scan</option>
            <option value="MRI">MRI</option>
            <option value="Ultrasound (USG)">Ultrasound</option>
            <option value="Mammography">Mammography</option>
            <option value="Doppler">Doppler</option>
            <option value="DEXA">DEXA</option>
          </select>

          {/* Suites Dropdown */}
          <select
            value={suiteFilter}
            onChange={(e) => setSuiteFilter(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] border border-[#DDE2EC] rounded-lg bg-white text-slate-700 focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
          >
            <option value="all">All Suites</option>
            <option value="Suite 1">Suite 1</option>
            <option value="Suite 2">Suite 2</option>
            <option value="Suite 3">Suite 3</option>
            <option value="CT Suite 1">CT Suite 1</option>
            <option value="CT Suite 2">CT Suite 2</option>
            <option value="MRI Suite">MRI Suite</option>
            <option value="USG Suite">USG Suite</option>
            <option value="Mammo Suite">Mammo Suite</option>
          </select>

          {/* Reset Filter Button */}
          <button
            onClick={() => {
              setModalityFilter("all")
              setSuiteFilter("all")
              setPaymentFilter("all")
              setSearchQuery("")
              setStatusTab("all")
            }}
            className="p-2 border border-[#DDE2EC] rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
            title="Reset Filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Notice Banner if Awaiting Clearance Filter Selected ── */}
      {statusTab === "awaiting_clearance" && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12.5px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong>Payment Pending at Central Cashier ({counts.awaitingClearance} Orders):</strong> Per hospital safety policy, only PAID and CLEARED patients appear in the active scanning queue. When Billing records payment, examinations automatically appear here.
            </div>
          </div>
          <button
            onClick={() => onNavigateToWorklist?.()}
            className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded-lg text-xs whitespace-nowrap cursor-pointer transition-colors shadow-2xs"
          >
            View in Examination Worklist →
          </button>
        </div>
      )}

      {/* ── 4. Main Two-Panel Workspace (Left: Worklist 60% | Right: Workspace 40%) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* ── LEFT PANEL: Examination Worklist (col-span-7) ── */}
        <div className="xl:col-span-7 bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size > 0 && selectedRowIds.size === paginatedStudies.length}
                      onChange={toggleAllRowsOnPage}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-[#1B4FD8] cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-2 w-7">#</th>
                  <th className="py-2.5 px-3">Patient Name</th>
                  <th className="py-2.5 px-3">UMR No.</th>
                  <th className="py-2.5 px-3">Examination / Test</th>
                  <th className="py-2.5 px-3">Modality</th>
                  <th className="py-2.5 px-3">Suite</th>
                  <th className="py-2.5 px-3">Billing</th>
                  <th className="py-2.5 px-3">Scanning Status</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                {paginatedStudies.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      {statusTab === "awaiting_clearance"
                        ? "Pending payment orders are listed in Examination Worklist. No pending orders in scanning queue."
                        : "No eligible paid examinations match the active filters."}
                    </td>
                  </tr>
                ) : (
                  paginatedStudies.map((study, idx) => {
                    const isSelected = selectedStudy?.id === study.id
                    const isChecked = selectedRowIds.has(study.id) || isSelected
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1
                    const statusCategory = getStudyCategory(study)
                    const isAuthOverride = study.billingStatus === "Authorized Exception" || Boolean(study.authorizedException)

                    return (
                      <tr
                        key={study.id}
                        onClick={() => setSelectedStudyId(study.id)}
                        className={`transition-colors cursor-pointer ${isSelected
                            ? "bg-[#EEF4FF] hover:bg-[#EEF4FF]"
                            : "hover:bg-slate-50/80"
                          }`}
                      >
                        {/* Checkbox */}
                        <td className="py-2.5 px-3 text-center" onClick={(e) => toggleRowCheckbox(study.id, e)}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => { }}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#1B4FD8] cursor-pointer"
                          />
                        </td>

                        {/* Serial Number */}
                        <td className="py-2.5 px-2 text-slate-500 font-medium">{rowNumber}</td>

                        {/* Patient Name */}
                        <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                          {study.patient}
                        </td>

                        {/* UMR No. */}
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap text-[11.5px]">
                          {study.umr || study.mrn || "UMR" + (10030 + idx)}
                        </td>

                        {/* Examination / Test */}
                        <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                          {study.study}
                        </td>

                        {/* Modality */}
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {study.modality === "XR"
                            ? study.study.toLowerCase().includes("mammo")
                              ? "Mammography"
                              : "X-Ray"
                            : study.modality === "CT"
                              ? "CT"
                              : study.modality === "MR"
                                ? "MRI"
                                : study.modality === "US"
                                  ? "Ultrasound"
                                  : getCanonicalRadiologyModality(study)}
                        </td>

                        {/* Suite */}
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {study.room || (study.modality === "CT" ? "CT Suite 1" : study.modality === "MR" ? "MRI Suite" : "Suite " + (idx % 3 + 1))}
                        </td>

                        {/* Billing Status Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isAuthOverride ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF6E7] text-[#B54708] border border-[#FCDCA5]" title="Clinical Override Exception Clearance">
                              Cleared (Override)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E8F8F0] text-[#0E7A4A] border border-[#A7E6C7]">
                              Paid
                            </span>
                          )}
                        </td>

                        {/* Scanning Status Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {statusCategory === "in_progress" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] flex items-center gap-1 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                              Scanning In Progress
                            </span>
                          ) : statusCategory === "completed" ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Scanning Completed
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E8F8F0] text-[#0E7A4A] border border-[#A7E6C7]">
                              Ready to Start
                            </span>
                          )}
                        </td>

                        {/* Action buttons */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5 relative">
                            <button
                              onClick={() => setSelectedStudyId(study.id)}
                              className="px-2.5 py-1 bg-white hover:bg-blue-50 text-[#1B4FD8] border border-blue-200 text-[11.5px] font-semibold rounded cursor-pointer transition-colors"
                            >
                              Open
                            </button>

                            {/* Quick Action Button */}
                            {statusCategory === "ready_to_scan" && (
                              <button
                                onClick={() => handleStartScan(study)}
                                className="px-2 py-1 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11px] font-semibold rounded cursor-pointer transition-colors flex items-center gap-1"
                                title="Start Scanning Procedure"
                              >
                                <Play className="w-3 h-3 fill-white" />
                                <span>Scan</span>
                              </button>
                            )}

                            {statusCategory === "in_progress" && (
                              <button
                                onClick={() => {
                                  setSelectedStudyId(study.id)
                                  setShowCompleteModal(true)
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded cursor-pointer transition-colors flex items-center gap-1 shadow-2xs"
                                title="Mark Scanning as Completed"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Complete</span>
                              </button>
                            )}

                            {statusCategory === "completed" && (
                              <button
                                onClick={() => handleSendToReporting(study.id)}
                                disabled={isSubmittingToReporting || justSentId === study.id}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 shadow-2xs ${
                                  justSentId === study.id
                                    ? "bg-emerald-600 text-white"
                                    : "bg-[#1B4FD8] hover:bg-[#1740B4] text-white cursor-pointer"
                                }`}
                                title="Send to Reporting Workspace"
                              >
                                {justSentId === study.id ? (
                                  <>
                                    <Check className="w-3 h-3 stroke-[3]" />
                                    <span>Sent</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3 h-3" />
                                    <span>Send</span>
                                  </>
                                )}
                              </button>
                            )}

                            {/* Overflow Actions Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionMenuOpenId(actionMenuOpenId === study.id ? null : study.id)
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                              title="More options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {/* Overflow Dropdown Menu */}
                            {actionMenuOpenId === study.id && (
                              <div
                                className="absolute right-0 top-7 z-40 bg-white border border-slate-200 shadow-lg rounded-lg py-1 w-48 text-left text-[12px] font-medium"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {statusCategory === "ready_to_scan" && (
                                  <button
                                    onClick={() => {
                                      setActionMenuOpenId(null)
                                      handleStartScan(study)
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-blue-700 hover:bg-blue-50 flex items-center gap-2 cursor-pointer font-semibold"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-blue-600" />
                                    <span>Start Scanning</span>
                                  </button>
                                )}

                                {statusCategory === "in_progress" && (
                                  <button
                                    onClick={() => {
                                      setActionMenuOpenId(null)
                                      setSelectedStudyId(study.id)
                                      setShowCompleteModal(true)
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer font-semibold"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Mark Completed</span>
                                  </button>
                                )}

                                {statusCategory === "completed" && (
                                  <button
                                    onClick={() => {
                                      setActionMenuOpenId(null)
                                      handleSendToReporting(study.id)
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-blue-700 hover:bg-blue-50 flex items-center gap-2 cursor-pointer font-semibold"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Send to Reporting</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setActionMenuOpenId(null)
                                    setSelectedStudyId(study.id)
                                    setActiveDetailTab("patient_info")
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer border-t border-slate-100"
                                >
                                  <User className="w-3.5 h-3.5" />
                                  <span>Patient Profile</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Footer */}
          <div className="p-3 bg-white border-t border-[#E2E8F0] flex items-center justify-between text-[12px] text-[#64748B]">
            <div>
              Showing {paginatedStudies.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{" "}
              {Math.min(currentPage * pageSize, sortedStudies.length)} of {sortedStudies.length} paid examinations
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="w-7 h-7 rounded border border-[#DDE2EC] flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                ‹
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`w-7 h-7 rounded font-semibold text-[12px] flex items-center justify-center cursor-pointer transition-colors ${currentPage === pg
                      ? "bg-[#1B4FD8] text-white"
                      : "border border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  {pg}
                </button>
              ))}

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="w-7 h-7 rounded border border-[#DDE2EC] flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Selected Examination Details (col-span-5) ── */}
        <div className="xl:col-span-5 bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden flex flex-col">
          {selectedStudy ? (
            <>
              {/* Dark Navy Patient Header Banner */}
              <div className="bg-[#0F172A] p-4 text-white">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-bold text-slate-400">
                      {selectedStudy.id}
                    </span>
                    {getStudyCategory(selectedStudy) === "in_progress" && (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#1B4FD8] text-white flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        Scanning In Progress
                      </span>
                    )}
                    {getStudyCategory(selectedStudy) === "ready_to_scan" && (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#10B981] text-white">
                        Ready to Start
                      </span>
                    )}
                    {getStudyCategory(selectedStudy) === "completed" && (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#059669] text-white flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        Scanning Completed
                      </span>
                    )}
                  </div>

                  <span className="text-[13px] font-semibold text-slate-200">
                    {selectedStudy.room || "Scan Suite 3"}
                  </span>
                </div>

                <h2 className="text-[20px] font-bold text-white mt-0.5 tracking-tight">
                  {selectedStudy.patient}
                </h2>

                <div className="text-[12px] text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                  <span>UMR: {selectedStudy.umr || selectedStudy.mrn || "UMR10030"}</span>
                  <span className="text-slate-600">|</span>
                  <span>{selectedStudy.gender || "Male"}</span>
                  <span className="text-slate-600">|</span>
                  <span>28 Years</span>
                  <span className="text-slate-600">|</span>
                  <span>OP No: {selectedStudy.encounterId || selectedStudy.opNumber || "OP25091430"}</span>
                </div>
              </div>

              {/* Compact Information Cards (4 Fields) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50/70 border-b border-[#E2E8F0] text-[12px]">
                {/* 1. Examination */}
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded bg-blue-100 text-blue-700 shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#64748B]">Examination</div>
                    <div className="font-semibold text-slate-900 leading-tight">{selectedStudy.study}</div>
                  </div>
                </div>

                {/* 2. Modality */}
                <div>
                  <div className="text-[11px] text-[#64748B]">Modality</div>
                  <div className="font-semibold text-slate-900 leading-tight">
                    {selectedStudy.modality === "XR"
                      ? selectedStudy.study.toLowerCase().includes("mammo")
                        ? "Mammography"
                        : "X-Ray"
                      : selectedStudy.modality === "CT"
                        ? "CT"
                        : selectedStudy.modality === "MR"
                          ? "MRI"
                          : selectedStudy.modality === "US"
                            ? "Ultrasound"
                            : getCanonicalRadiologyModality(selectedStudy)}
                  </div>
                </div>

                {/* 3. Ordered By */}
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded bg-slate-100 text-slate-600 shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-[#64748B]">Ordered By</div>
                    <div className="font-semibold text-slate-900 leading-tight">
                      {selectedStudy.provider || "Dr. Neha Patel"}
                    </div>
                    <div className="text-[10.5px] text-[#64748B]">General Medicine</div>
                  </div>
                </div>

                {/* 4. Ordered Date */}
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded bg-slate-100 text-slate-600 shrink-0 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-[#64748B]">Ordered Date</div>
                    <div className="font-semibold text-slate-900 leading-tight">
                      {selectedStudy.orderDate || "10 Sep 2026"}
                    </div>
                    <div className="text-[10.5px] text-[#64748B]">
                      {selectedStudy.ordered ? selectedStudy.ordered.split(" ").slice(-2).join(" ") : "09:15 AM"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detail Tabs Bar */}
              <div className="flex border-b border-[#E2E8F0] px-4 pt-1 bg-white text-[12.5px] font-semibold gap-6 overflow-x-auto">
                <button
                  onClick={() => setActiveDetailTab("scanning_details")}
                  className={`pb-2.5 border-b-2 cursor-pointer transition-colors ${activeDetailTab === "scanning_details"
                      ? "border-[#1B4FD8] text-[#1B4FD8]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  Scanning Details
                </button>

                <button
                  onClick={() => setActiveDetailTab("patient_info")}
                  className={`pb-2.5 border-b-2 cursor-pointer transition-colors ${activeDetailTab === "patient_info"
                      ? "border-[#1B4FD8] text-[#1B4FD8]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  Patient Information
                </button>

                <button
                  onClick={() => setActiveDetailTab("clinical_indication")}
                  className={`pb-2.5 border-b-2 cursor-pointer transition-colors ${activeDetailTab === "clinical_indication"
                      ? "border-[#1B4FD8] text-[#1B4FD8]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  Clinical Indication
                </button>

                <button
                  onClick={() => setActiveDetailTab("attachments")}
                  className={`pb-2.5 border-b-2 cursor-pointer transition-colors ${activeDetailTab === "attachments"
                      ? "border-[#1B4FD8] text-[#1B4FD8]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  Attachments (2)
                </button>
              </div>

              {/* Tab Body */}
              <div className="p-4 space-y-4 flex-1">
                {activeDetailTab === "scanning_details" && (
                  <>
                    {/* ── EXACTLY THREE STAGES SCANNING PROGRESS STEPPER ── */}
                    <div className="bg-slate-50/80 border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="text-[13px] font-bold text-slate-900">
                          Scanning Progress Tracking
                        </div>
                        <span className="text-[11.5px] font-semibold text-[#1B4FD8] bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                          Stage {currentScanningStage} of 3: {
                            currentScanningStage === 1 ? "Ready to Start" :
                              currentScanningStage === 2 ? "Scanning In Progress" :
                                "Scanning Completed"
                          }
                        </span>
                      </div>

                      {/* Stepper Bar - Exactly 3 Stages */}
                      <div className="flex items-center justify-between relative px-6 mb-2">
                        {/* Connecting Line 1 (Between Stage 1 & 2) */}
                        <div
                          className={`absolute top-4 left-[20%] right-[52%] h-0.5 z-0 transition-colors ${currentScanningStage >= 2 ? "bg-[#1B4FD8]" : "bg-slate-200"
                            }`}
                        />
                        {/* Connecting Line 2 (Between Stage 2 & 3) */}
                        <div
                          className={`absolute top-4 left-[52%] right-[20%] h-0.5 z-0 transition-colors ${currentScanningStage >= 3 ? "bg-[#10B981]" : "bg-slate-200"
                            }`}
                        />

                        {/* Stage 1: Ready to Start */}
                        <div className="flex flex-col items-center z-10 text-center w-28">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] shadow-xs transition-colors ${currentScanningStage >= 2
                                ? "bg-[#1B4FD8] text-white"
                                : "bg-[#1B4FD8] text-white ring-4 ring-blue-100"
                              }`}
                          >
                            {currentScanningStage >= 2 ? <Check className="w-4 h-4 stroke-[3]" /> : "1"}
                          </div>
                          <span className={`text-[12px] font-bold mt-1.5 leading-tight ${currentScanningStage === 1 ? "text-[#1B4FD8]" : "text-slate-900"
                            }`}>
                            1. Ready to Start
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {selectedStudy.ordered ? selectedStudy.ordered.split(" ").slice(-2).join(" ") : "09:15 AM"}
                          </span>
                        </div>

                        {/* Stage 2: Scanning In Progress */}
                        <div className="flex flex-col items-center z-10 text-center w-36">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] shadow-xs transition-colors ${currentScanningStage >= 3
                                ? "bg-[#1B4FD8] text-white"
                                : currentScanningStage === 2
                                  ? "bg-[#1B4FD8] text-white ring-4 ring-blue-100"
                                  : "bg-white border-2 border-slate-300 text-slate-400"
                              }`}
                          >
                            {currentScanningStage >= 3 ? (
                              <Check className="w-4 h-4 stroke-[3]" />
                            ) : currentScanningStage === 2 ? (
                              <Activity className="w-4 h-4 animate-pulse" />
                            ) : (
                              "2"
                            )}
                          </div>
                          <span className={`text-[12px] font-bold mt-1.5 leading-tight ${currentScanningStage === 2
                              ? "text-[#1B4FD8]"
                              : currentScanningStage >= 3
                                ? "text-slate-900"
                                : "text-slate-400"
                            }`}>
                            2. In Progress
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {selectedStudy.scanStartedAt || (currentScanningStage >= 2 ? "Active" : "—")}
                          </span>
                        </div>

                        {/* Stage 3: Scanning Completed */}
                        <div className="flex flex-col items-center z-10 text-center w-28">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] shadow-xs transition-colors ${currentScanningStage >= 3
                                ? "bg-[#10B981] text-white ring-4 ring-emerald-100"
                                : "bg-white border-2 border-slate-300 text-slate-400"
                              }`}
                          >
                            {currentScanningStage >= 3 ? <Check className="w-4 h-4 stroke-[3]" /> : "3"}
                          </div>
                          <span className={`text-[12px] font-bold mt-1.5 leading-tight ${currentScanningStage >= 3 ? "text-emerald-700" : "text-slate-400"
                            }`}>
                            3. Completed
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {selectedStudy.scanCompletedAt || (currentScanningStage >= 3 ? "Done" : "—")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ── STAGE 1: READY TO START (Identity Verification & Safety Checklist) ── */}
                    {currentScanningStage === 1 && (
                      <div className="space-y-3.5">
                        {/* Patient Identity & Examination Verification Box */}
                        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-[12px] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-950 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-[#1B4FD8]" />
                              Patient Identity & Examination Verification
                            </span>
                            <span className="text-[11px] font-semibold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                              Stage 1 Verification
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-blue-100 text-[11.5px]">
                            <div>
                              <span className="text-slate-500 block">Patient Name:</span>
                              <span className="font-bold text-slate-900">{selectedStudy.patient}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">UMR Number:</span>
                              <span className="font-mono font-bold text-slate-900">{selectedStudy.umr || selectedStudy.mrn}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Scheduled Examination:</span>
                              <span className="font-semibold text-slate-800">{selectedStudy.study}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Suite / Room:</span>
                              <span className="font-semibold text-slate-800">{selectedStudy.room || "Suite 3"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Mandatory Pre-Procedure Safety Checklist */}
                        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900">
                              <ShieldCheck className="w-4 h-4 text-[#1B4FD8]" />
                              <span>Mandatory Pre-Procedure Safety Verification</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleVerifyAllChecks}
                                className="text-[11px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
                              >
                                Verify All
                              </button>
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${allChecklistPassed
                                    ? "bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]"
                                    : "bg-[#FEF6E7] text-[#B54708] border border-[#FCDCA5]"
                                  }`}
                              >
                                {allChecklistPassed ? "✓ Safety Cleared" : "⚠️ Safety Pending"}
                              </span>
                            </div>
                          </div>

                          {/* 2-Column Checklist */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12px]">
                            {/* 1. Two-point ID */}
                            <div
                              onClick={() => toggleChecklistItem("twoPointId")}
                              className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors"
                            >
                              {currentChecklist.twoPointId ? (
                                <CheckSquare className="w-4 h-4 text-[#1B4FD8] shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <span className="text-slate-800 font-medium">
                                Two-point Patient ID, UMR & Wristband Confirmed
                              </span>
                            </div>

                            {/* 2. Clinical Indication */}
                            <div
                              onClick={() => toggleChecklistItem("protocolReconciled")}
                              className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors"
                            >
                              {currentChecklist.protocolReconciled ? (
                                <CheckSquare className="w-4 h-4 text-[#1B4FD8] shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <span className="text-slate-800 font-medium">
                                Clinical Indication & Protocol Reconciled
                              </span>
                            </div>

                            {/* 3. Pregnancy / Radiation */}
                            <div
                              onClick={() => toggleChecklistItem("pregnancySafety")}
                              className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors"
                            >
                              {currentChecklist.pregnancySafety ? (
                                <CheckSquare className="w-4 h-4 text-[#1B4FD8] shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <span className="text-slate-800 font-medium">
                                Pregnancy / Radiation Safety Clearance
                              </span>
                            </div>

                            {/* 4. IV Contrast & Allergy */}
                            <div
                              onClick={() => toggleChecklistItem("contrastAllergy")}
                              className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors"
                            >
                              {currentChecklist.contrastAllergy ? (
                                <CheckSquare className="w-4 h-4 text-[#1B4FD8] shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <span className="text-slate-800 font-medium">
                                IV Contrast & Creatinine / Allergy Verified
                              </span>
                            </div>

                            {/* 5. Ferromagnetic Implants */}
                            <div
                              onClick={() => toggleChecklistItem("metallicImplant")}
                              className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors"
                            >
                              {currentChecklist.metallicImplant ? (
                                <CheckSquare className="w-4 h-4 text-[#1B4FD8] shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <span className="text-slate-800 font-medium">
                                Ferromagnetic / Metallic Implants Cleared
                              </span>
                            </div>

                            {/* 6. IV Access Patency */}
                            <div
                              onClick={() => toggleChecklistItem("ivAccess")}
                              className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors"
                            >
                              {currentChecklist.ivAccess ? (
                                <CheckSquare className="w-4 h-4 text-[#1B4FD8] shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 shrink-0" />
                              )}
                              <span className="text-slate-800 font-medium">
                                IV Access Patency (if contrast examination)
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stage 1 Actions: Start Scanning */}
                        <div className="pt-2 border-t border-slate-100 space-y-3">
                          {!allChecklistPassed ? (
                            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[12px] flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Pre-procedure safety verification pending. Complete safety checks before starting scan.</span>
                              </div>
                              <button
                                onClick={handleVerifyAllChecks}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold cursor-pointer transition-colors"
                              >
                                Clear All Checks
                              </button>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[12px] flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>✓ Pre-procedure safety verification cleared. Patient verified and ready for scan.</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleStartScan(selectedStudy)
                              }}
                              className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white font-bold px-6 py-2.5 rounded-lg text-[13px] flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
                            >
                              <Play className="w-4 h-4 fill-white" />
                              <span>Start Scanning →</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setShowIncompleteModal(true)}
                                className="bg-white hover:bg-red-50 text-red-600 border border-red-300 font-semibold px-3 py-2 rounded-lg text-[12px] flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                <span>Incomplete / Delay</span>
                              </button>

                              <button
                                onClick={handleSaveDraft}
                                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold px-3 py-2 rounded-lg text-[12px] flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Save className="w-3.5 h-3.5 text-slate-500" />
                                <span>Save Progress</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── STAGE 2: SCANNING IN PROGRESS ── */}
                    {currentScanningStage === 2 && (
                      <div className="space-y-3.5">
                        {/* Active Scanning Status Card */}
                        <div className="p-4 rounded-xl bg-blue-50/90 border border-blue-200 text-blue-950 text-[12.5px] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-blue-900">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                              <span>Scanning In Progress</span>
                            </div>
                            <span className="text-[11px] font-bold text-blue-700 bg-white px-2.5 py-0.5 rounded border border-blue-200">
                              Active Acquisition
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 bg-white p-3 rounded-lg border border-blue-100 text-[12px]">
                            <div>
                              <span className="text-slate-500 block text-[11px]">Examination:</span>
                              <span className="font-bold text-slate-900">{selectedStudy.study}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[11px]">Modality:</span>
                              <span className="font-semibold text-slate-900">{selectedStudy.modality}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[11px]">Scanning Start Time:</span>
                              <span className="font-mono font-bold text-[#1B4FD8]">
                                {selectedStudy.scanStartedAt || "09:35 AM"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[11px]">Suite:</span>
                              <span className="font-semibold text-slate-900">{selectedStudy.room || "Suite 3"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Stage 2 Actions: Mark as Completed */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setShowCompleteModal(true)
                            }}
                            className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white font-bold px-6 py-2.5 rounded-lg text-[13px] flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Mark as Completed →</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowIncompleteModal(true)}
                              className="bg-white hover:bg-red-50 text-red-600 border border-red-300 font-semibold px-3 py-2 rounded-lg text-[12px] flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                              <span>Incomplete / Delay</span>
                            </button>

                            <button
                              onClick={handleSaveDraft}
                              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold px-3 py-2 rounded-lg text-[12px] flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Save className="w-3.5 h-3.5 text-slate-500" />
                              <span>Save Progress</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── STAGE 3: SCANNING COMPLETED & SEND TO REPORTING ── */}
                    {currentScanningStage === 3 && (
                      <div className="space-y-3.5">
                        {/* Successful Completion Indicator Card */}
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-[12.5px] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-emerald-900 text-[13px]">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                              <span>Scan Acquisition Completed Successfully</span>
                            </div>
                            <span className="text-[11px] font-bold text-emerald-700 bg-white px-2.5 py-0.5 rounded border border-emerald-200">
                              Ready for Handoff
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 bg-white p-3 rounded-lg border border-emerald-100 text-[12px]">
                            <div>
                              <span className="text-slate-500 block text-[11px]">Scanning Start Time:</span>
                              <span className="font-mono font-bold text-slate-800">
                                {selectedStudy.scanStartedAt || "09:35 AM"}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[11px]">Scanning Completion Time:</span>
                              <span className="font-mono font-bold text-emerald-700">
                                {selectedStudy.scanCompletedAt || "09:50 AM"}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-500 block text-[11px]">Protocol Performed:</span>
                              <span className="font-medium text-slate-900">
                                {selectedStudy.actualProtocol || actualProtocol}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-500 block text-[11px]">Operational Scanning Notes:</span>
                              <span className="font-medium text-slate-800">
                                {selectedStudy.operationalNotes || operationalNotes}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stage 3 Actions: PROMINENT SEND TO REPORTING WORKSPACE BUTTON */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleSendToReporting(selectedStudy.id)
                            }}
                            disabled={isSubmittingToReporting || justSentId === selectedStudy.id}
                            className={`w-full sm:w-auto font-bold px-6 py-2.5 rounded-lg text-[13px] flex items-center justify-center gap-2 shadow-sm transition-all ${
                              justSentId === selectedStudy.id
                                ? "bg-emerald-600 text-white"
                                : "bg-[#1B4FD8] hover:bg-[#1740B4] text-white cursor-pointer disabled:opacity-50"
                            }`}
                          >
                            {justSentId === selectedStudy.id ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-white" />
                                <span>Sent to Reporting Workspace ✓</span>
                              </>
                            ) : isSubmittingToReporting ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Sending to Reporting Workspace...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                <span>Send to Reporting Workspace →</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => setShowCompleteModal(true)}
                            className="text-slate-600 hover:text-slate-900 text-xs font-semibold px-3 py-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer"
                          >
                            Edit Scan Details
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Patient Information Tab */}
                {activeDetailTab === "patient_info" && (
                  <div className="space-y-3 text-[12px]">
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Full Name</span>
                        <span className="font-bold text-slate-900">{selectedStudy.patient}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">UMR Number</span>
                        <span className="font-mono font-bold text-slate-900">{selectedStudy.umr || selectedStudy.mrn}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Age & Gender</span>
                        <span className="font-semibold text-slate-800">28 Yrs · {selectedStudy.gender || "Male"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Blood Group</span>
                        <span className="font-semibold text-slate-800">B+ Positive</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Encounter No.</span>
                        <span className="font-mono text-slate-800">{selectedStudy.encounterId || "OP25091430"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Department / Pathway</span>
                        <span className="font-semibold text-slate-800">Outpatient · General Medicine</span>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center gap-2 text-slate-700 font-semibold">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>Contact: +91 98490 23412</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>Address: Jubilee Hills, Road No. 36, Hyderabad</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clinical Indication Tab */}
                {activeDetailTab === "clinical_indication" && (
                  <div className="space-y-3 text-[12px]">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Ordering Physician Clinical Notes
                      </span>
                      <p className="text-slate-800 leading-relaxed font-medium">
                        {selectedStudy.indication ||
                          "Patient presenting with 3-week history of dry cough, intermittent low-grade fever, and mild pleuritic chest tightness. No hemoptysis. Reconcile PA projection with prior baseline if available."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[11.5px]">
                      <div className="p-2.5 rounded border border-slate-200 bg-white">
                        <span className="text-slate-500 block">Provisional Diagnosis</span>
                        <span className="font-bold text-slate-900">Acute Bronchitis (J20.9)</span>
                      </div>
                      <div className="p-2.5 rounded border border-slate-200 bg-white">
                        <span className="text-slate-500 block">Allergies / Alerts</span>
                        <span className="font-bold text-emerald-700">NKDA · No Known Drug Allergies</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Attachments Tab */}
                {activeDetailTab === "attachments" && (
                  <div className="space-y-2.5 text-[12px]">
                    <div className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-blue-50 text-blue-700 rounded">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">Doctor Requisition Slip.pdf</div>
                          <div className="text-[10.5px] text-slate-500">Signed by Dr. Neha Patel · 240 KB</div>
                        </div>
                      </div>
                      <button
                        onClick={() => showToast("Viewing requisition order preview...", "info")}
                        className="px-2.5 py-1 text-[11.5px] font-semibold text-[#1B4FD8] bg-blue-50 hover:bg-blue-100 rounded cursor-pointer"
                      >
                        Preview
                      </button>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-purple-50 text-purple-700 rounded">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">Baseline Chest Radiograph (2025).dcm</div>
                          <div className="text-[10.5px] text-slate-500">Prior PACS Imaging Study · 18 MB</div>
                        </div>
                      </div>
                      <button
                        onClick={() => showToast("Loading PACS comparison view...", "info")}
                        className="px-2.5 py-1 text-[11.5px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded cursor-pointer"
                      >
                        Compare
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 space-y-3 my-auto">
              {queueExhaustedNotice ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto shadow-2xs">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-base text-slate-800">All eligible examinations have been processed.</h4>
                  <p className="text-[12.5px] text-slate-500 max-w-xs mx-auto">
                    All active examinations in the scanning queue have been completed and sent to the Reporting Workspace. Select any row from the worklist to review past records.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <p className="text-slate-500 text-[13px]">
                    Select an examination from the worklist to view scanning details.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Complete Scan Dialog Modal ── */}
      {showCompleteModal && selectedStudy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Confirm Scan Completion</h3>
              <button onClick={() => setShowCompleteModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-[12.5px]">
              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Performing Technologist</label>
                <input
                  type="text"
                  value={performingTech}
                  onChange={(e) => setPerformingTech(e.target.value)}
                  className="w-full p-2 border rounded-lg text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Protocol Actually Performed</label>
                <input
                  type="text"
                  value={actualProtocol}
                  onChange={(e) => setActualProtocol(e.target.value)}
                  className="w-full p-2 border rounded-lg text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Operational Scanning Notes</label>
                <textarea
                  value={operationalNotes}
                  onChange={(e) => setOperationalNotes(e.target.value)}
                  className="w-full h-20 p-2 border rounded-lg text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowCompleteModal(false)}
                  className="px-4 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmComplete}
                  className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded-lg font-bold cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Completed</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Incomplete / Delay Scan Modal ── */}
      {showIncompleteModal && selectedStudy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-red-300 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-red-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Log Incomplete / Delay Exception</h3>
              <button onClick={() => setShowIncompleteModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-[12.5px]">
              <p className="text-slate-700">
                Specify clinical/technical reason for delaying <strong>{selectedStudy.study}</strong>:
              </p>
              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Primary Reason</label>
                <select
                  value={incompleteReason}
                  onChange={(e) => setIncompleteReason(e.target.value)}
                  className="w-full p-2 border rounded-lg text-slate-900 focus:outline-none focus:border-red-600 cursor-pointer"
                >
                  <option value="Patient unable to tolerate scan">Patient unable to tolerate scan</option>
                  <option value="Severe motion artifact / claustrophobia">Severe motion artifact / claustrophobia</option>
                  <option value="Contrast adverse reaction / allergy">Contrast adverse reaction / allergy</option>
                  <option value="Equipment maintenance / gantry calibration">Equipment maintenance / gantry calibration</option>
                  <option value="Patient hemodynamically unstable">Patient hemodynamically unstable</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowIncompleteModal(false)}
                  className="px-4 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmIncomplete}
                  className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold cursor-pointer"
                >
                  Log Exception
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Authorize Clinical Exception Modal ── */}
      {showAuthExceptionModal && selectedStudy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-amber-300 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-amber-800 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Authorize Clinical Scan Override</h3>
              <button onClick={() => setShowAuthExceptionModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-[12.5px]">
              <p className="text-slate-700">
                Authorizing scan override for <strong>{selectedStudy.patient}</strong> (
                {selectedStudy.study}) with pending billing (₹{selectedStudy.price}):
              </p>
              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Clinical Justification</label>
                <select
                  value={authExceptionReason}
                  onChange={(e) => setAuthExceptionReason(e.target.value)}
                  className="w-full p-2 border rounded-lg text-slate-900 focus:outline-none focus:border-amber-600 cursor-pointer"
                >
                  <option value="Emergency clinical urgency / supervisor authorization">
                    Emergency clinical urgency / supervisor authorization
                  </option>
                  <option value="Inpatient clinical pathway clearance (billed at discharge)">
                    Inpatient clinical pathway clearance (billed at discharge)
                  </option>
                  <option value="Corporate / TPA pre-authorization in progress">
                    Corporate / TPA pre-authorization in progress
                  </option>
                  <option value="Institutional hardship waiver">Institutional hardship waiver</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowAuthExceptionModal(false)}
                  className="px-4 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAuthorizeException}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold cursor-pointer"
                >
                  Authorize Override
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
