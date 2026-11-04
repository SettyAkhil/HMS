import { safeLocalStorageSetItem, freeLocalStorageQuota } from "../utils/storageQuotaManager"
import { BillingDatabase } from "./billingDb"
import { AuditDatabase } from "./auditDb"
import * as pdfjsLib from "pdfjs-dist"
import mammoth from "mammoth"
import JSZip from "jszip"
import { extractCleanTemplateText } from "./templateTextCleaner"
import { ReconstructedDocument, CompletenessReport, getDocumentFullText } from "./templateExtractionService"

let pdfWorkerUrl = ""
if (typeof window !== "undefined") {
  try {
    pdfWorkerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  } catch {}
}

export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer | Uint8Array): Promise<string> {
  const rawBuffer: ArrayBuffer = arrayBuffer instanceof Uint8Array
    ? arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength)
    : arrayBuffer

  // Preserve independent buffer slices up-front in case PDF.js worker transfers or detaches the buffer
  const fallbackBuffer1 = rawBuffer.slice(0)
  const fallbackBuffer2 = rawBuffer.slice(0)
  const fallbackBuffer3 = rawBuffer.slice(0)

  // 1. Try PDF.js API parsing first with worker
  try {
    if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    }
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fallbackBuffer1),
      useSystemFonts: true,
    } as any)
    const pdf = await loadingTask.promise
    let fullText = ""

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()

      let lastY: number | null = null
      const pageLines: string[] = []
      let currentLine = ""

      for (const item of textContent.items as any[]) {
        if (!item || typeof item.str !== "string") continue
        const y = item.transform ? item.transform[5] : null
        const hasEol = item.hasEOL

        if (hasEol || (lastY !== null && y !== null && Math.abs(lastY - y) > 3)) {
          if (currentLine.trim()) {
            pageLines.push(currentLine.trim())
          }
          currentLine = item.str
        } else {
          currentLine += (currentLine ? " " : "") + item.str
        }
        if (y !== null) lastY = y
      }

      if (currentLine.trim()) {
        pageLines.push(currentLine.trim())
      }

      if (pageLines.length > 0) {
        fullText += pageLines.join("\n") + "\n\n"
      }
    }

    if (fullText.trim().length > 10) {
      return fullText.trim()
    }
  } catch (err) {
    console.warn("PDF.js worker extraction skipped or failed, trying workerless fallback:", err)
  }

  // 1b. Try PDF.js with disableWorker: true (main-thread synchronous parsing)
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fallbackBuffer2),
      useSystemFonts: true,
      disableWorker: true,
      isEvalSupported: false,
    } as any)
    const pdf = await loadingTask.promise
    let fullText = ""

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()

      let lastY: number | null = null
      const pageLines: string[] = []
      let currentLine = ""

      for (const item of textContent.items as any[]) {
        if (!item || typeof item.str !== "string") continue
        const y = item.transform ? item.transform[5] : null
        const hasEol = item.hasEOL

        if (hasEol || (lastY !== null && y !== null && Math.abs(lastY - y) > 3)) {
          if (currentLine.trim()) {
            pageLines.push(currentLine.trim())
          }
          currentLine = item.str
        } else {
          currentLine += (currentLine ? " " : "") + item.str
        }
        if (y !== null) lastY = y
      }

      if (currentLine.trim()) {
        pageLines.push(currentLine.trim())
      }

      if (pageLines.length > 0) {
        fullText += pageLines.join("\n") + "\n\n"
      }
    }

    if (fullText.trim().length > 10) {
      return fullText.trim()
    }
  } catch (err) {
    console.warn("PDF.js direct workerless extraction failed:", err)
  }

  // 2. Native Fallback: Decode PDF binary operators (BT...ET, Tj, TJ, hex strings) directly
  try {
    const bytes = new Uint8Array(fallbackBuffer3)
    const decoder = new TextDecoder("latin1")
    const pdfString = decoder.decode(bytes)

    const textSegments: string[] = []

    // Extract text blocks enclosed in BT ... ET
    const btEtRegex = /BT[\s\S]*?ET/g
    let match: RegExpExecArray | null

    while ((match = btEtRegex.exec(pdfString)) !== null) {
      const block = match[0]

      // Extract string literals (text) Tj or [(text1) 10 (text2)] TJ
      const parenRegex = /\(([\s\S]*?)\)\s*(?:Tj|TJ|\')/g
      let pMatch: RegExpExecArray | null
      let blockText = ""

      while ((pMatch = parenRegex.exec(block)) !== null) {
        let str = pMatch[1]
          .replace(/\\([()])/g, "$1")
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))

        str = str.replace(/[^\x20-\x7E\n\r\t]/g, "")
        if (str.trim()) {
          blockText += (blockText ? "\n" : "") + str
        }
      }

      // Extract hex strings <48656c6c6f> Tj
      const hexRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|TJ|\')/g
      let hMatch: RegExpExecArray | null
      while ((hMatch = hexRegex.exec(block)) !== null) {
        const hex = hMatch[1]
        let hexStr = ""
        for (let i = 0; i < hex.length; i += 2) {
          const charCode = parseInt(hex.substring(i, i + 2), 16)
          if (charCode >= 32 && charCode <= 126) {
            hexStr += String.fromCharCode(charCode)
          }
        }
        if (hexStr.trim()) {
          blockText += (blockText ? " " : "") + hexStr
        }
      }

      if (blockText.trim()) {
        textSegments.push(blockText.trim())
      }
    }

    if (textSegments.length > 0) {
      return textSegments.join("\n")
    }

  } catch (err) {
    console.error("Native PDF stream parsing failed:", err)
  }

  return ""
}

export interface TemplateField {
  id: string
  label: string
  type: "text" | "textarea" | "select" | "number" | "checkbox"
  options?: string[]
  defaultValue?: string
  placeholder?: string
  required?: boolean
}

export interface TemplateSection {
  id: string
  title: string
  instructions?: string
  fields: TemplateField[]
}

export interface RadiologyTest {
  id: string
  name: string
  code?: string
  category: "X-Ray" | "CT Scan" | "MRI" | "Ultrasound (USG)" | "Doppler" | "Mammography" | "Fluoroscopy / Special Procedures" | "Other"
  modality: "XR" | "CT" | "MR" | "US" | "NM"
  status: "Active" | "Inactive"
  activeTemplateId?: string
  createdAt: string
  updatedAt: string
}

export interface RadiologyTemplate {
  id: string
  testId: string
  testName: string
  genderTarget?: "All" | "Male" | "Female"
  version: number
  status: "Active" | "Inactive" | "Archived"
  sections: TemplateSection[]
  rawContent?: string
  uploadedFileUrl?: string
  uploadedFileName?: string
  uploadedFileType?: "pdf" | "word" | "image" | "text" | "json"
  createdAt: string
  updatedAt: string
  createdBy?: string
  // Enhanced faithful layout reproduction and clinical governance fields
  reconstructedDocument?: ReconstructedDocument
  originalExtractionSnapshot?: ReconstructedDocument
  originalFileDataUrl?: string
  originalFileSize?: number
  approvalStatus?: "Draft" | "Pending Review" | "Approved"
  approvedBy?: string
  approvedAt?: string
  facilityApplicability?: string
  variantProtocol?: string
  examinationCode?: string
  modality?: string
  bodyPart?: string
  templateType?: string
  description?: string
  templateName?: string
  notes?: string
  fullExtractedText?: string
  completenessReport?: CompletenessReport
}

export interface RadiologyReportRecord {
  id: string
  studyId: string
  patientId?: string
  examinationId?: string
  patientName: string
  mrn: string
  umr?: string
  encounterId?: string
  referringDoctor?: string
  orderedDate?: string
  testId: string
  testName: string
  templateId: string
  templateVersion: number
  templateStructure: TemplateSection[]
  fieldValues: Record<string, any>
  technicianNotes?: string
  technicianSignature?: string
  radiologistName?: string
  uploadedFileUrl?: string
  uploadedFileName?: string
  uploadedFileType?: string
  status: "Draft" | "Final" | "AWAITING_REPORT" | "DRAFT_SAVED" | "UNDER_REVIEW" | "CORRECTION_REQUIRED" | "FINALIZED" | string
  savedAt: string
  finalizedAt?: string
  // Preservation of exact historical template layout used at signing
  reconstructedDocumentSnapshot?: ReconstructedDocument
}

export function convertHtmlToFormattedText(html: string): string {
  if (!html || !html.trim()) return ""

  // 1. Process table cells (th, td) first to preserve cell boundaries and avoid inner newlines breaking rows
  let text = html.replace(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, cellContent) => {
    const cleanCell = cellContent
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[a-z0-9]+[^>]*>/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
    return ` | ${cleanCell}`
  })

  // 2. Process table rows and boundaries
  text = text
    .replace(/<tr\b[^>]*>/gi, "\n")
    .replace(/<\/tr>/gi, " |")
    .replace(/<\/table>/gi, "\n\n")

  // 3. Process headings, lists, paragraphs, and breaks
  text = text
    .replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n\n$1\n")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "\n• $1")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")

  const lines = text.split("\n").map((l) => l.trimEnd())
  const cleanedLines: string[] = []
  let consecutiveEmpty = 0

  for (const line of lines) {
    if (line.trim() === "") {
      consecutiveEmpty++
      if (consecutiveEmpty <= 2) {
        cleanedLines.push("")
      }
    } else {
      consecutiveEmpty = 0
      cleanedLines.push(line)
    }
  }

  return cleanedLines.join("\n").trim()
}

export async function extractTextFromWordBuffer(
  arrayBuffer: ArrayBuffer | Uint8Array,
  fileName: string = "template.docx"
): Promise<string> {
  const rawArrayBuffer = arrayBuffer instanceof Uint8Array
    ? arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength)
    : arrayBuffer

  const bufferCopy1 = rawArrayBuffer.slice(0)
  const bufferCopy2 = rawArrayBuffer.slice(0)
  const bufferCopy3 = rawArrayBuffer.slice(0)

  // 1. Primary Strategy: Mammoth HTML conversion (preserves headings, tables, bullet points, line breaks)
  try {
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer: bufferCopy1 })
    if (htmlResult && htmlResult.value && htmlResult.value.trim()) {
      const formattedText = convertHtmlToFormattedText(htmlResult.value)
      if (formattedText && formattedText.length > 5) {
        return formattedText
      }
    }
  } catch (err) {
    console.warn(`Mammoth HTML conversion skipped for ${fileName}:`, err)
  }

  // 2. Secondary Strategy: Mammoth Raw Text Extraction
  try {
    const rawResult = await mammoth.extractRawText({ arrayBuffer: bufferCopy2 })
    if (rawResult && rawResult.value && rawResult.value.trim()) {
      return rawResult.value.trim()
    }
  } catch (err) {
    console.warn(`Mammoth raw text extraction skipped for ${fileName}:`, err)
  }

  // 3. Tertiary Strategy: Direct JSZip extraction of word/document.xml
  try {
    const zip = await JSZip.loadAsync(bufferCopy3)
    const docFile = zip.file("word/document.xml")
    if (docFile) {
      const xmlContent = await docFile.async("string")
      const cleaned = extractCleanTemplateText(fileName, xmlContent)
      if (cleaned && cleaned.trim()) {
        return cleaned.trim()
      }
    }
  } catch (err) {
    console.warn(`JSZip document.xml extraction skipped for ${fileName}:`, err)
  }

  // 4. Strategy for legacy Word 97-2003 (.doc) binary files: Extract UTF-16LE and ASCII text streams
  try {
    const uint8 = new Uint8Array(rawArrayBuffer)
    const docParagraphs: string[] = []

    // 4a. Check UTF-16LE text sequences (standard in OLE2 Word .doc streams)
    let currentUtf16 = ""
    for (let i = 0; i < uint8.length - 1; i += 2) {
      const code = uint8[i] | (uint8[i + 1] << 8)
      if ((code >= 32 && code <= 126) || code === 10 || code === 13) {
        currentUtf16 += String.fromCharCode(code)
      } else {
        if (currentUtf16.trim().length > 6) {
          docParagraphs.push(currentUtf16.trim())
        }
        currentUtf16 = ""
      }
    }
    if (currentUtf16.trim().length > 6) {
      docParagraphs.push(currentUtf16.trim())
    }

    // Filter out OLE2 internal headers/metadata and keep actual report lines
    const validLines = docParagraphs.filter(
      (p) =>
        !p.includes("Root Entry") &&
        !p.includes("WordDocument") &&
        !p.includes("CompObj") &&
        !p.includes("SummaryInformation") &&
        p.length > 3
    )

    if (validLines.length > 0) {
      const joined = validLines.join("\n")
      if (joined.length > 20) {
        return joined
      }
    }
  } catch (err) {
    console.warn(`Legacy .doc binary stream extraction skipped for ${fileName}:`, err)
  }

  // 5. Fallback Strategy: Binary XML Stream Decoder for .docx / .doc files
  try {
    const decoder = new TextDecoder("latin1")
    const rawString = decoder.decode(new Uint8Array(rawArrayBuffer))
    const cleanedText = extractCleanTemplateText(fileName, rawString)
    if (cleanedText && cleanedText.trim()) {
      return cleanedText.trim()
    }
  } catch (err) {
    console.error(`Binary Word extraction error for ${fileName}:`, err)
  }

  return ""
}

export { extractCleanTemplateText, cleanRawPlainText } from "./templateTextCleaner"

/**
 * Universal cross-variant clinical test matcher.
 * Detects whether two radiology test names refer to the same procedure
 * (e.g., "Chest PA" <-> "Chest X-Ray PA/Lateral" <-> "CXR PA View",
 * "Ultrasound Whole Abdomen" <-> "USG Abdomen", "CT Head Non-Contrast" <-> "CT Brain").
 */
export function areTestsMatching(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false
  const a = nameA.trim().toLowerCase()
  const b = nameB.trim().toLowerCase()
  if (a === b) return true

  const getTokens = (str: string) => ({
    isXR: /x-?ray|xr|radiograph|radiography|pa view|ap view|pa\/lateral/i.test(str),
    isCT: /\bct\b|computed tomography|ncct|cect|hrct/i.test(str),
    isMR: /\bmri\b|magnetic resonance|\bmrcp\b/i.test(str),
    isUS: /ultrasound|usg|sonograph|sonogram|doppler/i.test(str),
    chest: /chest|thorax|lung|cxr/i.test(str),
    abdomen: /abdomen|abdominal|whole abdomen/i.test(str),
    head: /head|brain|skull/i.test(str),
    pelvis: /pelvis|pelvic/i.test(str),
    spine: /spine|cervical|lumbar|dorsal|lumbosacral/i.test(str),
    kub: /kub|kidney|renal/i.test(str),
    neck: /neck|thyroid/i.test(str),
    breast: /breast|mammograph|mammo/i.test(str),
    joints: /knee|shoulder|elbow|ankle|wrist|hip/i.test(str),
  })

  const tA = getTokens(a)
  const tB = getTokens(b)

  // Explicit modality check: if both specify different modalities, they CANNOT match
  const explicitModA = tA.isXR ? "XR" : tA.isCT ? "CT" : tA.isMR ? "MR" : tA.isUS ? "US" : null
  const explicitModB = tB.isXR ? "XR" : tB.isCT ? "CT" : tB.isMR ? "MR" : tB.isUS ? "US" : null
  if (explicitModA && explicitModB && explicitModA !== explicitModB) {
    return false
  }

  // Must share modality or at least one is unspecified modality
  const sameMod =
    (tA.isXR && tB.isXR) ||
    (tA.isCT && tB.isCT) ||
    (tA.isMR && tB.isMR) ||
    (tA.isUS && tB.isUS) ||
    (!tA.isXR && !tA.isCT && !tA.isMR && !tA.isUS) ||
    (!tB.isXR && !tB.isCT && !tB.isMR && !tB.isUS)

  if (!sameMod) return false

  // Check matching anatomical region
  if (tA.chest && tB.chest) return true
  if (tA.abdomen && tB.abdomen) return true
  if (tA.head && tB.head) return true
  if (tA.pelvis && tB.pelvis) return true
  if (tA.spine && tB.spine) return true
  if (tA.kub && tB.kub) return true
  if (tA.neck && tB.neck) return true
  if (tA.breast && tB.breast) return true
  if (tA.joints && tB.joints) return true

  // Substring matching only when compatible
  if (a.includes(b) || b.includes(a)) {
    const longer = a.length > b.length ? a : b
    const shorter = a.length > b.length ? b : a
    if (shorter.length >= 6 && longer.includes(shorter)) {
      return true
    }
  }

  return false
}

/**
 * Auto-detects recommended test name, modality category, and target gender from uploaded file name / text content.
 */
export function detectTestFromTemplateContent(fileName: string, content: string): {
  testName?: string
  genderTarget?: "All" | "Male" | "Female"
  category?: "X-Ray" | "CT Scan" | "MRI" | "Ultrasound (USG)"
} {
  const combined = `${fileName} ${content.slice(0, 1500)}`.toLowerCase()

  let genderTarget: "All" | "Male" | "Female" = "All"
  if (combined.includes("prostate") || combined.includes("male pelvis") || combined.includes("testis") || combined.includes("scrotum")) {
    genderTarget = "Male"
  } else if (combined.includes("uterus") || combined.includes("ovaries") || combined.includes("endometrium") || combined.includes("gravid") || combined.includes("female pelvis")) {
    genderTarget = "Female"
  }

  if (combined.includes("chest") && (combined.includes("x-ray") || combined.includes("xr") || combined.includes("pa view") || combined.includes("lungs"))) {
    return { testName: "Chest PA", category: "X-Ray", genderTarget }
  }
  if (combined.includes("abdomen") && (combined.includes("ultrasound") || combined.includes("usg") || combined.includes("sonograph") || combined.includes("liver"))) {
    return { testName: "Ultrasound Whole Abdomen", category: "Ultrasound (USG)", genderTarget }
  }
  if ((combined.includes("head") || combined.includes("brain")) && (combined.includes("ct") || combined.includes("computed tomography"))) {
    return { testName: "CT Head Non-Contrast", category: "CT Scan", genderTarget }
  }
  if (combined.includes("kub") || (combined.includes("kidney") && combined.includes("urinary bladder"))) {
    return { testName: "Ultrasound KUB", category: "Ultrasound (USG)", genderTarget }
  }
  if (combined.includes("pelvis") && (combined.includes("ultrasound") || combined.includes("usg"))) {
    return { testName: "Ultrasound Pelvis", category: "Ultrasound (USG)", genderTarget }
  }
  if (combined.includes("spine") && (combined.includes("x-ray") || combined.includes("xr"))) {
    return { testName: "X-Ray Lumbar Spine AP/LAT", category: "X-Ray", genderTarget }
  }
  if (combined.includes("mri") && (combined.includes("brain") || combined.includes("head"))) {
    return { testName: "MRI Brain", category: "MRI", genderTarget }
  }

  return { genderTarget }
}

export function isUnwantedTicketRoutingContent(content?: any): boolean {
  if (!content) return false
  const str = typeof content === "string" ? content : JSON.stringify(content)
  const lower = str.toLowerCase()
  return (
    lower.includes("ticket routing") ||
    lower.includes("ticket-routing") ||
    lower.includes("mongodb atlas") ||
    lower.includes("backend api") ||
    lower.includes("ml engine") ||
    lower.includes("observations for https") ||
    lower.includes("observations for rest api") ||
    lower.includes("agent workload management") ||
    lower.includes("customer-support ticket") ||
    lower.includes("intelligent ticket-routing platform")
  )
}

/**
 * Automatically parses raw report text into structured sections and fields.
 * Turns headings (e.g., LUNGS:, HEART:, IMPRESSION:) into editable sections.
 */
export function parseSectionsFromContent(rawContent: string): TemplateSection[] {
  if (!rawContent || !rawContent.trim()) return []

  const lines = rawContent.split(/\r?\n/)
  const sections: TemplateSection[] = []
  let currentSection: TemplateSection | null = null
  let currentTextLines: string[] = []

  const finalizeCurrentSection = () => {
    if (currentSection) {
      const defaultVal = currentTextLines.join("\n").trim()
      currentSection.fields = [
        {
          id: `f_${currentSection.id}`,
          label: "Observations & Findings",
          type: "textarea",
          defaultValue: defaultVal,
          placeholder: `Enter findings / observations for ${currentSection.title}...`,
          required:
            currentSection.title.toLowerCase().includes("impression") ||
            currentSection.title.toLowerCase().includes("conclusion"),
        },
      ]
      sections.push(currentSection)
      currentSection = null
      currentTextLines = []
    }
  }

  const headingRegex = /^([A-Za-z0-9\s&/()_-]{3,50}):\s*(.*)$/
  const markdownHeadingRegex = /^#{1,4}\s+([A-Za-z0-9\s&/()_-]{2,60})$/
  const standaloneHeadingRegex = /^([A-Z0-9\s&/()_-]{4,40})$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      if (currentTextLines.length > 0) currentTextLines.push("")
      continue
    }

    // Markdown heading match
    const mdMatch = line.match(markdownHeadingRegex)
    if (mdMatch) {
      finalizeCurrentSection()
      const title = mdMatch[1].trim()
      const secId = `sec_${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${sections.length + 1}`
      currentSection = {
        id: secId,
        title: title,
        instructions: "",
        fields: [],
      }
      continue
    }

    const colonMatch = line.match(headingRegex)
    if (colonMatch && !colonMatch[1].toLowerCase().startsWith("http") && colonMatch[1].split(/\s+/).length <= 7) {
      finalizeCurrentSection()
      const title = colonMatch[1].trim()
      const remainder = colonMatch[2].trim()
      const secId = `sec_${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${sections.length + 1}`
      currentSection = {
        id: secId,
        title: title,
        instructions: "",
        fields: [],
      }
      if (remainder) {
        currentTextLines.push(remainder)
      }
      continue
    }

    const isStandaloneHeading =
      standaloneHeadingRegex.test(line) &&
      !line.includes("PAGE") &&
      !line.includes("HOSPITAL") &&
      !line.includes("DATE") &&
      !line.includes("REPORT") &&
      line.length >= 4 &&
      line.length <= 40

    if (isStandaloneHeading) {
      finalizeCurrentSection()
      const secId = `sec_${line.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${sections.length + 1}`
      currentSection = {
        id: secId,
        title: line,
        instructions: "",
        fields: [],
      }
      continue
    }

    if (currentSection) {
      currentTextLines.push(line)
    } else {
      currentSection = {
        id: `sec_clinical_details_1`,
        title: "Clinical Details & Protocol",
        instructions: "Protocol and clinical details",
        fields: [],
      }
      currentTextLines.push(line)
    }
  }

  finalizeCurrentSection()

  if (sections.length === 0) {
    sections.push(
      {
        id: "sec_findings",
        title: "Diagnostic Findings",
        instructions: "Detailed anatomical observations",
        fields: [
          {
            id: "f_findings",
            label: "Findings",
            type: "textarea",
            defaultValue: rawContent.trim(),
            placeholder: "Enter diagnostic findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_impression",
        title: "Impression",
        instructions: "Diagnostic conclusion",
        fields: [
          {
            id: "f_impression",
            label: "Impression",
            type: "textarea",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      }
    )
  }

  return sections
}

// DEFAULT INITIAL RADIOLOGY TEST CATALOG & MATCHING TEMPLATES
const DEFAULT_TESTS: RadiologyTest[] = [
  {
    id: "rad_test_xr_chest",
    name: "Chest X-Ray PA/Lateral",
    code: "RAD-XR-001",
    category: "X-Ray",
    modality: "XR",
    status: "Active",
    activeTemplateId: "rad_tpl_xr_chest_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_ct_head",
    name: "CT Head Non-Contrast",
    code: "RAD-CT-001",
    category: "CT Scan",
    modality: "CT",
    status: "Active",
    activeTemplateId: "rad_tpl_ct_head_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_usg_abdomen",
    name: "Ultrasound Whole Abdomen",
    code: "RAD-US-001",
    category: "Ultrasound (USG)",
    modality: "US",
    status: "Active",
    activeTemplateId: "rad_tpl_usg_abdomen_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_mr_lumbar_spine",
    name: "MRI — Lumbar Spine",
    code: "RAD-MR-001",
    category: "MRI",
    modality: "MR",
    status: "Active",
    activeTemplateId: "rad_tpl_mr_lumbar_spine_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_mr_brain",
    name: "MRI — Brain",
    code: "RAD-MR-002",
    category: "MRI",
    modality: "MR",
    status: "Active",
    activeTemplateId: "rad_tpl_mr_brain_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_ct_abdomen",
    name: "Contrast CT — Abdomen",
    code: "RAD-CT-002",
    category: "CT Scan",
    modality: "CT",
    status: "Active",
    activeTemplateId: "rad_tpl_ct_abdomen_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_mr_knee",
    name: "MRI — Knee (Right)",
    code: "RAD-MR-003",
    category: "MRI",
    modality: "MR",
    status: "Active",
    activeTemplateId: "rad_tpl_mr_knee_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_usg_thyroid",
    name: "USG — Thyroid",
    code: "RAD-US-002",
    category: "Ultrasound (USG)",
    modality: "US",
    status: "Active",
    activeTemplateId: "rad_tpl_usg_thyroid_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_mammo_bl",
    name: "Mammography (B/L)",
    code: "RAD-MAM-001",
    category: "Mammography",
    modality: "XR",
    status: "Active",
    activeTemplateId: "rad_tpl_mammo_bl_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_ct_chest",
    name: "CT — Chest (HRCT)",
    code: "RAD-CT-003",
    category: "CT Scan",
    modality: "CT",
    status: "Active",
    activeTemplateId: "rad_tpl_ct_chest_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_xr_knee",
    name: "X-Ray — Knee (AP/L)",
    code: "RAD-XR-002",
    category: "X-Ray",
    modality: "XR",
    status: "Active",
    activeTemplateId: "rad_tpl_xr_knee_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
  {
    id: "rad_test_dexa_scan",
    name: "Bone Mineral Densitometry (DEXA Scan)",
    code: "RAD-DEXA-001",
    category: "X-Ray",
    modality: "XR",
    status: "Active",
    activeTemplateId: "rad_tpl_dexa_v1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  },
]

const DEFAULT_TEMPLATES: RadiologyTemplate[] = [
  // 1. CHEST X-RAY TEMPLATE
  {
    id: "rad_tpl_xr_chest_v1",
    testId: "rad_test_xr_chest",
    testName: "Chest X-Ray PA/Lateral",
    genderTarget: "All",
    version: 1,
    status: "Active",
    uploadedFileName: "XRay_Chest_Standard_Template.pdf",
    uploadedFileType: "pdf",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `CHEST X-RAY (PA & LATERAL VIEWS)

TRACHEA & MEDIASTINUM: Trachea is midline. Mediastinal contours, aortic knob, and hilar shadows are normal in position and configuration.
HEART & PERICARDIUM: Cardiac silhouette is normal in size and contour (Cardiothoracic ratio < 0.50). Normal mediastinal vascularity.
LUNG FIELDS: Both lung fields are clear and normally aerated. No focal parenchymal consolidation, infiltrates, mass lesions, or atelectasis. Vascular markings are within normal limits.
PLEURA & CP ANGLES: Bilateral costophrenic and cardiophrenic angles are sharp and clear. No evidence of pleural effusion or pneumothorax.
DIAPHRAGMS: Both diaphragmatic domes are smooth, regular, and normal in position and contour. Subdiaphragmatic spaces are clear without free air.
BONY THORAX: Rib cage, clavicles, scapulae, and visualized spine appear intact. No acute fractures or destructive osseous lesions. Soft tissues of the chest wall are unremarkable.

IMPRESSION:
   ❖ NO ACUTE CARDIOPULMONARY ABNORMALITY DETECTED.
   ❖ CLEAR LUNG FIELDS AND NORMAL CARDIAC SILHOUETTE.`,
    sections: [
      {
        id: "sec_lungs",
        title: "Lungs",
        instructions: "Enter findings / observations here:",
        fields: [
          {
            id: "f_lungs",
            label: "Lungs Observations",
            type: "textarea",
            defaultValue: "Both lung fields are clear and normally aerated. No focal parenchymal consolidation, infiltrates, or atelectasis. Vascular markings within normal limits.",
            placeholder: "Enter lung findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_pleura",
        title: "Pleura",
        instructions: "Enter findings / observations here:",
        fields: [
          {
            id: "f_pleura",
            label: "Pleura Observations",
            type: "textarea",
            defaultValue: "Bilateral costophrenic and cardiophrenic angles are sharp and clear. No evidence of pleural effusion or pneumothorax.",
            placeholder: "Enter pleura findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_heart",
        title: "Heart / Cardiomediastinal Silhouette",
        instructions: "Enter findings / observations here:",
        fields: [
          {
            id: "f_heart",
            label: "Heart & Silhouette Observations",
            type: "textarea",
            defaultValue: "Cardiac silhouette is normal in size and contour (Cardiothoracic ratio < 0.50). Normal mediastinal vascularity.",
            placeholder: "Enter cardiac findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mediastinum",
        title: "Mediastinum",
        instructions: "Enter findings / observations here:",
        fields: [
          {
            id: "f_mediastinum",
            label: "Mediastinum Observations",
            type: "textarea",
            defaultValue: "Trachea is midline. Mediastinal contours, aortic knob, and hilar shadows are normal in position and configuration.",
            placeholder: "Enter mediastinum findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_diaphragm",
        title: "Diaphragm",
        instructions: "Enter findings / observations here:",
        fields: [
          {
            id: "f_diaphragm",
            label: "Diaphragm Observations",
            type: "textarea",
            defaultValue: "Both diaphragmatic domes are smooth, regular, and normal in position and contour. Subdiaphragmatic spaces are clear without free air.",
            placeholder: "Enter diaphragm findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_bony_thorax",
        title: "Bony Thorax",
        instructions: "Enter findings / observations here:",
        fields: [
          {
            id: "f_bony_thorax",
            label: "Bony Thorax Observations",
            type: "textarea",
            defaultValue: "Rib cage, clavicles, scapulae, and visualized spine appear intact. No acute fractures or destructive osseous lesions.",
            placeholder: "Enter bony thorax findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_impression",
        title: "Impression",
        instructions: "Enter final conclusion:",
        fields: [
          {
            id: "f_impression",
            label: "Radiological Impression",
            type: "textarea",
            defaultValue: "NO ACUTE CARDIOPULMONARY ABNORMALITY DETECTED. CLEAR LUNG FIELDS AND NORMAL CARDIAC SILHOUETTE.",
            placeholder: "Enter radiological impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 2. CT HEAD / BRAIN TEMPLATE
  {
    id: "rad_tpl_ct_head_v1",
    testId: "rad_test_ct_head",
    testName: "CT Head Non-Contrast",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `NCCT BRAIN / HEAD NON-CONTRAST

BRAIN PARENCHYMA: Cerebral hemispheres show normal grey and white matter differentiation. No acute focal intra-axial or extra-axial hemorrhage. No evidence of acute territorial ischemic infarction. Basal ganglia, thalami and brainstem are unremarkable.
VENTRICLES & CISTERNS: Ventricular system is symmetrical and normal in size for age. Third and fourth ventricles are central. Basal cisterns and cerebral sulci are normal without midline shift.
CALVARIUM & SOFT TISSUES: Bony calvarium, skull base, and scalp soft tissues are intact without acute fracture or hematoma. Paranasal sinuses and mastoid air cells show normal aeration.

IMPRESSION:
   ❖ NO ACUTE INTRACRANIAL HEMORRHAGE OR TERRITORIAL VASCULAR ISCHEMIC STROKE IDENTIFIED.
   ❖ NORMAL NON-CONTRAST CT SCAN OF THE BRAIN.`,
    sections: [
      {
        id: "sec_ct_parenchyma",
        title: "Brain Parenchyma",
        instructions: "Cerebral & cerebellar hemispheres, gray-white differentiation:",
        fields: [
          {
            id: "f_ct_parenchyma",
            label: "Brain Parenchyma Observations",
            type: "textarea",
            defaultValue: "Cerebral hemispheres show normal gray and white matter differentiation. No acute intra-axial or extra-axial hemorrhage. No territorial ischemic infarction or mass effect.",
            placeholder: "Enter brain parenchyma findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_ct_ventricles",
        title: "Ventricles & Basal Cisterns",
        instructions: "Ventricular size, symmetry, midline shift:",
        fields: [
          {
            id: "f_ct_ventricles",
            label: "Ventricles & Cisterns Observations",
            type: "textarea",
            defaultValue: "Ventricular system is symmetrical and normal in caliber for age. Third and fourth ventricles are midline. Basal cisterns and cerebral sulci are normal. No midline shift.",
            placeholder: "Enter ventricles and cisterns findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_ct_calvarium",
        title: "Calvarium & Sinuses",
        instructions: "Skull bone architecture, sinuses, mastoids:",
        fields: [
          {
            id: "f_ct_calvarium",
            label: "Bony Calvarium Observations",
            type: "textarea",
            defaultValue: "Calvarium and skull base appear intact without fracture. Paranasal sinuses and mastoid air cells show normal physiological aeration.",
            placeholder: "Enter calvarium findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_ct_impression",
        title: "Impression",
        instructions: "Diagnostic conclusion:",
        fields: [
          {
            id: "f_ct_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NO ACUTE INTRACRANIAL HEMORRHAGE OR TERRITORIAL INFARCTION IDENTIFIED. NORMAL NON-CONTRAST CT BRAIN.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 3. ULTRASOUND WHOLE ABDOMEN (MALE)
  {
    id: "rad_tpl_usg_abdomen_v1",
    testId: "rad_test_usg_abdomen",
    testName: "Ultrasound Whole Abdomen",
    genderTarget: "Male",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `ULTRASONOGRAPHY OF ABDOMEN (MALE)

LIVER: Normal in size with normal contour and parenchymal echogenicity. Portal vein and hepatic veins are normal in caliber. CBD is normal. No calculi.
GALL BLADDER: Distended, normal wall thickness. Luminal contents clear without calculus.
PANCREAS & SPLEEN: Normal in size and echotexture. Pancreatic duct is normal in caliber.
KIDNEYS: Both kidneys are normal in size, position, and parenchymal echogenicity. Corticomedullary differentiation well preserved. No hydronephrosis or calculi bilaterally.
URINARY BLADDER & PROSTATE: Bladder mucosal wall is smooth and regular. Prostate is normal in size (volume approx 18cc) with homogenous echotexture.
PERITONEUM: No ascites or focal retroperitoneal lymphadenopathy.

IMPRESSION:
   ❖ NO SIGNIFICANT SONOGRAPHIC ABNORMALITY DETECTED.`,
    sections: [
      {
        id: "sec_usg_liver_biliary",
        title: "Liver & Biliary Tree",
        instructions: "Liver size, parenchymal echo, CBD, gallbladder:",
        fields: [
          {
            id: "f_usg_liver",
            label: "Liver & Biliary Observations",
            type: "textarea",
            defaultValue: "Liver is normal in size and contour with homogenous parenchymal echotexture. Gallbladder is well-distended with thin, smooth wall without calculi. CBD is non-dilated.",
            placeholder: "Enter liver and biliary findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_usg_pancreas_spleen",
        title: "Pancreas & Spleen",
        instructions: "Pancreatic parenchyma, spleen size:",
        fields: [
          {
            id: "f_usg_pancreas_spleen",
            label: "Pancreas & Spleen Observations",
            type: "textarea",
            defaultValue: "Pancreas visualized in head and body regions, normal in size and echotexture. Spleen is normal in size (splenic index normal) with homogenous architecture.",
            placeholder: "Enter pancreas and spleen findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_usg_kidneys",
        title: "Kidneys & Adrenals",
        instructions: "Bilateral renal size, cortex, collecting system:",
        fields: [
          {
            id: "f_usg_kidneys",
            label: "Renal Observations",
            type: "textarea",
            defaultValue: "Both kidneys are normal in size and location (Right: 10.4cm, Left: 10.8cm). Corticomedullary differentiation preserved. No calculi or hydronephrosis.",
            placeholder: "Enter renal findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_usg_bladder_prostate",
        title: "Urinary Bladder & Prostate",
        instructions: "Bladder lumen, prostate size and echogenicity:",
        fields: [
          {
            id: "f_usg_bladder_prostate",
            label: "Bladder & Prostate Observations",
            type: "textarea",
            defaultValue: "Urinary bladder is well-distended with regular mucosa and no intraluminal calculi. Prostate is normal in size (approx 18-20 cc) with intact capsule.",
            placeholder: "Enter bladder and prostate findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_usg_impression",
        title: "Impression",
        instructions: "Sonographic conclusion:",
        fields: [
          {
            id: "f_usg_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NORMAL ULTRASONOGRAPHIC STUDY OF THE WHOLE ABDOMEN. NO CALCULI, HYDRONEPHROSIS, OR ORGANOMEGALY.",
            placeholder: "Enter sonographic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 4. ULTRASOUND WHOLE ABDOMEN (FEMALE)
  {
    id: "rad_tpl_usg_abdomen_female_v1",
    testId: "rad_test_usg_abdomen",
    testName: "Ultrasound Whole Abdomen",
    genderTarget: "Female",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `ULTRASONOGRAPHY OF ABDOMEN & PELVIS (FEMALE)

LIVER & BILIARY: Liver is normal in size with normal contour. Gallbladder is normal without calculi. CBD is non-dilated.
PANCREAS & SPLEEN: Normal in size and echotexture.
KIDNEYS: Both kidneys show normal parenchymal thickness and corticomedullary differentiation. No calculus or hydronephrosis.
UTERUS & ADNEXA: Uterus is anteverted, normal in size and contour (7.8 x 4.2 x 3.6 cm). Endometrial echo is central, measuring 6mm. Both ovaries are normal in size with normal follicular development. No adnexal mass lesion or free fluid in the Pouch of Douglas.

IMPRESSION:
   ❖ NO SIGNIFICANT ABNORMALITY DETECTED IN ABDOMEN & PELVIS.`,
    sections: [
      {
        id: "sec_usg_fem_upper",
        title: "Upper Abdomen (Liver, GB, Spleen)",
        instructions: "Upper abdominal solid organs:",
        fields: [
          {
            id: "f_usg_fem_upper",
            label: "Upper Abdomen Observations",
            type: "textarea",
            defaultValue: "Liver is normal in size and echotexture without focal mass. Gallbladder wall is thin and smooth without calculi. Pancreas and spleen are normal.",
            placeholder: "Enter upper abdomen findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_usg_fem_kidneys",
        title: "Renal System",
        instructions: "Bilateral kidneys and bladder:",
        fields: [
          {
            id: "f_usg_fem_kidneys",
            label: "Kidneys & Bladder Observations",
            type: "textarea",
            defaultValue: "Bilateral kidneys are normal in size and position. Corticomedullary differentiation is distinct. No calculus, mass, or hydronephrosis. Urinary bladder mucosa is smooth.",
            placeholder: "Enter renal findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_usg_fem_pelvis",
        title: "Uterus & Ovaries (Pelvis)",
        instructions: "Uterine dimensions, endometrium, adnexa:",
        fields: [
          {
            id: "f_usg_fem_pelvis",
            label: "Pelvic Viscera Observations",
            type: "textarea",
            defaultValue: "Uterus is anteverted, normal in size (7.6 x 3.8 x 4.2 cm). Endometrial thickness is physiological (6 mm). Bilateral ovaries are normal in volume without cystic or solid masses. Pouch of Douglas is clear.",
            placeholder: "Enter uterus and ovaries findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_usg_fem_impression",
        title: "Impression",
        instructions: "Sonographic conclusion:",
        fields: [
          {
            id: "f_usg_fem_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NO SONOGRAPHIC ABNORMALITY DETECTED IN UPPER ABDOMEN OR PELVIS. NORMAL UTERUS AND OVARIES.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 5. MRI LUMBAR SPINE TEMPLATE
  {
    id: "rad_tpl_mr_lumbar_spine_v1",
    testId: "rad_test_mr_lumbar_spine",
    testName: "MRI — Lumbar Spine",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `MRI OF THE LUMBAR SPINE

TECHNIQUE: Multiplanar multi-echo T1, T2, and STIR weighted images of the lumbosacral spine.

VERTEBRAL BODIES & ALIGNMENT: Lumbar lordosis is preserved. Vertebral body heights and marrow signal intensities are normal. No acute fracture or marrow edema.
INTERVERTEBRAL DISCS: Disc hydration is maintained across L1-L2 through L3-L4. Mild disc desiccation at L4-L5 without significant canal compromise.
SPINAL CANAL & THECAL SAC: Thecal sac dimensions are normal. Conus medullaris terminates normally at the L1 level and shows normal signal. Cauda equina nerve roots are unremarkable.
NEURAL FORAMINA: Bilateral neural exit foramina are patent at all lumbar levels without nerve root impingement.
PARAVERTEBRAL TISSUES: Psoas and erector spinae musculature are symmetric and unremarkable.

IMPRESSION:
   ❖ MILD DEGENERATIVE DISC DESICCATION AT L4-L5 WITHOUT SIGNIFICANT CANAL STENOSIS OR FORAMINAL ROOT COMPROMISE.
   ❖ NORMAL ALIGNMENT AND INTACT VERTEBRAL MARROW SIGNAL.`,
    sections: [
      {
        id: "sec_mr_alignment",
        title: "Alignment & Vertebral Bodies",
        instructions: "Curvature, heights, marrow signals, fractures:",
        fields: [
          {
            id: "f_mr_alignment",
            label: "Alignment & Marrow Observations",
            type: "textarea",
            defaultValue: "Normal lumbar lordosis is maintained. Vertebral body heights are preserved. Normal bone marrow signal on T1, T2, and STIR sequences without focal marrow edema or fracture.",
            placeholder: "Enter alignment and vertebral body findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mr_discs",
        title: "Intervertebral Discs (L1 to S1)",
        instructions: "Hydration, bulges, protrusions, extrusions:",
        fields: [
          {
            id: "f_mr_discs",
            label: "Intervertebral Disc Observations",
            type: "textarea",
            defaultValue: "Intervertebral disc heights and signals are preserved. Mild posterior disc bulge at L4-L5 level with no significant thecal sac indentation or nerve root compression. Other disc levels are unremarkable.",
            placeholder: "Enter intervertebral disc findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mr_canal",
        title: "Spinal Canal & Thecal Sac",
        instructions: "Central canal caliber, conus medullaris, cauda equina:",
        fields: [
          {
            id: "f_mr_canal",
            label: "Canal & Thecal Sac Observations",
            type: "textarea",
            defaultValue: "Spinal canal dimensions are within normal limits without central stenosis. Conus medullaris terminates normally at L1 level and shows normal signal. Cauda equina nerve roots are free.",
            placeholder: "Enter spinal canal findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mr_foramina",
        title: "Neural Foramina & Soft Tissues",
        instructions: "Exiting nerve roots, facet joints, paraspinal muscles:",
        fields: [
          {
            id: "f_mr_foramina",
            label: "Foramina & Soft Tissue Observations",
            type: "textarea",
            defaultValue: "Bilateral neural exit foramina are patent at all lumbar levels without nerve root impingement. Facet joints are intact. Paravertebral soft tissues are unremarkable.",
            placeholder: "Enter neural foramina and soft tissue findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mr_impression",
        title: "Impression",
        instructions: "MRI conclusion:",
        fields: [
          {
            id: "f_mr_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "MILD L4-L5 DEGENERATIVE DISC BULGE WITHOUT SIGNIFICANT CENTRAL CANAL OR NEURAL FORAMINAL STENOSIS. NO ACUTE COMPRESSION FRACTURE.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 6. MRI BRAIN TEMPLATE
  {
    id: "rad_tpl_mr_brain_v1",
    testId: "rad_test_mr_brain",
    testName: "MRI — Brain",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `MRI OF THE BRAIN

PULSE SEQUENCES: Axial T1, T2, FLAIR, DWI, ADC, and Sagittal T1 weighted MR imaging.

BRAIN PARENCHYMA: Cerebral and cerebellar hemispheres show normal morphology. No focal abnormal signal intensity on T1/T2/FLAIR sequences. DWI shows no acute restricted diffusion to suggest acute territorial infarction. Gray-white matter differentiation is preserved.
DEEP BRAIN NUCLEI: Basal ganglia, thalami, and internal capsules are unremarkable bilaterally.
VENTRICLES & CISTERNS: Ventricles and cortical sulci are within normal physiological age limits. No midline shift or hydrocephalus.
POSTERIOR FOSSA: Brainstem and cerebellum show normal architecture. Fourth ventricle is midline.
MAJOR VESSELS: Normal major intracranial flow voids. No dural venous sinus thrombosis.

IMPRESSION:
   ❖ NO ACUTE TERRITORIAL ISCHEMIC INFARCTION, HEMORRHAGE, OR SPACE-OCCUPYING LESION.
   ❖ NORMAL BRAIN MRI STUDY.`,
    sections: [
      {
        id: "sec_mrb_parenchyma",
        title: "Brain Parenchyma & Diffusion (DWI/ADC)",
        instructions: "Hemispheres, white matter, acute diffusion restriction:",
        fields: [
          {
            id: "f_mrb_parenchyma",
            label: "Parenchymal Observations",
            type: "textarea",
            defaultValue: "Cerebral and cerebellar hemispheres demonstrate normal signal. No focal parenchymal lesions, hemorrhage, or mass effect. DWI/ADC sequences demonstrate no acute diffusion restriction.",
            placeholder: "Enter parenchymal observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mrb_ventricles",
        title: "Ventricles & Extra-axial Spaces",
        instructions: "Lateral, 3rd, 4th ventricles, sulci, cisterns:",
        fields: [
          {
            id: "f_mrb_ventricles",
            label: "Ventricular Observations",
            type: "textarea",
            defaultValue: "Ventricular system is symmetrical and normal in volume for age. Basal cisterns, sylvian fissures, and cerebral cortical sulci are unremarkable. No midline shift.",
            placeholder: "Enter ventricular observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mrb_posterior_fossa",
        title: "Brainstem & Posterior Fossa",
        instructions: "Midbrain, pons, medulla, cerebellar lobes:",
        fields: [
          {
            id: "f_mrb_posterior_fossa",
            label: "Posterior Fossa Observations",
            type: "textarea",
            defaultValue: "Brainstem and bilateral cerebellar hemispheres appear normal in contour and signal. Cranio-cervical junction is intact.",
            placeholder: "Enter posterior fossa observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mrb_impression",
        title: "Impression",
        instructions: "MRI conclusion:",
        fields: [
          {
            id: "f_mrb_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NO ACUTE INFARCTION, INTRACRANIAL HEMORRHAGE, OR SPACE OCCUPYING LESION DETECTED. NORMAL MRI BRAIN.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 7. CONTRAST CT ABDOMEN TEMPLATE
  {
    id: "rad_tpl_ct_abdomen_v1",
    testId: "rad_test_ct_abdomen",
    testName: "Contrast CT — Abdomen",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `CONTRAST ENHANCED COMPUTED TOMOGRAPHY (CECT) ABDOMEN & PELVIS

TECHNIQUE: Helical CT scan of the abdomen and pelvis obtained following administration of intravenous and oral iodinated contrast material.

SOLID ABDOMINAL ORGANS: Liver demonstrates homogenous contrast enhancement without focal lesions. Gallbladder is normal. Spleen, pancreas, and adrenal glands are normal in morphology.
URINARY SYSTEM: Bilateral kidneys demonstrate prompt, symmetrical nephrographic enhancement and excretion. No calculi, mass lesions, or hydronephrosis.
GI TRACT & MESENTERY: Stomach, small bowel loops, and large bowel show normal wall thickness and luminal caliber. No bowel obstruction or pneumoperitoneum.
VASCULAR & LYMPH NODES: Abdominal aorta and inferior vena cava are normal in caliber. No significant retroperitoneal or mesenteric lymphadenopathy.
PERITONEAL CAVITY: No free intraperitoneal fluid or collection.

IMPRESSION:
   ❖ NO SIGNIFICANT SOLID ORGAN ABNORMALITY OR ACUTE INTRA-ABDOMINAL INFLAMMATORY PROCESS IDENTIFIED.`,
    sections: [
      {
        id: "sec_cect_solid_organs",
        title: "Solid Organs (Liver, GB, Spleen, Pancreas)",
        instructions: "Organ enhancement, parenchyma, biliary ducts:",
        fields: [
          {
            id: "f_cect_solid_organs",
            label: "Solid Organs Observations",
            type: "textarea",
            defaultValue: "Liver shows normal size, contour, and homogenous post-contrast enhancement with no focal lesion. Gallbladder is normal. Pancreas and spleen show normal enhancement without parenchymal mass.",
            placeholder: "Enter solid organ findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_cect_urinary",
        title: "Kidneys & Urinary Tract",
        instructions: "Renal enhancement, excretion, collecting systems:",
        fields: [
          {
            id: "f_cect_urinary",
            label: "Urinary System Observations",
            type: "textarea",
            defaultValue: "Both kidneys show symmetrical nephrographic and excretory enhancement. Corticomedullary differentiation is distinct. No calculus, hydronephrosis, or perinephric fat stranding.",
            placeholder: "Enter urinary tract findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_cect_gi_mesentery",
        title: "Bowel & Peritoneum",
        instructions: "Bowel loops, appendix, mesentery, free fluid:",
        fields: [
          {
            id: "f_cect_gi_mesentery",
            label: "Bowel & Peritoneal Observations",
            type: "textarea",
            defaultValue: "Stomach, small bowel, and colon demonstrate normal mural thickness and enhancement. Appendix is normal without inflammatory changes. No free fluid, free air, or significant lymphadenopathy.",
            placeholder: "Enter bowel and peritoneal findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_cect_impression",
        title: "Impression",
        instructions: "CECT conclusion:",
        fields: [
          {
            id: "f_cect_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NO ACUTE INTRA-ABDOMINAL OR INTRAPELVIC PATHOLOGY. SOLID ABDOMINAL ORGANS SHOW NORMAL CONTRAST ENHANCEMENT.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 8. MRI KNEE TEMPLATE
  {
    id: "rad_tpl_mr_knee_v1",
    testId: "rad_test_mr_knee",
    testName: "MRI — Knee (Right)",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `MRI OF THE RIGHT KNEE JOINT

TECHNIQUE: Multiplanar Proton Density, T1, and T2 FS MR imaging of the right knee.

MENISCI: Medial and lateral menisci demonstrate normal morphology and low signal intensity throughout. No tear or degenerative cleavage plane.
LIGAMENTS: Anterior Cruciate Ligament (ACL) and Posterior Cruciate Ligament (PCL) are intact with normal slope and signal. Medial (MCL) and Lateral (LCL) collateral ligament complexes are intact.
ARTICULAR CARTILAGE & BONES: Femorotibial and patellofemoral articular cartilage surfaces are preserved. Visualized bone marrow displays normal signal without contusion or osteochondral defect.
EXTENSOR APPARATUS: Quadriceps tendon and patellar tendon are intact.
JOINT SPACE: No significant knee joint effusion or Baker's cyst.

IMPRESSION:
   ❖ INTACT CRUCIATE AND COLLATERAL LIGAMENTS.
   ❖ NO MENISCAL TEAR OR SIGNIFICANT JOINT EFFUSION IN RIGHT KNEE.`,
    sections: [
      {
        id: "sec_mrk_menisci",
        title: "Menisci (Medial & Lateral)",
        instructions: "Morphology, contour, signal, tears:",
        fields: [
          {
            id: "f_mrk_menisci",
            label: "Meniscal Observations",
            type: "textarea",
            defaultValue: "Medial and lateral menisci show normal triangular morphology and low signal on all sequences. No displaced, radial, or horizontal cleavage tears.",
            placeholder: "Enter meniscal observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mrk_ligaments",
        title: "Cruciate & Collateral Ligaments",
        instructions: "ACL, PCL, MCL, LCL:",
        fields: [
          {
            id: "f_mrk_ligaments",
            label: "Ligamentous Observations",
            type: "textarea",
            defaultValue: "ACL fibers are intact, taut, and show normal orientation. PCL is intact with normal curvature. MCL and LCL complexes are intact with no sprain or disruption.",
            placeholder: "Enter ligamentous observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mrk_cartilage_bones",
        title: "Cartilage & Bone Marrow",
        instructions: "Articular cartilage thickness, subchondral bone marrow:",
        fields: [
          {
            id: "f_mrk_cartilage_bones",
            label: "Cartilage & Bone Observations",
            type: "textarea",
            defaultValue: "Femorotibial and patellofemoral joint cartilage thickness is preserved. No full-thickness chondral defect. Bone marrow signal is homogenous without contusion or subchondral microfracture.",
            placeholder: "Enter cartilage and bone observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mrk_impression",
        title: "Impression",
        instructions: "Knee MRI conclusion:",
        fields: [
          {
            id: "f_mrk_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NO CRUCIATE LIGAMENT RUPTURE OR MENISCAL TEAR IDENTIFIED. PRESERVED ARTICULAR CARTILAGE OF THE RIGHT KNEE.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 9. ULTRASOUND THYROID TEMPLATE
  {
    id: "rad_tpl_usg_thyroid_v1",
    testId: "rad_test_usg_thyroid",
    testName: "USG — Thyroid",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `HIGH RESOLUTION ULTRASOUND OF THE THYROID GLAND

RIGHT LOBE: Measures 4.2 x 1.4 x 1.3 cm. Parenchymal echotexture is normal and homogenous. No focal solid or cystic nodule.
LEFT LOBE: Measures 4.0 x 1.3 x 1.2 cm. Normal parenchymal echogenicity without focal lesions.
ISTHMUS: Measures 2.8 mm in AP diameter with normal architecture.
COLOR DOPPLER: Parenchymal vascularity is symmetric and within normal physiological limits.
CERVICAL LYMPH NODES: Bilateral cervical lymph node chains show normal reniform morphology and fatty hilum. No suspicious lymphadenopathy.

IMPRESSION:
   ❖ NORMAL HIGH-RESOLUTION THYROID ULTRASONOGRAPHY (TI-RADS 1).
   ❖ NO EVIDENCE OF THYROIDITIS OR DISCRETE THYROID NODULES.`,
    sections: [
      {
        id: "sec_thy_lobes",
        title: "Thyroid Lobes & Isthmus",
        instructions: "Dimensions, echogenicity, isthmus thickness:",
        fields: [
          {
            id: "f_thy_lobes",
            label: "Thyroid Parenchymal Observations",
            type: "textarea",
            defaultValue: "Bilateral thyroid lobes are normal in size and contours with homogenous parenchymal echotexture. Isthmus is normal in thickness (approx 2.8 mm) without focal nodules.",
            placeholder: "Enter thyroid lobe observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_thy_nodules_doppler",
        title: "Nodules & Color Doppler",
        instructions: "TI-RADS assessment, vascular flow:",
        fields: [
          {
            id: "f_thy_nodules_doppler",
            label: "Nodule & Vascular Observations",
            type: "textarea",
            defaultValue: "No focal solid, cystic, or calcified thyroid nodules identified. Color Doppler demonstrates normal physiological vascularity without hypervascularity (inferno pattern).",
            placeholder: "Enter nodule and vascular observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_thy_impression",
        title: "Impression",
        instructions: "Thyroid conclusion:",
        fields: [
          {
            id: "f_thy_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NORMAL THYROID ULTRASOUND (ACR TI-RADS 1: BENIGN / NORMAL). NO DISCRETE NODULES OR THYROIDITIS.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 10. BILATERAL MAMMOGRAPHY TEMPLATE
  {
    id: "rad_tpl_mammo_bl_v1",
    testId: "rad_test_mammo_bl",
    testName: "Mammography (B/L)",
    genderTarget: "Female",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `DIGITAL SCREENING MAMMOGRAPHY (BILATERAL)

TECHNIQUE: Standard Craniocaudal (CC) and Mediolateral Oblique (MLO) views of bilateral breasts.

BREAST COMPOSITION: Fibroglandular density is scattered (ACR BI-RADS Category B).
RIGHT BREAST: No discrete focal mass, architectural distortion, or suspicious pleomorphic clustered microcalcifications.
LEFT BREAST: No dominant mass, architectural distortion, or suspicious microcalcifications.
SKIN & AXILLAE: Skin thickness and nipple-areolar complexes are normal bilaterally. Visualized axillary lymph nodes show benign fatty replacement without pathological enlargement.

IMPRESSION:
   ❖ NO RADIOLOGICAL EVIDENCE OF MALIGNANCY.
   ❖ BI-RADS CATEGORY 1: NEGATIVE BILATERAL MAMMOGRAM.`,
    sections: [
      {
        id: "sec_mammo_density",
        title: "Breast Composition & Density",
        instructions: "ACR BI-RADS composition category (A/B/C/D):",
        fields: [
          {
            id: "f_mammo_density",
            label: "Breast Composition Observations",
            type: "textarea",
            defaultValue: "Bilateral breasts demonstrate scattered areas of fibroglandular density (ACR BI-RADS Category B). Breasts are sufficiently translucent to detect parenchymal abnormalities.",
            placeholder: "Enter breast density observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mammo_findings",
        title: "Bilateral Parenchymal Findings",
        instructions: "Masses, calcifications, architectural distortion:",
        fields: [
          {
            id: "f_mammo_findings",
            label: "Parenchymal Observations",
            type: "textarea",
            defaultValue: "No dominant solid or spiculate mass lesion in either breast. No clustered pleomorphic microcalcifications or architectural distortion. Bilateral nipples and retroareolar spaces are normal.",
            placeholder: "Enter parenchymal observations...",
            required: false,
          },
        ],
      },
      {
        id: "sec_mammo_impression",
        title: "Impression & BI-RADS Category",
        instructions: "BI-RADS category and recommendations:",
        fields: [
          {
            id: "f_mammo_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "BI-RADS CATEGORY 1 (NEGATIVE BILATERAL MAMMOGRAM). NO MAMMOGRAPHIC EVIDENCE OF MALIGNANCY. ROUTINE AGE-APPROPRIATE SCREENING RECOMMENDED.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 11. HRCT CHEST TEMPLATE
  {
    id: "rad_tpl_ct_chest_v1",
    testId: "rad_test_ct_chest",
    testName: "CT — Chest (HRCT)",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `HIGH RESOLUTION CT (HRCT) CHEST

LUNGS & PLEURA: Both lung fields are clear. No focal consolidation, ground glass opacities, traction bronchiectasis, or interstitial septal thickening. No centrilobular nodules. Tracheobronchial tree is patent. No pleural effusion or pneumothorax bilaterally.
MEDIASTINUM: Mediastinal and hilar contours are normal. No significant lymphadenopathy.
HEART & GREAT VESSELS: Cardiac size is normal. Main pulmonary artery is normal in caliber.
BONY THORAX: Thoracic skeleton shows no destructive lesions.

IMPRESSION:
   ❖ NO ACUTE INTERSTITIAL LUNG DISEASE OR FOCAL PULMONARY LESIONS DETECTED.
   ❖ NORMAL HIGH-RESOLUTION CT OF THE CHEST.`,
    sections: [
      {
        id: "sec_hrct_parenchyma",
        title: "Lung Parenchyma & Interstitium",
        instructions: "GGO, consolidations, bronchiectasis, nodules:",
        fields: [
          {
            id: "f_hrct_parenchyma",
            label: "Lung Parenchyma Observations",
            type: "textarea",
            defaultValue: "Both lungs demonstrate clear parenchyma without focal consolidation, ground-glass opacities, mosaic attenuation, or honeycombing. Tracheobronchial tree is widely patent.",
            placeholder: "Enter lung parenchyma findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_hrct_pleura_mediastinum",
        title: "Pleura & Mediastinum",
        instructions: "Effusion, lymph nodes, cardiac contours:",
        fields: [
          {
            id: "f_hrct_pleura_mediastinum",
            label: "Pleura & Mediastinum Observations",
            type: "textarea",
            defaultValue: "No pleural thickening, calcification, effusion, or pneumothorax bilaterally. Mediastinal contours are normal without pathological pretracheal or subcarinal lymphadenopathy.",
            placeholder: "Enter pleura and mediastinum findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_hrct_impression",
        title: "Impression",
        instructions: "HRCT conclusion:",
        fields: [
          {
            id: "f_hrct_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NORMAL HIGH-RESOLUTION CT SCAN OF THE CHEST. NO ACTIVE PARENCHYMAL INFILTRATE OR INTERSTITIAL LUNG DISEASE.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 12. X-RAY KNEE TEMPLATE
  {
    id: "rad_tpl_xr_knee_v1",
    testId: "rad_test_xr_knee",
    testName: "X-Ray — Knee (AP/L)",
    genderTarget: "All",
    version: 1,
    status: "Active",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `X-RAY OF THE KNEE (AP & LATERAL VIEWS)

ALIGNMENT & JOINT SPACES: Weight-bearing alignment is preserved. Medial and lateral tibiofemoral joint compartments show maintained spaces. Patellofemoral joint space is preserved.
BONY ARCHITECTURE: Distal femur, proximal tibia, fibula, and patella are intact without acute fracture or dislocation. Cortical margins are smooth with preserved trabecular bone density. No osteophytic spurring or subchondral sclerosis.
SOFT TISSUES: Suprapatellar pouch and surrounding periarticular soft tissues are unremarkable without radiopaque loose bodies or joint effusion.

IMPRESSION:
   ❖ NO ACUTE FRACTURE, DISLOCATION, OR SIGNIFICANT OSTEOARTHRITIC CHANGES DETECTED.
   ❖ NORMAL KNEE RADIOGRAPH.`,
    sections: [
      {
        id: "sec_xrk_joint",
        title: "Alignment & Joint Spaces",
        instructions: "Tibiofemoral & patellofemoral compartments:",
        fields: [
          {
            id: "f_xrk_joint",
            label: "Joint Space Observations",
            type: "textarea",
            defaultValue: "Medial and lateral tibiofemoral compartment spaces are well-preserved. Patellofemoral alignment and joint space are normal without narrowing.",
            placeholder: "Enter joint space findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_xrk_bones",
        title: "Bony Architecture & Soft Tissues",
        instructions: "Cortical margins, fracture lines, soft tissues:",
        fields: [
          {
            id: "f_xrk_bones",
            label: "Bony Architecture Observations",
            type: "textarea",
            defaultValue: "Bones forming the knee joint are intact with no cortical fracture or osteolytic lesion. No significant marginal osteophytes. Periarticular soft tissues are normal without effusion.",
            placeholder: "Enter bony architecture findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_xrk_impression",
        title: "Impression",
        instructions: "X-ray conclusion:",
        fields: [
          {
            id: "f_xrk_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "NO ACUTE OSSEOUS INJURY OR SIGNIFICANT DEGENERATIVE ARTHROPATHY DETECTED. NORMAL KNEE RADIOGRAPH.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },

  // 13. DEXA BONE DENSITOMETRY TEMPLATE
  {
    id: "rad_tpl_dexa_v1",
    testId: "rad_test_dexa_scan",
    testName: "Bone Mineral Densitometry (DEXA Scan)",
    genderTarget: "All",
    version: 1,
    status: "Active",
    uploadedFileName: "DEXA_Bone_Density_Template.pdf",
    uploadedFileType: "pdf",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    createdBy: "Hospital Radiologist",
    rawContent: `DUAL-ENERGY X-RAY ABSORPTIOMETRY (DEXA SCAN)
BONE MINERAL DENSITY REPORT

INDICATION: Postmenopausal osteoporosis evaluation and baseline fracture risk assessment.
TECHNIQUE: Dual-energy X-ray absorptiometry examination performed of the lumbar spine (L1-L4) and left proximal femur (femoral neck, total hip).

FINDINGS:
LUMBAR SPINE (L1-L4):
• Bone Mineral Density: 0.912 g/cm²
• T-Score: -1.6 SD (Osteopenia)
• Z-Score: -0.4 SD

LEFT FEMORAL NECK:
• Bone Mineral Density: 0.745 g/cm²
• T-Score: -1.8 SD (Osteopenia)
• Z-Score: -0.5 SD

TOTAL HIP:
• Bone Mineral Density: 0.820 g/cm²
• T-Score: -1.4 SD (Osteopenia)
• Z-Score: -0.3 SD

IMPRESSION:
   ❖ BONE MINERAL DENSITOMETRY DEMONSTRATES OSTEOPENIA (LOW BONE MASS) IN LUMBAR SPINE AND FEMORAL REGIONS ACCORDING TO WHO DIAGNOSTIC CRITERIA.
   ❖ NO EVIDENCE OF HIGH-GRADE OSTEOPOROSIS OR ACTIVE OSSEOUS COLLAPSE.
   ❖ RECOMMEND ADEQUATE DIETARY CALCIUM, VITAMIN D REPLENISHMENT, WEIGHT-BEARING PHYSICAL EXERCISE, AND CLINICAL CORRELATION.`,
    sections: [
      {
        id: "sec_dexa_spine",
        title: "Lumbar Spine (L1-L4)",
        instructions: "Bone mineral density and T-score:",
        fields: [
          {
            id: "f_dexa_spine",
            label: "Spine BMD Findings",
            type: "textarea",
            defaultValue: "Lumbar Spine (L1-L4): BMD 0.912 g/cm², T-Score: -1.6 SD (Osteopenia), Z-Score: -0.4 SD.",
            placeholder: "Enter lumbar spine BMD findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_dexa_hip",
        title: "Femoral Neck & Total Hip",
        instructions: "Left proximal femur measurements:",
        fields: [
          {
            id: "f_dexa_hip",
            label: "Femur BMD Findings",
            type: "textarea",
            defaultValue: "Left Femoral Neck: BMD 0.745 g/cm², T-Score: -1.8 SD. Total Hip: BMD 0.820 g/cm², T-Score: -1.4 SD.",
            placeholder: "Enter hip BMD findings...",
            required: false,
          },
        ],
      },
      {
        id: "sec_dexa_impression",
        title: "Impression & WHO Classification",
        instructions: "DEXA conclusion and recommendations:",
        fields: [
          {
            id: "f_dexa_impression",
            label: "Diagnostic Impression",
            type: "textarea",
            defaultValue: "BONE MINERAL DENSITOMETRY DEMONSTRATES OSTEOPENIA (LOW BONE MASS) IN LUMBAR SPINE AND HIP REGIONS BY WHO CRITERIA. NO EVIDENCE OF SEVERE OSTEOPOROSIS.",
            placeholder: "Enter diagnostic impression...",
            required: true,
          },
        ],
      },
    ],
  },
]

const STORAGE_KEY_TESTS = "hospai_rad_tests_v1"
const STORAGE_KEY_TEMPLATES = "hospai_rad_templates_v1"
const STORAGE_KEY_REPORTS = "hospai_rad_reports_v1"
const CHANNEL_NAME = "hospai_rad_template_channel"

type Listener = () => void

export class RadiologyTemplateDatabase {
  private static listeners: Set<Listener> = new Set()
  private static channel: BroadcastChannel | null = null
  private static _inMemoryTemplates: RadiologyTemplate[] | null = null
  private static _cachedTemplates: RadiologyTemplate[] | null = null
  private static _cachedReports: RadiologyReportRecord[] | null = null

  public static invalidateCache(): void {
    this._cachedTemplates = null
    this._cachedReports = null
    this._inMemoryTemplates = null
  }

  private static initChannel() {
    if (typeof window === "undefined" || this.channel) return
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = () => {
        this.notifyListeners()
      }
    } catch {
      // Fallback
    }
  }

  public static onUpdate(fn: Listener): () => void {
    this.initChannel()
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private static notifyListeners() {
    this._cachedTemplates = null
    this._cachedReports = null
    this.listeners.forEach((fn) => fn())
    try {
      this.channel?.postMessage("update")
    } catch {}
  }

  private static load<T>(key: string, defaultValue: T): T {
    try {
      const saved = localStorage.getItem(key)
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn(`Error reading ${key} from localStorage`, e)
    }
    return defaultValue
  }

  private static save<T>(key: string, data: T): void {
    if (key === STORAGE_KEY_TEMPLATES) {
      this._cachedTemplates = null
      if (Array.isArray(data)) {
        this._inMemoryTemplates = [...(data as RadiologyTemplate[])]
      }
    }
    if (key === STORAGE_KEY_REPORTS) {
      this._cachedReports = null
    }

    const saved = safeLocalStorageSetItem(key, JSON.stringify(data))
    this.notifyListeners()

    if (!saved && key === STORAGE_KEY_TEMPLATES && Array.isArray(data)) {
      try {
        const pruned = (data as RadiologyTemplate[]).map((t, idx, arr) => {
          const isLatest = idx === arr.length - 1
          const fileUrl = t.originalFileDataUrl || ""
          if (fileUrl.length > 50000 && !isLatest) {
            return {
              ...t,
              originalFileDataUrl: "",
              uploadedFileUrl: "",
              reconstructedDocument: t.reconstructedDocument
                ? { ...t.reconstructedDocument, originalFileDataUrl: "" }
                : undefined,
              originalExtractionSnapshot: undefined,
            }
          }
          if (fileUrl.length > 300000 && isLatest) {
            return {
              ...t,
              uploadedFileUrl: "",
              originalExtractionSnapshot: undefined,
            }
          }
          return t
        })
        safeLocalStorageSetItem(key, JSON.stringify(pruned))
        this.notifyListeners()
      } catch (err) {
        console.warn("Template pruning error:", err)
      }
    }
  }

  // --- TESTS MANAGEMENT ---

  public static getTests(): RadiologyTest[] {
    let tests: RadiologyTest[] = []
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_TESTS)
      if (raw === null) {
        this.save(STORAGE_KEY_TESTS, DEFAULT_TESTS)
        return DEFAULT_TESTS
      }
      try {
        tests = JSON.parse(raw)
      } catch {
        tests = DEFAULT_TESTS
      }
    } else {
      tests = this.load<RadiologyTest[]>(STORAGE_KEY_TESTS, DEFAULT_TESTS)
    }

    let modified = false
    DEFAULT_TESTS.forEach((defTest) => {
      const existingIdx = tests.findIndex(
        (t) => t.id === defTest.id || t.name.toLowerCase() === defTest.name.toLowerCase()
      )
      if (existingIdx < 0) {
        tests.push(defTest)
        modified = true
      }
    })

    if (modified && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_TESTS, JSON.stringify(tests))
      } catch {}
    }

    return tests
  }

  public static getTestById(id: string): RadiologyTest | undefined {
    return this.getTests().find((t) => t.id === id)
  }

  public static getTestByName(name: string): RadiologyTest | undefined {
    if (!name) return undefined
    const normalized = name.trim().toLowerCase()
    const tests = this.getTests()
    const exact = tests.find((t) => t.name.trim().toLowerCase() === normalized)
    if (exact) return exact
    return tests.find((t) => {
      const tName = t.name.trim().toLowerCase()
      return tName.includes(normalized) || normalized.includes(tName) || areTestsMatching(tName, normalized)
    })
  }

  public static saveTest(testData: Partial<RadiologyTest> & { name: string }): RadiologyTest {
    const tests = this.getTests()
    const now = new Date().toISOString()
    const existingIndex = testData.id
      ? tests.findIndex((t) => t.id === testData.id)
      : tests.findIndex((t) => t.name.trim().toLowerCase() === testData.name.trim().toLowerCase() || areTestsMatching(t.name, testData.name))

    if (existingIndex >= 0) {
      const updated: RadiologyTest = {
        ...tests[existingIndex],
        ...testData,
        updatedAt: now,
      }
      tests[existingIndex] = updated
      this.save(STORAGE_KEY_TESTS, tests)
      return updated
    } else {
      const newTest: RadiologyTest = {
        id: testData.id || `rad_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: testData.name.trim(),
        code: testData.code || `RAD-${testData.category ? testData.category.slice(0, 2).toUpperCase() : "XR"}-${Math.floor(100 + Math.random() * 900)}`,
        category: testData.category || "X-Ray",
        modality:
          testData.category === "CT Scan"
            ? "CT"
            : testData.category === "MRI"
            ? "MR"
            : testData.category === "Ultrasound (USG)"
            ? "US"
            : "XR",
        status: testData.status || "Active",
        activeTemplateId: testData.activeTemplateId,
        createdAt: now,
        updatedAt: now,
      }
      tests.push(newTest)
      this.save(STORAGE_KEY_TESTS, tests)
      return newTest
    }
  }

  public static deleteTest(id: string): void {
    const tests = this.getTests().filter((t) => t.id !== id)
    this.save(STORAGE_KEY_TESTS, tests)
  }

  // --- TEMPLATES MANAGEMENT ---

  public static getTemplates(): RadiologyTemplate[] {
    if (this._cachedTemplates && this._cachedTemplates.length > 0) {
      return this._cachedTemplates
    }
    let templates: RadiologyTemplate[] = []
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY_TEMPLATES)
      if (raw === null) {
        if (this._inMemoryTemplates && this._inMemoryTemplates.length > 0) {
          templates = [...this._inMemoryTemplates]
        } else {
          this.save(STORAGE_KEY_TEMPLATES, DEFAULT_TEMPLATES)
          return DEFAULT_TEMPLATES
        }
      } else {
        try {
          templates = JSON.parse(raw)
        } catch {
          templates = this._inMemoryTemplates || DEFAULT_TEMPLATES
        }
      }
    } else {
      templates = this.load<RadiologyTemplate[]>(STORAGE_KEY_TEMPLATES, this._inMemoryTemplates || DEFAULT_TEMPLATES)
    }

    // Merge with in-memory templates so any newly saved templates in memory are NEVER lost
    if (this._inMemoryTemplates && this._inMemoryTemplates.length > 0) {
      this._inMemoryTemplates.forEach((memTpl) => {
        const idx = templates.findIndex((t) => t.id === memTpl.id)
        if (idx < 0) {
          templates.push(memTpl)
        } else {
          if (memTpl.originalFileDataUrl && !templates[idx].originalFileDataUrl) {
            templates[idx].originalFileDataUrl = memTpl.originalFileDataUrl
          }
          if (memTpl.reconstructedDocument && !templates[idx].reconstructedDocument) {
            templates[idx].reconstructedDocument = memTpl.reconstructedDocument
          }
        }
      })
    }

    // Auto-merge any default templates that are missing or whose default template has empty sections
    let modified = false
    DEFAULT_TEMPLATES.forEach((defTpl) => {
      const existingIdx = templates.findIndex((t) => t.id === defTpl.id)
      if (existingIdx < 0) {
        templates.push(defTpl)
        modified = true
      } else {
        const existing = templates[existingIdx]
        if ((!existing.sections || existing.sections.length === 0) && defTpl.sections && defTpl.sections.length > 0) {
          templates[existingIdx] = {
            ...existing,
            sections: defTpl.sections,
            rawContent: existing.rawContent || defTpl.rawContent,
          }
          modified = true
        }
      }
    })

    // Automatically purge only corrupted default mock templates (NEVER purge user-saved or uploaded templates)
    const initialTplCount = templates.length
    const defaultIds = new Set(DEFAULT_TEMPLATES.map((d) => d.id))
    templates = templates.filter((t) => {
      // User-created / imported templates are NEVER purged
      if (!defaultIds.has(t.id)) {
        return true
      }
      if (
        isUnwantedTicketRoutingContent(t.testName) ||
        isUnwantedTicketRoutingContent(t.rawContent) ||
        isUnwantedTicketRoutingContent(t.uploadedFileName) ||
        isUnwantedTicketRoutingContent(t.fullExtractedText)
      ) {
        return false
      }
      return true
    })
    if (templates.length !== initialTplCount) {
      modified = true
    }

    if (modified && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates))
      } catch {}
    }

    this._inMemoryTemplates = templates
    this._cachedTemplates = templates
    return templates
  }

  public static getTemplateById(id: string): RadiologyTemplate | undefined {
    return this.getTemplates().find((tpl) => tpl.id === id)
  }

  public static getTemplatesByTestId(testId: string): RadiologyTemplate[] {
    return this.getTemplates()
      .filter((tpl) => tpl.testId === testId)
      .sort((a, b) => b.version - a.version)
  }

  public static getTemplateForStudy(studyName: string, gender?: string): RadiologyTemplate | undefined {
    return this.getActiveTemplateForTest(studyName, gender)
  }

  public static getActiveTemplateForTest(testIdOrName: string, gender?: string): RadiologyTemplate | undefined {
    if (!testIdOrName) return undefined
    const allTemplates = this.getTemplates()
    if (allTemplates.length === 0) return undefined

    const activeTemplates = allTemplates
      .filter((t) => t.status === "Active")
      .sort((a, b) => (b.version || 0) - (a.version || 0) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

    // First try active templates, then fallback to all templates (e.g. newly saved drafts or inactive custom templates)
    const candidatesList = [activeTemplates, allTemplates]

    const normName = testIdOrName.trim().toLowerCase()
    const normGender = gender ? gender.trim().toLowerCase() : ""

    for (const pool of candidatesList) {
      if (pool.length === 0) continue

      // 0. Direct ID match first
      const byId = pool.find((t) => t.id === testIdOrName || t.testId === testIdOrName)
      if (byId) return byId

      // 1. Exact Test Name or Template Name Match
      const exactMatches = pool.filter(
        (t) =>
          (t.testName && t.testName.toLowerCase() === normName) ||
          (t.templateName && t.templateName.toLowerCase() === normName)
      )
      if (exactMatches.length > 0) {
        if (normGender) {
          const genderExact = exactMatches.find((t) => t.genderTarget && t.genderTarget.toLowerCase() === normGender)
          if (genderExact) return genderExact
        }
        const generalExact = exactMatches.find((t) => !t.genderTarget || t.genderTarget === "All")
        if (generalExact) return generalExact
        return exactMatches[0]
      }

      // 2. Clinical Variant / Synonym Match (areTestsMatching)
      const variantMatches = pool.filter(
        (t) =>
          areTestsMatching(t.testName, normName) ||
          (t.templateName && areTestsMatching(t.templateName, normName))
      )
      if (variantMatches.length > 0) {
        if (normGender) {
          const genderVariant = variantMatches.find((t) => t.genderTarget && t.genderTarget.toLowerCase() === normGender)
          if (genderVariant) return genderVariant
        }
        const generalVariant = variantMatches.find((t) => !t.genderTarget || t.genderTarget === "All")
        if (generalVariant) return generalVariant
        return variantMatches[0]
      }

      // 3. Fallback: Gender-specific matching
      if (normGender) {
        const genderTemplates = pool.filter(
          (t) => t.genderTarget && t.genderTarget.toLowerCase() === normGender
        )

        const directGenderMatch = genderTemplates.find(
          (t) =>
            (t.testName && t.testName.toLowerCase().includes(normName)) ||
            (t.templateName && t.templateName.toLowerCase().includes(normName)) ||
            (normName.length >= 4 && (t.testName || "").toLowerCase().includes(normName)) ||
            (normName.length >= 4 && (t.templateName || "").toLowerCase().includes(normName)) ||
            areTestsMatching(t.testName, normName) ||
            (t.templateName && areTestsMatching(t.templateName, normName))
        )
        if (directGenderMatch) return directGenderMatch
      }

      // 4. Substring or Keyword Fallback (guard with minimum length to avoid matching generic single letters)
      const matchingTemplates = pool.filter((t) => {
        const tLower = (t.testName || "").toLowerCase()
        const tNameLower = (t.templateName || "").toLowerCase()
        if (tLower && (tLower.includes(normName) || (tLower.length >= 4 && normName.includes(tLower)))) {
          return true
        }
        if (tNameLower && (tNameLower.includes(normName) || (tNameLower.length >= 4 && normName.includes(tNameLower)))) {
          return true
        }
        return areTestsMatching(t.testName, normName) || (t.templateName && areTestsMatching(t.templateName, normName))
      })

      if (matchingTemplates.length > 0) {
        const withContent = matchingTemplates.find((t) => t.rawContent && t.rawContent.trim().length > 10)
        if (withContent) return withContent
        return matchingTemplates[0]
      }
    }

    return undefined
  }

  public static saveTemplate(
    testId: string,
    sections: TemplateSection[],
    options?: {
      rawContent?: string
      uploadedFileUrl?: string
      uploadedFileName?: string
      uploadedFileType?: "pdf" | "word" | "image" | "text" | "json"
      genderTarget?: "All" | "Male" | "Female"
      status?: "Active" | "Inactive"
      createdBy?: string
    }
  ): RadiologyTemplate {
    const test = this.getTestById(testId)
    if (!test) {
      throw new Error(`Radiology Test with ID "${testId}" not found.`)
    }

    const templates = this.getTemplates()
    const reports = this.getReports()
    const existingTemplates = templates.filter(
      (t) =>
        t.testId === testId ||
        t.testName.trim().toLowerCase() === test.name.trim().toLowerCase() ||
        areTestsMatching(t.testName, test.name)
    )

    const now = new Date().toISOString()
    let newVersion = 1

    if (existingTemplates.length > 0) {
      const maxVer = Math.max(...existingTemplates.map((t) => t.version || 1))
      newVersion = maxVer + 1
    }

    const currentActive = existingTemplates.find((t) => t.status === "Active")
    const isCurrentInUse = currentActive ? reports.some((r) => r.templateId === currentActive.id) : false

    const templateStatus = options?.status || "Active"
    const targetGender = options?.genderTarget || "All"
    if (templateStatus === "Active") {
      templates.forEach((t) => {
        const matchesTest =
          t.testId === testId ||
          t.testName.trim().toLowerCase() === test.name.trim().toLowerCase() ||
          areTestsMatching(t.testName, test.name)
        if (matchesTest && (t.genderTarget || "All") === targetGender) {
          t.status = isCurrentInUse ? "Archived" : "Inactive"
        }
      })
    }

    const newTemplate: RadiologyTemplate = {
      id: `rad_tpl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      testId: test.id,
      testName: test.name,
      genderTarget: options?.genderTarget || "All",
      version: newVersion,
      status: templateStatus,
      sections,
      rawContent: options?.rawContent,
      uploadedFileUrl: options?.uploadedFileUrl,
      uploadedFileName: options?.uploadedFileName,
      uploadedFileType: options?.uploadedFileType,
      createdAt: now,
      updatedAt: now,
      createdBy: options?.createdBy || "Authorized User",
    }

    templates.push(newTemplate)
    this.save(STORAGE_KEY_TEMPLATES, templates)

    if (templateStatus === "Active") {
      this.saveTest({
        id: test.id,
        name: test.name,
        activeTemplateId: newTemplate.id,
        status: test.status,
      })
    }

    AuditDatabase.logEvent(
      "Radiology Template Created/Updated",
      "Radiology",
      `Created template version ${newVersion} for test "${test.name}".`,
      "Success"
    )

    return newTemplate
  }

  public static toggleTemplateStatus(templateId: string): RadiologyTemplate {
    const templates = this.getTemplates()
    const tplIndex = templates.findIndex((t) => t.id === templateId)
    if (tplIndex < 0) {
      throw new Error("Template not found.")
    }

    const target = templates[tplIndex]
    const nextStatus = target.status === "Active" ? "Inactive" : "Active"
    target.status = nextStatus
    target.updatedAt = new Date().toISOString()

    if (nextStatus === "Active") {
      templates.forEach((t) => {
        if (t.testId === target.testId && t.id !== target.id) {
          t.status = "Inactive"
        }
      })
      const test = this.getTestById(target.testId)
      if (test) {
        this.saveTest({
          id: test.id,
          name: test.name,
          activeTemplateId: target.id,
          status: "Active",
        })
      }
    }

    this.save(STORAGE_KEY_TEMPLATES, templates)

    AuditDatabase.logEvent(
      "Radiology Template Status Changed",
      "Radiology",
      `Changed template status for "${target.testName}" (v${target.version}) to ${nextStatus}.`,
      "Success"
    )

    return target
  }

  public static deleteTemplate(templateId: string): void {
    const templates = this.getTemplates().filter((t) => t.id !== templateId)
    this.save(STORAGE_KEY_TEMPLATES, templates)
    AuditDatabase.logEvent(
      "Radiology Template Deleted",
      "Radiology",
      `Deleted radiology report template ID ${templateId}.`,
      "Success"
    )
  }

  // --- RECONSTRUCTED TEMPLATE IMPORTER & CLINICAL GOVERNANCE ---

  /**
   * Validates if a user role is authorized to approve clinical production templates.
   * Technicians may upload and correct layouts, but only authorized clinical personnel
   * (Radiologists, Consultants, Specialists, HODs, Doctors, Admins) may approve.
   */
  public static canUserApproveTemplate(userRole: string): boolean {
    if (!userRole) return false
    const lower = userRole.toLowerCase().trim()
    const authorizedKeywords = [
      "radiologist",
      "specialist",
      "consultant",
      "hod",
      "head of department",
      "chief",
      "doctor",
      "admin",
      "director",
    ]
    return authorizedKeywords.some((keyword) => lower.includes(keyword))
  }

  /**
   * Saves an uploaded & reconstructed report template as a Draft or Pending Review.
   * An uploaded template NEVER becomes an approved active template automatically.
   * Preserves the exact original source file alongside the editable reconstructed elements.
   */
  public static saveImportedTemplateDraft(params: {
    templateId?: string
    templateName: string
    testName: string
    testId?: string
    examinationCode?: string
    modality?: string
    bodyPart?: string
    templateType?: string
    description?: string
    variantProtocol?: string
    facilityApplicability?: string
    genderTarget?: "All" | "Male" | "Female"
    reconstructedDocument: ReconstructedDocument
    originalFileDataUrl: string
    originalFileName: string
    originalFileType: string
    originalFileSize: number
    submitForReview?: boolean
    createdBy?: string
    status?: "Active" | "Inactive" | "Draft" | string
    notes?: string
  }): RadiologyTemplate {
    const templates = this.getTemplates()
    const now = new Date().toISOString()

    // 1. Resolve or create matching examination in catalog without duplicating
    let targetTest: RadiologyTest | undefined
    if (params.testId) {
      targetTest = this.getTestById(params.testId)
    }
    if (!targetTest) {
      targetTest = this.getTestByName(params.testName)
    }
    if (!targetTest) {
      targetTest = this.saveTest({
        id: params.testId,
        name: params.testName.trim(),
        code: params.examinationCode || `RAD-${(params.modality || "XR").toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
        category:
          params.modality === "CT" || params.modality === "CT Scan"
            ? "CT Scan"
            : params.modality === "MR" || params.modality === "MRI"
            ? "MRI"
            : params.modality === "US" || params.modality === "Ultrasound (USG)"
            ? "Ultrasound (USG)"
            : (params.modality as any) || "X-Ray",
        modality: (params.modality as any) || "XR",
        status: "Active",
      })
    }

    // 2. Compute Version
    const existingForTest = templates.filter(
      (t) => t.testId === targetTest?.id || areTestsMatching(t.testName, targetTest?.name || "")
    )
    let version = 1
    if (existingForTest.length > 0) {
      const maxVer = Math.max(...existingForTest.map((t) => t.version || 1))
      version = maxVer + 1
    }

    // 3. Extract structured sections from reconstructed document text
    const fullText =
      params.reconstructedDocument?.fullExtractedText ||
      (params.reconstructedDocument ? getDocumentFullText(params.reconstructedDocument) : "") ||
      params.testName
    const parsedSections = parseSectionsFromContent(fullText)
    const fallbackSections: TemplateSection[] =
      parsedSections.length > 0
        ? parsedSections
        : [
            {
              id: "sec_findings",
              title: "Diagnostic Findings",
              instructions: "Extracted and reconstructed from uploaded clinical template.",
              fields: [
                {
                  id: "f_findings",
                  label: "Findings",
                  type: "textarea",
                  defaultValue: fullText,
                  placeholder: "Diagnostic findings...",
                  required: false,
                },
              ],
            },
            {
              id: "sec_impression",
              title: "Impression",
              instructions: "Final diagnostic impression.",
              fields: [
                {
                  id: "f_impression",
                  label: "Impression",
                  type: "textarea",
                  placeholder: "Diagnostic impression...",
                  required: true,
                },
              ],
            },
          ]

    // 4. Create snapshot for restoration if an edit goes wrong (without duplicating heavy data URL)
    const extractionSnapshot = params.reconstructedDocument
      ? JSON.parse(JSON.stringify({ ...params.reconstructedDocument, originalFileDataUrl: "" }))
      : undefined

    const isUpdating = params.templateId && templates.some((t) => t.id === params.templateId)
    const templateId = isUpdating ? params.templateId! : `rad_tpl_reconstructed_${Date.now()}_${Math.floor(Math.random() * 1000)}`

    const templateRecord: RadiologyTemplate = {
      id: templateId,
      testId: targetTest.id,
      testName: targetTest.name,
      templateName: params.templateName || targetTest.name,
      bodyPart: params.bodyPart,
      templateType: params.templateType || "Report Format",
      description: params.description,
      genderTarget: params.genderTarget || "All",
      version: isUpdating ? (templates.find((t) => t.id === params.templateId)?.version || version) : version,
      status: (params as any).status || "Inactive",
      approvalStatus: params.submitForReview ? "Pending Review" : "Draft",
      sections: fallbackSections,
      rawContent: fullText,
      fullExtractedText: fullText,
      completenessReport: params.reconstructedDocument?.completenessReport || ({ status: "Complete" } as any),
      uploadedFileName: params.originalFileName,
      uploadedFileType: params.originalFileType as any,
      uploadedFileUrl: params.originalFileDataUrl,
      originalFileDataUrl: params.originalFileDataUrl, // verbatim original file preserved unchanged
      originalFileSize: params.originalFileSize,
      reconstructedDocument: params.reconstructedDocument,
      originalExtractionSnapshot: extractionSnapshot,
      facilityApplicability: params.facilityApplicability || "All Hospital Facilities",
      variantProtocol: params.variantProtocol,
      examinationCode: params.examinationCode || targetTest.code,
      modality: params.modality || targetTest.modality,
      notes: params.notes,
      createdAt: isUpdating ? (templates.find((t) => t.id === params.templateId)?.createdAt || now) : now,
      updatedAt: now,
      createdBy: params.createdBy || "Radiology Technician",
    }

    if (isUpdating) {
      const idx = templates.findIndex((t) => t.id === params.templateId)
      templates[idx] = templateRecord
    } else {
      templates.push(templateRecord)
    }

    this.save(STORAGE_KEY_TEMPLATES, templates)

    AuditDatabase.logEvent(
      params.submitForReview ? "Radiology Template Submitted for Review" : "Radiology Template Draft Saved",
      "Radiology",
      `Saved reconstructed template "${params.templateName}" (v${templateRecord.version}) for ${targetTest.name} as ${templateRecord.approvalStatus}. Original file preserved unchanged.`,
      "Success"
    )

    return templateRecord
  }

  /**
   * Approves an uploaded template for clinical production use.
   * Only an authorized radiologist or designated department head may approve.
   * Makes the template Active and archives previous versions.
   */
  public static approveTemplate(
    templateId: string,
    approverName: string,
    approverRole: string
  ): RadiologyTemplate {
    if (!this.canUserApproveTemplate(approverRole)) {
      throw new Error(
        `Unauthorized: User role "${approverRole}" is not authorized to approve clinical report templates. Approval is restricted to authorized Radiologists, Specialists, Consultants, and Department Heads.`
      )
    }

    const templates = this.getTemplates()
    const target = templates.find((t) => t.id === templateId)
    if (!target) {
      throw new Error(`Radiology template with ID "${templateId}" not found.`)
    }

    const now = new Date().toISOString()

    // Retire / archive previous active templates for this test
    templates.forEach((t) => {
      if (t.testId === target.testId && t.id !== target.id && t.status === "Active") {
        t.status = "Archived"
      }
    })

    target.status = "Active"
    target.approvalStatus = "Approved"
    target.approvedBy = approverName
    target.approvedAt = now
    target.updatedAt = now

    // Link active template to test
    const test = this.getTestById(target.testId)
    if (test) {
      this.saveTest({
        id: test.id,
        name: test.name,
        activeTemplateId: target.id,
        status: "Active",
      })
    }

    this.save(STORAGE_KEY_TEMPLATES, templates)

    AuditDatabase.logEvent(
      "Radiology Template Approved",
      "Radiology",
      `Template "${target.testName}" (v${target.version}, ID: ${target.id}) approved by ${approverName} (${approverRole}) and activated for clinical reporting.`,
      "Success"
    )

    return target
  }

  /**
   * Restores the original extraction snapshot if an edit goes wrong.
   */
  public static restoreOriginalExtraction(templateId: string): RadiologyTemplate {
    const templates = this.getTemplates()
    const target = templates.find((t) => t.id === templateId)
    if (!target) {
      throw new Error(`Template with ID "${templateId}" not found.`)
    }
    if (!target.originalExtractionSnapshot) {
      throw new Error(`No original extraction snapshot available for template "${templateId}".`)
    }

    target.reconstructedDocument = JSON.parse(JSON.stringify(target.originalExtractionSnapshot))
    target.fullExtractedText = target.reconstructedDocument!.fullExtractedText || getDocumentFullText(target.reconstructedDocument!)
    target.rawContent = target.fullExtractedText
    if (target.reconstructedDocument?.completenessReport) {
      target.completenessReport = target.reconstructedDocument!.completenessReport
    }
    target.updatedAt = new Date().toISOString()

    this.save(STORAGE_KEY_TEMPLATES, templates)

    AuditDatabase.logEvent(
      "Radiology Template Restored to Original Extraction",
      "Radiology",
      `Restored template "${target.testName}" to its original extraction snapshot.`,
      "Success"
    )

    return target
  }

  /**
   * Updates an editable reconstructed template without modifying the original source file.
   */
  public static updateReconstructedTemplate(
    templateId: string,
    updatedDoc: ReconstructedDocument,
    metadata?: Partial<RadiologyTemplate>
  ): RadiologyTemplate {
    const templates = this.getTemplates()
    const target = templates.find((t) => t.id === templateId)
    if (!target) {
      throw new Error(`Template with ID "${templateId}" not found.`)
    }

    target.reconstructedDocument = updatedDoc
    target.fullExtractedText = updatedDoc.fullExtractedText || getDocumentFullText(updatedDoc)
    target.rawContent = target.fullExtractedText
    if (updatedDoc.completenessReport) {
      target.completenessReport = updatedDoc.completenessReport
    }
    target.updatedAt = new Date().toISOString()

    if (metadata) {
      if (metadata.testName) target.testName = metadata.testName
      if (metadata.facilityApplicability) target.facilityApplicability = metadata.facilityApplicability
      if (metadata.variantProtocol) target.variantProtocol = metadata.variantProtocol
      if (metadata.notes) target.notes = metadata.notes
      if (metadata.genderTarget) target.genderTarget = metadata.genderTarget
    }

    this.save(STORAGE_KEY_TEMPLATES, templates)
    return target
  }

  // --- REPORTS PERSISTENCE ---

  public static getReports(): RadiologyReportRecord[] {
    if (this._cachedReports && this._cachedReports.length > 0) {
      return this._cachedReports
    }
    let reports = this.load<RadiologyReportRecord[]>(STORAGE_KEY_REPORTS, [])
    const initialCount = reports.length
    reports = reports.filter((r) => {
      if (
        isUnwantedTicketRoutingContent(r.testName) ||
        isUnwantedTicketRoutingContent(r.uploadedFileName) ||
        isUnwantedTicketRoutingContent(r.fieldValues) ||
        isUnwantedTicketRoutingContent(r.templateStructure)
      ) {
        return false
      }
      return true
    })
    if (reports.length !== initialCount && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(reports))
      } catch {}
    }
    this._cachedReports = reports
    return reports
  }

  public static getReportByStudyId(studyId: string): RadiologyReportRecord | undefined {
    return this.getReports().find((r) => r.studyId === studyId)
  }

  public static clearReportDraft(studyId: string): void {
    const reports = this.getReports().filter((r) => r.studyId !== studyId)
    this.save(STORAGE_KEY_REPORTS, reports)
    try {
      BillingDatabase.updateRadiologyStudy(studyId, {
        reportStatus: "Pending Report" as any,
        findings: [] as any,
        impression: [] as any,
        fieldValues: {} as any,
      })
      if (typeof (BillingDatabase as any).emitUpdate === "function") {
        (BillingDatabase as any).emitUpdate()
      }
      try {
        new BroadcastChannel("hospai_rad_channel").postMessage("updated")
      } catch {}
    } catch {}
    this.notifyListeners()
    AuditDatabase.logEvent(
      "Radiology Report Draft Cleared",
      "Radiology",
      `Cleared report draft for study ${studyId}.`,
      "Success"
    )
  }

  public static initializeReportingRecord(data: {
    studyId: string
    patientName: string
    mrn: string
    umr?: string
    patientId?: string
    examinationId?: string
    encounterId?: string
    referringDoctor?: string
    orderDate?: string
    testId?: string
    testName: string
    templateId?: string
    technicianName?: string
  }): RadiologyReportRecord {
    const reports = this.getReports()
    const targetId = (data.studyId || "").toLowerCase().trim()
    const existingIndex = reports.findIndex(
      (r) =>
        (r.studyId && r.studyId.toLowerCase().trim() === targetId) ||
        (r.testId && r.testId.toLowerCase().trim() === targetId) ||
        (r.examinationId && r.examinationId.toLowerCase().trim() === targetId)
    )
    const now = new Date().toISOString()

    if (existingIndex >= 0) {
      const existing = reports[existingIndex]
      // Preserve existing report state if already finalized or draft saved
      return existing
    }

    const tpl =
      (data.templateId ? this.getTemplateById(data.templateId) : undefined) ||
      this.getActiveTemplateForTest(data.testName) ||
      this.getTemplateForStudy(data.testName)

    const record: RadiologyReportRecord = {
      id: `RAD-RPT-${Math.floor(10000 + Math.random() * 90000)}`,
      studyId: data.studyId,
      patientId: data.patientId || data.umr || data.mrn,
      examinationId: data.examinationId || data.studyId,
      patientName: data.patientName,
      mrn: data.mrn,
      umr: data.umr || data.mrn,
      encounterId: data.encounterId,
      referringDoctor: data.referringDoctor,
      orderedDate: data.orderDate || now,
      testId: data.testId || data.studyId,
      testName: data.testName,
      templateId: tpl?.id || "",
      templateVersion: tpl?.version || 1,
      templateStructure: tpl?.sections || [],
      fieldValues: {},
      technicianSignature: data.technicianName,
      status: "AWAITING_REPORT",
      savedAt: now,
      reconstructedDocumentSnapshot: tpl?.reconstructedDocument
        ? JSON.parse(JSON.stringify(tpl.reconstructedDocument))
        : undefined,
    }

    reports.push(record)
    this.save(STORAGE_KEY_REPORTS, reports)

    try {
      new BroadcastChannel("hospai_rad_channel").postMessage("updated")
    } catch {}

    return record
  }

  public static saveReportDraft(reportData: {
    studyId: string
    patientName: string
    mrn: string
    umr?: string
    encounterId?: string
    referringDoctor?: string
    orderedDate?: string
    testId: string
    testName: string
    templateId: string
    templateVersion: number
    templateStructure: TemplateSection[]
    fieldValues: Record<string, any>
    technicianNotes?: string
    technicianSignature?: string
    radiologistName?: string
    uploadedFileUrl?: string
    uploadedFileName?: string
    uploadedFileType?: string
  }): RadiologyReportRecord {
    const reports = this.getReports()
    const now = new Date().toISOString()
    const existingIndex = reports.findIndex((r) => r.studyId === reportData.studyId)

    const tpl = this.getTemplateById(reportData.templateId) || this.getActiveTemplateForTest(reportData.testName)
    const reconstructedSnapshot = tpl?.reconstructedDocument ? JSON.parse(JSON.stringify(tpl.reconstructedDocument)) : undefined

    const record: RadiologyReportRecord = {
      id: existingIndex >= 0 ? reports[existingIndex].id : `RAD-RPT-${Math.floor(10000 + Math.random() * 90000)}`,
      ...reportData,
      status: "Draft",
      savedAt: now,
      reconstructedDocumentSnapshot: (existingIndex >= 0 && reports[existingIndex].reconstructedDocumentSnapshot) ? reports[existingIndex].reconstructedDocumentSnapshot : reconstructedSnapshot,
    }

    if (existingIndex >= 0) {
      reports[existingIndex] = record
    } else {
      reports.push(record)
    }

    this.save(STORAGE_KEY_REPORTS, reports)

    try {
      BillingDatabase.updateRadiologyStudy(reportData.studyId, {
        status: "Reporting",
        reportStatus: "Draft",
      })
    } catch {}

    AuditDatabase.logEvent(
      "Radiology Report Draft Saved",
      "Radiology",
      `Saved report draft for patient ${reportData.patientName} (${reportData.testName}).`,
      "Success"
    )

    return record
  }

  public static finalizeReport(reportData: {
    studyId: string
    patientName: string
    mrn: string
    umr?: string
    encounterId?: string
    referringDoctor?: string
    orderedDate?: string
    testId: string
    testName: string
    templateId: string
    templateVersion: number
    templateStructure: TemplateSection[]
    fieldValues: Record<string, any>
    technicianNotes?: string
    technicianSignature?: string
    radiologistName?: string
    uploadedFileUrl?: string
    uploadedFileName?: string
    uploadedFileType?: string
  }): RadiologyReportRecord {
    reportData.templateStructure.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.required) {
          const val = reportData.fieldValues[field.id]
          if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
            throw new Error(`Field "${field.label}" in section "${section.title}" is required.`)
          }
        }
      })
    })

    const reports = this.getReports()
    const now = new Date().toISOString()
    const existingIndex = reports.findIndex((r) => r.studyId === reportData.studyId)

    const tpl = this.getTemplateById(reportData.templateId) || this.getActiveTemplateForTest(reportData.testName)
    const reconstructedSnapshot = tpl?.reconstructedDocument ? JSON.parse(JSON.stringify(tpl.reconstructedDocument)) : undefined

    const record: RadiologyReportRecord = {
      id: existingIndex >= 0 ? reports[existingIndex].id : `RAD-RPT-${Math.floor(10000 + Math.random() * 90000)}`,
      ...reportData,
      status: "Final",
      savedAt: now,
      finalizedAt: now,
      reconstructedDocumentSnapshot: (existingIndex >= 0 && reports[existingIndex].reconstructedDocumentSnapshot) ? reports[existingIndex].reconstructedDocumentSnapshot : reconstructedSnapshot,
    }

    if (existingIndex >= 0) {
      reports[existingIndex] = record
    } else {
      reports.push(record)
    }

    this.save(STORAGE_KEY_REPORTS, reports)

    const findingsList: string[] = []
    const impressionList: string[] = []

    reportData.templateStructure.forEach((sec) => {
      sec.fields.forEach((f) => {
        const val = reportData.fieldValues[f.id]
        if (val !== undefined && val !== null && val !== "") {
          const textVal = `${f.label}: ${val}`
          if (sec.title.toLowerCase().includes("impression") || sec.title.toLowerCase().includes("conclusion")) {
            impressionList.push(textVal)
          } else {
            findingsList.push(textVal)
          }
        }
      })
    })

    try {
      BillingDatabase.updateRadiologyStudy(reportData.studyId, {
        status: "Final",
        reportStatus: "Final",
        findings: findingsList.length > 0 ? findingsList : undefined,
        impression: impressionList.length > 0 ? impressionList : undefined,
        radiologist: reportData.radiologistName || "Radiology Specialist",
        signedAt: now,
      })
    } catch (e) {
      console.warn("Error syncing study with BillingDatabase", e)
    }

    AuditDatabase.logEvent(
      "Radiology Report Finalized",
      "Radiology",
      `Finalized radiology report for ${reportData.patientName} (${reportData.testName}) using template v${reportData.templateVersion}.`,
      "Success"
    )

    return record
  }
}

if (typeof window !== "undefined") {
  (window as any).RadiologyTemplateDatabase = RadiologyTemplateDatabase
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).RadiologyTemplateDatabase = RadiologyTemplateDatabase
}
