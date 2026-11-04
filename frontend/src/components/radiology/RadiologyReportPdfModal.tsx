import React, { useState, useRef } from "react"
import { ExtendedRadiologyRecord, RadiologyWorkflowDb } from "../../services/radiologyWorkflowDb"
import { RadiologyStudyRecord } from "../../services/billingDb"
import { printRadiologyDocument } from "../../utils/radiologyPrint"
import { db } from "../../services/db"
import { RadiologyTemplateDatabase } from "../../services/radiologyTemplateDb"
import ReconstructedReportRenderer, { PatientReportContext } from "./ReconstructedReportRenderer"
import {
  X,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  Building,
} from "lucide-react"

interface RadiologyReportPdfModalProps {
  study: ExtendedRadiologyRecord | RadiologyStudyRecord
  onClose: () => void
}

export default function RadiologyReportPdfModal({
  study,
  onClose,
}: RadiologyReportPdfModalProps) {
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const paymentInfo = RadiologyWorkflowDb.getPaymentStatusFromBilling(study)
  const isPaid = paymentInfo.status === "PAID"
  const isFinalized = study.reportStatus === "Final" || (study as any).reportStatus === "Finalized"

  const matchedPatient = study.umr
    ? db.getPatients().find((p) => p.umr === study.umr)
    : db.getPatients().find((p) => p.name.trim().toLowerCase() === (study.patient || "").trim().toLowerCase())
  const matchedEncounter = study.encounterId
    ? db.getEncounterById(study.encounterId)
    : (matchedPatient ? db.getEncountersForPatient(matchedPatient.umr)[0] : undefined)

  // Resolve template with reconstructed layout if available
  const existingRepRecord = RadiologyTemplateDatabase.getReportByStudyId(study.id)
  const matchedTemplate = RadiologyTemplateDatabase.getTemplateForStudy(
    study.study,
    (study as any).gender || matchedPatient?.gender || "All"
  )
  const reconstructedDoc = existingRepRecord?.reconstructedDocumentSnapshot || matchedTemplate?.reconstructedDocument

  const findingsStr = study.findings && study.findings.length > 0
    ? (Array.isArray(study.findings) ? study.findings.join("\n") : String(study.findings))
    : ""
  const impressionStr = study.impression && study.impression.length > 0
    ? (Array.isArray(study.impression) ? study.impression.join("\n") : String(study.impression))
    : ""

  const patientContext: PatientReportContext = {
    patientName: study.patient,
    mrn: study.mrn,
    umr: study.umr || `PAT-${study.mrn}`,
    ageGender: matchedPatient ? `${matchedPatient.age || ""} / ${matchedPatient.gender || ""}` : undefined,
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
    billingStatus: isPaid ? "Paid" : "Payment Pending",
  }

  const handlePrint = () => {
    RadiologyWorkflowDb.logPrintOrDownload(study.id, "PRINT", study.radiologist || "Technician")
    printRadiologyDocument(study as RadiologyStudyRecord, undefined, reconstructedDoc)
  }

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      RadiologyWorkflowDb.logPrintOrDownload(study.id, "DOWNLOAD", study.radiologist || "Technician")

      // Dynamically load jsPDF
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      // Standard A4 width: 210mm, height: 297mm
      const margin = 15
      let y = 18

      // Hospital Header
      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.setTextColor(15, 23, 42) // Slate 900
      doc.text("ENTERPRISE HOSPITAL MANAGEMENT SYSTEM", margin, y)

      y += 6
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(67, 56, 202) // Indigo 700
      doc.text("DEPARTMENT OF RADIODIAGNOSIS & IMAGING SERVICES", margin, y)

      y += 5
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text("NABL & NABH ACCREDITED TERTIARY CARE FACILITY • TEL: +91 40 2345 6789 • 24x7 RADIOLOGY HELPLINE", margin, y)

      y += 4
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.5)
      doc.line(margin, y, 210 - margin, y)

      // Title Banner
      y += 7
      doc.setFont("helvetica", "bold")
      doc.setFontSize(12)
      doc.setTextColor(15, 23, 42)
      doc.text("OFFICIAL DIAGNOSTIC RADIOLOGY REPORT", margin, y)

      doc.setFontSize(9)
      doc.setTextColor(isFinalized ? 16 : 180, isFinalized ? 120 : 83, isFinalized ? 74 : 9)
      doc.text(isFinalized ? "[STATUS: CLINICALLY FINALIZED]" : "[STATUS: DRAFT EXAMINATION REPORT]", 210 - margin - 65, y)

      // Demographics Box
      y += 4
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, y, 180, 32, "F")
      doc.setDrawColor(226, 232, 240)
      doc.rect(margin, y, 180, 32, "S")

      y += 5
      doc.setFontSize(8.5)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("PATIENT NAME:", margin + 3, y)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(15, 23, 42)
      doc.text(study.patient, margin + 28, y)

      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("UMR NUMBER:", margin + 95, y)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(15, 23, 42)
      doc.text(study.umr || `PAT-${study.mrn}`, margin + 120, y)

      y += 6
      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("OP / IP NUMBER:", margin + 3, y)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(15, 23, 42)
      doc.text((study as any).opNumber || (study as any).ipNumber || "OP-1002", margin + 28, y)

      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("ACCESSION NO:", margin + 95, y)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(15, 23, 42)
      doc.text(study.accessionNo || "RAD-ACC-8801", margin + 120, y)

      y += 6
      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("REFERRING DOC:", margin + 3, y)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(15, 23, 42)
      doc.text(study.provider, margin + 28, y)

      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("DATE OF EXAM:", margin + 95, y)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(15, 23, 42)
      doc.text((study as any).orderDate || study.ordered || new Date().toISOString().split("T")[0], margin + 120, y)

      y += 6
      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("BILLING STATUS:", margin + 3, y)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(isPaid ? 16 : 217, isPaid ? 120 : 119, isPaid ? 74 : 6)
      doc.text(
        isPaid ? `PAID (Ref: ${study.paidReceiptNo || "RCPT-5501"})` : "PAYMENT PENDING AT BILLING",
        margin + 28,
        y
      )

      doc.setFont("helvetica", "bold")
      doc.setTextColor(51, 65, 85)
      doc.text("MODALITY / ROOM:", margin + 95, y)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(15, 23, 42)
      doc.text(`${study.modality} • Room: ${study.room || "Suite-1"}`, margin + 125, y)

      // Investigation Title Bar
      y += 12
      doc.setFillColor(238, 242, 255)
      doc.rect(margin, y, 180, 8, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(67, 56, 202)
      doc.text(`EXAMINATION: ${study.study.toUpperCase()} (${study.modality})`, margin + 3, y + 5.5)

      // Clinical Indication
      y += 13
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.setTextColor(15, 23, 42)
      doc.text("CLINICAL INDICATION & HISTORY:", margin, y)
      y += 4.5
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(51, 65, 85)
      const indLines = doc.splitTextToSize(study.indication || "Diagnostic evaluation requested by treating physician.", 180)
      doc.text(indLines, margin, y)
      y += indLines.length * 4.5 + 2

      // Technique
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.setTextColor(15, 23, 42)
      doc.text("EXAMINATION TECHNIQUE & PROTOCOL:", margin, y)
      y += 4.5
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(51, 65, 85)
      const techLines = doc.splitTextToSize(study.technique || "Standard multiplanar digital diagnostic imaging scan.", 180)
      doc.text(techLines, margin, y)
      y += techLines.length * 4.5 + 3

      // Actual Findings
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9.5)
      doc.setTextColor(15, 23, 42)
      doc.text("FINDINGS:", margin, y)
      y += 5
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(30, 41, 59)

      const findingsList = study.findings && study.findings.length > 0
        ? study.findings
        : ["No abnormal focal parenchymal lesions, acute fracture, or acute soft tissue abnormalities identified on routine review."]

      findingsList.forEach((item) => {
        const itemLines = doc.splitTextToSize(`• ${item}`, 175)
        doc.text(itemLines, margin + 2, y)
        y += itemLines.length * 4.5 + 1.5
      })

      // Impression / Conclusion Box
      y += 3
      doc.setFillColor(241, 245, 249)
      doc.setDrawColor(203, 213, 225)
      const impY = y
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9.5)
      doc.setTextColor(15, 23, 42)
      doc.text("IMPRESSION & CONCLUSION:", margin + 3, y + 5)
      y += 9

      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(15, 23, 42)
      const impList = study.impression && study.impression.length > 0
        ? study.impression
        : ["1. Diagnostic imaging study completed. No acute emergency intervention indicated.", "2. Correlate with clinical laboratory and physical evaluation."]

      impList.forEach((imp, i) => {
        const impText = imp.startsWith(`${i + 1}.`) ? imp : `${i + 1}. ${imp}`
        const impLines = doc.splitTextToSize(impText, 172)
        doc.text(impLines, margin + 5, y)
        y += impLines.length * 4.5 + 1.5
      })

      doc.rect(margin, impY, 180, (y - impY) + 2, "S")
      y += 6

      // Sign-off Block
      if (y > 250) {
        doc.addPage()
        y = 20
      }

      y = Math.max(y, 235)
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.3)
      doc.line(margin, y, 210 - margin, y)

      y += 8
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text(`REPORTING TECHNICIAN:`, margin, y)
      doc.text(`FINALIZING RADIOLOGIST:`, margin + 105, y)

      y += 4.5
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8.5)
      doc.setTextColor(15, 23, 42)
      doc.text(study.technician || "Staff Radiology Technician", margin, y)
      doc.text(study.radiologist || "Dr. Laura Kim, MD · Consultant Radiologist", margin + 105, y)

      y += 4
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(100, 116, 139)
      doc.text(`SIGNATURE REF: TECH-SIG-${study.mrn || "8801"}`, margin, y)
      doc.text(`REG NO: RAD-REG-2024-9912 • SIGNED: ${study.signedAt || new Date().toLocaleDateString("en-IN")}`, margin + 105, y)

      // Footer
      y = 285
      doc.setFontSize(7)
      doc.setTextColor(148, 163, 184)
      doc.text(`CONFIDENTIAL MEDICAL DOCUMENT • ACCREDITED RADIODIAGNOSIS DEPARTMENT • REPORT ID: ${study.id}`, margin, y)
      doc.text("PAGE 1 OF 1", 210 - margin - 15, y)

      // Trigger download
      doc.save(`Radiology_Report_${study.patient.replace(/\s+/g, "_")}_${study.id}.pdf`)
    } catch (err) {
      console.error("PDF generation error:", err)
      // Fallback to window.print()
      window.print()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[95vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-indigo-400" />
            <span className="font-bold text-sm tracking-tight">
              Radiology Report Preview & Export
            </span>
            <span
              className={`ml-2 px-2 py-0.5 rounded text-[11px] font-bold ${
                isFinalized
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-400/30"
              }`}
            >
              {isFinalized ? "FINALIZED" : "DRAFT"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer size={14} />
              <span>Print Report</span>
            </button>

            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadPdf}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Download size={14} />
              <span>{downloading ? "Generating..." : "Download PDF"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer ml-2"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Paper */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-100 flex justify-center">
          {reconstructedDoc ? (
            <div className="w-full max-w-[780px] flex flex-col items-center space-y-3">
              <div className="w-full flex items-center justify-between text-[11.5px] text-blue-900 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg shadow-2xs">
                <span className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Official Reconstructed Report Template Format Active
                </span>
                <span className="font-mono text-slate-500">
                  {matchedTemplate?.testName || study.study} (v{matchedTemplate?.version || 1})
                </span>
              </div>
              <div ref={reportRef} className="w-full flex justify-center">
                <ReconstructedReportRenderer
                  document={reconstructedDoc}
                  patientContext={patientContext}
                  isEditable={false}
                  zoom={0.92}
                />
              </div>
            </div>
          ) : (
            <div
              ref={reportRef}
              className="w-full max-w-[760px] bg-white rounded-xl shadow-lg border border-slate-200 p-8 sm:p-10 text-slate-900 font-sans print:shadow-none print:border-none print:p-0 print:m-0"
            >
            {/* Hospital Letterhead */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Building size={22} className="text-indigo-700" />
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-950 uppercase">
                    Enterprise Hospital Management System
                  </h1>
                </div>
                <h2 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mt-0.5">
                  Department of Radiodiagnosis & Imaging Services
                </h2>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  NABL & NABH Accredited Diagnostic Center • 24x7 Diagnostic Imaging Care
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 rounded border border-slate-200 block">
                  ACCESSION: {study.accessionNo || "RAD-ACC-8801"}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Report ID: {study.id}
                </span>
              </div>
            </div>

            {/* Patient Demographics Table */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-2.5 gap-x-4 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px] block">Patient Name:</span>
                  <strong className="text-slate-950 text-sm">{study.patient}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">UMR Number:</span>
                  <strong className="font-mono text-slate-900">{study.umr || `PAT-${study.mrn}`}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">OP / IP Number:</span>
                  <strong className="font-mono text-slate-900">
                    {(study as any).opNumber || (study as any).ipNumber || matchedEncounter?.opNumber || study.encounterId || "OP-1002"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Age / Gender:</span>
                  <strong className="text-slate-900">
                    {(study as any).age || matchedEncounter?.age || matchedPatient?.age || 38} yrs / {(study as any).sex || matchedEncounter?.sex || matchedPatient?.sex || "Male"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Ordering Doctor:</span>
                  <strong className="text-slate-900">{study.provider}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Order Date:</span>
                  <strong className="text-slate-900">{(study as any).orderDate || study.ordered}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Modality / Room:</span>
                  <strong className="text-indigo-800">{study.modality} ({study.room || "Suite-1"})</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Billing Status:</span>
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[10.5px] font-bold ${
                      isPaid ? "text-emerald-800 bg-emerald-100" : "text-amber-800 bg-amber-100"
                    }`}
                  >
                    {isPaid ? `PAID (${study.paidReceiptNo || "RCPT-5501"})` : "PENDING"}
                  </span>
                </div>
              </div>
            </div>

            {/* Examination Title */}
            <div className="bg-indigo-50/70 border-l-4 border-indigo-600 px-4 py-2.5 rounded-r-lg mb-6 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                  EXAMINATION PERFORMED
                </span>
                <h3 className="text-sm font-extrabold text-indigo-950">
                  {study.study} ({study.modality})
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-600">
                Tariff: ₹{(study.price ?? 0).toLocaleString("en-IN")}
              </span>
            </div>

            {/* Clinical Section */}
            <div className="space-y-5 text-xs">
              {/* Indication */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1">
                  Clinical Indication & History:
                </h4>
                <p className="text-slate-700 bg-white p-2.5 rounded border border-slate-100">
                  {study.indication || "Diagnostic workup prescribed by treating physician."}
                </p>
              </div>

              {/* Technique */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1">
                  Examination Technique:
                </h4>
                <p className="text-slate-700 bg-white p-2.5 rounded border border-slate-100">
                  {study.technique || "Standard digital imaging scan performed per department protocol."}
                </p>
              </div>

              {/* Findings */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5">
                  Actual Clinical Findings:
                </h4>
                <div className="bg-slate-50/50 p-3.5 rounded-lg border border-slate-200 space-y-2 leading-relaxed">
                  {study.findings && study.findings.length > 0 ? (
                    study.findings.map((finding, idx) => (
                      <p key={idx} className="text-slate-800">
                        • {finding}
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500 italic">
                      Scan acquisition completed cleanly. No acute macroscopic abnormality identified.
                    </p>
                  )}
                </div>
              </div>

              {/* Impression / Conclusion */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5">
                  Impression & Conclusion:
                </h4>
                <div className="bg-slate-50 p-4 rounded-lg border-2 border-slate-300 space-y-1.5">
                  {study.impression && study.impression.length > 0 ? (
                    study.impression.map((imp, idx) => (
                      <p key={idx} className="font-semibold text-slate-900">
                        {imp.startsWith(`${idx + 1}.`) ? imp : `${idx + 1}. ${imp}`}
                      </p>
                    ))
                  ) : (
                    <p className="font-semibold text-slate-900">
                      1. Diagnostic radiology examination completed without complication.
                    </p>
                  )}
                </div>
              </div>

              {/* Sign-off Section */}
              <div className="pt-8 border-t border-slate-200 mt-8 grid grid-cols-2 gap-8">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                    Acquisition Performed By:
                  </span>
                  <div className="font-bold text-slate-900 mt-1">
                    {study.technician || "Staff Radiology Technician"}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    Signature Ref: TECH-SIG-{study.mrn || "8801"}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                    Reporting Radiologist / Sign-off:
                  </span>
                  <div className="font-extrabold text-slate-950 mt-1">
                    {study.radiologist || "Dr. Laura Kim, MD"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Reg No: RAD-2024-9912 • Signed: {study.signedAt || new Date().toLocaleDateString("en-IN")}
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="text-[9.5px] text-slate-400 text-center pt-6 border-t border-slate-100">
                Notice: This clinical radiology examination is an integral medical document.
                Interpret in correlation with clinical, physical, and laboratory findings.
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
