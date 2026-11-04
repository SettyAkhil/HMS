/**
 * Enterprise Hospital Management System - UMR-Centered Universal / Central Billing Database
 *
 * CORE PRINCIPLE:
 * The patient's UMR (Unique Medical Record) is the permanent central financial anchor for all
 * clinical encounters, hospital stays, departments, services, charges, invoices, payments,
 * insurance claims, and outstanding balances.
 *
 * Hierarchy:
 * Patient → UMR → Encounter / Hospital Stay → Department → Service / Order → Charge → UMR Ledger → Central Billing → Invoice → Payment / Claim → Receipt → Settled
 *
 * Clinical departments (OP, ER, Inpatient, ICU, Surgery, Laboratory, Radiology) digitize orders
 * & care delivery without paper OP books, ER slips, or physical K-Sheets.
 * Finalized charges flow directly to Central Billing for verification, invoicing, and settlement.
 *
 * All financial amounts formatted in Indian Rupees (₹ - INR).
 */

import { apiFetch } from "../lib/api"
import { BillingRbacManager } from "./billingRbac"
import { safeLocalStorageSetItem } from "../utils/storageQuotaManager"

import { db, DBPatient, DBOPEncounter } from "./db";
import { getDoctorConsultationFee } from "./doctorMaster";
import { isRadiologyTest } from "../utils/testClassifier";
import { encounterArrivalIso } from "./encounterTime"
import { OpReportsService } from "./opReportsDb"
import {
  applyServerPaymentLocally,
  getServerClaims,
  syncServerBilling,
  onBillingSync,
  postServerPayment,
  retainBillingSync,
} from "./billingSync"


import { ErDatabase, ErVisitRecord } from "./erDb"

import { BedDatabase, BedRecord } from "./bedDb"

export type DepartmentType = "Emergency" | "Inpatient" | "ICU" | "Outpatient" | "Radiology" | "Laboratory" | "Surgery" | "Pharmacy"

export interface InvoiceItem {
  id: string

  description: string

  category: "Consultation" | "Room / Bed Charges" | "Nursing" | "Procedure / Surgery" | "Laboratory" | "Radiology / Imaging" | "Consumables"

  cptCode: string

  quantity: number

  unitPrice: number

  total: number

  insuranceCovered: number

  patientPayable: number

  orderedBy?: string

  orderedAt?: string
}

export interface PaymentRecord {
  id: string

  invoiceId: string

  receiptNo: string

  amount: number

  paymentDate: string

  paymentMethod: "Cash" | "Credit Card" | "Debit Card" | "Insurance Copay" | "UPI / Digital" | "Bank Transfer" | "Cheque"

  transactionRef?: string

  collectedBy: string

  notes?: string
}

export type ClaimStatus = "Draft" | "Ready" | "Submitted" | "Accepted" | "Rejected" | "Denied" | "Appeal" | "Paid" | "Voided"

export interface ClaimRecord {
  id: string // e.g. "CLM-8921"

  /** Set on bills that live on the server (billing-service invoices); see billingSync.ts. */
  serverInvoiceId?: number

  /** Set on a running IP bill (patient still in a bed; no final invoice yet). */
  runningAdmissionId?: number

  invoiceNo: string // e.g. "INV-2026-0811"

  patientId: string // UMR e.g. "UMR100501" or "UMR10001"

  patientName: string

  mrn: string

  age: number

  gender: "Male" | "Female" | "Other"

  phone: string
  email?: string

  department: DepartmentType

  carePathway?: string // e.g. "ER → ICU → 3N Ward Consolidated Stay" or "OP Consultation & Diagnostics"

  dateOfService: string

  encounterId?: string

  hospitalStayId?: string

  admissionId?: number

  bedId?: number

  insuranceProvider: string // "Star Health", "HDFC ERGO", "ICICI Lombard", "Care Health", "Bajaj Allianz", "PM-JAY (Ayushman Bharat)", "Self-Pay"

  policyNumber: string

  preAuthCode?: string

  status: ClaimStatus

  items: InvoiceItem[]

  subtotal: number

  discount: number

  tax: number

  totalAmount: number

  insurancePortion: number

  patientPortion: number

  amountPaid: number

  balanceDue: number

  payments: PaymentRecord[]

  denialReason?: string

  appealNotes?: string

  diagnosisCodes: string[] // ICD-10 codes

  attendingDoctor: string

  finalizedByNurse?: string

  /** Insurance / TPA workflow for the bill (mainly inpatient stays). */
  tpa?: TpaWorkflow

  createdAt: string

  updatedAt: string
}

// ── Who can be billed to insurance ─────────────────────────────────────────
//
// Cashless insurance in Indian hospitals covers hospitalisation. OP visits
// (consultation, walk-in lab / radiology / pharmacy) are paid by the patient
// at the counter; an emergency visit is covered only when it ends in an
// admission. This rule is the single source of truth for every screen.

export const CASHLESS_DEPARTMENTS: DepartmentType[] = ["Inpatient", "ICU", "Surgery"]

/** An emergency visit that became an admission (ICU / ward / cath lab / OT). */
const ADMITTED_PATHWAY = /\b(icu|ccu|nicu|picu|ward|admi(t|ssion)|inpatient|cath|ot|surgery|theatre|hdu)\b/i

export function isCashlessEligible(c: Pick<ClaimRecord, "department" | "carePathway">): boolean {
  if (CASHLESS_DEPARTMENTS.includes(c.department)) return true
  return c.department === "Emergency" && ADMITTED_PATHWAY.test(c.carePathway || "")
}

export type PreAuthStatus =
  | "Not Raised"
  | "Requested"
  | "Approved"
  | "Enhancement Requested"
  | "Rejected"

export interface TpaEvent {
  at: string
  action: string
  detail?: string
  amount?: number
}

/**
 * The cashless-insurance lifecycle of one bill: pre-authorisation (and any
 * enhancement while the stay runs), claim submission, TPA queries, the final
 * approval -- whose deductions move from the insurer's share to the
 * patient's -- and the insurer's settlement.
 */
export interface TpaWorkflow {
  tpaName?: string
  preAuthStatus?: PreAuthStatus
  preAuthRequested?: number
  preAuthSanctioned?: number
  enhancementRequested?: number
  queryOpen?: boolean
  queryNote?: string
  /** Set when the billing counter hands the whole bill to insurance. */
  billedAt?: string
  billedBy?: string
  /** Amount claimed from the insurer (the bill as handed over). */
  claimAmount?: number
  approvedAmount?: number
  /** Amount the insurer disallowed. */
  deduction?: number
  deductionReason?: string
  /**
   * Who absorbs a deduction. The patient left with nothing to pay, so by
   * default the hospital writes it off; "patient" reopens their balance.
   */
  shortfallTo?: "writeoff" | "patient"
  settledAmount?: number
  settlementRef?: string
  settledAt?: string
  events?: TpaEvent[]
}

// ── Department Charge Record (Clinical Running Ledger / Digital K-Sheet) ─────

export interface DepartmentChargeRecord {
  id: string // e.g. "DCHG-2026-101"

  patientId: string // UMR e.g. "UMR100501"

  mrn: string // "100501"

  patientName: string

  age: number

  gender: "Male" | "Female" | "Other"

  phone: string

  encounterId: string // e.g. "ENC-OP-100501" or "ER-2026-00001" or "IP-BED-204"

  hospitalStayId?: string // e.g. "STAY-2026-881" for multi-department continuous stay

  department: DepartmentType

  carePathway?: string // e.g. "ER → ICU → 3N Ward Consolidated Stay"

  dateOfService: string

  insuranceProvider: string

  policyNumber: string

  preAuthCode?: string

  attendingDoctor: string

  diagnosisCodes: string[]

  items: InvoiceItem[]

  subtotal: number

  totalAmount: number

  status: "Accumulating Charges" | "Pending Dept Verification" | "Finalized by Dept" | "Invoiced in Central Billing"

  verifiedByNurse?: string

  finalizedAt?: string

  invoiceId?: string

  createdAt: string

  notes?: string
}

// ── UMR Financial Ledger Summary Models ─────────────────────────────────────

export interface EncounterChargeSummary {
  encounterId: string

  encounterType: "Outpatient" | "Emergency" | "Inpatient Ward" | "ICU" | "Surgery" | "Laboratory" | "Radiology"

  department: DepartmentType

  date: string

  doctor: string

  status: string

  items: InvoiceItem[]

  totalCharges: number

  isFinalized: boolean

  isInvoiced: boolean

  invoiceId?: string

  invoiceNo?: string
}

export interface UmrFinancialLedger {
  umr: string

  patientName: string

  mrn: string

  age: number

  gender: "Male" | "Female" | "Other"

  phone: string

  insuranceProvider: string

  policyNumber: string

  totalHistoricalCharges: number

  totalInvoiced: number

  totalPaid: number

  outstandingBalance: number

  insurancePending: number

  encounters: EncounterChargeSummary[]

  invoices: ClaimRecord[]

  payments: PaymentRecord[]

  activeHospitalStayId?: string
}

export interface FinancialMetrics {
  totalChargesMtd: number

  insurancePending: number

  patientBalance: number

  deniedCount: number

  deniedAmount: number

  collectionsRate: number

  daysInAr: number

  firstPassRate: number

  avgClaimValue: number

  paidCount: number

  totalClaimsCount: number
}

export interface PayerMixItem {
  payer: string

  claimCount: number

  totalAmount: number

  pct: number

  color: string
}

export interface ArAgingItem {
  bucket: string

  amount: number

  pct: number

  color: string

  count: number
}

// ── Diagnostic Order Interfaces with Pre-Payment Clearance ──────────────────

export interface LabResultItem {
  component: string

  value: string

  unit: string

  ref: string

  flag: "H" | "L" | "HH" | "LL" | "Critical" | ""
}

export interface LabOrderRecord {
  id: string

  patient: string

  mrn: string

  umr?: string

  invoiceNo?: string

  encounterId?: string;

  department?: string;

  diagnosis?: string

  orderedItems?: Array<{
    description: string
    cptCode?: string
    price: number
    quantity: number
  }>

  test: string

  category?: string

  priority: "STAT" | "Routine"

  sampleType?: string

  accessionNo?: string

  collected?: string

  collectedAt?: string

  collectedBy?: string

  analyzer?: string

  status: "Pending" | "Collected" | "Processing" | "Completed" | "Critical"

  provider: string

  price: number

  paymentStatus: "Paid" | "Payment Pending"

  paidReceiptNo?: string

  paidAt?: string

  results?: LabResultItem[]

  verifiedBy?: string

  verifiedAt?: string

  billingClearedAt?: string

  eligibleAt?: string

  orderedAt?: string

  createdAt?: string

  comments?: string

  criticalNotified?: {
    notified: boolean

    notifiedTo?: string

    notifiedAt?: string

    channel?: string

    readBackVerified?: boolean
  }
}

export interface RadiologyStudyRecord {
  id: string

  patient: string

  mrn: string

  umr?: string

  invoiceNo?: string

  encounterId?: string;

  department?: string;

  diagnosis?: string

  orderedItems?: Array<{
    description: string
    cptCode?: string
    price: number
    quantity: number
  }>

  study: string

  modality: "XR" | "CT" | "MR" | "US" | "NM"

  priority: "STAT" | "Routine" | "Elective"

  ordered: string

  orderDate?: string

  orderedAt?: string

  createdAt?: string

  provider: string

  status: "Orders" | "Scheduled" | "In Progress" | "Done" | "Images Ready" | "Reporting" | "Final" | "Sent for Reporting"

  room: string

  price: number

  paymentStatus: "Paid" | "Payment Pending"

  paidReceiptNo?: string

  paidAt?: string

  billingClearedAt?: string

  eligibleAt?: string

  scanningStartedAt?: string

  scanningCompletedAt?: string

  transferredToReportingAt?: string

  reportingQueuedAt?: string

  accessionNo?: string

  technician?: string

  indication?: string

  technique?: string

  findings?: string[]

  impression?: string[]

  comparison?: string

  radiologist?: string

  reportStatus?: "Draft" | "Final" | "Finalized" | "Pending Report" | "Submitted for Review" | "Needs Correction"

  workflowStatus?: "READY_TO_START" | "IN_PROGRESS" | "COMPLETED" | "SENT_TO_REPORTING" | "DRAFT" | "SUBMITTED_FOR_REVIEW" | "CORRECTION_REQUIRED" | "FINALIZED"

  sentToReporting?: boolean

  sentToReportingAt?: string

  sentToReportingBy?: string

  scanningStage?: number

  scanStartedAt?: string

  scanCompletedAt?: string

  patientVerified?: boolean

  patientVerifiedAt?: string

  safetyCleared?: boolean

  safetyClearedAt?: string

  safetyChecklist?: {
    twoPointId: boolean
    protocolReconciled: boolean
    pregnancySafety: boolean
    contrastAllergy: boolean
    metallicImplant: boolean
    ivAccess: boolean
  }

  actualProtocol?: string

  operationalNotes?: string

  submittedForReviewAt?: string

  submittedForReviewBy?: string

  submittedForReviewRole?: string

  returnedForCorrectionAt?: string

  returnedForCorrectionBy?: string

  correctionNotes?: string

  templateId?: string

  templateName?: string

  templateVersion?: number

  fieldValues?: Record<string, any>

  dicomImages?: string[]

  digitalStudyUrl?: string

  technicianNotes?: string

  technicianSignature?: string

  digitalReceiptRef?: string

  signedAt?: string

  nurseVerified?: boolean
  nurseVerifiedBy?: string
  nurseVerifiedAt?: string
  completedAt?: string
  completedBy?: string
  completionNotes?: string
  finalizedBy?: string
  finalizedRole?: string
  finalizedAt?: string
  history?: any[]
}

const STORAGE_KEY_CLAIMS = "hosp_billing_claims_inr_v11"

const STORAGE_KEY_DEPT_CHARGES = "hosp_billing_dept_charges_v11"

const STORAGE_KEY_LAB_ORDERS = "hosp_lab_orders_v1"

const STORAGE_KEY_RAD_STUDIES = "hosp_rad_studies_v1"

const BILLING_UPDATE_EVENT = "hospital_billing_updated"
/** Fired when the server refused a payment taken on a server bill. */
export const BILLING_PAYMENT_FAILED_EVENT = "hospital_billing_payment_failed"

export const INITIAL_LAB_ORDERS: LabOrderRecord[] = [
  {
    id: "LAB-101",

    patient: "Thomas Reed",

    mrn: "100301",

    test: "Troponin I (High Sensitivity)",

    category: "Cardiac",

    priority: "STAT",

    sampleType: "Serum (Gold Top SST)",

    accessionNo: "ACC-2026-9041",

    collected: "09:28",

    collectedAt: "09:28 AM",

    collectedBy: "Nurse Brenda (ER)",

    analyzer: "Roche Cobas e411 Immunoassay",

    status: "Processing",

    provider: "Dr. Shah",

    price: 150,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5501",

    results: [
      {
        component: "High-Sensitivity Troponin I",
        value: "1.80",
        unit: "ng/mL",
        ref: "< 0.04",
        flag: "Critical",
      },

      {
        component: "CK-MB Mass",
        value: "18.4",
        unit: "ng/mL",
        ref: "0.0–5.0",
        flag: "H",
      },

      {
        component: "Myoglobin",
        value: "112",
        unit: "ng/mL",
        ref: "28–72",
        flag: "H",
      },
    ],

    comments:
      "Marked elevation in high-sensitivity Troponin I consistent with acute myocardial necrosis. STAT provider verbal alert logged.",
  },

  {
    id: "LAB-102",

    patient: "John Smith",

    mrn: "100245",

    test: "BMP (Basic Metabolic Panel)",

    category: "Biochemistry",

    priority: "Routine",

    sampleType: "Serum (Gold Top SST)",

    accessionNo: "ACC-2026-9042",

    collected: "08:42",

    collectedAt: "08:42 AM",

    collectedBy: "Phlebotomist Roy",

    analyzer: "Beckman Coulter AU680",

    status: "Completed",

    provider: "Dr. Anderson",

    price: 100,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5502",

    verifiedBy: "Dr. K. Srinivasan, MD (Pathologist)",

    verifiedAt: "09:15 AM",

    results: [
      {
        component: "Sodium",
        value: "140",
        unit: "mmol/L",
        ref: "135–145",
        flag: "",
      },

      {
        component: "Potassium",
        value: "4.2",
        unit: "mmol/L",
        ref: "3.5–5.1",
        flag: "",
      },

      {
        component: "Chloride",
        value: "102",
        unit: "mmol/L",
        ref: "98–107",
        flag: "",
      },

      {
        component: "Carbon Dioxide (CO2)",
        value: "24",
        unit: "mmol/L",
        ref: "22–29",
        flag: "",
      },

      {
        component: "Blood Urea Nitrogen (BUN)",
        value: "14",
        unit: "mg/dL",
        ref: "7–20",
        flag: "",
      },

      {
        component: "Serum Creatinine",
        value: "0.92",
        unit: "mg/dL",
        ref: "0.7–1.3",
        flag: "",
      },

      {
        component: "Fasting Blood Glucose",
        value: "98",
        unit: "mg/dL",
        ref: "70–99",
        flag: "",
      },

      {
        component: "Calcium",
        value: "9.4",
        unit: "mg/dL",
        ref: "8.6–10.2",
        flag: "",
      },
    ],

    comments:
      "Electrolytes and renal function parameters within normal biological reference intervals.",
  },

  {
    id: "LAB-103",

    patient: "Mary Jones",

    mrn: "100246",

    test: "CBC w/ Differential (Complete Blood Count)",

    category: "Hematology",

    priority: "Routine",

    sampleType: "Whole Blood (Lavender EDTA)",

    accessionNo: "ACC-2026-9043",

    collected: "09:10",

    collectedAt: "09:10 AM",

    collectedBy: "Phlebotomist Roy",

    analyzer: "Sysmex XN-1000 Hematology",

    status: "Collected",

    provider: "Dr. Lee",

    price: 80,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5503",

    results: [
      {
        component: "WBC Count",
        value: "14.2",
        unit: "10^3/μL",
        ref: "4.5–11.0",
        flag: "H",
      },

      {
        component: "RBC Count",
        value: "4.81",
        unit: "10^6/μL",
        ref: "4.5–5.9",
        flag: "",
      },

      {
        component: "Hemoglobin",
        value: "13.4",
        unit: "g/dL",
        ref: "13.5–17.5",
        flag: "L",
      },

      {
        component: "Hematocrit",
        value: "40.2",
        unit: "%",
        ref: "41.0–53.0",
        flag: "L",
      },

      {
        component: "MCV",
        value: "83.6",
        unit: "fL",
        ref: "80.0–100.0",
        flag: "",
      },

      {
        component: "Platelet Count",
        value: "218",
        unit: "10^3/μL",
        ref: "150–400",
        flag: "",
      },

      {
        component: "Neutrophils %",
        value: "78.4",
        unit: "%",
        ref: "50.0–70.0",
        flag: "H",
      },

      {
        component: "Lymphocytes %",
        value: "14.2",
        unit: "%",
        ref: "20.0–40.0",
        flag: "L",
      },
    ],
  },
  {
    id: "LAB-2026-0002",
    patient: "Priya Sharma",
    mrn: "PAT-00126",
    test: "CUE / Complete Urine Examination & Urine C/S",
    category: "Pathology",
    priority: "Routine",
    sampleType: "Mid-Stream Clean Catch Urine",
    accessionNo: "ACC-2026-9048",
    collected: "—",
    status: "Pending",
    provider: "Dr. Sarah Khan",
    price: 1000,
    paymentStatus: "Payment Pending",
  },
]

export const INITIAL_RAD_STUDIES: RadiologyStudyRecord[] = [
  {
    id: "RAD-1030",
    patient: "Rahul Sharma",
    mrn: "10030",
    umr: "UMR10030",
    encounterId: "OP25091430",
    study: "Chest X-Ray PA View",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:15 AM",
    provider: "Dr. Neha Patel",
    status: "In Progress",
    room: "Suite 3",
    price: 350,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1030",
    accessionNo: "RAD-ACC-1030",
    technician: "Alex Rivera, RT(R)",
    indication: "Persistent cough, intermittent fever. Rule out acute pulmonary infection or consolidation.",
    technique: "Standard PA digital chest radiography in standing erect position.",
  },
  {
    id: "RAD-1031",
    patient: "Priya Reddy",
    mrn: "10031",
    umr: "UMR10031",
    encounterId: "OP25091431",
    study: "CT Scan — Brain",
    modality: "CT",
    priority: "Routine",
    ordered: "10 Sep 2026 09:18 AM",
    provider: "Dr. Sarah Khan",
    status: "Orders",
    room: "CT Suite 1",
    price: 2800,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1031",
    accessionNo: "RAD-ACC-1031",
    indication: "Recurrent severe migraines, unilateral visual aura. Rule out intracranial space occupying lesion.",
  },
  {
    id: "RAD-1032",
    patient: "Arjun Kumar",
    mrn: "10032",
    umr: "UMR10032",
    encounterId: "OP25091432",
    study: "MRI — Lumbar Spine",
    modality: "MR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:20 AM",
    provider: "Dr. Rajesh Gupta",
    status: "Orders",
    room: "MRI Suite",
    price: 4500,
    paymentStatus: "Payment Pending",
    accessionNo: "RAD-ACC-1032",
    indication: "Chronic L4-L5 radiculopathy with lower extremity paresthesia. Evaluate disc bulge / canal stenosis.",
  },
  {
    id: "RAD-1033",
    patient: "Sneha Rao",
    mrn: "10033",
    umr: "UMR10033",
    encounterId: "OP25091433",
    study: "Abdominal Ultrasound",
    modality: "US",
    priority: "Routine",
    ordered: "10 Sep 2026 09:22 AM",
    provider: "Dr. Kavita Rao",
    status: "Orders",
    room: "USG Suite",
    price: 900,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1033",
    accessionNo: "RAD-ACC-1033",
    indication: "Epigastric pain, postprandial dyspepsia. Rule out cholelithiasis and fatty liver infiltration.",
  },
  {
    id: "RAD-1034",
    patient: "Vikram Das",
    mrn: "10034",
    umr: "UMR10034",
    encounterId: "OP25091434",
    study: "Chest X-Ray AP View",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 08:30 AM",
    completedAt: "10 Sep 2026 08:50 AM",
    completedBy: "Alex Rivera, RT(R)",
    provider: "Dr. Anderson",
    status: "Images Ready",
    room: "Suite 1",
    price: 350,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1034",
    accessionNo: "RAD-ACC-1034",
    indication: "Pre-operative fitness assessment. Cardiac silhouette and lung parenchymal clearance.",
  },
  {
    id: "RAD-1035",
    patient: "Meera Iyer",
    mrn: "10035",
    umr: "UMR10035",
    encounterId: "OP25091435",
    study: "Contrast CT — Abdomen",
    modality: "CT",
    priority: "Routine",
    ordered: "10 Sep 2026 09:25 AM",
    provider: "Dr. Neha Patel",
    status: "Orders",
    room: "CT Suite 2",
    price: 3600,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1035",
    accessionNo: "RAD-ACC-1035",
    indication: "Right iliac fossa tenderness. High resolution triphasic contrast abdominal evaluation.",
  },
  {
    id: "RAD-1036",
    patient: "Kiran Patel",
    mrn: "10036",
    umr: "UMR10036",
    encounterId: "OP25091436",
    study: "MRI — Knee (Right)",
    modality: "MR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:28 AM",
    provider: "Dr. Rajesh Gupta",
    status: "Orders",
    room: "MRI Suite",
    price: 4200,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1036",
    accessionNo: "RAD-ACC-1036",
    indication: "Sports injury, right knee joint locking. Rule out ACL tear and medial meniscus rupture.",
  },
  {
    id: "RAD-1037",
    patient: "Anjali Verma",
    mrn: "10037",
    umr: "UMR10037",
    encounterId: "OP25091437",
    study: "USG — Thyroid",
    modality: "US",
    priority: "Routine",
    ordered: "10 Sep 2026 09:30 AM",
    provider: "Dr. Sarah Khan",
    status: "In Progress",
    room: "USG Suite",
    price: 850,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1037",
    accessionNo: "RAD-ACC-1037",
    indication: "Anterior neck fullness, palpitations. High resolution thyroid ultrasound & TI-RADS scoring.",
  },
  {
    id: "RAD-1038",
    patient: "Suresh Babu",
    mrn: "10038",
    umr: "UMR10038",
    encounterId: "OP25091438",
    study: "Mammography (B/L)",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:32 AM",
    provider: "Dr. Neha Patel",
    status: "Orders",
    room: "Mammo Suite",
    price: 1800,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1038",
    accessionNo: "RAD-ACC-1038",
    indication: "Annual screening bilateral mammography. Digital tomosynthesis evaluation.",
  },
  {
    id: "RAD-1039",
    patient: "Neha Singh",
    mrn: "10039",
    umr: "UMR10039",
    encounterId: "OP25091439",
    study: "CT — Chest (HRCT)",
    modality: "CT",
    priority: "Routine",
    ordered: "10 Sep 2026 09:35 AM",
    provider: "Dr. Anderson",
    status: "Orders",
    room: "CT Suite 1",
    price: 3200,
    paymentStatus: "Payment Pending",
    accessionNo: "RAD-ACC-1039",
    indication: "Post-viral exertional dyspnea, dry cough. High resolution CT to assess interstitial lung pattern.",
  },
  {
    id: "RAD-1040",
    patient: "Ramesh Chandra",
    mrn: "10040",
    umr: "UMR10040",
    encounterId: "OP25091440",
    study: "X-Ray — Knee (AP/L)",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 08:45 AM",
    completedAt: "10 Sep 2026 09:05 AM",
    completedBy: "Alex Rivera, RT(R)",
    provider: "Dr. Rajesh Gupta",
    status: "Images Ready",
    room: "Suite 2",
    price: 400,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1040",
    accessionNo: "RAD-ACC-1040",
    indication: "Bilateral weight-bearing knee joint pain. Kellgren-Lawrence osteoarthritis grading.",
  },
  {
    id: "RAD-1041",
    patient: "Divya Nair",
    mrn: "10041",
    umr: "UMR10041",
    encounterId: "OP25091441",
    study: "MRI — Brain",
    modality: "MR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:40 AM",
    provider: "Dr. Sarah Khan",
    status: "Orders",
    room: "MRI Suite",
    price: 4500,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1041",
    accessionNo: "RAD-ACC-1041",
    indication: "Dizziness, gait instability. Screening MRI brain with diffusion-weighted sequence.",
  },
  {
    id: "RAD-1042",
    patient: "Amit Saxena",
    mrn: "10042",
    umr: "UMR10042",
    encounterId: "OP25091442",
    study: "CT Scan — PNS (Coronal)",
    modality: "CT",
    priority: "Routine",
    ordered: "10 Sep 2026 09:42 AM",
    provider: "Dr. Sharma",
    status: "Orders",
    room: "CT Suite 2",
    price: 2400,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1042",
    accessionNo: "RAD-ACC-1042",
    indication: "Chronic rhinosinusitis, nasal obstruction. Coronal paranasal sinuses CT.",
  },
  {
    id: "RAD-1043",
    patient: "Pooja Joshi",
    mrn: "10043",
    umr: "UMR10043",
    encounterId: "OP25091443",
    study: "USG — Obstetric Scan",
    modality: "US",
    priority: "Routine",
    ordered: "10 Sep 2026 09:45 AM",
    provider: "Dr. Kavita Rao",
    status: "In Progress",
    room: "USG Suite",
    price: 1100,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1043",
    accessionNo: "RAD-ACC-1043",
    indication: "Routine second-trimester anomaly scan and fetal biometry evaluation.",
  },
  {
    id: "RAD-1044",
    patient: "Rajiv Kapoor",
    mrn: "10044",
    umr: "UMR10044",
    encounterId: "OP25091444",
    study: "MRI — Cervical Spine",
    modality: "MR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:48 AM",
    provider: "Dr. Rajesh Gupta",
    status: "Orders",
    room: "MRI Suite",
    price: 4500,
    paymentStatus: "Payment Pending",
    accessionNo: "RAD-ACC-1044",
    indication: "Cervicobrachial neuralgia, hand numbness. Assess C5-C6 / C6-C7 neuroforaminal narrowing.",
  },
  {
    id: "RAD-1045",
    patient: "Sunita Deshmukh",
    mrn: "10045",
    umr: "UMR10045",
    encounterId: "OP25091445",
    study: "Digital Mammography Spot View",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:50 AM",
    provider: "Dr. Neha Patel",
    status: "Orders",
    room: "Mammo Suite",
    price: 1600,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1045",
    accessionNo: "RAD-ACC-1045",
    indication: "Focal asymmetry follow-up. Magnification spot compression view.",
  },
  {
    id: "RAD-1046",
    patient: "Manoj Tiwari",
    mrn: "10046",
    umr: "UMR10046",
    encounterId: "OP25091446",
    study: "X-Ray — Cervical Spine AP/Lat",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 08:50 AM",
    completedAt: "10 Sep 2026 09:10 AM",
    completedBy: "Alex Rivera, RT(R)",
    provider: "Dr. Sharma",
    status: "Images Ready",
    room: "Suite 3",
    price: 400,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1046",
    accessionNo: "RAD-ACC-1046",
    indication: "Neck pain post-whiplash injury. Exclude fracture dislocation.",
  },
  {
    id: "RAD-1047",
    patient: "Ritu Agarwal",
    mrn: "10047",
    umr: "UMR10047",
    encounterId: "OP25091447",
    study: "CT — Urography (IVU)",
    modality: "CT",
    priority: "Routine",
    ordered: "10 Sep 2026 09:55 AM",
    provider: "Dr. Anderson",
    status: "Orders",
    room: "CT Suite 1",
    price: 3400,
    paymentStatus: "Payment Pending",
    accessionNo: "RAD-ACC-1047",
    indication: "Painless microscopic hematuria. Multiphase CT urography to evaluate collecting systems.",
  },
  {
    id: "RAD-1048",
    patient: "Sanjay Mehta",
    mrn: "10048",
    umr: "UMR10048",
    encounterId: "OP25091448",
    study: "Color Doppler — Lower Limbs Arterial",
    modality: "US",
    priority: "Routine",
    ordered: "10 Sep 2026 09:58 AM",
    provider: "Dr. Kavita Rao",
    status: "Orders",
    room: "USG Suite",
    price: 1800,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1048",
    accessionNo: "RAD-ACC-1048",
    indication: "Intermittent claudication, peripheral arterial disease screening.",
  },
  {
    id: "RAD-1049",
    patient: "Kavita Menon",
    mrn: "10049",
    umr: "UMR10049",
    encounterId: "OP25091449",
    study: "MRI — Shoulder Joint (Right)",
    modality: "MR",
    priority: "Routine",
    ordered: "10 Sep 2026 10:00 AM",
    provider: "Dr. Rajesh Gupta",
    status: "Orders",
    room: "MRI Suite",
    price: 4200,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1049",
    accessionNo: "RAD-ACC-1049",
    indication: "Right shoulder impingement, restricted abduction. Rule out rotator cuff tear.",
  },
  {
    id: "RAD-1050",
    patient: "Harish Bhatt",
    mrn: "10050",
    umr: "UMR10050",
    encounterId: "OP25091450",
    study: "X-Ray — Pelvis with Both Hips (AP)",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:00 AM",
    completedAt: "10 Sep 2026 09:20 AM",
    completedBy: "Alex Rivera, RT(R)",
    provider: "Dr. Rajesh Gupta",
    status: "Images Ready",
    room: "Suite 1",
    price: 450,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1050",
    accessionNo: "RAD-ACC-1050",
    indication: "Bilateral groin pain, difficulty ambulating. Avascular necrosis screening.",
  },
  {
    id: "RAD-1051",
    patient: "Deepa Pillai",
    mrn: "10051",
    umr: "UMR10051",
    encounterId: "OP25091451",
    study: "CT — Angiography Pulmonary",
    modality: "CT",
    priority: "STAT",
    ordered: "10 Sep 2026 10:05 AM",
    provider: "Dr. Sarah Khan",
    status: "Orders",
    room: "CT Suite 2",
    price: 4200,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1051",
    accessionNo: "RAD-ACC-1051",
    indication: "Acute onset pleuritic chest pain, elevated D-Dimer. Rule out pulmonary embolism.",
  },
  {
    id: "RAD-1052",
    patient: "Alok Sen",
    mrn: "10052",
    umr: "UMR10052",
    encounterId: "OP25091452",
    study: "USG — KUB (Kidney, Ureter, Bladder)",
    modality: "US",
    priority: "Routine",
    ordered: "10 Sep 2026 10:10 AM",
    provider: "Dr. Anderson",
    status: "Orders",
    room: "USG Suite",
    price: 950,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1052",
    accessionNo: "RAD-ACC-1052",
    indication: "Left flank pain, microscopic hematuria. Exclude nephrolithiasis and hydronephrosis.",
  },
  {
    id: "RAD-1053",
    patient: "Rekha Joshi",
    mrn: "10053",
    umr: "UMR10053",
    encounterId: "OP25091453",
    study: "Chest X-Ray PA View",
    modality: "XR",
    priority: "Routine",
    ordered: "10 Sep 2026 09:05 AM",
    provider: "Dr. Neha Patel",
    status: "Done",
    room: "Suite 1",
    price: 450,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2026-1053",
    accessionNo: "RAD-ACC-1053",
    indication: "Annual executive health screening.",
    technician: "Alex Rivera, RT(R)",
  },
  {
    id: "RAD-201",

    patient: "John Smith",

    mrn: "100245",

    umr: "P-100245",

    encounterId: "ENC-100245-1",

    study: "Chest X-Ray PA/Lateral",

    modality: "XR",

    ordered: "09:50",

    priority: "Routine",

    provider: "Dr. Patel",

    status: "Images Ready",

    room: "XR-2",

    price: 120,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5502",

    accessionNo: "RAD-ACC-8801",

    technician: "Alex Rivera, RT(R)",

    indication:
      "Hypertensive urgency, shortness of breath. Rule out acute pulmonary edema or cardiomegaly.",

    technique:
      "Standard PA and lateral digital chest radiography in standing position.",

    findings: [
      "Heart size: Normal cardiac silhouette. Cardiothoracic ratio 0.48.",

      "Lungs: Lungs are clear bilaterally. No focal consolidation, pleural effusion, or pneumothorax identified.",

      "Mediastinum: Normal mediastinal contour. No widening or lymphadenopathy.",

      "Bony structures: No acute osseous abnormality. Mild degenerative changes of the thoracic spine.",

      "Soft tissues: Unremarkable without subcutaneous emphysema.",
    ],

    impression: [
      "1. No acute cardiopulmonary process identified.",

      "2. Mild thoracic spondylosis, chronic and age-indeterminate.",
    ],

    comparison:
      "Chest X-Ray dated 03/14/2025 — No significant interval change.",

    radiologist: "Dr. Laura Kim, MD · Senior Consultant Radiologist",

    reportStatus: "Draft",
  },

  {
    id: "RAD-HIST-101",
    patient: "John Smith",
    mrn: "100245",
    umr: "P-100245",
    encounterId: "ENC-100245-2",
    study: "ECG & Chest Radiography PA",
    modality: "XR",
    ordered: "15-Dec-2025 09:40 AM",
    priority: "Routine",
    provider: "Dr. Anita Roy",
    status: "Final",
    room: "XR-1",
    price: 150,
    paymentStatus: "Paid",
    paidReceiptNo: "RCPT-2025-9901",
    accessionNo: "RAD-ACC-7721",
    technician: "Alex Rivera, RT(R)",
    indication: "Routine cardiovascular checkup, chronic hypertension screening.",
    technique: "Standard PA digital chest radiography in erect position.",
    findings: [
      "Lungs: Clear lung fields bilaterally without active focal consolidation or effusion.",
      "Cardiovascular: Cardiac silhouette is upper limit of normal with borderline left ventricular contour, consistent with treated systemic hypertension.",
      "Aorta: Mild ectasia of thoracic aorta.",
      "Osseous: Normal bony thorax."
    ],
    impression: [
      "1. Borderline cardiomegaly secondary to systemic hypertension, otherwise clear lungs.",
      "2. No evidence of acute failure or acute parenchymal infiltration."
    ],
    radiologist: "Dr. Laura Kim, MD · Senior Consultant Radiologist",
    reportStatus: "Final",
    signedAt: "15-Dec-2025 10:15 AM",
    finalizedAt: "2025-12-15T10:15:00.000Z",
  },

  {
    id: "RAD-202",

    patient: "Thomas Reed",

    mrn: "100301",

    study: "CT Head w/o IV Contrast",

    modality: "CT",

    ordered: "10:02",

    priority: "STAT",

    provider: "Dr. Shah",

    status: "In Progress",

    room: "CT-1",

    price: 350,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5501",

    accessionNo: "RAD-ACC-8802",

    technician: "Sarah Connor, RT(CT)",

    indication:
      "Acute onset neurological deficit, right-sided hemiparesis, sudden headache. Rule out intracranial hemorrhage / acute infarct.",

    technique:
      "Non-contrast helical CT scan of the brain from skull base to vertex with 1.25mm thin reconstructions.",

    findings: [
      "Ventricles & Cisterns: Normal caliber and configuration for age. No midline shift.",

      "Brain Parenchyma: No acute intra-axial or extra-axial hemorrhage. No territorial acute ischemic edema.",

      "Calvarium: Calvarium and skull base are intact without fracture.",

      "Paranasal Sinuses: Clear paranasal sinuses and mastoid air cells.",
    ],

    impression: [
      "1. No acute intracranial hemorrhage or territorial vascular infarct.",

      "2. MRI Brain with DWI protocol recommended if symptoms persist to evaluate early hyperacute ischemic changes.",
    ],

    radiologist: "Dr. Laura Kim, MD · Senior Consultant Radiologist",

    reportStatus: "Draft",
  },

  {
    id: "RAD-203",

    patient: "Mary Jones",

    mrn: "100246",

    study: "CT Abdomen & Pelvis with IV Contrast",

    modality: "CT",

    ordered: "08:30",

    priority: "Routine",

    provider: "Dr. Lee",

    status: "Final",

    room: "CT-2",

    price: 400,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5503",

    accessionNo: "RAD-ACC-8803",

    technician: "Sarah Connor, RT(CT)",

    indication:
      "Right lower quadrant abdominal pain, low-grade fever, elevated WBC count. Rule out appendicitis.",

    technique:
      "Axial multidetector CT of the abdomen and pelvis obtained following administration of 85mL Omnipaque 350 IV contrast in portal venous phase.",

    findings: [
      "Appendix: Blind-ending tubular structure in the right iliac fossa measuring 8.5mm in diameter with mural thickening and periappendiceal fat stranding.",

      "Liver, Gallbladder, Spleen, Pancreas, Adrenals, and Kidneys: Unremarkable without focal lesions.",

      "Bowel: No small or large bowel obstruction. Normal caliber of bowel loops.",

      "Peritoneum: No free intraperitoneal air. Small volume reactive fluid in the right iliac fossa.",

      "Pelvis: Urinary bladder is normal in outline.",
    ],

    impression: [
      "1. Findings highly consistent with acute uncomplicated appendicitis.",

      "2. No evidence of appendiceal perforation, abscess formation, or secondary peritonitis.",
    ],

    radiologist: "Dr. Laura Kim, MD · Senior Consultant Radiologist",

    reportStatus: "Final",

    signedAt: "09:45 AM",
  },

  {
    id: "RAD-204",

    patient: "Patricia Okonkwo",

    mrn: "100149",

    study: "X-Ray Right Hip AP & Frog-Leg Lateral",

    modality: "XR",

    ordered: "10:15",

    priority: "STAT",

    provider: "Dr. Williams",

    status: "Orders",

    room: "XR-1",

    price: 130,

    paymentStatus: "Payment Pending",

    accessionNo: "RAD-ACC-8804",

    indication:
      "Mechanical fall from standing height, right hip pain and inability to bear weight. Rule out femoral neck fracture.",
  },

  {
    id: "RAD-205",

    patient: "Ann Martinez",

    mrn: "100088",

    study: "Ultrasound Whole Abdomen & Pelvis",

    modality: "US",

    ordered: "09:28",

    priority: "Routine",

    provider: "Dr. Chen",

    status: "Reporting",

    room: "US-1",

    price: 200,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5504",

    accessionNo: "RAD-ACC-8805",

    technician: "Dr. Sanjay Gupta, MD (Sonologist)",

    indication:
      "Epigastric and right upper quadrant post-prandial colic. Rule out cholelithiasis.",

    findings: [
      "Gallbladder: Distended with multiple mobile acoustic shadowing calculi, largest measuring 12mm. No gallbladder wall thickening (2.2mm). Sonographic Murphy sign is negative.",

      "Liver: Normal size and parenchymal echotexture. No focal mass or biliary ductal dilatation.",

      "Common Bile Duct: Normal caliber measuring 3.8mm without intraluminal calculus.",

      "Pancreas & Spleen: Normal sonographic appearance.",

      "Kidneys: Bilateral normal cortical thickness without hydronephrosis or calculus.",
    ],

    impression: [
      "1. Multiple mobile gallbladder calculi (Cholelithiasis) without sonographic evidence of acute acute cholecystitis.",

      "2. Otherwise normal whole abdomen sonogram.",
    ],

    radiologist: "Dr. Sanjay Gupta, MD · Consultant Sonologist",

    reportStatus: "Draft",
  },

  {
    id: "RAD-206",

    patient: "Sandra Brown",

    mrn: "100331",

    study: "MRI Brain with & without Gadolinium Contrast",

    modality: "MR",

    ordered: "08:15",

    priority: "Routine",

    provider: "Dr. Williams",

    status: "Final",

    room: "MR-1",

    price: 600,

    paymentStatus: "Paid",

    paidReceiptNo: "RCPT-2026-5505",

    accessionNo: "RAD-ACC-8806",

    technician: "Michael Chang, RT(MR)",

    indication:
      "Chronic tension headache and vertigo. Screening for intracranial lesion.",

    technique:
      "Multiplanar multisequence MRI of the brain including T1W, T2W, FLAIR, DWI/ADC, and Post-Contrast 3D T1 sequences on 3.0T Siemens Magnetom.",

    findings: [
      "Parenchyma: Scatted punctate T2/FLAIR hyperintensities in the subcortical white matter bilaterally, consistent with mild microvascular ischemic disease.",

      "Diffusion: No areas of restricted diffusion on DWI to indicate acute infarction.",

      "Contrast: No abnormal leptomeningeal or parenchymal enhancement.",

      "Vascular: Major intracranial flow voids are preserved.",
    ],

    impression: [
      "1. Mild chronic microvascular ischemic changes, typical for age. No acute infarct.",

      "2. No space-occupying lesion or abnormal intracranial contrast enhancement.",
    ],

    radiologist: "Dr. Laura Kim, MD · Senior Consultant Radiologist",

    reportStatus: "Final",

    signedAt: "09:30 AM",
  },

  {
    id: "RAD-207",

    patient: "Marcus Kim",

    mrn: "100377",

    study: "Transthoracic 2D Echocardiogram with Color Doppler",

    modality: "US",

    ordered: "11:00",

    priority: "Routine",

    provider: "Dr. Park",

    status: "Orders",

    room: "Echo-1",

    price: 250,

    paymentStatus: "Payment Pending",

    accessionNo: "RAD-ACC-8807",

    indication: "Hypertension, evaluate LV function and hypertrophy.",
  },

  {
    id: "RAD-208",

    patient: "Diane Walsh",

    mrn: "100142",

    study: "Bone Mineral Densitometry (DEXA Scan)",

    modality: "XR",

    ordered: "Yesterday",

    completedAt: "Yesterday 16:30",

    priority: "Elective",

    provider: "Dr. Anderson",

    status: "Done",

    room: "XR-1",

    price: 150,

    paymentStatus: "Payment Pending",

    accessionNo: "RAD-ACC-8808",

    indication: "Postmenopausal osteoporosis screening.",
  },
]

// ── Department Tariff & Service Catalogs (Streamlined Small Amounts) ──────────

export const DEPARTMENT_TARIFF_CATALOG: Record<DepartmentType, {
  category: InvoiceItem["category"]
  description: string
  cpt: string
  price: number
}[]> = {
  Outpatient: [
    {
      category: "Consultation",
      description: "Specialist Comprehensive Outpatient Consultation",
      cpt: "99205",
      price: 150,
    },

    {
      category: "Consultation",
      description: "General OPD Medical Consultation",
      cpt: "99203",
      price: 100,
    },

    {
      category: "Consultation",
      description: "Follow-up Consultation / Review",
      cpt: "99213",
      price: 50,
    },

    {
      category: "Procedure / Surgery",
      description: "Minor OPD Dressing & Suture Removal",
      cpt: "12001",
      price: 40,
    },

    {
      category: "Consumables",
      description: "OPD Diagnostic & Clinical Supplies Kit",
      cpt: "A4649",
      price: 30,
    },
  ],

  Emergency: [
    {
      category: "Consultation",
      description: "Emergency Resuscitation & High-Acuity Triage (Level B1)",
      cpt: "99285",
      price: 250,
    },

    {
      category: "Consultation",
      description: "Emergency Acute Evaluation & Stabilization (Level B2)",
      cpt: "99284",
      price: 150,
    },

    {
      category: "Consultation",
      description: "Urgent Care Minor Trauma Assessment (Level B3)",
      cpt: "99283",
      price: 100,
    },

    {
      category: "Procedure / Surgery",
      description: "Complex Multi-Layer Wound Suture & Hemostasis",
      cpt: "12002",
      price: 120,
    },

    {
      category: "Procedure / Surgery",
      description: "Emergency Intubation & Airway Stabilization",
      cpt: "31500",
      price: 200,
    },

    {
      category: "Nursing",
      description: "STAT Emergency Nursing & IV Cannulation Protocol",
      cpt: "99505",
      price: 50,
    },

    {
      category: "Consumables",
      description: "Emergency Trauma Procedure Pack & Sterile Trays",
      cpt: "A4649",
      price: 60,
    },
  ],

  Inpatient: [
    {
      category: "Room / Bed Charges",
      description: "General Medical Ward Daily Bed Rate (per day)",
      cpt: "99222",
      price: 100,
    },

    {
      category: "Room / Bed Charges",
      description: "Semi-Private Ward Daily Bed Rate (per day)",
      cpt: "99223",
      price: 150,
    },

    {
      category: "Room / Bed Charges",
      description: "Private Deluxe Room Daily Rate (per day)",
      cpt: "99224",
      price: 250,
    },

    {
      category: "Consultation",
      description: "Attending Inpatient Physician Daily Rounds (per day)",
      cpt: "99233",
      price: 50,
    },

    {
      category: "Nursing",
      description:
        "24-Hour Continuous Inpatient Nursing & Vitals Care (per day)",
      cpt: "99505",
      price: 40,
    },

    {
      category: "Procedure / Surgery",
      description: "Inpatient Bedside Paracentesis / Thoracentesis",
      cpt: "49082",
      price: 120,
    },

    {
      category: "Consumables",
      description: "Inpatient Infusion & Sterile Nursing Consumables Pack",
      cpt: "A4649",
      price: 50,
    },
  ],

  ICU: [
    {
      category: "Room / Bed Charges",
      description: "ICU Intensive Care Daily Bed Rate (per day)",
      cpt: "99291",
      price: 350,
    },

    {
      category: "Consultation",
      description: "Critical Care Specialist Daily Comprehensive Management",
      cpt: "99292",
      price: 100,
    },

    {
      category: "Nursing",
      description: "1:1 Continuous Critical Care Specialized Nursing Care",
      cpt: "99505",
      price: 80,
    },

    {
      category: "Procedure / Surgery",
      description: "Emergency Endotracheal Intubation & Ventilator Setup",
      cpt: "31500",
      price: 200,
    },

    {
      category: "Procedure / Surgery",
      description: "Arterial Line & Central Venous Line Placement",
      cpt: "36556",
      price: 180,
    },

    {
      category: "Procedure / Surgery",
      description: "Continuous Mechanical Ventilation Management (24h)",
      cpt: "94002",
      price: 120,
    },

    {
      category: "Consumables",
      description: "ICU High-Acuity Hemodynamic & Airway Consumables",
      cpt: "A4649",
      price: 100,
    },
  ],

  Surgery: [
    {
      category: "Procedure / Surgery",
      description: "Laparoscopic Cholecystectomy / Abdominal Surgery",
      cpt: "47562",
      price: 800,
    },

    {
      category: "Procedure / Surgery",
      description: "Emergency Appendectomy Procedure",
      cpt: "44970",
      price: 600,
    },

    {
      category: "Room / Bed Charges",
      description: "Major Operation Theatre (OT) Infrastructure Rate",
      cpt: "99291",
      price: 300,
    },

    {
      category: "Consultation",
      description: "Chief Operating Surgeon Professional Fee",
      cpt: "99205",
      price: 400,
    },

    {
      category: "Consultation",
      description: "Consultant Anesthesiologist Pre-Op & Intra-Op Care",
      cpt: "00840",
      price: 200,
    },

    {
      category: "Nursing",
      description: "PACU Post-Anesthesia Recovery Care & Monitoring",
      cpt: "99505",
      price: 80,
    },

    {
      category: "Consumables",
      description: "Sterile Surgical Laparoscopic Disposable Pack & Drapes",
      cpt: "A4649",
      price: 150,
    },
  ],

  Laboratory: [
    {
      category: "Laboratory",
      description: "Complete Blood Count w/ Differential (CBC)",
      cpt: "85025",
      price: 50,
    },

    {
      category: "Laboratory",
      description: "Comprehensive Metabolic Panel (CMP / LFT + KFT)",
      cpt: "80053",
      price: 120,
    },

    {
      category: "Laboratory",
      description: "Lipid Profile Panel (Cholesterol, HDL, LDL, Triglycerides)",
      cpt: "80061",
      price: 80,
    },

    {
      category: "Laboratory",
      description: "Liver Function Tests (LFT Complete)",
      cpt: "80076",
      price: 70,
    },

    {
      category: "Laboratory",
      description: "Renal Function Tests / Kidney Panel (KFT)",
      cpt: "80069",
      price: 60,
    },

    {
      category: "Laboratory",
      description: "STAT High-Sensitivity Cardiac Troponin-I POCT",
      cpt: "84484",
      price: 100,
    },

    {
      category: "Laboratory",
      description: "Arterial Blood Gas Analysis (ABG with Electrolytes)",
      cpt: "82803",
      price: 80,
    },

    {
      category: "Laboratory",
      description: "Glycated Hemoglobin (HbA1c Assay)",
      cpt: "83036",
      price: 60,
    },

    {
      category: "Laboratory",
      description: "Blood & Wound Culture with Antibiotic Sensitivity",
      cpt: "87070",
      price: 90,
    },

    {
      category: "Laboratory",
      description: "Routine Urinalysis & Microscopy",
      cpt: "81001",
      price: 30,
    },
  ],

  Radiology: [
    {
      category: "Radiology / Imaging",
      description: "Digital Chest X-Ray (PA & Lateral Views)",
      cpt: "71046",
      price: 60,
    },

    {
      category: "Radiology / Imaging",
      description: "Contrast-Enhanced CT Scan - Chest / Abdomen / Pelvis",
      cpt: "74177",
      price: 250,
    },

    {
      category: "Radiology / Imaging",
      description: "Brain MRI with & without Contrast Study",
      cpt: "70553",
      price: 350,
    },

    {
      category: "Radiology / Imaging",
      description: "Whole Abdomen & Pelvis Ultrasound (USG)",
      cpt: "76700",
      price: 100,
    },

    {
      category: "Radiology / Imaging",
      description: "2D Echocardiography with Color Doppler",
      cpt: "93306",
      price: 200,
    },

    {
      category: "Radiology / Imaging",
      description: "Digital Lumbo-Sacral Spine X-Ray (AP & Lateral)",
      cpt: "72100",
      price: 70,
    },

    {
      category: "Radiology / Imaging",
      description: "Bedside Point-of-Care Ultrasound (POCUS)",
      cpt: "93308",
      price: 90,
    },
  ],
  Pharmacy: [
    {
      category: "Consumables",
      description: "Dispensed Medicines & Pharmacy Consumables",
      cpt: "PHARM-DISP",
      price: 50,
    },
  ],
}

const STANDARD_SERVICES = [
  ...DEPARTMENT_TARIFF_CATALOG.Outpatient,

  ...DEPARTMENT_TARIFF_CATALOG.Emergency,

  ...DEPARTMENT_TARIFF_CATALOG.Inpatient,

  ...DEPARTMENT_TARIFF_CATALOG.ICU,

  ...DEPARTMENT_TARIFF_CATALOG.Surgery,

  ...DEPARTMENT_TARIFF_CATALOG.Laboratory,

  ...DEPARTMENT_TARIFF_CATALOG.Radiology,
]

// ── INITIAL SEED DEPARTMENT CHARGES (Streamlined Small Amounts) ─────────────

const INITIAL_DEPARTMENT_CHARGES: DepartmentChargeRecord[] = [
  // 1. OP Consultation & Diagnostic Encounter (Rahul Sharma - OP Finalized)

  {
    id: "DCHG-2026-101",

    patientId: "UMR100501",

    mrn: "100501",

    patientName: "Rahul Sharma",

    age: 38,

    gender: "Male",

    phone: "+91 98234 56789",

    encounterId: "ENC-OP-100501",

    department: "Outpatient",

    carePathway: "OP Consultation + Lab (CBC) + Radiology (Chest X-Ray)",

    dateOfService: "2026-08-31",

    insuranceProvider: "Star Health",

    policyNumber: "SH-7892341",

    attendingDoctor: "Dr. Rajesh Sharma",

    diagnosisCodes: ["R05", "J06.9"],

    items: [
      {
        id: "IT-1",
        description: "Specialist Comprehensive Outpatient Consultation",
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 120,
        patientPayable: 30,
      },

      {
        id: "IT-2",
        description: "Complete Blood Count w/ Differential (CBC)",
        category: "Laboratory",
        cptCode: "85025",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },

      {
        id: "IT-3",
        description: "Digital Chest X-Ray (PA & Lateral Views)",
        category: "Radiology / Imaging",
        cptCode: "71046",
        quantity: 1,
        unitPrice: 60,
        total: 60,
        insuranceCovered: 48,
        patientPayable: 12,
      },
    ],

    subtotal: 260,

    totalAmount: 260,

    status: "Finalized by Dept",

    verifiedByNurse: "Nurse Priya Nair (OPD Lead)",

    finalizedAt: "2026-08-31T11:45:00Z",

    createdAt: "2026-08-31T10:00:00Z",

    notes:
      "Patient completed OPD consultation. Doctor ordered CBC and Chest X-Ray. Reports uploaded and verified. All department charges finalized.",
  },

  // 2. ER → ICU → 3N Ward Continuous Hospital Stay (Vikram Singhania - Single Consolidated Stay)

  {
    id: "DCHG-2026-102",

    patientId: "UMR100490",

    mrn: "100490",

    patientName: "Vikram Singhania",

    age: 56,

    gender: "Male",

    phone: "+91 98451 99887",

    encounterId: "STAY-2026-881",

    hospitalStayId: "STAY-2026-881",

    department: "Inpatient",

    carePathway:
      "Continuous Stay: ER Arrival → ICU Critical Care (3 Days) → 3N Medical Ward (4 Days)",

    dateOfService: "2026-08-25",

    insuranceProvider: "Star Health",

    policyNumber: "SH-9921045",

    preAuthCode: "AUTH-SH-88190",

    attendingDoctor: "Dr. Gregory Vance & Dr. Sarah Mitchell",

    diagnosisCodes: ["I21.0", "R57.0", "I50.9"],

    items: [
      // ER Charges

      {
        id: "IT-1",
        description: "ER High-Acuity Resuscitation & Triage (B1 Level)",
        category: "Consultation",
        cptCode: "99285",
        quantity: 1,
        unitPrice: 250,
        total: 250,
        insuranceCovered: 200,
        patientPayable: 50,
      },

      {
        id: "IT-2",
        description: "STAT High-Sensitivity Cardiac Troponin-I POCT",
        category: "Laboratory",
        cptCode: "84484",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 80,
        patientPayable: 20,
      },

      {
        id: "IT-3",
        description: "STAT 12-Lead Electrocardiogram (ECG)",
        category: "Laboratory",
        cptCode: "93005",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },

      // ICU Charges

      {
        id: "IT-4",
        description: "ICU Intensive Care Daily Bed Rate (3 Days)",
        category: "Room / Bed Charges",
        cptCode: "99291",
        quantity: 3,
        unitPrice: 350,
        total: 1050,
        insuranceCovered: 840,
        patientPayable: 210,
      },

      {
        id: "IT-5",
        description: "Critical Care Specialist Daily Evaluation (3 Days)",
        category: "Consultation",
        cptCode: "99292",
        quantity: 3,
        unitPrice: 100,
        total: 300,
        insuranceCovered: 240,
        patientPayable: 60,
      },

      {
        id: "IT-6",
        description: "Emergency Endotracheal Intubation & Ventilator Setup",
        category: "Procedure / Surgery",
        cptCode: "31500",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "IT-7",
        description: "Arterial Line & Central Venous Line Placement",
        category: "Procedure / Surgery",
        cptCode: "36556",
        quantity: 1,
        unitPrice: 180,
        total: 180,
        insuranceCovered: 144,
        patientPayable: 36,
      },

      {
        id: "IT-8",
        description: "Serial Arterial Blood Gas Panels (ABG x3)",
        category: "Laboratory",
        cptCode: "82803",
        quantity: 3,
        unitPrice: 80,
        total: 240,
        insuranceCovered: 192,
        patientPayable: 48,
      },

      // 3N Ward Charges

      {
        id: "IT-9",
        description: "3N General Medical Ward Daily Bed Rate (4 Days)",
        category: "Room / Bed Charges",
        cptCode: "99222",
        quantity: 4,
        unitPrice: 100,
        total: 400,
        insuranceCovered: 320,
        patientPayable: 80,
      },

      {
        id: "IT-10",
        description: "Attending Inpatient Physician Daily Rounds (4 Days)",
        category: "Consultation",
        cptCode: "99233",
        quantity: 4,
        unitPrice: 50,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "IT-11",
        description: "24-Hour Continuous Inpatient Nursing Care (4 Days)",
        category: "Nursing",
        cptCode: "99505",
        quantity: 4,
        unitPrice: 40,
        total: 160,
        insuranceCovered: 128,
        patientPayable: 32,
      },
    ],

    subtotal: 3130,

    totalAmount: 3130,

    status: "Finalized by Dept",

    verifiedByNurse: "Charge Nurse Sunita Rao (3N Floor & ICU Transition Lead)",

    finalizedAt: "2026-08-30T17:30:00Z",

    createdAt: "2026-08-25T08:00:00Z",

    notes:
      "Patient admitted via ER for acute STEMI, stabilized in ICU for 3 days, transitioned to 3N Ward for 4 days, successfully discharged. All ER, ICU, and Inpatient ward charges verified and consolidated into single hospital stay packet.",
  },

  // 3. Surgery & OT Workflow (Ananya Desai - Laparoscopic Cholecystectomy)

  {
    id: "DCHG-2026-103",

    patientId: "UMR100412",

    mrn: "100412",

    patientName: "Ananya Desai",

    age: 42,

    gender: "Female",

    phone: "+91 97112 33445",

    encounterId: "ENC-SURG-2026-44",

    hospitalStayId: "STAY-SURG-441",

    department: "Surgery",

    carePathway:
      "Surgery: Pre-Op Assessment → Major OT → PACU → Post-Op Ward Stay (2 Days)",

    dateOfService: "2026-08-28",

    insuranceProvider: "HDFC ERGO",

    policyNumber: "HDFC-SURG-9912",

    preAuthCode: "AUTH-HDFC-6621",

    attendingDoctor: "Dr. Vikram Seth (Chief Surgeon) & Dr. Marcus Brody",

    diagnosisCodes: ["K80.20"],

    items: [
      {
        id: "IT-1",
        description: "Pre-Operative Assessment & Surgical Clearance",
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 80,
        patientPayable: 20,
      },

      {
        id: "IT-2",
        description: "Laparoscopic Cholecystectomy / Abdominal Surgery",
        category: "Procedure / Surgery",
        cptCode: "47562",
        quantity: 1,
        unitPrice: 800,
        total: 800,
        insuranceCovered: 640,
        patientPayable: 160,
      },

      {
        id: "IT-3",
        description:
          "Major Operation Theatre (OT) Infrastructure Rate (2 Hours)",
        category: "Room / Bed Charges",
        cptCode: "99291",
        quantity: 1,
        unitPrice: 300,
        total: 300,
        insuranceCovered: 240,
        patientPayable: 60,
      },

      {
        id: "IT-4",
        description: "Chief Operating Surgeon Professional Fee",
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: 400,
        total: 400,
        insuranceCovered: 320,
        patientPayable: 80,
      },

      {
        id: "IT-5",
        description: "Consultant Anesthesiologist Pre-Op & Intra-Op Care",
        category: "Consultation",
        cptCode: "00840",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "IT-6",
        description: "Sterile Surgical Laparoscopic Disposable Pack & Drapes",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 120,
        patientPayable: 30,
      },

      {
        id: "IT-7",
        description: "PACU Post-Anesthesia Recovery Care & Monitoring",
        category: "Nursing",
        cptCode: "99505",
        quantity: 1,
        unitPrice: 80,
        total: 80,
        insuranceCovered: 64,
        patientPayable: 16,
      },

      {
        id: "IT-8",
        description: "Post-Op Surgical Ward Daily Bed Stay (2 Days)",
        category: "Room / Bed Charges",
        cptCode: "99222",
        quantity: 2,
        unitPrice: 100,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },
    ],

    subtotal: 2230,

    totalAmount: 2230,

    status: "Finalized by Dept",

    verifiedByNurse: "Staff Nurse Rajeshwari (OT / Surgical Suite Lead)",

    finalizedAt: "2026-08-30T14:00:00Z",

    createdAt: "2026-08-28T07:30:00Z",

    notes:
      "Elective laparoscopic surgery completed uneventfully. OT, anesthesia, surgical consumables, PACU, and post-op ward stay charges verified and finalized.",
  },

  // 4. ER Discharged Encounter (Maria Garcia - Suture & Trauma)

  {
    id: "DCHG-2026-104",

    patientId: "UMR100512",

    mrn: "100512",

    patientName: "Maria Garcia",

    age: 29,

    gender: "Female",

    phone: "+91 98451 23456",

    encounterId: "ER-2026-00004",

    department: "Emergency",

    carePathway: "ER Urgent Care → Wound Suture & Dressing → Discharged",

    dateOfService: "2026-08-24",

    insuranceProvider: "Self-Pay",

    policyNumber: "N/A - Self Pay",

    attendingDoctor: "Dr. Elena Rostova",

    diagnosisCodes: ["S51.811A"],

    items: [
      {
        id: "IT-1",
        description: "Urgent Care Minor Trauma Assessment (Level B3)",
        category: "Consultation",
        cptCode: "99283",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 0,
        patientPayable: 100,
      },

      {
        id: "IT-2",
        description: "Complex Multi-Layer Wound Suture & Hemostasis",
        category: "Procedure / Surgery",
        cptCode: "12002",
        quantity: 1,
        unitPrice: 120,
        total: 120,
        insuranceCovered: 0,
        patientPayable: 120,
      },

      {
        id: "IT-3",
        description: "Emergency Trauma Procedure Pack & Sterile Trays",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 60,
        total: 60,
        insuranceCovered: 0,
        patientPayable: 60,
      },
    ],

    subtotal: 280,

    totalAmount: 280,

    status: "Finalized by Dept",

    verifiedByNurse: "Staff Nurse Sneha (ER Triage Lead)",

    finalizedAt: "2026-08-24T14:15:00Z",

    createdAt: "2026-08-24T12:00:00Z",

    notes:
      "Patient laceration treated and sutured. Tetanus prophylaxis given. Discharged in stable condition. Ready for Central Billing invoice.",
  },

  // 5. Inpatient Discharged Encounter (Devendra Patel - 3N Ward 4 Days)

  {
    id: "DCHG-2026-105",

    patientId: "UMR100388",

    mrn: "100388",

    patientName: "Devendra Patel",

    age: 61,

    gender: "Male",

    phone: "+91 97234 11223",

    encounterId: "IP-BED-208",

    hospitalStayId: "STAY-2026-772",

    department: "Inpatient",

    carePathway:
      "Inpatient Ward Stay (4 Days) + Lab & Imaging Diagnostic Panels",

    dateOfService: "2026-08-26",

    insuranceProvider: "Care Health",

    policyNumber: "CARE-998812",

    attendingDoctor: "Dr. James Wilson",

    diagnosisCodes: ["K21.9", "E11.9"],

    items: [
      {
        id: "IT-1",
        description: "General Medical Ward Daily Bed Rate (4 Days)",
        category: "Room / Bed Charges",
        cptCode: "99222",
        quantity: 4,
        unitPrice: 100,
        total: 400,
        insuranceCovered: 320,
        patientPayable: 80,
      },

      {
        id: "IT-2",
        description: "Attending Inpatient Physician Daily Rounds (4 Days)",
        category: "Consultation",
        cptCode: "99233",
        quantity: 4,
        unitPrice: 50,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "IT-3",
        description: "24-Hour Continuous Inpatient Nursing Care (4 Days)",
        category: "Nursing",
        cptCode: "99505",
        quantity: 4,
        unitPrice: 40,
        total: 160,
        insuranceCovered: 128,
        patientPayable: 32,
      },

      {
        id: "IT-4",
        description: "Comprehensive Metabolic Panel (CMP / LFT + KFT)",
        category: "Laboratory",
        cptCode: "80053",
        quantity: 1,
        unitPrice: 120,
        total: 120,
        insuranceCovered: 96,
        patientPayable: 24,
      },

      {
        id: "IT-5",
        description: "Whole Abdomen & Pelvis Ultrasound (USG)",
        category: "Radiology / Imaging",
        cptCode: "76700",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 80,
        patientPayable: 20,
      },
    ],

    subtotal: 980,

    totalAmount: 980,

    status: "Finalized by Dept",

    verifiedByNurse: "Nurse Anita (3N Floor Supervisor)",

    finalizedAt: "2026-08-30T10:00:00Z",

    createdAt: "2026-08-26T09:00:00Z",

    notes:
      "Patient completed 4-day inpatient medical stabilization. All daily charges, labs, and ultrasound finalized.",
  },

  // 6. Active Accumulating Charge Sheet: ER Bay 1 (Kavita Sen - In Progress)

  {
    id: "DCHG-2026-106",

    patientId: "UMR100612",

    mrn: "100612",

    patientName: "Kavita Sen",

    age: 34,

    gender: "Female",

    phone: "+91 99123 77889",

    encounterId: "ER-2026-00005",

    department: "Emergency",

    carePathway: "Active ER Encounter: Acute Abdominal Pain Assessment",

    dateOfService: "2026-08-31",

    insuranceProvider: "ICICI Lombard",

    policyNumber: "ICICI-ER-8812",

    attendingDoctor: "Dr. Anita Roy",

    diagnosisCodes: ["R10.9"],

    items: [
      {
        id: "IT-1",
        description: "Emergency Acute Evaluation & Stabilization (Level B2)",
        category: "Consultation",
        cptCode: "99284",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 120,
        patientPayable: 30,
      },

      {
        id: "IT-2",
        description: "Complete Blood Count w/ Differential (CBC)",
        category: "Laboratory",
        cptCode: "85025",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },

      {
        id: "IT-3",
        description: "STAT Emergency Nursing & IV Cannulation Protocol",
        category: "Nursing",
        cptCode: "99505",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },
    ],

    subtotal: 250,

    totalAmount: 250,

    status: "Accumulating Charges",

    createdAt: "2026-08-31T11:00:00Z",

    notes:
      "Patient currently in ER Bay 1 awaiting ultrasound abdomen report. Additional charges may accumulate before nurse finalization.",
  },
]

// ── INITIAL SEED CENTRAL INVOICES & CLAIMS (Streamlined Small Amounts) ──────

const INITIAL_HOSPITAL_CLAIMS: ClaimRecord[] = [
  // ── OUTPATIENT: Priya Sharma (PAT-00126 - Pending Lab Test Clearance) ──
  {
    id: "CLM-2026-0892",
    invoiceNo: "INV-2026-0002",
    patientId: "PAT-00126",
    patientName: "Priya Sharma",
    mrn: "PAT-00126",
    age: 29,
    gender: "Female",
    phone: "+91 98112 34567",
    department: "Outpatient",
    carePathway: "OP Consultation & Diagnostic Laboratory Investigations",
    dateOfService: new Date().toISOString().split("T")[0],
    encounterId: "ENC-2026-0892",
    insuranceProvider: "Self-Pay",
    policyNumber: "—",
    status: "Draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attendingDoctor: "Dr. Sarah Khan",
    diagnosisCodes: ["N39.0"],
    items: [
      {
        id: "ITEM-1",
        description: "CUE / Complete Urine Examination",
        category: "Laboratory",
        cptCode: "81001",
        quantity: 1,
        unitPrice: 250,
        total: 250,
        insuranceCovered: 0,
        patientPayable: 250,
      },
      {
        id: "ITEM-2",
        description: "Urine C/S (Culture & Sensitivity)",
        category: "Laboratory",
        cptCode: "87086",
        quantity: 1,
        unitPrice: 750,
        total: 750,
        insuranceCovered: 0,
        patientPayable: 750,
      },
    ],
    subtotal: 1000,
    discount: 0,
    tax: 0,
    totalAmount: 1000,
    insurancePortion: 0,
    patientPortion: 1000,
    amountPaid: 0,
    balanceDue: 1000,
    payments: [],
  },

  // ── INPATIENT: Bed 204-A (John Smith - 3N Medical/Surgical) ──
  {
    id: "CLM-8921",
    invoiceNo: "INV-2026-0811",

    patientId: "UMR100245",

    patientName: "John Smith",

    mrn: "100245",

    age: 41,

    gender: "Male",

    phone: "+91 98765 43210",

    department: "Inpatient",

    carePathway: "Inpatient Ward Stay (5 Days) + Labs & Nursing Care",

    dateOfService: "2026-08-22",

    admissionId: 501,

    bedId: 1,

    insuranceProvider: "Star Health",

    policyNumber: "SH-28847291",

    preAuthCode: "AUTH-2026-18845",

    status: "Paid",

    attendingDoctor: "Dr. Sarah Mitchell",

    diagnosisCodes: ["E11.65", "I10"],

    items: [
      {
        id: "ITEM-1",
        description: "3N Med/Surg Semi-Private Bed Stay (5 Days)",
        category: "Room / Bed Charges",
        cptCode: "99223",
        quantity: 5,
        unitPrice: 150,
        total: 750,
        insuranceCovered: 600,
        patientPayable: 150,
      },

      {
        id: "ITEM-2",
        description: "Attending Physician Initial Evaluation & Daily Rounds",
        category: "Consultation",
        cptCode: "99233",
        quantity: 5,
        unitPrice: 50,
        total: 250,
        insuranceCovered: 200,
        patientPayable: 50,
      },

      {
        id: "ITEM-3",
        description: "Comprehensive Metabolic Panel (CMP) & HbA1c",
        category: "Laboratory",
        cptCode: "80053",
        quantity: 2,
        unitPrice: 90,
        total: 180,
        insuranceCovered: 144,
        patientPayable: 36,
      },

      {
        id: "ITEM-4",
        description: "Continuous Nursing Care & Vitals Monitoring (5 Days)",
        category: "Nursing",
        cptCode: "99505",
        quantity: 5,
        unitPrice: 40,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "ITEM-5",
        description: "Inpatient Infusion & Sterile Nursing Consumables Pack",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 120,
        total: 120,
        insuranceCovered: 96,
        patientPayable: 24,
      },
    ],

    subtotal: 1500,

    discount: 0,

    tax: 0,

    totalAmount: 1500,

    insurancePortion: 1200,

    patientPortion: 300,

    amountPaid: 1500,

    balanceDue: 0,

    payments: [
      {
        id: "PAY-1004",

        invoiceId: "CLM-8921",

        receiptNo: "RCPT-2026-5504",

        amount: 1200,

        paymentDate: "2026-08-25T14:00:00Z",

        paymentMethod: "Bank Transfer",

        transactionRef: "STAR-EFT-88190",

        collectedBy: "Payer Direct Remittance",
      },

      {
        id: "PAY-1005",

        invoiceId: "CLM-8921",

        receiptNo: "RCPT-2026-5505",

        amount: 300,

        paymentDate: "2026-08-25T15:30:00Z",

        paymentMethod: "Credit Card",

        transactionRef: "POS-CC-99120",

        collectedBy: "Front Desk Cashier",
      },
    ],

    createdAt: "2026-08-22T14:10:00Z",

    updatedAt: "2026-08-25T15:35:00Z",
  },

  // ── INPATIENT: Bed 208-A (Mary Jones) ──

  {
    id: "CLM-8922",

    invoiceNo: "INV-2026-0812",

    patientId: "UMR100246",

    patientName: "Mary Jones",

    mrn: "100246",

    age: 53,

    gender: "Female",

    phone: "+91 97123 44556",

    department: "Inpatient",

    carePathway: "Inpatient Ward Stay (6 Days) + Pulmonology Diagnostics",

    dateOfService: "2026-08-21",

    admissionId: 502,

    bedId: 2,

    insuranceProvider: "ICICI Lombard",

    policyNumber: "ICICI-9920118",

    preAuthCode: "AUTH-ICICI-8812",

    status: "Submitted",

    attendingDoctor: "Dr. Elena Rostova",

    diagnosisCodes: ["J18.9", "J96.00"],

    items: [
      {
        id: "ITEM-1",
        description: "3N Med/Surg General Ward Daily Bed Stay (6 Days)",
        category: "Room / Bed Charges",
        cptCode: "99222",
        quantity: 6,
        unitPrice: 100,
        total: 600,
        insuranceCovered: 480,
        patientPayable: 120,
      },

      {
        id: "ITEM-2",
        description: "Pulmonology Specialist Evaluation & Care (6 Days)",
        category: "Consultation",
        cptCode: "99233",
        quantity: 6,
        unitPrice: 50,
        total: 300,
        insuranceCovered: 240,
        patientPayable: 60,
      },

      {
        id: "ITEM-3",
        description: "Digital Chest X-Ray 2 Views (Paired follow-up)",
        category: "Radiology / Imaging",
        cptCode: "71046",
        quantity: 2,
        unitPrice: 60,
        total: 120,
        insuranceCovered: 96,
        patientPayable: 24,
      },

      {
        id: "ITEM-4",
        description: "Sputum Culture & Comprehensive Blood Work (CBC, CRP)",
        category: "Laboratory",
        cptCode: "87070",
        quantity: 1,
        unitPrice: 140,
        total: 140,
        insuranceCovered: 112,
        patientPayable: 28,
      },

      {
        id: "ITEM-5",
        description: "Respiratory Therapy Consumables & Nebulization Protocol",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 90,
        total: 90,
        insuranceCovered: 72,
        patientPayable: 18,
      },

      {
        id: "ITEM-6",
        description: "Specialized Continuous Nursing Monitoring",
        category: "Nursing",
        cptCode: "99505",
        quantity: 6,
        unitPrice: 40,
        total: 240,
        insuranceCovered: 192,
        patientPayable: 48,
      },
    ],

    subtotal: 1490,

    discount: 0,

    tax: 0,

    totalAmount: 1490,

    insurancePortion: 1192,

    patientPortion: 298,

    amountPaid: 0,

    balanceDue: 298,

    payments: [],

    createdAt: "2026-08-21T09:30:00Z",

    updatedAt: "2026-08-22T09:20:00Z",
  },

  // ── INPATIENT: Bed 221-A (Robert Lee) ──

  {
    id: "CLM-8923",

    invoiceNo: "INV-2026-0813",

    patientId: "UMR100221",

    patientName: "Robert Lee",

    mrn: "100221",

    age: 68,

    gender: "Male",

    phone: "+91 98334 45566",

    department: "Inpatient",

    carePathway: "Inpatient Cardiology Private Stay (8 Days) + Telemetry",

    dateOfService: "2026-08-19",

    admissionId: 503,

    bedId: 3,

    insuranceProvider: "Care Health",

    policyNumber: "CARE-882190",

    preAuthCode: "AUTH-CARE-5541",

    status: "Draft",

    attendingDoctor: "Dr. James Wilson",

    diagnosisCodes: ["I50.9", "I25.10"],

    items: [
      {
        id: "ITEM-1",
        description: "Private Room Inpatient Stay (8 Days)",
        category: "Room / Bed Charges",
        cptCode: "99223",
        quantity: 8,
        unitPrice: 250,
        total: 2000,
        insuranceCovered: 1600,
        patientPayable: 400,
      },

      {
        id: "ITEM-2",
        description: "Cardiology Specialist Consultations & Rounding (8 Days)",
        category: "Consultation",
        cptCode: "99233",
        quantity: 8,
        unitPrice: 50,
        total: 400,
        insuranceCovered: 320,
        patientPayable: 80,
      },

      {
        id: "ITEM-3",
        description: "Echocardiography Transthoracic Complete",
        category: "Radiology / Imaging",
        cptCode: "93306",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "ITEM-4",
        description: "Daily Serum Electrolytes & Renal Function Panel",
        category: "Laboratory",
        cptCode: "80053",
        quantity: 4,
        unitPrice: 60,
        total: 240,
        insuranceCovered: 192,
        patientPayable: 48,
      },

      {
        id: "ITEM-5",
        description: "Continuous Cardiac Telemetry Monitoring (8 Days)",
        category: "Nursing",
        cptCode: "99505",
        quantity: 8,
        unitPrice: 40,
        total: 320,
        insuranceCovered: 256,
        patientPayable: 64,
      },

      {
        id: "ITEM-6",
        description: "Inpatient Clinical Consumables & Infusion Lines",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 140,
        total: 140,
        insuranceCovered: 112,
        patientPayable: 28,
      },
    ],

    subtotal: 3300,

    discount: 0,

    tax: 0,

    totalAmount: 3300,

    insurancePortion: 2640,

    patientPortion: 660,

    amountPaid: 0,

    balanceDue: 660,

    payments: [],

    createdAt: "2026-08-19T16:00:00Z",

    updatedAt: "2026-08-20T11:00:00Z",
  },

  // ── ICU: Critical Care Bed ICU-01 (Thomas Reed) ──

  {
    id: "CLM-8924",

    invoiceNo: "INV-2026-0814",

    patientId: "UMR100301",

    patientName: "Thomas Reed",

    mrn: "100301",

    age: 52,

    gender: "Male",

    phone: "+91 98451 22334",

    department: "ICU",

    carePathway:
      "ICU Critical Care Stay (7 Days) + Ventilator & Line Procedures",

    dateOfService: "2026-08-23",

    insuranceProvider: "HDFC ERGO",

    policyNumber: "HDFC-TE5-MK72",

    preAuthCode: "MC-ICU-8819",

    status: "Paid",

    attendingDoctor: "Dr. Gregory Vance",

    diagnosisCodes: ["R57.2", "N39.0", "J96.00"],

    items: [
      {
        id: "ITEM-1",
        description: "ICU Intensive Care Daily Bed Rate (7 Days)",
        category: "Room / Bed Charges",
        cptCode: "99291",
        quantity: 7,
        unitPrice: 350,
        total: 2450,
        insuranceCovered: 1960,
        patientPayable: 490,
      },

      {
        id: "ITEM-2",
        description: "Critical Care Specialist Daily Evaluation (7 Days)",
        category: "Consultation",
        cptCode: "99292",
        quantity: 7,
        unitPrice: 100,
        total: 700,
        insuranceCovered: 560,
        patientPayable: 140,
      },

      {
        id: "ITEM-3",
        description: "Emergency Intubation & Mechanical Ventilation Management",
        category: "Procedure / Surgery",
        cptCode: "31500",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "ITEM-4",
        description: "Arterial Line & Central Venous Line Placement",
        category: "Procedure / Surgery",
        cptCode: "36556",
        quantity: 1,
        unitPrice: 180,
        total: 180,
        insuranceCovered: 144,
        patientPayable: 36,
      },

      {
        id: "ITEM-5",
        description: "STAT ABG & Serial Lactate Testing (12 Panels)",
        category: "Laboratory",
        cptCode: "82803",
        quantity: 12,
        unitPrice: 80,
        total: 960,
        insuranceCovered: 768,
        patientPayable: 192,
      },

      {
        id: "ITEM-6",
        description: "Continuous 1:1 Critical Care Nursing (7 Days)",
        category: "Nursing",
        cptCode: "99505",
        quantity: 7,
        unitPrice: 80,
        total: 560,
        insuranceCovered: 448,
        patientPayable: 112,
      },

      {
        id: "ITEM-7",
        description: "High-Acuity Hemodynamic Consumables & Airway Kits",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 250,
        total: 250,
        insuranceCovered: 200,
        patientPayable: 50,
      },
    ],

    subtotal: 5300,

    discount: 0,

    tax: 0,

    totalAmount: 5300,

    insurancePortion: 4240,

    patientPortion: 1060,

    amountPaid: 5300,

    balanceDue: 0,

    payments: [
      {
        id: "PAY-1006",

        invoiceId: "CLM-8924",

        receiptNo: "RCPT-2026-5506",

        amount: 4240,

        paymentDate: "2026-08-26T11:00:00Z",

        paymentMethod: "Bank Transfer",

        transactionRef: "HDFC-EFT-7721",

        collectedBy: "Payer Direct Remittance",
      },

      {
        id: "PAY-1007",

        invoiceId: "CLM-8924",

        receiptNo: "RCPT-2026-5507",

        amount: 1060,

        paymentDate: "2026-08-26T12:15:00Z",

        paymentMethod: "Debit Card",

        transactionRef: "POS-DEBIT-5519",

        collectedBy: "Front Desk Cashier",
      },
    ],

    createdAt: "2026-08-23T08:00:00Z",

    updatedAt: "2026-08-26T12:20:00Z",
  },

  // ── EMERGENCY: Visit ER-2026-00001 (John Smith - STEMI) ──

  {
    id: "CLM-8927",

    invoiceNo: "INV-2026-0817",

    patientId: "UMR100245",

    patientName: "John Smith",

    mrn: "100245",

    age: 45,

    gender: "Male",

    phone: "+91 98765 43210",

    department: "Emergency",

    carePathway: "ER Resuscitation → Cath Lab Prep → Cath Activation",

    dateOfService: "2026-08-22",

    encounterId: "ER-2026-00001",

    insuranceProvider: "Star Health",

    policyNumber: "SH-28847291",

    preAuthCode: "AUTH-ER-99182",

    status: "Accepted",

    attendingDoctor: "Dr. Vikram Seth",

    diagnosisCodes: ["I21.0", "R07.9"],

    items: [
      {
        id: "ITEM-1",
        description: "Emergency Resuscitation & High-Acuity Triage (B1 Level)",
        category: "Consultation",
        cptCode: "99285",
        quantity: 1,
        unitPrice: 250,
        total: 250,
        insuranceCovered: 200,
        patientPayable: 50,
      },

      {
        id: "ITEM-2",
        description: "STAT 12-Lead Electrocardiogram (ECG)",
        category: "Laboratory",
        cptCode: "93005",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },

      {
        id: "ITEM-3",
        description: "STAT High-Sensitivity Cardiac Troponin-I POCT",
        category: "Laboratory",
        cptCode: "84484",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 80,
        patientPayable: 20,
      },

      {
        id: "ITEM-4",
        description: "Bedside Point-of-Care Echocardiogram (POCUS)",
        category: "Radiology / Imaging",
        cptCode: "93308",
        quantity: 1,
        unitPrice: 90,
        total: 90,
        insuranceCovered: 72,
        patientPayable: 18,
      },

      {
        id: "ITEM-5",
        description: "Emergency Trauma & IV Stabilization Kit",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 60,
        total: 60,
        insuranceCovered: 48,
        patientPayable: 12,
      },

      {
        id: "ITEM-6",
        description: "Cath Lab Emergency Activation & PPCI Prep",
        category: "Procedure / Surgery",
        cptCode: "31500",
        quantity: 1,
        unitPrice: 250,
        total: 250,
        insuranceCovered: 200,
        patientPayable: 50,
      },
    ],

    subtotal: 800,

    discount: 0,

    tax: 0,

    totalAmount: 800,

    insurancePortion: 640,

    patientPortion: 160,

    amountPaid: 0,

    balanceDue: 160,

    payments: [],

    createdAt: "2026-08-22T13:45:00Z",

    updatedAt: "2026-08-23T09:15:00Z",
  },

  // ── EMERGENCY: Visit ER-2026-00002 (Rahul Sharma - PM-JAY Paid) ──

  {
    id: "CLM-8928",

    invoiceNo: "INV-2026-0818",

    patientId: "UMR100342",

    patientName: "Rahul Sharma",

    mrn: "100342",

    age: 28,

    gender: "Male",

    phone: "+91 98234 56789",

    department: "Emergency",

    carePathway: "ER Triage B2 → CT Abdomen → Pre-Op Clearance → Settled",

    dateOfService: "2026-08-24",

    encounterId: "ER-2026-00002",

    insuranceProvider: "PM-JAY (Ayushman Bharat)",

    policyNumber: "AB-PMJAY-882910",

    status: "Paid",

    attendingDoctor: "Dr. Anita Roy",

    diagnosisCodes: ["K35.80"],

    items: [
      {
        id: "ITEM-1",
        description:
          "Emergency Department Moderate Severity Evaluation (B2 Level)",
        category: "Consultation",
        cptCode: "99284",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 150,
        patientPayable: 0,
      },

      {
        id: "ITEM-2",
        description: "Contrast-Enhanced CT Scan Abdomen & Pelvis",
        category: "Radiology / Imaging",
        cptCode: "74177",
        quantity: 1,
        unitPrice: 250,
        total: 250,
        insuranceCovered: 250,
        patientPayable: 0,
      },

      {
        id: "ITEM-3",
        description: "Complete Blood Count w/ Differential (CBC)",
        category: "Laboratory",
        cptCode: "85025",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 50,
        patientPayable: 0,
      },

      {
        id: "ITEM-4",
        description: "Pre-Op Surgical Clearance Panel & Urinalysis",
        category: "Laboratory",
        cptCode: "81001",
        quantity: 1,
        unitPrice: 60,
        total: 60,
        insuranceCovered: 60,
        patientPayable: 0,
      },

      {
        id: "ITEM-5",
        description: "Emergency IV Infusion & Procedural Supplies",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 40,
        total: 40,
        insuranceCovered: 40,
        patientPayable: 0,
      },
    ],

    subtotal: 550,

    discount: 0,

    tax: 0,

    totalAmount: 550,

    insurancePortion: 550,

    patientPortion: 0,

    amountPaid: 550,

    balanceDue: 0,

    payments: [
      {
        id: "PAY-1001",

        invoiceId: "CLM-8928",

        receiptNo: "RCPT-2026-5501",

        amount: 550,

        paymentDate: "2026-08-24T16:45:00Z",

        paymentMethod: "Bank Transfer",

        transactionRef: "PMJAY-EFT-99410",

        collectedBy: "NHA Electronic Remittance Gateway",
      },
    ],

    createdAt: "2026-08-24T10:00:00Z",

    updatedAt: "2026-08-24T16:50:00Z",
  },

  // ── OUTPATIENT: Encounter ENC-10067-1 (Rana Dhaggubati - Cardiology) ──

  {
    id: "CLM-8930",

    invoiceNo: "INV-2026-0820",

    patientId: "UMR10067",

    patientName: "Rana Dhaggubati",

    mrn: "100067",

    age: 36,

    gender: "Male",

    phone: "+91 97455 11223",

    department: "Outpatient",

    carePathway: "Cardiology OPD Consultation + STAT ECG & Troponin",

    dateOfService: "2026-08-31",

    encounterId: "ENC-10067-1",

    insuranceProvider: "HDFC ERGO",

    policyNumber: "HDFC-RD7-1092",

    status: "Ready",

    attendingDoctor: "Dr. Arjun Mehta",

    diagnosisCodes: ["I20.9"],

    items: [
      {
        id: "ITEM-1",
        description:
          "Cardiology Specialist Comprehensive Outpatient Consultation",
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 120,
        patientPayable: 30,
      },

      {
        id: "ITEM-2",
        description: "Standard 12-Lead Electrocardiogram (ECG)",
        category: "Laboratory",
        cptCode: "93005",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },

      {
        id: "ITEM-3",
        description: "High-Sensitivity Serum Troponin-I Assay",
        category: "Laboratory",
        cptCode: "84484",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 80,
        patientPayable: 20,
      },

      {
        id: "ITEM-4",
        description: "Outpatient Diagnostic Screen & Clinical Consumables",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 30,
        total: 30,
        insuranceCovered: 24,
        patientPayable: 6,
      },
    ],

    subtotal: 330,

    discount: 0,

    tax: 0,

    totalAmount: 330,

    insurancePortion: 264,

    patientPortion: 66,

    amountPaid: 0,

    balanceDue: 66,

    payments: [],

    createdAt: "2026-08-31T10:15:00Z",

    updatedAt: "2026-08-31T10:15:00Z",
  },

  // ── OUTPATIENT: Encounter ENC-10001-2 (Ravi Kumar - Cardiology Follow-up) ──

  {
    id: "CLM-8931",

    invoiceNo: "INV-2026-0821",

    patientId: "UMR10001",

    patientName: "Ravi Kumar",

    mrn: "100001",

    age: 42,

    gender: "Male",

    phone: "+91 98765 01192",

    department: "Outpatient",

    carePathway: "Cardiology Follow-up + Lipid Profile & HbA1c",

    dateOfService: "2026-08-31",

    encounterId: "ENC-10001-2",

    insuranceProvider: "Star Health",

    policyNumber: "SH-7721094",

    status: "Submitted",

    attendingDoctor: "Dr. Rajesh Sharma",

    diagnosisCodes: ["I10", "E78.5"],

    items: [
      {
        id: "ITEM-1",
        description: "Specialist Follow-up Consultation & Review",
        category: "Consultation",
        cptCode: "99213",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },

      {
        id: "ITEM-2",
        description: "Comprehensive Lipid Profile Panel",
        category: "Laboratory",
        cptCode: "80061",
        quantity: 1,
        unitPrice: 80,
        total: 80,
        insuranceCovered: 64,
        patientPayable: 16,
      },

      {
        id: "ITEM-3",
        description: "Standard 12-Lead Electrocardiogram (ECG)",
        category: "Laboratory",
        cptCode: "93005",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },

      {
        id: "ITEM-4",
        description: "Glycosylated Hemoglobin (HbA1c) Assay",
        category: "Laboratory",
        cptCode: "83036",
        quantity: 1,
        unitPrice: 60,
        total: 60,
        insuranceCovered: 48,
        patientPayable: 12,
      },
    ],

    subtotal: 240,

    discount: 0,

    tax: 0,

    totalAmount: 240,

    insurancePortion: 192,

    patientPortion: 48,

    amountPaid: 0,

    balanceDue: 48,

    payments: [],

    createdAt: "2026-08-31T10:25:00Z",

    updatedAt: "2026-08-31T10:30:00Z",
  },

  // ── OUTPATIENT: Encounter ENC-10002-1 (Sunita Patel - Self-Pay Paid) ──

  {
    id: "CLM-8932",

    invoiceNo: "INV-2026-0822",

    patientId: "UMR10002",

    patientName: "Sunita Patel",

    mrn: "100002",

    age: 38,

    gender: "Female",

    phone: "+91 98111 22334",

    department: "Outpatient",

    carePathway: "OPD Cardiology Evaluation + 2D Echo + Holter Monitor",

    dateOfService: "2026-08-30",

    encounterId: "ENC-10002-1",

    insuranceProvider: "Self-Pay",

    policyNumber: "N/A - Self Pay",

    status: "Paid",

    attendingDoctor: "Dr. Sarah Jenkins",

    diagnosisCodes: ["R00.2"],

    items: [
      {
        id: "ITEM-1",
        description: "Cardiology Initial Outpatient Evaluation",
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 0,
        patientPayable: 150,
      },

      {
        id: "ITEM-2",
        description: "2D Echocardiography & Color Doppler",
        category: "Radiology / Imaging",
        cptCode: "93306",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        insuranceCovered: 0,
        patientPayable: 200,
      },

      {
        id: "ITEM-3",
        description: "24-Hour Ambulatory Holter Monitoring",
        category: "Laboratory",
        cptCode: "93224",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 0,
        patientPayable: 150,
      },
    ],

    subtotal: 500,

    discount: 0,

    tax: 0,

    totalAmount: 500,

    insurancePortion: 0,

    patientPortion: 500,

    amountPaid: 500,

    balanceDue: 0,

    payments: [
      {
        id: "PAY-1003",

        invoiceId: "CLM-8932",

        receiptNo: "RCPT-2026-5503",

        amount: 500,

        paymentDate: "2026-08-30T11:30:00Z",

        paymentMethod: "Debit Card",

        transactionRef: "POS-DEBIT-77192",

        collectedBy: "Sarah Jenkins (Front Desk Cashier)",
      },
    ],

    createdAt: "2026-08-30T10:32:00Z",

    updatedAt: "2026-08-30T11:35:00Z",
  },

  // ── INPATIENT: Claim In Denial (Amit Patel) ──

  {
    id: "CLM-8929",

    invoiceNo: "INV-2026-0819",

    patientId: "UMR100418",

    patientName: "Amit Patel",

    mrn: "100418",

    age: 49,

    gender: "Male",

    phone: "+91 98221 44556",

    department: "Inpatient",

    carePathway: "Inpatient Stay (5 Days) + Abdominal Ultrasound & Endoscopy",

    dateOfService: "2026-08-18",

    insuranceProvider: "ICICI Lombard",

    policyNumber: "ICICI-881902",

    status: "Denied",

    denialReason:
      "Payer denied reimbursement: Timely filing limit exceeded & secondary pre-authorization query (Code: CO-29).",

    attendingDoctor: "Dr. Elena Rostova",

    diagnosisCodes: ["K29.70", "K21.9"],

    items: [
      {
        id: "ITEM-1",
        description: "General Medical Ward Daily Bed Rate (5 Days)",
        category: "Room / Bed Charges",
        cptCode: "99222",
        quantity: 5,
        unitPrice: 100,
        total: 500,
        insuranceCovered: 400,
        patientPayable: 100,
      },

      {
        id: "ITEM-2",
        description: "Attending Inpatient Physician Daily Rounds (5 Days)",
        category: "Consultation",
        cptCode: "99233",
        quantity: 5,
        unitPrice: 50,
        total: 250,
        insuranceCovered: 200,
        patientPayable: 50,
      },

      {
        id: "ITEM-3",
        description: "Diagnostic Upper GI Endoscopy Procedure",
        category: "Procedure / Surgery",
        cptCode: "43239",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "ITEM-4",
        description: "Ultrasound Whole Abdomen & Pelvis",
        category: "Radiology / Imaging",
        cptCode: "76700",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 80,
        patientPayable: 20,
      },

      {
        id: "ITEM-5",
        description: "Inpatient Consumables & Infusion Pack",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 50,
        total: 50,
        insuranceCovered: 40,
        patientPayable: 10,
      },
    ],

    subtotal: 1100,

    discount: 0,

    tax: 0,

    totalAmount: 1100,

    insurancePortion: 880,

    patientPortion: 220,

    amountPaid: 0,

    balanceDue: 220,

    payments: [],

    createdAt: "2026-08-18T11:00:00Z",

    updatedAt: "2026-08-27T15:20:00Z",
  },

  // ── OUTPATIENT: Ready for Submission (Meera Nair - Pulmonology) ──

  {
    id: "CLM-8933",

    invoiceNo: "INV-2026-0823",

    patientId: "UMR100522",

    patientName: "Meera Nair",

    mrn: "100522",

    age: 31,

    gender: "Female",

    phone: "+91 98450 77123",

    department: "Outpatient",

    carePathway: "Pulmonology Consultation + Spirometry & Chest X-Ray",

    dateOfService: "2026-08-31",

    encounterId: "ENC-100522-1",

    insuranceProvider: "Star Health",

    policyNumber: "SH-882194",

    preAuthCode: "AUTH-SH-7718",

    status: "Ready",

    attendingDoctor: "Dr. Rajesh Sharma",

    diagnosisCodes: ["J45.909"],

    items: [
      {
        id: "ITEM-1",
        description: "Specialist Comprehensive Outpatient Consultation",
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: 150,
        total: 150,
        insuranceCovered: 120,
        patientPayable: 30,
      },

      {
        id: "ITEM-2",
        description: "Spirometry with Pre- and Post-Bronchodilator Test",
        category: "Laboratory",
        cptCode: "94060",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 80,
        patientPayable: 20,
      },

      {
        id: "ITEM-3",
        description: "Digital Chest X-Ray PA View",
        category: "Radiology / Imaging",
        cptCode: "71046",
        quantity: 1,
        unitPrice: 60,
        total: 60,
        insuranceCovered: 48,
        patientPayable: 12,
      },

      {
        id: "ITEM-4",
        description: "High-Resolution CT Thorax Screening",
        category: "Radiology / Imaging",
        cptCode: "71250",
        quantity: 1,
        unitPrice: 250,
        total: 250,
        insuranceCovered: 200,
        patientPayable: 50,
      },

      {
        id: "ITEM-5",
        description: "Inhalation Therapy Consumables & Spacer Kit",
        category: "Consumables",
        cptCode: "A4649",
        quantity: 1,
        unitPrice: 40,
        total: 40,
        insuranceCovered: 32,
        patientPayable: 8,
      },
    ],

    subtotal: 600,

    discount: 0,

    tax: 0,

    totalAmount: 600,

    insurancePortion: 480,

    patientPortion: 120,

    amountPaid: 0,

    balanceDue: 120,

    payments: [],

    createdAt: "2026-08-31T11:45:00Z",

    updatedAt: "2026-08-31T11:45:00Z",
  },

  // ── OUTPATIENT: Voided Bill (Priya Sharma) ──

  {
    id: "CLM-8934",

    invoiceNo: "INV-2026-0824",

    patientId: "UMR100588",

    patientName: "Priya Sharma",

    mrn: "100588",

    age: 26,

    gender: "Female",

    phone: "+91 97110 88291",

    department: "Outpatient",

    carePathway: "Duplicate Outpatient Registration (Voided by Manager)",

    dateOfService: "2026-08-29",

    insuranceProvider: "Self-Pay",

    policyNumber: "N/A - Self Pay",

    status: "Voided",

    attendingDoctor: "Dr. Sarah Jenkins",

    diagnosisCodes: ["Z00.00"],

    items: [
      {
        id: "ITEM-1",
        description: "Outpatient Consultation & Review (Voided Entry)",
        category: "Consultation",
        cptCode: "99213",
        quantity: 1,
        unitPrice: 100,
        total: 100,
        insuranceCovered: 0,
        patientPayable: 0,
      },
    ],

    subtotal: 100,

    discount: 100,

    tax: 0,

    totalAmount: 0,

    insurancePortion: 0,

    patientPortion: 0,

    amountPaid: 0,

    balanceDue: 0,

    payments: [],

    createdAt: "2026-08-29T14:00:00Z",

    updatedAt: "2026-08-29T14:25:00Z",
  },

  // ── SURGERY: Operation Theatre & Procedure (Ananya Desai) ──

  {
    id: "CLM-8935",

    invoiceNo: "INV-2026-0825",

    patientId: "UMR100412",

    patientName: "Ananya Desai",

    mrn: "100412",

    age: 42,

    gender: "Female",

    phone: "+91 97112 33445",

    department: "Surgery",

    carePathway: "Surgery: Laparoscopic Cholecystectomy + Major OT + PACU Care",

    dateOfService: "2026-08-28",

    encounterId: "ENC-SURG-2026-44",

    hospitalStayId: "STAY-SURG-441",

    insuranceProvider: "HDFC ERGO",

    policyNumber: "HDFC-SURG-9912",

    preAuthCode: "AUTH-HDFC-6621",

    status: "Paid",

    attendingDoctor: "Dr. Vikram Seth (Chief Surgeon)",

    diagnosisCodes: ["K80.20"],

    items: [
      {
        id: "ITEM-1",
        description: "Laparoscopic Cholecystectomy / Abdominal Surgery",
        category: "Procedure / Surgery",
        cptCode: "47562",
        quantity: 1,
        unitPrice: 800,
        total: 800,
        insuranceCovered: 640,
        patientPayable: 160,
      },

      {
        id: "ITEM-2",
        description:
          "Major Operation Theatre (OT) Infrastructure Rate (2 Hours)",
        category: "Room / Bed Charges",
        cptCode: "99291",
        quantity: 1,
        unitPrice: 300,
        total: 300,
        insuranceCovered: 240,
        patientPayable: 60,
      },

      {
        id: "ITEM-3",
        description: "Chief Operating Surgeon Professional Fee",
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: 400,
        total: 400,
        insuranceCovered: 320,
        patientPayable: 80,
      },

      {
        id: "ITEM-4",
        description: "Consultant Anesthesiologist Pre-Op & Intra-Op Care",
        category: "Consultation",
        cptCode: "00840",
        quantity: 1,
        unitPrice: 200,
        total: 200,
        insuranceCovered: 160,
        patientPayable: 40,
      },

      {
        id: "ITEM-5",
        description: "PACU Post-Anesthesia Recovery Care & Monitoring",
        category: "Nursing",
        cptCode: "99505",
        quantity: 1,
        unitPrice: 80,
        total: 80,
        insuranceCovered: 64,
        patientPayable: 16,
      },
    ],

    subtotal: 1780,

    discount: 0,

    tax: 0,

    totalAmount: 1780,

    insurancePortion: 1424,

    patientPortion: 356,

    amountPaid: 1780,

    balanceDue: 0,

    payments: [
      {
        id: "PAY-1008",

        invoiceId: "CLM-8935",

        receiptNo: "RCPT-2026-5508",

        amount: 1424,

        paymentDate: "2026-08-29T10:00:00Z",

        paymentMethod: "Bank Transfer",

        transactionRef: "HDFC-SURG-7711",

        collectedBy: "Payer Direct Remittance",
      },

      {
        id: "PAY-1009",

        invoiceId: "CLM-8935",

        receiptNo: "RCPT-2026-5509",

        amount: 356,

        paymentDate: "2026-08-29T11:15:00Z",

        paymentMethod: "UPI / Digital",

        transactionRef: "UPI-GPAY-99418",

        collectedBy: "Sarah Jenkins (Front Desk)",
      },
    ],

    createdAt: "2026-08-28T09:00:00Z",

    updatedAt: "2026-08-29T11:20:00Z",
  },

  // ── LABORATORY: Pre-Paid Blood Work & Pathology (Patricia Okonkwo) ──

  {
    id: "CLM-8936",

    invoiceNo: "INV-2026-0826",

    patientId: "UMR100149",

    patientName: "Patricia Okonkwo",

    mrn: "100149",

    age: 58,

    gender: "Female",

    phone: "+91 98452 11990",

    department: "Laboratory",

    carePathway:
      "Pre-Operative Cross-Match & Transfusion Safety Diagnostic Panel",

    dateOfService: "2026-09-12",

    encounterId: "ENC-LAB-100149",

    insuranceProvider: "Self-Pay",

    policyNumber: "N/A - Self Pay",

    status: "Paid",

    attendingDoctor: "Dr. Williams",

    diagnosisCodes: ["Z01.812"],

    items: [
      {
        id: "ITEM-1",
        description: "Cross-Match Type & Screen (X-Match T&S)",
        category: "Laboratory",
        cptCode: "86900",
        quantity: 1,
        unitPrice: 140,
        total: 140,
        insuranceCovered: 0,
        patientPayable: 140,
      },
    ],

    subtotal: 140,

    discount: 0,

    tax: 0,

    totalAmount: 140,

    insurancePortion: 0,

    patientPortion: 140,

    amountPaid: 140,

    balanceDue: 0,

    payments: [
      {
        id: "PAY-1010",

        invoiceId: "CLM-8936",

        receiptNo: "RCPT-2026-5510",

        amount: 140,

        paymentDate: "2026-09-12T10:20:00Z",

        paymentMethod: "UPI / Digital",

        transactionRef: "UPI-PHONEPE-88210",

        collectedBy: "Lab Reception Cashier",
      },
    ],

    createdAt: "2026-09-12T10:15:00Z",

    updatedAt: "2026-09-12T10:25:00Z",
  },

  // ── RADIOLOGY: Pre-Paid Hip Imaging Scan (Patricia Okonkwo) ──

  {
    id: "CLM-8937",

    invoiceNo: "INV-2026-0827",

    patientId: "UMR100149",

    patientName: "Patricia Okonkwo",

    mrn: "100149",

    age: 58,

    gender: "Female",

    phone: "+91 98452 11990",

    department: "Radiology",

    carePathway: "Digital Radiography: Right Hip AP & Lateral Examination",

    dateOfService: "2026-09-12",

    encounterId: "ENC-RAD-100149",

    insuranceProvider: "Self-Pay",

    policyNumber: "N/A - Self Pay",

    status: "Paid",

    attendingDoctor: "Dr. Williams",

    diagnosisCodes: ["M16.11"],

    items: [
      {
        id: "ITEM-1",
        description: "Digital X-Ray Right Hip AP & Lateral Views",
        category: "Radiology / Imaging",
        cptCode: "73502",
        quantity: 1,
        unitPrice: 130,
        total: 130,
        insuranceCovered: 0,
        patientPayable: 130,
      },
    ],

    subtotal: 130,

    discount: 0,

    tax: 0,

    totalAmount: 130,

    insurancePortion: 0,

    patientPortion: 130,

    amountPaid: 130,

    balanceDue: 0,

    payments: [
      {
        id: "PAY-1011",

        invoiceId: "CLM-8937",

        receiptNo: "RCPT-2026-5511",

        amount: 130,

        paymentDate: "2026-09-12T10:25:00Z",

        paymentMethod: "Cash",

        transactionRef: "CASH-RAD-1102",

        collectedBy: "Radiology Reception Cashier",
      },
    ],

    createdAt: "2026-09-12T10:15:00Z",

    updatedAt: "2026-09-12T10:30:00Z",
  },
]

export class BillingDatabase {
  private static _cachedRadStudies: RadiologyStudyRecord[] | null = null
  private static _radStudiesCacheTime = 0
  private static readonly RAD_STUDIES_TTL = 30000

  static invalidateRadiologyStudiesCache(): void {
    this._cachedRadStudies = null
    this._radStudiesCacheTime = 0
  }

  private static load<T,>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)

      if (!raw) return fallback

      const parsed = JSON.parse(raw)
      if (key === STORAGE_KEY_CLAIMS && Array.isArray(parsed)) {
        // Demo bills once seeded into every browser are fictional patients;
        // server bills are owned by the server and must never come from here.
        const seedIds = new Set(INITIAL_HOSPITAL_CLAIMS.map((c) => c.id))
        const kept = parsed.filter(
          (c: ClaimRecord) =>
            c &&
            !seedIds.has(c.id) &&
            !c.serverInvoiceId &&
            !c.runningAdmissionId &&
            !String(c.id).startsWith("SRV-") &&
            !String(c.id).startsWith("RUN-") &&
            // bills the old insurance-claim converter invented
            !(/^CLM-\d+$/.test(String(c.id)) && c.attendingDoctor === "Dr. On-Duty" && c.mrn === "100245"),
        )
        if (kept.length !== parsed.length) {
          try {
            localStorage.setItem(key, JSON.stringify(kept))
          } catch {}
        }
        return kept as T
      }
      return parsed
    } catch {
      return fallback
    }
  }

  private static save<T,>(key: string, data: T): void {
    const toStore =
      key === STORAGE_KEY_CLAIMS && Array.isArray(data)
        ? (data as ClaimRecord[]).filter((c) => !c.serverInvoiceId && !c.runningAdmissionId)
        : data
    const serialized = JSON.stringify(toStore)
    const saved = safeLocalStorageSetItem(key, serialized)
    if (!saved) {
      console.warn(`[BillingDatabase] Write to localStorage throttled for "${key}". Changes retained in memory.`)
    }
    this.dispatchUpdate()
  }

  static dispatchUpdate(): void {
    this._cachedRadStudies = null
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(BILLING_UPDATE_EVENT))
    }
  }

  static emitUpdate(): void {
    this.dispatchUpdate()
  }

  /**
   * Kept for existing callers (the doctor live board). Bills now come from
   * the server's invoices via billingSync, with each invoice's insurance
   * claim attached to it -- the old version turned every insurance claim into
   * a second, separate bill filled with placeholder details.
   */
  static syncClaimsWithBackend(): void {
    void syncServerBilling()
  }

  static addDepartmentCharge(charge: any): ClaimRecord {
    return this.createClaim(charge)
  }

  /**
   * Live updates for billing screens. Fires on any change that alters a bill:
   * a write in this tab, the server's invoices changing (polled while any
   * billing screen is open), a new OP visit at reception, and bill or visit
   * writes from other tabs. Bursts are batched into one callback.
   */
  static onUpdate(callback: () => void): () => void {
    if (typeof window === "undefined") return () => {}

    let queued = false
    const handler = () => {
      if (queued) return
      queued = true
      // A timer, not requestAnimationFrame: rAF is paused in background tabs,
      // so a billing screen behind another tab would never catch up.
      setTimeout(() => {
        queued = false
        callback()
      }, 30)
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === STORAGE_KEY_CLAIMS || e.key.startsWith("hospai_db_") || e.key.startsWith("hosp_billing_")) handler()
    }

    window.addEventListener(BILLING_UPDATE_EVENT, handler)
    window.addEventListener("storage", onStorage)
    const unSync = onBillingSync(handler)
    const release = retainBillingSync()
    const unDb = db.subscribe(handler)

    return () => {
      window.removeEventListener(BILLING_UPDATE_EVENT, handler)
      window.removeEventListener("storage", onStorage)
      unSync()
      release()
      unDb()
    }
  }

  static getStandardServices() {
    return STANDARD_SERVICES
  }

  static getDepartmentTariffCatalog() {
    return DEPARTMENT_TARIFF_CATALOG
  }

  // ── INVOICES & CLAIMS ───────────────────────────────────────────────────────

  static getClaims(filter?: {
    status?: ClaimStatus | "All"

    department?: DepartmentType | "All"

    search?: string

    umr?: string
  }): ClaimRecord[] {
    let claims = this.load<ClaimRecord[]>(
      STORAGE_KEY_CLAIMS,
      [],
    )

    // Open OP / non-admitted bills that carry insurance are patient-pay.
    // Settled ("Paid") history is left exactly as it happened.
    {
      let changed = false
      claims = claims.map((c) => {
        const insured =
          (c.insuranceProvider && c.insuranceProvider !== "Self-Pay") ||
          (c.insurancePortion || 0) > 0 ||
          !!c.tpa
        if (!insured || c.status === "Paid" || isCashlessEligible(c)) return c
        changed = true
        const items = c.items.map((it) => ({
          ...it,
          insuranceCovered: 0,
          patientPayable: Number(it.total || 0),
        }))
        const patientPortion = c.totalAmount
        return {
          ...c,
          items,
          insuranceProvider: "Self-Pay",
          policyNumber: "",
          preAuthCode: undefined,
          tpa: undefined,
          denialReason: undefined,
          insurancePortion: 0,
          patientPortion,
          balanceDue: Math.max(0, patientPortion - (c.amountPaid || 0)),
          status: (c.amountPaid || 0) >= patientPortion ? "Paid" : "Ready",
          updatedAt: new Date().toISOString(),
        }
      })
      if (changed) this.save(STORAGE_KEY_CLAIMS, claims)
    }


    // Auto-sync OP Encounters from db.ts if not yet in claims list. These are
    // derived on every read (not stored until a payment is taken on them).
    const derivedOp = new Set<string>()
    try {
      const opEncs = db.getEncounters();
      const existingEncounterIds = new Set(
        claims.map((c) => c.encounterId || c.id).filter(Boolean),
      );

      opEncs.forEach((enc) => {
        if (!existingEncounterIds.has(enc.id)) {
          const regFee = enc.billing?.registrationFee ?? (enc.isNew === false ? 0 : 20);
          const consultFee =
            enc.billing?.consultationFee ??
            getDoctorConsultationFee(enc.assignedDoctor);
          const labFee = enc.billing?.labFee ?? 0;
          const totalAmt = regFee + consultFee + labFee;
          const isPaid =
            enc.billing?.status === "Paid" || enc.status === "OP Completed";

          const items: InvoiceItem[] = [];

          if (regFee > 0) {
            items.push({
              id: `ITEM-REG-${enc.id}`,
              description: `Patient Registration Fee – ₹${regFee}`,
              category: "Registration",
              cptCode: "99201",
              quantity: 1,
              unitPrice: regFee,
              total: regFee,
              insuranceCovered: 0,
              patientPayable: regFee,
              orderedBy: "Front Desk Registration",
              orderedAt: enc.registrationTime,
            });
          }

          items.push({
            id: `ITEM-CONSULT-${enc.id}`,
            description: `Physician Consultation Fee (${enc.assignedDoctor || enc.dept || "Attending Specialist"})`,
            category: "Consultation",
            cptCode: "99205",
            quantity: 1,
            unitPrice: consultFee,
            total: consultFee,
            insuranceCovered: 0,
            patientPayable: consultFee,
            orderedBy: enc.assignedDoctor || "OP Physician",
            orderedAt: enc.registrationTime,
          });

          if (labFee > 0) {
            items.push({
              id: `ITEM-LAB-${enc.id}`,
              description: "Diagnostic Investigations & Services",
              category: "Laboratory",
              cptCode: "80050",
              quantity: 1,
              unitPrice: labFee,
              total: labFee,
              insuranceCovered: 0,
              patientPayable: labFee,
              orderedBy: enc.assignedDoctor || "OP Physician",
            });
          }

          const visitIso = (() => {
            try {
              return encounterArrivalIso(enc)
            } catch {
              return ""
            }
          })()
          const visitAt = visitIso && !Number.isNaN(new Date(visitIso).getTime()) ? new Date(visitIso).toISOString() : new Date().toISOString()
          derivedOp.add(`CLM-${enc.id}`)
          const newClaim: ClaimRecord = {
            id: `CLM-${enc.id}`,
            invoiceNo: `INV-${enc.opNumber}`,
            encounterId: enc.id,
            patientId: enc.umr,
            patientName: enc.patientName,
            mrn: enc.umr.replace("UMR", ""),
            age: enc.age,
            gender: enc.sex === "Female" ? "Female" : "Male",
            phone: enc.phone,
            payments: [],
            department: "Outpatient",
            carePathway: `${enc.dept} Consultation (${enc.opNumber})`,
            dateOfService: OpReportsService.getEncounterDate(enc) || (enc as any).createdAt?.split("T")[0] || visitAt.split("T")[0],
            insuranceProvider: "Self-Pay",
            policyNumber: "N/A",
            status: isPaid ? "Paid" : "Draft",
            attendingDoctor: enc.assignedDoctor || "OP Physician",
            diagnosisCodes: [enc.icd10 || "Z00.00"],
            items,
            subtotal: totalAmt,
            discount: 0,
            tax: 0,
            totalAmount: totalAmt,
            insurancePortion: 0,
            patientPortion: totalAmt,
            amountPaid: isPaid ? totalAmt : 0,
            balanceDue: isPaid ? 0 : totalAmt,
            createdAt: visitAt,
            updatedAt: visitAt,
          };

          claims.push(newClaim);
        }
      });
    } catch {
      // ignore
    }

    // The hospital's server invoices (billing-service), kept live by
    // billingSync. A bill this browser derived from an OP visit is dropped when
    // the server already holds that patient's OP invoice for the same day --
    // reception writes the visit there too, and a patient must not see the
    // same consultation billed twice.
    const server = getServerClaims()
    if (server.length) {
      const serverOp = new Set(
        server
          .filter((c) => c.department === "Outpatient")
          .map((c) => `${c.patientId.toUpperCase()}|${c.dateOfService}`),
      )
      claims = claims.filter(
        (c) => !(derivedOp.has(c.id) && serverOp.has(`${c.patientId.toUpperCase()}|${c.dateOfService}`)),
      )
      claims = [...claims, ...server]
    }

    if (filter) {
      if (filter.status && filter.status !== "All") {
        claims = claims.filter((c) => c.status === filter.status)
      }

      if (filter.department && filter.department !== "All") {
        claims = claims.filter((c) => c.department === filter.department)
      }

      if (filter.umr && filter.umr.trim()) {
        const u = filter.umr.trim().toLowerCase()

        claims = claims.filter(
          (c) => c.patientId.toLowerCase() === u || c.mrn.toLowerCase() === u,
        )
      }

      if (filter.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase()

        claims = claims.filter(
          (c) =>
            c.patientName.toLowerCase().includes(q) ||
            c.mrn.toLowerCase().includes(q) ||
            c.patientId.toLowerCase().includes(q) ||
            c.invoiceNo.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q) ||
            c.insuranceProvider.toLowerCase().includes(q) ||
            (c.encounterId && c.encounterId.toLowerCase().includes(q)) ||
            (c.hospitalStayId && c.hospitalStayId.toLowerCase().includes(q)) ||
            c.items.some(
              (it) =>
                it.description.toLowerCase().includes(q) ||
                it.cptCode.toLowerCase().includes(q),
            ),
        )
      }
    }

    return claims.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }

  static getClaimById(id: string): ClaimRecord | undefined {
    const claims = this.getClaims()

    return claims.find((c) => c.id === id || c.invoiceNo === id)
  }

  static createClaim(data: Partial<ClaimRecord>): ClaimRecord {
    let claims = this.load<ClaimRecord[]>(
      STORAGE_KEY_CLAIMS,
      [],
    )

    // OP / non-admitted bills never carry insurance: the patient's policy on
    // their registration is irrelevant to an OP visit.
    if (
      data.department &&
      !isCashlessEligible({ department: data.department, carePathway: data.carePathway }) &&
      data.insuranceProvider &&
      data.insuranceProvider !== "Self-Pay"
    ) {
      data = {
        ...data,
        insuranceProvider: "Self-Pay",
        policyNumber: "",
        preAuthCode: undefined,
        items: (data.items || []).map((it) => ({
          ...it,
          insuranceCovered: 0,
          patientPayable: Number(it.total || 0),
        })),
      }
    }

    const maxClaimNum = claims.reduce((max, c) => {
      const num = parseInt((c.id || "").replace(/\D/g, ""), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 8937);
    const claimNum = maxClaimNum + 1;

    const maxInvNum = claims.reduce((max, c) => {
      const match = (c.invoiceNo || "").match(/(\d+)$/);
      const num = match ? parseInt(match[1], 10) : 0;
      return num > max ? num : max;
    }, 827);
    const invNum = maxInvNum + 1;

    const nowIso = new Date().toISOString()

    const items: InvoiceItem[] = data.items || []

    const subtotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0)

    const discount = Number(data.discount || 0)

    const tax = Number(data.tax || 0)

    const totalAmount = Math.max(0, subtotal - discount + tax)

    // Calculate insurance & patient portions

    const isSelfPay = (data.insuranceProvider || "Self-Pay") === "Self-Pay"

    const insurancePortion = isSelfPay
      ? 0
      : items.reduce((sum, it) => sum + Number(it.insuranceCovered || 0), 0)

    const patientPortion = isSelfPay
      ? totalAmount
      : Math.max(0, totalAmount - insurancePortion)

    // Upsert: If an invoice already exists for this encounter, update it directly

    const existingIndex = claims.findIndex(
      (c) =>
        (data.encounterId && c.encounterId === data.encounterId) ||
        (data.id && c.id === data.id),
    )

    if (existingIndex >= 0) {
      const existing = claims[existingIndex]

      const finalAmountPaid =
        data.amountPaid !== undefined ? data.amountPaid : existing.amountPaid;
      const finalBalanceDue =
        data.balanceDue !== undefined
          ? data.balanceDue
          : Math.max(0, patientPortion - finalAmountPaid);
      const finalStatus =
        data.status ||
        (finalAmountPaid >= patientPortion ? "Paid" : "Accepted");

      const updatedClaim: ClaimRecord = {
        ...existing,

        ...data,

        id: existing.id,

        invoiceNo: existing.invoiceNo,

        items,

        subtotal,

        discount,

        tax,

        totalAmount,

        insurancePortion,

        patientPortion,

        amountPaid: finalAmountPaid,

        balanceDue: finalBalanceDue,

        status: finalStatus,

        updatedAt: nowIso,
      }

      claims[existingIndex] = updatedClaim

      this.save(STORAGE_KEY_CLAIMS, claims)

      return updatedClaim
    }

    const newClaim: ClaimRecord = {
      id: data.id || `CLM-${claimNum}`,

      invoiceNo:
        data.invoiceNo || `INV-2026-${String(invNum).padStart(4, "0")}`,

      patientId:
        data.patientId || `UMR${Math.floor(100000 + Math.random() * 900000)}`,

      patientName: data.patientName || "Hospital Patient",

      mrn: data.mrn || `100${Math.floor(100 + Math.random() * 899)}`,

      age: data.age || 40,

      gender: data.gender || "Other",

      phone: data.phone || "+91 98765 43210",

      department: data.department || "Outpatient",

      carePathway: data.carePathway,

      dateOfService:
        data.dateOfService || new Date().toISOString().split("T")[0],

      encounterId: data.encounterId,

      hospitalStayId: data.hospitalStayId,

      admissionId: data.admissionId,

      bedId: data.bedId,

      insuranceProvider: data.insuranceProvider || "Self-Pay",

      policyNumber:
        data.policyNumber || (isSelfPay ? "N/A - Self Pay" : "POL-UNSPECIFIED"),

      preAuthCode: data.preAuthCode,

      status: data.status || "Accepted",

      items,

      subtotal,

      discount,

      tax,

      totalAmount,

      insurancePortion,

      patientPortion,

      amountPaid: 0,

      balanceDue: patientPortion,

      payments: [],

      denialReason: data.denialReason,

      appealNotes: data.appealNotes,

      diagnosisCodes:
        data.diagnosisCodes && data.diagnosisCodes.length > 0
          ? data.diagnosisCodes
          : ["Z00.00"],

      attendingDoctor: data.attendingDoctor || "Dr. Staff Physician",

      finalizedByNurse: data.finalizedByNurse,

      createdAt: nowIso,

      updatedAt: nowIso,
    }

    claims.unshift(newClaim)

    this.save(STORAGE_KEY_CLAIMS, claims)

    BillingRbacManager.logEvent({
      action: "INVOICE_CREATED",

      patientId: newClaim.patientId,

      patientName: newClaim.patientName,

      mrn: newClaim.mrn,

      invoiceNo: newClaim.invoiceNo,

      claimId: newClaim.id,

      financialAmount: newClaim.totalAmount,

      department: newClaim.department,

      reason: `Direct invoice created for ${newClaim.department} under UMR ${newClaim.patientId} (${newClaim.items.length} services).`,
    })

    // Backend write-through for invoice, items, and insurance claim
    apiFetch("/api/billing/invoices", {
      method: "POST",
      body: JSON.stringify({
        patient_id: newClaim.patientId,
        module: newClaim.department || "OP",
        doctor_name: (data as any).consultingDoctor || "Dr. Staff",
        total_amount: newClaim.totalAmount,
        paid_amount: newClaim.amountPaid || 0,
        due_amount: newClaim.balanceDue || 0,
        status: newClaim.balanceDue === 0 ? "paid" : (newClaim.amountPaid || 0) > 0 ? "partial" : "due",
      }),
    }).then((invRes) => {
      if (invRes && invRes.invoice_id) {
        if (newClaim.items && newClaim.items.length > 0) {
          apiFetch(`/api/billing/invoices/${invRes.invoice_id}/items`, {
            method: "POST",
            body: JSON.stringify({
              items: newClaim.items.map((it) => ({
                service_name: (it as any).serviceName || (it as any).description || "Medical Service",
                quantity: it.quantity || 1,
                unit_price: it.unitPrice || it.total || 0,
                amount: it.total || 0,
                department: newClaim.department || "General",
              })),
            }),
          }).catch(() => {})
        }
        if (newClaim.insuranceProvider && newClaim.insuranceProvider !== "Self-Pay") {
          apiFetch("/api/billing/claims", {
            method: "POST",
            body: JSON.stringify({
              invoice_id: invRes.invoice_id,
              insurer_name: newClaim.insuranceProvider,
              claim_amount: newClaim.insurancePortion || newClaim.totalAmount,
              status: newClaim.status ? newClaim.status.toLowerCase() : "submitted",
              pre_auth_code: newClaim.preAuthCode,
              notes: `Policy #${newClaim.policyNumber}`,
            }),
          }).catch(() => {})
        }
      }
    }).catch(() => {})

    return newClaim
  }

  static updateClaim(id: string, updates: Partial<ClaimRecord>): ClaimRecord {
    if (/^(SRV|RUN)-/i.test(String(id))) {
      throw new Error(
        "This bill is held by the hospital server (or is a running admission bill) and cannot be edited here. Changes are made on the server's invoice.",
      )
    }
    const claims = this.load<ClaimRecord[]>(
      STORAGE_KEY_CLAIMS,
      [],
    )

    const idx = claims.findIndex((c) => c.id === id || c.invoiceNo === id)

    if (idx < 0) throw new Error("Claim not found")

    const current = claims[idx]

    const items = updates.items || current.items

    const subtotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0)

    const discount =
      updates.discount !== undefined
        ? Number(updates.discount)
        : current.discount

    const tax = updates.tax !== undefined ? Number(updates.tax) : current.tax

    const totalAmount = Math.max(0, subtotal - discount + tax)

    const isSelfPay =
      (updates.insuranceProvider || current.insuranceProvider) === "Self-Pay"

    const tpa = updates.tpa !== undefined ? updates.tpa : current.tpa
    const covered = items.reduce(
      (sum, it) => sum + Number(it.insuranceCovered || 0),
      0,
    )
    // An insurer deduction only lands on the patient when the insurance
    // department chose to recover it; otherwise the hospital writes it off
    // and the patient's share stays as billed.
    const recoveredFromPatient =
      tpa?.shortfallTo === "patient" ? Number(tpa?.deduction || 0) : 0
    const insurancePortion = isSelfPay
      ? 0
      : Math.max(0, covered - recoveredFromPatient)

    const patientPortion = isSelfPay
      ? totalAmount
      : Math.max(0, totalAmount - insurancePortion)

    const amountPaid =
      updates.amountPaid !== undefined
        ? Number(updates.amountPaid)
        : current.amountPaid

    const balanceDue = Math.max(0, patientPortion - amountPaid)

    let status = updates.status || current.status

    if (
      balanceDue === 0 &&
      (status === "Accepted" || status === "Ready" || status === "Draft")
    ) {
      if (
        amountPaid >= patientPortion &&
        (isSelfPay || current.status === "Accepted")
      ) {
        status = "Paid"
      }
    }

    const updatedClaim: ClaimRecord = {
      ...current,

      ...updates,

      items,

      subtotal,

      discount,

      tax,

      totalAmount,

      insurancePortion,

      patientPortion,

      amountPaid,

      balanceDue,

      status,

      updatedAt: new Date().toISOString(),
    }

    claims[idx] = updatedClaim

    this.save(STORAGE_KEY_CLAIMS, claims)

    return updatedClaim
  }

  static submitClaim(id: string): ClaimRecord {
    const claim = this.getClaimById(id)

    if (!claim) throw new Error("Claim not found")

    const newStatus: ClaimStatus =
      claim.insuranceProvider === "Self-Pay" ? "Ready" : "Submitted"

    const updated = this.updateClaim(id, {
      status: newStatus,

      updatedAt: new Date().toISOString(),
    })

    BillingRbacManager.logEvent({
      action: "CLAIM_SUBMITTED",

      patientId: claim.patientId,

      patientName: claim.patientName,

      mrn: claim.mrn,

      invoiceNo: claim.invoiceNo,

      claimId: claim.id,

      financialAmount: claim.insurancePortion,

      department: claim.department,

      reason: `Claim submitted to clearinghouse / payer (${claim.insuranceProvider}) for ₹${claim.insurancePortion.toLocaleString("en-IN")}.`,
    })

    const numericClaimId = parseInt(id.replace(/\D/g, ""))
    if (!isNaN(numericClaimId)) {
      apiFetch(`/api/billing/claims/${numericClaimId}`, {
        method: "PUT",
        body: JSON.stringify({
          status: updated.status ? updated.status.toLowerCase() : undefined,
          approved_amount: updated.amountPaid || updated.insurancePortion,
        }),
      }).catch(() => {})
    }

    return updated
  }

  static resetClaimToUnpaid(query: string): boolean {
    if (/^(SRV|RUN)-/i.test(String(query))) return false
    const claims = this.load<ClaimRecord[]>(
      STORAGE_KEY_CLAIMS,
      [],
    )

    const q = (query || "").toLowerCase().trim()

    let modified = false

    const updated = claims.map((c) => {
      const match =
        (c.encounterId && c.encounterId.toLowerCase().includes(q)) ||
        (c.patientId && c.patientId.toLowerCase().includes(q)) ||
        (c.patientName && c.patientName.toLowerCase().includes(q)) ||
        (c.invoiceNo && c.invoiceNo.toLowerCase().includes(q)) ||
        (c.id && c.id.toLowerCase().includes(q))

      if (match) {
        modified = true

        const total = c.patientPortion || c.totalAmount || 4000

        return {
          ...c,

          status: "Accepted" as const,

          amountPaid: 0,

          balanceDue: total,

          patientPortion: total,

          payments: [],

          updatedAt: new Date().toISOString(),
        }
      }

      return c
    })

    if (modified) {
      this.save(STORAGE_KEY_CLAIMS, updated)

      return true
    }

    return false
  }

  static resetClaimToUnbilled(query: string): boolean {
    if (/^(SRV|RUN)-/i.test(String(query))) return false
    const claims = this.load<ClaimRecord[]>(
      STORAGE_KEY_CLAIMS,
      [],
    )

    const q = (query || "").toLowerCase().trim()

    const filtered = claims.filter((c) => {
      const match =
        (c.encounterId && c.encounterId.toLowerCase().includes(q)) ||
        (c.patientId && c.patientId.toLowerCase().includes(q)) ||
        (c.patientName && c.patientName.toLowerCase().includes(q)) ||
        (c.invoiceNo && c.invoiceNo.toLowerCase().includes(q)) ||
        (c.id && c.id.toLowerCase().includes(q))

      return !match
    })

    if (filtered.length !== claims.length) {
      this.save(STORAGE_KEY_CLAIMS, filtered)

      return true
    }

    return false
  }

  static bulkSubmitClaims(ids: string[]): number {
    let count = 0

    ids.forEach((id) => {
      try {
        this.submitClaim(id)

        count++
      } catch (e) {
        console.error(`Failed to submit claim ${id}:`, e)
      }
    })

    if (count > 0) {
      BillingRbacManager.logEvent({
        action: "CLAIM_BULK_SUBMITTED",

        patientId: "BATCH",

        patientName: `Batch (${count} Claims)`,

        mrn: "N/A",

        invoiceNo: "BATCH-SUBMIT",

        reason: `Bulk submission of ${count} claims processed to clearinghouse.`,
      })
    }

    return count
  }

  static resubmitClaim(id: string, notes?: string): ClaimRecord {
    const claim = this.getClaimById(id)

    if (!claim) throw new Error("Claim not found")

    const updated = this.updateClaim(id, {
      status: "Submitted",

      denialReason: undefined,

      appealNotes:
        notes ||
        `Corrected claim re-submitted to payer with updated clinical codes.`,

      updatedAt: new Date().toISOString(),
    })

    BillingRbacManager.logEvent({
      action: "CLAIM_RESUBMITTED",

      patientId: claim.patientId,

      patientName: claim.patientName,

      mrn: claim.mrn,

      invoiceNo: claim.invoiceNo,

      claimId: claim.id,

      financialAmount: claim.insurancePortion,

      department: claim.department,

      reason: `Claim resubmitted with corrections: ${notes || "Updated pre-authorization & diagnosis codes"}`,
    })

    return updated
  }

  static appealClaim(id: string, appealNotes: string): ClaimRecord {
    const claim = this.getClaimById(id)

    if (!claim) throw new Error("Claim not found")

    const updated = this.updateClaim(id, {
      status: "Appeal",

      appealNotes,

      updatedAt: new Date().toISOString(),
    })

    BillingRbacManager.logEvent({
      action: "CLAIM_APPEALED",

      patientId: claim.patientId,

      patientName: claim.patientName,

      mrn: claim.mrn,

      invoiceNo: claim.invoiceNo,

      claimId: claim.id,

      financialAmount: claim.insurancePortion,

      department: claim.department,

      reason: `Formal appeal filed: ${appealNotes}`,
    })

    return updated
  }

  // ── Insurance / TPA workflow ────────────────────────────────────────────

  private static tpaStep(
    id: string,
    patch: Partial<TpaWorkflow>,
    event: TpaEvent,
    extra: Partial<ClaimRecord> = {},
    audit?: {
      action: Parameters<typeof BillingRbacManager.logEvent>[0]["action"]
      amount?: number
    },
  ): ClaimRecord {
    const claim = this.getClaimById(id)
    if (!claim) throw new Error("Claim not found")
    const tpa: TpaWorkflow = {
      ...(claim.tpa ?? {}),
      ...patch,
      events: [...(claim.tpa?.events ?? []), event],
    }
    const updated = this.updateClaim(claim.id, { ...extra, tpa })
    if (audit) {
      BillingRbacManager.logEvent({
        action: audit.action,
        patientId: claim.patientId,
        patientName: claim.patientName,
        mrn: claim.mrn,
        invoiceNo: claim.invoiceNo,
        claimId: claim.id,
        financialAmount: audit.amount ?? claim.insurancePortion,
        department: claim.department,
        reason: `${event.action}${event.detail ? ` — ${event.detail}` : ""}`,
      })
    }
    this.emitUpdate()
    return updated
  }

  /**
   * Cashless billing: the counter hands the bill to insurance. The insurer
   * takes everything the patient has not already paid, so the patient's
   * balance becomes zero and the bill leaves the counter's queue. From here
   * the insurance department owns it (see the Insurance > Claims Desk).
   */
  static billToInsurance(
    id: string,
    input?: {
      provider?: string
      tpaName?: string
      policyNumber?: string
      preAuthCode?: string
      note?: string
      billedBy?: string
      /**
       * Insurer's share per charge line (item id -> amount). Whatever is not
       * covered is the patient's co-pay, collected at the counter. Omit it and
       * insurance takes everything the patient has not already paid.
       */
      coverage?: Record<string, number>
    },
  ): ClaimRecord {
    const claim = this.getClaimById(id)
    if (!claim) throw new Error("Claim not found")
    if (!isCashlessEligible(claim))
      throw new Error("Insurance covers admitted patients only — an OP visit is paid by the patient.")
    if (input?.coverage) return this.applyInsuranceSplit(claim, input.coverage, "handover", input)

    const provider =
      input?.provider?.trim() ||
      (claim.insuranceProvider && claim.insuranceProvider !== "Self-Pay"
        ? claim.insuranceProvider
        : "Pending Insurance Assignment")
    const policyNumber =
      input?.policyNumber?.trim() ||
      claim.policyNumber ||
      "Pending KYC"

    const claimAmount = Math.max(0, claim.totalAmount - (claim.amountPaid || 0))
    if (claimAmount <= 0) throw new Error("Nothing left on this bill to claim.")

    // Spread the claim across the lines in proportion; the last line takes
    // the rounding so the lines add up to the claim exactly.
    const ratio = claim.totalAmount > 0 ? claimAmount / claim.totalAmount : 0
    let assigned = 0
    const items = claim.items.map((it, i) => {
      const insuranceCovered =
        i === claim.items.length - 1
          ? claimAmount - assigned
          : Math.round(it.total * ratio)
      assigned += insuranceCovered
      return {
        ...it,
        insuranceCovered,
        patientPayable: Math.max(0, it.total - insuranceCovered),
      }
    })

    const now = new Date().toISOString()
    const detail = input?.provider
      ? `${provider}${input.tpaName ? ` via ${input.tpaName}` : ""} · policy ${policyNumber}${input.note ? ` · ${input.note}` : ""}`
      : "Pushed to Insurance Department from billing counter"

    return this.tpaStep(
      claim.id,
      {
        tpaName: input?.tpaName,
        billedAt: now,
        billedBy: input?.billedBy || "Billing Counter",
        claimAmount,
        preAuthStatus: input?.preAuthCode ? "Approved" : claim.tpa?.preAuthStatus || "Not Raised",
        shortfallTo: "writeoff",
      },
      {
        at: now,
        action: "Billed to insurance at counter",
        detail,
        amount: claimAmount,
      },
      {
        items,
        insuranceProvider: provider,
        policyNumber: policyNumber,
        preAuthCode: input?.preAuthCode || claim.preAuthCode,
        status: "Ready",
      },
      { action: "INSURANCE_ATTACHED", amount: claimAmount },
    )
  }

  /**
   * Change how a bill is split between insurer and patient. Allowed until the
   * claim is submitted to the insurer -- after that the insurer's decision
   * governs and the split is locked.
   */
  static setInsuranceSplit(id: string, coverage: Record<string, number>): ClaimRecord {
    const claim = this.getClaimById(id)
    if (!claim) throw new Error("Claim not found")
    if (!claim.tpa?.billedAt) throw new Error("This bill has not been billed to insurance.")
    if (claim.status !== "Ready" && claim.status !== "Draft")
      throw new Error("The claim is already with the insurer; its split can no longer be edited.")
    return this.applyInsuranceSplit(claim, coverage, "edit")
  }

  private static applyInsuranceSplit(
    claim: ClaimRecord,
    coverage: Record<string, number>,
    mode: "handover" | "edit",
    input?: { provider?: string ;tpaName?: string ;policyNumber?: string ;preAuthCode?: string ;note?: string ;billedBy?: string },
  ): ClaimRecord {
    // Clamp every line to 0..line total, in whole rupees.
    const items = claim.items.map((it) => {
      const raw = coverage[it.id]
      const insuranceCovered =
        raw === undefined ? Number(it.insuranceCovered || 0) : Math.max(0, Math.min(it.total, Math.round(Number(raw) || 0)))
      return { ...it, insuranceCovered, patientPayable: Math.max(0, it.total - insuranceCovered) }
    })
    const claimAmount = items.reduce((a, it) => a + it.insuranceCovered, 0)
    if (claimAmount <= 0) throw new Error("Insurance must cover at least one charge.")
    // The patient's share cannot fall below what they have already paid.
    const patientShare = claim.totalAmount - claimAmount
    if (patientShare < (claim.amountPaid || 0))
      throw new Error(
        `The patient has already paid ₹${(claim.amountPaid || 0).toLocaleString("en-IN")}; insurance can cover at most ₹${(claim.totalAmount - (claim.amountPaid || 0)).toLocaleString("en-IN")}.`,
      )

    const now = new Date().toISOString()
    const provider =
      input?.provider?.trim() ||
      (claim.insuranceProvider && claim.insuranceProvider !== "Self-Pay"
        ? claim.insuranceProvider
        : "Pending Insurance Assignment")
    const copay = Math.max(0, patientShare)
    return this.tpaStep(
      claim.id,
      mode === "handover"
        ? {
            tpaName: input?.tpaName ?? claim.tpa?.tpaName,
            billedAt: now,
            billedBy: input?.billedBy || "Billing Counter",
            claimAmount,
            preAuthStatus: input?.preAuthCode ? "Approved" : claim.tpa?.preAuthStatus || "Not Raised",
            shortfallTo: "writeoff",
          }
        : { claimAmount },
      {
        at: now,
        action: mode === "handover" ? "Billed to insurance at counter" : "Insurance split edited",
        detail: `Insurance ₹${claimAmount.toLocaleString("en-IN")} · patient co-pay ₹${copay.toLocaleString("en-IN")}${input?.note ? ` · ${input.note}` : ""}`,
        amount: claimAmount,
      },
      mode === "handover"
        ? {
            items,
            insuranceProvider: provider,
            policyNumber: input?.policyNumber?.trim() || claim.policyNumber || "Pending KYC",
            preAuthCode: input?.preAuthCode || claim.preAuthCode,
            status: "Ready",
          }
        : { items },
      { action: "INSURANCE_ATTACHED", amount: claimAmount },
    )
  }

  static updateInsuranceDetails(
    id: string,
    details: {
      insuranceProvider?: string
      tpaName?: string
      policyNumber?: string
      preAuthCode?: string
    },
  ): ClaimRecord {
    const claim = this.getClaimById(id)
    if (!claim) throw new Error("Claim not found")
    const now = new Date().toISOString()
    const provider = details.insuranceProvider || claim.insuranceProvider
    const policy = details.policyNumber || claim.policyNumber
    return this.tpaStep(
      id,
      {
        tpaName: details.tpaName !== undefined ? details.tpaName : claim.tpa?.tpaName,
      },
      {
        at: now,
        action: "Insurance details updated by Insurance Desk",
        detail: `${provider} · policy ${policy}`,
      },
      {
        insuranceProvider: provider,
        policyNumber: policy,
        preAuthCode: details.preAuthCode !== undefined ? details.preAuthCode : claim.preAuthCode,
      },
      { action: "INSURANCE_ATTACHED" },
    )
  }

  static requestPreAuth(id: string, amount: number, note?: string): ClaimRecord {
    return this.tpaStep(
      id,
      { preAuthStatus: "Requested", preAuthRequested: amount },
      {
        at: new Date().toISOString(),
        action: "Pre-authorisation requested",
        detail: note,
        amount,
      },
      {},
      { action: "PREAUTH_REQUESTED", amount },
    )
  }

  static approvePreAuth(
    id: string,
    sanctioned: number,
    code: string,
  ): ClaimRecord {
    return this.tpaStep(
      id,
      {
        preAuthStatus: "Approved",
        preAuthSanctioned: sanctioned,
        enhancementRequested: undefined,
      },
      {
        at: new Date().toISOString(),
        action: "Pre-authorisation approved",
        detail: code,
        amount: sanctioned,
      },
      { preAuthCode: code },
      { action: "PREAUTH_APPROVED", amount: sanctioned },
    )
  }

  /** Ask the TPA to raise the sanction because the stay has grown. */
  static requestEnhancement(
    id: string,
    amount: number,
    reason: string,
  ): ClaimRecord {
    return this.tpaStep(
      id,
      { preAuthStatus: "Enhancement Requested", enhancementRequested: amount },
      {
        at: new Date().toISOString(),
        action: "Enhancement requested",
        detail: reason,
        amount,
      },
      {},
      { action: "PREAUTH_ENHANCEMENT", amount },
    )
  }

  static recordTpaQuery(id: string, note: string): ClaimRecord {
    return this.tpaStep(
      id,
      { queryOpen: true, queryNote: note },
      { at: new Date().toISOString(), action: "TPA query raised", detail: note },
      {},
      { action: "TPA_QUERY" },
    )
  }

  static answerTpaQuery(id: string, reply: string): ClaimRecord {
    return this.tpaStep(
      id,
      { queryOpen: false },
      { at: new Date().toISOString(), action: "Query answered", detail: reply },
    )
  }

  /**
   * Final approval. Whatever the insurer does not approve is a deduction:
   * written off by the hospital by default, or -- if the insurance desk says
   * so -- recovered from the patient, which reopens their balance at billing.
   */
  static recordTpaApproval(
    id: string,
    approvedAmount: number,
    deductionReason?: string,
    shortfallTo: "writeoff" | "patient" = "writeoff",
  ): ClaimRecord {
    const claim = this.getClaimById(id)
    if (!claim) throw new Error("Claim not found")
    const covered = claim.items.reduce(
      (a, it) => a + Number(it.insuranceCovered || 0),
      0,
    )
    const deduction = Math.max(0, covered - approvedAmount)
    return this.tpaStep(
      id,
      { approvedAmount, deduction, deductionReason, shortfallTo, queryOpen: false },
      {
        at: new Date().toISOString(),
        action: "Claim approved by insurer",
        detail:
          deduction > 0
            ? `₹${deduction.toLocaleString("en-IN")} deducted (${
                shortfallTo === "patient" ? "recover from patient" : "hospital write-off"
              }) — ${deductionReason || "not payable"}`
            : "Approved in full",
        amount: approvedAmount,
      },
      { status: "Accepted", denialReason: undefined },
      { action: "TPA_APPROVED", amount: approvedAmount },
    )
  }

  static recordTpaDenial(id: string, reason: string): ClaimRecord {
    return this.tpaStep(
      id,
      { queryOpen: false },
      { at: new Date().toISOString(), action: "Claim denied", detail: reason },
      { status: "Denied", denialReason: reason },
      { action: "TPA_DENIED" },
    )
  }

  /** The insurer's money has arrived (UTR / NEFT reference). */
  static recordTpaSettlement(id: string, amount: number, ref: string): ClaimRecord {
    const claim = this.getClaimById(id)
    if (!claim) throw new Error("Claim not found")
    return this.tpaStep(
      id,
      {
        settledAmount: amount,
        settlementRef: ref,
        settledAt: new Date().toISOString(),
      },
      {
        at: new Date().toISOString(),
        action: "Insurer settlement received",
        detail: ref,
        amount,
      },
      { status: claim.balanceDue > 0 ? "Accepted" : "Paid" },
      { action: "TPA_SETTLED", amount },
    )
  }

  static recordPayment(
    invoiceId: string,

    payment: {
      amount: number

      paymentMethod: PaymentRecord["paymentMethod"]

      transactionRef?: string

      collectedBy: string

      notes?: string
    },
  ): { claim: ClaimRecord; payment: PaymentRecord } {
    const claims = this.getClaims();

    const target = (invoiceId || "").toLowerCase().trim();
    const norm = (v?: string) => (v || "").toLowerCase().trim()

    // Exact identity first. The old loose match (id.includes / endsWith) found
    // the *first* bill whose id merely contained the target -- paying SRV-1
    // could credit SRV-12. A partial match is accepted only when exactly one
    // bill fits, so a payment can never land on another patient's bill.
    let idx = claims.findIndex((c) => {
      const cId = norm(c.id)
      const cInv = norm(c.invoiceNo)
      const cEnc = norm(c.encounterId)
      return (
        cId === target ||
        cInv === target ||
        (!!cEnc && cEnc === target) ||
        (!!cEnc && `clm-${cEnc}` === target) ||
        `inv-${cInv}` === target
      )
    })
    if (idx < 0 && target.length > 3) {
      const loose = claims
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => {
          const cId = norm(c.id)
          const cInv = norm(c.invoiceNo)
          return cId.endsWith(target) || target.endsWith(cId) || cId.includes(target) || cInv.includes(target)
        })
      if (loose.length === 1) idx = loose[0].i
    }

    if (idx < 0) throw new Error("Invoice not found")

    const claim = claims[idx]

    if (claim.runningAdmissionId) {
      throw new Error(
        "This is a running bill -- the patient is still admitted. The final IP bill is raised when the bed is released at discharge; collect payment on that bill.",
      )
    }

    const newAmountPaid = (claim.amountPaid || 0) + payment.amount

    const newBalanceDue = Math.max(0, claim.patientPortion - newAmountPaid)

    const rcptNum =
      5500 +
      (claim.payments?.length || 0) +
      Math.floor(100 + Math.random() * 899)

    const newPayment: PaymentRecord = {
      id: `PAY-${Date.now()}`,

      invoiceId: claim.id,

      receiptNo: `RCPT-2026-${rcptNum}`,

      amount: payment.amount,

      paymentDate: new Date().toISOString(),

      paymentMethod: payment.paymentMethod,

      transactionRef:
        payment.transactionRef || `TXN-${Date.now().toString().slice(-6)}`,

      collectedBy: payment.collectedBy,

      notes: payment.notes,
    }

    const updatedPayments = [...(claim.payments || []), newPayment]

    let newStatus = claim.status

    if (newBalanceDue === 0) {
      // A bill handed to insurance is only "Paid" once the insurer has
      // settled too -- a patient paying their co-pay must not make the
      // Claims Desk read the claim as settled.
      const awaitingInsurer = !!claim.tpa?.billedAt && !claim.tpa?.settledAt
      if (
        claim.insuranceProvider === "Self-Pay" ||
        (claim.status === "Accepted" && !awaitingInsurer) ||
        claim.insurancePortion === 0
      ) {
        newStatus = "Paid"
      }
    }

    const updatedClaim: ClaimRecord = {
      ...claim,

      amountPaid: newAmountPaid,

      balanceDue: newBalanceDue,

      status: newStatus,

      payments: updatedPayments,

      updatedAt: new Date().toISOString(),
    }

    claims[idx] = updatedClaim

    if (claim.serverInvoiceId) {
      // A server bill: show the payment now, make it real on the server (so
      // every desk sees it), then re-sync. If the server refuses, the next
      // sync puts the bill back as it really is and the counter is told.
      applyServerPaymentLocally(updatedClaim)
      this.dispatchUpdate()
      void postServerPayment(claim.serverInvoiceId, payment).then((res) => {
        if (!res.ok && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(BILLING_PAYMENT_FAILED_EVENT, {
              detail: { invoiceNo: claim.invoiceNo, error: res.error },
            }),
          )
        }
        this.dispatchUpdate()
      })
    } else {
      this.save(STORAGE_KEY_CLAIMS, claims)
    }

    // Sync underlying OP encounter in db.ts
    if (updatedClaim.encounterId) {
      try {
        const enc = db.getEncounterById(updatedClaim.encounterId);
        if (enc) {
          db.updateEncounter(updatedClaim.encounterId, {
            billing: {
              ...enc.billing,
              status: newBalanceDue === 0 ? "Paid" : "Pending",
              mode: payment.paymentMethod,
            },
            status:
              enc.status === "Doctor Assigned" || enc.status === "Registered"
                ? "In Queue"
                : enc.status,
          });
        }
      } catch {}
    }

    // Sync underlying radiology study records with permanent billing clearance timestamps
    if (newBalanceDue === 0) {
      try {
        const radStudies = this.getRadiologyStudies()
        let radChanged = false
        radStudies.forEach((rs) => {
          const matchInv = rs.invoiceNo && (rs.invoiceNo.toLowerCase() === (claim.invoiceNo || "").toLowerCase() || rs.invoiceNo.toLowerCase() === (claim.id || "").toLowerCase())
          const matchEnc = rs.encounterId && rs.encounterId.toLowerCase() === (claim.encounterId || "").toLowerCase()
          const matchUmr = rs.umr && rs.umr.toLowerCase() === (claim.patientId || "").toLowerCase()
          if ((matchInv || matchEnc || (matchUmr && rs.paymentStatus !== "Paid")) && rs.paymentStatus !== "Paid") {
            rs.paymentStatus = "Paid"
            rs.paidReceiptNo = rs.paidReceiptNo || newPayment.receiptNo
            rs.paidAt = rs.paidAt || newPayment.paymentDate
            rs.billingClearedAt = rs.billingClearedAt || newPayment.paymentDate
            rs.eligibleAt = rs.eligibleAt || newPayment.paymentDate
            radChanged = true
          }
        })
        if (radChanged) {
          this.save(STORAGE_KEY_RAD_STUDIES, radStudies)
          this.invalidateRadiologyStudiesCache()
        }
      } catch {}
    }

    BillingRbacManager.logEvent({
      action: "PAYMENT_RECORDED",

      patientId: claim.patientId,

      patientName: claim.patientName,

      mrn: claim.mrn,

      invoiceNo: claim.invoiceNo,

      claimId: claim.id,

      financialAmount: newPayment.amount,

      department: claim.department,

      reason: `Payment receipt ${newPayment.receiptNo} of ₹${newPayment.amount.toLocaleString("en-IN")} collected via ${newPayment.paymentMethod} (Ref: ${newPayment.transactionRef}). Remaining due: ₹${newBalanceDue.toLocaleString("en-IN")}.`,
    })

    const numericInvId = parseInt((claim.invoiceNo || invoiceId).replace(/\D/g, "")) || 1
    apiFetch(`/api/billing/invoices/${numericInvId}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount: payment.amount,
        payment_mode: payment.paymentMethod ? payment.paymentMethod.toLowerCase() : "cash",
        gateway_ref: payment.transactionRef || newPayment.transactionRef,
      }),
    }).catch(() => {})

    // Automatically dispatch financial clearance to Radiology & Laboratory
    try {
      this.dispatchClearanceToDepartment(
        claim.patientName || claim.patientId,
        "Radiology",
        newPayment.receiptNo,
      )
      this.dispatchClearanceToDepartment(
        claim.patientName || claim.patientId,
        "Laboratory",
        newPayment.receiptNo,
      )
    } catch (err) {
      console.warn("Radiology/Lab clearance dispatch error:", err)
    }

    return { claim: updatedClaim, payment: newPayment }
  }

  // ── MANUAL DEPARTMENT FINANCIAL CLEARANCE DISPATCH ─────────────────────────

  static dispatchClearanceToDepartment(
    patientIdOrName: string,
    department: "Laboratory" | "Radiology",
    receiptNo?: string,
    optionalTestName?: string,
  ): { success: boolean; updatedCount: number; message: string } {
    const targetName = (patientIdOrName || "").toLowerCase().trim();
    const targetMrn = targetName.replace("umr", "").replace("p-", "").trim();
    const nowIso = new Date().toISOString();

    let updatedCount = 0;

    // Resolve matching claim to get canonical details
    const matchingClaim = this.getClaims().find((c) => {
      const cName = (c.patientName || "").toLowerCase().trim();
      const cMrn = (c.mrn || c.patientId || "").toLowerCase().replace("umr", "").replace("p-", "").trim();
      const cEnc = (c.encounterId || "").toLowerCase().trim();
      return (
        cName === targetName ||
        (targetName.length > 4 && (cName.includes(targetName) || targetName.includes(cName))) ||
        (targetMrn && cMrn === targetMrn) ||
        (targetName && cEnc === targetName)
      );
    });

    const resolvedMrn = matchingClaim?.mrn || matchingClaim?.patientId || targetMrn || "100999";
    const resolvedPatientName = matchingClaim?.patientName || patientIdOrName;
    const resolvedEncounterId = matchingClaim?.encounterId;
    const effectiveReceiptNo =
      receiptNo ||
      matchingClaim?.payments?.[matchingClaim.payments.length - 1]?.receiptNo ||
      `RCPT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    if (department === "Laboratory") {
      const labOrders = this.getLabOrders();
      let labChanged = false;

      const updatedLabOrders = labOrders.map((lo) => {
        const loName = (lo.patient || "").toLowerCase().trim();
        const loMrn = (lo.mrn || lo.umr || "").toLowerCase().replace("umr", "").replace("p-", "").trim();
        const loEnc = ((lo as any).encounterId || "").toLowerCase().trim();
        const loInv = (lo.invoiceNo || "").toLowerCase().trim();

        const matchName = targetName && (loName === targetName || (targetName.length > 4 && (loName.includes(targetName) || targetName.includes(loName))));
        const matchMrn = targetMrn && loMrn && (loMrn === targetMrn || loMrn.includes(targetMrn) || targetMrn.includes(loMrn));
        const matchEnc = resolvedEncounterId && loEnc && loEnc === resolvedEncounterId.toLowerCase();
        const matchInv = matchingClaim?.invoiceNo && loInv && loInv === matchingClaim.invoiceNo.toLowerCase();

        if (matchName || matchMrn || matchEnc || matchInv) {
          labChanged = true;
          updatedCount += 1;
          return {
            ...lo,
            paymentStatus: "Paid" as const,
            paidReceiptNo: effectiveReceiptNo,
            paidAt: nowIso,
          };
        }
        return lo;
      });

      // Also sync to LabOrderDatabase (hospai_lab_orders_v2)
      try {
        if (typeof window !== "undefined") {
          const rawOrders = window.localStorage.getItem("hospai_lab_orders_v2");
          if (rawOrders) {
            const parsed = JSON.parse(rawOrders);
            let hasOrderChanged = false;
            const updated = parsed.map((o: any) => {
              const oName = (o.patientName || "").toLowerCase().trim();
              const oUmr = (o.umr || "").toLowerCase().replace("umr", "").replace("p-", "").trim();
              const oEnc = (o.encounterId || "").toLowerCase().trim();
              const matchName = targetName && (oName === targetName || (targetName.length > 4 && (oName.includes(targetName) || targetName.includes(oName))));
              const matchMrn = targetMrn && oUmr && (oUmr === targetMrn || oUmr.includes(targetMrn) || targetMrn.includes(oUmr));
              const matchEnc = resolvedEncounterId && oEnc && oEnc === resolvedEncounterId.toLowerCase();

              if (matchName || matchMrn || matchEnc) {
                hasOrderChanged = true;
                updatedCount = Math.max(updatedCount, (o.tests || []).length || 1);
                return {
                  ...o,
                  status: o.status === "Awaiting Billing" ? "Billed" : o.status,
                  billing: {
                    ...(o.billing || {}),
                    status: "Paid",
                    paidAt: nowIso,
                    receiptNo: effectiveReceiptNo,
                  },
                };
              }
              return o;
            });
            if (hasOrderChanged) {
              window.localStorage.setItem("hospai_lab_orders_v2", JSON.stringify(updated));
              try {
                new BroadcastChannel("hospai_lab_orders").postMessage("changed");
              } catch {}
            }
          }
        }
      } catch (e) {
        console.warn("Could not sync to LabOrderDatabase:", e);
      }

      if (labChanged) {
        this.save(STORAGE_KEY_LAB_ORDERS, updatedLabOrders);
        this.emitUpdate();
        return {
          success: true,
          updatedCount: Math.max(1, updatedCount),
          message: `✓ Clearance dispatched to Laboratory for ${Math.max(1, updatedCount)} test(s). Receipt: ${effectiveReceiptNo}.`,
        };
      } else {
        // Find matching claim to see if there were lab items
        const labItems = matchingClaim
          ? matchingClaim.items.filter(
              (i) =>
                i.category === "Laboratory" ||
                (i.category as string) === "Lab" ||
                (i.category as string) === "Investigation" ||
                /(cbc|hemogram|blood|glucose|sugar|urine|creatinine|urea|electrolyte|kft|rft|lft|bilirubin|serology|culture|pathology|troponin|ecg|ekg|lipid|biochemistry|hematology|diagnostic:|investigation:|stool|wbc|platelet|d-dimer|dimer|abg|vbg|lactate|procalcitonin|thyroid|tsh|crp|esr|ferritin|hba1c|inr|coagulation|amylase|lipase|smear|widal|swab|profile|bmp|cmp)/i.test(
                  i.description,
                ),
            )
          : [];

        const testName =
          optionalTestName ||
          (labItems.length > 0
            ? labItems.map((i) => i.description).join(", ")
            : "Laboratory Diagnostic Panel");

        const totalLabPrice = labItems.reduce((s, i) => s + (i.total || i.unitPrice || 0), 0) || 150;

        const newLabOrder: LabOrderRecord = {
          id: `LAB-${Date.now().toString().slice(-4)}`,
          patient: resolvedPatientName,
          mrn: resolvedMrn,
          umr: matchingClaim?.patientId || resolvedMrn,
          invoiceNo: matchingClaim?.invoiceNo,
          encounterId: resolvedEncounterId,
          test: testName,
          category: "Clinical Laboratory",
          priority: matchingClaim?.department === "Emergency" ? "STAT" : "Routine",
          sampleType: "Blood / Plasma Specimen",
          accessionNo: `ACC-2026-${(matchingClaim?.invoiceNo || "").replace(/\D/g, "").slice(-4) || Math.floor(1000 + Math.random() * 9000)}`,
          collected: "—",
          status: "Pending",
          provider: matchingClaim?.attendingDoctor || "Attending Specialist",
          price: totalLabPrice,
          paymentStatus: "Paid",
          paidReceiptNo: effectiveReceiptNo,
          paidAt: nowIso,
          department: matchingClaim?.department || "Central Clinic",
        };

        const newLabOrders = [newLabOrder, ...labOrders];
        this.save(STORAGE_KEY_LAB_ORDERS, newLabOrders);

        // Also add to hospai_lab_orders_v2 so it shows in Lab Worklist
        try {
          if (typeof window !== "undefined") {
            const rawOrders = window.localStorage.getItem("hospai_lab_orders_v2");
            const parsed = rawOrders ? JSON.parse(rawOrders) : [];
            const newOrderObj = {
              id: `ORD-${Date.now().toString().slice(-5)}`,
              encounterId: resolvedEncounterId || `ENC-${Date.now().toString().slice(-4)}`,
              umr: resolvedMrn,
              patientName: resolvedPatientName,
              age: matchingClaim?.age || 35,
              sex: matchingClaim?.gender || "Male",
              phone: matchingClaim?.phone || "+91 98765 43210",
              opNumber: resolvedEncounterId || "OP-100",
              doctorId: "DOC-1",
              doctorName: matchingClaim?.attendingDoctor || "Attending Specialist",
              department: matchingClaim?.department || "Central Clinic",
              diagnosis: "Clinical Diagnostics Investigation",
              tests: [
                {
                  id: `LT-1`,
                  name: testName,
                  category: "Pathology",
                  urgency: "Routine",
                  price: totalLabPrice,
                  status: "Ordered",
                },
              ],
              status: "Billed",
              createdAt: nowIso,
              updatedAt: nowIso,
              billing: {
                status: "Paid",
                invoiceNo: matchingClaim?.invoiceNo || `INV-${Date.now().toString().slice(-4)}`,
                subtotal: totalLabPrice,
                discount: 0,
                total: totalLabPrice,
                paidAt: nowIso,
                receiptNo: effectiveReceiptNo,
              },
              history: [
                {
                  at: nowIso,
                  actor: "Central Billing Cashier",
                  action: "Payment Verified & Dispatched",
                  detail: `Financially cleared and released to Laboratory worklist.`,
                },
              ],
            };
            window.localStorage.setItem("hospai_lab_orders_v2", JSON.stringify([newOrderObj, ...parsed]));
            try {
              new BroadcastChannel("hospai_lab_orders").postMessage("changed");
            } catch {}
          }
        } catch (e) {
          console.warn("Could not insert to hospai_lab_orders_v2:", e);
        }

        this.emitUpdate();
        return {
          success: true,
          updatedCount: 1,
          message: `✓ Clearance dispatched to Laboratory for ${testName}. Receipt: ${effectiveReceiptNo}.`,
        };
      }
    } else if (department === "Radiology") {
      const radStudies = this.getRadiologyStudies();
      let radChanged = false;

      const radItems = matchingClaim
        ? matchingClaim.items.filter(
            (i) =>
              i.category === "Radiology / Imaging" ||
              (i.category as string) === "Radiology" ||
              (i.category as string) === "Imaging" ||
              /(x-ray|xray|radiograph|\bct\b|ct\s|ct-|ct scan|computed tomography|hrct|\bmri\b|mr\s|magnetic resonance|ultrasound|usg|sonograph|doppler|echo|echocardiography|mammograph|dexa|fluoroscop|pet scan)/i.test(
                i.description,
              ),
          )
        : [];

      // Only match by exact invoice number, or specific study name if this claim has radiology items
      const updatedRadStudies = radStudies.map((rs) => {
        const rsInv = (rs.invoiceNo || "").toLowerCase().trim();
        const matchInv = matchingClaim?.invoiceNo && rsInv && rsInv === matchingClaim.invoiceNo.toLowerCase();

        // Also check if study name matches any item in the cleared invoice for this patient
        const rsUmr = (rs.umr || rs.mrn || "").toLowerCase().trim();
        const targetUmrClean = targetMrn ? targetMrn.toLowerCase().trim() : "";
        const umrMatches = targetUmrClean && rsUmr && (rsUmr === targetUmrClean || rsUmr.includes(targetUmrClean));

        const itemMatches = umrMatches && radItems.some((item) =>
          rs.study && (
            rs.study.toLowerCase() === item.description.toLowerCase() ||
            rs.study.toLowerCase().includes(item.description.toLowerCase()) ||
            item.description.toLowerCase().includes(rs.study.toLowerCase())
          )
        );

        if (matchInv || itemMatches) {
          radChanged = true;
          updatedCount += 1;
          return {
            ...rs,
            invoiceNo: rs.invoiceNo || matchingClaim?.invoiceNo,
            paymentStatus: "Paid" as const,
            paidReceiptNo: effectiveReceiptNo,
            paidAt: nowIso,
          };
        }
        return rs;
      });

      if (radChanged) {
        this.save(STORAGE_KEY_RAD_STUDIES, updatedRadStudies);
        try {
          new BroadcastChannel("hospai_rad_channel").postMessage("changed");
        } catch {}
        this.emitUpdate();
        return {
          success: true,
          updatedCount,
          message: `✓ Clearance dispatched to Radiology for ${updatedCount} study(ies). Receipt: ${effectiveReceiptNo}.`,
        };
      } else if (radItems.length > 0 || optionalTestName) {
        // Only create a record if actual radiology items were in this claim
        const itemsToCreate = radItems.length > 0 ? radItems : [{ description: optionalTestName || "Radiology Examination", total: 500, unitPrice: 500 }];
        const newStudies: RadiologyStudyRecord[] = [];

        for (const item of itemsToCreate) {
          const studyName = item.description;
          const lowerName = studyName.toLowerCase();
          const modality = lowerName.includes("ct") || lowerName.includes("computed tomography")
            ? "CT"
            : lowerName.includes("mri") || lowerName.includes("magnetic")
              ? "MR"
              : lowerName.includes("ultra") || lowerName.includes("echo") || lowerName.includes("usg") || lowerName.includes("doppler")
                ? "US"
                : lowerName.includes("pet") || lowerName.includes("nuclear")
                  ? "NM"
                  : "XR";

          const newRadStudy: RadiologyStudyRecord = {
            id: `RAD-${Date.now().toString().slice(-4)}-${Math.floor(10 + Math.random() * 90)}`,
            patient: resolvedPatientName,
            mrn: resolvedMrn,
            umr: matchingClaim?.patientId || resolvedMrn,
            invoiceNo: matchingClaim?.invoiceNo,
            encounterId: resolvedEncounterId,
            study: studyName,
            modality: modality as any,
            priority: matchingClaim?.department === "Emergency" ? "STAT" : "Routine",
            ordered: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            provider: matchingClaim?.attendingDoctor || "Attending Specialist",
            status: "Orders",
            room: modality === "CT" ? "CT-1" : modality === "MR" ? "MR-1" : modality === "US" ? "US-1" : "XR-1",
            price: item.total || item.unitPrice || 500,
            paymentStatus: "Paid",
            paidReceiptNo: effectiveReceiptNo,
            paidAt: nowIso,
            accessionNo: `RAD-ACC-${(matchingClaim?.invoiceNo || "").replace(/\D/g, "").slice(-4) || Math.floor(1000 + Math.random() * 9000)}`,
            department: matchingClaim?.department || "Central Clinic",
          };
          newStudies.push(newRadStudy);
        }

        const newRadStudies = [...newStudies, ...radStudies];
        this.save(STORAGE_KEY_RAD_STUDIES, newRadStudies);
        try {
          new BroadcastChannel("hospai_rad_channel").postMessage("changed");
        } catch {}
        this.emitUpdate();
        return {
          success: true,
          updatedCount: newStudies.length,
          message: `✓ Clearance dispatched to Radiology for ${newStudies.map(s => s.study).join(", ")}. Receipt: ${effectiveReceiptNo}.`,
        };
      } else {
        return {
          success: true,
          updatedCount: 0,
          message: "No radiology examination items found in cleared claim.",
        };
      }
    }

    return {
      success: false,
      updatedCount: 0,
      message: `No pending ${department} orders found for this patient.`,
    }
  }


  static getDepartmentClearanceStatus(
    patientIdOrName: string,

    claimContext?: ClaimRecord | null,
  ): {
    hasLabOrders: boolean

    labPaidCount: number

    labPendingCount: number

    labTestNames: string[]

    hasRadStudies: boolean

    radPaidCount: number

    radPendingCount: number

    radStudyNames: string[]

    isNonDiagnostic: boolean
  } {
    // For Outpatient visits prior to doctor consultation (no prescribed investigations in encounter),
    // diagnostic clearance is NOT applicable because no lab/radiology tests have been prescribed yet.
    if (claimContext && claimContext.department === "Outpatient") {
      let encInvestigations: string[] = [];
      if (claimContext.encounterId) {
        try {
          const enc = db.getEncounterById(claimContext.encounterId);
          if (enc && enc.investigations) {
            encInvestigations = enc.investigations;
          }
        } catch {}
      }
      const hasExplicitLabItemInClaim = (claimContext.items || []).some(
        (i) => i.category === "Laboratory" && i.unitPrice > 0,
      );
      const hasExplicitRadItemInClaim = (claimContext.items || []).some(
        (i) =>
          ((i.category as any) === "Radiology / Imaging" ||
            (i.category as any) === "Radiology") &&
          i.unitPrice > 0,
      );

      if (
        encInvestigations.length === 0 &&
        !hasExplicitLabItemInClaim &&
        !hasExplicitRadItemInClaim
      ) {
        return {
          hasLabOrders: false,
          labPaidCount: 0,
          labPendingCount: 0,
          labTestNames: [],
          hasRadStudies: false,
          radPaidCount: 0,
          radPendingCount: 0,
          radStudyNames: [],
          isNonDiagnostic: true,
        };
      }
    }

    const targetName = (claimContext?.patientName || patientIdOrName || "").toLowerCase().trim();
    const targetMrn = (claimContext?.mrn || claimContext?.patientId || targetName).toLowerCase().replace("umr", "").replace("p-", "").trim();
    const targetEncounter = (claimContext?.encounterId || "").toLowerCase().trim();
    const targetInvoice = (claimContext?.invoiceNo || "").toLowerCase().trim();

    const LAB_REGEX =
      /(cbc|hemogram|blood|glucose|sugar|urine|creatinine|urea|electrolyte|kft|rft|lft|bilirubin|serology|culture|pathology|troponin|ecg|ekg|lipid|biochemistry|hematology|diagnostic:|investigation:|stool|wbc|platelet|d-dimer|dimer|abg|vbg|lactate|procalcitonin|thyroid|tsh|crp|esr|ferritin|hba1c|inr|coagulation|amylase|lipase|smear|widal|swab|profile|bmp|cmp)/i;

    const RAD_REGEX =
      /(x-ray|xray|radiograph|\bct\b|ct\s|ct-|ct scan|computed tomography|hrct|\bmri\b|mr\s|magnetic resonance|ultrasound|usg|sonograph|doppler|echo|echocardiography|mammograph|dexa|fluoroscop|pet scan)/i;

    const labOrders = this.getLabOrders().filter((lo) => {
      const loName = (lo.patient || "").toLowerCase().trim();
      const loMrn = (lo.mrn || lo.umr || "").toLowerCase().replace("umr", "").replace("p-", "").trim();
      const loInv = (lo.invoiceNo || "").toLowerCase().trim();
      const loEnc = ((lo as any).encounterId || "").toLowerCase().trim();

      const matchName = targetName && (loName === targetName || (targetName.length > 5 && loName === targetName));
      const matchMrn = targetMrn && loMrn && loMrn === targetMrn;
      const matchInv = targetInvoice && loInv && loInv === targetInvoice;
      const matchEnc = targetEncounter && loEnc && loEnc === targetEncounter;

      return Boolean(matchMrn || matchEnc || (matchInv && matchName));
    });

    const radStudies = this.getRadiologyStudies().filter((rs) => {
      const rsName = (rs.patient || "").toLowerCase().trim();
      const rsMrn = (rs.mrn || rs.umr || "").toLowerCase().replace("umr", "").replace("p-", "").trim();
      const rsInv = (rs.invoiceNo || "").toLowerCase().trim();
      const rsEnc = ((rs as any).encounterId || "").toLowerCase().trim();

      const matchName = targetName && (rsName === targetName || (targetName.length > 4 && (rsName.includes(targetName) || targetName.includes(rsName))));
      const matchMrn = targetMrn && rsMrn && (rsMrn === targetMrn || rsMrn.includes(targetMrn) || targetMrn.includes(rsMrn));
      const matchInv = targetInvoice && rsInv && rsInv === targetInvoice;
      const matchEnc = targetEncounter && rsEnc && rsEnc === targetEncounter;

      return Boolean(matchName || matchMrn || matchInv || matchEnc);
    });

    // Also check LabOrderDatabase (hospai_lab_orders_v2)
    const extraLabTestNames: string[] = [];
    try {
      if (typeof window !== "undefined") {
        const rawOrders = window.localStorage.getItem("hospai_lab_orders_v2");
        if (rawOrders) {
          const parsed = JSON.parse(rawOrders);
          parsed.forEach((o: any) => {
            const oName = (o.patientName || "").toLowerCase().trim();
            const oUmr = (o.umr || "").toLowerCase().replace("umr", "").replace("p-", "").trim();
            const oEnc = (o.encounterId || "").toLowerCase().trim();
            const matchName = targetName && (oName === targetName || (targetName.length > 4 && (oName.includes(targetName) || targetName.includes(oName))));
            const matchMrn = targetMrn && oUmr && (oUmr === targetMrn || oUmr.includes(targetMrn) || targetMrn.includes(oUmr));
            const matchEnc = targetEncounter && oEnc && oEnc === targetEncounter;
            if (matchName || matchMrn || matchEnc) {
              (o.tests || []).forEach((t: any) => {
                if (t.name && !extraLabTestNames.includes(t.name)) {
                  extraLabTestNames.push(t.name);
                }
              });
            }
          });
        }
      }
    } catch {}

    // Check if claim items contain lab/radiology
    let claimLabItems: InvoiceItem[] = [];
    let claimRadItems: InvoiceItem[] = [];

    if (claimContext && claimContext.items) {
      claimContext.items.forEach((i) => {
        const desc = i.description || "";
        const cat = (i.category || "") as string;
        if (
          cat === "Radiology / Imaging" ||
          cat === "Radiology" ||
          cat === "Imaging" ||
          claimContext.department === "Radiology" ||
          RAD_REGEX.test(desc)
        ) {
          claimRadItems.push(i);
        } else if (
          cat === "Laboratory" ||
          cat === "Lab" ||
          cat === "Pathology" ||
          cat === "Biochemistry" ||
          cat === "Hematology" ||
          cat === "Microbiology" ||
          claimContext.department === "Laboratory" ||
          LAB_REGEX.test(desc) ||
          cat === "Investigation"
        ) {
          claimLabItems.push(i);
        }
      });
    }

    // Also check department charges for this patient
    try {
      const deptCharges = this.getDepartmentCharges().filter((d) => {
        const dName = (d.patientName || "").toLowerCase().trim();
        const dMrn = (d.mrn || d.patientId || "").toLowerCase().replace("umr", "").replace("p-", "").trim();
        const dEnc = (d.encounterId || "").toLowerCase().trim();
        return (
          (targetEncounter && dEnc === targetEncounter) ||
          (targetMrn && dMrn === targetMrn) ||
          (targetName && dName === targetName)
        );
      });

      deptCharges.forEach((dept) => {
        (dept.items || []).forEach((it) => {
          const desc = it.description || "";
          const cat = (it.category || "") as string;
          if (
            cat === "Radiology / Imaging" ||
            cat === "Radiology" ||
            cat === "Imaging" ||
            RAD_REGEX.test(desc)
          ) {
            if (!claimRadItems.some((x) => x.description === desc)) {
              claimRadItems.push(it);
            }
          } else if (
            cat === "Laboratory" ||
            cat === "Lab" ||
            cat === "Pathology" ||
            cat === "Biochemistry" ||
            cat === "Hematology" ||
            cat === "Microbiology" ||
            LAB_REGEX.test(desc) ||
            cat === "Investigation"
          ) {
            if (!claimLabItems.some((x) => x.description === desc)) {
              claimLabItems.push(it);
            }
          }
        });
      });
    } catch {}

    // Check ErVisit investigations if applicable (read-only)
    try {
      const allVisits = ErDatabase.getVisits("all");
      const vMatch = allVisits.find((v) => {
        const vNo = (v.visit_no || "").toLowerCase().trim();
        const vId = String(v.id).trim();
        const vName = [v.patient_name, v.patient_last_name].filter(Boolean).join(" ").toLowerCase().trim();
        return (
          (targetEncounter && (vNo === targetEncounter || vId === targetEncounter || `er-${vId}` === targetEncounter)) ||
          (targetName && vName === targetName)
        );
      });

      if (vMatch && vMatch.investigations && vMatch.investigations.length > 0) {
        vMatch.investigations.forEach((inv) => {
          const tName = inv.test_name || "";
          if (!tName) return;
          if (RAD_REGEX.test(tName) || (inv as any).modality) {
            if (!claimRadItems.some((x) => x.description === tName)) {
              claimRadItems.push({
                id: `INV-RAD-${Date.now()}`,
                description: tName,
                category: "Radiology / Imaging",
                cptCode: "71045",
                quantity: 1,
                unitPrice: 500,
                total: 500,
                insuranceCovered: 0,
                patientPayable: 500,
              });
            }
          } else {
            if (!claimLabItems.some((x) => x.description === tName)) {
              claimLabItems.push({
                id: `INV-LAB-${Date.now()}`,
                description: tName,
                category: "Laboratory",
                cptCode: "80050",
                quantity: 1,
                unitPrice: 400,
                total: 400,
                insuranceCovered: 0,
                patientPayable: 400,
              });
            }
          }
        });
      }
    } catch {}

    const hasLab =
      labOrders.length > 0 ||
      claimLabItems.length > 0 ||
      extraLabTestNames.length > 0;

    const hasRad = radStudies.length > 0 || claimRadItems.length > 0

    const labTestNames = [
      ...labOrders.map((o) => o.test),
      ...extraLabTestNames,
    ];

    if (claimLabItems.length > 0) {
      claimLabItems.forEach((i) => {
        if (!labTestNames.includes(i.description)) {
          labTestNames.push(i.description);
        }
      });
    }

    const radStudyNames = radStudies.map((s) => s.study)

    if (claimRadItems.length > 0) {
      claimRadItems.forEach((i) => {
        if (!radStudyNames.includes(i.description)) {
          radStudyNames.push(i.description);
        }
      });
    }

    const labPaid = labOrders.filter((lo) => lo.paymentStatus === "Paid").length

    const labPending = labOrders.filter(
      (lo) => lo.paymentStatus === "Payment Pending",
    ).length

    const radPaid = radStudies.filter(
      (rs) => rs.paymentStatus === "Paid",
    ).length

    const radPending = radStudies.filter(
      (rs) => rs.paymentStatus === "Payment Pending",
    ).length

    return {
      hasLabOrders: hasLab,
      labPaidCount: labPaid,
      labPendingCount:
        labPending > 0
          ? labPending
          : claimLabItems.length > 0 && labPaid === 0
            ? claimLabItems.length
            : 0,
      labTestNames,
      hasRadStudies: hasRad,
      radPaidCount: radPaid,
      radPendingCount:
        radPending > 0
          ? radPending
          : claimRadItems.length > 0 && radPaid === 0
            ? claimRadItems.length
            : 0,
      radStudyNames,
      isNonDiagnostic: !hasLab && !hasRad,
    }
  }

  // ── DIAGNOSTIC PRE-PAYMENT CLEARANCE ACCESS METHODS ────────────────────────

  static getLabOrders(): LabOrderRecord[] {
    const orders = this.load<LabOrderRecord[]>(
      STORAGE_KEY_LAB_ORDERS,
      INITIAL_LAB_ORDERS,
    )

    const claims = this.getClaims()

    const syncedOrders = [...orders]

    claims.forEach((claim) => {
      const labItems = claim.items.filter(
        (it) =>
          it.category === "Laboratory" ||
          it.description.toLowerCase().includes("blood") ||
          it.description.toLowerCase().includes("cbc") ||
          it.description.toLowerCase().includes("lft") ||
          it.description.toLowerCase().includes("bmp") ||
          it.description.toLowerCase().includes("profile") ||
          it.description.toLowerCase().includes("troponin") ||
          it.description.toLowerCase().includes("urine") ||
          it.description.toLowerCase().includes("glucose") ||
          it.description.toLowerCase().includes("lactate") ||
          it.description.toLowerCase().includes("culture") ||
          it.description.toLowerCase().includes("hba1c") ||
          it.description.toLowerCase().includes("coagulation"),
      )

      if (labItems.length > 0) {
        const isPaid = claim.status === "Paid" || claim.balanceDue === 0

        const receiptNo =
          claim.payments?.[0]?.receiptNo ||
          (isPaid
            ? `RCPT-2026-${(claim.invoiceNo || "").replace(/\D/g, "").slice(-4) || "5501"}`
            : undefined)

        const targetName = (claim.patientName || "").toLowerCase().trim()

        const targetMrn = (claim.mrn || claim.patientId || "")
          .toLowerCase()
          .trim()

        const existingIdx = syncedOrders.findIndex((o) => {
          const oName = (o.patient || "").toLowerCase().trim()

          const oMrn = (o.mrn || "").toLowerCase().trim()

          const oInv = o.invoiceNo?.toLowerCase().trim()

          return (
            (oInv && oInv === claim.invoiceNo.toLowerCase().trim()) ||
            (oName === targetName &&
              o.test
                .toLowerCase()
                .includes(labItems[0].description.toLowerCase())) ||
            (targetMrn &&
              oMrn === targetMrn &&
              o.test
                .toLowerCase()
                .includes(labItems[0].description.toLowerCase()))
          )
        })

        if (existingIdx >= 0) {
          const current = syncedOrders[existingIdx]

          syncedOrders[existingIdx] = {
            ...current,

            paymentStatus: isPaid ? "Paid" : current.paymentStatus,

            paidReceiptNo: isPaid
              ? current.paidReceiptNo || receiptNo
              : current.paidReceiptNo,

            paidAt: isPaid
              ? current.paidAt || claim.payments?.[0]?.paymentDate || current.orderedAt || current.createdAt
              : current.paidAt,

            billingClearedAt: isPaid
              ? current.billingClearedAt || current.paidAt || claim.payments?.[0]?.paymentDate || current.orderedAt || current.createdAt
              : current.billingClearedAt,

            eligibleAt: isPaid
              ? current.eligibleAt || current.billingClearedAt || current.paidAt || claim.payments?.[0]?.paymentDate || current.orderedAt || current.createdAt
              : current.eligibleAt,

            invoiceNo: claim.invoiceNo,

            umr: claim.patientId,

            department: claim.department,

            diagnosis: claim.diagnosisCodes?.join(", "),

            orderedItems: labItems.map((it) => ({
              description: it.description,

              cptCode: it.cptCode,

              price: it.unitPrice || it.total,

              quantity: it.quantity || 1,
            })),
          }
        } else {
          const testSummary = labItems.map((it) => it.description).join(" + ")

          const totalLabPrice = labItems.reduce(
            (sum, it) =>
              sum + (it.total || (it.unitPrice || 0) * (it.quantity || 1)),

            0,
          )

          syncedOrders.push({
            id: `LAB-INV-${(claim.invoiceNo || "").replace(/\D/g, "").slice(-4) || Math.floor(100 + Math.random() * 900)}`,

            patient: claim.patientName,

            mrn: claim.mrn || claim.patientId.replace(/\D/g, "") || "10001",

            umr: claim.patientId,

            invoiceNo: claim.invoiceNo,

            test: testSummary,

            category: "Clinical Laboratory",

            priority: claim.department === "Emergency" ? "STAT" : "Routine",

            sampleType: "Blood / Plasma Specimen",

            accessionNo: `ACC-2026-${(claim.invoiceNo || "").replace(/\D/g, "").slice(-4) || Math.floor(1000 + Math.random() * 9000)}`,

            collected: "—",

            status: "Pending",

            provider: claim.attendingDoctor || "Attending Physician",

            price: totalLabPrice || 150,

            paymentStatus: isPaid ? "Paid" : "Payment Pending",

            paidReceiptNo: receiptNo,

            paidAt: isPaid ? claim.payments?.[0]?.paymentDate || new Date().toISOString() : undefined,

            billingClearedAt: isPaid ? claim.payments?.[0]?.paymentDate || new Date().toISOString() : undefined,

            eligibleAt: isPaid ? claim.payments?.[0]?.paymentDate || new Date().toISOString() : undefined,

            department: claim.department,

            diagnosis: claim.diagnosisCodes?.join(", "),

            orderedItems: labItems.map((it) => ({
              description: it.description,

              cptCode: it.cptCode,

              price: it.unitPrice || it.total,

              quantity: it.quantity || 1,
            })),
          })
        }
      }
    })

    const deptCharges = this.getDepartmentCharges()

    deptCharges.forEach((dept) => {
      const labItems = (dept.items || []).filter(
        (it) =>
          it.category === "Laboratory" ||
          it.description.toLowerCase().includes("blood") ||
          it.description.toLowerCase().includes("cbc") ||
          it.description.toLowerCase().includes("lft") ||
          it.description.toLowerCase().includes("bmp") ||
          it.description.toLowerCase().includes("profile") ||
          it.description.toLowerCase().includes("troponin") ||
          it.description.toLowerCase().includes("urine") ||
          it.description.toLowerCase().includes("glucose") ||
          it.description.toLowerCase().includes("lactate") ||
          it.description.toLowerCase().includes("culture") ||
          it.description.toLowerCase().includes("hba1c") ||
          it.description.toLowerCase().includes("coagulation"),
      )

      if (labItems.length > 0) {
        const targetName = (dept.patientName || "").toLowerCase().trim()

        const targetMrn = (dept.mrn || dept.patientId || "")
          .toLowerCase()
          .trim()

        const existingIdx = syncedOrders.findIndex((o) => {
          const oName = (o.patient || "").toLowerCase().trim()

          const oMrn = (o.mrn || "").toLowerCase().trim()

          return (
            (dept.invoiceId &&
              o.invoiceNo?.toLowerCase().trim() ===
                dept.invoiceId.toLowerCase().trim()) ||
            (oName === targetName &&
              o.test
                .toLowerCase()
                .includes(labItems[0].description.toLowerCase())) ||
            (targetMrn &&
              oMrn === targetMrn &&
              o.test
                .toLowerCase()
                .includes(labItems[0].description.toLowerCase()))
          )
        })

        if (existingIdx < 0) {
          const testSummary = labItems.map((it) => it.description).join(" + ")

          const totalLabPrice = labItems.reduce(
            (sum, it) =>
              sum + (it.total || (it.unitPrice || 0) * (it.quantity || 1)),

            0,
          )

          syncedOrders.push({
            id: `LAB-DCHG-${(dept.id || "").replace(/\D/g, "").slice(-4) || Math.floor(100 + Math.random() * 900)}`,

            patient: dept.patientName,

            mrn: dept.mrn || dept.patientId.replace(/\D/g, "") || "10001",

            umr: dept.patientId,

            invoiceNo: dept.invoiceId || dept.id,

            test: testSummary,

            category: "Clinical Laboratory",

            priority: dept.department === "Emergency" ? "STAT" : "Routine",

            sampleType: "Blood / Plasma Specimen",

            accessionNo: `ACC-2026-${(dept.id || "").replace(/\D/g, "").slice(-4) || Math.floor(1000 + Math.random() * 9000)}`,

            collected: "—",

            status: "Pending",

            provider: dept.attendingDoctor || "Attending Physician",

            price: totalLabPrice || 150,

            paymentStatus: "Payment Pending",

            department: dept.department,

            diagnosis: dept.diagnosisCodes?.join(", ") || dept.notes,

            orderedItems: labItems.map((it) => ({
              description: it.description,

              cptCode: it.cptCode,

              price: it.unitPrice || it.total,

              quantity: it.quantity || 1,
            })),
          })
        }
      }
    })

    return syncedOrders
  }

  static createLabOrder(
    orderData: Omit<LabOrderRecord, "id"> & { id?: string },
  ): LabOrderRecord {
    const orders = this.getLabOrders()

    const id = orderData.id || `LAB-${Math.floor(100 + Math.random() * 900)}`

    const newOrder: LabOrderRecord = {
      ...orderData,

      id,

      accessionNo:
        orderData.accessionNo ||
        `ACC-2026-${Math.floor(1000 + Math.random() * 9000)}`,

      collected: orderData.collected || "—",

      status: orderData.status || "Pending",
    }

    const updated = [newOrder, ...orders.filter((o) => o.id !== id)]

    this.save(STORAGE_KEY_LAB_ORDERS, updated)

    this.emitUpdate()

    return newOrder
  }

  static updateLabOrder(
    id: string,
    updates: Partial<LabOrderRecord>,
  ): LabOrderRecord {
    const orders = this.getLabOrders()

    const idx = orders.findIndex((o) => o.id === id)

    if (idx < 0) throw new Error("Lab order not found")

    const updated = { ...orders[idx], ...updates }

    orders[idx] = updated

    this.save(STORAGE_KEY_LAB_ORDERS, orders)

    this.emitUpdate()

    return updated
  }

  static deleteLabOrder(id: string): void {
    const orders = this.getLabOrders().filter((o) => o.id !== id)

    this.save(STORAGE_KEY_LAB_ORDERS, orders)

    this.emitUpdate()
  }

  static getRadiologyStudies(): RadiologyStudyRecord[] {
    const now = Date.now()
    if (this._cachedRadStudies && (now - this._radStudiesCacheTime < this.RAD_STUDIES_TTL)) {
      return this._cachedRadStudies
    }
    const isGenuineRadInvoiceItem = (it: InvoiceItem): boolean => {
      const cat = (it.category || "").toLowerCase().trim()
      const desc = (it.description || "").toLowerCase().trim()
      if (
        cat === "consultation" ||
        cat === "registration" ||
        desc.includes("consultation") ||
        desc.includes("registration fee") ||
        desc.includes("patient registration") ||
        desc.includes("physician") ||
        desc.includes("doctor consultation")
      ) {
        return false
      }
      return it.category === "Radiology / Imaging" || isRadiologyTest(it.description, it.category)
    }

    const loadedStudies = this.load<RadiologyStudyRecord[]>(
      STORAGE_KEY_RAD_STUDIES,
      INITIAL_RAD_STUDIES,
    )

    // Sanitize and purge any invalid non-radiology studies (e.g. consultation fee records) from store
    const studies = loadedStudies.filter((s) => {
      const name = (s.study || "").toLowerCase().trim()
      return (
        !name.includes("consultation") &&
        !name.includes("registration fee") &&
        !name.includes("patient registration") &&
        isRadiologyTest(s.study, (s as any).modality)
      )
    })
    if (studies.length !== loadedStudies.length) {
      this.save(STORAGE_KEY_RAD_STUDIES, studies)
    }

    INITIAL_RAD_STUDIES.forEach((initS) => {
      if (!studies.some((s) => s.id === initS.id)) {
        studies.push(initS)
      }
    })

    const claims = this.getClaims()

    const syncedStudies = [...studies]

    claims.forEach((claim) => {
      const radItems = claim.items.filter(isGenuineRadInvoiceItem)

      if (radItems.length > 0) {
        const isPaid = claim.status === "Paid" || claim.balanceDue === 0

        const receiptNo =
          claim.payments?.[0]?.receiptNo ||
          (isPaid
            ? `RCPT-2026-${(claim.invoiceNo || "").replace(/\D/g, "").slice(-4) || "5501"}`
            : undefined)

        const targetName = (claim.patientName || "").toLowerCase().trim()

        const targetMrn = (claim.mrn || claim.patientId || "")
          .toLowerCase()
          .trim()

        const existingIdx = syncedStudies.findIndex((s) => {
          const sName = (s.patient || "").toLowerCase().trim()

          const sMrn = (s.mrn || "").toLowerCase().trim()

          const sInv = s.invoiceNo?.toLowerCase().trim()

          return (
            (sInv && sInv === claim.invoiceNo.toLowerCase().trim()) ||
            (sName === targetName &&
              s.study
                .toLowerCase()
                .includes(radItems[0].description.toLowerCase())) ||
            (targetMrn &&
              sMrn === targetMrn &&
              s.study
                .toLowerCase()
                .includes(radItems[0].description.toLowerCase()))
          )
        })

        if (existingIdx >= 0) {
          const current = syncedStudies[existingIdx]

          syncedStudies[existingIdx] = {
            ...current,

            paymentStatus: isPaid ? "Paid" : ((claim.status as string) === "Awaiting Billing" || claim.balanceDue > 0 ? "Payment Pending" : current.paymentStatus),

            paidReceiptNo: isPaid
              ? current.paidReceiptNo || receiptNo
              : current.paidReceiptNo,

            paidAt: isPaid
              ? current.paidAt || claim.payments?.[0]?.paymentDate || current.orderedAt || current.createdAt
              : current.paidAt,

            billingClearedAt: isPaid
              ? current.billingClearedAt || current.paidAt || claim.payments?.[0]?.paymentDate || current.orderedAt || current.createdAt
              : current.billingClearedAt,

            eligibleAt: isPaid
              ? current.eligibleAt || current.billingClearedAt || current.paidAt || claim.payments?.[0]?.paymentDate || current.orderedAt || current.createdAt
              : current.eligibleAt,

            invoiceNo: claim.invoiceNo,

            umr: claim.patientId,

            department: claim.department,

            indication:
              current.indication ||
              claim.carePathway ||
              claim.diagnosisCodes?.join(", "),

            orderedItems: radItems.map((it) => ({
              description: it.description,

              cptCode: it.cptCode,

              price: it.unitPrice || it.total,

              quantity: it.quantity || 1,
            })),
          }
        } else {
          // Never fabricate radiology studies from auto-synced OP encounter registration claims
          if (claim.id?.startsWith("CLM-ENC-") || !isRadiologyTest(radItems[0].description, radItems[0].category)) {
            return
          }

          const studySummary = radItems.map((it) => it.description).join(" + ")

          const totalRadPrice = radItems.reduce(
            (sum, it) =>
              sum + (it.total || (it.unitPrice || 0) * (it.quantity || 1)),

            0,
          )

          const modality = studySummary.toLowerCase().includes("ct")
            ? "CT"
            : studySummary.toLowerCase().includes("mri") ||
                studySummary.toLowerCase().includes("mr ")
              ? "MR"
              : studySummary.toLowerCase().includes("ultra") ||
                  studySummary.toLowerCase().includes("echo")
                ? "US"
                : "XR"

          const room =
            modality === "CT"
              ? "CT-1"
              : modality === "MR"
                ? "MR-1"
                : modality === "US"
                  ? "US-1"
                  : "XR-1"

          syncedStudies.push({
            id: `RAD-INV-${(claim.invoiceNo || "").replace(/\D/g, "").slice(-4) || (claim.id || claim.patientId || "101").replace(/\D/g, "").slice(-4) || "1036"}`,

            patient: claim.patientName,

            mrn: claim.mrn || claim.patientId.replace(/\D/g, "") || "10001",

            umr: claim.patientId,

            invoiceNo: claim.invoiceNo,

            study: studySummary,

            modality: modality as any,

            priority: claim.department === "Emergency" ? "STAT" : "Routine",

            ordered: `${claim.dateOfService || "2026-09-12"} · ${new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`,

            provider: claim.attendingDoctor || "Referring Specialist",

            status: "Orders",

            room,

            price: totalRadPrice || 250,

            paymentStatus: isPaid ? "Paid" : "Payment Pending",

            paidReceiptNo: receiptNo,

            paidAt: isPaid ? claim.payments?.[0]?.paymentDate || new Date().toISOString() : undefined,

            billingClearedAt: isPaid ? claim.payments?.[0]?.paymentDate || new Date().toISOString() : undefined,

            eligibleAt: isPaid ? claim.payments?.[0]?.paymentDate || new Date().toISOString() : undefined,

            accessionNo: `RAD-ACC-${(claim.invoiceNo || "").replace(/\D/g, "").slice(-4) || (claim.id || claim.patientId || "101").replace(/\D/g, "").slice(-4) || "1036"}`,

            department: claim.department,

            indication:
              claim.carePathway ||
              `Clinical Evaluation (${claim.diagnosisCodes?.join(", ") || "General Diagnostics"})`,

            orderedItems: radItems.map((it) => ({
              description: it.description,

              cptCode: it.cptCode,

              price: it.unitPrice || it.total,

              quantity: it.quantity || 1,
            })),
          })
        }
      }
    })

    const deptChargesRad = this.getDepartmentCharges()

    deptChargesRad.forEach((dept) => {
      const radItems = (dept.items || []).filter(isGenuineRadInvoiceItem)

      if (radItems.length > 0) {
        const targetName = (dept.patientName || "").toLowerCase().trim()

        const targetMrn = (dept.mrn || dept.patientId || "")
          .toLowerCase()
          .trim()

        const existingIdx = syncedStudies.findIndex((s) => {
          const sName = (s.patient || "").toLowerCase().trim()

          const sMrn = (s.mrn || "").toLowerCase().trim()

          return (
            (dept.invoiceId &&
              s.invoiceNo?.toLowerCase().trim() ===
                dept.invoiceId.toLowerCase().trim()) ||
            (sName === targetName &&
              s.study
                .toLowerCase()
                .includes(radItems[0].description.toLowerCase())) ||
            (targetMrn &&
              sMrn === targetMrn &&
              s.study
                .toLowerCase()
                .includes(radItems[0].description.toLowerCase()))
          )
        })

        if (existingIdx < 0) {
          // Never fabricate radiology studies from OP consultation charges
          if (dept.id?.startsWith("OP-IT-") || !isRadiologyTest(radItems[0].description, radItems[0].category)) {
            return
          }

          const studySummary = radItems.map((it) => it.description).join(" + ")

          const totalRadPrice = radItems.reduce(
            (sum, it) =>
              sum + (it.total || (it.unitPrice || 0) * (it.quantity || 1)),

            0,
          )

          const modality = studySummary.toLowerCase().includes("ct")
            ? "CT"
            : studySummary.toLowerCase().includes("mri") ||
                studySummary.toLowerCase().includes("mr ")
              ? "MR"
              : studySummary.toLowerCase().includes("ultra") ||
                  studySummary.toLowerCase().includes("echo")
                ? "US"
                : "XR"

          const room =
            modality === "CT"
              ? "CT-1"
              : modality === "MR"
                ? "MR-1"
                : modality === "US"
                  ? "US-1"
                  : "XR-1"

          syncedStudies.push({
            id: `RAD-DCHG-${(dept.id || "").replace(/\D/g, "").slice(-4) || (dept.patientId || "101").replace(/\D/g, "").slice(-4) || "1036"}`,

            patient: dept.patientName,

            mrn: dept.mrn || dept.patientId.replace(/\D/g, "") || "10001",

            umr: dept.patientId,

            invoiceNo: dept.invoiceId || dept.id,

            study: studySummary,

            modality: modality as any,

            priority: dept.department === "Emergency" ? "STAT" : "Routine",

            ordered: `${(dept as any).date || (dept as any).createdAt?.split("T")[0] || "2026-09-12"} · ${new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`,

            provider: dept.attendingDoctor || "Referring Specialist",

            status: "Orders",

            room,

            price: totalRadPrice || 250,

            paymentStatus: "Payment Pending",

            accessionNo: `RAD-ACC-${(dept.id || "").replace(/\D/g, "").slice(-4) || (dept.patientId || "101").replace(/\D/g, "").slice(-4) || "1036"}`,

            department: dept.department,

            indication:
              dept.carePathway ||
              dept.notes ||
              `Clinical Evaluation (${dept.diagnosisCodes?.join(", ") || "General Diagnostics"})`,

            orderedItems: radItems.map((it) => ({
              description: it.description,

              cptCode: it.cptCode,

              price: it.unitPrice || it.total,

              quantity: it.quantity || 1,
            })),
          })
        }
      }
    })

    const seenStudyKeys = new Set<string>()
    const deduplicatedStudies: RadiologyStudyRecord[] = []
    for (const s of syncedStudies) {
      // Strictly exclude invalid non-radiology studies (e.g. consultation fee records)
      const sName = (s.study || "").toLowerCase().trim()
      if (
        sName.includes("consultation") ||
        sName.includes("registration fee") ||
        sName.includes("patient registration") ||
        !isRadiologyTest(s.study, (s as any).modality)
      ) {
        continue
      }

      if (s.study === "Diagnostic Imaging Study") {
        const hasSpecificStudy = syncedStudies.some(
          (other) =>
            other !== s &&
            ((other.umr && s.umr && other.umr === s.umr) || (other.patient && s.patient && other.patient === s.patient)) &&
            other.study !== "Diagnostic Imaging Study"
        )
        if (hasSpecificStudy) continue
      }
      const pKey = (s.encounterId || s.umr || s.mrn || s.patient || "").toLowerCase().trim()
      const sBase = (s.study || "").toLowerCase().replace(/\s*\([^\)]*\)/g, "").trim()
      const key = `${pKey}::${sBase}`
      if (!seenStudyKeys.has(key)) {
        seenStudyKeys.add(key)
        let ord = s.ordered || ""
        const timeMatch = ord.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i)
        const timePart = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

        const dateMatch = ord.match(/\d{4}-\d{2}-\d{2}/)
        let resolvedDate = dateMatch ? dateMatch[0] : ""

        if (!resolvedDate && (s.umr || s.mrn)) {
          try {
            const pat = db.getPatientByUmr(s.umr || s.mrn)
            if (pat?.createdAt) resolvedDate = pat.createdAt.split("T")[0]
          } catch {}
        }
        if (!resolvedDate && s.encounterId) {
          try {
            const enc = db.getEncounterById(s.encounterId)
            if (enc) resolvedDate = OpReportsService.getEncounterDate(enc)
          } catch {}
        }
        if (!resolvedDate && s.invoiceNo) {
          const matchingClaim = claims.find((c) => c.invoiceNo === s.invoiceNo)
          if (matchingClaim?.dateOfService) resolvedDate = matchingClaim.dateOfService
        }
        if (!resolvedDate && s.paidAt) {
          resolvedDate = s.paidAt.split("T")[0]
        }
        if (!resolvedDate) {
          resolvedDate = new Date().toISOString().split("T")[0]
        }

        deduplicatedStudies.push({
          ...s,
          ordered: `${resolvedDate} · ${timePart}`,
        })
      }
    }
    return deduplicatedStudies
  }

  static ensureRadiologyClaim(study: RadiologyStudyRecord): void {
    try {
      const claims = this.load<ClaimRecord[]>(
        STORAGE_KEY_CLAIMS,
        [],
      )
      const targetMrn = (study.mrn || study.umr || "")
        .toLowerCase()
        .replace("umr", "")
        .replace("p-", "")
        .trim()

      const existingIdx = claims.findIndex(
        (c) =>
          c.invoiceNo === study.invoiceNo ||
          c.id === `CLM-${study.id}` ||
          (study.encounterId && c.encounterId === study.encounterId) ||
          ((c.mrn || c.patientId || "")
            .toLowerCase()
            .replace("umr", "")
            .replace("p-", "")
            .trim() === targetMrn && c.status !== "Paid"),
      )

      const radItem: InvoiceItem = {
        id: `ITEM-RAD-${study.id}`,
        description: `${study.study} (${study.modality})`,
        category: "Radiology / Imaging",
        cptCode: `RAD-${study.modality}`,
        quantity: 1,
        unitPrice: study.price,
        total: study.price,
        insuranceCovered: 0,
        patientPayable: study.price,
        orderedBy: study.provider || "Attending Doctor",
      }

      if (existingIdx >= 0) {
        const existing = claims[existingIdx]
        const hasItem = existing.items.some(
          (it) => it.id === radItem.id || it.description.includes(study.study),
        )
        if (!hasItem) {
          const updatedItems = [...existing.items, radItem]
          const subtotal = existing.subtotal + study.price
          const totalAmount = existing.totalAmount + study.price
          const patientPortion = existing.patientPortion + study.price
          const balanceDue = existing.balanceDue + study.price

          claims[existingIdx] = {
            ...existing,
            items: updatedItems,
            subtotal,
            totalAmount,
            patientPortion,
            balanceDue,
            status: existing.status === "Paid" ? "Draft" : existing.status,
            updatedAt: new Date().toISOString(),
          }
          this.save(STORAGE_KEY_CLAIMS, claims)
        }
      } else {
        const newClaim: ClaimRecord = {
          id: `CLM-${study.id}`,
          invoiceNo:
            study.invoiceNo ||
            `INV-RAD-${study.id.replace(/\D/g, "") || Date.now().toString().slice(-4)}`,
          encounterId: study.encounterId || study.id,
          patientId: study.umr || study.mrn,
          patientName: study.patient,
          mrn: study.mrn,
          age: 35,
          gender: "Male",
          phone: "+91 98765 43210",
          payments: [],
          department: "Radiology",
          carePathway: `Radiology Imaging — ${study.study}`,
          dateOfService: new Date().toISOString().split("T")[0],
          insuranceProvider: "Self-Pay",
          policyNumber: "N/A",
          status: "Draft",
          attendingDoctor: study.provider || "Attending Doctor",
          diagnosisCodes: [study.diagnosis || "Z01.89"],
          items: [radItem],
          subtotal: study.price,
          discount: 0,
          tax: 0,
          totalAmount: study.price,
          insurancePortion: 0,
          patientPortion: study.price,
          amountPaid: 0,
          balanceDue: study.price,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        claims.unshift(newClaim)
        this.save(STORAGE_KEY_CLAIMS, claims)
      }
    } catch (err) {
      console.warn("ensureRadiologyClaim error:", err)
    }
  }

  static createRadiologyStudy(
    studyData: Omit<RadiologyStudyRecord, "id"> & { id?: string },
  ): RadiologyStudyRecord {
    const studies = this.getRadiologyStudies()

    let resolvedPatientName = studyData.patient || ""
    if (
      resolvedPatientName &&
      (resolvedPatientName.startsWith("PAT-") ||
        resolvedPatientName.startsWith("UMR") ||
        /^\d+$/.test(resolvedPatientName))
    ) {
      try {
        const p =
          db.getPatientByUmr(resolvedPatientName) ||
          db
            .getPatients()
            .find(
              (pt) =>
                pt.umr === resolvedPatientName ||
                pt.name === resolvedPatientName,
            )
        if (p && p.name) resolvedPatientName = p.name
      } catch {}
    }

    const id = studyData.id || `RAD-${Math.floor(200 + Math.random() * 800)}`
    const invoiceNo =
      studyData.invoiceNo ||
      `INV-RAD-${Math.floor(1000 + Math.random() * 9000)}`

    const nowIso = new Date().toISOString()
    // Dynamically resolve patient's original date & time
    let dynamicDate = ""
    if (studyData.encounterId) {
      try {
        const enc = db.getEncounterById(studyData.encounterId)
        if (enc) dynamicDate = OpReportsService.getEncounterDate(enc)
      } catch {}
    }
    if (!dynamicDate && (studyData.umr || studyData.mrn)) {
      try {
        const pat = db.getPatientByUmr(studyData.umr || studyData.mrn)
        if (pat?.createdAt) dynamicDate = pat.createdAt.split("T")[0]
      } catch {}
    }
    const todayStr = new Date().toISOString().split("T")[0]
    const effectiveDate = dynamicDate || todayStr

    let effectiveOrdered = studyData.ordered || ""
    if (effectiveOrdered && /\d{4}-\d{2}-\d{2}/.test(effectiveOrdered)) {
      // Already has full date
    } else if (effectiveOrdered) {
      effectiveOrdered = `${effectiveDate} · ${effectiveOrdered}`
    } else {
      const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      effectiveOrdered = `${effectiveDate} · ${nowTime}`
    }
    const newStudy: RadiologyStudyRecord = {
      ...studyData,
      id,
      patient: resolvedPatientName,
      invoiceNo,
      accessionNo:
        studyData.accessionNo ||
        `RAD-ACC-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: (studyData as any).createdAt || nowIso,
      orderedAt: (studyData as any).orderedAt || nowIso,
      orderDate: studyData.orderDate || effectiveDate || nowIso.split("T")[0],
      ordered: effectiveOrdered,
      status: studyData.status || "Orders",
      paymentStatus: studyData.paymentStatus || "Payment Pending",
    }

    const updated = [newStudy, ...studies.filter((s) => s.id !== id)]

    this.save(STORAGE_KEY_RAD_STUDIES, updated)
    this.invalidateRadiologyStudiesCache()

    if (newStudy.paymentStatus === "Payment Pending") {
      this.ensureRadiologyClaim(newStudy)
    }

    try {
      new BroadcastChannel("hospai_rad_channel").postMessage("changed")
    } catch {}

    this.emitUpdate()

    return newStudy
  }

  static updateRadiologyStudy(
    id: string,
    updates: Partial<RadiologyStudyRecord>,
  ): RadiologyStudyRecord {
    const studies = this.getRadiologyStudies()

    const target = (id || "").trim().toLowerCase()
    let idx = studies.findIndex((s) => s.id && s.id.toLowerCase() === target)
    if (idx < 0) {
      idx = studies.findIndex(
        (s) =>
          (s.accessionNo && s.accessionNo.toLowerCase() === target) ||
          (s.invoiceNo && s.invoiceNo.toLowerCase() === target) ||
          (s.umr && s.umr.toLowerCase() === target) ||
          (s.mrn && s.mrn.toLowerCase() === target),
      )
    }

    if (idx < 0) {
      // Check if study exists in initial seed studies
      const initialMatch = INITIAL_RAD_STUDIES.find(
        (s) =>
          (s.id && s.id.toLowerCase() === target) ||
          (s.accessionNo && s.accessionNo.toLowerCase() === target) ||
          (s.invoiceNo && s.invoiceNo.toLowerCase() === target) ||
          (s.umr && s.umr.toLowerCase() === target),
      )
      if (initialMatch) {
        const newRecord = { ...initialMatch, ...updates, id: initialMatch.id || id }
        const updatedList = [newRecord, ...studies]
        this.save(STORAGE_KEY_RAD_STUDIES, updatedList)
        this.invalidateRadiologyStudiesCache()
        this.emitUpdate()
        try {
          new BroadcastChannel("hospai_rad_channel").postMessage("changed")
        } catch {}
        return newRecord
      }
      // If neither exists, do NOT synthesize a placeholder "Diagnostic Imaging Study"
      console.warn(`Radiology study '${id}' not found in active records or seed catalog; skipping phantom record creation.`)
      return null as unknown as RadiologyStudyRecord
    }

    const updated = { ...studies[idx], ...updates }

    studies[idx] = updated

    this.save(STORAGE_KEY_RAD_STUDIES, studies)
    this.invalidateRadiologyStudiesCache()

    this.emitUpdate()

    try {
      new BroadcastChannel("hospai_rad_channel").postMessage("changed")
    } catch {}

    return updated
  }

  static deleteRadiologyStudy(id: string): void {
    const studies = this.getRadiologyStudies().filter((s) => s.id !== id)

    this.save(STORAGE_KEY_RAD_STUDIES, studies)
    this.invalidateRadiologyStudiesCache()
    this.emitUpdate()
    try {
      new BroadcastChannel("hospai_rad_channel").postMessage("changed")
    } catch {}
  }

  // ── EMERGENCY DEPARTMENT DISCHARGE / BED TRANSFER FINANCIAL CLEARANCE ──────

  static getErFinancialClearance(
    visitNoOrPatientId: string,
    optionalPatientName?: string,
  ): {
    isCleared: boolean

    status: "paid" | "due" | "unbilled"

    hasActiveBill: boolean

    balanceDue: number

    totalAmount: number

    unbilledAmount: number

    receiptNo?: string

    invoiceNo?: string

    claimId?: string

    patientName?: string

    hasPendingCharges?: boolean

    pendingInvoices?: {
      invoiceNo: string
      dueAmount: number
      department: string
    }[]
  } {
    const claims = this.getClaims()

    const deptCharges = this.getDepartmentCharges()

    const query = (visitNoOrPatientId || "").toLowerCase().trim()

    const nameQuery = (optionalPatientName || "").toLowerCase().trim()

    const mrnClean = query.replace("umr", "").trim()

    const isEncounterQuery = Boolean(
      query &&
        (query.startsWith("er-") ||
          query.startsWith("enc-") ||
          /^\d+$/.test(query)),
    );

    const matchingClaims = claims.filter((c) => {
      if (c.status === "Voided") return false

      const pId = (c.patientId || "").toLowerCase().trim()

      const encId = (c.encounterId || "").toLowerCase().trim()

      const invNo = (c.invoiceNo || "").toLowerCase().trim()

      const cId = (c.id || "").toLowerCase().trim()

      const cName = (c.patientName || "").toLowerCase().trim()

      const cMrn = (c.mrn || "").toLowerCase().trim()

      // 1. Exact encounter match or invoice or claim ID match
      if (
        query &&
        (encId === query ||
          invNo === query ||
          cId === query ||
          encId === `er-${query}`)
      )
        return true;

      // If query is an encounter ID, claims with a different encounter ID belong to other visits!
      if (
        isEncounterQuery &&
        encId &&
        encId !== query &&
        encId !== `er-${query}`
      ) {
        return false;
      }
      // 2. Match by MRN or patientId ONLY for Emergency department and if claim has no conflicting encounter
      if (
        !isEncounterQuery &&
        query &&
        (pId === query ||
          cMrn === query ||
          (mrnClean &&
            (cMrn === mrnClean ||
              pId.replace("umr", "").replace("p-", "") === mrnClean)))
      ) {
        if (c.department === "Emergency" && (!encId || encId === query))
          return true;
      }

      // 3. Match by exact patient name ONLY for Emergency department if claim has no conflicting encounter
      if (
        !isEncounterQuery &&
        nameQuery &&
        nameQuery.length >= 3 &&
        nameQuery !== "patient" &&
        nameQuery !== "unknown" &&
        cName === nameQuery
      ) {
        if (c.department === "Emergency" && (!encId || encId === query))
          return true;
      }

      return false
    })

    // Prioritize exact encounter match, then Emergency department, then active balance due, then newest
    matchingClaims.sort((a, b) => {
      const aEnc =
        query && (a.encounterId || "").toLowerCase().trim() === query ? 1 : 0;
      const bEnc =
        query && (b.encounterId || "").toLowerCase().trim() === query ? 1 : 0;
      if (bEnc !== aEnc) return bEnc - aEnc;

      const aEr = a.department === "Emergency" ? 1 : 0;
      const bEr = b.department === "Emergency" ? 1 : 0;
      if (bEr !== aEr) return bEr - aEr;

      const aDue = (a.balanceDue || 0) > 0 ? 1 : 0;
      const bDue = (b.balanceDue || 0) > 0 ? 1 : 0;
      if (bDue !== aDue) return bDue - aDue;

      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });

    const matchingDeptCharges = deptCharges.filter((d) => {
      const pId = (d.patientId || "").toLowerCase().trim()

      const encId = (d.encounterId || "").toLowerCase().trim()

      const dName = (d.patientName || "").toLowerCase().trim()

      if (d.department !== "Emergency") return false

      if (query && (encId === query || encId === `er-${query}`)) return true;

      if (!isEncounterQuery) {
        if (query && pId === query) return true;

        if (
          nameQuery.length >= 3 &&
          nameQuery !== "patient" &&
          nameQuery !== "unknown" &&
          dName === nameQuery
        ) {
          return true;
        }
      }

      return false;
    });

    const unInvoicedCharges = matchingDeptCharges.filter(
      (d) => d.status !== "Invoiced in Central Billing",
    )

    let totalUnbilledCharges = unInvoicedCharges.reduce(
      (sum, d) => sum + (d.totalAmount || 0),
      0,
    )

    // Also look up the ErVisit record to count charted medications, treatments, or procedures not yet staged in deptCharges
    if (totalUnbilledCharges === 0) {
      try {
        const allVisits = ErDatabase.getVisits("all");
        const visit = allVisits.find((v) => {
          const vNo = (v.visit_no || "").toLowerCase().trim();
          const vId = String(v.id).trim();
          return (
            (query &&
              (vNo === query || vId === query || `er-${vId}` === query)) ||
            (nameQuery &&
              nameQuery !== "patient" &&
              nameQuery !== "unknown" &&
              [v.patient_name, v.patient_last_name]
                .filter(Boolean)
                .join(" ")
                .toLowerCase() === nameQuery)
          );
        });

        if (visit) {
          // 1. Charted treatments / medications on the visit
          if (visit.treatments && visit.treatments.length > 0) {
            visit.treatments.forEach((t) => {
              const medName = t.description || t.intervention_type || "";
              if (medName) {
                const tariff = resolveErItemPrice(medName, "medication");
                totalUnbilledCharges += tariff.unitPrice;
              }
            });
          }

          // 2. Charted investigations
          if (visit.investigations && visit.investigations.length > 0) {
            visit.investigations.forEach((inv) => {
              const testName = inv.test_name || "";
              if (testName) {
                const tariff = resolveErItemPrice(testName, "investigation");
                totalUnbilledCharges += tariff.unitPrice;
              }
            });
          }

          // 3. Charted timeline medication events
          if (visit.timeline_events && visit.timeline_events.length > 0) {
            visit.timeline_events.forEach((ev) => {
              if (
                ev.event_type === "medication_given" ||
                ev.event_type === "intervention_given"
              ) {
                const evName = ev.event_name || ev.notes || "";
                if (evName) {
                  const tariff = resolveErItemPrice(
                    evName,
                    ev.event_type === "medication_given"
                      ? "medication"
                      : "intervention",
                  );
                  totalUnbilledCharges += tariff.unitPrice;
                }
              }
            });
          }
        }
      } catch {
        // Safe fallback
      }
    }

    if (matchingClaims.length === 0) {
      return {
        isCleared: false,
        status: "unbilled",
        hasActiveBill: false,
        balanceDue: 0,
        totalAmount: totalUnbilledCharges,
        unbilledAmount: totalUnbilledCharges,
        invoiceNo: unInvoicedCharges[0]?.id,
        claimId: unInvoicedCharges[0]?.id,
        patientName: unInvoicedCharges[0]?.patientName,
        hasPendingCharges: totalUnbilledCharges > 0,
        pendingInvoices: [],
      }
    }

    const claimBalanceDue = matchingClaims.reduce(
      (sum, c) => sum + (c.balanceDue || 0),
      0,
    );

    const claimTotal = matchingClaims.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    );

    const latestClaim = matchingClaims[0];

    const latestPayment =
      latestClaim?.payments && latestClaim.payments.length > 0
        ? latestClaim.payments[latestClaim.payments.length - 1]
        : undefined;

    const isDue = claimBalanceDue > 0;

    const isPaid =
      !isDue &&
      (claimTotal > 0 || !!latestPayment || latestClaim?.status === "Paid");

    const status: "paid" | "due" | "unbilled" = isDue
      ? "due"
      : isPaid
        ? "paid"
        : "unbilled";

    const pendingInvoices = matchingClaims
      .filter((c) => (c.balanceDue || 0) > 0)
      .map((c) => ({
        invoiceNo: c.invoiceNo,
        dueAmount: c.balanceDue || 0,
        department: c.department,
      }));

    return {
      isCleared: isPaid,
      status,
      hasActiveBill: true,
      balanceDue: claimBalanceDue,
      totalAmount: claimTotal,
      unbilledAmount: totalUnbilledCharges,
      receiptNo:
        latestPayment?.receiptNo ||
        (isPaid
          ? latestClaim.payments?.[0]?.receiptNo || "RCPT-2026-5501"
          : undefined),
      invoiceNo: latestClaim?.invoiceNo,
      claimId: latestClaim?.id,
      patientName: latestClaim?.patientName,
      hasPendingCharges: totalUnbilledCharges > 0,
      pendingInvoices,
    };
  }

  /**
   * Set preselected claim ID or invoice number to automatically focus on in Central Billing POS
   */

  static setPreselectedClaimForBilling(idOrInvoiceNo: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(
          "hospai_billing_preselected_claim",
          idOrInvoiceNo,
        )
      }
    } catch {
      // Ignore in non-browser environment
    }
  }

  /**
   * Get and clear preselected claim ID for Central Billing POS
   */

  static getPreselectedClaimForBilling(clear = false): string | null {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        const item = window.sessionStorage.getItem(
          "hospai_billing_preselected_claim",
        );

        if (item && clear) {
          window.sessionStorage.removeItem("hospai_billing_preselected_claim");
        }

        return item || null;
      }
    } catch {
      // Ignore in non-browser environment
    }

    return null;
  }

  static clearPreselectedClaimForBilling(): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem("hospai_billing_preselected_claim");
      }
    } catch {}
  }

  /**
   * Add a real-time clinical charge (Medication, Investigation, or Intervention) to ER encounter
   * If a formal bill has already been dispatched to Central Billing, updates that claim.
   * If not yet dispatched, stages the charge as unbilled in Department Charges without premature "Pending" balance at Central Billing.
   */

  static addErClinicalCharge(
    encounterIdOrVisitNo: string,

    patientInfo: {
      patientId: string

      patientName: string

      mrn?: string

      age?: number

      gender?: string

      phone?: string

      assignedDoctor?: string
    },

    item: {
      description: string

      category: InvoiceItem["category"]

      unitPrice: number

      quantity?: number

      cptCode?: string
    },
  ): { totalAdded: number ;newBalance: number ;description: string } {
    const claims = this.load<ClaimRecord[]>(
      STORAGE_KEY_CLAIMS,
      [],
    )

    const deptCharges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    const query = (encounterIdOrVisitNo || "").toLowerCase().trim()

    const pIdQuery = (patientInfo.patientId || "").toLowerCase().trim()

    const pNameQuery = (patientInfo.patientName || "").toLowerCase().trim()

    const nowIso = new Date().toISOString()

    const qty = item.quantity || 1

    const total = item.unitPrice * qty

    const newItem: InvoiceItem = {
      id: `ITEM-ER-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,

      description: item.description,

      category: item.category,

      cptCode: item.cptCode || "99285",

      quantity: qty,

      unitPrice: item.unitPrice,

      total,

      insuranceCovered: 0,

      patientPayable: total,
    }

    const isSpecificVisit = Boolean(
      query &&
        (query.startsWith("er-") ||
          query.startsWith("enc-") ||
          /^\d+$/.test(query)),
    )

    // Check if an existing active dispatched Claim exists for this ER encounter

    const claimIdx = claims.findIndex((c) => {
      if (c.status === "Voided") return false

      const pId = (c.patientId || "").toLowerCase().trim()

      const encId = (c.encounterId || "").toLowerCase().trim()

      const invNo = (c.invoiceNo || "").toLowerCase().trim()

      const cId = (c.id || "").toLowerCase().trim()

      const cName = (c.patientName || "").toLowerCase().trim()

      if (query && (encId === query || invNo === query || cId === query))
        return true

      if (!isSpecificVisit && c.department === "Emergency") {
        if (pIdQuery && pId === pIdQuery) return true

        if (
          pNameQuery &&
          pNameQuery.length >= 3 &&
          (cName === pNameQuery ||
            cName.includes(pNameQuery) ||
            pNameQuery.includes(cName))
        )
          return true
      }

      return false
    })

    if (claimIdx >= 0) {
      const current = claims[claimIdx]

      const updatedItems = [...current.items, newItem]

      const subtotal = updatedItems.reduce(
        (sum, it) => sum + Number(it.total || 0),
        0,
      )

      const totalAmount = Math.max(
        0,
        subtotal - (current.discount || 0) + (current.tax || 0),
      )

      const patientPortion = totalAmount

      const balanceDue = Math.max(0, patientPortion - (current.amountPaid || 0))

      const updatedClaim: ClaimRecord = {
        ...current,

        items: updatedItems,

        subtotal,

        totalAmount,

        patientPortion,

        balanceDue,

        status: balanceDue > 0 ? "Accepted" : "Paid",

        updatedAt: nowIso,
      }

      claims[claimIdx] = updatedClaim

      this.save(STORAGE_KEY_CLAIMS, claims)

      BillingRbacManager.logEvent({
        action: "CHARGE_ADDED",

        patientId: updatedClaim.patientId,

        patientName: updatedClaim.patientName,

        mrn: updatedClaim.mrn,

        invoiceNo: updatedClaim.invoiceNo,

        claimId: updatedClaim.id,

        financialAmount: total,

        department: "Emergency",

        reason: `ER Clinical Charge attached to active invoice: "${item.description}" (+₹${total.toLocaleString("en-IN")}). Total Due: ₹${balanceDue.toLocaleString("en-IN")}.`,
      })

      return {
        totalAdded: total,
        newBalance: balanceDue,
        description: item.description,
      }
    }

    // If no active claim has been dispatched yet, stage charge in DepartmentChargeRecord as "Accumulating Charges"

    const deptIdx = deptCharges.findIndex((d) => {
      const encId = (d.encounterId || "").toLowerCase().trim()

      const pId = (d.patientId || "").toLowerCase().trim()

      const dName = (d.patientName || "").toLowerCase().trim()

      if (d.department !== "Emergency") return false

      if (isSpecificVisit) {
        return encId === query
      }

      return (
        (query && (encId === query || pId === query)) ||
        (pNameQuery.length >= 3 &&
          (dName === pNameQuery ||
            dName.includes(pNameQuery) ||
            pNameQuery.includes(dName)))
      )
    })

    if (deptIdx >= 0) {
      const existing = deptCharges[deptIdx]

      const updatedItems = [...existing.items, newItem]

      const subtotal = updatedItems.reduce(
        (sum, it) => sum + Number(it.total || 0),
        0,
      )

      const updatedDept: DepartmentChargeRecord = {
        ...existing,

        items: updatedItems,

        subtotal,

        totalAmount: subtotal,

        status:
          existing.status === "Invoiced in Central Billing"
            ? "Accumulating Charges"
            : existing.status,
      }

      deptCharges[deptIdx] = updatedDept

      this.save(STORAGE_KEY_DEPT_CHARGES, deptCharges);
      this.emitUpdate();

      return {
        totalAdded: total,
        newBalance: subtotal,
        description: item.description,
      }
    }

    const newDeptCharge: DepartmentChargeRecord = {
      id: `DCHG-${Date.now().toString().slice(-6)}`,

      patientId:
        patientInfo.patientId ||
        `UMR${Math.floor(100000 + Math.random() * 900000)}`,

      mrn: patientInfo.mrn || "100245",

      patientName: patientInfo.patientName || "Emergency Patient",

      age: Number(patientInfo.age) || 30,

      gender: patientInfo.gender as any || "Other",

      phone: patientInfo.phone || "+91 98765 43210",

      department: "Emergency",

      encounterId: encounterIdOrVisitNo,

      carePathway: "ER Emergency Clinical Care",

      dateOfService: nowIso.split("T")[0],

      insuranceProvider: "Self-Pay",

      policyNumber: "N/A - Self Pay",

      attendingDoctor: patientInfo.assignedDoctor || "Emergency Attending",

      diagnosisCodes: ["R07.9"],

      items: [newItem],

      subtotal: total,

      totalAmount: total,

      status: "Accumulating Charges",

      createdAt: nowIso,
    }

    deptCharges.unshift(newDeptCharge)

    this.save(STORAGE_KEY_DEPT_CHARGES, deptCharges);
    this.emitUpdate();

    return {
      totalAdded: total,
      newBalance: total,
      description: item.description,
    }
  }

  // ── INPATIENT WARD / ICU DISCHARGE FINANCIAL CLEARANCE ──────────────────────

  static getInpatientFinancialClearance(
    patientIdOrBedId: string | number,
    optionalPatientName?: string,
  ): {
    isCleared: boolean

    balanceDue: number

    totalAmount: number

    receiptNo?: string

    invoiceNo?: string

    claimId?: string

    patientName?: string

    hasPendingCharges?: boolean

    pendingInvoices?: {
      invoiceNo: string
      dueAmount: number
      department: string
    }[]
  } {
    const claims = this.getClaims()

    const deptCharges = this.getDepartmentCharges()

    const query = String(patientIdOrBedId || "")
      .toLowerCase()
      .trim()

    const nameQuery = (optionalPatientName || "").toLowerCase().trim()

    const mrnClean = query.replace("umr", "").trim()

    const matchingClaims = claims.filter((c) => {
      const pId = (c.patientId || "").toLowerCase().trim()

      const pMrn = (c.mrn || "").toLowerCase().trim()

      const encId = (c.encounterId || "").toLowerCase().trim()

      const invNo = (c.invoiceNo || "").toLowerCase().trim()

      const cId = (c.id || "").toLowerCase().trim()

      const cName = (c.patientName || "").toLowerCase().trim()

      return (
        (query &&
          (pId === query ||
            pMrn === mrnClean ||
            encId === query ||
            invNo === query ||
            cId === query)) ||
        (query.length >= 4 &&
          (pId.includes(query) ||
            encId.includes(query) ||
            pMrn.includes(mrnClean))) ||
        (nameQuery.length >= 3 &&
          (cName.includes(nameQuery) || nameQuery.includes(cName)))
      )
    })

    const matchingDeptCharges = deptCharges.filter((d) => {
      const pId = (d.patientId || "").toLowerCase().trim()

      const pMrn = (d.mrn || "").toLowerCase().trim()

      const encId = (d.encounterId || "").toLowerCase().trim()

      const dName = (d.patientName || "").toLowerCase().trim()

      return (
        (d.department === "Inpatient" ||
          d.department === "ICU" ||
          d.department === "Surgery") &&
        ((query && (pId === query || pMrn === mrnClean || encId === query)) ||
          (query.length >= 4 &&
            (pId.includes(query) || encId.includes(query))) ||
          (nameQuery.length >= 3 &&
            (dName.includes(nameQuery) || nameQuery.includes(dName))))
      )
    })

    if (matchingClaims.length === 0 && matchingDeptCharges.length === 0) {
      return {
        isCleared: true,
        balanceDue: 0,
        totalAmount: 0,
        pendingInvoices: [],
      }
    }

    const claimBalanceDue = matchingClaims.reduce(
      (sum, c) => sum + (c.balanceDue || 0),
      0,
    )

    const claimTotal = matchingClaims.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    )

    const unInvoicedCharges = matchingDeptCharges.filter(
      (d) => d.status !== "Invoiced in Central Billing",
    )

    const deptChargesDue = unInvoicedCharges.reduce(
      (sum, d) => sum + (d.totalAmount || 0),
      0,
    )

    const totalBalanceDue =
      claimBalanceDue + (matchingClaims.length === 0 ? deptChargesDue : 0)

    const totalAmount = claimTotal || deptChargesDue

    const latestClaim = matchingClaims[0]

    const latestPayment =
      latestClaim?.payments && latestClaim.payments.length > 0
        ? latestClaim.payments[latestClaim.payments.length - 1]
        : undefined

    const pendingInvoices = matchingClaims

      .filter((c) => (c.balanceDue || 0) > 0)

      .map((c) => ({
        invoiceNo: c.invoiceNo,

        dueAmount: c.balanceDue || 0,

        department: c.department,
      }))

    return {
      isCleared: totalBalanceDue === 0,

      balanceDue: totalBalanceDue,

      totalAmount,

      receiptNo:
        latestPayment?.receiptNo ||
        (totalBalanceDue === 0 ? "RCPT-2026-5501" : undefined),

      invoiceNo: latestClaim?.invoiceNo || unInvoicedCharges[0]?.id,

      claimId: latestClaim?.id || unInvoicedCharges[0]?.id,

      patientName:
        latestClaim?.patientName || unInvoicedCharges[0]?.patientName,

      hasPendingCharges: unInvoicedCharges.length > 0,

      pendingInvoices,
    }
  }

  static getAllPayments(): (PaymentRecord & {
    patientName: string;
    patientId: string;
    mrn: string;
    invoiceNo: string;
    department: DepartmentType;
  })[] {
    const claims = this.getClaims()

    const paymentsList: (PaymentRecord & {
      patientName: string;
      patientId: string;
      mrn: string;
      invoiceNo: string;
      department: DepartmentType;
    })[] = []

    claims.forEach((c) => {
      ;(c.payments || []).forEach((p) => {
        paymentsList.push({
          ...p,

          patientName: c.patientName,

          patientId: c.patientId,

          mrn: c.mrn,

          invoiceNo: c.invoiceNo,

          department: c.department,
        })
      })
    })

    return paymentsList.sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
    )
  }

  static voidClaim(id: string, reason: string): ClaimRecord {
    const claim = this.getClaimById(id)

    if (!claim) throw new Error("Invoice not found")

    const updated = this.updateClaim(id, {
      status: "Voided",

      balanceDue: 0,

      denialReason: `Voided / Reversed: ${reason}`,

      updatedAt: new Date().toISOString(),
    })

    BillingRbacManager.logEvent({
      action: "INVOICE_VOIDED",

      patientId: claim.patientId,

      patientName: claim.patientName,

      mrn: claim.mrn,

      invoiceNo: claim.invoiceNo,

      claimId: claim.id,

      financialAmount: claim.totalAmount,

      department: claim.department,

      originalValue: `Status: ${claim.status}, Total: ₹${claim.totalAmount.toLocaleString("en-IN")}`,

      newValue: "Status: Voided, Balance Due: ₹0",

      reason: `Authorized invoice void: ${reason}`,
    })

    return updated
  }

  static applyDirectAdjustment(
    id: string,

    amount: number,

    adjustmentType: string,

    reason: string,
  ): ClaimRecord {
    const claim = this.getClaimById(id)

    if (!claim) throw new Error("Invoice not found")

    const newDiscount = (claim.discount || 0) + amount

    const newTotal = Math.max(
      0,
      claim.subtotal - newDiscount + (claim.tax || 0),
    )

    const newPatientPortion = Math.max(0, claim.patientPortion - amount)

    const newBalanceDue = Math.max(
      0,
      newPatientPortion - (claim.amountPaid || 0),
    )

    const updated = this.updateClaim(id, {
      discount: newDiscount,

      totalAmount: newTotal,

      patientPortion: newPatientPortion,

      balanceDue: newBalanceDue,

      updatedAt: new Date().toISOString(),
    })

    BillingRbacManager.logEvent({
      action: "ADJUSTMENT_APPLIED",

      patientId: claim.patientId,

      patientName: claim.patientName,

      mrn: claim.mrn,

      invoiceNo: claim.invoiceNo,

      claimId: claim.id,

      financialAmount: amount,

      department: claim.department,

      reason: `Direct adjustment applied (${adjustmentType}) for ₹${amount.toLocaleString("en-IN")}: ${reason}`,
    })

    return updated
  }

  static deleteClaim(id: string): void {
    this.voidClaim(id, "Administrative removal / reversal requested")
  }

  // ── DEPARTMENT-TO-BILLING WORKQUEUE METHODS ─────────────────────────────────

  static getDepartmentCharges(filter?: {
    status?: string

    department?: DepartmentType | "All"

    search?: string

    umr?: string
  }): DepartmentChargeRecord[] {
    let charges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    // Deduplicate charges by encounterId (keep the latest record if duplicates exist)

    const seenEncounters = new Set<string>()

    const deduplicated: DepartmentChargeRecord[] = []

    for (const c of charges) {
      const key = c.encounterId ? `${c.patientId || ""}-${c.encounterId}` : c.id

      if (!seenEncounters.has(key)) {
        seenEncounters.add(key)

        deduplicated.push(c)
      }
    }

    charges = deduplicated

    if (filter) {
      if (filter.department && filter.department !== "All") {
        charges = charges.filter((c) => c.department === filter.department)
      }

      if (filter.status && filter.status !== "All") {
        charges = charges.filter((c) => c.status === filter.status)
      }

      if (filter.umr && filter.umr.trim()) {
        const u = filter.umr.trim().toLowerCase()

        charges = charges.filter(
          (c) => c.patientId.toLowerCase() === u || c.mrn.toLowerCase() === u,
        )
      }

      if (filter.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase()

        charges = charges.filter(
          (c) =>
            c.patientName.toLowerCase().includes(q) ||
            c.mrn.toLowerCase().includes(q) ||
            c.patientId.toLowerCase().includes(q) ||
            c.encounterId.toLowerCase().includes(q) ||
            (c.hospitalStayId && c.hospitalStayId.toLowerCase().includes(q)) ||
            c.items.some(
              (it) =>
                it.description.toLowerCase().includes(q) ||
                it.cptCode.toLowerCase().includes(q),
            ),
        )
      }
    }

    return charges.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }

  static getDepartmentChargeById(
    id: string,
  ): DepartmentChargeRecord | undefined {
    const charges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    return charges.find((c) => c.id === id || c.encounterId === id)
  }

  static createDepartmentCharge(
    data: Partial<DepartmentChargeRecord>,
  ): DepartmentChargeRecord {
    let charges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    const nowIso = new Date().toISOString()

    const id = `DCHG-${Date.now().toString().slice(-6)}`

    const items = data.items || []

    const subtotal = items.reduce((sum, it) => sum + Number(it.total || 0), 0)

    // Upsert: If a charge packet already exists for this encounter, update it instead of creating a duplicate

    const existingIndex = charges.findIndex(
      (c) =>
        (data.encounterId && c.encounterId === data.encounterId) ||
        (data.id && c.id === data.id),
    )

    if (existingIndex >= 0) {
      const existing = charges[existingIndex]

      const updatedRecord: DepartmentChargeRecord = {
        ...existing,

        ...data,

        id: existing.id,

        items,

        subtotal,

        totalAmount: subtotal,

        status: data.status || existing.status,

        finalizedAt: data.finalizedAt || existing.finalizedAt || nowIso,
      }

      charges[existingIndex] = updatedRecord

      // Also purge any historical duplicate packets with same encounterId

      if (data.encounterId) {
        charges = charges.filter(
          (c, idx) =>
            idx === existingIndex || c.encounterId !== data.encounterId,
        )
      }

      this.save(STORAGE_KEY_DEPT_CHARGES, charges)

      return updatedRecord
    }

    const newRecord: DepartmentChargeRecord = {
      id,

      patientId:
        data.patientId || `UMR${Math.floor(100000 + Math.random() * 900000)}`,

      mrn: data.mrn || `100${Math.floor(100 + Math.random() * 899)}`,

      patientName: data.patientName || "Department Patient",

      age: data.age || 40,

      gender: data.gender || "Other",

      phone: data.phone || "+91 98765 43210",

      encounterId: data.encounterId || `ENC-${Date.now().toString().slice(-6)}`,

      hospitalStayId: data.hospitalStayId,

      department: data.department || "Outpatient",

      carePathway: data.carePathway,

      dateOfService: data.dateOfService || nowIso.split("T")[0],

      insuranceProvider: data.insuranceProvider || "Star Health",

      policyNumber: data.policyNumber || "SH-POL-2026",

      preAuthCode: data.preAuthCode,

      attendingDoctor: data.attendingDoctor || "Dr. Staff Physician",

      diagnosisCodes: data.diagnosisCodes || ["Z00.00"],

      items,

      subtotal,

      totalAmount: subtotal,

      status: data.status || "Accumulating Charges",

      verifiedByNurse: data.verifiedByNurse,

      finalizedAt: data.finalizedAt,

      createdAt: nowIso,

      notes: data.notes,
    }

    charges.unshift(newRecord)

    this.save(STORAGE_KEY_DEPT_CHARGES, charges)

    BillingRbacManager.logEvent({
      action: "CHARGE_ADDED",

      patientId: newRecord.patientId,

      patientName: newRecord.patientName,

      mrn: newRecord.mrn,

      invoiceNo: "DEPT-RUNNING",

      financialAmount: newRecord.totalAmount,

      department: newRecord.department,

      reason: `Department charge sheet created for ${newRecord.department} under UMR ${newRecord.patientId} (${newRecord.items.length} services attached).`,
    })

    return newRecord
  }

  static addServiceToDepartmentCharge(
    chargeId: string,
    item: Omit<InvoiceItem, "id">,
  ): DepartmentChargeRecord {
    const charges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    const idx = charges.findIndex((c) => c.id === chargeId)

    if (idx < 0) throw new Error("Department charge sheet not found")

    const current = charges[idx]

    const newItem: InvoiceItem = {
      ...item,

      id: `IT-${Date.now().toString().slice(-4)}-${Math.floor(10 + Math.random() * 89)}`,
    }

    const updatedItems = [...current.items, newItem]

    const subtotal = updatedItems.reduce(
      (sum, it) => sum + Number(it.total || 0),
      0,
    )

    const updated: DepartmentChargeRecord = {
      ...current,

      items: updatedItems,

      subtotal,

      totalAmount: subtotal,
    }

    charges[idx] = updated

    this.save(STORAGE_KEY_DEPT_CHARGES, charges)

    BillingRbacManager.logEvent({
      action: "CHARGE_ADDED",

      patientId: current.patientId,

      patientName: current.patientName,

      mrn: current.mrn,

      invoiceNo: "DEPT-RUNNING",

      financialAmount: newItem.total,

      department: current.department,

      reason: `Service added under UMR ${current.patientId} (${current.department}): "${newItem.description}" (₹${newItem.total.toLocaleString("en-IN")}).`,
    })

    return updated
  }

  static finalizeDepartmentCharges(
    chargeId: string,
    verifiedByNurse: string,
    notes?: string,
  ): DepartmentChargeRecord {
    const charges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    const idx = charges.findIndex((c) => c.id === chargeId)

    if (idx < 0) throw new Error("Department charge sheet not found")

    const current = charges[idx]

    const nowIso = new Date().toISOString()

    const updated: DepartmentChargeRecord = {
      ...current,

      status: "Finalized by Dept",

      verifiedByNurse,

      finalizedAt: nowIso,

      notes:
        notes ||
        current.notes ||
        "All clinical charges verified and finalized by department nurse. Transferred to Universal Billing.",
    }

    charges[idx] = updated

    this.save(STORAGE_KEY_DEPT_CHARGES, charges)

    BillingRbacManager.logEvent({
      action: "CHARGE_ADDED",

      patientId: current.patientId,

      patientName: current.patientName,

      mrn: current.mrn,

      invoiceNo: "DEPT-FINALIZED",

      financialAmount: current.totalAmount,

      department: current.department,

      reason: `Department charges finalized by ${verifiedByNurse} for UMR ${current.patientId} (Total: ₹${current.totalAmount.toLocaleString("en-IN")}). Sent to Central Billing queue.`,
    })

    return updated
  }

  static convertDepartmentChargeToInvoice(
    chargeId: string,

    billingStaffName: string,

    customOptions?: {
      insuranceProvider?: string
      preAuthCode?: string
      discount?: number
    },
  ): ClaimRecord {
    const charges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    const idx = charges.findIndex((c) => c.id === chargeId)

    if (idx < 0) throw new Error("Department charge packet not found")

    const deptRecord = charges[idx]

    const payer =
      customOptions?.insuranceProvider ||
      deptRecord.insuranceProvider ||
      "Star Health"

    const isSelfPay = payer === "Self-Pay"

    const mappedItems: InvoiceItem[] = deptRecord.items.map((it) => {
      const ins = isSelfPay ? 0 : Math.round(it.total * 0.8)

      const pt = it.total - ins

      return {
        ...it,

        insuranceCovered: ins,

        patientPayable: pt,
      }
    })

    const newClaim = this.createClaim({
      patientId: deptRecord.patientId,

      patientName: deptRecord.patientName,

      mrn: deptRecord.mrn,

      age: deptRecord.age,

      gender: deptRecord.gender,

      phone: deptRecord.phone,

      department: deptRecord.department,

      carePathway: deptRecord.carePathway,

      dateOfService: deptRecord.dateOfService,

      encounterId: deptRecord.encounterId,

      hospitalStayId: deptRecord.hospitalStayId,

      insuranceProvider: payer,

      policyNumber: deptRecord.policyNumber,

      preAuthCode: customOptions?.preAuthCode || deptRecord.preAuthCode,

      attendingDoctor: deptRecord.attendingDoctor,

      diagnosisCodes: deptRecord.diagnosisCodes,

      finalizedByNurse: deptRecord.verifiedByNurse,

      discount: customOptions?.discount || 0,

      status: "Ready",

      items: mappedItems,
    })

    // Mark department record as invoiced

    deptRecord.status = "Invoiced in Central Billing"

    deptRecord.invoiceId = newClaim.id

    charges[idx] = deptRecord

    this.save(STORAGE_KEY_DEPT_CHARGES, charges)

    BillingRbacManager.logEvent({
      action: "INVOICE_FINALIZED",

      patientId: newClaim.patientId,

      patientName: newClaim.patientName,

      mrn: newClaim.mrn,

      invoiceNo: newClaim.invoiceNo,

      claimId: newClaim.id,

      financialAmount: newClaim.totalAmount,

      department: newClaim.department,

      reason: `Central billing generated official invoice ${newClaim.invoiceNo} from finalized ${deptRecord.department} charge packet (Staff: ${billingStaffName}).`,
    })

    return newClaim
  }

  static consolidateHospitalStayInvoices(
    hospitalStayId: string,

    billingStaffName: string,
  ): ClaimRecord {
    const charges = this.load<DepartmentChargeRecord[]>(
      STORAGE_KEY_DEPT_CHARGES,
      INITIAL_DEPARTMENT_CHARGES,
    )

    const stayCharges = charges.filter(
      (c) =>
        (c.hospitalStayId === hospitalStayId ||
          c.encounterId === hospitalStayId) &&
        c.status !== "Invoiced in Central Billing",
    )

    if (stayCharges.length === 0)
      throw new Error("No active stay charges found to consolidate")

    const primary = stayCharges[0]

    const allItems: InvoiceItem[] = []

    stayCharges.forEach((c) => {
      allItems.push(...c.items)
    })

    const isSelfPay = primary.insuranceProvider === "Self-Pay"

    const mappedItems = allItems.map((it) => {
      const ins = isSelfPay ? 0 : Math.round(it.total * 0.8)

      const pt = it.total - ins

      return {
        ...it,

        insuranceCovered: ins,

        patientPayable: pt,
      }
    })

    const consolidatedClaim = this.createClaim({
      patientId: primary.patientId,

      patientName: primary.patientName,

      mrn: primary.mrn,

      age: primary.age,

      gender: primary.gender,

      phone: primary.phone,

      department: "Inpatient",

      carePathway: `Consolidated Hospital Stay (${stayCharges.map((s) => s.department).join(" → ")})`,

      dateOfService: primary.dateOfService,

      hospitalStayId,

      insuranceProvider: primary.insuranceProvider,

      policyNumber: primary.policyNumber,

      preAuthCode: primary.preAuthCode,

      attendingDoctor: primary.attendingDoctor,

      diagnosisCodes: primary.diagnosisCodes,

      status: "Ready",

      items: mappedItems,
    })

    stayCharges.forEach((sc) => {
      sc.status = "Invoiced in Central Billing"

      sc.invoiceId = consolidatedClaim.id
    })

    this.save(STORAGE_KEY_DEPT_CHARGES, charges)

    BillingRbacManager.logEvent({
      action: "INVOICE_FINALIZED",

      patientId: consolidatedClaim.patientId,

      patientName: consolidatedClaim.patientName,

      mrn: consolidatedClaim.mrn,

      invoiceNo: consolidatedClaim.invoiceNo,

      claimId: consolidatedClaim.id,

      financialAmount: consolidatedClaim.totalAmount,

      department: "Inpatient",

      reason: `Consolidated single hospital stay invoice ${consolidatedClaim.invoiceNo} created across ${stayCharges.length} departments for UMR ${consolidatedClaim.patientId} (Staff: ${billingStaffName}).`,
    })

    return consolidatedClaim
  }

  // ── UMR CENTRAL FINANCIAL LEDGER ENGINE ─────────────────────────────────────

  /**
   * Constructs the complete, authoritative financial ledger for any patient by UMR.
   * Aggregates all OP, ER, Inpatient, ICU, Surgery, Lab, and Radiology charges,
   * invoices, claims, and payment records without missing or duplicating transactions.
   */

  static getUmrLedger(umrQuery: string): UmrFinancialLedger | null {
    if (!umrQuery || !umrQuery.trim()) return null

    const cleanQuery = umrQuery.trim().toUpperCase()

    // 1. Search comprehensively across all collections

    const allClaimsList = this.getClaims()

    const allDeptChargesList = this.getDepartmentCharges()

    const opPatients = db.getPatients()

    const erPatients = ErDatabase.getPatients()

    const beds = BedDatabase.getBeds()

    // Priority 1: Exact UMR match

    let matchedUmr = ""

    let matchedName = ""

    let matchedMrn = ""

    let matchedAge = 40

    let matchedGender: "Male" | "Female" | "Other" = "Male"

    let matchedPhone = "+91 98765 43210"

    let matchedPayer = "Self-Pay"

    let matchedPolicy = "N/A"

    const exactClaim = allClaimsList.find(
      (c) => c.patientId.toUpperCase() === cleanQuery,
    )

    const exactDept = allDeptChargesList.find(
      (c) => c.patientId.toUpperCase() === cleanQuery,
    )

    const exactOp = opPatients.find((p) => p.umr.toUpperCase() === cleanQuery)

    const exactEr = erPatients.find(
      (p) => p.patient_id.toUpperCase() === cleanQuery,
    )

    if (exactClaim) {
      matchedUmr = exactClaim.patientId

      matchedName = exactClaim.patientName

      matchedMrn = exactClaim.mrn

      matchedAge = exactClaim.age

      matchedGender = exactClaim.gender

      matchedPhone = exactClaim.phone

      matchedPayer = exactClaim.insuranceProvider

      matchedPolicy = exactClaim.policyNumber
    } else if (exactDept) {
      matchedUmr = exactDept.patientId

      matchedName = exactDept.patientName

      matchedMrn = exactDept.mrn

      matchedAge = exactDept.age

      matchedGender = exactDept.gender

      matchedPhone = exactDept.phone

      matchedPayer = exactDept.insuranceProvider

      matchedPolicy = exactDept.policyNumber
    } else if (exactOp) {
      matchedUmr = exactOp.umr

      matchedName = exactOp.name

      matchedMrn = exactOp.umr.replace(/\D/g, "") || "100501"

      matchedAge = exactOp.age

      matchedGender = ((exactOp.sex === "Female" ? "Female" : "Male") as any)

      matchedPhone = exactOp.phone

      matchedPayer = (exactOp as any).insurance || "Self-Pay"
    } else if (exactEr) {
      matchedUmr = exactEr.patient_id

      matchedName = `${exactEr.name} ${exactEr.last_name}`.trim()

      matchedMrn = exactEr.patient_id.replace(/\D/g, "") || "100501"

      matchedAge = exactEr.age

      matchedGender = ((exactEr.gender === "Female" ? "Female" : "Male") as any)

      matchedPhone = exactEr.phone
    } else {
      // Priority 2: Substring Name or Phone or MRN match

      const nameOp = opPatients.find(
        (p) =>
          p.name.toUpperCase().includes(cleanQuery) ||
          p.phone.includes(cleanQuery),
      )

      const nameClaim = allClaimsList.find(
        (c) =>
          c.patientName.toUpperCase().includes(cleanQuery) ||
          c.phone.includes(cleanQuery) ||
          c.mrn.includes(cleanQuery),
      )

      const nameDept = allDeptChargesList.find(
        (c) =>
          c.patientName.toUpperCase().includes(cleanQuery) ||
          c.phone.includes(cleanQuery) ||
          c.mrn.includes(cleanQuery),
      )

      const nameEr = erPatients.find(
        (p) =>
          `${p.name} ${p.last_name}`.toUpperCase().includes(cleanQuery) ||
          p.phone.includes(cleanQuery),
      )

      if (nameOp) {
        matchedUmr = nameOp.umr

        matchedName = nameOp.name

        matchedAge = nameOp.age

        matchedGender = ((nameOp.sex === "Female" ? "Female" : "Male") as any)

        matchedPhone = nameOp.phone
      } else if (nameClaim) {
        matchedUmr = nameClaim.patientId

        matchedName = nameClaim.patientName

        matchedAge = nameClaim.age

        matchedGender = nameClaim.gender

        matchedPhone = nameClaim.phone
      } else if (nameDept) {
        matchedUmr = nameDept.patientId

        matchedName = nameDept.patientName

        matchedAge = nameDept.age

        matchedGender = nameDept.gender

        matchedPhone = nameDept.phone
      } else if (nameEr) {
        matchedUmr = nameEr.patient_id

        matchedName = `${nameEr.name} ${nameEr.last_name}`.trim()

        matchedAge = nameEr.age

        matchedGender = ((
          nameEr.gender === "Female" ? "Female" : "Male"
        ) as any)

        matchedPhone = nameEr.phone
      } else {
        matchedUmr = cleanQuery

        matchedName = "Hospital Patient"
      }
    }

    const effectiveUmr = matchedUmr || cleanQuery

    const effectiveName = matchedName || "Hospital Patient"

    const mrn = matchedMrn || effectiveUmr.replace(/\D/g, "") || "100501"

    const age = matchedAge || 40

    const gender = matchedGender || "Male"

    const phone = matchedPhone || "+91 98765 43210"

    // 2. Fetch all Invoices & Claims linked to this UMR

    const allClaims = this.getClaims({ umr: effectiveUmr })

    // 3. Fetch all Department Charge packets linked to this UMR

    const allDeptCharges = this.getDepartmentCharges({ umr: effectiveUmr })

    // 4. Build Encounters list from OP, ER, Bed DB, and Dept Charges

    const encounters: EncounterChargeSummary[] = []

    const seenEncIds = new Set<string>()

    // Add from Dept Charges

    allDeptCharges.forEach((dc) => {
      if (!seenEncIds.has(dc.encounterId)) {
        seenEncIds.add(dc.encounterId)

        encounters.push({
          encounterId: dc.encounterId,

          encounterType:
            dc.department === "Outpatient"
              ? "Outpatient"
              : dc.department === "Emergency"
                ? "Emergency"
                : dc.department === "ICU"
                  ? "ICU"
                  : dc.department === "Surgery"
                    ? "Surgery"
                    : "Inpatient Ward",

          department: dc.department,

          date: dc.dateOfService,

          doctor: dc.attendingDoctor,

          status: dc.status,

          items: dc.items,

          totalCharges: dc.totalAmount,

          isFinalized:
            dc.status === "Finalized by Dept" ||
            dc.status === "Invoiced in Central Billing",

          isInvoiced: dc.status === "Invoiced in Central Billing",

          invoiceId: dc.invoiceId,
        })
      }
    })

    // Add OP Encounters from db.ts if not yet in Dept Charges

    const opEncounters = db.getEncountersForPatient(effectiveUmr)

    opEncounters.forEach((enc) => {
      if (!seenEncIds.has(enc.id)) {
        seenEncIds.add(enc.id)

        const items: InvoiceItem[] = [
          {
            id: `OP-IT-${enc.id}-1`,

            description: `${enc.dept} Doctor Consultation (${enc.assignedDoctor || "Attending Specialist"})`,

            category: "Consultation",

            cptCode: "99205",

            quantity: 1,

            unitPrice: 100,

            total: 100,

            insuranceCovered: 80,

            patientPayable: 20,

            orderedBy: enc.assignedDoctor || "OP Physician",

            orderedAt: enc.registrationTime,
          },
        ]

        // Add Lab / Rad investigations ordered by doctor
        ;(enc.investigations || []).forEach((inv, idx) => {
          const isRad =
            inv.toLowerCase().includes("x-ray") ||
            inv.toLowerCase().includes("ct") ||
            inv.toLowerCase().includes("mri") ||
            inv.toLowerCase().includes("ultra")

          const uPrice = isRad ? 120 : 50

          items.push({
            id: `OP-IT-${enc.id}-INV-${idx + 1}`,

            description: inv,

            category: isRad ? "Radiology / Imaging" : "Laboratory",

            cptCode: isRad ? "71046" : "85025",

            quantity: 1,

            unitPrice: uPrice,

            total: uPrice,

            insuranceCovered: Math.round(uPrice * 0.8),

            patientPayable: Math.round(uPrice * 0.2),

            orderedBy: enc.assignedDoctor || "OP Physician",
          })
        })

        const total = items.reduce((sum, i) => sum + i.total, 0)

        encounters.push({
          encounterId: enc.id,

          encounterType: "Outpatient",

          department: "Outpatient",

          date: enc.registrationTime.includes("-")
            ? enc.registrationTime.split(" ")[0]
            : new Date().toISOString().split("T")[0],

          doctor: enc.assignedDoctor || "Dr. Rajesh Sharma",

          status:
            enc.status === "OP Completed"
              ? "Finalized by Dept"
              : "Accumulating Charges",

          items,

          totalCharges: total,

          isFinalized: enc.status === "OP Completed",

          isInvoiced: false,
        })
      }
    })

    // Add ER Visits from erDb.ts if not yet recorded

    const erVisits = ErDatabase.getVisits("all").filter(
      (v) => v.patient_id === effectiveUmr,
    )

    erVisits.forEach((v) => {
      const vEncId = v.visit_no

      if (!seenEncIds.has(vEncId)) {
        seenEncIds.add(vEncId)

        const items: InvoiceItem[] = [
          {
            id: `ER-IT-${v.id}-1`,

            description: `Emergency Triage & Acute Care Evaluation (${v.triage_category || "B2"})`,

            category: "Consultation",

            cptCode: "99284",

            quantity: 1,

            unitPrice: 150,

            total: 150,

            insuranceCovered: 120,

            patientPayable: 30,

            orderedBy: v.assigned_doctor_name || "Emergency Physician",
          },
        ]
        ;(v.investigations || []).forEach((inv, idx) => {
          const invPrice = inv.category.toLowerCase().includes("radiology")
            ? 120
            : inv.category.toLowerCase().includes("cardiology")
              ? 80
              : 50

          items.push({
            id: `ER-IT-${v.id}-INV-${idx + 1}`,

            description: inv.test_name,

            category: inv.category.toLowerCase().includes("cardiology")
              ? "Consultation"
              : inv.category.toLowerCase().includes("radiology")
                ? "Radiology / Imaging"
                : "Laboratory",

            cptCode: "84484",

            quantity: 1,

            unitPrice: invPrice,

            total: invPrice,

            insuranceCovered: Math.round(invPrice * 0.8),

            patientPayable: Math.round(invPrice * 0.2),

            orderedBy: inv.ordered_by,
          })
        })

        const total = items.reduce((sum, i) => sum + i.total, 0)

        encounters.push({
          encounterId: vEncId,

          encounterType: "Emergency",

          department: "Emergency",

          date: v.arrival_at
            ? v.arrival_at.split("T")[0]
            : new Date().toISOString().split("T")[0],

          doctor: v.assigned_doctor_name || "Dr. Vikram Seth",

          status: v.closed_at ? "Finalized by Dept" : "Accumulating Charges",

          items,

          totalCharges: total,

          isFinalized: Boolean(v.closed_at),

          isInvoiced: false,
        })
      }
    })

    // 5. Aggregate Financials

    const totalHistoricalCharges = encounters.reduce(
      (sum, e) => sum + e.totalCharges,
      0,
    )

    const totalInvoiced = allClaims.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    )

    const totalPaid = allClaims.reduce((sum, c) => sum + (c.amountPaid || 0), 0)

    const outstandingBalance = allClaims.reduce(
      (sum, c) => sum + (c.balanceDue || 0),
      0,
    )

    const insurancePending = allClaims

      .filter((c) => c.status !== "Paid")

      .reduce(
        (sum, c) =>
          sum + Math.max(0, (c.insurancePortion || 0) - (c.amountPaid || 0)),
        0,
      )

    const allPayments = allClaims.flatMap((c) => c.payments || [])

    return {
      umr: effectiveUmr,

      patientName: effectiveName,

      mrn,

      age,

      gender,

      phone,

      insuranceProvider:
        allClaims[0]?.insuranceProvider ||
        allDeptCharges[0]?.insuranceProvider ||
        "Star Health",

      policyNumber:
        allClaims[0]?.policyNumber ||
        allDeptCharges[0]?.policyNumber ||
        "SH-9921045",

      totalHistoricalCharges,

      totalInvoiced,

      totalPaid,

      outstandingBalance,

      insurancePending,

      encounters,

      invoices: allClaims,

      payments: allPayments,

      activeHospitalStayId: allDeptCharges.find((c) => c.hospitalStayId)
        ?.hospitalStayId,
    }
  }

  /**
   * Returns a list of all distinct UMR ledgers available in the hospital system
   */

  static getAllUmrLedgers(): UmrFinancialLedger[] {
    const umrSet = new Set<string>()

    // Collect all UMRs

    this.getClaims().forEach((c) => umrSet.add(c.patientId))

    this.getDepartmentCharges().forEach((c) => umrSet.add(c.patientId))

    db.getPatients().forEach((p) => umrSet.add(p.umr))

    ErDatabase.getPatients().forEach((p) => umrSet.add(p.patient_id))

    BedDatabase.getBeds().forEach((b) => {
      if (b.patient_id) umrSet.add(b.patient_id)
    })

    const ledgers: UmrFinancialLedger[] = []

    umrSet.forEach((umr) => {
      const ledger = this.getUmrLedger(umr)

      if (ledger) ledgers.push(ledger)
    })

    return ledgers.sort(
      (a, b) => b.totalHistoricalCharges - a.totalHistoricalCharges,
    )
  }

  // ── RESET TO CLEAN SEED DATA ────────────────────────────────────────────────

  static resetToActualData(): void {
    this.save(STORAGE_KEY_CLAIMS, [])

    this.save(STORAGE_KEY_DEPT_CHARGES, INITIAL_DEPARTMENT_CHARGES)
  }

  // ── FINANCIAL METRICS & KPI ENGINE ──────────────────────────────────────────

  static getFinancialMetrics(): FinancialMetrics {
    const claims = this.getClaims()

    const activeClaims = claims.filter((c) => c.status !== "Voided")

    const totalChargesMtd = activeClaims.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    )

    const insurancePending = activeClaims

      .filter((c) => c.status !== "Paid")

      .reduce(
        (sum, c) =>
          sum + Math.max(0, (c.insurancePortion || 0) - (c.amountPaid || 0)),
        0,
      )

    const patientBalance = activeClaims.reduce(
      (sum, c) => sum + (c.balanceDue || 0),
      0,
    )

    const deniedClaims = activeClaims.filter(
      (c) =>
        c.status === "Denied" ||
        c.status === "Rejected" ||
        c.status === "Appeal",
    )

    const deniedCount = deniedClaims.length

    const deniedAmount = deniedClaims.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    )

    const paidClaims = activeClaims.filter((c) => c.status === "Paid")

    const totalCollected = activeClaims.reduce(
      (sum, c) => sum + (c.amountPaid || 0),
      0,
    )

    const collectionsRate =
      totalChargesMtd > 0
        ? Number(((totalCollected / totalChargesMtd) * 100).toFixed(1))
        : 94.2

    const daysInAr = 28.6

    const firstPassRate = 89.4

    const avgClaimValue =
      activeClaims.length > 0
        ? Math.round(totalChargesMtd / activeClaims.length)
        : 28500

    return {
      totalChargesMtd,

      insurancePending,

      patientBalance,

      deniedCount,

      deniedAmount,

      collectionsRate,

      daysInAr,

      firstPassRate,

      avgClaimValue,

      paidCount: paidClaims.length,

      totalClaimsCount: activeClaims.length,
    }
  }

  static getPayerMixMetrics(): PayerMixItem[] {
    const claims = this.getClaims()

    const totalAmount = claims.reduce((sum, c) => sum + (c.totalAmount || 0), 0)

    const payerMap: {
      [payer: string]: { count: number ;amount: number ;color: string }
    } = {
      "Star Health": { count: 0, amount: 0, color: "#1B4FD8" },

      "HDFC ERGO": { count: 0, amount: 0, color: "#0284C7" },

      "ICICI Lombard": { count: 0, amount: 0, color: "#7C3AED" },

      "Care Health": { count: 0, amount: 0, color: "#16A34A" },

      "Bajaj Allianz": { count: 0, amount: 0, color: "#D97706" },

      "PM-JAY (Ayushman Bharat)": { count: 0, amount: 0, color: "#0EA5E9" },

      "Self-Pay": { count: 0, amount: 0, color: "#DC2626" },
    }

    claims.forEach((c) => {
      const payer = c.insuranceProvider || "Self-Pay"

      if (!payerMap[payer]) {
        payerMap[payer] = { count: 0, amount: 0, color: "#64748B" }
      }

      payerMap[payer].count += 1

      payerMap[payer].amount += c.totalAmount || 0
    })

    return Object.entries(payerMap).map(([payer, val]) => ({
      payer,

      claimCount: val.count,

      totalAmount: val.amount,

      pct: totalAmount > 0 ? Math.round((val.amount / totalAmount) * 100) : 0,

      color: val.color,
    }))
  }

  static getArAgingMetrics(): ArAgingItem[] {
    const claims = this.getClaims()

    const unpaidClaims = claims.filter(
      (c) => c.status !== "Paid" && c.totalAmount > 0,
    )

    const totalUnpaid = unpaidClaims.reduce(
      (sum, c) => sum + (c.totalAmount || 0),
      0,
    )

    const buckets: ArAgingItem[] = [
      {
        bucket: "0–30 Days",
        amount: Math.round(totalUnpaid * 0.55),
        pct: 55,
        color: "#16A34A",
        count: Math.max(1, Math.round(unpaidClaims.length * 0.55)),
      },

      {
        bucket: "31–60 Days",
        amount: Math.round(totalUnpaid * 0.25),
        pct: 25,
        color: "#D97706",
        count: Math.max(1, Math.round(unpaidClaims.length * 0.25)),
      },

      {
        bucket: "61–90 Days",
        amount: Math.round(totalUnpaid * 0.12),
        pct: 12,
        color: "#DC2626",
        count: Math.max(1, Math.round(unpaidClaims.length * 0.12)),
      },

      {
        bucket: "91–120 Days",
        amount: Math.round(totalUnpaid * 0.06),
        pct: 6,
        color: "#B91C1C",
        count: 1,
      },

      {
        bucket: "> 120 Days",
        amount: Math.round(totalUnpaid * 0.02),
        pct: 2,
        color: "#7F1D1D",
        count: 1,
      },
    ]

    return buckets
  }

  static exportClaimsToCSV(): string {
    const claims = this.getClaims()

    const headers = [
      "Claim ID",

      "Invoice No",

      "Patient Name",

      "UMR / MRN",

      "Department",

      "Date of Service",

      "Insurance Provider",

      "Total Amount (INR)",

      "Insurance Portion (INR)",

      "Patient Portion (INR)",

      "Amount Paid (INR)",

      "Balance Due (INR)",

      "Status",
    ]

    const rows = claims.map((c) => [
      c.id,

      c.invoiceNo,

      `"${c.patientName}"`,

      c.patientId,

      c.department,

      c.dateOfService,

      `"${c.insuranceProvider}"`,

      c.totalAmount,

      c.insurancePortion,

      c.patientPortion,

      c.amountPaid,

      c.balanceDue,

      c.status,
    ])

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  }
}

export interface ErPricedItem {
  name: string

  category: InvoiceItem["category"]

  unitPrice: number

  cptCode: string
}

/**
 * Standardized ER Emergency Item Rate Card Resolution (INR ₹)
 * Maps clinical medicine/investigation/procedure names to standard hospital tariffs and CPT codes.
 */

export function resolveErItemPrice(
  itemName: string,

  itemType: "medication" | "investigation" | "intervention" | "procedure",
): ErPricedItem {
  const norm = (itemName || "").toLowerCase().trim()

  if (itemType === "medication") {
    if (
      norm.includes("aspirin") ||
      norm.includes("ecosprin") ||
      norm.includes("asa")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 150,
        cptCode: "J0120",
      }

    if (
      norm.includes("clopidogrel") ||
      norm.includes("plavix") ||
      norm.includes("ticagrelor") ||
      norm.includes("brilinta")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 250,
        cptCode: "J0121",
      }

    if (
      norm.includes("atorvastatin") ||
      norm.includes("statin") ||
      norm.includes("rosuvastatin")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 180,
        cptCode: "J0122",
      }

    if (
      norm.includes("paracetamol") ||
      norm.includes("pcm") ||
      norm.includes("dolo") ||
      norm.includes("calpol")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 200,
        cptCode: "J0123",
      }

    if (
      norm.includes("ceftriaxone") ||
      norm.includes("monocef") ||
      norm.includes("antibiotic") ||
      norm.includes("augmentin") ||
      norm.includes("pipzo")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 650,
        cptCode: "J0696",
      }

    if (
      norm.includes("pantoprazole") ||
      norm.includes("pantocid") ||
      norm.includes("pan 40") ||
      norm.includes("rabeprazole")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 220,
        cptCode: "J2440",
      }

    if (
      norm.includes("ondansetron") ||
      norm.includes("emset") ||
      norm.includes("zofran")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 180,
        cptCode: "J2405",
      }

    if (
      norm.includes("morphine") ||
      norm.includes("tramadol") ||
      norm.includes("fentanyl") ||
      norm.includes("pethidine")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 450,
        cptCode: "J2270",
      }

    if (norm.includes("furosemide") || norm.includes("lasix"))
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 150,
        cptCode: "J1940",
      }

    if (
      norm.includes("hydrocortisone") ||
      norm.includes("dexamethasone") ||
      norm.includes("steroid") ||
      norm.includes("prednisolone")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 220,
        cptCode: "J1720",
      }

    if (
      norm.includes("salbutamol") ||
      norm.includes("budecort") ||
      norm.includes("nebuliz") ||
      norm.includes("duolin")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 300,
        cptCode: "J7611",
      }

    if (
      norm.includes("nitroglycerin") ||
      norm.includes("ntg") ||
      norm.includes("sorbitrate") ||
      norm.includes("angispan")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 850,
        cptCode: "J3490",
      }

    if (
      norm.includes("heparin") ||
      norm.includes("enoxaparin") ||
      norm.includes("clexane") ||
      norm.includes("fondaparinux")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 950,
        cptCode: "J1644",
      }

    if (
      norm.includes("tenecteplase") ||
      norm.includes("streptokinase") ||
      norm.includes("thromboly") ||
      norm.includes("alteplase")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 24500,
        cptCode: "J3101",
      }

    if (
      norm.includes("saline") ||
      norm.includes("rl") ||
      norm.includes("dns") ||
      norm.includes("ringer") ||
      norm.includes("fluid")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 250,
        cptCode: "J7030",
      }

    if (
      norm.includes("adrenaline") ||
      norm.includes("epinephrine") ||
      norm.includes("atropine") ||
      norm.includes("noradren")
    )
      return {
        name: itemName,
        category: "Consumables",
        unitPrice: 350,
        cptCode: "J0171",
      }

    return {
      name: itemName,
      category: "Consumables",
      unitPrice: 250,
      cptCode: "99070",
    }
  }

  if (itemType === "investigation") {
    if (norm.includes("ecg") || norm.includes("electrocardiogram"))
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 450,
        cptCode: "93000",
      }

    if (norm.includes("troponin"))
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 1200,
        cptCode: "84484",
      }

    if (
      norm.includes("x-ray") ||
      norm.includes("xray") ||
      norm.includes("chest") ||
      norm.includes("radiograph")
    )
      return {
        name: itemName,
        category: "Radiology / Imaging",
        unitPrice: 600,
        cptCode: "71045",
      }

    if (
      norm.includes("ultrasound") ||
      norm.includes("fast") ||
      norm.includes("usg") ||
      norm.includes("sonograph")
    )
      return {
        name: itemName,
        category: "Radiology / Imaging",
        unitPrice: 1500,
        cptCode: "76705",
      }

    if (
      norm.includes("cbc") ||
      norm.includes("blood count") ||
      norm.includes("grbs") ||
      norm.includes("glucose") ||
      norm.includes("sugar")
    )
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 450,
        cptCode: "85025",
      }

    if (norm.includes("abg") || norm.includes("arterial blood gas"))
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 950,
        cptCode: "82803",
      }

    if (norm.includes("ct") || norm.includes("computed tomography"))
      return {
        name: itemName,
        category: "Radiology / Imaging",
        unitPrice: 3200,
        cptCode: "70450",
      }

    if (norm.includes("mri") || norm.includes("magnetic resonance"))
      return {
        name: itemName,
        category: "Radiology / Imaging",
        unitPrice: 6500,
        cptCode: "70551",
      }

    if (
      norm.includes("renal") ||
      norm.includes("kft") ||
      norm.includes("rft") ||
      norm.includes("electrolyte") ||
      norm.includes("creatinine") ||
      norm.includes("urea")
    )
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 850,
        cptCode: "80069",
      }

    if (
      norm.includes("culture") ||
      norm.includes("blood culture") ||
      norm.includes("urine culture")
    )
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 1200,
        cptCode: "87040",
      }

    if (norm.includes("d-dimer") || norm.includes("dimer"))
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 1400,
        cptCode: "85379",
      }

    if (
      norm.includes("lft") ||
      norm.includes("liver") ||
      norm.includes("bilirubin")
    )
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 850,
        cptCode: "80076",
      }

    if (
      norm.includes("pt/inr") ||
      norm.includes("inr") ||
      norm.includes("coagulation")
    )
      return {
        name: itemName,
        category: "Laboratory",
        unitPrice: 650,
        cptCode: "85610",
      }

    return {
      name: itemName,
      category: "Laboratory",
      unitPrice: 500,
      cptCode: "80050",
    }
  }

  // Interventions / Procedures

  if (
    norm.includes("cannula") ||
    norm.includes("iv line") ||
    norm.includes("peripheral") ||
    norm.includes("iv access")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 350,
      cptCode: "36000",
    }

  if (
    norm.includes("oxygen") ||
    norm.includes("o2") ||
    norm.includes("mask") ||
    norm.includes("prongs") ||
    norm.includes("nrbm")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 500,
      cptCode: "94640",
    }

  if (
    norm.includes("defibrillat") ||
    norm.includes("cardioversion") ||
    norm.includes("shock")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 2500,
      cptCode: "92960",
    }

  if (
    norm.includes("cpr") ||
    norm.includes("resuscitat") ||
    norm.includes("acls") ||
    norm.includes("cardiopulmonary")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 4500,
      cptCode: "92950",
    }

  if (
    norm.includes("intubat") ||
    norm.includes("ventilator") ||
    norm.includes("airway") ||
    norm.includes("ett")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 3500,
      cptCode: "31500",
    }

  if (
    norm.includes("wound") ||
    norm.includes("dress") ||
    norm.includes("suture") ||
    norm.includes("bandage") ||
    norm.includes("hemorrhage")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 850,
      cptCode: "12001",
    }

  if (
    norm.includes("catheter") ||
    norm.includes("foley") ||
    norm.includes("urinary")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 450,
      cptCode: "51702",
    }

  if (
    norm.includes("ryle") ||
    norm.includes("nasogastric") ||
    norm.includes("ng tube") ||
    norm.includes("lavage")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 450,
      cptCode: "43752",
    }

  if (norm.includes("nebuliz") || norm.includes("inhalation"))
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 300,
      cptCode: "94640",
    }

  if (
    norm.includes("pocus") ||
    norm.includes("bedside echo") ||
    norm.includes("echo")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 1800,
      cptCode: "93308",
    }

  if (
    norm.includes("lumbar puncture") ||
    norm.includes("lp") ||
    norm.includes("spinal tap")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 2200,
      cptCode: "62270",
    }

  if (
    norm.includes("chest tube") ||
    norm.includes("icd") ||
    norm.includes("drainage") ||
    norm.includes("thoracentesis")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 4500,
      cptCode: "32551",
    }

  if (
    norm.includes("blood transfusion") ||
    norm.includes("prbc") ||
    norm.includes("ffp")
  )
    return {
      name: itemName,
      category: "Procedure / Surgery",
      unitPrice: 1800,
      cptCode: "36430",
    }

  return {
    name: itemName,
    category: "Procedure / Surgery",
    unitPrice: 500,
    cptCode: "99285",
  }
}
