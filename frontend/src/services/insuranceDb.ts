// Enterprise Hospital Management System (HMS) - Insurance Engine
//
// One engine for every admitted, insured encounter (IP / ICU / OT / admitted
// ER). A case is opened from the encounter's IP bill and stays linked to it:
// eligibility -> pre-auth -> treatment -> discharge -> final claim -> queries
// -> adjudication -> settlement -> reconciliation -> closed. Each step is a
// validated state transition, is written to the audit trail, and is mirrored
// onto the IP bill through BillingDatabase so Billing always agrees.

import { INSURANCE_PERMISSIONS, insuranceCan, type InsurancePermission } from "./roleDb"
import {
  BillingDatabase,
  isCashlessEligible,
  type ClaimRecord,
} from "./billingDb"
import type {
  AuditTrailLog,
  ClaimDeductionReason,
  ClaimQuery,
  ClaimEncounterType,
  ComprehensiveClaimRecord,
  DischargeReadiness,
  DocumentCategory,
  DocumentChecklistItem,
  DocumentRule,
  EligibilityResult,
  FixedPackageBill,
  MailPurpose,
  MailRecord,
  InsuranceClaimStatus,
  InsuranceCompanyConfig,
  InsurancePolicyDetails,
  PackageMaster,
  PatientPolicy,
  PreAuthProcedureLine,
  PreAuthRequest,
  PricingRuleSet,
  ProcedureLink,
  TpaConfig,
} from "../types/insurance"

export type { AuditTrailLog }

const STORAGE_KEY_INSURERS = "hospai_insurance_companies_v1"
const STORAGE_KEY_PACKAGES = "hospai_insurance_packages_v1"
const STORAGE_KEY_FIXED_PACKAGE_BILLS = "hospai_insurance_fixed_package_bills_v1"
const STORAGE_KEY_TPAS = "hospai_insurance_tpas_v1"
const STORAGE_KEY_RULESETS = "hospai_insurance_pricing_rules_v1"
const STORAGE_KEY_DOCRULES = "hospai_insurance_document_rules_v1"
const STORAGE_KEY_POLICIES = "hospai_patient_policies_v1"

const BROADCAST_CHANNEL_NAME = "hospai_insurance_engine_sync"
const broadcastChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    : null

// Default 30+ Insurance Companies & TPAs Master Seed
const SEED_INSURERS: InsuranceCompanyConfig[] = [
  {
    id: "INS-000",
    companyName: "Good Health Insurance TPA Limited",
    companyCode: "GHPL-TPA",
    tpaName: "Good Health TPA (GHPL)",
    contactPhone: "+91 1860 425 3232",
    contactEmail: "info@ghpltpa.com",
    preAuthEmail: "preauth@ghpltpa.com",
    claimsEmail: "claims@ghpltpa.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "good_health_tpa",
    preAuthFormCode: "GHPL/CASHLESS/V2.4",
    preAuthFormDocumentName: "Good_Health_TPA_PreAuth_Form_4Pages.pdf",
    portalUrl: "https://www.goodhealthtpa.com",
    documentRequirements: ["Insurance Card", "Patient Govt ID", "Doctor Initial Notes", "USG / Investigation Reports", "Tariff Breakdown", "Discharge Summary", "Final Itemized Bill"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-001",
    companyName: "Care Health Insurance (Religare)",
    companyCode: "CARE-HLTH",
    tpaName: "Medi Assist TPA / Direct",
    contactPhone: "+91 1800 102 4455",
    contactEmail: "customerfirst@careinsurance.com",
    preAuthEmail: "preauth.cashless@careinsurance.com",
    claimsEmail: "claims@careinsurance.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "care_health",
    preAuthFormCode: "CHI/CASHLESS/V4.2",
    preAuthFormDocumentName: "Care_Health_PreAuth_Form.pdf",
    documentRequirements: ["Insurance Card", "Patient Govt ID", "Doctor Initial Notes", "USG / Investigation Reports", "Tariff Breakdown", "Discharge Summary", "Final Itemized Bill"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-002",
    companyName: "Star Health & Allied Insurance",
    companyCode: "STAR-HLTH",
    tpaName: "Star Health In-House TPA",
    contactPhone: "+91 1800 425 2255",
    contactEmail: "claims@starhealth.in",
    preAuthEmail: "preauth@starhealth.in",
    claimsEmail: "settlements@starhealth.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "star_health",
    preAuthFormCode: "STAR/PREAUTH/2026",
    documentRequirements: ["Insurance Card", "Patient Govt ID", "Doctor Initial Notes", "Diagnosis & ICP", "Cost Estimate Sheet", "Discharge Summary", "Final Itemized Bill"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-003",
    companyName: "HDFC ERGO General Insurance",
    companyCode: "HDFC-ERGO",
    tpaName: "FHPL (Family Health Plan TPA)",
    contactPhone: "+91 1800 266 6000",
    contactEmail: "care@hdfcergo.com",
    preAuthEmail: "cashless@fhpl.net",
    claimsEmail: "claims@hdfcergo.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "hdfc_fhpl",
    preAuthFormCode: "HDFC-FHPL/PA-01",
    documentRequirements: ["Insurance Card", "Aadhaar Card", "Doctor Clinical Summary", "Investigation Reports", "Package Rate Agreement", "Discharge Summary", "Pharmacy Prescriptions"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 10,
    status: "Active",
  },
  {
    id: "INS-004",
    companyName: "ICICI Lombard General Insurance",
    companyCode: "ICICI-LOMB",
    tpaName: "Medi Assist TPA",
    contactPhone: "+91 1800 2666",
    contactEmail: "ihealth@icicilombard.com",
    preAuthEmail: "cashless@mediassist.in",
    claimsEmail: "claims@mediassist.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "medi_assist",
    preAuthFormCode: "MATPA/CASHLESS/V3",
    documentRequirements: ["Insurance Card", "ID Proof", "Clinical Notes", "Investigation Reports", "Discharge Summary"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 15,
    status: "Active",
  },
  {
    id: "INS-005",
    companyName: "PM-JAY (Ayushman Bharat)",
    companyCode: "PM-JAY",
    tpaName: "State Health Agency (SHA)",
    contactPhone: "+91 14555",
    contactEmail: "ayushman@pmjay.gov.in",
    preAuthEmail: "preauth.pmjay@gov.in",
    claimsEmail: "claims.pmjay@gov.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "pmjay_tms",
    preAuthFormCode: "PMJAY/TMS/HBP-2.2",
    documentRequirements: ["Ayushman Golden Card", "Ration Card / ID Proof", "Biometric Verification Slip", "Doctor OPD Note", "Pre-Op & Post-Op Photos", "Discharge Summary"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 7,
    status: "Active",
  },
  {
    id: "INS-006",
    companyName: "Bajaj Allianz General Insurance",
    companyCode: "BAJAJ-ALLZ",
    tpaName: "BAGIC Health Administration TPA",
    contactPhone: "+91 1800 209 5858",
    contactEmail: "bagichelp@bajajallianz.co.in",
    preAuthEmail: "preauth.health@bajajallianz.co.in",
    claimsEmail: "claims.health@bajajallianz.co.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "IRDAI/BAGIC/2026",
    documentRequirements: ["Health Card", "Photo ID", "Doctor Prescription", "Lab Investigations", "Tariff Summary"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 12,
    status: "Active",
  },
  {
    id: "INS-007",
    companyName: "Niva Bupa Health Insurance (Max Bupa)",
    companyCode: "NIVA-BUPA",
    tpaName: "Niva Bupa In-House Desk",
    contactPhone: "+91 1860 500 8888",
    contactEmail: "customercare@nivabupa.com",
    preAuthEmail: "preauth@nivabupa.com",
    claimsEmail: "claims@nivabupa.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "IRDAI/NIVA/2026",
    documentRequirements: ["Policy Card", "Govt ID", "Doctor Notes", "Hospital Estimate", "Discharge Summary"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 10,
    status: "Active",
  },
  {
    id: "INS-008",
    companyName: "Tata AIG General Insurance",
    companyCode: "TATA-AIG",
    tpaName: "Medi Assist TPA / Vidal Health",
    contactPhone: "+91 1800 266 7780",
    contactEmail: "customersupport@tataaig.com",
    preAuthEmail: "cashless@tataaig.com",
    claimsEmail: "healthclaims@tataaig.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "medi_assist",
    preAuthFormCode: "TATA-AIG/MATPA/2026",
    documentRequirements: ["Insurance Card", "KYC ID", "Medical Case Sheet", "Diagnostic Reports"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-009",
    companyName: "The New India Assurance Co. Ltd",
    companyCode: "NEW-INDIA",
    tpaName: "MDIndia Health Insurance TPA",
    contactPhone: "+91 1800 209 1415",
    contactEmail: "tech.support@newindia.co.in",
    preAuthEmail: "preauth@mdindia.com",
    claimsEmail: "claims@newindia.co.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "IRDAI/PSU/NIA-01",
    documentRequirements: ["TPA Card", "Aadhaar Card", "Doctor Note", "ICP & Vitals Sheet", "Discharge Summary"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 21,
    status: "Active",
  },
  {
    id: "INS-010",
    companyName: "United India Insurance Co. Ltd",
    companyCode: "UNITED-IND",
    tpaName: "Vidal Health TPA",
    contactPhone: "+91 1800 425 33333",
    contactEmail: "customercare@uiic.co.in",
    preAuthEmail: "preauth@vidalhealthtpa.com",
    claimsEmail: "claims@uiic.co.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "IRDAI/PSU/UIIC-01",
    documentRequirements: ["Insurance Card", "ID Proof", "Doctor Note", "Reports", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 21,
    status: "Active",
  },
  {
    id: "INS-011",
    companyName: "National Insurance Company Ltd",
    companyCode: "NAT-INS",
    tpaName: "Heritage Health TPA",
    contactPhone: "+91 1800 345 0330",
    contactEmail: "customer.relation@nic.co.in",
    preAuthEmail: "preauth@heritagehealthtpa.com",
    claimsEmail: "claims@nic.co.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "IRDAI/PSU/NIC-01",
    documentRequirements: ["Policy Card", "ID", "Case Sheet", "Discharge Summary"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 21,
    status: "Active",
  },
  {
    id: "INS-012",
    companyName: "The Oriental Insurance Company Ltd",
    companyCode: "ORIENTAL",
    tpaName: "Raksha Health Insurance TPA",
    contactPhone: "+91 1800 118 485",
    contactEmail: "csd@orientalinsurance.co.in",
    preAuthEmail: "preauth@rakshatpa.com",
    claimsEmail: "claims@orientalinsurance.co.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "IRDAI/PSU/OIC-01",
    documentRequirements: ["Insurance Card", "ID", "Doctor Note", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 21,
    status: "Active",
  },
  {
    id: "INS-013",
    companyName: "Aditya Birla Health Insurance",
    companyCode: "AB-HLTH",
    tpaName: "Aditya Birla In-House TPA",
    contactPhone: "+91 1800 270 7000",
    contactEmail: "care.healthinsurance@adityabirlacapital.com",
    preAuthEmail: "preauth.health@adityabirlacapital.com",
    claimsEmail: "claims.health@adityabirlacapital.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "ABHI/PREAUTH/2026",
    documentRequirements: ["Policy Card", "Aadhaar Card", "Prescription", "Investigations"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 12,
    status: "Active",
  },
  {
    id: "INS-014",
    companyName: "ManipalCigna Health Insurance",
    companyCode: "MANIPAL-CIGNA",
    tpaName: "ManipalCigna In-House Desk",
    contactPhone: "+91 1800 102 4462",
    contactEmail: "customercare@manipalcigna.com",
    preAuthEmail: "preauth@manipalcigna.com",
    claimsEmail: "claims@manipalcigna.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "MCIGNA/PA/2026",
    documentRequirements: ["Insurance Card", "ID Proof", "Doctor Notes", "Estimate Sheet"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 12,
    status: "Active",
  },
  {
    id: "INS-015",
    companyName: "SBI General Insurance",
    companyCode: "SBI-GEN",
    tpaName: "Medi Assist TPA / FHPL",
    contactPhone: "+91 1800 22 1111",
    contactEmail: "customer.care@sbigeneral.in",
    preAuthEmail: "preauth@sbigeneral.in",
    claimsEmail: "claims@sbigeneral.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "medi_assist",
    preAuthFormCode: "SBI-GEN/MATPA/2026",
    documentRequirements: ["Health Card", "ID", "Case Record", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 15,
    status: "Active",
  },
  {
    id: "INS-016",
    companyName: "Reliance General Insurance",
    companyCode: "REL-GEN",
    tpaName: "Reliance Health Administration TPA",
    contactPhone: "+91 1800 3009",
    contactEmail: "services.rgicl@relianceada.com",
    preAuthEmail: "rgicl.preauth@relianceada.com",
    claimsEmail: "rgicl.claims@relianceada.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "RGICL/PA/2026",
    documentRequirements: ["Card", "ID Proof", "Doctor Certificate", "Discharge Summary"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-017",
    companyName: "Royal Sundaram General Insurance",
    companyCode: "ROYAL-SUN",
    tpaName: "FHPL / Medi Assist",
    contactPhone: "+91 1860 425 0000",
    contactEmail: "customer.services@royalsundaram.in",
    preAuthEmail: "preauth@royalsundaram.in",
    claimsEmail: "claims@royalsundaram.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "hdfc_fhpl",
    preAuthFormCode: "RSGI/PA/2026",
    documentRequirements: ["Card", "ID", "Clinical Note", "Reports"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-018",
    companyName: "Cholamandalam MS General Insurance",
    companyCode: "CHOLA-MS",
    tpaName: "Chola MS In-House Desk",
    contactPhone: "+91 1800 208 5544",
    contactEmail: "customercare@cholams.murugappa.com",
    preAuthEmail: "preauth@cholams.murugappa.com",
    claimsEmail: "claims@cholams.murugappa.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "CHOLA/PA/2026",
    documentRequirements: ["Health Card", "ID", "Case History", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-019",
    companyName: "Future Generali India Insurance",
    companyCode: "FUTURE-GEN",
    tpaName: "Health Insurance TPA of India",
    contactPhone: "+91 1800 220 233",
    contactEmail: "fgcare@futuregenerali.in",
    preAuthEmail: "preauth.health@futuregenerali.in",
    claimsEmail: "claims@futuregenerali.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "FG/PA/2026",
    documentRequirements: ["Card", "Govt ID", "Doctor Note", "Reports"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-020",
    companyName: "Universal Sompo General Insurance",
    companyCode: "UNIV-SOMPO",
    tpaName: "Paramount Health TPA",
    contactPhone: "+91 1800 22 4030",
    contactEmail: "contactus@universalsompo.com",
    preAuthEmail: "preauth@universalsompo.com",
    claimsEmail: "claims@universalsompo.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "USGI/PA/2026",
    documentRequirements: ["Policy Card", "ID", "Case Sheet", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 15,
    status: "Active",
  },
  {
    id: "INS-021",
    companyName: "IFFCO Tokio General Insurance",
    companyCode: "IFFCO-TOKIO",
    tpaName: "MDIndia Health TPA",
    contactPhone: "+91 1800 103 5499",
    contactEmail: "websupport@iffcotokio.co.in",
    preAuthEmail: "preauth@iffcotokio.co.in",
    claimsEmail: "claims@iffcotokio.co.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "ITGI/PA/2026",
    documentRequirements: ["Card", "ID Proof", "Diagnosis Note", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-022",
    companyName: "Go Digit General Insurance",
    companyCode: "GO-DIGIT",
    tpaName: "Digit In-House Cashless Desk",
    contactPhone: "+91 1800 258 5956",
    contactEmail: "hello@godigit.com",
    preAuthEmail: "preauth@godigit.com",
    claimsEmail: "claims@godigit.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "DIGIT/HLTH/2026",
    documentRequirements: ["Health Card", "ID Proof", "Doctor Prescription", "Lab Reports"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 10,
    status: "Active",
  },
  {
    id: "INS-023",
    companyName: "Acko General Insurance",
    companyCode: "ACKO-GEN",
    tpaName: "Acko Direct Cashless Desk",
    contactPhone: "+91 1800 266 2256",
    contactEmail: "hello@acko.com",
    preAuthEmail: "preauth@acko.com",
    claimsEmail: "claims@acko.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "ACKO/HLTH/2026",
    documentRequirements: ["E-Card", "ID Proof", "Prescription", "Investigations"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 10,
    status: "Active",
  },
  {
    id: "INS-024",
    companyName: "Navi General Insurance",
    companyCode: "NAVI-GEN",
    tpaName: "Navi Cashless In-House",
    contactPhone: "+91 1800 123 0004",
    contactEmail: "insurance.help@navi.com",
    preAuthEmail: "preauth@navi.com",
    claimsEmail: "claims@navi.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "NAVI/HLTH/2026",
    documentRequirements: ["Card", "ID Proof", "Doctor Note", "Estimate"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 12,
    status: "Active",
  },
  {
    id: "INS-025",
    companyName: "Kotak Mahindra General Insurance",
    companyCode: "KOTAK-GEN",
    tpaName: "Medi Assist TPA",
    contactPhone: "+91 1800 266 4545",
    contactEmail: "care@kotak.com",
    preAuthEmail: "cashless@mediassist.in",
    claimsEmail: "claims@kotak.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "medi_assist",
    preAuthFormCode: "KOTAK-MATPA/2026",
    documentRequirements: ["Card", "ID", "Case Sheet", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 14,
    status: "Active",
  },
  {
    id: "INS-026",
    companyName: "Magma HDI General Insurance",
    companyCode: "MAGMA-HDI",
    tpaName: "FHPL TPA",
    contactPhone: "+91 1800 266 3202",
    contactEmail: "customercare@magma-hdi.co.in",
    preAuthEmail: "cashless@fhpl.net",
    claimsEmail: "claims@magma-hdi.co.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "hdfc_fhpl",
    preAuthFormCode: "MAGMA-FHPL/2026",
    documentRequirements: ["Card", "ID", "Doctor Note", "Reports"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 15,
    status: "Active",
  },
  {
    id: "INS-027",
    companyName: "Liberty General Insurance",
    companyCode: "LIBERTY-GEN",
    tpaName: "Vidal Health TPA",
    contactPhone: "+91 1800 266 5844",
    contactEmail: "care@libertyinsurance.in",
    preAuthEmail: "preauth@vidalhealthtpa.com",
    claimsEmail: "claims@libertyinsurance.in",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "LIBERTY/PA/2026",
    documentRequirements: ["Card", "ID Proof", "Doctor Sheet", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 15,
    status: "Active",
  },
  {
    id: "INS-028",
    companyName: "Shriram General Insurance",
    companyCode: "SHRIRAM-GEN",
    tpaName: "Heritage Health TPA",
    contactPhone: "+91 1800 300 30000",
    contactEmail: "customercare@shriramgi.com",
    preAuthEmail: "preauth@heritagehealthtpa.com",
    claimsEmail: "claims@shriramgi.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "SHRIRAM/PA/2026",
    documentRequirements: ["Card", "ID", "Case Sheet", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 15,
    status: "Active",
  },
  {
    id: "INS-029",
    companyName: "Zuno General Insurance (Edelweiss)",
    companyCode: "ZUNO-GEN",
    tpaName: "Zuno In-House Desk",
    contactPhone: "+91 1800 120 00",
    contactEmail: "support@hellomoto.com",
    preAuthEmail: "preauth@zunogi.com",
    claimsEmail: "claims@zunogi.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "ZUNO/HLTH/2026",
    documentRequirements: ["Card", "ID Proof", "Doctor Note", "Reports"],
    slaDaysForPreAuth: 1,
    slaDaysForClaimSettlement: 12,
    status: "Active",
  },
  {
    id: "INS-030",
    companyName: "Raheja QBE General Insurance",
    companyCode: "RAHEJA-QBE",
    tpaName: "Paramount Health TPA",
    contactPhone: "+91 1800 102 7723",
    contactEmail: "customercare@rahejaqbe.com",
    preAuthEmail: "preauth@paramounttpa.com",
    claimsEmail: "claims@rahejaqbe.com",
    networkStatus: "Empaneled / In-Network",
    preAuthFormTemplate: "irdai_standard",
    preAuthFormCode: "RQBE/PA/2026",
    documentRequirements: ["Card", "ID", "Clinical Note", "Bill"],
    slaDaysForPreAuth: 2,
    slaDaysForClaimSettlement: 15,
    status: "Active",
  },
]

// Default Packages Master Seed (Includes Procedure B-11 Appendectomy)
const SEED_PACKAGES: PackageMaster[] = [
  {
    id: "PKG-B11",
    code: "B-11",
    procedureName: "Laparoscopic Appendectomy",
    basePrice: 32700,
    applicableGstRate: 5,
    department: "General Surgery",
    includedComponents: ["Surgeon", "OT", "Room", "Nursing", "Investigations", "Pharmacy"],
    excludedComponents: ["Implants", "HighCostDrugs"],
    pricingRules: [
      { sequenceOrder: 1, discountPercentage: 100, description: "1st Surgery -> 100% of Base Package Rate" },
      { sequenceOrder: 2, discountPercentage: 50, description: "2nd Surgery -> 50% of Base Package Rate" },
      { sequenceOrder: 3, discountPercentage: 25, description: "3rd Surgery & Subsequent -> 25% of Base Package Rate" },
    ],
    effectiveDate: "2026-01-01",
    status: "Active",
  },
  {
    id: "PKG-C04",
    code: "C-04",
    procedureName: "Laparoscopic Cholecystectomy",
    basePrice: 42500,
    applicableGstRate: 5,
    department: "General Surgery",
    includedComponents: ["Surgeon", "OT", "Room", "Nursing", "Investigations", "Pharmacy"],
    excludedComponents: ["Implants"],
    pricingRules: [
      { sequenceOrder: 1, discountPercentage: 100, description: "1st Surgery -> 100%" },
      { sequenceOrder: 2, discountPercentage: 50, description: "2nd Surgery -> 50%" },
      { sequenceOrder: 3, discountPercentage: 25, description: "3rd Surgery -> 25%" },
    ],
    effectiveDate: "2026-01-01",
    status: "Active",
  },
  {
    id: "PKG-H02",
    code: "H-02",
    procedureName: "Inguinal Hernia Mesh Repair",
    basePrice: 38000,
    applicableGstRate: 5,
    department: "General Surgery",
    includedComponents: ["Surgeon", "OT", "Room", "Nursing"],
    excludedComponents: ["Implants", "HighCostDrugs"],
    pricingRules: [
      { sequenceOrder: 1, discountPercentage: 100, description: "1st Surgery -> 100%" },
      { sequenceOrder: 2, discountPercentage: 50, description: "2nd Surgery -> 50%" },
    ],
    effectiveDate: "2026-01-01",
    status: "Active",
  },
];


// ── State machine ───────────────────────────────────────────────────────────
//
// Every status change goes through `move`, which refuses transitions that are
// not listed here. Billing-driven advances (the IP counter handing over the
// final bill) are the one exception and are logged as such.

export const INSURANCE_TRANSITIONS: Record<InsuranceClaimStatus, InsuranceClaimStatus[]> = {
  DRAFT: ["ELIGIBILITY_PENDING", "PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "PREAUTH_APPROVED"],
  ELIGIBILITY_PENDING: ["ELIGIBLE", "NOT_ELIGIBLE", "PREAUTH_SUBMITTED", "PREAUTH_APPROVED"],
  NOT_ELIGIBLE: ["ELIGIBILITY_PENDING"],
  ELIGIBLE: ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS"],
  PREAUTH_DRAFT: ["PREAUTH_SUBMITTED", "PREAUTH_APPROVED"],
  PREAUTH_SUBMITTED: ["PREAUTH_UNDER_REVIEW", "PREAUTH_APPROVED", "PREAUTH_QUERY", "PREAUTH_REJECTED"],
  PREAUTH_UNDER_REVIEW: ["PREAUTH_APPROVED", "PREAUTH_QUERY", "PREAUTH_REJECTED"],
  PREAUTH_QUERY: ["PREAUTH_UNDER_REVIEW", "PREAUTH_APPROVED", "PREAUTH_REJECTED"],
  PREAUTH_REJECTED: ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "PREAUTH_APPROVED"],
  PREAUTH_APPROVED: ["TREATMENT_IN_PROGRESS"],
  TREATMENT_IN_PROGRESS: ["DISCHARGE_INITIATED"],
  DISCHARGE_INITIATED: ["FINAL_BILL_READY"],
  FINAL_BILL_READY: ["CLAIM_SUBMITTED"],
  CLAIM_SUBMITTED: ["CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "PREAUTH_APPROVED"],
  CLAIM_QUERY_RAISED: ["CLAIM_SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED"],
  APPROVED: ["SETTLEMENT_PENDING"],
  PARTIALLY_APPROVED: ["SETTLEMENT_PENDING"],
  REJECTED: ["CLAIM_SUBMITTED"],
  SETTLEMENT_PENDING: ["PAYMENT_RECEIVED"],
  PAYMENT_RECEIVED: ["RECONCILED"],
  RECONCILED: ["CLOSED"],
  CLOSED: [],
}

export type StageGroup = "Eligibility" | "Pre-Auth" | "Treatment" | "Claim" | "Settlement" | "Closed"

export const STATUS_META: Record<
  InsuranceClaimStatus,
  { label: string; group: StageGroup; tone: "slate" | "blue" | "amber" | "violet" | "rose" | "emerald" | "sky" }
> = {
  DRAFT: { label: "Draft", group: "Eligibility", tone: "slate" },
  ELIGIBILITY_PENDING: { label: "Eligibility pending", group: "Eligibility", tone: "amber" },
  ELIGIBLE: { label: "Eligible", group: "Eligibility", tone: "blue" },
  NOT_ELIGIBLE: { label: "Not eligible", group: "Eligibility", tone: "rose" },
  PREAUTH_DRAFT: { label: "Pre-auth draft", group: "Pre-Auth", tone: "slate" },
  PREAUTH_SUBMITTED: { label: "Pre-auth submitted", group: "Pre-Auth", tone: "sky" },
  PREAUTH_UNDER_REVIEW: { label: "Pre-auth under review", group: "Pre-Auth", tone: "sky" },
  PREAUTH_QUERY: { label: "Pre-auth query", group: "Pre-Auth", tone: "amber" },
  PREAUTH_APPROVED: { label: "Pre-auth approved", group: "Pre-Auth", tone: "emerald" },
  PREAUTH_REJECTED: { label: "Pre-auth rejected", group: "Pre-Auth", tone: "rose" },
  TREATMENT_IN_PROGRESS: { label: "In treatment", group: "Treatment", tone: "blue" },
  DISCHARGE_INITIATED: { label: "Discharge initiated", group: "Treatment", tone: "violet" },
  FINAL_BILL_READY: { label: "Claim ready", group: "Claim", tone: "blue" },
  CLAIM_SUBMITTED: { label: "Under review", group: "Claim", tone: "sky" },
  CLAIM_QUERY_RAISED: { label: "Claim query", group: "Claim", tone: "amber" },
  APPROVED: { label: "Approved", group: "Claim", tone: "emerald" },
  PARTIALLY_APPROVED: { label: "Partially approved", group: "Claim", tone: "violet" },
  REJECTED: { label: "Rejected", group: "Claim", tone: "rose" },
  SETTLEMENT_PENDING: { label: "Settlement pending", group: "Settlement", tone: "violet" },
  PAYMENT_RECEIVED: { label: "Payment received", group: "Settlement", tone: "emerald" },
  RECONCILED: { label: "Reconciled", group: "Settlement", tone: "emerald" },
  CLOSED: { label: "Closed", group: "Closed", tone: "slate" },
}

/** CLM-<year>-<bill number>; newer bill ids already carry the year, so it is not repeated. */
function caseIdFor(b: ClaimRecord): string {
  const year = String(new Date(b.createdAt || b.dateOfService || Date.now()).getFullYear())
  let digits = b.id.replace(/\D/g, "")
  if (digits.length >= 8 && digits.startsWith(year)) digits = digits.slice(4)
  return `CLM-${year}-${digits.padStart(4, "0")}`
}

/** The 11-step journey shown on the claim timeline. */
export const JOURNEY: { key: string; label: string; reached: InsuranceClaimStatus[] }[] = [
  { key: "admitted", label: "Patient admitted", reached: Object.keys(STATUS_META) as InsuranceClaimStatus[] },
  { key: "eligible", label: "Eligibility verified", reached: ["ELIGIBLE", "PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "PREAUTH_UNDER_REVIEW", "PREAUTH_QUERY", "PREAUTH_APPROVED", "PREAUTH_REJECTED", "TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "pa-sub", label: "Pre-auth submitted", reached: ["PREAUTH_SUBMITTED", "PREAUTH_UNDER_REVIEW", "PREAUTH_QUERY", "PREAUTH_APPROVED", "PREAUTH_REJECTED", "TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "pa-ok", label: "Pre-auth approved", reached: ["PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "treat", label: "Treatment", reached: ["TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "dis", label: "Discharge", reached: ["DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "claim-sub", label: "Final claim submitted", reached: ["CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "claim-ok", label: "Claim approved", reached: ["APPROVED", "PARTIALLY_APPROVED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "paid", label: "Payment received", reached: ["PAYMENT_RECEIVED", "RECONCILED", "CLOSED"] },
  { key: "recon", label: "Reconciled", reached: ["RECONCILED", "CLOSED"] },
  { key: "closed", label: "Claim closed", reached: ["CLOSED"] },
]

// ── Documents ───────────────────────────────────────────────────────────────

const DISCHARGE_DOCS: { type: string; mandatory: boolean; category: DocumentCategory }[] = [
  { type: "Discharge Summary", mandatory: true, category: "Discharge" },
  { type: "Final Itemised Bill", mandatory: true, category: "Billing" },
  { type: "Doctor Notes", mandatory: true, category: "Clinical" },
  { type: "Procedure / Operative Notes", mandatory: true, category: "Clinical" },
  { type: "Investigation Reports", mandatory: true, category: "Clinical" },
  { type: "Pharmacy Details", mandatory: true, category: "Billing" },
  { type: "Implant Details & Stickers", mandatory: false, category: "Clinical" },
  { type: "Pre-Auth Approval Letter", mandatory: true, category: "Pre-Auth" },
  { type: "Patient Declaration & Consent", mandatory: true, category: "Patient" },
]

const SEED_RULESETS: PricingRuleSet[] = [
  {
    id: "RS-GEN",
    name: "Multiple surgery — standard",
    category: "General Surgery",
    rules: [
      { sequenceOrder: 1, discountPercentage: 100, description: "Primary procedure" },
      { sequenceOrder: 2, discountPercentage: 50, description: "Second procedure, same sitting" },
      { sequenceOrder: 3, discountPercentage: 25, description: "Third and subsequent" },
    ],
    status: "Active",
  },
  {
    id: "RS-ORTHO",
    name: "Bilateral orthopaedic",
    category: "Orthopaedics",
    rules: [
      { sequenceOrder: 1, discountPercentage: 100, description: "First side" },
      { sequenceOrder: 2, discountPercentage: 75, description: "Opposite side, same sitting" },
      { sequenceOrder: 3, discountPercentage: 50, description: "Additional procedure" },
    ],
    status: "Active",
  },
]

const rule = (id: string, documentType: string, category: DocumentCategory, stage: DocumentRule["stage"], mandatory = true, encounterTypes: ClaimEncounterType[] = []): DocumentRule => ({
  id,
  documentType,
  category,
  stage,
  mandatory,
  encounterTypes,
  insurerIds: [],
  status: "Active",
})

/** Hospital-wide document rules; insurer-specific lists on the insurer master are added on top. */
const SEED_DOCRULES: DocumentRule[] = [
  rule("DR-01", "Patient ID Proof (Aadhaar / PAN)", "Patient", "Pre-Auth"),
  rule("DR-02", "Insurance / TPA Card", "Insurance", "Pre-Auth"),
  rule("DR-03", "Doctor's Admission Notes", "Clinical", "Pre-Auth"),
  rule("DR-04", "Cost Estimate Sheet", "Pre-Auth", "Pre-Auth"),
  rule("DR-05", "Emergency / MLC Note", "Clinical", "Pre-Auth", true, ["ER"]),
  rule("DR-06", "Surgeon's Planned Procedure Note", "Clinical", "Pre-Auth", true, ["OT"]),
  ...DISCHARGE_DOCS.map((d, i) => rule(`DR-${String(10 + i)}`, d.type, d.category, "Discharge", d.mandatory, d.type.startsWith("Procedure") ? ["OT", "IP", "ICU"] : [])),
  rule("DR-30", "Query Response Letter", "Query", "Query", false),
  rule("DR-40", "Settlement Advice Copy", "Settlement", "Settlement", false),
]

const doc = (category: DocumentCategory, type: string, mandatory = true): DocumentChecklistItem => ({
  id: `DOC-${Math.random().toString(36).slice(2, 9)}`,
  category,
  documentType: type,
  label: type,
  isMandatory: mandatory,
  isUploaded: false,
  status: "Pending",
  version: 0,
})

/**
 * Insurers word the same document differently ("Insurance Card", "Insurance /
 * TPA Card", "Ayushman Golden Card"). Each requirement is mapped to a canonical
 * key so it is asked for once, to the category it belongs to, and at the stage
 * it can exist: a discharge summary cannot be attached to a pre-auth.
 */
const DOC_RULES: { re: RegExp; key: string; category: DocumentCategory; stage: "preauth" | "discharge" }[] = [
  { re: /insurance.*card|tpa card|golden card|e-?card|health card/i, key: "insurance-card", category: "Insurance", stage: "preauth" },
  { re: /policy copy/i, key: "policy-copy", category: "Insurance", stage: "preauth" },
  { re: /aadhaar|govt id|id proof|ration card|\bpan\b|photo id/i, key: "id-proof", category: "Patient", stage: "preauth" },
  { re: /biometric/i, key: "biometric", category: "Patient", stage: "preauth" },
  { re: /discharge summary/i, key: "discharge-summary", category: "Discharge", stage: "discharge" },
  { re: /final.*bill|itemi[sz]ed bill/i, key: "final-bill", category: "Billing", stage: "discharge" },
  { re: /pharmacy/i, key: "pharmacy", category: "Billing", stage: "discharge" },
  { re: /operative|post-op|ot notes/i, key: "operative-notes", category: "Clinical", stage: "discharge" },
  { re: /implant/i, key: "implant", category: "Clinical", stage: "discharge" },
  { re: /approval letter/i, key: "preauth-approval", category: "Pre-Auth", stage: "discharge" },
  { re: /declaration|consent/i, key: "consent", category: "Patient", stage: "discharge" },
  { re: /investigation|lab report|radiology/i, key: "investigations", category: "Clinical", stage: "preauth" },
  { re: /diagnosis|icp/i, key: "diagnosis", category: "Clinical", stage: "preauth" },
  { re: /doctor|clinical|opd note|notes/i, key: "doctor-notes", category: "Clinical", stage: "preauth" },
  { re: /estimate|package rate/i, key: "cost-estimate", category: "Pre-Auth", stage: "preauth" },
]

export function classifyDocument(type: string) {
  return DOC_RULES.find((r) => r.re.test(type)) ?? { key: type.trim().toLowerCase(), category: "Pre-Auth" as DocumentCategory, stage: "preauth" as const }
}

/** Add a requirement unless an equivalent document is already on the case. */
function requireDoc(c: ComprehensiveClaimRecord, type: string, mandatory = true, category?: DocumentCategory) {
  const k = classifyDocument(type).key
  const existing = c.documents.find((d) => classifyDocument(d.documentType).key === k)
  if (existing) {
    if (mandatory && !existing.isMandatory) existing.isMandatory = true
    return
  }
  c.documents.push(doc(category ?? classifyDocument(type).category, type, mandatory))
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY_CASES = "hospai_insurance_cases_v2"
const listeners = new Set<() => void>()

function whoAmI(): { user: string; role: string } {
  try {
    const u = JSON.parse(localStorage.getItem("hospai_current_user") || "null")
    if (u?.user) return { user: String(u.user), role: String(u.role || "Insurance Desk").replace(/^ROLE_/, "") }
  } catch { }
  return { user: "Insurance Desk", role: "Insurance Desk" }
}

function device(): string {
  if (typeof navigator === "undefined") return ""
  const ua = navigator.userAgent
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS"
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"
  return `${br} · ${os}`
}

const nowIso = () => new Date().toISOString()
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * 86_400_000).toISOString()

function matchInsurer(name: string, insurers: InsuranceCompanyConfig[]): InsuranceCompanyConfig | undefined {
  const key = name.toLowerCase().split(/[\s(]/)[0]
  return insurers.find((i) => i.companyName.toLowerCase().includes(key) || i.companyCode.toLowerCase().includes(key))
}

/** Where an existing IP bill already stands, for a case created from it. */
function statusFromBill(b: ClaimRecord): InsuranceClaimStatus {
  if (b.tpa?.settledAt) return "PAYMENT_RECEIVED"
  if (b.status === "Paid") return "CLOSED"
  if (b.status === "Denied" || b.status === "Rejected") return "REJECTED"
  if (b.status === "Appeal" || b.status === "Submitted") return b.tpa?.queryOpen ? "CLAIM_QUERY_RAISED" : "CLAIM_SUBMITTED"
  if (b.status === "Accepted") return "APPROVED"
  if (b.tpa?.billedAt) return "FINAL_BILL_READY"
  const pa = b.tpa?.preAuthStatus ?? (b.preAuthCode ? "Approved" : "Not Raised")
  if (pa === "Approved") return "TREATMENT_IN_PROGRESS"
  if (pa === "Requested" || pa === "Enhancement Requested") return "PREAUTH_SUBMITTED"
  return "ELIGIBILITY_PENDING"
}

function samePatient(c: ComprehensiveClaimRecord, b: Pick<ClaimRecord, "patientId" | "mrn" | "patientName">): boolean {
  const ids = [c.patientId, c.mrn].filter(Boolean).map((x) => String(x).toLowerCase())
  if (ids.some((x) => x === String(b.patientId || "").toLowerCase() || x === String(b.mrn || "").toLowerCase())) return true
  return !!c.patientName && c.patientName.trim().toLowerCase() === String(b.patientName || "").trim().toLowerCase()
}

export const ENCOUNTER_OF_DEPARTMENT = (dept: string): ClaimEncounterType =>
  dept === "ICU" ? "ICU" : dept === "Surgery" ? "OT" : dept === "Emergency" ? "ER" : dept === "Outpatient" ? "OP" : "IP"

const PRE_FINAL: InsuranceClaimStatus[] = [
  "DRAFT", "ELIGIBILITY_PENDING", "ELIGIBLE", "PREAUTH_DRAFT", "PREAUTH_SUBMITTED",
  "PREAUTH_UNDER_REVIEW", "PREAUTH_QUERY", "PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED",
]

export class InsuranceEngineService {
  private static getItem<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(key)
      return data ? JSON.parse(data) : fallback
    } catch {
      return fallback
    }
  }

  private static setItem<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage quota -- keep working in memory
    }
    // Same tab (BroadcastChannel never delivers to its sender) and other tabs.
    listeners.forEach((l) => l())
    broadcastChannel?.postMessage({ key, timestamp: Date.now() })
  }

  public static subscribe(callback: () => void): () => void {
    listeners.add(callback)
    const handler = () => callback()
    broadcastChannel?.addEventListener("message", handler)
    const unBilling = BillingDatabase.onUpdate(callback)
    return () => {
      listeners.delete(callback)
      broadcastChannel?.removeEventListener("message", handler)
      unBilling()
    }
  }

  /**
   * Mirror an action onto the case's bill. A case captured at admission or
   * in ER may not have a bill yet; the mirror then waits until sync() links one.
   */
  private static billing(c: ComprehensiveClaimRecord): typeof BillingDatabase {
    const id = c.billingClaimId
    return new Proxy(BillingDatabase, {
      get: (t, k) => {
        const v = (t as unknown as Record<string | symbol, unknown>)[k]
        if (typeof v !== "function") return v
        return (_ignored: unknown, ...rest: unknown[]) => (id ? (v as (...a: unknown[]) => unknown).call(t, id, ...rest) : undefined)
      },
    })
  }

  /** Role check for a user action (Admin → Roles decides who holds which insurance.* permission). */
  private static need(perm: InsurancePermission) {
    if (!insuranceCan(perm)) throw new Error(`Your role does not allow this: ${INSURANCE_PERMISSIONS[perm]}.`)
  }

  /** For the UI: hide or disable what the signed-in role may not do. */
  public static can(perm: InsurancePermission): boolean {
    return insuranceCan(perm)
  }

  // ── Masters ──────────────────────────────────────────────────────────────

  public static getInsurers(): InsuranceCompanyConfig[] {
    return this.getItem<InsuranceCompanyConfig[]>(STORAGE_KEY_INSURERS, SEED_INSURERS).map((i) => ({
      integrationType: "Portal",
      alertThresholdPct: 85,
      ...i,
    }))
  }

  public static saveInsurer(config: InsuranceCompanyConfig): void {
    this.need("insurance.master.manage")
    if (!config.companyName.trim() || !config.companyCode.trim()) throw new Error("Company name and code are required.")
    const insurers = this.getInsurers()
    const idx = insurers.findIndex((i) => i.id === config.id)
    if (idx >= 0) insurers[idx] = config
    else insurers.push({ ...config, id: config.id || `INS-${String(insurers.length + 1).padStart(3, "0")}` })
    this.setItem(STORAGE_KEY_INSURERS, insurers)
  }

  public static getPackages(): PackageMaster[] {
    return this.getItem<PackageMaster[]>(STORAGE_KEY_PACKAGES, SEED_PACKAGES)
  }

  public static savePackage(pkg: PackageMaster): void {
    this.need("insurance.master.manage")
    if (!pkg.code.trim() || !pkg.procedureName.trim()) throw new Error("Package code and procedure are required.")
    if (!(pkg.basePrice > 0)) throw new Error("Package price must be greater than zero.")
    const rules = [...pkg.pricingRules].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    const pkgs = this.getPackages()
    const idx = pkgs.findIndex((p) => p.id === pkg.id)
    const clean = { ...pkg, pricingRules: rules, id: pkg.id || `PKG-${pkg.code.replace(/\W/g, "")}` }
    if (idx >= 0) pkgs[idx] = clean
    else {
      if (pkgs.some((p) => p.code.toLowerCase() === pkg.code.toLowerCase())) throw new Error(`Package ${pkg.code} already exists.`)
      pkgs.push(clean)
    }
    this.setItem(STORAGE_KEY_PACKAGES, pkgs)
  }

  // ── Fixed-package billing forms ────────────────────────────────────────────
  // The per-patient filled "Fixed Package Form" (the paper form digitised),
  // distinct from the PackageMaster definitions above. One bill per case.

  public static getFixedPackageBills(): FixedPackageBill[] {
    return this.getItem<FixedPackageBill[]>(STORAGE_KEY_FIXED_PACKAGE_BILLS, [])
  }

  public static getFixedPackageBill(id: string): FixedPackageBill | undefined {
    return this.getFixedPackageBills().find((b) => b.id === id)
  }

  /** The fixed-package bill raised for an insurance case, if any. */
  public static getFixedPackageBillForCase(caseId: string): FixedPackageBill | undefined {
    return this.getFixedPackageBills().find((b) => b.caseId === caseId)
  }

  public static saveFixedPackageBill(bill: FixedPackageBill): FixedPackageBill {
    this.need("insurance.claim.create")
    if (!bill.patientName.trim()) throw new Error("Patient name is required.")
    if (!bill.packageCode.trim()) throw new Error("Select a package.")
    if (!bill.surgeries?.length) throw new Error("Add at least one surgery to the package.")

    const bills = this.getFixedPackageBills()
    const now = new Date().toISOString()
    // Recompute totals so the stored bill can never disagree with its lines.
    const packageSubtotal = bill.surgeries.reduce((a, s) => a + s.amount, 0)
    const gstAmount = Math.round((packageSubtotal * (bill.gstRate || 0)) / 100)
    const clean: FixedPackageBill = {
      ...bill,
      packageSubtotal,
      gstAmount,
      totalAmount: packageSubtotal + gstAmount,
      id: bill.id || this.nextFixedPackageBillId(bills),
      createdAt: bill.createdAt || now,
      updatedAt: now,
    }

    const idx = bills.findIndex((b) => b.id === clean.id)
    if (idx >= 0) bills[idx] = clean
    else bills.push(clean)
    this.setItem(STORAGE_KEY_FIXED_PACKAGE_BILLS, bills)
    return clean
  }

  public static deleteFixedPackageBill(id: string): void {
    this.need("insurance.claim.create")
    this.setItem(STORAGE_KEY_FIXED_PACKAGE_BILLS, this.getFixedPackageBills().filter((b) => b.id !== id))
  }

  private static nextFixedPackageBillId(bills: FixedPackageBill[]): string {
    const max = bills.reduce((m, b) => {
      const n = Number((b.id.match(/FP-(\d+)/) || [])[1])
      return Number.isFinite(n) && n > m ? n : m
    }, 0)
    return `FP-${String(max + 1).padStart(5, "0")}`
  }

  public static getTpas(): TpaConfig[] {
    const stored = this.getItem<TpaConfig[] | null>(STORAGE_KEY_TPAS, null)
    if (stored) return stored
    // First run: one TPA per distinct TPA named on the insurer master.
    const byName = new Map<string, TpaConfig>()
    for (const i of this.getInsurers()) {
      if (!i.tpaName) continue
      const t = byName.get(i.tpaName) ?? {
        id: `TPA-${String(byName.size + 1).padStart(3, "0")}`,
        name: i.tpaName,
        code: i.tpaName.replace(/[^A-Z]/g, "").slice(0, 6) || i.tpaName.slice(0, 4).toUpperCase(),
        contactPhone: i.contactPhone,
        email: i.preAuthEmail,
        integrationType: i.integrationType ?? "Portal",
        insurerIds: [],
        slaDaysForPreAuth: i.slaDaysForPreAuth,
        status: "Active" as const,
      }
      t.insurerIds.push(i.id)
      byName.set(i.tpaName, t)
    }
    return [...byName.values()]
  }

  public static saveTpa(t: TpaConfig): void {
    this.need("insurance.master.manage")
    if (!t.name.trim()) throw new Error("TPA name is required.")
    const all = this.getTpas()
    const idx = all.findIndex((x) => x.id === t.id)
    if (idx < 0 && all.some((x) => x.name.toLowerCase() === t.name.trim().toLowerCase())) throw new Error(`${t.name} already exists.`)
    const clean = { ...t, name: t.name.trim(), id: t.id || `TPA-${String(all.length + 1).padStart(3, "0")}` }
    if (idx >= 0) all[idx] = clean
    else all.push(clean)
    this.setItem(STORAGE_KEY_TPAS, all)
  }

  public static getPricingRuleSets(): PricingRuleSet[] {
    return this.getItem<PricingRuleSet[]>(STORAGE_KEY_RULESETS, SEED_RULESETS)
  }

  public static savePricingRuleSet(rs: PricingRuleSet): void {
    this.need("insurance.master.manage")
    if (!rs.name.trim()) throw new Error("Give the rule set a name.")
    if (!rs.rules?.length) throw new Error("Add at least one sequence rule.")
    const seqs = (rs.rules || []).map((x) => x.sequenceOrder)
    if (new Set(seqs).size !== seqs.length) throw new Error("Each sequence number can appear only once.")
    if (rs.rules.some((x) => x.discountPercentage < 0 || x.discountPercentage > 100)) throw new Error("Rates must be between 0% and 100%.")
    const all = this.getPricingRuleSets()
    const clean = { ...rs, rules: [...rs.rules].sort((a, b) => a.sequenceOrder - b.sequenceOrder), id: rs.id || `RS-${Date.now().toString(36).toUpperCase()}` }
    const idx = all.findIndex((x) => x.id === clean.id)
    if (idx >= 0) all[idx] = clean
    else all.push(clean)
    this.setItem(STORAGE_KEY_RULESETS, all)
  }

  public static getDocumentRules(): DocumentRule[] {
    return this.getItem<DocumentRule[]>(STORAGE_KEY_DOCRULES, SEED_DOCRULES)
  }

  public static saveDocumentRule(d: DocumentRule): void {
    this.need("insurance.master.manage")
    if (!d.documentType.trim()) throw new Error("Enter the document name.")
    const all = this.getDocumentRules()
    const clean = { ...d, documentType: d.documentType.trim(), id: d.id || `DR-${Date.now().toString(36).toUpperCase()}` }
    const idx = all.findIndex((x) => x.id === clean.id)
    if (idx >= 0) all[idx] = clean
    else all.push(clean)
    this.setItem(STORAGE_KEY_DOCRULES, all)
  }

  public static deleteDocumentRule(id: string): void {
    this.need("insurance.master.manage")
    this.setItem(STORAGE_KEY_DOCRULES, this.getDocumentRules().filter((d) => d.id !== id))
  }

  /** Document rules that apply to this case at a stage. */
  public static rulesFor(c: ComprehensiveClaimRecord, stage: DocumentRule["stage"]): DocumentRule[] {
    return this.getDocumentRules().filter(
      (d) =>
        d.status === "Active" &&
        d.stage === stage &&
        (!d.encounterTypes?.length || d.encounterTypes.includes(c.encounterType)) &&
        (!d.insurerIds?.length || d.insurerIds.includes(c.policy.insurerId)),
    )
  }

  /** The multiple-surgery rules a package prices with. */
  public static rulesForPackage(p: PackageMaster) {
    const set = p.pricingRuleSetId ? this.getPricingRuleSets().find((x) => x.id === p.pricingRuleSetId && x.status === "Active") : undefined
    return [...(set?.rules ?? p.pricingRules)].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
  }

  /**
   * Price a set of procedures in surgery order. Each package's own pricing
   * rules apply (sequence 1 -> 100%, 2 -> 50%, 3+ -> 25% by default); a
   * sequence beyond the last rule uses the last rule's rate.
   */
  public static priceProcedures(codes: string[]): PreAuthProcedureLine[] {
    const pkgs = this.getPackages()
    return codes
      .map((code) => pkgs.find((p) => p.code === code))
      .filter((p): p is PackageMaster => !!p)
      .map((p, i) => {
        const seq = i + 1
        const rules = this.rulesForPackage(p)
        const rule = rules.find((r) => r.sequenceOrder === seq) ?? rules[rules.length - 1]
        const pct = rule ? rule.discountPercentage : 100
        return {
          packageCode: p.code,
          procedureName: p.procedureName,
          sequence: seq,
          ratePercent: pct,
          baseAmount: p.basePrice,
          amount: Math.round((p.basePrice * pct) / 100),
        }
      })
  }

  /** Kept for callers of the earlier API. */
  public static calculateMultipleSurgeries(selected: PackageMaster[]) {
    return this.priceProcedures(selected.map((p) => p.code)).map((l, i) => ({
      package: selected[i],
      sequence: l.sequence,
      multiplier: l.ratePercent / 100,
      finalPrice: l.amount,
    }))
  }

  // ── Cases ────────────────────────────────────────────────────────────────

  private static readCases(): ComprehensiveClaimRecord[] {
    const cases = this.getItem<ComprehensiveClaimRecord[]>(STORAGE_KEY_CASES, [])
    cases.forEach((c) => {
      if (!c.auditTrail) c.auditTrail = []
      if (!c.documents) c.documents = []
      if (!c.queries) c.queries = []
      if (!c.mails) c.mails = []
    })
    return cases
  }

  /**
   * Every admitted, insured IP bill has a case; financials are refreshed from
   * the bill; a final bill handed over at the IP counter advances the case.
   */
  private static sync(): ComprehensiveClaimRecord[] {
    const bills = BillingDatabase.getClaims()
    const insurers = this.getInsurers()
    const cases = this.readCases()
    let changed = false

    for (const b of bills) {
      if (!isCashlessEligible(b)) continue
      const insured = !!b.insuranceProvider && b.insuranceProvider !== "Self-Pay"
      let c = cases.find((x) => x.billingClaimId === b.id)
      // A case opened at admission / in ER before any bill existed claims the
      // first open bill raised for that patient.
      if (!c && b.status !== "Paid") {
        const waiting = cases.find((x) => !x.billingClaimId && x.status !== "CLOSED" && samePatient(x, b))
        if (waiting) {
          waiting.billingClaimId = b.id
          waiting.invoiceNo = b.invoiceNo
          waiting.age = waiting.age || b.age
          waiting.gender = waiting.gender || b.gender
          waiting.attendingDoctor = waiting.attendingDoctor || b.attendingDoctor
          this.log(waiting, undefined, `Linked to bill ${b.invoiceNo}`, undefined, { user: "System", role: "Insurance Engine" })
          if (!insured)
            BillingDatabase.updateInsuranceDetails(b.id, {
              insuranceProvider: waiting.policy.insurerName,
              tpaName: waiting.policy.tpaName,
              policyNumber: waiting.policy.policyNumber,
            })
          c = waiting
          changed = true
        }
      }
      if (!c && !insured) continue
      if (!c) {
        const ins = matchInsurer(b.insuranceProvider, insurers)
        const status = statusFromBill(b)
        c = {
          id: caseIdFor(b),
          billingClaimId: b.id,
          invoiceNo: b.invoiceNo,
          encounterId: b.encounterId || b.id,
          patientId: b.patientId,
          patientName: b.patientName,
          mrn: b.mrn,
          age: b.age,
          gender: b.gender,
          phone: b.phone,
          encounterType: ENCOUNTER_OF_DEPARTMENT(b.department),
          department: b.department,
          attendingDoctor: b.attendingDoctor,
          carePathway: b.carePathway,
          dateOfService: b.dateOfService,
          admissionDate: b.dateOfService,
          policy: {
            paymentType: /pm-jay|cghs|ayushman|esi/i.test(b.insuranceProvider) ? "Government Scheme" : "Insurance / Cashless",
            insurerId: ins?.id ?? "",
            insurerName: ins?.companyName ?? b.insuranceProvider,
            tpaName: b.tpa?.tpaName || ins?.tpaName,
            policyNumber: b.policyNumber || "",
            memberId: "",
            policyHolderName: b.patientName,
            relationship: "Self",
            validUntil: "",
            sumInsured: 0,
            balanceAvailable: 0,
            roomCategoryEligible: "",
            copayPercentage: 0,
            deductibleAmount: 0,
            preAuthRequired: true,
          },
          preAuth: b.preAuthCode || b.tpa?.preAuthSanctioned
            ? {
              id: `PA-${new Date().getFullYear()}-${b.id.replace(/\D/g, "").padStart(5, "0")}`,
              status: "Approved",
              diagnosis: b.diagnosisCodes?.join(", ") || "",
              clinicalSummary: b.carePathway || "",
              treatingDoctor: b.attendingDoctor || "",
              admissionType: "Planned",
              procedures: [],
              packageSubtotal: 0,
              gstRate: 0,
              gstAmount: 0,
              estimatedOtherCharges: 0,
              estimatedHospitalStayDays: 0,
              estimatedTotalCost: b.totalAmount,
              requestedAmount: b.tpa?.preAuthRequested ?? b.tpa?.preAuthSanctioned ?? 0,
              approvedAmount: b.tpa?.preAuthSanctioned ?? 0,
              approvalCode: b.preAuthCode,
              enhancements: [],
              createdAt: b.createdAt,
              updatedAt: nowIso(),
            }
            : undefined,
          totalHospitalBill: 0,
          packageBaseAmount: 0,
          approvedPreAuthAmount: 0,
          consumedBillAmount: 0,
          nonPayableAmount: 0,
          patientShareAmount: 0,
          finalClaimAmount: 0,
          status,
          documents: [
            doc("Patient", "Patient ID Proof (Aadhaar / PAN)"),
            doc("Insurance", "Insurance / TPA Card"),
            doc("Insurance", "Policy Copy", false),
          ],
          queries: b.tpa?.queryOpen
            ? [
              {
                id: `Q-${Math.floor(1000 + Math.random() * 9000)}`,
                claimId: "",
                stage: "Claim",
                queryDate: nowIso(),
                dueDate: addDays(nowIso(), 3),
                requestedBy: ins?.tpaName || b.insuranceProvider,
                queryText: b.tpa.queryNote || "Query raised by insurer",
                status: "Open",
              },
            ]
            : [],
          auditTrail: [
            {
              id: `AUD-${Date.now()}-${b.id}`,
              timestamp: nowIso(),
              user: "System",
              role: "Insurance Engine",
              action: `Insurance case opened from IP bill ${b.invoiceNo}`,
              newStatus: status,
              device: "Server sync",
            },
          ],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        c.queries.forEach((q) => (q.claimId = c!.id))
        cases.push(c)
        changed = true
      }

      // Refresh the money from the bill.
      const covered = b.items.reduce((a, it) => a + Number(it.insuranceCovered || 0), 0)
      const finalClaimAmount = b.tpa?.claimAmount ?? covered
      const fin = {
        totalHospitalBill: b.totalAmount,
        consumedBillAmount: b.totalAmount,
        finalClaimAmount,
        patientShareAmount: b.patientPortion,
        nonPayableAmount: b.items.filter((it) => !it.insuranceCovered).reduce((a, it) => a + it.total, 0),
        approvedPreAuthAmount: c.preAuth?.approvedAmount || b.tpa?.preAuthSanctioned || 0,
        // A bill accepted without TPA detail (older records) was accepted as claimed.
        approvedClaimAmount:
          b.tpa?.approvedAmount ?? c.approvedClaimAmount ?? (b.status === "Accepted" || b.status === "Paid" ? finalClaimAmount : undefined),
        packageBaseAmount: c.preAuth?.packageSubtotal || 0,
        invoiceNo: b.invoiceNo,
      }
      for (const [k, v] of Object.entries(fin)) {
        if ((c as unknown as Record<string, unknown>)[k] !== v) {
          ; (c as unknown as Record<string, unknown>)[k] = v
          changed = true
        }
      }

      // The IP counter handed the final bill to insurance.
      if (b.tpa?.billedAt && PRE_FINAL.includes(c.status)) {
        this.log(c, "FINAL_BILL_READY", "Final bill handed over by the IP billing counter", undefined, { user: b.tpa.billedBy || "Billing Counter", role: "Billing" })
        c.status = "FINAL_BILL_READY"
        this.ensureDischargeDocs(c)
        changed = true
      }
    }

    if (changed) {
      try {
        localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(cases))
      } catch { }
    }
    return cases
  }

  public static getClaims(): ComprehensiveClaimRecord[] {
    return this.sync().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
  }

  public static getClaimById(id: string): ComprehensiveClaimRecord | undefined {
    return this.getClaims().find((c) => c.id === id || c.billingClaimId === id)
  }

  /** Admitted self-pay bills that could be put on insurance. */
  public static admissionsWithoutInsurance(): ClaimRecord[] {
    const cases = this.readCases()
    return BillingDatabase.getClaims().filter(
      (b) =>
        isCashlessEligible(b) &&
        (b.insuranceProvider === "Self-Pay" || !b.insuranceProvider) &&
        b.status !== "Paid" &&
        !cases.some((c) => c.billingClaimId === b.id),
    )
  }

  private static save(c: ComprehensiveClaimRecord) {
    const cases = this.readCases()
    const i = cases.findIndex((x) => x.id === c.id)
    c.updatedAt = nowIso()
    if (i >= 0) cases[i] = c
    else cases.unshift(c)
    this.setItem(STORAGE_KEY_CASES, cases)
  }

  private static log(
    c: ComprehensiveClaimRecord,
    to: InsuranceClaimStatus | undefined,
    action: string,
    comment?: string,
    who = whoAmI(),
  ) {
    if (!c) return
    if (!c.auditTrail) c.auditTrail = []
    if (!c.documents) c.documents = []
    if (!c.queries) c.queries = []
    if (!c.mails) c.mails = []

    c.auditTrail.unshift({
      id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso(),
      user: who.user,
      role: who.role,
      action,
      oldStatus: to ? c.status : undefined,
      newStatus: to,
      comments: comment,
      device: device(),
    })
  }

  /** Validated status change; the only way a user action moves a case. */
  private static move(c: ComprehensiveClaimRecord, to: InsuranceClaimStatus, action: string, comment?: string) {
    if (!INSURANCE_TRANSITIONS[c.status].includes(to))
      throw new Error(`Cannot move from "${STATUS_META[c.status].label}" to "${STATUS_META[to].label}".`)
    this.log(c, to, action, comment)
    c.status = to
  }

  private static act(id: string, fn: (c: ComprehensiveClaimRecord) => void): ComprehensiveClaimRecord {
    const c = this.getClaimById(id)
    if (!c) throw new Error("Insurance case not found")
    fn(c)
    this.save(c)
    return c
  }

  private static ensureDischargeDocs(c: ComprehensiveClaimRecord) {
    for (const d of this.rulesFor(c, "Discharge")) requireDoc(c, d.documentType, d.mandatory, d.category)
    const ins = this.getInsurers().find((i) => i.id === c.policy.insurerId)
    for (const r of ins?.documentRequirements ?? []) if (classifyDocument(r).stage === "discharge") requireDoc(c, r)
  }

  /**
   * Mandatory documents in these categories that are not yet uploaded AND
   * checked by the insurance desk -- nothing goes to the insurer unverified.
   */
  private static missingMandatory(c: ComprehensiveClaimRecord, categories: DocumentCategory[]): string[] {
    return c.documents
      .filter((d) => categories.includes(d.category) && d.isMandatory && !(d.isUploaded && d.status === "Verified"))
      .map((d) => `${d.documentType}${d.isUploaded ? " (verify)" : ""}`)
  }

  public static readonly PREAUTH_DOC_CATEGORIES: DocumentCategory[] = ["Patient", "Insurance", "Pre-Auth", "Clinical"]
  public static readonly CLAIM_DOC_CATEGORIES: DocumentCategory[] = ["Patient", "Insurance", "Pre-Auth", "Clinical", "Billing", "Discharge"]

  // ── Admission: put a self-pay admission on insurance ─────────────────────

  public static openCase(billingClaimId: string, policy: InsurancePolicyDetails, quick = false): ComprehensiveClaimRecord {
    this.need("insurance.create")
    if (!policy.insurerName.trim()) throw new Error("Choose the insurance company.")
    if (!quick && !policy.policyNumber.trim()) throw new Error("Insurer and policy number are required.")
    BillingDatabase.updateInsuranceDetails(billingClaimId, {
      insuranceProvider: policy.insurerName,
      tpaName: policy.tpaName,
      policyNumber: policy.policyNumber,
    })
    const c = this.getClaims().find((x) => x.billingClaimId === billingClaimId)
    if (!c) throw new Error("Could not open an insurance case for this admission.")
    c.policy = { ...c.policy, ...policy }
    c.status = "ELIGIBILITY_PENDING"
    this.rememberPolicy(c.patientId, c.patientName, policy)
    this.log(c, undefined, "Payment type set to insurance at admission", `${policy.insurerName} · ${policy.policyNumber}`)
    this.save(c)
    return c
  }

  public static updatePolicy(id: string, policy: Partial<InsurancePolicyDetails>) {
    this.need("insurance.create")
    return this.act(id, (c) => {
      c.policy = { ...c.policy, ...policy }
      if (policy.insurerName || policy.policyNumber || policy.tpaName)
        this.billing(c).updateInsuranceDetails(c.billingClaimId, {
          insuranceProvider: policy.insurerName,
          tpaName: policy.tpaName,
          policyNumber: policy.policyNumber,
        })
      this.log(c, undefined, "Policy details updated")
    })
  }

  // ── Encounter integration (Admissions / ER / OT / patient record) ─────────

  /** Cases for a patient across all their encounters, newest first. */
  public static casesForPatient(p: { id?: string; name?: string }): ComprehensiveClaimRecord[] {
    const key = { patientId: p.id || "", mrn: p.id || "", patientName: p.name || "" }
    return this.getClaims().filter((c) => samePatient(c, key))
  }

  /** The case still in progress for a patient, if any. */
  public static activeCaseForPatient(p: { id?: string; name?: string }): ComprehensiveClaimRecord | undefined {
    return this.casesForPatient(p).find((c) => c.status !== "CLOSED" && c.status !== "NOT_ELIGIBLE")
  }

  /**
   * Payment type "Insurance / Cashless" chosen on an encounter. Uses the
   * encounter's bill if billing has already raised one; otherwise the case
   * waits and sync() links the first bill raised for the patient.
   */
  public static openEncounterCase(
    enc: {
      patientId: string
      patientName: string
      encounterType: ClaimEncounterType
      department: string
      encounterId?: string
      age?: number
      gender?: string
      phone?: string
      attendingDoctor?: string
      admissionDate?: string
      carePathway?: string
    },
    policy: InsurancePolicyDetails,
    opts: { quick?: boolean } = {},
  ): ComprehensiveClaimRecord {
    this.need("insurance.create")
    if (enc.encounterType === "OP") throw new Error("OP visits are paid by the patient; insurance applies to admitted encounters.")
    if (!policy.insurerName.trim()) throw new Error("Choose the insurance company.")
    if (!opts.quick && !policy.policyNumber.trim()) throw new Error("Policy number is required.")
    const existing = this.activeCaseForPatient({ id: enc.patientId, name: enc.patientName })
    if (existing) throw new Error(`${enc.patientName} already has an insurance case in progress (${existing.id}).`)

    this.rememberPolicy(enc.patientId, enc.patientName, policy)
    const bill = this.admissionsWithoutInsurance().find((b) => samePatient({ patientId: enc.patientId, mrn: enc.patientId, patientName: enc.patientName } as ComprehensiveClaimRecord, b))
    if (bill) {
      const c = this.openCase(bill.id, policy, opts.quick)
      if (opts.quick) this.act(c.id, (x) => ((x.quickCapture = true), this.log(x, undefined, "Quick insurance capture (ER) — complete policy details later")))
      return this.getClaimById(c.id)!
    }

    const year = new Date().getFullYear()
    const c: ComprehensiveClaimRecord = {
      id: `CLM-${year}-E${String(Math.floor(Math.random() * 90000) + 10000)}`,
      billingClaimId: "",
      invoiceNo: "",
      encounterId: enc.encounterId || `ENC-${Date.now().toString(36).toUpperCase()}`,
      patientId: enc.patientId,
      patientName: enc.patientName,
      mrn: enc.patientId,
      age: enc.age ?? 0,
      gender: enc.gender ?? "",
      phone: enc.phone ?? "",
      encounterType: enc.encounterType,
      department: enc.department,
      attendingDoctor: enc.attendingDoctor,
      carePathway: enc.carePathway,
      dateOfService: enc.admissionDate || nowIso(),
      admissionDate: enc.admissionDate || nowIso(),
      quickCapture: !!opts.quick,
      policy: { ...policy, policyNumber: policy.policyNumber || "" },
      totalHospitalBill: 0,
      packageBaseAmount: 0,
      approvedPreAuthAmount: 0,
      consumedBillAmount: 0,
      nonPayableAmount: 0,
      patientShareAmount: 0,
      finalClaimAmount: 0,
      status: "ELIGIBILITY_PENDING",
      documents: [doc("Patient", "Patient ID Proof (Aadhaar / PAN)"), doc("Insurance", "Insurance / TPA Card"), doc("Insurance", "Policy Copy", false)],
      queries: [],
      auditTrail: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    this.log(
      c,
      undefined,
      opts.quick ? `Quick insurance capture at ${enc.department}` : `Payment type set to insurance at ${enc.encounterType} admission`,
      `${policy.insurerName}${policy.policyNumber ? ` · ${policy.policyNumber}` : " · policy no. to follow"}`,
    )
    this.save(c)
    return c
  }

  /** The OT scheduled a procedure: offer its package to the pre-auth. */
  public static linkProcedure(
    p: { id?: string; name?: string },
    link: { packageCode: string; procedureName: string; surgeon?: string; scheduledAt?: string; source?: ProcedureLink["source"] },
  ): ComprehensiveClaimRecord | undefined {
    const c = this.activeCaseForPatient(p)
    if (!c) return undefined
    if (!this.getPackages().some((x) => x.code === link.packageCode)) throw new Error(`Package ${link.packageCode} is not in the package master.`)
    return this.act(c.id, (x) => {
      x.procedureLinks = (x.procedureLinks ?? []).filter((l) => l.packageCode !== link.packageCode)
      x.procedureLinks.push({ ...link, source: link.source ?? "OT", linkedAt: nowIso() })
      this.log(x, undefined, `Procedure linked from ${link.source ?? "OT"}: ${link.procedureName} (${link.packageCode})`, link.surgeon ? `Surgeon ${link.surgeon}` : undefined)
    })
  }

  /** What still stands between this case and a clean insurance discharge. */
  public static dischargeReadiness(c: ComprehensiveClaimRecord): DischargeReadiness {
    const past = (s: InsuranceClaimStatus[]) => s.includes(c.status)
    const afterFinal: InsuranceClaimStatus[] = ["FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"]
    // Discharge-stage requirements, whether or not they have been added to the case yet.
    const probe: ComprehensiveClaimRecord = { ...c, documents: c.documents.map((d) => ({ ...d })) }
    this.ensureDischargeDocs(probe)
    const missingDocuments = probe.documents.filter((d) => d.isMandatory && !(d.isUploaded && d.status === "Verified")).map((d) => d.documentType)
    const approvalOk = !c.policy.preAuthRequired || c.approvedPreAuthAmount > 0 || past(afterFinal)
    const openQ = c.queries.filter((q) => q.status === "Open" || q.status === "Draft Response").length
    const over = c.approvedPreAuthAmount > 0 && c.consumedBillAmount > c.approvedPreAuthAmount
    const items = [
      { key: "preauth", label: "Pre-auth approved", ok: approvalOk, detail: approvalOk ? (c.approvedPreAuthAmount ? `₹${c.approvedPreAuthAmount.toLocaleString("en-IN")} approved` : "Not required by policy") : "Insurer has not approved yet" },
      { key: "bill", label: "Final bill ready", ok: past(afterFinal), detail: past(afterFinal) ? `Invoice ${c.invoiceNo}` : c.billingClaimId ? "IP counter has not sent the final bill" : "No bill raised for this encounter yet" },
      { key: "docs", label: "Documents uploaded & verified", ok: missingDocuments.length === 0, detail: missingDocuments.length ? `${missingDocuments.length} not ready` : "All verified" },
      {
        key: "clearance",
        label: "Insurance clearance",
        ok: !openQ && !over,
        detail: openQ ? `${openQ} insurer question${openQ > 1 ? "s" : ""} open` : over ? `Bill exceeds approval by ₹${(c.consumedBillAmount - c.approvedPreAuthAmount).toLocaleString("en-IN")} — request enhancement` : "Clear",
      },
    ]
    return { ready: items.every((i) => i.ok), items, missingDocuments }
  }

  // ── Patient policies (a patient can hold several) ──────────────────────────

  private static readPolicies(): PatientPolicy[] {
    return this.getItem<PatientPolicy[]>(STORAGE_KEY_POLICIES, [])
  }

  /** Policies on the patient's record, plus any known only from their insurance cases. */
  public static getPatientPolicies(p: { id?: string; name?: string }): PatientPolicy[] {
    const key = { patientId: p.id || "", mrn: p.id || "", patientName: p.name || "" }
    const mine = this.readPolicies().filter((x) => samePatient({ patientId: x.patientId, mrn: x.patientId, patientName: x.patientName } as ComprehensiveClaimRecord, key))
    for (const c of this.casesForPatient(p)) {
      if (!c.policy.policyNumber || mine.some((x) => x.policyNumber === c.policy.policyNumber)) continue
      mine.push({
        id: `POL-${c.id}`,
        patientId: c.patientId,
        patientName: c.patientName,
        insurerId: c.policy.insurerId,
        insurerName: c.policy.insurerName,
        tpaName: c.policy.tpaName,
        policyNumber: c.policy.policyNumber,
        memberId: c.policy.memberId,
        policyHolderName: c.policy.policyHolderName,
        relationship: c.policy.relationship,
        validUntil: c.policy.validUntil,
        sumInsured: c.policy.sumInsured,
        balanceAvailable: c.policy.balanceAvailable,
        copayPercentage: c.policy.copayPercentage,
        status: "Active",
        lastVerification: c.eligibility
          ? { status: c.eligibility.status, at: c.eligibility.verifiedAt, by: c.eligibility.verifiedBy, balanceAvailable: c.eligibility.balanceAvailable, inNetwork: c.eligibility.inNetwork }
          : undefined,
        createdAt: c.createdAt,
      })
    }
    return mine
  }

  public static savePatientPolicy(pol: PatientPolicy): PatientPolicy {
    this.need("insurance.create")
    if (!pol.insurerName.trim()) throw new Error("Choose the insurance company.")
    if (!pol.policyNumber.trim()) throw new Error("Policy number is required.")
    const all = this.readPolicies()
    const dup = all.find((x) => x.id !== pol.id && x.patientId === pol.patientId && x.policyNumber.trim().toLowerCase() === pol.policyNumber.trim().toLowerCase())
    if (dup) throw new Error(`Policy ${pol.policyNumber} is already on this patient's record.`)
    const clean = { ...pol, policyNumber: pol.policyNumber.trim(), id: pol.id && !pol.id.startsWith("POL-CLM") ? pol.id : `POL-${Date.now().toString(36).toUpperCase()}`, createdAt: pol.createdAt || nowIso() }
    const idx = all.findIndex((x) => x.id === clean.id)
    if (idx >= 0) all[idx] = clean
    else all.push(clean)
    this.setItem(STORAGE_KEY_POLICIES, all)
    return clean
  }

  public static removePatientPolicy(id: string): void {
    this.need("insurance.create")
    this.setItem(STORAGE_KEY_POLICIES, this.readPolicies().filter((x) => x.id !== id))
  }

  /** Record an eligibility check against a policy on the patient's record. */
  public static verifyPatientPolicy(pol: PatientPolicy, r: Omit<EligibilityResult, "verifiedAt" | "verifiedBy">): PatientPolicy {
    this.need("insurance.verify")
    const saved = this.savePatientPolicy({
      ...pol,
      sumInsured: r.sumInsured || pol.sumInsured,
      balanceAvailable: r.balanceAvailable || pol.balanceAvailable,
      status: r.status === "Not Eligible" || !r.policyActive ? "Inactive" : "Active",
      lastVerification: { status: r.status, at: nowIso(), by: whoAmI().user, balanceAvailable: r.balanceAvailable, inNetwork: r.inNetwork },
    })
    // The same policy on a case still waiting for eligibility takes the result too.
    const c = this.casesForPatient({ id: pol.patientId, name: pol.patientName }).find(
      (x) => x.policy.policyNumber === pol.policyNumber && ["DRAFT", "ELIGIBILITY_PENDING", "NOT_ELIGIBLE"].includes(x.status),
    )
    if (c) this.recordEligibility(c.id, r)
    return saved
  }

  private static rememberPolicy(patientId: string, patientName: string, policy: InsurancePolicyDetails) {
    if (!policy.policyNumber.trim()) return
    const all = this.readPolicies()
    if (all.some((x) => x.patientId === patientId && x.policyNumber === policy.policyNumber)) return
    all.push({
      id: `POL-${Date.now().toString(36).toUpperCase()}`,
      patientId,
      patientName,
      insurerId: policy.insurerId,
      insurerName: policy.insurerName,
      tpaName: policy.tpaName,
      policyNumber: policy.policyNumber,
      memberId: policy.memberId,
      policyHolderName: policy.policyHolderName || patientName,
      relationship: policy.relationship,
      validUntil: policy.validUntil,
      sumInsured: policy.sumInsured,
      balanceAvailable: policy.balanceAvailable,
      copayPercentage: policy.copayPercentage,
      status: "Active",
      createdAt: nowIso(),
    })
    this.setItem(STORAGE_KEY_POLICIES, all)
  }

  // ── Eligibility ──────────────────────────────────────────────────────────

  public static recordEligibility(id: string, r: Omit<EligibilityResult, "verifiedAt" | "verifiedBy">) {
    this.need("insurance.verify")
    return this.act(id, (c) => {
      if (c.status === "NOT_ELIGIBLE") this.move(c, "ELIGIBILITY_PENDING", "Eligibility re-verification started")
      if (c.status === "DRAFT") this.move(c, "ELIGIBILITY_PENDING", "Eligibility verification requested")
      const result: EligibilityResult = { ...r, verifiedAt: nowIso(), verifiedBy: whoAmI().user }
      c.eligibility = result
      c.policy.sumInsured = r.sumInsured || c.policy.sumInsured
      c.policy.balanceAvailable = r.balanceAvailable || c.policy.balanceAvailable
      c.policy.preAuthRequired = r.preAuthRequired
      if (r.status === "Verification Required") {
        this.log(c, undefined, "Eligibility needs further verification", r.notes)
        return
      }
      this.move(
        c,
        r.status === "Not Eligible" ? "NOT_ELIGIBLE" : "ELIGIBLE",
        `Eligibility verified (${r.method}): ${r.status}`,
        r.notes,
      )
    })
  }

  /** Eligible, no pre-auth needed: go straight to treatment. */
  public static startTreatmentWithoutPreAuth(id: string) {
    this.need("insurance.preauth.submit")
    return this.act(id, (c) => {
      if (c.policy.preAuthRequired) throw new Error("This policy requires pre-authorisation.")
      this.move(c, "TREATMENT_IN_PROGRESS", "Treatment started — pre-auth not required by policy")
    })
  }

  // ── Pre-authorisation ────────────────────────────────────────────────────

  public static savePreAuthDraft(
    id: string,
    input: {
      diagnosis: string
      icdCode?: string
      clinicalSummary: string
      treatingDoctor: string
      admissionType: "Planned" | "Emergency"
      procedureCodes: string[]
      estimatedOtherCharges: number
      estimatedHospitalStayDays: number
      proposedTreatment?: string
    },
  ) {
    this.need("insurance.preauth.create")
    return this.act(id, (c) => {
      if (!input.diagnosis.trim()) throw new Error("Diagnosis is required.")
      if (!input.treatingDoctor.trim()) throw new Error("Treating doctor is required.")
      const procedures = this.priceProcedures(input.procedureCodes)
      const pkgs = this.getPackages()
      const gstRate = procedures.length ? pkgs.find((p) => p.code === procedures[0].packageCode)?.applicableGstRate ?? 0 : 0
      const packageSubtotal = procedures.reduce((a, l) => a + l.amount, 0)
      const gstAmount = Math.round((packageSubtotal * gstRate) / 100)
      const estimatedTotalCost = packageSubtotal + gstAmount + Math.max(0, input.estimatedOtherCharges || 0)
      const existing = c.preAuth
      c.preAuth = {
        id: existing?.id ?? `PA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
        status: "Draft",
        diagnosis: input.diagnosis.trim(),
        icdCode: input.icdCode,
        clinicalSummary: input.clinicalSummary.trim(),
        treatingDoctor: input.treatingDoctor.trim(),
        admissionType: input.admissionType,
        procedures,
        packageSubtotal,
        gstRate,
        gstAmount,
        estimatedOtherCharges: Math.max(0, input.estimatedOtherCharges || 0),
        estimatedHospitalStayDays: Math.max(0, input.estimatedHospitalStayDays || 0),
        estimatedTotalCost,
        requestedAmount: estimatedTotalCost,
        proposedTreatment: input.proposedTreatment?.trim() || existing?.proposedTreatment,
        approvedAmount: existing?.approvedAmount ?? 0,
        enhancements: existing?.enhancements ?? [],
        createdAt: existing?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
      }
      // Checklist: hospital document rules, then the insurer's own list.
      // Discharge-stage requirements are added by ensureDischargeDocs().
      for (const d of this.rulesFor(c, "Pre-Auth")) requireDoc(c, d.documentType, d.mandatory, d.category)
      const ins = this.getInsurers().find((i) => i.id === c.policy.insurerId)
      for (const r of ins?.documentRequirements ?? []) if (classifyDocument(r).stage === "preauth") requireDoc(c, r)
      if (c.status === "ELIGIBLE" || c.status === "PREAUTH_REJECTED") this.move(c, "PREAUTH_DRAFT", "Pre-auth request drafted")
      else this.log(c, undefined, "Pre-auth draft updated")
    })
  }

  public static submitPreAuth(id: string, method: PreAuthRequest["submissionMethod"], externalReference: string) {
    this.need("insurance.preauth.submit")
    return this.act(id, (c) => {
      if (!c.preAuth) throw new Error("Create the pre-auth request first.")
      const missing = this.missingMandatory(c, ["Patient", "Insurance", "Pre-Auth", "Clinical"])
      if (missing.length) throw new Error(`Upload and verify these documents first: ${missing.join(", ")}.`)
      this.move(c, "PREAUTH_SUBMITTED", `Pre-auth submitted via ${method}`, externalReference ? `Ref ${externalReference}` : undefined)
      c.preAuth = { ...c.preAuth, status: "Submitted", submissionMethod: method, externalReference, submittedAt: nowIso(), submittedBy: whoAmI().user, updatedAt: nowIso() }
      this.billing(c).requestPreAuth(c.billingClaimId, c.preAuth.requestedAmount, `${c.preAuth.id} · ${method}`)
    })
  }

  public static markPreAuthUnderReview(id: string) {
    this.need("insurance.preauth.submit")
    return this.act(id, (c) => {
      this.move(c, "PREAUTH_UNDER_REVIEW", "Insurer acknowledged — pre-auth under review")
      if (c.preAuth) c.preAuth.status = "Under Review"
    })
  }

  public static recordPreAuthResponse(
    id: string,
    r: { outcome: "Approved" | "Partially Approved" | "Query" | "Rejected"; amount?: number; approvalCode?: string; note: string; dueDays?: number },
  ) {
    this.need("insurance.preauth.submit")
    return this.act(id, (c) => {
      const isClaimStage = ["CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED"].includes(c.status)
      if (isClaimStage) {
        if (r.outcome === "Query") {
          this.move(c, "CLAIM_QUERY_RAISED", "Insurer raised a claim deficiency query", r.note)
          c.queries.unshift(this.newQuery(c, "Claim", r.note, r.dueDays ?? 3))
          return
        }
        if (r.outcome === "Rejected") {
          this.move(c, "REJECTED", "Claim rejected by insurer", r.note)
          return
        }
        const amount = Math.max(0, r.amount || 0)
        const targetStatus = r.outcome === "Partially Approved" ? "PARTIALLY_APPROVED" : "APPROVED"
        this.move(c, targetStatus, `Claim ${r.outcome.toLowerCase()} for ₹${amount.toLocaleString("en-IN")}`, r.note)
        c.approvedClaimAmount = amount
        return
      }

      if (!c.preAuth) {
        c.preAuth = {
          id: `PA-${new Date().getFullYear()}-${c.id.replace(/\D/g, "").padStart(5, "0")}`,
          status: "Draft",
          diagnosis: "",
          clinicalSummary: "",
          treatingDoctor: c.attendingDoctor || "",
          admissionType: "Planned",
          procedures: [],
          packageSubtotal: 0,
          gstRate: 0,
          gstAmount: 0,
          estimatedOtherCharges: 0,
          estimatedHospitalStayDays: 0,
          estimatedTotalCost: c.totalHospitalBill || 0,
          requestedAmount: r.amount || c.totalHospitalBill || 50000,
          approvedAmount: 0,
          enhancements: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
      }

      if (r.outcome === "Query") {
        if (INSURANCE_TRANSITIONS[c.status]?.includes("PREAUTH_QUERY")) {
          this.move(c, "PREAUTH_QUERY", "Insurer raised a pre-auth query", r.note)
        } else {
          this.log(c, "PREAUTH_QUERY", "Insurer raised a pre-auth query", r.note)
          c.status = "PREAUTH_QUERY"
        }
        c.preAuth.status = "Query"
        c.queries.unshift(this.newQuery(c, "Pre-Auth", r.note, r.dueDays ?? 2))
        return
      }
      if (r.outcome === "Rejected") {
        if (INSURANCE_TRANSITIONS[c.status]?.includes("PREAUTH_REJECTED")) {
          this.move(c, "PREAUTH_REJECTED", "Pre-auth rejected", r.note)
        } else {
          this.log(c, "PREAUTH_REJECTED", "Pre-auth rejected", r.note)
          c.status = "PREAUTH_REJECTED"
        }
        c.preAuth.status = "Rejected"
        c.preAuth.responseNote = r.note
        return
      }
      const amount = Math.max(0, r.amount || 0)
      if (!amount) throw new Error("Enter the approved amount.")
      if (!r.approvalCode?.trim()) throw new Error("Enter the insurer's approval / authorisation code.")

      if (INSURANCE_TRANSITIONS[c.status]?.includes("PREAUTH_APPROVED")) {
        this.move(c, "PREAUTH_APPROVED", `Pre-auth ${r.outcome.toLowerCase()} for ₹${amount.toLocaleString("en-IN")}`, r.note)
      } else {
        this.log(c, "PREAUTH_APPROVED", `Pre-auth ${r.outcome.toLowerCase()} for ₹${amount.toLocaleString("en-IN")}`, r.note)
        c.status = "PREAUTH_APPROVED"
      }

      c.preAuth = { ...c.preAuth, status: r.outcome, approvedAmount: amount, approvalCode: r.approvalCode, responseNote: r.note, updatedAt: nowIso() }
      c.approvedPreAuthAmount = amount
      this.billing(c).approvePreAuth(c.billingClaimId, amount, r.approvalCode)

      // Record inbound decision mail record on case
      if (!c.mails) c.mails = []
      c.mails.unshift({
        id: `mail-decision-${Date.now()}`,
        direction: "in",
        purpose: "Pre-Auth",
        at: nowIso(),
        from: `approvals@${(c.policy.tpaName || c.policy.insurerName || "tpa").toLowerCase().replace(/[^a-z]/g, "")}.in`,
        to: "insurance.desk@hospai-hospital.org",
        subject: `[${c.id}] DECISION CONFIRMED: Pre-Auth Approved for ₹${amount.toLocaleString("en-IN")} — ${c.patientName}`,
        body: `Dear Hospital Partner,\n\nWe have approved the initial pre-authorization for patient ${c.patientName} under policy number ${c.policy.policyNumber || "POL-9921"}.\n\n=========================================\nAUTHORIZATION CODE: ${r.approvalCode}\nAPPROVED AMOUNT: ₹${amount.toLocaleString("en-IN")}\nNOTE: ${r.note}\n=========================================\n\nStatus recorded in system: PREAUTH_APPROVED / TREATMENT_IN_PROGRESS`,
        attachments: ["PreAuth_Sanction_Letter.pdf"],
        by: "Insurance Dept Officer",
      })

      // Authorisation in hand: treatment proceeds.
      if (INSURANCE_TRANSITIONS[c.status]?.includes("TREATMENT_IN_PROGRESS")) {
        this.move(c, "TREATMENT_IN_PROGRESS", "Treatment in progress under approved pre-auth")
      } else {
        this.log(c, "TREATMENT_IN_PROGRESS", "Treatment in progress under approved pre-auth")
        c.status = "TREATMENT_IN_PROGRESS"
      }
    })
  }

  public static requestEnhancement(id: string, amount: number, reason: string) {
    this.need("insurance.preauth.submit")
    return this.act(id, (c) => {
      if (c.status !== "TREATMENT_IN_PROGRESS") throw new Error("Enhancements are requested during treatment.")
      if (!c.preAuth) throw new Error("No pre-auth on this case.")
      if (!(amount > c.preAuth.approvedAmount)) throw new Error("The enhanced amount must exceed the current approval.")
      if (!reason.trim()) throw new Error("Give the reason for the enhancement.")
      c.preAuth.enhancements.unshift({ at: nowIso(), amount, reason, status: "Requested" })
      this.log(c, undefined, `Enhancement requested to ₹${amount.toLocaleString("en-IN")}`, reason)
      this.billing(c).requestEnhancement(c.billingClaimId, amount, reason)
    })
  }

  public static resolveEnhancement(id: string, approved: boolean, amount?: number) {
    this.need("insurance.preauth.submit")
    return this.act(id, (c) => {
      const e = c.preAuth?.enhancements.find((x) => x.status === "Requested")
      if (!c.preAuth || !e) throw new Error("No pending enhancement.")
      e.status = approved ? "Approved" : "Rejected"
      if (approved) {
        const amt = amount || e.amount
        c.preAuth.approvedAmount = amt
        c.approvedPreAuthAmount = amt
        this.billing(c).approvePreAuth(c.billingClaimId, amt, c.preAuth.approvalCode || c.preAuth.id)
      }
      this.log(c, undefined, approved ? `Enhancement approved — limit now ₹${c.preAuth.approvedAmount.toLocaleString("en-IN")}` : "Enhancement rejected")
    })
  }

  // ── Discharge & claim ────────────────────────────────────────────────────

  public static initiateDischarge(id: string) {
    this.need("insurance.claim.create")
    return this.act(id, (c) => {
      this.move(c, "DISCHARGE_INITIATED", "Discharge initiated — final bill requested from IP billing")
      c.dischargeDate = nowIso()
      this.ensureDischargeDocs(c)
    })
  }

  public static submitClaim(id: string, method: "Portal" | "API" | "Email" | "Manual", reference: string) {
    this.need("insurance.claim.submit")
    return this.act(id, (c) => {
      const missing = this.missingMandatory(c, ["Patient", "Insurance", "Pre-Auth", "Clinical", "Billing", "Discharge"])
      if (missing.length) throw new Error(`Claim documents not ready — upload and verify: ${missing.join(", ")}.`)
      if (!(c.finalClaimAmount > 0)) throw new Error("The claim amount is zero — check the insurance split on the IP bill.")
      this.move(c, "CLAIM_SUBMITTED", `Final claim submitted via ${method} for ₹${c.finalClaimAmount.toLocaleString("en-IN")}`, reference ? `Ref ${reference}` : undefined)
      this.billing(c).submitClaim(c.billingClaimId)
    })
  }

  private static newQuery(c: ComprehensiveClaimRecord, stage: "Pre-Auth" | "Claim", text: string, dueDays: number): ClaimQuery {
    return {
      id: `Q-${Math.floor(1000 + Math.random() * 9000)}`,
      claimId: c.id,
      stage,
      queryDate: nowIso(),
      dueDate: addDays(nowIso(), dueDays),
      requestedBy: c.policy.tpaName || c.policy.insurerName,
      queryText: text,
      status: "Open",
    }
  }

  public static raiseClaimQuery(id: string, text: string, dueDays = 3) {
    this.need("insurance.claim.submit")
    return this.act(id, (c) => {
      if (!text.trim()) throw new Error("Enter what the insurer asked for.")
      this.move(c, "CLAIM_QUERY_RAISED", "Insurer raised a claim query", text)
      c.queries.unshift(this.newQuery(c, "Claim", text, dueDays))
      this.billing(c).recordTpaQuery(c.billingClaimId, text)
    })
  }

  public static saveQueryDraft(id: string, queryId: string, response: string) {
    this.need("insurance.query.respond")
    return this.act(id, (c) => {
      const q = c.queries.find((x) => x.id === queryId)
      if (!q) throw new Error("Query not found")
      q.hospitalResponseText = response
      q.status = "Draft Response"
      this.log(c, undefined, `Response drafted for ${q.id}`)
    })
  }

  public static respondToQuery(id: string, queryId: string, response: string, documents: string[]) {
    this.need("insurance.query.respond")
    return this.act(id, (c) => {
      const q = c.queries.find((x) => x.id === queryId)
      if (!q) throw new Error("Query not found")
      if (!response.trim()) throw new Error("Write the response to the insurer.")
      q.hospitalResponseText = response
      q.attachedDocuments = documents
      q.status = "Response Submitted"
      q.respondedAt = nowIso()
      q.respondedBy = whoAmI().user
      for (const name of documents) {
        const d = doc("Query", name, false)
        c.documents.push({ ...d, isUploaded: true, status: "Uploaded", version: 1, fileName: name, uploadedAt: nowIso(), uploadedBy: whoAmI().user })
      }
      if (q.stage === "Pre-Auth" && c.status === "PREAUTH_QUERY") {
        this.move(c, "PREAUTH_UNDER_REVIEW", `Query ${q.id} answered — back under review`, response)
        if (c.preAuth) c.preAuth.status = "Under Review"
      } else if (q.stage === "Claim" && c.status === "CLAIM_QUERY_RAISED") {
        this.move(c, "CLAIM_SUBMITTED", `Query ${q.id} answered — claim back under review`, response)
        this.billing(c).answerTpaQuery(c.billingClaimId, response)
      } else this.log(c, undefined, `Response submitted for ${q.id}`, response)
    })
  }

  public static closeQuery(id: string, queryId: string) {
    this.need("insurance.query.respond")
    return this.act(id, (c) => {
      const q = c.queries.find((x) => x.id === queryId)
      if (!q) throw new Error("Query not found")
      q.status = "Closed"
      this.log(c, undefined, `Query ${q.id} closed`)
    })
  }

  public static recordClaimDecision(
    id: string,
    r: {
      outcome: "Approved" | "Partially Approved" | "Rejected"
      approvedAmount?: number
      deductions?: ClaimDeductionReason[]
      shortfallTo?: "writeoff" | "patient"
      note: string
    },
  ) {
    this.need("insurance.claim.submit")
    return this.act(id, (c) => {
      if (r.outcome === "Rejected") {
        if (!r.note.trim()) throw new Error("Record the rejection reason.")
        this.move(c, "REJECTED", "Claim rejected by insurer", r.note)
        this.billing(c).recordTpaDenial(c.billingClaimId, r.note)
        return
      }
      if (r.shortfallTo && r.shortfallTo !== "writeoff" && r.shortfallTo !== "patient")
        throw new Error("Choose who bears the shortfall: hospital write-off or patient.")
      const approved = Math.max(0, r.approvedAmount || 0)
      if (!approved) throw new Error("Enter the approved amount.")
      if (approved > c.finalClaimAmount) throw new Error("Approved amount cannot exceed the claimed amount.")
      const deductions = (r.deductions || []).filter((d) => d.amount > 0)
      const deducted = deductions.reduce((a, d) => a + d.amount, 0)
      const gap = c.finalClaimAmount - approved
      if (gap > 0 && deducted !== gap)
        throw new Error(`Deductions (₹${deducted.toLocaleString("en-IN")}) must add up to the shortfall of ₹${gap.toLocaleString("en-IN")}.`)
      const outcome = gap > 0 ? "PARTIALLY_APPROVED" : "APPROVED"
      this.move(c, outcome, `Claim ${gap > 0 ? "partially approved" : "approved"} for ₹${approved.toLocaleString("en-IN")}`, r.note)
      c.approvedClaimAmount = approved
      c.settlement = {
        id: `STL-${c.id}`,
        claimId: c.id,
        settlementAdviceNo: "",
        approvedAmount: approved,
        deductionsAmount: deducted,
        deductionReasons: deductions,
        expectedAmount: approved,
        receivedAmount: 0,
        netSettlementAmount: 0,
        paymentReferenceNo: "",
        paymentDate: "",
        bankAccountName: "",
        reconciliationStatus: "Expected",
      }
      this.billing(c).recordTpaApproval(
        c.billingClaimId,
        approved,
        deductions.map((d) => `${d.category}: ${d.remark || "—"} (₹${d.amount})`).join("; ") || undefined,
        r.shortfallTo ?? "writeoff",
      )
    })
  }

  public static appealClaim(id: string, grounds: string) {
    this.need("insurance.claim.submit")
    return this.act(id, (c) => {
      if (!grounds.trim()) throw new Error("Give the grounds for appeal.")
      this.move(c, "CLAIM_SUBMITTED", "Appeal filed — claim back under review", grounds)
      this.billing(c).appealClaim(c.billingClaimId, grounds)
    })
  }

  // ── Settlement & reconciliation ──────────────────────────────────────────

  public static recordSettlementAdvice(id: string, adviceNo: string, expectedBy: string) {
    this.need("insurance.reconciliation.manage")
    return this.act(id, (c) => {
      if (!adviceNo.trim()) throw new Error("Enter the settlement advice number.")
      this.move(c, "SETTLEMENT_PENDING", `Settlement advice ${adviceNo} received`)
      if (c.settlement) c.settlement = { ...c.settlement, settlementAdviceNo: adviceNo, expectedBy }
    })
  }

  public static recordPayment(id: string, p: { amount: number; utr: string; bankRef?: string; paymentDate: string; bankAccount: string }) {
    this.need("insurance.reconciliation.manage")
    return this.act(id, (c) => {
      if (!c.settlement) throw new Error("No approved settlement on this case.")
      if (!(p.amount > 0)) throw new Error("Enter the amount received.")
      if (!p.utr.trim()) throw new Error("Enter the UTR / payment reference.")
      const received = c.settlement.receivedAmount + p.amount
      const expected = c.settlement.expectedAmount
      const recon = received === expected ? "Received" : received < expected ? "Short Payment" : "Unmatched"
      this.move(c, "PAYMENT_RECEIVED", `Payment of ₹${p.amount.toLocaleString("en-IN")} received`, `UTR ${p.utr}`)
      c.settlement = {
        ...c.settlement,
        receivedAmount: received,
        netSettlementAmount: received,
        paymentReferenceNo: p.utr,
        bankReference: p.bankRef,
        paymentDate: p.paymentDate,
        bankAccountName: p.bankAccount,
        reconciliationStatus: recon,
      }
      this.billing(c).recordTpaSettlement(c.billingClaimId, p.amount, p.utr)
    })
  }

  public static reconcile(id: string, note: string) {
    this.need("insurance.reconciliation.manage")
    return this.act(id, (c) => {
      if (!c.settlement) throw new Error("Nothing to reconcile.")
      if (c.settlement.reconciliationStatus === "Short Payment" && !note.trim())
        throw new Error("Explain the short payment before reconciling.")
      this.move(c, "RECONCILED", "Payment matched to bank statement and reconciled", note || undefined)
      c.settlement = { ...c.settlement, reconciliationStatus: "Reconciled", reconciledAt: nowIso(), reconciledBy: whoAmI().user }
    })
  }

  public static closeClaim(id: string) {
    this.need("insurance.reconciliation.manage")
    return this.act(id, (c) => this.move(c, "CLOSED", "Claim closed"))
  }

  // ── Documents ────────────────────────────────────────────────────────────

  public static uploadDocument(id: string, docId: string, fileName: string) {
    this.need("insurance.claim.create")
    return this.act(id, (c) => {
      const d = c.documents.find((x) => x.id === docId)
      if (!d) throw new Error("Document not found")
      d.isUploaded = true
      d.status = "Uploaded"
      d.version += 1
      d.fileName = fileName
      d.uploadedAt = nowIso()
      d.uploadedBy = whoAmI().user
      this.log(c, undefined, `${d.documentType} uploaded (v${d.version})`, fileName)
    })
  }

  public static verifyDocument(id: string, docId: string, ok: boolean) {
    this.need("insurance.claim.create")
    return this.act(id, (c) => {
      const d = c.documents.find((x) => x.id === docId)
      if (!d || !d.isUploaded) throw new Error("Upload the document before verifying it.")
      d.status = ok ? "Verified" : "Rejected"
      if (!ok) d.isUploaded = false
      this.log(c, undefined, `${d.documentType} ${ok ? "verified" : "rejected — re-upload needed"}`)
    })
  }

  /** Mark every uploaded, not-yet-checked document in these categories as verified. */
  public static verifyAllUploaded(id: string, categories?: DocumentCategory[]) {
    this.need("insurance.claim.create")
    return this.act(id, (c) => {
      const docs = c.documents.filter((d) => d.isUploaded && d.status === "Uploaded" && (!categories || categories.includes(d.category)))
      if (!docs.length) throw new Error("Nothing waiting for verification.")
      docs.forEach((d) => (d.status = "Verified"))
      this.log(c, undefined, `${docs.length} document${docs.length > 1 ? "s" : ""} verified`, docs.map((d) => d.documentType).join(", "))
    })
  }

  // ── Email with the insurer / TPA ─────────────────────────────────────────

  /** Where this case's mail goes: the TPA if one handles it, else the insurer's desk for that purpose. */
  public static insurerAddress(c: ComprehensiveClaimRecord, purpose: MailPurpose): string {
    const ins = this.getInsurers().find((i) => i.id === c.policy.insurerId) ?? matchInsurer(c.policy.insurerName, this.getInsurers())
    const tpa = this.getTpas().find((t) => t.status === "Active" && (t.name === c.policy.tpaName || (ins && t.insurerIds.includes(ins.id))))
    if (tpa?.email) return tpa.email
    if (!ins) return ""
    return purpose === "Claim" ? ins.claimsEmail || ins.contactEmail : ins.preAuthEmail || ins.contactEmail
  }

  /** A ready-to-send draft for the purpose, with the verified documents attached. */
  public static mailDraft(c: ComprehensiveClaimRecord, purpose: MailPurpose, queryId?: string) {
    const cats = purpose === "Claim" ? this.CLAIM_DOC_CATEGORIES : purpose === "Query Response" ? ([...this.CLAIM_DOC_CATEGORIES, "Query"] as DocumentCategory[]) : this.PREAUTH_DOC_CATEGORIES
    const docs = c.documents.filter((d) => cats.includes(d.category))
    const pa = c.preAuth
    const who = whoAmI().user
    const ref = `${c.patientName} — Policy ${c.policy.policyNumber || "—"}${c.policy.memberId ? ` / Member ${c.policy.memberId}` : ""}`
    const q = queryId ? c.queries.find((x) => x.id === queryId) : undefined
    const subject =
      purpose === "Pre-Auth"
        ? `Cashless Pre-Authorization Request — ${ref} — ${pa?.id ?? c.id}`
        : purpose === "Claim"
          ? `Final Claim Submission — ${ref} — Claim ${c.id}`
          : purpose === "Eligibility"
            ? `Eligibility Verification Request — ${ref}`
            : purpose === "Query Response"
              ? `Re: Query ${q?.id ?? ""} — ${ref} — ${c.id}`
              : purpose === "Enhancement"
                ? `Enhancement Request — ${ref} — ${pa?.id ?? c.id}`
                : `${ref} — ${c.id}`
    const lines = [
      `Dear ${c.policy.tpaName || c.policy.insurerName} team,`,
      "",
      purpose === "Pre-Auth"
        ? "Please find attached the cashless pre-authorization request for the patient below."
        : purpose === "Claim"
          ? "Please find attached the final claim with the discharge documents for the patient below."
          : purpose === "Eligibility"
            ? "Kindly confirm the policy status, available balance and room eligibility for the patient below."
            : purpose === "Query Response"
              ? `In response to your query${q ? ` (${q.id}): “${q.queryText}”` : ""}, please find our reply and the requested documents.`
              : purpose === "Enhancement"
                ? "We request an enhancement of the approved amount for the patient below."
                : "",
      "",
      `Patient: ${c.patientName} (UHID ${c.patientId})${c.age ? `, ${c.age}y` : ""}${c.gender ? ` ${c.gender}` : ""}`,
      `Policy: ${c.policy.policyNumber || "—"}${c.policy.memberId ? ` · Member ID ${c.policy.memberId}` : ""}`,
      `Encounter: ${c.encounterType} · ${c.department} · admitted ${c.admissionDate ? new Date(c.admissionDate).toLocaleDateString("en-IN") : "—"}`,
      ...(pa && purpose !== "Eligibility"
        ? [
          `Diagnosis: ${pa.diagnosis}${pa.icdCode ? ` (${pa.icdCode})` : ""}`,
          pa.procedures.length ? `Procedures: ${pa.procedures.map((l) => `${l.packageCode} ${l.procedureName} @ ${l.ratePercent}%`).join("; ")}` : "",
          purpose === "Pre-Auth" ? `Estimated amount requested: ₹${pa.requestedAmount.toLocaleString("en-IN")}` : "",
          pa.approvalCode && purpose !== "Pre-Auth" ? `Pre-auth approval: ${pa.approvalCode} for ₹${pa.approvedAmount.toLocaleString("en-IN")}` : "",
        ]
        : []),
      purpose === "Claim" ? `Final bill: ₹${c.totalHospitalBill.toLocaleString("en-IN")} · Claim amount: ₹${c.finalClaimAmount.toLocaleString("en-IN")} · Invoice ${c.invoiceNo}` : "",
      "",
      docs.filter((d) => d.status === "Verified").length ? "Documents attached:" : "",
      ...docs.filter((d) => d.status === "Verified").map((d) => `  • ${d.documentType}${d.fileName ? ` (${d.fileName})` : ""}`),
      "",
      "Regards,",
      `${who}`,
      "Insurance Desk",
    ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    return {
      to: this.insurerAddress(c, purpose),
      cc: "",
      subject,
      body: lines.join("\n"),
      documents: docs,
      body_for_query: q ? q.hospitalResponseText ?? "" : "",
    }
  }

  /**
   * Send an email to the insurer / TPA. For a pre-auth, claim or query
   * response the email IS the submission: the documents must be verified and
   * the case moves on exactly as a portal submission would.
   */
  public static sendInsurerEmail(
    id: string,
    m: { purpose: MailPurpose; to: string; cc?: string; subject: string; body: string; attachmentIds: string[]; extraAttachments?: string[]; queryId?: string },
  ): MailRecord {
    const need: Record<MailPurpose, InsurancePermission> = {
      Eligibility: "insurance.verify",
      "Pre-Auth": "insurance.preauth.submit",
      Enhancement: "insurance.preauth.submit",
      Claim: "insurance.claim.submit",
      "Query Response": "insurance.query.respond",
      General: "insurance.view",
    }
    this.need(need[m.purpose])
    const emails = m.to.split(/[,;]\s*/).filter(Boolean)
    if (!emails.length || emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new Error("Enter a valid insurer email address.")
    if (!m.subject.trim()) throw new Error("Enter a subject.")
    if (!m.body.trim()) throw new Error("Write the email.")
    const c0 = this.getClaimById(id)
    if (!c0) throw new Error("Insurance case not found")
    const attachments = c0.documents.filter((d) => m.attachmentIds.includes(d.id))
    const unverified = attachments.filter((d) => !(d.isUploaded && d.status === "Verified"))
    if (unverified.length) throw new Error(`Verify before sending: ${unverified.map((d) => d.documentType).join(", ")}.`)
    const mailId = `MAIL-${Date.now().toString(36).toUpperCase()}`
    // The submission itself (validates status and required documents).
    if (m.purpose === "Pre-Auth") this.submitPreAuth(id, "Email", mailId)
    else if (m.purpose === "Claim") this.submitClaim(id, "Email", mailId)
    else if (m.purpose === "Query Response") {
      if (!m.queryId) throw new Error("Which query is this answering?")
      this.respondToQuery(id, m.queryId, m.body, attachments.map((d) => d.fileName || d.documentType))
    }
    const rec: MailRecord = {
      id: mailId,
      direction: "out",
      purpose: m.purpose,
      at: nowIso(),
      from: "insurance.desk@hospital",
      to: emails.join(", "),
      cc: m.cc?.trim() || undefined,
      subject: m.subject.trim(),
      body: m.body,
      attachments: [...attachments.map((d) => d.fileName ? `${d.documentType} — ${d.fileName}` : d.documentType), ...(m.extraAttachments ?? [])],
      by: whoAmI().user,
      queryId: m.queryId,
    }
    this.act(id, (c) => {
      c.mails = [...(c.mails ?? []), rec]
      this.log(c, undefined, `📧 Email sent to ${rec.to}: ${rec.subject}`, rec.attachments.length ? `${rec.attachments.length} attachment(s)` : undefined)
    })
    return rec
  }

  /** Put the insurer's emailed reply on the case (the decision itself is recorded with it). */
  public static recordInsurerEmail(id: string, m: { purpose: MailPurpose; from: string; subject: string; body: string; receivedAt?: string; attachments?: string[]; queryId?: string }): MailRecord {
    this.need("insurance.view")
    if (!m.body.trim() && !m.subject.trim()) throw new Error("Paste the insurer's email.")
    const rec: MailRecord = {
      id: `MAIL-${Date.now().toString(36).toUpperCase()}`,
      direction: "in",
      purpose: m.purpose,
      at: m.receivedAt ? new Date(m.receivedAt).toISOString() : nowIso(),
      from: m.from.trim() || "insurer",
      to: "insurance.desk@hospital",
      subject: m.subject.trim() || `(${m.purpose} reply)`,
      body: m.body,
      attachments: m.attachments ?? [],
      by: whoAmI().user,
      queryId: m.queryId,
    }
    this.act(id, (c) => {
      c.mails = [...(c.mails ?? []), rec]
      this.log(c, undefined, `📥 Insurer email recorded: ${rec.subject}`, `from ${rec.from}`)
    })
    return rec
  }

  public static addDocument(id: string, category: DocumentCategory, type: string, mandatory: boolean) {
    this.need("insurance.claim.create")
    return this.act(id, (c) => {
      if (!type.trim()) throw new Error("Enter the document name.")
      c.documents.push(doc(category, type.trim(), mandatory))
      this.log(c, undefined, `Document requirement added: ${type.trim()}`)
    })
  }

  public static addNote(id: string, note: string) {
    this.need("insurance.view")
    return this.act(id, (c) => {
      if (!note.trim()) throw new Error("Write a note.")
      this.log(c, undefined, "Note added", note.trim())
    })
  }

  /** Pre-auth limit consumption for continuous tracking. */
  public static checkThresholdWarning(c: ComprehensiveClaimRecord) {
    const limit = c.approvedPreAuthAmount
    if (!limit) return { isWarning: false, percentageConsumed: 0, remaining: 0, message: "" }
    const pct = Math.round((c.consumedBillAmount / limit) * 100)
    const threshold = this.getInsurers().find((i) => i.id === c.policy.insurerId)?.alertThresholdPct ?? 85
    const remaining = limit - c.consumedBillAmount
    return {
      isWarning: pct >= threshold,
      percentageConsumed: pct,
      remaining,
      message:
        pct >= 100
          ? `The bill has exceeded the approved amount by ₹${Math.abs(remaining).toLocaleString("en-IN")} — request an enhancement.`
          : pct >= threshold
            ? `${pct}% of the approved amount is used — consider requesting an enhancement.`
            : `${pct}% of the approved amount used.`,
    }
  }

  /** Resets the insurance database and seeds with demo cases dynamically from hospital state */
  public static resetAndSeedDemoData() {
    this.need("insurance.master.manage")
    // Clear all existing cases and policies
    localStorage.removeItem(STORAGE_KEY_CASES)
    localStorage.removeItem(STORAGE_KEY_POLICIES)
    
    // Read current hospital state dynamically
    const beds = JSON.parse(localStorage.getItem("hospai_inpatient_beds_v9") || "[]")
    const occupied = beds.filter((b: any) => b.status === "Occupied" && b.patient_name)
    
    if (occupied.length === 0) {
      listeners.forEach((l) => l())
      throw new Error("No active patients found in the hospital to seed demo data. Please admit some patients first.")
    }

    const mockInsurers = this.getInsurers()
    const demoCases: ComprehensiveClaimRecord[] = []

    occupied.slice(0, 8).forEach((b: any, idx: number) => {
      const insurer = mockInsurers[idx % mockInsurers.length]
      const statusList: InsuranceClaimStatus[] = ["PREAUTH_APPROVED", "CLAIM_SUBMITTED", "ELIGIBILITY_PENDING", "CLAIM_QUERY_RAISED", "PREAUTH_UNDER_REVIEW"]
      const targetStatus = statusList[idx % statusList.length]
      
      const sumInsured = 300000 + (idx * 150000)
      const approvedAmount = targetStatus === "PREAUTH_APPROVED" || targetStatus === "CLAIM_SUBMITTED" ? sumInsured * 0.6 : 0

      demoCases.push({
        id: `CLM-${Math.floor(1000 + Math.random() * 9000)}`,
        patientId: b.patient_id || `UH${10000 + idx}`,
        mrn: `IP${10000 + idx}`,
        patientName: `${b.patient_name} ${b.patient_last_name || ""}`.trim(),
        encounterType: b.bed_type === "ICU" ? "ICU" : "IP",
        department: b.bed_type === "ICU" ? "Intensive Care" : "General Medicine",
        admissionDate: b.admission_date || new Date().toISOString(),
        status: targetStatus,
        policy: {
          patientId: b.patient_id || `UH${10000 + idx}`,
          insurerId: insurer.id,
          insurerName: insurer.companyName,
          tpaId: undefined,
          tpaName: "",
          policyNumber: `${insurer.companyCode || "POL"}-${Math.floor(100000 + Math.random() * 900000)}`,
          memberId: `MEM-${Math.floor(10000 + Math.random() * 90000)}`,
          validFrom: new Date(Date.now() - 300 * 86400000).toISOString(),
          validTo: new Date(Date.now() + 65 * 86400000).toISOString(),
          sumInsured: sumInsured,
          copayPercentage: idx % 3 === 0 ? 10 : 0,
          roomRentLimit: 5000,
          isActive: true,
          createdAt: new Date().toISOString()
        } as any,
        approvedPreAuthAmount: approvedAmount,
        preAuth: targetStatus !== "ELIGIBILITY_PENDING" ? {
          id: `PA-${idx}`,
          status: "Approved",
          diagnosis: "Fever and General Weakness",
          clinicalSummary: b.admission_notes || "Routine admission",
          requestedAmount: sumInsured * 0.7,
          submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          approvalCode: approvedAmount > 0 ? `AUTH-${Math.floor(1000 + Math.random() * 9000)}` : undefined
        } as any : undefined,
        totalHospitalBill: b.room_charges_so_far || 15000,
        consumedBillAmount: b.room_charges_so_far || 15000,
        finalClaimAmount: targetStatus === "CLAIM_SUBMITTED" ? (b.room_charges_so_far || 15000) + 20000 : undefined,
        documents: [],
        queries: targetStatus === "CLAIM_QUERY_RAISED" ? [
          {
            id: `Q-${Math.floor(1000 + Math.random() * 9000)}`,
            queryText: "Please provide detailed break up of room charges.",
            date: new Date(Date.now() - 86400000).toISOString(),
            dueDate: new Date(Date.now() + 86400000).toISOString(),
            status: "Open"
          } as any
        ] : [],
        mails: [],
        timeline: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any)
    })

    this.setItem(STORAGE_KEY_CASES, demoCases)
    listeners.forEach((l) => l())
  }
}
