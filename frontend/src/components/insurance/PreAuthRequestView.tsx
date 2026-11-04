import React, { useState, useEffect, useMemo, useRef } from "react"
import {
  ArrowLeft,
  Save,
  Send,
  Check,
  Shield,
  CheckCircle2,
  FileText,
  Clock,
  Package,
  FileCheck,
  Stethoscope,
  Building2,
  ChevronRight,
  Printer,
  ArrowRight,
  Mail,
  Paperclip,
  X,
  Edit3,
  Hash,
  Download,
  Search,
  Eye,
  Sparkles,
  QrCode,
  Layers,
  FileSpreadsheet,
  CheckSquare,
  Square,
  ChevronLeft,
  Maximize2,
  Upload,
  User,
  Scissors,
  Calendar,
  Bed,
  Plus,
  Trash2,
  HelpCircle,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Tag,
  CreditCard,
  IndianRupee,
} from "lucide-react"
import { useNotify } from "./ui"
import { InsuranceEngineService } from "../../services/insuranceDb"
import type { InsuranceCompanyConfig } from "../../types/insurance"

// ── AVAILABLE INSURER-SPECIFIC PRE-AUTH FORM TEMPLATES ──
export type PreAuthTemplateKey =
  | "good_health_tpa"
  | "irdai_standard"
  | "care_health"
  | "star_health"
  | "medi_assist"
  | "hdfc_fhpl"
  | "pmjay_tms"
  | "custom_template"

interface TemplateMeta {
  id: PreAuthTemplateKey
  name: string
  code: string
  tagColor: string
  accentBorder: string
  description: string
}

const FORM_TEMPLATES: TemplateMeta[] = [
  { id: "good_health_tpa", name: "Good Health Insurance TPA (4-Page Requisition)", code: "GHPL/CASHLESS/V2.4", tagColor: "bg-teal-50 text-teal-900 border-teal-300", accentBorder: "border-teal-700", description: "Official 4-page Good Health TPA cashless pre-authorization form with character box grids." },
  { id: "care_health", name: "Care Health (Religare) Cashless Requisition", code: "CHI/CASHLESS/V4.2", tagColor: "bg-blue-50 text-blue-900 border-blue-300", accentBorder: "border-blue-700", description: "Official Care Health retail & corporate cashless pre-authorization requisition format." },
  { id: "star_health", name: "Star Health & Allied Insurance Pre-Auth Form", code: "STAR/PREAUTH/2026", tagColor: "bg-red-50 text-red-900 border-red-300", accentBorder: "border-red-700", description: "Star Health cashless pre-authorization form with clinical history checklist." },
  { id: "irdai_standard", name: "IRDAI Uniform Cashless Requisition Form", code: "IRDAI/HLT/REG/2016", tagColor: "bg-indigo-50 text-indigo-900 border-indigo-300", accentBorder: "border-indigo-700", description: "Standard IRDAI prescribed uniform cashless pre-authorization form." },
  { id: "medi_assist", name: "Medi Assist TPA Standard Cashless Format", code: "MATPA/CASHLESS/V3", tagColor: "bg-emerald-50 text-emerald-900 border-emerald-300", accentBorder: "border-emerald-700", description: "Standard pre-authorization format for Medi Assist corporate & retail insurers." },
  { id: "hdfc_fhpl", name: "HDFC ERGO / FHPL Cashless Requisition", code: "HDFC-FHPL/PA-01", tagColor: "bg-purple-50 text-purple-900 border-purple-300", accentBorder: "border-purple-700", description: "Official cashless requisition format for HDFC ERGO processed via FHPL TPA." },
  { id: "pmjay_tms", name: "Ayushman Bharat PMJAY TMS Template", code: "PMJAY/TMS/HBP-2.2", tagColor: "bg-orange-50 text-orange-900 border-orange-300", accentBorder: "border-orange-700", description: "National Health Authority PMJAY Transaction Management System template." },
  { id: "custom_template", name: "Custom Network Hospital Cashless Format", code: "HOSP/CUSTOM/2026", tagColor: "bg-slate-50 text-slate-900 border-slate-300", accentBorder: "border-slate-700", description: "Custom network hospital pre-authorization format with itemized tariff schedule." },
]

// Pure 0 border-radius field styles with crisp standard enterprise scale and subtle focus
const sqField = "h-9 px-3 bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-700 rounded-none w-full transition-colors shadow-xs"

// Character box grid component for official letter-by-letter rendering in PDF boxes (0 border-radius)
function CharBoxGrid({
  value,
  count = 20,
  className = "",
  highlight = false,
  highlightColor = "bg-blue-50 border-blue-900 text-blue-950",
}: {
  value: string
  count?: number
  className?: string
  highlight?: boolean
  highlightColor?: string
}) {
  const chars = (value || "").toUpperCase().split("")
  const boxes = Array.from({ length: count })

  return (
    <div className={`inline-flex flex-wrap gap-[2px] items-center ${className}`}>
      {boxes.map((_, i) => {
        const char = chars[i] || ""
        return (
          <div
            key={i}
            className={`w-[19px] h-[21px] border rounded-none flex items-center justify-center font-mono text-[11px] font-bold transition-all ${
              char
                ? highlight
                  ? `${highlightColor} ring-1 ring-blue-500`
                  : "bg-blue-50/90 border-blue-900 text-blue-950"
                : "bg-white border-blue-900/40 text-slate-400"
            }`}
          >
            {char || "\u00A0"}
          </div>
        )
      })}
    </div>
  )
}

interface TariffRow {
  id: number
  catCode: string
  catColor: string
  category: string
  description: string
  amount: number
}

export default function PreAuthRequestView({
  onBack,
  onSubmitted,
}: {
  onBack: () => void
  onSubmitted: (caseId: string) => void
}) {
  const { notify, toastNode } = useNotify()
  const [step, setStep] = useState(1) // Step 1: Formulation, Step 2: Review Official Form, Step 3: Email Dispatch, Step 4: Live Tracking & Sanction Ingestion
  const [activePdfPage, setActivePdfPage] = useState<number>(1) // 1, 2, 3, 4, or 0 (All)
  const [highlightFields, setHighlightFields] = useState<boolean>(true)

  // Card collapse states
  const [collapseInsurer, setCollapseInsurer] = useState(false)
  const [collapseClinical, setCollapseClinical] = useState(false)
  const [collapseTariff, setCollapseTariff] = useState(false)

  // ── LOAD & LIVE-SYNC 30+ INSURERS FROM MASTER DATA ──
  const [masterInsurers, setMasterInsurers] = useState<InsuranceCompanyConfig[]>(() => InsuranceEngineService.getInsurers())
  useEffect(() => {
    const unsub = InsuranceEngineService.subscribe(() => {
      setMasterInsurers(InsuranceEngineService.getInsurers())
    })
    return unsub
  }, [])

  // Selected Insurer ID
  const [selectedInsurerId, setSelectedInsurerId] = useState<string>("INS-000") // Default to Good Health TPA
  const [selectedTemplate, setSelectedTemplate] = useState<PreAuthTemplateKey>("good_health_tpa")

  // Active Selected Insurer configuration from Master Data
  const activeInsurer = useMemo(() => {
    return masterInsurers.find((i) => i.id === selectedInsurerId) || masterInsurers[0] || {
      id: "INS-000",
      companyName: "Good Health Insurance TPA Limited",
      companyCode: "GHPL-TPA",
      tpaName: "Medi Assist TPA / Direct",
      preAuthEmail: "preauth@ghpltpa.com",
      preAuthFormCode: "GHPL/CASHLESS/V2.4",
      preAuthFormTemplate: "good_health_tpa",
      preAuthFormDocumentName: "Good_Health_TPA_PreAuth_Form_4Pages.pdf",
    }
  }, [masterInsurers, selectedInsurerId])

  // ── HOSPITAL DETAILS ──
  const [hospitalName] = useState("Keppler Hospitals")
  const [hospitalCity] = useState("Visakhapatnam")
  const [hospitalRohiniId] = useState("ROHINI-AP-530017-0091")
  const [hospitalTpaId] = useState("GHTPA-HOSP-8921")
  const [hospitalPhone] = useState("040-23456789")
  const [hospitalEmail] = useState("insurance@enterprisehospital.com")

  // ── PATIENT & POLICY DATA (Auto-filled from Intake / EMR) ──
  const [uhid] = useState("UH001256")
  const [admissionNo] = useState("IP20250928012")
  const [patientName] = useState("RAMESH KUMAR")
  const [age] = useState("45")
  const [gender] = useState("Male")
  const [dob] = useState("15/06/1981")
  const [contact] = useState("9876543210")
  const [policyNo] = useState("CH1234567890")
  const [tpaCardId] = useState("GHTPA-982142")
  const [corporate] = useState("TECHCORP SOLUTIONS PVT LTD")
  const [employeeId] = useState("EMP-84920")
  const [sumInsured] = useState("500000")
  const [admissionType] = useState("Planned")
  const [admissionDate] = useState("28/09/2026")
  const [department, setDepartment] = useState("General Surgery")
  const [roomCategory] = useState("Single Private AC (Room 305)")

  // ── TREATING DOCTOR & CLINICAL DATA ──
  const [doctor, setDoctor] = useState("DR. SURESH REDDY")
  const [doctorRegNo, setDoctorRegNo] = useState("APMC-64821")
  const [doctorQualification] = useState("MS (GENERAL SURGERY), FIAGES")
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState("ACUTE APPENDICITIS WITH LOCALIZED PERITONITIS")
  const [icd10Code, setIcd10Code] = useState("K35.80")
  const [icd10Pcs, setIcd10Pcs] = useState("0DTJ4ZZ")
  const [procedure, setProcedure] = useState("LAPAROSCOPIC APPENDECTOMY")
  const [firstConsultDate, setFirstConsultDate] = useState("26/09/2026")
  const [plannedAdmissionDate, setPlannedAdmissionDate] = useState("28/09/2026")
  const [expectedStay, setExpectedStay] = useState("03 Days")
  const [clinicalHistory, setClinicalHistory] = useState(
    "Patient presented with acute right lower quadrant abdominal pain, guarding, fever (100.4°F), and leukocytosis (TLC 14,200). USG Abdomen confirms acute inflamed appendix (8.4mm diameter) with periappendiceal fluid."
  )

  // ── ITEMIZED TARIFF & COST BREAKDOWN TABLE ──
  const [activeTariffTab, setActiveTariffTab] = useState<"packages" | "custom" | "history">("packages")
  const [tariffRows, setTariffRows] = useState<TariffRow[]>([
    { id: 1, catCode: "R", catColor: "bg-emerald-700", category: "Room Rent & Nursing", description: "General Ward - Room Rent per day", amount: 15000 },
    { id: 2, catCode: "S", catColor: "bg-teal-700", category: "Surgeon & Specialist Fees", description: "Surgeon Fee (Laparoscopic)", amount: 45000 },
    { id: 3, catCode: "A", catColor: "bg-cyan-700", category: "Anesthetist Charges", description: "Anesthesia Charges", amount: 10000 },
    { id: 4, catCode: "OT", catColor: "bg-rose-700", category: "OT Charges & Consumables", description: "OT Charges (Laparoscopic)", amount: 10000 },
    { id: 5, catCode: "P", catColor: "bg-purple-700", category: "Pharmacy & Medicines", description: "Medicines & Consumables (Estimated)", amount: 7000 },
    { id: 6, catCode: "D", catColor: "bg-indigo-700", category: "Diagnostic Labs & Radiology", description: "USG Abdomen & Routine Lab Investigations", amount: 8000 },
  ])

  const totalEstimatedCost = useMemo(() => {
    return tariffRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [tariffRows])

  // ── ATTACHED DOSSIER ──
  const manualFileInputRef = useRef<HTMLInputElement>(null)
  const [attachedFiles, setAttachedFiles] = useState([
    { id: 1, name: "Auto-Incorporated Pre-Auth Form (4 Pages)", size: "480 KB", iconBg: "bg-rose-600" },
    { id: 2, name: "Good Health TPA / Insurer Card Copy", size: "190 KB", iconBg: "bg-amber-600" },
    { id: 3, name: "Patient Aadhaar Photo ID Proof", size: "420 KB", iconBg: "bg-blue-600" },
    { id: 4, name: "Doctor Clinical Note & Prescription", size: "280 KB", iconBg: "bg-indigo-600" },
    { id: 5, name: "USG Abdomen & Laboratory Reports", size: "640 KB", iconBg: "bg-emerald-600" },
  ])

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newFiles = files.map((file, idx) => ({
      id: Date.now() + idx,
      name: file.name,
      size: `${Math.round(file.size / 1024)} KB`,
      iconBg: "bg-blue-600",
    }))
    setAttachedFiles((prev) => [...prev, ...newFiles])
    try {
      const claims = InsuranceEngineService.getClaims()
      if (claims[0]) {
        files.forEach((file, idx) => {
          InsuranceEngineService.uploadDocument(claims[0].id, `DOC-MANUAL-${Date.now()}-${idx}`, file.name)
        })
      }
    } catch { /* ignore */ }
    notify(`${files.length} manual document${files.length > 1 ? "s" : ""} attached successfully`, "success")
    e.target.value = ""
  }

  const handleRemoveFile = (id: number) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
    notify("Attachment removed", "success")
  }

  // ── EMAIL DISPATCH STATE ──
  const [emailTo, setEmailTo] = useState("preauth@ghpltpa.com")
  const [emailCc, setEmailCc] = useState("insurance-desk@kepplerhospitals.com, ramesh.kumar@patient.in")
  const [emailSubject, setEmailSubject] = useState(
    `[PRE-AUTH REQUEST] UH001256 - IP20250928012 - RAMESH KUMAR - ${procedure} - ${activeInsurer.companyName}`
  )
  const [emailBody, setEmailBody] = useState("")

  // Populate Default Email Template when Insurer changes
  useEffect(() => {
    const targetEmail = activeInsurer.preAuthEmail || "preauth@insurance.com"
    setEmailTo(targetEmail)
    setEmailSubject(`[PRE-AUTH CASHLESS] ${uhid} / ${admissionNo} - ${patientName} - ${procedure} - ${activeInsurer.companyName}`)
    setEmailBody(
      `TO: ${activeInsurer.companyName} / ${activeInsurer.tpaName || "TPA Pre-Auth Desk"}\n` +
      `ATTN: Inpatient Pre-Authorization Medical Adjudication Desk\n` +
      `DATE: 28-SEP-2026\n\n` +
      `Dear Medical Adjudication Team,\n\n` +
      `We submit herewith the official Cashless Pre-Authorization Requisition (${activeInsurer.preAuthFormCode || "GHPL/CASHLESS/V2.4"}) for our patient ${patientName} (${age}Y/${gender}), holding Policy No: ${policyNo} / TPA Card ID: ${tpaCardId} under ${corporate}.\n\n` +
      `PATIENT & CLINICAL SUMMARY:\n` +
      `• Patient Name          : ${patientName} (UHID: ${uhid} | IP Ref: ${admissionNo})\n` +
      `• Hospital / ROHINI ID  : ${hospitalName} (${hospitalRohiniId})\n` +
      `• Treating Consultant   : ${doctor} (${doctorRegNo})\n` +
      `• Provisional Diagnosis : ${provisionalDiagnosis} [ICD-10: ${icd10Code}]\n` +
      `• Proposed Procedure    : ${procedure} [ICD-10 PCS: ${icd10Pcs}]\n` +
      `• Planned Admission     : ${plannedAdmissionDate} (Expected Stay: ${expectedStay})\n` +
      `• Total Estimate (₹)    : Rs. ${totalEstimatedCost.toLocaleString()} (INR ${totalEstimatedCost})\n\n` +
      `ATTACHED MANDATORY DOCUMENTS IN DOSSIER (${attachedFiles.length} Files):\n` +
      attachedFiles.map((f, i) => `${i + 1}. ${f.name} (${f.size})`).join("\n") +
      `\n\nKindly issue the Initial Cashless Pre-Authorization Sanction Letter at your earliest convenience to facilitate planned admission.\n\n` +
      `Warm regards,\n` +
      `Nodal Insurance Desk\n` +
      `${hospitalName} (${hospitalCity})\n` +
      `Emergency Contact: ${hospitalPhone} | Email: ${hospitalEmail}`
    )
  }, [activeInsurer, patientName, uhid, admissionNo, policyNo, tpaCardId, corporate, age, gender, doctor, doctorRegNo, provisionalDiagnosis, icd10Code, procedure, icd10Pcs, plannedAdmissionDate, expectedStay, totalEstimatedCost, hospitalName, hospitalRohiniId, hospitalCity, hospitalPhone, hospitalEmail, attachedFiles])

  // ── INBOUND TPA SANCTION / APPROVAL INGESTION STATE ──
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalOutcome, setApprovalOutcome] = useState<"Approved" | "Partially Approved" | "Query" | "Rejected">("Approved")
  const [approvalCode, setApprovalCode] = useState("AUTH-GHPL-2026-98124")
  const [approvedAmount, setApprovedAmount] = useState("65000")
  const [approvedRoom, setApprovedRoom] = useState("Single Private AC")
  const [approvalNotes, setApprovalNotes] = useState("Initial Pre-Auth sanction approved up to Rs. 65,000 for Laparoscopic Appendectomy. Enhancement may be requested 24h prior to discharge if bill exceeds.")
  const [approvalLetterFile, setApprovalLetterFile] = useState("GoodHealth_Sanction_AUTH-98124.pdf")
  const [approvalRecorded, setApprovalRecorded] = useState(false)
  const [inboundEmailReceivedAt, setInboundEmailReceivedAt] = useState("28-Sep-2026 03:45 PM")

  // Helper to dynamically get the active claim id from storage
  const getActiveClaimId = () => {
    try {
      const claims = InsuranceEngineService.getClaims()
      return claims[0]?.id || "CLM-2026-8924"
    } catch {
      return "CLM-2026-8924"
    }
  }

  // ── WHEN INSURER IS SELECTED ──
  const handleSelectInsurer = (insId: string) => {
    setSelectedInsurerId(insId)
    const ins = masterInsurers.find((i) => i.id === insId)
    if (ins) {
      const tplKey = (ins.preAuthFormTemplate as PreAuthTemplateKey) || "care_health"
      setSelectedTemplate(tplKey)
      notify(`Loaded ${ins.companyName} (${ins.preAuthFormCode || "CHI/CASHLESS/V4.2"})`, "success")
    }
  }

  // Real Print Handler
  const handlePrintForm = () => {
    window.print()
  }

  // Real PDF Download / Export simulation
  const handleDownloadFilledPdf = () => {
    const docData = `
================================================================================
4-PAGE CASHLESS PRE-AUTHORIZATION REQUISITION FORM - ${activeInsurer.companyName.toUpperCase()}
FORMAT CODE: ${activeInsurer.preAuthFormCode || "CHI/CASHLESS/V4.2"}
HOSPITAL: ${hospitalName} | ROHINI ID: ${hospitalRohiniId}
CASE ID: INS20250928056 | DATE: 28-SEP-2026
================================================================================

[PAGE 1: TPA & HOSPITAL DETAILS & PATIENT DEMOGRAPHICS]
- TPA Name          : ${activeInsurer.companyName}
- Hospital Name     : ${hospitalName} (ROHINI: ${hospitalRohiniId})
- Patient Name      : ${patientName} (${age} YRS / ${gender} / DOB: ${dob})
- Hospital UHID     : ${uhid} | IP Ref: ${admissionNo} | Contact: ${contact}
- Policy Number     : ${policyNo} | TPA Card ID: ${tpaCardId}
- Corporate Group   : ${corporate} (Employee ID: ${employeeId})
- Insured Amount    : Rs. ${parseInt(sumInsured).toLocaleString()}

[PAGE 2: TREATING DOCTOR & CLINICAL FINDINGS]
- Treating Doctor   : ${doctor} (Reg: ${doctorRegNo})
- Qualifications    : ${doctorQualification} | Dept: ${department}
- Provisional Diag. : ${provisionalDiagnosis} (ICD-10: ${icd10Code})
- Proposed Line     : SURGICAL MANAGEMENT - ${procedure} (ICD-10 PCS: ${icd10Pcs})
- Consultation Date : ${firstConsultDate} | Expected Stay: ${expectedStay}

[PAGE 3: ADMISSION DETAILS & TARIFF ESTIMATE]
- Admission Date    : ${plannedAdmissionDate} | Type: ${admissionType}
- Room Category     : ${roomCategory}
${tariffRows.map((r) => `- ${r.category.padEnd(30)}: Rs. ${r.amount.toLocaleString()}`).join("\n")}
--------------------------------------------------------------------------------
TOTAL PRE-AUTH ESTIMATE : Rs. ${totalEstimatedCost.toLocaleString()}
--------------------------------------------------------------------------------

[PAGE 4: DECLARATIONS & SIGNATURES]
- Patient Signature : Verified (${patientName})
- Doctor Signature  : Verified (${doctor}, APMC-64821)
- Hospital Stamp    : Keppler Hospitals Nodal Insurance Desk
================================================================================
`
    const blob = new Blob([docData], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `PreAuth_${activeInsurer.companyCode || "CHI"}_${uhid}_${admissionNo}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    notify(`Downloaded 4-Page Pre-Auth dossier for ${patientName}!`, "success")
  }

  const handleSendEmailDispatch = () => {
    try {
      const claims = InsuranceEngineService.getClaims()
      const existing = claims[0]
      if (existing) {
        InsuranceEngineService.submitPreAuth(existing.id, "Email", `MAIL-${Date.now().toString(36).toUpperCase()}`)
        const extraAtts = attachedFiles.map((f) => `${f.name} (${f.size})`)
        InsuranceEngineService.sendInsurerEmail(existing.id, {
          purpose: "Pre-Auth",
          to: emailTo,
          cc: emailCc,
          subject: emailSubject,
          body: emailBody,
          attachmentIds: [],
          extraAttachments: extraAtts,
        })
      }
      setStep(4)
      notify(`Pre-Authorization package successfully emailed to ${emailTo}!`, "success")
    } catch (e) {
      notify((e as Error).message || "Email dispatch failed", "error")
    }
  }

  const handleRecordInboundApproval = () => {
    try {
      const claims = InsuranceEngineService.getClaims()
      const existing = claims[0]
      if (existing) {
        InsuranceEngineService.recordPreAuthResponse(existing.id, {
          outcome: approvalOutcome,
          amount: parseInt(approvedAmount) || 65000,
          approvalCode: approvalCode.trim() || "AUTH-CARE-2026-98124",
          note: approvalNotes,
        })
      }
      setApprovalRecorded(true)
      setShowApprovalModal(false)
      notify(`Pre-Authorization Sanction Letter [${approvalCode}] recorded successfully!`, "success")
    } catch (e) {
      notify((e as Error).message || "Failed to record approval", "error")
    }
  }

  const currentTemplate = FORM_TEMPLATES.find((t) => t.id === selectedTemplate) || FORM_TEMPLATES[0]

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 overflow-y-auto font-sans text-slate-800 rounded-none">
      {toastNode}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER & BREADCRUMB (0 BORDER RADIUS / SQUARED)        */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-300 px-6 py-3.5 sticky top-0 z-30 rounded-none shadow-md shadow-slate-200/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-blue-600 text-white flex items-center justify-center font-bold">
              <Mail size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span className="hover:text-slate-700 cursor-pointer">Home</span>
                <span>/</span>
                <span className="hover:text-slate-700 cursor-pointer">Insurance</span>
                <span>/</span>
                <span className="hover:text-slate-700 cursor-pointer">Pre-Authorization</span>
                <span>/</span>
                <span className="text-slate-900 font-bold">New Request</span>
              </div>
              <div className="flex items-center gap-2.5 mt-0.5">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Pre-Authorization Requisition
                </h1>
                <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                  {activeInsurer.preAuthFormCode || "CHI/CASHLESS/V4.2"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Create and submit a pre-authorization request to insurer / TPA for cashless treatment.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-slate-100 border border-slate-300 text-xs font-mono text-slate-700">
              <span className="text-blue-600 font-bold">#</span> Case ID: <span className="font-bold text-slate-900">INS20250928056</span>
            </div>

            <button
              type="button"
              className="h-9 px-3.5 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              onClick={() => notify("Draft saved successfully", "success")}
            >
              <Save size={14} className="text-blue-600" /> Save Draft
            </button>

            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-9 px-4 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText size={14} /> View 4-Page Form <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-9 px-4 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                ← Edit Form Data
              </button>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* HORIZONTAL STEPPER (0 BORDER RADIUS / SQUARED)              */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between max-w-4xl mx-auto pt-4 pb-1 text-xs">
          {[
            { n: 1, label: "Insurer & Clinical Details" },
            { n: 2, label: "Form Preview & Auto-Data" },
            { n: 3, label: "Dispatch to TPA" },
            { n: 4, label: "Sanction & Admit" },
          ].map((s, idx) => (
            <React.Fragment key={s.n}>
              <div
                onClick={() => setStep(s.n)}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <div
                  className={`w-6 h-6 rounded-none flex items-center justify-center font-bold text-[11px] transition-all border ${
                    step === s.n
                      ? "bg-blue-600 text-white border-blue-700"
                      : step > s.n
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-500 border-slate-300 group-hover:border-slate-400"
                  }`}
                >
                  {step > s.n ? <Check size={13} /> : s.n}
                </div>
                <span
                  className={`font-semibold tracking-tight ${
                    step === s.n ? "text-blue-700 font-bold" : "text-slate-600 group-hover:text-slate-900"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < 3 && (
                <div
                  className={`flex-1 h-0.5 mx-3 transition-all ${
                    step > idx + 1 ? "bg-slate-800" : "bg-slate-300"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. MAIN CONTENT (STEP 1: SQUARED ENTERPRISE DASHBOARD)        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="p-6 max-w-[1600px] mx-auto w-full space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ══════════════════════════════════════════════════════════ */}
            {/* LEFT COLUMN: 8 COLS (INSURER, CLINICAL & TARIFFS)          */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-8 space-y-6">
              {/* CARD 1: INSURER & FORM SELECTION */}
              <div className="bg-white border border-slate-300 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex items-center justify-between cursor-pointer border-b border-slate-200 pb-3" onClick={() => setCollapseInsurer(!collapseInsurer)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-none bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold">
                      <Building2 size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Insurer &amp; Form Selection</h2>
                      <p className="text-xs text-slate-500">Select insurer and pre-authorization form template</p>
                    </div>
                  </div>
                  <button type="button" className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    {collapseInsurer ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                  </button>
                </div>

                {!collapseInsurer && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {/* Select Insurer Card */}
                    <div className="p-3.5 bg-slate-50 rounded-none border border-slate-300 space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                        Insurance Partner (Master Data) *
                      </label>
                      <div className="relative">
                        <select
                          value={selectedInsurerId}
                          onChange={(e) => handleSelectInsurer(e.target.value)}
                          className={`${sqField} font-bold pr-8`}
                        >
                          {masterInsurers.map((ins) => (
                            <option key={ins.id} value={ins.id}>
                              {ins.companyName} ({ins.companyCode}) — {ins.tpaName || "Direct"}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
                      </div>
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-600">
                        <span className="w-5 h-5 rounded-none bg-amber-200 text-amber-900 font-bold text-[9px] flex items-center justify-center uppercase border border-amber-300">
                          care
                        </span>
                        <span>{activeInsurer.tpaName || "Medi Assist TPA / Direct"}</span>
                      </div>
                    </div>

                    {/* Select Template Card */}
                    <div className="p-3.5 bg-slate-50 rounded-none border border-slate-300 space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                        Pre-Authorization Form Template *
                      </label>
                      <div className="relative">
                        <select
                          value={selectedTemplate}
                          onChange={(e) => setSelectedTemplate(e.target.value as PreAuthTemplateKey)}
                          className={`${sqField} font-bold pr-8`}
                        >
                          {FORM_TEMPLATES.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.name} [{tpl.code}]
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
                      </div>
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-600">
                        <span className="w-5 h-5 rounded-none bg-purple-100 text-purple-900 font-bold text-[10px] flex items-center justify-center border border-purple-300">
                          <FileText size={12} />
                        </span>
                        <span className="font-mono text-purple-900 font-bold">{activeInsurer.preAuthFormCode || currentTemplate.code}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 2: TREATING CONSULTANT & CLINICAL INFORMATION */}
              <div className="bg-white border border-slate-300 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex items-center justify-between cursor-pointer border-b border-slate-200 pb-3" onClick={() => setCollapseClinical(!collapseClinical)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-none bg-cyan-50 border border-cyan-200 text-cyan-700 flex items-center justify-center font-bold">
                      <Stethoscope size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Treating Consultant &amp; Clinical Information</h2>
                      <p className="text-xs text-slate-500">Enter consultant, diagnosis and procedure details</p>
                    </div>
                  </div>
                  <button type="button" className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    {collapseClinical ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                  </button>
                </div>

                {!collapseClinical && (
                  <div className="space-y-3.5 pt-1 text-xs">
                    {/* Row 1: Doctor, Reg No, Department (Equal 3-column grid, perfectly aligned) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          Treating Consultant *
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <User size={14} />
                          </div>
                          <input
                            type="text"
                            value={doctor}
                            onChange={(e) => setDoctor(e.target.value)}
                            className={`${sqField} pl-9 font-bold text-slate-900`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          State Council Reg No *
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-600 pointer-events-none">
                            <Shield size={14} />
                          </div>
                          <input
                            type="text"
                            value={doctorRegNo}
                            onChange={(e) => setDoctorRegNo(e.target.value)}
                            className={`${sqField} pl-9 font-mono font-bold text-blue-900`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          Department *
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <Building2 size={14} />
                          </div>
                          <select
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            className={`${sqField} pl-9 font-bold text-slate-900`}
                          >
                            <option value="General Surgery">General Surgery</option>
                            <option value="Orthopaedics">Orthopaedics</option>
                            <option value="Cardiology">Cardiology</option>
                            <option value="Gastroenterology">Gastroenterology</option>
                            <option value="Neurosurgery">Neurosurgery</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Diagnosis, ICD-10 Code, ICD-10 PCS (Balanced 6-3-3 grid, perfectly aligned) */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                      <div className="sm:col-span-6">
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          Provisional Diagnosis *
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <Search size={14} />
                          </div>
                          <input
                            type="text"
                            value={provisionalDiagnosis}
                            onChange={(e) => setProvisionalDiagnosis(e.target.value)}
                            className={`${sqField} pl-9 font-semibold text-slate-900`}
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          ICD-10 Diagnosis Code *
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <Tag size={14} />
                          </div>
                          <input
                            type="text"
                            value={icd10Code}
                            onChange={(e) => setIcd10Code(e.target.value)}
                            className={`${sqField} pl-9 font-mono font-bold text-emerald-800`}
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          ICD-10 PCS Code
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <FileText size={14} />
                          </div>
                          <input
                            type="text"
                            value={icd10Pcs}
                            onChange={(e) => setIcd10Pcs(e.target.value)}
                            className={`${sqField} pl-9 font-mono font-semibold text-slate-800`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Procedure, Consultation Date, Admission Date, Expected Stay (Balanced 4-col 4-3-3-2 grid with equal height labels) */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                      <div className="sm:col-span-4">
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          Proposed Procedure / Surgery *
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-600 pointer-events-none">
                            <Scissors size={14} />
                          </div>
                          <input
                            type="text"
                            value={procedure}
                            onChange={(e) => setProcedure(e.target.value)}
                            className={`${sqField} pl-9 font-bold text-slate-900`}
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          1st Consultation Date
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <Calendar size={14} />
                          </div>
                          <input
                            type="text"
                            value={firstConsultDate}
                            onChange={(e) => setFirstConsultDate(e.target.value)}
                            className={`${sqField} pl-9 font-semibold`}
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          Planned Admission Date
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <Calendar size={14} />
                          </div>
                          <input
                            type="text"
                            value={plannedAdmissionDate}
                            onChange={(e) => setPlannedAdmissionDate(e.target.value)}
                            className={`${sqField} pl-9 font-semibold`}
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1 whitespace-nowrap truncate">
                          Expected Stay (Days)
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                            <Bed size={14} />
                          </div>
                          <input
                            type="text"
                            value={expectedStay}
                            onChange={(e) => setExpectedStay(e.target.value)}
                            className={`${sqField} pl-9 font-bold`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Row 4: Clinical Findings & Notes */}
                    <div>
                      <div className="h-5 flex items-center justify-between mb-1">
                        <label className="text-[11.5px] font-bold text-slate-700 block whitespace-nowrap">
                          Clinical Findings &amp; Examination Notes *
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">142/1000</span>
                      </div>
                      <div className="relative">
                        <div className="absolute left-3 top-3 text-blue-600 pointer-events-none">
                          <FileText size={15} />
                        </div>
                        <textarea
                          rows={2}
                          value={clinicalHistory}
                          onChange={(e) => setClinicalHistory(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-none text-xs text-slate-800 focus:outline-none focus:border-blue-700 leading-relaxed shadow-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 3: ITEMIZED HOSPITAL TARIFF & COST ESTIMATION */}
              <div className="bg-white border border-slate-300 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 cursor-pointer border-b border-slate-200 pb-3" onClick={() => setCollapseTariff(!collapseTariff)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-none bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold">
                      <Layers size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Itemized Hospital Tariff &amp; Cost Estimation</h2>
                      <p className="text-xs text-slate-500">Add estimated charges based on hospital package or itemized services</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-none bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs font-mono">
                      Estimated Total: <span className="text-amber-700 font-black">₹ {totalEstimatedCost.toLocaleString()}</span>
                    </span>
                    <button type="button" className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      {collapseTariff ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </button>
                  </div>
                </div>

                {!collapseTariff && (
                  <div className="space-y-3 pt-1">
                    {/* Sub-tab pills (Squared) */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center bg-slate-100 p-0.5 border border-slate-300 text-xs font-semibold rounded-none">
                        <button
                          type="button"
                          onClick={() => setActiveTariffTab("packages")}
                          className={`px-3 py-1 rounded-none transition-all cursor-pointer ${
                            activeTariffTab === "packages" ? "bg-slate-800 text-white font-bold" : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Common Packages
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTariffTab("custom")}
                          className={`px-3 py-1 rounded-none transition-all cursor-pointer ${
                            activeTariffTab === "custom" ? "bg-slate-800 text-white font-bold" : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Custom Items
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTariffTab("history")}
                          className={`px-3 py-1 rounded-none transition-all cursor-pointer ${
                            activeTariffTab === "history" ? "bg-slate-800 text-white font-bold" : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Previous History
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const newRow: TariffRow = {
                            id: tariffRows.length + 1,
                            catCode: "O",
                            catColor: "bg-slate-700",
                            category: "Additional Special Services",
                            description: "Custom Clinical Consumables",
                            amount: 5000,
                          }
                          setTariffRows([...tariffRows, newRow])
                          notify("Added custom service line item", "success")
                        }}
                        className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={14} /> Add Custom Item
                      </button>
                    </div>

                    {/* Rich Data Table (Squared) */}
                    <div className="overflow-x-auto border border-slate-300 rounded-none">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                            <th className="py-2.5 px-3 w-12 text-center border-r border-slate-300">#</th>
                            <th className="py-2.5 px-3 border-r border-slate-300">Service Category</th>
                            <th className="py-2.5 px-3 border-r border-slate-300">Description</th>
                            <th className="py-2.5 px-3 text-right border-r border-slate-300">Amount (₹)</th>
                            <th className="py-2.5 px-3 w-20 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {tariffRows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50 transition-colors font-medium">
                              <td className="py-2 px-3 text-center text-slate-500 border-r border-slate-200 font-mono">{row.id}</td>
                              <td className="py-2 px-3 border-r border-slate-200">
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-none text-white font-bold text-[10px] flex items-center justify-center ${row.catColor}`}>
                                    {row.catCode}
                                  </span>
                                  <span className="font-bold text-slate-800">{row.category}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-slate-600 border-r border-slate-200">{row.description}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                                {row.amount.toLocaleString()}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-2 text-slate-400">
                                  <button type="button" className="hover:text-blue-600 transition-colors cursor-pointer" title="Edit row">
                                    <Edit3 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (tariffRows.length > 1) {
                                        setTariffRows(tariffRows.filter((r) => r.id !== row.id))
                                      }
                                    }}
                                    className="hover:text-red-600 transition-colors cursor-pointer"
                                    title="Remove row"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* RIGHT COLUMN: 4 COLS (PATIENT CARD, DOSSIER & NOTES)       */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-4 space-y-6">
              {/* CARD A: PATIENT & POLICY DETAILS */}
              <div className="bg-white border border-slate-300 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-none bg-pink-50 border border-pink-200 text-pink-700 flex items-center justify-center font-bold">
                      <User size={16} />
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Patient &amp; Policy Details</h3>
                  </div>
                  <button
                    type="button"
                    onClick={onBack}
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink size={12} /> From Intake Desk
                  </button>
                </div>

                {/* Patient Avatar & Title (Squared) */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-none bg-blue-700 text-white font-black text-sm flex items-center justify-center font-mono">
                    RK
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{patientName} ({age}Y/{gender})</h4>
                      <span className="px-2 py-0.5 rounded-none bg-emerald-100 text-emerald-900 font-bold text-[10px] border border-emerald-300 flex items-center gap-0.5">
                        <Check size={10} /> Active Case
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      UHID: <strong className="text-slate-800">{uhid}</strong> | IP No: <strong className="text-slate-800">{admissionNo}</strong>
                    </div>
                  </div>
                </div>

                {/* 2x3 Grid of Patient Attribute Tiles (Squared) */}
                <div className="grid grid-cols-2 gap-2.5 text-xs pt-1">
                  <div className="p-2.5 bg-slate-50 rounded-none border border-slate-300 flex items-start gap-2">
                    <div className="text-blue-700 mt-0.5"><Shield size={14} /></div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Policy Number</span>
                      <span className="font-mono font-bold text-slate-900">{policyNo}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-none border border-slate-300 flex items-start gap-2">
                    <div className="text-blue-700 mt-0.5"><CreditCard size={14} /></div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">TPA Card ID</span>
                      <span className="font-mono font-bold text-slate-900">{tpaCardId}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-none border border-slate-300 flex items-start gap-2">
                    <div className="text-amber-700 mt-0.5"><Building2 size={14} /></div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Corporate Group</span>
                      <span className="font-bold text-slate-900 truncate block max-w-[110px]" title={corporate}>{corporate}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-none border border-slate-300 flex items-start gap-2">
                    <div className="text-emerald-700 mt-0.5"><IndianRupee size={14} /></div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Insured Amount</span>
                      <span className="font-mono font-bold text-emerald-800">₹ {parseInt(sumInsured).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-none border border-slate-300 flex items-start gap-2">
                    <div className="text-purple-700 mt-0.5"><Building2 size={14} /></div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Hospital</span>
                      <span className="font-bold text-slate-900">{hospitalName}</span>
                      <span className="text-[10px] text-slate-500 block">{hospitalCity}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-none border border-slate-300 flex items-start gap-2">
                    <div className="text-indigo-700 mt-0.5"><Bed size={14} /></div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Admission Type</span>
                      <span className="font-bold text-slate-900">{admissionType}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD B: ATTACHED DOSSIER (5) */}
              <div className="bg-white border border-slate-300 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-none bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold">
                      <Layers size={16} />
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Attached Dossier ({attachedFiles.length})</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-none bg-emerald-100 text-emerald-900 font-bold text-[10px] border border-emerald-300 flex items-center gap-0.5">
                      <Check size={10} /> Ready
                    </span>
                    <button
                      type="button"
                      onClick={() => manualFileInputRef.current?.click()}
                      className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus size={13} /> Upload
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  {attachedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-none border border-slate-300 flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-none bg-emerald-600 shrink-0" />
                        <span className={`w-5 h-5 rounded-none text-white font-bold text-[9px] flex items-center justify-center shrink-0 ${file.iconBg}`}>
                          <FileText size={11} />
                        </span>
                        <span className="truncate font-semibold text-slate-800">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">{file.size}</span>
                        <button type="button" className="text-blue-600 hover:text-blue-800 p-0.5 cursor-pointer" title="View file">
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(file.id)}
                          className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
                          title="Remove file"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CARD C: IMPORTANT NOTES (Squared) */}
              <div className="bg-amber-50/60 border-l-4 border-l-amber-500 border-y border-r border-amber-300 rounded-none p-4 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 text-amber-950 font-bold">
                  <Lightbulb size={16} className="text-amber-700" />
                  <span>Important Notes</span>
                </div>
                <ul className="space-y-1.5 text-[11.5px] text-amber-950 leading-normal list-disc pl-4">
                  <li>Form will be auto-populated with insured patient and admission details.</li>
                  <li>Please verify all clinical and cost details before proceeding.</li>
                  <li>Required documents must be attached to submit the request.</li>
                  <li>You can save as draft and continue later.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* BOTTOM ACTION BAR (0 BORDER RADIUS / SQUARED)               */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="bg-white border border-slate-300 rounded-none p-4 flex flex-wrap items-center justify-between gap-3 shadow-md shadow-slate-200/60">
            <button
              type="button"
              onClick={onBack}
              className="h-9 px-4 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <X size={14} /> Cancel
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => notify("All form fields validated with zero clinical discrepancies!", "success")}
                className="h-9 px-4 rounded-none bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle2 size={14} className="text-purple-700" /> Validate Form
              </button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-10 px-6 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span>Continue to Step 2</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. STEP 2: 4-PAGE AUTHENTIC OFFICIAL FORM VIEWER (SQUARED)    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
          {/* Top 4-Page Navigation Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-none border border-slate-300 shadow-md shadow-slate-200/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pages:</span>
              <div className="flex items-center bg-slate-100 p-0.5 border border-slate-300 rounded-none text-xs font-semibold">
                {[
                  { p: 1, label: "Page 1 (TPA & Patient)" },
                  { p: 2, label: "Page 2 (Doctor & Clinical)" },
                  { p: 3, label: "Page 3 (Admission & Tariff)" },
                  { p: 4, label: "Page 4 (Declarations)" },
                  { p: 0, label: "All 4 Pages" },
                ].map((item) => (
                  <button
                    key={item.p}
                    type="button"
                    onClick={() => setActivePdfPage(item.p)}
                    className={`px-3 py-1.5 rounded-none transition-all cursor-pointer ${
                      activePdfPage === item.p
                        ? "bg-blue-600 text-white font-bold"
                        : "text-slate-700 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setHighlightFields(!highlightFields)}
                className={`h-9 px-3 rounded-none border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  highlightFields
                    ? "bg-blue-50 border-blue-400 text-blue-900"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Sparkles size={13} className={highlightFields ? "text-blue-600" : "text-slate-400"} />
                <span>{highlightFields ? "Data Highlighted" : "Plain View"}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintForm}
                className="h-9 px-3.5 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer size={14} /> Print
              </button>

              <button
                type="button"
                onClick={handleDownloadFilledPdf}
                className="h-9 px-4 rounded-none bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download size={14} /> Download 4-Page Form
              </button>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* THE AUTHENTIC 4-PAGE PRE-AUTHORIZATION FORM CONTAINER       */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="space-y-8">
            {/* PAGE 1 */}
            {(activePdfPage === 1 || activePdfPage === 0) && (
              <div className="bg-white border-2 border-slate-400 p-7 rounded-none shadow-xl shadow-slate-300/80 space-y-4 text-slate-900 font-sans relative">
                {/* Official Header */}
                <div className="bg-[#14b8a6] text-white p-3.5 rounded-none flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black tracking-wide uppercase">PRE – AUTHORIZATION FORM</h2>
                    <p className="text-[10px] font-medium tracking-wide uppercase">REQUEST FOR CASHLESS HOSPITALIZATION FOR HEALTH INSURANCE POLICY / TO BE FILLED IN BLOCK LETTERS</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black uppercase">{activeInsurer.companyName}</div>
                    <div className="text-[9px] text-teal-100">IRDAI REG / TPA LICENCE NO: 017</div>
                  </div>
                </div>

                {/* Orange Page Ribbon & Contact Details Box */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-800 pb-2 text-[11px]">
                  <span className="px-3 py-1 bg-[#f97316] text-white font-bold text-[10.5px] rounded-none italic">
                    Please fill all pages : This is Page 1 of 4
                  </span>
                  <div className="text-right text-[10px] text-slate-700 font-mono">
                    <span>Tel: 1860 425 3232 | Fax: 1860 425 4242 | Email: {emailTo} | Web: {activeInsurer.portalUrl || "www.goodhealthtpa.com"}</span>
                  </div>
                </div>

                {/* SECTION 1: DETAILS OF THIRD PARTY ADMINISTRATOR AND HOSPITAL */}
                <div className="border border-blue-900 rounded-none overflow-hidden">
                  <div className="bg-blue-950 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-2">
                    <span className="w-4 h-4 rounded-none bg-blue-600 flex items-center justify-center text-[10px]">1</span>
                    <span>DETAILS OF THIRD PARTY ADMINISTRATOR AND HOSPITAL</span>
                  </div>

                  <div className="p-3 bg-slate-50 space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="w-44 font-semibold text-slate-700">NAME OF THE TPA:</span>
                      <CharBoxGrid value={activeInsurer.companyName} count={35} highlight={highlightFields} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span className="w-44 font-semibold text-slate-700">TOLL FREE PHONE NO:</span>
                        <CharBoxGrid value="18004253232" count={12} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">TOLL FREE FAX NO:</span>
                        <CharBoxGrid value="18604254242" count={12} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="w-44 font-semibold text-slate-700">HOSPITAL NAME:</span>
                      <CharBoxGrid value={hospitalName} count={35} highlight={highlightFields} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="w-44 font-semibold text-slate-700">HOSPITAL LOCATION:</span>
                      <CharBoxGrid value="SECTOR 4 BEACH ROAD VIZAG" count={35} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span className="w-44 font-semibold text-slate-700">HOSPITAL ROHINI ID:</span>
                        <CharBoxGrid value={hospitalRohiniId} count={20} highlight={highlightFields} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">HOSPITAL TPA ID:</span>
                        <CharBoxGrid value={hospitalTpaId} count={14} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: DETAILS OF INSURED/PATIENT */}
                <div className="border border-blue-900 rounded-none overflow-hidden">
                  <div className="bg-blue-950 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-2">
                    <span className="w-4 h-4 rounded-none bg-blue-600 flex items-center justify-center text-[10px]">2</span>
                    <span>TO BE FILLED IN BY INSURED/PATIENT : DETAILS OF INSURED/PATIENT</span>
                  </div>

                  <div className="p-3 bg-slate-50 space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="w-44 font-semibold text-slate-700">PATIENT NAME:</span>
                      <CharBoxGrid value={patientName} count={35} highlight={highlightFields} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-44 font-semibold text-slate-700">GENDER:</span>
                        <div className="flex items-center gap-3 font-semibold text-xs">
                          <span className="flex items-center gap-1 text-blue-900 font-bold"><CheckSquare size={14} className="text-blue-600" /> MALE</span>
                          <span className="flex items-center gap-1 text-slate-400"><Square size={14} /> FEMALE</span>
                          <span className="flex items-center gap-1 text-slate-400"><Square size={14} /> THIRD GENDER</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">AGE:</span>
                        <CharBoxGrid value={age} count={2} highlight={highlightFields} />
                        <span className="text-[10px] text-slate-500 font-semibold">YEARS</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">DATE OF BIRTH:</span>
                        <CharBoxGrid value="15061981" count={8} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span className="w-44 font-semibold text-slate-700">CONTACT NO:</span>
                        <CharBoxGrid value={contact} count={10} highlight={highlightFields} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">POLICY NO:</span>
                        <CharBoxGrid value={policyNo} count={14} highlight={highlightFields} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="w-44 font-semibold text-slate-700">CORPORATE / GROUP:</span>
                      <CharBoxGrid value={corporate} count={35} highlight={highlightFields} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PAGE 2 */}
            {(activePdfPage === 2 || activePdfPage === 0) && (
              <div className="bg-white border-2 border-slate-400 p-7 rounded-none shadow-xl shadow-slate-300/80 space-y-4 text-slate-900 font-sans relative">
                <div className="bg-[#14b8a6] text-white p-3.5 rounded-none flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black tracking-wide uppercase">PRE – AUTHORIZATION FORM</h2>
                    <p className="text-[10px] font-medium tracking-wide uppercase">REQUEST FOR CASHLESS HOSPITALIZATION FOR HEALTH INSURANCE POLICY / TO BE FILLED IN BLOCK LETTERS</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black uppercase">{activeInsurer.companyName}</div>
                    <div className="text-[9px] text-teal-100">IRDAI REG / TPA LICENCE NO: 017</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-800 pb-2 text-[11px]">
                  <span className="px-3 py-1 bg-[#f97316] text-white font-bold text-[10.5px] rounded-none italic">
                    Please fill all pages : This is Page 2 of 4
                  </span>
                  <div className="text-right text-[10px] text-slate-700 font-mono">
                    <span>Tel: 1860 425 3232 | Fax: 1860 425 4242 | Email: {emailTo}</span>
                  </div>
                </div>

                <div className="border border-emerald-900 rounded-none overflow-hidden">
                  <div className="bg-emerald-950 text-white px-3 py-1.5 text-xs font-bold flex items-center gap-2">
                    <span className="w-4 h-4 rounded-none bg-emerald-600 flex items-center justify-center text-[10px]">3</span>
                    <span>TO BE FILLED IN BY TREATING DOCTOR / HOSPITAL (CLINICAL DETAILS)</span>
                  </div>

                  <div className="p-3 bg-slate-50 space-y-2.5 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span className="w-44 font-semibold text-slate-700">TREATING DOCTOR NAME:</span>
                        <CharBoxGrid value={doctor} count={22} highlight={highlightFields} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">REG NO:</span>
                        <CharBoxGrid value={doctorRegNo} count={10} highlight={highlightFields} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2 bg-white rounded-none border border-slate-300">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Provisional Diagnosis:</span>
                        <span className="font-bold text-slate-900">{provisionalDiagnosis}</span>
                      </div>
                      <div className="p-2 bg-white rounded-none border border-slate-300 flex items-center justify-between">
                        <span className="text-slate-500 text-[10px] uppercase font-bold">ICD-10 Code:</span>
                        <CharBoxGrid value={icd10Code.replace(".", "")} count={6} highlight={highlightFields} />
                      </div>
                    </div>

                    <div className="p-2.5 bg-white rounded-none border border-slate-300 space-y-1.5">
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Proposed Line of Treatment:</span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-semibold">
                        <span className="flex items-center gap-1 text-slate-400"><Square size={13} /> Medical</span>
                        <span className="flex items-center gap-1 text-emerald-900 font-bold"><CheckSquare size={13} className="text-emerald-600" /> Surgical</span>
                        <span className="flex items-center gap-1 text-slate-400"><Square size={13} /> Intensive Care</span>
                        <span className="flex items-center gap-1 text-slate-400"><Square size={13} /> Investigation</span>
                        <span className="flex items-center gap-1 text-slate-400"><Square size={13} /> Non-Allopathic</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-2 bg-white rounded-none border border-slate-300">
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Name of Surgery:</span>
                        <span className="font-bold text-slate-900">{procedure}</span>
                      </div>
                      <div className="p-2 bg-white rounded-none border border-slate-300 flex items-center justify-between">
                        <span className="text-slate-500 text-[10px] uppercase font-bold">ICD-10 PCS:</span>
                        <CharBoxGrid value={icd10Pcs} count={7} highlight={highlightFields} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PAGE 3 */}
            {(activePdfPage === 3 || activePdfPage === 0) && (
              <div className="bg-white border-2 border-slate-400 p-7 rounded-none shadow-xl shadow-slate-300/80 space-y-4 text-slate-900 font-sans relative">
                <div className="bg-[#14b8a6] text-white p-3.5 rounded-none flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black tracking-wide uppercase">PRE – AUTHORIZATION FORM</h2>
                    <p className="text-[10px] font-medium tracking-wide uppercase">REQUEST FOR CASHLESS HOSPITALIZATION FOR HEALTH INSURANCE POLICY / TO BE FILLED IN BLOCK LETTERS</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black uppercase">{activeInsurer.companyName}</div>
                    <div className="text-[9px] text-teal-100">IRDAI REG / TPA LICENCE NO: 017</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-800 pb-2 text-[11px]">
                  <span className="px-3 py-1 bg-[#f97316] text-white font-bold text-[10.5px] rounded-none italic">
                    Please fill all pages : This is Page 3 of 4
                  </span>
                  <div className="text-right text-[10px] text-slate-700 font-mono">
                    <span>Tel: 1860 425 3232 | Fax: 1860 425 4242 | Email: {emailTo}</span>
                  </div>
                </div>

                <div className="border border-amber-900 rounded-none overflow-hidden">
                  <div className="bg-amber-950 text-white px-3 py-1.5 text-xs font-bold">
                    DETAILS OF PATIENT ADMITTED &amp; COST ESTIMATION
                  </div>

                  <div className="p-3 bg-slate-50 space-y-2.5 text-[11px]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">DATE OF ADMISSION:</span>
                        <CharBoxGrid value="28092026" count={8} highlight={highlightFields} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">EXPECTED STAY:</span>
                        <CharBoxGrid value="03" count={2} highlight={highlightFields} />
                        <span className="text-[10px] text-slate-500 font-semibold">DAYS</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700">ROOM TYPE:</span>
                        <span className="font-bold text-slate-900">{roomCategory}</span>
                      </div>
                    </div>

                    {/* COST BREAKDOWN IN CHARACTER BOXES */}
                    <div className="p-3 bg-white rounded-none border border-slate-300 space-y-2">
                      <div className="text-xs font-bold text-amber-950 uppercase border-b pb-1">
                        COST IN INR / RS. (ITEMIZED SCHEDULE)
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center justify-between p-1.5 border border-slate-300 rounded-none">
                          <span>PER DAY ROOM RENT + NURSING &amp; DIET:</span>
                          <CharBoxGrid value={"015000"} count={6} highlight={highlightFields} />
                        </div>
                        <div className="flex items-center justify-between p-1.5 border border-slate-300 rounded-none">
                          <span>INVESTIGATIONS &amp; DIAGNOSTICS:</span>
                          <CharBoxGrid value={"008000"} count={6} highlight={highlightFields} />
                        </div>
                        <div className="flex items-center justify-between p-1.5 border border-slate-300 rounded-none">
                          <span>OT CHARGES &amp; CONSUMABLES:</span>
                          <CharBoxGrid value={"010000"} count={6} highlight={highlightFields} />
                        </div>
                        <div className="flex items-center justify-between p-1.5 border border-slate-300 rounded-none">
                          <span>PROFESSIONAL FEES SURGEON + ANESTHESIA:</span>
                          <CharBoxGrid value={"045000"} count={6} highlight={highlightFields} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-amber-50 rounded-none border border-amber-300 font-bold text-xs text-amber-950">
                        <span>SUM-TOTAL EXPECTED COST OF HOSPITALIZATION:</span>
                        <CharBoxGrid value={String(totalEstimatedCost).padStart(6, "0")} count={6} highlight={highlightFields} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PAGE 4 */}
            {(activePdfPage === 4 || activePdfPage === 0) && (
              <div className="bg-white border-2 border-slate-400 p-7 rounded-none shadow-xl shadow-slate-300/80 space-y-4 text-slate-900 font-sans relative">
                <div className="bg-[#14b8a6] text-white p-3.5 rounded-none flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black tracking-wide uppercase">PRE – AUTHORIZATION FORM</h2>
                    <p className="text-[10px] font-medium tracking-wide uppercase">REQUEST FOR CASHLESS HOSPITALIZATION FOR HEALTH INSURANCE POLICY / TO BE FILLED IN BLOCK LETTERS</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black uppercase">{activeInsurer.companyName}</div>
                    <div className="text-[9px] text-teal-100">IRDAI REG / TPA LICENCE NO: 017</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-800 pb-2 text-[11px]">
                  <span className="px-3 py-1 bg-[#f97316] text-white font-bold text-[10.5px] rounded-none italic">
                    Please fill all pages : This is Page 4 of 4
                  </span>
                  <div className="text-right text-[10px] text-slate-700 font-mono">
                    <span>Tel: 1860 425 3232 | Fax: 1860 425 4242 | Email: {emailTo}</span>
                  </div>
                </div>

                {/* SIGNATURE BLOCKS */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t-2 border-slate-800 text-xs">
                  <div className="border border-slate-400 p-3 text-center rounded-none bg-slate-50 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">DOCTOR'S NAME AND SIGN</div>
                    <div className="font-serif italic text-blue-900 text-sm font-bold py-1">{doctor}</div>
                    <div className="text-[10px] text-slate-500">{doctorRegNo} · {doctorQualification}</div>
                    <div className="text-[9.5px] text-emerald-800 font-bold">✓ Digitally Signed &amp; Verified</div>
                  </div>

                  <div className="border border-slate-400 p-3 text-center rounded-none bg-slate-50 space-y-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">HOSPITAL SEAL INCLUDING HOSPITAL ID</div>
                    <div className="font-serif text-slate-900 text-xs font-bold py-1">{hospitalName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">ROHINI ID: {hospitalRohiniId}</div>
                    <div className="text-[9.5px] text-blue-800 font-bold">Nodal Insurance Officer Sign-off</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Step 2 Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-300">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-9 px-4 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
            >
              ← Back to Requisition Form
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="h-10 px-6 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              Proceed to Email Dispatch <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. STEP 3: EMAIL DISPATCH (SQUARED)                            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="p-6 max-w-4xl mx-auto w-full space-y-5">
          <div className="bg-white border border-slate-300 rounded-none p-6 shadow-md shadow-slate-200/60 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-none bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold">
                  <Mail size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Official Pre-Authorization Email Dispatch</h3>
                  <p className="text-xs text-slate-500">Transmitting to {activeInsurer.companyName} designated pre-auth desk</p>
                </div>
              </div>

              <span className="text-xs font-semibold text-emerald-900 bg-emerald-50 px-2.5 py-0.5 rounded-none border border-emerald-300 font-mono">
                5 Attachments Ready
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">To (TPA / Insurer Pre-Auth Desk) *</label>
                  <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className={sqField} />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CC (Hospital Desk &amp; Patient)</label>
                  <input type="text" value={emailCc} onChange={(e) => setEmailCc(e.target.value)} className={sqField} />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Subject *</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className={`${sqField} font-bold text-slate-900`} />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Body *</label>
                <textarea rows={8} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="w-full p-3 rounded-none bg-slate-50 border border-slate-300 font-mono text-xs text-slate-900 leading-relaxed shadow-none focus:outline-none focus:border-blue-700" />
              </div>

              {/* Attached Files List */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-slate-700">
                    Attached Pre-Auth Dossier Files ({attachedFiles.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => manualFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-none border border-blue-300 cursor-pointer transition-colors"
                  >
                    <Upload size={12} /> Upload Manual Document
                  </button>
                  <input
                    ref={manualFileInputRef}
                    type="file"
                    multiple
                    onChange={handleManualUpload}
                    className="hidden"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-none border border-slate-300">
                  {attachedFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 text-xs text-slate-800 bg-white p-2 rounded-none border border-slate-300">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck size={14} className="text-emerald-700 shrink-0" />
                        <span className="truncate font-semibold">{f.name}</span>
                        <span className="text-slate-500 font-mono text-[10px] shrink-0">({f.size})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(f.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                        title="Remove attachment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button type="button" onClick={() => setStep(2)} className="h-9 px-4 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-colors cursor-pointer">
                ← Back to Form Preview
              </button>
              <button
                type="button"
                onClick={handleSendEmailDispatch}
                className="h-10 px-6 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Send size={14} /> Send 4-Page Pre-Auth Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 5. STEP 4: TRACK STATUS & INGEST INBOUND SANCTION (SQUARED)   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
          <div className="bg-white border border-slate-300 rounded-none p-6 space-y-4 shadow-md shadow-slate-200/60">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-none flex items-center justify-center font-bold text-lg border ${
                  approvalRecorded ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-blue-50 text-blue-800 border-blue-300"
                }`}>
                  {approvalRecorded ? <CheckCircle2 size={24} className="text-emerald-700" /> : <Clock size={24} className="text-blue-700" />}
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-mono font-bold uppercase">
                    {approvalRecorded ? "PRE-AUTHORIZATION SANCTIONED BY INSURER" : "PRE-AUTH DISPATCHED — AWAITING TPA REPLY"}
                  </div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Case Ref: INS20250928056</span>
                    {approvalRecorded && (
                      <span className="text-xs px-2.5 py-0.5 rounded-none bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold font-mono">
                        AUTH: {approvalCode}
                      </span>
                    )}
                  </h2>
                </div>
              </div>
              <div>
                <span className={`px-3 py-1 rounded-none text-xs font-bold border ${
                  approvalRecorded ? "bg-emerald-50 text-emerald-900 border-emerald-300" : "bg-blue-50 text-blue-900 border-blue-300"
                }`}>
                  {approvalRecorded ? "✓ Sanctioned & Approved" : "⏳ Emailed · In Review at TPA"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 rounded-none border border-slate-300">
              <div>
                <span className="text-slate-500 font-bold uppercase text-[10px]">Patient / UHID</span>
                <div className="font-bold text-slate-900">{patientName} ({uhid})</div>
              </div>
              <div>
                <span className="text-slate-500 font-bold uppercase text-[10px]">Insurer / Form</span>
                <div className="font-bold text-slate-900">{activeInsurer.companyName}</div>
              </div>
              <div>
                <span className="text-slate-500 font-bold uppercase text-[10px]">Requested Amount</span>
                <div className="font-bold text-slate-900 font-mono">₹ {totalEstimatedCost.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-slate-500 font-bold uppercase text-[10px]">{approvalRecorded ? "Approved Amount" : "Current Status"}</span>
                <div className={`font-black font-mono text-sm ${approvalRecorded ? "text-emerald-700" : "text-blue-700"}`}>
                  {approvalRecorded ? `₹ ${parseInt(approvedAmount).toLocaleString()}` : "Emailed to TPA Desk"}
                </div>
              </div>
            </div>

            {/* Ingestion & Action Section */}
            <div className="pt-2">
              {approvalRecorded ? (
                <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-none space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
                      <CheckCircle2 size={16} className="text-emerald-700" />
                      Sanction Letter Attached &amp; Validated
                    </div>
                    <span className="text-[11px] font-mono text-emerald-900 bg-white px-2.5 py-0.5 rounded-none border border-emerald-300">
                      Received: {inboundEmailReceivedAt}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white p-3.5 rounded-none border border-emerald-200">
                    <div>
                      <div className="text-slate-500 font-bold text-[10px] uppercase">Authorization Code</div>
                      <div className="font-bold text-slate-900 font-mono mt-0.5">{approvalCode}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[10px] uppercase">Approved Amount</div>
                      <div className="font-black text-emerald-700 font-mono mt-0.5">₹ {parseInt(approvedAmount).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[10px] uppercase">Allowed Room Category</div>
                      <div className="font-semibold text-slate-800 mt-0.5">{approvedRoom}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[10px] uppercase">Attached Letter</div>
                      <div className="font-semibold text-blue-700 mt-0.5 flex items-center gap-1">
                        <FileText size={13} /> {approvalLetterFile}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 bg-white p-3 rounded-none border border-emerald-200">
                    <strong>TPA Notes:</strong> {approvalNotes}
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        notify("Patient admitted under approved cashless pre-auth!", "success")
                        onSubmitted(getActiveClaimId())
                      }}
                      className="h-10 px-5 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Building2 size={15} /> Proceed to Inpatient Admission &amp; Bed Allocation <ArrowRight size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => onSubmitted(getActiveClaimId())}
                      className="h-10 px-4 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Package size={14} /> Open Case Management Hub
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-300 rounded-none flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-slate-900">Awaiting Insurer Sanction Response Email</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Pre-Auth dossier was emailed to <span className="font-mono font-bold text-slate-800">{emailTo}</span>.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowApprovalModal(true)}
                    className="h-9 px-4 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                  >
                    <Paperclip size={14} /> Attach Sanction Letter &amp; Ingest
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-300">
            <button type="button" onClick={() => setStep(3)} className="h-9 px-4 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-colors cursor-pointer">
              ← Back to Email Dispatch
            </button>
            <button
              type="button"
              onClick={() => onSubmitted(getActiveClaimId())}
              className="h-9 px-5 rounded-none bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              View Case Details Hub <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL: INBOUND APPROVAL LETTER ATTACHMENT MODAL (SQUARED)     */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto rounded-none">
          <div className="bg-white rounded-none shadow-2xl border border-slate-400 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-none">
              <div>
                <h3 className="text-sm font-bold tracking-tight">Record TPA Pre-Auth Sanction</h3>
                <p className="text-[11px] text-slate-400">Attach sanction letter received via email to authorize admission</p>
              </div>
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="w-8 h-8 rounded-none hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pre-Auth Decision Outcome *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "Approved", label: "Approved" },
                    { id: "Partially Approved", label: "Partial" },
                    { id: "Query", label: "Query" },
                    { id: "Rejected", label: "Rejected" },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setApprovalOutcome(o.id as any)}
                      className={`py-2 px-3 rounded-none border text-xs font-bold transition-colors cursor-pointer ${
                        approvalOutcome === o.id
                          ? "bg-emerald-700 text-white border-emerald-800"
                          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Authorization / Sanction Code *</label>
                  <input
                    type="text"
                    value={approvalCode}
                    onChange={(e) => setApprovalCode(e.target.value)}
                    className={`${sqField} font-mono font-bold text-blue-900`}
                    placeholder="e.g. AUTH-CARE-2026-98124"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Approved Initial Amount (₹) *</label>
                  <input
                    type="text"
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(e.target.value)}
                    className={`${sqField} font-mono font-black text-emerald-700`}
                    placeholder="e.g. 65000"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Allowed Room Category</label>
                  <input
                    type="text"
                    value={approvedRoom}
                    onChange={(e) => setApprovedRoom(e.target.value)}
                    className={sqField}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Approval Letter Document Name</label>
                  <input
                    type="text"
                    value={approvalLetterFile}
                    readOnly
                    className={`${sqField} bg-slate-100 font-mono`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">TPA Approval Conditions &amp; Notes</label>
                <textarea
                  rows={2}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="w-full p-2.5 rounded-none bg-white border border-slate-300 text-xs text-slate-800 shadow-none focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-300">
                <button
                  type="button"
                  onClick={() => setShowApprovalModal(false)}
                  className="h-9 px-4 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRecordInboundApproval}
                  className="h-9 px-5 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Save Sanction &amp; Proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
