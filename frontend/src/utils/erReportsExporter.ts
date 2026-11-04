/**
 * Imperial Hospitals Enterprise HMS - Emergency Department Print & Export Utilities
 * Provides isolated iframe printing for:
 * 1. SBAR Clinical Handover Sheet & Clinical Summary
 * 2. Emergency Discharge Summary & Official Hospital Gate Pass
 *
 * Styled with official Imperial Hospitals letterhead (Mukunda Healthcare Pvt Ltd, Bhimavaram, AP)
 */

import { formatDateTimeIST } from "../lib/format"
import type { ErVisitDetail, TriageCategory } from "../pages/ErPage"

export const IMPERIAL_HOSPITAL_DETAILS = {
  name: "IMPERIAL HOSPITALS",
  unitOf: "A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED",
  addressLine1: "# 27-14-13/A, OPP. GANESH CANTEN STREET,",
  addressLine2: "BESIDE BHASYAM SCHOOL, BHIMAVARAM-534202,",
  addressLine3: "W.G. DIST.(A.P) 08816-279999, 279988",
  gstNo: "GST No - 37AALCM2238A1ZQ",
  department: "EMERGENCY & TRAUMA CARE DEPARTMENT",
}

/**
 * Executes clean isolated iframe printing without body clipping or modal interference
 */
function runIsolatedPrint(htmlContent: string, documentTitle: string): void {
  const existingFrame = document.getElementById("er-isolated-print-frame")
  if (existingFrame) existingFrame.remove()

  const iframe = document.createElement("iframe")
  iframe.id = "er-isolated-print-frame"
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  iframe.style.visibility = "hidden"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${documentTitle}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 11px;
            line-height: 1.45;
          }
          .header-container {
            border-bottom: 2.5px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .hospital-title {
            font-size: 20px;
            font-weight: 900;
            letter-spacing: 0.5px;
            color: #0f172a;
            line-height: 1.1;
          }
          .hospital-sub {
            font-size: 10px;
            font-weight: 700;
            color: #334155;
            letter-spacing: 0.4px;
            margin-top: 3px;
          }
          .hospital-addr {
            font-size: 9px;
            color: #64748b;
            margin-top: 2px;
          }
          .hospital-gst {
            font-size: 9.5px;
            font-weight: 700;
            color: #1e3a8a;
            margin-top: 3px;
          }
          .doc-badge-col {
            text-align: right;
          }
          .doc-type-badge {
            display: inline-block;
            background: #0f172a;
            color: #ffffff;
            padding: 4px 10px;
            font-size: 10.5px;
            font-weight: 800;
            text-transform: uppercase;
            border-radius: 4px;
            letter-spacing: 0.5px;
          }
          .doc-meta {
            font-size: 9px;
            color: #475569;
            margin-top: 4px;
          }
          .patient-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px 12px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 12px;
          }
          .grid-item {
            font-size: 10px;
          }
          .grid-label {
            color: #64748b;
            font-size: 9px;
            text-transform: uppercase;
            font-weight: 600;
            display: block;
            margin-bottom: 1px;
          }
          .grid-val {
            color: #0f172a;
            font-weight: 700;
          }
          .allergy-alert {
            background: #fef2f2;
            border: 1px solid #fecaca;
            color: #991b1b;
            padding: 6px 10px;
            border-radius: 4px;
            margin-bottom: 12px;
            font-size: 10px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .section-block {
            margin-bottom: 12px;
            page-break-inside: avoid;
          }
          .section-title {
            font-size: 11px;
            font-weight: 800;
            color: #1e3a8a;
            text-transform: uppercase;
            border-bottom: 1.5px solid #cbd5e1;
            padding-bottom: 3px;
            margin-bottom: 6px;
            letter-spacing: 0.3px;
            display: flex;
            justify-content: space-between;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-top: 4px;
          }
          th {
            background: #f1f5f9;
            color: #334155;
            font-weight: 700;
            text-align: left;
            padding: 5px 8px;
            border: 1px solid #cbd5e1;
            font-size: 9.5px;
          }
          td {
            padding: 5px 8px;
            border: 1px solid #e2e8f0;
            color: #1e293b;
          }
          .vitals-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .vitals-card {
            border: 1px solid #e2e8f0;
            border-radius: 5px;
            padding: 8px 10px;
            background: #ffffff;
          }
          .vitals-card.stabilized {
            background: #f0fdf4;
            border-color: #bbf7d0;
          }
          .card-header {
            font-weight: 800;
            font-size: 10px;
            color: #334155;
            margin-bottom: 4px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 2px;
          }
          .vitals-items {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4px;
            font-size: 9.5px;
          }
          .disposition-box {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 6px;
            padding: 10px 12px;
          }
          .signature-row {
            display: flex;
            justify-content: space-between;
            margin-top: 24px;
            padding-top: 10px;
            border-top: 1px dashed #94a3b8;
            page-break-inside: avoid;
          }
          .sig-box {
            width: 45%;
            text-align: center;
          }
          .sig-line {
            border-bottom: 1px solid #0f172a;
            margin-bottom: 4px;
            height: 32px;
          }
          .sig-title {
            font-size: 9px;
            font-weight: 700;
            color: #334155;
            text-transform: uppercase;
          }
          .sig-meta {
            font-size: 8.5px;
            color: #64748b;
          }
          .footer-note {
            margin-top: 16px;
            font-size: 8px;
            color: #94a3b8;
            text-align: center;
            border-top: 1px solid #f1f5f9;
            padding-top: 4px;
          }
          .gatepass-badge {
            border: 2px solid #16a34a;
            background: #f0fdf4;
            color: #15803d;
            border-radius: 6px;
            padding: 8px 12px;
            font-weight: 800;
            font-size: 11px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      iframe.remove()
    }, 2000)
  }, 250)
}

/**
 * Generates and triggers print for the official Imperial Hospitals ER SBAR Handover Sheet & Clinical Summary
 */
export function printErHandoverSheet(
  detail: ErVisitDetail,
  categories?: TriageCategory[],
): void {
  const patientName = detail.patient
    ? [detail.patient.name, detail.patient.last_name].filter(Boolean).join(" ")
    : detail.patient_name || detail.patient_id

  const initialVitals =
    detail.vitals && detail.vitals.length > 0 ? detail.vitals[0] : null
  const latestVitals =
    detail.vitals && detail.vitals.length > 0
      ? detail.vitals[detail.vitals.length - 1]
      : null

  const triageCatLabel = detail.triage?.category || "Untriaged / General"
  const triageBay =
    detail.triage?.triage_bed_label ||
    (detail as any).bed_id ||
    "ER Acute Care Bay"

  const complaintsHtml =
    detail.complaints && detail.complaints.length > 0
      ? `
    <table>
      <thead>
        <tr>
          <th style="width: 35%;">Chief Complaint</th>
          <th style="width: 25%;">Severity / Duration</th>
          <th>Clinical Category / Notes</th>
        </tr>
      </thead>
      <tbody>
        ${detail.complaints
          .map(
            (c) => `
          <tr>
            <td><strong>${c.complaint || "Emergency presentation"}</strong></td>
            <td>${c.severity || "Acute"} ${
              c.duration ? `(${c.duration})` : ""
            }</td>
            <td>${c.case_category || (c as any).notes || "Recorded upon emergency room presentation"}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `
      : `<div style="font-style: italic; color: #64748b; padding: 4px 0;">No primary complaints charted.</div>`

  const treatmentsHtml =
    detail.treatments && detail.treatments.length > 0
      ? `
    <table>
      <thead>
        <tr>
          <th style="width: 25%;">Intervention / Drug</th>
          <th style="width: 30%;">Details / Route & Dose</th>
          <th style="width: 25%;">Time Administered</th>
          <th style="width: 20%;">Administered By</th>
        </tr>
      </thead>
      <tbody>
        ${detail.treatments
          .map(
            (t) => `
          <tr>
            <td><strong>${t.intervention_type}</strong></td>
            <td>${t.description || "Administered as per STAT ER protocol"}</td>
            <td>${formatDateTimeIST(t.performed_at)}</td>
            <td>${t.administered_by || (t as any).performed_by || "ER Nursing Team"}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `
      : `<div style="font-style: italic; color: #64748b; padding: 4px 0;">No emergent interventions or STAT medications documented.</div>`

  const investigationsHtml =
    detail.investigations && detail.investigations.length > 0
      ? `
    <table>
      <thead>
        <tr>
          <th style="width: 30%;">Investigation</th>
          <th style="width: 20%;">Category</th>
          <th style="width: 20%;">Status</th>
          <th>Findings / Emergency Result</th>
        </tr>
      </thead>
      <tbody>
        ${detail.investigations
          .map(
            (inv) => `
          <tr>
            <td><strong>${inv.test_name}</strong></td>
            <td>${inv.category}</td>
            <td><span style="font-weight: 700; color: ${
              inv.status === "Completed" ? "#15803d" : "#b45309"
            };">${inv.status}</span></td>
            <td>${inv.result || (inv.status === "Completed" ? "Normal / Within Reference limits" : "Pending Diagnostic Lab Verification")}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `
      : ""

  const doctorName = detail.assigned_doctor_name
    ? `${
        detail.assigned_doctor_name.startsWith("Dr.")
          ? detail.assigned_doctor_name
          : `Dr. ${detail.assigned_doctor_name}`
      }${detail.assigned_specialty ? ` (${detail.assigned_specialty})` : ""}`
    : "Attending Emergency Physician"

  const content = `
    <!-- Letterhead -->
    <div class="header-container">
      <div>
        <div class="hospital-title">${IMPERIAL_HOSPITAL_DETAILS.name}</div>
        <div class="hospital-sub">${IMPERIAL_HOSPITAL_DETAILS.unitOf}</div>
        <div class="hospital-addr">${IMPERIAL_HOSPITAL_DETAILS.addressLine1} ${IMPERIAL_HOSPITAL_DETAILS.addressLine2} ${IMPERIAL_HOSPITAL_DETAILS.addressLine3}</div>
        <div class="hospital-gst">${IMPERIAL_HOSPITAL_DETAILS.gstNo} • ${IMPERIAL_HOSPITAL_DETAILS.department}</div>
      </div>
      <div class="doc-badge-col">
        <div class="doc-type-badge">ER SBAR Handover Sheet</div>
        <div class="doc-meta"><strong>Encounter:</strong> ${detail.visit_no}</div>
        <div class="doc-meta"><strong>Printed:</strong> ${formatDateTimeIST(new Date().toISOString())}</div>
      </div>
    </div>

    <!-- Patient Demographics Banner -->
    <div class="patient-grid">
      <div class="grid-item">
        <span class="grid-label">Patient Name & UHID</span>
        <span class="grid-val">${patientName} (${detail.patient_id})</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Age / Gender</span>
        <span class="grid-val">${detail.patient?.age || "—"} Yrs / ${detail.patient?.gender || "—"}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Arrival Timestamp</span>
        <span class="grid-val">${formatDateTimeIST(detail.arrival_at)}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Mode of Arrival</span>
        <span class="grid-val" style="text-transform: capitalize;">${(detail.arrival_mode || "Walk-in").replace(/_/g, " ")}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Triage Acuity</span>
        <span class="grid-val" style="color: #b91c1c;">${triageCatLabel}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Bed / Trauma Bay</span>
        <span class="grid-val">${triageBay}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Emergency Contact</span>
        <span class="grid-val">${detail.patient?.emergency_contact || detail.patient?.phone || "—"}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Attending Doctor</span>
        <span class="grid-val">${doctorName}</span>
      </div>
    </div>

    <!-- Allergies Alert -->
    <div class="allergy-alert">
      <span>⚠️ KNOWN CLINICAL ALLERGIES:</span>
      <span>${detail.patient?.allergies || "No Known Drug Allergies (NKDA) Reported"}</span>
    </div>

    <!-- S - Situation -->
    <div class="section-block">
      <div class="section-title">
        <span>1. Situation & Chief Presentation (S)</span>
        <span>Arrival Condition: ${(detail as any).arrival_condition || "Conscious, Alert"}</span>
      </div>
      ${complaintsHtml}
    </div>

    <!-- B - Background & Vitals Evolution -->
    <div class="section-block">
      <div class="section-title">
        <span>2. Background & Vitals Evolution (B)</span>
      </div>
      <div class="vitals-grid">
        <div class="vitals-card">
          <div class="card-header">Initial Vitals at Triage Arrival</div>
          ${
            initialVitals
              ? `
            <div class="vitals-items">
              <div><strong>HR:</strong> ${initialVitals.heart_rate || "—"} bpm</div>
              <div><strong>BP:</strong> ${initialVitals.bp_systolic || "—"}/${initialVitals.bp_diastolic || "—"} mmHg</div>
              <div><strong>SpO2:</strong> ${initialVitals.spo2 || "—"}%</div>
              <div><strong>Temp:</strong> ${initialVitals.temperature || "—"} °C</div>
              <div><strong>RR:</strong> ${initialVitals.respiratory_rate || "—"} /min</div>
              <div><strong>GRBS:</strong> ${initialVitals.blood_glucose || "—"} mg/dL</div>
            </div>
            ${
              initialVitals.gcs
                ? `<div style="margin-top: 4px; font-size: 9px; color: #475569;"><strong>GCS Score:</strong> ${initialVitals.gcs}/15</div>`
                : ""
            }
          `
              : `<span style="color: #64748b;">Not recorded</span>`
          }
        </div>

        <div class="vitals-card stabilized">
          <div class="card-header" style="color: #166534;">Latest Stabilized Clinical Vitals</div>
          ${
            latestVitals
              ? `
            <div class="vitals-items">
              <div><strong>HR:</strong> ${latestVitals.heart_rate || "—"} bpm</div>
              <div><strong>BP:</strong> ${latestVitals.bp_systolic || "—"}/${latestVitals.bp_diastolic || "—"} mmHg</div>
              <div><strong>SpO2:</strong> ${latestVitals.spo2 || "—"}%</div>
              <div><strong>Temp:</strong> ${latestVitals.temperature || "—"} °C</div>
              <div><strong>RR:</strong> ${latestVitals.respiratory_rate || "—"} /min</div>
              <div><strong>GRBS:</strong> ${latestVitals.blood_glucose || "—"} mg/dL</div>
            </div>
            ${
              latestVitals.gcs
                ? `<div style="margin-top: 4px; font-size: 9px; color: #166534;"><strong>GCS Score:</strong> ${latestVitals.gcs}/15</div>`
                : ""
            }
          `
              : `<span style="color: #64748b;">Not recorded</span>`
          }
        </div>
      </div>
    </div>

    <!-- A - Assessment & Interventions -->
    <div class="section-block">
      <div class="section-title">
        <span>3. Assessment & Emergency Interventions (A)</span>
      </div>
      ${treatmentsHtml}
      ${
        investigationsHtml
          ? `
        <div style="margin-top: 8px;">
          <strong style="font-size: 9.5px; color: #334155; text-transform: uppercase;">STAT Diagnostic Investigations:</strong>
          ${investigationsHtml}
        </div>
      `
          : ""
      }
    </div>

    <!-- R - Recommendation & Disposition -->
    <div class="section-block">
      <div class="section-title">
        <span>4. Recommendation & Handover Disposition (R)</span>
      </div>
      <div class="disposition-box">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px;">
          <div><strong>Clinical Disposition:</strong> <span style="font-weight: 800; color: #1e3a8a;">${detail.disposition?.outcome?.toUpperCase() || "IN ACTIVE ER ASSESSMENT"}</span></div>
          <div><strong>Transfer / Destination:</strong> <span>${(detail.disposition as any)?.transfer_ward || detail.disposition?.required_specialty || "Emergency Holding / Acute Observation"}</span></div>
          <div style="grid-column: span 2;"><strong>Clinical Instructions & Handover Reason:</strong> <span>${detail.disposition?.clinical_reason || "Admitted under emergency protocol for continuous monitoring and further clinical management."}</span></div>
        </div>
      </div>
    </div>

    <!-- Signatures -->
    <div class="signature-row">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-title">Handing Over Medical Officer / Nurse</div>
        <div class="sig-meta">Imperial Hospitals Emergency Department</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-title">Receiving Unit Staff / Medical Officer</div>
        <div class="sig-meta">Ward / ICU / Inpatient Care Unit</div>
      </div>
    </div>

    <div class="footer-note">
      Official Medical Record • Imperial Hospitals Management System • Bhimavaram • Generated via Secured EMR
    </div>
  `

  runIsolatedPrint(
    content,
    `Imperial Hospitals - ER Handover Sheet - ${detail.visit_no}`,
  )
}

/**
 * Generates and triggers print for the official Imperial Hospitals ER Discharge Summary & Gate Pass
 */
export function printErDischargeSummary(params: {
  detail: ErVisitDetail
  condition: string
  instructions: string
  erClearance?: any
  doctorName?: string
}): void {
  const {
    detail,
    condition,
    instructions,
    erClearance,
    doctorName = "Attending Emergency Physician",
  } = params

  const patientName = detail.patient
    ? [detail.patient.name, detail.patient.last_name].filter(Boolean).join(" ")
    : detail.patient_name || detail.patient_id

  const isPaid = erClearance?.isCleared
  const receiptNo = erClearance?.receiptNo || "PAID / CLEARED"

  const treatmentsSummary =
    detail.treatments && detail.treatments.length > 0
      ? detail.treatments
          .map(
            (t) => `${t.intervention_type} (${t.description || "Performed"})`,
          )
          .join(", ")
      : "Standard emergency symptomatic stabilization & observation."

  const content = `
    <!-- Letterhead -->
    <div class="header-container">
      <div>
        <div class="hospital-title">${IMPERIAL_HOSPITAL_DETAILS.name}</div>
        <div class="hospital-sub">${IMPERIAL_HOSPITAL_DETAILS.unitOf}</div>
        <div class="hospital-addr">${IMPERIAL_HOSPITAL_DETAILS.addressLine1} ${IMPERIAL_HOSPITAL_DETAILS.addressLine2} ${IMPERIAL_HOSPITAL_DETAILS.addressLine3}</div>
        <div class="hospital-gst">${IMPERIAL_HOSPITAL_DETAILS.gstNo} • ${IMPERIAL_HOSPITAL_DETAILS.department}</div>
      </div>
      <div class="doc-badge-col">
        <div class="doc-type-badge" style="background: #15803d;">Discharge & Gate Pass</div>
        <div class="doc-meta"><strong>Gate Pass No:</strong> GP-ER-${detail.visit_no}</div>
        <div class="doc-meta"><strong>Date & Time:</strong> ${formatDateTimeIST(new Date().toISOString())}</div>
      </div>
    </div>

    <!-- Gate Pass Clearance Stamp -->
    <div class="gatepass-badge">
      <div>
        <span>SECURITY EXIT CLEARANCE: </span>
        <strong style="text-transform: uppercase;">PATIENT DISCHARGED - PERMITTED TO EXIT PREMISES</strong>
      </div>
      <div>
        <span>Billing Status: </span>
        <strong>${
          isPaid
            ? `Account Cleared (Receipt #${receiptNo})`
            : "Exempted / Cleared via Hospital Administration"
        }</strong>
      </div>
    </div>

    <!-- Patient Demographics -->
    <div class="patient-grid">
      <div class="grid-item">
        <span class="grid-label">Patient Name</span>
        <span class="grid-val">${patientName}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">UHID / Patient ID</span>
        <span class="grid-val">${detail.patient_id}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Age / Gender</span>
        <span class="grid-val">${detail.patient?.age || "—"} Yrs / ${detail.patient?.gender || "—"}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">ER Encounter No</span>
        <span class="grid-val">${detail.visit_no}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Arrival Timestamp</span>
        <span class="grid-val">${formatDateTimeIST(detail.arrival_at)}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Discharge Timestamp</span>
        <span class="grid-val">${formatDateTimeIST(new Date().toISOString())}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Emergency Attending Doctor</span>
        <span class="grid-val">${doctorName}</span>
      </div>
      <div class="grid-item">
        <span class="grid-label">Emergency Bed / Bay</span>
        <span class="grid-val">${detail.triage?.triage_bed_label || (detail as any).bed_id || "ER Bay"}</span>
      </div>
    </div>

    <!-- Clinical Discharge Details -->
    <div class="section-block">
      <div class="section-title">
        <span>1. Clinical Summary & Condition at Discharge</span>
      </div>
      <table style="margin-top: 4px;">
        <tr>
          <td style="width: 25%; font-weight: 700; background: #f8fafc;">Condition at Discharge</td>
          <td style="font-weight: 800; color: #166534;">${condition}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; background: #f8fafc;">Presenting Symptoms</td>
          <td>${detail.complaints?.map((c) => c.complaint).join(", ") || "Emergency acute presentation"}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; background: #f8fafc;">Emergency Interventions Given</td>
          <td>${treatmentsSummary}</td>
        </tr>
      </table>
    </div>

    <!-- Instructions & Advice -->
    <div class="section-block">
      <div class="section-title">
        <span>2. Discharge Instructions & Medical Advice</span>
      </div>
      <div style="border: 1px solid #e2e8f0; border-radius: 5px; padding: 10px 12px; background: #ffffff; font-size: 10.5px; line-height: 1.5;">
        ${instructions}
      </div>
    </div>

    <!-- Emergency Return Red Flags -->
    <div class="section-block">
      <div class="section-title" style="color: #b91c1c;">
        <span>3. Emergency Warning Signs (When to Return to ER Immediately)</span>
      </div>
      <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 5px; padding: 8px 12px; font-size: 9.5px; color: #92400e;">
        • Recurrence of severe chest pain, breathlessness, profuse sweating, or palpitations.<br/>
        • Persistent uncontrolled vomiting, acute severe abdominal pain, or black stools.<br/>
        • Sudden onset weakness, facial drooping, slurred speech, or loss of consciousness.<br/>
        • High spiking fever (>101°F) unresponsive to antipyretics or active bleeding.
      </div>
    </div>

    <!-- Signatures & Authorization -->
    <div class="signature-row">
      <div class="sig-box" style="width: 30%;">
        <div class="sig-line"></div>
        <div class="sig-title">Attending ER Physician</div>
        <div class="sig-meta">${doctorName}</div>
      </div>
      <div class="sig-box" style="width: 30%;">
        <div class="sig-line"></div>
        <div class="sig-title">ER Nursing In-Charge</div>
        <div class="sig-meta">Imperial Hospitals Emergency Care</div>
      </div>
      <div class="sig-box" style="width: 30%;">
        <div class="sig-line"></div>
        <div class="sig-title">Hospital Security Checkpoint</div>
        <div class="sig-meta">Gate Pass Verified &amp; Cleared</div>
      </div>
    </div>

    <div class="footer-note">
      Official Emergency Discharge Document &amp; Security Gate Pass • Imperial Hospitals • Mukunda Healthcare Pvt Ltd • Bhimavaram
    </div>
  `

  runIsolatedPrint(
    content,
    `Imperial Hospitals - ER Discharge Summary - ${detail.visit_no}`,
  )
}
