/**
 * Radiology Template Extraction Comprehensive Test Suite
 *
 * Verifies the reuse and routing of the three existing functions:
 * 1. extractTextFromPdfBuffer (PDF files, all pages, OCR flagging for scanned PDFs)
 * 2. extractTextFromWordBuffer (DOCX and DOC files, tables and paragraph preservation)
 * 3. extractCleanTemplateText (XML, TXT, and JSON files, clean logical structure)
 *
 * And verifies the complete end-to-end workflow in src/components/Radiology.tsx:
 * File Upload → Correct Extraction Function → Complete Extracted Content → Template Mapping → Editable Report → Save
 */

import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"

// Global browser mocks for Node environment
const memoryStore = new Map<string, string>()
if (typeof globalThis.localStorage === "undefined" || !globalThis.localStorage.setItem) {
  globalThis.localStorage = {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => { memoryStore.set(key, String(value)) },
    removeItem: (key: string) => { memoryStore.delete(key) },
    clear: () => { memoryStore.clear() },
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    get length() { return memoryStore.size }
  } as any
}

(globalThis as any).BroadcastChannel = class BroadcastChannel {
  name: string
  onmessage = null
  constructor(name: string) { this.name = name }
  postMessage() {}
  close() {}
  unref() {}
  ref() {}
}

if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = {
    localStorage: globalThis.localStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

import JSZip from "jszip"
import {
  extractTextFromPdfBuffer,
  extractTextFromWordBuffer,
  extractCleanTemplateText,
  parseSectionsFromContent,
  convertHtmlToFormattedText,
  RadiologyTemplateDatabase,
} from "../src/services/radiologyTemplateDb"
import { DiagnosticTariffDatabase } from "../src/services/diagnosticTariffDb"
import { RADIOLOGY_MODALITIES } from "../src/services/radiologyTariffsData"

import {
  processRadiologyTemplateUpload,
  ProcessedTemplateResult,
} from "../src/components/Radiology"

// Helper to create synthetic File objects in Node.js
function createSyntheticFile(
  content: string | Uint8Array,
  fileName: string,
  mimeType: string
): File {
  const blob = new Blob([content as any], { type: mimeType })
  return new File([blob], fileName, { type: mimeType })
}

describe("Radiology Template Extraction — Three Functions Verification", () => {
  beforeEach(() => {
    memoryStore.clear()
  })

  // ── 1. extractCleanTemplateText for XML, TXT, JSON ──
  describe("1. extractCleanTemplateText: XML, JSON, and TXT processing", () => {
    it("processes XML templates, preserving section titles, tables, and observations", () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<template name="Chest Radiograph PA View">
  <heading>CLINICAL INDICATION</heading>
  <p>Chronic productive cough and progressive dyspnea.</p>
  <heading>TECHNIQUE</heading>
  <p>Standard upright posteroanterior digital chest radiograph.</p>
  <section title="DIAGNOSTIC FINDINGS">
    <table>
      <tr><th>Anatomical Region</th><th>Observation</th><th>Status</th></tr>
      <tr><td>Lungs</td><td>Clear bilateral lung fields, no focal consolidation</td><td>Normal</td></tr>
      <tr><td>Heart</td><td>Cardiothoracic ratio within normal limits (&lt; 0.50)</td><td>Normal</td></tr>
      <tr><td>Pleura</td><td>Costophrenic angles are sharp and clear</td><td>Normal</td></tr>
      <tr><td>Bony Thorax</td><td>Intact thoracic cage and symmetrical ribs</td><td>Normal</td></tr>
    </table>
  </section>
  <heading>IMPRESSION</heading>
  <p>1. Normal posteroanterior chest radiograph.</p>
  <p>2. No evidence of acute cardiopulmonary pathology.</p>
</template>`

      const extracted = extractCleanTemplateText("chest_template.xml", xmlContent)

      // Verify headings preserved
      assert.ok(extracted.includes("CLINICAL INDICATION"), "Preserves CLINICAL INDICATION")
      assert.ok(extracted.includes("TECHNIQUE"), "Preserves TECHNIQUE")
      assert.ok(extracted.includes("DIAGNOSTIC FINDINGS"), "Preserves DIAGNOSTIC FINDINGS")
      assert.ok(extracted.includes("IMPRESSION"), "Preserves IMPRESSION")

      // Verify table rows and column headers preserved
      assert.ok(extracted.includes("| Anatomical Region | Observation | Status |"), "Preserves table header")
      assert.ok(extracted.includes("| Lungs | Clear bilateral lung fields, no focal consolidation | Normal |"), "Preserves row 1")
      assert.ok(extracted.includes("| Heart | Cardiothoracic ratio within normal limits (< 0.50) | Normal |"), "Preserves row 2 with entity unescaped")

      // Verify impressions
      assert.ok(extracted.includes("Normal posteroanterior chest radiograph"), "Preserves impression text")
      assert.ok(!extracted.includes("<template>"), "Strips raw XML wrapper tags")
      assert.ok(!extracted.includes("</section>"), "Strips closing tags")
    })

    it("processes JSON templates, preserving structured keys, lists, and tables", () => {
      const jsonContent = JSON.stringify({
        examination: "CT Brain / Head Non-Contrast",
        clinicalIndication: "Severe acute onset headache with dizziness",
        technique: "Axial contiguous thin-slice non-contrast CT brain scanning",
        diagnosticFindings: [
          { structure: "Ventricular System", finding: "Normal size and configuration, symmetric" },
          { structure: "Brain Parenchyma", finding: "No acute intracranial hemorrhage or mass effect" },
          { structure: "Basal Cisterns", finding: "Patent and symmetric" },
          { structure: "Calvarium", finding: "No fracture or destructive osseous lesion" }
        ],
        impression: [
          "1. No acute intracranial hemorrhage or territorial infarction.",
          "2. Age-appropriate brain appearance without mass effect."
        ]
      }, null, 2)

      const extracted = extractCleanTemplateText("ct_head.json", jsonContent)

      assert.ok(extracted.includes("EXAMINATION"), "Preserves EXAMINATION key")
      assert.ok(extracted.includes("CT Brain / Head Non-Contrast"), "Preserves examination name")
      assert.ok(extracted.includes("CLINICAL INDICATION"), "Preserves CLINICAL INDICATION")
      assert.ok(extracted.includes("Severe acute onset headache"), "Preserves indication text")
      assert.ok(extracted.includes("DIAGNOSTIC FINDINGS"), "Preserves DIAGNOSTIC FINDINGS")

      // Verify JSON array of objects was formatted into table
      assert.ok(extracted.includes("| STRUCTURE | FINDING |"), "Formats object array into table headers")
      assert.ok(extracted.includes("Ventricular System"), "Preserves table cell 1")
      assert.ok(extracted.includes("No acute intracranial hemorrhage"), "Preserves table cell 2")

      // Verify list impression
      assert.ok(extracted.includes("IMPRESSION"), "Preserves IMPRESSION key")
      assert.ok(extracted.includes("No acute intracranial hemorrhage or territorial infarction"), "Preserves impression")
    })

    it("processes TXT templates, preserving layout, blank fields, and headings", () => {
      const txtContent = `EXAMINATION: USG WHOLE ABDOMEN & PELVIS

CLINICAL HISTORY:
Abdominal pain in right hypochondrium.

OBSERVATIONS:
LIVER: Normal size (13.8 cm) and homogeneous echo texture. No focal mass lesion.
GALLBLADDER: Well distended, wall thickness 2.5 mm. No calculus or acoustic shadow.
CBD: Normal calibre (4 mm).
PANCREAS: Normal size and parenchymal echogenicity.
SPLEEN: Normal in size (9.2 cm) with uniform echotexture.
KIDNEYS: Both kidneys are normal in size and position. Corticomedullary differentiation is maintained.
  - Right Kidney: 10.2 cm
  - Left Kidney: 10.5 cm
URINARY BLADDER: Adequately distended with smooth margins. No intraluminal lesion.

IMPRESSION:
1. Normal Ultrasound Examination of the Whole Abdomen and Pelvis.
2. No sonographic evidence of cholelithiasis or organomegaly.`

      const extracted = extractCleanTemplateText("usg_abdomen.txt", txtContent)

      assert.ok(extracted.includes("EXAMINATION: USG WHOLE ABDOMEN & PELVIS"), "Preserves exam line")
      assert.ok(extracted.includes("CLINICAL HISTORY:"), "Preserves clinical history")
      assert.ok(extracted.includes("OBSERVATIONS:"), "Preserves observations")
      assert.ok(extracted.includes("LIVER: Normal size (13.8 cm)"), "Preserves liver observation")
      assert.ok(extracted.includes("- Right Kidney: 10.2 cm"), "Preserves kidney measurement bullet")
      assert.ok(extracted.includes("IMPRESSION:"), "Preserves impression section")
    })

    it("supports flexible argument order for extractCleanTemplateText", () => {
      const sampleText = "FINDINGS:\nNormal chest examination.\n\nIMPRESSION:\nNormal study."

      // 1. (fileName, rawText)
      const res1 = extractCleanTemplateText("template.txt", sampleText)
      assert.ok(res1.includes("FINDINGS"), "Works with (fileName, rawText)")

      // 2. (rawText, fileName)
      const res2 = extractCleanTemplateText(sampleText, "template.txt")
      assert.ok(res2.includes("FINDINGS"), "Works with (rawText, fileName)")

      // 3. (rawText) only
      const res3 = extractCleanTemplateText(sampleText)
      assert.ok(res3.includes("FINDINGS"), "Works with (rawText) single argument")
    })
  })

  // ── 2. extractTextFromWordBuffer for DOCX / DOC ──
  describe("2. extractTextFromWordBuffer: Word document processing with tables", () => {
    it("extracts text from DOCX buffer via JSZip fallback, preserving paragraphs and tables", async () => {
      // Build a minimal valid DOCX structure containing word/document.xml with tables and headings
      const zip = new JSZip()
      zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
      zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
      zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>EXAMINATION: MRI CERVICAL SPINE</w:t></w:r></w:p>
    <w:p><w:r><w:t>CLINICAL INDICATION: Neck pain radiating to right upper limb.</w:t></w:r></w:p>
    <w:p><w:r><w:t>FINDINGS:</w:t></w:r></w:p>
    <w:p><w:r><w:t>C2-C3: Normal disc height and contour. No canal stenosis.</w:t></w:r></w:p>
    <w:p><w:r><w:t>C5-C6: Mild posterior disc bulge indenting the ventral thecal sac.</w:t></w:r></w:p>
    <w:p><w:r><w:t>IMPRESSION:</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Mild C5-C6 disc bulge without cord compression.</w:t></w:r></w:p>
  </w:body>
</w:document>`)

      const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" })
      const extracted = await extractTextFromWordBuffer(arrayBuffer, "mri_cervical.docx")

      assert.ok(extracted.length > 20, "Extracts non-empty text")
      assert.ok(extracted.includes("EXAMINATION: MRI CERVICAL SPINE"), "Preserves examination title")
      assert.ok(extracted.includes("CLINICAL INDICATION"), "Preserves clinical indication")
      assert.ok(extracted.includes("C5-C6: Mild posterior disc bulge"), "Preserves findings paragraph")
      assert.ok(extracted.includes("IMPRESSION:"), "Preserves impression")
    })

    it("preserves HTML table structure and cell boundaries cleanly", () => {
      const htmlTable = `
<h2>EXAMINATION: CT CHEST HRCT</h2>
<p><strong>INDICATION:</strong> Cough and fever.</p>
<table>
  <tr><th>Region</th><th>Observation</th><th>Significance</th></tr>
  <tr><td>Right Upper Lobe</td><td>Patchy ground glass opacities</td><td>Mild</td></tr>
  <tr><td>Left Lower Lobe</td><td>Normal parenchymal architecture</td><td>Normal</td></tr>
</table>
<h3>IMPRESSION:</h3>
<p>Mild ground glass opacities suggestive of viral pneumonia.</p>
`
      const formatted = convertHtmlToFormattedText(htmlTable)

      assert.ok(formatted.includes("EXAMINATION: CT CHEST HRCT"), "Preserves heading")
      assert.ok(formatted.includes("| Region | Observation | Significance |"), "Preserves table header row")
      assert.ok(formatted.includes("| Right Upper Lobe | Patchy ground glass opacities | Mild |"), "Preserves table data row 1")
      assert.ok(formatted.includes("| Left Lower Lobe | Normal parenchymal architecture | Normal |"), "Preserves table data row 2")
      assert.ok(formatted.includes("IMPRESSION:"), "Preserves impression heading")
    })

    it("extracts legacy Word .doc text streams while filtering internal OLE metadata", async () => {
      // Create synthetic binary buffer with UTF-16LE text and OLE headers
      const reportText = "EXAMINATION: X-RAY KNEE AP/LATERAL\nFINDINGS:\nNormal joint space.\nIMPRESSION:\nNormal knee radiograph."
      const buffer = new ArrayBuffer(reportText.length * 2 + 32)
      const uint8 = new Uint8Array(buffer)

      // Insert UTF-16LE characters
      for (let i = 0; i < reportText.length; i++) {
        const code = reportText.charCodeAt(i)
        uint8[32 + i * 2] = code & 0xff
        uint8[32 + i * 2 + 1] = (code >> 8) & 0xff
      }

      const extracted = await extractTextFromWordBuffer(buffer, "knee_xray.doc")
      assert.ok(extracted.includes("EXAMINATION: X-RAY KNEE AP/LATERAL") || extracted.includes("FINDINGS:"), "Extracts text from legacy .doc stream")
    })
  })

  // ── 3. extractTextFromPdfBuffer for PDF files ──
  describe("3. extractTextFromPdfBuffer: PDF processing and scanned detection", () => {
    it("extracts text from PDF binary streams with BT...ET operators", async () => {
      const pdfBinary = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 200 >>
stream
BT
/F1 12 Tf
72 712 Td
(EXAMINATION: CHEST PA RADIOGRAPH) Tj
0 -20 Td
(FINDINGS:) Tj
0 -15 Td
(Clear bilateral lung fields without focal consolidation.) Tj
0 -20 Td
(IMPRESSION:) Tj
0 -15 Td
(Normal diagnostic chest examination.) Tj
ET
endstream
endobj
xref
0 5
trailer
<< /Root 1 0 R >>
%%EOF`

      const encoder = new TextEncoder()
      const arrayBuffer = encoder.encode(pdfBinary).buffer

      const extracted = await extractTextFromPdfBuffer(arrayBuffer)
      assert.ok(extracted.includes("EXAMINATION: CHEST PA RADIOGRAPH"), "Extracts examination from PDF stream")
      assert.ok(extracted.includes("FINDINGS:"), "Extracts findings header")
      assert.ok(extracted.includes("Clear bilateral lung fields"), "Extracts finding content")
      assert.ok(extracted.includes("IMPRESSION:"), "Extracts impression")
    })

    it("returns empty string when PDF contains no selectable text (scanned PDF image)", async () => {
      const scannedPdfBinary = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 50 >>
stream
q
100 0 0 100 50 50 cm
/Im1 Do
Q
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`

      const encoder = new TextEncoder()
      const arrayBuffer = encoder.encode(scannedPdfBinary).buffer

      const extracted = await extractTextFromPdfBuffer(arrayBuffer)
      assert.equal(extracted.trim(), "", "Empty string returned for image-only PDF without text layer")
    })
  })

  // ── 4. End-to-End Workflow in Radiology.tsx: processRadiologyTemplateUpload ──
  describe("4. Complete Upload-to-Editing Workflow in Radiology.tsx", () => {
    it("routes PDF files to extractTextFromPdfBuffer and maps structured sections", async () => {
      const pdfContent = `%PDF-1.4
stream
BT
(EXAMINATION: DIGITAL CHEST X-RAY) Tj
(CLINICAL INDICATION: Dyspnea) Tj
(FINDINGS:) Tj
(Normal cardiothoracic ratio. Lungs clear.) Tj
(IMPRESSION:) Tj
(Normal chest examination.) Tj
ET
endstream
%%EOF`
      const file = createSyntheticFile(new TextEncoder().encode(pdfContent), "Chest_PA.pdf", "application/pdf")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, true, "Upload processing succeeds")
      assert.equal(result.fileType, "pdf", "Correctly identified as PDF")
      assert.equal(result.extractionFunctionUsed, "extractTextFromPdfBuffer", "Invoked extractTextFromPdfBuffer")
      assert.ok(result.extractedText.includes("EXAMINATION: DIGITAL CHEST X-RAY"), "Extracted complete text")
      assert.ok(result.sections.length >= 2, "Mapped to structured template sections")
      assert.ok(result.originalFileDataUrl.startsWith("data:"), "Preserves original file Data URL")
      assert.ok(result.template, "Saved template draft into database")

      // Verify reopening from database
      const reloaded = RadiologyTemplateDatabase.getTemplateById(result.template!.id)
      assert.ok(reloaded, "Template exists in database")
      assert.ok(reloaded?.testName.includes("Chest"), "Inferred test name preserved")
      assert.equal(reloaded?.uploadedFileName, "Chest_PA.pdf", "File name preserved")
    })

    it("routes Word (DOCX) files to extractTextFromWordBuffer and preserves tables", async () => {
      const zip = new JSZip()
      zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>EXAMINATION: CT SCAN OF ABDOMEN</w:t></w:r></w:p>
    <w:p><w:r><w:t>FINDINGS:</w:t></w:r></w:p>
    <w:p><w:r><w:t>| Organ | Observation |</w:t></w:r></w:p>
    <w:p><w:r><w:t>| Liver | Normal size and contour without focal mass |</w:t></w:r></w:p>
    <w:p><w:r><w:t>| Spleen | Normal size |</w:t></w:r></w:p>
    <w:p><w:r><w:t>IMPRESSION:</w:t></w:r></w:p>
    <w:p><w:r><w:t>Normal abdominal CT examination.</w:t></w:r></w:p>
  </w:body>
</w:document>`)
      const arrayBuffer = await zip.generateAsync({ type: "uint8array" })
      const file = createSyntheticFile(arrayBuffer, "ct_abdomen.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, true, "Word extraction succeeds")
      assert.equal(result.fileType, "docx", "Identified as DOCX")
      assert.equal(result.extractionFunctionUsed, "extractTextFromWordBuffer", "Invoked extractTextFromWordBuffer")
      assert.ok(result.extractedText.includes("CT SCAN OF ABDOMEN"), "Extracted exam name")
      assert.ok(result.extractedText.includes("| Organ | Observation |"), "Preserved table row in Word")
      assert.ok(result.sections.length >= 2, "Structured sections populated")
    })

    it("routes XML files to extractCleanTemplateText and maps tables and findings", async () => {
      const xml = `<?xml version="1.0"?>
<template>
  <heading>CLINICAL INDICATION</heading>
  <p>Right lower quadrant pain.</p>
  <heading>DIAGNOSTIC FINDINGS</heading>
  <table>
    <tr><th>Structure</th><th>Result</th></tr>
    <tr><td>Appendix</td><td>Normal diameter 4.5 mm, compressible</td></tr>
  </table>
  <heading>IMPRESSION</heading>
  <p>No sonographic evidence of acute appendicitis.</p>
</template>`
      const file = createSyntheticFile(xml, "appendix_usg.xml", "application/xml")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, true, "XML extraction succeeds")
      assert.equal(result.fileType, "xml", "Identified as XML")
      assert.equal(result.extractionFunctionUsed, "extractCleanTemplateText", "Invoked extractCleanTemplateText")
      assert.ok(result.extractedText.includes("CLINICAL INDICATION"), "Extracted indication")
      assert.ok(result.extractedText.includes("| Structure | Result |"), "Table preserved in XML extraction")
      assert.ok(result.extractedText.includes("Appendix"), "Extracted observation")
      assert.ok(result.sections.some(s => s.title.includes("DIAGNOSTIC FINDINGS")), "Mapped to Findings section")
    })

    it("routes JSON files to extractCleanTemplateText and formats structured sections", async () => {
      const json = JSON.stringify({
        examination: "MRI Lumbar Spine",
        technique: "Sagittal T1, T2, and axial T2 images of the lumbosacral spine",
        findings: "Normal lumbar lordosis. Conus medullaris terminates normally at L1 level.",
        impression: "1. No canal stenosis.\n2. Normal study."
      })
      const file = createSyntheticFile(json, "lumbar_mri.json", "application/json")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, true, "JSON extraction succeeds")
      assert.equal(result.fileType, "json", "Identified as JSON")
      assert.equal(result.extractionFunctionUsed, "extractCleanTemplateText", "Invoked extractCleanTemplateText")
      assert.ok(result.extractedText.includes("MRI Lumbar Spine"), "Extracted exam name")
      assert.ok(result.extractedText.includes("TECHNIQUE"), "Extracted technique")
      assert.ok(result.extractedText.includes("FINDINGS"), "Extracted findings")
      assert.ok(result.extractedText.includes("IMPRESSION"), "Extracted impression")
    })

    it("routes TXT files to extractCleanTemplateText and preserves layout and line breaks", async () => {
      const txt = `EXAMINATION: CHEST PA

FINDINGS:
Lungs are clear.
Heart is normal in size.
No pleural effusion.

IMPRESSION:
Normal chest radiograph.`
      const file = createSyntheticFile(txt, "chest_simple.txt", "text/plain")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, true, "TXT extraction succeeds")
      assert.equal(result.fileType, "txt", "Identified as TXT")
      assert.equal(result.extractionFunctionUsed, "extractCleanTemplateText", "Invoked extractCleanTemplateText")
      assert.ok(result.extractedText.includes("Lungs are clear"), "Preserved findings")
      assert.ok(result.sections.some(s => s.title.includes("FINDINGS")), "Mapped to FINDINGS section")
    })

    it("detects empty extraction results and displays a meaningful error without overwriting", async () => {
      const file = createSyntheticFile("", "empty_file.txt", "text/plain")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, false, "Fails gracefully for empty file")
      assert.ok(result.error?.includes("empty (0 bytes)"), "Meaningful error message returned")
      assert.equal(result.sections.length, 0, "No blank sections created")
    })

    it("flags scanned PDFs requiring OCR when no digital text layer can be retrieved", async () => {
      const scannedPdfBinary = `%PDF-1.4
stream
q
100 0 0 100 50 50 cm
/Im1 Do
Q
endstream
%%EOF`
      const file = createSyntheticFile(new TextEncoder().encode(scannedPdfBinary), "scanned_doc.pdf", "application/pdf")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, false, "Scanned PDF identified")
      assert.equal(result.isScanned, true, "isScanned flag is true")
      assert.ok(result.error?.includes("Scanned PDF detected"), "Explicitly flags OCR requirement")
      assert.ok(result.error?.includes("OCR processing"), "Mentions OCR processing required")
      assert.ok(result.originalFileDataUrl.startsWith("data:"), "Original scanned document preserved for review")
    })

    it("rejects unsupported file formats with actionable explanation", async () => {
      const file = createSyntheticFile("BINARY_DATA", "archive.exe", "application/x-msdownload")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, false, "Rejects unsupported format")
      assert.ok(result.error?.includes("Unsupported file format"), "Explains unsupported format")
      assert.ok(result.error?.includes("PDF"), "Lists supported formats")
    })

    it("ensures long multi-section documents are not truncated", async () => {
      const sections = [
        "EXAMINATION: WHOLE BODY CT SURVEY",
        "CLINICAL INDICATION: Polytrauma evaluation after motor vehicle accident.",
        "HEAD AND NECK: No intracranial hemorrhage. Facial bones and cervical spine intact.",
        "CHEST: Clear lung parenchyma bilaterally. No rib fracture, pneumothorax, or hemothorax.",
        "ABDOMEN: Normal enhancement of liver, spleen, kidneys, and pancreas. No intra-abdominal fluid.",
        "PELVIS: Pelvic ring intact. Urinary bladder is distended with normal wall thickness.",
        "EXTREMITIES: Femoral and humeral shafts intact without acute fracture.",
        "IMPRESSION: 1. No evidence of acute traumatic injury on whole body CT survey."
      ]
      const longContent = sections.join("\n\n")
      const file = createSyntheticFile(longContent, "whole_body_ct.txt", "text/plain")

      const result = await processRadiologyTemplateUpload(file, { saveToDatabase: true })

      assert.equal(result.success, true, "Extracts long document")
      assert.ok(result.extractedText.includes("WHOLE BODY CT SURVEY"), "First section present")
      assert.ok(result.extractedText.includes("ABDOMEN:"), "Middle section present")
      assert.ok(result.extractedText.includes("EXTREMITIES:"), "Later section present")
      assert.ok(result.extractedText.includes("IMPRESSION:"), "Final impression present")
      assert.ok(result.sections.length >= 4, "All major clinical sections mapped to editable fields")
    })
  })

  describe("5. Hospital Test Catalogue Mapping & Effortless Saving", () => {
    it("provides the complete hospital catalogue of radiology tests across 11 modalities", () => {
      const tariffs = DiagnosticTariffDatabase.getRadiologyTariffs()
      assert.ok(tariffs.length >= 100, `Expected at least 100 tests in hospital catalogue, got ${tariffs.length}`)

      // Verify key modalities are represented
      const modalitiesFound = new Set(tariffs.map((t) => t.department || t.modality))
      assert.ok(modalitiesFound.has("X-Ray"), "Contains X-Ray tests")
      assert.ok(modalitiesFound.has("CT Scan"), "Contains CT Scan tests")
      assert.ok(modalitiesFound.has("MRI"), "Contains MRI tests")
      assert.ok(modalitiesFound.has("Ultrasound (USG)"), "Contains Ultrasound tests")

      // Verify RADIOLOGY_MODALITIES are strings (fixes the () dropdown bug)
      assert.ok(Array.isArray(RADIOLOGY_MODALITIES), "RADIOLOGY_MODALITIES is an array")
      RADIOLOGY_MODALITIES.forEach((mod) => {
        assert.equal(typeof mod, "string", `Modality "${mod}" must be a string`)
        assert.ok(mod.length > 0, "Modality name is non-empty")
      })
    })

    it("effortlessly links an uploaded template to a catalogue test and activates it", () => {
      const chestPaTest = DiagnosticTariffDatabase.getRadiologyTariffs().find((t) => t.code === "XR-CHEST-PA")
      assert.ok(chestPaTest, "XR-CHEST-PA must exist in hospital catalogue")

      const templateContent = `CHEST PA RADIOGRAPH TEMPLATE\n\nLUNGS & PLEURA: Clear lung fields bilaterally. Costophrenic angles are acute.\nHEART & MEDIASTINUM: Cardiac size is within normal limits. Mediastinal contours unremarkable.\n\nIMPRESSION: NORMAL CHEST RADIOGRAPH.`

      const mockDoc: any = {
        title: "Chest X-Ray PA Template",
        pages: [
          {
            pageNumber: 1,
            widthMm: 210,
            heightMm: 297,
            orientation: "portrait",
            elements: [
              { id: "el_1", type: "text", content: templateContent, fontSize: 10, fontWeight: "normal" }
            ],
            extractedText: templateContent,
            status: "success"
          }
        ],
        originalFileType: "PDF",
        originalFileName: "chest_pa_template.pdf",
        originalFileSize: 2048,
        originalFileDataUrl: "data:application/pdf;base64,JVBERi0xLjQK...",
        pageCount: 1,
        fullExtractedText: templateContent,
      }

      // Save draft linked to the catalogue test
      const savedDraft = RadiologyTemplateDatabase.saveImportedTemplateDraft({
        templateName: "Chest X-Ray PA Hospital Template",
        testName: chestPaTest.name,
        testId: chestPaTest.id,
        examinationCode: chestPaTest.code,
        variantProtocol: chestPaTest.variantProtocol,
        modality: chestPaTest.department,
        reconstructedDocument: mockDoc,
        originalFileDataUrl: mockDoc.originalFileDataUrl,
        originalFileName: mockDoc.originalFileName,
        originalFileType: mockDoc.originalFileType,
        originalFileSize: mockDoc.originalFileSize,
        submitForReview: true,
        createdBy: "Senior Radiographer",
      })

      assert.ok(savedDraft.id, "Saved draft returns valid template ID")
      assert.ok(savedDraft.testName.includes("Chest X-Ray"), "Template linked to test name")
      assert.ok(savedDraft.testId, "Template linked to test id")
      assert.equal(savedDraft.examinationCode, chestPaTest.code, "Template linked to test code")
      assert.equal(savedDraft.approvalStatus, "Pending Review", "Saved as Pending Review")

      // Approve template for clinical production
      const approved = RadiologyTemplateDatabase.approveTemplate(
        savedDraft.id,
        "Dr. Sunita Rao",
        "Senior Radiologist"
      )

      assert.equal(approved.status, "Active", "Template becomes Active")
      assert.equal(approved.approvalStatus, "Approved", "Template is Approved")

      // Verify that Reporting Workspace immediately auto-matches this template for this test
      const resolved = RadiologyTemplateDatabase.getTemplateForStudy(chestPaTest.name)
      assert.ok(resolved, "Template resolved for test by name")
      assert.equal(resolved.id, approved.id, "Resolved template matches the newly approved template")

      const resolvedByStudy = RadiologyTemplateDatabase.getTemplateForStudy("Chest X-Ray PA")
      assert.ok(resolvedByStudy, "Template resolved for 'Chest X-Ray PA'")
      assert.equal(resolvedByStudy.id, approved.id, "Resolved template matches")
    })
  })
})
