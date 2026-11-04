// PDFs sent to patients -- bill, discharge summary, EMR report, visit journey,
// lab report. One builder so every document a patient receives carries the
// same header, patient block and footer, and so the same file is what gets
// attached on WhatsApp, linked in an SMS, and downloaded for a hand-off.
//
// Built from the record rather than captured from the screen: a screenshot of a
// modal is a picture of whatever happened to be scrolled into view.

import { getMessagingSettings, type PatientDocument } from "../services/patientMessaging"
import { getBranding, hospitalInitials } from "./branding"

export type DocSection = {
  heading: string
  /** Label / value pairs. */
  rows?: [string, string][]
  table?: { head: string[] ;body: string[][] ;rightAlign?: number[] }
  /** Free text; newlines kept. */
  text?: string
  /** Shown when the section has nothing in it, instead of dropping it. */
  empty?: string
}

export type PatientDocSpec = {
  title: string
  filename: string
  patient: { name: string ;id?: string ;phone?: string ;extra?: [string, string][] }
  sections: DocSection[]
  footnote?: string
}

// The PDF's built-in Helvetica only covers Latin-1, so ₹, arrows and the like
// would come out as garbage.
const pdfSafe = (s: string) =>
  String(s ?? "")
    .replace(/₹\s?/g, "Rs ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→⟶]/g, "->")
    .replace(/[•·]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")

export async function buildPatientPdf(spec: PatientDocSpec): Promise<PatientDocument> {
  // Loaded on demand: ~400 kB that only matters when a document is actually
  // made. Literal specifiers, so Vite can resolve and split them -- a
  // specifier built at runtime reaches the browser as a bare "jspdf" it
  // cannot resolve.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])

  const settings = getMessagingSettings()
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  const width = pageW - margin * 2
  let y = margin
  let lastDrawnPage = 1

  const ensureRoom = (needed: number) => {
    if (y + needed > pageH - 11) {
      doc.addPage()
      y = margin
    }
  }

  // Top Accent Strip
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(margin, y, width, 1.2, "F")
  y += 3.5

  // Letterhead: the hospital (its uploaded logo, if any, and name) on the left,
  // HospAI on the right. The same identity as the printed documents
  // (components/branding/DocumentBranding.tsx).
  const brand = getBranding()
  const right = pageW - margin
  let nameX = margin
  if (brand.hospitalLogo) {
    const lw = Math.min(11 * brand.hospitalLogo.ratio, 36)
    const lh = lw / brand.hospitalLogo.ratio
    try {
      doc.addImage(brand.hospitalLogo.src, "PNG", margin, y + (11 - lh) / 2, lw, lh)
      nameX = margin + lw + 3
    } catch {
      // an unreadable logo must not stop the document
    }
  } else {
    // No logo uploaded yet: the hospital's initials, as on the printed page.
    doc.setFillColor(27, 79, 216)
    doc.roundedRect(margin, y, 11, 11, 2, 2, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(hospitalInitials(brand.hospitalName), margin + 5.5, y + 7.2, { align: "center" })
    nameX = margin + 14
  }

  // Letterhead Right: HospAI and Kalpra Tech brand logos
  // 1. Kalpra Tech block
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  const wKalpra = doc.getTextWidth("Kalpra")
  const wTech = doc.getTextWidth(" Tech")
  const kH = 6.5
  const kW = kH * brand.kalpraMarkRatio
  const kalpraW = kW + 1.2 + wKalpra + wTech
  const kalpraX = right - kalpraW

  // Draw Kalpra Tech
  try {
    doc.addImage(brand.kalpraMark, "PNG", kalpraX, y + 1.5, kW, kH)
  } catch {
    // fallback if image fail
  }
  const kalpraTextX = kalpraX + kW + 1.2
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(176, 32, 48) // Kalpra Red
  doc.text("Kalpra", kalpraTextX, y + 5.2)
  doc.setTextColor(56, 56, 104) // Kalpra Navy
  doc.text(" Tech", kalpraTextX + wKalpra, y + 5.2)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(5.2)
  doc.setTextColor(100, 116, 139)
  doc.text("TECHNOLOGY PLATFORM", kalpraTextX, y + 8.5)

  // Separator line between Kalpra and HospAI
  const sepX = kalpraX - 3
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.line(sepX, y + 1, sepX, y + 9.5)

  // 2. HospAI block
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  const wHosp = doc.getTextWidth("Hosp")
  const wAI = doc.getTextWidth("AI")
  const markH = 8.5
  const markW = markH * brand.hospaiMarkRatio
  const hospaiTextW = Math.max(wHosp + wAI, 18)
  const hospaiTotalW = markW + 1.5 + hospaiTextW
  const markX = sepX - 3 - hospaiTotalW
  const brandTextX = markX + markW + 1.5

  try {
    doc.addImage(brand.hospaiMark, "PNG", markX, y + 1, markW, markH)
  } catch {
    // fallback
  }
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text("Hosp", brandTextX, y + 5.2)
  doc.setTextColor(225, 29, 46)
  doc.text("AI", brandTextX + wHosp, y + 5.2)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(5.2)
  doc.setTextColor(100, 116, 139)
  doc.text("AI-DRIVEN HEALTHCARE", brandTextX, y + 8.5)

  // Hospital name, shrunk to fit beside the HospAI block if it is long.
  const nameRoom = markX - 4 - nameX
  let nameSize = 14
  doc.setFont("helvetica", "bold")
  doc.setFontSize(nameSize)
  while (nameSize > 9 && doc.getTextWidth(pdfSafe(brand.hospitalName.toUpperCase())) > nameRoom) {
    nameSize -= 0.5
    doc.setFontSize(nameSize)
  }
  doc.setTextColor(15, 23, 42)
  doc.text(pdfSafe(brand.hospitalName.toUpperCase()), nameX, y + 4.4)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text(pdfSafe("DEPARTMENT OF CLINICAL SERVICES"), nameX, y + 8.4)
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text(pdfSafe(`Helpline: ${settings.helpline}  |  OP: ${settings.opHours}`), nameX, y + 11.8)
  y += 14.5

  // Divider Rules
  doc.setDrawColor(27, 79, 216)
  doc.setLineWidth(0.6)
  doc.line(margin, y, pageW - margin, y)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.25)
  doc.line(margin, y + 0.6, pageW - margin, y + 0.6)
  y += 4

  // Document Title Bar with background banner
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.25)
  doc.rect(margin, y, width, 7.5, "FD")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  doc.text(pdfSafe(spec.title.toUpperCase()), margin + 3, y + 5)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text(
    pdfSafe(`Issued: ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}  |  CONFIDENTIAL`),
    pageW - margin - 3,
    y + 5,
    { align: "right" },
  )
  y += 10
  lastDrawnPage = doc.getNumberOfPages()

  // Structured Patient Card (4-column balanced grid)
  const patientRows: [string, string][] = [
    ["Patient Name", spec.patient.name],
    ...(spec.patient.id ? ([["Permanent UMR", spec.patient.id]] as [string, string][]) : []),
    ...(spec.patient.phone ? ([["Contact Mobile", spec.patient.phone]] as [string, string][]) : []),
    ...(spec.patient.extra || []),
  ]
  const gridRows: [string, string, string, string][] = []
  for (let i = 0; i < patientRows.length; i += 2) {
    const left = patientRows[i]
    const right = patientRows[i + 1] || ["", ""]
    gridRows.push([left[0], left[1], right[0], right[1]])
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    head: [],
    styles: {
      fontSize: 7.5,
      cellPadding: 1.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 32, fontStyle: "bold", textColor: [71, 85, 105], fillColor: [241, 245, 249] },
      1: { cellWidth: (width - 64) / 2, fontStyle: "normal", textColor: [15, 23, 42], fillColor: [255, 255, 255] },
      2: { cellWidth: 32, fontStyle: "bold", textColor: [71, 85, 105], fillColor: [241, 245, 249] },
      3: { cellWidth: (width - 64) / 2, fontStyle: "normal", textColor: [15, 23, 42], fillColor: [255, 255, 255] },
    },
    body: gridRows.map((r) => [pdfSafe(r[0]), pdfSafe(r[1]), pdfSafe(r[2]), pdfSafe(r[3])]),
  })
  y = (doc as any).lastAutoTable.finalY + 3
  lastDrawnPage = doc.getNumberOfPages()

  for (const section of spec.sections) {
    const hasContent =
      (section.rows && section.rows.length > 0) ||
      (section.table && section.table.body.length > 0) ||
      (section.text && section.text.trim())
    if (!hasContent && !section.empty) continue

    ensureRoom(12)
    // Left blue accent indicator and section title
    doc.setFillColor(27, 79, 216)
    doc.rect(margin, y + 0.8, 2, 4, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(15, 23, 42)
    doc.text(pdfSafe(section.heading.toUpperCase()), margin + 3.5, y + 4)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.line(margin + 3.5, y + 5.5, pageW - margin, y + 5.5)
    y += 5.5
    lastDrawnPage = doc.getNumberOfPages()

    if (!hasContent) {
      doc.setFont("helvetica", "italic")
      doc.setFontSize(7.5)
      doc.setTextColor(100, 116, 139)
      doc.text(pdfSafe(section.empty!), margin + 3.5, y + 2.5)
      y += 4
      lastDrawnPage = doc.getNumberOfPages()
      continue
    }

    if (section.rows && section.rows.length) {
      const rowsGrid: [string, string, string, string][] = []
      for (let i = 0; i < section.rows.length; i += 2) {
        const left = section.rows[i]
        const right = section.rows[i + 1] || ["", ""]
        rowsGrid.push([left[0], left[1], right[0], right[1]])
      }
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: "grid",
        styles: {
          fontSize: 7.5,
          cellPadding: 1.2,
          textColor: [15, 23, 42],
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
        },
        columnStyles: {
          0: { cellWidth: 36, fontStyle: "bold", textColor: [71, 85, 105], fillColor: [248, 250, 252] },
          1: { cellWidth: (width - 72) / 2, fontStyle: "normal", textColor: [15, 23, 42], fillColor: [255, 255, 255] },
          2: { cellWidth: 36, fontStyle: "bold", textColor: [71, 85, 105], fillColor: [248, 250, 252] },
          3: { cellWidth: (width - 72) / 2, fontStyle: "normal", textColor: [15, 23, 42], fillColor: [255, 255, 255] },
        },
        body: rowsGrid.map((r) => [pdfSafe(r[0]), pdfSafe(r[1]), pdfSafe(r[2]), pdfSafe(r[3])]),
      })
      y = (doc as any).lastAutoTable.finalY + 2.5
      lastDrawnPage = doc.getNumberOfPages()
    }

    if (section.table && section.table.body.length) {
      const right = new Set(section.table.rightAlign || [])
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: "grid",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7.5,
          cellPadding: 1.2,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 1.1,
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
          textColor: [15, 23, 42],
        },
        columnStyles: Object.fromEntries([...right].map((i) => [i, { halign: "right" }])),
        head: [section.table.head.map(pdfSafe)],
        body: section.table.body.map((r) => r.map(pdfSafe)),
      })
      y = (doc as any).lastAutoTable.finalY + 2.5
      lastDrawnPage = doc.getNumberOfPages()
    }

    if (section.text && section.text.trim()) {
      const lines: string[] = doc.splitTextToSize(pdfSafe(section.text.trim()), width - 6)
      const boxHeight = lines.length * 3.4 + 2.5
      ensureRoom(boxHeight + 1)
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.2)
      doc.rect(margin, y, width, boxHeight, "FD")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(30, 41, 59)
      let textY = y + 3.2
      for (const line of lines) {
        doc.text(line, margin + 3, textY)
        textY += 3.4
      }
      y += boxHeight + 2.5
      lastDrawnPage = doc.getNumberOfPages()
    }
  }

  // Medical Stamp & Signature Block (ensure it fits on page 1 if room allows)
  if (doc.getNumberOfPages() === 1 && y + 13 <= pageH - 10) {
    // Fits cleanly on current page
  } else {
    ensureRoom(14)
  }

  const signY = y + 1
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)

  // Left box: Electronic Verification
  doc.rect(margin, signY, (width - 4) / 2, 12.5, "S")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(71, 85, 105)
  doc.text(pdfSafe("ELECTRONIC VERIFICATION RECORD"), margin + 2.5, signY + 3.2)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6)
  doc.setTextColor(100, 116, 139)
  doc.text(pdfSafe("Digitally authenticated from Hospital Information System."), margin + 2.5, signY + 6.2)
  doc.text(pdfSafe(`Audit Ref: OP-${new Date().getTime().toString(36).toUpperCase()} · ${new Date().toLocaleString("en-IN")}`), margin + 2.5, signY + 9)
  doc.text(pdfSafe("Certified authentic patient clinical record."), margin + 2.5, signY + 11.5)

  // Right box: Attending Physician Stamp
  const rightX = margin + (width - 4) / 2 + 4
  doc.rect(rightX, signY, (width - 4) / 2, 12.5, "S")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(71, 85, 105)
  doc.text(pdfSafe("ATTENDING PHYSICIAN / CLINICAL DESK"), rightX + 2.5, signY + 3.2)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(rightX + 3, signY + 8.5, rightX + (width - 4) / 2 - 3, signY + 8.5)
  doc.setLineDashPattern([], 0)
  doc.setFont("helvetica", "italic")
  doc.setFontSize(6)
  doc.setTextColor(148, 163, 184)
  doc.text(pdfSafe("Authorized Signatory & Medical Stamp · NABH Care"), rightX + 2.5, signY + 11.5)
  y = signY + 14
  lastDrawnPage = doc.getNumberOfPages()

  // Prune any empty trailing pages that may have been generated inadvertently
  while (doc.getNumberOfPages() > lastDrawnPage && doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages())
  }

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(
      pdfSafe(
        spec.footnote ||
          `Issued by ${settings.hospitalName}. Confidential medical record. For queries call ${settings.helpline}.`,
      ),
      margin,
      pageH - 6,
      { maxWidth: width - 70 },
    )
    doc.setFont("helvetica", "bold")
    const pageLabel = `Page ${i} of ${pages}`
    doc.text(pageLabel, right, pageH - 6, { align: "right" })

    // "Powered by [mark] Kalpra Tech", to the left of the page number.
    let px = right - doc.getTextWidth(pageLabel) - 5
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    const wTech = doc.getTextWidth(" Tech")
    const wKalpra = doc.getTextWidth("Kalpra")
    px -= wTech
    doc.setTextColor(56, 56, 104)
    doc.text(" Tech", px, pageH - 6)
    px -= wKalpra
    doc.setTextColor(176, 32, 48)
    doc.text("Kalpra", px, pageH - 6)
    const kH = 3.4
    const kW = kH * brand.kalpraMarkRatio
    px -= kW + 0.8
    doc.addImage(brand.kalpraMark, "PNG", px, pageH - 6 - kH + 0.6, kW, kH)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(148, 163, 184)
    px -= 0.8
    doc.text("Powered by", px, pageH - 6, { align: "right" })
    doc.setTextColor(100, 116, 139)
  }

  const dataUri: string = doc.output("datauristring")
  return {
    title: spec.title,
    filename: spec.filename,
    base64: dataUri.slice(dataUri.indexOf(",") + 1),
  }
}

/** Saves the PDF to the user's machine -- for attaching by hand. */
export function downloadPatientDocument(document_: PatientDocument) {
  const bytes = Uint8Array.from(atob(document_.base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
  const a = document.createElement("a")
  a.href = url
  a.download = document_.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** "Ravi Kumar" + "Bill INV-1" -> "ravi-kumar-bill-inv-1.pdf" */
export function documentFilename(...parts: (string | undefined)[]): string {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return `${slug || "document"}.pdf`
}
