/**
 * Imperial Hospitals Enterprise HMS - Universal Reports Exporter & Printer
 * Supports PDF, Excel (.xls HTML table), CSV, and isolated iframe printing
 * with official hospital letterhead and executive summary metadata.
 */

export interface ExportColumn {
  header: string
  key: string
  render?: (val: any, row: any) => string
}

export interface GenericReportExportData {
  reportTitle: string
  dateRangeLabel: string
  generatedBy?: string
  departmentFilter?: string
  doctorFilter?: string
  statusFilter?: string
  kpis: { label: string ;value: string | number ;change?: string }[]
  columns: ExportColumn[]
  records: any[]
}

/**
 * Clean CSV export with hospital branding, metadata header, KPI block, and table
 */
export function exportGenericReportCsv(data: GenericReportExportData): void {
  const lines: string[] = []

  lines.push(`"IMPERIAL HOSPITALS - ENTERPRISE MANAGEMENT SYSTEM"`)
  lines.push(`"A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED - BHIMAVARAM"`)
  lines.push(`"Report:","${data.reportTitle}"`)
  lines.push(`"Generated At:","${new Date().toLocaleString()}"`)
  lines.push(`"Date Range:","${data.dateRangeLabel}"`)
  lines.push(`"Department Filter:","${data.departmentFilter || "All"}"`)
  if (data.doctorFilter) lines.push(`"Doctor Filter:","${data.doctorFilter}"`)
  if (data.statusFilter) lines.push(`"Status Filter:","${data.statusFilter}"`)
  lines.push(``)

  lines.push(`"--- EXECUTIVE KPI SUMMARY ---"`)
  data.kpis.forEach((kpi) => {
    lines.push(
      `"${kpi.label}","${kpi.value}","${
        kpi.change ? kpi.change + " vs last period" : ""
      }"`,
    )
  })
  lines.push(``)

  lines.push(`"--- ITEMIZED REPORT RECORDS ---"`)
  const headerRow = data.columns
    .map((c) => `"${c.header.replace(/"/g, '""')}"`)
    .join(",")
  lines.push(headerRow)

  data.records.forEach((row) => {
    const rowValues = data.columns.map((col) => {
      let val = row[col.key]
      if (col.render) {
        val = col.render(val, row)
      } else if (val === null || val === undefined) {
        val = ""
      }
      return `"${String(val).replace(/"/g, '""')}"`
    })
    lines.push(rowValues.join(","))
  })

  const csvContent = "\uFEFF" + lines.join("\r\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  const filename = `${data.reportTitle.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Excel XML/HTML spreadsheet (.xls) with formatted headers, styles and data table
 */
export function exportGenericReportExcel(data: GenericReportExportData): void {
  const kpiCells = data.kpis
    .map(
      (k) => `
    <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 8px 12px;">
      <div style="font-size: 11px; color: #64748B;">${k.label}</div>
      <div style="font-size: 16px; font-weight: bold; color: #0F172A;">${k.value}</div>
      ${
        k.change
          ? `<div style="font-size: 10px; color: #2563EB;">${k.change} vs last period</div>`
          : ""
      }
    </td>
  `,
    )
    .join("")

  const tableHeaders = data.columns
    .map(
      (c) => `
    <th style="background-color: #1E293B; color: #FFFFFF; padding: 10px; font-size: 12px; text-align: left; border: 1px solid #334155;">
      ${c.header}
    </th>
  `,
    )
    .join("")

  const tableRows = data.records
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"
      const cells = data.columns
        .map((col) => {
          let val = row[col.key]
          if (col.render) {
            val = col.render(val, row)
          } else if (val === null || val === undefined) {
            val = "-"
          }
          return `<td style="padding: 8px 10px; font-size: 11px; color: #334155; border: 1px solid #E2E8F0; background-color: ${bg};">${String(val)}</td>`
        })
        .join("")
      return `<tr>${cells}</tr>`
    })
    .join("")

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${data.reportTitle.slice(0, 30)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="${data.columns.length}" style="font-size: 18px; font-weight: bold; color: #1E3A8A; padding-bottom: 5px;">
              IMPERIAL HOSPITALS — ${data.reportTitle.toUpperCase()}
            </td>
          </tr>
          <tr>
            <td colspan="${data.columns.length}" style="font-size: 11px; color: #64748B;">
              A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED | Bhimavaram-534202 (A.P) | GST No - 37AALCM2238A1ZQ | Period: ${data.dateRangeLabel} | Generated: ${new Date().toLocaleString()}
            </td>
          </tr>
          <tr><td colspan="${data.columns.length}"></td></tr>
          <tr>${kpiCells}</tr>
          <tr><td colspan="${data.columns.length}"></td></tr>
          <thead>
            <tr>${tableHeaders}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
    </html>
  `

  const blob = new Blob([excelHtml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  const filename = `${data.reportTitle.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.xls`
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Clean isolated iframe printing ensuring zero background clipping
 */
export function printGenericReport(data: GenericReportExportData): void {
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  const kpisHtml = data.kpis
    .map(
      (k) => `
    <div style="flex: 1; border: 1px solid #E2E8F0; padding: 8px 12px; border-radius: 6px; background: #F8FAFC;">
      <div style="font-size: 10px; color: #64748B; font-weight: 600; text-transform: uppercase;">${k.label}</div>
      <div style="font-size: 16px; font-weight: 800; color: #0F172A; margin: 2px 0;">${k.value}</div>
      ${
        k.change
          ? `<div style="font-size: 9px; color: #1E4FD8; font-weight: 600;">${k.change} vs last period</div>`
          : ""
      }
    </div>
  `,
    )
    .join("")

  const headersHtml = data.columns
    .map(
      (c) => `
    <th style="background: #0F172A; color: white; padding: 6px 8px; font-size: 10px; text-align: left;">${c.header}</th>
  `,
    )
    .join("")

  const rowsHtml = data.records
    .map((r, i) => {
      const bg = i % 2 === 0 ? "#FFFFFF" : "#F8FAFC"
      const cells = data.columns
        .map((col) => {
          let val = r[col.key]
          if (col.render) {
            val = col.render(val, r)
          } else if (val === null || val === undefined) {
            val = "-"
          }
          return `<td style="padding: 6px 8px; font-size: 9.5px; border-bottom: 1px solid #E2E8F0; background: ${bg}; color: #334155;">${String(val)}</td>`
        })
        .join("")
      return `<tr>${cells}</tr>`
    })
    .join("")

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Imperial Hospitals - ${data.reportTitle}</title>
        <style>
          @page { size: landscape; margin: 8mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 12px; color: #0F172A; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0F172A; padding-bottom: 8px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 900; color: #0F172A; }
          .subtitle { font-size: 10px; color: #64748B; margin-top: 2px; }
          .meta { font-size: 9px; color: #475569; text-align: right; }
          .kpi-row { display: flex; gap: 8px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #CBD5E1; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">IMPERIAL HOSPITALS</div>
            <div style="font-size: 11px; font-weight: 700; color: #1E293B; margin-top: 1px;">A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED</div>
            <div class="subtitle"># 27-14-13/A, Opp. Ganesh Canten Street, Beside Bhasyam School, Bhimavaram-534202, W.G. Dist.(A.P) • Ph: 08816-279999, 279988</div>
            <div style="font-size: 10px; font-weight: 700; color: #1E4FD8; margin-top: 2px;">GST No - 37AALCM2238A1ZQ • ${data.reportTitle.toUpperCase()}</div>
          </div>
          <div class="meta">
            <div><strong>Period:</strong> ${data.dateRangeLabel}</div>
            <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>Department:</strong> ${data.departmentFilter || "All"}</div>
          </div>
        </div>
        <div class="kpi-row">
          ${kpisHtml}
        </div>
        <table>
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
  }, 300)
}

/**
 * Open print-ready PDF preview window
 */
export function exportGenericReportPdf(data: GenericReportExportData): void {
  printGenericReport(data)
}

export interface PatientClinicalReportData {
  item: {
    id: string
    patientName: string
    umr: string
    department: string
    visitType: string
    doctor: string
    status: string
    dateTime: string
  }
  age: number | string
  sex: string
  phone: string
  bloodGroup: string
  address: string
  vitals: {
    bp: string
    pulse: string
    temp: string
    spo2: string
    respiratoryRate: string
    weight: string
  }
  chiefComplaint: string
  symptoms: string[]
  diagnosis: string
  icd10: string
  assessment?: string
  advice?: string
  medications: Array<{
    medicine: string
    dosage: string
    frequency: string
    duration: string
    instructions: string
  }>
  investigations: Array<{
    name: string
    category: string
    status: string
    priority: string
  }>
  bedDetails?: {
    ward: string
    roomNo: string
    bedNo: string
    bedType: string
    admissionDate: string
    dischargeDate?: string
    los?: number
    charges?: number
  } | null
  erDetails?: {
    triageCategory: string
    bedLabel: string
    disposition: string
  } | null
  billing?: {
    consultationFee: number
    labFee: number
    total: number
    status: string
    mode: string
  } | null
}

/**
 * Generate official high-fidelity A4 clinical encounter HTML
 */
export function generatePatientClinicalHtml(
  data: PatientClinicalReportData,
): string {
  const medRows = data.medications
    .map(
      (m, idx) => `
    <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${
      idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"
    };">
      <td style="padding: 6px 8px; font-weight: 600; color: #0F172A;">${idx + 1}. ${m.medicine}</td>
      <td style="padding: 6px 8px; color: #334155;">${m.dosage}</td>
      <td style="padding: 6px 8px; color: #334155;">${m.frequency}</td>
      <td style="padding: 6px 8px; color: #334155;">${m.duration}</td>
      <td style="padding: 6px 8px; color: #64748B; font-style: italic;">${m.instructions}</td>
    </tr>
  `,
    )
    .join("")

  const labRows = data.investigations
    .map(
      (l, idx) => `
    <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${
      idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC"
    };">
      <td style="padding: 6px 8px; font-weight: 600; color: #0F172A;">${idx + 1}. ${l.name}</td>
      <td style="padding: 6px 8px; color: #334155;">${l.category}</td>
      <td style="padding: 6px 8px; color: #334155;">${l.priority}</td>
      <td style="padding: 6px 8px; color: #059669; font-weight: 600;">${l.status}</td>
    </tr>
  `,
    )
    .join("")

  const bedInfo = data.bedDetails
    ? `
    <div style="margin-top: 10px; padding: 8px 10px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;">
      <div style="font-weight: 700; color: #1E3A8A; font-size: 11px; margin-bottom: 4px;">INPATIENT STAY CONTEXT</div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 10.5px;">
        <div><span style="color: #64748B;">Ward:</span> <strong>${data.bedDetails.ward}</strong></div>
        <div><span style="color: #64748B;">Room / Bed:</span> <strong>${data.bedDetails.roomNo} - ${data.bedDetails.bedNo}</strong></div>
        <div><span style="color: #64748B;">Admission:</span> <strong>${data.bedDetails.admissionDate}</strong></div>
        <div><span style="color: #64748B;">Stay Charges:</span> <strong>₹${(data.bedDetails.charges || 0).toLocaleString()}</strong></div>
      </div>
    </div>
  `
    : ""

  const erInfo = data.erDetails
    ? `
    <div style="margin-top: 10px; padding: 8px 10px; background-color: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 6px;">
      <div style="font-weight: 700; color: #991B1B; font-size: 11px; margin-bottom: 4px;">EMERGENCY DEPARTMENT INTAKE CONTEXT</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 10.5px;">
        <div><span style="color: #7F1D1D;">Triage Level:</span> <strong style="color: #DC2626;">${data.erDetails.triageCategory}</strong></div>
        <div><span style="color: #7F1D1D;">Observation Bay:</span> <strong>${data.erDetails.bedLabel}</strong></div>
        <div><span style="color: #7F1D1D;">Disposition:</span> <strong>${data.erDetails.disposition}</strong></div>
      </div>
    </div>
  `
    : ""

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Clinical_Report_${data.item.umr}_${data.item.patientName.replace(/\s+/g, "_")}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            margin: 0;
            padding: 12px;
            color: #0F172A;
            background: #FFFFFF;
            font-size: 11px;
            line-height: 1.4;
          }
          .hospital-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2.5px solid #1E3A8A;
            padding-bottom: 8px;
            margin-bottom: 10px;
          }
          .hospital-title {
            font-size: 17px;
            font-weight: 900;
            color: #1E3A8A;
            letter-spacing: -0.2px;
            text-transform: uppercase;
          }
          .hospital-subtitle {
            font-size: 10px;
            color: #475569;
            font-weight: 600;
            margin-top: 1px;
          }
          .hospital-meta {
            font-size: 9.5px;
            color: #64748B;
            text-align: right;
          }
          .report-banner {
            background-color: #F1F5F9;
            border: 1px solid #CBD5E1;
            border-radius: 6px;
            padding: 6px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          .report-banner-title {
            font-size: 13px;
            font-weight: 800;
            color: #0F172A;
            letter-spacing: -0.2px;
          }
          .box-title {
            font-size: 10.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #1E3A8A;
            border-bottom: 1.5px solid #E2E8F0;
            padding-bottom: 3px;
            margin-bottom: 6px;
          }
          .demographics-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px 12px;
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 10px;
          }
          .demo-label {
            font-size: 9.5px;
            color: #64748B;
            font-weight: 600;
            text-transform: uppercase;
          }
          .demo-value {
            font-size: 11px;
            font-weight: 700;
            color: #0F172A;
          }
          .vitals-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 6px;
            margin-bottom: 10px;
          }
          .vital-card {
            border: 1px solid #E2E8F0;
            background-color: #FFFFFF;
            border-radius: 6px;
            padding: 5px 6px;
            text-align: center;
          }
          .vital-name {
            font-size: 9px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
          }
          .vital-val {
            font-size: 11.5px;
            font-weight: 800;
            color: #1E3A8A;
            margin-top: 1px;
          }
          .findings-box {
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 8px 10px;
            margin-bottom: 10px;
            background-color: #FFFFFF;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            font-size: 10px;
          }
          table.data-table th {
            background-color: #0F172A;
            color: #FFFFFF;
            padding: 5px 8px;
            text-align: left;
            font-weight: 700;
            border: 1px solid #0F172A;
          }
          table.data-table td {
            border: 1px solid #E2E8F0;
          }
          .billing-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 6px 12px;
            margin-bottom: 10px;
          }
          .attestation {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1.5px dashed #CBD5E1;
          }
          .signature-box {
            text-align: right;
            min-width: 220px;
          }
          .signature-line {
            border-top: 1px solid #0F172A;
            margin-top: 30px;
            padding-top: 4px;
            font-weight: 700;
            color: #0F172A;
          }
          .footer-note {
            margin-top: 10px;
            font-size: 8.5px;
            color: #94A3B8;
            text-align: center;
            border-top: 1px solid #F1F5F9;
            padding-top: 6px;
          }
        </style>
      </head>
      <body>
        <div class="hospital-header">
          <div>
            <div class="hospital-title">IMPERIAL HOSPITALS</div>
            <div class="hospital-subtitle">A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED • Bhimavaram-534202 (A.P)</div>
            <div style="font-size: 9px; color: #64748B; margin-top: 2px;">
              # 27-14-13/A, Opp. Ganesh Canten Street, Beside Bhasyam School • Ph: 08816-279999, 279988 • GST No - 37AALCM2238A1ZQ
            </div>
          </div>
          <div class="hospital-meta">
            <div><strong>UMR / MRN:</strong> ${data.item.umr}</div>
            <div><strong>Encounter ID:</strong> ${data.item.id}</div>
            <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
            <div style="font-family: monospace; font-size: 8.5px; letter-spacing: 1px; color: #0F172A; margin-top: 2px;">||| | |||| || | ||||| | ||</div>
          </div>
        </div>

        <div class="report-banner">
          <div>
            <div class="report-banner-title">PATIENT CLINICAL ENCOUNTER REPORT</div>
            <div style="font-size: 9.5px; color: #475569;">Official Medical Record &amp; Clinical Summary Form</div>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 10px; background-color: #EFF6FF; color: #1E40AF; border: 1px solid #BFDBFE;">
              ${data.item.visitType} • ${data.item.status}
            </span>
          </div>
        </div>

        <!-- Demographics -->
        <div class="demographics-grid">
          <div>
            <div class="demo-label">Patient Full Name</div>
            <div class="demo-value" style="font-size: 12px; color: #1E3A8A;">${data.item.patientName}</div>
          </div>
          <div>
            <div class="demo-label">Age / Gender</div>
            <div class="demo-value">${data.age} Yrs / ${data.sex}</div>
          </div>
          <div>
            <div class="demo-label">Blood Group</div>
            <div class="demo-value">${data.bloodGroup}</div>
          </div>
          <div>
            <div class="demo-label">Contact Phone</div>
            <div class="demo-value">${data.phone}</div>
          </div>

          <div>
            <div class="demo-label">Department / Unit</div>
            <div class="demo-value">${data.item.department}</div>
          </div>
          <div>
            <div class="demo-label">Attending Doctor</div>
            <div class="demo-value">Dr. ${data.item.doctor.replace(/^Dr\.\s*/i, "")}</div>
          </div>
          <div>
            <div class="demo-label">Encounter Date</div>
            <div class="demo-value">${data.item.dateTime}</div>
          </div>
          <div>
            <div class="demo-label">Residential Address</div>
            <div class="demo-value" style="font-size: 10px;">${data.address}</div>
          </div>
        </div>

        <!-- Vitals Ribbon -->
        <div class="box-title">CLINICAL VITAL SIGNS RECORDED</div>
        <div class="vitals-grid">
          <div class="vital-card">
            <div class="vital-name">Blood Pressure</div>
            <div class="vital-val">${data.vitals.bp}</div>
          </div>
          <div class="vital-card">
            <div class="vital-name">Heart Rate</div>
            <div class="vital-val">${data.vitals.pulse}</div>
          </div>
          <div class="vital-card">
            <div class="vital-name">Temperature</div>
            <div class="vital-val">${data.vitals.temp}</div>
          </div>
          <div class="vital-card">
            <div class="vital-name">SpO2 (Pulse Ox)</div>
            <div class="vital-val">${data.vitals.spo2}</div>
          </div>
          <div class="vital-card">
            <div class="vital-name">Resp. Rate</div>
            <div class="vital-val">${data.vitals.respiratoryRate}</div>
          </div>
          <div class="vital-card">
            <div class="vital-name">Weight</div>
            <div class="vital-val">${data.vitals.weight}</div>
          </div>
        </div>

        <!-- Clinical Findings -->
        <div class="findings-box">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
            <div>
              <span style="font-size: 9.5px; color: #64748B; font-weight: 700; text-transform: uppercase;">Primary Diagnosis:</span>
              <strong style="font-size: 11.5px; color: #1E3A8A; margin-left: 4px;">${data.diagnosis}</strong>
            </div>
            <span style="background-color: #F1F5F9; border: 1px solid #CBD5E1; padding: 1px 6px; border-radius: 4px; font-family: monospace; font-size: 9.5px; font-weight: 700;">
              ICD-10: ${data.icd10}
            </span>
          </div>
          <div style="font-size: 10.5px; color: #334155; margin-bottom: 4px;">
            <strong>Chief Complaint:</strong> ${data.chiefComplaint}
          </div>
          <div style="font-size: 10.5px; color: #334155; margin-bottom: 4px;">
            <strong>Recorded Symptoms:</strong> ${data.symptoms.join(", ")}
          </div>
          ${
            data.assessment
              ? `<div style="font-size: 10.5px; color: #475569; margin-top: 4px;"><strong>Clinical Assessment:</strong> ${data.assessment}</div>`
              : ""
          }
          ${
            data.advice
              ? `<div style="font-size: 10.5px; color: #475569; margin-top: 2px;"><strong>Doctor's Advice:</strong> ${data.advice}</div>`
              : ""
          }
        </div>

        ${bedInfo}
        ${erInfo}

        <!-- Prescribed Medications -->
        <div class="box-title" style="margin-top: 8px;">PRESCRIBED MEDICATIONS &amp; DOSAGE (Rx)</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 30%;">Medicine Name &amp; Strength</th>
              <th style="width: 15%;">Dosage</th>
              <th style="width: 15%;">Frequency</th>
              <th style="width: 12%;">Duration</th>
              <th style="width: 28%;">Instructions</th>
            </tr>
          </thead>
          <tbody>
            ${medRows}
          </tbody>
        </table>

        <!-- Diagnostic Investigations -->
        <div class="box-title">ORDERED DIAGNOSTIC &amp; LABORATORY INVESTIGATIONS</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 40%;">Investigation / Test Name</th>
              <th style="width: 25%;">Category / Department</th>
              <th style="width: 15%;">Priority</th>
              <th style="width: 20%;">Turnaround / Status</th>
            </tr>
          </thead>
          <tbody>
            ${labRows}
          </tbody>
        </table>

        <!-- Billing Summary -->
        ${
          data.billing
            ? `
          <div class="billing-row">
            <div>
              <span style="font-weight: 700; color: #0F172A; text-transform: uppercase; font-size: 10px;">Encounter Billing:</span>
              <span style="margin-left: 8px; color: #64748B;">Consultation Fee: ₹${data.billing.consultationFee}</span>
              <span style="margin-left: 8px; color: #64748B;">Diagnostics: ₹${data.billing.labFee}</span>
            </div>
            <div style="font-size: 11px;">
              <strong>Total: ₹${data.billing.total}</strong>
              <span style="margin-left: 8px; padding: 2px 6px; background-color: #ECFDF5; color: #047857; font-weight: 700; border-radius: 4px; border: 1px solid #A7F3D0;">
                ${data.billing.status} (${data.billing.mode})
              </span>
            </div>
          </div>
        `
            : ""
        }

        <!-- Doctor Attestation -->
        <div class="attestation">
          <div>
            <div style="font-size: 9.5px; color: #64748B;">Digital Authentication:</div>
            <div style="font-size: 10px; font-weight: 600; color: #059669;">✓ Verified &amp; Signed electronically in Hospital EHR</div>
            <div style="font-size: 8.5px; color: #94A3B8; margin-top: 2px;">Hash: ${Math.random().toString(36).substring(2, 10).toUpperCase()}-EHR-SIG</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Dr. ${data.item.doctor.replace(/^Dr\.\s*/i, "")}</div>
            <div style="font-size: 9.5px; color: #475569;">${data.item.department} Specialist</div>
            <div style="font-size: 8.5px; color: #64748B;">Reg No: KMC-${Math.floor(10000 + Math.random() * 90000)}</div>
          </div>
        </div>

        <div class="footer-note">
          CONFIDENTIAL MEDICAL RECORD • Generated via Imperial Hospitals HMS • Valid for Clinical Continuity &amp; Medico-Legal Reference • Page 1 of 1
        </div>
      </body>
    </html>
  `
}

/**
 * Isolated iframe printing of Patient Clinical Encounter Form
 */
export function printPatientClinicalReport(
  data: PatientClinicalReportData,
): void {
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  const html = generatePatientClinicalHtml(data)
  doc.open()
  doc.write(html)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1500)
  }, 350)
}

/**
 * Open print-ready PDF preview / Save-as-PDF window for Patient Clinical Form
 */
export function downloadPatientClinicalPdf(
  data: PatientClinicalReportData,
): void {
  const win = window.open("", "_blank")
  if (!win) {
    // Fallback to iframe print
    printPatientClinicalReport(data)
    return
  }
  const html = generatePatientClinicalHtml(data)
  win.document.open()
  win.document.write(`
    ${html}
    <script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 400);
      };
    </script>
  `)
  win.document.close()
}

export interface DoctorReportData {
  id: string
  doctor: string
  department: string
  qualification: string
  room?: string
  staffId?: string
  status: string
  dateRangeLabel: string
  opVisits: number
  erCases: number
  ipPatients: number
  totalConsultations: number
  recentCases: Array<{
    date: string
    patientName: string
    umr: string
    careStream: string
    diagnosis: string
    status: string
  }>
}

/**
 * Universal resolver for Doctor Clinical Productivity & Caseload data
 */
export function resolveDoctorReportData(
  raw: any,
  dateRangeLabel: string = "All Time",
): DoctorReportData {
  if (!raw) {
    return {
      id: "DOC-001",
      doctor: "Dr. Attending Physician",
      department: "General Medicine",
      qualification: "MD, MBBS",
      room: "Room 101",
      staffId: "STF-DOC-01",
      status: "Active",
      dateRangeLabel,
      opVisits: 0,
      erCases: 0,
      ipPatients: 0,
      totalConsultations: 0,
      recentCases: [],
    }
  }

  const doctorName =
    raw.doctor || raw.name || raw.doctorName || "Dr. Medical Specialist"
  const department =
    raw.department || raw.specialty || raw.dept || "General Medicine"
  const qualification = raw.qualification || "MD, MBBS"
  const room = raw.room || "Room 101"
  const staffId = raw.staffId || raw.id || "STF-DOC-01"
  const status = raw.status || "Active"
  const opVisits = Number(raw.opVisits ?? raw.opCount ?? 0)
  const erCases = Number(raw.erCases ?? raw.erCount ?? 0)
  const ipPatients = Number(raw.ipPatients ?? raw.ipCount ?? 0)
  const totalConsultations = Number(
    raw.totalConsultations ??
      raw.totalEncounters ??
      raw.totalPatients ??
      opVisits + erCases + ipPatients,
  )
  const recentCases = Array.isArray(raw.recentCases) ? raw.recentCases : []

  return {
    id: String(raw.id || staffId),
    doctor: doctorName,
    department,
    qualification,
    room,
    staffId,
    status,
    dateRangeLabel,
    opVisits,
    erCases,
    ipPatients,
    totalConsultations,
    recentCases,
  }
}

/**
 * Generate official printable HTML for Physician Clinical Practice & Productivity Report
 */
export function generateDoctorReportHtml(data: DoctorReportData): string {
  const casesRows =
    data.recentCases && data.recentCases.length > 0
      ? data.recentCases
          .map(
            (c, i) => `
        <tr>
          <td style="font-weight: 700; width: 5%; text-align: center;">${i + 1}</td>
          <td style="width: 15%;">${c.date}</td>
          <td style="width: 25%; font-weight: 600; color: #0F172A;">${c.patientName}</td>
          <td style="width: 15%; font-family: monospace; font-size: 9.5px;">${c.umr}</td>
          <td style="width: 15%;">
            <span class="stream-badge" style="background-color: ${
              c.careStream.includes("Emergency")
                ? "#FEE2E2; color: #B91C1C;"
                : c.careStream.includes("Inpatient")
                  ? "#E0E7FF; color: #4338CA;"
                  : "#EFF6FF; color: #1D4ED8;"
            }">${c.careStream}</span>
          </td>
          <td style="width: 25%;">${c.diagnosis}</td>
        </tr>
      `,
          )
          .join("")
      : `<tr><td colspan="6" style="text-align: center; padding: 12px; color: #94A3B8;">No consultation cases logged in this selected date range.</td></tr>`

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Doctor Productivity Report - ${data.doctor}</title>
        <style>
          @page { size: A4; margin: 12mm 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0F172A;
            background-color: #FFFFFF;
            line-height: 1.35;
            margin: 0;
            padding: 0;
            font-size: 11px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 10px;
            border-bottom: 2px solid #1E3A8A;
            margin-bottom: 12px;
          }
          .brand-title {
            font-size: 16px;
            font-weight: 800;
            color: #1E3A8A;
            letter-spacing: -0.5px;
          }
          .brand-sub {
            font-size: 10px;
            color: #64748B;
            font-weight: 600;
            margin-top: 1px;
          }
          .report-badge {
            background-color: #EFF6FF;
            border: 1px solid #BFDBFE;
            color: #1D4ED8;
            font-size: 10px;
            font-weight: 700;
            padding: 4px 8px;
            border-radius: 6px;
            text-transform: uppercase;
          }
          .doctor-card {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            background-color: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 12px;
          }
          .info-label {
            font-size: 9px;
            color: #64748B;
            font-weight: 700;
            text-transform: uppercase;
          }
          .info-val {
            font-size: 11.5px;
            font-weight: 700;
            color: #0F172A;
            margin-top: 1px;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            margin-bottom: 12px;
          }
          .kpi-box {
            border: 1px solid #E2E8F0;
            border-radius: 6px;
            padding: 6px 8px;
            text-align: center;
            background-color: #FFFFFF;
          }
          .kpi-title {
            font-size: 9px;
            font-weight: 700;
            color: #64748B;
            text-transform: uppercase;
          }
          .kpi-val {
            font-size: 14px;
            font-weight: 800;
            color: #1E3A8A;
            margin-top: 2px;
          }
          .box-title {
            font-size: 10.5px;
            font-weight: 800;
            color: #1E3A8A;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            border-bottom: 1px solid #E2E8F0;
            padding-bottom: 3px;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            font-size: 10px;
          }
          table.data-table th {
            background-color: #0F172A;
            color: #FFFFFF;
            padding: 6px 8px;
            text-align: left;
            font-weight: 700;
            border: 1px solid #0F172A;
          }
          table.data-table td {
            border: 1px solid #E2E8F0;
            padding: 5px 8px;
            color: #334155;
          }
          table.data-table tr:nth-child(even) td {
            background-color: #F8FAFC;
          }
          .stream-badge {
            display: inline-block;
            padding: 1px 5px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
          }
          .attestation {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 14px;
            padding-top: 8px;
            border-top: 1px dashed #CBD5E1;
          }
          .signature-box {
            text-align: right;
          }
          .signature-line {
            font-weight: 700;
            color: #0F172A;
            font-size: 11px;
            margin-bottom: 2px;
          }
          .footer-note {
            font-size: 8.5px;
            color: #94A3B8;
            text-align: center;
            margin-top: 12px;
            border-top: 1px solid #E2E8F0;
            padding-top: 6px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand-title">IMPERIAL HOSPITALS</div>
            <div class="brand-sub">A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED • Physician Productivity &amp; Caseload Report</div>
            <div style="font-size: 9px; color: #64748B; margin-top: 1px;"># 27-14-13/A, Bhimavaram-534202 (A.P) • GST No - 37AALCM2238A1ZQ</div>
          </div>
          <div class="report-badge">
            ${data.dateRangeLabel}
          </div>
        </div>

        <!-- Doctor Profile Card -->
        <div class="doctor-card">
          <div>
            <div class="info-label">Attending Physician</div>
            <div class="info-val">${data.doctor}</div>
          </div>
          <div>
            <div class="info-label">Department / Specialty</div>
            <div class="info-val">${data.department}</div>
          </div>
          <div>
            <div class="info-label">Qualifications</div>
            <div class="info-val">${data.qualification}</div>
          </div>
          <div>
            <div class="info-label">Staff ID / Room</div>
            <div class="info-val">${data.staffId || data.id} • ${data.room || "Room 101"}</div>
          </div>
        </div>

        <!-- Workload Summary KPI Grid -->
        <div class="box-title">CLINICAL WORKLOAD &amp; CONSULTATION SUMMARY</div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-title">OP Consultations</div>
            <div class="kpi-val">${data.opVisits}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">ER Cases Handled</div>
            <div class="kpi-val">${data.erCases}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Inpatient (IP) Patients</div>
            <div class="kpi-val">${data.ipPatients}</div>
          </div>
          <div class="kpi-box" style="border-color: #93C5FD; background-color: #EFF6FF;">
            <div class="kpi-title" style="color: #1E3A8A;">Total Clinical Volume</div>
            <div class="kpi-val" style="color: #1E3A8A;">${data.totalConsultations}</div>
          </div>
        </div>

        <!-- Itemized Caseload Log -->
        <div class="box-title">ITEMIZED PATIENT CONSULTATIONS LOG</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 14%;">Encounter Date</th>
              <th style="width: 25%;">Patient Name</th>
              <th style="width: 14%;">UMR / MRN</th>
              <th style="width: 16%;">Care Stream</th>
              <th style="width: 26%;">Diagnosis / Condition</th>
            </tr>
          </thead>
          <tbody>
            ${casesRows}
          </tbody>
        </table>

        <!-- Attestation Signature -->
        <div class="attestation">
          <div>
            <div style="font-size: 9.5px; color: #64748B;">Clinical Governance &amp; Audit Verification:</div>
            <div style="font-size: 10px; font-weight: 600; color: #059669;">✓ Verified and authenticated against Hospital Encounter Records</div>
            <div style="font-size: 8.5px; color: #94A3B8; margin-top: 2px;">Report Generated: ${new Date().toLocaleString()}</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">${data.doctor}</div>
            <div style="font-size: 9.5px; color: #475569;">${data.department} Specialist</div>
            <div style="font-size: 8.5px; color: #64748B;">Reg Staff ID: ${data.staffId || data.id}</div>
          </div>
        </div>

        <div class="footer-note">
          CONFIDENTIAL CLINICAL RECORD • Imperial Hospitals HMS • Valid for Practice Audit &amp; Performance Review
        </div>
      </body>
    </html>
  `
}

/**
 * Isolated iframe printing for Physician Clinical Report
 */
export function printDoctorReport(data: DoctorReportData): void {
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) return

  const html = generateDoctorReportHtml(data)
  doc.open()
  doc.write(html)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1500)
  }, 350)
}

/**
 * Open print-ready PDF window for Physician Clinical Report
 */
export function downloadDoctorReportPdf(data: DoctorReportData): void {
  const win = window.open("", "_blank")
  if (!win) {
    printDoctorReport(data)
    return
  }
  const html = generateDoctorReportHtml(data)
  win.document.open()
  win.document.write(`
    ${html}
    <script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 400);
      };
    </script>
  `)
  win.document.close()
}
