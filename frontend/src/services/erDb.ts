/**
 * Enterprise Hospital Management System - Emergency Room & Bed Management Persistent Store
 * Provides full offline/local storage fallback and data persistence for ER & Bed workflows.
 */

import { db } from "./db"
import { LLM_API_KEY, LLM_CHAT_URL, llmModel } from "../lib/llm"

export interface ErPatientMedicalProfile {
  chronic_conditions: string[]

  past_medical_history: string

  past_surgeries: string

  family_history: string

  current_medications: Array<{
    name: string

    dosage: string

    frequency: string

    indication: string
  }>
}

export interface ErPatient {
  patient_id: string

  name: string

  last_name: string

  gender: string

  age: number

  dob?: string

  phone: string

  emergency_contact: string

  emergency_contact_name?: string

  emergency_contact_relation?: string

  guardian_name?: string

  guardian_relation?: string

  address?: string

  allergies?: string

  blood_group?: string

  created_at: string

  medical_profile?: ErPatientMedicalProfile
}

export interface ErComplaintItem {
  id: number

  complaint: string

  severity: string | null

  case_category: string | null

  duration: string | null

  reported_by: string | null

  created_at: string
}

export interface ErVitalsItem {
  id: number

  recorded_at: string

  recorded_by: string | null

  heart_rate: number | null

  bp_systolic: number | null

  bp_diastolic: number | null

  respiratory_rate: number | null

  spo2: number | null

  temperature: number | null

  consciousness_level: string | null

  blood_glucose: number | null

  pain_score: number | null

  gcs: number | null

  notes: string | null
}

export interface ErTriageItem {
  category: string

  triage_bed_label: string | null

  reason: string | null

  triaged_at: string

  assigned_by: string | null
}

export interface ErTreatmentItem {
  id: number

  intervention_type: string

  description: string | null

  performed_at: string

  administered_by: string | null
}

export interface ErClinicalNoteItem {
  id: number

  note_type: string

  author: string | null

  content: string

  created_at: string
}

export interface ErDispositionItem {
  outcome: string

  required_specialty: string | null

  clinical_reason: string

  decided_by: string | null

  decided_at: string

  priority: string | null
}

export interface ErBedRequestItem {
  id: number

  status: string

  requested_level_of_care: string

  requested_specialty: string | null

  requested_at: string

  allocated_bed_id: number | null

  allocated_admission_id: number | null

  allocated_at: string | null
}

export interface ErConsentItem {
  id: number

  hospital_id?: number

  patient_id?: string

  patient_name: string

  consent_type: string

  signed_by: string

  relation_to_patient?: string

  status: string

  witness_doctor?: string

  signed_by_phone?: string

  refusal_reason?: string

  legal_waiver_acknowledged: boolean

  er_visit_id?: number

  notes?: string

  signed_at?: string

  document_filename?: string | null

  document_mime_type?: string | null
}

export interface ErInvestigationItem {
  id: number

  test_name: string

  category: string

  priority: string

  ordered_at: string

  ordered_by: string

  status: "Completed" | "In Progress" | "Ordered" | "Sample Collected"

  result: string | null

  result_summary?: string | null

  verified_at?: string | null
}

export type ErTimelineEventType = "patient_arrived" | "bed_assigned" | "initial_vitals" | "medication_given" | "intervention_given" | "investigation_ordered" | "followup_vitals" | "patient_stabilized" | "doctor_assigned" | "doctor_arrived" | "doctor_assessment_completed" | "destination_assigned" | "destination_bed_assigned" | "patient_transferred"

export interface ErTimelineEventItem {
  id: number

  event_type: ErTimelineEventType

  event_name: string

  timestamp: string // ISO string

  logged_by: string // e.g. "Staff Nurse Jessica Carter, RN"

  visit_id: number

  visit_no: string

  patient_id?: string | null

  location?: string | null

  bed?: string | null

  notes?: string | null

  vitals_data?: {
    bp_systolic?: number | null

    bp_diastolic?: number | null

    heart_rate?: number | null

    spo2?: number | null

    respiratory_rate?: number | null

    temperature?: number | null

    blood_glucose?: number | null

    pain_score?: number | null

    gcs?: number | null

    notes?: string | null
  }

  medication_data?: {
    drug_name: string

    dosage: string

    route: string

    response?: string

    notes?: string
  }

  intervention_data?: {
    intervention_type: string

    details?: string

    patient_response?: string

    notes?: string
  }

  investigation_data?: {
    test_name: string

    priority?: string

    category?: string

    notes?: string
  }

  stabilization_data?: {
    status: string

    clinical_notes?: string
  }

  doctor_data?: {
    doctor_name: string

    specialty: string

    assignment_method: "Manual by Nurse" | "AI Recommended & Nurse Confirmed"

    notes?: string
  }

  assessment_data?: {
    doctor_name: string

    clinical_impression?: string

    acute_condition?: string

    care_plan?: string
  }

  destination_data?: {
    destination: "Ward" | "ICU" | "HDU" | "Specialty Ward" | "Observation" | "Operating Theatre" | "Discharge"

    clinical_reason?: string

    doctor_name?: string

    ai_recommendation_notes?: string
  }

  destination_bed_data?: {
    department: string

    bed_id_or_label: string

    allocated_by?: string
  }

  transfer_data?: {
    source_location: string

    target_destination: string

    target_bed: string

    transfer_status: "Transfer Completed" | "In Transit"

    escorting_staff?: string

    handover_notes?: string
  }
}

export interface ErVisitRecord {
  id: number

  visit_no: string

  patient_id: string | null

  is_unknown_patient: boolean

  unknown_patient_label: string | null

  arrival_mode: string | null

  brought_by?: string | null

  attendant_name?: string | null

  attendant_relation?: string | null

  condition_at_arrival: string | null

  consciousness?: string | null

  info_provided_by?: string | null

  arrival_at: string | null

  status: string

  assigned_doctor_name: string | null

  assigned_specialty: string | null

  doctor_assigned_at: string | null

  doctor_accepted_at: string | null

  triage_category: string | null

  triage_bed_label: string | null

  closed_at: string | null

  police_involved?: boolean

  patient_name?: string | null

  patient_last_name?: string | null

  patient_gender?: string | null

  patient_age?: number | null

  patient_phone?: string | null

  patient_emergency_contact?: string | null

  patient?: ErPatient | null

  prior_visits_count?: number

  complaints: ErComplaintItem[]

  vitals: ErVitalsItem[]

  triage: ErTriageItem | null

  treatments: ErTreatmentItem[]

  clinical_notes: ErClinicalNoteItem[]

  investigations?: ErInvestigationItem[]

  disposition: ErDispositionItem | null

  bed_requests: ErBedRequestItem[]

  consents: ErConsentItem[]

  timeline_events?: ErTimelineEventItem[]
}

export interface TriageCategoryConfig {
  id: number

  category_code: string

  category_label: string

  description: string | null

  color: string | null

  sort_order: number
}

const DEFAULT_TRIAGE_CATEGORIES: TriageCategoryConfig[] = [
  {
    id: 1,
    category_code: "B1",
    category_label: "Immediate / Resuscitation",
    description:
      "Life-threatening condition requiring immediate medical intervention",
    color: "#DC2626",
    sort_order: 1,
  },

  {
    id: 2,
    category_code: "B2",
    category_label: "High / Emergent",
    description:
      "Potentially life-threatening condition; assessment within 10-15 minutes",
    color: "#EA580C",
    sort_order: 2,
  },

  {
    id: 3,
    category_code: "B3",
    category_label: "Moderate / Urgent",
    description:
      "Serious condition requiring medical evaluation within 30-60 minutes",
    color: "#D97706",
    sort_order: 3,
  },

  {
    id: 4,
    category_code: "B4",
    category_label: "Low / Less Urgent",
    description: "Stable condition, routine emergency evaluation",
    color: "#16A34A",
    sort_order: 4,
  },

  {
    id: 5,
    category_code: "B5",
    category_label: "Non-Urgent",
    description:
      "Minor presentation, can be managed electively or referred to OP",
    color: "#2563EB",
    sort_order: 5,
  },

  {
    id: 6,
    category_code: "Black",
    category_label: "Expectant / Comfort Care",
    description:
      "Catastrophic non-survivable presentation or deceased; comfort & palliative care",
    color: "#1E293B",
    sort_order: 6,
  },
]

const INITIAL_PATIENTS: ErPatient[] = [
  {
    patient_id: "P-100245",

    name: "John",

    last_name: "Smith",

    gender: "Male",

    age: 45,

    phone: "9876543210",

    emergency_contact: "9876543211",

    guardian_name: "Mary Smith (Spouse)",

    address: "124 Park Avenue, South Block, Metro City",

    allergies: "Penicillin",

    blood_group: "O+",

    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },

  {
    patient_id: "P-100342",

    name: "Rahul",

    last_name: "Sharma",

    gender: "Male",

    age: 28,

    phone: "9823456789",

    emergency_contact: "9823456780",

    guardian_name: "Sunita Sharma (Mother)",

    address: "45 Hill View Road, Metro City",

    allergies: "None",

    blood_group: "B+",

    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
  },

  {
    patient_id: "P-100289",

    name: "Robert",

    last_name: "Lee",

    gender: "Male",

    age: 64,

    phone: "9833445566",

    emergency_contact: "9833445567",

    guardian_name: "Karen Lee (Spouse)",

    address: "109 Sunset Boulevard, Metro City",

    allergies: "NSAIDs",

    blood_group: "A+",

    created_at: new Date(Date.now() - 3600000 * 7).toISOString(),
  },

  {
    patient_id: "P-100512",

    name: "Maria",

    last_name: "Garcia",

    gender: "Female",

    age: 29,

    phone: "9845123456",

    emergency_contact: "9845123457",

    guardian_name: "Carlos Garcia (Brother)",

    address: "88 Lakeview Road, Metro City",

    allergies: "Sulfa drugs",

    blood_group: "A-",

    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  },

  {
    patient_id: "P-100301",

    name: "Thomas",

    last_name: "Reed",

    gender: "Male",

    age: 52,

    phone: "9712345678",

    emergency_contact: "9712345679",

    guardian_name: "Helen Reed (Spouse)",

    address: "12 Pine Ridge, Metro City",

    allergies: "None",

    blood_group: "O-",

    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },

  {
    patient_id: "P-100711",

    name: "Baby Aarav",

    last_name: "Sen",

    gender: "Male",

    age: 4,

    phone: "9866778899",

    emergency_contact: "9866778890",

    guardian_name: "Dr. Siddharth Sen (Father)",

    address: "22 Palm Grove, Metro City",

    allergies: "None",

    blood_group: "B+",

    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },

  {
    patient_id: "P-100888",
    name: "Appanna",
    last_name: "Chinnapati",
    gender: "Male",
    age: 54,
    phone: "9848022338",
    emergency_contact: "9848022339",
    emergency_contact_name: "Chinnapati Lakshmi",
    emergency_contact_relation: "Wife",
    guardian_name: "Chinnapati Lakshmi (Wife)",
    address: "D.No. 4-128, Main Road, Kankipadu, Krishna District, Andhra Pradesh - 521151",
    allergies: "NKDA (No Known Drug Allergies)",
    blood_group: "B+",
    created_at: "2026-10-04T02:30:00.000Z",
  },
]

const INITIAL_VISITS: ErVisitRecord[] = [
  // ── CASE 1: CARDIAC STEMI / CHEST PAIN (Immediate / Resuscitation - B1) ──

  {
    id: 1,

    visit_no: "ER-2026-00001",

    patient_id: "P-100245",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "ambulance_108",

    condition_at_arrival:
      "Acute STEMI / Severe Substernal Crushing Chest Pain radiating to left jaw and arm with diaphoresis",

    arrival_at: new Date(Date.now() - 25 * 60000).toISOString(),

    status: "under_treatment",

    assigned_doctor_name: "Dr. Vikram Seth",

    assigned_specialty: "Cardiology",

    doctor_assigned_at: new Date(Date.now() - 24 * 60000).toISOString(),

    doctor_accepted_at: new Date(Date.now() - 23 * 60000).toISOString(),

    triage_category: "B1",

    triage_bed_label: "ER-B1-02",

    closed_at: null,

    patient_name: "John",

    patient_last_name: "Smith",

    patient_gender: "Male",

    patient_age: 45,

    patient_phone: "9876543210",

    patient_emergency_contact: "9876543211",

    complaints: [
      {
        id: 1,

        complaint:
          "Sudden onset severe crushing retrosternal chest pain (10/10) with radiation to left arm, cold profuse sweating and shortness of breath for 45 mins",

        severity: "Critical",

        case_category: "cardiac",

        duration: "45 mins",

        reported_by: "Patient & 108 Paramedic",

        created_at: new Date(Date.now() - 25 * 60000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(Date.now() - 24 * 60000).toISOString(),

        recorded_by: "Triage RN Lisa Park",

        heart_rate: 118,

        bp_systolic: 88,

        bp_diastolic: 54,

        respiratory_rate: 26,

        spo2: 91,

        temperature: 98.2,

        consciousness_level: "Alert (A)",

        blood_glucose: 148,

        pain_score: 10,

        gcs: 15,

        notes:
          "Diaphoretic, pale, cool clammy extremities. ECG STAT ordered. Red alert activated.",
      },

      {
        id: 2,

        recorded_at: new Date(Date.now() - 10 * 60000).toISOString(),

        recorded_by: "Staff Nurse Priya",

        heart_rate: 96,

        bp_systolic: 108,

        bp_diastolic: 68,

        respiratory_rate: 20,

        spo2: 98,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 142,

        pain_score: 5,

        gcs: 15,

        notes:
          "Post dual antiplatelet loading + IV Fentanyl + O2 4L via nasal cannula. Pain reduced to 5/10.",
      },
    ],

    triage: {
      category: "B1",

      triage_bed_label: "ER-B1-02",

      reason:
        "Acute Anterior Wall STEMI with cardiogenic instability; door-to-balloon protocol activated.",

      triaged_at: new Date(Date.now() - 24 * 60000).toISOString(),

      assigned_by: "Nurse Lisa Park",
    },

    treatments: [
      {
        id: 1,

        intervention_type: "Supplemental O2 & Defibrillator Pads",

        description:
          "High flow O2 at 4 L/min via nasal prongs, continuous ECG rhythm monitoring and multifunction pacing/defibrillation pads applied",

        performed_at: new Date(Date.now() - 22 * 60000).toISOString(),

        administered_by: "Nurse Lisa Park",
      },

      {
        id: 2,

        intervention_type: "Dual Antiplatelet Loading (Aspirin + Ticagrelor)",

        description:
          "Dispersible Aspirin 300mg PO + Ticagrelor 180mg PO loading dose administered immediately",

        performed_at: new Date(Date.now() - 20 * 60000).toISOString(),

        administered_by: "Staff Nurse Priya",
      },

      {
        id: 3,

        intervention_type: "IV Heparin Bolus & High-Dose Statin",

        description:
          "Unfractionated Heparin 5000 IU IV bolus + Atorvastatin 80mg PO administered",

        performed_at: new Date(Date.now() - 18 * 60000).toISOString(),

        administered_by: "Dr. Vikram Seth",
      },

      {
        id: 4,

        intervention_type: "Cath Lab Emergency Activation",

        description:
          "Primary Percutaneous Coronary Intervention (PPCI) team and On-Call Interventional Cardiologist paged for immediate coronary angiography",

        performed_at: new Date(Date.now() - 15 * 60000).toISOString(),

        administered_by: "Dr. Vikram Seth",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "Cardiology ER Assessment",

        author: "Dr. Vikram Seth",

        content:
          "45yo male presenting with acute anterior wall STEMI (ST elevations in V1-V4 > 3mm). Trop-I markedly positive (>50 ng/mL). Hemodynamically stabilized with dual antiplatelet loading, statin, and IV heparin. Cath lab is ready. Immediate transfer for primary angioplasty (PCI). Informed consent signed by spouse Mary Smith.",

        created_at: new Date(Date.now() - 12 * 60000).toISOString(),
      },
    ],

    investigations: [
      {
        id: 1,

        test_name: "STAT 12-Lead ECG",

        category: "Cardiology",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 23 * 60000).toISOString(),

        ordered_by: "Dr. Vikram Seth",

        status: "Completed",

        result:
          "Sinus tachycardia at 112 bpm. 3.5mm ST elevation in leads V1-V4 with reciprocal ST depression in II, III, aVF. Acute Extensive Anterior STEMI.",

        result_summary: "Acute Anterior STEMI (V1-V4)",

        verified_at: new Date(Date.now() - 20 * 60000).toISOString(),
      },

      {
        id: 2,

        test_name: "Cardiac Troponin-I (High Sensitivity Rapid Point of Care)",

        category: "Laboratory",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 22 * 60000).toISOString(),

        ordered_by: "Dr. Vikram Seth",

        status: "Completed",

        result:
          "Troponin I: 52.40 ng/mL (Reference: < 0.04 ng/mL - Highly Elevated).",

        result_summary: "Trop-I: 52.40 ng/mL (Critical High)",

        verified_at: new Date(Date.now() - 14 * 60000).toISOString(),
      },

      {
        id: 3,

        test_name: "Bedside Point-of-Care Echocardiogram (POCUS)",

        category: "Cardiology",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 18 * 60000).toISOString(),

        ordered_by: "Dr. Vikram Seth",

        status: "Completed",

        result:
          "Severe hypokinesia to akinesia of anterior wall and apex. LVEF estimated at 35-40%. No mechanical complications or pericardial effusion.",

        result_summary: "LVEF 35-40%, Anterior Hypokinesia",

        verified_at: new Date(Date.now() - 10 * 60000).toISOString(),
      },
    ],

    disposition: {
      outcome: "admit_icu",

      required_specialty: "Cardiology / Cath Lab",

      clinical_reason:
        "Immediate Cath Lab transfer for Primary PCI followed by Cardiac Intensive Care Unit (CCU) admission",

      decided_by: "Dr. Vikram Seth",

      decided_at: new Date(Date.now() - 12 * 60000).toISOString(),

      priority: "Emergency",
    },

    bed_requests: [
      {
        id: 1,

        status: "allocated",

        requested_level_of_care: "Cardiac ICU (CCU)",

        requested_specialty: "Cardiology",

        requested_at: new Date(Date.now() - 12 * 60000).toISOString(),

        allocated_bed_id: 101,

        allocated_admission_id: 501,

        allocated_at: new Date(Date.now() - 5 * 60000).toISOString(),
      },
    ],

    consents: [
      {
        id: 1,

        patient_name: "John Smith",

        consent_type:
          "Emergency Coronary Angiography and Primary Angioplasty (PCI)",

        signed_by: "Mary Smith",

        relation_to_patient: "Spouse",

        status: "Completed",

        witness_doctor: "Dr. Vikram Seth",

        legal_waiver_acknowledged: true,

        notes:
          "Risks, benefits, contrast allergy, and stent placement fully explained to spouse Mary Smith.",

        signed_at: new Date(Date.now() - 15 * 60000).toISOString(),
      },
    ],
  },

  // ── CASE 2: POLYTRAUMA / HIGH-SPEED RTA (Immediate / Resuscitation - B1) ──

  {
    id: 2,

    visit_no: "ER-2026-00002",

    patient_id: "P-100342",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "ambulance_108",

    condition_at_arrival:
      "Polytrauma post High-Speed Motorcycle Collision vs Heavy Truck; Unresponsive, Hemoperitoneum, Multiple Long-Bone Fractures",

    arrival_at: new Date(Date.now() - 40 * 60000).toISOString(),

    status: "under_treatment",

    assigned_doctor_name: "Dr. Sanjay Gupta",

    assigned_specialty: "Orthopedics / Trauma",

    doctor_assigned_at: new Date(Date.now() - 39 * 60000).toISOString(),

    doctor_accepted_at: new Date(Date.now() - 38 * 60000).toISOString(),

    triage_category: "B1",

    triage_bed_label: "ER-TRAUMA-01",

    closed_at: null,

    patient_name: "Rahul",

    patient_last_name: "Sharma",

    patient_gender: "Male",

    patient_age: 28,

    patient_phone: "9823456789",

    patient_emergency_contact: "9823456780",

    complaints: [
      {
        id: 2,

        complaint:
          "High-energy road traffic collision, unrestrained rider thrown 15 feet. Blunt trauma chest/abdomen, compound fracture right femur, unstable pelvic ring",

        severity: "Critical",

        case_category: "trauma",

        duration: "30 mins",

        reported_by: "108 Advanced Life Support Paramedic",

        created_at: new Date(Date.now() - 40 * 60000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 3,

        recorded_at: new Date(Date.now() - 38 * 60000).toISOString(),

        recorded_by: "Trauma RN David Miller",

        heart_rate: 138,

        bp_systolic: 78,

        bp_diastolic: 46,

        respiratory_rate: 32,

        spo2: 86,

        temperature: 96.8,

        consciousness_level: "Voice (V)",

        blood_glucose: 162,

        pain_score: 10,

        gcs: 9,

        notes:
          "GCS E2V2M5 (9/15). Asymmetrical chest rise, open deformity right thigh, pelvic spring tenderness. Massive transfusion protocol triggered.",
      },

      {
        id: 4,

        recorded_at: new Date(Date.now() - 15 * 60000).toISOString(),

        recorded_by: "Trauma RN David Miller",

        heart_rate: 108,

        bp_systolic: 102,

        bp_diastolic: 64,

        respiratory_rate: 18,

        spo2: 99,

        temperature: 97.6,

        consciousness_level: "Sedated / Intubated",

        blood_glucose: 138,

        pain_score: 0,

        gcs: 3,

        notes:
          "Post rapid sequence intubation (ETT 8.0), right intercostal chest tube (300mL hemothorax drained), 2 units O-neg PRBC + 2 units FFP transfused.",
      },
    ],

    triage: {
      category: "B1",

      triage_bed_label: "ER-TRAUMA-01",

      reason:
        "Level-1 Code Red Polytrauma with Hemorrhagic Shock, Hemoperitoneum & Hemothorax.",

      triaged_at: new Date(Date.now() - 38 * 60000).toISOString(),

      assigned_by: "Dr. Sanjay Gupta",
    },

    treatments: [
      {
        id: 5,

        intervention_type: "Emergency Rapid Sequence Intubation (RSI)",

        description:
          "Size 8.0 cuffed ETT placed at 22cm mark with inline cervical stabilization; mechanical ventilation initiated (FiO2 100%, PEEP 5)",

        performed_at: new Date(Date.now() - 35 * 60000).toISOString(),

        administered_by: "Dr. Anita Roy",
      },

      {
        id: 6,

        intervention_type: "Right Intercostal Chest Tube Insertion (ICD)",

        description:
          "28 Fr chest tube placed in 5th intercostal space anterior axillary line; drained 300 mL fresh blood with underwater seal",

        performed_at: new Date(Date.now() - 30 * 60000).toISOString(),

        administered_by: "Dr. Sanjay Gupta",
      },

      {
        id: 7,

        intervention_type: "Pelvic Binder & Thomas Splint Application",

        description:
          "Sam Pelvic Sling applied at level of greater trochanters; Thomas traction splint applied to right femur",

        performed_at: new Date(Date.now() - 25 * 60000).toISOString(),

        administered_by: "Dr. Sanjay Gupta",
      },

      {
        id: 8,

        intervention_type: "Massive Transfusion Protocol (MTP) & TXA",

        description:
          "Tranexamic Acid (TXA) 1g IV bolus + 2 units O-negative PRBC + 2 units FFP administered via Belmont rapid infuser",

        performed_at: new Date(Date.now() - 22 * 60000).toISOString(),

        administered_by: "Trauma RN David Miller",
      },
    ],

    clinical_notes: [
      {
        id: 2,

        note_type: "Trauma Team Leader Note",

        author: "Dr. Sanjay Gupta",

        content:
          "28yo male polytrauma victim. Primary survey completed: Airway secured via ETT, right hemothorax decompressed with chest tube, hemorrhagic shock resuscitated with MTP. FAST ultrasound positive in Morison's pouch and splenorenal recess with free fluid. Right femur open fracture Grade IIIA + unstable pelvis. Emergency damage control laparotomy and external fixation scheduled in OT 1.",

        created_at: new Date(Date.now() - 15 * 60000).toISOString(),
      },
    ],

    investigations: [
      {
        id: 4,

        test_name:
          "STAT Extended Focused Assessment with Sonography for Trauma (E-FAST)",

        category: "Point of Care",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 36 * 60000).toISOString(),

        ordered_by: "Dr. Sanjay Gupta",

        status: "Completed",

        result:
          "Positive free fluid in Right Upper Quadrant (Morison's pouch) and pelvis. Right hemothorax confirmed. Normal cardiac views.",

        result_summary: "E-FAST Positive (Hemoperitoneum & Hemothorax)",

        verified_at: new Date(Date.now() - 32 * 60000).toISOString(),
      },

      {
        id: 5,

        test_name:
          "STAT Trauma Pan-Scan CT (Brain, C-Spine, Chest, Abdomen, Pelvis)",

        category: "Radiology / CT",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 25 * 60000).toISOString(),

        ordered_by: "Dr. Sanjay Gupta",

        status: "Completed",

        result:
          "Grade III Splenic laceration with active contrast extravasation. Right lung contusion with residual hemothorax. Comminuted right femoral shaft fracture with displaced right iliac wing fracture.",

        result_summary: "Splenic Laceration Grade III, Femur + Pelvis Fx",

        verified_at: new Date(Date.now() - 12 * 60000).toISOString(),
      },

      {
        id: 6,

        test_name: "STAT Arterial Blood Gas (ABG) & Lactate",

        category: "Laboratory",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 36 * 60000).toISOString(),

        ordered_by: "Dr. Sanjay Gupta",

        status: "Completed",

        result:
          "pH 7.26, PaO2 140 (on FiO2 1.0), PaCO2 34, HCO3 16 mEq/L, Base Deficit -8.4 mmol/L, Lactate 5.6 mmol/L.",

        result_summary: "Severe Metabolic Acidosis (Lactate 5.6)",

        verified_at: new Date(Date.now() - 28 * 60000).toISOString(),
      },
    ],

    disposition: {
      outcome: "admit_icu",

      required_specialty: "Trauma Surgery / Surgical ICU",

      clinical_reason:
        "Immediate transfer to Emergency OT for exploratory laparotomy, splenectomy/repair & damage control Ortho ex-fix, followed by Trauma ICU",

      decided_by: "Dr. Sanjay Gupta",

      decided_at: new Date(Date.now() - 10 * 60000).toISOString(),

      priority: "Emergency",
    },

    bed_requests: [
      {
        id: 2,

        status: "allocated",

        requested_level_of_care: "Trauma ICU",

        requested_specialty: "Trauma Surgery",

        requested_at: new Date(Date.now() - 10 * 60000).toISOString(),

        allocated_bed_id: 103,

        allocated_admission_id: 503,

        allocated_at: new Date(Date.now() - 5 * 60000).toISOString(),
      },
    ],

    consents: [
      {
        id: 2,

        patient_name: "Rahul Sharma",

        consent_type:
          "Emergency Life-Saving Surgery (Damage Control Laparotomy & External Fixation)",

        signed_by: "Sunita Sharma",

        relation_to_patient: "Mother",

        status: "Completed",

        witness_doctor: "Dr. Sanjay Gupta",

        legal_waiver_acknowledged: true,

        notes:
          "Critical nature, risk of bleeding, anesthesia, splenectomy and ICU care fully explained.",

        signed_at: new Date(Date.now() - 14 * 60000).toISOString(),
      },
    ],
  },

  // ── CASE 3: ACUTE ISCHEMIC STROKE / CODE STROKE (High / Emergent - B2) ──

  {
    id: 3,

    visit_no: "ER-2026-00003",

    patient_id: "P-100289",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "private_vehicle",

    condition_at_arrival:
      "Acute Ischemic Stroke (Code Stroke) / Right-sided Hemiplegia, Expressive Aphasia & Facial Droop (Onset 60 mins ago)",

    arrival_at: new Date(Date.now() - 60 * 60000).toISOString(),

    status: "under_treatment",

    assigned_doctor_name: "Dr. Meenakshi Rao",

    assigned_specialty: "Neurology",

    doctor_assigned_at: new Date(Date.now() - 58 * 60000).toISOString(),

    doctor_accepted_at: new Date(Date.now() - 56 * 60000).toISOString(),

    triage_category: "B2",

    triage_bed_label: "ER-B2-01",

    closed_at: null,

    patient_name: "Robert",

    patient_last_name: "Lee",

    patient_gender: "Male",

    patient_age: 64,

    patient_phone: "9833445566",

    patient_emergency_contact: "9833445567",

    complaints: [
      {
        id: 3,

        complaint:
          "Sudden weakness in right arm and leg, slurred speech and facial asymmetry starting 1 hour ago",

        severity: "Severe",

        case_category: "neurological",

        duration: "1 hour",

        reported_by: "Spouse (Karen Lee)",

        created_at: new Date(Date.now() - 60 * 60000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 5,

        recorded_at: new Date(Date.now() - 58 * 60000).toISOString(),

        recorded_by: "Triage RN Lisa Park",

        heart_rate: 84,

        bp_systolic: 178,

        bp_diastolic: 102,

        respiratory_rate: 18,

        spo2: 97,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 118,

        pain_score: 0,

        gcs: 14,

        notes:
          "NIHSS Score: 13. Right facial palsy, 2/5 power in right upper/lower extremity, expressive dysphasia.",
      },

      {
        id: 6,

        recorded_at: new Date(Date.now() - 25 * 60000).toISOString(),

        recorded_by: "Staff Nurse Priya",

        heart_rate: 78,

        bp_systolic: 156,

        bp_diastolic: 92,

        respiratory_rate: 16,

        spo2: 98,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 115,

        pain_score: 0,

        gcs: 14,

        notes:
          "Post IV Labetalol 10mg. BP reduced to target 156/92. Thrombolysis bolus initiated.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "ER-B2-01",

      reason:
        "Hyperacute Ischemic Stroke (Code Stroke) presenting well within 4.5 hour IV thrombolytic window.",

      triaged_at: new Date(Date.now() - 58 * 60000).toISOString(),

      assigned_by: "Nurse Lisa Park",
    },

    treatments: [
      {
        id: 9,

        intervention_type: "Code Stroke Activation",

        description:
          "Emergency Stroke Team & Neuro-Radiology rapid response triggered",

        performed_at: new Date(Date.now() - 56 * 60000).toISOString(),

        administered_by: "Dr. Meenakshi Rao",
      },

      {
        id: 10,

        intervention_type: "Labetalol IV",

        description:
          "10 mg slow IV push over 2 mins for pre-thrombolysis BP optimization (<180/105)",

        performed_at: new Date(Date.now() - 40 * 60000).toISOString(),

        administered_by: "Nurse Priya",
      },

      {
        id: 11,

        intervention_type: "IV Tenecteplase / Alteplase Thrombolysis",

        description:
          "0.25 mg/kg IV bolus administered post-CT negative for intracranial hemorrhage",

        performed_at: new Date(Date.now() - 28 * 60000).toISOString(),

        administered_by: "Dr. Meenakshi Rao",
      },
    ],

    clinical_notes: [
      {
        id: 3,

        note_type: "Neurology Code Stroke Note",

        author: "Dr. Meenakshi Rao",

        content:
          "64yo male with acute left MCA territory ischemic stroke. Last known normal 60 mins prior to arrival. Non-contrast Head CT reveals no acute hemorrhage with ASPECTS score 9. CTA shows distal left M1 stenosis without completed infarct. IV thrombolytic therapy initiated after verifying strict inclusion/exclusion criteria. Patient scheduled for Stroke ICU transfer.",

        created_at: new Date(Date.now() - 30 * 60000).toISOString(),
      },
    ],

    investigations: [
      {
        id: 7,

        test_name: "STAT Non-Contrast CT Brain (Stroke Protocol)",

        category: "Radiology / CT",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 54 * 60000).toISOString(),

        ordered_by: "Dr. Meenakshi Rao",

        status: "Completed",

        result:
          "No acute intracranial hemorrhage or mass effect. Early ischemic changes in left insular ribbon (ASPECTS 9).",

        result_summary: "No Hemorrhage, ASPECTS 9",

        verified_at: new Date(Date.now() - 42 * 60000).toISOString(),
      },

      {
        id: 8,

        test_name: "CT Angiography (CTA) Head & Neck",

        category: "Radiology / CT",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 54 * 60000).toISOString(),

        ordered_by: "Dr. Meenakshi Rao",

        status: "Completed",

        result:
          "Non-occlusive thrombus in left M1 MCA bifurcation with good collateral flow.",

        result_summary: "Left M1 Non-Occlusive Thrombus",

        verified_at: new Date(Date.now() - 38 * 60000).toISOString(),
      },

      {
        id: 9,

        test_name: "STAT Coagulation Profile & Platelet Count",

        category: "Laboratory",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 55 * 60000).toISOString(),

        ordered_by: "Dr. Meenakshi Rao",

        status: "Completed",

        result:
          "PT/INR: 1.05, aPTT: 28s, Platelets: 245,000/mcL. Safe for thrombolysis.",

        result_summary: "Normal Coagulation Profile",

        verified_at: new Date(Date.now() - 45 * 60000).toISOString(),
      },
    ],

    disposition: {
      outcome: "admit_icu",

      required_specialty: "Neurology",

      clinical_reason:
        "Post-thrombolysis neurological surveillance and Neuro ICU telemetry monitoring",

      decided_by: "Dr. Meenakshi Rao",

      decided_at: new Date(Date.now() - 25 * 60000).toISOString(),

      priority: "High",
    },

    bed_requests: [
      {
        id: 3,

        status: "allocated",

        requested_level_of_care: "Neuro ICU",

        requested_specialty: "Neurology",

        requested_at: new Date(Date.now() - 25 * 60000).toISOString(),

        allocated_bed_id: 104,

        allocated_admission_id: 504,

        allocated_at: new Date(Date.now() - 10 * 60000).toISOString(),
      },
    ],

    consents: [
      {
        id: 3,

        patient_name: "Robert Lee",

        consent_type:
          "Intravenous Thrombolytic Therapy (tPA) for Acute Ischemic Stroke",

        signed_by: "Karen Lee",

        relation_to_patient: "Spouse",

        status: "Completed",

        witness_doctor: "Dr. Meenakshi Rao",

        legal_waiver_acknowledged: true,

        notes:
          "Benefits and bleeding risks of systemic thrombolysis fully discussed with spouse Karen Lee.",

        signed_at: new Date(Date.now() - 35 * 60000).toISOString(),
      },
    ],
  },

  // ── CASE 4: ACUTE SEVERE ASTHMA / RESPIRATORY DISTRESS (High / Emergent - B2) ──

  {
    id: 4,

    visit_no: "ER-2026-00004",

    patient_id: "P-100512",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Acute severe asthma exacerbation / Severe breathlessness with audible expiratory wheeze",

    arrival_at: new Date(Date.now() - 75 * 60000).toISOString(),

    status: "under_treatment",

    assigned_doctor_name: "Dr. Anita Roy",

    assigned_specialty: "Emergency Medicine",

    doctor_assigned_at: new Date(Date.now() - 70 * 60000).toISOString(),

    doctor_accepted_at: new Date(Date.now() - 68 * 60000).toISOString(),

    triage_category: "B2",

    triage_bed_label: "ER-B2-02",

    closed_at: null,

    patient_name: "Maria",

    patient_last_name: "Garcia",

    patient_gender: "Female",

    patient_age: 29,

    patient_phone: "9845123456",

    patient_emergency_contact: "9845123457",

    complaints: [
      {
        id: 4,

        complaint:
          "Acute onset intense shortness of breath, chest tightness, unable to speak full sentences, not relieved by home inhaler",

        severity: "Severe",

        case_category: "respiratory",

        duration: "2 hours",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 75 * 60000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 7,

        recorded_at: new Date(Date.now() - 73 * 60000).toISOString(),

        recorded_by: "Triage RN Lisa Park",

        heart_rate: 126,

        bp_systolic: 138,

        bp_diastolic: 86,

        respiratory_rate: 32,

        spo2: 88,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 110,

        pain_score: 4,

        gcs: 15,

        notes:
          "Accessory muscle use, tachypneic, diffuse bilateral wheezes on auscultation.",
      },

      {
        id: 8,

        recorded_at: new Date(Date.now() - 35 * 60000).toISOString(),

        recorded_by: "Staff Nurse Priya",

        heart_rate: 104,

        bp_systolic: 126,

        bp_diastolic: 80,

        respiratory_rate: 22,

        spo2: 95,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 114,

        pain_score: 2,

        gcs: 15,

        notes:
          "Post dual bronchodilator nebulization + IV Hydrocortisone. SpO2 95% on 2L O2.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "ER-B2-02",

      reason:
        "Acute severe bronchial asthma exacerbation with marked hypoxia and increased work of breathing.",

      triaged_at: new Date(Date.now() - 73 * 60000).toISOString(),

      assigned_by: "Nurse Lisa Park",
    },

    treatments: [
      {
        id: 12,

        intervention_type: "Duolin Nebulization",

        description:
          "Salbutamol 2.5mg + Ipratropium Bromide 500mcg via oxygen-driven nebulizer stat",

        performed_at: new Date(Date.now() - 70 * 60000).toISOString(),

        administered_by: "Staff Nurse Priya",
      },

      {
        id: 13,

        intervention_type: "Hydrocortisone IV",

        description: "100 mg IV stat",

        performed_at: new Date(Date.now() - 65 * 60000).toISOString(),

        administered_by: "Staff Nurse Priya",
      },

      {
        id: 14,

        intervention_type: "Magnesium Sulfate IV",

        description: "2 g in 100 ml NS IV infusion over 20 minutes",

        performed_at: new Date(Date.now() - 55 * 60000).toISOString(),

        administered_by: "Staff Nurse Priya",
      },
    ],

    clinical_notes: [
      {
        id: 4,

        note_type: "Pulmonology / ER Clinical Note",

        author: "Dr. Anita Roy",

        content:
          "29yo female known asthmatic presenting with acute severe exacerbation triggered by viral upper respiratory tract infection. Marked improvement following sequential nebulizations and IV steroids. ABG shows normalization of oxygenation. Admitting to Pulmonology High Dependency Unit for close observation.",

        created_at: new Date(Date.now() - 40 * 60000).toISOString(),
      },
    ],

    investigations: [
      {
        id: 10,

        test_name: "Arterial Blood Gas (ABG)",

        category: "Laboratory / Critical Care",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 72 * 60000).toISOString(),

        ordered_by: "Dr. Anita Roy",

        status: "Completed",

        result:
          "pH: 7.36, PaCO2: 38 mmHg, PaO2: 68 mmHg (Room air) -> 92 mmHg (on O2), HCO3: 23 mEq/L, Lactate: 1.2.",

        result_summary: "Hypoxia corrected on O2",

        verified_at: new Date(Date.now() - 55 * 60000).toISOString(),
      },

      {
        id: 11,

        test_name: "Portable Chest X-Ray (AP View)",

        category: "Radiology",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 68 * 60000).toISOString(),

        ordered_by: "Dr. Anita Roy",

        status: "Completed",

        result:
          "Bilateral lung hyperinflation. No pneumothorax, consolidation or pleural effusion.",

        result_summary: "Hyperinflation, No Pneumothorax",

        verified_at: new Date(Date.now() - 48 * 60000).toISOString(),
      },
    ],

    disposition: {
      outcome: "admit_ward",

      required_specialty: "Pulmonology",

      clinical_reason:
        "High Dependency Unit (HDU) admission for ongoing bronchodilator therapy and steroid step-down",

      decided_by: "Dr. Anita Roy",

      decided_at: new Date(Date.now() - 35 * 60000).toISOString(),

      priority: "High",
    },

    bed_requests: [
      {
        id: 4,

        status: "pending",

        requested_level_of_care: "High Dependency Unit (HDU)",

        requested_specialty: "Pulmonology",

        requested_at: new Date(Date.now() - 35 * 60000).toISOString(),

        allocated_bed_id: null,

        allocated_admission_id: null,

        allocated_at: null,
      },
    ],

    consents: [],
  },

  // ── CASE 5: ACUTE APPENDICITIS / SURGICAL ABDOMEN (Moderate / Urgent - B3) ──

  {
    id: 5,

    visit_no: "ER-2026-00005",

    patient_id: "P-100301",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Acute Right Lower Quadrant Abdominal Pain with Vomiting & Fever (Suspected Appendicitis)",

    arrival_at: new Date(Date.now() - 90 * 60000).toISOString(),

    status: "under_treatment",

    assigned_doctor_name: "Dr. Priya Deshmukh",

    assigned_specialty: "General Surgery",

    doctor_assigned_at: new Date(Date.now() - 85 * 60000).toISOString(),

    doctor_accepted_at: new Date(Date.now() - 82 * 60000).toISOString(),

    triage_category: "B3",

    triage_bed_label: "ER-B3-01",

    closed_at: null,

    patient_name: "Thomas",

    patient_last_name: "Reed",

    patient_gender: "Male",

    patient_age: 52,

    patient_phone: "9712345678",

    patient_emergency_contact: "9712345679",

    complaints: [
      {
        id: 5,

        complaint:
          "Progressive periumbilical abdominal pain migrating to right iliac fossa, anorexia, nausea and 2 vomiting episodes",

        severity: "Moderate",

        case_category: "surgical_abdomen",

        duration: "18 hours",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 90 * 60000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 9,

        recorded_at: new Date(Date.now() - 88 * 60000).toISOString(),

        recorded_by: "Triage RN Lisa Park",

        heart_rate: 96,

        bp_systolic: 128,

        bp_diastolic: 82,

        respiratory_rate: 18,

        spo2: 99,

        temperature: 100.8,

        consciousness_level: "Alert (A)",

        blood_glucose: 104,

        pain_score: 8,

        gcs: 15,

        notes:
          "Marked tenderness at McBurney's point, positive Rovsing and rebound tenderness.",
      },

      {
        id: 10,

        recorded_at: new Date(Date.now() - 40 * 60000).toISOString(),

        recorded_by: "Staff Nurse Anita",

        heart_rate: 82,

        bp_systolic: 122,

        bp_diastolic: 78,

        respiratory_rate: 16,

        spo2: 99,

        temperature: 99.2,

        consciousness_level: "Alert (A)",

        blood_glucose: 102,

        pain_score: 4,

        gcs: 15,

        notes:
          "Post IV Paracetamol and IV fluids. Pain reduced. Kept NPO for surgery.",
      },
    ],

    triage: {
      category: "B3",

      triage_bed_label: "ER-B3-01",

      reason:
        "Acute surgical abdomen / acute appendicitis requiring surgical evaluation and pre-op clearance.",

      triaged_at: new Date(Date.now() - 88 * 60000).toISOString(),

      assigned_by: "Nurse Lisa Park",
    },

    treatments: [
      {
        id: 15,

        intervention_type: "Nil Per Os (NPO) Order",

        description:
          "Strict bowel rest and NPO for emergent laparoscopic surgery",

        performed_at: new Date(Date.now() - 84 * 60000).toISOString(),

        administered_by: "Dr. Priya Deshmukh",
      },

      {
        id: 16,

        intervention_type: "IV Hydration & Antiemetic",

        description:
          "Ringer's Lactate 1000 mL IV @ 100 ml/hr + Ondansetron 4 mg IV stat",

        performed_at: new Date(Date.now() - 80 * 60000).toISOString(),

        administered_by: "Staff Nurse Anita",
      },

      {
        id: 17,

        intervention_type: "Pre-Operative Antibiotics",

        description: "Ceftriaxone 1 g IV + Metronidazole 500 mg IV infusion",

        performed_at: new Date(Date.now() - 50 * 60000).toISOString(),

        administered_by: "Staff Nurse Anita",
      },
    ],

    clinical_notes: [
      {
        id: 5,

        note_type: "Surgical Assessment",

        author: "Dr. Priya Deshmukh",

        content:
          "52yo male with classic Alvarado score 8/10 presentation of Acute Appendicitis. Ultrasound abdomen confirms dilated non-compressible appendix (9.2mm) with surrounding fat stranding. Leucocytosis (WBC 16,800). Patient and family briefed on procedure. Scheduled for Emergency Laparoscopic Appendectomy.",

        created_at: new Date(Date.now() - 55 * 60000).toISOString(),
      },
    ],

    investigations: [
      {
        id: 12,

        test_name: "Ultrasound Abdomen & Pelvis (USG)",

        category: "Radiology / Ultrasound",

        priority: "Urgent",

        ordered_at: new Date(Date.now() - 84 * 60000).toISOString(),

        ordered_by: "Dr. Priya Deshmukh",

        status: "Completed",

        result:
          "Blind-ended tubular non-compressible aperistaltic structure in right iliac fossa measuring 9.2 mm in diameter with periappendiceal fat stranding. Target sign positive.",

        result_summary: "Confirmed Acute Appendicitis (9.2mm)",

        verified_at: new Date(Date.now() - 60 * 60000).toISOString(),
      },

      {
        id: 13,

        test_name: "Complete Blood Count (CBC) with Differential",

        category: "Laboratory",

        priority: "Urgent",

        ordered_at: new Date(Date.now() - 84 * 60000).toISOString(),

        ordered_by: "Dr. Priya Deshmukh",

        status: "Completed",

        result:
          "WBC: 16,800/mcL (Neutrophils 86%, Bands 6%), Hb: 14.2 g/dL, Platelets: 280,000/mcL.",

        result_summary: "Leukocytosis (WBC 16.8k, Neutrophils 86%)",

        verified_at: new Date(Date.now() - 65 * 60000).toISOString(),
      },
    ],

    disposition: {
      outcome: "admit_ward",

      required_specialty: "General Surgery",

      clinical_reason:
        "Pre-operative holding and admission for Emergency Laparoscopic Appendectomy",

      decided_by: "Dr. Priya Deshmukh",

      decided_at: new Date(Date.now() - 45 * 60000).toISOString(),

      priority: "Urgent",
    },

    bed_requests: [
      {
        id: 5,

        status: "allocated",

        requested_level_of_care: "Surgical Ward",

        requested_specialty: "General Surgery",

        requested_at: new Date(Date.now() - 45 * 60000).toISOString(),

        allocated_bed_id: 102,

        allocated_admission_id: 502,

        allocated_at: new Date(Date.now() - 20 * 60000).toISOString(),
      },
    ],

    consents: [
      {
        id: 4,

        patient_name: "Thomas Reed",

        consent_type:
          "Emergency Laparoscopic Appendectomy & General Anesthesia",

        signed_by: "Thomas Reed",

        relation_to_patient: "Self",

        status: "Completed",

        witness_doctor: "Dr. Priya Deshmukh",

        legal_waiver_acknowledged: true,

        notes:
          "Surgical and anesthetic risks explained. Consent signed by patient.",

        signed_at: new Date(Date.now() - 48 * 60000).toISOString(),
      },
    ],
  },

  // ── CASE 6: PEDIATRIC FEBRILE CONVULSION (Moderate / Urgent - B3) ──

  {
    id: 6,

    visit_no: "ER-2026-00006",

    patient_id: "P-100711",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "private_vehicle",

    condition_at_arrival:
      "Post-ictal state following single generalized febrile convulsion (2 mins); High fever 103.2°F",

    arrival_at: new Date(Date.now() - 110 * 60000).toISOString(),

    status: "under_treatment",

    assigned_doctor_name: "Dr. Anita Roy",

    assigned_specialty: "Pediatrics / Emergency Medicine",

    doctor_assigned_at: new Date(Date.now() - 105 * 60000).toISOString(),

    doctor_accepted_at: new Date(Date.now() - 104 * 60000).toISOString(),

    triage_category: "B3",

    triage_bed_label: "ER-PEDS-01",

    closed_at: null,

    patient_name: "Baby Aarav",

    patient_last_name: "Sen",

    patient_gender: "Male",

    patient_age: 4,

    patient_phone: "9866778899",

    patient_emergency_contact: "9866778890",

    complaints: [
      {
        id: 6,

        complaint:
          "High grade fever for 2 days followed by sudden generalized tonic-clonic jerking episode for 2 minutes with brief post-ictal drowsiness",

        severity: "Moderate",

        case_category: "pediatric",

        duration: "2 days",

        reported_by: "Dr. Siddharth Sen (Father)",

        created_at: new Date(Date.now() - 110 * 60000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 11,

        recorded_at: new Date(Date.now() - 108 * 60000).toISOString(),

        recorded_by: "Triage RN Lisa Park",

        heart_rate: 130,

        bp_systolic: 98,

        bp_diastolic: 62,

        respiratory_rate: 24,

        spo2: 99,

        temperature: 103.2,

        consciousness_level: "Voice (V)",

        blood_glucose: 94,

        pain_score: 2,

        gcs: 14,

        notes:
          "Post-ictal somnolence, warm peripheries, clear airway, no meningeal signs.",
      },

      {
        id: 12,

        recorded_at: new Date(Date.now() - 30 * 60000).toISOString(),

        recorded_by: "Staff Nurse Priya",

        heart_rate: 102,

        bp_systolic: 96,

        bp_diastolic: 60,

        respiratory_rate: 20,

        spo2: 99,

        temperature: 99.1,

        consciousness_level: "Alert (A)",

        blood_glucose: 98,

        pain_score: 0,

        gcs: 15,

        notes: "Active, smiling, oriented, tolerating oral fluids well.",
      },
    ],

    triage: {
      category: "B3",

      triage_bed_label: "ER-PEDS-01",

      reason:
        "Simple Febrile Seizure in 4yo child; fever reduction and post-ictal pediatric monitoring.",

      triaged_at: new Date(Date.now() - 108 * 60000).toISOString(),

      assigned_by: "Nurse Lisa Park",
    },

    treatments: [
      {
        id: 18,

        intervention_type: "Tepid Sponging & Antipyretic",

        description:
          "Tepid water sponging + Paracetamol 250mg rectal suppository stat",

        performed_at: new Date(Date.now() - 105 * 60000).toISOString(),

        administered_by: "Staff Nurse Priya",
      },

      {
        id: 19,

        intervention_type: "Oral Hydration",

        description:
          "Oral Rehydration Solution (ORS) 150 ml sips encouraged and tolerated",

        performed_at: new Date(Date.now() - 50 * 60000).toISOString(),

        administered_by: "Staff Nurse Priya",
      },
    ],

    clinical_notes: [
      {
        id: 6,

        note_type: "Pediatric Emergency Assessment",

        author: "Dr. Anita Roy",

        content:
          "4yo boy with typical presentation of Simple Febrile Seizure secondary to Viral Upper Respiratory Tract Infection. Fully recovered from post-ictal state, neurologically intact, GCS 15. Normal blood glucose and electrolytes. Parents counseled regarding benign nature of simple febrile seizures and fever management at home. Kept under 4-hour ED observation prior to discharge.",

        created_at: new Date(Date.now() - 40 * 60000).toISOString(),
      },
    ],

    investigations: [
      {
        id: 14,

        test_name: "Pediatric Complete Blood Count (CBC) & CRP",

        category: "Laboratory",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 104 * 60000).toISOString(),

        ordered_by: "Dr. Anita Roy",

        status: "Completed",

        result:
          "WBC: 10,800/mcL (Lymphocytes 48%), Hb: 12.1 g/dL, CRP: 8 mg/L (Mild viral elevation).",

        result_summary: "Viral pattern, normal WBC",

        verified_at: new Date(Date.now() - 75 * 60000).toISOString(),
      },

      {
        id: 15,

        test_name: "Serum Electrolytes & Calcium",

        category: "Laboratory",

        priority: "STAT",

        ordered_at: new Date(Date.now() - 104 * 60000).toISOString(),

        ordered_by: "Dr. Anita Roy",

        status: "Completed",

        result: "Sodium: 137 mEq/L, Potassium: 4.1 mEq/L, Calcium: 9.4 mg/dL.",

        result_summary: "Normal Electrolytes & Calcium",

        verified_at: new Date(Date.now() - 70 * 60000).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Pediatrics",

      clinical_reason:
        "Clinically stable post simple febrile convulsion, afebrile, active, safe for home discharge with oral Paracetamol syrup and pediatrician follow-up in 48 hours",

      decided_by: "Dr. Anita Roy",

      decided_at: new Date(Date.now() - 30 * 60000).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  // ── HISTORICAL ARCHIVED PRIOR ER ENCOUNTERS (FOR EXISTING PATIENTS) ──

  {
    id: 101,

    visit_no: "ER-2025-00189",

    patient_id: "P-100245",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Acute Severe Epigastric Burning Pain radiating to back post heavy dinner",

    arrival_at: new Date(Date.now() - 115 * 86400000).toISOString(),

    closed_at: new Date(
      Date.now() - 115 * 86400000 + 4 * 3600000,
    ).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Anita Roy",

    assigned_specialty: "Emergency Medicine",

    doctor_assigned_at: new Date(
      Date.now() - 115 * 86400000 + 10 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 115 * 86400000 + 15 * 60000,
    ).toISOString(),

    triage_category: "B2",

    triage_bed_label: "ER Bay 04 (Yellow Zone)",

    patient_name: "John",

    patient_last_name: "Smith",

    patient_gender: "Male",

    patient_age: 45,

    patient_phone: "9876543210",

    patient_emergency_contact: "9876543211",

    complaints: [
      {
        id: 1,

        complaint:
          "Severe burning epigastric pain (8/10) with nausea, non-bilious vomiting x 2, and acid regurgitation for 6 hours",

        severity: "Severe",

        case_category: "gastroenterology",

        duration: "6 hours",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 115 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 115 * 86400000 + 10 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN Lisa Park",

        heart_rate: 88,

        bp_systolic: 138,

        bp_diastolic: 86,

        respiratory_rate: 18,

        spo2: 98,

        temperature: 98.6,

        consciousness_level: "Alert (A)",

        blood_glucose: 124,

        pain_score: 8,

        gcs: 15,

        notes:
          "Abdomen soft, tenderness on deep palpation in epigastrium, no guarding or rebound tenderness.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "ER Bay 04",

      reason:
        "Acute severe epigastric distress; evaluated for acute gastritis vs peptic ulcer exacerbation",

      triaged_at: new Date(
        Date.now() - 115 * 86400000 + 5 * 60000,
      ).toISOString(),

      assigned_by: "Triage Assistant",
    },

    treatments: [
      {
        id: 1,

        intervention_type:
          "IV Pantoprazole 40mg + IV Ondansetron 4mg in 100ml Normal Saline",

        description: "Administered slow IV piggyback over 15 minutes",

        performed_at: new Date(
          Date.now() - 115 * 86400000 + 30 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse Priya",
      },

      {
        id: 2,

        intervention_type: "Oral Mucaine Gel 10ml",

        description:
          "Local mucosal anesthetic suspension for epigastric burning",

        performed_at: new Date(
          Date.now() - 115 * 86400000 + 45 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse Priya",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "assessment",

        author: "Dr. Anita Roy",

        content:
          "45-year-old male with history of GERD and hypertension presenting with acute epigastric pain. ECG 12-lead normal sinus rhythm, no ischemic ST changes. Serum Troponin I negative (<0.01 ng/mL). Serum Lipase and Amylase normal. Post IV PPI and antacid, pain reduced from 8/10 to 1/10. Hemodynamically stable. Discharged with oral PPI prescription and Gastroenterology OPD follow-up.",

        created_at: new Date(
          Date.now() - 115 * 86400000 + 120 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Gastroenterology",

      clinical_reason:
        "Clinically stable, pain resolved (score 1/10), tolerated oral fluids without nausea. Safe for home discharge with oral Tab Pantoprazole 40mg OD x 14 days and OPD review.",

      decided_by: "Dr. Anita Roy",

      decided_at: new Date(
        Date.now() - 115 * 86400000 + 220 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 102,

    visit_no: "ER-2025-00084",

    patient_id: "P-100245",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "wheelchair",

    condition_at_arrival:
      "Right Ankle Inversion Injury, acute lateral malleolar swelling & inability to bear weight",

    arrival_at: new Date(Date.now() - 260 * 86400000).toISOString(),

    closed_at: new Date(
      Date.now() - 260 * 86400000 + 3 * 3600000,
    ).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Sarah Jenkins",

    assigned_specialty: "Emergency Medicine",

    doctor_assigned_at: new Date(
      Date.now() - 260 * 86400000 + 10 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 260 * 86400000 + 12 * 60000,
    ).toISOString(),

    triage_category: "B3",

    triage_bed_label: "ER Fast Track Bed 02",

    patient_name: "John",

    patient_last_name: "Smith",

    patient_gender: "Male",

    patient_age: 45,

    patient_phone: "9876543210",

    patient_emergency_contact: "9876543211",

    complaints: [
      {
        id: 1,

        complaint:
          "Twisted right ankle while descending stairs 2 hours ago. Pain, swelling, and difficulty walking.",

        severity: "Moderate",

        case_category: "orthopedic",

        duration: "2 hours",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 260 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 260 * 86400000 + 10 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN Lisa Park",

        heart_rate: 76,

        bp_systolic: 128,

        bp_diastolic: 80,

        respiratory_rate: 16,

        spo2: 99,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 110,

        pain_score: 6,

        gcs: 15,

        notes:
          "Right lateral ankle edema, tenderness over anterior talofibular ligament. Distal neurovascular status intact.",
      },
    ],

    triage: {
      category: "B3",

      triage_bed_label: "Fast Track Bed 02",

      reason: "Acute isolated ankle injury, hemodynamically stable",

      triaged_at: new Date(
        Date.now() - 260 * 86400000 + 5 * 60000,
      ).toISOString(),

      assigned_by: "Triage Assistant",
    },

    treatments: [
      {
        id: 1,

        intervention_type: "Right Ankle X-Ray (AP/Lateral/Mortise Views)",

        description:
          "No fracture or dislocation seen. Cortical margins intact.",

        performed_at: new Date(
          Date.now() - 260 * 86400000 + 35 * 60000,
        ).toISOString(),

        administered_by: "Radiology Dept",
      },

      {
        id: 2,

        intervention_type: "Crepe Bandage Immobilization & Cold Compression",

        description: "RICE protocol initiated. Analgesics administered.",

        performed_at: new Date(
          Date.now() - 260 * 86400000 + 60 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse Priya",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "assessment",

        author: "Dr. Sarah Jenkins",

        content:
          "Grade 1 lateral ankle ligament sprain. X-ray confirms intact bony architecture. Advised limb elevation, compression bandage, Tab Paracetamol 650mg SOS for pain, and avoidance of heavy weight bearing for 48 hours.",

        created_at: new Date(
          Date.now() - 260 * 86400000 + 90 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Orthopedics",

      clinical_reason:
        "Grade 1 ankle sprain, hemodynamically stable, ambulatory with assistance. Discharged with RICE instructions and Orthopedics OPD review in 5 days.",

      decided_by: "Dr. Sarah Jenkins",

      decided_at: new Date(
        Date.now() - 260 * 86400000 + 150 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 103,

    visit_no: "ER-2025-00214",

    patient_id: "P-100342",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Right Forearm Laceration after glass breakage at home",

    arrival_at: new Date(Date.now() - 85 * 86400000).toISOString(),

    closed_at: new Date(Date.now() - 85 * 86400000 + 2 * 3600000).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Rajesh Sharma",

    assigned_specialty: "Emergency Medicine",

    doctor_assigned_at: new Date(
      Date.now() - 85 * 86400000 + 5 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 85 * 86400000 + 8 * 60000,
    ).toISOString(),

    triage_category: "B3",

    triage_bed_label: "ER Procedure Room",

    patient_name: "Rahul",

    patient_last_name: "Sharma",

    patient_gender: "Male",

    patient_age: 28,

    patient_phone: "9823456789",

    patient_emergency_contact: "9823456780",

    complaints: [
      {
        id: 1,

        complaint:
          "4cm linear laceration over dorsal aspect of right forearm with active oozing",

        severity: "Moderate",

        case_category: "trauma",

        duration: "1 hour",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 85 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 85 * 86400000 + 5 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN",

        heart_rate: 80,

        bp_systolic: 122,

        bp_diastolic: 78,

        respiratory_rate: 16,

        spo2: 99,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 104,

        pain_score: 5,

        gcs: 15,

        notes:
          "Hemostasis achieved with direct pressure. No tendon or major vessel involvement.",
      },
    ],

    triage: {
      category: "B3",

      triage_bed_label: "Procedure Room",

      reason: "Superficial laceration requiring primary repair",

      triaged_at: new Date(
        Date.now() - 85 * 86400000 + 3 * 60000,
      ).toISOString(),

      assigned_by: "Triage RN",
    },

    treatments: [
      {
        id: 1,

        intervention_type:
          "Wound Debridement & Primary Suturing (4 Ethilon 3-0 sutures)",

        description:
          "Under local anesthesia (2% Lignocaine). Sterile dressing applied.",

        performed_at: new Date(
          Date.now() - 85 * 86400000 + 25 * 60000,
        ).toISOString(),

        administered_by: "Dr. Rajesh Sharma",
      },

      {
        id: 2,

        intervention_type: "Inj Tetanus Toxoid (TT) 0.5ml IM STAT",

        description: "Given into left deltoid",

        performed_at: new Date(
          Date.now() - 85 * 86400000 + 35 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "assessment",

        author: "Dr. Rajesh Sharma",

        content:
          "Dorsal forearm laceration repaired primarily. Distal motor and sensory examination intact. Discharged on oral Amoxicillin-Clavulanate 625mg BD x 5 days and Tab Paracetamol 650mg SOS. Suture removal advised in 7-10 days.",

        created_at: new Date(
          Date.now() - 85 * 86400000 + 60 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "General Surgery",

      clinical_reason:
        "Wound successfully repaired, no active bleeding. Discharged home with wound care instructions.",

      decided_by: "Dr. Rajesh Sharma",

      decided_at: new Date(
        Date.now() - 85 * 86400000 + 110 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 104,

    visit_no: "ER-2025-00142",

    patient_id: "P-100289",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "ambulance",

    condition_at_arrival:
      "Acute COPD Exacerbation with bilateral wheezing and respiratory distress",

    arrival_at: new Date(Date.now() - 150 * 86400000).toISOString(),

    closed_at: new Date(
      Date.now() - 150 * 86400000 + 5 * 3600000,
    ).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Anita Roy",

    assigned_specialty: "Emergency Medicine",

    doctor_assigned_at: new Date(
      Date.now() - 150 * 86400000 + 5 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 150 * 86400000 + 8 * 60000,
    ).toISOString(),

    triage_category: "B2",

    triage_bed_label: "ER Bay 02 (High Care)",

    patient_name: "Robert",

    patient_last_name: "Lee",

    patient_gender: "Male",

    patient_age: 64,

    patient_phone: "9833445566",

    patient_emergency_contact: "9833445567",

    complaints: [
      {
        id: 1,

        complaint:
          "Severe shortness of breath, productive cough with yellow sputum, and audible wheezing x 2 days",

        severity: "Severe",

        case_category: "respiratory",

        duration: "2 days",

        reported_by: "Patient & Spouse",

        created_at: new Date(Date.now() - 150 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 150 * 86400000 + 5 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN",

        heart_rate: 102,

        bp_systolic: 146,

        bp_diastolic: 88,

        respiratory_rate: 26,

        spo2: 89,

        temperature: 99.2,

        consciousness_level: "Alert (A)",

        blood_glucose: 156,

        pain_score: 3,

        gcs: 15,

        notes:
          "Accessory muscle use, tachypneic, diffuse expiratory wheezing bilaterally. SpO2 improved to 95% on 2L O2 via nasal prongs.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "ER Bay 02",

      reason: "Acute COPD exacerbation with moderate hypoxemia",

      triaged_at: new Date(
        Date.now() - 150 * 86400000 + 3 * 60000,
      ).toISOString(),

      assigned_by: "Triage Assistant",
    },

    treatments: [
      {
        id: 1,

        intervention_type:
          "Nebulization with Levosalbutamol + Ipratropium (Duolin) & Budesonide (Budecort)",

        description: "Back-to-back nebulization cycles given via oxygen mask",

        performed_at: new Date(
          Date.now() - 150 * 86400000 + 15 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse Priya",
      },

      {
        id: 2,

        intervention_type: "Inj Hydrocortisone 100mg IV STAT",

        description: "Corticosteroid therapy for acute bronchospasm",

        performed_at: new Date(
          Date.now() - 150 * 86400000 + 20 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse Priya",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "assessment",

        author: "Dr. Anita Roy",

        content:
          "64-year-old male with known COPD Stage 2 presenting with infective exacerbation. ABG showed mild respiratory acidosis without CO2 retention. Chest X-Ray showed hyperinflated lung fields, no focal consolidation. Post bronchodilator nebulization and steroid, wheezing significantly cleared, RR settled to 18/min, SpO2 96% on room air. Discharged on oral Azithromycin 500mg OD x 5 days, oral Prednisolone taper, and regular MDI.",

        created_at: new Date(
          Date.now() - 150 * 86400000 + 180 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Pulmonology",

      clinical_reason:
        "Acute bronchospasm relieved, afebrile, SpO2 96% on room air. Discharged home with Pulmonology OPD review in 48 hours.",

      decided_by: "Dr. Anita Roy",

      decided_at: new Date(
        Date.now() - 150 * 86400000 + 270 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 105,

    visit_no: "ER-2025-00267",

    patient_id: "P-100512",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Severe Throbbing Right Hemicranial Migraine with nausea and photophobia",

    arrival_at: new Date(Date.now() - 60 * 86400000).toISOString(),

    closed_at: new Date(Date.now() - 60 * 86400000 + 3 * 3600000).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Sarah Jenkins",

    assigned_specialty: "Emergency Medicine",

    doctor_assigned_at: new Date(
      Date.now() - 60 * 86400000 + 10 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 60 * 86400000 + 15 * 60000,
    ).toISOString(),

    triage_category: "B3",

    triage_bed_label: "ER Quiet Bay 01",

    patient_name: "Maria",

    patient_last_name: "Garcia",

    patient_gender: "Female",

    patient_age: 29,

    patient_phone: "9845123456",

    patient_emergency_contact: "9845123457",

    complaints: [
      {
        id: 1,

        complaint:
          "Severe pulsating right-sided headache with nausea and photophobia not responding to oral analgesics",

        severity: "Moderate",

        case_category: "neurology",

        duration: "8 hours",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 60 * 86400000 + 10 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN",

        heart_rate: 74,

        bp_systolic: 118,

        bp_diastolic: 74,

        respiratory_rate: 16,

        spo2: 99,

        temperature: 98.2,

        consciousness_level: "Alert (A)",

        blood_glucose: 98,

        pain_score: 8,

        gcs: 15,

        notes:
          "No focal neurological deficit, pupils equal and reactive, neck supple.",
      },
    ],

    triage: {
      category: "B3",

      triage_bed_label: "Quiet Bay 01",

      reason: "Acute migraine without red flags; dark room placement",

      triaged_at: new Date(
        Date.now() - 60 * 86400000 + 5 * 60000,
      ).toISOString(),

      assigned_by: "Triage Assistant",
    },

    treatments: [
      {
        id: 1,

        intervention_type:
          "IV Paracetamol 1g + IV Metoclopramide 10mg in 100ml NS",

        description: "Infused over 20 minutes in darkened quiet bay",

        performed_at: new Date(
          Date.now() - 60 * 86400000 + 25 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "assessment",

        author: "Dr. Sarah Jenkins",

        content:
          "Known migraineur presenting with typical acute attack. Symptoms fully resolved post IV hydration and antiemetic-analgesic infusion. Pain score down to 0/10. Safe for home discharge with migraine trigger avoidance guidance.",

        created_at: new Date(
          Date.now() - 60 * 86400000 + 90 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Neurology",

      clinical_reason:
        "Headache resolved, neurological exam completely normal. Discharged home.",

      decided_by: "Dr. Sarah Jenkins",

      decided_at: new Date(
        Date.now() - 60 * 86400000 + 150 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 108,

    visit_no: "ER-2025-00305",

    patient_id: "UMR10001",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Hypertensive Urgency with severe throbbing occipital headache (BP 178/104 mmHg)",

    arrival_at: new Date(Date.now() - 95 * 86400000).toISOString(),

    closed_at: new Date(Date.now() - 95 * 86400000 + 4 * 3600000).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Anita Roy",

    assigned_specialty: "Emergency Medicine",

    doctor_assigned_at: new Date(
      Date.now() - 95 * 86400000 + 5 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 95 * 86400000 + 8 * 60000,
    ).toISOString(),

    triage_category: "B2",

    triage_bed_label: "ER Bay 03",

    patient_name: "Ravi",

    patient_last_name: "Kumar",

    patient_gender: "Male",

    patient_age: 42,

    patient_phone: "(617) 555-0192",

    patient_emergency_contact: "(617) 555-0192",

    complaints: [
      {
        id: 1,

        complaint:
          "Severe throbbing occipital headache, blurred vision, and dizziness since morning with BP recorded as 180/100 at clinic",

        severity: "Severe",

        case_category: "cardiac",

        duration: "4 hours",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 95 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 95 * 86400000 + 5 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN",

        heart_rate: 84,

        bp_systolic: 178,

        bp_diastolic: 104,

        respiratory_rate: 18,

        spo2: 98,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 130,

        pain_score: 7,

        gcs: 15,

        notes:
          "No chest pain, no focal neurological signs. Fundoscopy: Grade 1 hypertensive changes, no papilledema.",
      },

      {
        id: 2,

        recorded_at: new Date(
          Date.now() - 95 * 86400000 + 120 * 60000,
        ).toISOString(),

        recorded_by: "Staff Nurse Priya",

        heart_rate: 76,

        bp_systolic: 142,

        bp_diastolic: 86,

        respiratory_rate: 16,

        spo2: 99,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 122,

        pain_score: 2,

        gcs: 15,

        notes:
          "Post oral Amlodipine 5mg, BP reduced gradually. Headache largely resolved.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "ER Bay 03",

      reason: "Hypertensive urgency without acute end-organ damage",

      triaged_at: new Date(
        Date.now() - 95 * 86400000 + 3 * 60000,
      ).toISOString(),

      assigned_by: "Triage Assistant",
    },

    treatments: [
      {
        id: 1,

        intervention_type:
          "Tab Amlodipine 5mg PO STAT + Tab Paracetamol 650mg PO",

        description: "Given with sips of water. Monitored for 3 hours.",

        performed_at: new Date(
          Date.now() - 95 * 86400000 + 15 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse Priya",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "assessment",

        author: "Dr. Anita Roy",

        content:
          "Hypertensive urgency successfully managed with oral calcium channel blocker. ECG showed left ventricular hypertrophy (voltage criteria), no acute ST-T wave changes. Serum creatinine 1.0 mg/dL, electrolytes normal. Final discharge BP 134/82 mmHg. Advised to continue Tab Telmisartan 40mg + Tab Amlodipine 5mg OD.",

        created_at: new Date(
          Date.now() - 95 * 86400000 + 180 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Cardiology",

      clinical_reason:
        "BP stabilized to 134/82 mmHg, asymptomatic, safe for home discharge with revised antihypertensive regimen and Cardiology OPD follow-up.",

      decided_by: "Dr. Anita Roy",

      decided_at: new Date(
        Date.now() - 95 * 86400000 + 220 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 109,

    visit_no: "ER-2025-00320",

    patient_id: "UMR10067",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Atypical Chest Wall Discomfort and anxiety post strenuous gym workout",

    arrival_at: new Date(Date.now() - 50 * 86400000).toISOString(),

    closed_at: new Date(Date.now() - 50 * 86400000 + 3 * 3600000).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Vikram Seth",

    assigned_specialty: "Cardiology",

    doctor_assigned_at: new Date(
      Date.now() - 50 * 86400000 + 10 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 50 * 86400000 + 12 * 60000,
    ).toISOString(),

    triage_category: "B2",

    triage_bed_label: "ER Bay 01",

    patient_name: "Rana",

    patient_last_name: "Dhaggubati",

    patient_gender: "Male",

    patient_age: 36,

    patient_phone: "(617) 555-4421",

    patient_emergency_contact: "(617) 555-4421",

    complaints: [
      {
        id: 1,

        complaint:
          "Left pectoral muscular tenderness and chest wall pain aggravated by deep inspiration after heavy bench press",

        severity: "Moderate",

        case_category: "musculoskeletal",

        duration: "3 hours",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 50 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 50 * 86400000 + 10 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN",

        heart_rate: 78,

        bp_systolic: 126,

        bp_diastolic: 82,

        respiratory_rate: 16,

        spo2: 99,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 105,

        pain_score: 5,

        gcs: 15,

        notes:
          "Reproducible tenderness over 4th-5th chondrosternal junction. No cardiac murmurs or friction rubs.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "ER Bay 01",

      reason: "Rule out acute coronary event vs costochondritis",

      triaged_at: new Date(
        Date.now() - 50 * 86400000 + 5 * 60000,
      ).toISOString(),

      assigned_by: "Triage Assistant",
    },

    treatments: [
      {
        id: 1,

        intervention_type: "ECG 12-Lead STAT & Serum Troponin I",

        description:
          "Normal sinus rhythm, no ST-T abnormalities. Troponin I negative (<0.01 ng/mL).",

        performed_at: new Date(
          Date.now() - 50 * 86400000 + 20 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse",
      },

      {
        id: 2,

        intervention_type: "Tab Thiocolchicoside + Aceclofenac PO",

        description: "Muscle relaxant and anti-inflammatory therapy",

        performed_at: new Date(
          Date.now() - 50 * 86400000 + 35 * 60000,
        ).toISOString(),

        administered_by: "Staff Nurse",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "assessment",

        author: "Dr. Vikram Seth",

        content:
          "Acute costochondritis and pectoral strain. Serial ECGs unchanged. Cardiac markers negative. Advised rest from upper body weightlifting for 10 days.",

        created_at: new Date(
          Date.now() - 50 * 86400000 + 90 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Cardiology",

      clinical_reason:
        "Musculoskeletal chest pain, acute coronary syndrome ruled out. Discharged home with reassurance.",

      decided_by: "Dr. Vikram Seth",

      decided_at: new Date(
        Date.now() - 50 * 86400000 + 150 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 110,

    visit_no: "ER-2025-00178",

    patient_id: "P-100711",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "ambulance",

    condition_at_arrival:
      "Pediatric Febrile Convulsion with high grade fever (103.2°F) secondary to Acute Viral Pharyngotonsillitis",

    arrival_at: new Date(Date.now() - 210 * 86400000).toISOString(),

    closed_at: new Date(
      Date.now() - 210 * 86400000 + 4 * 3600000,
    ).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Anita Roy",

    assigned_specialty: "Pediatrics",

    doctor_assigned_at: new Date(
      Date.now() - 210 * 86400000 + 5 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 210 * 86400000 + 8 * 60000,
    ).toISOString(),

    triage_category: "B2",

    triage_bed_label: "Pediatric ER Bed 01",

    patient_name: "Baby Aarav",

    patient_last_name: "Sen",

    patient_gender: "Male",

    patient_age: 4,

    patient_phone: "9866778899",

    patient_emergency_contact: "9866778890",

    complaints: [
      {
        id: 1,

        complaint:
          "High fever (103.2°F) followed by a 2-minute generalized tonic-clonic seizure, post-ictal drowsiness, and sore throat",

        severity: "Severe",

        case_category: "pediatric_emergency",

        duration: "30 minutes",

        reported_by: "Mother (Pooja Sen)",

        created_at: new Date(Date.now() - 210 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 210 * 86400000 + 5 * 60000,
        ).toISOString(),

        recorded_by: "Pediatric Triage RN",

        heart_rate: 138,

        bp_systolic: 96,

        bp_diastolic: 60,

        respiratory_rate: 28,

        spo2: 98,

        temperature: 103.2,

        consciousness_level: "Verbal (V)",

        blood_glucose: 98,

        pain_score: 4,

        gcs: 13,

        notes:
          "Post-ictal lethargy, pupils equal and reactive, tonsils erythematous with follicular exudate.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "Pediatric ER Bed 01",

      reason:
        "Febrile convulsion in child under 5 years, required antipyretic stabilization and airway monitoring",

      triaged_at: new Date(
        Date.now() - 210 * 86400000 + 3 * 60000,
      ).toISOString(),

      assigned_by: "Triage RN",
    },

    treatments: [
      {
        id: 1,

        intervention_type: "Antipyretic & Tepid Sponge",

        description: "Syrup Paracetamol 250 mg PO stat + physical cooling",

        performed_at: new Date(
          Date.now() - 210 * 86400000 + 15 * 60000,
        ).toISOString(),

        administered_by: "Pediatric RN",
      },

      {
        id: 2,

        intervention_type: "Pediatric IV Fluids",

        description: "Isolyte-P 100 mL/hr IV hydration for 2 hours",

        performed_at: new Date(
          Date.now() - 210 * 86400000 + 30 * 60000,
        ).toISOString(),

        administered_by: "Pediatric RN",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "Pediatric Emergency Assessment",

        author: "Dr. Anita Roy",

        content:
          "Typical simple febrile seizure triggered by acute viral tonsillitis. Sensorium returned to baseline within 45 mins. Afebrile at 4 hours. No focal neurological deficits. Discharged with safety instructions regarding fever management.",

        created_at: new Date(
          Date.now() - 210 * 86400000 + 180 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Pediatrics",

      clinical_reason:
        "Afebrile, active, taking oral fluids well, post-febrile seizure protocol completed.",

      decided_by: "Dr. Anita Roy",

      decided_at: new Date(
        Date.now() - 210 * 86400000 + 220 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 111,

    visit_no: "ER-2025-00195",

    patient_id: "UMR10002",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Vasovagal Syncope Episode with Transient Loss of Consciousness while standing in hot room",

    arrival_at: new Date(Date.now() - 95 * 86400000).toISOString(),

    closed_at: new Date(Date.now() - 95 * 86400000 + 3 * 3600000).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Sarah Jenkins",

    assigned_specialty: "Internal Medicine",

    doctor_assigned_at: new Date(
      Date.now() - 95 * 86400000 + 10 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 95 * 86400000 + 12 * 60000,
    ).toISOString(),

    triage_category: "B3",

    triage_bed_label: "ER Bay 03",

    patient_name: "Sunita",

    patient_last_name: "Patel",

    patient_gender: "Female",

    patient_age: 38,

    patient_phone: "(617) 555-0284",

    patient_emergency_contact: "(617) 555-0284",

    complaints: [
      {
        id: 1,

        complaint:
          "Sudden black out lasting 30 seconds preceded by lightheadedness and diaphoresis. No tongue bite or incontinence.",

        severity: "Moderate",

        case_category: "neurology_syncope",

        duration: "1 hour",

        reported_by: "Patient & Colleague",

        created_at: new Date(Date.now() - 95 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 95 * 86400000 + 10 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN",

        heart_rate: 68,

        bp_systolic: 104,

        bp_diastolic: 68,

        respiratory_rate: 16,

        spo2: 99,

        temperature: 98.4,

        consciousness_level: "Alert (A)",

        blood_glucose: 92,

        pain_score: 0,

        gcs: 15,

        notes:
          "Orthostatic BP check: Supine 112/72, Standing 102/66. Normal neurological exam.",
      },
    ],

    triage: {
      category: "B3",

      triage_bed_label: "ER Bay 03",

      reason:
        "Vasovagal syncope with benign features, ruled out cardiac arrhythmias and hypoglycemia",

      triaged_at: new Date(
        Date.now() - 95 * 86400000 + 5 * 60000,
      ).toISOString(),

      assigned_by: "Triage RN",
    },

    treatments: [
      {
        id: 1,

        intervention_type: "ECG 12-Lead STAT & Capillary Blood Glucose",

        description: "Normal sinus rhythm, QTc normal (410 ms). CBG 92 mg/dL.",

        performed_at: new Date(
          Date.now() - 95 * 86400000 + 15 * 60000,
        ).toISOString(),

        administered_by: "Staff RN",
      },

      {
        id: 2,

        intervention_type: "Oral Hydration with Electrolytes",

        description: "500 mL ORS oral rehydration therapy over 1 hour",

        performed_at: new Date(
          Date.now() - 95 * 86400000 + 30 * 60000,
        ).toISOString(),

        administered_by: "Staff RN",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "Clinical Progress Note",

        author: "Dr. Sarah Jenkins",

        content:
          "Classic neurocardiogenic / vasovagal syncope. Normal ECG and cardiac enzymes. Mild orthostatic tendency. Advised increased salt and fluid intake, counter-pressure maneuvers upon feeling dizzy.",

        created_at: new Date(
          Date.now() - 95 * 86400000 + 120 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Internal Medicine",

      clinical_reason:
        "Asymptomatic, orthostatic vitals normalized post hydration, safe for outpatient follow-up.",

      decided_by: "Dr. Sarah Jenkins",

      decided_at: new Date(
        Date.now() - 95 * 86400000 + 160 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  {
    id: 112,

    visit_no: "ER-2025-00122",

    patient_id: "UMR10003",

    is_unknown_patient: false,

    unknown_patient_label: null,

    arrival_mode: "walk_in",

    condition_at_arrival:
      "Symptomatic Hyperglycemia (CBG 384 mg/dL) with Dehydration and Polyuria",

    arrival_at: new Date(Date.now() - 140 * 86400000).toISOString(),

    closed_at: new Date(
      Date.now() - 140 * 86400000 + 5 * 3600000,
    ).toISOString(),

    status: "closed",

    assigned_doctor_name: "Dr. Anita Roy",

    assigned_specialty: "Endocrinology",

    doctor_assigned_at: new Date(
      Date.now() - 140 * 86400000 + 10 * 60000,
    ).toISOString(),

    doctor_accepted_at: new Date(
      Date.now() - 140 * 86400000 + 15 * 60000,
    ).toISOString(),

    triage_category: "B2",

    triage_bed_label: "ER Bay 05",

    patient_name: "Rajesh",

    patient_last_name: "Verma",

    patient_gender: "Male",

    patient_age: 56,

    patient_phone: "(617) 555-0319",

    patient_emergency_contact: "(617) 555-0319",

    complaints: [
      {
        id: 1,

        complaint:
          "Excessive thirst, generalized weakness, polydipsia, and frequent urination for 3 days post medication omission",

        severity: "Moderate",

        case_category: "endocrine_metabolic",

        duration: "3 days",

        reported_by: "Patient",

        created_at: new Date(Date.now() - 140 * 86400000).toISOString(),
      },
    ],

    vitals: [
      {
        id: 1,

        recorded_at: new Date(
          Date.now() - 140 * 86400000 + 10 * 60000,
        ).toISOString(),

        recorded_by: "Triage RN",

        heart_rate: 92,

        bp_systolic: 142,

        bp_diastolic: 86,

        respiratory_rate: 18,

        spo2: 98,

        temperature: 98.6,

        consciousness_level: "Alert (A)",

        blood_glucose: 384,

        pain_score: 1,

        gcs: 15,

        notes:
          "Urine ketones negative on dipstick, DKA ruled out. Venous blood gas pH 7.38.",
      },
    ],

    triage: {
      category: "B2",

      triage_bed_label: "ER Bay 05",

      reason:
        "Marked hyperglycemia requiring aggressive IV rehydration and subcutaneous insulin titration",

      triaged_at: new Date(
        Date.now() - 140 * 86400000 + 5 * 60000,
      ).toISOString(),

      assigned_by: "Triage RN",
    },

    treatments: [
      {
        id: 1,

        intervention_type: "IV Hydration & Subcutaneous Insulin",

        description:
          "0.9% Normal Saline 1000 mL IV over 2 hours + Regular Insulin 10 units SubQ",

        performed_at: new Date(
          Date.now() - 140 * 86400000 + 20 * 60000,
        ).toISOString(),

        administered_by: "Staff RN",
      },
    ],

    clinical_notes: [
      {
        id: 1,

        note_type: "Emergency Assessment",

        author: "Dr. Anita Roy",

        content:
          "Hyperglycemia without ketoacidosis secondary to poor compliance. Blood glucose decreased from 384 to 186 mg/dL post hydration & insulin. Patient educated on medication adherence.",

        created_at: new Date(
          Date.now() - 140 * 86400000 + 220 * 60000,
        ).toISOString(),
      },
    ],

    disposition: {
      outcome: "discharge_home",

      required_specialty: "Endocrinology",

      clinical_reason:
        "Glucose stabilized to 186 mg/dL, rehydrated, safe for home discharge with revised Metformin + Glimepiride dosing.",

      decided_by: "Dr. Anita Roy",

      decided_at: new Date(
        Date.now() - 140 * 86400000 + 280 * 60000,
      ).toISOString(),

      priority: "Routine",
    },

    bed_requests: [],

    consents: [],
  },

  // ── CASE 88: APPANNA CHINNAPATI - HIGHWAY ACCIDENT / BLUNT ABDOMINAL TRAUMA (B1) ──
  {
    id: 88,
    visit_no: "ER-2026-00088",
    patient_id: "P-100888",
    is_unknown_patient: false,
    unknown_patient_label: null,
    arrival_mode: "ambulance_108",
    brought_by: "108 Highway Emergency EMT & Chinnapati Lakshmi (Wife)",
    attendant_name: "Chinnapati Lakshmi",
    attendant_relation: "Wife",
    condition_at_arrival:
      "Polytrauma / Severe Blunt Abdominal Trauma post high-speed two-wheeler collision with tractor on Highway; Hypovolemic shock (BP 82/50, HR 132), generalized peritonism, massive hemoperitoneum on eFAST",
    arrival_at: "2026-10-04T02:30:00.000Z",
    status: "closed",
    assigned_doctor_name: "Dr. Vikram Seth",
    assigned_specialty: "Emergency Medicine & Trauma",
    doctor_assigned_at: "2026-10-04T02:32:00.000Z",
    doctor_accepted_at: "2026-10-04T02:33:00.000Z",
    triage_category: "B1",
    triage_bed_label: "ER-B1-01",
    closed_at: "2026-10-04T03:30:00.000Z",
    patient_name: "Appanna",
    patient_last_name: "Chinnapati",
    patient_gender: "Male",
    patient_age: 54,
    patient_phone: "9848022338",
    patient_emergency_contact: "9848022339",
    complaints: [
      {
        id: 1,
        complaint:
          "ద్విచక్ర వాహనం ప్రమాదం అనంతరం తీవ్రమైన కడుపు నొప్పి, కళ్లు తిరగడం, అపస్మారక స్థితి (Severe blunt impact to abdomen following two-wheeler highway collision with tractor, severe abdominal pain, syncope, and dizziness)",
        severity: "Critical / STAT",
        case_category: "Trauma / MLC",
        duration: "1 hour",
        reported_by: "Chinnapati Lakshmi (Wife)",
        created_at: "2026-10-04T02:30:00.000Z",
      },
      {
        id: 2,
        complaint:
          "తీవ్రమైన శ్వాస ఆడకపోవడం మరియు చెమటలు పట్టడం (Severe dyspnea and cold profuse diaphoresis)",
        severity: "Critical",
        case_category: "Shock / Resuscitation",
        duration: "1 hour",
        reported_by: "108 EMT",
        created_at: "2026-10-04T02:32:00.000Z",
      },
    ],
    vitals: [
      {
        id: 1,
        recorded_at: "2026-10-04T02:30:00.000Z",
        recorded_by: "Triage RN",
        heart_rate: 132,
        bp_systolic: 82,
        bp_diastolic: 50,
        respiratory_rate: 28,
        spo2: 88,
        temperature: 97.4,
        consciousness_level: "Obtunded",
        blood_glucose: 142,
        pain_score: 10,
        gcs: 12,
        notes: "Hemorrhagic shock, thready pulse, cold clammy extremities",
      },
      {
        id: 2,
        recorded_at: "2026-10-04T03:00:00.000Z",
        recorded_by: "ER Trauma Nurse",
        heart_rate: 114,
        bp_systolic: 96,
        bp_diastolic: 62,
        respiratory_rate: 22,
        spo2: 95,
        temperature: 97.8,
        consciousness_level: "Drowsy but arousable",
        blood_glucose: 138,
        pain_score: 8,
        gcs: 13,
        notes: "Post 2L warmed NS & 2 units PRBC STAT under pressure infuser; BP improving",
      },
    ],
    triage: {
      category: "B1",
      triage_bed_label: "ER-B1-01",
      reason:
        "Severe polytrauma with blunt abdominal injury, Grade IV splenic laceration with hemoperitoneum and hypovolemic shock",
      triaged_at: "2026-10-04T02:32:00.000Z",
      assigned_by: "Dr. Anita Roy",
    },
    treatments: [
      {
        id: 1,
        intervention_type: "Rapid Sequence Airway & Resuscitation",
        description:
          "Bilateral 16G large-bore peripheral lines secured. 2000 mL warmed 0.9% Normal Saline infused under pressure bags. Endotracheal intubation with 7.5mm cuffed tube.",
        performed_at: "2026-10-04T02:35:00.000Z",
        administered_by: "Dr. Vikram Seth & Trauma Team",
      },
      {
        id: 2,
        intervention_type: "Massive Transfusion Protocol (MTP)",
        description:
          "Activated MTP: 2 units O+ PRBC infused STAT in ER Bay 1; 2 additional crossmatched units PRBC and 2 units FFP dispatched with patient to Operation Theatre.",
        performed_at: "2026-10-04T02:45:00.000Z",
        administered_by: "Trauma Nurse Specialist",
      },
      {
        id: 3,
        intervention_type: "Focused Assessment with Sonography in Trauma (eFAST)",
        description:
          "Bedside ultrasound reveals massive free fluid in splenorenal pouch, Morison's pouch, and pelvis. Shattered splenic architecture.",
        performed_at: "2026-10-04T02:38:00.000Z",
        administered_by: "Dr. Vikram Seth",
      },
    ],
    clinical_notes: [
      {
        id: 1,
        note_type: "Primary & Secondary Trauma Survey",
        author: "Dr. Vikram Seth",
        content:
          "54M driver of two-wheeler struck by tractor on Highway. Airway secured with ETT. Breathing: tachypneic, breath sounds bilateral. Circulation: Class III/IV hemorrhagic shock, cold peripheries, pulse 132 feeble. Abdomen: board-like guarding, generalized peritonism, eFAST positive. Immediate damage-control surgical exploration required. Surgical team Dr. Vance notified and waiting in Emergency OR 1.",
        created_at: "2026-10-04T02:40:00.000Z",
      },
    ],
    investigations: [
      {
        id: 1,
        test_name: "STAT Bedside eFAST Sonography",
        category: "Radiology / Ultrasound",
        priority: "STAT",
        ordered_by: "Dr. Vikram Seth",
        result: "Positive massive hemoperitoneum, Grade IV splenic laceration",
        result_summary:
          "Free fluid in splenorenal recess and pelvis (massive hemoperitoneum)",
        status: "Completed",
        ordered_at: "2026-10-04T02:32:00.000Z",
        verified_at: "2026-10-04T02:38:00.000Z",
      },
      {
        id: 2,
        test_name: "STAT Arterial Blood Gas (ABG) with Lactate",
        category: "Biochemistry",
        priority: "STAT",
        ordered_by: "Dr. Vikram Seth",
        result:
          "pH 7.22, pCO2 48, pO2 72, HCO3 15, Base Excess -9.2, Lactate 5.4 mmol/L",
        result_summary:
          "Severe metabolic lactic acidosis secondary to acute blood loss",
        status: "Completed",
        ordered_at: "2026-10-04T02:33:00.000Z",
        verified_at: "2026-10-04T02:42:00.000Z",
      },
      {
        id: 3,
        test_name: "STAT Complete Hemogram",
        category: "Hematology",
        priority: "STAT",
        ordered_by: "Dr. Vikram Seth",
        result:
          "Hb 6.6 g/dL, Hct 20.4%, TLC 19,200/uL, Platelets 82,000/uL",
        result_summary:
          "Severe acute post-hemorrhagic anemia, leukocytosis, thrombocytopenia",
        status: "Completed",
        ordered_at: "2026-10-04T02:33:00.000Z",
        verified_at: "2026-10-04T02:48:00.000Z",
      },
    ],
    disposition: {
      outcome: "transferred",
      required_specialty: "General Surgery / Trauma Care",
      clinical_reason:
        "Shifted STAT to Emergency Operation Theatre (OR 1) for Exploratory Laparotomy and Splenectomy, followed by SICU admission",
      decided_by: "Dr. Vikram Seth",
      decided_at: "2026-10-04T03:30:00.000Z",
      priority: "Emergency STAT",
    },
    bed_requests: [],
    consents: [],
  },
]

const ER_STORAGE_KEY_PATIENTS = "hospai_er_patients_v8"

const ER_STORAGE_KEY_VISITS = "hospai_er_visits_v8"

const ER_STORAGE_KEY_CATEGORIES = "hospai_er_categories_v8"

export class ErDatabase {
  private static load<T,>(key: string, fallback: T): T {
    try {
      if (typeof window === "undefined") return fallback

      const data = window.localStorage.getItem(key)

      if (!data) {
        // If v8 is missing, check if v7 or v6 has user-created visits

        if (key === ER_STORAGE_KEY_VISITS) {
          const oldV =
            window.localStorage.getItem("hospai_er_visits_v7") ||
            window.localStorage.getItem("hospai_er_visits_v6")

          if (oldV) {
            try {
              const oldVisits: ErVisitRecord[] = JSON.parse(oldV)

              const fallbackVisits = fallback as unknown as ErVisitRecord[]

              const fallbackIds = new Set(fallbackVisits.map((v) => v.id))

              const userVisits = oldVisits.filter((v) => !fallbackIds.has(v.id))

              const merged = [...fallbackVisits, ...userVisits]

              window.localStorage.setItem(key, JSON.stringify(merged))

              return merged as unknown as T
            } catch {}
          }
        }

        window.localStorage.setItem(key, JSON.stringify(fallback))

        return fallback
      }

      const parsed = JSON.parse(data)

      // Ensure all prior closed visits from initial seeds exist in visits store

      if (key === ER_STORAGE_KEY_VISITS && Array.isArray(parsed)) {
        const fallbackVisits = fallback as unknown as ErVisitRecord[]

        const currentIds = new Set(parsed.map((v: any) => v.id))

        const missing = fallbackVisits.filter(
          (v) => !currentIds.has(v.id),
        )

        if (missing.length > 0) {
          const updated = [...parsed, ...missing]

          window.localStorage.setItem(key, JSON.stringify(updated))

          return updated as unknown as T
        }
      }

      if (key === ER_STORAGE_KEY_PATIENTS && Array.isArray(parsed)) {
        const fallbackPatients = fallback as unknown as ErPatient[]
        const currentPids = new Set(parsed.map((p: any) => (p.patient_id || "").toUpperCase()))
        const missing = fallbackPatients.filter((p) => !currentPids.has((p.patient_id || "").toUpperCase()))
        if (missing.length > 0) {
          const updated = [...parsed, ...missing]
          window.localStorage.setItem(key, JSON.stringify(updated))
          return updated as unknown as T
        }
      }

      return parsed
    } catch {
      return fallback
    }
  }

  private static save<T,>(key: string, data: T): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(data))
      }
    } catch (e) {
      console.error("ErDatabase save error:", e)
    }
  }

  // Patients

  static getPatients(): ErPatient[] {
    const list = this.load<ErPatient[]>(ER_STORAGE_KEY_PATIENTS, INITIAL_PATIENTS)
    return [...list].sort((a, b) => {
      const timeB = new Date(b.created_at || 0).getTime()
      const timeA = new Date(a.created_at || 0).getTime()
      return timeB - timeA
    })
  }

  static searchPatients(query: string): ErPatient[] {
    const q = (query || "").trim().toLowerCase()

    if (!q) return []

    return this.getPatients().filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.last_name || "").toLowerCase().includes(q) ||
        (p.patient_id || "").toLowerCase().includes(q) ||
        (p.phone || "").includes(q),
    )
  }

  static getPatient(patientId: string): ErPatient | null {
    const pId = (patientId || "").trim().toUpperCase()

    return (
      this.getPatients().find(
        (p) => (p.patient_id || "").trim().toUpperCase() === pId,
      ) || null
    )
  }

  static addPatient(patientData: Partial<ErPatient>): ErPatient {
    const patients = this.getPatients()

    const cleanPhone = (patientData.phone || "").replace(/\D/g, "")

    const cleanName = (patientData.name || "").trim().toLowerCase()

    const cleanLastName = (patientData.last_name || "").trim().toLowerCase()

    const existing = patientData.patient_id
      ? patients.find(
          (p) =>
            (p.patient_id || "").trim().toUpperCase() ===
            patientData.patient_id!.trim().toUpperCase(),
        )
      : cleanPhone && cleanPhone.length === 10 && cleanPhone !== "0000000000"
        ? patients.find(
            (p) => (p.phone || "").replace(/\D/g, "") === cleanPhone,
          )
        : cleanName && cleanLastName
          ? patients.find(
              (p) =>
                (p.name || "").trim().toLowerCase() === cleanName &&
                (p.last_name || "").trim().toLowerCase() === cleanLastName,
            )
          : null

    if (existing) {
      Object.assign(existing, patientData)

      this.save(ER_STORAGE_KEY_PATIENTS, patients)

      return existing
    }

    const nextId =
      patients.length > 0
        ? Math.max(
            ...patients.map((p) => {
              const num = parseInt(p.patient_id.replace(/\D/g, ""), 10)

              return isNaN(num) ? 0 : num
            }),
          ) + 1
        : 100100

    const newPatient: ErPatient = {
      patient_id:
        patientData.patient_id || `P-${String(nextId).padStart(6, "0")}`,

      name: patientData.name || "Patient",

      last_name: patientData.last_name || "",

      gender: patientData.gender || "Unknown",

      age: patientData.age || 30,

      phone: patientData.phone || "",

      emergency_contact:
        patientData.emergency_contact || patientData.phone || "",

      guardian_name: patientData.guardian_name,

      address: patientData.address || "",

      allergies: patientData.allergies,

      blood_group: patientData.blood_group || "O+",

      created_at: new Date().toISOString(),
    }

    patients.push(newPatient)

    this.save(ER_STORAGE_KEY_PATIENTS, patients)

    try {
      const corePat = db.getPatientByUmr(newPatient.patient_id)
      if (!corePat) {
        db.addPatient({
          umr: newPatient.patient_id,
          name: `${newPatient.name} ${newPatient.last_name}`.trim(),
          age: newPatient.age,
          sex: (newPatient.gender?.toLowerCase() === "female" ? "Female" : "Male") as any,
          gender: newPatient.gender,
          phone: newPatient.phone,
          address: newPatient.address || "",
          bloodGroup: newPatient.blood_group || "O+",
          createdAt: newPatient.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    } catch {}

    return newPatient
  }

  static updatePatient(
    patientId: string,
    updates: Partial<ErPatient>,
  ): ErPatient {
    const list = this.getPatients()

    const idx = list.findIndex((p) => p.patient_id === patientId)

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates }

      this.save(ER_STORAGE_KEY_PATIENTS, list)

      // Also sync existing visits for this patient

      const visits = this.getVisits("all")

      let changed = false

      visits.forEach((v) => {
        if (v.patient_id === patientId) {
          if (updates.name) v.patient_name = updates.name

          if (updates.last_name !== undefined)
            v.patient_last_name = updates.last_name

          if (updates.gender) v.patient_gender = updates.gender

          if (updates.age !== undefined) v.patient_age = updates.age

          if (updates.phone) v.patient_phone = updates.phone

          if (updates.emergency_contact)
            v.patient_emergency_contact = updates.emergency_contact

          changed = true
        }
      })

      if (changed) {
        this.save(ER_STORAGE_KEY_VISITS, visits)
      }

      return list[idx]
    }

    const newPat = this.addPatient({ patient_id: patientId, ...updates })

    return newPat
  }

  // Triage Categories

  static getCategories(): TriageCategoryConfig[] {
    return this.load<TriageCategoryConfig[]>(
      ER_STORAGE_KEY_CATEGORIES,
      DEFAULT_TRIAGE_CATEGORIES,
    )
  }

  static saveCategory(
    cat: Partial<TriageCategoryConfig>,
  ): TriageCategoryConfig {
    const list = this.getCategories()

    const idx = list.findIndex(
      (c) => c.category_code === cat.category_code || c.id === cat.id,
    )

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...cat }

      this.save(ER_STORAGE_KEY_CATEGORIES, list)

      return list[idx]
    } else {
      const newCat: TriageCategoryConfig = {
        id: list.length + 1,

        category_code: cat.category_code || `B${list.length + 1}`,

        category_label: cat.category_label || "New Category",

        description: cat.description || null,

        color: cat.color || "#16A34A",

        sort_order: cat.sort_order || list.length + 1,
      }

      list.push(newCat)

      this.save(ER_STORAGE_KEY_CATEGORIES, list)

      return newCat
    }
  }

  // Visits

  private static ensureDynamicActiveVisits(visits: ErVisitRecord[]): boolean {
    if (!Array.isArray(visits)) return false
    let changed = false
    const now = Date.now()
    const seedOffsets: Record<number, number> = {
      1: 25 * 60000,
      2: 40 * 60000,
      3: 60 * 60000,
      4: 75 * 60000,
      5: 90 * 60000,
      6: 110 * 60000,
    }

    visits.forEach((v) => {
      if (seedOffsets[v.id] && v.status === "under_treatment") {
        const offset = seedOffsets[v.id]
        const expectedMs = now - offset
        const currentMs = v.arrival_at ? new Date(v.arrival_at).getTime() : 0
        const isStale = Math.abs(now - currentMs) > 2 * 3600 * 1000 || !v.arrival_at
        if (isStale) {
          v.arrival_at = new Date(expectedMs).toISOString()
          if (v.doctor_assigned_at) {
            v.doctor_assigned_at = new Date(expectedMs + 60000).toISOString()
          }
          if (v.doctor_accepted_at) {
            v.doctor_accepted_at = new Date(expectedMs + 120000).toISOString()
          }
          changed = true
        }
      }
    })

    if (changed) {
      try {
        this.save(ER_STORAGE_KEY_VISITS, visits)
      } catch {}
    }
    return changed
  }

  static getVisits(filter?: "all" | "active" | "closed"): ErVisitRecord[] {
    const visits = this.load<ErVisitRecord[]>(
      ER_STORAGE_KEY_VISITS,
      INITIAL_VISITS,
    )

    this.ensureDynamicActiveVisits(visits)

    const sorted = [...visits].sort((a, b) => {
      const timeB = new Date(b.arrival_at || (b as any).created_at || (b as any).arrivalDate || 0).getTime()
      const timeA = new Date(a.arrival_at || (a as any).created_at || (a as any).arrivalDate || 0).getTime()
      return timeB - timeA || b.id - a.id
    })

    if (filter === "active") return sorted.filter((v) => v.status !== "closed")

    if (filter === "closed") return sorted.filter((v) => v.status === "closed")

    return sorted
  }

  static getVisitsByPatient(
    patientId: string,
    patientName?: string,
    phone?: string,
  ): ErVisitRecord[] {
    if (!patientId && !patientName && !phone) return []

    const visits = this.getVisits("all")

    const targetPid = (patientId || "").trim().toUpperCase()

    const targetName = (patientName || "").trim().toLowerCase()

    const targetPhone = (phone || "").replace(/\D/g, "")

    const matched = visits.filter((v) => {
      const vPid = (v.patient_id || v.patient?.patient_id || "")
        .trim()
        .toUpperCase()

      if (
        targetPid &&
        vPid &&
        (vPid === targetPid ||
          vPid.replace(/[-_]/g, "") === targetPid.replace(/[-_]/g, ""))
      )
        return true

      const vName = (
        v.patient_name ||
        (v.patient?.name
          ? `${v.patient?.name} ${v.patient?.last_name || ""}`
          : "")
      )
        .trim()
        .toLowerCase()

      if (
        targetName &&
        vName &&
        (vName === targetName ||
          (targetName.length >= 4 && vName.includes(targetName)))
      )
        return true

      const vPhone = (v.patient_phone || v.patient?.phone || "").replace(
        /\D/g,
        "",
      )

      if (
        targetPhone &&
        vPhone &&
        targetPhone.length >= 7 &&
        (vPhone === targetPhone ||
          (targetPhone.length === 10 &&
            vPhone.length === 10 &&
            vPhone === targetPhone))
      )
        return true

      return false
    })

    return matched
  }

  static getPatientMedicalProfile(
    patientId: string,
    patientName?: string,
  ): ErPatientMedicalProfile | null {
    const pId = (patientId || "").trim().toUpperCase()

    const name = (patientName || "").trim().toLowerCase()

    // 1. Built-in profiles for hospital and ER patients

    const PROFILES: Record<string, ErPatientMedicalProfile> = {
      "P-100245": {
        chronic_conditions: [
          "Essential Hypertension (Grade II)",
          "Dyslipidemia (Elevated LDL)",
          "GERD / Acid Peptic Disease",
        ],

        past_medical_history:
          "Diagnosed with hypertension 8 years ago, managed with ACEi/ARB. History of recurrent epigastric burning & acid regurgitation.",

        past_surgeries:
          "Appendectomy (2018), Arthroscopic Meniscectomy Right Knee (2022)",

        family_history:
          "Paternal history of Myocardial Infarction at age 58; Mother has hypertension.",

        current_medications: [
          {
            name: "Tab Telmisartan",
            dosage: "40 mg",
            frequency: "OD (Morning)",
            indication: "Essential Hypertension",
          },

          {
            name: "Tab Atorvastatin",
            dosage: "20 mg",
            frequency: "HS (Bedtime)",
            indication: "Dyslipidemia",
          },

          {
            name: "Tab Pantoprazole",
            dosage: "40 mg",
            frequency: "OD (Before breakfast PRN)",
            indication: "Acid Peptic Disease",
          },
        ],
      },

      "P-100342": {
        chronic_conditions: [
          "Allergic Rhinitis / Dust Mite Allergy",
          "Mild Bronchial Hyperreactivity",
        ],

        past_medical_history:
          "Seasonal allergic rhinitis with occasional nocturnal wheezing during winter months.",

        past_surgeries: "None",

        family_history: "No early cardiovascular disease or diabetes.",

        current_medications: [
          {
            name: "Tab Levocetirizine",
            dosage: "5 mg",
            frequency: "OD PRN (Night)",
            indication: "Allergic Rhinitis",
          },
        ],
      },

      "P-100289": {
        chronic_conditions: [
          "COPD Stage II (Moderate, GOLD 2)",
          "Type 2 Diabetes Mellitus (HbA1c 7.6%)",
          "Essential Hypertension",
          "Bilateral Knee Osteoarthritis",
        ],

        past_medical_history:
          "30 pack-year smoking history, quit 4 years ago. Diagnosed with Type 2 Diabetes 12 years ago, on oral hypoglycemic agents.",

        past_surgeries: "Left Eye Cataract Phacoemulsification with IOL (2020)",

        family_history:
          "Type 2 Diabetes in both parents; sibling with hypertension.",

        current_medications: [
          {
            name: "Inhaler Foracort",
            dosage: "200 mcg",
            frequency: "2 puffs BD (Twice daily)",
            indication: "COPD Maintenance",
          },

          {
            name: "Tab Metformin",
            dosage: "500 mg",
            frequency: "1 tab BD with meals",
            indication: "Type 2 Diabetes",
          },

          {
            name: "Tab Glimepiride",
            dosage: "1 mg",
            frequency: "1 tab OD morning",
            indication: "Type 2 Diabetes",
          },

          {
            name: "Tab Amlodipine",
            dosage: "5 mg",
            frequency: "1 tab OD",
            indication: "Hypertension",
          },
        ],
      },

      "P-100512": {
        chronic_conditions: [
          "Migraine with Aura (Episodic)",
          "Primary Hypothyroidism (Controlled)",
        ],

        past_medical_history:
          "History of episodic throbbing hemicranial headaches with visual aura. Hypothyroidism detected on routine screening 2 years ago.",

        past_surgeries: "Lower Segment Cesarean Section (LSCS, 2023)",

        family_history: "Mother has history of chronic migraine.",

        current_medications: [
          {
            name: "Tab Levothyroxine",
            dosage: "50 mcg",
            frequency: "1 tab OD (Empty stomach morning)",
            indication: "Primary Hypothyroidism",
          },

          {
            name: "Tab Naproxen",
            dosage: "250 mg",
            frequency: "1 tab SOS with food",
            indication: "Acute Migraine",
          },
        ],
      },

      "P-100301": {
        chronic_conditions: [
          "Recurrent Urolithiasis / Renal Calculi",
          "Mild Hyperuricemia",
        ],

        past_medical_history:
          "Passed 2 calcium oxalate renal stones previously (2021, 2023).",

        past_surgeries: "Right Inguinal Hernioplasty (2019)",

        family_history: "Renal calculus in elder brother.",

        current_medications: [
          {
            name: "Tab Potassium Citrate",
            dosage: "1080 mg",
            frequency: "1 tab BD after meals",
            indication: "Nephrolithiasis prevention",
          },
        ],
      },

      "P-100711": {
        chronic_conditions: [
          "Childhood Febrile Seizure Predisposition",
          "Mild Reactive Airway Disease",
        ],

        past_medical_history:
          "Two prior simple febrile convulsion episodes triggered by viral upper respiratory infections.",

        past_surgeries: "None",

        family_history: "Paternal cousin had childhood febrile seizures.",

        current_medications: [
          {
            name: "Syrup Paracetamol",
            dosage: "250 mg / 5 mL",
            frequency: "SOS for temp > 100°F",
            indication: "Fever Management",
          },
        ],
      },

      UMR10001: {
        chronic_conditions: [
          "Essential Hypertension",
          "Dyslipidemia",
          "Mild Obstructive Sleep Apnea",
        ],

        past_medical_history:
          "Longstanding hypertension well controlled on dual therapy. Mild dyslipidemia on statin therapy.",

        past_surgeries: "Laparoscopic Cholecystectomy (2021)",

        family_history:
          "Father had coronary artery bypass graft (CABG) at age 62.",

        current_medications: [
          {
            name: "Tab Aspirin",
            dosage: "81 mg",
            frequency: "1 tab OD after breakfast",
            indication: "Cardiovascular prophylaxis",
          },

          {
            name: "Tab Atorvastatin",
            dosage: "40 mg",
            frequency: "1 tab HS (Bedtime)",
            indication: "Dyslipidemia",
          },

          {
            name: "Tab Telmisartan",
            dosage: "40 mg",
            frequency: "1 tab OD morning",
            indication: "Hypertension",
          },
        ],
      },

      UMR10067: {
        chronic_conditions: [
          "Dyslipidemia",
          "Occasional Stress-induced Palpitations",
        ],

        past_medical_history:
          "Treated for borderline high cholesterol and stress fatigue.",

        past_surgeries: "None",

        family_history: "Paternal hypertension.",

        current_medications: [
          {
            name: "Tab Atorvastatin",
            dosage: "10 mg",
            frequency: "1 tab HS",
            indication: "Hyperlipidemia",
          },

          {
            name: "Capsule Omega-3 Marine TG",
            dosage: "1000 mg",
            frequency: "1 cap OD",
            indication: "Cardiovascular health",
          },
        ],
      },

      UMR10002: {
        chronic_conditions: [
          "Postural Orthostatic Tachycardia / Vasovagal Tendency",
          "Mild Iron Deficiency Anemia",
        ],

        past_medical_history:
          "Episodes of lightheadedness upon sudden standing. Hemoglobin 10.8 g/dL on recent workup.",

        past_surgeries: "None",

        family_history: "Non-contributory.",

        current_medications: [
          {
            name: "Tab Ferrous Ascorbate + Folic Acid",
            dosage: "100 mg / 1.5 mg",
            frequency: "1 tab OD after lunch",
            indication: "Iron Deficiency Anemia",
          },
        ],
      },

      UMR10003: {
        chronic_conditions: [
          "Type 2 Diabetes Mellitus",
          "Essential Hypertension",
        ],

        past_medical_history:
          "Diagnosed with Type 2 Diabetes 9 years ago. Managed with oral hypoglycemics.",

        past_surgeries: "Bilateral Knee Arthroscopy (2019)",

        family_history: "Maternal diabetes and hypertension.",

        current_medications: [
          {
            name: "Tab Metformin",
            dosage: "500 mg",
            frequency: "1 tab BD with meals",
            indication: "Type 2 Diabetes",
          },

          {
            name: "Tab Glimepiride",
            dosage: "2 mg",
            frequency: "1 tab OD morning",
            indication: "Type 2 Diabetes",
          },

          {
            name: "Tab Enalapril",
            dosage: "5 mg",
            frequency: "1 tab OD",
            indication: "Hypertension",
          },
        ],
      },
    }

    if (PROFILES[pId]) return PROFILES[pId]

    return null
  }

  static getVisit(id: number): ErVisitRecord | null {
    const visits = this.getVisits("all")

    const v = visits.find((item) => item.id === Number(id))

    if (!v) return null

    // Attach patient details and prior visit count

    if (v.patient_id) {
      const normalizedPid = v.patient_id.trim().toUpperCase()

      const priorCount = visits.filter(
        (other) =>
          other.id !== v.id &&
          (other.patient_id || "").trim().toUpperCase() === normalizedPid,
      ).length

      v.prior_visits_count = priorCount

      if (!v.patient) {
        let p = this.getPatients().find(
          (item) =>
            (item.patient_id || "").trim().toUpperCase() === normalizedPid,
        )

        if (!p) {
          const core = db.getPatientByUmr(v.patient_id)

          if (core) {
            p = {
              patient_id: core.umr,

              name: core.name,

              last_name: "",

              gender: core.sex || "Male",

              age: core.age || 30,

              phone: core.phone || "",

              emergency_contact: core.phone || "",

              address: core.address || "",

              blood_group: "O+",

              created_at: new Date().toISOString(),
            }
          }
        }

        if (p) v.patient = p
      }
    } else {
      v.prior_visits_count = 0
    }

    return v
  }

  static async createVisit(visitData: {
    patientId?: string

    patientDetails?: Partial<ErPatient>

    isUnknown?: boolean

    unknownLabel?: string

    arrivalDate?: string

    arrivalTime?: string

    arrivalMode?: string

    broughtBy?: string

    attendantName?: string

    attendantRelation?: string

    conditionAtArrival?: string

    consciousness?: string

    infoProvidedBy?: string

    policeInvolved?: boolean

    complaintText?: string

    caseCategory?: string

    vitals?: Partial<ErVitalsItem>

    assignedDoctorName?: string

    assignedSpecialty?: string

    /** Rule-based triage only, no LLM call -- for generated demo visits. */
    skipAiTriage?: boolean
  }): Promise<{ visit: ErVisitRecord ;patient: ErPatient | null }> {
    let patient: ErPatient | null = null

    if (visitData.patientId) {
      patient =
        this.getPatients().find(
          (p) =>
            (p.patient_id || "").trim().toUpperCase() ===
            visitData.patientId!.trim().toUpperCase(),
        ) || null

      if (!patient) {
        // Fall back to hospital core database (db.ts)

        const corePatient = db.getPatientByUmr(visitData.patientId)

        if (corePatient) {
          patient = this.addPatient({
            patient_id: corePatient.umr,

            name: corePatient.name,

            last_name: "",

            gender: corePatient.sex || "Male",

            age: corePatient.age || 30,

            phone: corePatient.phone || "",

            emergency_contact: corePatient.phone || "",

            address: corePatient.address || "",

            blood_group: "O+",
          })
        } else if (visitData.patientDetails) {
          patient = this.addPatient({
            ...visitData.patientDetails,

            patient_id: visitData.patientId,
          })
        }
      } else if (visitData.patientDetails) {
        // Sync any incoming details

        patient = this.addPatient({
          ...patient,

          ...visitData.patientDetails,

          patient_id: patient.patient_id,
        })
      }
    } else if (
      visitData.patientDetails &&
      (visitData.patientDetails.name || visitData.patientDetails.phone)
    ) {
      patient = this.addPatient(visitData.patientDetails)
    }

    const visits = this.getVisits("all")

    const nextId =
      visits.length > 0 ? Math.max(...visits.map((v) => v.id)) + 1 : 101

    const visitNo = `ER-${new Date().getFullYear()}-${String(nextId).padStart(5, "0")}`

    let arrivalTimestamp = new Date().toISOString()

    if (visitData.arrivalDate) {
      try {
        const timePart = (visitData.arrivalTime || "").trim() || "12:00"
        const parsed = new Date(`${visitData.arrivalDate} ${timePart}`)
        if (!isNaN(parsed.getTime())) {
          arrivalTimestamp = parsed.toISOString()
        } else {
          const parsedT = new Date(`${visitData.arrivalDate}T${timePart}`)
          if (!isNaN(parsedT.getTime())) {
            arrivalTimestamp = parsedT.toISOString()
          }
        }
      } catch (e) {
        arrivalTimestamp = new Date().toISOString()
      }
    } else if (visitData.arrivalTime) {
      try {
        const todayStr = new Date().toISOString().split("T")[0]
        const parsed = new Date(`${todayStr} ${visitData.arrivalTime.trim()}`)
        if (!isNaN(parsed.getTime())) {
          arrivalTimestamp = parsed.toISOString()
        }
      } catch {}
    }

    const now = new Date().toISOString()

    const complaintsList: ErComplaintItem[] = []

    if (visitData.complaintText && visitData.complaintText.trim()) {
      complaintsList.push({
        id: 1,

        complaint: visitData.complaintText.trim(),

        severity: "Moderate",

        case_category: visitData.caseCategory || "general_illness",

        duration: "Immediate",

        reported_by: visitData.infoProvidedBy || "Intake Nurse / EMS",

        created_at: now,
      })
    }

    const vitalsList: ErVitalsItem[] = []

    if (visitData.vitals && Object.keys(visitData.vitals).length > 0) {
      vitalsList.push({
        id: 1,

        recorded_at: now,

        recorded_by: "Triage Staff",

        heart_rate: visitData.vitals.heart_rate || null,

        bp_systolic: visitData.vitals.bp_systolic || null,

        bp_diastolic: visitData.vitals.bp_diastolic || null,

        respiratory_rate: visitData.vitals.respiratory_rate || null,

        spo2: visitData.vitals.spo2 || null,

        temperature: visitData.vitals.temperature || null,

        consciousness_level:
          visitData.consciousness ||
          visitData.vitals.consciousness_level ||
          "Alert (A)",

        blood_glucose: visitData.vitals.blood_glucose || null,

        pain_score: visitData.vitals.pain_score || null,

        gcs: visitData.vitals.gcs || 15,

        notes: visitData.vitals.notes || null,
      })
    }

    // Run smart clinical triage logic using Qwen / fallback to rules

    const triageCalc = await this.evaluateClinicalTriage(
      visitData.complaintText || "",
      visitData.vitals || {},
      { ruleBasedOnly: visitData.skipAiTriage },
    )

    const finalDoctorName =
      visitData.assignedDoctorName || triageCalc.suggestedDoctor || null

    const finalSpecialty =
      visitData.assignedSpecialty ||
      triageCalc.suggestedDepartment ||
      "Emergency"

    const effectivePid = patient?.patient_id || visitData.patientId

    const priorVisits = effectivePid
      ? this.getVisitsByPatient(effectivePid, patient?.name, patient?.phone)
      : []

    const newRecord: ErVisitRecord = {
      id: nextId,

      visit_no: visitNo,

      patient_id:
        patient?.patient_id ||
        (visitData.isUnknown ? null : visitData.patientId || null),

      is_unknown_patient: !!visitData.isUnknown,

      unknown_patient_label: visitData.unknownLabel || null,

      arrival_mode: visitData.arrivalMode || "Relative",

      brought_by: visitData.broughtBy || "Family / Relatives",

      attendant_name: visitData.attendantName || null,

      attendant_relation: visitData.attendantRelation || null,

      condition_at_arrival: visitData.conditionAtArrival || "Critical",

      consciousness: visitData.consciousness || "Conscious",

      info_provided_by: visitData.infoProvidedBy || "Relative",

      arrival_at: arrivalTimestamp,

      status: "registered",

      assigned_doctor_name: finalDoctorName,

      assigned_specialty: finalSpecialty,

      doctor_assigned_at: finalDoctorName ? now : null,

      doctor_accepted_at: null,

      triage_category: triageCalc.categoryCode,

      triage_bed_label: triageCalc.triageBedLabel,

      closed_at: null,

      police_involved: !!visitData.policeInvolved,

      patient_name:
        patient?.name ||
        visitData.patientDetails?.name ||
        (visitData.isUnknown ? "Unidentified Patient" : "Patient"),

      patient_last_name:
        patient?.last_name ?? visitData.patientDetails?.last_name ?? "",

      patient_gender:
        patient?.gender || visitData.patientDetails?.gender || "Unknown",

      patient_age: patient?.age ?? visitData.patientDetails?.age ?? null,

      patient_phone: patient?.phone || visitData.patientDetails?.phone || "",

      patient_emergency_contact:
        patient?.emergency_contact ||
        visitData.patientDetails?.emergency_contact ||
        "",

      patient: patient || undefined,

      prior_visits_count: priorVisits.length,

      complaints: complaintsList,

      vitals: vitalsList,

      triage: {
        category: triageCalc.categoryCode,

        triage_bed_label: triageCalc.triageBedLabel,

        reason: triageCalc.reasoning,

        triaged_at: now,

        assigned_by: "AI Triage Assistant",
      },

      treatments: [],

      clinical_notes: [],

      disposition: null,

      bed_requests: [],

      consents: [],
    }

    visits.unshift(newRecord)

    this.save(ER_STORAGE_KEY_VISITS, visits)

    return { visit: newRecord, patient }
  }

  static updateVisit(
    id: number,
    updates: Partial<ErVisitRecord>,
  ): ErVisitRecord {
    const visits = this.getVisits("all")

    const idx = visits.findIndex((v) => v.id === Number(id))

    if (idx >= 0) {
      visits[idx] = { ...visits[idx], ...updates }

      this.save(ER_STORAGE_KEY_VISITS, visits)

      return visits[idx]
    }

    throw new Error(`Visit ${id} not found`)
  }

  static addComplaint(
    visitId: number,
    complaint: { complaint: string ;case_category?: string },
  ): ErComplaintItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newItem: ErComplaintItem = {
      id: visit.complaints.length + 1,

      complaint: complaint.complaint,

      severity: "Moderate",

      case_category: complaint.case_category || null,

      duration: "Current",

      reported_by: "Clinical Staff",

      created_at: new Date().toISOString(),
    }

    visit.complaints.push(newItem)

    this.updateVisit(visitId, { complaints: visit.complaints })

    return newItem
  }

  static addVitals(
    visitId: number,
    vitals: Partial<ErVitalsItem>,
  ): ErVitalsItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newItem: ErVitalsItem = {
      id: visit.vitals.length + 1,

      recorded_at: new Date().toISOString(),

      recorded_by: "Triage Nurse",

      heart_rate: vitals.heart_rate ?? null,

      bp_systolic: vitals.bp_systolic ?? null,

      bp_diastolic: vitals.bp_diastolic ?? null,

      respiratory_rate: vitals.respiratory_rate ?? null,

      spo2: vitals.spo2 ?? null,

      temperature: vitals.temperature ?? null,

      consciousness_level: vitals.consciousness_level ?? "Alert (A)",

      blood_glucose: vitals.blood_glucose ?? null,

      pain_score: vitals.pain_score ?? null,

      gcs: vitals.gcs ?? 15,

      notes: vitals.notes ?? null,
    }

    visit.vitals.push(newItem)

    this.updateVisit(visitId, { vitals: visit.vitals })

    return newItem
  }

  static setTriage(
    visitId: number,
    triage: { category: string ;reason?: string ;bedLabel?: string },
  ): ErTriageItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newTriage: ErTriageItem = {
      category: triage.category,

      triage_bed_label:
        triage.bedLabel ||
        (triage.category === "B1"
          ? "ER Red Zone"
          : triage.category === "B2"
            ? "ER Yellow Zone"
            : triage.category === "Black"
              ? "ER Comfort / Palliative Bay"
              : "ER Green Zone"),

      reason: triage.reason || "Clinical Assessment",

      triaged_at: new Date().toISOString(),

      assigned_by: "ED Medical Officer",
    }

    this.updateVisit(visitId, {
      triage: newTriage,

      triage_category: triage.category,

      triage_bed_label: newTriage.triage_bed_label,

      status: visit.status === "registered" ? "triaged" : visit.status,
    })

    return newTriage
  }

  static assignDoctor(
    visitId: number,
    data: { doctor_name?: string ;specialty?: string },
  ): void {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    this.updateVisit(visitId, {
      assigned_doctor_name:
        data.doctor_name || visit.assigned_doctor_name || "Dr. Anita Roy",

      assigned_specialty:
        data.specialty || visit.assigned_specialty || "Emergency Medicine",

      doctor_assigned_at: new Date().toISOString(),

      status: "doctor_assigned",
    })
  }

  static acceptDoctor(visitId: number): void {
    this.updateVisit(visitId, {
      doctor_accepted_at: new Date().toISOString(),

      status: "under_treatment",
    })
  }

  static addTreatment(
    visitId: number,
    data: { intervention_type: string ;description?: string },
  ): ErTreatmentItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newItem: ErTreatmentItem = {
      id: visit.treatments.length + 1,

      intervention_type: data.intervention_type,

      description: data.description || null,

      performed_at: new Date().toISOString(),

      administered_by: "ER Attending Staff",
    }

    visit.treatments.push(newItem)

    this.updateVisit(visitId, {
      treatments: visit.treatments,

      status: "under_treatment",
    })

    return newItem
  }

  static addClinicalNote(
    visitId: number,
    data: { note_type?: string ;author?: string ;content: string },
  ): ErClinicalNoteItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newItem: ErClinicalNoteItem = {
      id: visit.clinical_notes.length + 1,

      note_type: data.note_type || "Clinical Note",

      author: data.author || "Attending Physician",

      content: data.content,

      created_at: new Date().toISOString(),
    }

    visit.clinical_notes.push(newItem)

    this.updateVisit(visitId, { clinical_notes: visit.clinical_notes })

    return newItem
  }

  static addInvestigation(
    visitId: number,
    data: { name: string ;priority?: string ;category?: string },
  ): ErInvestigationItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newItem: ErInvestigationItem = {
      id: (visit.investigations || []).length + 1,

      test_name: data.name,

      category: data.category || "Emergency Lab / Imaging",

      priority: data.priority || "STAT",

      ordered_at: new Date().toISOString(),

      ordered_by: visit.assigned_doctor_name || "Emergency Physician",

      status: "Ordered",

      result: "Sample Dispatched / In Progress",
    }

    visit.investigations = [...(visit.investigations || []), newItem]

    this.updateVisit(visitId, { investigations: visit.investigations })

    return newItem
  }

  static createBedRequest(
    visitId: number,
    data: { requested_level_of_care?: string ;requested_specialty?: string },
  ): ErBedRequestItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newItem: ErBedRequestItem = {
      id: visit.bed_requests.length + 1,

      status: "pending",

      requested_level_of_care:
        data.requested_level_of_care || "Inpatient General Ward",

      requested_specialty:
        data.requested_specialty ||
        visit.assigned_specialty ||
        "General Medicine",

      requested_at: new Date().toISOString(),

      allocated_bed_id: null,

      allocated_admission_id: null,

      allocated_at: null,
    }

    visit.bed_requests.push(newItem)

    this.updateVisit(visitId, {
      bed_requests: visit.bed_requests,

      status: "bed_requested",
    })

    return newItem
  }

  static addConsent(visitId: number, data: any): ErConsentItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const newItem: ErConsentItem = {
      id: (visit.consents || []).length + 1,

      patient_name:
        data.patient_name || `${visit.patient_name} ${visit.patient_last_name}`,

      consent_type: data.consent_type || "General Emergency Treatment",

      signed_by: data.signed_by || "Self",

      relation_to_patient: data.relation_to_patient || "Self",

      status: "Signed",

      witness_doctor:
        data.witness_doctor || visit.assigned_doctor_name || "Dr. Anita Roy",

      signed_by_phone: data.signed_by_phone || visit.patient_phone || "",

      legal_waiver_acknowledged: true,

      signed_at: new Date().toISOString(),

      notes: data.notes,
    }

    const updated = [...(visit.consents || []), newItem]

    this.updateVisit(visitId, { consents: updated })

    return newItem
  }

  static recordLama(visitId: number, data: any): void {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    this.updateVisit(visitId, {
      disposition: {
        outcome: data.is_dama ? "dama" : "lama",

        required_specialty: null,

        clinical_reason:
          data.reason ||
          "Patient left against medical advice after signing liability waiver.",

        decided_by:
          data.witness_doctor || visit.assigned_doctor_name || "Dr. Anita Roy",

        decided_at: new Date().toISOString(),

        priority: "High",
      },

      closed_at: new Date().toISOString(),

      status: "closed",
    })
  }

  static dispatchBedTransferAlert(notifData: {
    patient_id?: string | null

    patient_name: string

    patient_last_name?: string

    patient_age?: number | null

    patient_gender?: string | null

    patient_phone?: string | null

    source_department: string

    target_destination: string

    target_bed_type: "ICU" | "General" | "Semi-Private" | "Private"

    target_ward?: string

    priority: "Stat / Emergency" | "High Priority" | "Urgent" | "Routine"

    clinical_reason: string

    sent_by?: string | null

    er_visit_id?: number

    er_bed_request_id?: number
  }) {
    if (typeof window === "undefined" || !window.localStorage) return

    try {
      const key = "hospai_bed_transfer_notifications_v3"

      const existing = JSON.parse(window.localStorage.getItem(key) || "[]")

      const isIcu =
        notifData.target_destination.toLowerCase().includes("icu") ||
        notifData.target_bed_type === "ICU"

      const newNotif = {
        id: `NOTIF-TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,

        patient_id: notifData.patient_id,

        patient_name: notifData.patient_name,

        patient_last_name: notifData.patient_last_name || "",

        patient_age: notifData.patient_age ?? 45,

        patient_gender: notifData.patient_gender || "Male",

        patient_phone: notifData.patient_phone || null,

        source_department:
          notifData.source_department || "Emergency Department (ER Bay 1)",

        target_destination:
          notifData.target_destination ||
          (isIcu ? "ICU (Intensive Care Unit)" : "3N Medical/Surgical Ward"),

        target_bed_type:
          notifData.target_bed_type || (isIcu ? "ICU" : "General"),

        target_ward:
          notifData.target_ward ||
          (isIcu ? "Intensive Care Unit (ICU)" : "3N Medical/Surgical"),

        priority:
          notifData.priority || (isIcu ? "Stat / Emergency" : "High Priority"),

        clinical_reason: notifData.clinical_reason,

        sent_by: notifData.sent_by || "Attending Emergency Physician",

        sent_at: new Date().toISOString(),

        status: "pending",

        er_visit_id: notifData.er_visit_id,

        er_bed_request_id: notifData.er_bed_request_id,

        is_read: false,
      }

      existing.unshift(newNotif)

      window.localStorage.setItem(key, JSON.stringify(existing))

      window.dispatchEvent(
        new CustomEvent("bed:transfer_notification_updated", {
          detail: {
            count: existing.filter(
              (n: any) => !n.is_read && n.status !== "dismissed",
            ).length,
            notifications: existing,
          },
        }),
      )

      window.dispatchEvent(
        new CustomEvent("bed:new_transfer_alert", {
          detail: newNotif,
        }),
      )
    } catch (err) {
      console.error("Failed to dispatch bed transfer alert", err)
    }
  }

  static recordDisposition(visitId: number, data: any): ErDispositionItem {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const outcome = data.outcome || "discharge"

    const isAdmission =
      outcome.includes("admit") ||
      outcome.includes("icu") ||
      outcome.includes("ward") ||
      outcome === "admit_inpatient" ||
      outcome === "admit_icu" ||
      outcome === "transfer_ot" ||
      outcome === "transfer_facility"

    const isIcu =
      outcome.includes("icu") ||
      (data.required_specialty || "").toLowerCase().includes("icu")

    const reqLoc = isIcu ? "ICU" : data.required_specialty || "General Ward"

    const disp: ErDispositionItem = {
      outcome: outcome,

      required_specialty:
        data.required_specialty ||
        (isIcu ? "Intensive Care Unit (ICU)" : "General Medicine"),

      clinical_reason:
        data.clinical_reason ||
        (isIcu
          ? "Critical patient admitted to ICU for intensive telemetry & monitoring."
          : "Patient stabilized and admitted to inpatient care."),

      decided_by:
        data.decided_by || visit.assigned_doctor_name || "Attending Physician",

      decided_at: new Date().toISOString(),

      priority: data.priority || (isIcu ? "Stat / Emergency" : "Routine"),
    }

    let createdBedReqId: number | undefined

    // Auto-create or ensure bed request when disposition is admission or ICU

    if (isAdmission) {
      const existingPendingReq = (visit.bed_requests || []).find(
        (r) => r.status === "pending",
      )

      if (!existingPendingReq) {
        createdBedReqId = (visit.bed_requests || []).length + 1

        const newReq: ErBedRequestItem = {
          id: createdBedReqId,

          status: "pending",

          requested_level_of_care: reqLoc,

          requested_specialty:
            data.required_specialty ||
            (isIcu
              ? "ICU (Intensive Care Unit)"
              : visit.assigned_specialty || "General Medicine"),

          requested_at: new Date().toISOString(),

          allocated_bed_id: null,

          allocated_admission_id: null,

          allocated_at: null,
        }

        visit.bed_requests = [...(visit.bed_requests || []), newReq]
      } else {
        createdBedReqId = existingPendingReq.id
      }

      // Dispatch Transfer Notification to Bed Board

      ErDatabase.dispatchBedTransferAlert({
        patient_id: visit.patient_id,

        patient_name:
          visit.patient_name ||
          (visit.is_unknown_patient
            ? visit.unknown_patient_label || "Unknown Patient"
            : "Patient"),

        patient_last_name: visit.patient_last_name || "",

        patient_age: visit.patient_age,

        patient_gender: visit.patient_gender,

        patient_phone: visit.patient_phone,

        source_department: `Emergency Department (${visit.triage?.triage_bed_label || visit.triage_bed_label || "Triage Bay"})`,

        target_destination: isIcu
          ? "ICU (Intensive Care Unit)"
          : data.required_specialty
            ? `${data.required_specialty} Ward`
            : "3N Medical/Surgical Ward",

        target_bed_type: isIcu ? "ICU" : "General",

        target_ward: isIcu
          ? "Intensive Care Unit (ICU)"
          : "3N Medical/Surgical",

        priority: disp.priority as any,

        clinical_reason: disp.clinical_reason,

        sent_by: disp.decided_by,

        er_visit_id: visit.id,

        er_bed_request_id: createdBedReqId,
      })
    }

    const newStatus = isAdmission
      ? "bed_requested"
      : outcome === "discharge" || outcome === "death"
        ? "closed"
        : "awaiting_disposition"

    this.updateVisit(visitId, {
      disposition: disp,

      bed_requests: visit.bed_requests,

      status: newStatus,

      closed_at:
        outcome === "discharge" || outcome === "death"
          ? new Date().toISOString()
          : null,
    })

    return disp
  }

  static getBedRequests(statusFilter?: string): any[] {
    const visits = this.getVisits("all")

    const results: any[] = []

    for (const v of visits) {
      if (!v.bed_requests || v.bed_requests.length === 0) continue

      for (const r of v.bed_requests) {
        if (statusFilter && r.status !== statusFilter) continue

        results.push({
          id: r.id,

          er_visit_id: v.id,

          visit_no: v.visit_no,

          patient_id: v.patient_id,

          patient_name:
            v.patient_name ||
            (v.is_unknown_patient ? v.unknown_patient_label : "Patient"),

          patient_last_name: v.patient_last_name || "",

          is_unknown_patient: v.is_unknown_patient,

          unknown_patient_label: v.unknown_patient_label,

          requested_level_of_care: r.requested_level_of_care,

          requested_specialty: r.requested_specialty,

          requested_at: r.requested_at,

          status: r.status,
        })
      }
    }

    return results
  }

  static allocateBedRequest(
    bedRequestId: number,
    bedId: number,
    notes?: string,
  ): void {
    const visits = this.getVisits("all")

    for (const v of visits) {
      const req = (v.bed_requests || []).find((r) => r.id === bedRequestId)

      if (req) {
        req.status = "allocated"

        req.allocated_bed_id = bedId

        req.allocated_at = new Date().toISOString()

        this.updateVisit(v.id, {
          bed_requests: v.bed_requests,

          status: "closed",

          closed_at: new Date().toISOString(),
        })

        break
      }
    }
  }

  static cancelBedRequest(bedRequestId: number, reason?: string): void {
    const visits = this.getVisits("all")

    for (const v of visits) {
      const req = (v.bed_requests || []).find((r) => r.id === bedRequestId)

      if (req) {
        req.status = "cancelled"

        this.updateVisit(v.id, {
          bed_requests: v.bed_requests,
        })

        break
      }
    }
  }

  static getTimelineEvents(visitId: number): ErTimelineEventItem[] {
    const visit = this.getVisit(visitId)

    if (!visit) return []

    return (visit.timeline_events || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
  }

  static addTimelineEvent(
    visitId: number,
    eventData: Partial<ErTimelineEventItem>,
  ): ErTimelineEventItem {
    const visits = this.getVisits("all")

    const idx = visits.findIndex((v) => v.id === Number(visitId))

    if (idx < 0) throw new Error("Visit not found")

    const v = visits[idx]

    if (!v.timeline_events) v.timeline_events = []

    const newId =
      v.timeline_events.length > 0
        ? Math.max(...v.timeline_events.map((e) => e.id)) + 1
        : 1

    const now = new Date().toISOString()

    const fullEvent: ErTimelineEventItem = {
      id: newId,

      event_type: eventData.event_type || "initial_vitals",

      event_name: eventData.event_name || "Clinical Event",

      timestamp: eventData.timestamp || now,

      logged_by: eventData.logged_by || "Staff Nurse Jessica Carter, RN",

      visit_id: v.id,

      visit_no: v.visit_no,

      patient_id: v.patient_id,

      location: eventData.location || v.triage_bed_label || "ER Bay",

      bed: eventData.bed || v.triage_bed_label || null,

      notes: eventData.notes || null,

      vitals_data: eventData.vitals_data,

      medication_data: eventData.medication_data,

      intervention_data: eventData.intervention_data,

      stabilization_data: eventData.stabilization_data,

      doctor_data: eventData.doctor_data,

      assessment_data: eventData.assessment_data,

      destination_data: eventData.destination_data,

      destination_bed_data: eventData.destination_bed_data,

      transfer_data: eventData.transfer_data,
    }

    // Add to chronological timeline

    v.timeline_events.push(fullEvent)

    // Sync corresponding subsystems:

    if (
      fullEvent.event_type === "initial_vitals" ||
      fullEvent.event_type === "followup_vitals"
    ) {
      if (fullEvent.vitals_data) {
        if (!v.vitals) v.vitals = []

        v.vitals.push({
          id: v.vitals.length + 1,

          recorded_at: fullEvent.timestamp,

          recorded_by: fullEvent.logged_by,

          heart_rate: fullEvent.vitals_data.heart_rate ?? null,

          bp_systolic: fullEvent.vitals_data.bp_systolic ?? null,

          bp_diastolic: fullEvent.vitals_data.bp_diastolic ?? null,

          respiratory_rate: fullEvent.vitals_data.respiratory_rate ?? null,

          spo2: fullEvent.vitals_data.spo2 ?? null,

          temperature: fullEvent.vitals_data.temperature ?? null,

          blood_glucose: fullEvent.vitals_data.blood_glucose ?? null,

          pain_score: fullEvent.vitals_data.pain_score ?? null,

          gcs: fullEvent.vitals_data.gcs ?? null,

          consciousness_level:
            fullEvent.vitals_data.gcs && fullEvent.vitals_data.gcs < 15
              ? "Altered"
              : "Alert (A)",

          notes: fullEvent.vitals_data.notes || null,
        })
      }
    } else if (
      fullEvent.event_type === "medication_given" &&
      fullEvent.medication_data
    ) {
      if (!v.treatments) v.treatments = []

      v.treatments.push({
        id: v.treatments.length + 1,

        intervention_type: fullEvent.medication_data.drug_name,

        description: `Dose: ${fullEvent.medication_data.dosage || "STAT"} • Route: ${fullEvent.medication_data.route || "IV"} • Response: ${fullEvent.medication_data.response || "Tolerated"}`,

        performed_at: fullEvent.timestamp,

        administered_by: fullEvent.logged_by,
      })
    } else if (
      fullEvent.event_type === "intervention_given" &&
      fullEvent.intervention_data
    ) {
      if (!v.treatments) v.treatments = []

      v.treatments.push({
        id: v.treatments.length + 1,

        intervention_type: fullEvent.intervention_data.intervention_type,

        description: `${fullEvent.intervention_data.details || ""} ${
          fullEvent.intervention_data.patient_response
            ? `• Response: ${fullEvent.intervention_data.patient_response}`
            : ""
        }`,

        performed_at: fullEvent.timestamp,

        administered_by: fullEvent.logged_by,
      })
    } else if (
      fullEvent.event_type === "doctor_assigned" &&
      fullEvent.doctor_data
    ) {
      v.assigned_doctor_name = fullEvent.doctor_data.doctor_name

      v.assigned_specialty = fullEvent.doctor_data.specialty

      v.doctor_assigned_at = fullEvent.timestamp
    } else if (
      fullEvent.event_type === "doctor_arrived" &&
      fullEvent.assessment_data
    ) {
      v.doctor_accepted_at = fullEvent.timestamp
    } else if (
      fullEvent.event_type === "destination_assigned" &&
      fullEvent.destination_data
    ) {
      const outcomeMap: Record<string, string> = {
        ICU: "admit_icu",

        Ward: "admit_inpatient",

        HDU: "admit_icu",

        "Specialty Ward": "admit_inpatient",

        Observation: "admit_inpatient",

        "Operating Theatre": "transfer_ot",

        Discharge: "discharge",
      }

      v.disposition = {
        outcome:
          outcomeMap[fullEvent.destination_data.destination] ||
          "admit_inpatient",

        required_specialty: fullEvent.destination_data.destination,

        clinical_reason:
          fullEvent.destination_data.clinical_reason ||
          "Emergency evaluation completed",

        decided_by:
          fullEvent.destination_data.doctor_name ||
          v.assigned_doctor_name ||
          "Attending Physician",

        decided_at: fullEvent.timestamp,

        priority: "High Priority",
      }
    } else if (
      fullEvent.event_type === "destination_bed_assigned" &&
      fullEvent.destination_bed_data
    ) {
      v.triage_bed_label = `${fullEvent.destination_bed_data.department} (${fullEvent.destination_bed_data.bed_id_or_label})`
    } else if (
      fullEvent.event_type === "patient_transferred" &&
      fullEvent.transfer_data
    ) {
      v.status = "closed"

      v.closed_at = fullEvent.timestamp

      v.triage_bed_label = `${fullEvent.transfer_data.target_destination} (${fullEvent.transfer_data.target_bed})`

      // Dispatch Transfer Notification to Bed Board

      const isIcu = (fullEvent.transfer_data.target_destination || "")
        .toLowerCase()
        .includes("icu")

      ErDatabase.dispatchBedTransferAlert({
        patient_id: v.patient_id,

        patient_name:
          v.patient_name ||
          (v.is_unknown_patient
            ? v.unknown_patient_label || "Unknown Patient"
            : "Patient"),

        patient_last_name: v.patient_last_name || "",

        patient_age: v.patient_age,

        patient_gender: v.patient_gender,

        patient_phone: v.patient_phone,

        source_department: `Emergency Department (${fullEvent.transfer_data.source_location || "ER Bay"})`,

        target_destination:
          fullEvent.transfer_data.target_destination ||
          (isIcu ? "ICU (Intensive Care Unit)" : "Inpatient Ward"),

        target_bed_type: isIcu ? "ICU" : "General",

        priority: isIcu ? "Stat / Emergency" : "High Priority",

        clinical_reason:
          fullEvent.transfer_data.handover_notes ||
          `Transferred to ${fullEvent.transfer_data.target_destination} (${fullEvent.transfer_data.target_bed}). Escort: ${fullEvent.transfer_data.escorting_staff || "Staff RN"}`,

        sent_by: fullEvent.logged_by || "Staff Nurse",

        er_visit_id: v.id,
      })
    }

    this.save(ER_STORAGE_KEY_VISITS, visits)

    return fullEvent
  }

  static clearTimeline(visitId: number): void {
    const visits = this.getVisits("all")

    const idx = visits.findIndex((v) => v.id === Number(visitId))

    if (idx < 0) throw new Error("Visit not found")

    visits[idx].timeline_events = []

    this.save(ER_STORAGE_KEY_VISITS, visits)
  }

  static deleteTimelineEvent(visitId: number, eventId: number): void {
    const visits = this.getVisits("all")

    const idx = visits.findIndex((v) => v.id === Number(visitId))

    if (idx < 0) throw new Error("Visit not found")

    if (visits[idx].timeline_events) {
      visits[idx].timeline_events = visits[idx].timeline_events!.filter(
        (e) => e.id !== eventId,
      )

      this.save(ER_STORAGE_KEY_VISITS, visits)
    }
  }

  static closeVisit(visitId: number, consultationFee?: number): {
    invoice_id: number
    total: number
  } {
    const visit = this.getVisit(visitId)

    if (!visit) throw new Error("Visit not found")

    const baseFee = consultationFee || 100

    const treatFee = (visit.treatments || []).length * 40

    const total = baseFee + treatFee

    this.updateVisit(visitId, {
      status: "closed",

      closed_at: new Date().toISOString(),
    })

    return { invoice_id: 1000 + visitId, total }
  }

  // Clinical Rule-Based Smart AI Triage Engine with Qwen Integration

  static async evaluateClinicalTriage(
    complaints: string,

    vitals: Partial<ErVitalsItem>,

    options: { ruleBasedOnly?: boolean } = {},
  ): Promise<{
    categoryCode: string

    urgency: string

    reasoning: string

    suggestedDepartment: string

    suggestedDoctor: string

    triageBedLabel: string

    suggestedTreatments: { intervention_type: string ;description: string }[]
  }> {
    const c = (complaints || "").toLowerCase()

    // Fallback rule-based logic function

    const runRuleBasedFallback = () => {
      const hr = vitals.heart_rate || 0

      const sys = vitals.bp_systolic || 0

      const dia = vitals.bp_diastolic || 0

      const spo2 = vitals.spo2 || 100

      const rr = vitals.respiratory_rate || 16

      const temp = vitals.temperature || 98.6

      const gcs = vitals.gcs || 15

      const grbs = vitals.blood_glucose || 100

      const pain = vitals.pain_score || 0

      const cons = (vitals.consciousness_level || "").toLowerCase()

      // Critical Priority (B1 - Red)

      if (
        spo2 < 85 ||
        sys < 80 ||
        hr > 140 ||
        hr < 40 ||
        gcs < 9 ||
        cons.includes("unresponsive") ||
        cons.includes("comatose") ||
        c.includes("cardiac arrest") ||
        c.includes("unconscious") ||
        c.includes("stemi") ||
        c.includes("crushing chest pain") ||
        c.includes("severe hemorrhage") ||
        c.includes("active bleeding") ||
        c.includes("anaphylaxis")
      ) {
        return {
          categoryCode: "B1",

          urgency: "Immediate / Resuscitation",

          reasoning:
            "Critical presentation detected (Severe hemodynamic instability / hypoxia / acute coronary syndrome / altered consciousness). Immediate resuscitation protocol activated.",

          suggestedDepartment: c.includes("trauma")
            ? "Trauma Surgery"
            : c.includes("chest") || c.includes("heart")
              ? "Cardiology"
              : "Emergency Medicine",

          suggestedDoctor: "Dr. Vikram Seth (Cardiology / Critical Care)",

          triageBedLabel: "ER Bed 01 (Red Zone - Resuscitation)",

          suggestedTreatments: [
            {
              intervention_type: "Immediate IV Resuscitation & High Flow O2",
              description:
                "Wide bore IV lines, O2 at 6-8 L/min, continuous ECG and SpO2 monitoring",
            },

            {
              intervention_type: "Emergency Cardiac / Airway Protocol",
              description: "Stat ECG, cardiac loading doses / airway standby",
            },
          ],
        }
      }

      // High Emergent Priority (B2 - Orange)

      if (
        spo2 < 92 ||
        sys > 190 ||
        dia > 115 ||
        hr > 115 ||
        rr > 26 ||
        pain >= 8 ||
        grbs > 350 ||
        grbs < 55 ||
        c.includes("chest pain") ||
        c.includes("stroke") ||
        c.includes("weakness") ||
        c.includes("rta") ||
        c.includes("accident") ||
        c.includes("seizure") ||
        c.includes("poisoning") ||
        c.includes("burn") ||
        c.includes("fracture") ||
        c.includes("dyspnea")
      ) {
        return {
          categoryCode: "B2",

          urgency: "High / Emergent",

          reasoning:
            "High emergent acuity (Significant vital abnormality, severe pain, or acute neurological/trauma presentation). Rapid physician assessment within 10 minutes required.",

          suggestedDepartment:
            c.includes("rta") || c.includes("trauma") || c.includes("fracture")
              ? "Orthopedics / Trauma"
              : c.includes("stroke")
                ? "Neurology"
                : c.includes("chest")
                  ? "Cardiology"
                  : "Emergency Medicine",

          suggestedDoctor: "Dr. Anita Roy (Emergency & Critical Care)",

          triageBedLabel: "ER Bed 03 (Yellow Zone - High Care)",

          suggestedTreatments: [
            {
              intervention_type: "Vital Stabilization & IV Access",
              description:
                "IV Line secured, 0.9% Normal Saline slow infusion, continuous multi-para monitoring",
            },

            {
              intervention_type: "Targeted Analgesia / Nebulization",
              description: "Immediate symptomatic relief per protocol",
            },
          ],
        }
      }

      // Moderate Urgent (B3 - Yellow)

      if (
        temp > 102 ||
        pain >= 5 ||
        hr > 100 ||
        sys > 150 ||
        c.includes("fever") ||
        c.includes("vomiting") ||
        c.includes("abdominal pain") ||
        c.includes("infection") ||
        c.includes("laceration") ||
        c.includes("asthma")
      ) {
        return {
          categoryCode: "B3",

          urgency: "Moderate / Urgent",

          reasoning:
            "Moderate acuity condition requiring structured evaluation and symptomatic emergency stabilization within 30 minutes.",

          suggestedDepartment:
            c.includes("abdominal") || c.includes("vomiting")
              ? "General Surgery / Gastroenterology"
              : "General Medicine",

          suggestedDoctor: "Dr. Rajesh Sharma (General Medicine)",

          triageBedLabel: "ER Bed 06 (Yellow Zone - Observation)",

          suggestedTreatments: [
            {
              intervention_type: "Antipyretic / IV Antiemetic",
              description:
                "IV Paracetamol 1g / Ondansetron 4mg for acute symptom control",
            },
          ],
        }
      }

      return {
        categoryCode: "B4",

        urgency: "Low / Less Urgent",

        reasoning:
          "Hemodynamically stable presentation. Routine emergency care and outpatient/day-care management indicated.",

        suggestedDepartment: "General Medicine",

        suggestedDoctor: "Dr. Rajesh Sharma (General Medicine)",

        triageBedLabel: "ER Bed 08 (Green Zone - Ambulatory)",

        suggestedTreatments: [
          {
            intervention_type: "Clinical Evaluation & Basic Vitals Review",
            description: "Standard clinical evaluation and vitals monitoring",
          },
        ],
      }
    }

    if (options.ruleBasedOnly) return runRuleBasedFallback()

    // Attempt to use Qwen LLM

    try {
      // Same-origin vLLM proxy (see src/lib/llm.ts); the old default was a
      // local Ollama port that only exists on the developer's machine.
      const apiUrl = LLM_CHAT_URL

      const apiKey = LLM_API_KEY

      const prompt = `You are an AI Triage Assistant in an Emergency Room.
Based on the patient's symptoms and vitals, evaluate the clinical triage.
Symptoms: ${complaints}
Vitals: ${JSON.stringify(vitals)}

Available Departments: Emergency Medicine, Cardiology, Pulmonology, General Medicine, General Surgery, Orthopedics / Trauma, Neurology, Pediatrics, Obstetrics & Gynecology
Available Doctors: Dr. Vikram Seth (Cardiology), Dr. Anita Roy (Emergency Medicine), Dr. Rajesh Sharma (General Medicine), Dr. Sanjay Gupta (Orthopedics / Trauma), Dr. Meenakshi Rao (Neurology), Dr. Priya Deshmukh (General Surgery)

Respond ONLY with a valid JSON object matching this schema:
{
  "categoryCode": "B1" | "B2" | "B3" | "B4" | "B5",
  "urgency": "Immediate / Resuscitation" | "High / Emergent" | "Moderate / Urgent" | "Low / Less Urgent" | "Non-Urgent",
  "reasoning": "string explaining reasoning",
  "suggestedDepartment": "string from available departments",
  "suggestedDoctor": "string from available doctors or empty if none",
  "triageBedLabel": "string describing bed assignment (e.g. ER Bed 01 (Red Zone))",
  "suggestedTreatments": [
    { "intervention_type": "string", "description": "string" }
  ]
}`

      const response = await fetch(apiUrl, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: await llmModel(),

          messages: [{ role: "user", content: prompt }],

          temperature: 0.1,

          response_format: { type: "json_object" },
        }),
      })

      if (!response.ok) {
        throw new Error("LLM API returned an error")
      }

      const data = await response.json()

      const content = data.choices[0].message.content

      const parsed = JSON.parse(content)

      // Basic validation

      if (!parsed.categoryCode || !parsed.suggestedDepartment) {
        throw new Error("Invalid schema returned by LLM")
      }

      // Fallback logic for hallucinations

      const validDepts = [
        "Emergency Medicine",
        "Cardiology",
        "Pulmonology",
        "General Medicine",
        "General Surgery",
        "Orthopedics / Trauma",
        "Neurology",
        "Pediatrics",
        "Obstetrics & Gynecology",
      ]

      if (!validDepts.includes(parsed.suggestedDepartment)) {
        parsed.suggestedDepartment = "General Medicine"
      }

      if (
        !parsed.suggestedDoctor ||
        !parsed.suggestedDoctor.includes(parsed.suggestedDepartment)
      ) {
        // Deterministic fallback to a doctor in the department

        const docMap: Record<string, string> = {
          Cardiology: "Dr. Vikram Seth (Cardiology)",

          "Emergency Medicine": "Dr. Anita Roy (Emergency Medicine)",

          "General Medicine": "Dr. Rajesh Sharma (General Medicine)",

          "Orthopedics / Trauma": "Dr. Sanjay Gupta (Orthopedics / Trauma)",

          Neurology: "Dr. Meenakshi Rao (Neurology)",

          "General Surgery": "Dr. Priya Deshmukh (General Surgery)",
        }

        parsed.suggestedDoctor =
          docMap[parsed.suggestedDepartment] ||
          "Dr. Rajesh Sharma (General Medicine)"
      }

      return parsed
    } catch (err) {
      console.warn(
        "AI Triage via Qwen failed, falling back to rule-based engine:",
        err,
      )

      return runRuleBasedFallback()
    }
  }
}
