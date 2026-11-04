import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  FileText,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  Save,
  AlertTriangle,
  History,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  User,
  Upload,
  UploadCloud,
  Eye,
  Layers,
  ChevronLeft,
  X,
  Plus,
  RotateCcw,
  Sparkles,
  FileCheck,
  Check,
  ExternalLink,
  Calendar,
  Filter,
  SlidersHorizontal,
  Home,
  CheckSquare,
  Lock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  Maximize2,
  Minimize2,
  Minus,
  Columns,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react"
import {
  RadiologyWorkflowDb,
  ExtendedRadiologyRecord,
  RadiologyReportStatus,
} from "../../services/radiologyWorkflowDb"
import {
  RadiologyTemplateDatabase,
  RadiologyTemplate,
  RadiologyTest,
  TemplateSection,
  parseSectionsFromContent,
  isUnwantedTicketRoutingContent,
} from "../../services/radiologyTemplateDb"
import { UniversalRadiologyDb } from "../../services/universalRadiologyDb"
import { getCanonicalRadiologyModality } from "../../utils/testClassifier"
import RadiologyReportPdfModal from "./RadiologyReportPdfModal"
import TemplateImporterModal from "./TemplateImporterModal"
import { db } from "../../services/db"

interface RadiologyReportingViewProps {
  initialStudyId?: string | null
  initialFilter?: string
  currentTechnician?: string
  currentRole?: string
  onNavigateToWorklist?: () => void
  onNavigateToTemplates?: () => void
  onNavigateToFinalized?: () => void
}

const COMMON_APPROVED_PHRASES = [
  {
    label: "Normal Chest PA",
    text: "Lungs are clear bilaterally without focal consolidation, pneumothorax, or pleural effusion. Cardiomediastinal silhouette and hilar contours are within normal limits. Visualized bony structures and soft tissues are unremarkable.",
  },
  {
    label: "Normal CT Brain",
    text: "No evidence of acute intracranial hemorrhage, mass effect, or midline shift. Ventricles, sulci, and cisterns are within normal age-appropriate physiological limits. Gray-white matter differentiation is preserved. Visualized calvarium and paranasal sinuses are clear.",
  },
  {
    label: "Normal USG Abdomen",
    text: "Liver is normal in size and echotexture with no focal lesions. Gallbladder is normal without calculi or wall thickening. Both kidneys are normal in size and corticomedullary differentiation without calculi or hydronephrosis. Spleen and pancreas appear unremarkable. No free fluid in abdomen or pelvis.",
  },
  {
    label: "Normal Spine",
    text: "Vertebral body heights and alignment are preserved. Intervertebral disc spaces are maintained. No acute fracture or listhesis. Visualized posterior elements and paravertebral soft tissues are unremarkable.",
  },
]

export default function RadiologyReportingView({
  initialStudyId,
  initialFilter = "all",
  currentTechnician = "Dr. Rajesh Sharma, MD",
  currentRole = "Senior Radiologist & HOD",
  onNavigateToWorklist,
  onNavigateToTemplates,
  onNavigateToFinalized,
}: RadiologyReportingViewProps) {
  const [tick, setTick] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── 1. Queue Tabs & Filter State ──
  const [statusTab, setStatusTab] = useState<
    "all" | "pending" | "draft" | "submitted" | "correction"
  >(
    initialFilter === "awaiting"
      ? "pending"
      : initialFilter === "drafts"
      ? "draft"
      : initialFilter === "submitted"
      ? "submitted"
      : "all"
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [modalityFilter, setModalityFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [doctorFilter, setDoctorFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("all")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Active Selected Examination
  const [activeStudyId, setActiveStudyId] = useState<string | null>(
    initialStudyId || null
  )

  // Drawer Tab (Right Side)
  const [rightPanelTab, setRightPanelTab] = useState<
    "report_entry" | "patient_info" | "clinical_indication" | "history"
  >("report_entry")

  // Report Entry Form State
  const [reportForm, setReportForm] = useState({
    indication: "",
    technique: "",
    comparison: "No prior imaging studies available for comparison.",
    findingsText: "",
    impressionText: "",
    sectionValues: {} as Record<string, string>,
    reportingSpecialist: currentTechnician,
    specialistRole: currentRole,
  })

  // Selected Template Override
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)

  // Report Editor Display Mode: normal (split view layout is the default view), fullscreen, minimized
  const [editorMode, setEditorMode] = useState<"normal" | "fullscreen" | "minimized">("normal")
  const [isDirectReport, setIsDirectReport] = useState<boolean>(false)

  // Unsaved changes tracking ref & switch confirmation modal state
  const lastSavedSnapshotRef = useRef<string>("")
  const [pendingSwitchStudyId, setPendingSwitchStudyId] = useState<string | null>(null)
  const [showUnsavedConfirmModal, setShowUnsavedConfirmModal] = useState(false)

  // User-removed section IDs for active study
  const [removedSectionIds, setRemovedSectionIds] = useState<string[]>([])

  // Correction Modal State (Radiologist returning submitted report)
  const [showCorrectionModal, setShowCorrectionModal] = useState(false)
  const [correctionReason, setCorrectionReason] = useState("")
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false)

  // Template Management Modal State
  const [showTemplateManagerModal, setShowTemplateManagerModal] = useState(false)
  const [showImporterModal, setShowImporterModal] = useState(false)
  const [templateManagerSearch, setTemplateManagerSearch] = useState("")
  const [templateManagerModality, setTemplateManagerModality] = useState("all")

  // Modals & PDF
  const [showPdfModal, setShowPdfModal] = useState<ExtendedRadiologyRecord | null>(null)
  const [toastMessage, setToastMessage] = useState<{
    text: string
    type: "success" | "error" | "info"
  } | null>(null)

  const showToast = (
    text: string,
    type: "success" | "error" | "info" = "success"
  ) => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3800)
  }

  // Subscribe to live database updates
  useEffect(() => {
    const unsub1 = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    const unsub2 = RadiologyTemplateDatabase.onUpdate(() => setTick((t) => t + 1))
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  // All studies in the hospital system
  const allStudies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  // Active study object resolved stably
  const activeStudy = useMemo(() => {
    if (!activeStudyId) return null
    return RadiologyWorkflowDb.getStudyById(activeStudyId) || null
  }, [allStudies, activeStudyId])

  // Track whether user has modified reportForm from last saved/loaded snapshot
  const isDirty = useMemo(() => {
    if (!activeStudy) return false
    if (activeStudy.normalizedReportStatus === "Finalized") return false
    if (!lastSavedSnapshotRef.current) return false
    try {
      return JSON.stringify(reportForm) !== lastSavedSnapshotRef.current
    } catch {
      return false
    }
  }, [reportForm, activeStudy])

  // Clear report draft handler
  const handleClearDraft = () => {
    if (!activeStudy) return
    RadiologyTemplateDatabase.clearReportDraft(activeStudy.id)
    const clearedForm = {
      indication: activeStudy.indication || "",
      technique: activeStudy.technique || "",
      comparison: "No prior imaging studies available for comparison.",
      findingsText: "",
      impressionText: "",
      sectionValues: {},
      reportingSpecialist: currentTechnician,
      specialistRole: currentRole,
    }
    setReportForm(clearedForm)
    lastSavedSnapshotRef.current = JSON.stringify(clearedForm)
    setRemovedSectionIds([])
    showToast("Report draft cleared successfully.", "info")
  }

  // Perform study switch cleanly
  const performStudySwitch = (studyId: string) => {
    setActiveStudyId(studyId)
    setRightPanelTab("report_entry") // Default to Report Entry
    setSelectedTemplateId(null) // Clean isolation without mixing data
    setRemovedSectionIds([])
    setShowTemplateSelector(false)
    if (editorMode === "minimized") {
      setEditorMode("normal")
    }
  }

  // Handle opening an examination cleanly with Unsaved Changes check
  const handleOpenStudy = (studyId: string) => {
    if (studyId === activeStudyId) return
    if (isDirty) {
      setPendingSwitchStudyId(studyId)
      setShowUnsavedConfirmModal(true)
      return
    }
    performStudySwitch(studyId)
  }

  // Back to Examination Worklist navigation handler with unsaved changes prompt
  const handleBackToWorklist = () => {
    if (isDirty) {
      const confirmSave = window.confirm(
        "You have unsaved changes in this report draft. Click OK to save your changes as a draft before returning to the Examination Worklist, or Cancel to return without saving."
      )
      if (confirmSave) {
        handleSaveDraft()
      }
    }
    onNavigateToWorklist?.()
  }

  // Sync initialStudyId prop change cleanly - keeps split-view layout as default
  useEffect(() => {
    if (initialStudyId) {
      const found = RadiologyWorkflowDb.getStudyById(initialStudyId)
      if (found) {
        setActiveStudyId(found.id)
        setRightPanelTab("report_entry")
        setSelectedTemplateId(null)
        setRemovedSectionIds([])
        setShowTemplateSelector(false)
        if (
          found.normalizedReportStatus === "Correction Required" ||
          found.normalizedReportStatus === "Needs Correction" ||
          (found.reportStatus as string) === "Correction Required"
        ) {
          setStatusTab("correction")
        } else if (found.normalizedReportStatus === "Draft") {
          setStatusTab("draft")
        } else if (found.normalizedReportStatus === "Submitted for Review") {
          setStatusTab("submitted")
        } else {
          setStatusTab("pending")
        }
      }
    } else {
      setStatusTab("all")
    }
    // Always default to normal split-view layout
    setEditorMode("normal")
    setIsDirectReport(false)
  }, [initialStudyId])

  // Completed examinations received from Scanning Operations (DONE / Sent for Reporting / Active selected study)
  const reportingStudies = useMemo(() => {
    const seen = new Set<string>()
    const persistedReports = RadiologyTemplateDatabase.getReports()
    const reportMap = new Map<string, any>()
    persistedReports.forEach((r) => {
      if (r.studyId) reportMap.set(r.studyId.toLowerCase().trim(), r)
      if (r.testId) reportMap.set(r.testId.toLowerCase().trim(), r)
    })

    const result = allStudies.filter((s) => {
      if ((s as any).status === "Cancelled" || (s as any).isCancelled) return false

      const sKey = (s.id || "").toLowerCase().trim()
      let isMarkedSent = false
      try {
        if (s.id && localStorage.getItem(`hospai_rad_sent_${s.id}`) === "true") {
          isMarkedSent = true
        }
      } catch { }

      const repRecord = sKey ? reportMap.get(sKey) : undefined

      // Finalized reports belong to the separate Finalized Reports module; keep if explicitly selected
      const isFinal =
        s.normalizedReportStatus === "Finalized" ||
        s.reportStatus === "Final" ||
        s.reportStatus === "Finalized" ||
        (s as any).workflowStatus === "FINALIZED" ||
        (repRecord && (repRecord.status === "Final" || repRecord.status === "FINALIZED"))
      if (isFinal && s.id !== activeStudyId) return false

      const isEligible =
        isMarkedSent ||
        Boolean(s.sentToReporting) ||
        s.status === "Sent for Reporting" ||
        (s as any).workflowStatus === "SENT_TO_REPORTING" ||
        Boolean(s.transferredToReportingAt) ||
        Boolean(s.reportingQueuedAt) ||
        Boolean(repRecord) ||
        s.normalizedReportStatus === "Draft" ||
        s.normalizedReportStatus === "Submitted for Review" ||
        s.normalizedReportStatus === "Needs Correction" ||
        s.normalizedReportStatus === "Correction Required" ||
        (s.reportStatus as string) === "Draft" ||
        (s.reportStatus as string) === "Submitted for Review" ||
        (s.reportStatus as string) === "Needs Correction" ||
        (s.reportStatus as string) === "Correction Required" ||
        (s as any).workflowStatus === "DRAFT_SAVED" ||
        (s as any).workflowStatus === "UNDER_REVIEW" ||
        (s as any).workflowStatus === "CORRECTION_REQUIRED" ||
        s.id === activeStudyId

      // Exclude examinations that are still waiting for scan or actively scanning in scanning operations
      if (
        (s.status === "In Progress" || s.scanningStage === 2 || s.normalizedStatus === "IN PROGRESS" || s.status === "Orders" || s.normalizedStatus === "ORDERED") &&
        !isMarkedSent &&
        !s.sentToReporting &&
        s.status !== "Sent for Reporting" &&
        (s as any).workflowStatus !== "SENT_TO_REPORTING" &&
        !s.transferredToReportingAt &&
        !s.reportingQueuedAt &&
        !repRecord
      ) {
        return false
      }

      if (!isEligible) return false

      // Deduplicate by study ID to avoid double-counting
      if (sKey) {
        if (seen.has(sKey)) return false
        seen.add(sKey)
      }

      return true
    })

    return result
  }, [allStudies, activeStudyId, tick])

  // Helper to normalize study reporting status category
  const getReportingCategory = (
    s: ExtendedRadiologyRecord
  ): "pending" | "draft" | "submitted" | "correction" | "finalized" => {
    const rs = (s.reportStatus || "").toString().trim().toLowerCase()
    const nrs = (s.normalizedReportStatus || "").toString().trim().toLowerCase()
    const ws = ((s as any).workflowStatus || "").toString().trim().toLowerCase()
    const st = ((s as any).status || "").toString().trim().toLowerCase()

    if (
      nrs === "finalized" ||
      rs === "final" ||
      rs === "finalized" ||
      ws === "finalized" ||
      st === "finalized"
    ) {
      return "finalized"
    }

    if (
      nrs === "correction required" ||
      nrs === "needs correction" ||
      rs === "correction required" ||
      rs === "correction_required" ||
      rs === "needs correction" ||
      rs === "correction" ||
      ws === "correction_required" ||
      Boolean(s.returnedForCorrectionAt)
    ) {
      return "correction"
    }

    if (
      nrs === "submitted for review" ||
      nrs === "under review" ||
      rs === "submitted for review" ||
      rs === "submitted_for_review" ||
      rs === "submitted" ||
      rs === "under review" ||
      rs === "under_review" ||
      ws === "submitted_for_review" ||
      ws === "under_review"
    ) {
      return "submitted"
    }

    if (
      nrs === "draft" ||
      nrs === "draft saved" ||
      rs === "draft" ||
      rs === "draft saved" ||
      rs === "draft_saved" ||
      ws === "draft" ||
      ws === "draft_saved"
    ) {
      return "draft"
    }

    return "pending"
  }

  // Compute live counts for the 4 Summary Cards & tabs from actual persisted records
  const counts = useMemo(() => {
    let pending = 0
    let draft = 0
    let submitted = 0
    let correction = 0
    let finalized = 0

    reportingStudies.forEach((s) => {
      const cat = getReportingCategory(s)
      if (cat === "pending") pending++
      else if (cat === "draft") draft++
      else if (cat === "submitted") submitted++
      else if (cat === "correction") correction++
      else if (cat === "finalized") finalized++
    })

    return {
      all: pending + draft + submitted + correction, // All Active queue count
      pending,
      draft,
      submitted,
      correction,
      finalized,
    }
  }, [reportingStudies])

  // Distinct doctors for filtering
  const distinctDoctors = useMemo(() => {
    const set = new Set<string>()
    reportingStudies.forEach((s) => {
      if (s.provider) set.add(s.provider.trim())
    })
    return Array.from(set).sort()
  }, [reportingStudies])

  // Filtered examinations list for the incoming reports table
  const filteredStudies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return reportingStudies.filter((study) => {
      // 1. Status Tab filter: "all" displays active reporting queue (excludes finalized)
      const cat = getReportingCategory(study)
      if (cat === "finalized") return false

      if (statusTab !== "all") {
        if (cat !== statusTab) return false
      }

      // 2. Modality filter
      if (modalityFilter !== "all") {
        const canonical = getCanonicalRadiologyModality(study)
        if (canonical !== modalityFilter && study.modality !== modalityFilter) {
          return false
        }
      }

      // 3. Priority filter
      if (priorityFilter !== "all") {
        if ((study.priority || "Routine").toLowerCase() !== priorityFilter.toLowerCase()) {
          return false
        }
      }

      // 4. Doctor filter
      if (doctorFilter !== "all") {
        if ((study.provider || "").trim() !== doctorFilter) {
          return false
        }
      }

      // 5. Search query (patient name, UMR, test, ID)
      if (q) {
        const matches =
          (study.patient || "").toLowerCase().includes(q) ||
          (study.study || "").toLowerCase().includes(q) ||
          (study.umr || "").toLowerCase().includes(q) ||
          (study.mrn || "").toLowerCase().includes(q) ||
          (study.id || "").toLowerCase().includes(q) ||
          (study.accessionNo || "").toLowerCase().includes(q)
        if (!matches) return false
      }

      return true
    })
  }, [
    reportingStudies,
    statusTab,
    modalityFilter,
    priorityFilter,
    doctorFilter,
    searchQuery,
  ])

  // FIFO Queue Ordering: Oldest transferred examination appears at the top.
  // Newly transferred examinations are added at the bottom.
  // Sorted strictly by reporting queue entry / transfer timestamp (transferredToReportingAt / reportingQueuedAt / sentToReportingAt).
  // Does NOT sort by patient registration date, order creation date, or report draft edit time.
  // Preserves queue position across draft saves, review submissions, and return for correction.
  // Stable secondary sort: Examination ID ascending.
  // Strict FIFO Queue Ordering: Oldest transferred examination appears at top (#1).
  // Newly transferred examinations enter at the bottom.
  // Sorted strictly by reporting queue entry / transfer timestamp (reportingTransferredAt).
  // Preserves queue position across draft saves, review submissions, and return for correction.
  // STAT priority exception: Urgently prioritized while preserving FIFO within priority tier.
  const sortedStudies = useMemo(() => {
    return RadiologyWorkflowDb.sortReportingWorkspaceQueue(filteredStudies)
  }, [filteredStudies])

  // Paginated studies
  const totalPages = Math.max(1, Math.ceil(sortedStudies.length / pageSize))
  const paginatedStudies = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedStudies.slice(start, start + pageSize)
  }, [sortedStudies, currentPage, pageSize])

  // Automatically select the first available report when opening workspace or if none selected
  useEffect(() => {
    if (!activeStudyId && sortedStudies.length > 0) {
      setActiveStudyId(sortedStudies[0].id)
    } else if (
      activeStudyId &&
      !allStudies.some((s) => s.id === activeStudyId) &&
      sortedStudies.length > 0
    ) {
      setActiveStudyId(sortedStudies[0].id)
    }
  }, [sortedStudies, activeStudyId, allStudies])

  // Resolve actual patient demographics from local database using UMR
  const resolvedPatient = useMemo(() => {
    if (!activeStudy) return null
    const umr = activeStudy.umr || activeStudy.mrn
    if (umr) {
      const p = db.getPatientByUmr(umr)
      if (p) return p
    }
    return null
  }, [activeStudy?.umr, activeStudy?.mrn])

  // Authorized Radiologist verification
  const isAuthorizedRadiologist = useMemo(() => {
    const allowed = [
      "radiologist",
      "specialist",
      "consultant",
      "doctor",
      "admin",
      "hod",
      "head of department",
      "chief",
    ]
    const roleLower = (currentRole || "").toLowerCase()
    return allowed.some((r) => roleLower.includes(r))
  }, [currentRole])

  // Available templates from database
  const availableTemplates = useMemo(
    () => RadiologyTemplateDatabase.getTemplates(),
    [tick]
  )

  // Auto-matched template for active study
  const autoMatchedTemplate = useMemo(() => {
    if (!activeStudy) return null
    return (
      RadiologyTemplateDatabase.getTemplateForStudy(
        activeStudy.study,
        activeStudy.gender || "All"
      ) || null
    )
  }, [activeStudy, tick])

  // Active effective template (override or auto-matched)
  const currentTemplate = useMemo(() => {
    if (selectedTemplateId) {
      const found = availableTemplates.find((t) => t.id === selectedTemplateId)
      if (found) return found
    }
    return autoMatchedTemplate
  }, [selectedTemplateId, autoMatchedTemplate, availableTemplates])

  // Effective template sections: structured sections or auto-parsed from rawContent
  const effectiveSections: TemplateSection[] = useMemo(() => {
    if (!currentTemplate) return []
    let rawSecs: TemplateSection[] = []
    if (currentTemplate.sections && currentTemplate.sections.length > 0) {
      rawSecs = currentTemplate.sections
    } else if (currentTemplate.rawContent) {
      rawSecs = parseSectionsFromContent(currentTemplate.rawContent)
    }
    // Filter out user-removed sections and any unwanted non-radiology content
    return rawSecs.filter(
      (s) =>
        !removedSectionIds.includes(s.id) &&
        !isUnwantedTicketRoutingContent(s.title) &&
        !isUnwantedTicketRoutingContent((s as any).content || '') &&
        !isUnwantedTicketRoutingContent(s.instructions)
    )
  }, [currentTemplate, removedSectionIds])

// In-memory cache for extracted template contents to avoid redundant parsing
const templateContentCache = new Map<string, any>()

// Helper to extract content, findings, impression, and section values from any template
  const extractTemplateContent = useCallback((tpl: RadiologyTemplate) => {
    if (tpl.id && templateContentCache.has(tpl.id)) {
      return templateContentCache.get(tpl.id)
    }
    const sectionValues: Record<string, string> = {}
    let findingsText = ""
    let impressionText = ""
    let technique = tpl.variantProtocol || ""
    let indication = ""

    const sections =
      tpl.sections && tpl.sections.length > 0
        ? tpl.sections
        : tpl.rawContent
        ? parseSectionsFromContent(tpl.rawContent)
        : []

    sections.forEach((sec) => {
      if (
        isUnwantedTicketRoutingContent(sec.title) ||
        isUnwantedTicketRoutingContent((sec as any).content || '') ||
        isUnwantedTicketRoutingContent(sec.instructions)
      ) {
        return
      }

      const secTitleLower = (sec.title || "").toLowerCase()
      const isImpSec = secTitleLower.includes("impression") || secTitleLower.includes("conclusion")
      const isFindingsSec = secTitleLower.includes("finding") || secTitleLower.includes("observation")
      const isTechSec = secTitleLower.includes("technique") || secTitleLower.includes("protocol")
      const isIndSec = secTitleLower.includes("indication") || secTitleLower.includes("history")

      sec.fields?.forEach((f) => {
        const fLabelLower = (f.label || "").toLowerCase()
        const val = f.defaultValue || ""
        if (val && !isUnwantedTicketRoutingContent(val)) {
          sectionValues[f.id] = val
        }
        if (isImpSec || fLabelLower.includes("impression")) {
          if (!impressionText && val) impressionText = val
        } else if (isFindingsSec || fLabelLower.includes("finding")) {
          if (!findingsText && val) findingsText = val
        } else if (isTechSec || fLabelLower.includes("technique")) {
          if (!technique && val) technique = val
        } else if (isIndSec || fLabelLower.includes("indication")) {
          if (!indication && val) indication = val
        }
      })
    })

    const raw = tpl.rawContent || tpl.fullExtractedText || ""
    if (raw && !isUnwantedTicketRoutingContent(raw)) {
      if (!impressionText || !findingsText) {
        const impMatch = raw.match(/(?:IMPRESSION|CONCLUSION):\s*([\s\S]*?)(?=(?:\n[A-Za-z0-9\s&/()_-]{3,30}:|$))/i)
        if (impMatch && impMatch[1] && !impressionText) {
          impressionText = impMatch[1].trim()
        }
        const findMatch = raw.match(/(?:FINDINGS|OBSERVATIONS):\s*([\s\S]*?)(?=(?:\n(?:IMPRESSION|CONCLUSION):|$))/i)
        if (findMatch && findMatch[1] && !findingsText) {
          findingsText = findMatch[1].trim()
        }
      }
      if (!findingsText) {
        findingsText = raw.trim()
      }
    }

    const result = {
      sections,
      sectionValues,
      findingsText,
      impressionText,
      technique,
      indication,
    }
    if (tpl.id) {
      templateContentCache.set(tpl.id, result)
    }
    return result
  }, [])

  // Explicitly apply a selected template's sections and content directly into reportForm
  const applyTemplate = useCallback(
    (tpl: RadiologyTemplate, notify = true) => {
      const extracted = extractTemplateContent(tpl)
      setSelectedTemplateId(tpl.id)
      setRemovedSectionIds([])
      setReportForm((prev) => ({
        ...prev,
        sectionValues: {
          ...prev.sectionValues,
          ...extracted.sectionValues,
        },
        findingsText: extracted.findingsText || prev.findingsText,
        impressionText: extracted.impressionText || prev.impressionText,
        technique: extracted.technique || prev.technique,
        indication: extracted.indication || prev.indication,
      }))
      if (notify) {
        showToast(
          `✓ Template "${tpl.templateName || tpl.testName}" applied to report.`,
          "success"
        )
      }
    },
    [extractTemplateContent]
  )

  // Populate report form cleanly when activeStudy changes
  useEffect(() => {
    if (!activeStudy) {
      setReportForm({
        indication: "",
        technique: "",
        comparison: "No prior imaging studies available for comparison.",
        findingsText: "",
        impressionText: "",
        sectionValues: {},
        reportingSpecialist: currentTechnician,
        specialistRole: currentRole,
      })
      setSelectedTemplateId(null)
      return
    }

    try {
      const draftResult = RadiologyWorkflowDb.getOrInitializeReportDraft(
        activeStudy.id,
        currentTechnician,
        currentRole
      )

      const matchedTemplate =
        selectedTemplateId && availableTemplates.find((t) => t.id === selectedTemplateId)
          ? availableTemplates.find((t) => t.id === selectedTemplateId)!
          : draftResult.template ||
            RadiologyTemplateDatabase.getTemplateForStudy(
              activeStudy.study,
              activeStudy.gender || "All"
            ) || null

      if (draftResult.template?.id && !selectedTemplateId) {
        setSelectedTemplateId(draftResult.template.id)
      }

      const tplContent = matchedTemplate ? extractTemplateContent(matchedTemplate) : null

      // Check if this study already has a user-saved draft
      const hasSavedDraft =
        draftResult.isExistingDraft &&
        (activeStudy.normalizedReportStatus === "Draft" ||
          activeStudy.normalizedReportStatus === "Submitted for Review" ||
          activeStudy.normalizedReportStatus === "Finalized" ||
          Boolean(activeStudy.fieldValues && Object.keys(activeStudy.fieldValues).length > 0))

      // Section values cleanly isolated for this study
      const initialSectionValues: Record<string, string> = {}

      // 1. Fill default values from template sections
      if (tplContent?.sectionValues) {
        Object.entries(tplContent.sectionValues).forEach(([k, v]) => {
          if (v && !isUnwantedTicketRoutingContent(String(v))) {
            initialSectionValues[k] = String(v)
          }
        })
      }

      // 2. Overlay any previously saved field values for this specific study
      if (activeStudy.fieldValues) {
        Object.entries(activeStudy.fieldValues).forEach(([k, v]) => {
          if (v !== undefined && v !== null && !isUnwantedTicketRoutingContent(v)) {
            initialSectionValues[k] = String(v)
          }
        })
      }

      const existingFindings = isUnwantedTicketRoutingContent(
        activeStudy.findings?.join("\n") || draftResult.draftData.findingsText
      )
        ? ""
        : activeStudy.findings?.join("\n") || draftResult.draftData.findingsText || ""

      const existingImpression = isUnwantedTicketRoutingContent(
        activeStudy.impression?.join("\n") || draftResult.draftData.impressionText
      )
        ? ""
        : activeStudy.impression?.join("\n") || draftResult.draftData.impressionText || ""

      // If existing user-saved draft, keep existing findings; otherwise reflect template findings
      const finalFindings =
        hasSavedDraft && existingFindings
          ? existingFindings
          : tplContent?.findingsText || existingFindings || ""

      const finalImpression =
        hasSavedDraft && existingImpression
          ? existingImpression
          : tplContent?.impressionText || existingImpression || ""

      const initialForm = {
        indication:
          activeStudy.indication ||
          draftResult.draftData.indication ||
          tplContent?.indication ||
          "Diagnostic investigation ordered per clinical consultation.",
        technique:
          activeStudy.technique ||
          draftResult.draftData.technique ||
          tplContent?.technique ||
          `Diagnostic ${activeStudy.modality || "Radiology"} scan protocol.`,
        comparison:
          activeStudy.comparison ||
          draftResult.draftData.comparison ||
          "No prior imaging studies available for comparison.",
        findingsText: finalFindings,
        impressionText: finalImpression,
        sectionValues: initialSectionValues,
        reportingSpecialist:
          activeStudy.radiologist ||
          activeStudy.finalizedBy ||
          currentTechnician,
        specialistRole:
          activeStudy.finalizedRole || currentRole,
      }
      setReportForm(initialForm)
      lastSavedSnapshotRef.current = JSON.stringify(initialForm)
    } catch (e) {
      console.error("Error initializing report draft:", e)
    }
  }, [activeStudyId, selectedTemplateId, tick, extractTemplateContent])

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery("")
    setModalityFilter("all")
    setPriorityFilter("all")
    setDoctorFilter("all")
    setDateFilter("all")
    setCurrentPage(1)
    showToast("Filters reset to default.", "info")
  }

  // Refresh data
  const handleRefresh = () => {
    setIsRefreshing(true)
    RadiologyWorkflowDb.invalidateCache()
    setTick((t) => t + 1)
    setTimeout(() => {
      setIsRefreshing(false)
      showToast("Reporting queue refreshed.", "success")
    }, 400)
  }

  // Insert Quick Approved Phrase
  const handleInsertPhrase = (phraseText: string) => {
    setReportForm((prev) => {
      const nextValues = { ...prev.sectionValues }
      if (effectiveSections.length > 0) {
        const firstField = effectiveSections[0]?.fields?.[0]
        if (firstField) {
          const current = nextValues[firstField.id] || ""
          nextValues[firstField.id] = current ? `${current.trim()}\n${phraseText}` : phraseText
        }
      }
      return {
        ...prev,
        findingsText: prev.findingsText
          ? `${prev.findingsText.trim()}\n\n${phraseText}`
          : phraseText,
        sectionValues: nextValues,
      }
    })
    showToast("Approved phrase inserted.", "info")
  }

  // Save Report Draft
  const handleSaveDraft = () => {
    if (!activeStudy) return
    if (activeStudy.normalizedReportStatus === "Finalized") {
      showToast("Cannot edit a finalized report. Issue an authorized addendum instead.", "error")
      return
    }

    try {
      const findingsFromSections: string[] = []
      let impressionFromSections = ""

      if (effectiveSections.length > 0) {
        effectiveSections.forEach((sec) => {
          sec.fields?.forEach((f) => {
            const val = reportForm.sectionValues[f.id]
            if (val && val.trim()) {
              if (
                sec.title.toLowerCase().includes("impression") ||
                sec.title.toLowerCase().includes("conclusion") ||
                f.label.toLowerCase().includes("impression")
              ) {
                if (!impressionFromSections) impressionFromSections = val.trim()
              } else {
                findingsFromSections.push(`${sec.title}: ${val.trim()}`)
              }
            }
          })
        })
      }

      const findingsArr =
        findingsFromSections.length > 0
          ? findingsFromSections
          : reportForm.findingsText
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)

      const impressionArr = impressionFromSections
        ? impressionFromSections.split("\n").map((l) => l.trim()).filter(Boolean)
        : reportForm.impressionText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)

      RadiologyWorkflowDb.saveReportDraft(activeStudy.id, {
        indication: reportForm.indication,
        technique: reportForm.technique,
        findings: findingsArr,
        impression: impressionArr,
        comparison: reportForm.comparison,
        radiologist: reportForm.reportingSpecialist,
        role: reportForm.specialistRole,
        templateId: currentTemplate?.id,
        templateName: currentTemplate?.testName,
        templateVersion: currentTemplate?.version,
        fieldValues: reportForm.sectionValues,
      })

      RadiologyTemplateDatabase.saveReportDraft({
        studyId: activeStudy.id,
        patientName: activeStudy.patient,
        mrn: activeStudy.mrn || "",
        umr: activeStudy.umr,
        encounterId: activeStudy.encounterId,
        referringDoctor: activeStudy.provider,
        orderedDate: activeStudy.ordered,
        testId: currentTemplate?.testId || activeStudy.study,
        testName: activeStudy.study,
        templateId: currentTemplate?.id || "standard",
        templateVersion: currentTemplate?.version || 1,
        templateStructure: effectiveSections,
        fieldValues: reportForm.sectionValues,
        technicianNotes: reportForm.technique,
        radiologistName: reportForm.reportingSpecialist,
      })

      lastSavedSnapshotRef.current = JSON.stringify(reportForm)
      showToast("✓ Report draft successfully saved. Status updated to Draft.", "success")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to save draft", "error")
    }
  }

  // Submit for Review
  const handleSubmitForReview = () => {
    if (!activeStudy) return
    if (activeStudy.normalizedReportStatus === "Finalized") {
      showToast("Report is already finalized.", "error")
      return
    }

    const findingsFromSections: string[] = []
    let impressionFromSections = ""

    if (effectiveSections.length > 0) {
      effectiveSections.forEach((sec) => {
        sec.fields?.forEach((f) => {
          const val = reportForm.sectionValues[f.id]
          if (val && val.trim()) {
            if (
              sec.title.toLowerCase().includes("impression") ||
              sec.title.toLowerCase().includes("conclusion") ||
              f.label.toLowerCase().includes("impression")
            ) {
              if (!impressionFromSections) impressionFromSections = val.trim()
            } else {
              findingsFromSections.push(`${sec.title}: ${val.trim()}`)
            }
          }
        })
      })
    }

    const findingsArr =
      findingsFromSections.length > 0
        ? findingsFromSections
        : reportForm.findingsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)

    const impressionArr = impressionFromSections
      ? impressionFromSections.split("\n").map((l) => l.trim()).filter(Boolean)
      : reportForm.impressionText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)

    if (findingsArr.length === 0) {
      showToast("Validation Error: Please enter examination findings before submitting for review.", "error")
      return
    }
    if (impressionArr.length === 0) {
      showToast("Validation Error: Please enter clinical impression before submitting for review.", "error")
      return
    }

    try {
      RadiologyWorkflowDb.submitReportForReview(
        activeStudy.id,
        {
          indication: reportForm.indication,
          technique: reportForm.technique,
          findings: findingsArr,
          impression: impressionArr,
          comparison: reportForm.comparison,
          radiologist: reportForm.reportingSpecialist,
          role: reportForm.specialistRole,
          templateId: currentTemplate?.id,
          templateName: currentTemplate?.testName,
          templateVersion: currentTemplate?.version,
          fieldValues: reportForm.sectionValues,
        },
        undefined,
        reportForm.reportingSpecialist,
        reportForm.specialistRole
      )

      lastSavedSnapshotRef.current = JSON.stringify(reportForm)
      showToast("✓ Report successfully submitted for Radiologist review.", "success")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to submit report for review", "error")
    }
  }

  // Finalize Report (Permission-Gated)
  const handleFinalizeReport = () => {
    if (!activeStudy) return
    if (activeStudy.normalizedReportStatus === "Finalized") {
      showToast("Report is already finalized.", "info")
      return
    }

    if (!isAuthorizedRadiologist) {
      showToast(
        `Unauthorized: User role "${currentRole}" cannot finalize reports. Only credentialed Radiologists or Doctors can finalize diagnostic reports.`,
        "error"
      )
      return
    }

    const findingsFromSections: string[] = []
    let impressionFromSections = ""

    if (effectiveSections.length > 0) {
      effectiveSections.forEach((sec) => {
        sec.fields?.forEach((f) => {
          const val = reportForm.sectionValues[f.id]
          if (val && val.trim()) {
            if (
              sec.title.toLowerCase().includes("impression") ||
              sec.title.toLowerCase().includes("conclusion") ||
              f.label.toLowerCase().includes("impression")
            ) {
              if (!impressionFromSections) impressionFromSections = val.trim()
            } else {
              findingsFromSections.push(`${sec.title}: ${val.trim()}`)
            }
          }
        })
      })
    }

    const findingsArr =
      findingsFromSections.length > 0
        ? findingsFromSections
        : reportForm.findingsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)

    const impressionArr = impressionFromSections
      ? impressionFromSections.split("\n").map((l) => l.trim()).filter(Boolean)
      : reportForm.impressionText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)

    if (findingsArr.length === 0 || impressionArr.length === 0) {
      showToast("Both clinical findings and diagnostic impression are required to finalize.", "error")
      return
    }

    try {
      RadiologyWorkflowDb.finalizeReport(
        activeStudy.id,
        {
          indication: reportForm.indication,
          technique: reportForm.technique,
          findings: findingsArr,
          impression: impressionArr,
          comparison: reportForm.comparison,
          finalizedBy: currentTechnician,
          finalizedRole: currentRole,
          templateId: currentTemplate?.id,
          templateName: currentTemplate?.testName,
          templateVersion: currentTemplate?.version,
          fieldValues: reportForm.sectionValues,
        },
        undefined,
        currentTechnician,
        currentRole
      )

      RadiologyTemplateDatabase.finalizeReport({
        studyId: activeStudy.id,
        patientName: activeStudy.patient,
        mrn: activeStudy.mrn || "",
        umr: activeStudy.umr,
        encounterId: activeStudy.encounterId,
        referringDoctor: activeStudy.provider,
        orderedDate: activeStudy.ordered,
        testId: currentTemplate?.testId || activeStudy.study,
        testName: activeStudy.study,
        templateId: currentTemplate?.id || "standard",
        templateVersion: currentTemplate?.version || 1,
        templateStructure: effectiveSections,
        fieldValues: reportForm.sectionValues,
        technicianNotes: reportForm.technique,
        radiologistName: currentTechnician,
      })

      lastSavedSnapshotRef.current = JSON.stringify(reportForm)
      showToast("✓ Diagnostic report officially finalized, signed, and approved.", "success")
      setTick((t) => t + 1)

      // Auto-advance to next remaining active study in reporting queue
      const remainingActive = filteredStudies.filter(
        (s) => s.id !== activeStudy.id && getReportingCategory(s) !== "finalized"
      )
      if ((statusTab as string) !== "finalized" && remainingActive.length > 0) {
        setActiveStudyId(remainingActive[0].id)
      }
    } catch (err: any) {
      showToast(err.message || "Failed to finalize report", "error")
    }
  }

  // Return for Correction (Radiologist action on submitted report)
  const handleConfirmReturnForCorrection = () => {
    if (!activeStudy) return
    const trimmed = correctionReason.trim()
    if (!trimmed || trimmed.length < 3) {
      showToast("Clinical correction instructions are required before returning for revision.", "error")
      return
    }
    if (isSubmittingCorrection) return
    setIsSubmittingCorrection(true)

    try {
      RadiologyWorkflowDb.returnReportForCorrection(
        activeStudy.id,
        trimmed,
        currentTechnician,
        currentRole
      )

      showToast("Report returned to technician for clinical correction.", "success")
      setShowCorrectionModal(false)
      setCorrectionReason("")
      setStatusTab("correction")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to return report for correction.", "error")
    } finally {
      setIsSubmittingCorrection(false)
    }
  }

  // Active status color helper
  const getReportingStatusBadge = (status: string, studyRecord?: ExtendedRadiologyRecord) => {
    const cat = studyRecord ? getReportingCategory(studyRecord) : null
    if (cat === "finalized" || status === "Finalized") {
      return {
        bg: "bg-emerald-50 text-emerald-800 border-emerald-200",
        dot: "bg-emerald-500",
        text: "Finalized",
      }
    }
    if (
      cat === "correction" ||
      status === "Correction Required" ||
      status === "Needs Correction" ||
      status === "Correction"
    ) {
      return {
        bg: "bg-amber-50 text-amber-900 border-amber-300",
        dot: "bg-amber-600",
        text: "Correction Required",
      }
    }
    if (cat === "submitted" || status === "Submitted for Review" || status === "Under Review") {
      return {
        bg: "bg-blue-50 text-blue-800 border-blue-200",
        dot: "bg-blue-500",
        text: "Under Review",
      }
    }
    if (cat === "draft" || status === "Draft" || status === "Draft Saved") {
      return {
        bg: "bg-purple-50 text-purple-800 border-purple-200",
        dot: "bg-purple-500",
        text: "Draft Saved",
      }
    }
    return {
      bg: "bg-slate-100 text-slate-700 border-slate-200",
      dot: "bg-slate-400",
      text: "Awaiting Report",
    }
  }

  const getPriorityBadge = (priority?: string) => {
    const p = (priority || "Routine").toUpperCase()
    if (p === "STAT" || p === "EMERGENCY") {
      return "bg-rose-100 text-rose-800 border-rose-300 font-bold"
    }
    if (p === "URGENT") {
      return "bg-amber-100 text-amber-800 border-amber-300 font-semibold"
    }
    return "bg-slate-100 text-slate-700 border-slate-200"
  }

  return (
    <div className="space-y-2.5">
      {/* ── Floating Toast Alert - Always Visible Across Viewport ── */}
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
              <AlertCircle className="w-5 h-5 text-blue-300 shrink-0" />
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

      {/* ── Reporting Workspace Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-0.5">
        <div>
          {/* Title & Subtitle */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-[#1B4FD8] flex items-center justify-center shadow-2xs shrink-0">
              <FileText className="w-4 h-4 text-[#1B4FD8]" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-[#0F172A] tracking-tight leading-tight">
                Reporting Workspace
              </h1>
              <p className="text-[11.5px] text-[#64748B] leading-tight">
                Receive completed scans, fill reports using templates, and submit for review.
              </p>
            </div>
          </div>
        </div>

        {/* Top-Right Action Buttons */}
        <div className="flex items-center gap-2">
          {onNavigateToWorklist && (
            <button
              onClick={handleBackToWorklist}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-[#DDE2EC] px-3 py-1.5 rounded-lg font-semibold text-[12px] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
              title="Return to Examination Worklist"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Examination Worklist</span>
            </button>
          )}

          <button
            onClick={() => setShowTemplateManagerModal(true)}
            className="bg-white hover:bg-slate-50 text-[#1B4FD8] border border-[#BFDBFE] px-3 py-1.5 rounded-lg font-semibold text-[12px] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <Layers className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Report Templates</span>
          </button>


        </div>
      </div>

      {/* ── 2. Main Workspace: Responsive 70:30 Split-View Layout (70% Queue / 30% Editor) ── */}
      <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
        {/* ── Left Column: Reporting Queue (70% width, hidden in fullscreen) ── */}
        {editorMode !== "fullscreen" && (
          <div
            className={`${
              editorMode === "minimized" ? "w-full" : "w-full xl:w-[calc(70%-0.5rem)]"
            } flex flex-col gap-3 min-w-0`}
          >
            {/* 1. Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Card 1: Pending Reports */}
              <div
                onClick={() => setStatusTab("pending")}
                className={`bg-white border rounded-lg p-2.5 shadow-2xs flex items-center gap-2.5 cursor-pointer transition-all hover:shadow-xs ${
                  statusTab === "pending"
                    ? "border-[#1B4FD8] ring-1 ring-[#1B4FD8]/20"
                    : "border-[#E2E8F0]"
                }`}
              >
                <div className="w-8 h-8 rounded-md bg-[#FFFBEB] border border-[#FDE68A] text-amber-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#64748B] truncate">Pending Reports</div>
                  <div className="text-[20px] font-bold text-[#0F172A] leading-tight">
                    {counts.pending}
                  </div>
                  <div className="text-[10px] text-[#64748B] truncate">Awaiting report entry</div>
                </div>
              </div>

              {/* Card 2: Draft Reports */}
              <div
                onClick={() => setStatusTab("draft")}
                className={`bg-white border rounded-lg p-2.5 shadow-2xs flex items-center gap-2.5 cursor-pointer transition-all hover:shadow-xs ${
                  statusTab === "draft"
                    ? "border-[#1B4FD8] ring-1 ring-[#1B4FD8]/20"
                    : "border-[#E2E8F0]"
                }`}
              >
                <div className="w-8 h-8 rounded-md bg-[#FAF5FF] border border-[#E9D5FF] text-purple-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#64748B] truncate">Draft Reports</div>
                  <div className="text-[20px] font-bold text-[#0F172A] leading-tight">
                    {counts.draft}
                  </div>
                  <div className="text-[10px] text-[#64748B] truncate">Saved in progress</div>
                </div>
              </div>

              {/* Card 3: Submitted for Review */}
              <div
                onClick={() => setStatusTab("submitted")}
                className={`bg-white border rounded-lg p-2.5 shadow-2xs flex items-center gap-2.5 cursor-pointer transition-all hover:shadow-xs ${
                  statusTab === "submitted"
                    ? "border-[#1B4FD8] ring-1 ring-[#1B4FD8]/20"
                    : "border-[#E2E8F0]"
                }`}
              >
                <div className="w-8 h-8 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] text-[#1B4FD8] flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4 text-[#1B4FD8]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#64748B] truncate">
                    Submitted for Review
                  </div>
                  <div className="text-[20px] font-bold text-[#0F172A] leading-tight">
                    {counts.submitted}
                  </div>
                  <div className="text-[10px] text-[#64748B] truncate">Awaiting Radiologist</div>
                </div>
              </div>

              {/* Card 4: Correction Required */}
              <div
                onClick={() => setStatusTab("correction")}
                className={`bg-white border rounded-lg p-2.5 shadow-2xs flex items-center gap-2.5 cursor-pointer transition-all hover:shadow-xs ${
                  statusTab === "correction"
                    ? "border-amber-500 ring-1 ring-amber-500/20"
                    : "border-[#E2E8F0]"
                }`}
              >
                <div className="w-8 h-8 rounded-md bg-[#FFFBEB] border border-[#FDE68A] text-amber-600 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#64748B] truncate">
                    Correction Required
                  </div>
                  <div className="text-[20px] font-bold text-[#0F172A] leading-tight">
                    {counts.correction}
                  </div>
                  <div className="text-[10px] text-amber-700 truncate">Returned for revision</div>
                </div>
              </div>
            </div>

            {/* 2. Patient Reporting Worklist Card */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden flex flex-col">
              {/* Status Filter Tabs */}
              <div className="flex items-center gap-0.5 px-2.5 pt-2 border-b border-[#E2E8F0] overflow-x-auto bg-[#F8FAFC]">
            {[
              { id: "all", label: "All Active", count: counts.all },
              { id: "pending", label: "Pending Reports", count: counts.pending },
              { id: "draft", label: "Draft Reports", count: counts.draft },
              {
                id: "submitted",
                label: "Submitted for Review",
                count: counts.submitted,
              },
              {
                id: "correction",
                label: "Correction Required",
                count: counts.correction,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusTab(tab.id as any)
                  setCurrentPage(1)
                }}
                className={`px-2.5 py-1.5 text-[11.5px] font-semibold border-b-2 whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
                  statusTab === tab.id
                    ? "border-[#1B4FD8] text-[#1B4FD8] bg-white rounded-t-sm shadow-2xs"
                    : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1 py-0.2 rounded-full text-[10px] ${
                    statusTab === tab.id
                      ? "bg-blue-100 text-[#1B4FD8]"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Filter Toolbar */}
          <div className="p-2 border-b border-[#E2E8F0] space-y-1.5 bg-white">
            <div className="flex flex-col sm:flex-row items-center gap-1.5">
              {/* Search Bar */}
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Search by patient name, UMR, test..."
                  className="w-full pl-8 pr-7 py-1 border border-[#DDE2EC] rounded-md text-[11.5px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Reset Button */}
              <button
                onClick={handleResetFilters}
                className="px-2.5 py-1 border border-[#DDE2EC] rounded-md text-[11px] font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1 cursor-pointer shrink-0"
                title="Reset all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
              {/* Modality Filter */}
              <select
                value={modalityFilter}
                onChange={(e) => {
                  setModalityFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="border border-[#DDE2EC] rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-[#1B4FD8]"
              >
                <option value="all">All Modalities</option>
                <option value="XR">X-Ray (XR)</option>
                <option value="CT">CT Scan (CT)</option>
                <option value="MR">MRI (MR)</option>
                <option value="US">Ultrasound (US)</option>
                <option value="NM">Nuclear Med (NM)</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="border border-[#DDE2EC] rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-[#1B4FD8]"
              >
                <option value="all">All Priorities</option>
                <option value="Routine">Routine</option>
                <option value="Urgent">Urgent</option>
                <option value="STAT">STAT / Emergency</option>
              </select>

              {/* Doctor Filter */}
              <select
                value={doctorFilter}
                onChange={(e) => {
                  setDoctorFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="border border-[#DDE2EC] rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-[#1B4FD8] truncate"
              >
                <option value="all">All Doctors</option>
                {distinctDoctors.map((doc) => (
                  <option key={doc} value={doc}>
                    {doc}
                  </option>
                ))}
              </select>

              {/* Date Preset */}
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="border border-[#DDE2EC] rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-[#1B4FD8]"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Past 48 Hours</option>
              </select>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto min-h-[320px]">
            <table className="w-full text-left border-collapse text-[12px] min-w-full md:min-w-[640px]">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#64748B] text-[11px] font-bold uppercase tracking-wider border-b border-[#E2E8F0]">
                  <th className="py-2.5 px-1.5 w-8 text-center">#</th>
                  <th className="py-2.5 px-2 min-w-[105px]">Patient Name</th>
                  <th className="py-2.5 px-1.5 min-w-[70px]">UMR No.</th>
                  <th className="py-2.5 px-2 min-w-[115px]">Examination / Test</th>
                  <th className="py-2.5 px-1 w-14 text-center">Modality</th>
                  <th className="py-2.5 px-1.5 min-w-[65px]">Completed</th>
                  <th className="py-2.5 px-1.5 min-w-[95px]">Status</th>
                  <th className="py-2.5 px-1 w-14 text-center">Priority</th>
                  <th className="py-2.5 px-1 w-14 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedStudies.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="w-8 h-8 text-slate-300" />
                        <span className="font-semibold text-slate-700 text-[13px]">
                          No examinations found in this reporting view.
                        </span>
                        <span className="text-[11.5px] text-slate-400">
                          Try adjusting your search query, status tab, or filters.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedStudies.map((study, idx) => {
                    const isSelected = activeStudyId === study.id
                    const badge = getReportingStatusBadge(
                      study.normalizedReportStatus,
                      study
                    )
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1

                    return (
                      <tr
                        key={study.id}
                        onClick={() => handleOpenStudy(study.id)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#EFF6FF] border-l-3 border-l-[#1B4FD8]"
                            : "hover:bg-slate-50/80"
                        }`}
                      >
                        {/* 1. # */}
                        <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[11px]">
                          {rowNumber}
                        </td>

                        {/* 2. Patient Name */}
                        <td className="py-2.5 px-2">
                          <div
                            className="font-bold text-[#0F172A] text-[12px] leading-snug truncate max-w-[140px]"
                            title={study.patient}
                          >
                            {study.patient}
                          </div>
                          <div
                            className="text-[10.5px] text-[#64748B] leading-tight mt-0.5 truncate max-w-[140px]"
                            title={`${study.gender && study.gender !== "All" ? study.gender : "Patient"} • ${study.department || "Radiology"}`}
                          >
                            {study.gender && study.gender !== "All" ? study.gender : "Patient"} • {study.department || "Radiology"}
                          </div>
                        </td>

                        {/* 3. UMR No. */}
                        <td className="py-2.5 px-2 font-mono text-slate-700 text-[11px] whitespace-nowrap font-medium">
                          <span title={study.umr || study.mrn || "—"}>
                            {study.umr || study.mrn || "—"}
                          </span>
                        </td>

                        {/* 4. Examination / Test */}
                        <td className="py-2.5 px-2">
                          <div
                            className="font-bold text-[#1E293B] text-[11.5px] leading-snug truncate max-w-[150px]"
                            title={study.study}
                          >
                            {study.study}
                          </div>
                          <div
                            className="text-[10.5px] text-slate-500 font-mono mt-0.5 truncate max-w-[150px]"
                            title={study.id}
                          >
                            {study.id}
                          </div>
                        </td>

                        {/* 5. Modality */}
                        <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-[#0F172A] text-[10px] font-bold border border-slate-200"
                            title={study.modality}
                          >
                            {study.modality}
                          </span>
                        </td>

                        {/* 6. Completed */}
                        <td className="py-2.5 px-2 text-[11px] text-slate-600 whitespace-nowrap">
                          {study.completedAt ? (
                            <span
                              title={`Completed: ${new Date(study.completedAt).toLocaleString("en-IN")}`}
                              className="font-medium text-slate-700"
                            >
                              {new Date(study.completedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : study.sentToReportingAt ? (
                            <span
                              title={`Transferred: ${new Date(study.sentToReportingAt).toLocaleString("en-IN")}`}
                            >
                              {new Date(study.sentToReportingAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : (
                            <span
                              className="text-slate-400 font-mono"
                              title="Examination in progress / scan pending"
                            >
                              —
                            </span>
                          )}
                        </td>

                        {/* 7. Status */}
                        <td className="py-2.5 px-2 whitespace-nowrap">
                          <span
                            title={badge.text}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
                            <span>{badge.text}</span>
                          </span>
                        </td>

                        {/* 8. Priority */}
                        <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                          <span
                            title={study.priority || "Routine"}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border inline-block ${getPriorityBadge(
                              study.priority
                            )}`}
                          >
                            {study.priority || "Routine"}
                          </span>
                        </td>

                        {/* 9. Action */}
                        <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenStudy(study.id)
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors shadow-2xs ${
                              isSelected
                                ? "bg-[#1B4FD8] text-white hover:bg-[#1740B4]"
                                : "bg-white border border-[#DDE2EC] text-[#1B4FD8] hover:bg-blue-50"
                            }`}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="py-1.5 px-2.5 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-slate-500 bg-[#F8FAFC]">
            <div>
              Showing{" "}
              <span className="font-semibold text-slate-800">
                {sortedStudies.length === 0
                  ? 0
                  : (currentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-slate-800">
                {Math.min(currentPage * pageSize, sortedStudies.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-800">
                {sortedStudies.length}
              </span>{" "}
              exams
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="p-1 rounded border border-[#DDE2EC] bg-white text-slate-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-6 h-6 rounded text-[11px] font-semibold cursor-pointer ${
                    currentPage === i + 1
                      ? "bg-[#1B4FD8] text-white"
                      : "bg-white border border-[#DDE2EC] text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1 rounded border border-[#DDE2EC] bg-white text-slate-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

        {/* ── Right Column: Selected Patient Details & Report Entry (30% width in split view, 100% in fullscreen) ── */}
        {editorMode !== "minimized" && (
          <div
            className={`${
              isDirectReport || editorMode === "fullscreen"
                ? "w-full min-h-[calc(100vh-150px)] max-h-[calc(100vh-150px)]"
                : "w-full xl:w-[calc(30%-0.5rem)] sticky top-3 h-[calc(100vh-175px)] max-h-[calc(100vh-175px)]"
            } bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden flex flex-col transition-all min-w-0`}
          >
            {activeStudy ? (
              <>
                {/* Dark Navy Header Banner */}
                <div className="bg-[#0B132B] text-white p-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-white/10 gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-white font-bold tracking-wider">
                        {activeStudy.id}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                          activeStudy.normalizedReportStatus === "Finalized"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : activeStudy.normalizedReportStatus === "Submitted for Review"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                            : activeStudy.normalizedReportStatus === "Draft"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        }`}
                      >
                        {activeStudy.normalizedReportStatus}
                      </span>

                      {/* Visual Indicator of Unsaved Changes */}
                      {isDirty && (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.2 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span>Unsaved Changes</span>
                        </span>
                      )}
                    </div>

                    {/* Three Display Mode Controls */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 bg-white/10 p-0.5 rounded-md border border-white/10">
                        {/* Split View (70:30) Mode Control */}
                        <button
                          type="button"
                          onClick={() => setEditorMode("normal")}
                          title="Split View Layout: 70% Queue on left, 30% Editor on right"
                          className={`px-2 py-0.5 rounded text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                            editorMode === "normal"
                              ? "bg-[#1B4FD8] text-white font-bold shadow-2xs"
                              : "text-slate-300 hover:text-white hover:bg-white/10"
                          }`}
                        >
                          <Columns className="w-3 h-3" />
                          <span className="hidden sm:inline">Split (70:30)</span>
                        </button>

                        {/* Full Screen Mode Control */}
                        <button
                          type="button"
                          onClick={() =>
                            setEditorMode(editorMode === "fullscreen" ? "normal" : "fullscreen")
                          }
                          title={
                            editorMode === "fullscreen"
                              ? "Exit Full Screen Mode and restore 70:30 split view"
                              : "Full Screen Mode: Expand report editor across entire content area"
                          }
                          className={`px-2.5 py-0.5 rounded text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                            editorMode === "fullscreen"
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                              : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                          }`}
                        >
                          {editorMode === "fullscreen" ? (
                            <>
                              <Minimize2 className="w-3 h-3" />
                              <span>Exit Full Screen</span>
                            </>
                          ) : (
                            <>
                              <Maximize2 className="w-3 h-3" />
                              <span className="hidden sm:inline">Full Screen</span>
                            </>
                          )}
                        </button>
                      </div>

                      <span className="text-[10.5px] text-slate-300 font-mono hidden md:inline">
                        Suite: {activeStudy.room || (activeStudy as any).suite || "—"}
                      </span>
                    </div>
                  </div>

                <div className="mt-1.5">
                  <h2 className="text-[15px] font-bold text-white tracking-tight leading-snug">
                    {activeStudy.patient}
                  </h2>
                  <div className="text-[11px] text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                    <span>UMR: {activeStudy.umr || activeStudy.mrn || "—"}</span>
                    <span>|</span>
                    <span>
                      {resolvedPatient?.age ? `${resolvedPatient.age} Y / ` : ""}
                      {activeStudy.gender && activeStudy.gender !== "All"
                        ? activeStudy.gender
                        : resolvedPatient?.gender || "—"}
                    </span>
                    <span>|</span>
                    <span>Enc: {activeStudy.encounterId || "OP"}</span>
                  </div>
                </div>

                {/* Patient Summary Metadata Grid */}
                <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-white/10 text-[10.5px]">
                  <div>
                    <span className="text-slate-400 block text-[9.5px]">Examination</span>
                    <span className="font-semibold text-white truncate block">
                      {activeStudy.study}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9.5px]">Modality</span>
                    <span className="font-semibold text-white truncate block">
                      {activeStudy.modality} ({getCanonicalRadiologyModality(activeStudy)})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9.5px]">Ordered By</span>
                    <span className="font-medium text-slate-200 truncate block">
                      {activeStudy.provider || (activeStudy as any).orderedBy || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9.5px]">Scan Completed</span>
                    <span className="font-medium text-slate-200 truncate block">
                      {activeStudy.completedAt
                        ? new Date(activeStudy.completedAt).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : activeStudy.sentToReportingAt
                        ? new Date(activeStudy.sentToReportingAt).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Four Right Panel Tabs */}
              <div className="flex border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11.5px] font-semibold">
                <button
                  onClick={() => setRightPanelTab("report_entry")}
                  className={`flex-1 py-1.5 text-center border-b-2 cursor-pointer transition-colors ${
                    rightPanelTab === "report_entry"
                      ? "border-[#1B4FD8] text-[#1B4FD8] bg-white font-bold"
                      : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  Report Entry
                </button>
                <button
                  onClick={() => setRightPanelTab("patient_info")}
                  className={`flex-1 py-1.5 text-center border-b-2 cursor-pointer transition-colors ${
                    rightPanelTab === "patient_info"
                      ? "border-[#1B4FD8] text-[#1B4FD8] bg-white font-bold"
                      : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  Patient Info
                </button>
                <button
                  onClick={() => setRightPanelTab("clinical_indication")}
                  className={`flex-1 py-1.5 text-center border-b-2 cursor-pointer transition-colors ${
                    rightPanelTab === "clinical_indication"
                      ? "border-[#1B4FD8] text-[#1B4FD8] bg-white font-bold"
                      : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  Indication
                </button>
                <button
                  onClick={() => setRightPanelTab("history")}
                  className={`flex-1 py-1.5 text-center border-b-2 cursor-pointer transition-colors ${
                    rightPanelTab === "history"
                      ? "border-[#1B4FD8] text-[#1B4FD8] bg-white font-bold"
                      : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  History
                </button>
              </div>

              {/* ── Tab 1: Report Entry Form ── */}
              {rightPanelTab === "report_entry" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* Scrollable Form Body */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
                    {/* Read-Only Banner for Finalized Reports */}
                  {activeStudy.normalizedReportStatus === "Finalized" && (
                    <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[12.5px] text-emerald-950 flex items-center gap-1.5">
                            <span>Official Diagnostic Report (Read-Only Mode)</span>
                            <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.2 rounded-full uppercase font-bold">
                              Finalized
                            </span>
                          </h4>
                          <p className="text-[11px] text-emerald-800">
                            Signed and clinically approved by{" "}
                            <strong>{activeStudy.finalizedBy || activeStudy.radiologist || "Radiologist"}</strong>
                            {activeStudy.finalizedAt ? ` on ${new Date(activeStudy.finalizedAt).toLocaleDateString()}` : ""}. Editing is disabled.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowPdfModal(activeStudy)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md font-bold text-[11.5px] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors shrink-0"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print / Export PDF</span>
                      </button>
                    </div>
                  )}

                  {/* Correction Required Clinical Instructions Banner */}
                  {(activeStudy.normalizedReportStatus === "Correction Required" ||
                    activeStudy.normalizedReportStatus === "Needs Correction" ||
                    Boolean(activeStudy.correctionNotes)) && (
                    <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-lg shadow-2xs space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-[12.5px] text-amber-950">
                                Clinical Correction Required by Radiologist
                              </h4>
                              <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full uppercase">
                                Revision Requested
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-900 mt-1">
                              Returned by{" "}
                              <strong className="text-amber-950">
                                {activeStudy.returnedForCorrectionBy || "Radiologist / Consultant"}
                              </strong>
                              {activeStudy.returnedForCorrectionAt
                                ? ` on ${new Date(activeStudy.returnedForCorrectionAt).toLocaleString("en-IN", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white/90 border border-amber-300/80 rounded-md p-2.5 text-[11.5px] text-slate-800 space-y-1">
                        <div className="font-semibold text-amber-950 flex items-center gap-1.5 text-[11px]">
                          <FileText className="w-3.5 h-3.5 text-amber-700" />
                          <span>Correction Instructions & Required Changes:</span>
                        </div>
                        <p className="text-[11.5px] text-slate-800 whitespace-pre-wrap pl-5 font-medium leading-relaxed">
                          {activeStudy.correctionNotes ||
                            "Please review and update diagnostic findings and impression as requested by the radiologist."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Submitted for Review / Under Review Banner */}
                  {(activeStudy.normalizedReportStatus === "Submitted for Review" ||
                    (activeStudy.normalizedReportStatus as string) === "Under Review") && (
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-2.5 text-[11.5px] text-blue-900 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>
                          <strong>Submitted for Review:</strong> Report has been prepared and submitted for Radiologist review and approval.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Draft Saved Status Banner */}
                  {activeStudy.normalizedReportStatus === "Draft" && (
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between gap-2.5 text-[11.5px] text-purple-900 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>
                          <strong>Draft Saved:</strong> Continuing previously saved report draft. You can continue editing findings, update impression, or finalize.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Awaiting Report Status Banner */}
                  {RadiologyWorkflowDb.isPendingReportStatus(activeStudy.normalizedReportStatus) &&
                    activeStudy.normalizedReportStatus !== "Correction Required" &&
                    activeStudy.normalizedReportStatus !== "Needs Correction" &&
                    !activeStudy.correctionNotes && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2.5 text-[11.5px] text-amber-900 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>Awaiting Report:</strong> Examination complete. Enter diagnostic observations and impression below using approved templates.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Template Selection & Actions Row */}
                  <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-md space-y-1.5 text-[11px] overflow-hidden">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[#1B4FD8] text-[10px] uppercase tracking-wider">
                          Report Template:
                        </span>
                        {currentTemplate && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] px-1 py-0.2 rounded bg-blue-100 text-[#1B4FD8] font-mono font-semibold">
                              v{currentTemplate.version}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                currentTemplate.status === "Active"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {currentTemplate.status}
                            </span>
                          </div>
                        )}
                      </div>

                      {activeStudy.normalizedReportStatus === "Finalized" && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded shrink-0">
                          Template Locked
                        </span>
                      )}
                    </div>

                    <div className="pt-0.5">
                      {currentTemplate ? (
                        <div
                          className="font-bold text-[#0F172A] text-[12.5px] leading-snug break-words"
                          title={currentTemplate.templateName || currentTemplate.testName}
                        >
                          {currentTemplate.templateName && currentTemplate.templateName !== currentTemplate.testName
                            ? `${currentTemplate.templateName} (${currentTemplate.testName})`
                            : currentTemplate.testName || currentTemplate.templateName || currentTemplate.uploadedFileName}
                        </div>
                      ) : (
                        <span className="text-amber-800 font-semibold flex items-center gap-1 text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                          No active template matching test.
                        </span>
                      )}
                    </div>

                    {activeStudy.normalizedReportStatus !== "Finalized" && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1.5 border-t border-blue-200/70">
                        {currentTemplate && (
                          <button
                            type="button"
                            onClick={() => applyTemplate(currentTemplate, true)}
                            className="px-2 py-1 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded font-bold text-[11px] cursor-pointer shadow-2xs flex items-center justify-center gap-1 transition-colors min-w-0"
                            title="Populate report form with this template's sections and default text"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                            <span className="truncate">Apply Template</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowTemplateSelector(!showTemplateSelector)}
                          className="px-2 py-1 bg-white border border-[#BFDBFE] hover:bg-blue-50 text-[#1B4FD8] rounded font-semibold text-[11px] cursor-pointer shadow-2xs transition-colors flex items-center justify-center min-w-0"
                        >
                          <span className="truncate">{showTemplateSelector ? "Close" : "Change"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowImporterModal(true)}
                          className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-semibold text-[11px] cursor-pointer shadow-2xs flex items-center justify-center gap-1 transition-colors min-w-0"
                          title="Upload or import template file"
                        >
                          <UploadCloud className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">Upload</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTemplateManagerModal(true)}
                          className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-semibold text-[11px] cursor-pointer shadow-2xs flex items-center justify-center gap-1 transition-colors min-w-0"
                          title="Manage templates catalog"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">Catalog</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dropdown to change template if opened */}
                  {showTemplateSelector && (
                    <div className="p-2 bg-white border border-[#DDE2EC] rounded-md shadow-sm space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">
                          Select Report Template:
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {availableTemplates.length} templates available
                        </span>
                      </div>
                      <select
                        value={currentTemplate?.id || ""}
                        onChange={(e) => {
                          const id = e.target.value
                          if (!id) {
                            setSelectedTemplateId(null)
                            return
                          }
                          const target = availableTemplates.find((t) => t.id === id)
                          if (target) {
                            applyTemplate(target, true)
                          } else {
                            setSelectedTemplateId(id)
                          }
                          setShowTemplateSelector(false)
                        }}
                        className="w-full border border-[#DDE2EC] rounded p-1.5 bg-white text-slate-800 focus:outline-none focus:border-[#1B4FD8]"
                      >
                        {availableTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.templateName && t.templateName !== t.testName
                              ? `${t.templateName} (${t.testName})`
                              : t.testName || t.templateName || "Untitled Template"}{" "}
                            [v{t.version}] — {t.status}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Warning when no template exists */}
                  {!currentTemplate ? (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-[12px] text-amber-950">
                            No Matching Report Template Configured
                          </h4>
                          <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                            No active report template was found matching "{activeStudy.study}" ({activeStudy.modality}).
                            Upload a template file or select an existing template from the catalog.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-amber-200">
                        <button
                          onClick={() => setShowImporterModal(true)}
                          className="px-2.5 py-1 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded font-semibold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <UploadCloud className="w-3 h-3" />
                          <span>Upload Template</span>
                        </button>
                        <button
                          onClick={() => setShowTemplateManagerModal(true)}
                          className="px-2.5 py-1 bg-white border border-[#DDE2EC] hover:bg-slate-50 text-slate-700 rounded font-semibold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <FileText className="w-3 h-3 text-slate-500" />
                          <span>Templates</span>
                        </button>
                        <button
                          onClick={() => setShowTemplateSelector(true)}
                          className="px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded font-semibold text-[11px] cursor-pointer"
                        >
                          Select Existing
                        </button>
                      </div>
                    </div>
                  ) : effectiveSections.length > 0 ? (
                    // Structured Sections & Fields from Active Template
                    <div className="space-y-2.5">
                      {effectiveSections.map((section, sIdx) => {
                        const isImpressionSec =
                          section.title.toLowerCase().includes("impression") ||
                          section.title.toLowerCase().includes("conclusion")
                        const isFindingsSec =
                          section.title.toLowerCase().includes("finding") ||
                          section.title.toLowerCase().includes("observation")
                        const isTechniqueSec =
                          section.title.toLowerCase().includes("technique") ||
                          section.title.toLowerCase().includes("protocol")

                        return (
                          <div
                            key={section.id || sIdx}
                            className={`p-3 rounded-lg space-y-2 border ${
                              isImpressionSec
                                ? "bg-blue-50/40 border-blue-200"
                                : "bg-slate-50/70 border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/80">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-[11.5px] text-[#0F172A] tracking-wide uppercase">
                                  {section.title}
                                </h4>
                                {section.instructions &&
                                  !section.instructions.toLowerCase().startsWith("observations for") &&
                                  !section.instructions.toLowerCase().startsWith("enter observations") && (
                                    <span className="text-[10.5px] text-slate-500 italic">
                                      ({section.instructions})
                                    </span>
                                  )}
                              </div>
                              {activeStudy.normalizedReportStatus !== "Finalized" && (
                                <button
                                  type="button"
                                  onClick={() => setRemovedSectionIds((prev) => [...prev, section.id])}
                                  className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Remove this section from report"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {section.fields && section.fields.length > 0 ? (
                              <div className="space-y-2">
                                {section.fields.map((field, fIdx) => {
                                  const isFieldFindings =
                                    field.label.toLowerCase().includes("finding") ||
                                    field.id.toLowerCase().includes("finding") ||
                                    isFindingsSec
                                  const isFieldImpression =
                                    field.label.toLowerCase().includes("impression") ||
                                    field.label.toLowerCase().includes("conclusion") ||
                                    field.id.toLowerCase().includes("impression") ||
                                    isImpressionSec
                                  const isFieldTechnique =
                                    field.label.toLowerCase().includes("technique") ||
                                    field.label.toLowerCase().includes("protocol") ||
                                    isTechniqueSec

                                  const isRedundantLabel =
                                    field.label.trim().toLowerCase() === section.title.trim().toLowerCase() ||
                                    field.label.toLowerCase().includes("observations & findings") ||
                                    field.label.toLowerCase().startsWith("observations for")

                                  return (
                                    <div key={field.id || fIdx} className="space-y-1">
                                      {!isRedundantLabel && (
                                        <label className="text-[11.5px] font-semibold text-slate-700 block">
                                          {field.label}
                                          {field.required && (
                                            <span className="text-red-500 ml-0.5">*</span>
                                          )}
                                        </label>
                                      )}
                                      {field.type === "select" && field.options ? (
                                        <select
                                          disabled={activeStudy.normalizedReportStatus === "Finalized"}
                                          value={
                                            reportForm.sectionValues[field.id] !== undefined
                                              ? reportForm.sectionValues[field.id]
                                              : field.defaultValue || ""
                                          }
                                          onChange={(e) => {
                                            const val = e.target.value
                                            setReportForm((prev) => ({
                                              ...prev,
                                              sectionValues: {
                                                ...prev.sectionValues,
                                                [field.id]: val,
                                              },
                                            }))
                                          }}
                                          className="w-full border border-[#DDE2EC] rounded-lg p-2 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                                        >
                                          {field.options.map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                      ) : isFieldTechnique && field.type !== "textarea" ? (
                                        <input
                                          type="text"
                                          disabled={activeStudy.normalizedReportStatus === "Finalized"}
                                          value={
                                            reportForm.sectionValues[field.id] !== undefined
                                              ? reportForm.sectionValues[field.id]
                                              : field.defaultValue || ""
                                          }
                                          onChange={(e) => {
                                            const val = e.target.value
                                            setReportForm((prev) => ({
                                              ...prev,
                                              sectionValues: {
                                                ...prev.sectionValues,
                                                [field.id]: val,
                                              },
                                            }))
                                          }}
                                          placeholder={field.placeholder || `Enter ${field.label}...`}
                                          className="w-full border border-[#DDE2EC] rounded-lg p-2 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                                        />
                                      ) : (
                                        <textarea
                                          rows={isFieldFindings ? 6 : isFieldImpression ? 4 : 3}
                                          disabled={activeStudy.normalizedReportStatus === "Finalized"}
                                          value={
                                            reportForm.sectionValues[field.id] !== undefined
                                              ? reportForm.sectionValues[field.id]
                                              : field.defaultValue || ""
                                          }
                                          onChange={(e) => {
                                            const val = e.target.value
                                            setReportForm((prev) => ({
                                              ...prev,
                                              sectionValues: {
                                                ...prev.sectionValues,
                                                [field.id]: val,
                                              },
                                            }))
                                          }}
                                          placeholder={
                                            field.placeholder ||
                                            `Enter observations for ${field.label}...`
                                          }
                                          className={`w-full border border-[#DDE2EC] rounded-lg p-2.5 text-[12px] sm:text-[12.5px] leading-relaxed bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] resize-y ${
                                            isFieldFindings
                                              ? "min-h-[160px]"
                                              : isFieldImpression
                                              ? "min-h-[110px]"
                                              : "min-h-[85px]"
                                          }`}
                                        />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <textarea
                                rows={isFindingsSec ? 6 : isImpressionSec ? 4 : 3}
                                disabled={activeStudy.normalizedReportStatus === "Finalized"}
                                value={reportForm.sectionValues[section.id] || ""}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setReportForm((prev) => ({
                                    ...prev,
                                    sectionValues: {
                                      ...prev.sectionValues,
                                      [section.id]: val,
                                    },
                                  }))
                                }}
                                placeholder={`Enter clinical observations for ${section.title}...`}
                                className={`w-full border border-[#DDE2EC] rounded-lg p-2.5 text-[12px] sm:text-[12.5px] leading-relaxed bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] resize-y ${
                                  isFindingsSec
                                    ? "min-h-[160px]"
                                    : isImpressionSec
                                    ? "min-h-[110px]"
                                    : "min-h-[85px]"
                                }`}
                              />
                            )}
                          </div>
                        )
                      })}

                      {/* Impression / Diagnostic Conclusion if not already included in sections */}
                      {!effectiveSections.some(
                        (s) =>
                          s.title.toLowerCase().includes("impression") ||
                          s.title.toLowerCase().includes("conclusion") ||
                          s.fields?.some((f) => f.label.toLowerCase().includes("impression"))
                      ) && (
                        <div className="space-y-1 p-2.5 bg-blue-50/50 border border-blue-200 rounded-lg">
                          <label className="text-[11.5px] font-bold text-[#0F172A] block uppercase tracking-wide">
                            Impression / Diagnostic Conclusion
                          </label>
                          <textarea
                            rows={4}
                            disabled={activeStudy.normalizedReportStatus === "Finalized"}
                            value={reportForm.impressionText}
                            onChange={(e) =>
                              setReportForm((prev) => ({
                                ...prev,
                                impressionText: e.target.value,
                              }))
                            }
                            placeholder="Enter final diagnostic impression..."
                            className="w-full min-h-[110px] border border-[#DDE2EC] rounded-lg p-2.5 text-[12px] sm:text-[12.5px] font-medium leading-relaxed bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] resize-y"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    // Fallback to standard sections if template has empty sections
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="text-[11.5px] font-bold text-[#0F172A] block uppercase tracking-wide">
                          Clinical History / Indication
                        </label>
                        <textarea
                          rows={2}
                          disabled={activeStudy.normalizedReportStatus === "Finalized"}
                          value={reportForm.indication}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              indication: e.target.value,
                            }))
                          }
                          className="w-full min-h-[60px] border border-[#DDE2EC] rounded-lg p-2 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8] resize-y"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11.5px] font-bold text-[#0F172A] block uppercase tracking-wide">
                          Technique / Protocol
                        </label>
                        <input
                          type="text"
                          disabled={activeStudy.normalizedReportStatus === "Finalized"}
                          value={reportForm.technique}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              technique: e.target.value,
                            }))
                          }
                          className="w-full border border-[#DDE2EC] rounded-lg p-2 text-[12px] bg-white focus:outline-none focus:border-[#1B4FD8]"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11.5px] font-bold text-[#0F172A] uppercase tracking-wide">
                            Findings
                          </label>
                          <span className="text-[10.5px] text-slate-400">
                            Detailed anatomical observations
                          </span>
                        </div>
                        <textarea
                          rows={6}
                          disabled={activeStudy.normalizedReportStatus === "Finalized"}
                          value={reportForm.findingsText}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              findingsText: e.target.value,
                            }))
                          }
                          placeholder="Enter radiological findings..."
                          className="w-full min-h-[160px] border border-[#DDE2EC] rounded-lg p-2.5 text-[12px] sm:text-[12.5px] font-mono leading-relaxed bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] resize-y"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11.5px] font-bold text-[#0F172A] block uppercase tracking-wide">
                          Impression
                        </label>
                        <textarea
                          rows={4}
                          disabled={activeStudy.normalizedReportStatus === "Finalized"}
                          value={reportForm.impressionText}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              impressionText: e.target.value,
                            }))
                          }
                          placeholder="Enter diagnostic impression..."
                          className="w-full min-h-[110px] border border-[#DDE2EC] rounded-lg p-2.5 text-[12px] sm:text-[12.5px] font-medium bg-white focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] resize-y"
                        />
                      </div>
                    </div>
                  )}

                  {/* Approved Normal Phrases Helper */}
                  {currentTemplate && activeStudy.normalizedReportStatus !== "Finalized" && (
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-md text-[11px] space-y-1">
                      <span className="font-bold text-slate-600 uppercase tracking-wider block text-[10px]">
                        Quick Approved Phrases:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {COMMON_APPROVED_PHRASES.map((ph, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleInsertPhrase(ph.text)}
                            className="px-1.5 py-0.5 bg-white border border-slate-300 hover:border-[#1B4FD8] hover:text-[#1B4FD8] rounded text-[10.5px] font-medium cursor-pointer transition-colors"
                          >
                            + {ph.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Finalized Notice / Seal */}
                  {activeStudy.normalizedReportStatus === "Finalized" && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-md text-[11.5px] text-emerald-950 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <div className="font-bold">Official Report Finalized & Signed</div>
                          <div className="text-[10.5px] text-emerald-800">
                            Signed by {activeStudy.finalizedBy || activeStudy.radiologist || "Radiologist"} on{" "}
                            {activeStudy.finalizedAt
                              ? new Date(activeStudy.finalizedAt).toLocaleDateString()
                              : "Record"}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setShowPdfModal(activeStudy)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Print PDF</span>
                      </button>
                    </div>
                  )}

                  </div>

                  {/* Pinned Action Buttons Footer at Bottom of Report Panel */}
                  <div className="shrink-0 bg-slate-50 border-t border-[#E2E8F0] px-2.5 py-2 z-10 shadow-xs">
                    {activeStudy.normalizedReportStatus !== "Finalized" ? (
                      <div className="flex flex-col gap-1.5">
                        {/* Upper row: Clear Draft + Save Draft */}
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={handleClearDraft}
                            title="Clear all entered report fields and reset draft"
                            className="px-2 py-1 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-600 hover:text-red-700 rounded-md font-semibold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Clear Draft</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleSaveDraft}
                            title="Save entered progress as draft"
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-[#DDE2EC] text-slate-700 rounded-md font-semibold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs transition-colors shrink-0"
                          >
                            <Save className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              {activeStudy.normalizedReportStatus === "Correction Required" ||
                              Boolean(activeStudy.correctionNotes)
                                ? "Save Updated Draft"
                                : "Save as Draft"}
                            </span>
                          </button>
                        </div>

                        {/* Main Action Buttons Grid: Submit for Review & Finalize Report */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={handleSubmitForReview}
                            className="w-full px-2 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded-md font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer shadow-2xs transition-colors"
                          >
                            <CheckSquare className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                            <span className="truncate">
                              {activeStudy.normalizedReportStatus === "Correction Required" ||
                              Boolean(activeStudy.correctionNotes)
                                ? "Resubmit Review"
                                : "Submit for Review"}
                            </span>
                          </button>

                          {isAuthorizedRadiologist ? (
                            <button
                              type="button"
                              onClick={handleFinalizeReport}
                              className="w-full px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer shadow-2xs transition-colors"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                              <span className="truncate">Finalize Report</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title="Only authorized Radiologists or Doctors can finalize diagnostic reports"
                              className="w-full px-1.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-md font-semibold text-[10.5px] flex items-center justify-center gap-1 cursor-not-allowed"
                            >
                              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">Finalize (Radiologist)</span>
                            </button>
                          )}
                        </div>

                        {/* Return for Correction button (when radiologist is reviewing) */}
                        {isAuthorizedRadiologist &&
                          (activeStudy.normalizedReportStatus === "Submitted for Review" ||
                            (activeStudy.normalizedReportStatus as string) === "Under Review") && (
                            <button
                              type="button"
                              onClick={() => setShowCorrectionModal(true)}
                              className="w-full py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-md font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer shadow-2xs transition-colors"
                              title="Return this report to technician for required clinical changes or revisions"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span className="truncate">Return for Clinical Correction</span>
                            </button>
                          )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-emerald-800 text-[11.5px] font-semibold">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Report Finalized & Signed</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPdfModal(activeStudy)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs transition-colors whitespace-nowrap"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab 2: Patient Information ── */}
              {rightPanelTab === "patient_info" && (
                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 text-[11.5px]">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                    <span className="font-bold text-[#0F172A] block pb-1 border-b border-slate-200 uppercase tracking-wider text-[10.5px]">
                      Demographics & Registration
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-slate-700">
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Patient Name:</span>
                        <span className="font-semibold text-slate-900">{activeStudy.patient}</span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">UMR No:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {activeStudy.umr || activeStudy.mrn || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Age & Gender:</span>
                        <span className="font-semibold text-slate-900">
                          {resolvedPatient?.age ? `${resolvedPatient.age} Y / ` : ""}
                          {activeStudy.gender && activeStudy.gender !== "All"
                            ? activeStudy.gender
                            : resolvedPatient?.gender || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Contact Phone:</span>
                        <span className="font-mono text-slate-900">
                          {resolvedPatient?.phone || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Blood Group:</span>
                        <span className="font-semibold text-slate-900">
                          {resolvedPatient?.bloodGroup || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Encounter / Visit:</span>
                        <span className="font-mono text-slate-900">
                          {activeStudy.encounterId || "OP"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Department:</span>
                        <span className="text-slate-900">{activeStudy.department || "Radiology"}</span>
                      </div>
                      <div>
                        <span className="text-[10.5px] text-slate-500 block">Scan Suite:</span>
                        <span className="text-slate-900">{activeStudy.room || (activeStudy as any).suite || "—"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                    <span className="font-bold text-[#0F172A] block pb-1 border-b border-slate-200 uppercase tracking-wider text-[10.5px]">
                      Payment Clearance Status
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-medium">Radiology Billing Status:</span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded text-[10.5px] ${
                          activeStudy.isPaid || activeStudy.paymentStatus === "Paid"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-amber-100 text-amber-800 border border-amber-300"
                        }`}
                      >
                        {activeStudy.isPaid || activeStudy.paymentStatus === "Paid"
                          ? "✓ Paid & Cleared"
                          : "Payment Pending"}
                      </span>
                    </div>
                    {(activeStudy.paidReceiptNo || (activeStudy as any).invoiceId) && (
                      <div className="text-[11px] text-slate-600 font-mono">
                        Billing Reference: {activeStudy.paidReceiptNo || (activeStudy as any).invoiceId}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab 3: Clinical Indication ── */}
              {rightPanelTab === "clinical_indication" && (
                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 text-[11.5px]">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                    <span className="font-bold text-[#0F172A] block pb-1 border-b border-slate-200 uppercase tracking-wider text-[10.5px]">
                      Doctor Clinical Orders
                    </span>
                    <div>
                      <span className="text-slate-500 block text-[10.5px]">Ordering Physician:</span>
                      <span className="font-semibold text-slate-800">
                        {activeStudy.provider || (activeStudy as any).orderedBy || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10.5px]">Ordered Examination:</span>
                      <span className="font-semibold text-slate-800">
                        {activeStudy.study} ({activeStudy.modality})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10.5px]">Clinical Indication:</span>
                      <p className="text-slate-800 bg-white p-2 border border-slate-200 rounded mt-0.5 leading-relaxed">
                        {activeStudy.indication ||
                          "Standard diagnostic examination per clinical consultation."}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10.5px]">
                        Requested Protocol / Technique:
                      </span>
                      <p className="text-slate-800 bg-white p-2 border border-slate-200 rounded mt-0.5 leading-relaxed">
                        {activeStudy.technique ||
                          `Diagnostic ${activeStudy.modality} imaging protocol.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 4: Audit & Examination History ── */}
              {rightPanelTab === "history" && (
                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                    <span className="font-bold text-[#0F172A]">Action Audit Trail</span>
                    <span className="text-[10.5px] text-slate-500 font-mono">{activeStudy.id}</span>
                  </div>

                  {activeStudy.history && activeStudy.history.length > 0 ? (
                    <div className="space-y-1.5">
                      {activeStudy.history.map((log, lIdx) => (
                        <div
                          key={lIdx}
                          className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] space-y-0.5"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-800">
                            <span>{log.action}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="text-slate-600">{log.details}</div>
                          <div className="text-[10px] text-slate-400">
                            By {log.actor} ({log.role || "Staff"})
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400">
                      No prior action history logged for this study.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-1.5">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <div className="font-semibold text-slate-700 text-[13px]">No examination selected</div>
              <p className="text-[11px] text-slate-500">
                Click on any examination row in the reports queue to view details and start reporting.
              </p>
            </div>
          )}
        </div>
      )}
      </div>

      {/* ── Docked Minimized Panel (when editorMode === 'minimized') ── */}
      {editorMode === "minimized" && activeStudy && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B132B] text-white p-3 border-t border-slate-700 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white font-bold tracking-wider">
                {activeStudy.id}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeStudy.normalizedReportStatus === "Finalized"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : activeStudy.normalizedReportStatus === "Submitted for Review"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : activeStudy.normalizedReportStatus === "Draft"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                }`}
              >
                {activeStudy.normalizedReportStatus}
              </span>
            </div>

            <div className="min-w-0">
              <span className="font-bold text-[13px] text-white truncate inline-block mr-2">
                {activeStudy.patient}
              </span>
              <span className="text-[11px] text-slate-300">
                UMR: {activeStudy.umr || activeStudy.mrn || "—"} | {activeStudy.study} ({activeStudy.modality})
              </span>
            </div>

            {isDirty && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10.5px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shrink-0 animate-pulse">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                Unsaved Changes in Editor
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeStudy.normalizedReportStatus !== "Finalized" && (
              <button
                type="button"
                onClick={handleSaveDraft}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              >
                <Save className="w-3.5 h-3.5 text-slate-300" />
                <span>Save Draft</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setEditorMode("normal")}
              className="px-3 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Restore Editor</span>
            </button>

            <button
              type="button"
              onClick={() => setEditorMode("fullscreen")}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Unsaved Changes Confirmation Modal ── */}
      {showUnsavedConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 border border-slate-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-[15px] text-[#0F172A]">
                  Unsaved Changes in Report
                </h3>
                <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">
                  You have unsaved changes in the report for{" "}
                  <span className="font-semibold text-slate-900">
                    {activeStudy?.patient}
                  </span>{" "}
                  ({activeStudy?.id}). Switching to another examination without saving will discard your current edits.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  handleSaveDraft()
                  if (pendingSwitchStudyId) {
                    performStudySwitch(pendingSwitchStudyId)
                  }
                  setShowUnsavedConfirmModal(false)
                  setPendingSwitchStudyId(null)
                }}
                className="w-full py-2 px-3 bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded-lg text-[12px] font-semibold cursor-pointer shadow-2xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft & Switch</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  lastSavedSnapshotRef.current = JSON.stringify(reportForm)
                  if (pendingSwitchStudyId) {
                    performStudySwitch(pendingSwitchStudyId)
                  }
                  setShowUnsavedConfirmModal(false)
                  setPendingSwitchStudyId(null)
                }}
                className="w-full py-2 px-3 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-red-600 rounded-lg text-[12px] font-semibold cursor-pointer transition-colors"
              >
                Discard Changes
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowUnsavedConfirmModal(false)
                  setPendingSwitchStudyId(null)
                }}
                className="w-full py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[12px] font-medium cursor-pointer transition-colors"
              >
                Keep Editing Current Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Template Management ── */}
      {showTemplateManagerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#1B4FD8] flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#0F172A]">
                    Report Template Management
                  </h3>
                  <p className="text-[12px] text-slate-500">
                    Manage, upload, activate, and assign radiology report templates.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImporterModal(true)}
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white px-3 py-1.5 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Upload Template</span>
                </button>
                <button
                  onClick={() => setShowTemplateManagerModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filters Toolbar */}
            <div className="p-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row items-center gap-2 text-[12px]">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={templateManagerSearch}
                  onChange={(e) => setTemplateManagerSearch(e.target.value)}
                  placeholder="Search template name, test, modality..."
                  className="w-full pl-9 pr-3 py-1.5 border border-[#DDE2EC] rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <select
                value={templateManagerModality}
                onChange={(e) => setTemplateManagerModality(e.target.value)}
                className="border border-[#DDE2EC] rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-[#1B4FD8]"
              >
                <option value="all">All Modalities</option>
                <option value="X-Ray">X-Ray</option>
                <option value="CT">CT Scan</option>
                <option value="MRI">MRI</option>
                <option value="Ultrasound">Ultrasound</option>
              </select>
            </div>

            {/* Template List Table */}
            <div className="overflow-y-auto flex-1 p-4">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3">Template Name</th>
                    <th className="py-2.5 px-3">Associated Examination</th>
                    <th className="py-2.5 px-2">Modality</th>
                    <th className="py-2.5 px-2">Format</th>
                    <th className="py-2.5 px-2">Version</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {availableTemplates
                    .filter((t) => {
                      if (
                        templateManagerModality !== "all" &&
                        !t.testName.toLowerCase().includes(templateManagerModality.toLowerCase())
                      ) {
                        return false
                      }
                      if (templateManagerSearch) {
                        const q = templateManagerSearch.toLowerCase()
                        const match =
                          (t.templateName || "").toLowerCase().includes(q) ||
                          (t.testName || "").toLowerCase().includes(q) ||
                          (t.uploadedFileName || "").toLowerCase().includes(q)
                        if (!match) return false
                      }
                      return true
                    })
                    .map((tpl) => (
                      <tr key={tpl.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-semibold text-[#0F172A]">
                          {tpl.templateName || tpl.uploadedFileName || tpl.testName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{tpl.testName}</td>
                        <td className="py-2.5 px-2 font-mono text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold">
                            {tpl.testName.includes("CT")
                              ? "CT"
                              : tpl.testName.includes("MRI")
                              ? "MR"
                              : tpl.testName.includes("USG") || tpl.testName.includes("Ultrasound")
                              ? "US"
                              : "XR"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-[11px] font-mono text-slate-500 uppercase">
                          {tpl.uploadedFileType || "DOCX"}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-slate-600">v{tpl.version}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                              tpl.status === "Active"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {tpl.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                applyTemplate(tpl, true)
                                setShowTemplateManagerModal(false)
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-[#1B4FD8] hover:bg-blue-100 rounded cursor-pointer"
                            >
                              Apply to Study
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete template "${tpl.testName}"?`)) {
                                  RadiologyTemplateDatabase.deleteTemplate(tpl.id)
                                  showToast(`Template deleted from catalog.`, "info")
                                }
                              }}
                              title="Delete template from catalog"
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between text-[12px] bg-slate-50">
              <span className="text-slate-500">
                Total templates configured:{" "}
                <span className="font-bold text-slate-800">{availableTemplates.length}</span>
              </span>
              <button
                onClick={() => setShowTemplateManagerModal(false)}
                className="px-4 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Return for Correction ── */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-amber-600">
              <RotateCcw className="w-5 h-5" />
              <h3 className="font-bold text-base text-[#0F172A]">
                Return Report for Correction
              </h3>
            </div>
            <p className="text-[12.5px] text-slate-600">
              Please provide clinical instructions explaining why this report requires revision by the technician.
            </p>
            <textarea
              rows={4}
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. Findings clarify left apical pleural thickening and update diagnostic impression..."
              className="w-full border border-slate-300 rounded-lg p-2.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmittingCorrection}
                onClick={() => {
                  if (!isSubmittingCorrection) {
                    setShowCorrectionModal(false)
                    setCorrectionReason("")
                  }
                }}
                className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-700 font-semibold text-xs cursor-pointer hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingCorrection || !correctionReason.trim()}
                onClick={handleConfirmReturnForCorrection}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-xs cursor-pointer shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmittingCorrection && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmittingCorrection ? "Returning..." : "Return for Revision"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Dedicated Template Importer / Upload ── */}
      {showImporterModal && (
        <TemplateImporterModal
          onClose={() => setShowImporterModal(false)}
          onSuccess={(newTemplate) => {
            setShowImporterModal(false)
            applyTemplate(newTemplate, true)
            setTick((t) => t + 1)
          }}
          currentUserName={currentTechnician}
          currentRole={currentRole}
        />
      )}

      {/* ── Modal: Official Radiology Report PDF Preview & Print ── */}
      {showPdfModal && (
        <RadiologyReportPdfModal
          study={showPdfModal}
          onClose={() => setShowPdfModal(null)}
        />
      )}
    </div>
  )
}
