/**
 * HospAI Enterprise Laboratory Information System (LIS) Service
 * Comprehensive state engine for:
 * 1. Specimen Accessioning & Barcode Traceability
 * 2. Department Worklists & Processing Benches
 * 3. Analyzer Management (HL7 v2 / ASTM protocols & Test Code Mappings)
 * 4. Technical Validation & Pathologist Sign-Off Workflows
 * 5. Panic Limit Critical Alerts & Clinician Communication Logs
 * 6. Levey-Jennings Quality Control & Westgard Rules
 * 7. LIS Laboratory Settings & Tube Configurations
 */

import {
  LabOrder,
  LabOrderTest,
  LabOrderDatabase,
  LabParameterResult,
  priceForTest,
  LabTestStatus,
} from "./labOrdersDb"
import {
  ALL_LAB_TESTS,
  LAB_CATALOGUE,
  findTestDefinition,
  LabTestDefinition,
  evaluateFlag,
} from "../components/laboratory/labCatalogueSchema"
import { DiagnosticTariffDatabase } from "./diagnosticTariffDb"
import { BillingDatabase } from "./billingDb"
import { db } from "./db"
import { AuditDatabase } from "./auditDb"

// ─── STORAGE KEYS & EVENTS ───────────────────────────────────────────────────
const STORAGE_KEY_SPECIMENS = "hospai_lis_specimens_v1"
const STORAGE_KEY_ANALYZERS = "hospai_lis_analyzers_v1"
const STORAGE_KEY_CRITICAL_ALERTS = "hospai_lis_critical_alerts_v1"
const STORAGE_KEY_QC_RECORDS = "hospai_lis_qc_records_v1"
const STORAGE_KEY_SETTINGS = "hospai_lis_settings_v1"
const LIS_UPDATE_EVENT = "hospai_lis_updated"

// ─── TYPE DEFINITIONS ────────────────────────────────────────────────────────

export type SpecimenType =
  | "Whole Blood"
  | "Serum"
  | "Plasma"
  | "Urine (Random)"
  | "Urine (24h)"
  | "CSF"
  | "Sputum"
  | "Stool"
  | "Swab"
  | "Body Fluid"
  | "Biopsy Tissue"

export type TubeColor =
  | "Lavender (EDTA)"
  | "Red (Plain Serum)"
  | "Gold/Yellow (SST Gel)"
  | "Light Blue (Sodium Citrate)"
  | "Grey (Sodium Fluoride)"
  | "Green (Heparin)"
  | "Sterile Cup"
  | "Swab Transport Medium"

export type SpecimenCondition =
  | "Good"
  | "Hemolyzed"
  | "Lipemic"
  | "Icteric"
  | "Clotted"
  | "Insufficient Quantity (QNS)"
  | "Leaked / Damaged"

export type SpecimenStatus =
  | "Collection Pending"
  | "Collected"
  | "Received & Accepted"
  | "Rejected"
  | "Recollection Requested"

export interface SpecimenRecord {
  id: string // e.g. SPEC-2026-00412
  barcode: string // e.g. 890126004128
  orderId: string
  umr: string
  patientName: string
  age: number
  sex: string
  specimenType: SpecimenType
  tubeColor: TubeColor
  department: string
  testsIncluded: string[] // Test IDs
  status: SpecimenStatus
  condition: SpecimenCondition
  collectedAt?: string
  collectedBy?: string
  collectionLocation?: string
  receivedAt?: string
  receivedBy?: string
  rejectionReason?: string
  createdAt?: string
  exceptionOverride?: {
    approvedBy: string
    reason: string
    timestamp: string
  }
}

export type LabDepartmentName =
  | "Hematology"
  | "Clinical Biochemistry"
  | "Microbiology"
  | "Serology & Immunology"
  | "Clinical Pathology & Urinalysis"
  | "Histopathology & Cytology"
  | "Molecular Diagnostics"

export interface LabAnalyzer {
  id: string // e.g. ANA-01
  name: string
  model: string
  manufacturer: string
  department: LabDepartmentName
  interfaceProtocol: "HL7 v2.5.1" | "ASTM 1394-97" | "REST API" | "Direct Serial RS-232"
  connectionStatus: "Connected" | "Transmitting" | "Maintenance" | "Offline"
  ipAddress: string
  port: number
  lastCommunication: string
  testMappings: { analyzerCode: string; catalogTestName: string }[]
  messagesReceivedToday: number
  errorCount: number
}

export interface AnalyzerRawMessage {
  id: string
  timestamp: string
  analyzerId: string
  analyzerName: string
  protocol: string
  direction: "INBOUND" | "OUTBOUND"
  rawPayload: string
  parsedSpecimenBarcode?: string
  status: "Processed" | "Mapped" | "Validation Pending" | "Error"
  mappedObservationsCount: number
}

export interface CriticalAlertRecord {
  id: string
  orderId: string
  testId: string
  testName: string
  parameterName: string
  observedValue: string
  panicLimits: string
  patientName: string
  umr: string
  department: string
  detectedAt: string
  orderingDoctor: string
  status: "Active Alert" | "Acknowledged" | "Escalated" | "Resolved"
  acknowledgedBy?: string
  acknowledgedAt?: string
  physicianNotified?: string
  notificationMethod?: "Phone Call" | "Direct Hospital Pager" | "Clinical Intercom" | "SMS Alert"
  notes?: string
}

export interface QualityControlEntry {
  id: string
  date: string
  instrumentName: string
  department: string
  analyte: string
  controlLevel: "Level 1 (Normal)" | "Level 2 (High)" | "Level 3 (Low)"
  lotNumber: string
  expiryDate: string
  targetMean: number
  targetSd: number
  observedValue: number
  zScore: number
  status: "In Control (Pass)" | "Warning (1:2s)" | "Out of Control (1:3s)" | "Reject (2:2s)"
  technician: string
  correctiveAction?: string
}

export interface LisSettings {
  hospitalName: string
  laboratoryAccreditation: string // e.g. "NABL & CAP Accredited Diagnostic Laboratory"
  directorName: string
  defaultAutoReleaseRoutine: boolean
  barcodePrefix: string
  departments: LabDepartmentName[]
  tatBenchmarkMinutes: Record<string, number>
  tubeColorGuide: { tube: TubeColor; additive: string; departments: string[] }[]
}

// ─── DEFAULT SEED DATA ───────────────────────────────────────────────────────

const DEFAULT_ANALYZERS: LabAnalyzer[] = [
  {
    id: "ANA-001",
    name: "Sysmex XN-1000",
    model: "XN-1000 Automated Hematology Analyzer",
    manufacturer: "Sysmex Corporation",
    department: "Hematology",
    interfaceProtocol: "HL7 v2.5.1",
    connectionStatus: "Connected",
    ipAddress: "192.168.10.45",
    port: 5001,
    lastCommunication: "Just now",
    testMappings: [
      { analyzerCode: "WBC", catalogTestName: "Complete Blood Count (CBC)" },
      { analyzerCode: "RBC", catalogTestName: "Complete Blood Count (CBC)" },
      { analyzerCode: "HGB", catalogTestName: "Complete Blood Count (CBC)" },
      { analyzerCode: "PLT", catalogTestName: "Complete Blood Count (CBC)" },
    ],
    messagesReceivedToday: 148,
    errorCount: 0,
  },
  {
    id: "ANA-002",
    name: "Roche Cobas c501",
    model: "Cobas 6000 Core Module c501",
    manufacturer: "Roche Diagnostics",
    department: "Clinical Biochemistry",
    interfaceProtocol: "ASTM 1394-97",
    connectionStatus: "Connected",
    ipAddress: "192.168.10.46",
    port: 5002,
    lastCommunication: "2 mins ago",
    testMappings: [
      { analyzerCode: "GLUC", catalogTestName: "Fasting Blood Sugar (FBS)" },
      { analyzerCode: "CREA", catalogTestName: "Serum Creatinine" },
      { analyzerCode: "UREA", catalogTestName: "Blood Urea" },
      { analyzerCode: "LIPID", catalogTestName: "Lipid Profile" },
      { analyzerCode: "LFT", catalogTestName: "Liver Function Test (LFT)" },
    ],
    messagesReceivedToday: 215,
    errorCount: 1,
  },
  {
    id: "ANA-003",
    name: "Abbott Architect ci8200",
    model: "Architect ci8200 Immunoassay System",
    manufacturer: "Abbott Laboratories",
    department: "Serology & Immunology",
    interfaceProtocol: "HL7 v2.5.1",
    connectionStatus: "Transmitting",
    ipAddress: "192.168.10.48",
    port: 5004,
    lastCommunication: "1 min ago",
    testMappings: [
      { analyzerCode: "TSH", catalogTestName: "Thyroid Stimulating Hormone (TSH)" },
      { analyzerCode: "TROP-I", catalogTestName: "Troponin I - High Sensitivity (hs-cTnI)" },
      { analyzerCode: "HBSAG", catalogTestName: "Hepatitis B Surface Antigen (HBsAg)" },
      { analyzerCode: "HIV-AGAB", catalogTestName: "HIV 1 & 2 Antibody & p24 Antigen" },
    ],
    messagesReceivedToday: 94,
    errorCount: 0,
  },
  {
    id: "ANA-004",
    name: "bioMérieux VITEK 2",
    model: "VITEK 2 Compact ID/AST System",
    manufacturer: "bioMérieux",
    department: "Microbiology",
    interfaceProtocol: "REST API",
    connectionStatus: "Connected",
    ipAddress: "192.168.10.50",
    port: 8080,
    lastCommunication: "12 mins ago",
    testMappings: [
      { analyzerCode: "UR-CULT", catalogTestName: "Urine Culture & Sensitivity" },
      { analyzerCode: "BLD-CULT", catalogTestName: "Blood Culture & Sensitivity" },
    ],
    messagesReceivedToday: 32,
    errorCount: 0,
  },
  {
    id: "ANA-005",
    name: "Sysmex UC-3500",
    model: "Fully Automated Urine Chemistry Analyzer",
    manufacturer: "Sysmex Corporation",
    department: "Clinical Pathology & Urinalysis",
    interfaceProtocol: "ASTM 1394-97",
    connectionStatus: "Connected",
    ipAddress: "192.168.10.52",
    port: 5006,
    lastCommunication: "4 mins ago",
    testMappings: [
      { analyzerCode: "CUE-CHEM", catalogTestName: "Complete Urine Examination (CUE)" },
    ],
    messagesReceivedToday: 68,
    errorCount: 0,
  },
]

const DEFAULT_QC_ENTRIES: QualityControlEntry[] = [
  {
    id: "QC-2026-01",
    date: new Date().toISOString().split("T")[0],
    instrumentName: "Roche Cobas c501",
    department: "Clinical Biochemistry",
    analyte: "Glucose (Fasting)",
    controlLevel: "Level 1 (Normal)",
    lotNumber: "LOT-GLU-9921",
    expiryDate: "2026-12-31",
    targetMean: 95.0,
    targetSd: 3.2,
    observedValue: 94.6,
    zScore: -0.12,
    status: "In Control (Pass)",
    technician: "Ramesh Sharma (Sr. Biochemist)",
  },
  {
    id: "QC-2026-02",
    date: new Date().toISOString().split("T")[0],
    instrumentName: "Roche Cobas c501",
    department: "Clinical Biochemistry",
    analyte: "Serum Creatinine",
    controlLevel: "Level 1 (Normal)",
    lotNumber: "LOT-CREA-8810",
    expiryDate: "2026-11-30",
    targetMean: 1.05,
    targetSd: 0.05,
    observedValue: 1.04,
    zScore: -0.2,
    status: "In Control (Pass)",
    technician: "Ramesh Sharma (Sr. Biochemist)",
  },
  {
    id: "QC-2026-03",
    date: new Date().toISOString().split("T")[0],
    instrumentName: "Sysmex XN-1000",
    department: "Hematology",
    analyte: "Hemoglobin (Hb)",
    controlLevel: "Level 2 (High)",
    lotNumber: "LOT-XN-HEM-404",
    expiryDate: "2026-10-31",
    targetMean: 14.8,
    targetSd: 0.35,
    observedValue: 15.1,
    zScore: 0.85,
    status: "In Control (Pass)",
    technician: "Kavita Pillai (Hematology Tech)",
  },
  {
    id: "QC-2026-04",
    date: new Date().toISOString().split("T")[0],
    instrumentName: "Abbott Architect ci8200",
    department: "Serology & Immunology",
    analyte: "hs-Troponin I",
    controlLevel: "Level 1 (Normal)",
    lotNumber: "LOT-TROP-7714",
    expiryDate: "2027-01-15",
    targetMean: 8.5,
    targetSd: 0.6,
    observedValue: 8.3,
    zScore: -0.33,
    status: "In Control (Pass)",
    technician: "Anjali Gupta (Pathology QA)",
  },
]

const DEFAULT_SETTINGS: LisSettings = {
  hospitalName: "HospAI Super Specialty Hospital & Research Institute",
  laboratoryAccreditation: "NABL (ISO 15189:2022) & CAP Certified Clinical Diagnostic Laboratory",
  directorName: "Dr. Arvind Swaminathan, MD (Pathology), DNB, FICP",
  defaultAutoReleaseRoutine: false,
  barcodePrefix: "SPEC",
  departments: [
    "Hematology",
    "Clinical Biochemistry",
    "Microbiology",
    "Serology & Immunology",
    "Clinical Pathology & Urinalysis",
    "Histopathology & Cytology",
    "Molecular Diagnostics",
  ],
  tatBenchmarkMinutes: {
    STAT: 45,
    Urgent: 120,
    Routine: 240,
    Microbiology: 2880,
    Histopathology: 4320,
  },
  tubeColorGuide: [
    {
      tube: "Lavender (EDTA)",
      additive: "K2/K3 EDTA (Anticoagulant)",
      departments: ["Hematology", "Molecular Diagnostics", "HbA1c"],
    },
    {
      tube: "Gold/Yellow (SST Gel)",
      additive: "Clot Activator & Polymer Gel Separator",
      departments: ["Clinical Biochemistry", "Serology & Immunology", "Endocrinology"],
    },
    {
      tube: "Red (Plain Serum)",
      additive: "Silica Clot Activator (No Gel)",
      departments: ["Crossmatch / Blood Bank", "Drug Levels", "Special Serology"],
    },
    {
      tube: "Light Blue (Sodium Citrate)",
      additive: "3.2% Buffered Sodium Citrate (1:9 ratio)",
      departments: ["Coagulation (PT/INR, APTT, D-Dimer)"],
    },
    {
      tube: "Grey (Sodium Fluoride)",
      additive: "Sodium Fluoride & Potassium Oxalate (Glycolytic Inhibitor)",
      departments: ["Blood Glucose (Fasting / PP / Random)", "Lactate"],
    },
    {
      tube: "Sterile Cup",
      additive: "Boric Acid / Plain Sterile Container",
      departments: ["Clinical Pathology (Urine)", "Microbiology (Urine/Sputum Culture)"],
    },
  ],
}

let cachedSpecimens: SpecimenRecord[] | null = null
let cachedCriticalAlerts: CriticalAlertRecord[] | null = null

export function invalidateLisCache(): void {
  cachedSpecimens = null
  cachedCriticalAlerts = null
}

LabOrderDatabase.subscribe(() => {
  cachedSpecimens = null
  cachedCriticalAlerts = null
})

// ─── ENTERPRISE LIS ENGINE ───────────────────────────────────────────────────

export class LabLisService {
  private static load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return fallback
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  private static save<T>(key: string, data: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(data))
      if (key === STORAGE_KEY_SPECIMENS) cachedSpecimens = data as any
      if (key === STORAGE_KEY_CRITICAL_ALERTS) cachedCriticalAlerts = data as any
      this.dispatchUpdate()
    } catch (e) {
      console.error("Failed to persist LIS data:", e)
    }
  }

  static dispatchUpdate(): void {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LIS_UPDATE_EVENT))
    }
  }

  static subscribe(cb: () => void): () => void {
    if (typeof window === "undefined") return () => {}
    const handler = () => cb()
    window.addEventListener(LIS_UPDATE_EVENT, handler)
    return () => window.removeEventListener(LIS_UPDATE_EVENT, handler)
  }

  // ─── 1. SPECIMEN MANAGEMENT & BARCODES ─────────────────────────────────────

  /**
   * Resolves or generates the specimens needed for an order based on tests ordered.
   */

  static getSpecimens(): SpecimenRecord[] {
    if (cachedSpecimens) return cachedSpecimens

    const orders = LabOrderDatabase.getOrders()
    const stored = this.load<SpecimenRecord[]>(STORAGE_KEY_SPECIMENS, [])
    const specimenMap = new Map<string, SpecimenRecord>()
    stored.forEach((s) => specimenMap.set(s.id, s))

    let mutated = false

    // Auto-generate specimens for orders that don't have them yet
    orders.forEach((order) => {
      // Group tests by compatible tube/specimen type
      const tubeGroups: Record<TubeColor, { tests: string[]; sampleType: SpecimenType; dept: string }> = {} as any

      order.tests.forEach((t) => {
        const def = findTestDefinition(t.name)
        let tube: TubeColor = "Gold/Yellow (SST Gel)"
        let sampleType: SpecimenType = "Serum"
        let dept = def?.category || "Clinical Biochemistry"

        const lowerName = t.name.toLowerCase()
        if (
          lowerName.includes("cbc") ||
          lowerName.includes("blood count") ||
          lowerName.includes("esr") ||
          lowerName.includes("hemoglobin")
        ) {
          tube = "Lavender (EDTA)"
          sampleType = "Whole Blood"
          dept = "Hematology"
        } else if (lowerName.includes("glucose") || lowerName.includes("sugar")) {
          tube = "Grey (Sodium Fluoride)"
          sampleType = "Plasma"
          dept = "Clinical Biochemistry"
        } else if (lowerName.includes("pt") || lowerName.includes("inr") || lowerName.includes("dimer")) {
          tube = "Light Blue (Sodium Citrate)"
          sampleType = "Plasma"
          dept = "Hematology"
        } else if (lowerName.includes("urine") || lowerName.includes("cue")) {
          tube = "Sterile Cup"
          sampleType = "Urine (Random)"
          dept = "Clinical Pathology & Urinalysis"
        } else if (lowerName.includes("culture") || lowerName.includes("swab")) {
          tube = "Sterile Cup"
          sampleType = "Body Fluid"
          dept = "Microbiology"
        }

        if (!tubeGroups[tube]) {
          tubeGroups[tube] = { tests: [], sampleType, dept }
        }
        tubeGroups[tube].tests.push(t.name)
      })

      // Create a specimen record for each required tube
      Object.entries(tubeGroups).forEach(([tubeName, info], idx) => {
        const specId = `SPEC-${order.id}-${idx + 1}`
        if (!specimenMap.has(specId)) {
          const barcodeNum = (
            "890" +
            Math.abs(order.id.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0))
              .toString()
              .padEnd(8, "0")
              .slice(0, 8) +
            idx
          ).slice(0, 12)

          const newSpec: SpecimenRecord = {
            id: specId,
            barcode: barcodeNum,
            orderId: order.id,
            umr: order.umr,
            patientName: order.patientName,
            age: order.age,
            sex: order.sex,
            specimenType: info.sampleType,
            tubeColor: tubeName as TubeColor,
            department: info.dept,
            testsIncluded: info.tests,
            status:
              order.status === "Billed" || order.status === "Awaiting Billing"
                ? "Collection Pending"
                : order.status === "Sample Collected"
                  ? "Collected"
                  : "Received & Accepted",
            condition: "Good",
            createdAt: order.createdAt || new Date().toISOString(),
            collectedAt: order.status !== "Awaiting Billing" && order.status !== "Billed" ? order.createdAt : undefined,
            collectedBy: order.status !== "Awaiting Billing" && order.status !== "Billed" ? "Phlebotomist (Duty)" : undefined,
          }
          specimenMap.set(specId, newSpec)
          mutated = true
        }
      })
    })

    const list = Array.from(specimenMap.values())
    if (mutated) {
      try {
        localStorage.setItem(STORAGE_KEY_SPECIMENS, JSON.stringify(list))
      } catch {}
    }
    cachedSpecimens = list
    return list
  }

  static collectSpecimen(specimenId: string, collectorName = "Staff Phlebotomist", location = "Central Phlebotomy Lab"): boolean {
    const list = this.getSpecimens()
    const target = list.find((s) => s.id === specimenId)
    if (!target) return false

    target.status = "Collected"
    target.collectedAt = new Date().toISOString()
    target.collectedBy = collectorName
    target.collectionLocation = location

    this.save(STORAGE_KEY_SPECIMENS, list)

    // Advance linked order to 'Sample Collected' if all specimens are collected
    const orderSpecs = list.filter((s) => s.orderId === target.orderId)
    const allCollected = orderSpecs.every((s) => s.status !== "Collection Pending")
    if (allCollected) {
      LabOrderDatabase.advanceStatus(target.orderId, "Sample Collected", collectorName)
    }

    AuditDatabase.logEvent(
      "Specimen Collected",
      "Laboratory",
      `Specimen ${target.id} (${target.tubeColor}) collected for patient ${target.patientName} (${target.umr}) by ${collectorName}.`,
      "Success",
    )
    return true
  }

  static receiveSpecimen(
    specimenId: string,
    condition: SpecimenCondition,
    technicianName = "Accessioning Tech",
    rejectionReason?: string,
  ): boolean {
    const list = this.getSpecimens()
    const target = list.find((s) => s.id === specimenId)
    if (!target) return false

    target.condition = condition
    target.receivedAt = new Date().toISOString()
    target.receivedBy = technicianName

    if (condition !== "Good") {
      target.status = "Rejected"
      target.rejectionReason = rejectionReason || `Unacceptable specimen condition: ${condition}`
      AuditDatabase.logEvent(
        "Specimen Rejected",
        "Laboratory",
        `Specimen ${target.id} REJECTED due to ${target.rejectionReason}. Action required: Recollection.`,
        "Failed",
      )
    } else {
      target.status = "Received & Accepted"
      // Progress order to In Progress
      LabOrderDatabase.advanceStatus(target.orderId, "In Progress", technicianName)
      AuditDatabase.logEvent(
        "Specimen Accepted",
        "Laboratory",
        `Specimen ${target.id} accepted by ${technicianName} and routed to ${target.department} worklist.`,
        "Success",
      )
    }

    this.save(STORAGE_KEY_SPECIMENS, list)
    return true
  }

  static requestRecollection(specimenId: string, reason: string, requester: string): boolean {
    const list = this.getSpecimens()
    const target = list.find((s) => s.id === specimenId)
    if (!target) return false

    target.status = "Recollection Requested"
    target.rejectionReason = reason

    this.save(STORAGE_KEY_SPECIMENS, list)
    AuditDatabase.logEvent(
      "Recollection Requested",
      "Laboratory",
      `Recollection requested for specimen ${target.id} (${target.patientName}) by ${requester}. Reason: ${reason}.`,
      "Failed",
    )
    return true
  }

  // ─── 2. ANALYZER MANAGEMENT & SIMULATION ───────────────────────────────────

  static getAnalyzers(): LabAnalyzer[] {
    return this.load<LabAnalyzer[]>(STORAGE_KEY_ANALYZERS, DEFAULT_ANALYZERS)
  }

  static updateAnalyzerStatus(analyzerId: string, status: LabAnalyzer["connectionStatus"]): void {
    const list = this.getAnalyzers()
    const target = list.find((a) => a.id === analyzerId)
    if (target) {
      target.connectionStatus = status
      target.lastCommunication = "Just now"
      this.save(STORAGE_KEY_ANALYZERS, list)
    }
  }

  /**
   * Generates a realistic simulated HL7 v2.5.1 ORU^R01 observation message from an analyzer.
   */
  static simulateAnalyzerTransmission(analyzerId: string): { message: string; observationsCount: number } {
    const analyzers = this.getAnalyzers()
    const analyzer = analyzers.find((a) => a.id === analyzerId) || analyzers[0]
    const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)
    const controlId = `MSG${Math.floor(100000 + Math.random() * 900000)}`

    // Pick an in-progress or billed order to attach results to
    const orders = LabOrderDatabase.getOrders().filter((o) => o.status !== "Completed" && o.status !== "Cancelled")
    const order = orders[0] || LabOrderDatabase.getOrders()[0]
    const barcode = `89012600${Math.floor(1000 + Math.random() * 9000)}`

    let hl7 = `MSH|^~\\&|${analyzer.name}|HOSP_LAB|HOSPAI_HMS|MAIN|${timestamp}||ORU^R01|${controlId}|P|2.5.1\n`
    hl7 += `PID|1||${order?.umr || "UMR10001"}||${order?.patientName || "Aditya Sharma"}||19850615|M\n`
    hl7 += `OBR|1|${order?.id || "ORD-001"}|${analyzer.id}|CBC^Complete Blood Count|||${timestamp}||||||||||||||||HM\n`
    hl7 += `OBX|1|NM|WBC^White Blood Cells||${(6.8 + Math.random() * 2).toFixed(1)}|10^3/uL|4.0-11.0|N|||F\n`
    hl7 += `OBX|2|NM|RBC^Red Blood Cells||${(4.9 + Math.random() * 0.4).toFixed(2)}|10^6/uL|4.5-5.9|N|||F\n`
    hl7 += `OBX|3|NM|HGB^Hemoglobin||${(14.2 + Math.random() * 1.5).toFixed(1)}|g/dL|13.5-17.5|N|||F\n`
    hl7 += `OBX|4|NM|PLT^Platelets||${Math.floor(220 + Math.random() * 60)}|10^3/uL|150-450|N|||F`

    // Increment analyzer stats
    analyzer.messagesReceivedToday += 1
    analyzer.lastCommunication = "Just now"
    this.save(STORAGE_KEY_ANALYZERS, analyzers)

    AuditDatabase.logEvent(
      "Analyzer HL7 Received",
      "Laboratory",
      `Inbound HL7 ORU^R01 observation transmission received from ${analyzer.name} (Control ID: ${controlId}).`,
      "Success",
    )

    return { message: hl7, observationsCount: 4 }
  }

  // ─── 3. CRITICAL ALERTS & CLINICIAN COMMUNICATION ─────────────────────────

  static getCriticalAlerts(): CriticalAlertRecord[] {
    if (cachedCriticalAlerts) return cachedCriticalAlerts
    const stored = this.load<CriticalAlertRecord[]>(STORAGE_KEY_CRITICAL_ALERTS, [])
    const orders = LabOrderDatabase.getOrders()

    // Scan all orders for tests with Critical flags and generate alerts
    const alertsMap = new Map<string, CriticalAlertRecord>()
    stored.forEach((a) => alertsMap.set(a.id, a))

    orders.forEach((order) => {
      order.tests.forEach((test) => {
        if (test.flag === "Critical" || (test.results && Object.values(test.results).some((r) => r.flag === "Critical"))) {
          const alertId = `CRIT-${order.id}-${test.id}`
          if (!alertsMap.has(alertId)) {
            const critParam = Object.entries(test.results || {}).find(([_, r]) => r.flag === "Critical")
            const paramName = critParam ? critParam[0] : test.name
            const obsVal = critParam ? critParam[1].value : test.result || "CRITICAL"
            const panicRange = critParam ? critParam[1].referenceRange || "Panic Limit Exceeded" : "Critical Range"

            alertsMap.set(alertId, {
              id: alertId,
              orderId: order.id,
              testId: test.id,
              testName: test.name,
              parameterName: paramName,
              observedValue: obsVal,
              panicLimits: panicRange,
              patientName: order.patientName,
              umr: order.umr,
              department: test.category || "Clinical Pathology",
              detectedAt: test.resultedAt || order.updatedAt,
              orderingDoctor: order.doctorName || "Attending Physician",
              status: "Active Alert",
            })
          }
        }
      })
    })

    const result = Array.from(alertsMap.values()).sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    )
    this.save(STORAGE_KEY_CRITICAL_ALERTS, result)
    return result
  }

  static acknowledgeCriticalAlert(
    alertId: string,
    acknowledgedBy: string,
    physicianNotified: string,
    method: CriticalAlertRecord["notificationMethod"] = "Phone Call",
    notes?: string,
  ): boolean {
    const alerts = this.getCriticalAlerts()
    const target = alerts.find((a) => a.id === alertId)
    if (!target) return false

    target.status = "Acknowledged"
    target.acknowledgedBy = acknowledgedBy
    target.acknowledgedAt = new Date().toISOString()
    target.physicianNotified = physicianNotified
    target.notificationMethod = method
    target.notes = notes

    this.save(STORAGE_KEY_CRITICAL_ALERTS, alerts)
    AuditDatabase.logEvent(
      "Critical Alert Acknowledged",
      "Laboratory",
      `Panic value for ${target.testName} (${target.patientName}) acknowledged by ${acknowledgedBy}. Doctor ${physicianNotified} verbally confirmed via ${method}.`,
      "Success",
    )
    return true
  }

  static escalateCriticalAlert(alertId: string, escalatedTo: string, notes: string): boolean {
    const alerts = this.getCriticalAlerts()
    const target = alerts.find((a) => a.id === alertId)
    if (!target) return false

    target.status = "Escalated"
    target.notes = `[ESCALATED to ${escalatedTo}]: ${notes}`
    this.save(STORAGE_KEY_CRITICAL_ALERTS, alerts)

    AuditDatabase.logEvent(
      "Critical Alert Escalated",
      "Laboratory",
      `Panic value alert ${alertId} escalated to ${escalatedTo}. Reason: Non-responsiveness within 15-minute SLA.`,
      "Failed",
    )
    return true
  }

  // ─── 4. QUALITY CONTROL & LEVEY-JENNINGS ───────────────────────────────────

  static getQcRecords(): QualityControlEntry[] {
    return this.load<QualityControlEntry[]>(STORAGE_KEY_QC_RECORDS, DEFAULT_QC_ENTRIES)
  }

  static addQcRecord(entry: Omit<QualityControlEntry, "id" | "zScore" | "status">): QualityControlEntry {
    const list = this.getQcRecords()
    const zScore = parseFloat(((entry.observedValue - entry.targetMean) / entry.targetSd).toFixed(2))

    let status: QualityControlEntry["status"] = "In Control (Pass)"
    if (Math.abs(zScore) >= 3.0) {
      status = "Out of Control (1:3s)"
    } else if (Math.abs(zScore) >= 2.0) {
      status = "Warning (1:2s)"
    }

    const newRecord: QualityControlEntry = {
      ...entry,
      id: `QC-2026-${String(list.length + 1).padStart(2, "0")}`,
      zScore,
      status,
    }

    list.unshift(newRecord)
    this.save(STORAGE_KEY_QC_RECORDS, list)

    AuditDatabase.logEvent(
      "QC Entry Logged",
      "Laboratory",
      `QC entry logged for ${entry.instrumentName} - Analyte: ${entry.analyte}. Status: ${status} (z-Score: ${zScore}).`,
      "Success",
    )
    return newRecord
  }

  // ─── 5. SETTINGS & CONFIGURATION ──────────────────────────────────────────

  static getSettings(): LisSettings {
    return this.load<LisSettings>(STORAGE_KEY_SETTINGS, DEFAULT_SETTINGS)
  }

  static updateSettings(settings: Partial<LisSettings>): LisSettings {
    const current = this.getSettings()
    const updated = { ...current, ...settings }
    this.save(STORAGE_KEY_SETTINGS, updated)
    return updated
  }

  // ─── 6. PATHOLOGIST AUTHORIZATION & TECHNICAL VALIDATION ───────────────────

  static verifyAndSignReport(
    orderId: string,
    doctorName: string,
    interpretiveComments?: string,
  ): boolean {
    const order = LabOrderDatabase.getOrder(orderId)
    if (!order) return false

    if (order.billing?.status !== "Paid") {
      console.warn(`[LabLisService] Authorization rejected: Order ${orderId} has unpaid billing status (${order.billing?.status}).`)
      return false
    }

    const hasAnyResults = order.tests.some(
      (t) => Boolean(t.result) || (t.results && Object.keys(t.results).length > 0)
    )
    if (!hasAnyResults) {
      console.warn(`[LabLisService] Authorization rejected: Order ${orderId} has no entered test results.`)
      return false
    }

    const success = LabOrderDatabase.completeOrder(orderId, doctorName, doctorName)
    if (success) {
      AuditDatabase.logEvent(
        "Laboratory Report Authorized",
        "Laboratory",
        `Final pathology report authorized and digitally signed by ${doctorName} for Order ${orderId}.`,
        "Success",
      )
    }
    return Boolean(success)
  }
}

