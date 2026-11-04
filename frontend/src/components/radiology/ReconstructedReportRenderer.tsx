import React from "react"
import {
  ReconstructedDocument,
  ReconstructedPage,
  ReconstructedElement,
  TableData,
  TableCell,
} from "../../services/templateExtractionService"
import { AlertCircle, CheckSquare, Edit3 } from "lucide-react"

export interface PatientReportContext {
  patientName?: string
  mrn?: string
  umr?: string
  ageGender?: string
  study?: string
  modality?: string
  indication?: string
  technique?: string
  comparison?: string
  findings?: string | string[]
  impression?: string | string[]
  radiologist?: string
  referringDoctor?: string
  date?: string
  accessionNo?: string
  billingStatus?: string
  receiptRef?: string
}

export interface ReconstructedReportRendererProps {
  document: ReconstructedDocument
  currentPageIndex?: number // 0-indexed; if undefined, renders all pages
  patientContext?: PatientReportContext
  isEditable?: boolean
  selectedElementId?: string | null
  onSelectElement?: (element: ReconstructedElement, pageIndex: number) => void
  onUpdateElement?: (updatedElement: ReconstructedElement, pageIndex: number) => void
  zoom?: number // 1 = 100%
  className?: string
  showPageNumbers?: boolean
}

export function substitutePlaceholders(
  text: string,
  context?: PatientReportContext
): string {
  if (!text || !context) return text

  const findingsStr = Array.isArray(context.findings)
    ? context.findings.join("\n")
    : context.findings || ""
  const impressionStr = Array.isArray(context.impression)
    ? context.impression.join("\n")
    : context.impression || ""

  let result = text
    .replace(/\{\{\s*patient_name\s*\}\}/gi, context.patientName || "—")
    .replace(/\{\{\s*mrn\s*\}\}/gi, context.mrn || context.umr || "—")
    .replace(/\{\{\s*umr\s*\}\}/gi, context.umr || context.mrn || "—")
    .replace(/\{\{\s*age_gender\s*\}\}/gi, context.ageGender || "—")
    .replace(/\{\{\s*study\s*\}\}/gi, context.study || "—")
    .replace(/\{\{\s*examination\s*\}\}/gi, context.study || "—")
    .replace(/\{\{\s*modality\s*\}\}/gi, context.modality || "—")
    .replace(/\{\{\s*accession_no\s*\}\}/gi, context.accessionNo || "—")
    .replace(/\{\{\s*referring_doctor\s*\}\}/gi, context.referringDoctor || "—")
    .replace(/\{\{\s*date\s*\}\}/gi, context.date || new Date().toLocaleDateString("en-IN"))
    .replace(/\{\{\s*indication\s*\}\}/gi, context.indication || "Clinical indication not specified.")
    .replace(/\{\{\s*technique\s*\}\}/gi, context.technique || "Standard diagnostic imaging protocol.")
    .replace(/\{\{\s*comparison\s*\}\}/gi, context.comparison || "No prior studies available for comparison.")
    .replace(/\{\{\s*findings\s*\}\}/gi, findingsStr || "No abnormal focal parenchymal lesions, acute fracture, or acute soft tissue abnormalities.")
    .replace(/\{\{\s*impression\s*\}\}/gi, impressionStr || "Diagnostic examination completed without acute emergency intervention indicated.")
    .replace(/\{\{\s*radiologist\s*\}\}/gi, context.radiologist || "Consultant Radiologist")
    .replace(/\{\{\s*billing_status\s*\}\}/gi, context.billingStatus || "Settled")

  return result
}

export default function ReconstructedReportRenderer({
  document,
  currentPageIndex,
  patientContext,
  isEditable = false,
  selectedElementId = null,
  onSelectElement,
  onUpdateElement,
  zoom = 1,
  className = "",
  showPageNumbers = true,
}: ReconstructedReportRendererProps) {
  if (!document || !document.pages || document.pages.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-lg">
        No document pages available to render.
      </div>
    )
  }

  const pagesToRender =
    typeof currentPageIndex === "number" &&
    currentPageIndex >= 0 &&
    currentPageIndex < document.pages.length
      ? [document.pages[currentPageIndex]]
      : document.pages

  const baseScale = zoom

  return (
    <div className={`reconstructed-report-container space-y-6 flex flex-col items-center ${className}`}>
      {pagesToRender.map((page, pIdx) => {
        const actualPageIndex = typeof currentPageIndex === "number" ? currentPageIndex : pIdx
        return (
          <div
            key={page.pageNumber || pIdx}
            className="reconstructed-page relative bg-white border border-slate-300 shadow-md transition-transform duration-100 ease-out origin-top text-slate-900"
            style={{
              width: `${(page.widthMm || 210) * 3.7795275591 * baseScale}px`,
              minHeight: `${(page.heightMm || 297) * 3.7795275591 * baseScale}px`,
              padding: `${(page.marginsMm?.top || 14) * 3.7795275591 * baseScale}px ${(page.marginsMm?.right || 16) * 3.7795275591 * baseScale}px ${(page.marginsMm?.bottom || 14) * 3.7795275591 * baseScale}px ${(page.marginsMm?.left || 16) * 3.7795275591 * baseScale}px`,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
              boxSizing: "border-box",
            }}
          >
            {/* Header running info if multi-page */}
            {document.pageCount > 1 && (
              <div
                className="text-[10px] text-slate-400 flex justify-between pb-2 mb-3 border-b border-slate-100 uppercase tracking-wider font-mono"
                style={{ fontSize: `${8 * baseScale}pt` }}
              >
                <span>{document.title || "Radiology Report"}</span>
                <span>Page {page.pageNumber} of {document.pageCount}</span>
              </div>
            )}

            {/* Elements */}
            <div className="elements-list space-y-1">
              {page.elements.map((el) => (
                <RenderElement
                  key={el.id}
                  element={el}
                  pageIndex={actualPageIndex}
                  patientContext={patientContext}
                  isEditable={isEditable}
                  isSelected={selectedElementId === el.id}
                  onSelect={onSelectElement}
                  onUpdate={onUpdateElement}
                  zoom={baseScale}
                />
              ))}
            </div>

            {/* Bottom Page Number Footer if enabled */}
            {showPageNumbers && (
              <div
                className="mt-6 pt-3 border-t border-slate-200 flex justify-between text-[11px] text-slate-400 font-mono"
                style={{ fontSize: `${8 * baseScale}pt` }}
              >
                <span>HMS Radiodiagnosis & Imaging Services • Confidential Medical Record</span>
                <span>Page {page.pageNumber} of {document.pageCount}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RenderElement({
  element,
  pageIndex,
  patientContext,
  isEditable,
  isSelected,
  onSelect,
  onUpdate,
  zoom,
}: {
  element: ReconstructedElement
  pageIndex: number
  patientContext?: PatientReportContext
  isEditable: boolean
  isSelected: boolean
  onSelect?: (element: ReconstructedElement, pageIndex: number) => void
  onUpdate?: (updated: ReconstructedElement, pageIndex: number) => void
  zoom: number
}) {
  const handleClick = (e: React.MouseEvent) => {
    if (isEditable) {
      e.stopPropagation()
      onSelect?.(element, pageIndex)
    }
  }

  const rawContent = element.content || ""
  const displayContent = substitutePlaceholders(rawContent, patientContext)

  const baseFontSize = (element.fontSize || 10) * zoom
  const marginTop = (element.marginTop || 2) * zoom
  const marginBottom = (element.marginBottom || 3) * zoom

  const containerClasses = `relative transition-all ${
    isEditable
      ? "hover:ring-1 hover:ring-blue-400 hover:bg-blue-50/20 cursor-pointer rounded-xs"
      : ""
  } ${isSelected ? "ring-2 ring-blue-600 bg-blue-50/40 rounded shadow-xs" : ""}`

  // Render Heading
  if (element.type === "heading") {
    return (
      <div
        onClick={handleClick}
        className={containerClasses}
        style={{
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
          textAlign: element.textAlign || "left",
        }}
      >
        <div
          style={{
            fontSize: `${baseFontSize}pt`,
            fontWeight: element.fontWeight || "bold",
            color: element.color || "#0f172a",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
            lineHeight: 1.35,
          }}
        >
          {displayContent}
        </div>
        {element.uncertain && isEditable && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1 rounded border border-amber-200 mt-0.5">
            <AlertCircle className="w-2.5 h-2.5" /> Uncertain Extraction
          </span>
        )}
      </div>
    )
  }

  // Render Image / Hospital Logo
  if (element.type === "image" && element.src) {
    const alignClass =
      element.textAlign === "center"
        ? "justify-center"
        : element.textAlign === "right"
        ? "justify-end"
        : "justify-start"

    const imgWidth = element.width
      ? typeof element.width === "number"
        ? `${element.width * zoom}px`
        : element.width
      : "140px"

    return (
      <div
        onClick={handleClick}
        className={`${containerClasses} flex ${alignClass} py-1`}
        style={{ marginTop: `${marginTop}px`, marginBottom: `${marginBottom}px` }}
      >
        <img
          src={element.src}
          alt={element.alt || "Extracted Document Logo"}
          style={{
            maxWidth: "100%",
            width: imgWidth,
            height: element.height ? (typeof element.height === "number" ? `${element.height * zoom}px` : element.height) : "auto",
            objectFit: "contain",
          }}
        />
      </div>
    )
  }

  // Render Divider / Horizontal Rule
  if (element.type === "divider") {
    return (
      <div
        onClick={handleClick}
        className={`${containerClasses} my-1.5`}
        style={{ marginTop: `${marginTop}px`, marginBottom: `${marginBottom}px` }}
      >
        <hr
          style={{
            border: "0",
            borderTop: element.border || "1.5px solid #cbd5e1",
            margin: 0,
          }}
        />
      </div>
    )
  }

  // Render Table
  if (element.type === "table" && element.tableData) {
    return (
      <div
        onClick={handleClick}
        className={`${containerClasses} my-2 overflow-x-auto`}
        style={{ marginTop: `${marginTop}px`, marginBottom: `${marginBottom}px` }}
      >
        <RenderReconstructedTable
          tableData={element.tableData}
          patientContext={patientContext}
          zoom={zoom}
          isEditable={isEditable}
        />
      </div>
    )
  }

  // Render Dynamic Field Badge
  if (element.type === "field" || element.isDynamicField) {
    return (
      <div
        onClick={handleClick}
        className={`${containerClasses} inline-block`}
        style={{
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
          textAlign: element.textAlign || "left",
        }}
      >
        <span
          className="inline-block px-1.5 py-0.5 rounded font-mono border"
          style={{
            fontSize: `${baseFontSize}pt`,
            fontWeight: element.fontWeight || "600",
            backgroundColor: isEditable ? "#f3e8ff" : "transparent",
            borderColor: isEditable ? "#d8b4fe" : "transparent",
            color: isEditable ? "#6b21a8" : (element.color || "#0f172a"),
          }}
        >
          {displayContent}
        </span>
      </div>
    )
  }

  // Standard Paragraph / Text
  return (
    <div
      onClick={handleClick}
      className={containerClasses}
      style={{
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
        textAlign: element.textAlign || "left",
      }}
    >
      <div
        style={{
          fontSize: `${baseFontSize}pt`,
          fontWeight: element.fontWeight || "normal",
          fontStyle: element.fontStyle || "normal",
          color: element.color || "#1e293b",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
        }}
      >
        {displayContent}
      </div>
      {element.uncertain && isEditable && (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1 rounded border border-amber-200 mt-0.5">
          <AlertCircle className="w-2.5 h-2.5" /> Uncertain Extraction
        </span>
      )}
    </div>
  )
}

function RenderReconstructedTable({
  tableData,
  patientContext,
  zoom,
  isEditable,
}: {
  tableData: TableData
  patientContext?: PatientReportContext
  zoom: number
  isEditable: boolean
}) {
  if (!tableData.rows || tableData.rows.length === 0) return null

  const borderStyle = tableData.borderStyle || "1px solid #cbd5e1"
  const headerCount = tableData.headerRowCount || 1

  return (
    <table
      className="w-full border-collapse"
      style={{
        border: borderStyle,
        fontSize: `${9 * zoom}pt`,
      }}
    >
      {tableData.colWidths && tableData.colWidths.length > 0 && (
        <colgroup>
          {tableData.colWidths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
      )}
      <tbody>
        {tableData.rows.map((row, rIdx) => {
          const isHeaderRow = rIdx < headerCount
          return (
            <tr
              key={row.id || rIdx}
              className={isHeaderRow ? "bg-slate-100/90 font-bold" : "bg-white"}
              style={{
                backgroundColor: isHeaderRow ? "#f8fafc" : "#ffffff",
              }}
            >
              {row.cells.map((cell, cIdx) => {
                const cellContent = substitutePlaceholders(cell.content, patientContext)
                return (
                  <td
                    key={cell.id || cIdx}
                    colSpan={cell.colSpan || 1}
                    rowSpan={cell.rowSpan || 1}
                    style={{
                      border: cell.border || borderStyle,
                      padding: `${4 * zoom}px ${6 * zoom}px`,
                      textAlign: cell.align || "left",
                      fontWeight: cell.bold || isHeaderRow ? "bold" : "normal",
                      fontStyle: cell.italic ? "italic" : "normal",
                      backgroundColor: cell.backgroundColor || (isHeaderRow ? "#f8fafc" : undefined),
                      color: cell.color || "#0f172a",
                      fontSize: `${8.5 * zoom}pt`,
                      verticalAlign: "top",
                    }}
                  >
                    {cellContent}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
