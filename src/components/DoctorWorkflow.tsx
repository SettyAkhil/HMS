import React, { useState, useEffect } from "react"
import { Icon } from "./icons"
import { Btn, Input, StatusBadge } from "./shared"
import { db, DBOPEncounter, DBPatient } from "../services/db"
import { doesDoctorMatchEncounter } from "../services/doctorPortalDb"
import { BillingDatabase, InvoiceItem } from "../services/billingDb"
import {
  PharmacyDatabase,
  AppPrescription,
  AppPrescriptionItem,
  PrescriptionSource,
  AppPharmacyBill,
} from "../services/pharmacyDb"
import { AuditDatabase } from "../services/auditDb"

interface DoctorProfile {
  id: string
  name: string
  specialty: string
  room: string
}

export interface OrderedClinicalService {
  id: string
  name: string
  category: "Procedure / Surgery" | "Nursing" | "Consultation" | "Consumables" | "Radiology / Imaging" | "Laboratory" | "Room / Bed Charges"
  cptCode: string
  price: number
  quantity: number
}

export interface HospitalServiceItem {
  id: string
  name: string
  category: OrderedClinicalService["category"]
  cpt: string
  price: number
}

export const MASTER_HOSPITAL_SERVICES: HospitalServiceItem[] = [
  {
    id: "SVC-01",
    name: "Minor Wound Dressing & Sterile Bandaging",
    category: "Procedure / Surgery",
    cpt: "12001",
    price: 40,
  },
  {
    id: "SVC-02",
    name: "Suture Removal & Wound Inspection",
    category: "Procedure / Surgery",
    cpt: "12002",
    price: 40,
  },
  {
    id: "SVC-03",
    name: "Nebulization Protocol Therapy (Single Session)",
    category: "Procedure / Surgery",
    cpt: "94640",
    price: 30,
  },
  {
    id: "SVC-04",
    name: "Therapeutic IM / IV Injection Administration",
    category: "Nursing",
    cpt: "96372",
    price: 20,
  },
  {
    id: "SVC-05",
    name: "12-Lead Diagnostic ECG Recording & Report",
    category: "Radiology / Imaging",
    cpt: "93000",
    price: 50,
  },
  {
    id: "SVC-06",
    name: "2D Transthoracic Echocardiography (Echo)",
    category: "Procedure / Surgery",
    cpt: "93306",
    price: 200,
  },
  {
    id: "SVC-07",
    name: "Bedside Focused Ultrasound Examination",
    category: "Radiology / Imaging",
    cpt: "76705",
    price: 120,
  },
  {
    id: "SVC-08",
    name: "Ear Syringing & Cerumen Removal",
    category: "Procedure / Surgery",
    cpt: "69210",
    price: 40,
  },
  {
    id: "SVC-09",
    name: "Minor Incision & Drainage (I&D)",
    category: "Procedure / Surgery",
    cpt: "10060",
    price: 90,
  },
  {
    id: "SVC-10",
    name: "STAT Glucometer Blood Sugar Test",
    category: "Laboratory",
    cpt: "82962",
    price: 20,
  },
  {
    id: "SVC-11",
    name: "IV Cannulation & Infusion Line Setup",
    category: "Nursing",
    cpt: "99505",
    price: 30,
  },
  {
    id: "SVC-12",
    name: "Foley Catheterization & Bladder Care",
    category: "Nursing",
    cpt: "51702",
    price: 50,
  },
  {
    id: "SVC-13",
    name: "Nasogastric (NG) Tube Insertion",
    category: "Nursing",
    cpt: "43752",
    price: 50,
  },
  {
    id: "SVC-14",
    name: "Plaster Slab / Splint Application",
    category: "Procedure / Surgery",
    cpt: "29125",
    price: 120,
  },
  {
    id: "SVC-15",
    name: "Foreign Body Removal (Skin / Subcutaneous)",
    category: "Procedure / Surgery",
    cpt: "10120",
    price: 150,
  },
  {
    id: "SVC-16",
    name: "Inpatient Bed Admission & Transfer Booking",
    category: "Room / Bed Charges",
    cpt: "99222",
    price: 150,
  },
]

const DOCTORS_LIST: DoctorProfile[] = [
  {
    id: "doc-1",
    name: "Dr. Arjun Mehta",
    specialty: "Cardiology",
    room: "Room 107",
  },
  {
    id: "doc-4",
    name: "Dr. Rajesh Sharma",
    specialty: "Cardiology",
    room: "Room 104",
  },
  {
    id: "doc-6",
    name: "Dr. Priya Patel",
    specialty: "Cardiology",
    room: "Room 105",
  },
  {
    id: "doc-8",
    name: "Dr. Sarah Jenkins",
    specialty: "Cardiology",
    room: "Room 102",
  },
  {
    id: "doc-5",
    name: "Dr. David Anderson",
    specialty: "Orthopedics",
    room: "Room 112",
  },
  {
    id: "doc-2",
    name: "Dr. Sanjay Kapoor",
    specialty: "Orthopedics",
    room: "Room 116",
  },
  {
    id: "doc-3",
    name: "Dr. Vikram Malhotra",
    specialty: "General Medicine",
    room: "Room 111",
  },
  {
    id: "doc-7",
    name: "Dr. Anita Desai",
    specialty: "General Medicine",
    room: "Room 101",
  },
  {
    id: "doc-9",
    name: "Dr. Ramesh Kumar",
    specialty: "General Medicine",
    room: "Room 103",
  },
  {
    id: "all",
    name: "All Doctors (Combined Hospital Queue)",
    specialty: "All Departments",
    room: "All Rooms",
  },
]

const DUMMY_PRESCRIPTION_TEMPLATES = [
  {
    id: "cardio",
    name: "🫀 Cardiology / Angina",
    dept: "Cardiology",
    diagnosis: "Acute Coronary Syndrome Rule-Out / Stable Angina",
    icd10: "I20.9",
    assessment:
      "Patient evaluated for chest tightness and dyspnea. Hemodynamically stable. Resting ECG evaluated. Cardioprotective therapy initiated.",
    medications: [
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
      {
        medicine: "Metoprolol Succinate 25mg",
        dosage: "1 tab",
        frequency: "OD (Once Daily)",
        duration: "30 days",
        instructions: "Take in the morning",
      },
      {
        medicine: "Nitroglycerin 0.4mg Sublingual",
        dosage: "1 tab",
        frequency: "PRN (As Needed)",
        duration: "10 days",
        instructions: "Dissolve under tongue for acute chest pain",
      },
    ],
    investigations: [
      "ECG 12-Lead",
      "Serum Troponin I",
      "Lipid Profile",
      "Complete Blood Count (CBC)",
    ],
    services: [
      {
        id: "svc-c1",
        name: "12-Lead Diagnostic ECG Recording & Report",
        category: "Radiology / Imaging" as const,
        cptCode: "93000",
        price: 50,
        quantity: 1,
      },
      {
        id: "svc-c2",
        name: "2D Transthoracic Echocardiography (Echo)",
        category: "Procedure / Surgery" as const,
        cptCode: "93306",
        price: 200,
        quantity: 1,
      },
    ],
    advice:
      "Avoid strenuous physical exertion. Follow strict low-sodium heart-healthy diet. Return immediately if chest discomfort radiates or intensifies.",
  },
  {
    id: "ortho",
    name: "🦴 Orthopedics / Joint Strain",
    dept: "Orthopedics",
    diagnosis: "Acute Musculoskeletal Lumbar Strain & Joint Inflammation",
    icd10: "M54.5",
    assessment:
      "Patient presents with acute joint/lumbar discomfort following physical exertion. Range of motion limited by pain. No focal neurological deficit.",
    medications: [
      {
        medicine: "Aceclofenac 100mg + Paracetamol 325mg",
        dosage: "1 tab",
        frequency: "BD (Twice Daily)",
        duration: "5 days",
        instructions: "Take after meals",
      },
      {
        medicine: "Thiocolchicoside 4mg",
        dosage: "1 cap",
        frequency: "BD (Twice Daily)",
        duration: "5 days",
        instructions: "Muscle relaxant after food",
      },
      {
        medicine: "Pantoprazole 40mg",
        dosage: "1 tab",
        frequency: "OD (Once Daily)",
        duration: "7 days",
        instructions: "Take 30 min before breakfast",
      },
      {
        medicine: "Calcium Carbonate 500mg + Vit D3",
        dosage: "1 tab",
        frequency: "OD (Once Daily)",
        duration: "30 days",
        instructions: "Take after dinner",
      },
    ],
    investigations: [
      "X-Ray Spine / Joint",
      "Serum Uric Acid",
      "Complete Blood Count (CBC)",
    ],
    services: [
      {
        id: "svc-o1",
        name: "Minor Wound Dressing & Sterile Bandaging",
        category: "Procedure / Surgery" as const,
        cptCode: "12001",
        price: 40,
        quantity: 1,
      },
    ],
    advice:
      "Rest affected area. Hot fermentation for 15 minutes twice daily. Avoid heavy lifting and sudden twisting movements.",
  },
  {
    id: "general",
    name: "🩺 General Medicine / Fever",
    dept: "General Medicine",
    diagnosis: "Acute Upper Respiratory Tract Infection with Viral Pyrexia",
    icd10: "J06.9",
    assessment:
      "Patient presents with fever, productive cough, and malaise. Pharynx congested. Bilateral air entry clear without adventitious sounds.",
    medications: [
      {
        medicine: "Paracetamol 650mg",
        dosage: "1 tab",
        frequency: "TDS (Thrice Daily)",
        duration: "5 days",
        instructions: "Take for fever > 100°F",
      },
      {
        medicine: "Azithromycin 500mg",
        dosage: "1 tab",
        frequency: "OD (Once Daily)",
        duration: "3 days",
        instructions: "Take 1 hour before food",
      },
      {
        medicine: "Levocetirizine 5mg",
        dosage: "1 tab",
        frequency: "HS (Bedtime)",
        duration: "5 days",
        instructions: "Take at night for runny nose/cough",
      },
      {
        medicine: "Vitamin C 500mg + Zinc",
        dosage: "1 tab",
        frequency: "OD (Once Daily)",
        duration: "15 days",
        instructions: "Immune support",
      },
    ],
    investigations: [
      "Complete Blood Count (CBC)",
      "C-Reactive Protein (CRP)",
      "Urine Routine & Microscopy",
    ],
    services: [
      {
        id: "svc-g1",
        name: "Therapeutic IM / IV Injection Administration",
        category: "Nursing" as const,
        cptCode: "96372",
        price: 20,
        quantity: 1,
      },
    ],
    advice:
      "Drink plenty of warm fluids. Steam inhalation twice daily. Adequate rest and return for review if fever does not subside in 48 hours.",
  },
  {
    id: "pulmo",
    name: "🫁 Pulmonology / Asthma",
    dept: "Pulmonology",
    diagnosis: "Bronchial Asthma Flare / Acute Bronchospasm",
    icd10: "J45.9",
    assessment:
      "Patient experiencing episodic breathlessness, wheezing, and nocturnal dry cough. Auscultation reveals bilateral expiratory wheeze.",
    medications: [
      {
        medicine: "Duolin Inhaler (Levosalbutamol + Ipratropium)",
        dosage: "2 puffs",
        frequency: "TDS (Thrice Daily)",
        duration: "14 days",
        instructions: "Rinse mouth after inhalation",
      },
      {
        medicine: "Montelukast 10mg + Levocetirizine 5mg",
        dosage: "1 tab",
        frequency: "HS (Bedtime)",
        duration: "14 days",
        instructions: "Take every night",
      },
      {
        medicine: "Amoxicillin + Clavulanate 625mg",
        dosage: "1 tab",
        frequency: "BD (Twice Daily)",
        duration: "5 days",
        instructions: "Take after food",
      },
    ],
    investigations: [
      "X-Ray Chest PA View",
      "Spirometry / Peak Flow",
      "Complete Blood Count (CBC)",
    ],
    services: [
      {
        id: "svc-p1",
        name: "Nebulization Protocol Therapy (Single Session)",
        category: "Procedure / Surgery" as const,
        cptCode: "94640",
        price: 30,
        quantity: 1,
      },
    ],
    advice:
      "Avoid cold exposure, dust, and pollen. Always carry rescue inhaler. Return immediately if breathlessness worsens at rest.",
  },
]

export default function DoctorWorkflow({
  onNavigateToOPWorkflow,
}: {
  onNavigateToOPWorkflow?: (encounterId?: string) => void
}) {
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorProfile>(
    DOCTORS_LIST[0],
  )
  const [encounters, setEncounters] = useState<DBOPEncounter[]>([])
  const [patients, setPatients] = useState<DBPatient[]>([])
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(
    null,
  )

  // Consultation Form State
  const [clinicalAssessment, setClinicalAssessment] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [icd10, setIcd10] = useState("")
  const [medications, setMedications] = useState<{
    medicine: string
    strength: string
    dosage: string
    frequency: string
    route: string
    duration: string
    instructions?: string
    remarks?: string
    quantity: number
  }[]>([
    {
      medicine: "Aspirin",
      strength: "81mg",
      dosage: "1 tab",
      frequency: "OD (Once Daily)",
      route: "Oral",
      duration: "30 days",
      instructions: "Take after breakfast",
      quantity: 30,
    },
    {
      medicine: "Atorvastatin",
      strength: "40mg",
      dosage: "1 tab",
      frequency: "HS (Bedtime)",
      route: "Oral",
      duration: "30 days",
      instructions: "Take at bedtime",
      quantity: 30,
    },
  ])
  const [rxMode, setRxMode] = useState<"DIGITAL" | "UPLOAD">("DIGITAL")
  const [uploadedRxImage, setUploadedRxImage] = useState<string | null>(null)
  const [patientMedHistory, setPatientMedHistory] = useState<AppPharmacyBill[]>(
    [],
  )
  const [investigations, setInvestigations] = useState<string[]>([
    "ECG 12-Lead",
    "Complete Blood Count (CBC)",
    "Serum Electrolytes",
  ])
  const [orderedServices, setOrderedServices] =
    useState<OrderedClinicalService[]>([
      {
        id: "svc-1",
        name: "12-Lead Diagnostic ECG Recording & Report",
        category: "Radiology / Imaging",
        cptCode: "93000",
        price: 350,
        quantity: 1,
      },
    ])
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    MASTER_HOSPITAL_SERVICES[0].id,
  )
  const [selectedServiceQty, setSelectedServiceQty] = useState<number>(1)

  const [advice, setAdvice] = useState(
    "Avoid strenuous physical exertion. Follow low-sodium diet. Return immediately if chest discomfort recurs.",
  )

  const [submittedAlert, setSubmittedAlert] = useState<{
    patientName: string
    umr: string
    opNumber: string
    medCount: number
    servicesCount: number
    totalAmount: number
  } | null>(null)

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = DUMMY_PRESCRIPTION_TEMPLATES.find((t) => t.id === templateId)
    if (!tmpl) return
    setDiagnosis(tmpl.diagnosis)
    setIcd10(tmpl.icd10)
    setClinicalAssessment(tmpl.assessment)
    setMedications(
      tmpl.medications.map((m) => {
        // Basic parse of dummy string
        const match = m.medicine.match(/^(.*?) (\d+mg|mcg|ml)/)
        return {
          medicine: match ? match[1] : m.medicine,
          strength: match ? match[2] : "",
          dosage: m.dosage,
          frequency: m.frequency,
          route: "Oral",
          duration: m.duration,
          instructions: m.instructions,
          quantity: parseInt(m.duration) || 10,
        }
      }),
    )
    setInvestigations(tmpl.investigations)
    if (tmpl.services) {
      setOrderedServices(
        tmpl.services.map((s, idx) => ({ ...s, id: `svc-tmpl-${idx}` })),
      )
    }
    setAdvice(tmpl.advice)
  }

  const [submitSuccess, setSubmitSuccess] = useState(false)
  const alertRef = React.useRef<HTMLDivElement>(null)

  // Sync with DB
  const refreshDb = (forceReload = false) => {
    const encs = db.getEncounters()
    const pats = db.getPatients()
    setEncounters(encs)
    setPatients(pats)

    const docQueue =
      selectedDoctor.id === "all"
        ? encs
        : encs.filter((e) => doesDoctorMatchEncounter(selectedDoctor, e))

    if (docQueue.length > 0) {
      const match =
        docQueue.find((e) => e.id === activeEncounterId) || docQueue[0]
      if (forceReload || !activeEncounterId) {
        setActiveEncounterId(match.id)
        loadEncounterData(match)
      }
    } else {
      setActiveEncounterId(null)
    }
  }

  useEffect(() => {
    setSubmittedAlert(null)
    setSubmitSuccess(false)
    refreshDb(true)
    const unsub = db.subscribe(() => {
      refreshDb(false)
    })
    return () => {
      unsub()
    }
  }, [selectedDoctor])

  const loadEncounterData = (enc: DBOPEncounter) => {
    setClinicalAssessment(
      enc.assessment ||
        `Patient presents with ${enc.chiefComplaint || enc.symptoms.join(", ") || "presenting symptoms"}. Vitals stable on evaluation.`,
    )
    setDiagnosis(
      enc.diagnosis ||
        (enc.dept === "Cardiology"
          ? "Stable Angina / Rule-out ACS"
          : "Musculoskeletal Lumbar Strain"),
    )
    setIcd10(enc.icd10 || (enc.dept === "Cardiology" ? "I20.9" : "M54.5"))
    if (enc.prescription && enc.prescription.length > 0) {
      setMedications(enc.prescription as any)
    } else {
      setMedications([])
    }
    if (enc.investigations && enc.investigations.length > 0) {
      setInvestigations(enc.investigations)
    }
    if (
      enc.services &&
      Array.isArray(enc.services) &&
      enc.services.length > 0
    ) {
      setOrderedServices(
        enc.services.map((s, idx) => ({
          id: s.id || `svc-${idx}`,
          name: s.name,
          category: (s.category || "Procedure / Surgery") as any,
          cptCode: s.cptCode || "12001",
          price: Number(s.price || 350),
          quantity: Number(s.quantity || 1),
        })),
      )
    } else {
      setOrderedServices([
        {
          id: "svc-1",
          name: "12-Lead Diagnostic ECG Recording & Report",
          category: "Radiology / Imaging",
          cptCode: "93000",
          price: 350,
          quantity: 1,
        },
      ])
    }
    if (enc.advice) {
      setAdvice(enc.advice)
    }
  }

  // Filter doctor queue strictly by assigned doctor
  const doctorQueue =
    selectedDoctor.id === "all"
      ? encounters
      : encounters.filter((e) => doesDoctorMatchEncounter(selectedDoctor, e))

  const activeEncounter =
    doctorQueue.find((e) => e.id === activeEncounterId) ||
    doctorQueue[0] ||
    null
  const activePatientRecord = activeEncounter
    ? patients.find((p) => p.umr === activeEncounter.umr)
    : null
  const previousEncounters = activeEncounter
    ? encounters.filter(
        (e) => e.umr === activeEncounter.umr && e.id !== activeEncounter.id,
      )
    : []

  const handleSelectPatient = (enc: DBOPEncounter) => {
    setSubmittedAlert(null)
    setSubmitSuccess(false)
    setActiveEncounterId(enc.id)
    loadEncounterData(enc)

    // If currently waiting, set to Under Consultation
    if (
      enc.status === "Awaiting Doctor" ||
      enc.status === "Doctor Assigned" ||
      enc.status === "In Queue"
    ) {
      db.updateEncounter(enc.id, { status: "Under Consultation" })
    }

    // Load Med History
    if (enc.umr) {
      const allBills = PharmacyDatabase.getBills()
      const ptBills = allBills.filter((b) => b.uhid === enc.umr)
      setPatientMedHistory(ptBills)
    }
  }

  const handleAddMedication = () => {
    setMedications((prev) => [
      ...prev,
      {
        medicine: "Pantoprazole",
        strength: "40mg",
        dosage: "1 tab",
        frequency: "OD",
        route: "Oral",
        duration: "14 days",
        instructions: "Before breakfast",
        quantity: 14,
      },
    ])
  }

  const handleRemoveMedication = (idx: number) => {
    setMedications((prev) => prev.filter((_, i) => i !== idx))
  }

  const toggleInvestigation = (test: string) => {
    setInvestigations((prev) =>
      prev.includes(test) ? prev.filter((t) => t !== test) : [...prev, test],
    )
  }

  // ── Clinical Services Handlers ──
  const handleAddSelectedService = () => {
    const serviceDef =
      MASTER_HOSPITAL_SERVICES.find((s) => s.id === selectedServiceId) ||
      MASTER_HOSPITAL_SERVICES[0]
    if (!serviceDef) return

    setOrderedServices((prev) => {
      const existing = prev.find((s) => s.name === serviceDef.name)
      if (existing) {
        return prev.map((s) =>
          s.name === serviceDef.name
            ? { ...s, quantity: s.quantity + selectedServiceQty }
            : s,
        )
      }
      return [
        ...prev,
        {
          id: `svc-${Date.now()}-${Math.random().toString(36).slice(-4)}`,
          name: serviceDef.name,
          category: serviceDef.category,
          cptCode: serviceDef.cpt,
          price: serviceDef.price, // Fixed hospital tariff
          quantity: selectedServiceQty,
        },
      ]
    })
    setSelectedServiceQty(1)
  }

  const handleRemoveService = (id: string) => {
    setOrderedServices((prev) => prev.filter((s) => s.id !== id))
  }

  const handleUpdateServiceQty = (id: string, delta: number) => {
    setOrderedServices((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const newQty = Math.max(1, s.quantity + delta)
          return { ...s, quantity: newQty }
        }
        return s
      }),
    )
  }

  // Submit Consultation Handler (Source of Truth)
  const handleSubmitConsultation = () => {
    if (!activeEncounter) {
      alert("No active patient selected from queue.")
      return
    }
    if (!diagnosis.trim()) {
      alert(
        "Please enter a Clinical Diagnosis before completing the consultation.",
      )
      return
    }

    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    try {
      // 1. Update clinical encounter in DB
      db.updateEncounter(activeEncounter.id, {
        assessment: clinicalAssessment,
        diagnosis: diagnosis,
        icd10: icd10,
        prescription: medications,
        investigations: investigations,
        services: orderedServices,
        advice: advice,
        status: "Consultation Completed",
        timestamps: {
          ...activeEncounter.timestamps,
          consultationEnd: nowTime,
        },
      })

      // 2. Aggregate line-item charges for Central Billing UMR Ledger
      const invoiceItems: InvoiceItem[] = [
        {
          id: `ITM-DOC-${Date.now()}`,
          description: `Specialist Outpatient Consultation (${selectedDoctor.name} - ${selectedDoctor.specialty})`,
          category: "Consultation",
          cptCode: "99205",
          quantity: 1,
          unitPrice: 100,
          total: 100,
          insuranceCovered: 80,
          patientPayable: 20,
        },
        ...orderedServices.map((svc, idx) => ({
          id: `ITM-SVC-${idx + 1}-${Date.now()}`,
          description: svc.name,
          category: svc.category,
          cptCode: svc.cptCode,
          quantity: svc.quantity,
          unitPrice: svc.price,
          total: svc.price * svc.quantity,
          insuranceCovered: Math.round(svc.price * svc.quantity * 0.8),
          patientPayable: Math.round(svc.price * svc.quantity * 0.2),
        })),
        ...investigations.map((inv, idx) => {
          const invPrice = inv.includes("MRI")
            ? 350
            : inv.includes("Ultrasound")
              ? 100
              : inv.includes("ECG")
                ? 50
                : inv.includes("X-Ray")
                  ? 60
                  : 50
          return {
            id: `ITM-INV-${idx + 1}-${Date.now()}`,
            description: `Diagnostic Investigation: ${inv}`,
            category: (inv.includes("MRI") ||
            inv.includes("X-Ray") ||
            inv.includes("Ultrasound")
              ? "Radiology / Imaging"
              : "Laboratory") as any,
            cptCode: inv.includes("MRI")
              ? "70551"
              : inv.includes("ECG")
                ? "93000"
                : "80050",
            quantity: 1,
            unitPrice: invPrice,
            total: invPrice,
            insuranceCovered: Math.round(invPrice * 0.8),
            patientPayable: Math.round(invPrice * 0.2),
          }
        }),
      ]

      const servicesTotal = invoiceItems.reduce((acc, it) => acc + it.total, 0)

      // 3. Create active Invoice directly in Central Billing POS Cashier Desk
      const createdClaim = BillingDatabase.createClaim({
        patientId: activeEncounter.umr,
        mrn: activeEncounter.umr.replace(/\D/g, "") || "10001",
        patientName: activeEncounter.patientName,
        age: activeEncounter.age,
        gender: activeEncounter.sex as any,
        phone: activePatientRecord?.phone || "+91 98765 43210",
        encounterId: activeEncounter.id,
        department: "Outpatient",
        carePathway: `OP Consultation & Procedures (${activeEncounter.dept || selectedDoctor.specialty})`,
        dateOfService: new Date().toISOString().split("T")[0],
        insuranceProvider:
          (activePatientRecord as any)?.insurance || "Self-Pay",
        attendingDoctor: selectedDoctor.name,
        diagnosisCodes: [icd10 || "I20.9"],
        items: invoiceItems,
        status: "Accepted",
        finalizedByNurse: "Nurse Lead (OPD)",
      })

      // 4. Update Department Charge record as Invoiced in Central Billing
      BillingDatabase.createDepartmentCharge({
        patientId: activeEncounter.umr,
        mrn: activeEncounter.umr.replace(/\D/g, "") || "10001",
        patientName: activeEncounter.patientName,
        age: activeEncounter.age,
        gender: activeEncounter.sex as any,
        phone: activePatientRecord?.phone || "+91 98765 43210",
        encounterId: activeEncounter.id,
        department: "Outpatient",
        carePathway: `OP Consultation & Procedures (${activeEncounter.dept || selectedDoctor.specialty})`,
        dateOfService: new Date().toISOString().split("T")[0],
        insuranceProvider:
          (activePatientRecord as any)?.insurance || "Self-Pay",
        attendingDoctor: selectedDoctor.name,
        diagnosisCodes: [icd10 || "I20.9"],
        items: invoiceItems,
        subtotal: servicesTotal,
        totalAmount: servicesTotal,
        status: "Invoiced in Central Billing",
        invoiceId: createdClaim.id,
        verifiedByNurse: "Nurse Lead (OPD)",
        notes: `Clinical consultation finalized by ${selectedDoctor.name}. Sent directly to Central Billing as Invoice ${createdClaim.invoiceNo} (Total: ₹${servicesTotal}).`,
      })

      // Create Pharmacy Prescription
      const rxId = "RX-" + Math.floor(100000 + Math.random() * 900000)
      let rxItems: AppPrescriptionItem[] = []
      let source: PrescriptionSource = "DIGITAL"
      let status: any = "Sent To Pharmacy"

      if (rxMode === "DIGITAL") {
        const validMeds = medications.filter(
          (m) => m && typeof m.medicine === "string" && m.medicine.trim().length > 0,
        )
        if (validMeds.length > 0) {
          rxItems = validMeds.map((m, idx) => ({
            id: `RX-ITEM-${idx + 1}`,
            medicineName: m.medicine.trim(),
            strength: m.strength || "",
            dosage: m.dosage || "1 dose",
            frequency: m.frequency || "OD",
            duration: m.duration || "5 days",
            route: m.route || "Oral",
            instructions: m.instructions || "",
            remarks: m.remarks || "",
            quantity: Number(m.quantity) > 0 ? Number(m.quantity) : 1,
            substitutionAllowed: true,
          }))
        } else {
          rxItems = [
            {
              id: "RX-ITEM-1",
              medicineName: "Doctor Prescription Order",
              dosage: "As directed",
              duration: "5 days",
              quantity: 1,
              substitutionAllowed: true,
              instructions: advice || clinicalAssessment || "Consultation prescription order",
            },
          ]
        }
      } else {
        source = "UPLOADED_IMAGE"
        status = "OCR Processing"
        rxItems = [
          {
            id: "RX-ITEM-1",
            medicineName: "Uploaded Rx Sheet (Verify Image)",
            dosage: "As written on sheet",
            duration: "As written",
            quantity: 1,
            substitutionAllowed: false,
            instructions: advice || "Prescription uploaded as scanned image. Review attached sheet before dispensing.",
          },
        ]
      }

      const nowIso = new Date().toISOString()
      const rxDate = nowIso.split("T")[0]
      const rxArrival = activeEncounter.registrationTime || new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })

      const rx: AppPrescription = {
        id: rxId,
        patientId: activeEncounter.umr,
        patientName: activeEncounter.patientName,
        uhid: activeEncounter.umr,
        age: activeEncounter.age,
        gender: activeEncounter.sex,
        visitId: activeEncounter.opNumber,
        doctorId: selectedDoctor.id,
        doctorName: selectedDoctor.name,
        department: activeEncounter.dept || selectedDoctor.specialty,
        diagnosis: diagnosis,
        date: rxDate,
        arrivalTime: rxArrival,
        sourceType: source,
        priority: "Normal",
        status: status,
        dispensingStatus: "Waiting",
        imageUrl: uploadedRxImage || undefined,
        items: rxItems,
        verificationNotes: `Clinical consultation prescription finalized by ${selectedDoctor.name} (${selectedDoctor.specialty}) for visit ${activeEncounter.opNumber}. Diagnosis: ${diagnosis || "Clinical assessment completed"}.`,
        createdAt: nowIso,
      }

      const existingRx = PharmacyDatabase.getPrescriptions()
      PharmacyDatabase.savePrescriptions([
        rx,
        ...existingRx.filter((p) => p.id !== rx.id),
      ])

      // Instant cross-tab and in-tab notification for Pharmacy department
      try {
        window.dispatchEvent(
          new CustomEvent("hospai_pharmacy_toast", {
            detail: {
              type: "info",
              message: `New prescription ${rxId} received for ${activeEncounter.patientName} (${rxItems.length} items)`,
            },
          }),
        )
      } catch {}

      AuditDatabase.logEvent(
        "Prescription Created",
        "Clinical",
        `Doctor created prescription ${rxId} for patient ${activeEncounter.patientName}`,
        "Success",
        selectedDoctor.id,
        selectedDoctor.name,
      )

      setSubmittedAlert({
        patientName: activeEncounter.patientName,
        umr: activeEncounter.umr,
        opNumber: activeEncounter.opNumber,
        medCount: rxMode === "DIGITAL" ? medications.length : 1,
        servicesCount: orderedServices.length,
        totalAmount: servicesTotal,
      })
      setSubmitSuccess(true)

      setTimeout(() => {
        alertRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 50)
    } catch (err: any) {
      console.error("Failed to submit consultation:", err)
      alert(`Error saving consultation: ${err?.message || "Please try again."}`)
    }
  }

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = (uploadEvent) => {
        const rawDataUrl = uploadEvent.target?.result as string
        if (!rawDataUrl) return

        // Compress image via canvas to prevent localStorage quota exhaustion
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          let width = img.width
          let height = img.height
          const maxDim = 1200
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width)
              width = maxDim
            } else {
              width = Math.round((width * maxDim) / height)
              height = maxDim
            }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            const compressed = canvas.toDataURL("image/jpeg", 0.75)
            setUploadedRxImage(compressed)
          } else {
            setUploadedRxImage(rawDataUrl)
          }
        }
        img.onerror = () => {
          setUploadedRxImage(rawDataUrl)
        }
        img.src = rawDataUrl
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="flex-1 flex flex-col lg:h-full bg-[#F0F2F5] lg:overflow-hidden">
      {/* ── TOP DOCTOR PORTAL HEADER ── */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1E3A8A] to-[#1B4FD8] text-white flex items-center justify-center text-lg font-bold shadow-xs">
            👨‍⚕️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900">
                Doctor Portal &amp; Consultation Workspace
              </h1>
              <span className="text-[10px] font-mono font-bold bg-blue-100 text-[#1B4FD8] px-2 py-0.5 rounded border border-blue-200 uppercase">
                Clinical Authority
              </span>
            </div>
            <p className="text-[12px] text-[#64748B]">
              Primary clinical data-entry portal · All consultation records link
              to permanent UMR + OP Number.
            </p>
          </div>
        </div>

        {/* Doctor Switch Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#CBD5E1] px-3 py-1.5 rounded-xl">
            <span className="text-[11.5px] font-semibold text-[#64748B]">
              Logged in as:
            </span>
            <select
              value={selectedDoctor.name}
              onChange={(e) => {
                const doc = DOCTORS_LIST.find((d) => d.name === e.target.value)
                if (doc) {
                  setSelectedDoctor(doc)
                  const matchingEnc =
                    doc.id === "all"
                      ? encounters[0]
                      : encounters.find(
                          (enc) =>
                            enc.assignedDoctor === doc.name ||
                            enc.dept === doc.specialty,
                        )
                  if (matchingEnc) {
                    setActiveEncounterId(matchingEnc.id)
                    loadEncounterData(matchingEnc)
                  } else {
                    setActiveEncounterId(null)
                  }
                }
              }}
              className="text-[12.5px] font-bold text-gray-900 bg-transparent focus:outline-none cursor-pointer"
            >
              {DOCTORS_LIST.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} ({d.specialty} · {d.room})
                </option>
              ))}
            </select>
          </div>

          {onNavigateToOPWorkflow && (
            <button
              type="button"
              onClick={() => onNavigateToOPWorkflow(activeEncounter?.id)}
              className="px-3.5 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] text-[#1B4FD8] text-[12px] font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>📋</span> OP Journey Summary →
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN WORKSPACE ── */}
      {/* Below lg the queue stacks above the consultation (capped height) and
        the page scrolls as one column. */}
      <div className="flex-1 lg:overflow-hidden p-5 flex flex-col lg:flex-row gap-5 w-full">
        {/* ── LEFT COLUMN: DOCTOR'S LIVE QUEUE ── */}
        <div className="w-full lg:w-80 max-h-[55dvh] lg:max-h-none flex flex-col gap-4 flex-shrink-0 min-h-0">
          <div className="bg-white border border-[#DDE2EC] rounded shadow-xs flex flex-col h-full min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#DDE2EC] bg-[#F8FAFC] flex justify-between items-center">
              <div>
                <h2 className="text-[13px] font-bold text-gray-900">
                  My Consultation Queue
                </h2>
                <div className="text-[11px] text-[#64748B]">
                  {selectedDoctor.specialty} · {selectedDoctor.room}
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold bg-[#DBEAFE] text-[#1B4FD8] px-2 py-0.5 rounded">
                {doctorQueue.length} Patients
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9] p-2 space-y-1.5">
              {doctorQueue.length === 0 ? (
                <div className="p-6 text-center text-gray-500 space-y-2">
                  <div className="text-3xl">☕</div>
                  <div className="text-[13px] font-bold text-gray-700">
                    No Patients in Queue
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    No patients currently assigned to {selectedDoctor.name}.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const allDoc = DOCTORS_LIST.find((d) => d.id === "all")
                      if (allDoc) setSelectedDoctor(allDoc)
                    }}
                    className="mt-2 text-[11.5px] font-semibold text-[#1B4FD8] bg-blue-50 px-3 py-1 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    View All Hospital Patients →
                  </button>
                </div>
              ) : (
                doctorQueue.map((enc, idx) => {
                  const isSelected = activeEncounter?.id === enc.id
                  const isCompleted =
                    enc.status === "Consultation Completed" ||
                    enc.status === "OP Completed"
                  return (
                    <div
                      key={enc.id}
                      onClick={() => handleSelectPatient(enc)}
                      className={`p-3 rounded cursor-pointer transition-all border ${
                        isSelected
                          ? "bg-[#EFF6FF] border-[#1B4FD8] ring-2 ring-blue-500/20 shadow-xs"
                          : "bg-white border-[#E2E8F0] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-[11px] font-bold text-[#1B4FD8] bg-blue-50 px-1.5 py-0.5 rounded">
                          #{idx + 1} · {enc.queueToken || enc.opNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isCompleted
                              ? "bg-green-100 text-[#15803D]"
                              : enc.status === "Under Consultation"
                                ? "bg-blue-100 text-[#1D4ED8] animate-pulse"
                                : "bg-amber-100 text-[#B45309]"
                          }`}
                        >
                          {isCompleted
                            ? "Completed"
                            : enc.status === "Under Consultation"
                              ? "In Consult"
                              : "Waiting"}
                        </span>
                      </div>
                      <div className="font-bold text-[13px] text-gray-900">
                        {enc.patientName}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {enc.age} yrs · {enc.sex} · UMR: {enc.umr}
                      </div>
                      {enc.assignedDoctor && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                          <span>👨‍⚕️</span> {enc.assignedDoctor} ({enc.dept})
                        </div>
                      )}
                      <div className="text-[11px] text-gray-600 truncate mt-1 bg-white/80 p-1 rounded border border-gray-200">
                        {enc.chiefComplaint ||
                          enc.symptoms.join(", ") ||
                          "OP Consultation"}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: PRIMARY CLINICAL CONSULTATION FORM ── */}
        <div className="flex-1 flex flex-col gap-4 lg:overflow-y-auto pr-1 min-w-0">
          {activeEncounter ? (
            <div className="space-y-4">
              {/* Submission Success Alert */}
              {submittedAlert && (
                <div
                  ref={alertRef}
                  className="bg-[#F0FDF4] border-2 border-[#86EFAC] rounded p-4.5 text-center space-y-2 shadow-sm animate-in fade-in"
                >
                  <div className="text-xl">✓</div>
                  <div className="text-[15px] font-bold text-[#166534]">
                    Consultation &amp; Services Submitted Successfully!
                  </div>
                  <p className="text-[12px] text-[#15803D]">
                    Consultation recorded and linked to permanent{" "}
                    <strong>{submittedAlert.umr}</strong> (Visit OP No:{" "}
                    <strong>{submittedAlert.opNumber}</strong>). Included{" "}
                    <strong>{submittedAlert.medCount} Rx medications</strong>,{" "}
                    <strong>
                      {submittedAlert.servicesCount} clinical services &amp;
                      procedures
                    </strong>
                    , and auto-generated{" "}
                    <strong>
                      ₹{submittedAlert.totalAmount?.toLocaleString("en-IN")}
                    </strong>{" "}
                    in Department Charges linked to Central Billing ledger.
                  </p>
                  {onNavigateToOPWorkflow && (
                    <button
                      type="button"
                      onClick={() => onNavigateToOPWorkflow(activeEncounter.id)}
                      className="px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-[12px] font-bold rounded shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer mt-1"
                    >
                      <span>📋</span> View Summary in OP Clinical Journey →
                    </button>
                  )}
                </div>
              )}

              {/* 1. Patient Information & Current Complaints Card */}
              <div className="bg-white border border-[#CBD5E1] rounded p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-blue-100 text-[#1B4FD8] flex items-center justify-center font-bold text-base">
                      {activeEncounter.patientName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-[16px] text-gray-900 flex items-center gap-2">
                        <span>{activeEncounter.patientName}</span>
                        <span className="text-[12px] text-[#64748B] font-normal">
                          ({activeEncounter.age} yrs, {activeEncounter.sex})
                        </span>
                      </div>
                      <div className="text-[12px] text-[#64748B] flex items-center gap-2 mt-0.5">
                        <span>
                          Permanent UMR:{" "}
                          <strong className="text-gray-900 font-mono">
                            {activeEncounter.umr}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Visit OP No:{" "}
                          <strong className="text-[#1B4FD8] font-mono">
                            {activeEncounter.opNumber}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-mono font-bold bg-blue-50 text-[#1B4FD8] border border-blue-200 px-2.5 py-1 rounded">
                      Token:{" "}
                      {activeEncounter.queueToken || activeEncounter.opNumber}
                    </span>
                    <span
                      className={`text-[11.5px] font-semibold px-2.5 py-1 rounded ${
                        activeEncounter.status === "Consultation Completed"
                          ? "bg-green-100 text-[#15803D]"
                          : "bg-amber-100 text-[#B45309]"
                      }`}
                    >
                      {activeEncounter.status}
                    </span>
                  </div>
                </div>

                {/* Chief Complaints & Presenting Symptoms */}
                <div className="bg-[#F8FAFC] p-3.5 rounded border border-[#E2E8F0] text-[12.5px] space-y-1">
                  <div className="text-[11px] uppercase font-bold text-[#64748B] tracking-wider">
                    Chief Complaint / Triage Narrative
                  </div>
                  <div className="text-gray-800 font-medium">
                    {activeEncounter.chiefComplaint ||
                      "Routine consultation requested."}
                  </div>
                  {activeEncounter.symptoms &&
                    activeEncounter.symptoms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {activeEncounter.symptoms.map((s) => (
                          <span
                            key={s}
                            className="text-[11px] bg-blue-50 text-[#1B4FD8] px-2 py-0.5 rounded font-medium border border-blue-200"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              </div>

              {/* 2. Previous Patient History (Read-Only Preview from permanent UMR) */}
              <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded p-4.5 space-y-2.5 shadow-2xs">
                <div className="flex justify-between items-center">
                  <div className="text-[12.5px] font-bold text-gray-900 flex items-center gap-1.5">
                    <span>📜</span> Previous OP History (Permanent UMR:{" "}
                    {activeEncounter.umr})
                  </div>
                  <span className="text-[11px] font-mono font-bold text-[#1B4FD8]">
                    {previousEncounters.length} Previous Encounters
                  </span>
                </div>

                {previousEncounters.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
                    {previousEncounters.map((pe) => (
                      <div
                        key={pe.id}
                        className="bg-white p-3 rounded border border-[#E2E8F0] shadow-2xs"
                      >
                        <div className="flex justify-between items-start font-bold">
                          <span className="text-[#1B4FD8] font-mono">
                            {pe.opNumber}
                          </span>
                          <span className="text-gray-500 font-normal text-[11px]">
                            {pe.registrationTime}
                          </span>
                        </div>
                        <div className="text-gray-800 font-medium mt-1 truncate">
                          Diagnosis: {pe.diagnosis || "General Evaluation"}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          Attending: {pe.assignedDoctor || "Physician"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11.5px] text-[#64748B] italic bg-white p-2.5 rounded border border-[#E2E8F0]">
                    First outpatient visit for this permanent UMR. No previous
                    historical encounters.
                  </div>
                )}
              </div>

              {/* Medication History */}
              <div className="bg-[#FFFBEB] border border-[#FCD34D] rounded p-4.5 space-y-2.5 shadow-2xs">
                <div className="flex justify-between items-center">
                  <div className="text-[12.5px] font-bold text-gray-900 flex items-center gap-1.5">
                    <span>💊</span> Patient Medication History (Pharmacy
                    Records)
                  </div>
                </div>
                {patientMedHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse bg-white border border-[#FDE68A]">
                      <thead className="bg-[#FEF3C7] text-gray-800">
                        <tr>
                          <th className="p-2 border-b border-r border-[#FDE68A]">
                            Date
                          </th>
                          <th className="p-2 border-b border-r border-[#FDE68A]">
                            Medicine
                          </th>
                          <th className="p-2 border-b border-r border-[#FDE68A]">
                            Quantity Dispensed
                          </th>
                          <th className="p-2 border-b border-r border-[#FDE68A]">
                            Batch
                          </th>
                          <th className="p-2 border-b border-[#FDE68A]">
                            Pharmacist
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientMedHistory.map((b) =>
                          b.items?.map((item: any, i: number) => (
                            <tr
                              key={`${b.id}-${item.medicineId || i}`}
                              className="border-b border-[#FDE68A]"
                            >
                              <td className="p-2 border-r border-[#FDE68A]">
                                {new Date(b.createdAt).toLocaleDateString()}
                              </td>
                              <td className="p-2 border-r border-[#FDE68A] font-semibold">
                                {item.medicineName}
                              </td>
                              <td className="p-2 border-r border-[#FDE68A]">
                                {item.quantity}
                              </td>
                              <td className="p-2 border-r border-[#FDE68A] font-mono">
                                {item.batchNumber}
                              </td>
                              <td className="p-2">{b.createdBy}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-[11px] text-[#92400E] italic bg-white p-2.5 rounded border border-[#FDE68A]">
                    No past dispensed medications found in Pharmacy records for
                    this patient.
                  </div>
                )}
              </div>

              {/* 2. Nurse-Recorded Vital Signs (Pre-Consultation Assessment) */}
              <div className="bg-white border-2 border-[#93C5FD] rounded p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded bg-blue-100 text-[#1B4FD8] flex items-center justify-center font-bold text-lg">
                      🩺
                    </div>
                    <div>
                      <h3 className="text-[14.5px] font-bold text-gray-900 flex items-center gap-2">
                        Pre-Consultation Nurse Vital Signs
                      </h3>
                      <p className="text-[11.5px] text-[#64748B]">
                        Verified physiological vitals recorded by nursing triage
                        prior to physician examination.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-green-50 text-[#166534] border border-green-200 px-2.5 py-1 rounded flex items-center gap-1 self-start sm:self-auto">
                    <span>✓</span> Verified by Nursing Triage
                  </span>
                </div>

                {/* Vitals Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[12px]">
                  <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded">
                    <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                      Blood Pressure
                    </span>
                    <span className="text-[16px] font-mono font-bold text-gray-900 block mt-0.5">
                      {activeEncounter.vitals?.bp || "120/80 mmHg"}
                    </span>
                    <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded inline-block mt-1">
                      Recorded BP
                    </span>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded">
                    <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                      Heart Rate / Pulse
                    </span>
                    <span className="text-[16px] font-mono font-bold text-gray-900 block mt-0.5">
                      {activeEncounter.vitals?.pulse || "76 bpm"}
                    </span>
                    <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded inline-block mt-1">
                      Pulse Rate
                    </span>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded">
                    <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                      Temperature
                    </span>
                    <span className="text-[16px] font-mono font-bold text-gray-900 block mt-0.5">
                      {activeEncounter.vitals?.temp || "98.6 °F"}
                    </span>
                    <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded inline-block mt-1">
                      Body Temp
                    </span>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded">
                    <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                      Oxygen SpO2
                    </span>
                    <span className="text-[16px] font-mono font-bold text-gray-900 block mt-0.5">
                      {activeEncounter.vitals?.spo2 || "99%"}
                    </span>
                    <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded inline-block mt-1">
                      Room Air
                    </span>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded">
                    <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                      Body Weight
                    </span>
                    <span className="text-[16px] font-mono font-bold text-gray-900 block mt-0.5">
                      {activeEncounter.vitals?.weight || "74 kg"}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-1">
                      Triage Weight
                    </span>
                  </div>
                </div>

                {/* Nurse Triage Observation Notes */}
                {activeEncounter.vitals?.notes && (
                  <div className="bg-[#F0FDF4] border border-green-200 p-3 rounded text-[12px] text-[#166534] flex items-center gap-2">
                    <span className="font-bold">
                      👩‍⚕️ Nurse Assessment Note:
                    </span>
                    <span>{activeEncounter.vitals.notes}</span>
                  </div>
                )}
              </div>

              {/* 3. Clinical Consultation Form Pad */}
              <div className="bg-white border-2 border-[#93C5FD] rounded p-6 space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                      <span>🩺</span> Clinical Examination &amp; Consultation
                    </h3>
                    <p className="text-[12px] text-[#64748B]">
                      Enter diagnosis, prescribed medications, diagnostic
                      orders, and advice.
                    </p>
                  </div>
                  <span className="text-[10.5px] font-mono font-bold bg-blue-100 text-[#1B4FD8] px-2.5 py-1 rounded border border-blue-200 uppercase self-start sm:self-auto">
                    Live Rx Pad
                  </span>
                </div>

                {/* 1-Click Dummy / Clinical Presets */}
                <div className="bg-blue-50/70 border border-blue-200 rounded p-3.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-[11.5px] font-bold text-[#1E3A8A] flex items-center gap-1.5">
                      <span>⚡</span> Quick Load Prescription &amp; Clinical
                      Order Template:
                    </span>
                    <span className="text-[10px] text-[#64748B] font-medium">
                      1-Click to pre-fill dummy Rx &amp; Diagnosis
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {DUMMY_PRESCRIPTION_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl.id)}
                        className="px-3 py-1.5 bg-white hover:bg-blue-50 border border-[#93C5FD] hover:border-[#1B4FD8] text-[#1B4FD8] text-[11.5px] font-bold rounded shadow-2xs transition-all hover:scale-[1.02] cursor-pointer flex items-center gap-1"
                      >
                        {tmpl.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clinical Assessment */}
                <div>
                  <label className="text-[12px] font-bold text-gray-800 block mb-1">
                    Clinical Assessment Notes
                  </label>
                  <textarea
                    rows={2}
                    value={clinicalAssessment}
                    onChange={(e) => setClinicalAssessment(e.target.value)}
                    placeholder="Enter objective assessment, examination findings, and clinical reasoning..."
                    className="w-full border border-[#CBD5E1] rounded p-3 text-[13px] text-gray-900 focus:outline-none focus:border-[#1B4FD8] bg-white font-medium"
                  />
                </div>

                {/* Diagnosis & ICD-10 Code */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12px] font-bold text-gray-800 block mb-1">
                      Clinical Diagnosis <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={diagnosis}
                      onChange={setDiagnosis}
                      placeholder="e.g. Stable Angina / Acute Coronary Syndrome Rule-Out"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-gray-800 block mb-1">
                      ICD-10 Code
                    </label>
                    <Input
                      value={icd10}
                      onChange={setIcd10}
                      placeholder="e.g. I20.9"
                    />
                  </div>
                </div>

                {/* Prescribed Medications Pad */}
                <div className="space-y-3 pt-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[12px] font-bold text-gray-800">
                      Prescription Entry
                    </label>
                    <div className="flex items-center bg-[#F1F5F9] rounded p-1">
                      <button
                        type="button"
                        onClick={() => setRxMode("DIGITAL")}
                        className={`px-3 py-1 text-[11px] font-bold rounded transition-colors ${
                          rxMode === "DIGITAL"
                            ? "bg-white text-[#1B4FD8] shadow-sm"
                            : "text-[#64748B]"
                        }`}
                      >
                        Digital Entry
                      </button>
                      <button
                        type="button"
                        onClick={() => setRxMode("UPLOAD")}
                        className={`px-3 py-1 text-[11px] font-bold rounded transition-colors ${
                          rxMode === "UPLOAD"
                            ? "bg-white text-[#1B4FD8] shadow-sm"
                            : "text-[#64748B]"
                        }`}
                      >
                        Upload Image
                      </button>
                    </div>
                  </div>

                  {rxMode === "DIGITAL" ? (
                    <div className="space-y-2.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleAddMedication}
                          className="text-[11px] font-semibold bg-blue-50 text-[#1B4FD8] px-2 py-1 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          + Add Medicine
                        </button>
                      </div>
                      {medications.map((med, idx) => (
                        <div
                          key={idx}
                          className="bg-[#F8FAFC] border border-[#CBD5E1] rounded p-3 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-start text-[12px]"
                        >
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                              Medicine Name
                            </span>
                            <input
                              value={med.medicine}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((m, i) =>
                                    i === idx
                                      ? { ...m, medicine: e.target.value }
                                      : m,
                                  ),
                                )
                              }
                              className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:border-[#1B4FD8]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                              Strength
                            </span>
                            <input
                              value={med.strength}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((m, i) =>
                                    i === idx
                                      ? { ...m, strength: e.target.value }
                                      : m,
                                  ),
                                )
                              }
                              className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                              Dosage
                            </span>
                            <input
                              value={med.dosage}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((m, i) =>
                                    i === idx
                                      ? { ...m, dosage: e.target.value }
                                      : m,
                                  ),
                                )
                              }
                              className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                              Frequency
                            </span>
                            <input
                              value={med.frequency}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((m, i) =>
                                    i === idx
                                      ? { ...m, frequency: e.target.value }
                                      : m,
                                  ),
                                )
                              }
                              className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                              Duration
                            </span>
                            <input
                              value={med.duration}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((m, i) =>
                                    i === idx
                                      ? { ...m, duration: e.target.value }
                                      : m,
                                  ),
                                )
                              }
                              className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                              Route
                            </span>
                            <input
                              value={med.route}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((m, i) =>
                                    i === idx
                                      ? { ...m, route: e.target.value }
                                      : m,
                                  ),
                                )
                              }
                              className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                              Instructions
                            </span>
                            <input
                              value={med.instructions || ""}
                              onChange={(e) =>
                                setMedications((prev) =>
                                  prev.map((m, i) =>
                                    i === idx
                                      ? { ...m, instructions: e.target.value }
                                      : m,
                                  ),
                                )
                              }
                              className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                                Total Qty
                              </span>
                              <input
                                type="number"
                                value={med.quantity}
                                onChange={(e) =>
                                  setMedications((prev) =>
                                    prev.map((m, i) =>
                                      i === idx
                                        ? {
                                            ...m,
                                            quantity:
                                              parseInt(e.target.value) || 0,
                                          }
                                        : m,
                                    ),
                                  )
                                }
                                className="w-full bg-white border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8]"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMedication(idx)}
                              className="text-red-500 hover:text-red-700 p-1 rounded bg-red-50 border border-red-200 mt-3.5 cursor-pointer"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#F8FAFC] border-2 border-dashed border-[#CBD5E1] rounded-xl p-8 text-center flex flex-col items-center justify-center">
                      <span className="text-4xl mb-3">📸</span>
                      <h4 className="text-[14px] font-bold text-gray-900">
                        Upload Handwritten Prescription
                      </h4>
                      <p className="text-[12px] text-[#64748B] mb-4 max-w-sm">
                        Upload an image of a handwritten prescription. The
                        Pharmacy will use OCR AI to extract the contents.
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImage}
                        className="block w-full text-[12px] text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-[#1B4FD8] hover:file:bg-blue-100"
                      />
                      {uploadedRxImage && (
                        <div className="mt-4 p-2 border border-gray-300 bg-white rounded shadow-sm">
                          <img
                            src={uploadedRxImage}
                            alt="Uploaded Rx"
                            className="max-h-40 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Investigations / Diagnostic Orders */}
                <div className="space-y-2 pt-1">
                  <label className="text-[12px] font-bold text-gray-800 block">
                    Diagnostic Investigations &amp; Lab Orders
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "ECG 12-Lead",
                      "Complete Blood Count (CBC)",
                      "Serum Electrolytes",
                      "X-Ray Chest PA",
                      "MRI Spine / Joint",
                      "Lipid Profile",
                      "Ultrasound Abdomen",
                      "Blood Sugar Fasting",
                    ].map((test) => {
                      const isChecked = investigations.includes(test)
                      return (
                        <button
                          key={test}
                          type="button"
                          onClick={() => toggleInvestigation(test)}
                          className={`px-3 py-1.5 rounded text-[12px] font-semibold border transition-all cursor-pointer ${
                            isChecked
                              ? "bg-[#1B4FD8] text-white border-[#1B4FD8] shadow-xs"
                              : "bg-white text-gray-700 border-[#CBD5E1] hover:bg-[#F8FAFC]"
                          }`}
                        >
                          {isChecked ? "✓ " : "+ "} {test}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* ── Clinical Services & Bedside Procedures (Add Services with Fixed Tariff) ── */}
                <div className="space-y-3 pt-3 border-t border-[#E2E8F0]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
                          <span>⚡</span> Clinical Services &amp; Bedside
                          Procedures
                        </span>
                        <span className="text-[10.5px] font-bold bg-blue-100 text-[#1B4FD8] px-2 py-0.5 rounded border border-blue-200">
                          {orderedServices.length} Attached
                        </span>
                      </div>
                      <p className="text-[11.5px] text-[#64748B]">
                        Select hospital clinical service / procedure to order.
                        Fixed hospital tariffs and CPT codes are applied
                        automatically.
                      </p>
                    </div>
                  </div>

                  {/* Add Service Selector Bar (Fixed Tariffs) */}
                  <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded p-3.5 flex flex-col sm:flex-row items-stretch sm:items-end gap-3 shadow-2xs">
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">
                        Select Hospital Service / Procedure (Fixed Tariff)
                      </label>
                      <select
                        value={selectedServiceId}
                        onChange={(e) => setSelectedServiceId(e.target.value)}
                        className="w-full bg-white border border-[#CBD5E1] rounded px-3 py-2 text-[12.5px] font-semibold text-gray-900 focus:outline-none focus:border-[#1B4FD8] cursor-pointer shadow-2xs"
                      >
                        {MASTER_HOSPITAL_SERVICES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.category} · CPT {s.cpt}) — ₹
                            {s.price.toLocaleString("en-IN")}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-24">
                      <label className="text-[11px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider text-center">
                        Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={selectedServiceQty}
                        onChange={(e) =>
                          setSelectedServiceQty(
                            Math.max(1, Number(e.target.value) || 1),
                          )
                        }
                        className="w-full bg-white border border-[#CBD5E1] rounded px-2.5 py-2 text-[12.5px] font-mono font-bold text-gray-900 text-center focus:outline-none focus:border-[#1B4FD8]"
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={handleAddSelectedService}
                        className="w-full sm:w-auto px-5 py-2 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-bold rounded shadow-xs hover:shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap h-[38px]"
                      >
                        <span>+</span> Add Service
                      </button>
                    </div>
                  </div>

                  {/* Live Itemized Table of Ordered Services */}
                  {orderedServices.length > 0 ? (
                    <div className="bg-white border border-[#CBD5E1] rounded overflow-hidden shadow-2xs">
                      <table className="w-full text-left border-collapse text-[12px]">
                        <thead>
                          <tr className="bg-[#F8FAFC] border-b border-[#CBD5E1] text-[#64748B] text-[10.5px] uppercase font-bold tracking-wider">
                            <th className="py-2 px-3">
                              Service / Procedure Description
                            </th>
                            <th className="py-2 px-2.5">Category</th>
                            <th className="py-2 px-2.5">CPT Code</th>
                            <th className="py-2 px-2.5 text-right">
                              Fixed Rate
                            </th>
                            <th className="py-2 px-2.5 text-center">Qty</th>
                            <th className="py-2 px-2.5 text-right">
                              Total (₹)
                            </th>
                            <th className="py-2 px-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {orderedServices.map((svc) => (
                            <tr
                              key={svc.id}
                              className="hover:bg-blue-50/40 transition-colors"
                            >
                              <td className="py-2 px-3 font-semibold text-gray-900">
                                {svc.name}
                              </td>
                              <td className="py-2 px-2.5">
                                <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
                                  {svc.category}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 font-mono text-[11px] text-gray-600">
                                {svc.cptCode}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-gray-800">
                                ₹{svc.price.toLocaleString("en-IN")}
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                <div className="inline-flex items-center border border-[#CBD5E1] rounded bg-white overflow-hidden shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateServiceQty(svc.id, -1)
                                    }
                                    className="px-1.5 py-0.5 hover:bg-gray-100 text-gray-700 font-bold cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="px-2 text-[11.5px] font-mono font-bold text-gray-900">
                                    {svc.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateServiceQty(svc.id, 1)
                                    }
                                    className="px-1.5 py-0.5 hover:bg-gray-100 text-gray-700 font-bold cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-[#1B4FD8]">
                                ₹
                                {(svc.price * svc.quantity).toLocaleString(
                                  "en-IN",
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveService(svc.id)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 text-xs cursor-pointer"
                                  title="Remove service"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-bold text-[12px]">
                            <td
                              colSpan={5}
                              className="py-2.5 px-3 text-right text-[#64748B]"
                            >
                              Services Subtotal (
                              {orderedServices.reduce(
                                (a, b) => a + b.quantity,
                                0,
                              )}{" "}
                              items):
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono text-[13px] font-bold text-[#166534]">
                              ₹
                              {orderedServices
                                .reduce(
                                  (sum, s) => sum + s.price * s.quantity,
                                  0,
                                )
                                .toLocaleString("en-IN")}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded p-4 text-center text-[#64748B] text-[12px] space-y-1">
                      <div className="font-semibold text-gray-700">
                        No clinical services attached yet
                      </div>
                      <div className="text-[11px]">
                        Select a service from the dropdown above and click
                        &ldquo;+ Add Service&rdquo;.
                      </div>
                    </div>
                  )}
                </div>

                {/* Doctor Advice & Instructions */}
                <div>
                  <label className="text-[12px] font-bold text-gray-800 block mb-1">
                    Doctor Advice &amp; Lifestyle Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={advice}
                    onChange={(e) => setAdvice(e.target.value)}
                    placeholder="Enter lifestyle recommendations, follow-up timeline, precaution warnings..."
                    className="w-full border border-[#CBD5E1] rounded p-3 text-[13px] text-gray-900 focus:outline-none focus:border-[#1B4FD8] bg-white font-medium"
                  />
                </div>

                {/* Submit Action Button */}
                <div className="pt-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11.5px] text-[#64748B]">
                    Saving links this consultation to{" "}
                    <strong>{activeEncounter.umr}</strong> +{" "}
                    <strong>{activeEncounter.opNumber}</strong>.
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {submitSuccess && (
                      <span className="text-[12px] font-bold text-[#166534] bg-green-100 border border-green-300 px-3 py-1.5 rounded flex items-center gap-1.5 animate-in fade-in">
                        <span>✓</span> Consultation Saved &amp; Synced!
                      </span>
                    )}

                    {submitSuccess && onNavigateToOPWorkflow && (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToOPWorkflow(activeEncounter.id)
                        }
                        className="px-5 py-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-bold rounded shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>📋</span> View Prescription Pad (Step 5) →
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmitConsultation}
                      className="px-6 py-2.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#15803D] hover:to-[#166534] text-white text-[13px] font-bold rounded shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <span>✓</span> Complete Consultation &amp; Issue
                      Prescription
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white border border-[#DDE2EC] rounded p-8 text-center text-[#64748B]">
              <div>
                <span className="text-3xl block mb-2">👨‍⚕️</span>
                <span className="text-[14px] font-semibold">
                  Select a patient from your queue to begin consultation
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
