/**
 * Shared live-operations signals.
 *
 * The dashboard, the sidebar badges and the notification bell all describe the
 * same hospital state, so they read it through this one module -- otherwise
 * they drift apart and the sidebar ends up claiming 8 ED patients while the
 * dashboard next to it shows 2.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch } from "./api"

export const IST = "Asia/Kolkata"

// ─── Shared response shapes ───────────────────────────────────────────────────

export type LabelCount = { label: string ;count: number }

export type BedSummary = {
  total: number
  available: number
  occupied: number
  maintenance: number
}

export type Bed = {
  id: number
  ward: string
  room_no: string
  bed_no: string
  bed_type: string
  status: "Available" | "Occupied" | "Maintenance"
  patient_id: string | null
  patient_name: string | null
  patient_last_name: string | null
  expected_discharge_date: string | null
}

export type ErVisit = {
  id: number
  visit_no: string
  patient_id: string | null
  is_unknown_patient: boolean
  unknown_patient_label: string | null
  arrival_mode: string | null
  condition_at_arrival: string | null
  arrival_at: string | null
  status: string
  assigned_doctor_name: string | null
  assigned_specialty: string | null
  triage_category: string | null
  triage_bed_label: string | null
  patient_name?: string | null
  patient_last_name?: string | null
}

export type TriageCategory = {
  id: number
  category_code: string
  category_label: string
  color: string | null
  sort_order: number
}

export type ErBedRequest = {
  id: number
  visit_no: string
  patient_name: string | null
  patient_last_name: string | null
  is_unknown_patient: boolean
  unknown_patient_label: string | null
  requested_level_of_care: string
  requested_specialty: string | null
  requested_at: string
}

export type PharmacySummary = {
  low_stock_count: number
  out_of_stock_count: number
  damaged_stock_count: number
  sales_total: number
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** YYYY-MM-DD in IST, matching the backend's own notion of "today". */
export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function istClock(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date)
}

export function istLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

/** Backend timestamps are naive UTC; parse them the same way lib/format does. */
export function parseTs(value?: string | null): Date | null {
  if (!value) return null
  const normalized = value.trim().replace(" ", "T")
  const hasOffset = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized)
  const parsed = new Date(hasOffset ? normalized : `${normalized}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * appointments.appointment_date is the only timestamp the backend stores as IST
 * wall-clock rather than UTC (staff pick the slot, the server writes it verbatim
 * -- compare a row's appointment_date against its UTC created_at to see it), so
 * it must be read off the string directly. Sending it through parseTs would
 * shift every slot forward by the IST offset.
 */
export function wallClockTime(value?: string | null): string {
  if (!value) return "—"
  const match = value.trim().match(/[T ](\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : "—"
}

export function isoDayIST(value?: string | null): string | null {
  const parsed = parseTs(value)
  if (!parsed) return null
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed)
}

export function minutesSince(value?: string | null): number | null {
  const parsed = parseTs(value)
  if (!parsed) return null
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000))
}

export function waitLabel(minutes: number | null): string {
  if (minutes === null) return "—"
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function agoLabel(value?: string | null): string {
  const minutes = minutesSince(value)
  if (minutes === null) return "just now"
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

export function personName(
  first?: string | null,
  last?: string | null,
  fallback = "Patient",
): string {
  return `${first || ""} ${last || ""}`.trim() || fallback
}

export function erPatientLabel(v: {
  is_unknown_patient?: boolean
  unknown_patient_label?: string | null
  patient_name?: string | null
  patient_last_name?: string | null
}): string {
  if (v.is_unknown_patient) return v.unknown_patient_label || "Unknown patient"
  return personName(v.patient_name, v.patient_last_name)
}

/** Every panel degrades on its own: a 403 for one module never blanks the page. */
export function safe<T>(promise: Promise<T>): Promise<T | null> {
  return promise.then((value) => value).catch(() => null)
}

// Denylist rather than allowlist: the ER module can add new in-flight statuses
// at any time, and a new one silently disappearing off the board is a far worse
// failure than an unrecognised terminal status lingering on it.
export const CLOSED_ER_STATUSES = new Set([
  "closed",
  "discharged",
  "lama",
  "cancelled",
  "left_without_being_seen",
])

export function isActiveErVisit(v: ErVisit): boolean {
  return !CLOSED_ER_STATUSES.has((v.status || "").toLowerCase())
}

/** Highest-acuity triage codes sort first; unknown/untriaged sinks to the bottom. */
export function triageRank(
  code: string | null,
  categories: TriageCategory[],
): number {
  if (!code) return 999
  const found = categories.findIndex((c) => c.category_code === code)
  return found === -1 ? 998 : found
}

export function isCriticalTriage(
  code: string | null,
  categories: TriageCategory[],
): boolean {
  if (!code) return false
  const cat = categories.find((c) => c.category_code === code)
  const label = (cat?.category_label || code).toLowerCase()
  return (
    /immediate|critical|resuscitat|emergent|severe|red|p1/.test(label) ||
    code === "B1"
  )
}

// ─── The pulse hook ───────────────────────────────────────────────────────────

export type OpsNotification = {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  body: string
  /** UTC timestamp of the underlying event, or null for aggregate signals. */
  at: string | null
  module: string
}

export type OpsPulse = {
  loading: boolean
  /** null means the signal could not be read (offline, or no permission). */
  edActive: number | null
  edCritical: number
  edUntriaged: number
  pendingBedRequests: number | null
  pharmacyAlerts: number | null
  bedsAvailable: number | null
  occupancyRate: number | null
  notifications: OpsNotification[]
  refresh: () => void
  /**
   * Raw slices, so a screen that needs the detail (the dashboard's ED board and
   * ward census) reuses this one fetch instead of issuing its own duplicate
   * requests against the same connection-limited origin.
   */
  raw: {
    erVisits: ErVisit[] | null
    triageCategories: TriageCategory[]
    bedRequests: ErBedRequest[] | null
    pharmacy: PharmacySummary | null
    beds: Bed[] | null
    bedSummary: BedSummary | null
  }
}

const PULSE_INTERVAL_MS = 90_000

/**
 * Polls the handful of endpoints the sidebar badges and notification bell need.
 * Deliberately smaller than the dashboard's own fetch: this one runs on every
 * screen, so it stays cheap.
 */
export function useOpsPulse(enabled: boolean): OpsPulse {
  const [loading, setLoading] = useState(true)
  const [erVisits, setErVisits] = useState<ErVisit[] | null>(null)
  const [categories, setCategories] = useState<TriageCategory[]>([])
  const [bedRequests, setBedRequests] = useState<ErBedRequest[] | null>(null)
  const [pharmacy, setPharmacy] = useState<PharmacySummary | null>(null)
  const [bedSummary, setBedSummary] = useState<BedSummary | null>(null)
  const [beds, setBeds] = useState<Bed[] | null>(null)
  const mounted = useRef(true)

  // StrictMode mounts, unmounts and remounts every component in development.
  // Without re-arming the flag on the second mount it stays false forever and
  // every in-flight response is discarded on arrival -- the requests succeed,
  // the screen stays on skeletons.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const [erRes, catRes, reqRes, pharmRes, bedsRes] = await Promise.all([
      safe(apiFetch<{ visits: ErVisit[] }>("/api/er/visits?active_only=true")),
      safe(apiFetch<{ categories: TriageCategory[] }>("/api/er/triage-config")),
      safe(
        apiFetch<{ bed_requests: ErBedRequest[] }>(
          "/api/er/bed-requests?status=pending",
        ),
      ),
      safe(apiFetch<PharmacySummary>("/api/pharmacy/summary")),
      safe(apiFetch<{ beds: Bed[] ;summary: BedSummary }>("/api/beds")),
    ])
    if (!mounted.current) return
    // Keep the last good value when a call fails, so a blip does not flash the
    // badges away and back.
    if (erRes) setErVisits(erRes.visits)
    if (catRes) setCategories(catRes.categories)
    if (reqRes) setBedRequests(reqRes.bed_requests)
    if (pharmRes) setPharmacy(pharmRes)
    if (bedsRes) {
      setBedSummary(bedsRes.summary)
      setBeds(bedsRes.beds)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!enabled) return
    load()
    const id = window.setInterval(load, PULSE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [enabled, load])

  const active = erVisits === null ? null : erVisits.filter(isActiveErVisit)
  const critical = (active ?? []).filter((v) =>
    isCriticalTriage(v.triage_category, categories),
  )
  const untriaged = (active ?? []).filter((v) => !v.triage_category)

  const notifications: OpsNotification[] = []
  for (const v of critical) {
    notifications.push({
      id: `er-critical-${v.id}`,
      severity: "critical",
      title: "Critical ED patient",
      body: `${erPatientLabel(v)} · triage ${v.triage_category} · ${v.arrival_mode || "arrival"}`,
      at: v.arrival_at,
      module: "emergency",
    })
  }
  for (const v of untriaged) {
    notifications.push({
      id: `er-untriaged-${v.id}`,
      severity: "warning",
      title: "Awaiting triage",
      body: `${erPatientLabel(v)} · waiting ${waitLabel(minutesSince(v.arrival_at))}`,
      at: v.arrival_at,
      module: "triage",
    })
  }
  for (const r of bedRequests ?? []) {
    notifications.push({
      id: `bed-request-${r.id}`,
      severity: "warning",
      title: "Bed request pending",
      body: `${erPatientLabel(r)} · ${r.requested_level_of_care}${
        r.requested_specialty ? ` · ${r.requested_specialty}` : ""
      }`,
      at: r.requested_at,
      module: "beds",
    })
  }
  if (pharmacy && pharmacy.out_of_stock_count > 0) {
    notifications.push({
      id: "pharmacy-out-of-stock",
      severity: "critical",
      title: "Medicines out of stock",
      body: `${pharmacy.out_of_stock_count} item(s) at zero quantity`,
      at: null,
      module: "pharmacy",
    })
  }
  if (pharmacy && pharmacy.low_stock_count > 0) {
    notifications.push({
      id: "pharmacy-low-stock",
      severity: "warning",
      title: "Stock below reorder level",
      body: `${pharmacy.low_stock_count} item(s) need reordering`,
      at: null,
      module: "pharmacy",
    })
  }
  const occupancyRate =
    bedSummary && bedSummary.total > 0
      ? Math.round((bedSummary.occupied / bedSummary.total) * 100)
      : null
  if (occupancyRate !== null && occupancyRate >= 90 && bedSummary) {
    notifications.push({
      id: "bed-capacity",
      severity: "critical",
      title: "Bed capacity critical",
      body: `${occupancyRate}% occupied · ${bedSummary.available} bed(s) free`,
      at: null,
      module: "inpatient",
    })
  }

  // Newest first; aggregate signals (no timestamp) sort to the top since they
  // describe right now rather than a past event.
  notifications.sort((a, b) => {
    const at = a.at ? (parseTs(a.at)?.getTime() ?? 0) : Number.MAX_SAFE_INTEGER
    const bt = b.at ? (parseTs(b.at)?.getTime() ?? 0) : Number.MAX_SAFE_INTEGER
    return bt - at
  })

  const pharmacyAlerts =
    pharmacy === null
      ? null
      : pharmacy.out_of_stock_count + pharmacy.low_stock_count

  return {
    loading,
    edActive: active === null ? null : active.length,
    edCritical: critical.length,
    edUntriaged: untriaged.length,
    pendingBedRequests: bedRequests === null ? null : bedRequests.length,
    pharmacyAlerts,
    bedsAvailable: bedSummary?.available ?? null,
    occupancyRate,
    notifications,
    refresh: load,
    raw: {
      erVisits,
      triageCategories: categories,
      bedRequests,
      pharmacy,
      beds,
      bedSummary,
    },
  }
}
