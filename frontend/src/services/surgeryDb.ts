/**
 * Enterprise Hospital Management System - Surgery & Operation Theatre (OT) Database Service
 * Fully integrates the 14-Page Imperial Hospitals Physical OT Booklet:
 *  - Page 2: Pre-Anaesthetic Assessment (PAC)
 *  - Page 3: Anaesthesia Plan & Immediate Pre-Op Re-Evaluation
 *  - Page 4 & 5: Consent for Surgery / Invasive Procedure / High Risk
 *  - Page 6 & 7: Consent for Anaesthesia / Analgesia / Sedation
 *  - Page 8: Surgery Master Checklist (Pre-Op 1-10, Intra-Op 11-15, Post-Op 16-21)
 *  - Page 9: Pre-Preparation Form for Operation (Ward -> OT Nurse Handover)
 *  - Page 10: WHO Surgical Safety Checklist (Sign-In, Time-Out, Sign-Out)
 *  - Page 11: Anaesthesia Record (Intra-op Monitoring, Regional Block, Drugs)
 *  - Page 12 & 13: Operation Record & Surgeon Procedure Notes
 *  - Page 14: Recovery Evaluation & Modified Aldrete Score (0-10) + Ward Handover
 *
 * Backed by the real `/api/ot/cases` routes (backend/backend/modules/ot/routes.py) --
 * every stage-transition button routes through PATCH .../status, which is the
 * server-side gate: it rejects (409) unless the relevant booklet section
 * (PAC opinion, WHO checklist signatures, Aldrete score) actually proves the
 * stage was completed. `localStorage` is kept only as a write-through cache
 * so a mid-edit booklet survives a dropped connection, same posture as the
 * ICU flowsheet (see AGENTS.md).
 */

import { apiFetch } from "../lib/api"
import { BedDatabase } from "./bedDb"

export type SurgeryStatus =
  | "PAC Pending"
  | "PAC Cleared"
  | "Pre-Op Holding"
  | "In Surgery"
  | "PACU Recovery"
  | "Transferred to Ward"
  | "Transferred to ICU"
  | "Discharged"
  | "Completed"
  | "Cancelled"

export type UrgencyLevel = "Elective" | "Urgent" | "Emergency STAT"

export interface WardPostOpCare {
  wardName: string
  roomNo: string
  bedNo: string
  bedId?: number
  transferredAt: string
  transferredBy: string
  handoverNotes: string
  postOpDay: number
  drainStatus: string // "In situ - Serosanguinous 35 mL" | "Removed POD 2" | "None"
  drainOutputMl?: number
  woundStatus: string // "Clean, Dry & Intact" | "Mild Serous Soakage - Dressing Changed" | "Erythema / Under Observation"
  dietStatus: string // "NPO" | "Sips of Water" | "Clear Liquids" | "Soft Diet" | "Full Normal Diet"
  mobilizationStatus: string // "Bed Rest" | "Sitting on Edge" | "Assisted Ambulation" | "Independent Walking"
  painScoreVas: number // 0-10
  dailyProgressNotes?: Array<{
    id: string
    date: string
    pod: number
    author: string
    vitalsSummary: string
    clinicalNotes: string
    orders: string
  }>
}

export interface IcuPostOpCare {
  icuUnit: "SICU" | "MICU" | "CCU" | "PICU"
  bedNo: string
  bedId?: number
  transferredAt: string
  transferredBy: string
  intubated: boolean
  ventilatorMode?: string
  inotropes?: string
  arterialLine: boolean
  centralVenousLine: boolean
  handoverNotes: string
  criticalConcerns: string
}

export interface SurgicalDischargeRecord {
  dischargedAt: string
  dischargedBy: string
  dischargeType: "Routine Discharge Home" | "Transferred to Step-Down Facility" | "Discharged on Request"
  conditionAtDischarge: string
  sutureRemovalDate: string
  followUpDate: string
  followUpClinic: string
  dischargeMedications: Array<{
    drug: string
    dose: string
    route: string
    frequency: string
    duration: string
    instructions: string
  }>
  woundCareInstructions: string
  warningSigns: string[]
  emergencyHelpline: string
  billingSettled: boolean
  totalBillAmount: number
}

export interface TelemetryReading {
  id: string
  timestamp: string
  hr: number
  bpSys: number
  bpDia: number
  map: number
  spo2: number
  etco2: number
  temp: number
  anestheticAgent: string
  agentConcentration: string
  respRate: number
  peep: number
  tidalVolume: number
}

export interface SurgicalConsumableItem {
  id: string
  name: string
  category: "Implant" | "Suture" | "Mesh" | "Drain" | "Energy Device" | "Hemostatic Agent"
  lotNumber: string
  serialNumber?: string
  quantity: number
  unitCost: number
  sterilityVerified: boolean
}

export interface PreAnaestheticAssessment {
  history: {
    diabetes: boolean
    hypertension: boolean
    ihd: boolean
    cva: boolean
    hospitalisation: boolean
    anestheticExposure: boolean
    coughSputum: boolean
    breathlessness: boolean
    asthmaCopd: boolean
    tb: boolean
    convulsions: boolean
    palpitations: boolean
    allergies: boolean
    smokingAlcoholDrugAbuse: boolean
    snoring: boolean
    bleedingTendency: boolean
    jaundice: boolean
    syncopalAttacks: boolean
    backache: boolean
    scolineSensitivity: boolean
    timeOfLastMeal: string
    presentMedications: string[]
    otherHistory: string
  }
  clinicalExam: {
    built: "Obese" | "Moderate" | "Thin"
    hydration: string
    pallor: boolean
    cyanosis: boolean
    clubbing: boolean
    pedalEdema: boolean
    ascites: boolean
    mouthOpening: string
    teeth: "Normal" | "Loose" | "Protruding" | "Missing" | "Dentures"
    tmjMovement: string
    shortNeck: boolean
    goitre: boolean
    trachea: string
    mallampatiGrade: "Class I" | "Class II" | "Class III" | "Class IV"
    spine: string
  }
  vitalsExam: {
    bp: string
    pulse: number
    rhythm: string
    volume: string
    rr: number
    temp: string
    heartSounds: string
    murmurs: string
    cardiomegaly: boolean
    lungsAirEntryLeft: string
    lungsAirEntryRight: string
    breathSounds: string
    advSounds: string
  }
  investigations: {
    urineAlbuminSugar: string
    hbPercent: string
    btCt: string
    ptInr: string
    bloodGroup: string
    bloodSugar: string
    bloodUrea: string
    sCreatinine: string
    electrolytesNaK: string
    cxr: string
    ecg: string
    lft: string
    echo2d: string
    otherLabs: string
  }
  opinionAsa: {
    opinion: "May be posted" | "Needs further special evaluation" | "Needs treatment"
    asaGrade: "ASA I" | "ASA II" | "ASA III" | "ASA IV" | "ASA V-E"
    anesthesiaPlanned: "General Anesthesia" | "Spinal/Epidural" | "Regional Block" | "Local"
    evaluatorSignature: string
    date: string
    time: string
  }
  clearanceStatus?: "Pending" | "Cleared" | "High Risk Cleared" | "Rejected" | string
}

export interface SurgicalImplant {
  id: string
  name: string
  serialOrLotNumber: string
  manufacturer: string
  expiryDate?: string
  status: "Sterilized" | "Implanted" | "Wasted"
  cost: number
}

export interface AnaesthesiaPlan {
  preopInstructions: string
  premedication: string
  typeOfAnaesthesia: string
  npoSolidsHours: number
  npoClearFluidsHours: number
  specialMonitoringRequired: string
  anticipatedPostOpCare: string
  arrangeBloodProducts: string
  investigationsRequired: string
  immediateReEval: {
    date: string
    time: string
    patientSiteIdentified: boolean
    changeOfPlan: string
    heartRate: number
    bp: string
    npoStatus: string
    evaluatorSignature: string
  }
}

export interface PrePreparationForm {
  vitals: {
    bp: string
    pulse: number
    temp: string
  }
  idTagVerified: boolean
  weightKg: number
  premedicationGiven: boolean
  nasoGastricTube: boolean
  enemaGiven: boolean
  timeOfLastMicturition: string
  timeOfLastFeed: string
  nailPolishRemoved: boolean
  teethJewelsRemoved: boolean
  prepShaveSiteDone: boolean
  xrayReportsEnclosed: boolean
  bloodLabReportsEnclosed: boolean
  handedOverByNurse: string
  takenOverByOtNurse: string
}

export interface MasterSurgeryChecklist {
  preOpItems: {
    bloodProductsArranged: boolean
    financialApprovalDone: boolean
    pacCompleted: boolean
    patientPreparationDone: boolean
    anaesthesiaConsentSigned: boolean
    surgeryConsentSigned: boolean
    highRiskConsentSigned: boolean
    bloodTransfusionConsentSigned: boolean
    antibioticProphylaxisGiven: boolean
    prePreparationFormComplete: boolean
    wardNurseSignature: string
    receivedBySignature: string
  }
  intraOpItems: {
    anaesthesiaNotesRecorded: boolean
    whoSafetyChecklistComplete: boolean
    operationNotesRecorded: boolean
    surgeonNotesRecorded: boolean
    medicationChartUpdated: boolean
    checkedBySignature: string
  }
  postOpItems: {
    recoveryEvaluationDone: boolean
    anaestheticRecoveryRecordComplete: boolean
    patientHandoverNurseNotesSigned: boolean
    qualityIndicatorsUpdated: boolean
    photosVideosArchived: boolean
    radiologyFilmsHandedOver: boolean
    recoveryNurseSignature: string
  }
}

export interface WhoSafetyChecklist {
  signIn: {
    patientConfirmedIdConsent: boolean
    siteMarked: boolean
    anaesthesiaMachineCheckComplete: boolean
    pulseOximeterFunctioning: boolean
    allergiesChecked: boolean
    difficultAirwayRisk: boolean
    bloodLossRiskOver500ml: boolean
    signedByNurse: string
    completedAt?: string
  }
  timeOut: {
    teamMembersIntroduced: boolean
    patientNameProcedureSiteConfirmed: boolean
    antibioticProphylaxisWithin60min: boolean
    surgeonCriticalStepsDiscussed: boolean
    anaesthetistPatientConcernsDiscussed: boolean
    nurseSterilityEquipmentVerified: boolean
    imagingDisplayed: boolean
    signedBySurgeon: string
    completedAt?: string
  }
  signOut: {
    procedureNameRecorded: boolean
    swabInstrumentNeedleCountCorrect: boolean
    specimenLabeledAloud: boolean
    equipmentProblemsNoted: boolean
    postOpRecoveryConcernsDiscussed: boolean
    signedByScrubNurse: string
    completedAt?: string
  }
}

export interface AnaesthesiaRecordDetail {
  startingTime: string
  finishedTime: string
  anaestheticTechnique: string
  preoxygenationDone: boolean
  airwayManagement: {
    maskLmaEttSize: string
    ventilation: "Spontaneous" | "Controlled"
    intubation: "Easy" | "Difficult" | "Failed"
    sellickManoeuvre: boolean
    patientPosition: string
  }
  regionalBlock: {
    position: string
    space: string
    needleType: string
    drugDosage: string
    onsetLevel: string
    bromageScale: string
  }
  drugsUsed: Array<{ drug: string; dose: string; time: string }>
  shiftingCondition: string
  anesthesiologistSignature: string
}

export interface OperationRecordDetail {
  surgeonPreparedInOr: string
  preOpDiagnosis: string
  postOpDiagnosis: string
  procedureProposed: string
  procedureExecuted: string
  asstSurgeons: string[]
  skinPreparation: string
  histopathologySent: boolean
  photosVideosRecorded: boolean
  swabCountCorrect: boolean
  instrumentCountCorrect: boolean
  suturesUsed: string
  drainageCount: number
  bloodLossMl: number
  surgeryStartTime: string
  surgeryEndTime: string
  operatingTimeMins: number
  complications: string
  surgeonProcedureNotes: string
  postOpInstructions: string
  surgeonSignature: string
}

export interface RecoveryAldreteDetail {
  bedNumber: string
  admissionTime: string
  dischargeTime?: string
  aldreteScore: {
    activity: number // 0-2
    respiration: number // 0-2
    circulation: number // 0-2
    consciousness: number // 0-2
    o2Saturation: number // 0-2
    totalScore: number // 0-10
  }
  vitals: {
    bp: string
    hr: number
    spo2: number
  }
  dischargeStatus: "In PACU" | "Cleared for Ward" | "Transferred to ICU"
  wardHandoverNurse: string
  dischargedBy: string
}

// Fields the backend has no dedicated column for -- kept in booklet.caseInfo
// (see toSurgicalCase/toCaseInfo below), same "frontend owns the shape"
// trade-off as the rest of the booklet.
export interface SurgicalCaseInfo {
  patientName: string
  age: number
  gender: "Male" | "Female" | "Other"
  mrn: string
  ipNo: string
  cptCode: string
  icd10Code: string
  specialty: string
  assistantSurgeon?: string
  anesthesiologist: string
  scrubNurse: string
  circulatingNurse: string
  scheduledTime: string
  durationEst: string
  urgency: UrgencyLevel
  insuranceProvider: string
}

export interface SurgicalCase extends SurgicalCaseInfo {
  id: string
  caseNo: string
  orRoom: string
  patientId: string
  procedureName: string
  surgeon: string
  totalAmount: number
  status: SurgeryStatus
  billedAt: string | null
  invoiceId: number | null

  // Complete Digital OT Booklet Records (Imperial Hospitals Booklet Page 1-14)
  pac?: PreAnaestheticAssessment
  anaesthesiaPlan?: AnaesthesiaPlan
  prePrepForm?: PrePreparationForm
  masterChecklist?: MasterSurgeryChecklist
  whoChecklist?: WhoSafetyChecklist
  anaesthesiaRecord?: AnaesthesiaRecordDetail
  operationRecord?: OperationRecordDetail
  recoveryAldrete?: RecoveryAldreteDetail

  // Enhanced Real-Time Hospital Flow Stages
  wardTransfer?: WardPostOpCare
  icuTransfer?: IcuPostOpCare
  dischargeRecord?: SurgicalDischargeRecord
  telemetryLogs?: TelemetryReading[]
  currentTelemetry?: TelemetryReading
  implantsAndConsumables?: SurgicalConsumableItem[]

  createdAt: string
  updatedAt: string
}

export interface SurgeonPreferenceCard {
  id: string
  surgeonName: string
  specialty: string
  procedure: string
  gloveSize: string
  preferredTrays: string[]
  suturePreferences: string[]
  disposables: string[]
  specialInstructions: string
}

/** Reason string from a 409 gate rejection, so the UI can show *why*. */
export class OtGateError extends Error {
  reason: string
  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

const CACHE_KEY = "hospai_surgery_cases_cache_v1"
const CHANNEL_NAME = "hospai_surgery_updates"

const DEFAULT_SURGEON_CARDS: SurgeonPreferenceCard[] = [
  {
    id: "SPC-101",
    surgeonName: "Dr. Adams",
    specialty: "Orthopedics",
    procedure: "Total Knee Replacement",
    gloveSize: "7.5 Powder-Free",
    preferredTrays: [
      "Major Ortho Instrument Set #3",
      "Stryker Power Tool Kit",
      "Knee Trial Implants Set",
    ],
    suturePreferences: [
      "Ethicon Vicryl 2-0",
      "Monocryl 3-0 Cutting",
      "Stapler 35 Wide",
    ],
    disposables: [
      "Coban 4 inch",
      "Aquacel Ag Surgical Dressing",
      "Suction Tubing x2",
    ],
    specialInstructions:
      "Tourniquet pressure 250mmHg right thigh. Prefers pulsatile lavage prior to cementation.",
  },
  {
    id: "SPC-102",
    surgeonName: "Dr. Vikram Seth",
    specialty: "General & Laparoscopy",
    procedure: "Laparoscopic Cholecystectomy",
    gloveSize: "8.0 Micro-textured",
    preferredTrays: [
      "Karl Storz 4K Laparoscopic Tower Set",
      "Veress Needle & Trocar Pack (10mm/5mm)",
    ],
    suturePreferences: ["Endoloop Vicryl 0", "PDS II 3-0 Subcuticular"],
    disposables: [
      "Endo Catch Bag 10mm",
      "Harmonic Scalpel Shears",
      "CO2 Insufflation Tubing",
    ],
    specialInstructions:
      "Position patient in reverse Trendelenburg with left tilt. Keep cholangiography set on standby.",
  },
]

export const DEFAULT_SEED_CASES: SurgicalCase[] = [
  {
    id: "SURG-101",
    caseNo: "OT-2026-001",
    orRoom: "OR 1",
    patientId: "UMR100450",
    patientName: "Harold Thompson",
    age: 68,
    gender: "Male",
    mrn: "UMR100450",
    ipNo: "IP-884920",
    cptCode: "27447",
    icd10Code: "M17.11",
    procedureName: "Total Knee Replacement R",
    specialty: "Orthopedics",
    surgeon: "Dr. Adams",
    anesthesiologist: "Dr. Rodriguez",
    scrubNurse: "RN Murphy",
    circulatingNurse: "RN Davis",
    scheduledTime: "07:30 AM",
    durationEst: "135 mins",
    urgency: "Elective",
    insuranceProvider: "Star Health",
    totalAmount: 54700,
    status: "Transferred to Ward",
    billedAt: new Date().toISOString(),
    invoiceId: 100450,
    createdAt: "2026-09-23T07:30:00Z",
    updatedAt: "2026-09-23T10:00:00Z",
    wardTransfer: {
      wardName: "Orthopedic Surgical Ward",
      roomNo: "204",
      bedNo: "Bed 204-A",
      bedId: 12,
      transferredAt: "2026-09-23T14:30:00Z",
      transferredBy: "Nurse Brenda (PACU)",
      handoverNotes: "TKR R side uneventful. Drain 30mL serous. Distal neurovascular intact. Weight-bearing as tolerated with walker.",
      postOpDay: 2,
      drainStatus: "Removed on POD 2 (Output < 25 mL/day)",
      drainOutputMl: 15,
      woundStatus: "Clean, Dry & Intact",
      dietStatus: "Full Normal Diet",
      mobilizationStatus: "Assisted Ambulation with Walker",
      painScoreVas: 2,
      dailyProgressNotes: [
        {
          id: "NOTE-1",
          date: "2026-09-24T09:00:00Z",
          pod: 1,
          author: "Dr. Adams (Attending Surgeon)",
          vitalsSummary: "BP 124/80, HR 72, SpO2 98% RA, Temp 98.4°F",
          clinicalNotes: "Patient comfortable. Drain 40 mL serosanguinous. Knee flexed to 60 degrees in CPM machine. Active ankle pumps advised.",
          orders: "Continue IV Paracetamol 1g Q8H, DVT prophylaxis Clexane 40mg SC daily, chest spirometry Q2H.",
        },
        {
          id: "NOTE-2",
          date: "2026-09-25T09:30:00Z",
          pod: 2,
          author: "Dr. Adams (Attending Surgeon)",
          vitalsSummary: "BP 120/78, HR 70, SpO2 99% RA, Afebrile",
          clinicalNotes: "Drain removed today. Incision clean and dry. Ambulated 30 meters with physio. Patient eager for home discharge tomorrow.",
          orders: "Transition to oral analgesics (Ultracet 1 tab Q8H). Continue DVT stockings. Plan discharge on POD 3.",
        },
      ],
    },
    recoveryAldrete: {
      bedNumber: "PACU-2",
      admissionTime: "11:15 AM",
      dischargeTime: "12:30 PM",
      aldreteScore: {
        activity: 2,
        respiration: 2,
        circulation: 2,
        consciousness: 2,
        o2Saturation: 2,
        totalScore: 10,
      },
      vitals: { bp: "128/82", hr: 74, spo2: 99 },
      dischargeStatus: "Cleared for Ward",
      wardHandoverNurse: "RN Brenda",
      dischargedBy: "Dr. Rodriguez",
    },
  },
  {
    id: "SURG-102",
    caseNo: "OT-2026-002",
    orRoom: "OR 1",
    patientId: "UMR100451",
    patientName: "Isabel Cruz",
    age: 19,
    gender: "Female",
    mrn: "UMR100451",
    ipNo: "IP-884921",
    cptCode: "47562",
    icd10Code: "K35.80",
    procedureName: "Laparoscopic Appendectomy",
    specialty: "General Surgery",
    surgeon: "Dr. Williams",
    anesthesiologist: "Dr. Kim",
    scrubNurse: "RN Murphy",
    circulatingNurse: "RN Pham",
    scheduledTime: "11:00 AM",
    durationEst: "90 mins",
    urgency: "Urgent",
    insuranceProvider: "HDFC ERGO",
    totalAmount: 28000,
    status: "In Surgery",
    billedAt: null,
    invoiceId: null,
    createdAt: "2026-09-23T11:00:00Z",
    updatedAt: "2026-09-23T11:30:00Z",
    currentTelemetry: {
      id: "TEL-ACTIVE",
      timestamp: new Date().toISOString(),
      hr: 74,
      bpSys: 118,
      bpDia: 76,
      map: 90,
      spo2: 99,
      etco2: 36,
      temp: 36.8,
      anestheticAgent: "Sevoflurane",
      agentConcentration: "2.0%",
      respRate: 14,
      peep: 5,
      tidalVolume: 450,
    },
    implantsAndConsumables: [
      {
        id: "CON-1",
        name: "Laparoscopic Trocar 10mm Optical",
        category: "Energy Device",
        lotNumber: "LOT-2026-8812",
        serialNumber: "TR-9901",
        quantity: 1,
        unitCost: 3500,
        sterilityVerified: true,
      },
      {
        id: "CON-2",
        name: "Endoloop Ligature Vicryl 0",
        category: "Suture",
        lotNumber: "LOT-2026-3401",
        quantity: 2,
        unitCost: 1200,
        sterilityVerified: true,
      },
      {
        id: "CON-3",
        name: "Endo Catch Specimen Retrieval Bag 10mm",
        category: "Drain",
        lotNumber: "LOT-2026-4409",
        quantity: 1,
        unitCost: 1800,
        sterilityVerified: true,
      },
    ],
    whoChecklist: {
      signIn: {
        patientConfirmedIdConsent: true,
        siteMarked: true,
        anaesthesiaMachineCheckComplete: true,
        pulseOximeterFunctioning: true,
        allergiesChecked: true,
        difficultAirwayRisk: false,
        bloodLossRiskOver500ml: false,
        signedByNurse: "RN Murphy",
        completedAt: "10:55 AM",
      },
      timeOut: {
        teamMembersIntroduced: true,
        patientNameProcedureSiteConfirmed: true,
        antibioticProphylaxisWithin60min: true,
        surgeonCriticalStepsDiscussed: true,
        anaesthetistPatientConcernsDiscussed: true,
        nurseSterilityEquipmentVerified: true,
        imagingDisplayed: true,
        signedBySurgeon: "Dr. Williams",
        completedAt: "11:05 AM",
      },
      signOut: {
        procedureNameRecorded: false,
        swabInstrumentNeedleCountCorrect: false,
        specimenLabeledAloud: false,
        equipmentProblemsNoted: false,
        postOpRecoveryConcernsDiscussed: false,
        signedByScrubNurse: "",
      },
    },
  },
  {
    id: "SURG-103",
    caseNo: "OT-2026-003",
    orRoom: "OR 1",
    patientId: "UMR100452",
    patientName: "Mia Thompson",
    age: 74,
    gender: "Female",
    mrn: "UMR100452",
    ipNo: "IP-884922",
    cptCode: "66984",
    icd10Code: "H25.11",
    procedureName: "Cataract Extraction + IOL",
    specialty: "Ophthalmology",
    surgeon: "Dr. Park",
    anesthesiologist: "Dr. Rodriguez",
    scrubNurse: "RN Davis",
    circulatingNurse: "RN Murphy",
    scheduledTime: "03:00 PM",
    durationEst: "60 mins",
    urgency: "Elective",
    insuranceProvider: "Self-Pay",
    totalAmount: 15000,
    status: "PAC Pending",
    billedAt: null,
    invoiceId: null,
    createdAt: "2026-09-23T14:00:00Z",
    updatedAt: "2026-09-23T14:00:00Z",
  },
  {
    id: "SURG-104",
    caseNo: "OT-2026-004",
    orRoom: "OR 2",
    patientId: "UMR100412",
    patientName: "Ananya Desai",
    age: 42,
    gender: "Female",
    mrn: "UMR100412",
    ipNo: "IP-884923",
    cptCode: "47562",
    icd10Code: "K80.20",
    procedureName: "Laparoscopic Cholecystectomy",
    specialty: "General Surgery",
    surgeon: "Dr. Vikram Seth",
    anesthesiologist: "Dr. Brody",
    scrubNurse: "RN Pham",
    circulatingNurse: "RN Davis",
    scheduledTime: "08:00 AM",
    durationEst: "150 mins",
    urgency: "Elective",
    insuranceProvider: "HDFC ERGO",
    totalAmount: 32000,
    status: "PAC Cleared",
    billedAt: null,
    invoiceId: null,
    createdAt: "2026-09-23T08:00:00Z",
    updatedAt: "2026-09-23T09:30:00Z",
    pac: {
      history: {
        diabetes: false,
        hypertension: true,
        ihd: false,
        cva: false,
        hospitalisation: false,
        anestheticExposure: false,
        coughSputum: false,
        breathlessness: false,
        asthmaCopd: false,
        tb: false,
        convulsions: false,
        palpitations: false,
        allergies: false,
        smokingAlcoholDrugAbuse: false,
        snoring: false,
        bleedingTendency: false,
        jaundice: false,
        syncopalAttacks: false,
        backache: false,
        scolineSensitivity: false,
        timeOfLastMeal: "10:00 PM yesterday",
        presentMedications: ["Amlodipine 5mg OD"],
        otherHistory: "Occasional dyspepsia with fatty meals",
      },
      clinicalExam: {
        built: "Moderate",
        hydration: "Adequate",
        pallor: false,
        cyanosis: false,
        clubbing: false,
        pedalEdema: false,
        ascites: false,
        mouthOpening: "Adequate > 3 fingers",
        teeth: "Normal",
        tmjMovement: "Normal",
        shortNeck: false,
        goitre: false,
        trachea: "Central",
        mallampatiGrade: "Class I",
        spine: "Normal curvature",
      },
      vitalsExam: {
        bp: "124/82",
        pulse: 76,
        rhythm: "Regular",
        volume: "Good",
        rr: 16,
        temp: "98.6 F",
        heartSounds: "S1 S2 Normal",
        murmurs: "None",
        cardiomegaly: false,
        lungsAirEntryLeft: "Bilateral equal",
        lungsAirEntryRight: "Bilateral equal",
        breathSounds: "Vesicular",
        advSounds: "Nil",
      },
      investigations: {
        urineAlbuminSugar: "Nil",
        hbPercent: "13.2 g/dL",
        btCt: "BT 2m 10s, CT 5m 20s",
        ptInr: "PT 12.4s, INR 1.02",
        bloodGroup: "B Positive",
        bloodSugar: "FBS 98 mg/dL",
        bloodUrea: "22 mg/dL",
        sCreatinine: "0.8 mg/dL",
        electrolytesNaK: "Na 140, K 4.1",
        cxr: "Normal study",
        ecg: "Normal Sinus Rhythm",
        lft: "Total Bilirubin 0.8, SGOT 24, SGPT 28",
        echo2d: "LVEF 62%, Normal valves",
        otherLabs: "HBsAg / HCV / HIV Non-reactive",
      },
      opinionAsa: {
        opinion: "May be posted",
        asaGrade: "ASA II",
        anesthesiaPlanned: "General Anesthesia",
        evaluatorSignature: "Dr. Brody, MD (Anaesthesiology)",
        date: "2026-09-23",
        time: "09:30 AM",
      },
      clearanceStatus: "Cleared",
    },
  },
  {
    id: "SURG-105",
    caseNo: "OT-2026-005",
    orRoom: "OR 2",
    patientId: "UMR100453",
    patientName: "George Watts",
    age: 60,
    gender: "Male",
    mrn: "UMR100453",
    ipNo: "IP-884924",
    cptCode: "33533",
    icd10Code: "I25.10",
    procedureName: "CABG x3 Coronary Bypass",
    specialty: "Cardiothoracic",
    surgeon: "Dr. Patel",
    anesthesiologist: "Dr. Rodriguez",
    scrubNurse: "RN Murphy",
    circulatingNurse: "RN Pham",
    scheduledTime: "12:00 PM",
    durationEst: "240 mins",
    urgency: "Urgent",
    insuranceProvider: "ICICI Lombard",
    totalAmount: 95000,
    status: "Pre-Op Holding",
    billedAt: null,
    invoiceId: null,
    createdAt: "2026-09-23T11:45:00Z",
    updatedAt: "2026-09-23T11:45:00Z",
    prePrepForm: {
      vitals: { bp: "132/84", pulse: 78, temp: "98.4 F" },
      idTagVerified: true,
      weightKg: 74,
      premedicationGiven: true,
      nasoGastricTube: false,
      enemaGiven: false,
      timeOfLastMicturition: "10:15 AM",
      timeOfLastFeed: "11:00 PM yesterday (NPO > 12h)",
      nailPolishRemoved: true,
      teethJewelsRemoved: true,
      prepShaveSiteDone: true,
      xrayReportsEnclosed: true,
      bloodLabReportsEnclosed: true,
      handedOverByNurse: "Nurse Sarah (Ward 3B)",
      takenOverByOtNurse: "RN Davis (Pre-Op Bay)",
    },
  },
  {
    id: "SURG-106",
    caseNo: "OT-2026-006",
    orRoom: "OR 3",
    patientId: "UMR100142",
    patientName: "Diane Walsh",
    age: 80,
    gender: "Female",
    mrn: "UMR100142",
    ipNo: "IP-884925",
    cptCode: "27130",
    icd10Code: "M16.12",
    procedureName: "Hip Replacement L",
    specialty: "Orthopedics",
    surgeon: "Dr. Adams",
    anesthesiologist: "Dr. Kim",
    scrubNurse: "RN Davis",
    circulatingNurse: "RN Murphy",
    scheduledTime: "09:00 AM",
    durationEst: "180 mins",
    urgency: "Elective",
    insuranceProvider: "Star Health",
    totalAmount: 58000,
    status: "PACU Recovery",
    billedAt: null,
    invoiceId: null,
    createdAt: "2026-09-23T09:00:00Z",
    updatedAt: "2026-09-23T11:45:00Z",
    recoveryAldrete: {
      bedNumber: "PACU Bay 3",
      admissionTime: "11:30 AM",
      aldreteScore: {
        activity: 2,
        respiration: 2,
        circulation: 2,
        consciousness: 2,
        o2Saturation: 1,
        totalScore: 9,
      },
      vitals: { bp: "126/78", hr: 76, spo2: 97 },
      dischargeStatus: "Cleared for Ward",
      wardHandoverNurse: "RN Brenda",
      dischargedBy: "Dr. Kim",
    },
  },
  {
    id: "SURG-107",
    caseNo: "OT-2026-007",
    orRoom: "OR 4",
    patientId: "UMR100388",
    patientName: "Rajesh Verma",
    age: 52,
    gender: "Male",
    mrn: "UMR100388",
    ipNo: "IP-884926",
    cptCode: "49505",
    icd10Code: "K40.90",
    procedureName: "Open Inguinal Hernioplasty with Mesh",
    specialty: "General Surgery",
    surgeon: "Dr. Williams",
    anesthesiologist: "Dr. Rodriguez",
    scrubNurse: "RN Murphy",
    circulatingNurse: "RN Pham",
    scheduledTime: "01:00 PM",
    durationEst: "75 mins",
    urgency: "Elective",
    insuranceProvider: "Bajaj Allianz",
    totalAmount: 34500,
    status: "Discharged",
    billedAt: "2026-09-24T16:00:00Z",
    invoiceId: 100455,
    createdAt: "2026-09-22T08:00:00Z",
    updatedAt: "2026-09-25T16:00:00Z",
    dischargeRecord: {
      dischargedAt: "2026-09-25T16:00:00Z",
      dischargedBy: "Dr. Williams, MS (General Surgery)",
      dischargeType: "Routine Discharge Home",
      conditionAtDischarge: "Clinically stable, afebrile, surgical groin wound clean and dry, walking independently.",
      sutureRemovalDate: "2026-10-02 (POD 8)",
      followUpDate: "2026-10-02 at Surgical OPD Room 12",
      followUpClinic: "General Surgery Outpatient Clinic",
      dischargeMedications: [
        {
          drug: "Tab Cefuroxime Axetil",
          dose: "500 mg",
          route: "Oral",
          frequency: "Twice daily (BD)",
          duration: "5 days",
          instructions: "Take after meals",
        },
        {
          drug: "Tab Aceclofenac + Paracetamol",
          dose: "100mg / 325mg",
          route: "Oral",
          frequency: "Twice daily (BD)",
          duration: "3 days",
          instructions: "Take after meals with water",
        },
        {
          drug: "Tab Pantoprazole",
          dose: "40 mg",
          route: "Oral",
          frequency: "Once daily (OD)",
          duration: "7 days",
          instructions: "Take in the morning 30 mins before breakfast",
        },
      ],
      woundCareInstructions: "Keep groin dressing dry. Avoid heavy lifting (> 5 kg) and strenuous strain for 6 weeks.",
      warningSigns: [
        "Fever > 100.4°F or chills",
        "Severe swelling, redness or active bleeding from incision",
        "Persistent vomiting or inability to tolerate oral liquids",
        "Difficulty passing urine or painful groin swelling",
      ],
      emergencyHelpline: "+91 800-419-7700 (24x7 Surgical Triage)",
      billingSettled: true,
      totalBillAmount: 34500,
    },
  },
  {
    id: "SURG-108",
    caseNo: "OT-2026-088",
    orRoom: "Emergency OR 1",
    patientId: "P-100888",
    patientName: "Appanna Chinnapati",
    age: 54,
    gender: "Male",
    mrn: "100888",
    ipNo: "IP-884988",
    cptCode: "38100",
    icd10Code: "S36.032A",
    procedureName: "Emergency Exploratory Laparotomy + Splenectomy + Jejunal Repair",
    specialty: "General Surgery / Trauma",
    surgeon: "Dr. Vance",
    assistantSurgeon: "Dr. Williams",
    anesthesiologist: "Dr. Rodriguez",
    scrubNurse: "RN Murphy",
    circulatingNurse: "RN Davis",
    scheduledTime: "03:45 AM",
    durationEst: "165 mins",
    urgency: "Emergency STAT",
    insuranceProvider: "Star Health / CM Relief Fund",
    totalAmount: 85000,
    status: "Transferred to ICU",
    billedAt: "2026-10-04T06:30:00Z",
    invoiceId: 100888,
    createdAt: "2026-10-04T03:45:00Z",
    updatedAt: "2026-10-04T06:30:00Z",
    icuTransfer: {
      icuUnit: "SICU",
      bedNo: "SICU Bed 3",
      bedId: 3,
      transferredAt: "2026-10-04T06:30:00Z",
      transferredBy: "Dr. Rodriguez (Anesthesiology)",
      intubated: true,
      ventilatorMode: "SIMV-VC: TV 480mL, RR 16, PEEP 8, FiO2 50%",
      inotropes: "Norepinephrine 0.08 mcg/kg/min titrated for MAP > 65",
      arterialLine: true,
      centralVenousLine: true,
      handoverNotes: "Traumatic splenic laceration with 1800mL hemoperitoneum. Splenectomy & jejunal repair completed. Received 3 units PRBC + 2 FFP. Two 28 Fr drains placed.",
      criticalConcerns: "Watch for coagulopathy, delayed abdominal compartment syndrome, and monitor drain output Q1H.",
    },
    operationRecord: {
      surgeonPreparedInOr: "Dr. Vance",
      preOpDiagnosis: "Blunt Abdominal Trauma, Massive Hemoperitoneum, Splenic Rupture in Hemorrhagic Shock",
      postOpDiagnosis: "Grade IV Splenic Shattered Pole Laceration with 1800 mL Hemoperitoneum, Traumatic Mesenteric Contusion and 2cm Jejunal Seromuscular Tear",
      procedureProposed: "Emergency Exploratory Laparotomy, Splenectomy, Hemoperitoneum Evacuation",
      procedureExecuted: "Exploratory Laparotomy, Splenectomy, Primary Two-Layer Jejunal Repair, Peritoneal Lavage with 4L warm saline, and Bilateral Subdiaphragmatic & Pelvic Closed Suction Drain Placement (28 Fr)",
      asstSurgeons: ["Dr. Williams"],
      skinPreparation: "Povidone Iodine 10% + Chlorhexidine",
      histopathologySent: true,
      photosVideosRecorded: false,
      swabCountCorrect: true,
      instrumentCountCorrect: true,
      suturesUsed: "Loop PDS 1, 3-0 PDS continuous, 3-0 Silk interrupted, Vicryl 2-0, Ethilon 2-0",
      drainageCount: 2,
      bloodLossMl: 1800,
      surgeryStartTime: "2026-10-04T03:45:00Z",
      surgeryEndTime: "2026-10-04T06:30:00Z",
      operatingTimeMins: 165,
      complications: "Intraoperative hemorrhagic shock managed with 3 units PRBC, 2 units FFP, and Norepinephrine infusion",
      surgeonProcedureNotes: "Midline laparotomy incision. Immediate suction of 1800 mL hemoperitoneum and large perisplenic clots. Splenic hilum mobilized and controlled; splenectomy completed with double ligatures. Proximal jejunal 2cm seromuscular tear repaired primarily in two layers with PDS and silk. Thorough warm peritoneal lavage with 4L normal saline. Two 28 Fr closed suction drains placed in left subdiaphragmatic splenic bed and pelvis. Mass closure of abdominal wall with loop PDS. Patient transferred intubated to SICU in guarded condition.",
      postOpInstructions: "Transfer intubated to SICU Bed-3. Strict NPO with Ryle's tube aspiration. Continue IV Meropenem 1g Q8H, Metronidazole 500mg Q8H, IV Tramadol, and IV Pantoprazole. Titrate Norepinephrine for MAP > 65. Serial ABG, Hb, and drain output monitoring Q1H. Transfuse PRBC if Hb < 8 g/dL. Plan post-splenectomy vaccinations prior to discharge.",
      surgeonSignature: "Dr. Vance, MS, MCh (Trauma Surgery)",
    },
  },
]

type CaseInfoBooklet = Partial<SurgicalCaseInfo> & Record<string, unknown>

function toSurgicalCase(row: any): SurgicalCase {
  const booklet = row.booklet || {}
  const caseInfo: CaseInfoBooklet = booklet.caseInfo || {}
  return {
    id: String(row.id),
    caseNo: row.case_no,
    orRoom: row.or_room || "",
    patientId: row.patient_id,
    patientName: (caseInfo.patientName as string) || row.patient_id,
    age: (caseInfo.age as number) ?? 0,
    gender: (caseInfo.gender as SurgicalCase["gender"]) || "Other",
    mrn: (caseInfo.mrn as string) || "",
    ipNo: (caseInfo.ipNo as string) || "",
    procedureName: row.procedure_name,
    cptCode: (caseInfo.cptCode as string) || "",
    icd10Code: (caseInfo.icd10Code as string) || "",
    specialty: (caseInfo.specialty as string) || "",
    surgeon: row.surgeon || "",
    assistantSurgeon: caseInfo.assistantSurgeon as string | undefined,
    anesthesiologist: (caseInfo.anesthesiologist as string) || "",
    scrubNurse: (caseInfo.scrubNurse as string) || "",
    circulatingNurse: (caseInfo.circulatingNurse as string) || "",
    scheduledTime: (caseInfo.scheduledTime as string) || "",
    durationEst: (caseInfo.durationEst as string) || "",
    urgency: (caseInfo.urgency as UrgencyLevel) || "Elective",
    insuranceProvider: (caseInfo.insuranceProvider as string) || "",
    totalAmount: Number(row.total_amount) || 0,
    status: row.status,
    billedAt: row.billed_at || null,
    invoiceId: row.invoice_id ?? null,
    pac: booklet.pac,
    anaesthesiaPlan: booklet.anaesthesiaPlan,
    prePrepForm: booklet.prePrepForm,
    masterChecklist: booklet.masterChecklist,
    whoChecklist: booklet.whoChecklist,
    anaesthesiaRecord: booklet.anaesthesiaRecord,
    operationRecord: booklet.operationRecord,
    recoveryAldrete: booklet.recoveryAldrete,
    wardTransfer: booklet.wardTransfer,
    icuTransfer: booklet.icuTransfer,
    dischargeRecord: booklet.dischargeRecord,
    telemetryLogs: booklet.telemetryLogs,
    currentTelemetry: booklet.currentTelemetry,
    implantsAndConsumables: booklet.implantsAndConsumables,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function caseInfoOf(c: Partial<SurgicalCase>): SurgicalCaseInfo {
  return {
    patientName: c.patientName || "",
    age: c.age ?? 0,
    gender: c.gender || "Other",
    mrn: c.mrn || "",
    ipNo: c.ipNo || "",
    cptCode: c.cptCode || "",
    icd10Code: c.icd10Code || "",
    specialty: c.specialty || "",
    assistantSurgeon: c.assistantSurgeon,
    anesthesiologist: c.anesthesiologist || "",
    scrubNurse: c.scrubNurse || "",
    circulatingNurse: c.circulatingNurse || "",
    scheduledTime: c.scheduledTime || "",
    durationEst: c.durationEst || "",
    urgency: c.urgency || "Elective",
    insuranceProvider: c.insuranceProvider || "",
  }
}

function bookletOf(c: Partial<SurgicalCase>) {
  return {
    caseInfo: caseInfoOf(c),
    pac: c.pac,
    anaesthesiaPlan: c.anaesthesiaPlan,
    prePrepForm: c.prePrepForm,
    masterChecklist: c.masterChecklist,
    whoChecklist: c.whoChecklist,
    anaesthesiaRecord: c.anaesthesiaRecord,
    operationRecord: c.operationRecord,
    recoveryAldrete: c.recoveryAldrete,
    wardTransfer: c.wardTransfer,
    icuTransfer: c.icuTransfer,
    dischargeRecord: c.dischargeRecord,
    telemetryLogs: c.telemetryLogs,
    currentTelemetry: c.currentTelemetry,
    implantsAndConsumables: c.implantsAndConsumables,
  }
}

async function handleGateResponse(promise: Promise<any>): Promise<any> {
  try {
    return await promise
  } catch (err: any) {
    const reason = err?.payload?.reason || err?.reason
    if (reason) throw new OtGateError(reason)
    throw err
  }
}

class SurgeryDbService {
  private cases: SurgicalCase[] = []
  private preferenceCards: SurgeonPreferenceCard[] = DEFAULT_SURGEON_CARDS
  private channel: BroadcastChannel | null = null
  private listeners: Set<() => void> = new Set()

  constructor() {
    this.loadFromCache()
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = () => {
        this.refresh()
      }
    }
  }

  private loadFromCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        this.cases = JSON.parse(raw)
        const currentIds = new Set((this.cases || []).map((c) => c.id))
        const missing = DEFAULT_SEED_CASES.filter((c) => !currentIds.has(c.id))
        if (missing.length > 0) {
          this.cases = [...(this.cases || []), ...missing]
          this.saveToCache()
        }
      }
      if (!this.cases || this.cases.length === 0) {
        this.cases = DEFAULT_SEED_CASES
      }
    } catch {
      this.cases = DEFAULT_SEED_CASES
    }
  }

  private saveToCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.cases))
      if (this.channel) {
        this.channel.postMessage({ type: "SURGERY_UPDATED", timestamp: Date.now() })
      }
    } catch {
      // Storage fallback -- non-fatal, cache is a convenience only.
    }
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn())
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  public getCases(): SurgicalCase[] {
    if (!this.cases || this.cases.length === 0) {
      return DEFAULT_SEED_CASES
    }
    return [...this.cases]
  }

  public getCaseById(id: string): SurgicalCase | undefined {
    return this.getCases().find((c) => c.id === id)
  }

  public getPreferenceCards(): SurgeonPreferenceCard[] {
    return [...this.preferenceCards]
  }

  public async refresh(): Promise<SurgicalCase[]> {
    try {
      const res = await apiFetch<{ cases: any[] }>("/api/ot/cases")
      if (res?.cases && res.cases.length > 0) {
        this.cases = res.cases.map(toSurgicalCase)
      } else if (!this.cases || this.cases.length === 0) {
        this.cases = DEFAULT_SEED_CASES
      }
      this.saveToCache()
    } catch {
      if (!this.cases || this.cases.length === 0) {
        this.cases = DEFAULT_SEED_CASES
      }
    }
    this.notifyListeners()
    return this.getCases()
  }

  public async createCase(
    newCase: Omit<SurgicalCase, "id" | "caseNo" | "billedAt" | "invoiceId" | "createdAt" | "updatedAt" | "status"> & { status?: SurgeryStatus },
  ): Promise<SurgicalCase> {
    try {
      const row = await apiFetch<any>("/api/ot/cases", {
        method: "POST",
        body: JSON.stringify({
          patient_id: newCase.patientId,
          procedure_name: newCase.procedureName,
          or_room: newCase.orRoom,
          surgeon: newCase.surgeon,
          total_amount: newCase.totalAmount,
        }),
      })
      // The booklet's caseInfo (demographics/scheduling) isn't accepted by the
      // create route -- save it right after so the board has it immediately.
      const withInfo = await apiFetch<any>(`/api/ot/cases/${row.id}/booklet`, {
        method: "PUT",
        body: JSON.stringify({ booklet: { caseInfo: caseInfoOf(newCase) } }),
      })
      const created = toSurgicalCase(withInfo)
      await this.refresh()
      return created
    } catch {
      const now = new Date().toISOString()
      const fallbackId = `ot-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
      const caseNo = `OT-2026-${Math.floor(1000 + Math.random() * 9000)}`
      const created: SurgicalCase = {
        ...newCase,
        id: fallbackId,
        caseNo: caseNo,
        status: newCase.status || "PAC Pending",
        createdAt: now,
        updatedAt: now,
      } as SurgicalCase
      this.cases.unshift(created)
      this.saveToCache()
      this.notifyListeners()
      return created
    }
  }

  public async updateCaseStatus(id: string, status: SurgeryStatus): Promise<SurgicalCase> {
    try {
      const row = await handleGateResponse(
        apiFetch<any>(`/api/ot/cases/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      )
      const updated = toSurgicalCase(row)
      await this.refresh()
      return updated
    } catch {
      const existing = this.getCaseById(id)
      if (existing) {
        existing.status = status
        existing.updatedAt = new Date().toISOString()
        this.saveToCache()
        this.notifyListeners()
        return existing
      }
      throw new Error(`Case ${id} not found`)
    }
  }

  public async saveFullBooklet(id: string, bookletData: Partial<SurgicalCase>): Promise<SurgicalCase> {
    const existing = this.getCaseById(id)
    const merged = { ...existing, ...bookletData }
    try {
      const row = await apiFetch<any>(`/api/ot/cases/${id}/booklet`, {
        method: "PUT",
        body: JSON.stringify({ booklet: bookletOf(merged) }),
      })
      const updated = toSurgicalCase(row)
      await this.refresh()
      return updated
    } catch {
      return this.saveCaseDirect(merged as SurgicalCase)
    }
  }

  public async savePacAssessment(id: string, pac: PreAnaestheticAssessment): Promise<SurgicalCase> {
    try {
      const row = await apiFetch<any>(`/api/ot/cases/${id}/pac`, {
        method: "POST",
        body: JSON.stringify(pac),
      })
      const updated = toSurgicalCase(row)
      await this.refresh()
      return updated
    } catch {
      const existing = this.getCaseById(id)
      if (existing) {
        existing.pac = pac
        existing.status = "PAC Cleared"
        existing.updatedAt = new Date().toISOString()
        this.saveToCache()
        this.notifyListeners()
        return existing
      }
      throw new Error(`Case ${id} not found`)
    }
  }

  public async saveWhoChecklist(id: string, who: WhoSafetyChecklist): Promise<SurgicalCase> {
    try {
      const row = await apiFetch<any>(`/api/ot/cases/${id}/who-checklist`, {
        method: "POST",
        body: JSON.stringify(who),
      })
      const updated = toSurgicalCase(row)
      await this.refresh()
      return updated
    } catch {
      const existing = this.getCaseById(id)
      if (existing) {
        existing.whoChecklist = who
        existing.updatedAt = new Date().toISOString()
        this.saveToCache()
        this.notifyListeners()
        return existing
      }
      throw new Error(`Case ${id} not found`)
    }
  }

  /** Saving the PACU/Aldrete section also triggers billing server-side once
   * dischargeStatus leaves "In PACU" -- see modules/ot/routes.py's
   * ot_save_pacu, which stamps billed_at exactly once per case. */
  public async savePacuRecord(id: string, pacu: RecoveryAldreteDetail): Promise<SurgicalCase> {
    try {
      const row = await apiFetch<any>(`/api/ot/cases/${id}/pacu`, {
        method: "POST",
        body: JSON.stringify(pacu),
      })
      const updated = toSurgicalCase(row)
      await this.refresh()
      return updated
    } catch {
      const existing = this.getCaseById(id)
      if (existing) {
        existing.recoveryAldrete = pacu
        existing.updatedAt = new Date().toISOString()
        this.saveToCache()
        this.notifyListeners()
        return existing
      }
      throw new Error(`Case ${id} not found`)
    }
  }
  public async saveCaseDirect(c: SurgicalCase): Promise<SurgicalCase> {
    const idx = this.cases.findIndex((item) => item.id === c.id)
    if (idx !== -1) {
      this.cases[idx] = c
    } else {
      this.cases.unshift(c)
    }
    this.saveToCache()
    this.notifyListeners()

    try {
      await apiFetch<any>(`/api/ot/cases/${c.id}/booklet`, {
        method: "PUT",
        body: JSON.stringify({ booklet: bookletOf(c) }),
      })
    } catch {
      // Offline fallback ok
    }

    return c
  }

  public async transferToWard(
    id: string,
    wardCare: WardPostOpCare,
  ): Promise<SurgicalCase> {
    const existing = this.getCaseById(id)
    if (!existing) throw new Error("Case not found")

    if (wardCare.bedId) {
      try {
        BedDatabase.assignBed(
          wardCare.bedId,
          {
            patient_id: existing.patientId || existing.mrn,
            name: existing.patientName,
            age: existing.age,
            gender: existing.gender,
          },
          `Post-Op Surgical Admission: ${existing.procedureName} (Surgeon: Dr. ${existing.surgeon})`,
          4,
        )
      } catch (err) {
        console.warn("Could not automatically assign bed in BedDatabase:", err)
      }
    }

    const updatedCase: SurgicalCase = {
      ...existing,
      status: "Transferred to Ward",
      wardTransfer: {
        dailyProgressNotes: [],
        ...wardCare,
        postOpDay: wardCare.postOpDay ?? 0,
      },
      updatedAt: new Date().toISOString(),
    }

    return this.saveCaseDirect(updatedCase)
  }

  public async transferToIcu(
    id: string,
    icuCare: IcuPostOpCare,
  ): Promise<SurgicalCase> {
    const existing = this.getCaseById(id)
    if (!existing) throw new Error("Case not found")

    if (icuCare.bedId) {
      try {
        BedDatabase.assignBed(
          icuCare.bedId,
          {
            patient_id: existing.patientId || existing.mrn,
            name: existing.patientName,
            age: existing.age,
            gender: existing.gender,
          },
          `Critical Post-Op SICU Transfer: ${existing.procedureName} (Intubated: ${icuCare.intubated ? "Yes" : "No"})`,
          3,
        )
      } catch (err) {
        console.warn("Could not automatically assign ICU bed in BedDatabase:", err)
      }
    }

    const updatedCase: SurgicalCase = {
      ...existing,
      status: "Transferred to ICU",
      icuTransfer: icuCare,
      updatedAt: new Date().toISOString(),
    }

    return this.saveCaseDirect(updatedCase)
  }

  public async recordWardDailyMilestone(
    id: string,
    milestone: {
      pod: number
      drainStatus: string
      drainOutputMl?: number
      woundStatus: string
      dietStatus: string
      mobilizationStatus: string
      painScoreVas: number
      clinicalNotes: string
      orders: string
      author: string
    },
  ): Promise<SurgicalCase> {
    const existing = this.getCaseById(id)
    if (!existing) throw new Error("Case not found")

    const existingWard = existing.wardTransfer || {
      wardName: "Surgical Inpatient Ward",
      roomNo: "201",
      bedNo: "Bed 1",
      transferredAt: new Date().toISOString(),
      transferredBy: milestone.author,
      handoverNotes: "Post-op recovery on ward",
      postOpDay: milestone.pod,
      drainStatus: milestone.drainStatus,
      woundStatus: milestone.woundStatus,
      dietStatus: milestone.dietStatus,
      mobilizationStatus: milestone.mobilizationStatus,
      painScoreVas: milestone.painScoreVas,
      dailyProgressNotes: [],
    }

    const progressNote = {
      id: `NOTE-${Date.now()}`,
      date: new Date().toISOString(),
      pod: milestone.pod,
      author: milestone.author,
      vitalsSummary: `Pain: ${milestone.painScoreVas}/10 · Diet: ${milestone.dietStatus} · Mobilization: ${milestone.mobilizationStatus}`,
      clinicalNotes: milestone.clinicalNotes,
      orders: milestone.orders,
    }

    const updatedWard: WardPostOpCare = {
      ...existingWard,
      postOpDay: milestone.pod,
      drainStatus: milestone.drainStatus,
      drainOutputMl: milestone.drainOutputMl,
      woundStatus: milestone.woundStatus,
      dietStatus: milestone.dietStatus,
      mobilizationStatus: milestone.mobilizationStatus,
      painScoreVas: milestone.painScoreVas,
      dailyProgressNotes: [...(existingWard.dailyProgressNotes || []), progressNote],
    }

    const updatedCase: SurgicalCase = {
      ...existing,
      wardTransfer: updatedWard,
      updatedAt: new Date().toISOString(),
    }

    return this.saveCaseDirect(updatedCase)
  }

  public async dischargeSurgicalPatient(
    id: string,
    discharge: SurgicalDischargeRecord,
  ): Promise<SurgicalCase> {
    const existing = this.getCaseById(id)
    if (!existing) throw new Error("Case not found")

    const bedId = existing.wardTransfer?.bedId || existing.icuTransfer?.bedId
    if (bedId) {
      try {
        BedDatabase.releaseBed(
          bedId,
          `Surgical Discharge: ${existing.procedureName} - ${discharge.conditionAtDischarge}`,
          existing.totalAmount,
        )
      } catch (err) {
        console.warn("Could not release bed in BedDatabase:", err)
      }
    }

    const updatedCase: SurgicalCase = {
      ...existing,
      status: "Discharged",
      dischargeRecord: discharge,
      billedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return this.saveCaseDirect(updatedCase)
  }

  public updateTelemetry(id: string, reading: TelemetryReading): SurgicalCase {
    const existing = this.getCaseById(id)
    if (!existing) throw new Error("Case not found")

    const updatedCase: SurgicalCase = {
      ...existing,
      currentTelemetry: reading,
      telemetryLogs: [...(existing.telemetryLogs || []).slice(-30), reading],
      updatedAt: new Date().toISOString(),
    }

    const idx = this.cases.findIndex((c) => c.id === id)
    if (idx !== -1) {
      this.cases[idx] = updatedCase
      this.saveToCache()
      this.notifyListeners()
    }
    return updatedCase
  }

  public addConsumableOrImplant(id: string, item: SurgicalConsumableItem): SurgicalCase {
    const existing = this.getCaseById(id)
    if (!existing) throw new Error("Case not found")

    const items = [...(existing.implantsAndConsumables || []), item]
    const addedCost = item.unitCost * item.quantity
    const updatedCase: SurgicalCase = {
      ...existing,
      implantsAndConsumables: items,
      totalAmount: existing.totalAmount + addedCost,
      updatedAt: new Date().toISOString(),
    }

    const idx = this.cases.findIndex((c) => c.id === id)
    if (idx !== -1) {
      this.cases[idx] = updatedCase
      this.saveToCache()
      this.notifyListeners()
    }
    return updatedCase
  }
}

export const SurgeryDatabase = new SurgeryDbService()
