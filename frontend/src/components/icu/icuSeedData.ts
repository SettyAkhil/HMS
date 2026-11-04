import type { FlowsheetRecord } from "./IcuFlowsheet"
import { safeLocalStorageSetItem, freeLocalStorageQuota } from "../../utils/storageQuotaManager"

const storageKey = (patientId: string, date: string) =>
  `icu.flowsheet.${patientId}.${date}`

/** Generate YYYY-MM-DD date string offset by -daysAgo from today */
export function getPastDateStr(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

/** Return current system date (YYYY-MM-DD) and time (HH:mm) */
export function getCurrentDateTimeFormatted(): {
  dateStr: string
  timeStr: string
} {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  return { dateStr, timeStr: `${hours}:${minutes}` }
}

/**
 * Get array of stay day objects for a patient with length of stay (default 10 days).
 * Sorted NEWEST FIRST (Day 10 TODAY at top, down to Day 1).
 */
export function getPatientStayDays(
  totalDays: number = 10,
): { dayNumber: number ;dateStr: string ;label: string ;isToday: boolean }[] {
  const days: {
    dayNumber: number
    dateStr: string
    label: string
    isToday: boolean
  }[] = []
  for (let i = 0; i < totalDays; i++) {
    const dayNumber = totalDays - i
    const dateStr = getPastDateStr(i)
    const dateObj = new Date(dateStr + "T00:00:00")
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
    const isToday = i === 0
    days.push({
      dayNumber,
      dateStr,
      label: `Day ${dayNumber} (${formattedDate})`,
      isToday,
    })
  }
  return days
}

export type SuggestedMed = {
  drug: string
  dose: string
  route: string
  freq: string
  indication: string
}

/** Return patient-specific suggested doctor medications based on diagnosis */
export function getPatientSuggestedMedications(
  dx: string | null,
): SuggestedMed[] {
  if (!dx) {
    return [
      {
        drug: "Norepinephrine Drip",
        dose: "0.08 mcg/kg/min",
        route: "IV",
        freq: "Continuous",
        indication: "Hemodynamic support",
      },
      {
        drug: "Vancomycin",
        dose: "1g",
        route: "IV",
        freq: "Q12H",
        indication: "Empiric coverage",
      },
      {
        drug: "Furosemide",
        dose: "20 mg",
        route: "IV",
        freq: "BD",
        indication: "Diuresis",
      },
    ]
  }

  const d = dx.toLowerCase()

  if (d.includes("stemi") || d.includes("pci") || d.includes("cardiac")) {
    return [
      {
        drug: "Norepinephrine Drip",
        dose: "0.12 mcg/kg/min",
        route: "IV",
        freq: "Continuous",
        indication: "MAP > 65 mmHg",
      },
      {
        drug: "Heparin Sodium Drip",
        dose: "1,200 units/hr",
        route: "IV",
        freq: "Continuous",
        indication: "Post-PCI anticoagulation",
      },
      {
        drug: "Ticagrelor (Brilinta)",
        dose: "90 mg",
        route: "PO/NG",
        freq: "BD",
        indication: "Dual antiplatelet",
      },
      {
        drug: "Aspirin",
        dose: "81 mg",
        route: "PO/NG",
        freq: "OD",
        indication: "Cardioprotection",
      },
      {
        drug: "Atorvastatin",
        dose: "80 mg",
        route: "PO",
        freq: "OD",
        indication: "Plaque stabilization",
      },
      {
        drug: "Nitroglycerin Drip",
        dose: "10 mcg/min",
        route: "IV",
        freq: "Continuous",
        indication: "Ischemia / Preload reduction",
      },
      {
        drug: "Furosemide (Lasix)",
        dose: "40 mg",
        route: "IV",
        freq: "BD",
        indication: "Pulmonary congestion",
      },
    ]
  }

  if (
    d.includes("septic") ||
    d.includes("pneumonia") ||
    d.includes("infection")
  ) {
    return [
      {
        drug: "Norepinephrine Drip",
        dose: "0.08 mcg/kg/min",
        route: "IV",
        freq: "Continuous",
        indication: "Septic shock protocol",
      },
      {
        drug: "Vancomycin",
        dose: "1g",
        route: "IV",
        freq: "Q12H",
        indication: "Gram-positive coverage",
      },
      {
        drug: "Pip-Tazo (Zosyn)",
        dose: "3.375g",
        route: "IV",
        freq: "Q6H",
        indication: "Pseudomonal coverage",
      },
      {
        drug: "Meropenem",
        dose: "1g",
        route: "IV",
        freq: "Q8H",
        indication: "Resistant sepsis",
      },
      {
        drug: "Hydrocortisone",
        dose: "50 mg",
        route: "IV",
        freq: "Q6H",
        indication: "Refractory shock",
      },
    ]
  }

  if (
    d.includes("cabg") ||
    d.includes("laparotomy") ||
    d.includes("surgery") ||
    d.includes("post-op")
  ) {
    return [
      {
        drug: "Nitroglycerin Drip",
        dose: "10 mcg/min",
        route: "IV",
        freq: "Continuous",
        indication: "Graft spasm prevention",
      },
      {
        drug: "Hydromorphone (Dilaudid) PCA",
        dose: "0.2 mg/hr",
        route: "IV",
        freq: "Continuous",
        indication: "Post-op analgesia",
      },
      {
        drug: "Cefazolin (Ancef)",
        dose: "1g",
        route: "IV",
        freq: "Q8H",
        indication: "Surgical prophylaxis",
      },
      {
        drug: "Furosemide",
        dose: "20 mg",
        route: "IV",
        freq: "OD",
        indication: "Volume management",
      },
    ]
  }

  if (
    d.includes("stroke") ||
    d.includes("thrombectomy") ||
    d.includes("tbi") ||
    d.includes("neuro")
  ) {
    return [
      {
        drug: "Labetalol Drip",
        dose: "2 mg/min",
        route: "IV",
        freq: "Continuous",
        indication: "Strict SBP < 140 mmHg",
      },
      {
        drug: "Nicardipine Drip",
        dose: "5 mg/hr",
        route: "IV",
        freq: "Continuous",
        indication: "Cerebral perfusion control",
      },
      {
        drug: "Mannitol 20%",
        dose: "100 mL",
        route: "IV",
        freq: "Q6H",
        indication: "ICP management",
      },
      {
        drug: "Aspirin",
        dose: "81 mg",
        route: "PO",
        freq: "OD",
        indication: "Secondary stroke prevention",
      },
    ]
  }

  if (
    d.includes("dka") ||
    d.includes("diabetes") ||
    d.includes("ketoacidosis")
  ) {
    return [
      {
        drug: "Insulin Regular Drip",
        dose: "0.05 u/kg/hr",
        route: "IV",
        freq: "Continuous",
        indication: "DKA protocol",
      },
      {
        drug: "D5 1/2 NS + 20 mEq KCl",
        dose: "150 mL/hr",
        route: "IV",
        freq: "Continuous",
        indication: "Euglycemic hydration",
      },
      {
        drug: "Potassium Chloride IV",
        dose: "20 mEq",
        route: "IV",
        freq: "STAT",
        indication: "Hypokalemia prevention",
      },
    ]
  }

  if (
    d.includes("rsv") ||
    d.includes("pediatric") ||
    d.includes("bronchiolitis")
  ) {
    return [
      {
        drug: "Pediatric Albuterol Nebulizer",
        dose: "2.5 mg",
        route: "Neb",
        freq: "Q4H",
        indication: "Bronchospasm",
      },
      {
        drug: "3% Hypertonic Saline",
        dose: "4 mL",
        route: "Neb",
        freq: "Q6H",
        indication: "Mucus clearance",
      },
      {
        drug: "D5 1/4 NS",
        dose: "25 mL/hr",
        route: "IV",
        freq: "Continuous",
        indication: "Maintenance IV fluids",
      },
      {
        drug: "Acetaminophen (Tylenol)",
        dose: "120 mg",
        route: "PO/PR",
        freq: "Q6H",
        indication: "Fever control",
      },
    ]
  }

  return [
    {
      drug: "Norepinephrine Drip",
      dose: "0.08 mcg/kg/min",
      route: "IV",
      freq: "Continuous",
      indication: "Vasoactive support",
    },
    {
      drug: "Vancomycin",
      dose: "1g",
      route: "IV",
      freq: "Q12H",
      indication: "Antibiotic therapy",
    },
    {
      drug: "Furosemide",
      dose: "20 mg",
      route: "IV",
      freq: "BD",
      indication: "Fluid management",
    },
  ]
}

export type ExtractedRxItem = {
  drug: string
  dose: string
  route: string
  freq: string
  instructions: string
  confidence: number
}

export type SampleHandwrittenRx = {
  id: string
  doctorName: string
  dateStr: string
  timeStr: string
  specialty: string
  imageUrl: string
  previewTitle: string
  extractedItems: ExtractedRxItem[]
}

export const SAMPLE_HANDWRITTEN_PRESCRIPTIONS: SampleHandwrittenRx[] = [
  {
    id: "rx-stemi",
    doctorName: "Dr. Shah, MD (Critical Care)",
    dateStr: getPastDateStr(0),
    timeStr: "14:30",
    specialty: "Cardiology & ICU",
    imageUrl:
      "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
    previewTitle: "Handwritten Rx — STEMI Post-PCI Protocol",
    extractedItems: [
      {
        drug: "Norepinephrine Drip",
        dose: "0.12 mcg/kg/min",
        route: "IV",
        freq: "Continuous",
        instructions: "Titrate to MAP > 65 mmHg",
        confidence: 98,
      },
      {
        drug: "Heparin Sodium Drip",
        dose: "1,200 units/hr",
        route: "IV",
        freq: "Continuous",
        instructions: "Target aPTT 60-80s",
        confidence: 96,
      },
      {
        drug: "Ticagrelor (Brilinta)",
        dose: "90 mg",
        route: "PO",
        freq: "BD",
        instructions: "Take with water at 09:00, 21:00",
        confidence: 94,
      },
      {
        drug: "Furosemide (Lasix)",
        dose: "40 mg",
        route: "IV",
        freq: "BD",
        instructions: "Give IV push slowly over 2 mins",
        confidence: 95,
      },
    ],
  },
  {
    id: "rx-sepsis",
    doctorName: "Dr. Patel, MD (Infectious Disease)",
    dateStr: getPastDateStr(0),
    timeStr: "11:15",
    specialty: "Critical Care Sepsis Protocol",
    imageUrl:
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80",
    previewTitle: "Handwritten Rx — Septic Shock Antimicrobials",
    extractedItems: [
      {
        drug: "Vancomycin",
        dose: "1g",
        route: "IV",
        freq: "Q12H",
        instructions: "Infuse over 120 mins; trough before 4th dose",
        confidence: 97,
      },
      {
        drug: "Pip-Tazo (Zosyn)",
        dose: "3.375g",
        route: "IV",
        freq: "Q6H",
        instructions: "Extended infusion over 4 hours",
        confidence: 95,
      },
      {
        drug: "Hydrocortisone",
        dose: "50 mg",
        route: "IV",
        freq: "Q6H",
        instructions: "IV push for refractory hypotension",
        confidence: 93,
      },
    ],
  },
  {
    id: "rx-stroke",
    doctorName: "Dr. Wong, MD (Neurosurgery)",
    dateStr: getPastDateStr(0),
    timeStr: "09:45",
    specialty: "Neuro ICU Stroke Protocol",
    imageUrl:
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&auto=format&fit=crop&q=80",
    previewTitle: "Handwritten Rx — Acute Stroke & ICP Control",
    extractedItems: [
      {
        drug: "Labetalol Drip",
        dose: "2 mg/min",
        route: "IV",
        freq: "Continuous",
        instructions: "Maintain SBP 120-140 mmHg",
        confidence: 98,
      },
      {
        drug: "Mannitol 20%",
        dose: "100 mL",
        route: "IV",
        freq: "Q6H",
        instructions: "Filter tube; monitor serum osmolality",
        confidence: 92,
      },
      {
        drug: "Atorvastatin",
        dose: "80 mg",
        route: "PO",
        freq: "OD",
        instructions: "Nighttime administration",
        confidence: 96,
      },
    ],
  },
]

/**
 * Generate rich, clinical 10-day ICU flowsheet seed data for Thomas Reed (MRN 100301) or other patients.
 */
export function generateSeedRecord(
  patientId: string,
  dayNumber: number,
  dateStr: string,
  totalDays: number = 10,
): FlowsheetRecord {
  const hours = Array.from(
    { length: 24 },
    (_, i) => `${String((8 + i) % 24).padStart(2, "0")}:00`,
  )
  const twoHourly = hours.filter((_, i) => i % 2 === 0)

  const isEarly = dayNumber <= 3
  const isMid = dayNumber > 3 && dayNumber <= 6

  const baseHr = isEarly
    ? 114 - (dayNumber - 1) * 3
    : isMid
      ? 104 - (dayNumber - 3) * 3
      : 92 - (dayNumber - 6) * 2
  const sysBp = isEarly
    ? 94 + (dayNumber - 1) * 2
    : isMid
      ? 102 + (dayNumber - 3) * 3
      : 118 + (dayNumber - 6) * 2
  const diaBp = Math.round(sysBp * 0.62)
  const tempVal = isEarly
    ? (38.6 - (dayNumber - 1) * 0.2).toFixed(1)
    : (37.4 - (dayNumber - 4) * 0.1).toFixed(1)
  const spo2Val = isEarly ? 91 + (dayNumber - 1) * 2 : isMid ? 96 : 98

  const ventMode =
    isEarly || dayNumber <= 5
      ? "A/C-VC"
      : dayNumber <= 7
        ? "SIMV+PS"
        : "HFNC / Mask"
  const fio2 = isEarly
    ? 60 - (dayNumber - 1) * 5
    : isMid
      ? 45 - (dayNumber - 3) * 5
      : 30
  const peep = isEarly ? 8 : isMid ? 6 : 5
  const tv = isEarly ? 480 : 450

  const gcsEye = isEarly ? 2 : isMid ? 3 : 4
  const gcsVerbal = isEarly ? 1 : isMid ? 3 : 5
  const gcsMotor = isEarly ? 4 : isMid ? 5 : 6
  const rassScore = isEarly
    ? "-3 Moderate sedation"
    : isMid
      ? "-1 Drowsy"
      : "0 Alert and calm"

  const intakeMl = isEarly
    ? 3400 - (dayNumber - 1) * 150
    : isMid
      ? 2800 - (dayNumber - 3) * 200
      : 2100
  const outputMl = isEarly
    ? 1100 + (dayNumber - 1) * 250
    : isMid
      ? 1850 + (dayNumber - 3) * 200
      : 2300
  const netBalance = intakeMl - outputMl

  let cumBalance = 0
  for (let d = 1; d <= dayNumber; d++) {
    const dIntake =
      d <= 3 ? 3400 - (d - 1) * 150 : d <= 6 ? 2800 - (d - 3) * 200 : 2100
    const dOutput =
      d <= 3 ? 1100 + (d - 1) * 250 : d <= 6 ? 1850 + (d - 3) * 200 : 2300
    cumBalance += dIntake - dOutput
  }

  const lactate = isEarly
    ? (4.8 - (dayNumber - 1) * 0.9).toFixed(1)
    : (2.1 - (dayNumber - 3) * 0.3).toFixed(1)
  const wbc = isEarly
    ? (19.2 - (dayNumber - 1) * 1.2).toFixed(1)
    : (14.5 - (dayNumber - 3) * 1.1).toFixed(1)
  const creat = isEarly
    ? (2.4 - (dayNumber - 1) * 0.2).toFixed(1)
    : (1.8 - (dayNumber - 3) * 0.2).toFixed(1)
  const hb = isEarly
    ? (8.4 + (dayNumber - 1) * 0.3).toFixed(1)
    : (9.6 + (dayNumber - 3) * 0.3).toFixed(1)

  const hourlyObs: Record<string, string> = {}
  hours.forEach((h, idx) => {
    const hrVariation = Math.floor(Math.sin(idx) * 4)
    const bpVariation = Math.floor(Math.cos(idx) * 5)
    hourlyObs[`${h}|temp`] = tempVal
    hourlyObs[`${h}|hr`] = String(baseHr + hrVariation)
    hourlyObs[`${h}|pulse`] = String(baseHr + hrVariation)
    hourlyObs[`${h}|bp`] =
      `${sysBp + bpVariation}/${diaBp + Math.floor(bpVariation * 0.6)}`
    hourlyObs[`${h}|map`] = String(
      Math.round(
        (sysBp + bpVariation + 2 * (diaBp + Math.floor(bpVariation * 0.6))) / 3,
      ),
    )
    hourlyObs[`${h}|spo2`] = String(spo2Val)
    hourlyObs[`${h}|vent_mode`] = ventMode
    hourlyObs[`${h}|fio2`] = String(fio2)
    hourlyObs[`${h}|peep`] = String(peep)
    hourlyObs[`${h}|tv`] = String(tv)
    hourlyObs[`${h}|pip`] = String(isEarly ? 32 : 24)
    hourlyObs[`${h}|rr_t`] = String(isEarly ? 18 : 16)
    hourlyObs[`${h}|ph`] = isEarly ? "7.28" : "7.38"
    hourlyObs[`${h}|pco2`] = isEarly ? "46" : "40"
    hourlyObs[`${h}|po2`] = isEarly ? "78" : "92"
    hourlyObs[`${h}|lactate`] = String(lactate)
  })

  const hourlyRass: Record<string, string> = {}
  twoHourly.forEach((h) => {
    hourlyRass[`${h}|score`] = rassScore
  })

  const scaleGcs: Record<string, string> = {}
  hours.forEach((h) => {
    scaleGcs[`${h}|eyes`] =
      gcsEye === 4 ? "Spontaneously" : gcsEye === 3 ? "To speech" : "To pain"
    scaleGcs[`${h}|verbal`] =
      gcsVerbal === 5
        ? "Oriented, Converses"
        : gcsVerbal === 3
          ? "Inappropriate words"
          : "No response"
    scaleGcs[`${h}|motor`] =
      gcsMotor === 6
        ? "Obeys verbal commands"
        : gcsMotor === 5
          ? "Localises pain"
          : "Flexion withdraws, not able to localise pain"
  })

  const hourlyIntake: Record<string, string> = {}
  const hourlyOutput: Record<string, string> = {}
  const hourlyInPerHr = Math.round(intakeMl / 24)
  const hourlyOutPerHr = Math.round(outputMl / 24)
  hours.forEach((h) => {
    hourlyIntake[`${h}|infusions`] = String(Math.round(hourlyInPerHr * 0.5))
    hourlyIntake[`${h}|iv_fluid`] = String(Math.round(hourlyInPerHr * 0.5))
    hourlyIntake[`${h}|total`] = String(hourlyInPerHr)
    hourlyOutput[`${h}|urine_ml_hr`] = String(hourlyOutPerHr)
    hourlyOutput[`${h}|output_total`] = String(hourlyOutPerHr)
    hourlyOutput[`${h}|balance`] = String(hourlyInPerHr - hourlyOutPerHr)
  })

  const isAppanna = patientId === "100888" || patientId === "P-100888" || patientId === "UMR10088"

  return {
    patientId,
    date: dateStr,
    fields: {
      "admission.primary_consultant": isAppanna
        ? "Dr. Vance (General & Trauma Surgery)"
        : "Dr. Patel (Cardiology)",
      "admission.icu_consultant": "Dr. Shah (Critical Care)",
      "admission.day_in_icu": String(dayNumber),
      "admission.doa": getPastDateStr(totalDays - 1),
      "admission.dos": getPastDateStr(totalDays - 1),
      "admission.height": isAppanna ? "172" : "175",
      "admission.weight": isAppanna ? "68" : "78",
      "admission.blood_group": "B+",
      "admission.diagnosis": isAppanna
        ? "Blunt Abdominal Trauma, Grade IV Splenic Rupture s/p Laparotomy & Splenectomy, Jejunal Repair, Hemorrhagic Shock"
        : "STEMI — Anterior wall, s/p PCI to LAD, Cardiogenic shock",
      "admission.allergy": isAppanna ? "NKDA" : "Penicillin (rash)",
      "admission.procedure": isAppanna
        ? "Emergency Exploratory Laparotomy + Splenectomy + Primary Two-Layer Jejunal Repair + Peritoneal Lavage"
        : "Emergency PCI with EES stent to Proximal LAD",
      "admission.past_history": isAppanna
        ? "No prior chronic illness"
        : "HTN, Type 2 DM, Hyperlipidemia",
      "admission.active_problem": isAppanna
        ? (dayNumber <= 4
            ? "Post-op Hemorrhagic Shock, Mechanical Ventilation, Splenic Drain"
            : dayNumber <= 8
              ? "Weaned to HFNC/Room Air, Drain monitoring, Wound healing"
              : "Extubated, Hemodynamically Stable, Tolerating Oral Diet, Cleared for Ward Stepdown")
        : (dayNumber <= 5
            ? "Cardiogenic Shock, Respiratory Failure"
            : "Weaning vasopressors, Post-PCI monitoring"),
      "admission.diet_plan": isAppanna
        ? (dayNumber <= 4
            ? "NPO / Continuous NG aspiration"
            : dayNumber <= 7
              ? "Clear liquids 50 mL/hr"
              : "High-Protein Soft Diet")
        : (dayNumber <= 6
            ? "NPO / Enteral tube feed 30ml/hr"
            : "Diabetic, Low Salt Soft Diet"),
      "balance_24h.intake": String(intakeMl),
      "balance_24h.output": String(outputMl),
      "balance_24h.uo": String(Math.round(outputMl * 0.85)),
      "balance_24h.drain": isAppanna
        ? String(Math.max(30, 450 - (dayNumber - 1) * 45))
        : "150",
      "balance_24h.balance": String(netBalance),
      "balance_24h.cumulative_balance": String(cumBalance),
      "pressure_ulcer.stage": "Stage 1",
      "pressure_ulcer.site": "Sacrum",
      "handover.m_initials": "RN Murphy",
      "handover.e_initials": "RN Davis",
      "handover.n_initials": "RN Jenkins",
    },
    tables: {
      day_plan: [
        {
          time: "08:00",
          shift: "Day",
          order: "Titrate Norepinephrine to maintain MAP > 65 mmHg",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Murphy",
        },
        {
          time: "10:00",
          shift: "Day",
          order: "Check ABG post-ventilator adjustment",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Murphy",
        },
        {
          time: "14:00",
          shift: "Day",
          order:
            dayNumber > 6
              ? "Trial on HFNC 40L 35%"
              : "Daily sedation vacation and GCS assessment",
          dr_sign: "Dr. Patel",
          nurse_sign: "RN Murphy",
        },
        {
          time: "20:00",
          shift: "Night",
          order: "Repeat Troponin I and Lactic Acid",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Jenkins",
        },
      ],
      drug_chart: [
        {
          drug: "Norepinephrine Drip",
          dose: isEarly ? "0.12 mcg/kg/min" : "0.04 mcg/kg/min",
          route: "IV",
          freq: "Continuous",
          times: "08:00-08:00",
          nurse_sign: "RN Murphy",
        },
        {
          drug: "Heparin Sodium Drip",
          dose: "1,200 units/hr",
          route: "IV",
          freq: "Continuous",
          times: "08:00-08:00",
          nurse_sign: "RN Murphy",
        },
        {
          drug: "Aspirin",
          dose: "81 mg",
          route: "PO/NG",
          freq: "OD",
          times: "09:00",
          nurse_sign: "RN Murphy",
        },
        {
          drug: "Ticagrelor",
          dose: "90 mg",
          route: "PO/NG",
          freq: "BD",
          times: "09:00, 21:00",
          nurse_sign: "RN Murphy",
        },
        {
          drug: "Atorvastatin",
          dose: "80 mg",
          route: "PO",
          freq: "OD",
          times: "21:00",
          nurse_sign: "RN Jenkins",
        },
        {
          drug: "Furosemide",
          dose: "40 mg",
          route: "IV",
          freq: "BD",
          times: "08:00, 20:00",
          nurse_sign: "RN Murphy",
        },
      ],
      labs: [
        {
          date: dateStr,
          time: "06:00",
          hb,
          tlc: wbc,
          platelet: "210",
          urea: "45",
          creatinine: creat,
          na: "138",
          k: "4.2",
          cl: "102",
          bili: "0.9",
        },
      ],
      antibiotics: isAppanna
        ? [
            {
              present: "Meropenem 1g IV Q8H",
              day: String(dayNumber),
              previous: "Ceftriaxone",
              start_date: getPastDateStr(totalDays - 1),
              stop_date: "",
            },
            {
              present: "Metronidazole 500mg IV Q8H",
              day: String(dayNumber),
              previous: "",
              start_date: getPastDateStr(totalDays - 1),
              stop_date: "",
            },
          ]
        : [
            {
              present: "Cefepime 2g IV Q8H",
              day: String(dayNumber),
              previous: "Pip-Tazo",
              start_date: getPastDateStr(totalDays - 1),
              stop_date: "",
            },
          ],
    },
    grids: {},
    hourly: {
      observations: hourlyObs,
      rass: hourlyRass,
      intake: hourlyIntake,
      output: hourlyOutput,
    },
    scales: {
      gcs: scaleGcs,
    },
    updatedAt: new Date().toISOString(),
  }
}

/** Seed multi-day ICU flow chart records into localStorage for a patient if not already seeded */
export function ensureMultiDaySeedData(
  patientId: string = "100301",
  totalDays: number = 2,
): void {
  try {
    const stayDays = getPatientStayDays(Math.min(totalDays, 2))
    for (const { dayNumber, dateStr } of stayDays) {
      const key = storageKey(patientId, dateStr)
      const existing = localStorage.getItem(key)
      if (!existing) {
        const record = generateSeedRecord(
          patientId,
          dayNumber,
          dateStr,
          Math.min(totalDays, 3),
        )
        const saved = safeLocalStorageSetItem(key, JSON.stringify(record))
        if (!saved) break
      }
    }
  } catch (err) {
    // Graceful error silence
  }
}

// Immediate storage cleanup: prune bloated historical ICU flowsheet seeds from localStorage
// to guarantee permanent free quota headroom for clinical registration and patient records
if (typeof window !== "undefined") {
  try {
    freeLocalStorageQuota()
  } catch {}
  try {
    const todayStr = new Date().toISOString().split("T")[0]
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith("icu.flowsheet.") && !k.endsWith(todayStr)) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k)
      } catch {}
    })

    // Seed lightweight Day 1 data for Deepak Patel if not already present
    seedDeepakPatelDay1Data()
  } catch (e) {
    console.warn("ICU seed initialization skipped:", e)
  }
}

/** Complete Day 1 flowsheet record with 100% of fields filled across all sections */
export function generateDeepakDay1FullRecord(dateStr: string): FlowsheetRecord {
  const patientId = "100239"
  const hours = Array.from(
    { length: 24 },
    (_, i) => `${String((8 + i) % 24).padStart(2, "0")}:00`,
  )
  const twoHourly = hours.filter((_, i) => i % 2 === 0)

  // Hourly observations for all 24 hours
  const hourlyObs: Record<string, string> = {}
  hours.forEach((h, idx) => {
    const tempProgress = (38.8 - (idx / 24) * 1.4).toFixed(1)
    const hrProgress = Math.round(118 - (idx / 24) * 26)
    const sysBp = Math.round(96 + (idx / 24) * 22)
    const diaBp = Math.round(60 + (idx / 24) * 14)
    const mapVal = Math.round((sysBp + 2 * diaBp) / 3)
    const spo2Val = Math.min(98, Math.round(92 + (idx / 24) * 6))
    const fio2Val = Math.max(45, Math.round(60 - (idx / 24) * 15))
    const lactateVal = (3.8 - (idx / 24) * 1.9).toFixed(1)
    const pipVal = Math.round(32 - (idx / 24) * 6)
    const pplatVal = Math.round(26 - (idx / 24) * 4)
    const phVal = (7.31 + (idx / 24) * 0.08).toFixed(2)
    const pco2Val = Math.round(45 - (idx / 24) * 5)
    const po2Val = Math.round(80 + (idx / 24) * 16)
    const bsVal = Math.round(172 - (idx / 24) * 36)

    hourlyObs[`${h}|temp`] = String(tempProgress)
    hourlyObs[`${h}|pulse`] = String(hrProgress)
    hourlyObs[`${h}|hr`] = String(hrProgress)
    hourlyObs[`${h}|bp`] = `${sysBp}/${diaBp}`
    hourlyObs[`${h}|map`] = String(mapVal)
    hourlyObs[`${h}|vent_mode`] = "A/C-VC"
    hourlyObs[`${h}|rr_t`] = "18"
    hourlyObs[`${h}|rr_s`] = String(idx < 12 ? 20 : 18)
    hourlyObs[`${h}|fio2`] = String(fio2Val)
    hourlyObs[`${h}|tv`] = "460"
    hourlyObs[`${h}|mv_set`] = "8.3"
    hourlyObs[`${h}|mv_del`] = "8.5"
    hourlyObs[`${h}|pip`] = String(pipVal)
    hourlyObs[`${h}|pplat`] = String(pplatVal)
    hourlyObs[`${h}|peep`] = idx < 12 ? "8" : "7"
    hourlyObs[`${h}|ie`] = "1:2"
    hourlyObs[`${h}|spo2`] = String(spo2Val)
    hourlyObs[`${h}|ph`] = String(phVal)
    hourlyObs[`${h}|pco2`] = String(pco2Val)
    hourlyObs[`${h}|po2`] = String(po2Val)
    hourlyObs[`${h}|hco3`] = "22"
    hourlyObs[`${h}|be`] = "-2"
    hourlyObs[`${h}|agap`] = "12"
    hourlyObs[`${h}|lactate`] = String(lactateVal)
    hourlyObs[`${h}|sao2`] = "96"
    hourlyObs[`${h}|abg_na`] = "138"
    hourlyObs[`${h}|abg_k`] = "4.2"
    hourlyObs[`${h}|pain`] = "2"
    hourlyObs[`${h}|events`] = idx === 0 ? "Orotracheal intubation ETT 8.0" : idx === 3 ? "CVC & Art line inserted" : ""
    hourlyObs[`${h}|blood_sugar`] = String(bsVal)
    hourlyObs[`${h}|insulin`] = idx % 6 === 0 ? "4" : ""
  })

  // Hourly RASS
  const hourlyRass: Record<string, string> = {}
  twoHourly.forEach((h, idx) => {
    hourlyRass[`${h}|score`] = idx < 6 ? "-3 Moderate sedation" : "-2 Light sedation"
  })

  // Hourly GCS
  const scaleGcs: Record<string, string> = {}
  hours.forEach((h, idx) => {
    scaleGcs[`${h}|eyes`] = idx < 12 ? "To pain" : "To speech"
    scaleGcs[`${h}|verbal`] = "No response"
    scaleGcs[`${h}|motor`] = idx < 12 ? "Flexion withdraws, not able to localise pain" : "Localises pain"
  })

  // Hourly Pupils
  const hourlyPupils: Record<string, string> = {}
  hours.forEach((h) => {
    hourlyPupils[`${h}|r_size`] = "3"
    hourlyPupils[`${h}|r_reaction`] = "R"
    hourlyPupils[`${h}|l_size`] = "3"
    hourlyPupils[`${h}|l_reaction`] = "R"
    hourlyPupils[`${h}|symmetry`] = "Equal"
  })

  // Muscle power grid
  const gridMusclePower: Record<string, string> = {}
  twoHourly.forEach((h) => {
    gridMusclePower[`Power — Arm (R)|${h}`] = "3"
    gridMusclePower[`Power — Arm (L)|${h}`] = "3"
    gridMusclePower[`Power — Leg (R)|${h}`] = "4"
    gridMusclePower[`Power — Leg (L)|${h}`] = "4"
  })

  // Special care grid
  const gridSpecialCare: Record<string, string> = {}
  const specialSlots = ["8-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-22", "22-0", "0-2", "2-4", "4-6", "6-8"]
  const specialTasks = [
    "ET/TT Suctioning",
    "Steam Inhalation",
    "Chest PT",
    "Position Changing",
    "Restraint",
    "Skin Condition",
    "Bed Sore Dressing",
    "Eye Care",
    "Tracheostomy Tube Cuff Pressure",
    "Abd. Girth",
  ]
  specialTasks.forEach((task) => {
    specialSlots.forEach((slot) => {
      gridSpecialCare[`${task}|${slot}`] = task === "Position Changing" ? "Q2H Left/Right" : task === "Skin Condition" ? "Intact" : "Done"
    })
  })

  // Intake and Output 24 hourly
  const hourlyIntake: Record<string, string> = {}
  const hourlyOutput: Record<string, string> = {}
  hours.forEach((h) => {
    hourlyIntake[`${h}|infusions`] = "50"
    hourlyIntake[`${h}|sedation`] = "25"
    hourlyIntake[`${h}|iv_fluid`] = "100"
    hourlyIntake[`${h}|enteral_rtf`] = "25"
    hourlyIntake[`${h}|ml_hr`] = "200"
    hourlyIntake[`${h}|total`] = "200"

    hourlyOutput[`${h}|drain_1`] = "15"
    hourlyOutput[`${h}|drain_2`] = "10"
    hourlyOutput[`${h}|total_drain`] = "25"
    hourlyOutput[`${h}|rta_vomiting`] = "10"
    hourlyOutput[`${h}|bowel_open`] = "No"
    hourlyOutput[`${h}|urine_ml_hr`] = "65"
    hourlyOutput[`${h}|urine_total`] = "65"
    hourlyOutput[`${h}|output_total`] = "100"
    hourlyOutput[`${h}|balance`] = "+100"
  })

  return {
    patientId,
    date: dateStr,
    fields: {
      "admission.primary_consultant": "Dr. Shah (Critical Care)",
      "admission.icu_consultant": "Dr. K. Lokesh Kumar Raju (Pulmonology)",
      "admission.day_in_icu": "1",
      "admission.doa": dateStr,
      "admission.dos": dateStr,
      "admission.height": "174",
      "admission.weight": "76",
      "admission.blood_group": "B+",
      "admission.diagnosis": "Severe Community-Acquired Pneumonia with Sepsis & Acute Respiratory Distress Syndrome (ARDS)",
      "admission.allergy": "NKDA (No Known Drug Allergies)",
      "admission.procedure": "Emergency Orotracheal Intubation (ETT 8.0) + Right Internal Jugular CVC + Left Radial Arterial Line",
      "admission.past_history": "Type 2 Diabetes Mellitus x 8 years, Essential Hypertension, Non-smoker",
      "admission.active_problem": "Day 1 ICU: Severe ARDS, Septic Shock on low-dose Norepinephrine, Lung-protective invasive ventilation (6 mL/kg PBW)",
      "admission.diet_plan": "NPO / Continuous Ryle's Tube Drainage, IV Maintenance Fluids with 5% Dextrose Normal Saline",
      "pressure_ulcer.stage": "Stage 1",
      "pressure_ulcer.category": "HAPU",
      "pressure_ulcer.site": "Sacrum — Non-blanchable erythema",
      "pressure_ulcer.intervention_morning": "1",
      "pressure_ulcer.intervention_evening": "1",
      "pressure_ulcer.intervention_night": "1",
      "pressure_ulcer.pu_reported_on": dateStr,
      "pressure_ulcer.pu_relative_name": "Ramesh Patel (Brother)",
      "pressure_ulcer.iad_reported_on": dateStr,
      "pressure_ulcer.iad_relative_name": "Ramesh Patel (Brother)",
      "pressure_ulcer.incharge_name": "Sister Incharge Mary",
      "handover.m_initials": "RN Murphy",
      "handover.m_id": "RN-1042",
      "handover.e_initials": "RN Davis",
      "handover.e_id": "RN-1058",
      "handover.n_initials": "RN Jenkins",
      "handover.n_id": "RN-1089",
      "handover.m_taking_initials": "RN Davis",
      "handover.m_taking_id": "RN-1058",
      "handover.e_taking_initials": "RN Jenkins",
      "handover.e_taking_id": "RN-1089",
      "handover.n_taking_initials": "RN Murphy",
      "handover.n_taking_id": "RN-1042",
      "balance_24h.intake": "3200",
      "balance_24h.output": "1650",
      "balance_24h.uo": "1350",
      "balance_24h.drain": "200",
      "balance_24h.rta": "100",
      "balance_24h.uf": "0",
      "balance_24h.balance": "+1550",
      "balance_24h.cumulative_balance": "+1550",
      "imaging.echo": "Transthoracic Bedside Echo (Day 1): Hyperdynamic LV with normal systolic ejection fraction (LVEF 60%). No regional wall motion abnormalities. Normal RV dimensions and systolic function (TAPSE 22mm). IVC 1.8 cm with >50% respiratory collapsibility, consistent with euvolemia post-fluid resuscitation.",
      "imaging.usg": "Bedside Lung USG / BLUE Protocol (Day 1): Diffuse bilateral anterior and lateral B-lines ('lung rockets') with subpleural consolidations in bilateral posterolateral lung zones, confirming acute lung injury / ARDS secondary to bilateral pneumonia. No pleural effusion or pneumothorax.",
      "imaging.ct": "HRCT Chest (Admission): Extensive bilateral multifocal ground-glass opacities with dense dependent consolidation predominantly involving both lower lobes and lingula. Air bronchograms present. No pulmonary thromboembolism. Normal cardiac silhouette.",
    },
    tables: {
      day_plan: [
        {
          time: "08:00",
          shift: "Day",
          order: "Emergency endotracheal intubation confirmed via CXR, initiate lung-protective ventilation (6 mL/kg PBW)",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Murphy",
        },
        {
          time: "10:00",
          shift: "Day",
          order: "ABG post-intubation; titrate FiO2 to maintain SpO2 92-96%",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Murphy",
        },
        {
          time: "12:00",
          shift: "Day",
          order: "Right IJV CVC line placement & start Norepinephrine for MAP < 65 mmHg",
          dr_sign: "Dr. Lokesh Raju",
          nurse_sign: "RN Murphy",
        },
        {
          time: "16:00",
          shift: "Day",
          order: "Blood & endotracheal sputum cultures sent; commence IV Meropenem & Vancomycin",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Davis",
        },
        {
          time: "20:00",
          shift: "Night",
          order: "Maintain light-to-moderate sedation (RASS -2 to -3) with Fentanyl/Midazolam infusion",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Jenkins",
        },
        {
          time: "04:00",
          shift: "Night",
          order: "Repeat serum lactate, ABG, and electrolyte panel prior to morning consultant rounds",
          dr_sign: "Dr. Shah",
          nurse_sign: "RN Jenkins",
        },
      ],
      drug_chart: [
        {
          drug: "Norepinephrine Drip",
          dose: "0.08 mcg/kg/min",
          route: "IV",
          freq: "Continuous",
          times: "08:00-08:00",
          nurse_sign: "RN Murphy",
        },
        {
          drug: "Meropenem",
          dose: "1 g",
          route: "IV",
          freq: "Q8H",
          times: "08:00, 16:00, 00:00",
          nurse_sign: "RN Murphy",
        },
        {
          drug: "Vancomycin",
          dose: "1 g",
          route: "IV",
          freq: "Q12H",
          times: "10:00, 22:00",
          nurse_sign: "RN Davis",
        },
        {
          drug: "Pantoprazole",
          dose: "40 mg",
          route: "IV",
          freq: "OD",
          times: "08:00",
          nurse_sign: "RN Murphy",
        },
        {
          drug: "Enoxaparin",
          dose: "40 mg",
          route: "SC",
          freq: "OD",
          times: "20:00",
          nurse_sign: "RN Jenkins",
        },
        {
          drug: "Fentanyl Infusion",
          dose: "50 mcg/hr",
          route: "IV",
          freq: "Continuous",
          times: "08:00-08:00",
          nurse_sign: "RN Murphy",
        },
      ],
      sos_medication: [
        {
          time: "14:00",
          drug: "Paracetamol",
          dose: "1 g",
          route: "IV",
          nurse_sign: "RN Murphy (Fever spike 39.1°C)",
        },
        {
          time: "22:30",
          drug: "Ondansetron",
          dose: "4 mg",
          route: "IV",
          nurse_sign: "RN Jenkins (Nausea / NG reflex)",
        },
        {
          time: "03:00",
          drug: "Lorazepam",
          dose: "1 mg",
          route: "IV",
          nurse_sign: "RN Jenkins (Synchrony agitation)",
        },
      ],
      high_risk_medication: [
        {
          time: "09:00",
          drug: "Potassium Chloride (KCl)",
          dose: "40 mEq/100mL",
          route: "IV via CVC",
          double_check: "RN Murphy / RN Davis",
        },
        {
          time: "12:00",
          drug: "Regular Human Insulin",
          dose: "3 units/hr",
          route: "IV Infusion",
          double_check: "RN Murphy / RN Davis",
        },
        {
          time: "20:00",
          drug: "Heparin Sodium",
          dose: "5,000 units",
          route: "SC",
          double_check: "RN Jenkins / RN Davis",
        },
      ],
      lines_tubes: [
        {
          line: "ETT / TT",
          size: "ETT 8.0 (Cuff 24 cmH2O)",
          site: "Oral 22cm mark at incisors",
          inserted_on: dateStr,
          day: "1",
          condition: "Clear, position confirmed by CXR",
          staff: "RN Murphy #1042",
          time: "08:30",
        },
        {
          line: "Central Venous Catheter",
          size: "Triple Lumen 7 Fr 20cm",
          site: "Right Internal Jugular Vein",
          inserted_on: dateStr,
          day: "1",
          condition: "Sterile transparent dressing dry & intact",
          staff: "RN Murphy #1042",
          time: "11:00",
        },
        {
          line: "Art. line — radial / femoral",
          size: "20G Arterial Cannula",
          site: "Left Radial Artery",
          inserted_on: dateStr,
          day: "1",
          condition: "Zeroed, crisp dicrotic notch, Allen's test +",
          staff: "RN Murphy #1042",
          time: "11:30",
        },
        {
          line: "Urinary Catheter",
          size: "Foley Catheter 16 Fr",
          site: "Urethral",
          inserted_on: dateStr,
          day: "1",
          condition: "Closed drainage bag, clear amber urine",
          staff: "RN Murphy #1042",
          time: "08:45",
        },
        {
          line: "Ryles tube / PEG / NJ",
          size: "Ryle's Tube 16 Fr",
          site: "Nasogastric",
          inserted_on: dateStr,
          day: "1",
          condition: "Aspirate pH 3.5, position confirmed",
          staff: "RN Murphy #1042",
          time: "09:00",
        },
        {
          line: "Peripheral Cannula",
          size: "18G Green Cannula",
          site: "Right Forearm",
          inserted_on: dateStr,
          day: "1",
          condition: "Patent, flushes easily, no phlebitis",
          staff: "RN Murphy #1042",
          time: "08:15",
        },
      ],
      labs: [
        {
          date: dateStr,
          time: "06:00",
          hb: "11.4",
          tlc: "18.2",
          dlc: "N84 L10 M4 E2",
          platelet: "184",
          aptt: "32/30",
          pt: "13.6/12",
          inr: "1.14",
          urea: "52",
          creatinine: "1.9",
          na: "137",
          k: "4.2",
          mg: "2.1",
          ca: "8.8",
          p: "3.4",
          cl: "101",
          bili: "1.2/0.4",
          total_protein: "6.4",
          alb_glob: "3.2/3.2",
          sgot_sgpt: "42/46",
          alkp_ggtp: "88/38",
        },
        {
          date: dateStr,
          time: "16:00",
          hb: "11.0",
          tlc: "16.8",
          dlc: "N80 L14 M4 E2",
          platelet: "192",
          aptt: "31/30",
          pt: "13.2/12",
          inr: "1.10",
          urea: "48",
          creatinine: "1.8",
          na: "138",
          k: "4.3",
          mg: "2.2",
          ca: "8.9",
          p: "3.5",
          cl: "102",
          bili: "1.0/0.3",
          total_protein: "6.5",
          alb_glob: "3.3/3.2",
          sgot_sgpt: "38/40",
          alkp_ggtp: "84/36",
        },
      ],
      microbiology: [
        {
          sample: "Sputum C/S",
          date: dateStr,
          report: "Endotracheal aspirate: Moderate gram-positive diplococci (S. pneumoniae). Colony count >10^5 CFU/mL. Sensitive to Meropenem, Vancomycin, Levofloxacin.",
        },
        {
          sample: "Blood C/S",
          date: dateStr,
          report: "Peripheral Blood Culture (2 bottles): No bacterial growth detected after 24 hours of aerobic/anaerobic incubation. Final report at 5 days.",
        },
        {
          sample: "Other C/S",
          date: dateStr,
          report: "Central Venous Catheter Tip culture: Sterile at insertion. No growth after 24 hours.",
        },
        {
          sample: "Urine C/S",
          date: dateStr,
          report: "Clean catch catheter specimen: Pus cells 3-5/HPF, no significant bacteriuria (<10^3 CFU/mL).",
        },
      ],
      antibiotics: [
        {
          present: "Meropenem 1g IV Q8H",
          day: "1",
          previous: "Ceftriaxone 2g IV (ER)",
          start_date: dateStr,
          stop_date: "",
        },
        {
          present: "Vancomycin 1g IV Q12H",
          day: "1",
          previous: "Piperacillin-Tazobactam (ER)",
          start_date: dateStr,
          stop_date: "",
        },
      ],
    },
    grids: {
      muscle_power: gridMusclePower,
      special_care: gridSpecialCare,
    },
    hourly: {
      observations: hourlyObs,
      rass: hourlyRass,
      pupils: hourlyPupils,
      intake: hourlyIntake,
      output: hourlyOutput,
    },
    scales: {
      gcs: scaleGcs,
    },
    updatedAt: new Date().toISOString(),
  }
}

/** Seed complete Day 1 flowsheet data for Deepak Patel */
export function seedDeepakPatelDay1Data(): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `icu.flowsheet.100239.${today}`;
    if (!localStorage.getItem(key)) {
      const rec100239 = generateDeepakDay1FullRecord(today);
      safeLocalStorageSetItem(key, JSON.stringify(rec100239));
    }
  } catch (err) {
    // Graceful
  }
}
