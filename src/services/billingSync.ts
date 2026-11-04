/**
 * Server invoices -> the billing counters, live.
 *
 * Billing used to read only bills held in this browser's localStorage, so a
 * bill raised anywhere else -- the OP desk's registration (register_op_visit
 * writes an invoice), an IP admission, another computer -- never reached the
 * counters ("nothing is fetching"). The backend's billing-service holds the
 * hospital's real invoices; this module pulls them, names them from the
 * patient master, and hands them to BillingDatabase.getClaims() as ordinary
 * ClaimRecords (id `SRV-<invoice id>`), refreshed on a short poll, on window
 * focus, and whenever any desk in this browser changes something.
 *
 * Server bills are never written into localStorage: the server owns them, and
 * a payment taken on one is posted to the server (`postServerPayment`).
 * Backend reads use raw fetch -- apiFetch's offline mock invents data.
 */

import type { ClaimRecord, DepartmentType, InvoiceItem, PaymentRecord } from "./billingDb"
import type { BedRecord } from "./bedDb"
import { API_BASE } from "../lib/constants"
import { withAuthHeaders } from "../lib/api"

export const BILLING_SYNC_INTERVAL_MS = 15_000

type ServerInvoice = {
  id: number
  invoice_no: string
  patient_id: string
  module: string | null
  doctor_name: string | null
  subtotal: number | null
  tax: number | null
  discount: number | null
  total_amount: number | null
  paid_amount: number | null
  due_amount: number | null
  refunded_amount: number | null
  payment_status: string | null
  created_at: string | null
  encounter_id: number | null
  appointment_id: number | null
  items?: ServerInvoiceItem[]
}

type ServerInvoiceItem = {
  id: number
  description: string | null
  category: string | null
  cpt_code: string | null
  quantity: number | null
  unit_price: number | null
  total: number | null
  insurance_covered: number | null
  patient_payable: number | null
}

type ServerInsuranceClaim = {
  id: number
  invoice_id: number | null
  insurer_name: string | null
  external_ref: string | null
  claim_amount: number | null
  approved_amount: number | null
  claim_status: string | null
}

type ServerPayment = {
  id: number
  invoice_id: number | null
  invoice_no: string | null
  amount: number | null
  mode: string | null
  date: string | null
  gateway_ref: string | null
}

type ServerPatient = {
  patient_id: string
  name?: string | null
  middle_name?: string | null
  last_name?: string | null
  age?: number | null
  gender?: string | null
  phone?: string | null
}

export type BillingSyncState = {
  status: "idle" | "syncing" | "live" | "offline" | "signin"
  lastSyncedAt: number | null
  invoiceCount: number
  error: string | null
}

let serverClaims: ClaimRecord[] = []
let state: BillingSyncState = { status: "idle", lastSyncedAt: null, invoiceCount: 0, error: null }
const patientCache = new Map<string, { at: number ;patient: ServerPatient | null }>()
const PATIENT_TTL_MS = 5 * 60_000
let inflight: Promise<boolean> | null = null
let lastSignature = ""

const listeners = new Set<() => void>()
/** Called after every sync that changed the server bills or the sync state. */
export function onBillingSync(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = () => listeners.forEach((fn) => fn())

export function getServerClaims(): ClaimRecord[] {
  return serverClaims
}
export function getBillingSyncState(): BillingSyncState {
  return state
}

async function getJson<T>(path: string): Promise<{ ok: boolean ;status: number ;data: T | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: withAuthHeaders({}, "GET"),
      cache: "no-store",
    })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    return { ok: true, status: res.status, data: (await res.json()) as T }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

/** The patient master row, or null if the patient no longer exists (deleted). */
async function patientFor(id: string): Promise<ServerPatient | null> {
  const hit = patientCache.get(id)
  if (hit && Date.now() - hit.at < PATIENT_TTL_MS) return hit.patient
  const res = await getJson<ServerPatient | { patient?: ServerPatient }>(`/api/patients/${encodeURIComponent(id)}`)
  let patient: ServerPatient | null = null
  if (res.ok && res.data) {
    const d = res.data as any
    patient = (d.patient ?? d) as ServerPatient
    if (!patient?.patient_id) patient = null
  } else if (res.status !== 404) {
    // Unknown (network / auth): keep any earlier answer rather than hiding bills.
    return hit?.patient ?? null
  }
  patientCache.set(id, { at: Date.now(), patient })
  return patient
}

const MODULE_DEPT: Record<string, DepartmentType> = {
  OP: "Outpatient",
  IP: "Inpatient",
  ER: "Emergency",
  ICU: "ICU",
  LAB: "Laboratory",
  LABORATORY: "Laboratory",
  RADIOLOGY: "Radiology",
  PHARMACY: "Pharmacy",
  OT: "Surgery",
  SURGERY: "Surgery",
}

const ITEM_CATEGORY: Partial<Record<DepartmentType, InvoiceItem["category"]>> = {
  Outpatient: "Consultation",
  Inpatient: "Room / Bed Charges",
  ICU: "Room / Bed Charges",
  Emergency: "Procedure / Surgery",
  Laboratory: "Laboratory",
  Radiology: "Radiology / Imaging",
  Surgery: "Procedure / Surgery",
  Pharmacy: "Consumables",
}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Backend timestamps without an offset are UTC. */
function isoOf(t: string | null | undefined): string {
  if (!t) return new Date(0).toISOString()
  const s = String(t).trim().replace(" ", "T")
  const withZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`
  const d = new Date(withZone)
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString()
}

const CATEGORIES: InvoiceItem["category"][] = [
  "Consultation",
  "Room / Bed Charges",
  "Nursing",
  "Procedure / Surgery",
  "Laboratory",
  "Radiology / Imaging",
  "Consumables",
]

const MODE_LABEL: Record<string, PaymentRecord["paymentMethod"]> = {
  cash: "Cash",
  card: "Debit Card",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  upi: "UPI / Digital",
  digital: "UPI / Digital",
  online: "UPI / Digital",
  razorpay: "UPI / Digital",
  insurance: "Insurance Copay",
  bank_transfer: "Bank Transfer",
  neft: "Bank Transfer",
  cheque: "Cheque",
}

function toClaim(inv: ServerInvoice, p: ServerPatient, payments: ServerPayment[]): ClaimRecord {
  const dept = MODULE_DEPT[String(inv.module || "").toUpperCase()] ?? "Outpatient"
  const total = n(inv.total_amount)
  const paid = n(inv.paid_amount)
  const due = inv.due_amount == null ? Math.max(0, total - paid) : n(inv.due_amount)
  const name = [p.name, p.middle_name, p.last_name].map((x) => (x || "").trim()).filter(Boolean).join(" ")
  const created = isoOf(inv.created_at)
  const g = String(p.gender || "").toLowerCase()
  const status: ClaimRecord["status"] =
    inv.payment_status === "paid" || (total > 0 && due <= 0) ? "Paid" : paid > 0 ? "Accepted" : "Ready"
  return {
    id: `SRV-${inv.id}`,
    invoiceNo: inv.invoice_no,
    patientId: inv.patient_id,
    patientName: name || inv.patient_id,
    mrn: inv.patient_id,
    age: n(p.age),
    gender: g.startsWith("f") ? "Female" : g.startsWith("m") ? "Male" : "Other",
    phone: p.phone || "",
    department: dept,
    carePathway: `${dept} invoice ${inv.invoice_no}`,
    dateOfService: created.slice(0, 10),
    insuranceProvider: "Self-Pay",
    policyNumber: "",
    status,
    attendingDoctor: inv.doctor_name || "",
    diagnosisCodes: [],
    // The invoice's own line items when it has them; otherwise one honest
    // summary line for the invoice total (nothing itemised is made up).
    items:
      inv.items && inv.items.length
        ? inv.items.map((it) => {
            const cat = CATEGORIES.find((c) => c.toLowerCase() === String(it.category || "").toLowerCase())
            const lineTotal = it.total != null ? n(it.total) : n(it.unit_price) * (n(it.quantity) || 1)
            return {
              id: `SRV-ITEM-${it.id}`,
              description: it.description || "Charge",
              category: cat ?? ITEM_CATEGORY[dept] ?? "Consultation",
              cptCode: it.cpt_code || "",
              quantity: n(it.quantity) || 1,
              unitPrice: n(it.unit_price) || lineTotal,
              total: lineTotal,
              insuranceCovered: n(it.insurance_covered),
              patientPayable: it.patient_payable != null ? n(it.patient_payable) : lineTotal,
            } as InvoiceItem
          })
        : [
            {
              id: `SRV-ITEM-${inv.id}`,
              description: `${dept} charges (invoice ${inv.invoice_no})`,
              category: ITEM_CATEGORY[dept] ?? "Consultation",
              cptCode: "",
              quantity: 1,
              unitPrice: n(inv.subtotal) || total,
              total: n(inv.subtotal) || total,
              insuranceCovered: 0,
              patientPayable: n(inv.subtotal) || total,
            } as InvoiceItem,
          ],
    subtotal: n(inv.subtotal) || total,
    discount: n(inv.discount),
    tax: n(inv.tax),
    totalAmount: total,
    insurancePortion: 0,
    patientPortion: total,
    amountPaid: paid,
    balanceDue: Math.max(0, due),
    // Payments recorded on the server against this invoice, from any desk.
    payments: payments.map((pay, i) => ({
      id: `SRV-PAY-${pay.id}`,
      invoiceId: `SRV-${inv.id}`,
      receiptNo: `RCPT-${inv.invoice_no}-${i + 1}`,
      amount: n(pay.amount),
      paymentDate: isoOf(pay.date),
      paymentMethod: MODE_LABEL[String(pay.mode || "").toLowerCase()] ?? "Cash",
      transactionRef: pay.gateway_ref || undefined,
      collectedBy: "Hospital billing",
    })),
    createdAt: created,
    updatedAt: payments.length ? isoOf(payments[0].date) : created,
    serverInvoiceId: inv.id,
  } as ClaimRecord
}

/**
 * A patient in a bed has no bill on the server yet -- billing-service raises
 * the IP invoice ("INV-IP-<admission>-...") when the bed is released. Until
 * then the counter shows a running bill: the room charges accrued so far, as
 * Bed Management prices them. It cannot take a payment; the final bill can.
 */
function toRunningClaim(bed: BedRecord): ClaimRecord {
  const dept: DepartmentType = String(bed.bed_type || "").toUpperCase() === "ICU" || /ICU|INTENSIVE/i.test(bed.ward || "") ? "ICU" : "Inpatient"
  const accrued = n(bed.room_charges_so_far)
  const since = bed.allocated_at || bed.admission_date
  const sinceIso = isoOf(since)
  const days = Math.max(1, Math.ceil((Date.now() - new Date(sinceIso).getTime()) / 86_400_000))
  const name = [bed.patient_name, bed.patient_last_name].filter(Boolean).join(" ").trim()
  const g = String(bed.patient_gender || "").toLowerCase()
  const where = `${bed.ward} / Room ${bed.room_no} / Bed ${bed.bed_no}`
  return {
    id: `RUN-${bed.admission_id}`,
    invoiceNo: `RUNNING-IP-${bed.admission_id}`,
    patientId: String(bed.patient_id || ""),
    patientName: name || String(bed.patient_id || ""),
    mrn: String(bed.patient_id || ""),
    age: n(bed.patient_age),
    gender: g.startsWith("f") ? "Female" : g.startsWith("m") ? "Male" : "Other",
    phone: bed.patient_phone || "",
    department: dept,
    carePathway: `Admitted · ${where}`,
    dateOfService: sinceIso.slice(0, 10),
    insuranceProvider: "Self-Pay",
    policyNumber: "",
    status: "Draft",
    attendingDoctor: "",
    diagnosisCodes: [],
    admissionId: bed.admission_id ?? undefined,
    bedId: bed.id,
    items: [
      {
        id: `RUN-ITEM-${bed.admission_id}`,
        description: `Room charges so far — ${where} (${days} day${days === 1 ? "" : "s"} @ ₹${n(bed.daily_rate).toLocaleString("en-IN")}/day)`,
        category: "Room / Bed Charges",
        cptCode: "",
        quantity: 1,
        unitPrice: accrued,
        total: accrued,
        insuranceCovered: 0,
        patientPayable: accrued,
      } as InvoiceItem,
    ],
    subtotal: accrued,
    discount: 0,
    tax: 0,
    totalAmount: accrued,
    insurancePortion: 0,
    patientPortion: accrued,
    amountPaid: 0,
    balanceDue: accrued,
    payments: [],
    createdAt: sinceIso,
    updatedAt: new Date().toISOString(),
    runningAdmissionId: bed.admission_id ?? undefined,
  } as ClaimRecord
}

/** Pull the server's invoices. Resolves true if the bill list changed. */
export function syncServerBilling(): Promise<boolean> {
  if (inflight) return inflight
  inflight = (async () => {
    const prevStatus = state.status
    if (state.status === "idle") state = { ...state, status: "syncing" }
    const [res, payRes, bedRes, insRes] = await Promise.all([
      getJson<{ invoices: ServerInvoice[] }>("/api/billing/invoices?include=items"),
      getJson<{ payments: ServerPayment[] }>("/api/billing/payments"),
      getJson<{ beds: BedRecord[] }>("/api/beds"),
      getJson<{ claims: ServerInsuranceClaim[] }>("/api/billing/claims"),
    ])
    if (!res.ok || !res.data) {
      state = {
        ...state,
        status: res.status === 401 || res.status === 403 ? "signin" : "offline",
        error: res.status ? `server answered ${res.status}` : "server unreachable",
      }
      if (state.status !== prevStatus) emit()
      return false
    }
    const invoices = (res.data.invoices ?? []).filter((i) => i && i.id != null && i.patient_id)
    const ids = Array.from(new Set(invoices.map((i) => i.patient_id)))
    // Bounded parallelism: look up only patients not already cached.
    const queue = [...ids]
    await Promise.all(
      Array.from({ length: Math.min(8, queue.length) }, async () => {
        while (queue.length) await patientFor(queue.shift()!)
      }),
    )
    const paymentsByInvoice = new Map<number, ServerPayment[]>()
    for (const pay of payRes.data?.payments ?? []) {
      if (pay.invoice_id == null) continue
      const list = paymentsByInvoice.get(pay.invoice_id) ?? []
      list.push(pay)
      paymentsByInvoice.set(pay.invoice_id, list)
    }
    const insuranceByInvoice = new Map<number, ServerInsuranceClaim>()
    for (const ic of insRes.data?.claims ?? []) if (ic.invoice_id != null) insuranceByInvoice.set(ic.invoice_id, ic)
    const next: ClaimRecord[] = []
    for (const inv of invoices) {
      const p = patientCache.get(inv.patient_id)?.patient
      if (!p) continue // a deleted patient's invoices are not shown
      const claim = toClaim(inv, p, paymentsByInvoice.get(inv.id) ?? [])
      // The insurance claim filed against this invoice, if any: it names the
      // payer on the bill. The invoice's own due amount stays authoritative.
      const ic = insuranceByInvoice.get(inv.id)
      if (ic?.insurer_name) {
        claim.insuranceProvider = ic.insurer_name
        claim.policyNumber = ic.external_ref || ""
        claim.carePathway = `${claim.carePathway} · insurance claim ${ic.claim_status || "filed"} (₹${n(ic.claim_amount).toLocaleString("en-IN")})`
      }
      next.push(claim)
    }
    // Running bills for patients in a bed now. Skipped if this admission's
    // final IP invoice already exists (the bed is released by then anyway).
    const finalised = new Set(
      invoices
        .map((i) => /^INV-IP-(\d+)-/.exec(i.invoice_no || "")?.[1])
        .filter(Boolean) as string[],
    )
    for (const bed of bedRes.data?.beds ?? []) {
      if (bed.status !== "Occupied" || !bed.patient_id || bed.admission_id == null) continue
      if (finalised.has(String(bed.admission_id))) continue
      next.push(toRunningClaim(bed))
    }
    const signature = JSON.stringify(
      next.map((c) => [c.id, c.totalAmount, c.amountPaid, c.balanceDue, c.status, c.patientName, c.items.length, c.payments.length, c.insuranceProvider]),
    )
    const changed = signature !== lastSignature
    lastSignature = signature
    serverClaims = next
    state = { status: "live", lastSyncedAt: Date.now(), invoiceCount: next.length, error: null }
    if (changed || prevStatus !== "live") emit()
    return changed
  })().finally(() => {
    inflight = null
  })
  return inflight
}

const MODE: Record<PaymentRecord["paymentMethod"], string> = {
  Cash: "cash",
  "Credit Card": "card",
  "Debit Card": "card",
  "Insurance Copay": "insurance",
  "UPI / Digital": "upi",
  "Bank Transfer": "bank_transfer",
  Cheque: "cheque",
}

/**
 * Record a payment on a server invoice. The counter has already shown it
 * (optimistically); this makes it real for every desk, then re-syncs.
 */
export async function postServerPayment(
  invoiceId: number,
  payment: { amount: number ;paymentMethod: PaymentRecord["paymentMethod"] ;transactionRef?: string },
): Promise<{ ok: boolean ;error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/billing/invoices/${invoiceId}/payments`, {
      method: "POST",
      credentials: "include",
      headers: withAuthHeaders({ "Content-Type": "application/json" }, "POST"),
      body: JSON.stringify({
        amount: payment.amount,
        payment_mode: MODE[payment.paymentMethod] ?? "cash",
        gateway_ref: payment.transactionRef || null,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: body?.error || `server answered ${res.status}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "server unreachable" }
  } finally {
    await syncServerBilling()
  }
}

/** Optimistically reflect a counter payment on the cached server bill. */
export function applyServerPaymentLocally(claim: ClaimRecord): void {
  serverClaims = serverClaims.map((c) => (c.id === claim.id ? claim : c))
}

// ── Live refresh ────────────────────────────────────────────────────────────
let timer: number | undefined
let users = 0
const onFocus = () => void syncServerBilling()
const onVisible = () => {
  if (document.visibilityState === "visible") void syncServerBilling()
}

/** Start the live poll while any billing screen is open (ref-counted). */
export function retainBillingSync(): () => void {
  users += 1
  if (users === 1 && typeof window !== "undefined") {
    void syncServerBilling()
    timer = window.setInterval(() => void syncServerBilling(), BILLING_SYNC_INTERVAL_MS)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
  }
  return () => {
    users = Math.max(0, users - 1)
    if (users === 0 && typeof window !== "undefined") {
      window.clearInterval(timer)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }
}
