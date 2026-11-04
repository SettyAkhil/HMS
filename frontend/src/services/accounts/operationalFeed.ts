// Operational feed: turns what billing, pharmacy and insurance recorded into
// accounting events for the ledger.
//
// Those departments still keep their records in this browser (localStorage), so
// the ledger cannot read them itself; this adapter reads them and posts *events*
// -- "bill INV-9 raised", "₹3,000 received against it" -- never journals. The
// server's posting rules decide the accounting (modules/accounts/posting_rules.py).
//
// Every event id is derived from its source record (BILL-<claim id>, PAY-<payment
// id>, ...), and the server treats it as an idempotency key, so this can run on
// every visit, from every finance user's browser, without double-posting.
// Figures are passed through exactly as recorded: a bill whose shares do not add
// up is rejected by the server into the posting-exceptions queue for a person to
// fix, rather than "corrected" here.

import { BillingDatabase, type ClaimRecord } from "../billingDb"
import { PharmacyDatabase } from "../pharmacyDb"
import type { PostingEvent, PostingResult } from "../../types/accounts"
import { accountsApi } from "./client"

const BATCH = 200
const NON_POSTING_STATUSES = new Set(["Draft", "Voided"])

const day = (value?: string) => (value || new Date().toISOString()).slice(0, 10)
const slug = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")

function patientOf(claim: ClaimRecord) {
  return { id: claim.patientId || claim.mrn, name: claim.patientName }
}

function hasInsurer(claim: ClaimRecord) {
  return Boolean(claim.insuranceProvider) && claim.insuranceProvider !== "Self-Pay" && Number(claim.insurancePortion) > 0
}

function billingEvents(): PostingEvent[] {
  const events: PostingEvent[] = []
  for (const claim of BillingDatabase.getClaims()) {
    if (NON_POSTING_STATUSES.has(claim.status)) continue
    const patient = patientOf(claim)
    const payer = hasInsurer(claim)
      ? { id: slug(claim.insuranceProvider), name: claim.insuranceProvider, type: "insurance" }
      : undefined
    events.push({
      event_id: `BILL-${claim.id}`,
      type: "PATIENT_BILL",
      source: "billing",
      date: day(claim.dateOfService || claim.createdAt),
      bill_no: claim.invoiceNo,
      department: claim.department,
      patient,
      payer,
      gross: claim.subtotal,
      discount: claim.discount,
      tax: claim.tax,
      patient_share: claim.patientPortion,
      payer_share: payer ? claim.insurancePortion : 0,
    })
    for (const payment of claim.payments || []) {
      events.push({
        event_id: `PAY-${payment.id || `${claim.id}-${payment.receiptNo}`}`,
        type: "PATIENT_RECEIPT",
        source: "billing",
        date: day(payment.paymentDate),
        receipt_no: payment.receiptNo || payment.id,
        bill_no: claim.invoiceNo,
        amount: payment.amount,
        method: payment.paymentMethod,
        reference: payment.transactionRef,
        department: claim.department,
        patient,
      })
    }
    const tpa = claim.tpa
    if (payer && tpa?.settledAt && (Number(tpa.settledAmount) > 0 || Number(tpa.deduction) > 0)) {
      events.push({
        event_id: `SETTLE-${claim.id}`,
        type: "INSURANCE_SETTLEMENT",
        source: "insurance",
        date: day(tpa.settledAt),
        bill_no: claim.invoiceNo,
        claim_ref: claim.preAuthCode || claim.id,
        payer,
        patient,
        settled: Number(tpa.settledAmount) || 0,
        deduction: Number(tpa.deduction) || 0,
        deduction_to: tpa.shortfallTo || "writeoff",
        deduction_reason: tpa.deductionReason,
        reference: tpa.settlementRef,
      })
    }
  }
  return events
}

function pharmacyEvents(): PostingEvent[] {
  const events: PostingEvent[] = []
  for (const bill of PharmacyDatabase.getBills()) {
    const paidAtCounter = bill.billType === "Cash" && bill.paymentStatus === "Paid"
    events.push({
      event_id: `PHBILL-${bill.id}`,
      type: "PHARMACY_SALE",
      source: "pharmacy",
      date: day(bill.createdAt),
      bill_no: bill.billNumber,
      patient: { id: bill.patientId || bill.uhid || "WALK-IN", name: bill.patientName || "Walk-in customer" },
      taxable: bill.taxableTotal,
      cgst: bill.cgstTotal,
      sgst: bill.sgstTotal,
      total: bill.totalAmount,
      on_credit: !paidAtCounter,
      method: bill.paymentMode || "Cash",
    })
  }
  const suppliers = new Map(PharmacyDatabase.getSuppliers().map((s) => [s.id, s.supplierName]))
  for (const grn of PharmacyDatabase.getGRNs()) {
    const taxable = grn.items.reduce((sum, item) => sum + Number(item.receivedQty) * Number(item.purchasePrice), 0)
    events.push({
      event_id: `GRN-${grn.id}`,
      type: "PHARMACY_GRN",
      source: "pharmacy",
      date: day(grn.grnDate || grn.createdAt),
      grn_no: grn.id,
      supplier_invoice_no: grn.invoiceNumber,
      supplier: { id: grn.supplierId, name: suppliers.get(grn.supplierId) || grn.supplierId },
      taxable: Math.round(taxable * 100) / 100,
    })
  }
  return events
}

export interface FeedSummary {
  at: string
  sent: number
  posted: number
  duplicate: number
  rejected: number
  results: PostingResult[]
}

let inFlight: Promise<FeedSummary> | null = null

/** Send every operational record to the ledger. Safe to call repeatedly. */
export function syncOperationalFeed(): Promise<FeedSummary> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    const events = [...billingEvents(), ...pharmacyEvents()]
    const summary: FeedSummary = { at: new Date().toISOString(), sent: events.length, posted: 0, duplicate: 0, rejected: 0, results: [] }
    for (let i = 0; i < events.length; i += BATCH) {
      const { summary: batch, results } = await accountsApi.post(events.slice(i, i + BATCH))
      summary.posted += batch.posted || 0
      summary.duplicate += batch.duplicate || 0
      summary.rejected += batch.rejected || 0
      summary.results.push(...results)
    }
    return summary
  })().finally(() => {
    inFlight = null
  })
  return inFlight
}
