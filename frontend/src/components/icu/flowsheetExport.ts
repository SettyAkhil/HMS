// Print and PDF export for the ICU daily flowsheet.
//
// On screen every wide section scrolls sideways inside its own container, so
// window.print() only ever captured the columns that happened to be scrolled
// into view -- the hourly observations (32 columns) came out as its first
// handful. Both exports here are built from the record and the schema instead
// of from the DOM, so every column is always present:
//   - Print splits a wide table into column blocks that each fit a landscape
//     page, repeating the Time/row column on every block.
//   - PDF lets jspdf-autotable page the columns horizontally the same way.
// One table model feeds both, so the two can never disagree on content.

import { HOURS, TWO_HOURLY, type FieldDef, type Section } from "./flowsheetSchema"
import type { FlowsheetRecord } from "./IcuFlowsheet"

export type ExportGroup = { label: string ;sections: Section[] }

export type ExportMeta = {
  patientName: string
  patientId: string
  bed: string
  date: string
}

type ExportTable = {
  title: string
  note?: string
  /** Leading columns repeated on every column block / PDF page. */
  keyCols: number
  head: string[]
  body: string[][]
}

const withUnit = (f: FieldDef) => (f.unit ? `${f.label} (${f.unit})` : f.label)

const cellText = (f: FieldDef, v: string | undefined) => {
  if (!v) return ""
  if (f.type === "check") return v === "1" ? "Yes" : ""
  return v
}

/** Every section of the record as a plain header + rows table. */
function sectionTable(s: Section, rec: FlowsheetRecord): ExportTable {
  switch (s.kind) {
    case "fields":
      return {
        title: s.title,
        note: s.note,
        keyCols: 1,
        head: ["Field", "Value"],
        body: s.fields.map((f) => [
          withUnit(f),
          cellText(f, rec.fields[`${s.id}.${f.key}`]),
        ]),
      }

    case "table": {
      const rows = rec.tables[s.id] ?? []
      const count = Math.max(rows.length, s.minRows ?? 3)
      return {
        title: s.title,
        note: s.note,
        keyCols: 1,
        head: ["#", ...s.columns.map(withUnit)],
        body: Array.from({ length: count }, (_, r) => [
          String(r + 1),
          ...s.columns.map((c) => cellText(c, rows[r]?.[c.key])),
        ]),
      }
    }

    case "grid": {
      const slots = s.slotGroups.flatMap((g) => g.slots)
      return {
        title: s.title,
        note: s.note,
        keyCols: 1,
        head: ["Care / Time", ...slots],
        body: s.rows.map((row) => [
          row,
          ...slots.map((sl) => rec.grids[s.id]?.[`${row}|${sl}`] ?? ""),
        ]),
      }
    }

    case "hourly": {
      const hours = s.id === "rass" ? TWO_HOURLY : HOURS
      const fields = s.groups.flatMap((g) => g.fields.map((f) => ({ g, f })))
      // Pupils has "Size" and "Reaction" under both Right and Left; only
      // prefix the group where a bare label would be ambiguous.
      const dup = (label: string) =>
        fields.filter((x) => x.f.label === label).length > 1
      return {
        title: s.title,
        note: s.note,
        keyCols: 1,
        head: [
          "Time",
          ...fields.map(({ g, f }) =>
            dup(f.label) && g.label ? `${g.label} ${withUnit(f)}` : withUnit(f),
          ),
        ],
        body: hours.map((h) => [
          h,
          ...fields.map(({ f }) => cellText(f, rec.hourly[s.id]?.[`${h}|${f.key}`])),
        ]),
      }
    }

    case "scale": {
      const hours = s.interval === 2 ? TWO_HOURLY : HOURS
      return {
        title: s.title,
        note: s.note,
        keyCols: 1,
        head: ["Time", ...s.components.map((c) => c.label), "Total"],
        body: hours.map((h) => {
          let total = 0
          let filled = true
          const cells = s.components.map((c) => {
            const chosen = rec.scales[s.id]?.[`${h}|${c.key}`]
            const opt = c.options.find((o) => o.label === chosen)
            if (!opt) {
              filled = false
              return ""
            }
            total += opt.score
            return `${opt.score} - ${opt.label}`
          })
          return [h, ...cells, filled ? String(total) : ""]
        }),
      }
    }
  }
}

const fileStem = (m: ExportMeta) =>
  `ICU-Flowsheet_${m.patientName.replace(/[^\w]+/g, "-")}_${m.patientId}_${m.date}`

// ── Print ──────────────────────────────────────────────────────────────────

/** Data columns per printed block on a landscape A4 page. */
const PRINT_COLS_PER_BLOCK = 12

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

function tableHtml(t: ExportTable): string {
  const data = t.head.length - t.keyCols
  const blocks = Math.max(1, Math.ceil(data / PRINT_COLS_PER_BLOCK))
  let html = `<section class="sec"><h3>${esc(t.title)}</h3>`
  if (t.note) html += `<p class="note">${esc(t.note)}</p>`
  for (let b = 0; b < blocks; b++) {
    const from = t.keyCols + b * PRINT_COLS_PER_BLOCK
    const to = Math.min(t.head.length, from + PRINT_COLS_PER_BLOCK)
    const idx = [
      ...Array.from({ length: t.keyCols }, (_, i) => i),
      ...Array.from({ length: to - from }, (_, i) => from + i),
    ]
    if (blocks > 1)
      html += `<div class="part">Columns ${from - t.keyCols + 1}–${to - t.keyCols} of ${data}</div>`
    html += `<table><thead><tr>${idx
      .map((i) => `<th>${esc(t.head[i])}</th>`)
      .join("")}</tr></thead><tbody>${t.body
      .map(
        (row) =>
          `<tr>${idx
            .map(
              (i) =>
                `<td${i < t.keyCols ? ' class="key"' : ""}>${esc(row[i] ?? "")}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("")}</tbody></table>`
  }
  return html + "</section>"
}

export function printFlowsheet(
  rec: FlowsheetRecord,
  groups: ExportGroup[],
  meta: ExportMeta,
) {
  const body = groups
    .map(
      (g) =>
        `<h2>${esc(g.label)}</h2>${g.sections
          .map((s) => tableHtml(sectionTable(s, rec)))
          .join("")}`,
    )
    .join("")

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(fileStem(meta))}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 9px; }
  header { border-bottom: 2px solid #1b4fd8; padding-bottom: 6px; margin-bottom: 8px; }
  header h1 { font-size: 15px; margin: 0; }
  header p { margin: 2px 0 0; color: #475569; font-size: 10px; }
  h2 { font-size: 12px; margin: 12px 0 4px; color: #1b4fd8; break-after: avoid; }
  h3 { font-size: 10.5px; margin: 8px 0 2px; break-after: avoid; }
  .note { margin: 0 0 3px; color: #64748b; font-size: 8px; }
  .part { font-size: 8px; color: #64748b; margin: 4px 0 2px; font-weight: bold; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; margin-bottom: 4px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #94a3b8; padding: 2px 3px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #f1f5f9; font-size: 8px; text-transform: uppercase; }
  td { height: 14px; }
  td.key { background: #f8fafc; font-weight: bold; white-space: nowrap; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
<header><h1>ICU Daily Flowsheet — ${esc(meta.patientName)}</h1>
<p>${esc(meta.bed)} · MRN ${esc(meta.patientId)} · Chart date ${esc(meta.date)} · Printed ${esc(new Date().toLocaleString())}</p></header>
${body}
</body></html>`

  // A hidden iframe rather than a popup: popups get blocked, and printing the
  // live page is exactly what clipped the columns in the first place.
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  document.body.appendChild(frame)
  const win = frame.contentWindow
  if (!win) {
    frame.remove()
    return
  }
  win.document.open()
  win.document.write(doc)
  win.document.close()
  const cleanup = () => setTimeout(() => frame.remove(), 500)
  win.addEventListener("afterprint", cleanup, { once: true })
  setTimeout(() => {
    win.focus()
    win.print()
    // Browsers that never fire afterprint in an iframe.
    setTimeout(cleanup, 60_000)
  }, 150)
}

// ── PDF ────────────────────────────────────────────────────────────────────

// The standard PDF fonts are WinAnsi only; subscripts and superscripts in the
// chart labels (FiO₂, HCO₃⁻, Na⁺) would otherwise print as garbage.
const pdfSafe = (s: string) =>
  s
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .replace(/⁺/g, "+")
    .replace(/⁻/g, "-")
    .replace(/[^\x20-\x7E -ÿ–—•]/g, "")

export async function downloadFlowsheetPdf(
  rec: FlowsheetRecord,
  groups: ExportGroup[],
  meta: ExportMeta,
) {
  // Loaded on demand: ~400 kB that only matters when someone exports.
  const pkgJsPdf = "jspdf"
  const pkgAutoTable = "jspdf-autotable"
  // @ts-ignore
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    // @ts-ignore
    import(/* @vite-ignore */ pkgJsPdf),
    // @ts-ignore
    import(/* @vite-ignore */ pkgAutoTable),
  ])
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 10
  let y = margin

  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(pdfSafe(`ICU Daily Flowsheet — ${meta.patientName}`), margin, y + 4)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(
    pdfSafe(
      `${meta.bed} · MRN ${meta.patientId} · Chart date ${meta.date} · Generated ${new Date().toLocaleString()}`,
    ),
    margin,
    y + 9,
  )
  doc.setDrawColor(27, 79, 216)
  doc.setLineWidth(0.6)
  doc.line(margin, y + 11.5, pageW - margin, y + 11.5)
  y += 16

  const finalY = () =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y
  const pageH = doc.internal.pageSize.getHeight()

  for (const g of groups) {
    for (const [i, s] of g.sections.entries()) {
      const t = sectionTable(s, rec)
      // Keep a heading with at least a few rows of its table.
      if (y > pageH - 35) {
        doc.addPage()
        y = margin
      }
      if (i === 0) {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(11)
        doc.setTextColor(27, 79, 216)
        doc.text(pdfSafe(g.label), margin, y + 3)
        y += 6
      }
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9.5)
      doc.setTextColor(15, 23, 42)
      doc.text(pdfSafe(t.title), margin, y + 3)
      y += 4.5

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [t.head.map(pdfSafe)],
        body: t.body.map((r) => r.map(pdfSafe)),
        theme: "grid",
        styles: {
          fontSize: 6.5,
          cellPadding: 1,
          lineColor: [148, 163, 184],
          lineWidth: 0.1,
          textColor: [15, 23, 42],
          overflow: "linebreak",
          minCellWidth: t.head.length > 8 ? 14 : 10,
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [51, 65, 85],
          fontStyle: "bold",
          fontSize: 6,
        },
        columnStyles: {
          0: { fontStyle: "bold", fillColor: [248, 250, 252] },
        },
        // Wide sections continue on the next page rather than being squeezed
        // or cut, repeating the Time / row column so every page reads alone.
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: 0,
        horizontalPageBreakBehaviour: "afterAllRows",
      })
      y = finalY() + 5
    }
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text(
      pdfSafe(`${meta.patientName} · MRN ${meta.patientId} · ${meta.date}`),
      margin,
      pageH - 5,
    )
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 5, {
      align: "right",
    })
  }

  doc.save(`${fileStem(meta)}.pdf`)
}
