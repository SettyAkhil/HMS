// Enterprise Hospital Management System (HMS) - Insurance & Claims Domain Types
//
// One insurance case per admitted, insured encounter. The case is linked to
// the encounter's IP bill (billingClaimId) -- insurance is never an isolated
// record -- and moves through a controlled state machine (see
// INSURANCE_TRANSITIONS in services/insuranceDb.ts).

export type PolicyRelationship = "Self" | "Spouse" | "Child" | "Parent" | "Other"

export type ClaimEncounterType = "OP" | "IP" | "ER" | "OT" | "ICU"

export type PaymentType = "Insurance / Cashless" | "Corporate" | "Government Scheme"

export type InsuranceClaimStatus =
  | "DRAFT"
  | "ELIGIBILITY_PENDING"
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "PREAUTH_DRAFT"
  | "PREAUTH_SUBMITTED"
  | "PREAUTH_UNDER_REVIEW"
  | "PREAUTH_QUERY"
  | "PREAUTH_APPROVED"
  | "PREAUTH_REJECTED"
  | "TREATMENT_IN_PROGRESS"
  | "DISCHARGE_INITIATED"
  | "FINAL_BILL_READY"
  | "CLAIM_SUBMITTED"
  | "CLAIM_QUERY_RAISED"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "REJECTED"
  | "SETTLEMENT_PENDING"
  | "PAYMENT_RECEIVED"
  | "RECONCILED"
  | "CLOSED"

export interface InsurancePolicyDetails {
  paymentType: PaymentType
  insurerId: string
  insurerName: string
  tpaId?: string
  tpaName?: string
  policyNumber: string
  memberId: string
  groupPolicyNo?: string
  policyHolderName: string
  relationship: PolicyRelationship
  validUntil: string
  sumInsured: number
  balanceAvailable: number
  roomCategoryEligible: string
  copayPercentage: number
  deductibleAmount: number
  preAuthRequired: boolean
}

export type EligibilityOutcome = "Eligible" | "Partially Eligible" | "Not Eligible" | "Verification Required"

export interface EligibilityResult {
  status: EligibilityOutcome
  method: "Portal" | "Phone" | "API" | "Email"
  reference?: string
  policyActive: boolean
  inNetwork: boolean
  sumInsured: number
  balanceAvailable: number
  roomEligibilityNote: string
  copayApplicable: boolean
  copayValue: string
  deductibleRemaining: number
  preAuthRequired: boolean
  verifiedAt: string
  verifiedBy: string
  notes?: string
}

export type DocumentCategory =
  | "Patient"
  | "Insurance"
  | "Pre-Auth"
  | "Clinical"
  | "Billing"
  | "Discharge"
  | "Query"
  | "Settlement"

export interface DocumentChecklistItem {
  id: string
  category: DocumentCategory
  documentType: string
  label: string
  isMandatory: boolean
  isUploaded: boolean
  status: "Pending" | "Uploaded" | "Verified" | "Rejected"
  version: number
  fileName?: string
  fileUrl?: string
  uploadedAt?: string
  uploadedBy?: string
}

export interface PreAuthProcedureLine {
  packageCode: string
  procedureName: string
  sequence: number
  ratePercent: number
  baseAmount: number
  amount: number
}

export type PreAuthStatusName =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Query"
  | "Approved"
  | "Partially Approved"
  | "Rejected"

export interface PreAuthRequest {
  id: string // "PA-2026-00098"
  status: PreAuthStatusName
  diagnosis: string
  icdCode?: string
  clinicalSummary: string
  treatingDoctor: string
  admissionType: "Planned" | "Emergency"
  procedures: PreAuthProcedureLine[]
  packageSubtotal: number
  gstRate: number
  gstAmount: number
  estimatedOtherCharges: number
  estimatedHospitalStayDays: number
  estimatedTotalCost: number
  requestedAmount: number
  approvedAmount: number
  approvalCode?: string
  submissionMethod?: "Portal" | "API" | "Email" | "Manual"
  externalReference?: string
  submittedAt?: string
  submittedBy?: string
  responseNote?: string
  proposedTreatment?: string
  enhancements: { at: string ;amount: number ;reason: string ;status: "Requested" | "Approved" | "Rejected" }[]
  createdAt: string
  updatedAt: string
}

export interface ClaimQuery {
  id: string // "Q-1024"
  claimId: string
  stage: "Pre-Auth" | "Claim"
  queryDate: string
  dueDate: string
  requestedBy: string
  queryText: string
  status: "Open" | "Draft Response" | "Response Submitted" | "Closed"
  hospitalResponseText?: string
  attachedDocuments?: string[]
  respondedAt?: string
  respondedBy?: string
}

export interface SurgeryPricingRule {
  sequenceOrder: number
  discountPercentage: number
  description: string
}

export type PackageComponent =
  | "Surgeon"
  | "OT"
  | "Room"
  | "Nursing"
  | "Investigations"
  | "Pharmacy"
  | "Consumables"
  | "Implants"
  | "HighCostDrugs"
  | "SpecialConsultations"

export interface PackageMaster {
  id: string
  code: string
  procedureName: string
  basePrice: number
  applicableGstRate: number
  department: string
  includedComponents: PackageComponent[]
  excludedComponents: PackageComponent[]
  pricingRules: SurgeryPricingRule[]
  /** When set, the shared rule set from Masters -> Pricing Rules is used instead of pricingRules. */
  pricingRuleSetId?: string
  applicableInsurerIds?: string[]
  effectiveDate: string
  status: "Active" | "Inactive"
}

/** One priced surgery row on a fixed-package billing form (01 -> 100%, 02 -> 50%, …). */
export interface FixedPackageSurgeryLine {
  sequence: number
  packageCode: string
  procedureName: string
  ratePercent: number
  baseAmount: number
  amount: number
}

/**
 * A filled "Fixed Package Form" — the per-patient fixed-rate billing instance
 * used for cashless insurance claims, modelled on the hospital's paper form.
 * The package *definitions* live in PackageMaster; this is one case's bill.
 */
export interface FixedPackageBill {
  id: string // e.g. "FP-00001"
  /** The insurance case (ComprehensiveClaimRecord.id) this bill belongs to. */
  caseId?: string
  patientName: string
  panNo?: string
  idNo?: string // member / policy id
  insuranceCompany: string
  claimNo: string
  admissionDate?: string
  dischargeDate?: string
  /** Primary package shown at the top of the form. */
  packageCode: string
  procedureName: string
  packagePrice: number // base price of the primary package, before GST
  gstRate: number
  surgeries: FixedPackageSurgeryLine[]
  packageSubtotal: number // sum of surgery amounts
  gstAmount: number
  totalAmount: number // packageSubtotal + gstAmount
  creditBillingSignedBy?: string
  creditBillingDate?: string
  /** Uploaded/pasted signature image, as a data URL. */
  creditBillingSignatureImg?: string
  patientSignedBy?: string
  patientSignedDate?: string
  /** Uploaded/pasted signature image, as a data URL. */
  patientSignatureImg?: string
  status: "Draft" | "Verified" | "Submitted"
  createdAt: string
  updatedAt: string
}

export interface InsuranceCompanyConfig {
  id: string
  companyName: string
  companyCode: string
  tpaName?: string
  contactPhone: string
  contactEmail: string
  preAuthEmail: string
  claimsEmail: string
  networkStatus: "Empaneled / In-Network" | "Non-Network" | "Preferred Provider"
  integrationType?: "Portal" | "API" | "Email" | "Manual"
  preAuthFormTemplate?: string
  preAuthFormCode?: string
  preAuthFormDocumentName?: string
  preAuthPdfDataUrl?: string
  preAuthPageCount?: number
  portalUrl?: string
  documentRequirements: string[]
  slaDaysForPreAuth: number
  slaDaysForClaimSettlement: number
  alertThresholdPct?: number
  status: "Active" | "Inactive"
}

export interface TpaConfig {
  id: string
  name: string
  code: string
  contactPhone: string
  email: string
  portalUrl?: string
  integrationType: "Portal" | "API" | "Email" | "Manual"
  insurerIds: string[]
  slaDaysForPreAuth: number
  status: "Active" | "Inactive"
}

export interface PricingRuleSet {
  id: string
  name: string
  category: string
  rules: SurgeryPricingRule[]
  status: "Active" | "Inactive"
}

export type DocumentStage = "Pre-Auth" | "Discharge" | "Query" | "Settlement"

export interface DocumentRule {
  id: string
  documentType: string
  category: DocumentCategory
  stage: DocumentStage
  mandatory: boolean
  /** Empty = every encounter type. */
  encounterTypes: ClaimEncounterType[]
  /** Empty = every insurer. */
  insurerIds: string[]
  status: "Active" | "Inactive"
}

/** A policy on the patient's record; a patient can hold several. */
export interface PatientPolicy {
  id: string
  patientId: string
  patientName: string
  insurerId: string
  insurerName: string
  tpaName?: string
  policyNumber: string
  memberId: string
  policyHolderName: string
  relationship: PolicyRelationship
  validUntil: string
  sumInsured: number
  balanceAvailable: number
  copayPercentage: number
  status: "Active" | "Inactive"
  lastVerification?: { status: EligibilityOutcome ;at: string ;by: string ;balanceAvailable: number ;inNetwork: boolean }
  createdAt: string
}

/** A procedure the OT scheduled for this encounter, offered to the pre-auth. */
export interface ProcedureLink {
  packageCode: string
  procedureName: string
  surgeon?: string
  scheduledAt?: string
  source: "OT" | "Doctor" | "Insurance Desk"
  linkedAt: string
}

export type MailPurpose = "Eligibility" | "Pre-Auth" | "Enhancement" | "Claim" | "Query Response" | "General"

/** An email exchanged with the insurer / TPA, kept on the case. */
export interface MailRecord {
  id: string
  direction: "out" | "in"
  purpose: MailPurpose
  at: string
  from: string
  to: string
  cc?: string
  subject: string
  body: string
  attachments: string[]
  by: string
  queryId?: string
}

export interface DischargeReadiness {
  ready: boolean
  items: { key: string ;label: string ;ok: boolean ;detail?: string }[]
  missingDocuments: string[]
}

export interface ClaimDeductionReason {
  id: string
  category:
    | "Non-Payable Consumables"
    | "Room Rent Capping"
    | "Co-pay Deduction"
    | "Unapproved Excess"
    | "Package Difference"
    | "Other"
  amount: number
  remark: string
}

export type ReconciliationStatus =
  | "Expected"
  | "Partially Received"
  | "Received"
  | "Short Payment"
  | "Unmatched"
  | "Reconciled"

export interface ClaimSettlementRecord {
  id: string
  claimId: string
  settlementAdviceNo: string
  approvedAmount: number
  deductionsAmount: number
  deductionReasons: ClaimDeductionReason[]
  expectedAmount: number
  expectedBy?: string
  receivedAmount: number
  netSettlementAmount: number
  paymentReferenceNo: string
  bankReference?: string
  paymentDate: string
  bankAccountName: string
  reconciliationStatus: ReconciliationStatus
  reconciledAt?: string
  reconciledBy?: string
}

export interface AuditTrailLog {
  id: string
  timestamp: string
  user: string
  role: string
  action: string
  oldStatus?: string
  newStatus?: string
  comments?: string
  device?: string
}

export interface ComprehensiveClaimRecord {
  id: string // insurance claim no, e.g. "CLM-2026-8923"
  billingClaimId: string // the bill this case is claimed against; "" until billing raises one for the encounter
  invoiceNo: string
  encounterId: string
  patientId: string
  patientName: string
  mrn: string
  age: number
  gender: string
  phone: string
  encounterType: ClaimEncounterType
  department: string
  attendingDoctor?: string
  carePathway?: string
  dateOfService: string
  admissionDate?: string
  dischargeDate?: string

  /** Captured quickly (ER) with the minimum details; the rest is completed later. */
  quickCapture?: boolean
  procedureLinks?: ProcedureLink[]
  /** Email correspondence with the insurer / TPA, newest last. */
  mails?: MailRecord[]

  policy: InsurancePolicyDetails
  eligibility?: EligibilityResult
  preAuth?: PreAuthRequest

  // Financials, refreshed from the IP bill on every read.
  totalHospitalBill: number
  packageBaseAmount: number
  approvedPreAuthAmount: number
  consumedBillAmount: number
  nonPayableAmount: number
  patientShareAmount: number
  finalClaimAmount: number
  approvedClaimAmount?: number

  status: InsuranceClaimStatus
  documents: DocumentChecklistItem[]
  queries: ClaimQuery[]
  settlement?: ClaimSettlementRecord
  auditTrail: AuditTrailLog[]

  createdAt: string
  updatedAt: string
}
