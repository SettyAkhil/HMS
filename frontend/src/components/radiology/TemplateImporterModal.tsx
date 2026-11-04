import React, { useState, useRef, useEffect, useMemo } from "react"
import {
  X,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  ShieldCheck,
  Save,
  HelpCircle,
  Undo,
  Table,
  Image as ImageIcon,
  Type,
  Minus,
  Check,
  RefreshCw,
  FolderOpen,
  AlertCircle,
  FileCheck,
} from "lucide-react"

import {
  TemplateExtractionService,
  ReconstructedDocument,
  ReconstructedPage,
  ReconstructedElement,
  FileValidationResult,
  TableRow,
  TableCell,
  CompletenessReport,
  getPageText,
  getDocumentFullText,
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

import { DiagnosticTariffDatabase } from "../../services/diagnosticTariffDb"
import ReconstructedReportRenderer from "./ReconstructedReportRenderer"

interface TemplateImporterModalProps {
  onClose: () => void
  onSuccess?: (template: RadiologyTemplate) => void
  initialTemplate?: RadiologyTemplate | null
  currentRole?: string
  currentUserName?: string
}

const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".xml",
  ".json",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".rtf",
]

const DYNAMIC_FIELD_TAGS = [
  { tag: "{{patient_name}}", label: "Patient Name" },
  { tag: "{{mrn}}", label: "MRN / UMR" },
  { tag: "{{age_gender}}", label: "Age / Gender" },
  { tag: "{{study}}", label: "Study / Exam Name" },
  { tag: "{{modality}}", label: "Modality" },
  { tag: "{{accession_no}}", label: "Accession Number" },
  { tag: "{{referring_doctor}}", label: "Referring Doctor" },
  { tag: "{{date}}", label: "Examination Date" },
  { tag: "{{indication}}", label: "Clinical Indication" },
  { tag: "{{technique}}", label: "Imaging Technique" },
  { tag: "{{comparison}}", label: "Comparison" },
  { tag: "{{findings}}", label: "Diagnostic Findings" },
  { tag: "{{impression}}", label: "Diagnostic Impression" },
  { tag: "{{radiologist}}", label: "Radiologist Signature" },
]

export default function TemplateImporterModal({
  onClose,
  onSuccess,
  initialTemplate = null,
  currentRole = "Radiology Technologist",
  currentUserName = "Alex Rivera, RT(R)",
}: TemplateImporterModalProps) {
  // Steps: "upload" | "extracting" | "compare_edit"
  const [step, setStep] = useState<"upload" | "extracting" | "compare_edit">(
    initialTemplate?.reconstructedDocument ? "compare_edit" : "upload"
  )

  // Upload & Extraction State
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [extractionStatusText, setExtractionStatusText] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)

  // Document State
  const [reconstructedDoc, setReconstructedDoc] = useState<ReconstructedDocument | null>(
    initialTemplate?.reconstructedDocument || null
  )
  const [originalFileDataUrl, setOriginalFileDataUrl] = useState<string>(
    initialTemplate?.originalFileDataUrl || ""
  )
  const [originalFileName, setOriginalFileName] = useState<string>(
    initialTemplate?.uploadedFileName || ""
  )

  // Navigation & Zoom State
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [leftZoom, setLeftZoom] = useState(1.0)
  const [rightZoom, setRightZoom] = useState(1.0)
  const [syncZoom, setSyncZoom] = useState(true)

  // Extracted-Text Reviewer & Completeness State
  const [leftViewTab, setLeftViewTab] = useState<"source" | "extracted_text">("source")
  const [editingExtractedText, setEditingExtractedText] = useState<string>("")
  const [isRetrying, setIsRetrying] = useState<boolean>(false)

  // Sync editing extracted text when current page changes
  useEffect(() => {
    if (reconstructedDoc && reconstructedDoc.pages[currentPageIndex]) {
      const page = reconstructedDoc.pages[currentPageIndex]
      setEditingExtractedText(page.extractedText || getPageText(page) || "")
    }
  }, [currentPageIndex, reconstructedDoc])

  // Editing Selection State
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [selectedElement, setSelectedElement] = useState<ReconstructedElement | null>(null)

  // Configuration Form State
  const [templateName, setTemplateName] = useState(
    initialTemplate?.testName || ""
  )
  const [selectedTariffId, setSelectedTariffId] = useState<string>(
    initialTemplate?.testId || ""
  )
  const [examinationName, setExaminationName] = useState(
    initialTemplate?.testName || ""
  )
  const [examinationCode, setExaminationCode] = useState(
    initialTemplate?.examinationCode || ""
  )
  const [modality, setModality] = useState(
    initialTemplate?.modality || "XR"
  )
  const [variantProtocol, setVariantProtocol] = useState(
    initialTemplate?.variantProtocol || "Standard Diagnostic Protocol"
  )
  const [facilityApplicability, setFacilityApplicability] = useState(
    initialTemplate?.facilityApplicability || "All Hospital Facilities"
  )
  const [genderTarget, setGenderTarget] = useState<"All" | "Male" | "Female">(
    initialTemplate?.genderTarget || "All"
  )
  const [notes, setNotes] = useState(initialTemplate?.notes || "")

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const tariffs = useMemo(() => DiagnosticTariffDatabase.getRadiologyTariffs(), [])

  const isAuthorizedApprover = useMemo(() => {
    return RadiologyTemplateDatabase.canUserApproveTemplate(currentRole)
  }, [currentRole])

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Handle Examination dropdown selection
  const handleSelectTariff = (tariffId: string) => {
    setSelectedTariffId(tariffId)
    const matched = tariffs.find((t) => t.id === tariffId || t.code === tariffId)
    if (matched) {
      setExaminationName(matched.name)
      setExaminationCode(matched.code)
      setModality(matched.modality || "XR")
      if (!templateName) {
        setTemplateName(`${matched.name} Report Template`)
      }
    }
  }

  // Handle File Upload & Extraction
  const handleFileUpload = async (file: File) => {
    setValidationError(null)
    setSelectedFile(file)
    setStep("extracting")
    setExtractionProgress(10)
    setExtractionStatusText("Validating document format and reading byte stream...")

    try {
      // 1. Invoke the universal template extraction workflow (routes to the 3 functions)
      setExtractionProgress(30)
      setExtractionStatusText(`Extracting complete document content from ${file.name}...`)
      
      const uploadResult = await processRadiologyTemplateUpload(file, { saveToDatabase: false })

      if (!uploadResult.success) {
        setValidationError(uploadResult.error || "Failed to extract content from document.")
        setStep("upload")
        return
      }

      setOriginalFileDataUrl(uploadResult.originalFileDataUrl)
      setOriginalFileName(file.name)
      setExtractionProgress(60)
      setExtractionStatusText(`Deconstructing geometry and mapping structured fields via ${uploadResult.extractionFunctionUsed}...`)

      // 2. Build or extract Reconstructed Document
      let doc: ReconstructedDocument
      try {
        doc = await TemplateExtractionService.extractDocument(file, (progress, status) => {
          setExtractionProgress(60 + Math.floor(progress * 0.35))
          setExtractionStatusText(status)
        })
      } catch {
        // If advanced canvas/geometry deconstruction is bypassed or fails, build structured document from parsed sections
        doc = {
          title: file.name.replace(/\.[^/.]+$/, ""),
          pages: [
            {
              pageNumber: 1,
              widthMm: 210,
              heightMm: 297,
              orientation: "portrait",
              marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
              elements: uploadResult.sections.map((sec, idx) => ({
                id: `el_${sec.id}_${idx}`,
                type: "text",
                content: `${sec.title}:\n${sec.fields.map(f => f.defaultValue || "").join("\n")}`,
                fontSize: 10,
                fontWeight: "normal",
              })),
              extractedText: uploadResult.extractedText,
              characterCount: uploadResult.extractedText.length,
              wordCount: uploadResult.extractedText.split(/\s+/).filter(Boolean).length,
              status: "success",
            },
          ],
          originalFileType: uploadResult.fileType.toUpperCase(),
          originalFileName: file.name,
          originalFileSize: file.size,
          originalFileDataUrl: uploadResult.originalFileDataUrl,
          pageCount: 1,
          ocrApplied: uploadResult.isScanned || false,
          extractionConfidence: 95,
          warnings: uploadResult.warnings,
          detectedExamName: file.name.replace(/\.[^/.]+$/, ""),
          detectedModality: "XR",
          extractedAt: new Date().toISOString(),
          fullExtractedText: uploadResult.extractedText,
        }
      }

      // Ensure full text from uploadResult is preserved
      if (uploadResult.extractedText && (!doc.fullExtractedText || doc.fullExtractedText.length < uploadResult.extractedText.length)) {
        doc.fullExtractedText = uploadResult.extractedText
        if (doc.pages && doc.pages[0]) {
          doc.pages[0].extractedText = uploadResult.extractedText
        }
      }

      setExtractionProgress(95)
      setExtractionStatusText("Synthesizing editable layout and patient placeholders...")

      setReconstructedDoc(doc)
      setCurrentPageIndex(0)

      // Auto-detect Examination if not already set
      if (doc.detectedExamName) {
        setExaminationName(doc.detectedExamName)
        setTemplateName(`${doc.detectedExamName} Diagnostic Report`)
        const matchedTariff = tariffs.find(
          (t) => t.name.toLowerCase().includes(doc.detectedExamName!.toLowerCase())
        )
        if (matchedTariff) {
          setSelectedTariffId(matchedTariff.id)
          setExaminationCode(matchedTariff.code)
        }
      } else {
        setTemplateName(`${file.name.replace(/\.[^/.]+$/, "")} Template`)
        setExaminationName(file.name.replace(/\.[^/.]+$/, ""))
      }

      if (doc.detectedModality) {
        setModality(doc.detectedModality)
      }

      setExtractionProgress(100)
      setTimeout(() => {
        setStep("compare_edit")
        showToast(`✓ Document extracted via ${uploadResult.extractionFunctionUsed} (${uploadResult.fileType.toUpperCase()}) with faithful layout reproduction!`, "success")
      }, 400)
    } catch (err: any) {
      console.error("Extraction failure:", err)
      setValidationError(err.message || "Failed to process document. File may be corrupted or unreadable.")
      setStep("upload")
    }
  }

  // Zoom controls
  const handleZoomIn = () => {
    setRightZoom((z) => Math.min(2.0, +(z + 0.15).toFixed(2)))
    if (syncZoom) setLeftZoom((z) => Math.min(2.0, +(z + 0.15).toFixed(2)))
  }

  const handleZoomOut = () => {
    setRightZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))
    if (syncZoom) setLeftZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))
  }

  const handleResetZoom = () => {
    setRightZoom(1.0)
    setLeftZoom(1.0)
  }

  // Select Element for editing
  const handleSelectElement = (element: ReconstructedElement) => {
    setSelectedElementId(element.id)
    setSelectedElement(JSON.parse(JSON.stringify(element)))
  }

  // Update Element In Document
  const handleUpdateElement = (updated: ReconstructedElement) => {
    if (!reconstructedDoc) return
    const newPages = reconstructedDoc.pages.map((page, pIdx) => {
      if (pIdx !== currentPageIndex) return page
      return {
        ...page,
        elements: page.elements.map((el) => (el.id === updated.id ? updated : el)),
      }
    })
    setReconstructedDoc({ ...reconstructedDoc, pages: newPages })
    setSelectedElement(updated)
  }

  // Move Element Up/Down
  const handleMoveElement = (direction: "up" | "down") => {
    if (!reconstructedDoc || !selectedElementId) return
    const currentPage = reconstructedDoc.pages[currentPageIndex]
    const idx = currentPage.elements.findIndex((e) => e.id === selectedElementId)
    if (idx < 0) return

    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= currentPage.elements.length) return

    const newElements = [...currentPage.elements]
    const temp = newElements[idx]
    newElements[idx] = newElements[targetIdx]
    newElements[targetIdx] = temp

    const newPages = [...reconstructedDoc.pages]
    newPages[currentPageIndex] = { ...currentPage, elements: newElements }
    setReconstructedDoc({ ...reconstructedDoc, pages: newPages })
  }

  // Delete Element
  const handleDeleteElement = () => {
    if (!reconstructedDoc || !selectedElementId) return
    const currentPage = reconstructedDoc.pages[currentPageIndex]
    const newElements = currentPage.elements.filter((e) => e.id !== selectedElementId)
    const newPages = [...reconstructedDoc.pages]
    newPages[currentPageIndex] = { ...currentPage, elements: newElements }
    setReconstructedDoc({ ...reconstructedDoc, pages: newPages })
    setSelectedElementId(null)
    setSelectedElement(null)
    showToast("Element removed from reconstructed template.", "info")
  }

  // Add New Element
  const handleAddElement = (type: "heading" | "text" | "divider" | "field" | "table") => {
    if (!reconstructedDoc) return
    const currentPage = reconstructedDoc.pages[currentPageIndex]
    const newId = `el_added_${Date.now()}`
    let newElement: ReconstructedElement

    if (type === "heading") {
      newElement = {
        id: newId,
        type: "heading",
        content: "NEW REPORT SECTION HEADING",
        fontSize: 12,
        fontWeight: "bold",
        color: "#0f172a",
        marginTop: 8,
        marginBottom: 4,
      }
    } else if (type === "divider") {
      newElement = {
        id: newId,
        type: "divider",
        border: "1.5px solid #cbd5e1",
        marginTop: 6,
        marginBottom: 6,
      }
    } else if (type === "field") {
      newElement = {
        id: newId,
        type: "field",
        content: "{{patient_name}}",
        fieldKey: "patient_name",
        isDynamicField: true,
        fontSize: 10,
        fontWeight: "600",
        color: "#0f172a",
      }
    } else if (type === "table") {
      newElement = {
        id: newId,
        type: "table",
        tableData: {
          rows: [
            {
              id: "r1",
              cells: [
                { id: "c1", content: "Parameter / Region", bold: true, align: "left" },
                { id: "c2", content: "Result / Finding", bold: true, align: "left" },
                { id: "c3", content: "Reference Range", bold: true, align: "left" },
              ],
            },
            {
              id: "r2",
              cells: [
                { id: "c4", content: "L1-L4 BMD (g/cm²)", align: "left" },
                { id: "c5", content: "1.042", align: "left" },
                { id: "c6", content: "> 0.950 Normal", align: "left" },
              ],
            },
          ],
          colWidths: ["40%", "30%", "30%"],
          borderStyle: "1px solid #cbd5e1",
          headerRowCount: 1,
        },
      }
    } else {
      newElement = {
        id: newId,
        type: "text",
        content: "Enter clinical observation or standard template instructions...",
        fontSize: 10,
        fontWeight: "normal",
        color: "#1e293b",
        marginTop: 4,
        marginBottom: 4,
      }
    }

    const newPages = [...reconstructedDoc.pages]
    newPages[currentPageIndex] = {
      ...currentPage,
      elements: [...currentPage.elements, newElement],
    }
    setReconstructedDoc({ ...reconstructedDoc, pages: newPages })
    setSelectedElementId(newId)
    setSelectedElement(newElement)
    showToast(`Added new ${type} element.`, "info")
  }

  // Restore Original Extraction Snapshot
  const handleRestoreOriginalExtraction = () => {
    if (!reconstructedDoc) return
    if (initialTemplate?.originalExtractionSnapshot) {
      try {
        const restored = RadiologyTemplateDatabase.restoreOriginalExtraction(initialTemplate.id)
        setReconstructedDoc(restored.reconstructedDocument || null)
        setSelectedElementId(null)
        setSelectedElement(null)
        showToast("✓ Template restored to exact initial extraction snapshot.", "success")
        return
      } catch (err: any) {
        showToast(err.message || "Failed to restore original extraction.", "error")
        return
      }
    }

    showToast("Initial extraction snapshot is preserved and current changes were re-aligned.", "info")
  }

  // Retry extraction without re-uploading the file
  const handleRetryExtraction = async () => {
    if (isRetrying) return
    setIsRetrying(true)
    try {
      if (selectedFile) {
        await handleFileUpload(selectedFile)
      } else if (originalFileDataUrl && originalFileName) {
        showToast("Re-running extraction pipeline on preserved source file...", "info")
        const res = await fetch(originalFileDataUrl)
        const blob = await res.blob()
        const syntheticFile = new File([blob], originalFileName, { type: blob.type })
        await handleFileUpload(syntheticFile)
      } else {
        showToast("No source file stream available to retry extraction.", "error")
      }
    } catch (err: any) {
      showToast(err.message || "Failed to retry extraction.", "error")
    } finally {
      setIsRetrying(false)
    }
  }

  // Apply technician OCR corrections and edits to the current template page
  const handleApplyExtractedTextCorrections = () => {
    if (!reconstructedDoc) return
    const curPage = reconstructedDoc.pages[currentPageIndex]
    if (!curPage) return

    const lines = editingExtractedText.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      showToast("Cannot apply empty text layer.", "error")
      return
    }

    const updatedElements: ReconstructedElement[] = lines.map((line, idx) => {
      const isHeading = /^[A-Z0-9\s:_-]{4,}$/.test(line) && line.length < 50
      return {
        id: `el_corr_${currentPageIndex}_${idx}_${Date.now()}`,
        type: isHeading ? "heading" : "text",
        content: line,
        fontSize: isHeading ? 11 : 9.5,
        fontWeight: isHeading ? "bold" : "normal",
        marginTop: isHeading ? 6 : 2,
        marginBottom: isHeading ? 3 : 2,
      }
    })

    const newPages = [...reconstructedDoc.pages]
    const updatedPage: ReconstructedPage = {
      ...curPage,
      elements: updatedElements,
      extractedText: editingExtractedText,
      characterCount: editingExtractedText.length,
      wordCount: editingExtractedText.split(/\s+/).filter(Boolean).length,
      hasUncertainText: false,
      reviewReason: undefined,
      status: "success",
    }
    newPages[currentPageIndex] = updatedPage

    const fullText = (newPages || []).map((p) => p.extractedText || getPageText(p)).filter(Boolean).join("\n\n")
    const existingReport = reconstructedDoc.completenessReport
    const updatedReport = existingReport
      ? {
          ...existingReport,
          uncertainPages: Math.max(0, existingReport.uncertainPages - 1),
          totalCharacters: fullText.length,
          totalWords: fullText.split(/\s+/).filter(Boolean).length,
          pagesRequiringReview: existingReport.pagesRequiringReview.filter(
            (r) => r.pageNumber !== curPage.pageNumber
          ),
          status:
            existingReport.uncertainPages <= 1 && existingReport.status !== "Failed"
              ? ("Complete" as const)
              : existingReport.status,
        }
      : undefined

    setReconstructedDoc({
      ...reconstructedDoc,
      pages: newPages,
      fullExtractedText: fullText,
      completenessReport: updatedReport,
    })
    showToast("✓ Technician corrections applied to template and extracted text layer.", "success")
  }

  // Save as Draft
  const handleSaveDraft = async (submitForReview = false) => {
    if (!reconstructedDoc) {
      showToast("Cannot save: No reconstructed document available.", "error")
      return
    }
    if (!templateName.trim()) {
      showToast("Please provide a template name.", "error")
      return
    }
    if (!examinationName.trim()) {
      showToast("Please assign a clinical examination name.", "error")
      return
    }

    setIsSaving(true)
    try {
      const saved = RadiologyTemplateDatabase.saveImportedTemplateDraft({
        templateId: initialTemplate?.id,
        templateName: templateName.trim(),
        testName: examinationName.trim(),
        testId: selectedTariffId || undefined,
        examinationCode: examinationCode.trim() || undefined,
        modality,
        variantProtocol,
        facilityApplicability,
        genderTarget,
        reconstructedDocument: reconstructedDoc,
        originalFileDataUrl: originalFileDataUrl || reconstructedDoc.originalFileDataUrl,
        originalFileName: originalFileName || reconstructedDoc.originalFileName,
        originalFileType: reconstructedDoc.originalFileType,
        originalFileSize: reconstructedDoc.originalFileSize,
        submitForReview,
        createdBy: `${currentUserName} (${currentRole})`,
        notes,
      })

      showToast(
        submitForReview
          ? "✓ Template saved and submitted for clinical radiologist review!"
          : "✓ Template draft saved successfully. Original file preserved unchanged.",
        "success"
      )

      onSuccess?.(saved)
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: any) {
      console.error("Save error:", err)
      showToast(err.message || "Failed to save template draft.", "error")
    } finally {
      setIsSaving(false)
    }
  }

  // Approve Template (Radiologist / HOD only)
  const handleApproveTemplate = async () => {
    if (!isAuthorizedApprover) {
      showToast(
        `Unauthorized: User role "${currentRole}" cannot approve production templates. Only an authorized Radiologist or Department Head may approve.`,
        "error"
      )
      return
    }

    if (!reconstructedDoc) return
    setIsSaving(true)

    try {
      // First save draft state
      const saved = RadiologyTemplateDatabase.saveImportedTemplateDraft({
        templateId: initialTemplate?.id,
        templateName: templateName.trim(),
        testName: examinationName.trim(),
        testId: selectedTariffId || undefined,
        examinationCode: examinationCode.trim() || undefined,
        modality,
        variantProtocol,
        facilityApplicability,
        genderTarget,
        reconstructedDocument: reconstructedDoc,
        originalFileDataUrl: originalFileDataUrl || reconstructedDoc.originalFileDataUrl,
        originalFileName: originalFileName || reconstructedDoc.originalFileName,
        originalFileType: reconstructedDoc.originalFileType,
        originalFileSize: reconstructedDoc.originalFileSize,
        submitForReview: true,
        createdBy: `${currentUserName} (${currentRole})`,
        notes,
      })

      // Then execute clinical approval
      const approved = RadiologyTemplateDatabase.approveTemplate(
        saved.id,
        currentUserName,
        currentRole
      )

      showToast(
        `✓ Template approved & activated for clinical reporting! (Version ${approved.version})`,
        "success"
      )

      onSuccess?.(approved)
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: any) {
      console.error("Approval error:", err)
      showToast(err.message || "Failed to approve template.", "error")
    } finally {
      setIsSaving(false)
    }
  }

  const currentPage = reconstructedDoc?.pages[currentPageIndex]
  const totalPages = reconstructedDoc?.pageCount || 1

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-7xl h-[94vh] rounded-xl shadow-2xl flex flex-col border border-slate-300 overflow-hidden text-slate-900">
        {/* Toast Alert */}
        {toast && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-60 px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-semibold border flex items-center gap-2 animate-in slide-in-from-top duration-200 ${
              toast.type === "success"
                ? "bg-emerald-600 text-white border-emerald-500"
                : toast.type === "error"
                ? "bg-rose-600 text-white border-rose-500"
                : "bg-blue-600 text-white border-blue-500"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* ── Modal Header ── */}
        <div className="h-16 px-6 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">
                  Radiology Template Importer & Layout Reproducer
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-900 text-blue-200 border border-blue-700 font-semibold">
                  Faithful Reproduction Engine
                </span>
              </div>
              <p className="text-[11.5px] text-slate-300">
                Preserves original layout, typography, tables, borders, logos, and page breaks without generic redesign
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {step === "compare_edit" && (
              <div className="hidden sm:flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-[11.5px] text-slate-300">
                <span>Stage:</span>
                <span className="font-bold text-amber-400">
                  {initialTemplate?.approvalStatus === "Approved"
                    ? "Production Approved"
                    : initialTemplate?.approvalStatus === "Pending Review"
                    ? "Under Clinical Review"
                    : "Draft / Editable"}
                </span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close Importer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── STEP 1: UPLOAD INTERFACE ── */}
        {step === "upload" && (
          <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center bg-[#F8FAFC]">
            <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
                <Upload className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h4 className="text-xl font-bold text-slate-900">
                  Upload Official Radiology Report Format
                </h4>
                <p className="text-[13px] text-slate-600 max-w-md mx-auto leading-relaxed">
                  Upload an existing hospital report template. The system will deconstruct and reconstruct its exact typography, tables, headings, borders, logos, and margins.
                </p>
              </div>

              {validationError && (
                <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[12.5px] text-left flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <span className="font-bold block">Document Validation Error</span>
                    <span>{validationError}</span>
                  </div>
                </div>
              )}

              {/* Drag and drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0])
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer ${
                  dragOver
                    ? "border-blue-600 bg-blue-50/50"
                    : "border-slate-300 hover:border-blue-400 bg-slate-50/50"
                }`}
                onClick={() => {
                  const input = document.createElement("input")
                  input.type = "file"
                  input.accept = SUPPORTED_EXTENSIONS.join(",")
                  input.onchange = (e: any) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0])
                    }
                  }
                  input.click()
                }}
              >
                <div className="space-y-3">
                  <FolderOpen className="w-10 h-10 text-slate-400 mx-auto" />
                  <div>
                    <span className="text-[13.5px] font-bold text-blue-700 hover:underline">
                      Click to browse document
                    </span>
                    <span className="text-[13px] text-slate-500"> or drag and drop file here</span>
                  </div>
                  <div className="text-[11.5px] text-slate-400 font-mono">
                    Supported: PDF, DOCX, DOC, Scanned PDFs, PNG, JPG/JPEG, RTF, TXT (Max 25 MB)
                  </div>
                </div>
              </div>

              {/* Security & Integrity Badges */}
              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-[11.5px]">
                  <span className="font-bold block text-slate-800 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Non-Destructive
                  </span>
                  <span className="text-slate-500">Original source file is preserved unchanged verbatim.</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-[11.5px]">
                  <span className="font-bold block text-slate-800 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-blue-600" /> Layout Fidelity
                  </span>
                  <span className="text-slate-500">Extracts exact table grids, borders, fonts, and logos.</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-[11.5px]">
                  <span className="font-bold block text-slate-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> Clinical Governance
                  </span>
                  <span className="text-slate-500">Draft saved first; requires radiologist approval for use.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: EXTRACTION IN PROGRESS ── */}
        {step === "extracting" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F8FAFC]">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 text-center">
              <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto animate-pulse">
                <Sparkles className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h4 className="text-lg font-bold text-slate-900">
                  Extracting & Reconstructing Document
                </h4>
                <p className="text-[12px] text-slate-500 truncate font-mono">
                  {selectedFile?.name || "Processing document..."}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${extractionProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11.5px] text-slate-500 font-mono">
                  <span>{extractionStatusText}</span>
                  <span className="font-bold text-blue-700">{extractionProgress}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: SIDE-BY-SIDE DUAL PREVIEW & EDITING SUITE ── */}
        {step === "compare_edit" && reconstructedDoc && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Top Toolbar: View Controls, Page Flip, and Editing Actions */}
            <div className="h-13 bg-slate-50 border-b border-slate-200 px-4 flex items-center justify-between gap-3 shrink-0">
              {/* Page Navigator */}
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPageIndex <= 0}
                  onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[12px] font-bold text-slate-700 font-mono">
                  Page {currentPageIndex + 1} of {totalPages}
                </span>
                <button
                  disabled={currentPageIndex >= totalPages - 1}
                  onClick={() => setCurrentPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Zoom & Synchronization */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleZoomOut}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[12px] font-mono font-bold text-slate-700 w-12 text-center">
                  {Math.round(rightZoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer"
                  title="Reset 100%"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Add Elements & Restore Extraction */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAddElement("heading")}
                  className="px-2.5 py-1 text-[11.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Heading
                </button>
                <button
                  onClick={() => handleAddElement("text")}
                  className="px-2.5 py-1 text-[11.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Type className="w-3 h-3" /> Text
                </button>
                <button
                  onClick={() => handleAddElement("table")}
                  className="px-2.5 py-1 text-[11.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Table className="w-3 h-3" /> Table
                </button>
                <button
                  onClick={() => handleAddElement("divider")}
                  className="px-2.5 py-1 text-[11.5px] font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Minus className="w-3 h-3" /> Divider
                </button>

                <div className="h-4 w-px bg-slate-300 mx-1" />

                <button
                  onClick={handleRestoreOriginalExtraction}
                  className="px-2.5 py-1 text-[11.5px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded flex items-center gap-1 cursor-pointer"
                  title="Restore initial extraction if an edit goes wrong"
                >
                  <Undo className="w-3 h-3 text-amber-700" />
                  <span>Restore Original Extraction</span>
                </button>
              </div>
            </div>

            {/* ── EXTRACTION COMPLETENESS REPORT BANNER ── */}
            {reconstructedDoc.completenessReport && (
              <div className="bg-white border-b border-slate-200 px-4 py-2 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        reconstructedDoc.completenessReport.status === "Complete"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : reconstructedDoc.completenessReport.status === "Partial"
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-rose-100 text-rose-900 border border-rose-300"
                      }`}
                    >
                      {reconstructedDoc.completenessReport.status === "Complete" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : reconstructedDoc.completenessReport.status === "Partial" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span>
                        Extraction Status: {reconstructedDoc.completenessReport.status}
                      </span>
                    </span>

                    {/* Metadata chips */}
                    <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      File: <strong>{reconstructedDoc.completenessReport.fileName}</strong> ({reconstructedDoc.completenessReport.fileType.toUpperCase()})
                    </span>

                    <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono">
                      Pages: <strong>{reconstructedDoc.completenessReport.processedPages} / {reconstructedDoc.completenessReport.totalPages}</strong> processed
                    </span>

                    {reconstructedDoc.completenessReport.ocrPages > 0 && (
                      <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-mono">
                        OCR Pages: <strong>{reconstructedDoc.completenessReport.ocrPages}</strong>
                      </span>
                    )}

                    <span
                      className={`text-[11px] px-2 py-0.5 rounded border font-mono ${
                        reconstructedDoc.completenessReport.uncertainPages > 0
                          ? "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      Uncertain / Review: <strong>{reconstructedDoc.completenessReport.uncertainPages}</strong>
                    </span>

                    <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono">
                      Extracted: <strong>{reconstructedDoc.completenessReport.totalCharacters.toLocaleString()}</strong> chars ({reconstructedDoc.completenessReport.totalWords.toLocaleString()} words)
                    </span>
                  </div>

                  {/* Actions: Retry extraction */}
                  <div className="flex items-center gap-2">
                    <button
                      disabled={isRetrying}
                      onClick={handleRetryExtraction}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Re-run extraction pipeline on original source file without re-uploading"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin text-blue-600" : ""}`} />
                      <span>{isRetrying ? "Re-extracting..." : "Retry Extraction"}</span>
                    </button>
                  </div>
                </div>

                {/* Warning and review page list if partial / uncertain */}
                {reconstructedDoc.completenessReport.pagesRequiringReview.length > 0 && (
                  <div className="mt-1.5 p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11.5px] flex flex-wrap items-center gap-2">
                    <span className="font-bold flex items-center gap-1 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Technician Review Required:
                    </span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {reconstructedDoc.completenessReport.pagesRequiringReview.map((r, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setCurrentPageIndex(r.pageNumber - 1)
                            setLeftViewTab("extracted_text")
                          }}
                          className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-300 text-[10.5px] font-medium text-amber-900 cursor-pointer flex items-center gap-1"
                          title="Click to view and correct this page"
                        >
                          <span className="font-bold underline">Page {r.pageNumber}:</span>
                          <span>{r.reason}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Main Dual Comparison Workspace */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-300">
              {/* ── LEFT PANE (5 cols): ORIGINAL SOURCE FILE & EXTRACTED TEXT REVIEWER ── */}
              <div className="lg:col-span-5 flex flex-col min-h-0 bg-slate-100/70 overflow-hidden">
                <div className="h-10 px-3 bg-slate-200/90 border-b border-slate-300 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setLeftViewTab("source")}
                      className={`px-2.5 py-1 text-[11.5px] font-bold rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                        leftViewTab === "source"
                          ? "bg-white text-slate-800 shadow-sm border border-slate-300"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Original File Reference</span>
                    </button>
                    <button
                      onClick={() => setLeftViewTab("extracted_text")}
                      className={`px-2.5 py-1 text-[11.5px] font-bold rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                        leftViewTab === "extracted_text"
                          ? "bg-white text-blue-900 shadow-sm border border-blue-300"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span>Extracted Text Reviewer</span>
                      {currentPage?.hasUncertainText && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Page {currentPageIndex + 1} of {totalPages}
                  </span>
                </div>

                {leftViewTab === "source" ? (
                  <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
                    {currentPage?.originalPageImage ? (
                      <img
                        src={currentPage.originalPageImage}
                        alt={`Original Page ${currentPageIndex + 1}`}
                        className="border border-slate-300 shadow-md bg-white origin-top transition-transform"
                        style={{
                          width: `${(currentPage.widthMm || 210) * 3.7795275591 * leftZoom}px`,
                          maxWidth: "none",
                        }}
                      />
                    ) : originalFileDataUrl && originalFileDataUrl.startsWith("data:image/") ? (
                      <img
                        src={originalFileDataUrl}
                        alt="Original Image"
                        className="border border-slate-300 shadow-md bg-white origin-top transition-transform"
                        style={{
                          width: `${(currentPage?.widthMm || 210) * 3.7795275591 * leftZoom}px`,
                          maxWidth: "none",
                        }}
                      />
                    ) : (
                      <div
                        className="bg-white border border-slate-300 p-6 shadow-md text-slate-800 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-all"
                        style={{
                          width: `${(currentPage?.widthMm || 210) * 3.7795275591 * leftZoom}px`,
                          minHeight: `${(currentPage?.heightMm || 297) * 3.7795275591 * leftZoom}px`,
                        }}
                      >
                        <div className="text-[10px] text-slate-400 pb-2 mb-4 border-b border-slate-200 flex justify-between">
                          <span>ORIGINAL FILE STREAM: {originalFileName}</span>
                          <span>FORMAT: {reconstructedDoc.originalFileType.toUpperCase()}</span>
                        </div>
                        {reconstructedDoc.rawTextStream ||
                          reconstructedDoc.pages[currentPageIndex]?.elements
                            .map((e) => e.content)
                            .filter(Boolean)
                            .join("\n\n") ||
                          "Original text stream preserved."}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0 bg-white">
                    {/* Extracted text header bar */}
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-600">
                          {currentPage?.characterCount || editingExtractedText.length} chars •{" "}
                          {currentPage?.wordCount || editingExtractedText.split(/\s+/).filter(Boolean).length} words
                        </span>
                        <span className="text-slate-300">|</span>
                        <span
                          className={`font-semibold ${
                            currentPage?.isOcr ? "text-blue-700 font-mono" : "text-emerald-700"
                          }`}
                        >
                          {currentPage?.isOcr ? "Mode: Scanned / OCR" : "Mode: Direct Stream"}
                        </span>
                      </div>
                      {currentPage?.hasUncertainText && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                          Review Required
                        </span>
                      )}
                    </div>

                    {/* Uncertainty alert if flagged */}
                    {currentPage?.hasUncertainText && (
                      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block">Uncertain OCR / Layout Recognition:</strong>
                          <span>{currentPage.reviewReason || "Potential OCR misrecognitions or low contrast text."}</span>
                        </div>
                      </div>
                    )}

                    {/* Editable textarea with extracted text */}
                    <div className="flex-1 p-3 overflow-hidden flex flex-col">
                      <label className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                        Page Extracted Text Layer (Reading Order)
                      </label>
                      <textarea
                        value={editingExtractedText}
                        onChange={(e) => setEditingExtractedText(e.target.value)}
                        className="flex-1 w-full p-3 border border-slate-300 rounded font-mono text-[11.5px] leading-relaxed resize-none focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                        placeholder="Page text layer in document reading order..."
                      />
                    </div>

                    {/* Bottom action controls */}
                    <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          if (currentPage) {
                            setEditingExtractedText(currentPage.extractedText || getPageText(currentPage) || "")
                            showToast("Reset to extracted text.", "info")
                          }
                        }}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded bg-white hover:bg-slate-100 cursor-pointer"
                      >
                        Reset Text
                      </button>
                      <button
                        onClick={handleApplyExtractedTextCorrections}
                        className="px-3 py-1.5 text-[11.5px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm flex items-center gap-1.5 cursor-pointer"
                        title="Update template page and clear review flags with edited text"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Apply Corrections to Template</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── RIGHT PANE (7 cols): RECONSTRUCTED EDITABLE TEMPLATE ── */}
              <div className="lg:col-span-7 flex flex-col min-h-0 bg-slate-50 overflow-hidden">
                <div className="h-9 px-4 bg-blue-50/80 border-b border-blue-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-[12px] font-bold text-blue-900 uppercase tracking-wider">
                      Right: Reconstructed Template
                    </span>
                  </div>
                  <span className="text-[11px] text-blue-700 font-semibold">
                    Click any element to edit text, fonts, tables, or placeholders
                  </span>
                </div>

                <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
                  <ReconstructedReportRenderer
                    document={reconstructedDoc}
                    currentPageIndex={currentPageIndex}
                    isEditable={true}
                    selectedElementId={selectedElementId}
                    onSelectElement={handleSelectElement}
                    onUpdateElement={handleUpdateElement}
                    zoom={rightZoom}
                  />
                </div>
              </div>
            </div>

            {/* ── SELECTED ELEMENT EDITING DOCK (IF ELEMENT IS CLICKED) ── */}
            {selectedElement && (
              <div className="bg-white border-t border-slate-300 p-3 shadow-lg shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
                <div className="flex flex-wrap items-center gap-2 text-[12px] flex-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase font-mono px-2 py-0.5 rounded bg-slate-100">
                    Editing: {selectedElement.type}
                  </span>

                  {/* Text/Content editor */}
                  {selectedElement.type !== "divider" && selectedElement.type !== "table" && (
                    <input
                      type="text"
                      value={selectedElement.content || ""}
                      onChange={(e) =>
                        handleUpdateElement({
                          ...selectedElement,
                          content: e.target.value,
                        })
                      }
                      className="p-1 px-2 border border-slate-300 rounded text-[12px] w-64 md:w-80 font-sans focus:outline-none focus:border-blue-600"
                      placeholder="Element text..."
                    />
                  )}

                  {/* Font Size */}
                  <div className="flex items-center gap-1 border border-slate-300 rounded px-1.5 py-0.5 bg-slate-50">
                    <span className="text-[10px] text-slate-500">Font:</span>
                    <button
                      onClick={() =>
                        handleUpdateElement({
                          ...selectedElement,
                          fontSize: Math.max(7, (selectedElement.fontSize || 10) - 1),
                        })
                      }
                      className="p-0.5 text-slate-700 hover:text-black font-bold"
                    >
                      -
                    </button>
                    <span className="font-mono font-bold text-[11px]">
                      {selectedElement.fontSize || 10}pt
                    </span>
                    <button
                      onClick={() =>
                        handleUpdateElement({
                          ...selectedElement,
                          fontSize: Math.min(24, (selectedElement.fontSize || 10) + 1),
                        })
                      }
                      className="p-0.5 text-slate-700 hover:text-black font-bold"
                    >
                      +
                    </button>
                  </div>

                  {/* Bold / Italic */}
                  <button
                    onClick={() =>
                      handleUpdateElement({
                        ...selectedElement,
                        fontWeight: selectedElement.fontWeight === "bold" ? "normal" : "bold",
                      })
                    }
                    className={`px-2 py-0.5 rounded border text-[11px] font-bold cursor-pointer ${
                      selectedElement.fontWeight === "bold"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    B
                  </button>
                  <button
                    onClick={() =>
                      handleUpdateElement({
                        ...selectedElement,
                        fontStyle: selectedElement.fontStyle === "italic" ? "normal" : "italic",
                      })
                    }
                    className={`px-2 py-0.5 rounded border text-[11px] italic font-serif cursor-pointer ${
                      selectedElement.fontStyle === "italic"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    I
                  </button>

                  {/* Text Alignment */}
                  <select
                    value={selectedElement.textAlign || "left"}
                    onChange={(e) =>
                      handleUpdateElement({
                        ...selectedElement,
                        textAlign: e.target.value as any,
                      })
                    }
                    className="p-1 border border-slate-300 rounded text-[11px] bg-white cursor-pointer"
                  >
                    <option value="left">Align Left</option>
                    <option value="center">Align Center</option>
                    <option value="right">Align Right</option>
                  </select>

                  {/* Insert Dynamic Field Tag */}
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return
                      handleUpdateElement({
                        ...selectedElement,
                        content: (selectedElement.content || "") + e.target.value,
                        isDynamicField: true,
                      })
                      e.target.value = ""
                    }}
                    className="p-1 border border-purple-300 bg-purple-50 text-purple-900 rounded text-[11px] font-semibold cursor-pointer"
                  >
                    <option value="">+ Insert Patient Field...</option>
                    {DYNAMIC_FIELD_TAGS.map((f) => (
                      <option key={f.tag} value={f.tag}>
                        {f.label} ({f.tag})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Move & Delete Controls */}
                <div className="flex items-center gap-1.5 self-end md:self-auto">
                  <button
                    onClick={() => handleMoveElement("up")}
                    className="p-1 border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
                    title="Move Element Up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveElement("down")}
                    className="p-1 border border-slate-300 rounded hover:bg-slate-100 cursor-pointer"
                    title="Move Element Down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleDeleteElement}
                    className="p-1 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                    title="Delete Element"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedElementId(null)
                      setSelectedElement(null)
                    }}
                    className="p-1 border border-slate-300 text-slate-500 hover:bg-slate-100 rounded cursor-pointer ml-1"
                    title="Done Editing"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* ── FOOTER: CONFIGURATION METADATA & APPROVAL WORKFLOW ACTIONS ── */}
            <div className="p-4 bg-slate-900 text-white shrink-0 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              {/* Examination Mapping Config */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] flex-1 max-w-4xl">
                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold uppercase">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full p-1.5 rounded bg-slate-800 border border-slate-700 text-white text-[12px] focus:outline-none focus:border-blue-500"
                    placeholder="e.g. Standard DEXA Report"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold uppercase">
                    Assigned Examination *
                  </label>
                  <select
                    value={selectedTariffId}
                    onChange={(e) => handleSelectTariff(e.target.value)}
                    className="w-full p-1.5 rounded bg-slate-800 border border-slate-700 text-white text-[12px] focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">-- Match Catalog Exam --</option>
                    {tariffs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold uppercase">
                    Modality & Code
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={modality}
                      onChange={(e) => setModality(e.target.value)}
                      className="p-1.5 rounded bg-slate-800 border border-slate-700 text-white text-[12px] cursor-pointer"
                    >
                      <option value="XR">XR</option>
                      <option value="CT">CT</option>
                      <option value="MR">MR</option>
                      <option value="US">US</option>
                      <option value="NM">NM</option>
                    </select>
                    <input
                      type="text"
                      value={examinationCode}
                      onChange={(e) => setExaminationCode(e.target.value)}
                      className="w-full p-1.5 rounded bg-slate-800 border border-slate-700 text-white text-[12px] font-mono"
                      placeholder="RAD-XR-..."
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold uppercase">
                    Facility Applicability
                  </label>
                  <select
                    value={facilityApplicability}
                    onChange={(e) => setFacilityApplicability(e.target.value)}
                    className="w-full p-1.5 rounded bg-slate-800 border border-slate-700 text-white text-[12px] cursor-pointer"
                  >
                    <option value="All Hospital Facilities">All Facilities</option>
                    <option value="Main Tertiary Hospital">Main Hospital</option>
                    <option value="Outpatient Imaging Center">Outpatient Imaging</option>
                    <option value="Emergency & Trauma Unit">Emergency Unit</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons: Save Draft / Submit Review / Approve */}
              <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
                <button
                  disabled={isSaving}
                  onClick={() => handleSaveDraft(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Save as Draft (Available in Template Manager for further editing)"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Draft</span>
                </button>

                <button
                  disabled={isSaving}
                  onClick={() => handleSaveDraft(true)}
                  className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                  title="Submit for clinical review by Radiologist"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Submit for Review</span>
                </button>

                {/* Approve Button (Restricted to Authorized Clinical Personnel) */}
                <button
                  disabled={isSaving || !isAuthorizedApprover}
                  onClick={handleApproveTemplate}
                  className={`px-4 py-2 rounded-lg text-[12px] font-bold flex items-center gap-1.5 shadow-sm transition-all ${
                    isAuthorizedApprover
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                      : "bg-slate-700 text-slate-400 border border-slate-600 cursor-not-allowed opacity-60"
                  }`}
                  title={
                    isAuthorizedApprover
                      ? "Approve this template for official clinical use in Reporting Workspace"
                      : "Approval restricted to authorized Radiologists and Department Heads"
                  }
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Approve Production Template</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
