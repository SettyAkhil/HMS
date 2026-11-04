/**
 * Live bedside state, derived from the nurse's ICU flowsheet.
 *
 * Nothing on the Critical Care board is typed in twice or invented: vitals,
 * ventilator settings, trends, GCS/RASS, the consultant, the nurse on shift,
 * diagnosis, allergy, running drugs and alerts are all read from the chart day
 * the nurse is filling in (`icu_flowsheets`, cached in localStorage). When a
 * value has not been charted it is `null` and the UI says "Not charted".
 */

import { FLOWSHEET_SECTIONS, HOURS } from "./flowsheetSchema"
import type { FlowsheetRecord } from "./IcuFlowsheet"

export type LiveVitals = {
  temp: string | null
  hr: string | null
  bp: string | null
  map: string | null
  rr: string | null
  spo2: string | null
}

export type LiveVent = {
  mode: string
  fio2: string | null
  peep: string | null
  tv: string | null
  rr: string | null
  pip: string | null
}

export type LiveDrug = { drug: string ;dose: string ;route: string ;freq: string }

export type IoLine = { label: string ;ml: number }

export type LiveIo = {
  intake: IoLine[]
  output: IoLine[]
  totalIn: number
  totalOut: number
  balance: number
  /** "summary" = the nurse's 24h balance section; "hourly" = summed hour rows. */
  source: "summary" | "hourly"
}

export type CareTeamMember = { role: string ;name: string }
export type PlanItem = { time: string ;order: string ;by: string }
export type ChartLab = { label: string ;value: string }

export type LiveState = {
  /** Last hour (HH:00) with any observation charted, or null. */
  lastChartedHour: string | null
  vitals: LiveVitals | null
  vent: LiveVent | null
  hrTrend: { t: string ;v: number }[]
  bpTrend: { t: string ;v: number }[]
  gcs: { total: number ;at: string } | null
  rass: { score: number ;label: string ;at: string } | null
  consultant: string | null
  nurse: string | null
  diagnosis: string | null
  allergy: string | null
  drugs: LiveDrug[]
  alerts: string[]
  io: LiveIo | null
  careTeam: CareTeamMember[]
  plan: PlanItem[]
  /** Latest row of the chart's lab table, as charted. */
  chartLabs: { at: string ;values: ChartLab[] } | null
  updatedAt: string
}

const INTAKE_FIELDS: [string, string][] = [
  ["infusions", "Infusions"],
  ["sedation", "Sedation / analgesia"],
  ["iv_fluid", "IV fluid"],
  ["blood_ml", "Blood products"],
  ["tpn", "TPN"],
  ["enteral_oral", "Enteral — oral"],
  ["enteral_rtf", "Enteral — RTF"],
]
const OUTPUT_FIELDS: [string, string][] = [
  ["urine_ml_hr", "Urine"],
  ["drain_1", "Drain 1"],
  ["drain_2", "Drain 2"],
  ["rta_vomiting", "RTA / vomiting"],
]

function sumHourly(rec: FlowsheetRecord, section: string, fields: [string, string][]): IoLine[] {
  const cells = rec.hourly?.[section] ?? {}
  return fields
    .map(([key, label]) => {
      let ml = 0
      for (const h of HOURS) {
        const v = num(cells[`${h}|${key}`])
        if (v != null) ml += v
      }
      return { label, ml }
    })
    .filter((l) => l.ml !== 0)
}

function deriveIo(rec: FlowsheetRecord): LiveIo | null {
  const f = rec.fields ?? {}
  const sIn = num(f["balance_24h.intake"])
  const sOut = num(f["balance_24h.output"])
  if (sIn != null || sOut != null) {
    const output: IoLine[] = (
      [
        ["balance_24h.uo", "Urine"],
        ["balance_24h.drain", "Drains"],
        ["balance_24h.rta", "RTA"],
        ["balance_24h.uf", "Ultrafiltration"],
      ] as [string, string][]
    )
      .map(([k, label]) => ({ label, ml: num(f[k]) ?? 0 }))
      .filter((l) => l.ml !== 0)
    const totalIn = sIn ?? 0
    const totalOut = sOut ?? output.reduce((a, b) => a + b.ml, 0)
    return {
      intake: sIn != null ? [{ label: "Intake (IV + enteral)", ml: sIn }] : [],
      output,
      totalIn,
      totalOut,
      balance: num(f["balance_24h.balance"]) ?? totalIn - totalOut,
      source: "summary",
    }
  }
  const intake = sumHourly(rec, "intake", INTAKE_FIELDS)
  const output = sumHourly(rec, "output", OUTPUT_FIELDS)
  if (!intake.length && !output.length) return null
  const totalIn = intake.reduce((a, b) => a + b.ml, 0)
  const totalOut = output.reduce((a, b) => a + b.ml, 0)
  return { intake, output, totalIn, totalOut, balance: totalIn - totalOut, source: "hourly" }
}

const CHART_LAB_KEYS: [string, string][] = [
  ["hb", "Hb"],
  ["tlc", "TLC"],
  ["platelet", "Platelets"],
  ["inr", "INR"],
  ["urea", "Urea"],
  ["creatinine", "Creatinine"],
  ["na", "Na⁺"],
  ["k", "K⁺"],
]

const num = (s: string | null | undefined) => {
  const n = parseFloat(String(s ?? "").replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

const clean = (v: string | undefined | null) => {
  const t = (v ?? "").trim()
  return t ? t : null
}

/** Latest charted value of one hourly field, scanning the ICU day in order. */
function latestHourly(
  rec: FlowsheetRecord,
  section: string,
  keys: string[],
): { value: string ;at: string } | null {
  const cells = rec.hourly?.[section] ?? {}
  let found: { value: string ;at: string } | null = null
  for (const h of HOURS) {
    for (const k of keys) {
      const v = clean(cells[`${h}|${k}`])
      if (v) {
        found = { value: v, at: h }
        break
      }
    }
  }
  return found
}

function trend(rec: FlowsheetRecord, key: string, pick: (v: string) => number | null) {
  const cells = rec.hourly?.observations ?? {}
  const out: { t: string ;v: number }[] = []
  for (const h of HOURS) {
    const raw = clean(cells[`${h}|${key}`])
    if (!raw) continue
    const v = pick(raw)
    if (v != null) out.push({ t: h.slice(0, 2), v })
  }
  return out
}

const GCS = FLOWSHEET_SECTIONS.find((s) => s.id === "gcs")

function latestGcs(rec: FlowsheetRecord): LiveState["gcs"] {
  if (!GCS || GCS.kind !== "scale") return null
  const cells = rec.scales?.gcs ?? {}
  let found: LiveState["gcs"] = null
  for (const h of HOURS) {
    let total = 0
    let complete = true
    for (const c of GCS.components) {
      const chosen = cells[`${h}|${c.key}`]
      const score = c.options.find((o) => o.label === chosen)?.score
      if (score == null) {
        complete = false
        break
      }
      total += score
    }
    if (complete) found = { total, at: h }
  }
  return found
}

/** The ICU's own shifts, as printed on the chart's special-care grid. */
export function currentShift(now = new Date()): "m" | "e" | "n" {
  const h = now.getHours()
  if (h >= 8 && h < 16) return "m"
  if (h >= 16) return "e"
  return "n"
}

export function deriveLiveState(rec: FlowsheetRecord | null, now = new Date()): LiveState {
  const empty: LiveState = {
    lastChartedHour: null,
    vitals: null,
    vent: null,
    hrTrend: [],
    bpTrend: [],
    gcs: null,
    rass: null,
    consultant: null,
    nurse: null,
    diagnosis: null,
    allergy: null,
    drugs: [],
    alerts: [],
    io: null,
    careTeam: [],
    plan: [],
    chartLabs: null,
    updatedAt: "",
  }
  if (!rec) return empty

  const temp = latestHourly(rec, "observations", ["temp"])
  const hr = latestHourly(rec, "observations", ["hr", "pulse"])
  const bp = latestHourly(rec, "observations", ["bp"])
  const map = latestHourly(rec, "observations", ["map"])
  const rr = latestHourly(rec, "observations", ["rr_s", "rr_t"])
  const spo2 = latestHourly(rec, "observations", ["spo2"])
  const anyVital = [temp, hr, bp, map, rr, spo2].filter(Boolean) as { at: string }[]

  const vitals: LiveVitals | null = anyVital.length
    ? {
        temp: temp?.value ?? null,
        hr: hr?.value ?? null,
        bp: bp?.value ?? null,
        map: map?.value ?? null,
        rr: rr?.value ?? null,
        spo2: spo2?.value ?? null,
      }
    : null

  const mode = latestHourly(rec, "observations", ["vent_mode"])
  const fio2 = latestHourly(rec, "observations", ["fio2"])
  const vent: LiveVent | null =
    mode || fio2
      ? {
          mode: mode?.value ?? "Not charted",
          fio2: fio2?.value ?? null,
          peep: latestHourly(rec, "observations", ["peep"])?.value ?? null,
          tv: latestHourly(rec, "observations", ["tv"])?.value ?? null,
          rr: latestHourly(rec, "observations", ["rr_t"])?.value ?? null,
          pip: latestHourly(rec, "observations", ["pip"])?.value ?? null,
        }
      : null

  const rassCell = latestHourly(rec, "rass", ["score"])
  const rassScore = rassCell ? num(rassCell.value) : null
  const rass =
    rassCell && rassScore != null
      ? {
          score: rassScore,
          label: rassCell.value.replace(/^[+-]?\d+\s*/, "") || rassCell.value,
          at: rassCell.at,
        }
      : null

  const f = rec.fields ?? {}
  const shift = currentShift(now)
  const nurse =
    clean(f[`handover.${shift}_initials`]) ??
    clean(f[`handover.${shift}_taking_initials`]) ??
    clean(f["handover.m_initials"]) ??
    clean(f["handover.e_initials"]) ??
    clean(f["handover.n_initials"])

  const drugs: LiveDrug[] = (rec.tables?.drug_chart ?? [])
    .filter((r) => clean(r.drug))
    .map((r) => ({
      drug: r.drug,
      dose: r.dose || "",
      route: r.route || "",
      freq: r.freq || "",
    }))

  const v = vitals
  const alerts: string[] = []
  const spo2N = num(v?.spo2)
  const hrN = num(v?.hr)
  const sysN = num(v?.bp?.split("/")[0])
  const mapN = num(v?.map)
  const tempN = num(v?.temp)
  const rrN = num(v?.rr)
  if (spo2N != null && spo2N < 92) alerts.push(`SpO₂ ${spo2N}% at ${spo2!.at}`)
  if (hrN != null && (hrN > 120 || hrN < 50)) alerts.push(`Heart rate ${hrN} at ${hr!.at}`)
  if (sysN != null && sysN < 90) alerts.push(`Systolic BP ${sysN} mmHg at ${bp!.at}`)
  if (mapN != null && mapN < 65) alerts.push(`MAP ${mapN} mmHg at ${map!.at}`)
  if (tempN != null && tempN >= 38.3) alerts.push(`Temperature ${tempN}°C at ${temp!.at}`)
  if (rrN != null && (rrN > 30 || rrN < 8)) alerts.push(`Respiratory rate ${rrN} at ${rr!.at}`)
  const gcs = latestGcs(rec)
  if (gcs && gcs.total <= 8) alerts.push(`GCS ${gcs.total}/15 at ${gcs.at}`)
  if (rass && (rass.score <= -4 || rass.score >= 3))
    alerts.push(`RASS ${rass.score > 0 ? "+" : ""}${rass.score} at ${rass.at}`)
  const allergy = clean(f["admission.allergy"])
  if (allergy && !/^(nil|nkda|none|no)$/i.test(allergy)) alerts.push(`Allergy: ${allergy}`)

  const lastChartedHour = anyVital.length
    ? anyVital.reduce((a, b) => (HOURS.indexOf(b.at) > HOURS.indexOf(a.at) ? b : a)).at
    : null

  return {
    lastChartedHour,
    vitals,
    vent,
    hrTrend: trend(rec, "hr", (s) => num(s)),
    bpTrend: trend(rec, "bp", (s) => num(s.split("/")[0])),
    gcs,
    rass,
    consultant: clean(f["admission.icu_consultant"]) ?? clean(f["admission.primary_consultant"]),
    nurse,
    diagnosis: clean(f["admission.diagnosis"]),
    allergy,
    drugs,
    alerts,
    io: deriveIo(rec),
    careTeam: [
      ["Primary consultant", f["admission.primary_consultant"]],
      ["ICU consultant", f["admission.icu_consultant"]],
      ["Morning nurse", [f["handover.m_initials"], f["handover.m_id"]].filter(Boolean).join(" · ")],
      ["Evening nurse", [f["handover.e_initials"], f["handover.e_id"]].filter(Boolean).join(" · ")],
      ["Night nurse", [f["handover.n_initials"], f["handover.n_id"]].filter(Boolean).join(" · ")],
    ]
      .filter(([, name]) => clean(name as string))
      .map(([role, name]) => ({ role: role as string, name: (name as string).trim() })),
    plan: (rec.tables?.day_plan ?? [])
      .filter((r) => clean(r.order))
      .map((r) => ({ time: r.time || "", order: r.order, by: r.dr_sign || "" })),
    chartLabs: (() => {
      const rows = (rec.tables?.labs ?? []).filter((r) => CHART_LAB_KEYS.some(([k]) => clean(r[k])))
      const row = rows[rows.length - 1]
      if (!row) return null
      return {
        at: [row.date, row.time].filter(Boolean).join(" "),
        values: CHART_LAB_KEYS.filter(([k]) => clean(row[k])).map(([k, label]) => ({ label, value: row[k] })),
      }
    })(),
    updatedAt: rec.updatedAt || "",
  }
}

/** Acuity from what is actually charted; no vitals means "Vitals pending". */
export function acuityKey(live: LiveState | null, occupied: boolean): "empty" | "pending" | "critical" | "watch" | "stable" {
  if (!occupied) return "empty"
  const v = live?.vitals
  if (!v) return "pending"
  const spo2 = num(v.spo2)
  const hr = num(v.hr)
  const sys = num(v.bp?.split("/")[0])
  const map = num(v.map)
  if ((spo2 != null && spo2 < 92) || (hr != null && (hr > 120 || hr < 50)) || (sys != null && sys < 90) || (map != null && map < 65))
    return "critical"
  if ((spo2 != null && spo2 < 95) || (hr != null && hr > 100) || (sys != null && sys < 100))
    return "watch"
  return "stable"
}
