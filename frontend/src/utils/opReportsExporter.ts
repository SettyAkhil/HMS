/**
 * Imperial Hospitals Enterprise HMS - OP Reports Export Utilities
 * Provides export functions for CSV, Excel (.xls), and PDF formats.
 * Includes hospital letterhead, report metadata, date range, filters,
 * KPI summary metrics, and the filtered OP visits dataset.
 */

import {
  EnrichedOpVisit,
  OpReportFilters,
  OpReportKpis,
} from "../services/opReportsDb"

const HOSPITAL_NAME = "IMPERIAL HOSPITALS"
const HOSPITAL_TAGLINE = "A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED"
const HOSPITAL_ADDRESS =
  "# 27-14-13/A, OPP. GANESH CANTEN STREET, BESIDE BHASYAM SCHOOL, BHIMAVARAM-534202, W.G. DIST.(A.P) • Ph: 08816-279999, 279988 • GST No - 37AALCM2238A1ZQ"

export function exportOpReportCsv(
  visits: EnrichedOpVisit[],
  filters: OpReportFilters,
  kpis: OpReportKpis,
  dateRangeLabel: string,
): void {
  const lines: string[] = []

  const escape = (val: any) => {
    if (val === null || val === undefined) return '""'
    const str = String(val).replace(/"/g, '""')
    return `"${str}"`
  }

  // Header Block
  lines.push(`${escape(HOSPITAL_NAME)}`)
  lines.push(`${escape(HOSPITAL_TAGLINE)}`)
  lines.push(`${escape(HOSPITAL_ADDRESS)}`)
  lines.push("")
  lines.push(
    `${escape("OUTPATIENT (OP) DEPARTMENT ANALYTICS & CLINICAL REPORT")}`,
  )
  lines.push(`"Generated At:",${escape(new Date().toLocaleString())}`)
  lines.push(`"Date Range:",${escape(dateRangeLabel)}`)
  lines.push(`"Department Filter:",${escape(filters.department)}`)
  lines.push(`"Doctor Filter:",${escape(filters.doctor)}`)
  lines.push(`"Visit Type Filter:",${escape(filters.visitType)}`)
  lines.push(`"Status Filter:",${escape(filters.status)}`)
  lines.push("")

  // KPI Summary
  lines.push('"EXECUTIVE KPI SUMMARY METRICS"')
  lines.push(
    `"Total OP Visits:",${kpis.totalVisits.value},"vs last period:",${escape(`${kpis.totalVisits.pctChange >= 0 ? "+" : ""}${kpis.totalVisits.pctChange}%`)}`,
  )
  lines.push(
    `"New Patients:",${kpis.newPatients.value},"vs last period:",${escape(`${kpis.newPatients.pctChange >= 0 ? "+" : ""}${kpis.newPatients.pctChange}%`)}`,
  )
  lines.push(
    `"Existing Patients:",${kpis.existingPatients.value},"vs last period:",${escape(`${kpis.existingPatients.pctChange >= 0 ? "+" : ""}${kpis.existingPatients.pctChange}%`)}`,
  )
  lines.push(
    `"Completed Consultations:",${kpis.completedConsultations.value},"vs last period:",${escape(`${kpis.completedConsultations.pctChange >= 0 ? "+" : ""}${kpis.completedConsultations.pctChange}%`)}`,
  )
  lines.push(
    `"Waiting Patients:",${kpis.waitingPatients.value},"vs last period:",${escape(`${kpis.waitingPatients.pctChange >= 0 ? "+" : ""}${kpis.waitingPatients.pctChange}%`)}`,
  )
  lines.push(
    `"Cancelled Visits:",${kpis.cancelledVisits.value},"vs last period:",${escape(`${kpis.cancelledVisits.pctChange >= 0 ? "+" : ""}${kpis.cancelledVisits.pctChange}%`)}`,
  )
  lines.push("")

  // Data Table
  lines.push('"ITEMIZED OUTPATIENT VISITS DATASET"')
  const headers = [
    "#",
    "Encounter ID",
    "Date & Time",
    "OP Number",
    "UMR",
    "Patient Name",
    "Age",
    "Gender",
    "Department",
    "Doctor",
    "Visit Type",
    "Status",
    "Chief Complaint",
    "Diagnosis",
    "Vitals (BP/Pulse)",
    "Fee (INR)",
    "Payment Status",
  ]
  lines.push(headers.map(escape).join(","))

  visits.forEach((v, index) => {
    const row = [
      index + 1,
      v.id,
      v.encounterDateTimeFormatted,
      v.opNumber,
      v.umr,
      v.patientName,
      v.age,
      v.sex,
      v.dept,
      v.assignedDoctor || v.aiDoctor || "Unassigned",
      v.derivedVisitType,
      v.statusCategory,
      v.chiefComplaint,
      v.diagnosis || "Under Evaluation",
      `${v.vitals?.bp || "—"} / ${v.vitals?.pulse || "—"}`,
      v.billing?.total || 50,
      v.billing?.status || "Paid",
    ]
    lines.push(row.map(escape).join(","))
  })

  const csvContent = lines.join("\r\n")
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  const safeDate = dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, "_")
  link.setAttribute("download", `OP_Report_${safeDate}_${Date.now()}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportOpReportExcel(
  visits: EnrichedOpVisit[],
  filters: OpReportFilters,
  kpis: OpReportKpis,
  dateRangeLabel: string,
): void {
  // Generate rich XML spreadsheet formatted HTML that opens natively in Excel with tables and colors
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>OP Reports</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11pt; color: #0F172A; }
        .title { font-size: 16pt; font-weight: bold; color: #1B4FD8; }
        .sub { font-size: 10pt; color: #475569; }
        .meta-table { margin-bottom: 16px; }
        .meta-table td { padding: 4px 8px; }
        .meta-label { font-weight: bold; color: #1E293B; background-color: #F1F5F9; }
        .kpi-table { margin-bottom: 20px; border-collapse: collapse; }
        .kpi-table th { background-color: #1E293B; color: #FFFFFF; padding: 8px 12px; text-align: left; }
        .kpi-table td { background-color: #F8FAFC; border: 1px solid #CBD5E1; padding: 8px 12px; }
        .data-table { border-collapse: collapse; width: 100%; }
        .data-table th { background-color: #1B4FD8; color: #FFFFFF; font-weight: bold; padding: 8px; border: 1px solid #0F3BA8; text-align: left; }
        .data-table td { padding: 6px 8px; border: 1px solid #E2E8F0; font-size: 9.5pt; }
        .row-even { background-color: #F8FAFC; }
        .status-completed { color: #16A34A; font-weight: bold; }
        .status-waiting { color: #D97706; font-weight: bold; }
        .status-consult { color: #0284C7; font-weight: bold; }
        .status-cancelled { color: #DC2626; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="title">${HOSPITAL_NAME}</div>
      <div class="sub">${HOSPITAL_TAGLINE} — ${HOSPITAL_ADDRESS}</div>
      <br/>
      <div style="font-size: 13pt; font-weight: bold; color: #0F172A;">Outpatient (OP) Department Operational &amp; Clinical Report</div>
      <br/>
      <table class="meta-table">
        <tr><td class="meta-label">Generated Date &amp; Time:</td><td>${new Date().toLocaleString()}</td><td class="meta-label">Selected Date Range:</td><td>${dateRangeLabel}</td></tr>
        <tr><td class="meta-label">Department Filter:</td><td>${filters.department}</td><td class="meta-label">Doctor Filter:</td><td>${filters.doctor}</td></tr>
        <tr><td class="meta-label">Visit Type Filter:</td><td>${filters.visitType}</td><td class="meta-label">Status Filter:</td><td>${filters.status}</td></tr>
      </table>
      <br/>
      <div style="font-size: 11pt; font-weight: bold; margin-bottom: 6px;">Executive KPI Summary</div>
      <table class="kpi-table">
        <tr>
          <th>Metric</th><th>Current Value</th><th>Previous Period</th><th>% Change</th>
        </tr>
        <tr><td>Total OP Visits</td><td><b>${kpis.totalVisits.value}</b></td><td>${kpis.totalVisits.previousValue}</td><td>${
          kpis.totalVisits.pctChange >= 0 ? "+" : ""
        }${kpis.totalVisits.pctChange}%</td></tr>
        <tr><td>New Patients</td><td><b>${kpis.newPatients.value}</b></td><td>${kpis.newPatients.previousValue}</td><td>${
          kpis.newPatients.pctChange >= 0 ? "+" : ""
        }${kpis.newPatients.pctChange}%</td></tr>
        <tr><td>Existing Patients</td><td><b>${kpis.existingPatients.value}</b></td><td>${kpis.existingPatients.previousValue}</td><td>${
          kpis.existingPatients.pctChange >= 0 ? "+" : ""
        }${kpis.existingPatients.pctChange}%</td></tr>
        <tr><td>Completed Consultations</td><td><b>${kpis.completedConsultations.value}</b></td><td>${kpis.completedConsultations.previousValue}</td><td>${
          kpis.completedConsultations.pctChange >= 0 ? "+" : ""
        }${kpis.completedConsultations.pctChange}%</td></tr>
        <tr><td>Waiting Patients</td><td><b>${kpis.waitingPatients.value}</b></td><td>${kpis.waitingPatients.previousValue}</td><td>${
          kpis.waitingPatients.pctChange >= 0 ? "+" : ""
        }${kpis.waitingPatients.pctChange}%</td></tr>
        <tr><td>Cancelled Visits</td><td><b>${kpis.cancelledVisits.value}</b></td><td>${kpis.cancelledVisits.previousValue}</td><td>${
          kpis.cancelledVisits.pctChange >= 0 ? "+" : ""
        }${kpis.cancelledVisits.pctChange}%</td></tr>
      </table>
      <br/>
      <div style="font-size: 11pt; font-weight: bold; margin-bottom: 6px;">Itemized Recent OP Encounters (${visits.length} records)</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Encounter ID</th>
            <th>Date &amp; Time</th>
            <th>OP Number</th>
            <th>UMR</th>
            <th>Patient Name</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Department</th>
            <th>Doctor</th>
            <th>Visit Type</th>
            <th>Status</th>
            <th>Chief Complaint</th>
            <th>Diagnosis</th>
            <th>Vitals</th>
            <th>Fee (₹)</th>
            <th>Billing</th>
          </tr>
        </thead>
        <tbody>
  `

  visits.forEach((v, idx) => {
    const isEven = idx % 2 === 0
    const statusClass =
      v.statusCategory === "Completed"
        ? "status-completed"
        : v.statusCategory === "Waiting"
          ? "status-waiting"
          : v.statusCategory === "Cancelled"
            ? "status-cancelled"
            : "status-consult"

    html += `
      <tr class="${isEven ? "row-even" : ""}">
        <td>${idx + 1}</td>
        <td>${v.id}</td>
        <td>${v.encounterDateTimeFormatted}</td>
        <td><b>${v.opNumber}</b></td>
        <td>${v.umr}</td>
        <td><b>${v.patientName}</b></td>
        <td>${v.age}</td>
        <td>${v.sex}</td>
        <td>${v.dept}</td>
        <td>${v.assignedDoctor || v.aiDoctor || "Unassigned"}</td>
        <td>${v.derivedVisitType}</td>
        <td class="${statusClass}">${v.statusCategory}</td>
        <td>${v.chiefComplaint}</td>
        <td>${v.diagnosis || "Under Evaluation"}</td>
        <td>${v.vitals?.bp || "—"} / ${v.vitals?.pulse || "—"}</td>
        <td>${v.billing?.total || 50}</td>
        <td>${v.billing?.status || "Paid"}</td>
      </tr>
    `
  })

  html += `
        </tbody>
      </table>
      <br/>
      <div class="sub">Report automatically extracted from Imperial Hospitals HMS database on ${new Date().toLocaleString()}. Strictly Confidential.</div>
    </body>
    </html>
  `

  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  const safeDate = dateRangeLabel.replace(/[^a-zA-Z0-9_-]/g, "_")
  link.setAttribute("download", `OP_Report_${safeDate}_${Date.now()}.xls`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportOpReportPdf(
  visits: EnrichedOpVisit[],
  filters: OpReportFilters,
  kpis: OpReportKpis,
  dateRangeLabel: string,
): void {
  // Create an isolated printable document that immediately triggers browser PDF save / print
  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    // If popups blocked, use iframe print fallback
    triggerIframePrint(visits, filters, kpis, dateRangeLabel)
    return
  }

  const contentHtml = generateReportPrintHtml(
    visits,
    filters,
    kpis,
    dateRangeLabel,
  )
  printWindow.document.open()
  printWindow.document.write(contentHtml)
  printWindow.document.close()

  printWindow.onload = () => {
    printWindow.focus()
    printWindow.print()
  }
}

function triggerIframePrint(
  visits: EnrichedOpVisit[],
  filters: OpReportFilters,
  kpis: OpReportKpis,
  dateRangeLabel: string,
): void {
  const existingFrame = document.getElementById("op-report-print-frame")
  if (existingFrame) existingFrame.remove()

  const iframe = document.createElement("iframe")
  iframe.id = "op-report-print-frame"
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const frameDoc = iframe.contentWindow?.document
  if (frameDoc) {
    frameDoc.open()
    frameDoc.write(
      generateReportPrintHtml(visits, filters, kpis, dateRangeLabel),
    )
    frameDoc.close()

    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        iframe.remove()
      }, 2500)
    }, 300)
  }
}

export function printOpReport(
  visits: EnrichedOpVisit[],
  filters: OpReportFilters,
  kpis: OpReportKpis,
  dateRangeLabel: string,
): void {
  triggerIframePrint(visits, filters, kpis, dateRangeLabel)
}

function generateReportPrintHtml(
  visits: EnrichedOpVisit[],
  filters: OpReportFilters,
  kpis: OpReportKpis,
  dateRangeLabel: string,
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>OP Reports - ${dateRangeLabel} - Imperial Hospitals</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 10mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #0F172A;
            background: #FFFFFF;
            font-size: 10px;
            margin: 0;
            padding: 0;
          }
          .header-box {
            border-bottom: 2px solid #1B4FD8;
            padding-bottom: 8px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .hospital-title {
            font-size: 16px;
            font-weight: 800;
            color: #1B4FD8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .hospital-sub {
            font-size: 9px;
            color: #64748B;
            margin-top: 2px;
          }
          .report-badge {
            text-align: right;
            font-size: 9px;
            color: #475569;
          }
          .meta-bar {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            background: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 6px 10px;
            margin-bottom: 12px;
            font-size: 9px;
          }
          .meta-item strong {
            color: #1E293B;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            margin-bottom: 14px;
          }
          .kpi-card {
            border: 1px solid #CBD5E1;
            border-radius: 6px;
            padding: 6px 8px;
            background: #FFFFFF;
          }
          .kpi-label {
            font-size: 8px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
          }
          .kpi-val {
            font-size: 16px;
            font-weight: 800;
            color: #0F172A;
            margin: 2px 0;
          }
          .kpi-trend {
            font-size: 8px;
            font-weight: 600;
          }
          .trend-up { color: #16A34A; }
          .trend-down { color: #DC2626; }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5px;
          }
          th {
            background-color: #0F172A;
            color: #FFFFFF;
            font-weight: 700;
            padding: 5px 6px;
            text-align: left;
            border: 1px solid #0F172A;
          }
          td {
            padding: 4px 6px;
            border: 1px solid #E2E8F0;
            vertical-align: top;
          }
          tr:nth-child(even) td {
            background-color: #F8FAFC;
          }
          .badge {
            display: inline-block;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 700;
            font-size: 8px;
          }
          .badge-completed { background: #DCFCE7; color: #15803D; }
          .badge-waiting { background: #FEF3C7; color: #B45309; }
          .badge-consult { background: #E0F2FE; color: #0369A1; }
          .badge-cancelled { background: #FEE2E2; color: #B91C1C; }
          .footer {
            margin-top: 14px;
            border-top: 1px solid #CBD5E1;
            padding-top: 6px;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #64748B;
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div>
            <div class="hospital-title">${HOSPITAL_NAME}</div>
            <div class="hospital-sub">${HOSPITAL_TAGLINE} · ${HOSPITAL_ADDRESS}</div>
            <div style="font-size: 12px; font-weight: 700; color: #0F172A; margin-top: 4px;">
              Outpatient (OP) Department Operational &amp; Clinical Analytics Report
            </div>
          </div>
          <div class="report-badge">
            <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>Date Range:</strong> ${dateRangeLabel}</div>
            <div><strong>Total Records:</strong> ${visits.length}</div>
          </div>
        </div>

        <div class="meta-bar">
          <div class="meta-item">Department: <strong>${filters.department}</strong></div>
          <div class="meta-item">Doctor: <strong>${filters.doctor}</strong></div>
          <div class="meta-item">Visit Type: <strong>${filters.visitType}</strong></div>
          <div class="meta-item">Status: <strong>${filters.status}</strong></div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Total OP Visits</div>
            <div class="kpi-val">${kpis.totalVisits.value}</div>
            <div class="kpi-trend ${
              kpis.totalVisits.pctChange >= 0 ? "trend-up" : "trend-down"
            }">
              ${
                kpis.totalVisits.pctChange >= 0 ? "▲ +" : "▼ "
              }${kpis.totalVisits.pctChange}% vs last period
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">New Patients</div>
            <div class="kpi-val">${kpis.newPatients.value}</div>
            <div class="kpi-trend ${
              kpis.newPatients.pctChange >= 0 ? "trend-up" : "trend-down"
            }">
              ${
                kpis.newPatients.pctChange >= 0 ? "▲ +" : "▼ "
              }${kpis.newPatients.pctChange}% vs last period
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Existing Patients</div>
            <div class="kpi-val">${kpis.existingPatients.value}</div>
            <div class="kpi-trend ${
              kpis.existingPatients.pctChange >= 0 ? "trend-up" : "trend-down"
            }">
              ${
                kpis.existingPatients.pctChange >= 0 ? "▲ +" : "▼ "
              }${kpis.existingPatients.pctChange}% vs last period
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Completed</div>
            <div class="kpi-val">${kpis.completedConsultations.value}</div>
            <div class="kpi-trend ${
              kpis.completedConsultations.pctChange >= 0
                ? "trend-up"
                : "trend-down"
            }">
              ${
                kpis.completedConsultations.pctChange >= 0 ? "▲ +" : "▼ "
              }${kpis.completedConsultations.pctChange}% vs last period
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Waiting Patients</div>
            <div class="kpi-val">${kpis.waitingPatients.value}</div>
            <div class="kpi-trend ${
              kpis.waitingPatients.pctChange <= 0 ? "trend-up" : "trend-down"
            }">
              ${
                kpis.waitingPatients.pctChange >= 0 ? "▲ +" : "▼ "
              }${kpis.waitingPatients.pctChange}% vs last period
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Cancelled Visits</div>
            <div class="kpi-val">${kpis.cancelledVisits.value}</div>
            <div class="kpi-trend ${
              kpis.cancelledVisits.pctChange <= 0 ? "trend-up" : "trend-down"
            }">
              ${
                kpis.cancelledVisits.pctChange >= 0 ? "▲ +" : "▼ "
              }${kpis.cancelledVisits.pctChange}% vs last period
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 24px;">#</th>
              <th style="width: 90px;">Date &amp; Time</th>
              <th style="width: 55px;">OP #</th>
              <th style="width: 65px;">UMR</th>
              <th>Patient Name</th>
              <th style="width: 45px;">Age/Sex</th>
              <th>Department</th>
              <th>Attending Doctor</th>
              <th>Visit Type</th>
              <th style="width: 70px;">Status</th>
              <th>Chief Complaint &amp; Diagnosis</th>
              <th style="width: 65px;">Vitals</th>
              <th style="width: 50px; text-align: right;">Fee (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${visits
              .map(
                (v, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${v.encounterDateTimeFormatted}</td>
                <td><strong>${v.opNumber}</strong></td>
                <td>${v.umr}</td>
                <td><strong>${v.patientName}</strong></td>
                <td>${v.age}y / ${v.sex}</td>
                <td>${v.dept}</td>
                <td>${v.assignedDoctor || v.aiDoctor || "Unassigned"}</td>
                <td>${v.derivedVisitType}</td>
                <td>
                  <span class="badge ${
                    v.statusCategory === "Completed"
                      ? "badge-completed"
                      : v.statusCategory === "Waiting"
                        ? "badge-waiting"
                        : v.statusCategory === "Cancelled"
                          ? "badge-cancelled"
                          : "badge-consult"
                  }">
                    ${v.statusCategory}
                  </span>
                </td>
                <td>
                  <div>${v.chiefComplaint}</div>
                  <div style="color: #64748B; font-size: 8px;">Dx: ${v.diagnosis || "Under Evaluation"}</div>
                </td>
                <td>${v.vitals?.bp || "—"}<br/>${v.vitals?.pulse || "—"}</td>
                <td style="text-align: right; font-weight: 700;">₹${v.billing?.total || 50}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <div>Report ID: REP-${Date.now()} · Imperial Hospitals HMS</div>
          <div>Strictly Confidential Medical Operations Document · Authorized Clinical Use Only</div>
          <div>Page 1 of 1</div>
        </div>
      </body>
    </html>
  `
}
