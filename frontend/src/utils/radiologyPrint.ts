import { RadiologyStudyRecord } from "../services/billingDb"
import { ReconstructedDocument } from "../services/templateExtractionService"
import { substitutePlaceholders, PatientReportContext } from "../components/radiology/ReconstructedReportRenderer"

export interface ImagingCatalogItemMinimal {
  study: string
  indication?: string
  technique?: string
  defaultFindings?: string[]
  defaultImpression?: string[]
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function renderReconstructedDocToHtml(
  doc: ReconstructedDocument,
  context: PatientReportContext
): string {
  const pagesHtml = doc.pages
    .map((page, pIdx) => {
      const elementsHtml = page.elements
        .map((el) => {
          const raw = el.content || ""
          const text = escapeHtml(substitutePlaceholders(raw, context))
          const fontSize = el.fontSize || 10
          const weight = el.fontWeight || "normal"
          const fontStyle = el.fontStyle || "normal"
          const align = el.textAlign || "left"
          const color = el.color || "#0f172a"
          const marginTop = el.marginTop ?? 2
          const marginBottom = el.marginBottom ?? 3

          if (el.type === "heading") {
            return `<div style="font-size: ${fontSize}pt; font-weight: ${weight}; text-align: ${align}; color: ${color}; text-transform: uppercase; margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px; line-height: 1.35;">${text}</div>`
          }

          if (el.type === "divider") {
            return `<div style="margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px;"><hr style="border: 0; border-top: ${el.border || '1.5px solid #cbd5e1'}; margin: 0;" /></div>`
          }

          if (el.type === "image" && el.src) {
            const alignClass = align === "center" ? "text-align: center;" : align === "right" ? "text-align: right;" : "text-align: left;"
            const imgWidth = el.width ? (typeof el.width === "number" ? `${el.width}px` : el.width) : "140px"
            return `<div style="${alignClass} margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px;"><img src="${el.src}" alt="${el.alt || 'Logo'}" style="max-width: 100%; width: ${imgWidth}; height: auto;" /></div>`
          }

          if (el.type === "table" && el.tableData) {
            const borderStyle = el.tableData.borderStyle || "1px solid #cbd5e1"
            const headerCount = el.tableData.headerRowCount || 1
            const rows = (el.tableData.rows || [])
              .map((row, rIdx) => {
                const isHeader = rIdx < headerCount
                const cells = (row.cells || [])
                  .map((cell) => {
                    const cellText = escapeHtml(substitutePlaceholders(cell.content, context))
                    return `<td colspan="${cell.colSpan || 1}" rowspan="${cell.rowSpan || 1}" style="border: ${cell.border || borderStyle}; padding: 4px 6px; text-align: ${cell.align || 'left'}; font-weight: ${cell.bold || isHeader ? 'bold' : 'normal'}; font-style: ${cell.italic ? 'italic' : 'normal'}; background-color: ${cell.backgroundColor || (isHeader ? '#f8fafc' : '#ffffff')}; color: ${cell.color || '#0f172a'}; font-size: 8.5pt; vertical-align: top;">${cellText}</td>`
                  })
                  .join("")
                return `<tr style="background-color: ${isHeader ? '#f8fafc' : '#ffffff'};">${cells}</tr>`
              })
              .join("")
            return `<div style="margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px; overflow-x: auto;"><table style="width: 100%; border-collapse: collapse; border: ${borderStyle};">${rows}</table></div>`
          }

          return `<div style="font-size: ${fontSize}pt; font-weight: ${weight}; font-style: ${fontStyle}; text-align: ${align}; color: ${color}; line-height: 1.5; margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px; white-space: pre-wrap;">${text}</div>`
        })
        .join("")

      return `
        <div class="page" style="width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto; background: #ffffff; box-sizing: border-box; page-break-after: always; position: relative;">
          ${elementsHtml}
          <div style="position: absolute; bottom: 10mm; left: 16mm; right: 16mm; font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; font-family: monospace;">
            <span>HMS Radiodiagnosis & Imaging Services • Official Diagnostic Report</span>
            <span>Page ${pIdx + 1} of ${doc.pageCount}</span>
          </div>
        </div>
      `
    })
    .join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Radiology Diagnostic Report - ${escapeHtml(context.study || "Report")}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body {
        margin: 0;
      }
      .page {
        margin: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`
}

export function printRadiologyDocument(
  study: RadiologyStudyRecord,
  defaultCatalog?: ImagingCatalogItemMinimal[],
  reconstructedDoc?: ReconstructedDocument
): void {
  // If reconstructed document layout is supplied, print faithful reconstructed layout
  if (reconstructedDoc) {
    const findingsStr = study.findings && study.findings.length > 0
      ? (Array.isArray(study.findings) ? study.findings.join("\n") : String(study.findings))
      : ""
    const impressionStr = study.impression && study.impression.length > 0
      ? (Array.isArray(study.impression) ? study.impression.join("\n") : String(study.impression))
      : ""

    const context: PatientReportContext = {
      patientName: study.patient,
      mrn: study.mrn,
      umr: study.umr,
      study: study.study,
      modality: study.modality,
      indication: study.indication,
      technique: study.technique,
      comparison: study.comparison,
      findings: findingsStr,
      impression: impressionStr,
      radiologist: study.radiologist || "Consultant Radiologist",
      referringDoctor: study.provider,
      date: study.signedAt || study.finalizedAt || study.ordered || new Date().toLocaleDateString("en-IN"),
      accessionNo: study.accessionNo,
      billingStatus: study.paymentStatus || "Settled",
    }

    const html = renderReconstructedDocToHtml(reconstructedDoc, context)

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
    return
  }

  const catalogMatch = defaultCatalog?.find((c) => c.study === study.study)
  
  const findingsRaw = study.findings && study.findings.length > 0
    ? (Array.isArray(study.findings) ? study.findings.join("\n") : String(study.findings))
    : (catalogMatch?.defaultFindings?.join("\n") || "No abnormal focal parenchymal lesions, acute fracture, or acute soft tissue abnormalities identified on routine review.")

  const impressionRaw = study.impression && study.impression.length > 0
    ? (Array.isArray(study.impression) ? study.impression.join("\n") : String(study.impression))
    : (catalogMatch?.defaultImpression?.join("\n") || "1. Diagnostic imaging study completed. No acute emergency intervention indicated.\n2. Correlate with clinical laboratory and physical evaluation.")

  const patientName = escapeHtml(study.patient || "Patient")
  const accessionNo = escapeHtml(study.accessionNo || `RAD-ACC-${study.mrn || "8801"}`)
  const umr = escapeHtml(study.umr || `PAT-${study.mrn}`)
  const encounterId = escapeHtml(study.encounterId || `ENC-${study.mrn}`)
  const referringDoc = escapeHtml(study.provider || "Attending Physician")
  const department = escapeHtml(study.department || "Radiology & Imaging Services")
  const billingStatus = escapeHtml(`${study.paymentStatus || "Paid"} (₹${study.price || 0})`)
  const receiptRef = escapeHtml(study.paidReceiptNo || study.digitalReceiptRef || "RCPT-2026-8331")
  const studyTitle = escapeHtml(study.study || "Diagnostic Imaging Study")
  const modality = escapeHtml(study.modality || "XR")
  const suite = escapeHtml(study.room || "Suite 1")
  const digitalLink = escapeHtml(study.digitalStudyUrl ? "Attached" : `PACS://${study.accessionNo || "RAD-8801"}`)
  const indication = escapeHtml(study.indication || catalogMatch?.indication || "Clinical indication not specified.")
  const technique = escapeHtml(study.technique || catalogMatch?.technique || "Standard diagnostic protocol.")
  const dateStr = escapeHtml(study.signedAt || study.finalizedAt || study.ordered || new Date().toLocaleDateString("en-IN"))
  const statusStr = escapeHtml((study.status || study.reportStatus || "FINAL").toUpperCase())
  const techNotes = escapeHtml(study.technicianNotes || "Diagnostic imaging scan performed per protocol. DICOM images ingested into PACS.")
  const techName = escapeHtml(study.technician || "Radiology Technologist")
  const techSig = escapeHtml(study.technicianSignature || `TECH-SIG-${study.mrn || "88012"}`)
  const radName = escapeHtml(study.radiologist || "Dr. Laura Kim, MD · Consultant Radiologist")

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
      font-size: 9pt;
      font-weight: 700;
      color: #4338ca;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .brand-meta {
      font-size: 7.5pt;
      color: #64748b;
      margin-top: 2px;
    }
    .header-right {
      text-align: right;
    }
    .accession-pill {
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
      font-size: 9pt;
      background: #f1f5f9;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      padding: 3px 8px;
      border-radius: 3px;
    }
    .header-date {
      font-size: 8pt;
      color: #475569;
      margin-top: 3px;
      font-weight: 600;
    }
    .status-badge {
      display: inline-block;
      margin-top: 3px;
      font-size: 8pt;
      font-weight: 800;
      color: #166534;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 1px 6px;
      border-radius: 2px;
      text-transform: uppercase;
    }
    .demo-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 8.5pt;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .demo-table td {
      padding: 5px 10px;
      vertical-align: top;
      border-bottom: 1px solid #e2e8f0;
      width: 50%;
    }
    .demo-table td:first-child {
      border-right: 1px solid #e2e8f0;
    }
    .study-banner {
      background: #f8fafc;
      border-left: 4px solid #1e293b;
      border-top: 1px solid #cbd5e1;
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      padding: 8px 12px;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .study-heading {
      font-size: 11pt;
      font-weight: 800;
      color: #020617;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .study-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      font-size: 8pt;
      color: #334155;
      margin-bottom: 4px;
    }
    .study-detail {
      font-size: 8pt;
      color: #334155;
      margin-top: 3px;
    }
    .section-header {
      font-size: 9.5pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 2px;
      margin-top: 10px;
      margin-bottom: 6px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .findings-container {
      font-size: 9pt;
      color: #1e293b;
      white-space: pre-wrap;
      line-height: 1.55;
      background: #ffffff;
      padding: 6px 2px;
      margin-bottom: 10px;
    }
    .impression-container {
      background: #f8fafc;
      border: 1.5px solid #0f172a;
      padding: 10px 12px;
      margin-top: 8px;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .impression-title {
      font-size: 9.5pt;
      font-weight: 800;
      color: #020617;
      text-transform: uppercase;
      margin-bottom: 4px;
      letter-spacing: 0.4px;
    }
    .impression-body {
      font-size: 9.5pt;
      font-weight: 600;
      color: #0f172a;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .tech-box {
      font-size: 8pt;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 6px 10px;
      margin-top: 6px;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signatures-block {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-left, .sig-right {
      width: 45%;
    }
    .sig-right {
      text-align: right;
    }
    .sig-name {
      font-size: 9.5pt;
      font-weight: 800;
      color: #0f172a;
    }
    .sig-role {
      font-size: 8pt;
      font-weight: 600;
      color: #475569;
      margin-top: 1px;
    }
    .sig-reg {
      font-size: 7.5pt;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #64748b;
      margin-top: 2px;
    }
    .disclaimer-text {
      font-size: 7pt;
      color: #94a3b8;
      text-align: center;
      margin-top: 20px;
      border-top: 1px dashed #e2e8f0;
      padding-top: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header-block">
    <div class="brand-left">
      <div class="brand-logo">☢</div>
      <div>
        <h1 class="brand-title">ENTERPRISE HOSPITAL MANAGEMENT SYSTEM</h1>
        <div class="brand-sub">DEPARTMENT OF RADIODIAGNOSIS &amp; IMAGING SERVICES</div>
        <div class="brand-meta">NABL &amp; NABH ACCREDITED TERTIARY CARE FACILITY • TEL: +91 40 2345 6789 • 24x7 RADIOLOGY HELPLINE</div>
      </div>
    </div>
    <div class="header-right">
      <div class="accession-pill">ACC: ${accessionNo}</div>
      <div class="header-date">Date: ${dateStr}</div>
      <div><span class="status-badge">${statusStr}</span></div>
    </div>
  </div>

  <table class="demo-table">
    <tr>
      <td>
        Patient Name: <strong style="font-size: 10pt; color: #020617;">${patientName}</strong>
      </td>
      <td>
        Permanent UMR: <strong style="font-family: monospace;">${umr}</strong>
      </td>
    </tr>
    <tr>
      <td>
        OP / IP / ER No: <strong style="font-family: monospace;">${encounterId}</strong>
      </td>
      <td>
        Modality / Suite: <strong>${modality} (${suite})</strong>
      </td>
    </tr>
    <tr>
      <td>
        Referring Physician: <strong>${referringDoc}</strong>
      </td>
      <td>
        Clinical Department: <strong>${department}</strong>
      </td>
    </tr>
    <tr>
      <td>
        Billing Settlement: <strong>${billingStatus}</strong>
      </td>
      <td>
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
