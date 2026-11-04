import { db, DBOPEncounter } from "./db"

/**
 * When an OP encounter actually started, as milliseconds.
 *
 * Desks write the arrival in three shapes: a full ISO timestamp, a dated
 * string ("12-Jan-2026 09:15 AM"), or a bare wall-clock time ("10:30 AM", which
 * reception means as today). `new Date("10:30 AM")` is Invalid Date, so every
 * waiting timer and newest-first sort built on it showed "--" or sorted at
 * random. A dated candidate always wins over a bare time, because a finished
 * visit from January must not read as this morning's.
 */
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function clockOf(text: string): [number, number] | null {
  const m = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ampm = m[3]?.toUpperCase()
  if (ampm === "PM" && h < 12) h += 12
  if (ampm === "AM" && h === 12) h = 0
  return h < 24 && min < 60 ? [h, min] : null
}

function datedMs(text: string): number | null {
  if (/\d{4}-\d{2}-\d{2}/.test(text)) {
    const ms = Date.parse(text)
    if (Number.isFinite(ms)) return ms
  }
  // "12-Jan-2026 09:15 AM", "12 Jan 2026"
  const m = text.match(/(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/](\d{4})/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    const [h, min] = clockOf(text) || [9, 0]
    const d = new Date(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), h, min)
    if (Number.isFinite(d.getTime())) return d.getTime()
  }
  return null
}

export function encounterArrivalMs(e: Pick<DBOPEncounter, "timestamps" | "registrationTime"> & { date?: string; createdAt?: string; umr?: string }): number | null {
  if (e.createdAt) {
    const ms = Date.parse(e.createdAt)
    if (Number.isFinite(ms)) return ms
  }
  const candidates = [e.timestamps?.arrival, e.timestamps?.registration, e.registrationTime].filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0,
  )
  for (const c of candidates) {
    const ms = datedMs(c)
    if (ms !== null) return ms
  }
  for (const c of candidates) {
    const clock = clockOf(c)
    if (clock) {
      let baseDate: Date | null = null
      if (e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        baseDate = new Date(`${e.date}T00:00:00`)
      } else if (e.umr) {
        try {
          const pt = db.getPatientByUmr(e.umr)
          if (pt?.createdAt) {
            baseDate = new Date(pt.createdAt)
          }
        } catch {}
      }
      const d = baseDate && !isNaN(baseDate.getTime()) ? baseDate : new Date()
      d.setHours(clock[0], clock[1], 0, 0)
      return d.getTime()
    }
  }
  return null
}

/** ISO form of `encounterArrivalMs`, or "" when nothing parseable was recorded. */
export function encounterArrivalIso(e: Pick<DBOPEncounter, "timestamps" | "registrationTime"> & { date?: string; createdAt?: string; umr?: string }): string {
  const ms = encounterArrivalMs(e)
  return ms === null ? "" : new Date(ms).toISOString()
}

/** Any timestamp-ish string to ms, for the other clocks on an encounter. */
export function stampMs(text?: string | null): number | null {
  if (!text) return null
  const dated = datedMs(text)
  if (dated !== null) return dated
  const ms = Date.parse(text)
  return Number.isFinite(ms) ? ms : null
}
