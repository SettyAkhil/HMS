// The documents a patient is sent -- built from the records each screen
// already holds. Kept out of the screens so the same bill or journey PDF comes
// out whether it is sent from Billing, the patient chart or the discharge desk.

import type { ClaimRecord, PaymentRecord } from "../services/billingDb"
import type { PatientDocument } from "../services/patientMessaging"
import { buildPatientPdf, documentFilename, type DocSection } from "./patientDocumentPdf"
import { formatDateTimeIST } from "./format"
import {
  formatDate as formatSummaryDate,
  type DischargeNarrative,
  type DischargeSummaryData,
  type SummaryReview,
} from "../services/dischargeSummaryCompiler"

const rs = (n: number | undefined | null) =>
  `Rs ${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const when = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : formatDateTimeIST(iso)
}

// ── Bill ─────────────────────────────────────────────────────────────────────

export function billTitle(claim: ClaimRecord): string {
  const d = claim.department
  if (d === "Inpatient" || d === "ICU" || d === "Surgery") return "In Patient Final Bill"
  if (d === "Outpatient") return "Out Patient Consultation Bill"
  if (d === "Emergency") return "Emergency Services Bill"
  if (d === "Laboratory") return "Laboratory Bill"
  if (d === "Radiology") return "Radiology & Imaging Bill"
  return "Hospital Bill"
}

/** Template values for the bill message ({billNo}, {total}, ...). */
export function billMessageVars(claim: ClaimRecord) {
  const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-IN")
  return {
    billNo: claim.invoiceNo,
    total: fmt(claim.totalAmount),
    paid: fmt(claim.amountPaid),
    balance: fmt(claim.balanceDue),
  }
}

export async function buildBillDocument(
  claim: ClaimRecord,
  payment?: PaymentRecord | null,
): Promise<PatientDocument> {
  const items = claim.items || []
  const gross = items.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const payments = claim.payments?.length ? claim.payments : payment ? [payment] : []
  const title = `${billTitle(claim)} - ${claim.invoiceNo}`

  const sections: DocSection[] = [
    {
      heading: "Charges",
      table: {
        head: ["#", "Description", "Qty", "Rate", "Amount"],
        body: items.map((i, n) => [
          String(n + 1),
          i.description,
          String(i.quantity ?? 1),
          rs(i.unitPrice),
          rs(i.total),
        ]),
        rightAlign: [2, 3, 4],
      },
      empty: "No itemised charges on this bill.",
    },
    {
      heading: "Summary",
      rows: [
        ["Gross amount", rs(gross || claim.totalAmount)],
        ...(claim.discount ? ([["Discount", `- ${rs(claim.discount)}`]] as [string, string][]) : []),
        ...(claim.tax ? ([["Tax", rs(claim.tax)]] as [string, string][]) : []),
        ["Net amount", rs(claim.totalAmount)],
        ["Paid", rs(claim.amountPaid)],
        ["Balance due", rs(claim.balanceDue)],
      ],
    },
    {
      heading: "Payments received",
      table: {
        head: ["Receipt", "Date", "Mode", "Amount"],
        body: payments.map((p) => [p.receiptNo, when(p.paymentDate), p.paymentMethod, rs(p.amount)]),
        rightAlign: [3],
      },
      empty: "No payment recorded yet.",
    },
  ]

  return buildPatientPdf({
    title,
    filename: documentFilename(claim.patientName, "bill", claim.invoiceNo),
    patient: {
      name: claim.patientName,
      id: claim.patientId,
      phone: claim.phone,
      extra: [
        ["Bill no.", claim.invoiceNo],
        ["Department", claim.department],
        ...(claim.attendingDoctor ? ([["Consultant", claim.attendingDoctor]] as [string, string][]) : []),
        ["Date of service", when(claim.dateOfService)],
        ...(claim.insuranceProvider && claim.insuranceProvider !== "Self-Pay"
          ? ([["Payer", claim.insuranceProvider]] as [string, string][])
          : []),
      ],
    },
    sections,
    footnote:
      "Computer-generated bill. For corrections or a stamped copy, please contact the billing desk.",
  })
}

// ── Discharge summary ────────────────────────────────────────────────────────

/**
 * The summary from `buildDischargeSummaryText` (lib/dischargeSummary.ts) is
 * plain text: an ALL-CAPS heading line, then "  - item" lines. Turned back into
 * sections here so the PDF reads as a document, not a text dump.
 */
export async function buildDischargeSummaryDocument(input: {
  name: string
  id?: string
  phone?: string
  text: string
}): Promise<PatientDocument> {
  const lines = input.text.split("\n")
  const header: [string, string][] = []
  const sections: DocSection[] = []
  let current: DocSection | null = null

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "")
    if (!line.trim() || line.trim() === "DISCHARGE SUMMARY") continue
    const isHeading = /^[A-Z][A-Z0-9 /&()-]{2,}$/.test(line)
    if (isHeading) {
      current = { heading: line.charAt(0) + line.slice(1).toLowerCase(), text: "" }
      sections.push(current)
    } else if (!current) {
      const m = line.match(/^([^:]{2,30}):\s*(.*)$/)
      if (m) header.push([m[1].trim(), m[2].trim()])
      else header.push(["", line.trim()])
    } else {
      current.text += `${line.trim().replace(/^- /, "- ")}\n`
    }
  }

  return buildPatientPdf({
    title: "Discharge Summary",
    filename: documentFilename(input.name, "discharge-summary"),
    patient: {
      name: input.name,
      id: input.id,
      phone: input.phone,
      extra: header.filter(([k]) => k && k.toLowerCase() !== "patient"),
    },
    sections: sections.length
      ? sections
      : [{ heading: "Summary", text: input.text }],
    footnote:
      "Compiled from the hospital record of this admission. Continue medicines only as advised by your doctor.",
  })
}

// ── Discharge summary (Hosp AI → Clinical Summaries) ─────────────────────────

/**
 * The compiled, sectioned discharge summary -- same content and order as the
 * page shows, so the PDF a patient is sent matches what the doctor reviewed.
 */
const flagWord = (flag: string) => {
  const f = flag.toUpperCase()
  return f.startsWith("C") ? "Critical" : f === "H" ? "High" : f === "L" ? "Low" : flag
}

export async function buildCompiledDischargeSummaryDocument(
  data: DischargeSummaryData,
  narrative: DischargeNarrative | null,
  review?: SummaryReview | null,
): Promise<PatientDocument> {
  const ep = data.episode
  const day = (iso?: string | null) => (iso ? formatSummaryDate(iso) : "")
  const extra: [string, string][] = []
  if (data.patient.age != null || data.patient.gender) {
    extra.push(["Age / Sex", `${data.patient.age ?? "-"} / ${data.patient.gender || "-"}`])
  }
  if (data.patient.bloodGroup) extra.push(["Blood group", data.patient.bloodGroup])
  if (ep) {
    extra.push(["Admitted", ep.admittedAt ? when(ep.admittedAt) : "Not recorded"])
    extra.push(["Discharged", ep.dischargedAt ? when(ep.dischargedAt) : "Currently admitted"])
    if (ep.ward) extra.push(["Ward", `${ep.ward}${ep.bed ? ` (${ep.bed})` : ""}`])
    if (ep.attendingDoctor) extra.push(["Consultant", ep.attendingDoctor])
    if (ep.lengthOfStayDays) extra.push(["Length of stay", `${ep.lengthOfStayDays} day(s)`])
    if (ep.dischargeType) extra.push(["Discharge type", ep.dischargeType])
  }
  if (data.patient.address) extra.push(["Address", data.patient.address])
  if (data.patient.emergencyContact) extra.push(["Emergency contact", data.patient.emergencyContact])
  if (data.patient.allergies) extra.push(["Allergies", data.patient.allergies])

  const none = "Not recorded for this stay."
  const sections: DocSection[] = [
    {
      heading: data.diagnoses.length || !narrative?.diagnoses.length ? "Diagnosis" : "Diagnosis (as stated in the notes)",
      table: data.diagnoses.length
        ? { head: ["Diagnosis", "ICD-10"], body: data.diagnoses.map((d) => [d.text, d.code || "-"]) }
        : narrative?.diagnoses.length
          ? { head: ["Diagnosis"], body: narrative.diagnoses.map((d) => [d]) }
          : undefined,
      empty: none,
    },
  ]
  // The same "Key findings" strip the page shows under the diagnosis.
  const flagged = data.investigations.filter((i) => i.flag && i.result)
  if (flagged.length) {
    sections.push({
      heading: "Key findings",
      table: { head: ["Test", "Result", "Flag"], body: flagged.slice(0, 8).map((i) => [i.test, i.result, flagWord(i.flag!)]) },
    })
  }
  sections.push({
    heading: "Presenting complaints",
    text: data.complaints.map((c) => `- ${c.text}${c.detail ? ` (${c.detail})` : ""}`).join("\n") || undefined,
    empty: none,
  })
  const arrival = data.arrival
  if (arrival) {
    const rows = ([
      ["Arrived", arrival.at ? when(arrival.at) : ""],
      ["Mode of arrival", arrival.mode || ""],
      ["Brought by", arrival.broughtBy || ""],
      ["Condition on arrival", arrival.condition || ""],
      ["Consciousness", arrival.consciousness || ""],
      ["Triage", [arrival.triage, arrival.triageReason].filter(Boolean).join(" - ")],
    ] as [string, string][]).filter(([, v]) => v)
    if (rows.length) sections.push({ heading: "Arrival", rows })
  }
  if (narrative?.hospitalCourse) {
    sections.push({
      heading: "Hospital course",
      text: narrative.hospitalCourse,
    })
  }
  if (data.vitals.length) {
    // One column per measurement actually recorded, in the order a chart reads.
    const ORDER = ["BP", "Pulse", "Resp. rate", "SpO₂", "Temp", "GCS", "Pain", "Weight"]
    const recorded = new Set(data.vitals.flatMap((v) => v.values.map(([k]) => k)))
    const cols = [...ORDER.filter((k) => recorded.has(k)), ...[...recorded].filter((k) => !ORDER.includes(k))]
    sections.push({
      heading: "Vitals",
      table: {
        head: ["When", "Where", ...cols.map((c) => c.replace("SpO₂", "SpO2"))],
        body: data.vitals.map((v) => [when(v.at), v.label, ...cols.map((c) => v.values.find(([k]) => k === c)?.[1] || "-")]),
      },
    })
  }
  if (data.procedures.length || data.treatments.length) {
    sections.push({
      heading: "Procedures & treatment",
      table: {
        head: ["Date", "Procedure / treatment", "By / notes"],
        body: [
          ...data.procedures.map((p) => [day(p.date), p.name, [p.by, p.notes].filter(Boolean).join(" · ")]),
          ...data.treatments.map((t) => [day(t.date), `${t.kind}: ${t.text}`, t.author || ""]),
        ],
      },
    })
  }
  sections.push({
    heading: "Investigations",
    table: data.investigations.length
      ? {
          head: ["Test", "Result", "Reference", "Flag", "Date"],
          body: data.investigations.map((i) => [i.test, i.result || i.status, i.range || "", i.flag || "", day(i.date)]),
        }
      : undefined,
    empty: none,
  })
  const notedMeds = !data.dischargeMedications.length ? narrative?.dischargeMedications || [] : []
  sections.push({
    heading: notedMeds.length ? "Discharge medications (as stated in the notes)" : "Discharge medications",
    table: data.dischargeMedications.length
      ? {
          head: ["#", "Medicine", "Dose", "Frequency", "Duration", "Instructions"],
          body: data.dischargeMedications.map((m, n) => [String(n + 1), m.medicine, m.dose, m.frequency, m.duration, m.instructions]),
        }
      : notedMeds.length
        ? {
            head: ["#", "Medicine", "Dose", "Frequency", "Duration"],
            body: notedMeds.map((m, n) => [String(n + 1), m.medicine, m.dose, m.frequency, m.duration]),
          }
        : undefined,
    empty: "No discharge medications recorded.",
  })
  if (data.stayMedications.length) {
    sections.push({
      heading: "Also given during the stay",
      text: data.stayMedications.map((m) => `- ${[m.medicine, m.dose, m.frequency].filter(Boolean).join(" ")}`).join("\n"),
    })
  }
  const advice = [...data.advice.map((a) => a.text), ...(narrative?.advice || [])]
  if (advice.length) sections.push({ heading: "Advice", text: advice.map((a) => `- ${a}`).join("\n") })
  if (narrative?.followUp) sections.push({ heading: "Follow-up", text: narrative.followUp })
  if (narrative?.warningSigns.length) {
    sections.push({ heading: "Return to hospital immediately if", text: narrative.warningSigns.map((w) => `- ${w}`).join("\n") })
  }
  const condition = narrative?.conditionAtDischarge || ep?.condition || ep?.dischargeReason
  if (condition) sections.push({ heading: "Condition at discharge", text: condition })
  if (data.notes.length) {
    sections.push({
      heading: "Clinical notes",
      table: {
        head: ["When", "Note", "Details"],
        body: data.notes.map((n) => [day(n.date), [n.kind.charAt(0).toUpperCase() + n.kind.slice(1), n.author].filter(Boolean).join("\n"), n.text]),
      },
    })
  }

  return buildPatientPdf({
    title: "Discharge Summary",
    filename: documentFilename(data.patient.name, "discharge-summary"),
    patient: { name: data.patient.name, id: data.patient.ids[0], phone: data.patient.phone || undefined, extra },
    sections,
    footnote: review
      ? `Compiled from the hospital clinical record and reviewed by ${review.by} on ${when(review.at)}. Continue medicines only as advised by your doctor.`
      : "Compiled from the hospital clinical record of this stay. Continue medicines only as advised by your doctor.",
  })
}

// ── EMR report ───────────────────────────────────────────────────────────────

export type EmrReportInput = {
  patient: {
    name: string
    id?: string
    phone?: string
    age?: number | null
    gender?: string | null
    bloodGroup?: string | null
    allergies?: string | null
  }
  diagnoses: { name: string ;at?: string }[]
  vitals: { at: string ;bp?: string | null ;pulse?: string | null ;temperature?: string | null }[]
  medications: { name: string ;dosage?: string | null ;at?: string ;status?: string | null }[]
  labs: { name: string ;status?: string | null ;at?: string }[]
  notes: { at: string ;by?: string | null ;text: string }[]
  admissions: { admitted: string ;discharged?: string | null }[]
}

export async function buildEmrReportDocument(input: EmrReportInput): Promise<PatientDocument> {
  const p = input.patient
  return buildPatientPdf({
    title: "Health Record Summary",
    filename: documentFilename(p.name, "health-record"),
    patient: {
      name: p.name,
      id: p.id,
      phone: p.phone,
      extra: [
        ...(p.age ? ([["Age / sex", `${p.age} y / ${p.gender || "-"}`]] as [string, string][]) : []),
        ...(p.bloodGroup ? ([["Blood group", p.bloodGroup]] as [string, string][]) : []),
        ["Allergies", p.allergies || "None recorded"],
      ],
    },
    sections: [
      {
        heading: "Diagnoses",
        table: { head: ["Diagnosis", "Recorded"], body: input.diagnoses.map((d) => [d.name, when(d.at)]) },
        empty: "None recorded.",
      },
      {
        heading: "Admissions",
        table: {
          head: ["Admitted", "Discharged"],
          body: input.admissions.map((a) => [when(a.admitted), a.discharged ? when(a.discharged) : "In hospital"]),
        },
      },
      {
        heading: "Recent vitals",
        table: {
          head: ["When", "BP", "Pulse", "Temp"],
          body: input.vitals.slice(0, 10).map((v) => [when(v.at), v.bp || "-", v.pulse || "-", v.temperature || "-"]),
        },
        empty: "None recorded.",
      },
      {
        heading: "Medicines",
        table: {
          head: ["Medicine", "Dosage", "Prescribed", "Status"],
          body: input.medications.map((m) => [m.name, m.dosage || "-", when(m.at), m.status || "-"]),
        },
        empty: "None prescribed.",
      },
      {
        heading: "Investigations",
        table: {
          head: ["Test", "Status", "Ordered"],
          body: input.labs.map((l) => [l.name, l.status || "-", when(l.at)]),
        },
        empty: "None ordered.",
      },
      {
        heading: "Doctor's notes",
        text: input.notes
          .slice(0, 12)
          .map((n) => `${when(n.at)}${n.by ? ` - ${n.by}` : ""}\n${n.text}`)
          .join("\n\n"),
      },
    ],
    footnote:
      "A summary of your hospital record for your own reference. It is not a prescription; ask your doctor before changing any treatment.",
  })
}

// ── Visit journey ────────────────────────────────────────────────────────────

export type JourneyStep = {
  label: string
  at?: string | null
  detail?: string
  status?: string
}

export type JourneyVitals = {
  bp?: string | null
  pulse?: string | number | null
  temp?: string | number | null
  spo2?: string | number | null
  weight?: string | number | null
  notes?: string | null
}

export type JourneyPrescription = {
  medicine: string
  dosage?: string
  frequency?: string
  duration?: string
  instructions?: string
}

export interface BuildJourneyDocumentInput {
  name: string
  id?: string
  phone?: string
  email?: string
  extra?: [string, string][]
  title?: string
  opNumber?: string
  token?: string
  department?: string
  doctor?: string
  room?: string
  status?: string
  dateOfVisit?: string
  chiefComplaint?: string
  symptoms?: string[]
  vitals?: JourneyVitals
  diagnosis?: string
  icd10?: string
  advice?: string
  prescriptions?: JourneyPrescription[]
  investigations?: string[]
  billing?: {
    total?: number
    status?: string
  }
  steps: JourneyStep[]
}

export function journeyMessageVars(enc: {
  patientName?: string
  name?: string
  umr?: string
  opNumber?: string
  queueToken?: string
  assignedDoctor?: string
  dept?: string
  status?: string
  chiefComplaint?: string
  symptoms?: string[]
  vitals?: JourneyVitals
  diagnosis?: string
  advice?: string
  timestamps?: { arrival?: string; registration?: string }
  registrationTime?: string
}) {
  const v = enc.vitals
  const vitalsText =
    v && (v.bp || v.pulse || v.temp)
      ? `BP ${v.bp || "--"}, Pulse ${v.pulse || "--"} bpm, Temp ${v.temp || "--"}°F, SpO2 ${v.spo2 || "--"}%`
      : "Vitals recorded at triage"

  const symptomsText =
    enc.chiefComplaint || (enc.symptoms?.length ? enc.symptoms.join(", ") : "General evaluation")
  const visitTime =
    enc.timestamps?.arrival ||
    enc.timestamps?.registration ||
    enc.registrationTime ||
    new Date().toISOString()

  return {
    umr: enc.umr || "-",
    opNumber: enc.opNumber || "OP",
    token: enc.queueToken ? `#${enc.queueToken}` : enc.opNumber || "-",
    doctor: enc.assignedDoctor || "Attending Physician",
    dept: enc.dept || "Outpatient Care",
    status: enc.status || "Under Care",
    vitals: vitalsText,
    diagnosis: enc.diagnosis || "Consultation complete",
    advice: enc.advice
      ? enc.advice.length > 80
        ? enc.advice.slice(0, 77) + "..."
        : enc.advice
      : "Follow advised treatment",
    complaint: symptomsText.length > 60 ? symptomsText.slice(0, 57) + "..." : symptomsText,
    date: when(visitTime),
  }
}

export async function buildJourneyDocument(
  input: BuildJourneyDocumentInput,
): Promise<PatientDocument> {
  const sections: DocSection[] = []

  // 1. Clinical Intake & Presenting Symptoms
  const intakeRows: [string, string][] = []
  if (input.chiefComplaint) {
    intakeRows.push(["Chief Complaint", input.chiefComplaint])
  }
  if (input.symptoms && input.symptoms.length > 0) {
    intakeRows.push(["Reported Symptoms", input.symptoms.join(", ")])
  }
  if (intakeRows.length > 0) {
    sections.push({
      heading: "Presenting Complaints & Clinical Triage",
      rows: intakeRows,
    })
  }

  // 2. Nurse Station Vitals
  if (
    input.vitals &&
    (input.vitals.bp ||
      input.vitals.pulse ||
      input.vitals.temp ||
      input.vitals.spo2 ||
      input.vitals.weight)
  ) {
    const v = input.vitals
    const vitalsBody: string[][] = []
    if (v.bp) vitalsBody.push(["Blood Pressure", v.bp, "mmHg"])
    if (v.pulse) vitalsBody.push(["Pulse Rate", String(v.pulse), "bpm"])
    if (v.temp) vitalsBody.push(["Body Temperature", String(v.temp), "°F"])
    if (v.spo2) vitalsBody.push(["Oxygen Saturation (SpO2)", String(v.spo2), "% (Room Air)"])
    if (v.weight) vitalsBody.push(["Body Weight", String(v.weight), "kg"])

    sections.push({
      heading: "Baseline Vital Signs",
      table: {
        head: ["Parameter", "Reading", "Unit / Context"],
        body: vitalsBody,
      },
      text: v.notes ? `Nurse assessment: ${v.notes}` : undefined,
    })
  }

  // 3. Physician Consultation & Clinical Diagnosis
  const consultRows: [string, string][] = []
  if (input.diagnosis) {
    consultRows.push(["Clinical Diagnosis", input.diagnosis])
  }
  if (input.icd10) {
    consultRows.push(["ICD-10 Code", input.icd10])
  }
  if (consultRows.length > 0 || input.advice) {
    sections.push({
      heading: "Consultation & Clinical Assessment",
      rows: consultRows.length > 0 ? consultRows : undefined,
      text: input.advice ? `Physician Advice & Guidance:\n${input.advice}` : undefined,
    })
  }

  // 4. Prescriptions (Rx)
  if (input.prescriptions && input.prescriptions.length > 0) {
    sections.push({
      heading: "Prescribed Medications (Rx)",
      table: {
        head: ["#", "Medicine", "Dosage", "Frequency", "Duration"],
        body: input.prescriptions.map((rx, idx) => [
          String(idx + 1),
          rx.medicine,
          rx.dosage || "-",
          rx.frequency || "-",
          rx.duration || "-",
        ]),
      },
    })
  }

  // 5. Investigations Ordered
  if (input.investigations && input.investigations.length > 0) {
    sections.push({
      heading: "Diagnostic Investigations Ordered",
      table: {
        head: ["#", "Test / Investigation Name", "Category"],
        body: input.investigations.map((test, idx) => [
          String(idx + 1),
          test,
          "Diagnostic Evaluation",
        ]),
      },
    })
  }

  // 6. Care Milestones Chronology
  sections.push({
    heading: "Care Milestones & Progress Timeline",
    table: {
      head: ["#", "Care Stage / Milestone", "Timestamp", "Details & Department"],
      body: input.steps.map((s, i) => [
        String(i + 1),
        s.label,
        s.at ? when(s.at) : "Recorded",
        s.detail || "-",
      ]),
    },
    empty: "No milestone steps recorded for this visit yet.",
  })

  // 7. Billing Settlement Summary (if available)
  if (input.billing && (input.billing.total !== undefined || input.billing.status)) {
    sections.push({
      heading: "Financial Clearance & Billing Settlement",
      rows: [
        ...(input.billing.total !== undefined
          ? ([["Total Bill Amount", rs(input.billing.total)]] as [string, string][])
          : []),
        ...(input.billing.status ? ([["Payment Status", input.billing.status]] as [string, string][]) : []),
      ],
    })
  }

  // Clean, unified credentials for the 4-column patient header grid
  const credentialsGrid: [string, string][] = [
    ...(input.opNumber ? ([["OP Visit No.", input.opNumber]] as [string, string][]) : []),
    ...(input.token ? ([["Queue Token", input.token.startsWith("#") ? input.token : `#${input.token}`]] as [string, string][]) : []),
    ...(input.department ? ([["Department", `${input.department}${input.room ? ` (Chamber ${input.room})` : ""}`]] as [string, string][]) : []),
    ...(input.doctor ? ([["Attending Doctor", input.doctor]] as [string, string][]) : []),
    ...(input.status ? ([["Care Status", input.status]] as [string, string][]) : []),
    ...(input.dateOfVisit ? ([["Visit Date / Time", when(input.dateOfVisit)]] as [string, string][]) : []),
  ]

  return buildPatientPdf({
    title: input.title || "Outpatient Visit Journey & Care Summary",
    filename: documentFilename(input.name, "visit-journey", input.opNumber),
    patient: {
      name: input.name,
      id: input.id,
      phone: input.phone,
      extra: credentialsGrid,
    },
    sections,
    footnote:
      "Official Outpatient Visit Journey record issued by Enterprise Hospital Management System. Please retain for your medical records and future consultations.",
  })
}
