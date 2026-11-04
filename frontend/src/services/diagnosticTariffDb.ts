/**
 * Diagnostic Tariff & Price Master Database Service.
 * Imperial Hospitals & Research Institute - Standard Diagnostic Rate Card.
 * Manages Laboratory and Radiology (X-Ray, CT Scan, Ultrasound/USG, Echocardiography) investigation tariffs.
 * Persists in LocalStorage with BroadcastChannel fan-out across browser tabs.
 */

import { INITIAL_RADIOLOGY_TARIFFS, RADIOLOGY_MODALITIES } from "./radiologyTariffsData"
export { RADIOLOGY_MODALITIES }

export type DiagnosticDepartment =
  | "Laboratory"
  | "Radiology"
  | "X-Ray"
  | "CT Scan"
  | "MRI"
  | "Ultrasound (USG)"
  | "Doppler"
  | "Mammography"
  | "Fluoroscopy / Contrast"
  | "Nuclear Medicine"
  | "DEXA"
  | "Dental"
  | "Interventional Radiology"
  | "Echocardiography"

export interface DiagnosticTariffItem {
  id: string
  code: string
  name: string
  category: "Laboratory" | "Radiology"
  department: DiagnosticDepartment
  modality?: string
  bodyRegion?: string
  subCategory: string
  variantProtocol?: string
  hospitalAvailability?: "Enabled" | "Unavailable" | "Referred Externally" | string
  tariffReference?: string
  price: number
  responsibleInCharge?: string
  reportTemplate?: string
  tat?: string
  unit?: string
  roomOrDept?: string
  aliases?: string[]
  lastUpdated?: string
}

const STORAGE_KEY_DIAGNOSTIC_TARIFFS = "hospai_diagnostic_tariffs_v5"
const BROADCAST_CHANNEL = "hospai_diagnostic_tariffs"

// ── 1. LABORATORY INVESTIGATIONS (184 Tests from Imperial Rate Card) ────────
export const INITIAL_LAB_TARIFFS: Omit<DiagnosticTariffItem, "id">[] = [
  // COLUMN 1 (1-46)
  { code: "LAB-001", name: "HB", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 120, tat: "2 Hours" },
  { code: "LAB-002", name: "TC", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 150, tat: "2 Hours" },
  { code: "LAB-003", name: "DC", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 150, tat: "2 Hours" },
  { code: "LAB-004", name: "PLT", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 240, tat: "2 Hours" },
  { code: "LAB-005", name: "CBP", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 740, tat: "2 Hours" },
  { code: "LAB-006", name: "HEAMOGRAME", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 740, tat: "2 Hours" },
  { code: "LAB-007", name: "ESR", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 140, tat: "2 Hours" },
  { code: "LAB-008", name: "BLOOD GROUPING", category: "Laboratory", department: "Laboratory", subCategory: "Blood Bank", price: 170, tat: "2 Hours" },
  { code: "LAB-009", name: "BT, CT", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 240, tat: "2 Hours" },
  { code: "LAB-010", name: "PERIPHIRAL SMEAR", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 740, tat: "4 Hours" },
  { code: "LAB-011", name: "AEC", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 200, tat: "2 Hours" },
  { code: "LAB-012", name: "QBC FOR MP", category: "Laboratory", department: "Laboratory", subCategory: "Parasitology", price: 660, tat: "2 Hours" },
  { code: "LAB-013", name: "PTT", category: "Laboratory", department: "Laboratory", subCategory: "Coagulation", price: 430, tat: "2 Hours" },
  { code: "LAB-014", name: "APTT", category: "Laboratory", department: "Laboratory", subCategory: "Coagulation", price: 410, tat: "2 Hours" },
  { code: "LAB-015", name: "PCV", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 200, tat: "2 Hours" },
  { code: "LAB-016", name: "LFT", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1320, tat: "4 Hours" },
  { code: "LAB-017", name: "LIPID PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1250, tat: "4 Hours" },
  { code: "LAB-018", name: "AMYLASE", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 660, tat: "2 Hours" },
  { code: "LAB-019", name: "LIPASE", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1970, tat: "2 Hours" },
  { code: "LAB-020", name: "PHASPHOROUS", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 500, tat: "2 Hours" },
  { code: "LAB-021", name: "BLOOD UREA", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 260, tat: "2 Hours" },
  { code: "LAB-022", name: "FBS", category: "Laboratory", department: "Laboratory", subCategory: "Diabetic Profile", price: 80, tat: "2 Hours" },
  { code: "LAB-023", name: "PPBS", category: "Laboratory", department: "Laboratory", subCategory: "Diabetic Profile", price: 80, tat: "2 Hours" },
  { code: "LAB-024", name: "URIC ACID", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 500, tat: "2 Hours" },
  { code: "LAB-025", name: "DENGUECHEEK", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 1490, tat: "2 Hours" },
  { code: "LAB-026", name: "WIDAL", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 330, tat: "2 Hours" },
  { code: "LAB-027", name: "CHICKENGUNIA", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 1650, tat: "2 Hours" },
  { code: "LAB-028", name: "MP CARD", category: "Laboratory", department: "Laboratory", subCategory: "Parasitology", price: 300, tat: "2 Hours" },
  { code: "LAB-029", name: "CBP (SPECIAL)", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 570, tat: "2 Hours" },
  { code: "LAB-030", name: "RA FACTOR", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 660, tat: "2 Hours" },
  { code: "LAB-031", name: "ASO TITRE", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 630, tat: "2 Hours" },
  { code: "LAB-032", name: "RPR", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 2450, tat: "2 Hours" },
  { code: "LAB-033", name: "TROPNIN T", category: "Laboratory", department: "Laboratory", subCategory: "Cardiac Markers", price: 1650, tat: "1 Hour (STAT)" },
  { code: "LAB-034", name: "TROPNING I", category: "Laboratory", department: "Laboratory", subCategory: "Cardiac Markers", price: 1000, tat: "1 Hour (STAT)" },
  { code: "LAB-035", name: "VIRALMARKERS", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 2400, tat: "4 Hours" },
  { code: "LAB-036", name: "HIV", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 830, tat: "2 Hours" },
  { code: "LAB-037", name: "HCV", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 910, tat: "2 Hours" },
  { code: "LAB-038", name: "HBSAG", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 660, tat: "2 Hours" },
  { code: "LAB-039", name: "UPI", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 130, tat: "2 Hours" },
  { code: "LAB-040", name: "AMMONIA", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1710, tat: "2 Hours" },
  { code: "LAB-041", name: "LACTATE", category: "Laboratory", department: "Laboratory", subCategory: "Critical Care", price: 1450, tat: "1 Hour (STAT)" },
  { code: "LAB-042", name: "PROLACTIN", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1980, tat: "4 Hours" },
  { code: "LAB-043", name: "THYROID PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1320, tat: "4 Hours" },
  { code: "LAB-044", name: "TSH", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 500, tat: "2 Hours" },
  { code: "LAB-045", name: "T3", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 500, tat: "2 Hours" },
  { code: "LAB-046", name: "T4", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 500, tat: "2 Hours" },

  // COLUMN 2 (47-92)
  { code: "LAB-047", name: "FT3", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 830, tat: "2 Hours" },
  { code: "LAB-048", name: "FT4", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 830, tat: "2 Hours" },
  { code: "LAB-049", name: "LDH", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 410, tat: "2 Hours" },
  { code: "LAB-050", name: "CHOLESTRENASE", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1650, tat: "4 Hours" },
  { code: "LAB-051", name: "D DIMER", category: "Laboratory", department: "Laboratory", subCategory: "Coagulation", price: 2800, tat: "1 Hour (STAT)" },
  { code: "LAB-052", name: "FERRITIN", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1300, tat: "4 Hours" },
  { code: "LAB-053", name: "TIBC", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1920, tat: "4 Hours" },
  { code: "LAB-054", name: "PSA", category: "Laboratory", department: "Laboratory", subCategory: "Tumor Markers", price: 2110, tat: "4 Hours" },
  { code: "LAB-055", name: "LEPTOSPIRA IGM", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 2300, tat: "4 Hours" },
  { code: "LAB-056", name: "SERUM CARTISOL", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 730, tat: "4 Hours" },
  { code: "LAB-057", name: "IL6", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 3000, tat: "4 Hours" },
  { code: "LAB-058", name: "PROCALCITIONIN", category: "Laboratory", department: "Laboratory", subCategory: "Critical Care", price: 3000, tat: "2 Hours" },
  { code: "LAB-059", name: "ELECTROLYTES", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1050, tat: "1 Hour (STAT)" },
  { code: "LAB-060", name: "SR SODIUM", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 500, tat: "1 Hour" },
  { code: "LAB-061", name: "SR POTASIUM", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 500, tat: "1 Hour" },
  { code: "LAB-062", name: "SR CALCIUM", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 660, tat: "2 Hours" },
  { code: "LAB-063", name: "SR BILURUBIN", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 300, tat: "2 Hours" },
  { code: "LAB-064", name: "SR ALBUMIN", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 210, tat: "2 Hours" },
  { code: "LAB-065", name: "CK-MB", category: "Laboratory", department: "Laboratory", subCategory: "Cardiac Markers", price: 1250, tat: "1 Hour" },
  { code: "LAB-066", name: "CK-NAC", category: "Laboratory", department: "Laboratory", subCategory: "Cardiac Markers", price: 1250, tat: "2 Hours" },
  { code: "LAB-067", name: "ABG", category: "Laboratory", department: "Laboratory", subCategory: "Critical Care", price: 1320, tat: "30 Mins (STAT)" },
  { code: "LAB-068", name: "CUE", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 300, tat: "2 Hours" },
  { code: "LAB-069", name: "U/R", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 180, tat: "2 Hours" },
  { code: "LAB-070", name: "TSUTSU", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 400, tat: "2 Hours" },
  { code: "LAB-071", name: "BLOOD C/S", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 1650, tat: "48 Hours" },
  { code: "LAB-072", name: "PUS C/S", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 660, tat: "48 Hours" },
  { code: "LAB-073", name: "URINE C/S", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 660, tat: "48 Hours" },
  { code: "LAB-074", name: "BIOPSY", category: "Laboratory", department: "Laboratory", subCategory: "Histopathology", price: 1650, tat: "72 Hours" },
  { code: "LAB-075", name: "FNAC", category: "Laboratory", department: "Laboratory", subCategory: "Cytopathology", price: 1440, tat: "24 Hours" },
  { code: "LAB-076", name: "AFB", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 500, tat: "4 Hours" },
  { code: "LAB-077", name: "GRAMS STAIN", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 500, tat: "2 Hours" },
  { code: "LAB-078", name: "SPUTAM C/S", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 660, tat: "48 Hours" },
  { code: "LAB-079", name: "MANTOX", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 330, tat: "48 Hours" },
  { code: "LAB-080", name: "RFT", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 660, tat: "2 Hours" },
  { code: "LAB-081", name: "RBS", category: "Laboratory", department: "Laboratory", subCategory: "Diabetic Profile", price: 80, tat: "30 Mins" },
  { code: "LAB-082", name: "TOTAL CHOLESTROL", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 570, tat: "2 Hours" },
  { code: "LAB-083", name: "TRIGLYCERIDES", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 700, tat: "2 Hours" },
  { code: "LAB-084", name: "SR IRON", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1920, tat: "4 Hours" },
  { code: "LAB-085", name: "GTT", category: "Laboratory", department: "Laboratory", subCategory: "Diabetic Profile", price: 760, tat: "4 Hours" },
  { code: "LAB-086", name: "VDRL", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 330, tat: "2 Hours" },
  { code: "LAB-087", name: "OGCT", category: "Laboratory", department: "Laboratory", subCategory: "Diabetic Profile", price: 120, tat: "2 Hours" },
  { code: "LAB-088", name: "LH", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1320, tat: "4 Hours" },
  { code: "LAB-089", name: "BETA HCGS", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1310, tat: "2 Hours" },
  { code: "LAB-090", name: "VITAMIN B12", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 2640, tat: "4 Hours" },
  { code: "LAB-091", name: "VITAMIN D", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 2640, tat: "4 Hours" },
  { code: "LAB-092", name: "TESTOSTIRON", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1980, tat: "4 Hours" },

  // COLUMN 3 (93-138)
  { code: "LAB-093", name: "CA 125", category: "Laboratory", department: "Laboratory", subCategory: "Tumor Markers", price: 2640, tat: "4 Hours" },
  { code: "LAB-094", name: "MAJOR SURGICAL PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Surgical Profiles", price: 3500, tat: "6 Hours" },
  { code: "LAB-095", name: "MINOR SURGICAL PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Surgical Profiles", price: 1880, tat: "4 Hours" },
  { code: "LAB-096", name: "URINE SODIUM", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 830, tat: "2 Hours" },
  { code: "LAB-097", name: "ABG (STAT)", category: "Laboratory", department: "Laboratory", subCategory: "Critical Care", price: 1320, tat: "30 Mins (STAT)" },
  { code: "LAB-098", name: "SGOT", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 370, tat: "2 Hours" },
  { code: "LAB-099", name: "URINE KITONE BODIES", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 180, tat: "1 Hour" },
  { code: "LAB-100", name: "SGPT", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 370, tat: "2 Hours" },
  { code: "LAB-101", name: "ALP", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 370, tat: "2 Hours" },
  { code: "LAB-102", name: "TOTAL PROTIEN", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 250, tat: "2 Hours" },
  { code: "LAB-103", name: "FSH", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1320, tat: "4 Hours" },
  { code: "LAB-104", name: "SR CHLORIDE", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 500, tat: "2 Hours" },
  { code: "LAB-105", name: "TRI DOT IGM", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 400, tat: "2 Hours" },
  { code: "LAB-106", name: "PAP SMEAR", category: "Laboratory", department: "Laboratory", subCategory: "Cytopathology", price: 660, tat: "48 Hours" },
  { code: "LAB-107", name: "CSF ANALYSIS", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 1160, tat: "2 Hours" },
  { code: "LAB-108", name: "MAGNANIUM", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1780, tat: "2 Hours" },
  { code: "LAB-109", name: "PLEURAL FLUID ANALYS", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 560, tat: "4 Hours" },
  { code: "LAB-110", name: "HBA1C", category: "Laboratory", department: "Laboratory", subCategory: "Diabetic Profile", price: 1120, tat: "2 Hours" },
  { code: "LAB-111", name: "STOOL EXAMINATION", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 250, tat: "2 Hours" },
  { code: "LAB-112", name: "STOOL OCCULT BLOOD", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 250, tat: "2 Hours" },
  { code: "LAB-113", name: "URINE CHILE", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 250, tat: "2 Hours" },
  { code: "LAB-114", name: "SEMEN ANALYSIS", category: "Laboratory", department: "Laboratory", subCategory: "Andrology", price: 580, tat: "2 Hours" },
  { code: "LAB-115", name: "BILESALTS / BILEPIGMENTS", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 100, tat: "2 Hours" },
  { code: "LAB-116", name: "FEVER PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Fever Profiles", price: 5400, tat: "4 Hours" },
  { code: "LAB-117", name: "COAGULATION PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Coagulation", price: 760, tat: "2 Hours" },
  { code: "LAB-118", name: "COVID ANTI BODIES", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 1200, tat: "2 Hours" },
  { code: "LAB-119", name: "M.H.C.", category: "Laboratory", department: "Laboratory", subCategory: "Health Checkups", price: 1500, tat: "6 Hours" },
  { code: "LAB-120", name: "E.H.C", category: "Laboratory", department: "Laboratory", subCategory: "Health Checkups", price: 2500, tat: "6 Hours" },
  { code: "LAB-121", name: "CARDIACH PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Cardiac Markers", price: 3300, tat: "2 Hours" },
  { code: "LAB-122", name: "FLUID LDH", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 480, tat: "2 Hours" },
  { code: "LAB-123", name: "KARYOTYPING", category: "Laboratory", department: "Laboratory", subCategory: "Genetics", price: 4700, tat: "7 Days" },
  { code: "LAB-124", name: "ANA", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 2200, tat: "4 Hours" },
  { code: "LAB-125", name: "ANA PROFILE", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 6500, tat: "24 Hours" },
  { code: "LAB-126", name: "CSF PCR", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 380, tat: "24 Hours" },
  { code: "LAB-127", name: "ADA", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 960, tat: "4 Hours" },
  { code: "LAB-128", name: "AMMIONA", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1710, tat: "2 Hours" },
  { code: "LAB-129", name: "TB PCR", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 3800, tat: "24 Hours" },
  { code: "LAB-130", name: "CA 1909", category: "Laboratory", department: "Laboratory", subCategory: "Tumor Markers", price: 2500, tat: "4 Hours" },
  { code: "LAB-131", name: "PARATHYROPHORMON (PTH)", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 2450, tat: "4 Hours" },
  { code: "LAB-132", name: "IRON", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1900, tat: "4 Hours" },
  { code: "LAB-133", name: "C-ANCA", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 2030, tat: "24 Hours" },
  { code: "LAB-134", name: "P-ANCA", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 2030, tat: "24 Hours" },
  { code: "LAB-135", name: "24 HRS URINE CREATININE", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 830, tat: "24 Hours" },
  { code: "LAB-136", name: "SERUM OSMALITY", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1250, tat: "4 Hours" },
  { code: "LAB-137", name: "URINE OSMALITY", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 830, tat: "4 Hours" },
  { code: "LAB-138", name: "URINE SODIUM (RPT)", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 830, tat: "2 Hours" },

  // COLUMN 4 (139-184)
  { code: "LAB-139", name: "HCV RNA PCR", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 5500, tat: "48 Hours" },
  { code: "LAB-140", name: "C.PEPTISE LEVELS INSULIN ONTIBODIES", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1310, tat: "4 Hours" },
  { code: "LAB-141", name: "CSF TB PCR", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 380, tat: "24 Hours" },
  { code: "LAB-142", name: "ASO TITER", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 660, tat: "2 Hours" },
  { code: "LAB-143", name: "GAMA GGT", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 750, tat: "2 Hours" },
  { code: "LAB-144", name: "BODY FLUIDS PCR", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 1250, tat: "24 Hours" },
  { code: "LAB-145", name: "ANTI HEV IGM", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 2200, tat: "4 Hours" },
  { code: "LAB-146", name: "ANTI HAV IGM", category: "Laboratory", department: "Laboratory", subCategory: "Serology", price: 2600, tat: "4 Hours" },
  { code: "LAB-147", name: "ANA IF", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 2000, tat: "24 Hours" },
  { code: "LAB-148", name: "FIBRINIGEN", category: "Laboratory", department: "Laboratory", subCategory: "Coagulation", price: 2000, tat: "2 Hours" },
  { code: "LAB-149", name: "CEA", category: "Laboratory", department: "Laboratory", subCategory: "Tumor Markers", price: 1650, tat: "4 Hours" },
  { code: "LAB-150", name: "AFP", category: "Laboratory", department: "Laboratory", subCategory: "Tumor Markers", price: 1650, tat: "4 Hours" },
  { code: "LAB-151", name: "DOBLE MARKAR", category: "Laboratory", department: "Laboratory", subCategory: "Maternal Screening", price: 4000, tat: "24 Hours" },
  { code: "LAB-152", name: "URINE TB PCR", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 3800, tat: "24 Hours" },
  { code: "LAB-153", name: "AMH", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 3500, tat: "24 Hours" },
  { code: "LAB-154", name: "FLUID CBNAAJ", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 1500, tat: "4 Hours" },
  { code: "LAB-155", name: "SPUTUM CBNAAJ", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 1000, tat: "4 Hours" },
  { code: "LAB-156", name: "BICARBONATE", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 1180, tat: "2 Hours" },
  { code: "LAB-157", name: "CD4 COUNT", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 3750, tat: "24 Hours" },
  { code: "LAB-158", name: "CD3", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 500, tat: "24 Hours" },
  { code: "LAB-159", name: "CD4", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 1250, tat: "24 Hours" },
  { code: "LAB-160", name: "C4", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 1250, tat: "4 Hours" },
  { code: "LAB-161", name: "SERUM NT PROB NP LEVELS", category: "Laboratory", department: "Laboratory", subCategory: "Cardiac Markers", price: 3450, tat: "2 Hours" },
  { code: "LAB-162", name: "SERUM AJDESTERONELEVELS", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 2800, tat: "24 Hours" },
  { code: "LAB-163", name: "ANTI CCP", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 2630, tat: "4 Hours" },
  { code: "LAB-164", name: "TB GOLD", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 4250, tat: "24 Hours" },
  { code: "LAB-165", name: "HUNTING TONS GENE", category: "Laboratory", department: "Laboratory", subCategory: "Genetics", price: 6500, tat: "7 Days" },
  { code: "LAB-166", name: "TRIPLE MARKER", category: "Laboratory", department: "Laboratory", subCategory: "Maternal Screening", price: 4130, tat: "24 Hours" },
  { code: "LAB-167", name: "ANTI TPO", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 2440, tat: "4 Hours" },
  { code: "LAB-168", name: "BETA HCG", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 1310, tat: "2 Hours" },
  { code: "LAB-169", name: "CSF MEANINGETIS PANEL", category: "Laboratory", department: "Laboratory", subCategory: "Molecular Biology", price: 5500, tat: "24 Hours" },
  { code: "LAB-170", name: "LKM", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 2940, tat: "24 Hours" },
  { code: "LAB-171", name: "URINE PH", category: "Laboratory", department: "Laboratory", subCategory: "Clinical Pathology", price: 80, tat: "1 Hour" },
  { code: "LAB-172", name: "ACTH", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 3000, tat: "24 Hours" },
  { code: "LAB-173", name: "ASMA", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 1370, tat: "24 Hours" },
  { code: "LAB-174", name: "MITOCHONFRIAL ANTIBODIES", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 2630, tat: "24 Hours" },
  { code: "LAB-175", name: "STOOL C/S", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 810, tat: "48 Hours" },
  { code: "LAB-176", name: "PAP SMEAR (REPEAT)", category: "Laboratory", department: "Laboratory", subCategory: "Cytopathology", price: 660, tat: "48 Hours" },
  { code: "LAB-177", name: "BUN", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 250, tat: "2 Hours" },
  { code: "LAB-178", name: "ET", category: "Laboratory", department: "Laboratory", subCategory: "Biochemistry", price: 810, tat: "2 Hours" },
  { code: "LAB-179", name: "RSP", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 1650, tat: "2 Hours" },
  { code: "LAB-180", name: "RETICLO", category: "Laboratory", department: "Laboratory", subCategory: "Haematology", price: 500, tat: "2 Hours" },
  { code: "LAB-181", name: "SPETURE AFL", category: "Laboratory", department: "Laboratory", subCategory: "Microbiology", price: 440, tat: "4 Hours" },
  { code: "LAB-182", name: "C3", category: "Laboratory", department: "Laboratory", subCategory: "Immunology", price: 1250, tat: "4 Hours" },
  { code: "LAB-183", name: "TPO", category: "Laboratory", department: "Laboratory", subCategory: "Endocrinology", price: 2440, tat: "4 Hours" },
  { code: "LAB-184", name: "AFP (ONCO)", category: "Laboratory", department: "Laboratory", subCategory: "Tumor Markers", price: 1650, tat: "4 Hours" },
]

// ── 2. RADIOLOGY INVESTIGATIONS (173 Examinations Across 11 Clinical Modalities) ─
// Legacy arrays mapped to the new clinical catalogue for backward compatibility:
export const INITIAL_XRAY_TARIFFS = INITIAL_RADIOLOGY_TARIFFS.filter((t) => t.department === "X-Ray")
export const INITIAL_CT_TARIFFS = INITIAL_RADIOLOGY_TARIFFS.filter((t) => t.department === "CT Scan")
export const INITIAL_USG_TARIFFS = INITIAL_RADIOLOGY_TARIFFS.filter((t) => t.department === "Ultrasound (USG)")
export const INITIAL_ECHO_TARIFFS = INITIAL_RADIOLOGY_TARIFFS.filter(
  (t) => t.department === "Echocardiography" || t.department === "Doppler"
)

export { INITIAL_RADIOLOGY_TARIFFS }

// ── FULL 357 DIAGNOSTIC TARIFF RATE CARD (184 Laboratory + 173 Radiology) ──────
export const INITIAL_DIAGNOSTIC_TARIFFS: Omit<DiagnosticTariffItem, "id">[] = [
  ...INITIAL_LAB_TARIFFS,
  ...INITIAL_RADIOLOGY_TARIFFS,
]

export class DiagnosticTariffDatabase {
  private static listeners: Set<() => void> = new Set()

  private static load(): DiagnosticTariffItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DIAGNOSTIC_TARIFFS)
      if (raw) {
        const parsed: DiagnosticTariffItem[] = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch {}

    // Seed defaults across all 5 departments (261 items)
    const seeded = INITIAL_DIAGNOSTIC_TARIFFS.map((t) => ({
      ...t,
      id: t.code,
      department: t.department || (t.category === "Laboratory" ? "Laboratory" : "X-Ray"),
      tat: t.tat || "2 Hours",
      lastUpdated: new Date().toISOString().split("T")[0],
    }))
    this.save(seeded)
    return seeded
  }

  private static save(items: DiagnosticTariffItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_DIAGNOSTIC_TARIFFS, JSON.stringify(items))
      this.notify()
    } catch {}
  }

  private static notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn()
      } catch {}
    })
    try {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL)
      ch.postMessage("updated")
      ch.close()
    } catch {}
  }

  static onUpdate(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  static getAllTariffs(): DiagnosticTariffItem[] {
    return this.load()
  }

  static getTariffs(): DiagnosticTariffItem[] {
    return this.load()
  }

  static getLabTariffs(): DiagnosticTariffItem[] {
    return this.load().filter((t) => t.category === "Laboratory" || t.department === "Laboratory")
  }

  static getRadiologyTariffs(): DiagnosticTariffItem[] {
    return this.load().filter((t) => t.category === "Radiology" || t.department !== "Laboratory")
  }

  static getDepartmentTariffs(dept: DiagnosticDepartment): DiagnosticTariffItem[] {
    return this.load().filter((t) => t.department === dept)
  }

  static getTariffPriceByName(nameOrCode: string): number | null {
    if (!nameOrCode) return null
    const items = this.load()
    const rawQ = nameOrCode.trim()
    const q = rawQ.toLowerCase().replace(/\s*\([^\)]*\)/g, "").trim()

    // 1. Direct ID or Code match
    const byCode = items.find(
      (i) => i.code.toLowerCase() === rawQ.toLowerCase() || i.id.toLowerCase() === rawQ.toLowerCase(),
    )
    if (byCode) return byCode.price

    // 2. Exact name match
    const byName = items.find(
      (i) => i.name.toLowerCase() === rawQ.toLowerCase() || i.name.toLowerCase() === q,
    )
    if (byName) return byName.price

    // 3. Alias match
    const byAlias = items.find(
      (i) =>
        i.aliases &&
        i.aliases.some(
          (a) => a.toLowerCase() === rawQ.toLowerCase() || a.toLowerCase() === q,
        ),
    )
    if (byAlias) return byAlias.price

    // 4. Substring / parenthetical match
    const matched = items.find((i) => {
      const itemLow = i.name.toLowerCase()
      const itemClean = itemLow.replace(/\s*\([^\)]*\)/g, "").trim()
      return (
        itemLow === q ||
        itemClean === q ||
        rawQ.toLowerCase().includes(itemLow) ||
        rawQ.toLowerCase().includes(itemClean) ||
        itemLow.includes(q) ||
        itemClean.includes(q)
      )
    })
    if (matched) return matched.price

    return null
  }

  static getRadiologyModalities(): readonly string[] {
    return RADIOLOGY_MODALITIES
  }

  static getTariffsByModality(modality: string): DiagnosticTariffItem[] {
    const q = modality.toLowerCase()
    return this.load().filter(
      (t) =>
        (t.modality && t.modality.toLowerCase() === q) ||
        (t.department && t.department.toLowerCase() === q),
    )
  }

  static updateTariffPrice(idOrCode: string, newPrice: number): DiagnosticTariffItem | null {
    const items = this.load()
    const idx = items.findIndex((i) => i.id === idOrCode || i.code === idOrCode)
    if (idx === -1) return null

    items[idx] = {
      ...items[idx],
      price: newPrice,
      lastUpdated: new Date().toISOString().split("T")[0],
    }
    this.save(items)
    return items[idx]
  }

  static updateTariffItem(idOrCode: string, updates: Partial<DiagnosticTariffItem>): DiagnosticTariffItem | null {
    const items = this.load()
    const idx = items.findIndex((i) => i.id === idOrCode || i.code === idOrCode)
    if (idx === -1) return null

    items[idx] = {
      ...items[idx],
      ...updates,
      lastUpdated: new Date().toISOString().split("T")[0],
    }
    this.save(items)
    return items[idx]
  }

  static addTariffItem(item: Omit<DiagnosticTariffItem, "id"> & { id?: string }): DiagnosticTariffItem {
    const items = this.load()
    const newId = item.id || item.code || `TEST-${Date.now()}`
    const newItem: DiagnosticTariffItem = {
      ...item,
      id: newId,
      department: item.department || (item.category === "Laboratory" ? "Laboratory" : "X-Ray"),
      tat: item.tat || "2 Hours",
      lastUpdated: new Date().toISOString().split("T")[0],
    }
    items.unshift(newItem)
    this.save(items)
    return newItem
  }

  static deleteTariffItem(idOrCode: string): boolean {
    const items = this.load()
    const filtered = items.filter((i) => i.id !== idOrCode && i.code !== idOrCode)
    if (filtered.length === items.length) return false
    this.save(filtered)
    return true
  }

  static resetToHospitalRateCard(): DiagnosticTariffItem[] {
    const seeded = INITIAL_DIAGNOSTIC_TARIFFS.map((t) => ({
      ...t,
      id: t.code,
      department: t.department || (t.category === "Laboratory" ? "Laboratory" : "X-Ray"),
      tat: t.tat || "2 Hours",
      lastUpdated: new Date().toISOString().split("T")[0],
    }))
    this.save(seeded)
    return seeded
  }
}
