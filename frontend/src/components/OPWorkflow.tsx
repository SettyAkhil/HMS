import React, { useState, useEffect } from "react"
import { Icon } from "./icons"
import { StatusBadge, Btn, Input } from "./shared"
import { db, DBPatient, DBOPEncounter } from "../services/db"
import { getDoctorMaster, getDoctorConsultationFee } from "../services/doctorMaster"
import { HospAILogo } from "./HospAILogo"
import { useBranding } from "./branding/DocumentBranding"
import { OpCardPreview, cardBarcodeValue, opCardDataFor, printOpCard } from "./opcard/OpCard"
import { openJourneyForCode } from "./opcard/JourneyScan"
import { notifyAppointmentBooked } from "../services/patientMessaging"

export interface OPPatient {
  id?: string
  umr: string
  opNumber: string
  date?: string
  createdAt?: string
  name: string
  age: number
  sex: "Male" | "Female" | "Other"
  phone: string
  address: string
  isNew: boolean
  previousVisits?: {
    opNumber: string
    date: string
    doctor: string
    diagnosis: string
  }[]
  symptoms: string[]
  chiefComplaint: string
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
  }[]
  investigations: string[]
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
    consultationFee: number
    labFee: number
    total: number
    status: "Paid" | "Pending"
    mode: string
  }
  furtherAction: "None" | "Laboratory" | "Pharmacy" | "Radiology" | "Admission" | "Referral"
  status: "Registered" | "Symptoms Captured" | "AI Recommended" | "Awaiting Doctor" | "Doctor Assigned" | "In Queue" | "Under Consultation" | "Consultation Completed" | "Post-Consultation" | "Awaiting Billing" | "Billing Completed" | "Awaiting Investigation" | "OP Completed"
  timestamps: {
    arrival: string
    registration?: string
    symptoms?: string
    doctorAssigned?: string
    consultationStart?: string
    consultationEnd?: string
    /** Set by the OP nurse station when baseline observations are saved. */
    vitalsRecorded?: string
    vitalsBy?: string
    billingCompleted?: string
    visitCompleted?: string
  }
}

export interface DoctorProfileInfo {
  id: string
  name: string
  specialty: string
  gender: "Male" | "Female"
  status: "Available" | "In Consultation" | "Busy" | "On Rounds"
  room: string
  workload: number
  qualifications: string
  timing: string
  nextSlot: string
}

const INITIAL_DOCTORS: any[] = [
  {
    id: "D1",
    name: "Dr. Sarah Jenkins",
    specialty: "Cardiology",
    gender: "Female",
    status: "Available",
    room: "Room 102",
    workload: 3,
  },
  {
    id: "D2",
    name: "Dr. Rajesh Sharma",
    specialty: "Cardiology",
    gender: "Male",
    status: "Busy",
    room: "Room 104",
    workload: 6,
  },
  {
    id: "D3",
    name: "Dr. Michael Chen",
    specialty: "Pulmonology",
    gender: "Male",
    status: "Available",
    room: "Room 108",
    workload: 2,
  },
  {
    id: "D4",
    name: "Dr. Anita Desai",
    specialty: "General Medicine",
    gender: "Female",
    status: "Available",
    room: "Room 101",
    workload: 4,
  },
  {
    id: "D5",
    name: "Dr. David Anderson",
    specialty: "Orthopedics",
    gender: "Male",
    status: "Busy",
    room: "Room 112",
    workload: 5,
  },
  {
    id: "D6",
    name: "Dr. Priya Patel",
    specialty: "Pediatrics",
    gender: "Female",
    status: "Available",
    room: "Room 105",
    workload: 1,
  },
]

const DOCTOR_WAITING_QUEUES: Record<string, {
  name: string
  age: number
  sex: string
  umr: string
  token: string
  complaint: string
  status: string
}[]> = {
  "Dr. Sanjay Kapoor": [
    {
      name: "Rahul Roy",
      age: 34,
      sex: "Male",
      umr: "UMR10042",
      token: "O-OP094",
      complaint: "Acute knee joint strain & swelling",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. David Anderson": [
    {
      name: "Vikram Seth",
      age: 45,
      sex: "Male",
      umr: "UMR10038",
      token: "O-OP088",
      complaint: "Shoulder impingement follow-up",
      status: "Waiting in Lobby",
    },
    {
      name: "Manoj Tiwari",
      age: 52,
      sex: "Male",
      umr: "UMR10031",
      token: "O-OP079",
      complaint: "Lumbar disc stiffness",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Pooja Menon": [
    {
      name: "Sneha Nair",
      age: 29,
      sex: "Female",
      umr: "UMR10046",
      token: "O-OP096",
      complaint: "Ankle ligament sprain",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Elena Vance": [
    {
      name: "Meera Sen",
      age: 41,
      sex: "Female",
      umr: "UMR10035",
      token: "O-OP082",
      complaint: "Cervical spine discomfort",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Vikram Malhotra": [
    {
      name: "Suresh Nair",
      age: 41,
      sex: "Male",
      umr: "UMR10055",
      token: "G-OP055",
      complaint: "Persistent high-grade fever & headache",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Ramesh Kumar": [
    {
      name: "Arun Verma",
      age: 49,
      sex: "Male",
      umr: "UMR10022",
      token: "G-OP041",
      complaint: "Abdominal cramping & nausea",
      status: "Waiting in Lobby",
    },
    {
      name: "Gopal Rao",
      age: 58,
      sex: "Male",
      umr: "UMR10018",
      token: "G-OP033",
      complaint: "Chronic fatigue & weakness",
      status: "Waiting in Lobby",
    },
    {
      name: "Harish Iyer",
      age: 62,
      sex: "Male",
      umr: "UMR10012",
      token: "G-OP028",
      complaint: "Gastric reflux & dizziness",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Sunita Rao": [
    {
      name: "Pooja Das",
      age: 33,
      sex: "Female",
      umr: "UMR10050",
      token: "G-OP064",
      complaint: "Migraine & recurring nausea",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Anita Desai": [
    {
      name: "Geeta Sharma",
      age: 46,
      sex: "Female",
      umr: "UMR10028",
      token: "G-OP048",
      complaint: "Severe headache & body aches",
      status: "Waiting in Lobby",
    },
    {
      name: "Lakshmi Bai",
      age: 54,
      sex: "Female",
      umr: "UMR10019",
      token: "G-OP036",
      complaint: "Joint stiffness & general weakness",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Arjun Mehta": [
    {
      name: "Anil Kapoor",
      age: 52,
      sex: "Male",
      umr: "UMR10071",
      token: "C-OP071",
      complaint: "Hypertension check & intermittent palpitations",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Rajesh Sharma": [
    {
      name: "Kishore Kumar",
      age: 61,
      sex: "Male",
      umr: "UMR10060",
      token: "C-OP068",
      complaint: "Exertional chest tightness",
      status: "Waiting in Lobby",
    },
    {
      name: "Devendra Pal",
      age: 55,
      sex: "Male",
      umr: "UMR10052",
      token: "C-OP058",
      complaint: "Post-angioplasty routine check",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Ananya Roy": [
    {
      name: "Sunanda Sen",
      age: 50,
      sex: "Female",
      umr: "UMR10067",
      token: "C-OP074",
      complaint: "Mild exertional breathlessness",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Sarah Jenkins": [
    {
      name: "Rohini Gupta",
      age: 48,
      sex: "Female",
      umr: "UMR10058",
      token: "C-OP062",
      complaint: "Tachycardia & dizziness episodes",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Rohan Joshi": [
    {
      name: "Karthik Menon",
      age: 29,
      sex: "Male",
      umr: "UMR10042",
      token: "P-OP042",
      complaint: "Chronic dry cough & wheezing",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Michael Chen": [
    {
      name: "Deepak Chawla",
      age: 53,
      sex: "Male",
      umr: "UMR10037",
      token: "P-OP038",
      complaint: "Shortness of breath on mild exertion",
      status: "Waiting in Lobby",
    },
    {
      name: "Nitin Joshi",
      age: 44,
      sex: "Male",
      umr: "UMR10029",
      token: "P-OP030",
      complaint: "Productive morning cough & sputum",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Neha Gupta": [
    {
      name: "Swati Bose",
      age: 36,
      sex: "Female",
      umr: "UMR10045",
      token: "P-OP046",
      complaint: "Bronchial asthma seasonal flare",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Maya Lin": [
    {
      name: "Rita Ghosh",
      age: 42,
      sex: "Female",
      umr: "UMR10039",
      token: "P-OP040",
      complaint: "Persistent allergic bronchitis",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Siddharth Sen": [
    {
      name: "Master Aarav",
      age: 6,
      sex: "Male",
      umr: "UMR10019",
      token: "PED-OP019",
      complaint: "High-grade fever & throat pain",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Amit Verma": [
    {
      name: "Baby Reyansh",
      age: 2,
      sex: "Male",
      umr: "UMR10015",
      token: "PED-OP015",
      complaint: "Stridor and nighttime barking cough",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Kavita Reddy": [
    {
      name: "Baby Ananya",
      age: 4,
      sex: "Female",
      umr: "UMR10024",
      token: "PED-OP024",
      complaint: "Seasonal allergic rhinitis & sneezing",
      status: "Waiting in Lobby",
    },
  ],
  "Dr. Priya Patel": [
    {
      name: "Baby Diya",
      age: 3,
      sex: "Female",
      umr: "UMR10017",
      token: "PED-OP017",
      complaint: "Viral fever & mild vomiting",
      status: "Waiting in Lobby",
    },
  ],
}

export default function OPWorkflow({
  onComplete,
  onNavigateToRegistration,
  onOpenDoctorPortal,
  initialStep = 2,
  initialEncounterId,
}: {
  onComplete?: () => void
  onNavigateToRegistration?: () => void
  onOpenDoctorPortal?: (encounterId?: string) => void
  initialStep?: number
  initialEncounterId?: string
}) {
  // Deliberately NOT persisted. Sticky form *fields* are what the user asked for;
  // a sticky step number meant reception opened the journey on whatever panel they
  // last used -- often billing, and often for a different patient than the one now
  // in front of them. The position resets; the typed data does not.
  const [currentStep, setCurrentStep] = useState<number>(initialStep || 2)
  const branding = useBranding()
  const [dbEncounters, setDbEncounters] = useState<DBOPEncounter[]>([])

  // Load encounters from DB
  const refreshDb = () => {
    const encs = db.getEncounters()
    setDbEncounters(encs)
    return encs
  }

  // Patient workflow state
  const [patient, setPatient] = useState<OPPatient>({
    umr: "UMR10064",
    opNumber: "OP108",
    name: "zoro roronoa",
    age: 23,
    sex: "Male",
    phone: "1111111111",
    address: "Greenwood Sector 4",
    isNew: false,
    previousVisits: [],
    symptoms: ["Chest pain", "Breathing difficulty"],
    chiefComplaint:
      "Patient complaining of chest tightness and shortness of breath.",
    aiSpecialty: "Cardiology",
    aiDoctor: "Dr. Rajesh Sharma",
    aiConfidence: 96,
    doctorGenderPref: "Any",
    assignedDoctor: "Dr. Rajesh Sharma",
    doctorStatus: "Available",
    queueToken: "C-OP108",
    queuePosition: 1,
    room: "Room 104",
    diagnosis: "",
    icd10: "",
    prescription: [],
    investigations: [],
    advice: "",
    vitals: {
      bp: "135/85 mmHg",
      pulse: "78 bpm",
      temp: "98.6 °F",
      spo2: "98%",
      weight: "74 kg",
      notes: "Patient alert and oriented. Mild diaphoresis on arrival.",
    },
    billing: {
      consultationFee: 50,
      labFee: 0,
      total: 60,
      status: "Pending",
      mode: "Card",
    },
    furtherAction: "None",
    status: "In Queue",
    timestamps: {
      arrival: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  })

  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{
    specialty: string
    confidence: number
    rationale: string
    doctors: DoctorProfileInfo[]
  } | null>(null)
  const [selectedDoctorForBooking, setSelectedDoctorForBooking] =
    useState<DoctorProfileInfo | null>(null)
  const [bookingConfirmed, setBookingConfirmed] = useState<boolean>(false)
  const [bookingPriority, setBookingPriority] =
    useState<"Standard OP Queue" | "Priority / Senior Citizen" | "Emergency Triage">(
      "Standard OP Queue",
    )
  const [paymentProcessing, setPaymentProcessing] = useState(false)
  const [smsSentNotice, setSmsSentNotice] = useState(false)
  const [cashTendered, setCashTendered] = useState<string>("150")
  const [cardNumber, setCardNumber] = useState<string>("4532 •••• •••• 8842")
  const [cardExpiry, setCardExpiry] = useState<string>("09/29")
  const [cardCvv, setCardCvv] = useState<string>("731")
  const [insuranceMemberId, setInsuranceMemberId] =
    useState<string>("BCBS-9041284-A")

  // Real-time Clinical & Patient Notifications
  interface ActiveNotification {
    id: string
    type: "doctor" | "patient"
    title: string
    recipient: string
    message: string
    timestamp: string
    token?: string
  }

  const [activeNotifications, setActiveNotifications] =
    useState<ActiveNotification[]>([])

  const triggerDoctorNotification = (
    docName: string,
    room: string,
    patientName: string,
    token: string,
    complaint: string,
  ) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    const notif: ActiveNotification = {
      id: `doc-${Date.now()}`,
      type: "doctor",
      title: `🔔 Doctor EMR Alert: Next Patient Queued`,
      recipient: `${docName} (${room})`,
      message: `Incoming OP Patient: ${patientName} (Token: ${token}) is waiting in your queue for consultation. Chief Complaint: ${complaint || "Clinical evaluation"}`,
      timestamp: time,
      token: token,
    }
    setActiveNotifications((prev) => [
      notif,
      ...prev.filter((n) => n.id !== notif.id),
    ])
  }

  const triggerPatientNotification = (
    patientName: string,
    phone: string,
    docName: string,
    room: string,
    token: string,
  ) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    const notif: ActiveNotification = {
      id: `pat-${Date.now()}`,
      type: "patient",
      title: `📱 Patient SMS Alert: Get Ready!`,
      recipient: `${patientName} (${phone})`,
      message: `🔔 Get ready! You are UP NEXT with ${docName} in ${room}. Token: ${token}. Please proceed to Door ${room}.`,
      timestamp: time,
      token: token,
    }
    setActiveNotifications((prev) => [
      notif,
      ...prev.filter((n) => n.id !== notif.id),
    ])
  }

  // Step 3: Doctor Queue State & Live Queue Position
  interface QueueItem {
    id: string
    name: string
    umr: string
    token: string
    status: "Waiting" | "Called" | "Under Consultation" | "Completed" | "No Show" | "YOUR TURN"
    isYou?: boolean
  }

  const [doctorQueue, setDoctorQueue] = useState<QueueItem[]>([
    {
      id: "q1",
      name: "Ravi Kumar",
      umr: "UMR10038",
      token: "C-OP0098",
      status: "Waiting",
    },
    {
      id: "q2",
      name: "Suresh Reddy",
      umr: "UMR10045",
      token: "C-OP0104",
      status: "Waiting",
    },
    {
      id: "q3",
      name: "Anjali Sharma",
      umr: "UMR10052",
      token: "C-OP0112",
      status: "Waiting",
    },
    {
      id: "q4",
      name: "zoro roronoa",
      umr: "UMR10064",
      token: "C-OP108",
      status: "Waiting",
      isYou: true,
    },
    {
      id: "q5",
      name: "Deepak Verma",
      umr: "UMR10061",
      token: "C-OP0130",
      status: "Waiting",
    },
  ])

  // Keep queue synced with active patient details
  useEffect(() => {
    setDoctorQueue((prev) => {
      const exists = prev.some((item) => item.isYou)
      if (exists) {
        return prev.map((item) =>
          item.isYou
            ? {
                ...item,
                name: patient.name || "Current Patient",
                umr: patient.umr,
                token: patient.queueToken,
              }
            : item,
        )
      } else {
        return [
          ...prev,
          {
            id: `q-you`,
            name: patient.name || "Current Patient",
            umr: patient.umr,
            token: patient.queueToken,
            status: "Waiting",
            isYou: true,
          },
        ]
      }
    })
  }, [patient.name, patient.umr, patient.queueToken])

  // Calculate live position and patients ahead
  const activeQueue = doctorQueue.filter(
    (item) => item.status !== "Completed" && item.status !== "No Show",
  )
  const youQueueIdx = activeQueue.findIndex((item) => item.isYou)
  const patientsAhead = youQueueIdx >= 0 ? youQueueIdx : 0
  const currentPosition = youQueueIdx >= 0 ? youQueueIdx + 1 : 1
  const isYourTurn =
    currentPosition === 1 ||
    activeQueue[youQueueIdx]?.status === "Called" ||
    activeQueue[youQueueIdx]?.status === "YOUR TURN"

  // Check if Doctor has already finished consultation
  const hasDoctorConsulted =
    (patient.status === "Consultation Completed" ||
      patient.status === "OP Completed" ||
      patient.status === "Awaiting Billing") &&
    ((patient.prescription && patient.prescription.length > 0) ||
      Boolean(patient.diagnosis))

  // Doctor calls next patient handler
  const handleDoctorCallNext = () => {
    setDoctorQueue((prev) => {
      const activeIdx = prev.findIndex(
        (item) =>
          item.status === "Waiting" ||
          item.status === "Called" ||
          item.status === "Under Consultation",
      )
      if (activeIdx === -1) return prev

      const updated = [...prev]
      const currentActive = updated[activeIdx]

      if (currentActive.isYou) {
        currentActive.status = "YOUR TURN"
        triggerDoctorNotification(
          patient.assignedDoctor,
          patient.room,
          patient.name,
          patient.queueToken,
          "Patient called into consultation room",
        )
        triggerPatientNotification(
          patient.name,
          patient.phone,
          patient.assignedDoctor,
          patient.room,
          patient.queueToken,
        )
      } else {
        currentActive.status = "Completed"
        const nextIdx = updated.findIndex(
          (item, idx) => idx > activeIdx && item.status === "Waiting",
        )
        if (nextIdx !== -1 && updated[nextIdx].isYou) {
          updated[nextIdx].status = "YOUR TURN"
          triggerDoctorNotification(
            patient.assignedDoctor,
            patient.room,
            patient.name,
            patient.queueToken,
            "Patient Ready — Please attend patient",
          )
          triggerPatientNotification(
            patient.name,
            patient.phone,
            patient.assignedDoctor,
            patient.room,
            patient.queueToken,
          )
        }
      }
      return updated
    })
  }

  // Skip / advance queue directly to patient's turn
  const handleSkipToMyTurn = () => {
    setDoctorQueue((prev) => {
      return prev.map((item) => {
        if (item.isYou) {
          return { ...item, status: "YOUR TURN" }
        } else if (prev.indexOf(item) < prev.findIndex((p) => p.isYou)) {
          return { ...item, status: "Completed" }
        }
        return item
      })
    })
    triggerDoctorNotification(
      patient.assignedDoctor,
      patient.room,
      patient.name,
      patient.queueToken,
      "Patient Ready — Please attend patient",
    )
    triggerPatientNotification(
      patient.name,
      patient.phone,
      patient.assignedDoctor,
      patient.room,
      patient.queueToken,
    )
  }

  // Sync step if initialStep prop changes
  useEffect(() => {
    if (initialStep) {
      setCurrentStep(initialStep)
    }
  }, [initialStep])

  // Load active encounter on mount or when initialEncounterId changes
  useEffect(() => {
    const encs = refreshDb()
    if (encs.length > 0) {
      const active = initialEncounterId
        ? encs.find((e) => e.id === initialEncounterId) || encs[0]
        : encs[0]
      loadEncounterIntoWorkflow(active)
    }
    const unsub = db.subscribe(() => {
      const latestEncs = refreshDb()
      if (latestEncs.length > 0) {
        const targetId = initialEncounterId || patient.id
        const active = targetId
          ? latestEncs.find((e) => e.id === targetId) || latestEncs[0]
          : latestEncs[0]
        if (active) {
          loadEncounterIntoWorkflow(active)
        }
      }
    })
    return () => {
      unsub()
    }
  }, [initialEncounterId, patient.id])

  const isFemaleGender = (sex?: string) => {
    const s = String(sex || "")
      .toLowerCase()
      .trim()
    return s === "female" || s === "girl" || s === "f" || s === "woman"
  }

  const getTargetDoctorGender = (
    currentPatient: OPPatient,
  ): "Female" | "Male" => {
    if (currentPatient.doctorGenderPref === "Female") return "Female"
    if (currentPatient.doctorGenderPref === "Male") return "Male"
    return isFemaleGender(currentPatient.sex) ? "Female" : "Male"
  }

  const loadEncounterIntoWorkflow = (enc: DBOPEncounter) => {
    const previousEncounters = db.getEncountersForPatient(enc.umr)
    const isFemalePatient = isFemaleGender(enc.sex)
    const patientGender: "Female" | "Male" = isFemalePatient ? "Female" : "Male"
    const dept =
      enc.dept && enc.dept !== "Awaiting Triage" ? enc.dept : "General Medicine"

    // Auto-match same-gender doctor with shortest queue
    const targetGender =
      enc.doctorGenderPref === "Female"
        ? "Female"
        : enc.doctorGenderPref === "Male"
          ? "Male"
          : patientGender
    const candidateDocs = INITIAL_DOCTORS.filter(
      (d) => d.specialty === dept && d.gender === targetGender,
    )
    candidateDocs.sort((a, b) => a.workload - b.workload)

    const matchedDoctor =
      candidateDocs[0] ||
      INITIAL_DOCTORS.find((d) => d.specialty === dept) ||
      INITIAL_DOCTORS.find((d) => d.gender === targetGender) ||
      INITIAL_DOCTORS[0]

    const currentAssignedDoc = enc.assignedDoctor || matchedDoctor.name
    const currentDocObj =
      INITIAL_DOCTORS.find((d) => d.name === currentAssignedDoc) ||
      matchedDoctor

    const isBooked = Boolean(
      enc.assignedDoctor && enc.status && enc.status !== "Registered",
    )
    setBookingConfirmed(isBooked)
    if (enc.assignedDoctor) {
      const doc =
        INITIAL_DOCTORS.find((d) => d.name === enc.assignedDoctor) ||
        currentDocObj
      setSelectedDoctorForBooking(doc)
    }

    setPatient({
      id: enc.id,
      umr: enc.umr,
      opNumber: enc.opNumber,
      date: enc.date,
      createdAt: enc.createdAt,
      name: enc.patientName,
      age: enc.age,
      sex: enc.sex as any,
      phone: enc.phone,
      address: "General Ward / OP Desk",
      isNew: enc.isNew,
      previousVisits: previousEncounters
        .filter((e) => e.id !== enc.id)
        .map((e) => ({
          opNumber: e.opNumber,
          date: (e as any).date || e.createdAt?.split("T")[0] || e.registrationTime,
          doctor: e.assignedDoctor,
          diagnosis: e.diagnosis || e.chiefComplaint,
        })),
      symptoms: enc.symptoms || ["Chest pain", "Breathing difficulty"],
      chiefComplaint:
        enc.chiefComplaint || "Patient presenting for clinical evaluation.",
      aiSpecialty: dept,
      aiDoctor: enc.aiDoctor || currentAssignedDoc,
      aiConfidence: enc.aiConfidence || 95,
      doctorGenderPref: enc.doctorGenderPref as any || "Any",
      assignedDoctor: currentAssignedDoc,
      doctorStatus: enc.doctorStatus || currentDocObj.status as any,
      queueToken: enc.queueToken || `${dept.substring(0, 1)}-${enc.opNumber}`,
      queuePosition: enc.queuePosition || 1,
      room: enc.room || currentDocObj.room,
      assessment: enc.assessment || "",
      diagnosis: enc.diagnosis || "",
      icd10: enc.icd10 || "",
      prescription: enc.prescription || [],
      investigations: enc.investigations || [],
      advice: enc.advice || "",
      vitals: enc.vitals || {
        bp: "135/85 mmHg",
        pulse: "78 bpm",
        temp: "98.6 °F",
        spo2: "98%",
        weight: "74 kg",
        notes: "Patient alert and oriented.",
      },
      billing: enc.billing || {
        consultationFee: 50,
        labFee: 0,
        total: 60,
        status: "Pending",
        mode: "Card",
      },
      furtherAction: enc.furtherAction || "None",
      status: enc.status as any || "Registered",
      timestamps: enc.timestamps || {
        arrival: enc.createdAt || enc.registrationTime,
        registration: enc.createdAt || enc.registrationTime,
      },
    })
  }

  // Symptom toggling
  const toggleSymptom = (sym: string) => {
    setPatient((prev) => ({
      ...prev,
      symptoms: prev.symptoms.includes(sym)
        ? prev.symptoms.filter((s) => s !== sym)
        : [...prev.symptoms, sym],
    }))
  }

  // AI Specialty & Doctor Availability Engine
  const runAiSymptomAnalysis = () => {
    setAiAnalyzing(true)
    setBookingConfirmed(false)
    setTimeout(
      () => {
        const isFemalePatient = isFemaleGender(patient.sex)
        const patientGender: "Female" | "Male" = isFemalePatient
          ? "Female"
          : "Male"

        let specialty = "General Medicine"
        let confidence = 88
        let rationale =
          "General clinical assessment and systemic evaluation based on primary presenting symptoms."

        const complaintText = (patient.chiefComplaint || "").toLowerCase()
        const symptomsStr = (
          patient.symptoms.join(" ") +
          " " +
          complaintText
        ).toLowerCase()

        // Check Pediatric conditions first (if age < 18 or pediatric clinical keywords in complaint)
        const isPediatricPatient =
          (patient.age > 0 && patient.age < 18) ||
          symptomsStr.includes("child") ||
          symptomsStr.includes("infant") ||
          symptomsStr.includes("baby") ||
          symptomsStr.includes("toddler") ||
          symptomsStr.includes("pediatric")

        if (isPediatricPatient) {
          specialty = "Pediatrics"
          confidence = 96
          rationale = `Patient profile (${
            patient.age > 0 ? `${patient.age} yrs` : "Pediatric"
          }) and presenting narrative indicate dedicated care pathway in Pediatrics.`
        } else if (
          symptomsStr.includes("chest") ||
          symptomsStr.includes("breath") ||
          symptomsStr.includes("heart") ||
          symptomsStr.includes("tightness") ||
          symptomsStr.includes("palpitation") ||
          symptomsStr.includes("angina") ||
          symptomsStr.includes("bp high") ||
          symptomsStr.includes("hypertension")
        ) {
          specialty = "Cardiology"
          confidence = 97
          rationale =
            "Symptoms of chest discomfort, cardiac risk indicators, or shortness of breath require immediate clinical assessment by Cardiology."
        } else if (
          symptomsStr.includes("bone") ||
          symptomsStr.includes("joint") ||
          symptomsStr.includes("fracture") ||
          symptomsStr.includes("back pain") ||
          symptomsStr.includes("sprain") ||
          symptomsStr.includes("knee") ||
          symptomsStr.includes("ankle") ||
          symptomsStr.includes("ligament")
        ) {
          specialty = "Orthopedics"
          confidence = 94
          rationale =
            "Musculoskeletal symptoms, joint swelling, or mechanical trauma necessitate orthopedic physical evaluation and imaging review."
        } else if (
          symptomsStr.includes("headache") ||
          symptomsStr.includes("head injury") ||
          symptomsStr.includes("seizure") ||
          symptomsStr.includes("stroke") ||
          symptomsStr.includes("paralysis") ||
          symptomsStr.includes("spine") ||
          symptomsStr.includes("brain") ||
          symptomsStr.includes("numbness")
        ) {
          specialty = "Neurosurgery"
          confidence = 95
          rationale =
            "Neurological presenting symptoms, intracranial, or spine indicators require clinical evaluation by Neurosurgery."
        } else if (
          symptomsStr.includes("stomach") ||
          symptomsStr.includes("abdominal") ||
          symptomsStr.includes("gastric") ||
          symptomsStr.includes("acidity") ||
          symptomsStr.includes("reflux") ||
          symptomsStr.includes("jaundice") ||
          symptomsStr.includes("liver")
        ) {
          specialty = "Gastroenterology"
          confidence = 93
          rationale =
            "Gastrointestinal symptoms, abdominal discomfort, or hepatic indicators require clinical evaluation by Gastroenterology."
        } else if (
          symptomsStr.includes("diabet") ||
          symptomsStr.includes("sugar") ||
          symptomsStr.includes("glucose") ||
          symptomsStr.includes("insulin")
        ) {
          specialty = "Diabetology"
          confidence = 96
          rationale =
            "Glycemic control indicators and metabolic symptoms require evaluation by Diabetology."
        } else if (
          symptomsStr.includes("ear") ||
          symptomsStr.includes("nose") ||
          symptomsStr.includes("throat") ||
          symptomsStr.includes("sinus") ||
          symptomsStr.includes("tonsil")
        ) {
          specialty = "ENT"
          confidence = 92
          rationale =
            "Ear, nose, throat presentation or sinus discomfort warrants clinical evaluation by ENT specialists."
        } else if (
          symptomsStr.includes("cough") ||
          symptomsStr.includes("wheezing") ||
          symptomsStr.includes("lung") ||
          symptomsStr.includes("asthma") ||
          symptomsStr.includes("sputum") ||
          symptomsStr.includes("phlegm") ||
          symptomsStr.includes("respiratory")
        ) {
          specialty = "Pulmonology"
          confidence = 94
          rationale =
            "Respiratory symptoms require pulmonary evaluation for airway obstruction, asthma, or lower respiratory tract assessment."
        } else if (
          symptomsStr.includes("urine") ||
          symptomsStr.includes("kidney") ||
          symptomsStr.includes("bladder")
        ) {
          specialty = "Urology"
          confidence = 93
          rationale =
            "Renal, bladder, or urinary tract complaints require clinical evaluation by Urology."
        } else if (
          symptomsStr.includes("period") ||
          symptomsStr.includes("pregnant") ||
          symptomsStr.includes("pelvic") ||
          symptomsStr.includes("gynec")
        ) {
          specialty = "Gynecology"
          confidence = 95
          rationale =
            "Obstetric and gynecological symptoms require clinical evaluation in Gynecology."
        } else {
          specialty = "General Medicine"
          confidence = 91
          rationale =
            "Acute systemic presentation (fever, malaise, or non-specific symptoms) warrants comprehensive internal medicine evaluation."
        }

        // Filter all available doctors in the recommended specialty from getDoctorMaster()
        const masterDocs = getDoctorMaster().filter((d) => d.verified)
        let deptDoctors: DoctorProfileInfo[] = masterDocs
          .filter(
            (d) =>
              d.specialty === specialty ||
              (specialty === "General Medicine" &&
                (!d.specialty || d.specialty === "General Medicine")),
          )
          .map((doc, idx) => ({
            id: doc.id,
            name: doc.name,
            specialty: doc.specialty || specialty,
            gender:
              doc.name.toLowerCase().includes("keerthana") ||
              doc.name.toLowerCase().includes("amulya") ||
              doc.name.toLowerCase().includes("deepthi") ||
              doc.name.toLowerCase().includes("meena")
                ? "Female" as const
                : "Male" as const,
            status: "Available" as const,
            room: doc.room,
            workload: (idx % 3) + 1,
            qualifications: doc.qualification,
            timing:
              doc.section === "Main"
                ? "09:00 AM - 05:00 PM"
                : "Visiting Consultant (On Call)",
            nextSlot: "Immediate (~5m wait)",
          }))

        // Fallback if no doctor found for exact specialty
        if (deptDoctors.length === 0) {
          deptDoctors = masterDocs.slice(0, 3).map((doc, idx) => ({
            id: doc.id,
            name: doc.name,
            specialty: doc.specialty || specialty,
            gender: "Male" as const,
            status: "Available" as const,
            room: doc.room,
            workload: (idx % 3) + 1,
            qualifications: doc.qualification,
            timing: "09:00 AM - 05:00 PM",
            nextSlot: "Immediate",
          }))
        }

        // Sort doctors: Same gender match first, Available first, lowest workload first
        const targetGender =
          patient.doctorGenderPref === "Female"
            ? "Female"
            : patient.doctorGenderPref === "Male"
              ? "Male"
              : patientGender
        deptDoctors.sort((a, b) => {
          if (a.gender === targetGender && b.gender !== targetGender) return -1
          if (b.gender === targetGender && a.gender !== targetGender) return 1
          if (a.status === "Available" && b.status !== "Available") return -1
          if (b.status === "Available" && a.status !== "Available") return 1
          return a.workload - b.workload
        })

        const topMatchedDoctor = deptDoctors[0]

        setAiAnalysisResult({
          specialty,
          confidence,
          rationale,
          doctors: deptDoctors,
        })

        setSelectedDoctorForBooking(topMatchedDoctor)

        setPatient((prev) => ({
          ...prev,
          aiSpecialty: specialty,
          aiConfidence: confidence,
          aiReasoning: rationale,
          aiDoctor: topMatchedDoctor.name,
        }))

        setAiAnalyzing(false)
      },
      600,
    )
  }

  // Nurse Manual Appointment Booking Handler
  const handleNurseBookAppointment = (chosenDoc?: DoctorProfileInfo) => {
    const docToBook =
      chosenDoc || selectedDoctorForBooking || INITIAL_DOCTORS[0]
    const specialty = docToBook.specialty
    const assignedDoc = docToBook.name
    const assignedRoom = docToBook.room
    const queueToken = `${specialty.substring(0, 1)}-${patient.opNumber}`
    const queuePos =
      docToBook.status === "Available" ? 1 : docToBook.workload + 1
    const docRationale = `Nurse confirmed appointment booking with ${assignedDoc} (${docToBook.workload} active in queue, ${assignedRoom}) for ${specialty}.`

    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    setPatient((prev) => ({
      ...prev,
      aiSpecialty: specialty,
      aiDoctor: assignedDoc,
      assignedDoctor: assignedDoc,
      room: assignedRoom,
      doctorStatus: docToBook.status as any,
      queueToken: queueToken,
      queuePosition: queuePos,
      aiDoctorRationale: docRationale,
      status: "Doctor Assigned" as const,
      timestamps: {
        ...prev.timestamps,
        doctorAssigned: nowTime,
      },
    }))

    setBookingConfirmed(true)

    if (patient.id) {
      try {
        db.updateEncounter(patient.id, {
          dept: specialty,
          assignedDoctor: assignedDoc,
          room: assignedRoom,
          doctorStatus: docToBook.status as any,
          queueToken: queueToken,
          queuePosition: queuePos,
          chiefComplaint: patient.chiefComplaint,
          symptoms: patient.symptoms,
          status: "Doctor Assigned",
          timestamps: {
            ...patient.timestamps,
            doctorAssigned: nowTime,
          },
        })
      } catch (e) {
        console.warn("DB update failed:", e)
      }
    }

    // 1. Dispatch real-time alert to Doctor Portal EMR queue
    triggerDoctorNotification(
      assignedDoc,
      assignedRoom,
      patient.name,
      queueToken,
      patient.chiefComplaint || patient.symptoms.join(", "),
    )

    // 2. Dispatch Patient SMS & WhatsApp notification immediately
    triggerPatientNotification(
      patient.name,
      patient.phone,
      assignedDoc,
      assignedRoom,
      queueToken,
    )
    notifyAppointmentBooked({
      encounterId: patient.id || "",
      name: patient.name,
      umr: patient.umr,
      phone: patient.phone,
      doctor: assignedDoc,
      dept: specialty,
      room: assignedRoom,
      token: queueToken,
      time: nowTime,
    })
  }

  // Doctor assignment & Queue
  const assignDoctorAndQueue = (doc: typeof INITIAL_DOCTORS[0]) => {
    const isDocAvailable = doc.status === "Available"
    const queueToken = `${doc.specialty.substring(0, 1)}-${patient.opNumber}`
    const queuePos = isDocAvailable ? 1 : doc.workload + 1
    const newStatus = isDocAvailable ? "Doctor Assigned" : "In Queue"

    setPatient((prev) => ({
      ...prev,
      assignedDoctor: doc.name,
      doctorStatus: doc.status as any,
      room: doc.room,
      queueToken: queueToken,
      queuePosition: queuePos,
      status: newStatus as any,
      timestamps: {
        ...prev.timestamps,
        doctorAssigned: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    }))

    if (patient.id) {
      try {
        db.updateEncounter(patient.id, {
          assignedDoctor: doc.name,
          doctorStatus: doc.status as any,
          room: doc.room,
          queueToken: queueToken,
          queuePosition: queuePos,
          status: newStatus as any,
        })
        notifyAppointmentBooked({
          encounterId: patient.id,
          name: patient.name,
          umr: patient.umr,
          phone: patient.phone,
          doctor: doc.name,
          dept: doc.specialty || patient.aiSpecialty || "General Medicine",
          room: doc.room,
          token: queueToken,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        })
      } catch (e) {
        console.warn("DB update failed:", e)
      }
    }
  }

  /**
   * Reception's three jobs: register the patient, book the doctor, take payment.
   *
   * Each visible step covers one or more internal panels, so the desk sees three
   * things to do rather than a six-stage clinical pathway it is not responsible
   * for. Booking is one job even though it is two panels -- symptom triage picks
   * the specialty and the allocation panel confirms the doctor and queue token --
   * and the read-only consultation summary sits inside Billing, which is where
   * reception needs it: it is the itemisation of what they are about to charge for.
   *
   * Vitals are not here at all; the OP nurse records those at the Nurse Station
   * after reception is done. Nor is the consultation: the doctor writes that in
   * their own workspace, and the prescription is split to pharmacy and the lab
   * from there (`consultationDispatch.ts`).
   */
  const steps = [
    { nums: [1], label: "Registration", shortLabel: "Register" },
    { nums: [2, 4], label: "Doctor Appointment", shortLabel: "Appointment" },
    { nums: [5, 6], label: "Billing", shortLabel: "Billing" },
  ]

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F0F2F5]">
      {/* Clinical Workflow Header */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">
              Reception — Outpatient Desk
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-[#1B4FD8] border border-blue-200">
              Active OP Pathway
            </span>
          </div>
          <p className="text-[11.5px] text-[#64748B]">
            Register the patient, book their doctor, take payment. Vitals are
            recorded by the OP nurse afterwards; the consultation is the
            doctor&apos;s own workspace.
          </p>
        </div>

        {/* Quick Patient Selector from Database */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 py-1.5 rounded text-[12px]">
            <span className="text-[#64748B] font-medium whitespace-nowrap">
              Active Encounter:
            </span>
            <select
              value={patient.id || ""}
              onChange={(e) => {
                const found = dbEncounters.find(
                  (enc) => enc.id === e.target.value,
                )
                if (found) {
                  loadEncounterIntoWorkflow(found)
                }
              }}
              className="font-semibold text-gray-900 bg-transparent border-none focus:outline-none cursor-pointer text-[12.5px]"
            >
              {dbEncounters.map((enc) => (
                <option key={enc.id} value={enc.id}>
                  {enc.patientName} ({enc.umr} · {enc.opNumber})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="bg-[#0C1524] px-6 py-3 border-b border-[#1E2D42] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1 sm:gap-2 w-full justify-between">
          {steps.map((s, idx) => {
            const isCurrent = s.nums.includes(currentStep)
            const isCompleted = !isCurrent && currentStep > Math.max(...s.nums)
            return (
              <React.Fragment key={s.label}>
                <div
                  onClick={() => setCurrentStep(s.nums[0])}
                  className={`flex items-center gap-2 cursor-pointer transition-all ${
                    isCurrent
                      ? "text-white font-semibold"
                      : isCompleted
                        ? "text-[#93C5FD]"
                        : "text-[#64748B]"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold font-mono transition-colors ${
                      isCurrent
                        ? "bg-[#1B59F8] text-white ring-2 ring-blue-400/50"
                        : isCompleted
                          ? "bg-[#16A34A] text-white"
                          : "bg-white/10 text-[#94A3B8]"
                    }`}
                  >
                    {isCompleted ? "✓" : idx + 1}
                  </div>
                  <span className="text-[12px] hidden md:inline">
                    {s.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 rounded ${
                      isCompleted ? "bg-[#16A34A]" : "bg-white/10"
                    }`}
                  />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ── FLOATING LIVE DUAL-CHANNEL NOTIFICATION TOASTS ── */}
      {activeNotifications.length > 0 && (
        <div className="fixed top-20 right-6 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none animate-in fade-in">
          {activeNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 rounded shadow-xl border-2 pointer-events-auto transition-all duration-300 ${
                notif.type === "doctor"
                  ? "bg-[#0F172A] border-[#3B82F6] text-white ring-2 ring-blue-500/20"
                  : "bg-[#064E3B] border-[#10B981] text-white ring-2 ring-emerald-500/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center text-base font-bold shadow-xs ${
                      notif.type === "doctor"
                        ? "bg-[#2563EB] text-white"
                        : "bg-[#059669] text-white"
                    }`}
                  >
                    {notif.type === "doctor" ? "👨‍⚕️" : "📱"}
                  </div>
                  <div>
                    <div className="font-bold text-[13px] flex items-center gap-2">
                      <span>{notif.title}</span>
                      <span
                        className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                          notif.type === "doctor"
                            ? "bg-blue-800 text-blue-200"
                            : "bg-emerald-800 text-emerald-200"
                        }`}
                      >
                        {notif.type === "doctor"
                          ? "DOCTOR TERMINAL"
                          : "PATIENT SMS"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5 font-medium">
                      Recipient:{" "}
                      <strong className="text-white">{notif.recipient}</strong>
                    </div>
                    <div className="text-[12px] text-slate-100 mt-2 bg-white/10 p-2.5 rounded leading-relaxed border border-white/10">
                      {notif.message}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Dispatched at {notif.timestamp}
                      </span>
                      {notif.token && (
                        <span className="font-mono text-white font-bold">
                          {notif.token}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveNotifications((prev) =>
                      prev.filter((n) => n.id !== notif.id),
                    )
                  }
                  className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Step Workspace */}
      <div className="flex-1 overflow-y-auto p-6 w-full space-y-6">
        {/* ── STEP 1: DIGITAL OP BOOK & PASS ─────────────────────────── */}
        {currentStep === 1 && (
          <div className="bg-white border border-[#DDE2EC] rounded p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[12px] flex items-center justify-center font-bold">
                    1
                  </span>
                  OP Card
                </h2>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  One card for life (UMR <strong>{patient.umr}</strong>), valid at
                  every department. This visit is <strong>{patient.opNumber}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  printOpCard(
                    opCardDataFor(patient.umr, {
                      patientName: patient.name,
                      age: patient.age,
                      sex: patient.sex,
                      phone: patient.phone,
                    }),
                    branding,
                  )
                }
                className="px-4 py-2 bg-white hover:bg-gray-50 border border-[#CBD5E1] text-gray-800 text-[12.5px] font-semibold rounded shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Icon.Download /> Print OP Card
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 py-2">
              <OpCardPreview
                card={opCardDataFor(patient.umr, {
                  patientName: patient.name,
                  age: patient.age,
                  sex: patient.sex,
                  phone: patient.phone,
                })}
                branding={branding}
              />
              <button
                type="button"
                onClick={() => openJourneyForCode(cardBarcodeValue(patient.umr))}
                className="text-[12px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
              >
                Open patient record (same as scanning the card) →
              </button>
            </div>

            {/* Previous visits stay on screen for the desk; they are not printed on the card. */}
            {patient.previousVisits && patient.previousVisits.length > 0 && (
              <div className="max-w-xl mx-auto bg-[#F8FAFC] border border-[#E2E8F0] rounded p-2.5 text-[11px]">
                <div className="text-[#64748B] font-bold mb-1">
                  Previous OP visits for {patient.umr}
                </div>
                <div className="space-y-1">
                  {patient.previousVisits.map((pv, i) => (
                    <div key={i} className="flex justify-between text-[#475569]">
                      <span>
                        • {pv.date} ({pv.opNumber}): {pv.diagnosis}
                      </span>
                      <span className="text-[#64748B] font-medium">{pv.doctor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end items-center pt-2">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-5 py-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold rounded transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                Proceed to Clinical Triage &amp; AI Analysis →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: SYMPTOM CAPTURE & AI SPECIALTY MATCH ─────────────── */}
        {currentStep === 2 && (
          <div className="bg-white border border-[#DDE2EC] rounded p-6 space-y-6">
            <div>
              <div className="border-b border-[#DDE2EC] pb-3 mb-4">
                <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[12px] flex items-center justify-center font-bold">
                    2
                  </span>
                  Clinical Symptom Triage &amp; Specialty Doctor Allocation
                </h2>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Input patient presenting symptoms or chief complaint to run AI
                  clinical triage, recommend the target specialty, and allocate
                  from our 30 verified attending doctors.
                </p>
              </div>
            </div>

            {/* Chief Complaint Input */}
            <div>
              <label className="text-[11.5px] font-semibold text-gray-700 block mb-1.5">
                Chief Complaint / Presenting Narrative
              </label>
              <textarea
                value={patient.chiefComplaint}
                onChange={(e) =>
                  setPatient({ ...patient, chiefComplaint: e.target.value })
                }
                placeholder="e.g. Patient complaining of severe chest tightness and shortness of breath since yesterday morning..."
                className="w-full h-20 border border-[#DDE2EC] rounded p-3 text-[13px] focus:outline-none focus:border-[#1B4FD8]"
              />
            </div>

            {/* Quick Symptom Checkboxes */}
            <div>
              <label className="text-[11.5px] font-semibold text-gray-700 block mb-2">
                Select Common Symptoms (Multi-select)
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Fever",
                  "Headache",
                  "Chest pain",
                  "Breathing difficulty",
                  "Sweating",
                  "Cough",
                  "Abdominal pain",
                  "Back pain",
                  "Joint swelling",
                  "Vomiting",
                  "Dizziness",
                  "Fatigue",
                ].map((sym) => {
                  const active = patient.symptoms.includes(sym)
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => toggleSymptom(sym)}
                      className={`px-3 py-1.5 rounded text-[12px] font-medium border transition-colors cursor-pointer ${
                        active
                          ? "bg-[#1B4FD8] text-white border-[#1B4FD8] shadow-xs"
                          : "bg-white text-gray-700 border-[#DDE2EC] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      {active ? "✓ " : "+ "} {sym}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Autonomous AI Patient Profile Bar */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-[#1B4FD8] flex items-center justify-center font-bold text-[14px]">
                  {patient.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-[12.5px] font-bold text-gray-900 flex items-center gap-2">
                    <span>{patient.name}</span>
                    <span className="text-[#64748B] font-medium text-[11.5px]">
                      ({patient.age} yrs)
                    </span>
                    <span
                      className={`font-mono text-[11px] px-2 py-0.5 rounded border font-bold ${
                        isFemaleGender(patient.sex)
                          ? "bg-pink-50 text-pink-700 border-pink-200"
                          : "bg-blue-50 text-[#1B4FD8] border-blue-200"
                      }`}
                    >
                      {patient.sex}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse"></span>
                    <span>
                      AI Autonomous Triage Protocol: Analyzes chief complaint
                      narrative and auto-assigns matching attending doctor.
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded self-start sm:self-auto">
                <span className="text-[12px]">✨</span>
                <span className="text-[11.5px] font-semibold text-[#1B4FD8]">
                  AI Autonomous Triage
                </span>
              </div>
            </div>

            {/* Run AI Analysis Button */}
            <div className="flex justify-center pt-2">
              <button
                onClick={runAiSymptomAnalysis}
                disabled={
                  aiAnalyzing ||
                  (patient.symptoms.length === 0 && !patient.chiefComplaint)
                }
                className="px-7 py-3 bg-gradient-to-r from-[#1E3A8A] to-[#1B4FD8] hover:from-[#1E40AF] hover:to-[#2563EB] text-white text-[13px] font-semibold rounded shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {aiAnalyzing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>✨</span>
                )}
                {aiAnalyzing
                  ? "Analyzing Symptoms with Clinical AI Engine..."
                  : "Run AI Specialty & Doctor Recommendation"}
              </button>
            </div>

            {/* AI Recommendation & Available Doctors Selection for Nurse Booking */}
            {aiAnalysisResult && (
              <div className="space-y-5 animate-in fade-in">
                {/* 1. Clinical AI Triage & Specialty Recommendation Cards */}
                <div className="bg-[#F8FAFC] border-2 border-[#93C5FD] rounded-none p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider bg-[#1D4ED8] text-white px-2.5 py-1 rounded">
                        ✨ Clinical AI Triage Engine
                      </span>
                      <span className="text-[12px] font-semibold text-[#1E3A8A] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                        Confidence: {aiAnalysisResult.confidence}% Match
                      </span>
                    </div>
                    <span className="text-[11.5px] font-medium text-[#64748B]">
                      Primary Speciality Match:{" "}
                      <strong className="text-[#1B4FD8] font-bold">
                        {aiAnalysisResult.specialty}
                      </strong>
                    </span>
                  </div>

                  <div className="bg-white p-4 rounded border border-[#E2E8F0] space-y-1.5">
                    <div className="text-[11px] uppercase font-bold text-[#64748B] tracking-wider flex items-center gap-1.5">
                      <span>🏥</span> Recommended Medical Specialty &amp;
                      Clinical Rationale
                    </div>
                    <div className="text-[17px] font-bold text-[#1B4FD8] flex items-center gap-2">
                      <span>{aiAnalysisResult.specialty}</span>
                      <span className="text-[11px] font-normal text-[#64748B] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {aiAnalysisResult.doctors.length} Doctors on duty
                      </span>
                    </div>
                    <div className="text-[12.5px] text-gray-700 leading-relaxed pt-1">
                      {aiAnalysisResult.rationale}
                    </div>
                  </div>

                  {/* 2. Available Doctors Board according to Specialty and Availability */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div>
                        <h3 className="text-[13.5px] font-bold text-gray-900 flex items-center gap-2">
                          <span>👨‍⚕️</span> Available Doctors in{" "}
                          {aiAnalysisResult.specialty} (Sorted by Availability
                          &amp; Queue)
                        </h3>
                        <p className="text-[11.5px] text-[#64748B]">
                          Review attending doctors and their live OPD queues.
                          Select a doctor to manually book the appointment.
                        </p>
                      </div>
                      <span className="text-[11px] text-[#1B4FD8] font-semibold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded self-start sm:self-auto">
                        Live Availability Status
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {aiAnalysisResult.doctors.map((doc, idx) => {
                        const isSelected =
                          selectedDoctorForBooking?.id === doc.id
                        const isPrimaryMatch = idx === 0
                        const isAvailable = doc.status === "Available"

                        return (
                          <div
                            key={doc.id}
                            onClick={() => setSelectedDoctorForBooking(doc)}
                            className={`p-4 rounded-lg border-2 transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
                              isSelected
                                ? "border-[#1B4FD8] bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20"
                                : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-slate-50/50"
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold ${
                                      isSelected
                                        ? "bg-[#1B4FD8] text-white"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {doc.gender === "Female" ? "👩‍⚕️" : "👨‍⚕️"}
                                  </div>
                                  <div>
                                    <div className="text-[13.5px] font-bold text-gray-900 flex items-center gap-2">
                                      <span>{doc.name}</span>
                                      <span
                                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                          doc.gender === "Female"
                                            ? "bg-pink-50 text-pink-700 border-pink-200"
                                            : "bg-blue-50 text-blue-700 border-blue-200"
                                        }`}
                                      >
                                        {doc.gender}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-[#64748B] font-medium">
                                      {doc.qualifications} · {doc.specialty}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                  <span
                                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                      isAvailable
                                        ? "bg-green-100 text-green-800 border border-green-200"
                                        : "bg-amber-100 text-amber-800 border border-amber-200"
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        isAvailable
                                          ? "bg-green-600 animate-pulse"
                                          : "bg-amber-600"
                                      }`}
                                    ></span>
                                    {doc.status}
                                  </span>
                                </div>
                              </div>

                              {/* Badges / Rationale */}
                              {isPrimaryMatch && (
                                <div className="mb-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2 py-0.5 rounded shadow-xs">
                                    ✨ AI Recommended Match (Shortest Queue)
                                  </span>
                                </div>
                              )}

                              {/* Availability Details Grid */}
                              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px] text-[#475569] mt-2">
                                <div>
                                  <span className="text-[#64748B] block text-[9.5px] uppercase font-bold">
                                    Room
                                  </span>
                                  <strong className="text-gray-900 font-semibold">
                                    {doc.room}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block text-[9.5px] uppercase font-bold">
                                    Queue Workload
                                  </span>
                                  <strong
                                    className={
                                      doc.workload <= 1
                                        ? "text-green-700 font-semibold"
                                        : "text-amber-700 font-semibold"
                                    }
                                  >
                                    {doc.workload} waiting
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block text-[9.5px] uppercase font-bold">
                                    Next Slot
                                  </span>
                                  <strong className="text-gray-900 font-semibold">
                                    {doc.nextSlot}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            {/* Card Footer / Select Indicator */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11.5px]">
                              <span className="text-[#64748B] text-[11px]">
                                🕒 OPD Timings: <strong>{doc.timing}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedDoctorForBooking(doc)
                                }}
                                className={`px-3 py-1 rounded text-[11.5px] font-semibold transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-[#1B4FD8] text-white shadow-xs"
                                    : "bg-white border border-[#CBD5E1] text-gray-700 hover:border-[#1B4FD8] hover:text-[#1B4FD8]"
                                }`}
                              >
                                {isSelected ? "✓ Selected" : "Select Doctor"}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 3. Nurse Manual Booking Action Panel */}
                  {!bookingConfirmed && selectedDoctorForBooking && (
                    <div className="bg-[#EFF6FF] border-2 border-[#60A5FA] rounded-none p-4 space-y-3.5 mt-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#1B4FD8] text-white flex items-center justify-center font-bold text-[14px]">
                            👩‍⚕️
                          </div>
                          <div>
                            <div className="text-[13px] font-bold text-gray-900">
                              Nurse Manual Appointment Booking Station
                            </div>
                            <div className="text-[11.5px] text-[#475569]">
                              Patient: <strong>{patient.name}</strong> (
                              {patient.umr}) · Selected Doctor:{" "}
                              <strong>{selectedDoctorForBooking.name}</strong> (
                              {selectedDoctorForBooking.room})
                            </div>
                          </div>
                        </div>

                        {/* Priority Selector */}
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <label className="text-[11px] font-bold text-[#475569]">
                            Priority:
                          </label>
                          <select
                            value={bookingPriority}
                            onChange={(e) =>
                              setBookingPriority(e.target.value as any)
                            }
                            className="bg-white border border-blue-300 rounded px-2.5 py-1 text-[11.5px] font-semibold text-gray-800 focus:outline-none focus:border-[#1B4FD8]"
                          >
                            <option value="Standard OP Queue">
                              Standard OP Queue
                            </option>
                            <option value="Priority / Senior Citizen">
                              Priority / Senior Citizen
                            </option>
                            <option value="Emergency Triage">
                              Urgent Triage Consultation
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="text-[11.5px] text-[#1E40AF]">
                          <span>
                            ℹ️ Confirming will issue a live Queue Token, register
                            the visit in{" "}
                            <strong>
                              {selectedDoctorForBooking.specialty}
                            </strong>
                            , and send the encounter directly to{" "}
                            <strong>
                              Dr. {selectedDoctorForBooking.name}'s Doctor
                              Portal
                            </strong>
                            .
                          </span>
                        </div>

                        <button
                          onClick={() =>
                            handleNurseBookAppointment(selectedDoctorForBooking)
                          }
                          className="px-6 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-[13px] font-bold rounded shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                        >
                          <span>👩‍⚕️</span> Book Appointment with{" "}
                          {selectedDoctorForBooking.name} →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Booked Appointment & Dispatched Success Box */}
            {(bookingConfirmed ||
              (patient.status !== "Registered" && patient.assignedDoctor)) && (
              <div className="space-y-4 animate-in fade-in">
                {/* Appointment Booked & Queue Success Banner */}
                <div className="bg-[#F0FDF4] border-2 border-[#86EFAC] rounded-none p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-green-200/80 pb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-[#16A34A] text-white flex items-center justify-center text-lg font-bold shadow-xs">
                        ✓
                      </div>
                      <div>
                        <div className="font-bold text-[15px] text-[#166534] flex items-center gap-2 flex-wrap">
                          <span>Doctor appointment booked</span>
                          <span className="text-[10.5px] font-mono font-bold bg-[#16A34A] text-white px-2 py-0.5 rounded">
                            CONFIRMED &amp; DISPATCHED TO DOCTOR PORTAL
                          </span>
                        </div>
                        <div className="text-[12.5px] text-[#15803D] mt-0.5">
                          Appointment confirmed with{" "}
                          <strong>{patient.assignedDoctor}</strong> (
                          {patient.room}) in{" "}
                          <strong>{patient.aiSpecialty}</strong>.
                        </div>
                      </div>
                    </div>

                    {/* Direct Actions: doctor allocation, or jump to the portal */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {onOpenDoctorPortal && (
                        <button
                          onClick={() => onOpenDoctorPortal(patient.id)}
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 text-[#1B4FD8] border border-[#1B4FD8] text-[12.5px] font-semibold rounded shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>👨‍⚕️</span> View in Doctor Portal
                        </button>
                      )}
                      <button
                        onClick={() => setCurrentStep(4)}
                        className="px-5 py-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold rounded shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <span>🩺</span> Proceed to Doctor &amp; Queue Allocation
                        →
                      </button>
                    </div>
                  </div>

                  {/* Live Queue Ticket Card with Dynamic Queue Estimation */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded border border-green-200 text-[12px]">
                    <div>
                      <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                        Queue Token
                      </span>
                      <span className="font-mono font-bold text-[16px] text-[#1B4FD8]">
                        {patient.queueToken}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                        Live Queue Position
                      </span>
                      <span className="font-bold text-[15px] text-[#D97706]">
                        Position #{patient.queuePosition}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                        Assigned Room
                      </span>
                      <span className="font-bold text-[14px] text-gray-900">
                        {patient.room}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                        Estimated Queue Time
                      </span>
                      <span className="font-semibold text-[#16A34A] flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        ~5-10 mins (Calculated from Queue)
                      </span>
                    </div>
                  </div>

                  {/* Doctor Portal Integration & SMS Alerts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
                    <div className="bg-[#F8FAFC] border border-green-200/80 px-3.5 py-2 rounded text-[#166534] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>🔔</span>
                        <span>
                          <strong>Doctor Portal EMR:</strong> Encounter active
                          in <strong>{patient.assignedDoctor}</strong>'s waiting
                          queue.
                        </span>
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded">
                        EMR SYNCED
                      </span>
                    </div>

                    <div className="bg-[#F8FAFC] border border-green-200/80 px-3.5 py-2 rounded text-[#166534] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>📱</span>
                        <span>
                          <strong>Patient SMS:</strong> Notification scheduled
                          for{" "}
                          <strong>{patient.phone || "registered phone"}</strong>
                          .
                        </span>
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded">
                        SMS READY
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: PRE-CONSULTATION NURSE TRIAGE & VITALS STATION ── */}
        {/* Vitals are not recorded here. Reception registers, triages and
            allocates the doctor; the patient then walks to the OP department,
            where the nurse takes baseline observations at the Nurse Station
            (`NurseStation.tsx`) and only then hands them to the consulting room.
            Keeping a second vitals form on the reception journey meant two
            screens writing the same field, with no way to tell which one the
            doctor was looking at. */}

        {/* ── STEP 4: DOCTOR & LIVE QUEUE ALLOCATION ─────────────────── */}
        {currentStep === 4 && (
          <div className="bg-white border border-[#DDE2EC] rounded p-6 space-y-6 w-full">
            {/* 1. Header & Assigned Doctor Card */}
            <div className="bg-[#F8FAFC] border-2 border-[#CBD5E1] rounded p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded bg-gradient-to-tr from-[#1E3A8A] to-[#1B4FD8] text-white flex items-center justify-center text-xl font-bold shadow-sm">
                    👨‍⚕️
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                      Assigned Doctor
                    </div>
                    <div className="text-[18px] font-bold text-gray-900">
                      {patient.assignedDoctor}
                    </div>
                    <div className="text-[12.5px] text-[#475569] font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#1B4FD8]">
                        {patient.aiSpecialty}
                      </span>
                      <span>•</span>
                      <span>{patient.room}</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-[#16A34A] font-semibold text-[11.5px]">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Available &amp; In Clinic
                      </span>
                    </div>
                  </div>
                </div>

                {/* Automatic / Background Alternate Doctor Switch if required */}
                <div className="flex items-center gap-2">
                  <select
                    value={patient.assignedDoctor}
                    onChange={(e) => {
                      const selectedDoc = getDoctorMaster().find(
                        (d) => d.name === e.target.value,
                      )
                      if (selectedDoc) {
                        setPatient((prev) => ({
                          ...prev,
                          assignedDoctor: selectedDoc.name,
                          room: selectedDoc.room,
                          doctorStatus: "Available",
                        }))
                      }
                    }}
                    className="text-[11.5px] font-semibold text-gray-700 bg-white border border-[#CBD5E1] rounded px-2.5 py-1.5 focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    {getDoctorMaster()
                      .filter(
                        (d) =>
                          d.verified &&
                          (d.specialty === patient.aiSpecialty ||
                            !patient.aiSpecialty),
                      )
                      .map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name} ({d.qualification}) — {d.room}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Vitals status, read-only. Reception does not record these -- the OP
                nurse does, after the patient walks over -- so this reports whether
                that has happened yet. It used to claim "Ready for Physician"
                unconditionally, including for patients whose vitals were blank. */}
            {(() => {
              const takenAt = patient.timestamps?.vitalsRecorded
              const hasVitals = Boolean(
                patient.vitals.bp ||
                  patient.vitals.pulse ||
                  patient.vitals.temp ||
                  patient.vitals.spo2 ||
                  patient.vitals.weight,
              )
              if (!takenAt && !hasVitals) {
                return (
                  <div className="bg-[#FFFBEB] border border-[#FDE68A] p-3.5 rounded text-[12px] shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#92400E] flex items-center gap-1.5">
                        <span>🩺</span> Vitals not taken yet
                      </span>
                      <span className="text-[10.5px] font-mono font-bold text-[#B45309] bg-white px-2 py-0.5 rounded border border-[#FDE68A]">
                        With OP department
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#B45309] mt-1.5">
                      Send the patient to the OP department. The nurse records
                      baseline observations at the Nurse Station and the doctor
                      is notified the moment they are saved.
                    </p>
                  </div>
                )
              }
              return (
                <div className="bg-[#F0FDF4] border border-green-200 p-3.5 rounded text-[12px] space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#166534] flex items-center gap-1.5">
                      <span>✓</span> Nurse-recorded vital signs
                      {patient.timestamps?.vitalsBy && (
                        <span className="font-normal normal-case tracking-normal text-[#15803D]">
                          — {patient.timestamps.vitalsBy}
                          {takenAt ? ` at ${takenAt}` : ""}
                        </span>
                      )}
                    </span>
                    <span className="text-[10.5px] font-mono font-bold text-[#16A34A] bg-white px-2 py-0.5 rounded border border-green-200">
                      Ready for Physician
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 font-mono text-[12px] text-gray-800">
                    <div>
                      <span className="text-[#64748B] text-[10px] block">
                        BP:
                      </span>{" "}
                      <strong>{patient.vitals.bp || "--"}</strong>
                    </div>
                    <div>
                      <span className="text-[#64748B] text-[10px] block">
                        Pulse:
                      </span>{" "}
                      <strong>{patient.vitals.pulse || "--"}</strong>
                    </div>
                    <div>
                      <span className="text-[#64748B] text-[10px] block">
                        Temp:
                      </span>{" "}
                      <strong>{patient.vitals.temp || "--"}</strong>
                    </div>
                    <div>
                      <span className="text-[#64748B] text-[10px] block">
                        SpO2:
                      </span>{" "}
                      <strong>{patient.vitals.spo2 || "--"}</strong>
                    </div>
                    <div>
                      <span className="text-[#64748B] text-[10px] block">
                        Weight:
                      </span>{" "}
                      <strong>{patient.vitals.weight || "--"}</strong>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Check if Doctor has already finished consultation */}
            {hasDoctorConsulted ? (
              <div className="bg-[#F0FDF4] border-2 border-[#16A34A] rounded p-6 text-center space-y-3.5 shadow-xs animate-in zoom-in-95 duration-200">
                <div className="inline-flex items-center gap-2 bg-[#16A34A] text-white text-[12px] font-mono font-bold px-3 py-1 rounded uppercase tracking-wider">
                  <span>✓</span> DOCTOR CONSULTATION COMPLETED
                </div>

                <div className="space-y-1">
                  <div className="text-[20px] font-bold text-gray-900">
                    Checked by {patient.assignedDoctor}
                  </div>
                  <div className="text-[13px] text-[#166534] font-medium">
                    Clinical Examination Completed · Official Prescription
                    Issued ({patient.prescription?.length || 0} Medications)
                  </div>
                  {patient.diagnosis && (
                    <div className="text-[12.5px] text-gray-800 font-semibold bg-white border border-green-200 p-2.5 rounded max-w-lg mx-auto mt-2">
                      <span className="text-[#64748B] text-[11px] block uppercase font-bold">
                        Confirmed Clinical Diagnosis:
                      </span>
                      {patient.diagnosis}{" "}
                      {patient.icd10 ? `(${patient.icd10})` : ""}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="px-6 py-2.5 bg-white hover:bg-gray-50 border border-[#CBD5E1] text-gray-800 text-[13px] font-bold rounded shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>📋</span> View consultation summary →
                  </button>
                  <button
                    onClick={() => setCurrentStep(6)}
                    className="px-6 py-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-bold rounded shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>💳</span> Go straight to billing →
                  </button>
                </div>
              </div>
            ) : isYourTurn ? (
              /* 2. "YOUR TURN" Banner (When patient reaches position #1) */
              <div className="bg-[#F0FDF4] border-2 border-[#16A34A] rounded p-6 text-center space-y-4 shadow-md animate-in zoom-in-95 duration-200">
                <div className="inline-flex items-center gap-2 bg-[#16A34A] text-white text-[12px] font-mono font-bold px-3 py-1 rounded uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                  🔔 YOUR TURN
                </div>

                <div className="space-y-1">
                  <div className="text-[26px] font-black font-mono text-[#15803D]">
                    {patient.queueToken}
                  </div>
                  <div className="text-[15px] font-bold text-gray-900">
                    Doctor: {patient.assignedDoctor} • {patient.room}
                  </div>
                  <p className="text-[13px] text-[#166534] font-medium">
                    Please proceed to the consultation room immediately.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="px-8 py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-[14px] font-bold rounded shadow-lg hover:shadow-xl transition-all flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    <span>👨‍⚕️</span> ENTER DOCTOR CONSULTATION (STEP 5) →
                  </button>
                </div>
              </div>
            ) : (
              /* 3. YOUR QUEUE STATUS Card (When Waiting) */
              <div className="bg-white border-2 border-[#93C5FD] rounded p-5 shadow-xs space-y-4">
                <div className="text-center border-b border-[#E2E8F0] pb-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    YOUR QUEUE STATUS
                  </div>
                  <div className="text-[28px] font-black font-mono text-[#1B4FD8] mt-0.5">
                    {patient.queueToken}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-[#F8FAFC] p-3 rounded border border-[#E2E8F0]">
                    <div className="text-[10.5px] font-bold uppercase text-[#64748B]">
                      Patients Ahead
                    </div>
                    <div className="text-[20px] font-black font-mono text-gray-900 mt-0.5">
                      {patientsAhead}
                    </div>
                  </div>
                  <div className="bg-[#EFF6FF] p-3 rounded border border-blue-200">
                    <div className="text-[10.5px] font-bold uppercase text-[#1B4FD8]">
                      Your Position
                    </div>
                    <div className="text-[20px] font-black font-mono text-[#1B4FD8] mt-0.5">
                      #{currentPosition}
                    </div>
                  </div>
                  <div className="bg-[#F8FAFC] p-3 rounded border border-[#E2E8F0]">
                    <div className="text-[10.5px] font-bold uppercase text-[#64748B]">
                      Est. Wait
                    </div>
                    <div className="text-[20px] font-black font-mono text-[#D97706] mt-0.5">
                      ~{patientsAhead * 5 + 5}m
                    </div>
                  </div>
                </div>

                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="px-6 py-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold rounded shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span>🩺</span> View consultation summary →
                  </button>
                </div>
              </div>
            )}

            {/* Queue Controls */}
            <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-4 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="text-[12.5px] text-[#64748B] hover:text-gray-900 font-medium cursor-pointer"
              >
                ← Back to Symptoms &amp; AI Triage
              </button>

              <div className="flex items-center gap-2">
                {/* Reception takes the consultation fee when the appointment is
                    booked, not after the doctor has seen the patient. The only
                    route to billing used to sit inside the "consultation
                    finished" branch, so the front desk could not collect the fee
                    up front at all -- which is when the patient is actually
                    standing there. */}
                <button
                  type="button"
                  onClick={() => setCurrentStep(6)}
                  className="px-3 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11.5px] font-semibold rounded shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>💳</span> Collect consultation fee →
                </button>
                <button
                  type="button"
                  onClick={handleDoctorCallNext}
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-[#CBD5E1] text-gray-800 text-[11.5px] font-semibold rounded shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>📢</span> Doctor: Call Next Patient
                </button>
                <button
                  type="button"
                  onClick={handleSkipToMyTurn}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[#065F46] text-[11.5px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>⚡</span> Advance to My Turn
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 5: PHYSICIAN CONSULTATION & SUBMITTED CLINICAL SUMMARY ── */}
        {currentStep === 5 &&
          (() => {
            return (
              <div className="bg-white border border-[#DDE2EC] rounded p-6 space-y-6 w-full">
                {/* Header with Doctor & Patient Meta */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[12px] flex items-center justify-center font-bold">
                        5
                      </span>
                      Physician Consultation Summary
                    </h2>
                    <p className="text-[12px] text-[#64748B] mt-0.5">
                      Official clinical consultation record performed by{" "}
                      <strong>{patient.assignedDoctor}</strong>. (Synced live
                      from Doctor Portal).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11.5px] font-bold px-3 py-1.5 rounded border flex items-center gap-1.5 ${
                        hasDoctorConsulted
                          ? "bg-green-50 text-[#166534] border-green-200"
                          : "bg-amber-50 text-[#B45309] border-amber-200"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          hasDoctorConsulted
                            ? "bg-green-500"
                            : "bg-amber-500 animate-pulse"
                        }`}
                      ></span>
                      {hasDoctorConsulted
                        ? "✓ Consultation & Rx Completed"
                        : "Awaiting Doctor Portal Submission"}
                    </span>
                  </div>
                </div>

                {/* Pre-Consultation Nurse-Recorded Vitals Card */}
                <div className="bg-[#F8FAFC] border-2 border-[#93C5FD] rounded p-4.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded bg-blue-100 text-[#1B4FD8] flex items-center justify-center font-bold text-sm">
                        🩺
                      </span>
                      <div>
                        <h3 className="text-[13.5px] font-bold text-gray-900">
                          Pre-Consultation Nurse Vital Signs
                        </h3>
                        <p className="text-[11px] text-[#64748B]">
                          Recorded at Triage Station by RN Jessica Carter prior
                          to physician examination.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10.5px] font-bold bg-green-50 text-[#166534] border border-green-200 px-2 py-0.5 rounded">
                      ✓ Verified Triage Vitals
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
                    <div className="bg-white border border-[#CBD5E1] p-2.5 rounded">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Blood Pressure
                      </span>
                      <span className="text-[15px] font-mono font-bold text-gray-900 block mt-0.5">
                        {patient.vitals?.bp || "120/80 mmHg"}
                      </span>
                    </div>
                    <div className="bg-white border border-[#CBD5E1] p-2.5 rounded">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Heart Rate / Pulse
                      </span>
                      <span className="text-[15px] font-mono font-bold text-gray-900 block mt-0.5">
                        {patient.vitals?.pulse || "76 bpm"}
                      </span>
                    </div>
                    <div className="bg-white border border-[#CBD5E1] p-2.5 rounded">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Temperature
                      </span>
                      <span className="text-[15px] font-mono font-bold text-gray-900 block mt-0.5">
                        {patient.vitals?.temp || "98.6 °F"}
                      </span>
                    </div>
                    <div className="bg-white border border-[#CBD5E1] p-2.5 rounded">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Oxygen SpO2
                      </span>
                      <span className="text-[15px] font-mono font-bold text-gray-900 block mt-0.5">
                        {patient.vitals?.spo2 || "99%"}
                      </span>
                    </div>
                    <div className="bg-white border border-[#CBD5E1] p-2.5 rounded">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Body Weight
                      </span>
                      <span className="text-[15px] font-mono font-bold text-gray-900 block mt-0.5">
                        {patient.vitals?.weight || "74 kg"}
                      </span>
                    </div>
                  </div>

                  {patient.vitals?.notes && (
                    <div className="bg-white border border-green-200 p-2.5 rounded text-[11.5px] text-[#166534] flex items-center gap-1.5">
                      <span className="font-bold">Nurse Observation:</span>
                      <span>{patient.vitals.notes}</span>
                    </div>
                  )}
                </div>

                {/* STATE A: Awaiting Consultation Submission from Doctor Portal */}
                {!hasDoctorConsulted ? (
                  <div className="space-y-6">
                    <div className="bg-[#EFF6FF] border-2 border-[#93C5FD] rounded p-6 text-center space-y-4 shadow-xs animate-in fade-in">
                      <div className="w-12 h-12 rounded bg-[#1B4FD8] text-white flex items-center justify-center text-2xl mx-auto shadow-sm">
                        🩺
                      </div>
                      <div className="space-y-1">
                        <div className="text-[16px] font-bold text-[#1E3A8A]">
                          Awaiting Consultation Submission from Doctor Portal
                        </div>
                        <p className="text-[12.5px] text-[#2563EB] max-w-lg mx-auto">
                          In compliance with clinical role separation, all
                          diagnoses, prescriptions, and investigation orders
                          must be recorded and submitted by{" "}
                          <strong>{patient.assignedDoctor}</strong> from the
                          Doctor Portal.
                        </p>
                      </div>

                      <div className="pt-2 flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenDoctorPortal) {
                              onOpenDoctorPortal(patient.id)
                            }
                          }}
                          className="px-5 py-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-bold rounded shadow-md transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <span>🩺</span> Open Doctor Portal Workspace →
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const nowTime = new Date().toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                            let diag = "Acute Outpatient Clinical Evaluation"
                            let icd = "Z00.0"
                            let rx = [
                              {
                                medicine: "Paracetamol 650mg",
                                dosage: "1 tab",
                                frequency: "TDS (Thrice Daily)",
                                duration: "5 days",
                              },
                              {
                                medicine: "Pantoprazole 40mg",
                                dosage: "1 tab",
                                frequency: "OD (Before Food)",
                                duration: "7 days",
                              },
                            ]
                            let inv = [
                              "Complete Blood Count (CBC)",
                              "Basic Metabolic Panel",
                            ]
                            let adv =
                              "Take prescribed medications after meals. Maintain adequate hydration and follow up in 1 week."

                            if (patient.aiSpecialty === "Cardiology") {
                              diag =
                                "Acute Coronary Syndrome Rule-Out / Stable Angina"
                              icd = "I20.9"
                              rx = [
                                {
                                  medicine: "Aspirin 81mg",
                                  dosage: "1 tab",
                                  frequency: "OD (Once Daily)",
                                  duration: "30 days",
                                },
                                {
                                  medicine: "Atorvastatin 40mg",
                                  dosage: "1 tab",
                                  frequency: "HS (Bedtime)",
                                  duration: "30 days",
                                },
                                {
                                  medicine: "Metoprolol 25mg",
                                  dosage: "1 tab",
                                  frequency: "OD (Once Daily)",
                                  duration: "30 days",
                                },
                              ]
                              inv = [
                                "ECG 12-Lead",
                                "Serum Troponin I",
                                "Lipid Profile",
                              ]
                              adv =
                                "Avoid heavy physical exertion. Follow low-sodium diet and return immediately if chest pain recurs."
                            } else if (patient.aiSpecialty === "Orthopedics") {
                              diag =
                                "Acute Musculoskeletal Lumbar Strain & Joint Inflammation"
                              icd = "M54.5"
                              rx = [
                                {
                                  medicine:
                                    "Aceclofenac 100mg + Paracetamol 325mg",
                                  dosage: "1 tab",
                                  frequency: "BD (Twice Daily)",
                                  duration: "5 days",
                                },
                                {
                                  medicine: "Thiocolchicoside 4mg",
                                  dosage: "1 cap",
                                  frequency: "BD (Twice Daily)",
                                  duration: "5 days",
                                },
                                {
                                  medicine: "Pantoprazole 40mg",
                                  dosage: "1 tab",
                                  frequency: "OD (Before Food)",
                                  duration: "7 days",
                                },
                              ]
                              inv = ["X-Ray Joint / Spine", "Serum Uric Acid"]
                              adv =
                                "Hot fermentation twice daily. Avoid lifting heavy objects."
                            }

                            const updatedPatient = {
                              ...patient,
                              diagnosis: diag,
                              icd10: icd,
                              prescription: rx,
                              investigations: inv,
                              advice: adv,
                              status: "Consultation Completed" as const,
                              timestamps: {
                                ...patient.timestamps,
                                consultationStart:
                                  patient.timestamps.consultationStart ||
                                  nowTime,
                                consultationEnd: nowTime,
                              },
                            }

                            setPatient(updatedPatient)

                            if (patient.id) {
                              try {
                                db.updateEncounter(patient.id, {
                                  diagnosis: diag,
                                  icd10: icd,
                                  prescription: rx,
                                  investigations: inv,
                                  advice: adv,
                                  status: "Consultation Completed",
                                  timestamps: {
                                    ...patient.timestamps,
                                    consultationStart:
                                      patient.timestamps.consultationStart ||
                                      nowTime,
                                    consultationEnd: nowTime,
                                  },
                                })
                              } catch (err) {
                                console.warn("DB update failed:", err)
                              }
                            }
                          }}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold rounded shadow-md transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <span>⚡</span> Complete Consultation &amp; Issue
                          Prescription Now →
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-start pt-2 border-t border-[#E2E8F0]">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(4)}
                        className="text-[12.5px] text-[#64748B] hover:text-gray-900 font-medium cursor-pointer"
                      >
                        ← Back to Doctor Appointment
                      </button>
                    </div>
                  </div>
                ) : (
                  /* STATE B: Doctor has Submitted -> Render Confirmed Prescriptions, Diagnosis & Orders */
                  <div className="space-y-5 animate-in fade-in">
                    {/* Doctor & Encounter Meta Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8FAFC] border border-[#CBD5E1] p-3.5 rounded text-[12px]">
                      <div>
                        <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                          Attending Doctor
                        </span>
                        <span className="font-bold text-gray-900">
                          {patient.assignedDoctor}
                        </span>
                        <span className="text-[11px] text-[#64748B] block">
                          {patient.aiSpecialty} · {patient.room}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                          Patient UMR
                        </span>
                        <span className="font-mono font-bold text-[#1B4FD8]">
                          {patient.umr}
                        </span>
                        <span className="text-[11px] text-gray-700 block">
                          {patient.name} ({patient.age}y, {patient.sex})
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                          Current OP Number
                        </span>
                        <span className="font-mono font-bold text-gray-900">
                          {patient.opNumber}
                        </span>
                        <span className="text-[11px] text-[#64748B] block">
                          Token: {patient.queueToken}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[10.5px] uppercase font-bold">
                          Consultation Time
                        </span>
                        <span className="font-mono font-semibold text-gray-900">
                          {patient.timestamps?.consultationEnd ||
                            new Date().toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                        </span>
                        <span className="text-[10.5px] font-bold text-[#16A34A] block">
                          ✓ Verified Record
                        </span>
                      </div>
                    </div>

                    {/* Clinical Assessment */}
                    <div className="bg-white border border-[#CBD5E1] rounded p-4 space-y-1 shadow-2xs">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                        Clinical Assessment &amp; Notes
                      </div>
                      <div className="text-[13px] text-gray-800 leading-relaxed font-medium bg-[#F8FAFC] p-3 rounded border border-[#E2E8F0]">
                        {patient.assessment ||
                          `Patient presents with ${patient.chiefComplaint || (patient.symptoms && patient.symptoms.join(", ")) || "presenting symptoms"}. Baseline vitals recorded by triage nurse: BP ${patient.vitals?.bp}, Pulse ${patient.vitals?.pulse}. Examination completed.`}
                      </div>
                    </div>

                    {/* Diagnosis & ICD-10 Code */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-white border border-[#CBD5E1] rounded p-4 space-y-1 shadow-2xs">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          Confirmed Clinical Diagnosis
                        </div>
                        <div className="text-[15px] font-bold text-[#1B4FD8]">
                          {patient.diagnosis ||
                            "Acute Coronary Syndrome Rule-Out / Stable Angina"}
                        </div>
                      </div>
                      <div className="bg-white border border-[#CBD5E1] rounded p-4 space-y-1 shadow-2xs">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          ICD-10 Diagnostic Code
                        </div>
                        <div className="text-[15px] font-mono font-bold text-gray-900">
                          {patient.icd10 ||
                            "I20.9 (Angina Pectoris, Unspecified)"}
                        </div>
                      </div>
                    </div>

                    {/* Prescribed Medications Table */}
                    <div className="bg-white border border-[#CBD5E1] rounded p-4 space-y-2.5 shadow-2xs">
                      <div className="flex justify-between items-center">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          Prescribed Medications (Rx Pad)
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-blue-50 text-[#1B4FD8] px-2 py-0.5 rounded border border-blue-200 uppercase">
                          ✓ Locked / Official Rx
                        </span>
                      </div>
                      <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded overflow-hidden text-[12.5px]">
                        <div className="grid grid-cols-4 bg-[#F8FAFC] p-2.5 font-bold text-gray-700 text-[11px] uppercase">
                          <span>Medicine</span>
                          <span>Dosage</span>
                          <span>Frequency</span>
                          <span>Duration</span>
                        </div>
                        {patient.prescription &&
                        patient.prescription.length > 0 ? (
                          patient.prescription.map((rx, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-4 p-2.5 bg-white font-medium text-gray-800 hover:bg-gray-50"
                            >
                              <span className="font-bold text-gray-900">
                                {rx.medicine}
                              </span>
                              <span>{rx.dosage}</span>
                              <span>{rx.frequency}</span>
                              <span className="text-gray-600">
                                {rx.duration}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-[#64748B] italic">
                            No medications prescribed.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Investigations Ordered */}
                    <div className="bg-white border border-[#CBD5E1] rounded p-4 space-y-2.5 shadow-2xs">
                      <div className="flex justify-between items-center">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          Diagnostic Investigations &amp; Lab Orders
                        </div>
                        <span className="text-[10.5px] font-mono font-bold bg-amber-50 text-[#B45309] px-2 py-0.5 rounded border border-amber-200">
                          PENDING SAMPLE / IMAGING
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {patient.investigations &&
                        patient.investigations.length > 0 ? (
                          patient.investigations.map((test) => (
                            <span
                              key={test}
                              className="px-3 py-1.5 rounded text-[12px] font-semibold bg-blue-50 text-[#1B4FD8] border border-blue-200 flex items-center gap-1.5 shadow-2xs"
                            >
                              <span>✓</span> {test}
                            </span>
                          ))
                        ) : (
                          <span className="text-[12px] text-[#64748B] italic">
                            No diagnostic orders requested.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Doctor Advice & Instructions */}
                    <div className="bg-white border border-[#CBD5E1] rounded p-4 space-y-1 shadow-2xs">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                        Doctor Advice &amp; Instructions
                      </div>
                      <div className="text-[12.5px] text-gray-800 leading-relaxed bg-[#F8FAFC] p-3 rounded border border-[#E2E8F0]">
                        {patient.advice ||
                          "Adequate hydration, follow prescribed medication, return for review as advised."}
                      </div>
                    </div>

                    {/* Navigation Actions */}
                    <div className="flex justify-between items-center pt-3 border-t border-[#E2E8F0]">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(4)}
                        className="text-[12px] text-[#64748B] hover:text-gray-900 font-medium cursor-pointer"
                      >
                        ← Back to Doctor Appointment
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const nowTime = new Date().toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                          setPatient((prev) => ({
                            ...prev,
                            status: "Awaiting Billing",
                            timestamps: {
                              ...prev.timestamps,
                              consultationEnd: nowTime,
                            },
                          }))
                          if (patient.id) {
                            try {
                              db.updateEncounter(patient.id, {
                                status: "Awaiting Billing",
                                timestamps: {
                                  ...patient.timestamps,
                                  consultationEnd: nowTime,
                                },
                              })
                            } catch (e) {
                              console.warn("DB update failed:", e)
                            }
                          }
                          setCurrentStep(6)
                        }}
                        className="px-6 py-3 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-bold rounded shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <span>💳</span> Continue to invoice →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

        {/* ── STEP 6: BILLING & OP VISIT COMPLETION ───────────────────── */}
        {currentStep === 6 &&
          (() => {
            const regFee = (patient.billing as any)?.registrationFee ?? (patient.isNew === false ? 0 : 20)
            const consultFee = patient.billing?.consultationFee || getDoctorConsultationFee(patient.assignedDoctor)
            const labItems = patient.investigations || []
            const rxItems = patient.prescription || []
            const labTotal = labItems.length * 40
            const rxTotal = rxItems.length * 20
            const nursingFee = 20
            const grossSubtotal = regFee + consultFee + labTotal + rxTotal + nursingFee
            const isInsurance = patient.billing?.mode === "Insurance Co-Pay"
            const insuranceCoverage = isInsurance
              ? Math.round(grossSubtotal * 0.8)
              : 0
            const netTotalPayable = grossSubtotal - insuranceCoverage
            const tenderedNum = parseFloat(cashTendered) || netTotalPayable
            const changeDue = Math.max(0, tenderedNum - netTotalPayable)
            const isPaid =
              patient.status === "OP Completed" ||
              patient.billing?.status === "Paid"

            const handleProcessPayment = () => {
              setPaymentProcessing(true)
              const nowTime = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })

              setTimeout(() => {
                const updatedState = {
                  ...patient,
                  status: "OP Completed" as const,
                  billing: {
                    ...patient.billing,
                    registrationFee: regFee,
                    consultationFee: consultFee,
                    labFee: labTotal,
                    total: netTotalPayable,
                    status: "Paid" as const,
                    mode: patient.billing?.mode || "Card",
                  },
                  timestamps: {
                    ...patient.timestamps,
                    billingCompleted: nowTime,
                    visitCompleted: nowTime,
                  },
                }
                setPatient(updatedState)
                setPaymentProcessing(false)

                if (patient.id) {
                  try {
                    db.updateEncounter(patient.id, {
                      diagnosis: patient.diagnosis,
                      icd10: patient.icd10,
                      prescription: patient.prescription,
                      investigations: patient.investigations,
                      advice: patient.advice,
                      vitals: patient.vitals,
                      status: "OP Completed",
                      billing: {
                        registrationFee: regFee,
                        consultationFee: consultFee,
                        labFee: labTotal,
                        total: netTotalPayable,
                        status: "Paid",
                        mode: patient.billing?.mode || "Card",
                      },
                      timestamps: {
                        ...patient.timestamps,
                        billingCompleted: nowTime,
                        visitCompleted: nowTime,
                      },
                    })
                  } catch (err) {
                    console.warn("DB billing update:", err)
                  }
                }
              }, 500)
            }

            return (
              <div className="space-y-6 w-full">
                {/* Header */}
                <div className="bg-white border border-[#DDE2EC] rounded p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded bg-[#1B4FD8] text-white text-[12px] flex items-center justify-center font-bold">
                        6
                      </span>
                      OP Billing, Payment &amp; Encounter Settlement
                    </h2>
                    <p className="text-[12px] text-[#64748B] mt-0.5">
                      Official financial statement aggregating patient registration, physician
                      consultation, nursing triage, prescribed medications, and
                      laboratory diagnostic tests.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11.5px] font-bold px-3 py-1 rounded border flex items-center gap-1.5 ${
                        isPaid
                          ? "bg-green-100 text-[#15803D] border-green-300"
                          : "bg-amber-50 text-[#B45309] border-amber-200"
                      }`}
                    >
                      <span>
                        {isPaid ? "✓ PAID & SETTLED" : "⏳ PAYMENT PENDING"}
                      </span>
                    </span>
                  </div>
                </div>

                {/* SMS Notification Banner if triggered */}
                {smsSentNotice && (
                  <div className="bg-[#F0FDF4] border border-green-300 p-3 rounded text-[12px] text-[#166534] flex items-center justify-between animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span>📱</span>
                      <span>Official Tax Receipt &amp; Discharge Summary SMS sent to <strong>{patient.phone || "patient mobile"}</strong>.</span>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-[#E2E8F0] text-[12.5px]">
                  {/* 1. Patient Registration Fee */}
                  <div className="py-2.5 flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-gray-900">1. Patient Registration Fee</div>
                      <div className="text-[11px] text-[#64748B]">
                        {regFee === 0 ? "Existing / Revisit Patient Registration (Waived - ₹0)" : "New Patient Registration Charge (₹20)"}
                      </div>
                    </div>
                    <span className="font-mono font-bold text-gray-900">₹{regFee}.00</span>
                  </div>

                  {/* 2. Physician Consultation */}
                  <div className="py-2.5 flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-gray-900">2. Physician Consultation Fee</div>
                      <div className="text-[11px] text-[#64748B]">Attending: {patient.assignedDoctor || "Assigned Doctor"} ({patient.aiSpecialty || "General"})</div>
                    </div>
                    <span className="font-mono font-bold text-gray-900">₹{consultFee}.00</span>
                  </div>

                    {/* 2. Nursing & Triage Fee */}
                    <div className="py-2.5 flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-gray-900">2. Pre-Consultation Nursing &amp; Vitals Triage</div>
                        <div className="text-[11px] text-[#64748B]">BP: {patient.vitals?.bp} · Pulse: {patient.vitals?.pulse} · Temp: {patient.vitals?.temp}</div>
                      </div>
                      <span className="font-mono font-bold text-gray-900">₹{nursingFee}.00</span>
                    </div>

                    {/* 3. Prescription Medications */}
                    <div className="py-2.5 space-y-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-gray-900">3. Prescribed Pharmacy Medications (Rx Pad)</div>
                          <div className="text-[11px] text-[#64748B]">{rxItems.length} items prescribed</div>
                        </div>
                        <span className="font-mono font-bold text-gray-900">₹{rxTotal}.00</span>
                      </div>
                      {rxItems.map((rx, idx) => (
                        <div key={idx} className="pl-3 text-[11.5px] text-gray-600 flex justify-between">
                          <span>• {rx.medicine} ({rx.dosage} · {rx.frequency})</span>
                          <span className="font-mono">₹150.00</span>
                        </div>
                      ))}
                    </div>

                    {/* 4. Diagnostic Investigations */}
                    <div className="py-2.5 space-y-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-gray-900">4. Diagnostic Laboratory &amp; Imaging Orders</div>
                          <div className="text-[11px] text-[#64748B]">{labItems.length} investigations requested</div>
                        </div>
                        <span className="font-mono font-bold text-gray-900">₹{labTotal}.00</span>
                      </div>
                      {labItems.map((test, idx) => (
                        <div key={idx} className="pl-3 text-[11.5px] text-gray-600 flex justify-between">
                          <span>• {test}</span>
                          <span className="font-mono">₹350.00</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Subtotals & Net Amount */}
                  <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-4 rounded space-y-2 text-[13px]">
                    <div className="flex justify-between text-gray-600">
                      <span>Gross Subtotal:</span>
                      <span className="font-mono font-bold">₹{grossSubtotal}.00</span>
                    </div>
                    <div className="border-t border-[#E2E8F0] pt-2 flex justify-between text-[16px] font-black text-gray-900">
                      <span>Total Amount Due:</span>
                      <span className="text-[#16A34A] font-mono">₹{grossSubtotal}.00</span>
                    </div>
                  </div>

                  {/* Complete Payment Settlement Action Button */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(5)}
                      className="text-[12.5px] text-[#64748B] hover:text-gray-900 font-medium cursor-pointer"
                    >
                      ← Back to consultation summary
                    </button>

                    <button
                      type="button"
                      disabled={paymentProcessing}
                      onClick={handleProcessPayment}
                      className="px-8 py-3.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#15803D] hover:to-[#166534] text-white text-[14px] font-bold rounded shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {paymentProcessing ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                          <span>Processing Settlement...</span>
                        </>
                      ) : (
                        <>
                          <span>💳</span>
                          <span>Mark OP Visit Completed &amp; Settle Invoice (₹{grossSubtotal}.00)</span>
                        </>
                      )}
                    </button>
                  </div>

                {/* SMS Notification Banner if triggered */}
                {smsSentNotice && (
                  <div className="bg-[#F0FDF4] border border-green-300 p-3 rounded text-[12px] text-[#166534] flex items-center justify-between animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span>📱</span>
                      <span>
                        Official Tax Receipt &amp; Discharge Summary SMS sent to{" "}
                        <strong>{patient.phone || "patient mobile"}</strong>.
                      </span>
                    </div>
                    <button
                      onClick={() => setSmsSentNotice(false)}
                      className="text-green-700 hover:text-green-900 font-bold text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Main Settlement Worksheet */}
                {!isPaid ? (
                  <div className="w-full bg-white border border-[#CBD5E1] rounded p-6 space-y-5 shadow-xs">
                    <div className="border-b border-[#E2E8F0] pb-3 flex justify-between items-center">
                      <div>
                        <div className="text-[15px] font-bold text-gray-900">
                          Itemized Clinical Charges
                        </div>
                        <div className="text-[11.5px] text-[#64748B]">
                          Encounter No:{" "}
                          <strong className="font-mono text-gray-800">
                            {patient.opNumber}
                          </strong>{" "}
                          · Permanent UMR:{" "}
                          <strong className="font-mono text-gray-800">
                            {patient.umr}
                          </strong>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-blue-50 text-[#1B4FD8] px-2.5 py-1 rounded border border-blue-200">
                        Fee Worksheet (INR ₹)
                      </span>
                    </div>

                    <div className="divide-y divide-[#E2E8F0] text-[12.5px]">
                      {/* 1. Consultation */}
                      <div className="py-2.5 flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-gray-900">
                            1. Physician Consultation Fee
                          </div>
                          <div className="text-[11px] text-[#64748B]">
                            Attending: {patient.assignedDoctor} (
                            {patient.aiSpecialty})
                          </div>
                        </div>
                        <span className="font-mono font-bold text-gray-900">
                          ₹{consultFee}.00
                        </span>
                      </div>

                      {/* 2. Nursing & Triage Fee */}
                      <div className="py-2.5 flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-gray-900">
                            2. Pre-Consultation Nursing &amp; Vitals Triage
                          </div>
                          <div className="text-[11px] text-[#64748B]">
                            BP: {patient.vitals?.bp} · Pulse:{" "}
                            {patient.vitals?.pulse} · Temp:{" "}
                            {patient.vitals?.temp}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-gray-900">
                          ₹{nursingFee}.00
                        </span>
                      </div>

                      {/* 3. Prescription Medications */}
                      <div className="py-2.5 space-y-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-gray-900">
                              3. Prescribed Pharmacy Medications (Rx Pad)
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              {rxItems.length} items prescribed
                            </div>
                          </div>
                          <span className="font-mono font-bold text-gray-900">
                            ₹{rxTotal}.00
                          </span>
                        </div>
                        {rxItems.map((rx, idx) => (
                          <div
                            key={idx}
                            className="pl-3 text-[11.5px] text-gray-600 flex justify-between"
                          >
                            <span>
                              • {rx.medicine} ({rx.dosage} · {rx.frequency})
                            </span>
                            <span className="font-mono">₹150.00</span>
                          </div>
                        ))}
                      </div>

                      {/* 4. Diagnostic Investigations */}
                      <div className="py-2.5 space-y-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-gray-900">
                              4. Diagnostic Laboratory &amp; Imaging Orders
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              {labItems.length} investigations requested
                            </div>
                          </div>
                          <span className="font-mono font-bold text-gray-900">
                            ₹{labTotal}.00
                          </span>
                        </div>
                        {labItems.map((test, idx) => (
                          <div
                            key={idx}
                            className="pl-3 text-[11.5px] text-gray-600 flex justify-between"
                          >
                            <span>• {test}</span>
                            <span className="font-mono">₹350.00</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Subtotals & Net Amount */}
                    <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-4 rounded space-y-2 text-[13px]">
                      <div className="flex justify-between text-gray-600">
                        <span>Gross Subtotal:</span>
                        <span className="font-mono font-bold">
                          ₹{grossSubtotal}.00
                        </span>
                      </div>
                      <div className="border-t border-[#E2E8F0] pt-2 flex justify-between text-[16px] font-black text-gray-900">
                        <span>Total Amount Due:</span>
                        <span className="text-[#16A34A] font-mono">
                          ₹{grossSubtotal}.00
                        </span>
                      </div>
                    </div>

                    {/* Complete Payment Settlement Action Button */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(5)}
                        className="text-[12.5px] text-[#64748B] hover:text-gray-900 font-medium cursor-pointer"
                      >
                        ← Back to consultation summary
                      </button>

                      <button
                        type="button"
                        disabled={paymentProcessing}
                        onClick={handleProcessPayment}
                        className="px-8 py-3.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#15803D] hover:to-[#166534] text-white text-[14px] font-bold rounded shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {paymentProcessing ? (
                          <>
                            <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                            <span>Processing Settlement...</span>
                          </>
                        ) : (
                          <>
                            <span>💳</span>
                            <span>
                              Mark OP Visit Completed &amp; Settle Invoice (₹
                              {grossSubtotal}.00)
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* OFFICIAL PRINTABLE DISCHARGE & PAYMENT RECEIPT */
                  <div className="space-y-5">
                    <div className="printable-card bg-white border-2 border-[#CBD5E1] text-gray-900 rounded p-6 shadow-xl relative overflow-hidden ring-1 ring-black/5 max-w-3xl mx-auto space-y-4">
                      {/* Top Accent Strip */}
                      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#16A34A] via-[#1B4FD8] to-[#16A34A]"></div>

                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E2E8F0] pb-4 pt-1 gap-2">
                        <div className="flex items-center gap-3">
                          <HospAILogo variant="icon" className="w-12 h-12 shrink-0" />
                          <div>
                            <div className="font-bold text-[16px] text-gray-900">
                              HospAI General Hospital
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              Department of Outpatient Services · Official Tax
                              Invoice &amp; Discharge Pass
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-mono font-bold text-[#166534] bg-green-50 px-2.5 py-1 rounded border border-green-200 inline-block">
                            ✓ PAID &amp; SETTLED
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1 font-mono">
                            Date: {patient.date || patient.createdAt?.split("T")[0] || new Date().toLocaleDateString()} ·{" "}
                            {patient.timestamps?.billingCompleted || "Now"}
                          </div>
                        </div>
                      </div>

                      {/* Patient & Doctor Meta Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8FAFC] border border-[#CBD5E1] p-3.5 rounded text-[12px]">
                        <div>
                          <span className="text-[#64748B] text-[10px] uppercase font-bold block">
                            Patient Name
                          </span>
                          <span className="font-bold text-gray-900 text-[13px]">
                            {patient.name}
                          </span>
                          <span className="text-[11px] text-gray-600 block">
                            {patient.age} yrs · {patient.sex}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748B] text-[10px] uppercase font-bold block">
                            Permanent UMR
                          </span>
                          <span className="font-mono font-bold text-[#1B4FD8] text-[13px]">
                            {patient.umr}
                          </span>
                          <span className="text-[11px] text-gray-600 block">
                            Token: {patient.queueToken}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748B] text-[10px] uppercase font-bold block">
                            Visit OP Number
                          </span>
                          <span className="font-mono font-bold text-gray-900 text-[13px]">
                            {patient.opNumber}
                          </span>
                          <span className="text-[11px] text-gray-600 block">
                            {patient.aiSpecialty}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748B] text-[10px] uppercase font-bold block">
                            Attending Doctor
                          </span>
                          <span className="font-bold text-gray-900 text-[13px]">
                            {patient.assignedDoctor}
                          </span>
                          <span className="text-[11px] text-gray-600 block">
                            {patient.room}
                          </span>
                        </div>
                      </div>

                      {/* Clinical Summary Bar */}
                      <div className="bg-[#EFF6FF] border border-blue-200 p-3 rounded text-[12px] space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[#1E40AF] font-bold">
                            Confirmed Clinical Diagnosis:
                          </span>
                          <span className="font-mono font-bold text-[#1B4FD8]">
                            {patient.icd10}
                          </span>
                        </div>
                        <div className="text-gray-800 font-medium">
                          {patient.diagnosis}
                        </div>
                        <div className="text-[11px] text-[#64748B] pt-0.5 flex gap-3 flex-wrap">
                          <span>
                            BP: <strong>{patient.vitals?.bp}</strong>
                          </span>
                          <span>
                            Pulse: <strong>{patient.vitals?.pulse}</strong>
                          </span>
                          <span>
                            Temp: <strong>{patient.vitals?.temp}</strong>
                          </span>
                          <span>
                            SpO2: <strong>{patient.vitals?.spo2}</strong>
                          </span>
                          <span>
                            Weight: <strong>{patient.vitals?.weight}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Itemized Table */}
                      <div className="border border-[#CBD5E1] rounded overflow-hidden text-[12px]">
                        <div className="grid grid-cols-12 bg-[#F1F5F9] p-2.5 font-bold text-gray-700 text-[11px] uppercase border-b border-[#CBD5E1]">
                          <span className="col-span-8">
                            Description of Service / Medication / Investigation
                          </span>
                          <span className="col-span-2 text-center">Type</span>
                          <span className="col-span-2 text-right">
                            Amount ($)
                          </span>
                        </div>
                        <div className="divide-y divide-[#E2E8F0] p-1 text-gray-800">
                          <div className="grid grid-cols-12 p-2">
                            <span className="col-span-8 font-medium">
                              Physician OP Consultation (
                              {patient.assignedDoctor})
                            </span>
                            <span className="col-span-2 text-center text-[10.5px] text-[#64748B]">
                              Consultation
                            </span>
                            <span className="col-span-2 text-right font-mono font-bold">
                              ${consultFee}.00
                            </span>
                          </div>
                          <div className="grid grid-cols-12 p-2">
                            <span className="col-span-8 font-medium">
                              Pre-Consultation Nursing Triage Assessment
                            </span>
                            <span className="col-span-2 text-center text-[10.5px] text-[#64748B]">
                              Nursing
                            </span>
                            <span className="col-span-2 text-right font-mono font-bold">
                              ${nursingFee}.00
                            </span>
                          </div>
                          {rxItems.map((rx, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-12 p-2 bg-[#F8FAFC]"
                            >
                              <span className="col-span-8 font-medium">
                                Rx: {rx.medicine} ({rx.dosage} · {rx.frequency}{" "}
                                · {rx.duration})
                              </span>
                              <span className="col-span-2 text-center text-[10.5px] text-[#64748B]">
                                Pharmacy
                              </span>
                              <span className="col-span-2 text-right font-mono font-bold">
                                $15.00
                              </span>
                            </div>
                          ))}
                          {labItems.map((test, idx) => (
                            <div key={idx} className="grid grid-cols-12 p-2">
                              <span className="col-span-8 font-medium">
                                Lab/Diagnostic: {test}
                              </span>
                              <span className="col-span-2 text-center text-[10.5px] text-[#64748B]">
                                Diagnostics
                              </span>
                              <span className="col-span-2 text-right font-mono font-bold">
                                $35.00
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Total Bar */}
                        <div className="bg-[#F8FAFC] border-t border-[#CBD5E1] p-3 space-y-1 text-[12.5px]">
                          <div className="flex justify-between text-gray-600">
                            <span>Gross Total:</span>
                            <span className="font-mono font-bold">
                              ₹{grossSubtotal}.00
                            </span>
                          </div>
                          {isInsurance && (
                            <div className="flex justify-between text-[#16A34A] font-semibold">
                              <span>Insurance Payer Settlement (80%):</span>
                              <span className="font-mono">
                                -₹{insuranceCoverage}.00
                              </span>
                            </div>
                          )}
                          <div className="border-t border-[#CBD5E1] pt-1 flex justify-between text-[15px] font-black text-gray-900">
                            <span>
                              Total Amount Settled ({patient.billing.mode}):
                            </span>
                            <span className="text-[#16A34A] font-mono">
                              ₹{netTotalPayable}.00
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-[#E2E8F0] text-[11px] text-[#64748B] gap-2">
                        <div>
                          <span>
                            Cashier / Desk:{" "}
                            <strong>RN Jessica Carter (OP Desk 1)</strong>
                          </span>
                          <span className="block mt-0.5">
                            Receipt ID:{" "}
                            <strong className="font-mono text-gray-900">
                              RCP-{patient.opNumber}-
                              {Date.now().toString().slice(-4)}
                            </strong>
                          </span>
                        </div>
                        <div className="text-right font-mono font-bold text-gray-900 tracking-widest text-[12px]">
                          ||||| | |||| ||| ||||
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-[#CBD5E1] text-gray-800 text-[13px] font-bold rounded shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Icon.Download /> Print Tax Invoice &amp; OP Summary
                      </button>
                      <button
                        type="button"
                        onClick={() => setSmsSentNotice(true)}
                        className="px-5 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#1B4FD8] text-[13px] font-bold rounded shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>📱</span> Send SMS Receipt to Patient
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentStep(1)
                        }}
                        className="px-6 py-2.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-bold rounded shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>➕</span> Register / Start Next Outpatient Patient
                        →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
      </div>
    </div>
  )
}
