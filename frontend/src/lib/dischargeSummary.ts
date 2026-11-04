import { apiFetch } from "./api"
import { formatDateTimeIST } from "./format"

// Minimal shape of GET /api/emr/<patient_id> this module actually reads --
// kept standalone (rather than importing PatientChart.tsx's private types)
// so both the Clinical page and Bed Management's discharge flow can build
// the same summary without depending on each other.
type EmrSlice = {
  patient: {
    patient_id: string
    name: string
    last_name?: string | null
    phone?: string | null
    email?: string | null
  }
  admissions: {
    id: number
    admission_date: string
    discharge_date?: string | null
  }[]
  notes: {
    chief_complaint?: string | null
    notes?: string | null
    follow_up?: string | null
    created_at: string
  }[]
  observation_notes: {
    doctor_name?: string | null
    note: string
    treatment_plan?: string | null
    created_at: string
    role?: string | null
    admission_id?: number | null
  }[]
  vitals: {
    bp?: string | null
    pulse?: string | null
    temperature?: string | null
    created_at: string
  }[]
  diagnoses: { diagnosis_name: string ;created_at: string }[]
  medication_schedules: {
    medicine_name: string
    dosage?: string | null
    schedule_time: string
    administered?: number | boolean
  }[]
  prescriptions: {
    medicine_name: string
    dosage?: string | null
    created_at: string
  }[]
  labs: { test_name: string ;status?: string | null ;created_at: string }[]
}

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return `${title}\n  (none recorded)\n`
  return `${title}\n${lines.map((l) => `  - ${l}`).join("\n")}\n`
}

// Compiles everything recorded during one admission -- doctor notes, nurse
// notes, clinical notes, vitals, diagnoses, medications, and lab results --
// into one plain-text discharge summary. Deliberately not AI-narrated: every
// line traces back to a real row the hospital actually recorded, so nothing
// in the summary can be something that never happened.
export function buildDischargeSummaryText(
  emr: EmrSlice,
  admissionId?: number,
): string {
  const patientName =
    `${emr.patient.name || ""} ${emr.patient.last_name || ""}`.trim()
  const admission = admissionId
    ? emr.admissions.find((a) => a.id === admissionId)
    : emr.admissions[0]

  // observation_notes are the one table that actually carries admission_id,
  // so they're scoped exactly. Everything else (clinical_notes, vitals,
  // diagnoses, medications, prescriptions, labs) has no admission link in
  // the schema, so a same-patient's *other* admission would otherwise leak
  // into this one's summary -- date-windowing to [admission_date, discharge
  // date or now] is the closest honest proxy for "happened during this stay."
  const windowStart = admission
    ? new Date(admission.admission_date).getTime()
    : -Infinity
  const windowEnd = admission?.discharge_date
    ? new Date(admission.discharge_date).getTime()
    : Date.now()
  const inWindow = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= windowStart && t <= windowEnd
  }

  const scopedObservationNotes = emr.observation_notes.filter(
    (n) =>
      (admissionId ? n.admission_id === admissionId : true) &&
      inWindow(n.created_at),
  )

  const doctorNotes = scopedObservationNotes
    .filter((n) => n.role === "doctor")
    .map(
      (n) =>
        `${formatDateTimeIST(n.created_at)} — ${
          n.doctor_name ? `Dr. ${n.doctor_name}: ` : ""
        }${n.note}${n.treatment_plan ? ` (Plan: ${n.treatment_plan})` : ""}`,
    )

  const nurseNotes = scopedObservationNotes
    .filter((n) => n.role === "nurse")
    .map(
      (n) =>
        `${formatDateTimeIST(n.created_at)} — ${
          n.doctor_name ? `${n.doctor_name}: ` : ""
        }${n.note}${n.treatment_plan ? ` (Plan: ${n.treatment_plan})` : ""}`,
    )

  const otherEvaluations = scopedObservationNotes
    .filter((n) => n.role !== "doctor" && n.role !== "nurse")
    .map(
      (n) =>
        `${formatDateTimeIST(n.created_at)} — ${
          n.doctor_name ? `${n.doctor_name}: ` : ""
        }${n.note}${n.treatment_plan ? ` (Plan: ${n.treatment_plan})` : ""}`,
    )

  const clinicalNotes = emr.notes
    .filter((n) => inWindow(n.created_at))
    .map(
      (n) =>
        `${formatDateTimeIST(n.created_at)} — ${
          n.chief_complaint ? `${n.chief_complaint}: ` : ""
        }${n.notes || ""}${n.follow_up ? ` (Follow-up: ${n.follow_up})` : ""}`,
    )

  const vitalsLines = emr.vitals
    .filter((v) => inWindow(v.created_at))
    .map(
      (v) =>
        `${formatDateTimeIST(v.created_at)} — BP ${v.bp || "—"}, Pulse ${v.pulse || "—"}, Temp ${v.temperature || "—"}`,
    )

  const diagnosisLines = emr.diagnoses
    .filter((d) => inWindow(d.created_at))
    .map((d) => `${d.diagnosis_name} (${formatDateTimeIST(d.created_at)})`)

  const medicationLines = emr.medication_schedules
    .filter((m) => inWindow(m.schedule_time))
    .map(
      (m) =>
        `${m.medicine_name} ${m.dosage || ""} — ${formatDateTimeIST(m.schedule_time)} — ${
          m.administered ? "Administered" : "Pending"
        }`,
    )

  const prescriptionLines = emr.prescriptions
    .filter((p) => inWindow(p.created_at))
    .map(
      (p) =>
        `${p.medicine_name} ${p.dosage || ""} — prescribed ${formatDateTimeIST(p.created_at)}`,
    )

  const labLines = emr.labs
    .filter((l) => inWindow(l.created_at))
    .map(
      (l) =>
        `${l.test_name} — ${l.status || "due"} (${formatDateTimeIST(l.created_at)})`,
    )

  return [
    `DISCHARGE SUMMARY`,
    `Patient: ${patientName} (${emr.patient.patient_id})`,
    admission
      ? `Admitted: ${formatDateTimeIST(admission.admission_date)}   Discharged: ${
          admission.discharge_date
            ? formatDateTimeIST(admission.discharge_date)
            : formatDateTimeIST(new Date().toISOString())
        }`
      : `Admission record not found -- summary compiled from full patient history.`,
    ``,
    section("DIAGNOSES", diagnosisLines),
    section("DOCTOR NOTES", doctorNotes),
    section("NURSE NOTES", nurseNotes),
    section("OTHER CLINICAL EVALUATIONS", otherEvaluations),
    section("CLINICAL NOTES", clinicalNotes),
    section("VITALS RECORDED", vitalsLines),
    section("MEDICATIONS ADMINISTERED / SCHEDULED", medicationLines),
    section("PHARMACY PRESCRIPTIONS", prescriptionLines),
    section("LAB / DIAGNOSTIC TESTS", labLines),
  ].join("\n")
}

export type SavedDischargeSummary = {
  patientId: string
  patientName: string
  phone: string
  email?: string
  text: string
}

// Generates the summary from the real /api/emr/<patient_id> data and saves
// it as a real certificate record (certificate_type: "discharge_summary") --
// so it's a permanent part of the patient's chart, not a one-off printout.
// Returns what was saved, so the discharge desk can send that same summary to
// the patient rather than a second, separately-built one.
export async function generateAndSaveDischargeSummary(
  patientId: string,
  admissionId?: number,
): Promise<SavedDischargeSummary> {
  const emr = await apiFetch<EmrSlice>(`/api/emr/${patientId}`)
  const body = buildDischargeSummaryText(emr, admissionId)
  const patientName =
    `${emr.patient.name || ""} ${emr.patient.last_name || ""}`.trim()
  await apiFetch(`/api/patients/${patientId}/certificates`, {
    method: "POST",
    body: JSON.stringify({
      certificate_type: "discharge_summary",
      title: `Discharge Summary — ${patientName || patientId}`,
      body,
      admission_id: admissionId,
    }),
  })
  return {
    patientId,
    patientName: patientName || patientId,
    phone: emr.patient.phone || "",
    email: emr.patient.email || "",
    text: body,
  }
}
