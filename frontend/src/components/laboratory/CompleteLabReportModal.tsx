import React, { useRef } from "react"
import { LabOrder } from "../../services/labOrdersDb"
import { findTestDefinition } from "./labCatalogueSchema"
import { AuditDatabase } from "../../services/auditDb"

interface CompleteLabReportModalProps {
  order: LabOrder
  onClose: () => void
}

function formatDateDisplay(d?: string | Date): string {
  const date = d ? new Date(d) : new Date()
  const day = String(date.getDate()).padStart(2, "0")
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const month = monthNames[date.getMonth()]
  const year = date.getFullYear()
  let hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const ampm = hours >= 12 ? "AM" : "PM"
  hours = hours % 12
  hours = hours ? hours : 12
  const strHours = String(hours).padStart(2, "0")
  return `${day}-${month}-${year} ${strHours}:${minutes} ${ampm}`
}

function formatCollectedDate(d?: string | Date): string {
  const date = d ? new Date(d) : new Date()
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
}

export default function CompleteLabReportModal({
  order,
  onClose,
}: CompleteLabReportModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    AuditDatabase.logEvent(
      "Laboratory Report Printed",
      "Laboratory",
      `Complete laboratory diagnostic report printed for patient ${order.patientName} (${order.umr}) - Order ${order.id}.`,
      "Success"
    )
    window.print()
  }

  // Format Dates matching Photo 2
  const billDateStr = formatDateDisplay(order.billing?.paidAt || order.createdAt)
  const reportDateStr = formatDateDisplay(new Date())
  const collectedDateStr = formatCollectedDate(order.tests[0]?.sampleCollectedAt || order.createdAt)
  const releaseDateStr = formatCollectedDate(new Date())

  // Format IDs & Numbers
  const billNo =
    order.billing?.receiptNo ||
    order.billing?.invoiceNo ||
    `BIL${order.id.replace(/\D/g, "").padStart(6, "0").slice(-6) || "152090"}`

  const resultNo = `RES${order.id.replace(/\D/g, "") || "241926"} / ${
    order.opNumber?.replace(/\D/g, "") || "260900310"
  }`

  const billBarcodeNo = billNo.replace(/^BIL/i, "IL")

  const doctorRef = order.doctorName
    ? order.doctorName.startsWith("Dr.")
      ? order.doctorName.toUpperCase()
      : `Dr.${order.doctorName.toUpperCase()}`
    : "Dr.AMULYA GADEPALLI"

  // Primary specimen / sample type
  const firstDef = findTestDefinition(order.tests[0]?.name || "")
  const sampleType =
    firstDef?.sampleType ||
    (order.tests.some((t) => t.category.toLowerCase().includes("hematology") || t.name.toLowerCase().includes("cbc") || t.name.toLowerCase().includes("blood"))
      ? "Whole Blood (EDTA)"
      : "")

  // Determine Department title
  const hasHematology = order.tests.some(
    (t) =>
      t.category.toLowerCase().includes("hematology") ||
      t.name.toLowerCase().includes("cbc") ||
      t.name.toLowerCase().includes("hemogram") ||
      t.name.toLowerCase().includes("blood")
  )
  const hasBiochemistry = order.tests.some(
    (t) =>
      t.category.toLowerCase().includes("biochemistry") ||
      t.name.toLowerCase().includes("lft") ||
      t.name.toLowerCase().includes("rft") ||
      t.name.toLowerCase().includes("glucose") ||
      t.name.toLowerCase().includes("lipid")
  )
  const hasMicrobiology = order.tests.some(
    (t) =>
      t.category.toLowerCase().includes("microbiology") ||
      t.name.toLowerCase().includes("culture")
  )

  let departmentTitle = "DEPARTMENT OF HAEMATOLOGY"
  if (hasHematology && hasBiochemistry) {
    departmentTitle = "DEPARTMENT OF HAEMATOLOGY & CLINICAL PATHOLOGY"
  } else if (hasBiochemistry) {
    departmentTitle = "DEPARTMENT OF BIOCHEMISTRY"
  } else if (hasMicrobiology) {
    departmentTitle = "DEPARTMENT OF MICROBIOLOGY"
  } else if (order.department && !order.department.includes("General")) {
    departmentTitle = `DEPARTMENT OF ${order.department.toUpperCase()}`
  }

  // Method string
  let methodString = "Fully automated haematology analyzer (MINDRAY | BC-5150)"
  if (hasBiochemistry && !hasHematology) {
    methodString = "Fully automated clinical chemistry analyzer"
  } else if (hasMicrobiology) {
    methodString = "Automated microbial identification & susceptibility testing"
  }

  // Helper to map parameter name to standard capitalized laboratory labels
  const formatParamLabel = (rawName: string): string => {
    const lower = rawName.toLowerCase()
    if (lower.includes("hemoglobin") || lower === "hb") return "HAEMOGLOBIN(HB)"
    if (lower.includes("rbc") || lower.includes("red blood cell")) return "TOTAL RED BLOOD CELLS(TRBC)"
    if (lower.includes("total wbc") || lower.includes("total count") || lower === "wbc" || lower === "tc") return "T.WBC"
    if (lower.includes("platelet")) return "PLATELET COUNT"
    if (lower.includes("packed cell volume") || lower.includes("pcv")) return "PACKED CELL VOLUME(PCV)"
    if (lower.includes("neutrophil")) return "NEUTROPHILS"
    if (lower.includes("lymphocyte")) return "LYMPHOCYTES"
    if (lower.includes("eosinophil")) return "EOSINOPHILS"
    if (lower.includes("monocyte")) return "MONOCYTES"
    if (lower.includes("basophil")) return "BASOPHILS"
    return rawName.toUpperCase()
  }

  // Helper to format biological reference interval
  const formatReferenceInterval = (res: any, paramName: string): string => {
    let range = res.referenceRange || ""
    const unit = res.unit || ""

    const lower = paramName.toLowerCase()
    if (lower.includes("hemoglobin") || lower.includes("hb")) {
      return "13.5 - 18.0 gm%"
    }
    if (lower.includes("rbc") || lower.includes("red blood cell")) {
      return "4.5 - 6.0 millions/cumm"
    }
    if (lower.includes("total wbc") || lower.includes("total count") || lower.includes("t.wbc")) {
      return "4,000 - 11,000 cells/cumm"
    }
    if (lower.includes("platelet")) {
      return "1.5 - 4.0 Lakhs/cumm"
    }
    if (lower.includes("neutrophil")) return "40 - 75 %"
    if (lower.includes("lymphocyte")) return "20 - 45 %"
    if (lower.includes("eosinophil")) return "2 - 7 %"
    if (lower.includes("monocyte")) return "2 - 10 %"
    if (lower.includes("pcv") || lower.includes("packed cell")) return "36 - 45 %"

    if (range) {
      range = range.replace(/–/g, " - ")
      if (unit && !range.includes(unit)) {
        return `${range} ${unit}`
      }
      return range
    }
    return unit ? `Normal (${unit})` : "Normal"
  }

  // Helper to format parameter value
  const formatValue = (res: any): { isAbnormal: boolean; displayValue: string } => {
    const rawVal = res.value || ""
    const isAbnormal =
      res.flag === "H" ||
      res.flag === "L" ||
      res.flag === "Critical" ||
      rawVal.toString().startsWith("*")

    const cleanVal = rawVal.toString().replace(/^\*\s*/, "")
    return {
      isAbnormal,
      displayValue: cleanVal,
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Print Specific Styles */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          #printable-lab-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Main Modal Card Container */}
      <div className="bg-white rounded-none shadow-2xl border border-gray-400 w-full max-w-[850px] max-h-[96vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150 print:border-0 print:shadow-none print:max-w-none print:w-full">
        
        {/* Modal Top Control Bar (Screen View Only) */}
        <div className="bg-slate-900 text-white px-5 py-2.5 flex items-center justify-between no-print shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
              Imperial Hospitals · Laboratory Diagnostic Examination Report
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-none transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>🖨️</span> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-300 hover:text-white text-lg font-bold px-2 cursor-pointer"
              title="Close Modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas (Faithful to Photo 2) */}
        <div
          ref={printRef}
          id="printable-lab-report"
          className="flex-1 overflow-y-auto p-6 sm:p-10 bg-white text-black font-sans leading-normal relative select-text print:p-0 print:overflow-visible"
        >
          <div className="relative z-10">
            {/* 1. Header: Centered Hospital Information (Logo Removed) */}
            <div className="text-center pb-1">
              <h1 className="text-[18px] font-bold text-black uppercase tracking-wide font-sans leading-tight">
                IMPERIAL HOSPITALS
              </h1>
              <p className="text-[11px] text-gray-900 font-medium leading-tight mt-0.5">
                # 27-14-13/A, OPP. GANESH CANTEEN STREET,
              </p>
              <p className="text-[11px] text-gray-900 font-medium leading-tight">
                BESIDE BHASYAM SCHOOL, BHIMAVARAM-534202,
              </p>
            </div>

            {/* Department Title */}
            <div className="text-center my-2">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-black font-sans">
                {departmentTitle}
              </h2>
            </div>

            {/* 2. Patient Demographics & Order Metadata Box (Framed in single black border) */}
            <div className="border border-black p-2.5 my-2.5 text-[11px] font-sans text-black leading-relaxed">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                {/* Left Column */}
                <div className="space-y-0.5">
                  <div className="grid grid-cols-[85px_12px_1fr] items-baseline">
                    <span className="text-black">Name</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="font-bold text-black uppercase tracking-tight">
                      {order.patientName}
                    </span>
                  </div>
                  <div className="grid grid-cols-[85px_12px_1fr] items-baseline">
                    <span className="text-black">Bill Date</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="text-black">{billDateStr}</span>
                  </div>
                  <div className="grid grid-cols-[85px_12px_1fr] items-baseline">
                    <span className="text-black">Rept. Dt</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="text-black">{reportDateStr}</span>
                  </div>
                  <div className="grid grid-cols-[85px_12px_1fr] items-baseline">
                    <span className="text-black">Ref By</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="font-semibold text-black">{doctorRef}</span>
                  </div>
                  <div className="grid grid-cols-[85px_12px_1fr] items-baseline">
                    <span className="text-black">Sample Type</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="text-black">{sampleType}</span>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-0.5">
                  <div className="grid grid-cols-[125px_12px_1fr] items-baseline">
                    <span className="text-black">Age /Sex</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="text-black">
                      {order.age} Y(s)/{order.sex || "Male"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[125px_12px_1fr] items-baseline">
                    <span className="text-black">UMR No.</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="font-mono font-bold text-black">{order.umr}</span>
                  </div>
                  <div className="grid grid-cols-[125px_12px_1fr] items-baseline">
                    <span className="text-black">Bill No.</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="font-mono text-black">{billNo}</span>
                  </div>
                  <div className="grid grid-cols-[125px_12px_1fr] items-baseline">
                    <span className="text-black">Result No</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="font-mono text-black">{resultNo}</span>
                  </div>
                  <div className="grid grid-cols-[125px_12px_1fr] items-baseline">
                    <span className="text-black">Sample collected Dt</span>
                    <span className="text-center font-bold text-black">:</span>
                    <span className="text-black">{collectedDateStr}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Investigation Results Section */}
            <div className="mt-3 space-y-4">
              {order.tests.map((test) => {
                const hasResults = test.results && Object.keys(test.results).length > 0
                const isCbc =
                  test.name.toLowerCase().includes("cbc") ||
                  test.name.toLowerCase().includes("hemogram") ||
                  test.name.toLowerCase().includes("blood picture")

                const testHeading = isCbc
                  ? "COMPLETE BLOOD PICTURE"
                  : test.name.toUpperCase()

                // Sort or group parameters if DC is present
                let renderedDcHeader = false

                return (
                  <div key={test.id} className="pt-1">
                    {/* Underlined Test Header */}
                    <h3 className="font-bold underline uppercase text-[12px] mb-2 tracking-wide text-black">
                      {testHeading}
                    </h3>

                    {/* Parameter Values Listing */}
                    {hasResults ? (
                      <div className="space-y-0.5">
                        {Object.entries(test.results!).map(([paramName, res]) => {
                          const formattedName = formatParamLabel(paramName)
                          const isDcParam =
                            formattedName === "NEUTROPHILS" ||
                            formattedName === "LYMPHOCYTES" ||
                            formattedName === "EOSINOPHILS" ||
                            formattedName === "MONOCYTES" ||
                            formattedName === "BASOPHILS"

                          let dcHeaderBlock = null
                          if (isDcParam && !renderedDcHeader) {
                            renderedDcHeader = true
                            dcHeaderBlock = (
                              <div
                                key="dc-header"
                                className="font-bold text-[11.5px] text-black mt-2 mb-0.5 tracking-wide"
                              >
                                DC
                              </div>
                            )
                          }

                          const { isAbnormal, displayValue } = formatValue(res)
                          const refRangeText = formatReferenceInterval(res, paramName)

                          return (
                            <React.Fragment key={paramName}>
                              {dcHeaderBlock}
                              <div className="grid grid-cols-[40%_3%_17%_40%] items-baseline text-[11.5px] leading-[21px] font-sans text-black">
                                {/* Parameter Name */}
                                <div className="font-medium text-black">
                                  {formattedName}
                                </div>
                                {/* Colon Separator */}
                                <div className="text-center font-bold text-black">
                                  :
                                </div>
                                {/* Value (prefixed by * if abnormal) */}
                                <div className="font-semibold text-black">
                                  {isAbnormal ? `* ${displayValue}` : `  ${displayValue}`}
                                </div>
                                {/* Biological Reference Interval + Unit */}
                                <div className="text-black pl-2">
                                  {refRangeText}
                                </div>
                              </div>
                            </React.Fragment>
                          )
                        })}
                      </div>
                    ) : (
                      /* Single result string for non-panel tests (e.g. Imaging / Qualitative) */
                      <div className="text-[11.5px] text-black py-1">
                        <span>Result : </span>
                        <strong className="font-semibold">
                          {test.result || "Awaiting result entry"}
                        </strong>
                        {test.referenceRange && (
                          <span className="ml-4">
                            Biological Ref Interval: {test.referenceRange}
                          </span>
                        )}
                      </div>
                    )}

                    {/* AST Antibiotic Susceptibility Table if present */}
                    {test.tableData && test.tableData.length > 0 && (
                      <div className="mt-3 border border-black overflow-hidden">
                        <div className="bg-gray-100 px-3 py-1 text-[11px] font-bold text-black border-b border-black">
                          Antimicrobial Susceptibility Profile
                        </div>
                        <table className="w-full text-[11px] text-left">
                          <thead className="bg-gray-50 text-black font-bold border-b border-black">
                            <tr>
                              <th className="py-1 px-3">Antimicrobial</th>
                              <th className="py-1 px-3">Zone Diameter</th>
                              <th className="py-1 px-3">MIC</th>
                              <th className="py-1 px-3">Interpretation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {test.tableData.map((row: any, i: number) => (
                              <tr key={i}>
                                <td className="py-1 px-3 font-medium text-black">{row.antibiotic}</td>
                                <td className="py-1 px-3 text-black">{row.zone}</td>
                                <td className="py-1 px-3 text-black">{row.mic}</td>
                                <td className="py-1 px-3 font-bold text-black">{row.susceptibility}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Clinical Comments if present */}
                    {test.clinicalComments && (
                      <div className="text-[10.5px] text-gray-900 mt-2">
                        <span className="font-bold">Comment: </span>
                        {test.clinicalComments}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 4. End Of Report & Footer Signature Block */}
            <div className="mt-4 pt-1">
              {/* Centered End of Report */}
              <div className="text-center font-bold text-[11px] text-black tracking-wider my-3.5">
                *** End Of Report ***
              </div>

              {/* Two Column Footer: Disclaimers on Left, Stamp & Signature on Right */}
              <div className="grid grid-cols-2 gap-6 items-start mt-3">
                {/* Left Side: Disclaimers & Method */}
                <div className="text-[10.5px] text-black leading-snug space-y-2">
                  <div className="font-medium">
                    Suggested Clinical Correlation * If neccessary, Please discuss
                  </div>
                  <div className="font-semibold pt-1">
                    Verified By :
                  </div>
                  <div className="h-4"></div>
                  <div className="text-[10px] text-gray-800 leading-tight">
                    Test results related only to the item tested.
                  </div>
                  <div className="text-[10px] text-gray-800 leading-tight">
                    No part of the report can be reproduced without written permission of the laboratory.
                  </div>
                  <div className="pt-1">
                    <span className="font-bold block text-[10.5px]">METHOD:</span>
                    <span className="text-[10.5px] text-black">
                      {methodString}
                    </span>
                  </div>
                </div>

                {/* Right Side: Empty */}
                <div></div>
              </div>
            </div>

            {/* 5. Bottom Strip: Release Date, Unit Name, Barcode & Colored Footer Bar */}
            <div className="mt-8 pt-3">
              {/* Release Date, Company Name, Barcode */}
              <div className="flex items-center justify-between text-[11px] font-sans text-black px-1 mb-1.5">
                <div>
                  Release Date : {releaseDateStr}
                </div>
                <div className="font-medium text-center">
                  Imperial Hospitals a unit of Mukunda Healthcare Pvt. Ltd.
                </div>
                <div className="font-mono font-bold text-sm tracking-wider">
                  *{billBarcodeNo}*
                </div>
              </div>

              {/* Bottom Maroon / Dark Brick Red Bar */}
              <div className="bg-[#7c2d12] text-white text-center py-1 px-4 text-[10px] font-medium leading-tight print:bg-[#7c2d12]">
                <div>
                  #27-14-13/A, Opp. Sri Ganesh Canteen, Beside Bhasyam School, J.P. Road, BHIMAVARAM - 534202. W.G. Dist. (A.P.)
                </div>
                <div className="text-[9.5px] text-amber-100/90 mt-0.5">
                  08816 270999, 275999
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Bottom Bar (Screen View Only) */}
        <div className="bg-gray-100 border-t border-gray-300 px-6 py-2.5 flex items-center justify-between no-print shrink-0">
          <span className="text-xs text-gray-600">
            Investigations: <strong>{order.tests.length}</strong> · Billing Status:{" "}
            <strong>{order.billing.status}</strong>
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-none shadow-xs cursor-pointer transition-colors"
            >
              Print Report
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-none hover:bg-gray-50 cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
