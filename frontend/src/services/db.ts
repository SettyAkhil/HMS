/**
 * Enterprise Hospital Management System - Outpatient Persistent Database
 * Uses HTML5 IndexedDB with LocalStorage fallback for high performance,
 * atomic transactions, and permanent data persistence.
 */

import { getDoctorConsultationFee, getDoctorMaster } from "./doctorMaster"
import { apiFetch } from "../lib/api"

export interface DBPatient {
  umr: string // Primary Key: e.g. UMR10001

  name: string

  dob?: string

  age: number

  sex: "Male" | "Female" | "Other"

  gender?: string

  mrn?: string

  phone: string

  address: string

  bloodGroup: string

  createdAt: string

  updatedAt: string
}

export interface DBOPEncounter {
  id: string // Primary Key: e.g. ENC-101

  umr: string // Foreign Key to DBPatient

  date?: string // Immutable calendar date of visit: YYYY-MM-DD

  createdAt?: string // Immutable ISO timestamp of encounter creation

  opNumber: string // e.g. OP001, OP025

  patientName: string

  age: number

  sex: "Male" | "Female" | "Other"

  phone: string

  address: string

  bloodGroup: string

  dept: string

  isNew: boolean

  registrationTime: string

  chiefComplaint: string

  symptoms: string[]

  aiSpecialty: string

  aiDoctor: string

  aiConfidence: number

  aiReasoning?: string

  aiDoctorRationale?: string

  doctorGenderPref: "Any" | "Male" | "Female"

  assignedDoctor: string

  doctorStatus: "Available" | "Busy" | "Inactive" | "Absent"

  queueToken: string

  queuePosition: number

  room: string

  assessment?: string

  diagnosis: string

  icd10: string

  prescription: {
    medicine: string
    dosage: string
    frequency: string
    duration: string
    instructions?: string
  }[]

  investigations: string[]

  services?: {
    id?: string
    name: string
    category?: string
    cptCode?: string
    price: number
    quantity?: number
  }[]

  advice: string
  vitals: {
    bp: string
    pulse: string
    temp: string
    spo2: string
    weight: string
    notes: string
  }

  billing: {
    registrationFee?: number
    consultationFee: number
    labFee: number
    total: number
    status: "Paid" | "Pending"
    mode: string
  }

  furtherAction: "None" | "Laboratory" | "Pharmacy" | "Radiology" | "Admission" | "Referral"

  priorityTag?: "Urgent" | "Senior" | "Wheelchair" | "Pediatric" | "Standard"
  visitType?: "New Visit" | "Follow-up" | "Review"
  news2Score?: number
  news2Risk?: "Low" | "Medium" | "High"
  opdProcedures?: {
    name: string
    status: "Ordered" | "In Progress" | "Completed"
    timestamp: string
  }[]
  status: "Registered" | "Symptoms Captured" | "AI Recommended" | "Awaiting Doctor" | "Doctor Assigned" | "In Queue" | "Vitals Recorded" | "Awaiting Consultation" | "Under Consultation" | "Consultation Completed" | "Post-Consultation" | "Awaiting Billing" | "Billing Completed" | "Awaiting Investigation" | "OP Completed"
  pharmacyStatus?: "In Queue" | "Processing" | "Ready" | "Partially Dispensed" | "Dispensed" | "Rejected" | string

  timestamps: {
    arrival: string

    registration?: string

    symptoms?: string

    doctorAssigned?: string
    /** When the OP desk called the patient through to the nurse station. */
    calledToNurse?: string
    calledToNurseBy?: string
    /** When the OP desk called the patient through to the doctor chamber. */
    calledToDoctor?: string
    calledToDoctorBy?: string
    /** When the OP nurse took baseline observations, and who took them. */

    vitalsRecorded?: string

    vitalsBy?: string

    consultationStart?: string

    consultationEnd?: string

    billingCompleted?: string

    visitCompleted?: string
  }
}

const INITIAL_SEED_PATIENTS: DBPatient[] = [
  {
    umr: "UMR10001",

    name: "Ravi Kumar",

    dob: "1984-03-15",

    age: 42,

    sex: "Male",

    phone: "(617) 555-0192",

    address: "24 Park Avenue, Boston, MA",

    bloodGroup: "O+",

    createdAt: "2026-01-12T09:00:00.000Z",

    updatedAt: "2026-08-25T10:25:00.000Z",
  },

  {
    umr: "UMR10002",

    name: "Sunita Patel",

    dob: "1988-07-22",

    age: 38,

    sex: "Female",

    phone: "(617) 555-0284",

    address: "108 Beacon St, Boston, MA",

    bloodGroup: "B+",

    createdAt: "2026-02-05T10:00:00.000Z",

    updatedAt: "2026-08-25T10:32:00.000Z",
  },

  {
    umr: "UMR10048",

    name: "Alex Turner",

    dob: "1998-08-25",

    age: 28,

    sex: "Male",

    phone: "(617) 555-9011",

    address: "88 Cambridge St, Cambridge, MA",

    bloodGroup: "A+",

    createdAt: "2026-08-25T10:35:00.000Z",

    updatedAt: "2026-08-25T10:35:00.000Z",
  },

  {
    umr: "UMR10067",

    name: "Rana Dhaggubati",

    dob: "1990-05-14",

    age: 36,

    sex: "Male",

    phone: "(617) 555-4421",

    address: "45 Commonwealth Ave, Boston, MA",

    bloodGroup: "O+",

    createdAt: "2026-08-31T09:00:00.000Z",

    updatedAt: "2026-08-31T10:00:00.000Z",
  },

  {
    umr: "UMR10042",

    name: "Rahul Roy",

    dob: "1992-11-10",

    age: 34,

    sex: "Male",

    phone: "(617) 555-8833",

    address: "12 Tremont St, Boston, MA",

    bloodGroup: "A+",

    createdAt: "2026-08-31T09:15:00.000Z",

    updatedAt: "2026-08-31T10:00:00.000Z",
  },

  {
    umr: "UMR10055",

    name: "Suresh Nair",

    dob: "1985-02-18",

    age: 41,

    sex: "Male",

    phone: "(617) 555-6677",

    address: "74 Harvard Ave, Boston, MA",

    bloodGroup: "B+",

    createdAt: "2026-08-31T09:30:00.000Z",

    updatedAt: "2026-08-31T10:00:00.000Z",
  },

  {
    umr: "UMR10088",
    name: "Appanna Chinnapati",
    mrn: "100888",
    dob: "1972-04-12",
    age: 54,
    sex: "Male",
    phone: "9848022338",
    address: "D.No. 4-128, Main Road, Kankipadu, Krishna District, Andhra Pradesh - 521151",
    bloodGroup: "B+",
    createdAt: "2026-10-04T02:30:00.000Z",
    updatedAt: "2026-10-15T11:00:00.000Z",
  },
  {
    umr: "UMR10099",
    name: "Lokesh P",
    mrn: "100992",
    dob: "1980-06-15",
    age: 46,
    sex: "Male",
    phone: "(617) 555-7799",
    address: "Plot 42, Road No 10, Banjara Hills, Hyderabad, Telangana - 500034",
    bloodGroup: "B+",
    createdAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-23T10:00:00.000Z",
  },
]

const INITIAL_SEED_ENCOUNTERS: DBOPEncounter[] = [
  {
    id: "ENC-10067-1",

    umr: "UMR10067",

    date: "2026-10-12",

    createdAt: "2026-10-12T10:15:00.000Z",

    opNumber: "OP123",

    patientName: "Rana Dhaggubati",

    age: 36,

    sex: "Male",

    phone: "(617) 555-4421",

    address: "45 Commonwealth Ave, Boston, MA",

    bloodGroup: "O+",

    dept: "Cardiology",

    isNew: true,

    registrationTime: "10:15 AM",

    chiefComplaint: "I have been experiencing chest pain since this morning.",

    symptoms: ["Chest pain", "Breathing difficulty"],

    aiSpecialty: "Cardiology",

    aiDoctor: "Dr. Arjun Mehta",

    aiConfidence: 98,

    doctorGenderPref: "Any",

    assignedDoctor: "",

    doctorStatus: "Available",

    queueToken: "C-OP123",

    queuePosition: 1,

    room: "Room 107",

    diagnosis: "Acute Coronary Syndrome Rule-Out / Stable Angina",

    icd10: "I20.9",

    prescription: [
      {
        medicine: "Aspirin 81mg",
        dosage: "1 tab",
        frequency: "OD (Once Daily)",
        duration: "30 days",
        instructions: "Take after breakfast",
      },

      {
        medicine: "Atorvastatin 40mg",
        dosage: "1 tab",
        frequency: "HS (Bedtime)",
        duration: "30 days",
        instructions: "Take at bedtime",
      },
    ],

    investigations: ["ECG 12-Lead", "Serum Troponin I"],

    advice: "Avoid strenuous physical exertion. Follow low-sodium diet.",

    vitals: {
      bp: "130/84 mmHg",
      pulse: "78 bpm",
      temp: "98.6 °F",
      spo2: "99%",
      weight: "82 kg",
      notes: "Stable",
    },

    billing: {
      consultationFee: 50,
      labFee: 40,
      total: 90,
      status: "Pending",
      mode: "Card",
    },

    furtherAction: "None",

    status: "Under Consultation",

    timestamps: { arrival: "2026-10-12T10:10:00.000Z", registration: "2026-10-12T10:15:00.000Z" },
  },

  {
    id: "ENC-10001-2",

    umr: "UMR10001",

    date: "2026-08-31",

    createdAt: "2026-08-31T10:25:00.000Z",

    opNumber: "OP025",

    patientName: "Ravi Kumar",

    age: 42,

    sex: "Male",

    phone: "(617) 555-0192",

    address: "24 Park Avenue, Boston, MA",

    bloodGroup: "O+",

    dept: "Cardiology",

    isNew: false,

    registrationTime: "10:25 AM",

    chiefComplaint:
      "Severe chest pain radiating to left arm and shortness of breath.",

    symptoms: ["Chest pain", "Breathing difficulty", "Sweating"],

    aiSpecialty: "Cardiology",

    aiDoctor: "Dr. Rajesh Sharma",

    aiConfidence: 98,

    doctorGenderPref: "Any",

    assignedDoctor: "",

    doctorStatus: "Busy",

    queueToken: "C-OP025",

    queuePosition: 1,

    room: "Room 104",

    diagnosis: "Acute Coronary Syndrome Rule-Out / Stable Angina",

    icd10: "I20.9",

    prescription: [
      {
        medicine: "Aspirin 81mg",
        dosage: "1 tab",
        frequency: "OD",
        duration: "30 days",
      },

      {
        medicine: "Atorvastatin 40mg",
        dosage: "1 tab",
        frequency: "HS",
        duration: "30 days",
      },
    ],

    investigations: ["ECG 12-Lead", "Serum Troponin I", "Lipid Profile"],

    advice: "Strict bed rest. Avoid exertion. Low sodium diet.",

    vitals: {
      bp: "138/88 mmHg",
      pulse: "82 bpm",
      temp: "98.6 °F",
      spo2: "98%",
      weight: "74 kg",
      notes: "Diaphoretic",
    },

    billing: {
      consultationFee: 50,
      labFee: 40,
      total: 90,
      status: "Paid",
      mode: "Card",
    },

    furtherAction: "Laboratory",

    status: "Under Consultation",

    timestamps: {
      arrival: "10:20 AM",
      registration: "10:25 AM",
      symptoms: "10:28 AM",
      consultationStart: "10:35 AM",
    },
  },

  {
    id: "ENC-10002-1",

    umr: "UMR10002",

    date: "2026-08-31",

    createdAt: "2026-08-31T10:32:00.000Z",

    opNumber: "OP003",

    patientName: "Sunita Patel",

    age: 38,

    sex: "Female",

    phone: "(617) 555-0284",

    address: "108 Beacon St, Boston, MA",

    bloodGroup: "B+",

    dept: "Cardiology",

    isNew: false,

    registrationTime: "10:32 AM",

    chiefComplaint: "Frequent palpitations and mild dizziness on standing.",

    symptoms: ["Dizziness", "Fatigue"],

    aiSpecialty: "Cardiology",

    aiDoctor: "Dr. Sarah Jenkins",

    aiConfidence: 94,

    doctorGenderPref: "Female",

    assignedDoctor: "",

    doctorStatus: "Available",

    queueToken: "C-OP003",

    queuePosition: 2,

    room: "Room 102",

    diagnosis: "Stage 1 Essential Hypertension",

    icd10: "I10",

    prescription: [
      {
        medicine: "Amlodipine 5mg",
        dosage: "1 tab",
        frequency: "OD (Morning)",
        duration: "30 days",
      },
    ],

    investigations: ["Holter 24-hr", "Complete Metabolic Panel"],

    advice: "Monitor BP twice daily at home. Low salt intake.",

    vitals: {
      bp: "142/90 mmHg",
      pulse: "76 bpm",
      temp: "98.4 °F",
      spo2: "99%",
      weight: "62 kg",
      notes: "Normal",
    },

    billing: {
      consultationFee: 50,
      labFee: 0,
      total: 50,
      status: "Pending",
      mode: "Card",
    },

    furtherAction: "None",

    status: "In Queue",

    timestamps: {
      arrival: "10:30 AM",
      registration: "10:32 AM",
      doctorAssigned: "10:37 AM",
    },
  },

  {
    id: "ENC-10048-1",

    umr: "UMR10048",

    date: "2026-08-31",

    createdAt: "2026-08-31T10:35:00.000Z",

    opNumber: "OP001",

    patientName: "Alex Turner",

    age: 28,

    sex: "Male",

    phone: "(617) 555-9011",

    address: "88 Cambridge St, Cambridge, MA",

    bloodGroup: "A+",

    dept: "Orthopedics",

    isNew: true,

    registrationTime: "10:35 AM",

    chiefComplaint: "Acute right ankle sprain and swelling after soccer match.",

    symptoms: ["Joint swelling", "Back pain"],

    aiSpecialty: "Orthopedics",

    aiDoctor: "Dr. David Anderson",

    aiConfidence: 97,

    doctorGenderPref: "Any",

    assignedDoctor: "",

    doctorStatus: "Available",

    queueToken: "O-OP001",

    queuePosition: 1,

    room: "Room 112",

    diagnosis: "Lateral Ankle Ligament Sprain Grade II",

    icd10: "S93.401A",

    prescription: [
      {
        medicine: "Ibuprofen 400mg",
        dosage: "1 tab",
        frequency: "TID",
        duration: "7 days",
      },
    ],

    investigations: ["X-Ray Right Ankle AP/Lateral"],

    advice: "R.I.C.E protocol (Rest, Ice, Compression, Elevation).",

    vitals: {
      bp: "122/78 mmHg",
      pulse: "72 bpm",
      temp: "98.6 °F",
      spo2: "99%",
      weight: "78 kg",
      notes: "Tender ankle",
    },

    billing: {
      consultationFee: 50,
      labFee: 35,
      total: 85,
      status: "Paid",
      mode: "UPI",
    },

    furtherAction: "Radiology",

    status: "In Queue",

    timestamps: { arrival: "10:33 AM", registration: "10:35 AM" },
  },

  {
    id: "ENC-10042-1",

    umr: "UMR10042",

    date: "2026-08-25",

    createdAt: "2026-08-25T10:40:00.000Z",

    opNumber: "OP094",

    patientName: "Rahul Roy",

    age: 34,

    sex: "Male",

    phone: "(617) 555-8833",

    address: "12 Tremont St, Boston, MA",

    bloodGroup: "A+",

    dept: "Orthopedics",

    isNew: true,

    registrationTime: "10:40 AM",

    chiefComplaint: "Acute knee joint strain & swelling after heavy workout.",

    symptoms: ["Joint swelling", "Severe Knee Pain"],

    aiSpecialty: "Orthopedics",

    aiDoctor: "Dr. Sanjay Kapoor",

    aiConfidence: 96,

    doctorGenderPref: "Any",

    assignedDoctor: "",

    doctorStatus: "Available",

    queueToken: "O-OP094",

    queuePosition: 1,

    room: "Room 116",

    diagnosis: "Patellar Tendonitis & Quadriceps Strain",

    icd10: "M76.51",

    prescription: [
      {
        medicine: "Aceclofenac 100mg",
        dosage: "1 tab",
        frequency: "BD",
        duration: "5 days",
      },
    ],

    investigations: ["X-Ray Knee AP/Lateral"],

    advice: "Knee brace support and rest for 1 week.",

    vitals: {
      bp: "124/80 mmHg",
      pulse: "74 bpm",
      temp: "98.6 °F",
      spo2: "99%",
      weight: "76 kg",
      notes: "Mild knee effusion",
    },

    billing: {
      consultationFee: 50,
      labFee: 35,
      total: 85,
      status: "Pending",
      mode: "Card",
    },

    furtherAction: "Radiology",

    status: "In Queue",

    timestamps: { arrival: "10:38 AM", registration: "10:40 AM" },
  },

  {
    id: "ENC-10055-1",

    umr: "UMR10055",

    date: "2026-02-05",

    createdAt: "2026-02-05T10:45:00.000Z",

    opNumber: "OP055",

    patientName: "Suresh Nair",

    age: 41,

    sex: "Male",

    phone: "(617) 555-6677",

    address: "74 Harvard Ave, Boston, MA",

    bloodGroup: "B+",

    dept: "General Medicine",

    isNew: true,

    registrationTime: "10:45 AM",

    chiefComplaint: "Persistent high-grade fever & headache for 3 days.",

    symptoms: ["Fever", "Headache", "Body aches"],

    aiSpecialty: "General Medicine",

    aiDoctor: "Dr. Vikram Malhotra",

    aiConfidence: 95,

    doctorGenderPref: "Any",

    assignedDoctor: "Dr. D. Krishnarao",

    doctorStatus: "Available",

    queueToken: "G-OP055",

    queuePosition: 1,

    room: "Room 111",

    diagnosis: "Acute Viral Pyrexia with Cephalea",

    icd10: "R50.9",

    prescription: [
      {
        medicine: "Paracetamol 650mg",
        dosage: "1 tab",
        frequency: "TID",
        duration: "5 days",
      },
    ],

    investigations: ["Complete Blood Count (CBC)", "CRP"],

    advice: "Plenty of oral hydration and adequate bed rest.",

    vitals: {
      bp: "118/76 mmHg",
      pulse: "84 bpm",
      temp: "101.2 °F",
      spo2: "98%",
      weight: "70 kg",
      notes: "Febrile",
    },

    billing: {
      consultationFee: 50,
      labFee: 25,
      total: 75,
      status: "Paid",
      mode: "Cash",
    },

    furtherAction: "Laboratory",

    status: "In Queue",

    timestamps: { arrival: "10:42 AM", registration: "10:45 AM" },
  },

  {
    id: "ENC-10001-1",

    umr: "UMR10001",

    opNumber: "OP001",

    patientName: "Ravi Kumar",

    age: 42,

    sex: "Male",

    phone: "(617) 555-0192",

    address: "24 Park Avenue, Boston, MA",

    bloodGroup: "O+",

    dept: "General Medicine",

    isNew: true,

    registrationTime: "12-Jan-2026 09:15 AM",

    chiefComplaint: "Cough and mild fever",

    symptoms: ["Cough", "Fever"],

    aiSpecialty: "General Medicine",

    aiDoctor: "Dr. Ramesh Kumar",

    aiConfidence: 94,

    doctorGenderPref: "Any",

    assignedDoctor: "Dr. U. Nagaraju",

    doctorStatus: "Available",

    queueToken: "G-OP001",

    queuePosition: 1,

    room: "Room 103",

    diagnosis: "Acute Bronchitis",

    icd10: "J20.9",

    prescription: [
      {
        medicine: "Amoxicillin 500mg",
        dosage: "1 tab",
        frequency: "TID",
        duration: "5 days",
      },
    ],

    investigations: ["Chest X-Ray"],

    advice: "Rest and steam inhalation.",

    vitals: {
      bp: "120/80 mmHg",
      pulse: "76 bpm",
      temp: "99.1 °F",
      spo2: "98%",
      weight: "74 kg",
      notes: "Normal",
    },

    billing: {
      consultationFee: 50,
      labFee: 30,
      total: 80,
      status: "Paid",
      mode: "Cash",
    },

    furtherAction: "None",

    status: "OP Completed",

    timestamps: {
      arrival: "09:00 AM",
      registration: "09:15 AM",
      visitCompleted: "10:00 AM",
    },
  },

  {
    id: "ENC-100245-1",

    umr: "P-100245",

    opNumber: "OP-JS-01",

    patientName: "John Smith",

    age: 45,

    sex: "Male",

    phone: "9876543210",

    address: "124 Park Avenue, South Block, Metro City",

    bloodGroup: "O+",

    dept: "Gastroenterology",

    isNew: false,

    registrationTime: "20-Jan-2026 11:00 AM",

    chiefComplaint:
      "Post-prandial heartburn, acid regurgitation, and upper epigastric discomfort x 3 weeks.",

    symptoms: ["Heartburn", "Epigastric pain", "Acid reflux"],

    aiSpecialty: "Gastroenterology",

    aiDoctor: "Dr. Anita Roy",

    aiConfidence: 96,

    doctorGenderPref: "Any",

    assignedDoctor: "Dr. Anita Roy",

    doctorStatus: "Available",

    queueToken: "G-OP201",

    queuePosition: 1,

    room: "Room 105",

    diagnosis: "Gastroesophageal Reflux Disease (GERD) & Antral Gastritis",

    icd10: "K21.9",

    prescription: [
      {
        medicine: "Tab Pantoprazole 40mg",
        dosage: "1 tab",
        frequency: "OD (Before breakfast)",
        duration: "30 days",
        instructions: "Take 30 mins before breakfast with water",
      },

      {
        medicine: "Syrup Mucaine Gel 10ml",
        dosage: "10 ml",
        frequency: "TID (After meals & bedtime)",
        duration: "14 days",
        instructions: "For burning discomfort",
      },
    ],

    investigations: ["Upper GI Endoscopy (Advised)", "H. Pylori Stool Antigen"],

    advice:
      "Avoid late-night heavy meals, citrus fruits, and spicy foods. Elevate head end of bed.",

    vitals: {
      bp: "132/84 mmHg",
      pulse: "76 bpm",
      temp: "98.4 °F",
      spo2: "99%",
      weight: "82 kg",
      notes: "Abdomen soft, mild epigastric tenderness",
    },

    billing: {
      consultationFee: 50,
      labFee: 45,
      total: 95,
      status: "Paid",
      mode: "UPI",
    },

    furtherAction: "None",

    status: "OP Completed",

    timestamps: {
      arrival: "10:45 AM",
      registration: "11:00 AM",
      visitCompleted: "11:35 AM",
    },
  },

  {
    id: "ENC-100245-2",

    umr: "P-100245",

    opNumber: "OP-JS-02",

    patientName: "John Smith",

    age: 45,

    sex: "Male",

    phone: "9876543210",

    address: "124 Park Avenue, South Block, Metro City",

    bloodGroup: "O+",

    dept: "Cardiology",

    isNew: false,

    registrationTime: "15-Dec-2025 09:30 AM",

    chiefComplaint: "Routine hypertension follow-up and lipid check.",

    symptoms: ["Occasional morning headache", "Fatigue"],

    aiSpecialty: "Cardiology",

    aiDoctor: "Dr. Rajesh Sharma",

    aiConfidence: 98,

    doctorGenderPref: "Any",

    assignedDoctor: "Dr. Rajesh Sharma",

    doctorStatus: "Available",

    queueToken: "C-OP110",

    queuePosition: 2,

    room: "Room 102",

    diagnosis:
      "Essential Hypertension Grade II (Sub-optimally controlled) & Hyperlipidemia",

    icd10: "I10",

    prescription: [
      {
        medicine: "Tab Telmisartan 40mg",
        dosage: "1 tab",
        frequency: "OD (Morning)",
        duration: "60 days",
        instructions: "Take regularly at 8:00 AM",
      },

      {
        medicine: "Tab Atorvastatin 20mg",
        dosage: "1 tab",
        frequency: "HS (Bedtime)",
        duration: "60 days",
        instructions: "Take at night",
      },
    ],

    investigations: [
      "Fasting Lipid Profile",
      "Serum Creatinine",
      "ECG 12-Lead",
    ],

    advice:
      "Low sodium diet (<2g salt/day). 30 mins brisk walking 5 days a week. Repeat lipid profile in 2 months.",

    vitals: {
      bp: "142/90 mmHg",
      pulse: "78 bpm",
      temp: "98.6 °F",
      spo2: "99%",
      weight: "83 kg",
      notes: "S1 S2 normal",
    },

    billing: {
      consultationFee: 50,
      labFee: 60,
      total: 110,
      status: "Paid",
      mode: "Card",
    },

    furtherAction: "None",

    status: "OP Completed",

    timestamps: {
      arrival: "09:15 AM",
      registration: "09:30 AM",
      visitCompleted: "10:15 AM",
    },
  },

  {
    id: "ENC-100289-1",

    umr: "P-100289",

    opNumber: "OP-RL-01",

    patientName: "Robert Lee",

    age: 64,

    sex: "Male",

    phone: "9833445566",

    address: "109 Sunset Boulevard, Metro City",

    bloodGroup: "A+",

    dept: "Pulmonology",

    isNew: false,

    registrationTime: "10-Nov-2025 10:15 AM",

    chiefComplaint:
      "Exertional dyspnea (mMRC Grade 2) and chronic morning productive cough.",

    symptoms: ["Chronic cough", "Shortness of breath on climbing stairs"],

    aiSpecialty: "Pulmonology",

    aiDoctor: "Dr. Anita Roy",

    aiConfidence: 97,

    doctorGenderPref: "Any",

    assignedDoctor: "Dr. Anita Roy",

    doctorStatus: "Available",

    queueToken: "P-OP044",

    queuePosition: 1,

    room: "Room 108",

    diagnosis: "Chronic Obstructive Pulmonary Disease (COPD) — GOLD Stage 2",

    icd10: "J44.9",

    prescription: [
      {
        medicine: "Inhaler Foracort 200 (Budesonide 200mcg + Formoterol 6mcg)",
        dosage: "2 puffs",
        frequency: "BD (Morning & Night)",
        duration: "60 days",
        instructions: "Rinse mouth with water after inhalation",
      },
    ],

    investigations: ["Spirometry / PFT", "Chest X-Ray PA"],

    advice:
      "Avoid exposure to smoke and dust. Annual influenza vaccination strongly advised.",

    vitals: {
      bp: "134/86 mmHg",
      pulse: "82 bpm",
      temp: "98.4 °F",
      spo2: "95% (Room air)",
      weight: "68 kg",
      notes: "Bilateral scattered rhonchi",
    },

    billing: {
      consultationFee: 50,
      labFee: 75,
      total: 125,
      status: "Paid",
      mode: "Cash",
    },

    furtherAction: "None",

    status: "OP Completed",

    timestamps: {
      arrival: "10:00 AM",
      registration: "10:15 AM",
      visitCompleted: "11:00 AM",
    },
  },

  {
    id: "ENC-100512-1",

    umr: "P-100512",

    opNumber: "OP-MG-01",

    patientName: "Maria Garcia",

    age: 29,

    sex: "Female",

    phone: "9845123456",

    address: "88 Lakeview Road, Metro City",

    bloodGroup: "A-",

    dept: "Endocrinology",

    isNew: false,

    registrationTime: "05-Oct-2025 02:30 PM",

    chiefComplaint: "Fatigue, mild weight gain, and dry skin.",

    symptoms: ["Lethargy", "Cold intolerance"],

    aiSpecialty: "Endocrinology",

    aiDoctor: "Dr. Anita Roy",

    aiConfidence: 95,

    doctorGenderPref: "Any",

    assignedDoctor: "Dr. Anita Roy",

    doctorStatus: "Available",

    queueToken: "E-OP012",

    queuePosition: 1,

    room: "Room 106",

    diagnosis: "Primary Hypothyroidism (Subclinical / Mild)",

    icd10: "E03.9",

    prescription: [
      {
        medicine: "Tab Levothyroxine 50mcg",
        dosage: "1 tab",
        frequency: "OD (Empty stomach morning)",
        duration: "90 days",
        instructions: "Take at least 45 mins before breakfast",
      },
    ],

    investigations: ["Serum TSH, Free T3, Free T4", "Anti-TPO Antibodies"],

    advice: "Repeat TSH after 8 weeks for dosage adjustment. High fiber diet.",

    vitals: {
      bp: "116/74 mmHg",
      pulse: "68 bpm",
      temp: "98.2 °F",
      spo2: "99%",
      weight: "61 kg",
      notes: "Mild periorbital puffiness",
    },

    billing: {
      consultationFee: 50,
      labFee: 50,
      total: 100,
      status: "Paid",
      mode: "UPI",
    },

    furtherAction: "None",

    status: "OP Completed",

    timestamps: {
      arrival: "02:15 PM",
      registration: "02:30 PM",
      visitCompleted: "03:10 PM",
    },
  },

  {
    id: "ENC-10088-1",
    umr: "UMR10088",
    date: "2026-10-04",
    createdAt: "2026-10-04T02:30:00.000Z",
    opNumber: "OP10088",
    patientName: "Appanna Chinnapati",
    age: 54,
    sex: "Male",
    phone: "9848022338",
    address: "D.No. 4-128, Main Road, Kankipadu, Krishna District, Andhra Pradesh - 521151",
    bloodGroup: "B+",
    dept: "Emergency / Trauma Care",
    isNew: true,
    registrationTime: "02:30 AM",
    chiefComplaint: "ద్విచక్ర వాహనం ప్రమాదం - కడుపులో తీవ్రమైన నొప్పి, రక్తస్రావం, అపస్మారక స్థితి (Severe blunt abdominal trauma post two-wheeler collision on highway, hemorrhagic shock)",
    symptoms: ["Severe abdominal pain", "Hypovolemic shock", "Dizziness", "Abdominal guarding"],
    aiSpecialty: "Trauma Surgery",
    aiDoctor: "Dr. Vance",
    aiConfidence: 99,
    doctorGenderPref: "Any",
    assignedDoctor: "Dr. Vance",
    doctorStatus: "Busy",
    queueToken: "EMR-88",
    queuePosition: 1,
    room: "Emergency Trauma Bay 1",
    diagnosis: "Blunt Abdominal Trauma, Grade IV Splenic Rupture with 1800 mL Hemoperitoneum, Traumatic Mesenteric Contusion and Jejunal Tear",
    icd10: "S36.032A",
    prescription: [
      {
        medicine: "Inj. Meropenem 1g",
        dosage: "1 vial",
        frequency: "Q8H (Every 8 hours)",
        duration: "7 days",
        instructions: "IV infusion over 30 mins",
      },
      {
        medicine: "Inj. Metronidazole 500mg",
        dosage: "100ml",
        frequency: "Q8H (Every 8 hours)",
        duration: "5 days",
        instructions: "IV infusion",
      },
      {
        medicine: "Inj. Pantoprazole 40mg",
        dosage: "1 vial",
        frequency: "OD (Once daily)",
        duration: "10 days",
        instructions: "IV push",
      },
      {
        medicine: "Tab. Cefuroxime Axetil 500mg",
        dosage: "1 tab",
        frequency: "BD (Twice daily)",
        duration: "7 days",
        instructions: "Take after food",
      },
    ],
    investigations: [
      "Bedside eFAST Abdomen (Positive Hemoperitoneum)",
      "STAT Arterial Blood Gas (ABG) & Lactate",
      "Complete Blood Count (CBC) & Coagulation Profile",
      "Blood Grouping & Cross-match 4 Units PRBC",
    ],
    advice: "Post-splenectomy precautions: mandatory vaccination (Pneumococcal, Meningococcal, Hib) completed prior to discharge. Lifelong precautions for sudden high-grade fever. Avoid heavy physical strain for 6 weeks.",
    vitals: {
      bp: "82/50 mmHg",
      pulse: "132 bpm",
      temp: "97.4 °F",
      spo2: "88%",
      weight: "68 kg",
      notes: "Hemorrhagic shock secondary to splenic rupture; resuscitated and shifted STAT to OT",
    },
    billing: {
      consultationFee: 0,
      labFee: 4500,
      total: 4500,
      status: "Paid",
      mode: "Insurance",
    },
    furtherAction: "Admission",
    status: "OP Completed",
    timestamps: {
      arrival: "02:30 AM",
      registration: "02:32 AM",
      doctorAssigned: "02:33 AM",
      visitCompleted: "03:30 AM",
    },
  },
]

const CROSS_TAB_CHANNEL = "hospai_db_v1"

/** Raised (detail: the DBOPEncounter) when an OP registration is complete. */
export const OP_REGISTERED_EVENT = "hms:op-registered"

/** The fake phone earlier queue syncs stored when the real one was missed. */
export const PLACEHOLDER_PHONE = "+91 98765 43210"

/** A queue row's patient details, from the fields /api/queue actually sends. */
function queueDemographics(item: any): {
  patientName: string
  phone: string
  age: number | null
  sex: "Male" | "Female" | "Other" | ""
  bloodGroup: string
} {
  const g = String(item.patient_gender ?? item.gender ?? "").toLowerCase()
  const ageRaw = item.patient_age ?? item.age
  const age = ageRaw === null || ageRaw === undefined || ageRaw === "" ? null : Number(ageRaw)
  return {
    patientName: String(item.patient_name || item.patient_first_name || "").trim(),
    phone: String(item.patient_phone ?? item.phone ?? "").trim(),
    age: age != null && Number.isFinite(age) ? age : null,
    sex: g.startsWith("f") ? "Female" : g.startsWith("m") ? "Male" : g ? "Other" : "",
    bloodGroup: String(item.patient_blood_group ?? item.blood_group ?? "").trim(),
  }
}

const STORAGE_KEYS = {
  PATIENTS: "hospai_db_patients_v1",

  ENCOUNTERS: "hospai_db_encounters_v1",

  UMR_COUNTER: "hospai_db_umr_counter_v1",

  OP_COUNTER: "hospai_db_op_counter_v1",
  CALL_HISTORY: "hospai_db_call_history_v1",
}

export interface DBCallEvent {
  id: string
  encounterId: string
  umr: string
  patientName: string
  token: string
  dept: string
  room: string
  eventType: "Call Doctor" | "Call Nurse"
  timestamp: string
}

// ─── Emergency Storage Eviction & Quota Recovery ──────────────────────────────
const dbMemoryFallback: Record<string, string> = {}

export function emergencyDbStorageEviction(): void {
  if (typeof window === "undefined" || !window.localStorage) return
  try {
    const todayStr = new Date().toISOString().split("T")[0]
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k) continue
      // 1. Purge all multi-day ICU flowsheets (except today's active note)
      if (k.startsWith("icu.flowsheet.") && !k.endsWith(todayStr)) {
        keysToRemove.push(k)
      }
      // 2. Remove OCR & preview temporary caches
      if (
        k.startsWith("hospai_ocr_") ||
        k.startsWith("receipt_preview_") ||
        k.startsWith("temp_") ||
        k.includes("_scratch")
      ) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach((k) => {
      try {
        window.localStorage.removeItem(k)
      } catch {}
    })

    // 3. Trim audit logs down to 20
    try {
      const auditRaw = window.localStorage.getItem("hospai_audit_logs_v1")
      if (auditRaw) {
        const logs = JSON.parse(auditRaw)
        if (Array.isArray(logs) && logs.length > 20) {
          window.localStorage.setItem("hospai_audit_logs_v1", JSON.stringify(logs.slice(0, 20)))
        }
      }
    } catch {
      try { window.localStorage.removeItem("hospai_audit_logs_v1") } catch {}
    }
  } catch (e) {
    console.warn("[HospitalDatabase] Storage eviction warning:", e)
  }
}

export function aggressiveDbStorageEviction(): void {
  if (typeof window === "undefined" || !window.localStorage) return
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k) continue
      if (
        k.startsWith("icu.flowsheet.") ||
        k === "hospai_audit_logs_v1" ||
        k.startsWith("hospai_notif") ||
        k.includes("notifications")
      ) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach((k) => {
      try { window.localStorage.removeItem(k) } catch {}
    })
  } catch {}
}

export function safeDbSetItem(key: string, value: string): void {
  if (typeof window === "undefined") return
  // Always update memory fallback so in-session patient/encounter state is 100% preserved
  dbMemoryFallback[key] = value

  // Fast path: try saving directly to localStorage
  try {
    localStorage.setItem(key, value)
    return
  } catch (err: any) {
    console.warn(`[HospitalDatabase] Quota exceeded on "${key}". Performing emergency eviction...`)
  }

  // Pass 1: Prune bloated ICU flowsheets & trim audit logs
  try {
    emergencyDbStorageEviction()
    localStorage.setItem(key, value)
    return
  } catch (secondErr: any) {
    console.warn(`[HospitalDatabase] Second setItem attempt on "${key}" failed. Aggressive eviction...`)
  }

  // Pass 2: Aggressive eviction
  try {
    aggressiveDbStorageEviction()
    localStorage.setItem(key, value)
    return
  } catch (finalErr: any) {
    console.warn(`[HospitalDatabase] Critical: localStorage full for "${key}". Falling back to in-memory store.`)
  }
}

export function safeDbGetItem(key: string): string | null {
  if (typeof window === "undefined") return dbMemoryFallback[key] || null
  try {
    const val = localStorage.getItem(key)
    if (val !== null) return val
  } catch {}
  return dbMemoryFallback[key] || null
}

class HospitalDatabase {
  private listeners: Set<() => void> = new Set()

  constructor() {
    this.init()
  }

  private init() {
    if (typeof window === "undefined") return

    // Reclaim storage quota on initialization
    emergencyDbStorageEviction()

    if (!safeDbGetItem(STORAGE_KEYS.PATIENTS)) {
      safeDbSetItem(
        STORAGE_KEYS.PATIENTS,
        JSON.stringify(INITIAL_SEED_PATIENTS),
      )
    }

    if (!safeDbGetItem(STORAGE_KEYS.ENCOUNTERS)) {
      safeDbSetItem(
        STORAGE_KEYS.ENCOUNTERS,
        JSON.stringify(INITIAL_SEED_ENCOUNTERS),
      )
    }

    if (!safeDbGetItem(STORAGE_KEYS.UMR_COUNTER)) {
      safeDbSetItem(STORAGE_KEYS.UMR_COUNTER, "10048")
    }

    if (!safeDbGetItem(STORAGE_KEYS.OP_COUNTER)) {
      safeDbSetItem(STORAGE_KEYS.OP_COUNTER, "33")
    }

    // Clean up Mangapathi Bhupathi data and deduplicate redundant encounters

    try {
      const pData = localStorage.getItem(STORAGE_KEYS.PATIENTS)

      if (pData) {
        const parsed: DBPatient[] = JSON.parse(pData)

        const filtered = parsed.filter(
          (p) =>
            !p.name.toLowerCase().includes("mangapathi") &&
            !p.name.toLowerCase().includes("bhupathi"),
        )

        const seenUmrs = new Set()
        const dedupedPatients = filtered.filter((p) => {
          const u = (p.umr || "").trim().toUpperCase()
          if (!u || seenUmrs.has(u)) return false
          seenUmrs.add(u)
          return true
        })
        if (dedupedPatients.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify(dedupedPatients))
        }
      }

      // Merge missing initial seed encounters and clean up duplicates

      const eData = localStorage.getItem(STORAGE_KEYS.ENCOUNTERS)

      if (eData) {
        const parsedE: DBOPEncounter[] = JSON.parse(eData)

        const existingIds = new Set(parsedE.map((e) => e.id))

        const missing = INITIAL_SEED_ENCOUNTERS.filter(
          (e) => !existingIds.has(e.id),
        )

        const combined = [...parsedE, ...missing]

        const seen = new Set<string>()

        const filteredE = combined.filter((e) => {
          if (
            e.patientName.toLowerCase().includes("mangapathi") ||
            e.patientName.toLowerCase().includes("bhupathi")
          ) {
            return false
          }

          const key = `${e.umr}_${e.opNumber}`

          if (seen.has(key)) return false

          seen.add(key)

          return true
        })

        let encMigrated = false;
        for (const e of filteredE) {
          const defaultRegFee = e.isNew === false ? 0 : 20;
          if (!e.billing) {
            const fee = getDoctorConsultationFee(e.assignedDoctor);
            e.billing = {
              registrationFee: defaultRegFee,
              consultationFee: fee,
              labFee: 0,
              total: defaultRegFee + fee,
              status: "Pending",
              mode: "Card",
            };
            encMigrated = true;
          } else {
            if (e.billing.registrationFee === undefined) {
              e.billing.registrationFee = defaultRegFee;
              e.billing.total = defaultRegFee + (e.billing.consultationFee || 500) + (e.billing.labFee || 0);
              encMigrated = true;
            }
          }
        }

        if (filteredE.length !== parsedE.length || missing.length > 0 || encMigrated) {
          localStorage.setItem(
            STORAGE_KEYS.ENCOUNTERS,
            JSON.stringify(filteredE),
          )
        }
      }
    } catch {
      // ignore
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener)

    this.ensureCrossTab()

    return () => this.listeners.delete(listener)
  }

  /**
   * Fan a local write out to the other tabs.
   *
   * Reception, the OP nurse station and the doctor's workspace are different
   * people at different desks, so they are different tabs -- and often different
   * machines pointed at the same browser profile. Without this, booking an
   * appointment notified only the tab that made the write: the nurse's open
   * station and the doctor's board went on showing stale queues until someone
   * happened to reload. The rest of this frontend already fans out this way.
   */

  private crossTabReady = false

  private channel: BroadcastChannel | null = null

  private ensureCrossTab() {
    if (this.crossTabReady || typeof window === "undefined") return

    this.crossTabReady = true

    try {
      this.channel = new BroadcastChannel(CROSS_TAB_CHANNEL)

      this.channel.onmessage = () => this.listeners.forEach((fn) => fn())
    } catch {
      // BroadcastChannel unavailable -- the storage event below still covers it.
    }

    // Fires in *other* tabs when localStorage changes, which covers browsers

    // without BroadcastChannel and writes made outside this class.

    window.addEventListener("storage", (e) => {
      if (!e.key) return

      if (
        e.key === STORAGE_KEYS.ENCOUNTERS ||
        e.key === STORAGE_KEYS.PATIENTS
      ) {
        this.listeners.forEach((fn) => fn())
      }
    })
  }

  /**
   * The front desk issues UMRs from a per-browser counter, so two desks can
   * hand the same UMR to two different people. The backend detects that
   * (`umr_conflict`) and files the newcomer under a server-issued id. Adopt
   * that id here -- patient, encounters and the OP card all follow -- so every
   * patient's card and barcode stay unique and resolve to their own record.
   */
  public adoptServerPatientId(localUmr: string, res: unknown): void {
    const r = (res ?? {}) as { patient_id?: unknown ;umr_conflict?: unknown }
    const serverId = typeof r.patient_id === "string" ? r.patient_id.trim() : ""
    if (!r.umr_conflict || !serverId || serverId === localUmr) return
    const patients = this.getPatients()
    if (patients.some((p) => p.umr === serverId)) return
    safeDbSetItem(
      STORAGE_KEYS.PATIENTS,
      JSON.stringify(patients.map((p) => (p.umr === localUmr ? { ...p, umr: serverId, updatedAt: new Date().toISOString() } : p))),
    )
    safeDbSetItem(
      STORAGE_KEYS.ENCOUNTERS,
      JSON.stringify(this.getEncounters().map((e) => (e.umr === localUmr ? { ...e, umr: serverId } : e))),
    )
    try {
      window.dispatchEvent(new CustomEvent("hms:umr-reassigned", { detail: { from: localUmr, to: serverId } }))
    } catch {}
    this.notify()
  }

  /**
   * Tells the rest of the app (patient messaging) that an OP registration is
   * complete. Raised only after the server write-through has settled, so the
   * UMR is final (a desk-UMR clash may have re-keyed it) and the patient
   * exists on the server for anything that needs them there.
   */
  private announceRegistered(encounterId: string) {
    try {
      const encounter = this.getEncounterById(encounterId)
      if (encounter) window.dispatchEvent(new CustomEvent(OP_REGISTERED_EVENT, { detail: encounter }))
    } catch {}
  }

  private notify() {
    this.listeners.forEach((fn) => fn())

    this.ensureCrossTab()

    try {
      this.channel?.postMessage(Date.now())
    } catch {
      /* a closed channel must never break the write that triggered it */
    }
  }

  // ── Patients CRUD ────────────────────────────────────────────────────────

  public getPatients(): DBPatient[] {
    try {
      const data = safeDbGetItem(STORAGE_KEYS.PATIENTS)
      if (!data) return INITIAL_SEED_PATIENTS
      const parsed: DBPatient[] = JSON.parse(data)
      let merged = false
      const list = [...parsed]
      for (const sp of INITIAL_SEED_PATIENTS) {
        if (!list.some((p) => p.umr === sp.umr || p.name.toLowerCase() === sp.name.toLowerCase())) {
          list.push(sp)
          merged = true
        }
      }
      const seenUmrs = new Set<string>()
      const uniqueList: DBPatient[] = []
      for (const p of list) {
        const u = (p.umr || "").trim().toUpperCase()
        if (u && !seenUmrs.has(u)) {
          seenUmrs.add(u)
          uniqueList.push(p)
        }
      }
      if (uniqueList.length !== list.length || merged) {
        safeDbSetItem(STORAGE_KEYS.PATIENTS, JSON.stringify(uniqueList))
      }
      uniqueList.sort((a, b) => {
        const timeB = new Date(b.createdAt || 0).getTime()
        const timeA = new Date(a.createdAt || 0).getTime()
        return timeB - timeA
      })
      return uniqueList
    } catch {
      return INITIAL_SEED_PATIENTS
    }
  }

  public getPatientByUmr(umr: string): DBPatient | undefined {
    return this.getPatients().find(
      (p) => p.umr.toUpperCase() === umr.toUpperCase(),
    )
  }

  public addPatient(p: DBPatient): void {
    try {
      const list = this.getPatients()
      const u = (p.umr || "").trim().toUpperCase()
      if (u && !list.some((existing) => (existing.umr || "").trim().toUpperCase() === u)) {
        localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify([p, ...list]))
        this.notify()
      }
    } catch {}
  }

  public searchPatients(query: string): DBPatient[] {
    const q = query.trim().toLowerCase()

    if (!q) return this.getPatients()

    return this.getPatients().filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.umr.toLowerCase().includes(q) ||
        p.phone.includes(q),
    )
  }

  // ── Encounters CRUD ──────────────────────────────────────────────────────

  public getEncounters(): DBOPEncounter[] {
    try {
      const data = safeDbGetItem(STORAGE_KEYS.ENCOUNTERS)
      if (!data) return INITIAL_SEED_ENCOUNTERS
      const parsed: DBOPEncounter[] = JSON.parse(data)
      let merged = false
      const list = [...parsed]
      for (const se of INITIAL_SEED_ENCOUNTERS) {
        if (!list.some((e) => e.id === se.id)) {
          list.push(se)
          merged = true
        }
      }
      // Data hygiene / healing: Ensure every encounter has an immutable calendar date & createdAt
      for (const e of list) {
        if (!e.date || !e.createdAt) {
          // 1. Try timestamps arrival or registration if they contain a date
          const ts = e.timestamps?.arrival || e.timestamps?.registration
          if (ts && /\d{4}-\d{2}-\d{2}/.test(ts)) {
            const m = ts.match(/\d{4}-\d{2}-\d{2}/)
            if (m) {
              if (!e.date) { e.date = m[0]; merged = true }
              if (!e.createdAt) { e.createdAt = ts.includes("T") ? ts : `${m[0]}T00:00:00.000Z`; merged = true }
            }
          }
          // 2. Try anchor to patient's immutable registration createdAt
          if ((!e.date || !e.createdAt) && e.umr) {
            const pt = this.getPatientByUmr(e.umr)
            if (pt?.createdAt) {
              const ptDate = pt.createdAt.includes("T") ? pt.createdAt.split("T")[0] : pt.createdAt.split(" ")[0]
              if (/^\d{4}-\d{2}-\d{2}$/.test(ptDate)) {
                if (!e.date) { e.date = ptDate; merged = true }
                if (!e.createdAt) { e.createdAt = pt.createdAt; merged = true }
              }
            }
          }
          // 3. Fallback: if e.id has date e.g. ENC-REP-YYYYMMDD
          if (!e.date && e.id) {
            const m = e.id.match(/ENC-REP-(\d{4})(\d{2})(\d{2})/)
            if (m) {
              e.date = `${m[1]}-${m[2]}-${m[3]}`
              e.createdAt = `${e.date}T00:00:00.000Z`
              merged = true
            }
          }
        }
      }
      if (merged) {
        safeDbSetItem(STORAGE_KEYS.ENCOUNTERS, JSON.stringify(list))
      }
      list.sort((a, b) => {
        const timeB = new Date(b.createdAt || b.date || 0).getTime()
        const timeA = new Date(a.createdAt || a.date || 0).getTime()
        return timeB - timeA
      })
      return list
    } catch {
      return INITIAL_SEED_ENCOUNTERS
    }
  }

  public getEncountersForPatient(
    query: string,
    patientName?: string,
  ): DBOPEncounter[] {
    if (!query && !patientName) return []

    const q = (query || "").trim().toUpperCase()

    const nameTarget = (patientName || query || "").trim().toLowerCase()

    const encounters = this.getEncounters()

    const matched = encounters.filter((e) => {
      const eUmr = (e.umr || "").toUpperCase()

      if (
        q &&
        (eUmr === q || eUmr.replace(/[-_]/g, "") === q.replace(/[-_]/g, ""))
      )
        return true

      const eName = (e.patientName || "").trim().toLowerCase()

      if (
        nameTarget &&
        (eName === nameTarget ||
          eName.includes(nameTarget) ||
          nameTarget.includes(eName))
      )
        return true

      const ePhone = (e.phone || "").replace(/\D/g, "")

      const qDigits = q.replace(/\D/g, "")

      if (
        qDigits &&
        qDigits.length >= 7 &&
        (ePhone.includes(qDigits) || qDigits.includes(ePhone))
      )
        return true

      return false
    })

    return matched
  }

  public getEncounterById(id: string): DBOPEncounter | undefined {
    return this.getEncounters().find((e) => e.id === id)
  }

  // ── Patient Matching & Duplicate Verification ─────────────────────────────

  /**
   * Identifies if entered patient details match an existing patient in the database.
   * If the name matches an existing record, but any detail (phone, age, sex) differs,
   * it treats them as a NEW patient and reports the mismatches.
   */

  public findMatchingPatient(params: {
    fullName: string

    dob?: string

    age?: number

    sex?: string

    phone?: string
  }): PatientMatchResult {
    return findMatchingPatient(this.getPatients(), params)
  }

  // ── High-Level OP Workflow Methods ────────────────────────────────────────

  /**
   * 1. Register New Patient:
   * Generates next permanent UMR -> Generates continuous global OP Number -> Saves to database
   */

  public registerNewPatient(data: {
    firstName: string

    middleName?: string

    lastName: string

    dob?: string

    age: number

    sex?: "Male" | "Female" | "Other"

    phone: string

    address?: string

    bloodGroup?: string

    dept?: string

    chiefComplaint?: string
  }): { patient: DBPatient ;encounter: DBOPEncounter } {
    const patients = this.getPatients()

    const encounters = this.getEncounters()

    // Next UMR Generator

    const currentCounter = parseInt(
      safeDbGetItem(STORAGE_KEYS.UMR_COUNTER) || "10048",
      10,
    )

    const nextUmrCounter = currentCounter + 1

    safeDbSetItem(STORAGE_KEYS.UMR_COUNTER, nextUmrCounter.toString())

    const newUmr = `UMR${nextUmrCounter}`

    // Global Continuous Unique OP Number Generator

    const currentOpCounter = parseInt(
      safeDbGetItem(STORAGE_KEYS.OP_COUNTER) || "33",
      10,
    )

    const nextOpCounter = currentOpCounter + 1

    safeDbSetItem(STORAGE_KEYS.OP_COUNTER, nextOpCounter.toString())

    const newOpNumber = `OP${String(nextOpCounter).padStart(3, "0")}`

    const fullName = [data.firstName, data.middleName, data.lastName]
      .filter(Boolean)
      .join(" ")
      .trim()

    const nowIso = new Date().toISOString()

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    // Step 1: Create Patient Record

    const newPatient: DBPatient = {
      umr: newUmr,

      name: fullName,

      dob: data.dob,

      age: data.age,

      sex: data.sex || "Male",

      phone: data.phone || "+91 98765 43210",

      address: data.address || "Main City",

      bloodGroup: data.bloodGroup || "O+",

      createdAt: nowIso,

      updatedAt: nowIso,
    }

    // Step 2: Create Initial OP Encounter with Global Continuous OP Number

    const encounterId = `ENC-${newUmr}-${nextOpCounter}`

    const newEncounter: DBOPEncounter = {
      id: encounterId,
      date: nowIso.split("T")[0],
      createdAt: nowIso,

      umr: newUmr,

      opNumber: newOpNumber,

      patientName: fullName,

      age: data.age,

      sex: data.sex || "Male",

      phone: newPatient.phone,

      address: newPatient.address,

      bloodGroup: newPatient.bloodGroup,

      dept: data.dept || "Awaiting Triage",

      isNew: true,

      registrationTime: timeStr,

      chiefComplaint: data.chiefComplaint || "",

      symptoms: data.chiefComplaint ? [data.chiefComplaint] : [],

      aiSpecialty: data.dept || "",

      aiDoctor: "",

      aiConfidence: 0,

      doctorGenderPref: data.sex === "Female" ? "Female" : "Male",

      assignedDoctor: "",

      doctorStatus: "Available",

      queueToken: "",

      queuePosition: 1,

      room: "",

      diagnosis: "",

      icd10: "",

      prescription: [],

      investigations: [],

      advice: "",

      vitals: { bp: "", pulse: "", temp: "", spo2: "", weight: "", notes: "" },

      billing: {
        registrationFee: 20,
        consultationFee: data.dept
          ? getDoctorConsultationFee(
              getDoctorMaster().find(
                (d) => d.verified && d.specialty === data.dept,
              )?.name || "",
            )
          : 500,
        labFee: 0,
        total:
          20 +
          (data.dept
            ? getDoctorConsultationFee(
                getDoctorMaster().find(
                  (d) => d.verified && d.specialty === data.dept,
                )?.name || "",
              )
            : 500),
        status: "Pending",
        mode: "Card",
      },

      furtherAction: "None",

      status: "Registered",

      timestamps: { arrival: nowIso, registration: nowIso },
    }

    // Commit to database

    safeDbSetItem(
      STORAGE_KEYS.PATIENTS,
      JSON.stringify([newPatient, ...patients]),
    )

    safeDbSetItem(
      STORAGE_KEYS.ENCOUNTERS,
      JSON.stringify([newEncounter, ...encounters]),
    )

    // Backend write-through for OP Visit / Appointment
    apiFetch("/api/op/visits", {
      method: "POST",
      body: JSON.stringify({
        patient_id: newPatient.umr,
        patient: {
          first_name: data.firstName,
          last_name: data.lastName,
          phone: newPatient.phone,
          age: newPatient.age,
          gender: newPatient.sex,
        },
        appointment: {
          doctor_name: (newEncounter as any).assignedDoctor || (newEncounter as any).doctorAssigned || undefined,
          department: newEncounter.dept || data.dept || "General Medicine",
          visit_type: "OP",
          appointment_date: new Date().toISOString().split("T")[0],
          status: "checked_in",
          chief_complaint: newEncounter.chiefComplaint || data.chiefComplaint || "OP Visit",
        },
      }),
    })
      .then((res) => this.adoptServerPatientId(newPatient.umr, res))
      .catch(() => {})
      .finally(() => this.announceRegistered(newEncounter.id))

    this.notify()

    return { patient: newPatient, encounter: newEncounter }
  }

  /**
   * 2. Revisit Patient Encounter:
   * Keeps Permanent UMR unchanged -> Generates continuous global next OP Number -> Saves
   */

  public createRevisitEncounter(
    umr: string,
    data?: { dept?: string ;chiefComplaint?: string },
  ): DBOPEncounter {
    const patient = this.getPatientByUmr(umr)

    if (!patient)
      throw new Error(`Patient with UMR ${umr} not found in database.`)

    const encounters = this.getEncounters()

    // Generate Next Global Continuous OP Number across hospital

    const currentOpCounter = parseInt(
      safeDbGetItem(STORAGE_KEYS.OP_COUNTER) || "33",
      10,
    )

    const nextOpCounter = currentOpCounter + 1

    safeDbSetItem(STORAGE_KEYS.OP_COUNTER, nextOpCounter.toString())

    const newOpNumber = `OP${String(nextOpCounter).padStart(3, "0")}`

    const encounterId = `ENC-${umr}-${nextOpCounter}`

    const nowIso = new Date().toISOString()

    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    const newEncounter: DBOPEncounter = {
      id: encounterId,
      date: nowIso.split("T")[0],
      createdAt: nowIso,

      umr: patient.umr, // STRICTLY KEPT UNCHANGED

      opNumber: newOpNumber, // GLOBAL CONTINUOUS NEXT OP NUMBER

      patientName: patient.name,

      age: patient.age,

      sex: patient.sex,

      phone: patient.phone,

      address: patient.address,

      bloodGroup: patient.bloodGroup,

      dept: data?.dept || "Awaiting Triage",

      isNew: false,

      registrationTime: timeStr,

      chiefComplaint: data?.chiefComplaint || "Revisit Consultation",

      symptoms: [],

      aiSpecialty: "",

      aiDoctor: "",

      aiConfidence: 0,

      doctorGenderPref: patient.sex === "Female" ? "Female" : "Male",

      assignedDoctor: "",

      doctorStatus: "Available",

      queueToken: "",

      queuePosition: 1,

      room: "",

      diagnosis: "",

      icd10: "",

      prescription: [],

      investigations: [],

      advice: "",

      vitals: {
        bp: "",
        pulse: "",
        temp: "",
        spo2: "",
        weight: "",
        notes: "Revisit check",
      },

      billing: {
        registrationFee: 0,
        consultationFee: data?.dept
          ? getDoctorConsultationFee(
              getDoctorMaster().find(
                (d) => d.verified && d.specialty === data.dept,
              )?.name || "",
            )
          : 500,
        labFee: 0,
        total:
          0 +
          (data?.dept
            ? getDoctorConsultationFee(
                getDoctorMaster().find(
                  (d) => d.verified && d.specialty === data.dept,
                )?.name || "",
              )
            : 500),
        status: "Pending",
        mode: "Card",
      },

      furtherAction: "None",

      status: "Registered",

      timestamps: { arrival: nowIso, registration: nowIso },
    }

    // Update patient timestamp & save encounter

    const patients = this.getPatients().map((p) =>
      p.umr === umr ? { ...p, updatedAt: new Date().toISOString() } : p,
    )

    safeDbSetItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients))

    safeDbSetItem(
      STORAGE_KEYS.ENCOUNTERS,
      JSON.stringify([newEncounter, ...encounters]),
    )

    // Backend write-through for OP Visit / Appointment
    apiFetch("/api/op/visits", {
      method: "POST",
      body: JSON.stringify({
        patient_id: umr,
        patient: patient ? {
          first_name: patient.name.split(" ")[0] || patient.name,
          last_name: patient.name.split(" ").slice(1).join(" ") || "",
          phone: patient.phone,
          age: patient.age,
          gender: patient.sex,
        } : undefined,
        appointment: {
          doctor_name: (newEncounter as any).assignedDoctor || (newEncounter as any).doctorAssigned || undefined,
          department: newEncounter.dept || "General Medicine",
          visit_type: "OP",
          appointment_date: new Date().toISOString().split("T")[0],
          status: "checked_in",
          chief_complaint: newEncounter.chiefComplaint || "Revisit",
        },
      }),
    })
      .then((res) => this.adoptServerPatientId(umr, res))
      .catch(() => {})
      .finally(() => this.announceRegistered(newEncounter.id))

    this.notify()

    return newEncounter
  }

  /**
   * 3. Update Encounter (e.g. Consult, Vitals, Billing):
   */

  /**
   * The OP nurse station recording a patient's baseline observations.
   *
   * This is the gate between reception and the doctor. Booking an appointment
   * assigns the doctor and leaves the visit at "Doctor Assigned"; the patient is
   * only handed to the consulting room once the nurse has taken vitals, which
   * moves it to "In Queue". Without that step the doctor's queue filled with
   * patients nobody had seen yet, and the vitals panel on the admit card was
   * permanently blank.
   */
  /**
   * The OP desk calling a patient through to the nurse station.
   *
   * Step three of the outpatient flow: reception books, the appointment lands on
   * the OP hub, and somebody has to actually call the patient from the waiting
   * room before the nurse can take vitals. Nothing recorded that, so the nurse's
   * list could not tell a patient who had been called from one still sitting
   * outside unaware.
   *
   * The status is untouched -- being called is not a clinical stage, it is a
   * fact about the waiting room. Vitals are still what moves the visit on.
   */
  public getCallHistory(): DBCallEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CALL_HISTORY)
      if (!data) return []
      return JSON.parse(data)
    } catch {
      return []
    }
  }

  public recordCallEvent(event: Omit<DBCallEvent, "id">): DBCallEvent {
    try {
      const history = this.getCallHistory()
      // Prevent accidental duplicate history entries for the same event
      const existing = history.find(
        (h) =>
          h.encounterId === event.encounterId &&
          h.eventType === event.eventType &&
          Math.abs(new Date(h.timestamp).getTime() - new Date(event.timestamp).getTime()) < 5000,
      )
      if (existing) return existing

      const newEvent: DBCallEvent = {
        ...event,
        id: `CALL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      }
      const updated = [
        newEvent,
        ...history.filter(
          (h) => !(h.encounterId === event.encounterId && h.eventType === event.eventType),
        ),
      ].slice(0, 50)
      localStorage.setItem(STORAGE_KEYS.CALL_HISTORY, JSON.stringify(updated))
      this.notify()
      return newEvent
    } catch {
      return { ...event, id: `CALL-${Date.now()}` }
    }
  }

  public callToDoctor(
    id: string,
    calledBy: string = "OP Desk",
  ): DBOPEncounter | undefined {
    const existing = this.getEncounters().find((e) => e.id === id)
    if (!existing) return undefined
    const now = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    return this.updateEncounter(id, {
      status: existing.status === "Under Consultation" ? existing.status : "Awaiting Consultation",
      timestamps: {
        ...existing.timestamps,
        calledToDoctor: now,
        calledToDoctorBy: calledBy,
      },
    })
  }

  public callToNurseStation(
    id: string,
    calledBy: string,
  ): DBOPEncounter | undefined {
    const existing = this.getEncounters().find((e) => e.id === id)
    if (!existing) return undefined
    const now = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    return this.updateEncounter(id, {
      timestamps: {
        ...existing.timestamps,
        calledToNurse: now,
        calledToNurseBy: calledBy,
      },
    })
  }

  public recordVitals(
    id: string,

    vitals: DBOPEncounter["vitals"],

    nurseName: string,
  ): DBOPEncounter {
    const now = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    const existing = this.getEncounters().find((e) => e.id === id)

    const updated = this.updateEncounter(id, {
      vitals,

      status: "In Queue",

      timestamps: {
        ...(existing?.timestamps ?? { arrival: now }),
        vitalsRecorded: now,
        vitalsBy: nurseName,
      },
    })

    // Write-through to the real backend, keyed on the patient's UMR (not this
    // encounter's local id, which has no backend existence) -- best-effort,
    // same posture as ICU/OT: the local record above is what the UI reads
    // from immediately, this just makes the reading survive past this browser.
    if (existing?.umr && (vitals.bp || vitals.pulse || vitals.temp || vitals.spo2)) {
      apiFetch(`/api/patients/${existing.umr}/vitals`, {
        method: "POST",
        body: JSON.stringify({
          bp: vitals.bp || undefined,
          pulse: vitals.pulse ? parseInt(vitals.pulse) : undefined,
          temperature: vitals.temp ? parseFloat(vitals.temp) : undefined,
          spo2: vitals.spo2 ? parseInt(vitals.spo2) : undefined,
          notes: vitals.notes || undefined,
        }),
      }).catch(() => {
        // Offline/unreachable -- the local record above already has it.
      })
    }

    return updated
  }

  public updateEncounter(
    id: string,
    updates: Partial<DBOPEncounter>,
  ): DBOPEncounter {
    const encounters = this.getEncounters()

    let updated: DBOPEncounter | null = null

    const newEncounters = encounters.map((e) => {
      if (e.id === id) {
        const assignedDoc =
          updates.assignedDoctor !== undefined
            ? updates.assignedDoctor
            : e.assignedDoctor

        let cFee = e.billing?.consultationFee || 500
        if (updates.billing?.consultationFee !== undefined) {
          cFee = updates.billing.consultationFee
        } else if (
          updates.assignedDoctor &&
          updates.assignedDoctor !== e.assignedDoctor
        ) {
          cFee = getDoctorConsultationFee(updates.assignedDoctor)
        } else if (assignedDoc && (cFee === 50 || !e.billing?.consultationFee)) {
          cFee = getDoctorConsultationFee(assignedDoc)
        }

        const regFee =
          updates.billing?.registrationFee !== undefined
            ? updates.billing.registrationFee
            : (e.billing?.registrationFee ?? (e.isNew === false ? 0 : 20))

        const lFee =
          updates.billing?.labFee !== undefined
            ? updates.billing.labFee
            : (e.billing?.labFee || 0)

        const bStatus =
          updates.billing?.status || e.billing?.status || "Pending"
        const bMode = updates.billing?.mode || e.billing?.mode || "Card"

        const mergedBilling = {
          registrationFee: regFee,
          consultationFee: cFee,
          labFee: lFee,
          total: regFee + cFee + lFee,
          status: bStatus,
          mode: bMode,
        }

        updated = {
          ...e,
          ...updates,
          billing: mergedBilling,
        }

        return updated
      }

      return e
    })

    if (!updated) throw new Error(`Encounter ${id} not found.`)

    safeDbSetItem(STORAGE_KEYS.ENCOUNTERS, JSON.stringify(newEncounters))

    this.notify()

    return updated
  }

  /**
   * Delete patient and all their encounters by UMR
   */

  public deletePatientByUmr(umr: string): void {
    const patients = this.getPatients().filter(
      (p) => p.umr.toUpperCase() !== umr.toUpperCase(),
    )

    const encounters = this.getEncounters().filter(
      (e) => e.umr.toUpperCase() !== umr.toUpperCase(),
    )

    safeDbSetItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients))

    safeDbSetItem(STORAGE_KEYS.ENCOUNTERS, JSON.stringify(encounters))

    this.notify()
  }

  /**
   * Delete patient and all their encounters by Name
   */

  public deletePatientByName(name: string): void {
    const cleanName = name.trim().toLowerCase()

    const patients = this.getPatients().filter(
      (p) => !p.name.toLowerCase().includes(cleanName),
    )

    const encounters = this.getEncounters().filter(
      (e) => !e.patientName.toLowerCase().includes(cleanName),
    )

    safeDbSetItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients))

    safeDbSetItem(STORAGE_KEYS.ENCOUNTERS, JSON.stringify(encounters))

    this.notify()
  }

  /**
   * Delete a single encounter by ID
   */

  public deleteEncounterById(id: string): void {
    const encounters = this.getEncounters().filter((e) => e.id !== id)

    safeDbSetItem(STORAGE_KEYS.ENCOUNTERS, JSON.stringify(encounters))

    this.notify()
  }

  /**
   * Reset database back to seed defaults
   */

  public resetDatabase() {
    safeDbSetItem(
      STORAGE_KEYS.PATIENTS,
      JSON.stringify(INITIAL_SEED_PATIENTS),
    )

    safeDbSetItem(
      STORAGE_KEYS.ENCOUNTERS,
      JSON.stringify(INITIAL_SEED_ENCOUNTERS),
    )

    safeDbSetItem(STORAGE_KEYS.UMR_COUNTER, "10048")
    safeDbSetItem(STORAGE_KEYS.OP_COUNTER, "33")

    this.notify()
  }

  /**
   * Sync OP Visit Queue from real PostgreSQL backend into local store.
   * Enables cross-machine real-time queue & doctor alert synchronization.
   */
  public async syncOPVisitsWithBackend(): Promise<void> {
    try {
      const res = await apiFetch<{ queue?: any[] }>("/api/queue")
      if (res && Array.isArray(res.queue) && res.queue.length > 0) {
        const encounters = this.getEncounters()
        let hasChanges = false

        for (const item of res.queue) {
          const encId = item.appointment_id ? `ENC-${item.patient_id}-${item.appointment_id}` : `ENC-${item.patient_id}`
          // A bare UMR match is not proof it is the same person: a desk's UMR counter can
          // reissue a number the server already holds for someone else. Require the names
          // to agree before treating a UMR-only match as the same patient.
          const sameFirstName = (a: unknown, b: unknown) =>
            String(a || "").trim().toLowerCase().split(/\s+/)[0] === String(b || "").trim().toLowerCase().split(/\s+/)[0]
          const existingIndex = encounters.findIndex(
            (e) =>
              ((e.id === encId || e.umr === item.patient_id) &&
                sameFirstName(e.patientName, item.patient_name || item.patient_first_name)) ||
              // undefined === undefined would match every unlinked encounter to any row
              // that has no appointment id, so only compare real ids.
              ((e as any).dbAppointmentId != null &&
                ((e as any).dbAppointmentId === item.id || (e as any).dbAppointmentId === item.appointment_id))
          )

          const demo = queueDemographics(item)
          if (existingIndex >= 0) {
            const existing = encounters[existingIndex]
            const newStatus = item.status === "in_consultation" ? "Under Consultation" : item.status === "checked_in" ? "In Queue" : existing.status
            // "Dr. Staff" is a placeholder older versions sent to the server for a patient with no
            // doctor yet; it must not overwrite a doctor the desk has since booked.
            const serverDoctor = item.doctor_name && item.doctor_name !== "Dr. Staff" ? item.doctor_name : ""
            const newDoc = serverDoctor || (existing as any).assignedDoctor || (existing as any).doctorAssigned || item.doctor_name
            // Encounters this sync created are the server's patients: keep their
            // details in step with it. This also repairs the placeholders
            // ("+91 98765 43210", age 40, O+, "Main City") earlier versions
            // wrote when they read the wrong field names.
            const fromServer = existing.id === encId
            const fix: Partial<DBOPEncounter> = {}
            if (fromServer) {
              if (demo.patientName && demo.patientName !== existing.patientName) fix.patientName = demo.patientName
              if (demo.phone !== existing.phone && (demo.phone || existing.phone === PLACEHOLDER_PHONE)) fix.phone = demo.phone
              if (demo.age != null && demo.age !== existing.age) fix.age = demo.age
              if (demo.sex && demo.sex !== existing.sex) fix.sex = demo.sex
              if (demo.bloodGroup !== (existing.bloodGroup || "")) fix.bloodGroup = demo.bloodGroup
              if (existing.address === "Main City") fix.address = ""
            }

            if ((existing as any).assignedDoctor !== newDoc || existing.status !== newStatus || Object.keys(fix).length) {
              encounters[existingIndex] = {
                ...existing,
                ...fix,
                assignedDoctor: newDoc,
                doctorAssigned: newDoc,
                status: newStatus as any,
                ...(item.id || item.appointment_id ? { dbAppointmentId: item.id || item.appointment_id } : {}),
              } as any
              hasChanges = true
            }
          } else {
            const rawItemDate = item.appointment_date || item.created_at || new Date().toISOString()
            const itemDateIso = typeof rawItemDate === "string" && rawItemDate.includes("T")
              ? rawItemDate
              : new Date(rawItemDate).toISOString()
            const itemDateStr = itemDateIso.split("T")[0]
            const itemTimeStr = item.time_slot || new Date(itemDateIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

            const newEnc: DBOPEncounter = {
              id: encId,
              opNumber: `OP-${item.patient_id || "101"}`,
              tokenNo: `T-${item.id || 101}`,
              umr: item.patient_id || "UMR-UNKNOWN",
              // Only what the server sent; nothing is made up for a missing field.
              patientName: demo.patientName || "Patient",
              age: (demo.age ?? null) as any,
              sex: (demo.sex || "Other") as any,
              phone: demo.phone,
              address: item.patient_address || item.address || "",
              bloodGroup: demo.bloodGroup,
              dept: item.department || "General Medicine",
              isNew: false,
              date: itemDateStr,
              createdAt: itemDateIso,
              registrationTime: itemTimeStr,
              chiefComplaint: item.chief_complaint || "OP Visit",
              symptoms: item.chief_complaint ? [item.chief_complaint] : ["General Consultation"],
              aiSpecialty: item.department || "General Medicine",
              assignedDoctor: item.doctor_name || "Dr. Staff",
              doctorAssigned: item.doctor_name || "Dr. Staff",
              consultationType: "General Consultation",
              consultationFee: 500,
              payment: {
                totalAmount: 500,
                amountPaid: 500,
                balanceDue: 0,
                status: "Paid",
                mode: "Card",
              },
              furtherAction: "None",
              status: item.status === "in_consultation" ? "Under Consultation" : "In Queue",
              timestamps: {
                arrival: itemDateIso,
                registration: itemDateIso,
              },
              vitals: item.vitals ? {
                bp: item.vitals.bp || "120/80",
                pulse: item.vitals.pulse ? String(item.vitals.pulse) : "72",
                temp: item.vitals.temperature ? String(item.vitals.temperature) : "98.6",
                spo2: item.vitals.spo2 ? String(item.vitals.spo2) : "98",
              } : undefined,
            } as any
            encounters.unshift(newEnc)
            if (item.patient_id && !this.getPatientByUmr(item.patient_id)) {
              const allPatients = this.getPatients()
              const newPt: DBPatient = {
                umr: item.patient_id,
                name: demo.patientName || "Patient",
                dob: "1985-01-01",
                age: (demo.age ?? 40) as any,
                sex: (demo.sex || "Male") as any,
                phone: demo.phone || "+91 98765 43210",
                address: item.patient_address || item.address || "Main City",
                bloodGroup: demo.bloodGroup || "O+",
                createdAt: itemDateIso,
                updatedAt: itemDateIso,
              }
              safeDbSetItem(STORAGE_KEYS.PATIENTS, JSON.stringify([newPt, ...allPatients]))
            }
            hasChanges = true
          }
        }

        if (hasChanges) {
          safeDbSetItem(STORAGE_KEYS.ENCOUNTERS, JSON.stringify(encounters))
          this.notify()
        }
      }
    } catch {
      // Best-effort sync
    }
  }
}

export const db = new HospitalDatabase()

export interface PatientMatchResult {
  match: DBPatient | null // Non-null ONLY if name matches AND all other details (phone, age, sex) do NOT conflict with the DB record

  nameMatchedPatient: DBPatient | null // Non-null if ANY patient in DB has the same name

  mismatches: string[] // List of specific mismatched fields
}

/**
 * Robust matching logic:
 * When a name is entered:
 * - If name matches a patient in DB and all other entered details (phone, age, sex) match -> Existing Patient (match non-null)
 * - If name matches, but ANY detail (phone, age, sex) mismatches -> New Patient (match is null, nameMatchedPatient is set, mismatches lists details)
 * - If name does not match any patient in DB -> New Patient (match and nameMatchedPatient are null)
 */

export function findMatchingPatient(
  patients: DBPatient[],

  params: {
    fullName: string

    dob?: string

    age?: number

    sex?: string

    phone?: string
  },
): PatientMatchResult {
  const cleanName = params.fullName.trim().toLowerCase()

  if (cleanName.length < 2) {
    return { match: null, nameMatchedPatient: null, mismatches: [] }
  }

  // Find all patients in DB with the exact same name (case-insensitive)

  const candidates = patients.filter(
    (p) => p.name.trim().toLowerCase() === cleanName,
  )

  if (candidates.length === 0) {
    return { match: null, nameMatchedPatient: null, mismatches: [] }
  }

  // Check each candidate for an exact non-conflicting match

  for (const candidate of candidates) {
    const candidateMismatches: string[] = []

    // 1. Exact Date of Birth (DOB) comparison

    if (params.dob && candidate.dob) {
      if (params.dob.trim() !== candidate.dob.trim()) {
        candidateMismatches.push(
          `DOB differs (${params.dob} vs registered ${candidate.dob})`,
        )
      }
    } else if (
      params.age !== undefined &&
      params.age !== null &&
      params.age > 0
    ) {
      // Fallback to age comparison if candidate record does not have explicit DOB stored

      if (params.age !== candidate.age) {
        candidateMismatches.push(
          `Age differs (${params.age} yrs vs registered ${candidate.age} yrs)`,
        )
      }
    }

    // 2. Phone number comparison (digits only, normalizing national 10-digit if prefixed with country code)
    if (params.phone && params.phone.trim().length >= 4) {
      const inputDigits = params.phone.replace(/\D/g, "")
      const dbDigits = candidate.phone.replace(/\D/g, "")
      const normInput = inputDigits.length >= 10 ? inputDigits.slice(-10) : inputDigits
      const normDb = dbDigits.length >= 10 ? dbDigits.slice(-10) : dbDigits

      if (normInput && normDb && normInput !== normDb) {
        candidateMismatches.push(
          `Phone number differs (${params.phone.trim()} vs ${candidate.phone})`,
        )
      }
    }

    // 3. Gender comparison (if sex is provided and not empty)

    if (params.sex && params.sex.trim() !== "") {
      if (
        params.sex.trim().toLowerCase() !== candidate.sex.trim().toLowerCase()
      ) {
        candidateMismatches.push(
          `Gender differs (${params.sex} vs ${candidate.sex})`,
        )
      }
    }

    // If zero mismatches, we found an exact match!

    if (candidateMismatches.length === 0) {
      return {
        match: candidate,

        nameMatchedPatient: candidate,

        mismatches: [],
      }
    }
  }

  // If no candidate matched without mismatches, collect the mismatches of the primary candidate

  const primaryCandidate = candidates[0]

  const detectedMismatches: string[] = []

  if (params.dob && primaryCandidate.dob) {
    if (params.dob.trim() !== primaryCandidate.dob.trim()) {
      detectedMismatches.push(
        `DOB differs: ${params.dob} vs registered ${primaryCandidate.dob}`,
      )
    }
  } else if (
    params.age !== undefined &&
    params.age !== null &&
    params.age > 0 &&
    params.age !== primaryCandidate.age
  ) {
    detectedMismatches.push(
      `Age differs: ${params.age} yrs vs registered ${primaryCandidate.age} yrs`,
    )
  }

  if (params.phone && params.phone.trim().length >= 4) {
    const inputDigits = params.phone.replace(/\D/g, "")
    const dbDigits = primaryCandidate.phone.replace(/\D/g, "")
    const normInput = inputDigits.length >= 10 ? inputDigits.slice(-10) : inputDigits
    const normDb = dbDigits.length >= 10 ? dbDigits.slice(-10) : dbDigits

    if (normInput && normDb && normInput !== normDb) {
      detectedMismatches.push(
        `Phone number differs: "${params.phone.trim()}" vs registered "${primaryCandidate.phone}"`,
      )
    }
  }

  if (
    params.sex &&
    params.sex.trim() !== "" &&
    params.sex.trim().toLowerCase() !==
      primaryCandidate.sex.trim().toLowerCase()
  ) {
    detectedMismatches.push(
      `Gender differs: ${params.sex} vs registered ${primaryCandidate.sex}`,
    )
  }

  return {
    match: null,

    nameMatchedPatient: primaryCandidate,

    mismatches: detectedMismatches,
  }
}
