import React, { useState, useEffect, useMemo } from "react"
import { 
  FileText, 
  Printer, 
  Save, 
  CheckCircle2, 
  X, 
  Upload, 
  User, 
  Calendar, 
  Stethoscope, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  Sun, 
  Moon, 
  Activity,
  Layers,
  FileCheck2,
  Undo2,
  FileSpreadsheet,
  Search,
  Trash2,
  Plus,
  Eye,
  Maximize2,
  Minimize2,
  Minus
} from "lucide-react"
import { BillingDatabase, RadiologyStudyRecord } from "../services/billingDb"
import { db } from "../services/db"
import { AuditDatabase } from "../services/auditDb"
import { 
  RadiologyTemplateDatabase, 
  extractCleanTemplateText, 
  extractTextFromPdfBuffer, 
  extractTextFromWordBuffer,
  areTestsMatching,
  detectTestFromTemplateContent,
  parseSectionsFromContent,
  TemplateSection,
  RadiologyTemplate
} from "../services/radiologyTemplateDb"
import { DiagnosticTariffDatabase } from "../services/diagnosticTariffDb"
import NurseVerificationTab from "./radiology/NurseVerificationTab"
import { LabOrderDatabase } from "../services/labOrdersDb"
import { isRadiologyTest, getModalityForTest, getRoomForModality } from "../utils/testClassifier"
import UniversalRadiologyShell, { RadiologyViewMode } from "./radiology/UniversalRadiologyShell"

export interface ProcessedTemplateResult {
  success: boolean
  fileName: string
  fileType: "pdf" | "docx" | "doc" | "xml" | "txt" | "json" | "unknown"
  extractionFunctionUsed: "extractTextFromPdfBuffer" | "extractTextFromWordBuffer" | "extractCleanTemplateText"
  extractedText: string
  sections: TemplateSection[]
  template?: RadiologyTemplate
  originalFileDataUrl: string
  isScanned?: boolean
  error?: string
  warnings: string[]
}

/**
 * Universal Radiology Template Extraction Workflow:
 * File Upload → Correct Extraction Function → Complete Extracted Content → Template Mapping → Editable Report → Save
 *
 * 1. extractTextFromPdfBuffer — extracts available text across all pages from PDF files.
 * 2. extractTextFromWordBuffer — extracts available content from Word documents (DOCX, DOC), preserving tables and paragraphs.
 * 3. extractCleanTemplateText — cleans and extracts structured content from XML, TXT, and JSON files.
 */
export async function processRadiologyTemplateUpload(
  file: File,
  options?: {
    testName?: string
    modality?: string
    technicianName?: string
    saveToDatabase?: boolean
  }
): Promise<ProcessedTemplateResult> {
  const fileName = file.name
  const lowerName = fileName.toLowerCase()
  const ext = lowerName.split(".").pop() || ""
  const warnings: string[] = []

  // 1. Validation & Empty Check
  if (file.size === 0) {
    return {
      success: false,
      fileName,
      fileType: "unknown",
      extractionFunctionUsed: "extractCleanTemplateText",
      extractedText: "",
      sections: [],
      originalFileDataUrl: "",
      error: "The uploaded file is empty (0 bytes). Please select a valid document.",
      warnings: ["Empty file"],
    }
  }

  // 2. Preserve original file data URL so staff can verify extracted content against original
  let originalFileDataUrl = ""
  try {
    if (typeof FileReader !== "undefined") {
      originalFileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    } else if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(await file.arrayBuffer())
      const mime = file.type || "application/octet-stream"
      originalFileDataUrl = `data:${mime};base64,${buf.toString("base64")}`
    }
  } catch {
    // Non-fatal if data URL conversion fails in restricted environment
  }

  const arrayBuffer = await file.arrayBuffer()
  let extractedText = ""
  let extractionFunctionUsed: "extractTextFromPdfBuffer" | "extractTextFromWordBuffer" | "extractCleanTemplateText" = "extractCleanTemplateText"
  let fileType: "pdf" | "docx" | "doc" | "xml" | "txt" | "json" | "unknown" = "unknown"
  let isScanned = false

  // 3. Route each file format to its intended extraction function
  if (ext === "pdf" || file.type === "application/pdf") {
    fileType = "pdf"
    extractionFunctionUsed = "extractTextFromPdfBuffer"
    try {
      extractedText = await extractTextFromPdfBuffer(arrayBuffer)
    } catch (err: any) {
      return {
        success: false,
        fileName,
        fileType,
        extractionFunctionUsed,
        extractedText: "",
        sections: [],
        originalFileDataUrl,
        error: err.message || "Failed to extract text from PDF document.",
        warnings,
      }
    }

    // Flag scanned PDFs that require OCR if the PDF extractor cannot retrieve their text
    if (!extractedText || !extractedText.trim()) {
      isScanned = true
      return {
        success: false,
        fileName,
        fileType,
        extractionFunctionUsed,
        extractedText: "",
        sections: [],
        originalFileDataUrl,
        isScanned: true,
        error: "Scanned PDF detected. This document contains scanned images without a selectable text layer and requires OCR processing.",
        warnings: ["Scanned PDF detected - no digital text layer found"],
      }
    }
  } else if (ext === "docx" || ext === "doc" || file.type.includes("word") || file.type.includes("officedocument")) {
    fileType = ext === "doc" ? "doc" : "docx"
    extractionFunctionUsed = "extractTextFromWordBuffer"
    try {
      extractedText = await extractTextFromWordBuffer(arrayBuffer, fileName)
    } catch (err: any) {
      return {
        success: false,
        fileName,
        fileType,
        extractionFunctionUsed,
        extractedText: "",
        sections: [],
        originalFileDataUrl,
        error: err.message || `Failed to extract text from Word document ${fileName}.`,
        warnings,
      }
    }
  } else if (ext === "xml" || file.type === "application/xml" || file.type === "text/xml") {
    fileType = "xml"
    extractionFunctionUsed = "extractCleanTemplateText"
    const textContent = await file.text()
    extractedText = extractCleanTemplateText(fileName, textContent)
  } else if (ext === "json" || file.type === "application/json") {
    fileType = "json"
    extractionFunctionUsed = "extractCleanTemplateText"
    const textContent = await file.text()
    extractedText = extractCleanTemplateText(fileName, textContent)
  } else if (ext === "txt" || ext === "text" || ext === "md" || ext === "rtf" || file.type.startsWith("text/")) {
    fileType = "txt"
    extractionFunctionUsed = "extractCleanTemplateText"
    const textContent = await file.text()
    extractedText = extractCleanTemplateText(fileName, textContent)
  } else {
    return {
      success: false,
      fileName,
      fileType: "unknown",
      extractionFunctionUsed: "extractCleanTemplateText",
      extractedText: "",
      sections: [],
      originalFileDataUrl,
      error: `Unsupported file format ".${ext}". Supported formats: PDF (.pdf), Word (.docx, .doc), XML (.xml), TXT (.txt), and JSON (.json).`,
      warnings,
    }
  }

  // 4. Detect empty extraction results without overwriting existing content
  if (!extractedText || !extractedText.trim()) {
    return {
      success: false,
      fileName,
      fileType,
      extractionFunctionUsed,
      extractedText: "",
      sections: [],
      originalFileDataUrl,
      isScanned,
      error: "Extraction resulted in empty content. No readable text or tables could be extracted.",
      warnings,
    }
  }

  // 5. Template Mapping: Map complete extracted content into structured template fields
  const sections = parseSectionsFromContent(extractedText)

  // Inferred test / modality detection
  const detectedTest = detectTestFromTemplateContent(extractedText, fileName)
  const finalTestName = options?.testName || ((detectedTest as any)?.testName || (detectedTest as any)?.name) || fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ")
  const finalModality = options?.modality || ((detectedTest as any)?.category || (detectedTest as any)?.modality) || "XR"

  // 6. Save to database if requested
  let savedTemplate: RadiologyTemplate | undefined
  if (options?.saveToDatabase !== false) {
    try {
      savedTemplate = RadiologyTemplateDatabase.saveImportedTemplateDraft({
        templateName: `${finalTestName} Template`,
        testName: finalTestName,
        modality: finalModality,
        reconstructedDocument: {
          title: finalTestName,
          pages: [
            {
              pageNumber: 1,
              widthMm: 210,
              heightMm: 297,
              orientation: "portrait",
              marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
              elements: sections.map((sec, idx) => ({
                id: `el_${sec.id}_${idx}`,
                type: "text",
                content: `${sec.title}:\n${sec.fields.map(f => f.defaultValue || "").join("\n")}`,
                fontSize: 10,
                fontWeight: "normal",
              })),
              extractedText: extractedText,
              characterCount: extractedText.length,
              wordCount: extractedText.split(/\s+/).filter(Boolean).length,
              status: "success",
            },
          ],
          originalFileType: fileType,
          originalFileName: fileName,
          originalFileSize: file.size,
          originalFileDataUrl: originalFileDataUrl,
          pageCount: 1,
          ocrApplied: isScanned,
          extractionConfidence: isScanned ? 40 : 95,
          warnings,
          detectedExamName: finalTestName,
          detectedModality: finalModality,
          extractedAt: new Date().toISOString(),
          fullExtractedText: extractedText,
        },
        originalFileDataUrl,
        originalFileName: fileName,
        originalFileType: fileType,
        originalFileSize: file.size,
        createdBy: options?.technicianName || "Radiologist",
      })
    } catch (saveErr) {
      console.warn("Failed to persist template to database:", saveErr)
    }
  }

  return {
    success: true,
    fileName,
    fileType,
    extractionFunctionUsed,
    extractedText,
    sections,
    template: savedTemplate,
    originalFileDataUrl,
    isScanned,
    warnings,
  }
}

export const handleRadiologyTemplateUpload = processRadiologyTemplateUpload

export interface ImagingCatalogItem {
  study: string
  code: string
  category: "X-Ray" | "CT Scan" | "MRI" | "Ultrasound (USG)" | "Doppler" | "Mammography" | "Fluoroscopy / Special Procedures"
  modality: "XR" | "CT" | "MR" | "US" | "NM"
  price: number
  room: string
  indication: string
  technique: string
  defaultFindings: string[]
  defaultImpression: string[]
}

export type RadiologyDepartmentScope = "all" | "xray" | "ct" | "usg" | "mri"

export const RADIOLOGY_DEPARTMENTS: {
  key: RadiologyDepartmentScope
  label: string
  fullName: string
  icon: string
  bannerTitle: string
}[] = [
  { key: "all", label: "All Imaging", fullName: "Central Diagnostic Imaging Suite", icon: "📋", bannerTitle: "Radiology Department" },
  { key: "xray", label: "X-Ray", fullName: "Digital X-Ray & Fluoroscopy Department", icon: "🩻", bannerTitle: "X-Ray Department" },
  { key: "ct", label: "CT Scan", fullName: "Computed Tomography (CT) Department", icon: "🔬", bannerTitle: "CT Scan Department" },
  { key: "usg", label: "Ultrasound (USG)", fullName: "Ultrasound & Color Doppler Department", icon: "📡", bannerTitle: "Ultrasound (USG) Department" },
  { key: "mri", label: "MRI Suite", fullName: "3.0T Magnetic Resonance Imaging Suite", icon: "🧲", bannerTitle: "MRI Department" },
]

export function isStudyInDepartment(studyName: string, modality: string | undefined, dept: RadiologyDepartmentScope): boolean {
  if (dept === "all") return true
  const name = (studyName || "").toLowerCase().trim()
  const mod = (modality || "").toUpperCase().trim()

  if (dept === "xray") {
    if (name.includes("ct scan") || name.startsWith("ct ") || name.includes(" ct ") || name.endsWith(" ct") || name.includes("hrct")) return false
    if (name.includes("mri") || name.includes("mrcp")) return false
    if (name.includes("ultrasound") || name.includes("usg") || name.includes("echo") || name.includes("doppler") || name.includes("dating scan") || name.includes("trimester")) return false
    if (mod === "XR") return true
    return (
      name.includes("x-ray") ||
      name.includes("xray") ||
      name.includes("xr") ||
      name.includes("radiograph") ||
      name.includes("chest pa") ||
      name.includes("chest ap") ||
      name.includes("lat view") ||
      name.includes("ap view") ||
      name.includes("barium") ||
      name.includes("plain abdomen") ||
      name.includes("ivp") ||
      name.includes("pns") ||
      name.includes("spine") ||
      name.includes("joint") ||
      name.includes("skull") ||
      name.includes("pelvis") ||
      name.includes("hips") ||
      name.includes("shoulder") ||
      name.includes("elbow") ||
      name.includes("fore arm") ||
      name.includes("wrist") ||
      name.includes("hand") ||
      name.includes("thigh") ||
      name.includes("leg") ||
      name.includes("ankle") ||
      name.includes("foot") ||
      name.includes("mammography") ||
      name.includes("mammo")
    )
  }

  if (dept === "ct") {
    if (mod === "CT") return true
    return (
      name.includes("ct scan") ||
      name.startsWith("ct ") ||
      name.includes(" ct ") ||
      name.endsWith(" ct") ||
      name.includes("hrct") ||
      name.includes("computed tomograph") ||
      name.includes("biopsy")
    )
  }

  if (dept === "usg") {
    if (mod === "US") return true
    return (
      name.includes("ultrasound") ||
      name.includes("usg") ||
      name.includes("sonograph") ||
      name.includes("sonogram") ||
      name.includes("doppler") ||
      name.includes("dating scan") ||
      name.includes("trimester") ||
      name.includes("abdomens & pelvis") ||
      name.includes("male genital") ||
      name.includes("renal artery stenosis") ||
      name.includes("soft tissue") ||
      name.includes("musculoskeletal limb") ||
      name.includes("echo") ||
      name.includes("cardiac")
    )
  }

  if (dept === "mri") {
    if (mod === "MR") return true
    return name.includes("mri") || name.includes("magnetic resonance") || name.includes("mrcp")
  }

  return true
}

export const IMAGING_CATALOG: ImagingCatalogItem[] = [
  {
    study: "Chest PA",
    code: "RAD-XR-001",
    category: "X-Ray",
    modality: "XR",
    price: 400,
    room: "XR-1",
    indication: "Evaluation of chest pain, cough, shortness of breath, lung parenchyma, and cardiomegaly.",
    technique: "Digital PA upright chest radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Chest AP",
    code: "RAD-XR-002",
    category: "X-Ray",
    modality: "XR",
    price: 400,
    room: "XR-1",
    indication: "Bedside/supine evaluation for acute dyspnea, pneumonia, or pneumothorax.",
    technique: "Digital AP portable/supine chest radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Chest Lat View",
    code: "RAD-XR-003",
    category: "X-Ray",
    modality: "XR",
    price: 450,
    room: "XR-1",
    indication: "Evaluation of retrocardiac or posterior diaphragmatic lesion.",
    technique: "Digital lateral upright chest radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Skull AP View",
    code: "RAD-XR-004",
    category: "X-Ray",
    modality: "XR",
    price: 450,
    room: "XR-1",
    indication: "Head trauma, rule out skull fracture, calvarial evaluation.",
    technique: "Digital AP radiograph of the skull.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Skull Lateral View",
    code: "RAD-XR-005",
    category: "X-Ray",
    modality: "XR",
    price: 450,
    room: "XR-1",
    indication: "Head injury, sella turcica, facial bone and calvarial fracture screening.",
    technique: "Digital lateral view of the cranium.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdomen AP (KUB)",
    code: "RAD-XR-006",
    category: "X-Ray",
    modality: "XR",
    price: 500,
    room: "XR-2",
    indication: "Flank pain, hematuria, rule out radiopaque urinary tract calculus.",
    technique: "Digital supine KUB radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "PNS",
    code: "RAD-XR-007",
    category: "X-Ray",
    modality: "XR",
    price: 450,
    room: "XR-1",
    indication: "Facial pain, nasal congestion, sinusitis evaluation (Water's view).",
    technique: "Digital occipitomental (Waters) radiograph of paranasal sinuses.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Cervical Spine AP",
    code: "RAD-XR-008",
    category: "X-Ray",
    modality: "XR",
    price: 500,
    room: "XR-2",
    indication: "Neck pain, radiculopathy, cervical spine alignment.",
    technique: "Digital anteroposterior radiograph of the cervical spine.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Cervical Spine Lateral View",
    code: "RAD-XR-009",
    category: "X-Ray",
    modality: "XR",
    price: 500,
    room: "XR-2",
    indication: "Whiplash injury, cervical trauma, lordosis and disc space survey.",
    technique: "Digital lateral cervical spine radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Both Hips AP & Lat View",
    code: "RAD-XR-010",
    category: "X-Ray",
    modality: "XR",
    price: 750,
    room: "XR-1",
    indication: "Bilateral hip pain, avascular necrosis (AVN), osteoarthritis.",
    technique: "Digital AP and frog-leg lateral radiographs of both hips.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "LS Spine AP View",
    code: "RAD-XR-011",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-2",
    indication: "Lower back pain, lumbar spondylosis, scoliosis screening.",
    technique: "Digital AP radiograph of lumbo-sacral spine.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "LS Spine Lateral View",
    code: "RAD-XR-012",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-2",
    indication: "Sciatica, lumbar disc space narrowing, spondylolisthesis.",
    technique: "Digital lateral lumbo-sacral spine radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Pelvis Both Hips AP View",
    code: "RAD-XR-013",
    category: "X-Ray",
    modality: "XR",
    price: 650,
    room: "XR-1",
    indication: "Pelvic ring trauma, sacroiliac joints, bilateral hip joint assessment.",
    technique: "Digital AP pelvic radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Shoulder Lateral View",
    code: "RAD-XR-014",
    category: "X-Ray",
    modality: "XR",
    price: 500,
    room: "XR-1",
    indication: "Suspected shoulder dislocation, scapular Y view.",
    technique: "Digital trans-scapular Y lateral shoulder radiograph.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Shoulder AP View",
    code: "RAD-XR-015",
    category: "X-Ray",
    modality: "XR",
    price: 500,
    room: "XR-1",
    indication: "Rotator cuff pain, impingement, glenohumeral joint evaluation.",
    technique: "Digital AP view of the shoulder with internal/external rotation.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Humerous AP & Lat View",
    code: "RAD-XR-016",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Upper arm trauma, rule out humeral shaft fracture.",
    technique: "Digital AP and lateral radiographs of the humerus including shoulder & elbow.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Elbow Joint AP & Lat View",
    code: "RAD-XR-017",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Elbow pain, trauma, rule out radial head fracture or joint effusion.",
    technique: "Digital AP and lateral radiographs of the elbow joint.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Fore Arm AP & Lat View",
    code: "RAD-XR-018",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Forearm injury, rule out radius and ulna fractures (Monteggia/Galeazzi).",
    technique: "Digital AP and lateral views of the radius and ulna.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Wrist Joint AP & Lat View",
    code: "RAD-XR-019",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Fall on outstretched hand (FOOSH), rule out Colles or scaphoid fracture.",
    technique: "Digital AP and lateral radiographs of the wrist joint.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Hand AP & Lat View",
    code: "RAD-XR-020",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Metacarpal fracture, finger injury, arthritis survey.",
    technique: "Digital PA and oblique/lateral views of the hand.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Thigh AP & Lat View",
    code: "RAD-XR-021",
    category: "X-Ray",
    modality: "XR",
    price: 600,
    room: "XR-1",
    indication: "Femur trauma, rule out femoral shaft fracture or pathological lesion.",
    technique: "Digital AP and lateral radiographs of the femur.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Leg AP & Lat View",
    code: "RAD-XR-022",
    category: "X-Ray",
    modality: "XR",
    price: 600,
    room: "XR-1",
    indication: "Lower leg trauma, rule out tibia and fibula fractures.",
    technique: "Digital AP and lateral views of tibia and fibula.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Ankle Joint AP & Lat View",
    code: "RAD-XR-023",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Ankle sprain, twisting injury, rule out malleolar fractures.",
    technique: "Digital AP, mortise, and lateral views of the ankle joint.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Foot AP & Lat View",
    code: "RAD-XR-024",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Foot trauma, metatarsal fracture (Jones fracture), calcaneal injury.",
    technique: "Digital AP, oblique, and lateral views of the foot.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Barium Meal",
    code: "RAD-XR-025",
    category: "X-Ray",
    modality: "XR",
    price: 2200,
    room: "XR-2",
    indication: "Epigastric pain, suspected peptic ulcer, gastric mucosal disease.",
    technique: "Real-time digital fluoroscopy following oral Barium sulfate suspension.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Barium Enema",
    code: "RAD-XR-026",
    category: "X-Ray",
    modality: "XR",
    price: 2500,
    room: "XR-2",
    indication: "Colonic stricture, diverticulosis, Hirschsprung disease evaluation.",
    technique: "Fluoroscopic double-contrast examination of the large bowel.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Barium Swallow",
    code: "RAD-XR-027",
    category: "X-Ray",
    modality: "XR",
    price: 2000,
    room: "XR-2",
    indication: "Dysphagia, heartburn, rule out esophageal stricture or achalasia.",
    technique: "Dynamic fluoroscopic swallow series with barium paste.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "X-Ray IVP",
    code: "RAD-XR-028",
    category: "X-Ray",
    modality: "XR",
    price: 3000,
    room: "XR-2",
    indication: "Recurrent hematuria, ureteric stricture, renal pelvicalyceal mapping.",
    technique: "Serial nephrotomography following IV non-ionic contrast injection.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Plain Abdomen (Erect)",
    code: "RAD-XR-029",
    category: "X-Ray",
    modality: "XR",
    price: 500,
    room: "XR-2",
    indication: "Acute abdominal pain, rule out air under diaphragm or bowel obstruction.",
    technique: "Erect digital abdominal radiograph including diaphragmatic domes.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Chest X-Ray PA/Lateral",
    code: "RAD-XR-030",
    category: "X-Ray",
    modality: "XR",
    price: 450,
    room: "XR-1",
    indication: "Shortness of breath, cough, rule out consolidation or cardiomegaly.",
    technique: "Digital PA and lateral upright chest radiographs.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "X-Ray Right Hip AP & Frog-Leg Lateral",
    code: "RAD-XR-031",
    category: "X-Ray",
    modality: "XR",
    price: 550,
    room: "XR-1",
    indication: "Fall from standing height, right groin pain, inability to bear weight.",
    technique: "Digital AP and frog-leg lateral radiographs of the right hip and pelvis.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic X-Ray examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Brain",
    code: "RAD-CT-001",
    category: "CT Scan",
    modality: "CT",
    price: 2800,
    room: "CT-1",
    indication: "Acute onset neurological deficit, trauma, severe headache, rule out hemorrhage/stroke.",
    technique: "Non-contrast volumetric axial helical CT of the brain with 1.25mm thin reconstructions.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Chest",
    code: "RAD-CT-002",
    category: "CT Scan",
    modality: "CT",
    price: 3800,
    room: "CT-1",
    indication: "Lung nodule, pulmonary infection, mediastinal mass, interstitial lung disease.",
    technique: "Volumetric high-resolution CT of thorax from lung apices through adrenal glands.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Neck",
    code: "RAD-CT-003",
    category: "CT Scan",
    modality: "CT",
    price: 3500,
    room: "CT-1",
    indication: "Cervical lymphadenopathy, pharyngeal mass, deep neck infection.",
    technique: "Axial helical contrast-enhanced CT of neck from skull base to thoracic inlet.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan PNS",
    code: "RAD-CT-004",
    category: "CT Scan",
    modality: "CT",
    price: 3200,
    room: "CT-1",
    indication: "Chronic rhinosinusitis, deviated nasal septum, pre-FESS surgical navigation.",
    technique: "High-resolution non-contrast coronal and axial CT of paranasal sinuses.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Cervical Spine",
    code: "RAD-CT-005",
    category: "CT Scan",
    modality: "CT",
    price: 3500,
    room: "CT-1",
    indication: "Cervical trauma, facet joint injury, rule out cervical fracture.",
    technique: "Thin-slice axial helical CT of C1-C7 with sagittal and coronal multiplanar reconstructions.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan KUB",
    code: "RAD-CT-006",
    category: "CT Scan",
    modality: "CT",
    price: 3600,
    room: "CT-2",
    indication: "Acute renal colic, suspected ureteric stone, hematuria workup.",
    technique: "Low-dose non-contrast helical CT of kidneys, ureters, and bladder.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Abdomen",
    code: "RAD-CT-007",
    category: "CT Scan",
    modality: "CT",
    price: 4500,
    room: "CT-2",
    indication: "Abdominal pain, pancreatitis, liver lesion, bowel pathology, appendicitis.",
    technique: "Multiphase contrast-enhanced axial CT of abdomen and pelvis.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Dorsal Spine",
    code: "RAD-CT-008",
    category: "CT Scan",
    modality: "CT",
    price: 3600,
    room: "CT-1",
    indication: "Thoracic spine trauma, vertebral body compression fracture, spinal metastasis.",
    technique: "Axial thin-slice helical CT of T1-T12 with bone and soft tissue windowing.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Lumbar Spine",
    code: "RAD-CT-009",
    category: "CT Scan",
    modality: "CT",
    price: 3600,
    room: "CT-1",
    indication: "Lumbar trauma, spondylolysis, pars defect, severe degenerative spondylolisthesis.",
    technique: "Axial helical CT of L1-S1 with multiplanar bone reconstructions.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan-Guided Biopsy",
    code: "RAD-CT-010",
    category: "CT Scan",
    modality: "CT",
    price: 5500,
    room: "CT-2",
    indication: "Focal lung, liver, or retroperitoneal lesion requiring tissue diagnosis.",
    technique: "CT fluoroscopy-guided percutaneous core needle biopsy under local anesthesia.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Contrast",
    code: "RAD-CT-011",
    category: "CT Scan",
    modality: "CT",
    price: 4800,
    room: "CT-2",
    indication: "Oncological staging, vascular delineation, inflammatory tissue enhancement.",
    technique: "Helical multidetector CT following intravenous non-ionic iodinated contrast.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Scan Ankle",
    code: "RAD-CT-012",
    category: "CT Scan",
    modality: "CT",
    price: 3200,
    room: "CT-1",
    indication: "Complex ankle/hindfoot fracture, calcaneal trauma, talus osteochondral lesion.",
    technique: "High-resolution 0.625mm helical CT of ankle with 3D volume-rendered reconstructions.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Head w/o IV Contrast",
    code: "RAD-CT-013",
    category: "CT Scan",
    modality: "CT",
    price: 3500,
    room: "CT-1",
    indication: "Acute onset neurological deficit / severe acute headache. Rule out intracranial hemorrhage.",
    technique: "Non-contrast axial helical CT scan of the brain with 1.25mm thin reconstructions.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "CT Abdomen & Pelvis with IV Contrast",
    code: "RAD-CT-014",
    category: "CT Scan",
    modality: "CT",
    price: 5500,
    room: "CT-2",
    indication: "Right lower quadrant abdominal pain, fever, suspected appendicitis.",
    technique: "Axial multidetector CT of abdomen and pelvis following 85mL IV Omnipaque 350 contrast.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic CT Scan examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Dating Scan – Antenatal scan gestational age of foetus",
    code: "RAD-US-001",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1200,
    room: "US-1",
    indication: "Early pregnancy confirmation, gestational sac localization, crown-rump length (CRL).",
    technique: "Transabdominal and transvaginal real-time high-resolution obstetric sonography.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "First Trimester – Antenatal scan day one to 12 weeks of pregnancy",
    code: "RAD-US-002",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1400,
    room: "US-1",
    indication: "Fetal viability, nuchal translucency (NT), nasal bone, gestational age verification.",
    technique: "Targeted 11-13 week obstetric ultrasound with color Doppler.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Second Trimester – Antenatal scan week 13 to 27 weeks of pregnancy",
    code: "RAD-US-003",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1800,
    room: "US-1",
    indication: "Detailed fetal anomaly screening, fetal biometry, placental position, liquor volume.",
    technique: "Comprehensive Level-II obstetric anatomical survey ultrasound.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Third Trimester – Antenatal scan week 28 to 40 weeks of pregnancy",
    code: "RAD-US-004",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1800,
    room: "US-1",
    indication: "Fetal growth assessment, estimated fetal weight (EFW), biophysical profile (BPP).",
    technique: "Obstetric ultrasound with umbilical and middle cerebral artery Doppler indices.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdomens & Pelvis",
    code: "RAD-US-005",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1400,
    room: "US-1",
    indication: "Abdominal pain, hepatobiliary, renal, and pelvic organ survey.",
    technique: "Grayscale and color Doppler sonography of upper and lower abdomen.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdominal Wall",
    code: "RAD-US-006",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1100,
    room: "US-1",
    indication: "Ventral/incisional hernia, rectus sheath hematoma, abdominal wall mass.",
    technique: "High-frequency linear probe sonography of anterior abdominal wall.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Lower Abdomen",
    code: "RAD-US-007",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1000,
    room: "US-1",
    indication: "Pelvic pain, urinary bladder pathology, uterus and adnexal survey.",
    technique: "Transabdominal real-time pelvic sonography with full urinary bladder.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Male Genital and Scrotum",
    code: "RAD-US-008",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1400,
    room: "US-1",
    indication: "Scrotal pain, testicular swelling, rule out testicular torsion, varicocele, hydrocele.",
    technique: "High-resolution scrotal ultrasound with spectral and color Doppler analysis.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdominal Organ (Liver)",
    code: "RAD-US-009",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1100,
    room: "US-1",
    indication: "Fatty liver, hepatomegaly, jaundice, focal liver lesion, cirrhosis screening.",
    technique: "Focused sonographic evaluation of hepatic parenchyma, portal vein, and biliary tree.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdominal Organ (Kidneys)",
    code: "RAD-US-010",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1100,
    room: "US-1",
    indication: "Renal calculi, hydronephrosis, cortical echogenicity, medical renal disease.",
    technique: "Bilateral renal sonography with resistive index Doppler measurements.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdominal Organ (Spleen)",
    code: "RAD-US-011",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1100,
    room: "US-1",
    indication: "Splenomegaly, splenic trauma/infarct, portal hypertension workup.",
    technique: "Grayscale sonography of splenic parenchyma and splenic hilum.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdominal Organ (Pancreas)",
    code: "RAD-US-012",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1100,
    room: "US-1",
    indication: "Epigastric pain, suspected pancreatitis, pancreatic duct dilatation, cyst.",
    technique: "Transabdominal sonography of pancreatic head, body, tail, and main duct.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Abdominal Renal Artery Stenosis",
    code: "RAD-US-013",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2600,
    room: "US-1",
    indication: "Renovascular hypertension, young hypertensive patient evaluation.",
    technique: "Duplex color Doppler of main renal arteries with peak systolic velocity (PSV) ratios.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Neck (Thyroid, Parathyroid, Musculoskeletal)",
    code: "RAD-US-014",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Thyroid nodule, goiter, parathyroid adenoma, cervical soft tissue swelling.",
    technique: "High-frequency linear sonography of bilateral thyroid lobes and isthmus.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Neck for Lymphadenopathy",
    code: "RAD-US-015",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1400,
    room: "US-1",
    indication: "Palpable neck nodes, rule out reactive, tuberculous, or malignant lymphadenopathy.",
    technique: "Comprehensive cervical lymph node station mapping (Levels I-VI).",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Neck for Musculoskeletal System",
    code: "RAD-US-016",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1400,
    room: "US-1",
    indication: "Sternocleidomastoid tumor, fibromatosis colli, cervical muscular strain.",
    technique: "Dynamic musculoskeletal ultrasound of anterior and lateral neck musculature.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Breast and Axilla (Right Side)",
    code: "RAD-US-017",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Palpable lump right breast, mastalgia, targeted BI-RADS assessment.",
    technique: "High-resolution radial and antiradial breast sonography including right axilla.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Breast and Axilla (Left Side)",
    code: "RAD-US-018",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Palpable lump left breast, nipple discharge, targeted BI-RADS assessment.",
    technique: "High-resolution radial and antiradial breast sonography including left axilla.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Soft Tissue",
    code: "RAD-US-019",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1200,
    room: "US-1",
    indication: "Subcutaneous swelling, lipoma, sebaceous cyst, foreign body localization.",
    technique: "High-frequency linear ultrasound of superficial soft tissue lesion.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Musculoskeletal Limb",
    code: "RAD-US-020",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1600,
    room: "US-1",
    indication: "Muscle tear, hematoma, tendinopathy, extremity soft tissue mass.",
    technique: "Dynamic musculoskeletal ultrasound with power Doppler.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Upper Limb Arterial Doppler – Right",
    code: "RAD-US-021",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2200,
    room: "US-1",
    indication: "Right arm claudication, cold limb, suspected arterial occlusion.",
    technique: "Color and spectral Doppler of right subclavian, axillary, brachial, radial & ulnar arteries.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Upper Limb Arterial Doppler – Left",
    code: "RAD-US-022",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2200,
    room: "US-1",
    indication: "Left arm claudication, weak pulse, thoracic outlet syndrome.",
    technique: "Color and spectral Doppler of left subclavian, axillary, brachial, radial & ulnar arteries.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Upper Limb Venous Doppler – Right",
    code: "RAD-US-023",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2200,
    room: "US-1",
    indication: "Right arm swelling, pain, suspected upper extremity DVT (Paget-Schroetter).",
    technique: "Compression ultrasound and Doppler of right subclavian, axillary, and brachial veins.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Upper Limb Venous Doppler – Left",
    code: "RAD-US-024",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2200,
    room: "US-1",
    indication: "Left arm swelling, peripherally inserted central catheter (PICC) thrombosis check.",
    technique: "Compression ultrasound and Doppler of left subclavian, axillary, and brachial veins.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Lower Limb Arterial Doppler – Right",
    code: "RAD-US-025",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2400,
    room: "US-1",
    indication: "Right leg claudication, peripheral arterial disease (PAD), gangrene workup.",
    technique: "Duplex ultrasound of right CFA, SFA, popliteal, anterior/posterior tibial arteries.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Lower Limb Arterial Doppler – Left",
    code: "RAD-US-026",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2400,
    room: "US-1",
    indication: "Left leg pain on walking, resting ischemia, diminished pedal pulses.",
    technique: "Duplex ultrasound of left CFA, SFA, popliteal, anterior/posterior tibial arteries.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Lower Limb Venous Doppler – Right",
    code: "RAD-US-027",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2400,
    room: "US-1",
    indication: "Right calf swelling, tenderness, rule out deep vein thrombosis (DVT).",
    technique: "Compression ultrasound and spectral Doppler of right lower extremity deep veins.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Lower Limb Venous Doppler – Left",
    code: "RAD-US-028",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2400,
    room: "US-1",
    indication: "Left leg edema, warmth, varicose veins, suspected DVT or venous reflux.",
    technique: "Compression ultrasound and spectral Doppler of left lower extremity deep veins.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Shoulder Joint – Right",
    code: "RAD-US-029",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Right shoulder pain, suspected rotator cuff tendon tear, impingement.",
    technique: "High-resolution dynamic ultrasound of right rotator cuff tendons and bursa.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Shoulder Joint – Left",
    code: "RAD-US-030",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Left shoulder weakness, limited abduction, supraspinatus pathology.",
    technique: "High-resolution dynamic ultrasound of left rotator cuff tendons and bursa.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Knee Joint – Right",
    code: "RAD-US-031",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Right knee swelling, suprapatellar effusion, Baker's cyst, patellar tendonitis.",
    technique: "Dynamic ultrasound of right knee anterior, medial, lateral, and popliteal fossa.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Knee Joint – Left",
    code: "RAD-US-032",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Left knee pain, popliteal swelling, patellar tendon injury, joint effusion.",
    technique: "Dynamic ultrasound of left knee anterior, medial, lateral, and popliteal fossa.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Ankle Joint – Right",
    code: "RAD-US-033",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Right ankle pain, Achilles tendon tear, retrocalcaneal bursitis, ligament sprain.",
    technique: "Ultrasound of right Achilles tendon, plantar fascia, and collateral ligaments.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Ankle Joint – Left",
    code: "RAD-US-034",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Left ankle swelling, Achilles tendinopathy, posterior tibial tendon dysfunction.",
    technique: "Ultrasound of left Achilles tendon, plantar fascia, and collateral ligaments.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Wrist Joint – Right",
    code: "RAD-US-035",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1500,
    room: "US-1",
    indication: "Right wrist pain, carpal tunnel syndrome, De Quervain's tenosynovitis, ganglion.",
    technique: "High-resolution ultrasound of right median nerve and extensor/flexor compartments.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Adult Cardiac (2D Echo)",
    code: "RAD-ECHO-001",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2200,
    room: "Echo-1",
    indication: "Hypertension, chest pain, dyspnea, evaluate left ventricular ejection fraction and valvular function.",
    technique: "Complete transthoracic 2D, M-Mode, and Color / Continuous-Wave Doppler echocardiography.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Ultrasound Whole Abdomen & Pelvis",
    code: "RAD-US-036",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 1400,
    room: "US-1",
    indication: "Epigastric and right upper quadrant colic pain. Rule out cholelithiasis.",
    technique: "Real-time grayscale and color Doppler sonography of the abdomen and pelvis.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Transthoracic 2D Echocardiogram with Color Doppler",
    code: "RAD-ECHO-002",
    category: "Ultrasound (USG)",
    modality: "US",
    price: 2200,
    room: "Echo-1",
    indication: "Hypertension, evaluate left ventricular ejection fraction and wall motion.",
    technique: "Complete 2D, M-Mode, and Color / Continuous-Wave Doppler echocardiography.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Ultrasound (USG) examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "MRI Brain with & without Contrast",
    code: "RAD-MR-001",
    category: "MRI",
    modality: "MR",
    price: 8500,
    room: "MR-1",
    indication: "Tension headache, vertigo, rule out space-occupying lesion.",
    technique: "Multiplanar 3.0T MRI including T1W, T2W, FLAIR, DWI/ADC, and Post-Contrast 3D T1 sequences.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic MRI examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "MRI Brain with & without Gadolinium Contrast",
    code: "RAD-MR-002",
    category: "MRI",
    modality: "MR",
    price: 8500,
    room: "MR-1",
    indication: "Evaluation of intractable headache, focal neurological deficit, or cranial nerve palsy.",
    technique: "Multiplanar high-resolution 3.0T MR sequences with axial, coronal, and sagittal reconstructions.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic MRI examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "MRI Lumbar Spine (L-Spine)",
    code: "RAD-MR-003",
    category: "MRI",
    modality: "MR",
    price: 7500,
    room: "MR-1",
    indication: "Lower back pain radiating down right lower extremity (Sciatica).",
    technique: "Sagittal and axial T1, T2, and STIR MR sequences of the lumbar spine.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic MRI examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "MRI Knee Joint Right/Left",
    code: "RAD-MR-004",
    category: "MRI",
    modality: "MR",
    price: 7000,
    room: "MR-1",
    indication: "Sports injury, joint locking, knee instability, suspected ACL/meniscal tear.",
    technique: "Multiplanar 3.0T MR imaging of the knee including proton density fat-sat and T2 T1 sequences.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic MRI examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "MR Cholangiopancreatography (MRCP)",
    code: "RAD-MR-005",
    category: "MRI",
    modality: "MR",
    price: 9000,
    room: "MR-1",
    indication: "Obstructive jaundice, dilated CBD, rule out choledocholithiasis or biliary stricture.",
    technique: "Heavy T2-weighted 3D thin-slice MRCP with coronal maximum intensity projections (MIP).",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic MRI examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Bilateral Digital Mammography with 3D Tomosynthesis",
    code: "RAD-MAM-001",
    category: "Mammography",
    modality: "XR",
    price: 3800,
    room: "XR-2",
    indication: "Routine screening mammogram / evaluation of palpable breast nodule.",
    technique: "Low-dose bilateral full-field digital mammography in CC and MLO views with 3D tomosynthesis.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Mammography examination.",
      "2. No acute structural pathology."
    ]
  },
  {
    study: "Unilateral Digital Mammography Right/Left",
    code: "RAD-MAM-002",
    category: "Mammography",
    modality: "XR",
    price: 2200,
    room: "XR-2",
    indication: "Targeted follow-up diagnostic mammogram for focal pain or focal asymmetric density.",
    technique: "Targeted CC, MLO, and spot compression digital mammographic views.",
    defaultFindings: [
      "Target anatomy surveyed in standard planes without acute morphological disruption.",
      "No focal structural abnormality or pathological fluid collection identified.",
      "Relevant anatomical landmarks are symmetric and preserved."
    ],
    defaultImpression: [
      "1. Normal diagnostic Mammography examination.",
      "2. No acute structural pathology."
    ]
  },
]

export interface PatientStudyGroup {
  groupKey: string
  patient: string
  mrn: string
  umr?: string
  encounterId?: string
  department?: string
  diagnosis?: string
  provider: string
  ordered: string
  priority: "STAT" | "Routine" | "Elective"
  paymentStatus: "Paid" | "Payment Pending"
  paidReceiptNo?: string
  totalPrice: number
  studies: RadiologyStudyRecord[]
  modalities: Array<"XR" | "CT" | "MR" | "US" | "NM">
  status: "Orders" | "Scheduled" | "In Progress" | "Done" | "Images Ready" | "Reporting" | "Final"
}

const QUEUE_TABS = [
  { label: "All Active Orders", key: "all" },
  { label: "🕒 Awaiting Scan (Ready)", key: "awaiting_scan" },
  { label: "⚡ Scanning Ongoing", key: "in_progress" },
  { label: "⚠️ Payment Pending", key: "pending" },
  { label: "🚨 STAT Emergency", key: "stat" },
  { label: "✓ Completed & Signed", key: "completed" },
]

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function printRadiologyDocument(study: RadiologyStudyRecord, defaultCatalog?: ImagingCatalogItem[]): void {
  const catalogMatch = defaultCatalog?.find((c) => c.study === study.study) || IMAGING_CATALOG[0]
  
  const findingsRaw = study.findings && study.findings.length > 0
    ? (Array.isArray(study.findings) ? study.findings.join("\n") : String(study.findings))
    : catalogMatch.defaultFindings.join("\n")

  const impressionRaw = study.impression && study.impression.length > 0
    ? (Array.isArray(study.impression) ? study.impression.join("\n") : String(study.impression))
    : catalogMatch.defaultImpression.join("\n")

  const patientName = escapeHtml(study.patient || "Patient")
  const accessionNo = escapeHtml(study.accessionNo || "RAD-ACC-8801")
  const umr = escapeHtml(study.umr || `PAT-${study.mrn}`)
  const mrn = escapeHtml(study.mrn || "")
  const encounterId = escapeHtml(study.encounterId || `ENC-${study.mrn}`)
  const referringDoc = escapeHtml(study.provider || "Attending Physician")
  const department = escapeHtml(study.department || "Outpatient")
  const billingStatus = escapeHtml(`${study.paymentStatus || "Paid"} (₹${study.price || 0})`)
  const receiptRef = escapeHtml(study.paidReceiptNo || study.digitalReceiptRef || "RCPT-2026-8331")
  const studyTitle = escapeHtml(study.study || "Diagnostic Imaging Study")
  const modality = escapeHtml(study.modality || "XR")
  const suite = escapeHtml(study.room || "Suite 1")
  const digitalLink = escapeHtml(study.digitalStudyUrl ? "Attached" : `PACS://${study.accessionNo || "RAD-8801"}`)
  const indication = escapeHtml(study.indication || catalogMatch.indication || "Clinical indication not specified.")
  const technique = escapeHtml(study.technique || catalogMatch.technique || "Standard diagnostic protocol.")
  const dateStr = escapeHtml(study.signedAt || study.ordered || new Date().toLocaleDateString("en-IN"))
  const statusStr = escapeHtml((study.status || "REPORTING").toUpperCase())
  const techNotes = escapeHtml(study.technicianNotes || "Diagnostic imaging scan performed per protocol. DICOM images ingested into PACS.")
  const techName = escapeHtml(study.technician || "Radiology Technologist")
  const techSig = escapeHtml(study.technicianSignature || "TECH-SIG-88012")
  const radName = escapeHtml(study.radiologist || "Dr. Laura Kim, MD")

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Radiology Report - ${accessionNo} - ${patientName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 16mm 14mm 16mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-block {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .brand-left {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .brand-logo {
      width: 32px;
      height: 32px;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 18px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .brand-title {
      font-size: 15pt;
      font-weight: 900;
      letter-spacing: -0.3px;
      text-transform: uppercase;
      color: #020617;
      margin: 0;
      line-height: 1.1;
    }
    .brand-sub {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #334155;
      margin-top: 2px;
    }
    .brand-addr {
      font-size: 7pt;
      color: #64748b;
      margin-top: 2px;
    }
    .brand-meta {
      text-align: right;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 8pt;
      line-height: 1.4;
      white-space: nowrap;
    }
    .meta-acc {
      font-weight: 800;
      color: #020617;
      font-size: 8.5pt;
    }
    .meta-status {
      font-weight: 800;
      color: #15803d;
      font-size: 8pt;
      text-transform: uppercase;
    }
    .demographics-table {
      width: 100%;
      border-collapse: collapse;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      margin-bottom: 12px;
      font-size: 8.5pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .demographics-table td {
      padding: 5px 8px;
      vertical-align: top;
      border: 1px solid #e2e8f0;
      line-height: 1.4;
    }
    .study-banner {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .study-heading {
      font-size: 10.5pt;
      font-weight: 800;
      text-transform: uppercase;
      color: #020617;
      margin: 0 0 4px 0;
    }
    .study-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 8pt;
      color: #334155;
      margin-bottom: 3px;
    }
    .study-detail {
      font-size: 8pt;
      color: #334155;
      margin-top: 2px;
    }
    .section-header {
      font-size: 9pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #020617;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 2px;
      margin-top: 10px;
      margin-bottom: 6px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .findings-container {
      white-space: pre-wrap;
      font-size: 9.5pt;
      line-height: 1.6;
      color: #1e293b;
      margin-bottom: 12px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .impression-container {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 3.5px solid #0284c7;
      padding: 8px 10px;
      margin: 10px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .impression-title {
      font-size: 8.5pt;
      font-weight: 800;
      text-transform: uppercase;
      color: #0369a1;
      margin-bottom: 3px;
    }
    .impression-body {
      white-space: pre-wrap;
      font-size: 9pt;
      font-weight: 600;
      line-height: 1.5;
      color: #0f172a;
      word-wrap: break-word;
    }
    .tech-box {
      background: #faf5ff;
      border: 1px solid #e9d5ff;
      padding: 6px 8px;
      font-size: 8pt;
      color: #581c87;
      margin: 8px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signatures-block {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1.5px solid #0f172a;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-left, .sig-right {
      font-size: 8pt;
      line-height: 1.35;
    }
    .sig-right {
      text-align: right;
    }
    .sig-name {
      font-weight: 800;
      font-size: 9pt;
      color: #020617;
    }
    .sig-role {
      font-weight: 600;
      color: #475569;
    }
    .sig-reg {
      font-size: 7.5pt;
      color: #94a3b8;
    }
    .disclaimer-text {
      text-align: center;
      font-size: 7pt;
      color: #94a3b8;
      margin-top: 16px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header-block">
    <div class="brand-left">
      <div class="brand-logo">+</div>
      <div>
        <h1 class="brand-title">IMPERIAL HOSPITALS</h1>
        <div class="brand-sub">A Unit of Mukunda Healthcare Pvt Ltd • Department of Radiology &amp; Imaging</div>
        <div class="brand-addr"># 27-14-13/A, Opp. Ganesh Canteen Street, Beside Bhasyam School, Bhimavaram • Ph: 08816-279999 • GSTIN: 37AALCM2238A1ZQ</div>
      </div>
    </div>
    <div class="brand-meta">
      <div class="meta-acc">ACCESSION: ${accessionNo}</div>
      <div style="color: #475569; font-weight: 600;">Date: ${dateStr}</div>
      <div class="meta-status">STATUS: ${statusStr}</div>
    </div>
  </div>

  <table class="demographics-table">
    <tr>
      <td style="width: 50%;">
        Patient Name: <strong style="color: #020617; font-size: 9pt;">${patientName}</strong><br />
        UMR Number: <strong style="font-family: monospace;">${umr}</strong><br />
        MRN Number: <strong style="font-family: monospace;">${mrn}</strong><br />
        OP / IP / ER No: <strong style="font-family: monospace;">${encounterId}</strong>
      </td>
      <td style="width: 50%; text-align: right;">
        Referring Physician: <strong style="color: #020617;">${referringDoc}</strong><br />
        Department: <strong>${department}</strong><br />
        Billing Status: <strong style="color: #15803d;">${billingStatus}</strong><br />
        Digital Receipt Ref: <strong style="font-family: monospace;">${receiptRef}</strong>
      </td>
    </tr>
  </table>

  <div class="study-banner">
    <div class="study-heading">INVESTIGATION: ${studyTitle}</div>
    <div class="study-grid">
      <div>Category: <strong>${modality}</strong></div>
      <div>Scanner Suite: <strong>${suite}</strong></div>
      <div>Digital Study Link: <strong style="font-family: monospace;">${digitalLink}</strong></div>
    </div>
    <div class="study-detail"><strong>Clinical Indication:</strong> ${indication}</div>
    <div class="study-detail"><strong>Imaging Technique &amp; Protocol:</strong> ${technique}</div>
  </div>

  <div class="section-header">DIAGNOSTIC FINDINGS:</div>
  <div class="findings-container">${escapeHtml(findingsRaw)}</div>

  <div class="impression-container">
    <div class="impression-title">DIAGNOSTIC IMPRESSION:</div>
    <div class="impression-body">${escapeHtml(impressionRaw)}</div>
  </div>

  ${techNotes ? `
  <div class="tech-box">
    <strong>Technician Operational Report:</strong> ${techNotes}
  </div>` : ""}

  <div class="signatures-block">
    <div class="sig-left">
      <div class="sig-role">Radiology Technologist</div>
      <div class="sig-name">${techName}</div>
      <div class="sig-reg">Signature Ref: ${techSig}</div>
    </div>
    <div class="sig-right">
      <div class="sig-name">${radName}</div>
      <div class="sig-role">Senior Consultant Radiologist</div>
      <div class="sig-reg">Reg No: MCI-RAD-77109</div>
    </div>
  </div>

  <div class="disclaimer-text">
    * This is an official digital diagnostic report issued by the Department of Radiology. Suggested clinical correlation and further evaluation.
  </div>
</body>
</html>`

  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(html)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {}
    }, 2000)
  }, 300)
}

export default function Radiology({
  technician = "Dr. Rajesh Sharma, MD",
  initialTab = "overview",
  departmentScope = "all",
  initialStudyId = null,
  onNavigateView,
  onNavigateTab,
}: {
  technician?: string
  initialTab?: string
  departmentScope?: RadiologyDepartmentScope
  initialStudyId?: string | null
  onNavigateView?: (view: string, subParam?: string) => void
  onNavigateTab?: (tab: "worklist" | "reports" | "templates") => void
}) {
  const mappedView: RadiologyViewMode =
    initialTab === "worklist"
      ? "worklist"
      : initialTab === "operations"
      ? "operations"
      : initialTab === "reporting"
      ? "reporting"
      : initialTab === "finalized" || initialTab === "reports"
      ? "finalized"
      : initialTab === "template_upload" || initialTab === "templates"
      ? "template_upload"
      : initialTab === "analytics"
      ? "analytics"
      : "overview"

  const mappedScope =
    departmentScope === "ct"
      ? "CT Scan"
      : departmentScope === "usg"
      ? "Ultrasound (USG)"
      : departmentScope === "mri"
      ? "MRI"
      : departmentScope === "xray"
      ? "X-Ray"
      : "all"

  return (
    <UniversalRadiologyShell
      initialView={mappedView}
      initialStudyId={initialStudyId}
      onViewChange={(view, subParam) => {
        onNavigateView?.(view, subParam)
        if (onNavigateTab) {
          if (view === "worklist" || view === "operations") onNavigateTab("worklist")
          else if (view === "finalized") onNavigateTab("reports")
          else if (view === "template_upload") onNavigateTab("templates")
        }
      }}
      hideSidebar={true}
      initialScope={mappedScope}
      technician={technician}
    />
  )
}
