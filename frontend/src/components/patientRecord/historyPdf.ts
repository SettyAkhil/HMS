import { buildPatientPdf, documentFilename, downloadPatientDocument, type DocSection } from "../../lib/patientDocumentPdf"
import type { PatientRecord } from "./patientRecord"

const d = (ms: number | null | undefined) =>
  ms == null ? "-" : new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const ds = (iso: string | null | undefined) => {
  if (!iso) return "-"
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? d(t) : iso
}
const money = (n: number) => `Rs ${Math.round(n || 0).toLocaleString("en-IN")}`

/** The patient's complete history as one PDF, built from the compiled record. */
export async function downloadPatientHistory(r: PatientRecord) {
  const p = r.patient
  const statusText =
    r.status.kind === "IP"
      ? r.status.bed
        ? `In hospital - ${r.status.bed.ward} / Room ${r.status.bed.room_no} / Bed ${r.status.bed.bed_no}`
        : "Inpatient (latest episode)"
      : r.status.kind === "OP"
        ? "Outpatient"
        : "No visits recorded"

  const sections: DocSection[] = [
    {
      heading: "Summary",
      rows: [
        ["Current status", statusText],
        ["OP visits", String(r.opVisits.length)],
        ["Admissions", String(r.stays.length)],
        ["Doctor consultations", String(r.consultations.length)],
        ["Prescriptions", String(r.prescriptions.length)],
        ["Lab orders", String(r.labOrders.length)],
        ["ICU chart days", String(r.icuDays.length)],
        ["Billed / paid / due", `${money(r.billing.billed)} / ${money(r.billing.paid)} / ${money(r.billing.due)}`],
      ],
    },
    {
      heading: "Outpatient visits",
      table: {
        head: ["Date", "OP No.", "Department", "Doctor", "Complaint", "Diagnosis"],
        body: r.opVisits.map((v) => [v.dateOnly && v.at != null ? new Date(v.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : d(v.at), v.opNo, v.dept || "-", v.doctor || "-", v.complaint || "-", v.diagnosis || "-"]),
      },
      empty: "No OP visits recorded.",
    },
    {
      heading: "Admissions (IP)",
      table: {
        head: ["Admitted", "Discharged", "Admitted to", "Last bed", "Transfers"],
        body: r.stays.map((s) => [d(s.admittedAt), s.dischargedAt == null ? "In hospital" : d(s.dischargedAt), s.firstBed, s.lastBed, String(s.transfers)]),
      },
      empty: "No admissions recorded.",
    },
    {
      heading: "Doctor consultations",
      table: {
        head: ["Date", "Doctor", "Department", "Diagnosis", "Medicines", "Investigations"],
        body: r.consultations.map((c) => [
          ds(c.createdAt),
          c.doctorName,
          c.department || "-",
          c.diagnosis || "-",
          c.medications.map((m) => [m.name, m.strength, m.frequency].filter(Boolean).join(" ")).join("; ") || "-",
          c.labTests.map((t) => t.name).join("; ") || "-",
        ]),
      },
      empty: "No doctor-portal consultations recorded.",
    },
    {
      heading: "Prescriptions",
      table: {
        head: ["Date", "Rx", "Doctor", "Medicines", "Status"],
        body: r.prescriptions.map((p) => [
          ds(p.createdAt),
          p.id,
          p.doctorName,
          p.items.map((i) => [i.medicineName, i.dosage, i.frequency].filter(Boolean).join(" ")).join("; "),
          p.status,
        ]),
      },
      empty: "No prescriptions recorded.",
    },
    {
      heading: "Laboratory",
      table: {
        head: ["Ordered", "Order", "Test", "Result", "Status"],
        body: r.labOrders.flatMap((o) =>
          o.tests.map((t) => {
            const params = t.results ? Object.entries(t.results).filter(([, v]) => v?.value) : []
            const result = params.length
              ? params.map(([k, v]) => `${k}: ${v.value}${v.unit ? ` ${v.unit}` : ""}${v.flag ? ` (${v.flag})` : ""}`).join("; ")
              : t.result
                ? `${t.result}${t.resultUnit ? ` ${t.resultUnit}` : ""}${t.flag ? ` (${t.flag})` : ""}`
                : "-"
            return [ds(o.createdAt), o.id, t.name, result, t.status]
          }),
        ),
      },
      empty: "No lab orders recorded.",
    },
    {
      heading: "ICU daily charts",
      table: {
        head: ["Chart date", "Entries", "Last updated by", "Updated"],
        body: r.icuDays.map((x) => [x.chart_date, String(x.entry_count ?? 0), x.updated_by || "-", ds(x.updated_at)]),
      },
      empty: "No ICU charts recorded.",
    },
    ...(r.icuHandoffs.length
      ? [
          {
            heading: "ICU hand-offs",
            table: {
              head: ["Date", "From", "Type", "To", "Condition", "Doctor"],
              body: r.icuHandoffs.map((h) => [ds(h.dischargedAt), h.bed, h.dischargeType, h.destinationWard || "-", h.dischargeCondition, h.attendingDoctor || "-"]),
            },
          } as DocSection,
        ]
      : []),
    {
      heading: "Bills",
      table: {
        head: ["Date", "Invoice", "Department", "Total", "Paid", "Due"],
        body: r.bills.map((b) => [b.dateOfService || "-", b.invoiceNo, String(b.department), money(b.totalAmount), money(b.amountPaid), money(b.balanceDue)]),
        rightAlign: [3, 4, 5],
      },
      empty: r.billing.billed ? `Billed ${money(r.billing.billed)}, paid ${money(r.billing.paid)} (backend summary).` : "No bills recorded.",
    },
    {
      heading: "Complete timeline",
      table: {
        head: ["When", "Area", "Event"],
        body: r.timeline.map((t) => [d(t.at), t.stage.replace(/_/g, " "), t.label]),
      },
      empty: "Nothing recorded yet.",
    },
  ]

  const doc = await buildPatientPdf({
    title: "Complete Patient History",
    filename: documentFilename(p.name || r.id, "complete-history"),
    patient: {
      name: p.name || "Patient",
      id: r.id,
      phone: p.phone || undefined,
      extra: [
        ["Age / Sex", [p.age != null && p.age !== "" ? `${p.age} yrs` : "", p.sex].filter(Boolean).join(" / ") || "-"],
        ["Blood group", p.bloodGroup || "-"],
        ["Registered", ds(p.registeredOn)],
        ...(p.address ? ([["Address", p.address]] as [string, string][]) : []),
      ],
    },
    sections,
    footnote: `Compiled ${d(new Date(r.compiledAt).getTime())} from the hospital's records. ${r.backendReachable ? "" : "The clinical server was unreachable; admissions and server-side events may be missing."}`.trim(),
  })
  downloadPatientDocument(doc)
}
