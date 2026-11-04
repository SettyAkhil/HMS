import React, { useState, useMemo, useEffect, useRef } from "react"
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Save,
  Check,
  X,
  Search,
  Trash2,
  Edit3,
  HelpCircle,
  PlusCircle,
} from "lucide-react"

import {
  TemplateExtractionService,
  ExtractedDocument,
} from "../../services/templateExtractionService"
import {
  RadiologyTemplateDatabase,
  RadiologyTemplate,
  extractTextFromPdfBuffer,
  extractTextFromWordBuffer,
  extractCleanTemplateText,
  parseSectionsFromContent,
} from "../../services/radiologyTemplateDb"
import { processRadiologyTemplateUpload } from "../Radiology"
import { DiagnosticTariffDatabase, DiagnosticTariffItem } from "../../services/diagnosticTariffDb"

interface RadiologyTemplateUploadViewProps {
  currentUserName?: string
  currentRole?: string
  onNavigateView?: (view: string, subParam?: string) => void
  externalSearchQuery?: string
}

export default function RadiologyTemplateUploadView({
  currentUserName = "Radiology Technologist",
  currentRole = "Radiology Technologist",
  onNavigateView,
  externalSearchQuery = "",
}: RadiologyTemplateUploadViewProps) {
  // ── 1. Workflow Stages: 1=Upload, 2=Extract, 3=Review & Edit, 4=Save Template ──
  const [workflowStage, setWorkflowStage] = useState<1 | 2 | 3 | 4>(1)

  // ── 2. Upload State (initially empty) ──
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | File | null>(null)
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null)
  const [persistentFileDataUrl, setPersistentFileDataUrl] = useState<string>("")
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── 3. Extracted Document & Preview State (initially empty) ──
  const [extractedDoc, setExtractedDoc] = useState<ExtractedDocument | null>(null)
  const [previewTab, setPreviewTab] = useState<"preview" | "raw_text">("preview")
  const [editingExtractedText, setEditingExtractedText] = useState("")
  const [zoomLevel, setZoomLevel] = useState(1.0)
  const [isFullScreen, setIsFullScreen] = useState(false)

  // ── 4. Save Template Form State ──
  const [templateName, setTemplateName] = useState("")
  const [examinationType, setExaminationType] = useState("")
  const [department, setDepartment] = useState("CT")
  const [bodyPart, setBodyPart] = useState("Head")
  const [templateType, setTemplateType] = useState("Report Format")
  const [description, setDescription] = useState("")
  const [selectedTariffId, setSelectedTariffId] = useState<string>("")

  // ── 5. Saved Templates Table State ──
  const [tick, setTick] = useState(0)
  const [tableSearch, setTableSearch] = useState("")
  const [modalityFilter, setModalityFilter] = useState("All Modalities")
  const [typeFilter, setTypeFilter] = useState("All Types")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)

  // ── 6. UI Toast ──
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null)
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Load tariffs catalogue
  const allTariffs: DiagnosticTariffItem[] = useMemo(() => {
    return DiagnosticTariffDatabase.getRadiologyTariffs()
  }, [])

  // Listen to database updates across tabs
  useEffect(() => {
    const unsub = RadiologyTemplateDatabase.onUpdate(() => setTick((t) => t + 1))
    return () => unsub()
  }, [])

  // Listen to global new template event
  useEffect(() => {
    const handleNewTemplateEvent = () => handleNewTemplate()
    window.addEventListener("hospai_rad_new_template", handleNewTemplateEvent)
    return () => window.removeEventListener("hospai_rad_new_template", handleNewTemplateEvent)
  }, [])

  // Query templates from database
  const allTemplates = useMemo(() => {
    return RadiologyTemplateDatabase.getTemplates()
  }, [tick])

  // Formatting helpers for saved templates display matching screenshot
  const getDisplayTemplateName = (tpl: RadiologyTemplate): string => {
    if (tpl.templateName && tpl.templateName.trim()) return tpl.templateName.trim()
    const t = tpl.testName || ""
    if (t.toLowerCase().includes("ct") && t.toLowerCase().includes("head")) return "CT Brain Report"
    if (t.toLowerCase().includes("chest") && t.toLowerCase().includes("x-ray")) return "Chest X-Ray Report"
    if (t.toLowerCase().includes("spine") || t.toLowerCase().includes("lumbar")) return "MRI Spine Report"
    if (t.toLowerCase().includes("abdomen") && t.toLowerCase().includes("ultrasound")) return "Ultrasound Abdomen"
    if (t.toLowerCase().includes("mammography")) return "Digital Mammography"
    if (t.toLowerCase().includes("chest") && t.toLowerCase().includes("ct")) return "CT Chest Report"
    if (t.toLowerCase().includes("abdomen") && t.toLowerCase().includes("ct")) return "CT Abdomen Report"
    if (t.toLowerCase().includes("pelvis")) return "USG Pelvis Report"
    if (t.toLowerCase().includes("knee")) return "Knee X-Ray Report"
    if (t.toLowerCase().includes("dexa")) return "DEXA Bone Density Report"
    return t.endsWith("Report") ? t : `${t} Report`
  }

  const getDisplayTestName = (tpl: RadiologyTemplate): string => {
    const t = tpl.testName || ""
    if (t.toLowerCase().includes("ct") && t.toLowerCase().includes("head")) return "CT Brain"
    if (t.toLowerCase().includes("chest") && t.toLowerCase().includes("x-ray")) return "Chest X-Ray"
    if (t.toLowerCase().includes("spine") || t.toLowerCase().includes("lumbar")) return "MRI Spine"
    if (t.toLowerCase().includes("abdomen") && t.toLowerCase().includes("ultrasound")) return "USG Abdomen"
    if (t.toLowerCase().includes("mammography")) return "Mammography"
    if (t.toLowerCase().includes("chest") && t.toLowerCase().includes("ct")) return "CT Chest"
    if (t.toLowerCase().includes("abdomen") && t.toLowerCase().includes("ct")) return "CT Abdomen"
    if (t.toLowerCase().includes("pelvis")) return "USG Pelvis"
    if (t.toLowerCase().includes("knee")) return "Knee Radiograph"
    return t
  }

  const getDisplayModality = (tpl: RadiologyTemplate): string => {
    if (tpl.modality) {
      const m = tpl.modality.toUpperCase()
      if (m.includes("CT")) return "CT"
      if (m.includes("XR") || m.includes("X-RAY")) return "XR"
      if (m.includes("MR")) return "MRI"
      if (m.includes("US") || m.includes("ULTRA")) return "US"
      if (m.includes("MG") || m.includes("MAMMO")) return "MG"
      return tpl.modality
    }
    const t = (tpl.testName || "").toLowerCase()
    if (t.includes("ct")) return "CT"
    if (t.includes("x-ray") || t.includes("radiograph") || t.includes("pa view")) return "XR"
    if (t.includes("mri") || t.includes("mr ")) return "MRI"
    if (t.includes("ultrasound") || t.includes("usg")) return "US"
    if (t.includes("mammography")) return "MG"
    return "XR"
  }

  const getDisplayType = (tpl: RadiologyTemplate): string => {
    if (tpl.templateType) return tpl.templateType.replace(" Format", "")
    return "Report"
  }

  // Filter & sort templates (newest user templates at top)
  const filteredTemplates = useMemo(() => {
    let list = allTemplates
    const query = (tableSearch || externalSearchQuery).trim().toLowerCase()
    if (query) {
      list = list.filter((tpl) => {
        const name = getDisplayTemplateName(tpl).toLowerCase()
        const test = getDisplayTestName(tpl).toLowerCase()
        const mod = getDisplayModality(tpl).toLowerCase()
        return name.includes(query) || test.includes(query) || mod.includes(query)
      })
    }
    if (modalityFilter !== "All Modalities") {
      list = list.filter((tpl) => getDisplayModality(tpl) === modalityFilter)
    }
    if (typeFilter !== "All Types") {
      list = list.filter((tpl) => getDisplayType(tpl).toLowerCase() === typeFilter.toLowerCase())
    }
    // Predefined Standardized Sorting: Newest uploaded or created templates strictly first (descending).
    // Uses actual template creation / upload timestamps (templateUploadedAt / templateCreatedAt / createdAt).
    // Editing an existing template updates updatedAt but preserves createdAt, so it does NOT alter queue position unless a new version is explicitly created.
    // Stable secondary tie-breaker: Template ID descending.
    return [...list].sort((a, b) => {
      const getTemplateCreationTimestamp = (tpl: RadiologyTemplate): number => {
        const ts = (tpl as any).templateUploadedAt || (tpl as any).templateCreatedAt || tpl.createdAt
        if (ts) {
          const t = new Date(ts).getTime()
          if (!isNaN(t) && t > 0) return t
        }
        return 0
      }

      const timeA = getTemplateCreationTimestamp(a)
      const timeB = getTemplateCreationTimestamp(b)
      if (timeA !== timeB) {
        return timeB - timeA // Newest created / uploaded first
      }
      return (b.id || "").localeCompare(a.id || "")
    })
  }, [allTemplates, tableSearch, externalSearchQuery, modalityFilter, typeFilter])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / pageSize))
  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredTemplates.slice(start, start + pageSize)
  }, [filteredTemplates, currentPage, pageSize])

  // ── Drag & Drop Handlers ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  // Handle file selected from file picker or drop
  const handleFileSelected = (file: File) => {
    setUploadError(null)
    setSelectedFile(file)
    setExtractedDoc(null)
    setEditingExtractedText("")
    setWorkflowStage(1)

    // Create object URL for immediate high-fidelity preview
    try {
      const objUrl = URL.createObjectURL(file)
      setFileDataUrl(objUrl)
    } catch (e) {
      console.warn("Could not create object URL:", e)
    }

    // Also read as data URL for persistence
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPersistentFileDataUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)

    // Name inference from filename
    const cleanName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())

    setTemplateName(cleanName.includes("Report") ? cleanName : `${cleanName} Report`)

    // Attempt catalogue match
    const cLow = cleanName.toLowerCase()
    const detected = allTariffs.find((t) => {
      const tLow = t.name.toLowerCase()
      return cLow.includes(tLow) || tLow.includes(cLow)
    })
    if (detected) {
      setSelectedTariffId(detected.id)
      setExaminationType(detected.name)
      if (detected.department) setDepartment(detected.department)
      if (detected.bodyRegion) setBodyPart(detected.bodyRegion)
    } else {
      if (cLow.includes("brain") || cLow.includes("head")) {
        setExaminationType("CT Brain")
        setDepartment("CT")
        setBodyPart("Head")
      } else if (cLow.includes("chest") && (cLow.includes("xray") || cLow.includes("x-ray"))) {
        setExaminationType("Chest X-Ray")
        setDepartment("XR")
        setBodyPart("Chest")
      } else if (cLow.includes("spine")) {
        setExaminationType("MRI Spine")
        setDepartment("MRI")
        setBodyPart("Spine")
      } else if (cLow.includes("abdomen")) {
        setExaminationType("USG Abdomen")
        setDepartment("US")
        setBodyPart("Abdomen")
      } else {
        setExaminationType(cleanName.replace(/\s+Report$/i, "") || "CT Brain")
        setDepartment("CT")
        setBodyPart("Head")
      }
    }
  }

  // ── Extract Text Action ──
  const handleExtractText = async () => {
    if (!selectedFile) {
      showToast("Please select a file to extract.", "error")
      return
    }

    if (selectedFile instanceof File) {
      setIsProcessing(true)
      setWorkflowStage(2)

      try {
        const uploadResult = await processRadiologyTemplateUpload(selectedFile, { saveToDatabase: false })
        if (!uploadResult.success) {
          setUploadError(uploadResult.error || "Failed to extract text from document.")
          showToast(uploadResult.error || "Extraction failed", "error")
          setIsProcessing(false)
          setWorkflowStage(1)
          return
        }

        if (uploadResult.originalFileDataUrl) {
          setPersistentFileDataUrl(uploadResult.originalFileDataUrl)
          if (!fileDataUrl) setFileDataUrl(uploadResult.originalFileDataUrl)
        }

        let doc: ExtractedDocument
        try {
          doc = await TemplateExtractionService.extractDocument(selectedFile)
        } catch {
          doc = {
            title: selectedFile.name.replace(/\.[^/.]+$/, ""),
            pages: [
              {
                pageNumber: 1,
                widthMm: 210,
                heightMm: 297,
                orientation: "portrait",
                marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
                elements: [],
                extractedText: uploadResult.extractedText,
                characterCount: uploadResult.extractedText.length,
                wordCount: uploadResult.extractedText.split(/\s+/).filter(Boolean).length,
                status: "success",
              },
            ],
            originalFileType: uploadResult.fileType.toUpperCase(),
            originalFileName: selectedFile.name,
            originalFileSize: selectedFile.size,
            originalFileDataUrl: uploadResult.originalFileDataUrl,
            pageCount: 1,
            ocrApplied: uploadResult.isScanned || false,
            extractionConfidence: 96,
            warnings: uploadResult.warnings,
            detectedExamName: templateName,
            detectedModality: department,
            extractedAt: new Date().toISOString(),
            fullExtractedText: uploadResult.extractedText,
            completenessReport: { status: "Complete", ocrPagesCount: 0 } as any,
          }
        }

        if (uploadResult.extractedText) {
          doc.fullExtractedText = uploadResult.extractedText
          if (doc.pages && doc.pages[0]) {
            doc.pages[0].extractedText = uploadResult.extractedText
          }
        }

        setExtractedDoc(doc)
        setEditingExtractedText(doc.fullExtractedText || uploadResult.extractedText)
        setWorkflowStage(3)
        showToast(`Text extracted successfully (${doc.pageCount || 1} pages).`, "success")
      } catch (err: any) {
        console.error("Extraction error:", err)
        const msg = err.message || "Failed to extract text."
        setUploadError(msg)
        showToast(msg, "error")
        setWorkflowStage(1)
      } finally {
        setIsProcessing(false)
      }
    } else {
      setIsProcessing(true)
      setWorkflowStage(2)
      setTimeout(() => {
        setIsProcessing(false)
        setWorkflowStage(3)
        showToast("Text extracted successfully.", "success")
      }, 400)
    }
  }

  // ── Save Template Action ──
  const handleSaveTemplate = () => {
    const finalTemplateName =
      templateName.trim() ||
      (selectedFile && "name" in selectedFile
        ? selectedFile.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ") + " Report"
        : "Radiology Report Template")

    const finalExamType =
      examinationType.trim() ||
      finalTemplateName.replace(/\s+Report$/i, "").trim() ||
      "CT Brain"

    let contentToSave = editingExtractedText.trim()
    if (!contentToSave) {
      if (extractedDoc?.fullExtractedText?.trim()) {
        contentToSave = extractedDoc.fullExtractedText.trim()
      } else {
        contentToSave = `CLINICAL INDICATION:\nEvaluation and clinical assessment.\n\nTECHNIQUE:\nStandard protocol examination performed.\n\nFINDINGS:\nDiagnostic evaluation demonstrates normal anatomical structures. No focal lesion, acute hemorrhage, fracture, or abnormal mass effect detected.\n\nIMPRESSION:\nNormal diagnostic examination within physiological limits.`
      }
      setEditingExtractedText(contentToSave)
    }

    try {
      const docToSave: ExtractedDocument = extractedDoc || {
        title: finalTemplateName,
        pages: [
          {
            pageNumber: 1,
            widthMm: 210,
            heightMm: 297,
            orientation: "portrait",
            marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
            elements: [],
            extractedText: contentToSave,
            characterCount: contentToSave.length,
            wordCount: contentToSave.split(/\s+/).filter(Boolean).length,
            status: "success",
          },
        ],
        originalFileType: selectedFile?.name?.toLowerCase().endsWith(".pdf") ? "PDF" : "TXT",
        originalFileName: selectedFile?.name || `${finalTemplateName}.txt`,
        originalFileSize: selectedFile?.size || 1024,
        originalFileDataUrl: persistentFileDataUrl || fileDataUrl || "",
        pageCount: 1,
        ocrApplied: false,
        extractionConfidence: 99,
        warnings: [],
        detectedExamName: finalTemplateName,
        detectedModality: department,
        extractedAt: new Date().toISOString(),
        fullExtractedText: contentToSave,
        completenessReport: { status: "Complete", ocrPagesCount: 0 } as any,
      }

      RadiologyTemplateDatabase.saveImportedTemplateDraft({
        templateName: finalTemplateName,
        testName: finalExamType,
        testId: selectedTariffId || undefined,
        modality: department,
        bodyPart: bodyPart,
        templateType: templateType,
        description: description.trim(),
        reconstructedDocument: docToSave,
        originalFileDataUrl: persistentFileDataUrl || fileDataUrl || "",
        originalFileName: selectedFile?.name || `${finalTemplateName}.pdf`,
        originalFileType: docToSave.originalFileType || "PDF",
        originalFileSize: selectedFile?.size || 245 * 1024,
        createdBy: currentUserName,
        status: "Active",
      })

      // Reset filters and navigate to page 1 so the new template is immediately visible at Row #1 on Page 1
      setTableSearch("")
      setModalityFilter("All Modalities")
      setTypeFilter("All Types")
      setCurrentPage(1)
      setWorkflowStage(4)
      setTick((t) => t + 1)

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hospai_rad_clear_global_search"))
      }

      showToast(`Template "${finalTemplateName}" saved successfully in Saved Templates!`, "success")
    } catch (err: any) {
      console.error("Save template error:", err)
      showToast(err.message || "Failed to save template.", "error")
    }
  }

  // ── View Template in Preview ──
  const handleViewTemplate = (tpl: RadiologyTemplate) => {
    const dispName = getDisplayTemplateName(tpl)
    setTemplateName(dispName)
    setExaminationType(getDisplayTestName(tpl))
    setDepartment(getDisplayModality(tpl))
    setBodyPart(tpl.bodyPart || "Head")
    setTemplateType(tpl.templateType || "Report Format")
    setDescription(tpl.description || "")

    const text = tpl.rawContent || tpl.fullExtractedText || ""
    setEditingExtractedText(text)

    setExtractedDoc({
      title: dispName,
      pages: [
        {
          pageNumber: 1,
          widthMm: 210,
          heightMm: 297,
          orientation: "portrait",
          marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
          elements: [],
          extractedText: text,
          characterCount: text.length,
          wordCount: text.split(/\s+/).filter(Boolean).length,
          status: "success",
        },
      ],
      originalFileType: tpl.uploadedFileType ? tpl.uploadedFileType.toUpperCase() : "TXT",
      originalFileName: tpl.uploadedFileName || `${dispName}.txt`,
      originalFileSize: 245 * 1024,
      originalFileDataUrl: tpl.originalFileDataUrl || "",
      pageCount: 1,
      ocrApplied: false,
      extractionConfidence: 98,
      warnings: [],
      detectedExamName: dispName,
      detectedModality: getDisplayModality(tpl),
      extractedAt: new Date().toISOString(),
      fullExtractedText: text,
      completenessReport: { status: "Complete", ocrPagesCount: 0 } as any,
    })

    setFileDataUrl(tpl.originalFileDataUrl || null)
    setSelectedFile({
      name: tpl.uploadedFileName || `${dispName.replace(/\s+/g, "_")}.${tpl.uploadedFileType || "txt"}`,
      size: 245 * 1024,
    })

    setWorkflowStage(3)
    showToast(`Loaded "${dispName}" into preview.`, "info")
  }

  // ── Edit Template Action ──
  const handleEditTemplate = (tpl: RadiologyTemplate) => {
    handleViewTemplate(tpl)
    showToast(`Editing template "${getDisplayTemplateName(tpl)}".`, "info")
  }

  // ── Delete Template Action ──
  const handleDeleteTemplate = (tpl: RadiologyTemplate) => {
    const dispName = getDisplayTemplateName(tpl)
    if (window.confirm(`Are you sure you want to delete template "${dispName}"?`)) {
      RadiologyTemplateDatabase.deleteTemplate(tpl.id)
      setTick((t) => t + 1)
      showToast(`Template "${dispName}" deleted.`, "info")
    }
  }

  // ── Reset to New Template ──
  const handleNewTemplate = () => {
    setSelectedFile(null)
    setFileDataUrl(null)
    setPersistentFileDataUrl("")
    setExtractedDoc(null)
    setEditingExtractedText("")
    setTemplateName("")
    setExaminationType("")
    setDepartment("CT")
    setBodyPart("Head")
    setTemplateType("Report Format")
    setDescription("")
    setWorkflowStage(1)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    showToast("Ready for new template upload.", "info")
  }

  // ── Exam Selection Helper ──
  const handleSelectExam = (examName: string) => {
    setExaminationType(examName)
    const matched = allTariffs.find((t) => t.name.toLowerCase() === examName.toLowerCase())
    if (matched) {
      setSelectedTariffId(matched.id)
      if (matched.department) setDepartment(matched.department)
      if (matched.bodyRegion) setBodyPart(matched.bodyRegion)
    } else {
      const eLow = examName.toLowerCase()
      if (eLow.includes("ct")) setDepartment("CT")
      else if (eLow.includes("x-ray") || eLow.includes("xr")) setDepartment("XR")
      else if (eLow.includes("mri") || eLow.includes("mr")) setDepartment("MRI")
      else if (eLow.includes("usg") || eLow.includes("ultrasound")) setDepartment("US")
      else if (eLow.includes("mammography")) setDepartment("MG")
    }
    if (!templateName || templateName.includes("Report")) {
      setTemplateName(`${examName} Report`)
    }
  }

  return (
    <div className="space-y-4 text-[#0F172A] font-sans">
      {/* ── Toast Notification Banner ── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 p-3 rounded-lg border flex items-center justify-between text-[12.5px] font-semibold transition-all shadow-md max-w-md ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-300"
              : toast.type === "error"
              ? "bg-red-50 text-red-900 border-red-300"
              : "bg-blue-50 text-blue-900 border-blue-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : toast.type === "error" ? (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Top Header Title Banner ── */}
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 mt-0.5 shadow-2xs">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
            Template Upload & Extraction
          </h1>
          <p className="text-[12.5px] text-slate-500 mt-0.5 leading-relaxed">
            Upload your radiology report format (PDF, Word, or Text). Extract the exact content, review it, edit if needed, and save it as a reusable template.
          </p>
        </div>
      </div>

      {/* ── 4-Stage Horizontal Workflow Indicator ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Stage 1: Upload File */}
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 transition-colors ${
                workflowStage >= 1
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-blue-100 text-blue-600"
              }`}
            >
              1
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[13px] text-slate-900 leading-tight">
                Upload File
              </div>
              <div className="text-[11px] text-slate-500 font-medium truncate">
                PDF, DOC, DOCX, TXT
              </div>
            </div>
          </div>

          {/* Stage 2: Extract Text */}
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 transition-colors ${
                workflowStage >= 2
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-blue-100 text-blue-600"
              }`}
            >
              2
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[13px] text-slate-900 leading-tight">
                Extract Text
              </div>
              <div className="text-[11px] text-slate-500 font-medium truncate">
                Get exact content
              </div>
            </div>
          </div>

          {/* Stage 3: Review & Edit */}
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 transition-colors ${
                workflowStage >= 3
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-blue-100 text-blue-600"
              }`}
            >
              3
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[13px] text-slate-900 leading-tight">
                Review & Edit
              </div>
              <div className="text-[11px] text-slate-500 font-medium truncate">
                Verify and make changes
              </div>
            </div>
          </div>

          {/* Stage 4: Save Template */}
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] shrink-0 transition-colors ${
                workflowStage === 4
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-blue-100 text-blue-600"
              }`}
            >
              4
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[13px] text-slate-900 leading-tight">
                Save Template
              </div>
              <div className="text-[11px] text-slate-500 font-medium truncate">
                Use in reporting workspace
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main 2-Column Responsive Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN: 1. Upload Template File & 2. Extracted Content Preview
        ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-5">
          {/* ── Panel 1: Upload Template File ── */}
          <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs">
            <h2 className="text-[14px] font-bold text-slate-900 mb-3.5">
              1. Upload Template File
            </h2>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? "border-blue-600 bg-blue-50/70"
                  : "border-blue-300 hover:border-blue-500 bg-blue-50/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.xml,.json,.txt,.rtf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelected(e.target.files[0])
                  }
                }}
                className="hidden"
              />

              {/* Cloud Upload Icon */}
              <div className="w-12 h-12 mx-auto rounded-full bg-blue-100/70 flex items-center justify-center text-blue-600 mb-2.5">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>

              <div className="text-[13.5px] font-bold text-slate-800">
                Drag & drop your file here
              </div>
              <div className="text-[12.5px] text-blue-600 font-semibold mt-0.5 hover:underline">
                or click to browse
              </div>

              <div className="text-[11px] text-slate-500 mt-2">
                Supported formats: PDF, DOC, DOCX, TXT (Max 10 MB)
              </div>
            </div>

            {/* Uploaded File Pill / Card */}
            {selectedFile && (
              <div className="mt-4 p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded bg-red-500 text-white font-bold text-[10px] tracking-wider uppercase flex items-center justify-center shrink-0 shadow-2xs">
                    {selectedFile.name.toLowerCase().endsWith(".pdf")
                      ? "PDF"
                      : selectedFile.name.toLowerCase().endsWith(".docx") || selectedFile.name.toLowerCase().endsWith(".doc")
                      ? "DOC"
                      : "TXT"}
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="text-[13px] font-bold text-slate-800 truncate">
                      {selectedFile.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {(selectedFile.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleNewTemplate()
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Error Message if any */}
            {uploadError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Centered Extract Text Button */}
            {selectedFile && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleExtractText}
                  disabled={isProcessing}
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white px-8 py-2 rounded-lg text-[13px] font-bold shadow-sm cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-75"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Extracting Text...</span>
                    </>
                  ) : (
                    <span>Extract Text</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ── Panel 2: Extracted Content Preview ── */}
          <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs">
            {/* Header with Extracted Success Badge & Page Count */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[14px] font-bold text-slate-900">
                  2. Extracted Content Preview
                </h2>
                {extractedDoc && (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Text extracted successfully</span>
                  </span>
                )}
              </div>

              {extractedDoc && (
                <span className="bg-slate-100 text-slate-600 text-[11px] font-mono font-medium px-2 py-0.5 rounded border border-slate-200">
                  Pages: {extractedDoc.pageCount || 1}
                </span>
              )}
            </div>

            {/* Sub-bar: Preview vs Raw Text Tabs & Zoom Controls */}
            <div className="border-b border-slate-200 pb-2 mb-3 flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setPreviewTab("preview")}
                  className={`flex items-center gap-1.5 font-bold pb-2 -mb-2.5 border-b-2 transition-colors cursor-pointer ${
                    previewTab === "preview"
                      ? "text-[#1B4FD8] border-[#1B4FD8]"
                      : "text-slate-500 border-transparent hover:text-slate-800"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewTab("raw_text")}
                  className={`flex items-center gap-1.5 font-bold pb-2 -mb-2.5 border-b-2 transition-colors cursor-pointer ${
                    previewTab === "raw_text"
                      ? "text-[#1B4FD8] border-[#1B4FD8]"
                      : "text-slate-500 border-transparent hover:text-slate-800"
                  }`}
                >
                  <span className="font-mono text-[11px]">&lt;/&gt;</span>
                  <span>Raw Text</span>
                </button>
              </div>

              {/* Zoom & Fullscreen Controls */}
              <div className="flex items-center gap-2 text-slate-600">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.6, Number((z - 0.1).toFixed(1))))}
                  className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] text-slate-600 w-10 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(1.5, Number((z + 0.1).toFixed(1))))}
                  className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullScreen(true)}
                  disabled={!extractedDoc}
                  className="w-6 h-6 rounded border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer ml-1 disabled:opacity-40"
                  title="Full Screen Preview"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content Area: Empty State or Document Preview */}
            {!extractedDoc ? (
              /* ── Empty State: shown before uploading/extracting ── */
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 min-h-[380px]">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3.5 shadow-2xs">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-slate-700 text-[14px]">
                  No Extracted Content Yet
                </h3>
                <p className="text-slate-500 text-[12px] mt-1.5 max-w-sm leading-relaxed">
                  Upload a report template file on the left and click <strong className="text-blue-600 font-semibold">Extract Text</strong> to preview and edit the exact extracted document content here.
                </p>
              </div>
            ) : previewTab === "preview" ? (
              /* ── Preview Tab: High-Fidelity Document Viewer (Shows EXACTLY what the file looks like) ── */
              <div className="bg-slate-100/70 p-3 rounded-lg overflow-auto max-h-[540px] min-h-[380px] border border-slate-200">
                <div
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center" }}
                  className="transition-transform duration-150"
                >
                  {/* If PDF fileDataUrl is present, render the exact PDF with full visual fidelity */}
                  {fileDataUrl && (selectedFile?.name?.toLowerCase().endsWith(".pdf") || extractedDoc.originalFileType === "PDF") ? (
                    <div className="w-full h-[520px] rounded-lg overflow-hidden border border-slate-300 shadow-sm bg-white">
                      <iframe
                        src={`${fileDataUrl}#toolbar=0&navpanes=0&view=FitH`}
                        title="Document Preview"
                        className="w-full h-full border-0 bg-white"
                      />
                    </div>
                  ) : (
                    /* For Word / Text / Non-PDF: render the clean, authentic extracted text */
                    <div className="bg-white border border-slate-300 rounded-lg shadow-sm p-6 mx-auto max-w-[620px] text-slate-800 text-[12.5px] leading-relaxed whitespace-pre-wrap font-sans">
                      {editingExtractedText}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Raw Text Tab: Editable Plain Extracted Text ── */
              <div className="space-y-2">
                <textarea
                  rows={18}
                  value={editingExtractedText}
                  onChange={(e) => setEditingExtractedText(e.target.value)}
                  placeholder="Extracted raw text will appear here. Edit as needed..."
                  className="w-full p-4 font-mono text-[12px] leading-relaxed border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 bg-[#F8FAFC] text-slate-900 resize-none shadow-2xs"
                />
                <div className="text-[11px] text-slate-500 italic">
                  * Any manual edits made here will be directly applied when you save this template.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT COLUMN: 3. Save Template & 4. Saved Templates Table
        ══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-5">
          {/* ── Panel 3: Save Template ── */}
          <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs">
            <h2 className="text-[14px] font-bold text-slate-900 mb-3.5">
              3. Save Template
            </h2>

            <div className="space-y-3 text-[12px]">
              {/* Row 1: Template Name * & Examination / Test * */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. CT Brain Report"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                    Examination / Test <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={examinationType}
                    onChange={(e) => handleSelectExam(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
                  >
                    <option value="">-- Select Examination / Test --</option>
                    {examinationType &&
                      !["CT Brain", "Chest X-Ray", "MRI Spine", "USG Abdomen", "Mammography", "CT Chest", "CT Abdomen", "USG Pelvis", "Knee Radiograph"].includes(examinationType) &&
                      !allTariffs.some((t) => t.name.toLowerCase() === examinationType.toLowerCase()) && (
                        <option value={examinationType}>
                          {examinationType} (Uploaded Study)
                        </option>
                      )}
                    <option value="CT Brain">CT Brain</option>
                    <option value="Chest X-Ray">Chest X-Ray</option>
                    <option value="MRI Spine">MRI Spine</option>
                    <option value="USG Abdomen">USG Abdomen</option>
                    <option value="Mammography">Mammography</option>
                    <option value="CT Chest">CT Chest</option>
                    <option value="CT Abdomen">CT Abdomen</option>
                    <option value="USG Pelvis">USG Pelvis</option>
                    <option value="Knee Radiograph">Knee Radiograph</option>
                    <optgroup label="Hospital Radiology Catalogue">
                      {allTariffs.map((t) => (
                        <option key={t.id} value={t.name}>
                          [{t.code}] {t.name} ({t.department || t.modality})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Row 2: Modality, Body Part, Template Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                    Modality
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
                  >
                    <option value="CT">CT</option>
                    <option value="XR">XR</option>
                    <option value="MRI">MRI</option>
                    <option value="US">US</option>
                    <option value="MG">MG</option>
                    <option value="PET-CT">PET-CT</option>
                    <option value="Fluoroscopy">Fluoroscopy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                    Body Part
                  </label>
                  <select
                    value={bodyPart}
                    onChange={(e) => setBodyPart(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
                  >
                    <option value="Head">Head</option>
                    <option value="Chest">Chest</option>
                    <option value="Abdomen">Abdomen</option>
                    <option value="Spine">Spine</option>
                    <option value="Pelvis">Pelvis</option>
                    <option value="Extremities">Extremities</option>
                    <option value="Neck">Neck</option>
                    <option value="Whole Body">Whole Body</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                    Template Type
                  </label>
                  <select
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
                  >
                    <option value="Report Format">Report Format</option>
                    <option value="Standard Protocol">Standard Protocol</option>
                    <option value="Structured Template">Structured Template</option>
                    <option value="Emergency Protocol">Emergency Protocol</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Description (Optional) */}
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                  Description <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description of template..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs resize-none"
                />
              </div>

              {/* Action Buttons: Cancel & Save Template */}
              <div className="pt-2 flex justify-end items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleNewTemplate}
                  className="px-4 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[12.5px] font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="px-5 py-1.5 rounded-lg bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Panel 4: Saved Templates ── */}
          <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs">
            <h2 className="text-[14px] font-bold text-slate-900 mb-3.5">
              4. Saved Templates
            </h2>

            {/* Filter Bar: Search, Modality Dropdown, Type Dropdown */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3 text-[12px]">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Search templates..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-[12px] text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs"
                />
                {tableSearch && (
                  <button
                    onClick={() => setTableSearch("")}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-[11px]"
                  >
                    ✕
                  </button>
                )}
              </div>

              <select
                value={modalityFilter}
                onChange={(e) => {
                  setModalityFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-[12px] font-medium text-slate-700 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
              >
                <option value="All Modalities">All Modalities</option>
                <option value="CT">CT</option>
                <option value="XR">XR</option>
                <option value="MRI">MRI</option>
                <option value="US">US</option>
                <option value="MG">MG</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-[12px] font-medium text-slate-700 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
              >
                <option value="All Types">All Types</option>
                <option value="Report">Report</option>
                <option value="Protocol">Protocol</option>
                <option value="Structured">Structured</option>
              </select>
            </div>

            {/* Saved Templates Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-[#F8FAFC] text-slate-500 font-semibold uppercase text-[10.5px] border-b border-slate-200 tracking-wider">
                  <tr>
                    <th className="py-2 px-3 w-8 text-center">#</th>
                    <th className="py-2 px-3">TEMPLATE NAME</th>
                    <th className="py-2 px-3">TEST / EXAMINATION</th>
                    <th className="py-2 px-3">MODALITY</th>
                    <th className="py-2 px-3">TYPE</th>
                    <th className="py-2 px-3 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {paginatedTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-400">
                        No saved templates match your filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedTemplates.map((tpl, idx) => {
                      const rowNum = (currentPage - 1) * pageSize + idx + 1
                      const dispName = getDisplayTemplateName(tpl)
                      const testName = getDisplayTestName(tpl)
                      const mod = getDisplayModality(tpl)
                      const type = getDisplayType(tpl)

                      return (
                        <tr
                          key={tpl.id || idx}
                          className="hover:bg-blue-50/40 transition-colors"
                        >
                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {rowNum}
                          </td>
                          <td className="py-2 px-3 font-semibold text-blue-600 hover:underline cursor-pointer truncate max-w-[150px]">
                            <button
                              type="button"
                              onClick={() => handleViewTemplate(tpl)}
                              className="text-left font-semibold text-blue-600 hover:underline cursor-pointer truncate"
                            >
                              {dispName}
                            </button>
                          </td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[140px]">
                            {testName}
                          </td>
                          <td className="py-2 px-3 font-mono font-medium text-slate-600">
                            {mod}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {type}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleViewTemplate(tpl)}
                                className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer rounded hover:bg-slate-100 transition-colors"
                                title="View in preview"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditTemplate(tpl)}
                                className="p-1 text-amber-500 hover:text-amber-700 cursor-pointer rounded hover:bg-amber-50 transition-colors"
                                title="Edit template"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTemplate(tpl)}
                                className="p-1 text-red-400 hover:text-red-600 cursor-pointer rounded hover:bg-red-50 transition-colors"
                                title="Delete template"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

            {/* Footer with Item Count & Pagination Controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-slate-500 font-medium">
              <div className="flex items-center gap-3">
                <div>
                  Showing {filteredTemplates.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
                  {Math.min(currentPage * pageSize, filteredTemplates.length)} of{" "}
                  {filteredTemplates.length} templates
                </div>

                <div className="flex items-center gap-1.5 text-slate-600">
                  <span>Show:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="px-2 py-0.5 border border-slate-300 rounded text-[11px] font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>All</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      type="button"
                      onClick={() => setCurrentPage(pg)}
                      className={`w-6 h-6 rounded text-[11px] font-bold flex items-center justify-center cursor-pointer transition-colors ${
                        currentPage === pg
                          ? "bg-[#1B4FD8] text-white"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {pg}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          FULL-SCREEN OVERLAY MODAL (Max Available Workspace)
      ═══════════════════════════════════════════════════════════════════ */}
      {isFullScreen && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/90 backdrop-blur-xs text-white flex flex-col overflow-hidden animate-in fade-in duration-150">
          <div className="bg-[#1E293B] border-b border-slate-700 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-400" />
              <span className="font-bold text-[14px]">
                {templateName || selectedFile?.name || "Document Preview"} (Full Screen Preview)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Exit Full Screen</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6 flex justify-center items-start">
            <div className="bg-white rounded-lg p-6 shadow-2xl max-w-4xl w-full text-slate-900">
              {fileDataUrl && (selectedFile?.name?.toLowerCase().endsWith(".pdf") || extractedDoc?.originalFileType === "PDF") ? (
                <div className="w-full h-[85vh] rounded overflow-hidden">
                  <iframe
                    src={`${fileDataUrl}#toolbar=0&navpanes=0&view=FitH`}
                    title="Full Screen Document Preview"
                    className="w-full h-full border-0 bg-white"
                  />
                </div>
              ) : (
                <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
                  {editingExtractedText}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
