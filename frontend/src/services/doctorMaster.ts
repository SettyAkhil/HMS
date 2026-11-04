/**
 * Imperial Hospitals doctor master -- the single roster the whole app reads.
 */

export type DoctorSection = "Main" | "Visiting"

export interface MasterDoctor {
  id: string

  name: string

  qualification: string

  specialty: string | null

  specialtyNote?: string

  section: DoctorSection

  verified: boolean

  username?: string

  room: string

  staffId: string

  selectedOnCard?: boolean

  consultationFee?: number
}

/** Password every seeded local account uses -- see `demoCredentials.ts`. */

export const DOCTOR_LOCAL_PASSWORD = "password123"

export const INITIAL_DOCTOR_MASTER: MasterDoctor[] = [
  // ── Main Panel ────────────────────────────────────────────────────────────

  {
    id: "IMP-001",
    name: "Dr. P. R. K. Varma",
    qualification: "M.D., D.M. (Cardiology)",

    specialty: "Cardiology",
    section: "Main",
    verified: true,

    username: "prkvarma",
    room: "Room 201",
    staffId: "IMP-201",
  },

  {
    id: "IMP-002",
    name: "Dr. R. Naresh Kumar",
    qualification: "M.B.B.S., D.Ortho",

    specialty: "Orthopedics",
    section: "Main",
    verified: true,

    username: "nareshkumar",
    room: "Room 202",
    staffId: "IMP-202",
  },

  {
    id: "IMP-003",
    name: "Dr. K. Lokesh Kumar Raju",
    qualification: "M.S., M.Ch. (Neurosurgery)",

    specialty: "Neurosurgery",
    section: "Main",
    verified: true,

    username: "lokeshraju",
    room: "Room 203",
    staffId: "IMP-203",
  },

  {
    id: "IMP-004",
    name: "Dr. Sri J. Inturi",
    qualification: "M.D., D.M. (Gastroenterology)",

    specialty: "Gastroenterology",
    section: "Main",
    verified: true,

    username: "sriinturi",
    room: "Room 204",
    staffId: "IMP-204",
  },

  {
    id: "IMP-005",
    name: "Dr. J. Suryanarayana",
    qualification: "M.D., D.M. (Cardiology)",

    specialty: "Cardiology",
    section: "Main",
    verified: true,

    username: "suryanarayana",
    room: "Room 205",
    staffId: "IMP-205",
  },

  {
    id: "IMP-006",
    name: "Dr. Rajashekar",
    qualification: "M.B.B.S., D.C.",

    specialty: "Cardiology",
    section: "Main",
    verified: true,

    username: "rajashekar",
    room: "Room 206",
    staffId: "IMP-206",
  },

  {
    id: "IMP-007",
    name: "Dr. Bandaru Chaitanya",
    qualification: "DNB (Ortho), FJR",

    specialty: "Orthopedics",
    section: "Main",
    verified: true,

    username: "bchaitanya",
    room: "Room 207",
    staffId: "IMP-207",
  },

  {
    id: "IMP-008",
    name: "Dr. P. S. R. Anil",
    qualification: "M.D., D.M. (Gastroenterology)",

    specialty: "Gastroenterology",
    section: "Main",
    verified: true,

    username: "psranil",
    room: "Room 208",
    staffId: "IMP-208",
  },

  {
    id: "IMP-009",
    name: "Dr. S. Keerthana",
    qualification: "M.S. (OBG)",

    specialty: "Gynecology",
    section: "Main",
    verified: true,

    username: "keerthana",
    room: "Room 209",
    staffId: "IMP-209",
  },

  {
    id: "IMP-010",
    name: "Dr. Deepthi Raju",
    qualification: "M.D. (Pediatrics), Critical Care",

    specialty: "Pediatrics",
    section: "Main",
    verified: true,

    username: "deepthiraju",
    room: "Room 210",
    staffId: "IMP-210",
  },

  {
    id: "IMP-011",
    name: "Dr. Chaitanya Krishna",
    qualification: "M.D. (Pediatrics)",

    specialty: "Pediatrics",
    section: "Main",
    verified: true,

    username: "chaitanya",
    room: "Room 211",
    staffId: "IMP-211",
  },

  {
    id: "IMP-012",
    name: "Dr. Vijay Lokesh",
    qualification: "M.B.B.S., D.Ch., DNB (Pediatrics)",

    specialty: "Pediatrics",
    section: "Main",
    verified: true,

    username: "vijaylokesh",
    room: "Room 212",
    staffId: "IMP-212",
  },

  {
    id: "IMP-013",
    name: "Dr. P. Mohan Krishna",
    qualification: "M.B.B.S., DNB (General Surgery)",

    specialty: "General Surgery",
    section: "Main",
    verified: true,

    username: "mohankrishna",
    room: "Room 213",
    staffId: "IMP-213",
  },

  {
    id: "IMP-014",
    name: "Dr. J. Amulya",
    qualification: "M.D., Fellowship in Diabetes (EACME)",

    specialty: "Diabetology",
    section: "Main",
    verified: true,

    username: "amulya",
    room: "Room 214",
    staffId: "IMP-214",
    selectedOnCard: true,
  },

  {
    id: "IMP-015",
    name: "Dr. D. Krishnam Raju",
    qualification: "M.D. (General Medicine)",

    specialty: "General Medicine",
    section: "Main",
    verified: true,

    username: "krishnamraju",
    room: "Room 215",
    staffId: "IMP-215",
  },

  {
    id: "IMP-016",
    name: "Dr. U. Nagaraju",
    qualification: "M.D. (General Medicine)",

    specialty: "General Medicine",
    section: "Main",
    verified: true,

    username: "nagaraju",
    room: "Room 216",
    staffId: "IMP-216",
  },

  {
    id: "IMP-017",
    name: "Dr. J. Ravi",
    qualification: "M.S., M.Ch. (Urology)",

    specialty: "Urology",
    section: "Main",
    verified: true,

    username: "jravi",
    room: "Room 217",
    staffId: "IMP-217",
  },

  {
    id: "IMP-018",
    name: "Dr. T. Meena",
    qualification: "M.B.B.S., MDRD",

    specialty: "Radiology",
    section: "Main",
    verified: true,

    username: "tmeena",
    room: "Room 218",
    staffId: "IMP-218",
  },

  // ── Visiting Consultants ──────────────────────────────────────────────────

  {
    id: "IMP-019",
    name: "Dr. Teegala Ramesh",
    qualification: "M.S., M.Ch. (Neurosurgery)",

    specialty: "Neurosurgery",
    section: "Visiting",
    verified: true,

    username: "teegalaramesh",
    room: "Room 221",
    staffId: "IMP-221",
  },

  {
    id: "IMP-020",
    name: "Dr. Y. Ramakrishna",
    qualification: "M.S. (ENT)",

    specialty: "ENT",
    section: "Visiting",
    verified: true,

    username: "ramakrishna",
    room: "Room 222",
    staffId: "IMP-222",
  },

  {
    id: "IMP-021",
    name: "Dr. N. Sudhir Varma",
    qualification: "M.B.B.S., M.Ch. (Surgical Oncology)",

    specialty: "Surgical Oncology",
    section: "Visiting",
    verified: true,

    username: "sudhirvarma",
    room: "Room 223",
    staffId: "IMP-223",
  },

  {
    id: "IMP-022",
    name: "Dr. D. Gangadhar Raju",
    qualification: "M.D. (Pediatrics)",

    specialty: "Pediatrics",
    section: "Visiting",
    verified: true,

    username: "gangadharraju",
    room: "Room 224",
    staffId: "IMP-224",
  },

  {
    id: "IMP-023",
    name: "Dr. K. Satyanand",
    qualification: "M.S., FMAS (Laparoscopic Surgery)",

    specialty: "General Surgery",
    section: "Visiting",
    verified: true,

    username: "satyanand",
    room: "Room 225",
    staffId: "IMP-225",
  },

  {
    id: "IMP-024",
    name: "Dr. M. Bhavani Shankar",
    qualification: "M.D. (Radiology)",

    specialty: "Radiology",
    section: "Visiting",
    verified: true,

    username: "bhavanishankar",
    room: "Room 226",
    staffId: "IMP-226",
  },

  {
    id: "IMP-025",
    name: "Dr. Anil Sunkar",
    qualification: "M.S., M.Ch. (Vascular Surgery)",

    specialty: "Vascular Surgery",
    section: "Visiting",
    verified: true,

    username: "anilsunkar",
    room: "Room 227",
    staffId: "IMP-227",
  },

  {
    id: "IMP-026",
    name: "Dr. J. Y. N. Kumar",
    qualification: "M.D., D.M. (Neurology)",

    specialty: "Neurology",
    section: "Visiting",
    verified: true,

    username: "jynkumar",
    room: "Room 228",
    staffId: "IMP-228",
  },

  {
    id: "IMP-027",
    name: "Dr. Pratap Varma Paineti",
    qualification: "M.S., M.Ch. (Surgical Oncology)",

    specialty: "Surgical Oncology",
    section: "Visiting",
    verified: true,

    username: "pratapvarma",
    room: "Room 229",
    staffId: "IMP-229",
  },

  {
    id: "IMP-028",
    name: "Dr. D. Sandeep Varma",
    qualification: "M.D. (Gen Med), Critical Care Specialist",

    specialty: "Critical Care",
    section: "Visiting",
    verified: true,

    username: "sandeepvarma",
    room: "Room 230",
    staffId: "IMP-230",
  },

  {
    id: "IMP-029",
    name: "Dr. D. Mallikarjun",
    qualification: "M.B.B.S., DTCD, DNB (Pulmonology)",

    specialty: "Pulmonology",
    section: "Visiting",
    verified: true,

    username: "mallikarjun",
    room: "Room 231",
    staffId: "IMP-231",
  },

  {
    id: "IMP-030",
    name: "Dr. Y. V. V. S. Vinay Kumar",
    qualification: "M.S. (ENT)",

    specialty: "ENT",
    section: "Visiting",
    verified: true,

    username: "vinaykumar",
    room: "Room 232",
    staffId: "IMP-232",
  },

  // ── Hospital Clinical Specialists & Emergency Physicians ──────────────────

  {
    id: "IMP-031",
    name: "Dr. Anita Roy",
    qualification: "M.D., FACEM (Emergency & Critical Care)",

    specialty: "Emergency Medicine",
    section: "Main",
    verified: true,

    username: "anitaroy",
    room: "ER Resus Bay 1",
    staffId: "IMP-233",
  },

  {
    id: "IMP-032",
    name: "Dr. Rajesh Sharma",
    qualification: "M.D. (Internal Medicine), FACP",

    specialty: "General Medicine",
    section: "Main",
    verified: true,

    username: "rajeshsharma",
    room: "Room 105",
    staffId: "IMP-234",
  },

  {
    id: "IMP-033",
    name: "Dr. Vikram Seth",
    qualification: "M.D., D.M. (Cardiology), FACC",

    specialty: "Cardiology",
    section: "Main",
    verified: true,

    username: "vikramseth",
    room: "Room 102",
    staffId: "IMP-235",
  },

  {
    id: "IMP-034",
    name: "Dr. Sanjay Gupta",
    qualification: "M.S., M.Ch. (Orthopedics & Trauma)",

    specialty: "Orthopedics",
    section: "Main",
    verified: true,

    username: "sanjaygupta",
    room: "Room 108",
    staffId: "IMP-236",
  },

  {
    id: "IMP-035",
    name: "Dr. Meenakshi Rao",
    qualification: "M.D., D.M. (Neurology)",

    specialty: "Neurology",
    section: "Main",
    verified: true,

    username: "meenakshirao",
    room: "Room 110",
    staffId: "IMP-237",
  },

  {
    id: "IMP-036",
    name: "Dr. Priya Deshmukh",
    qualification: "M.S., DNB (General & Trauma Surgery)",

    specialty: "General Surgery",
    section: "Main",
    verified: true,

    username: "priyadeshmukh",
    room: "Room 112",
    staffId: "IMP-238",
  },

  {
    id: "IMP-037",
    name: "Dr. Sarah Jenkins",
    qualification: "M.D. (Emergency Medicine & Resuscitation)",

    specialty: "Emergency Medicine",
    section: "Main",
    verified: true,

    username: "sarahjenkins",
    room: "ER Bay 2",
    staffId: "IMP-239",
  },

  {
    id: "IMP-038",
    name: "Dr. Arjun Mehta",
    qualification: "M.D., D.M. (Cardiology)",

    specialty: "Cardiology",
    section: "Main",
    verified: true,

    username: "arjunmehta",
    room: "Room 104",
    staffId: "IMP-240",
  },

  {
    id: "IMP-039",
    name: "Dr. David Anderson",
    qualification: "M.S. (Orthopedics / Trauma)",

    specialty: "Orthopedics",
    section: "Main",
    verified: true,

    username: "davidanderson",
    room: "Room 109",
    staffId: "IMP-241",
  },
]

export function getDefaultFeeForSpecialty(specialty?: string | null): number {
  if (!specialty) return 500
  const s = specialty.toLowerCase()
  if (s.includes("neuro")) return 800
  if (s.includes("ortho")) return 700
  if (s.includes("cardio")) return 500
  if (s.includes("gastro")) return 600
  if (s.includes("gyne") || s.includes("obg")) return 400
  if (s.includes("pedia")) return 450
  if (s.includes("urology")) return 600
  if (s.includes("oncology")) return 900
  if (s.includes("vascular")) return 750
  if (s.includes("critical")) return 700
  if (s.includes("radiology")) return 350
  if (s.includes("ent")) return 400
  return 500
}

const DOCTOR_MASTER_KEY = "hospai_doctor_master_v3"

export function getDoctorMaster(): MasterDoctor[] {
  INITIAL_DOCTOR_MASTER.forEach((d) => {
    if (typeof d.consultationFee !== "number" || isNaN(d.consultationFee)) {
      d.consultationFee = getDefaultFeeForSpecialty(d.specialty)
    }
  })

  if (typeof window === "undefined") return INITIAL_DOCTOR_MASTER

  try {
    const stored = window.localStorage.getItem(DOCTOR_MASTER_KEY)

    if (!stored) {
      window.localStorage.setItem(
        DOCTOR_MASTER_KEY,
        JSON.stringify(INITIAL_DOCTOR_MASTER),
      )

      return INITIAL_DOCTOR_MASTER
    }

    const parsed: MasterDoctor[] = JSON.parse(stored)

    const existingNames = new Set(parsed.map((d) => d.name.toLowerCase()))

    let updated = false

    for (const initDoc of INITIAL_DOCTOR_MASTER) {
      if (!existingNames.has(initDoc.name.toLowerCase())) {
        parsed.push(initDoc)

        existingNames.add(initDoc.name.toLowerCase())

        updated = true
      }
    }

    for (const d of parsed) {
      if (typeof d.consultationFee !== "number" || isNaN(d.consultationFee)) {
        d.consultationFee = getDefaultFeeForSpecialty(d.specialty)

        updated = true
      }
    }

    if (updated) {
      window.localStorage.setItem(DOCTOR_MASTER_KEY, JSON.stringify(parsed))
    }

    return parsed
  } catch {
    return INITIAL_DOCTOR_MASTER
  }
}

export function saveDoctorMaster(doctors: MasterDoctor[]): void {
  if (typeof window === "undefined") {
    doctors.forEach((updatedDoc) => {
      const idx = INITIAL_DOCTOR_MASTER.findIndex((d) => d.id === updatedDoc.id)
      if (idx !== -1) {
        INITIAL_DOCTOR_MASTER[idx] = updatedDoc
      } else {
        INITIAL_DOCTOR_MASTER.push(updatedDoc)
      }
    })
    return
  }

  try {
    window.localStorage.setItem(DOCTOR_MASTER_KEY, JSON.stringify(doctors))

    // Dispatch custom event for real-time update in current tab

    window.dispatchEvent(new Event("doctor_master_updated"))
  } catch (e) {
    console.error("Failed to save doctor master", e)
  }
}

export function addDoctorMaster(doctor: MasterDoctor): MasterDoctor[] {
  const current = getDoctorMaster()

  const updated = [...current, doctor]

  saveDoctorMaster(updated)

  return updated
}

export function updateDoctorMaster(
  updatedDoctor: MasterDoctor,
): MasterDoctor[] {
  const current = getDoctorMaster()

  const updated = current.map((d) =>
    d.id === updatedDoctor.id ? updatedDoctor : d,
  )

  saveDoctorMaster(updated)

  return updated
}

export function deleteDoctorMaster(id: string): MasterDoctor[] {
  const current = getDoctorMaster()

  const updated = current.filter((d) => d.id !== id)

  saveDoctorMaster(updated)

  return updated
}

/** Static fallback export for components reading DOCTOR_MASTER at top-level */

export const DOCTOR_MASTER: MasterDoctor[] = getDoctorMaster()

/** Doctors who may be shown a login, triaged to, and booked. */

export const ACTIVE_DOCTORS = DOCTOR_MASTER.filter(
  (d) => d.verified && d.specialty,
)

/** Rows the hospital still has to complete before they can be used. */

export const UNVERIFIED_DOCTORS = DOCTOR_MASTER.filter((d) => !d.verified)

/** Every specialty that has at least one usable doctor behind it. */

export const ACTIVE_SPECIALTIES = Array.from(
  new Set(ACTIVE_DOCTORS.map((d) => d.specialty as string)),
).sort()

export function getDoctorByName(name: string): MasterDoctor | undefined {
  if (!name) return undefined
  const norm = name.replace(/^Dr\.\s*/i, "").trim().toLowerCase()
  return getDoctorMaster().find(
    (d) =>
      d.name.toLowerCase() === name.toLowerCase() ||
      d.name.replace(/^Dr\.\s*/i, "").trim().toLowerCase() === norm,
  )
}

export function getDoctorConsultationFee(name: string): number {
  if (!name) return 500
  const doc = getDoctorByName(name)
  if (doc && typeof doc.consultationFee === "number" && doc.consultationFee >= 0) {
    return doc.consultationFee
  }
  return 500
}

export function doctorsForSpecialty(specialty: string): MasterDoctor[] {
  return getDoctorMaster().filter(
    (d) => d.verified && d.specialty === specialty,
  )
}

export function availabilityOf(
  doctor: MasterDoctor,
): {
  bookable: boolean

  label: string

  onRequest: boolean
} {
  if (!doctor.verified || !doctor.specialty) {
    return { bookable: false, label: "Needs verification", onRequest: false }
  }

  return doctor.section === "Main"
    ? { bookable: true, label: "Available today", onRequest: false }
    : { bookable: true, label: "On request", onRequest: true }
}

export function pickDoctorForSpecialty(
  specialty: string,

  load: (doctorName: string) => number,
): MasterDoctor | undefined {
  const candidates = doctorsForSpecialty(specialty)

  if (!candidates.length) return undefined

  const byPreference = [...candidates].sort((a, b) => {
    if (a.section !== b.section) return a.section === "Main" ? -1 : 1

    return load(a.name) - load(b.name)
  })

  return byPreference[0]
}
