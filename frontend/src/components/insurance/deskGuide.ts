import type { ComprehensiveClaimRecord, InsuranceClaimStatus } from "../../types/insurance"

// The insurance journey told in plain language for the front-line desk: six
// steps instead of 22 statuses, what each one means, and what to keep ready.

export type DeskStepId = "admission" | "eligibility" | "preauth" | "treatment" | "discharge" | "submission" | "adjudication" | "settlement"

export interface DeskStep {
  id: DeskStepId
  n: number
  emoji: string
  title: string
  short: string
  /** Tailwind colour family for this stage (circle, active card). */
  color: "blue" | "green" | "violet" | "orange" | "teal" | "fuchsia" | "indigo" | "emerald"
  statuses: InsuranceClaimStatus[]
  /** What happens in this stage — the bullets from the hospital's claim process chart. */
  tasks: string[]
  meaning: string
  needs: string[]
}

/**
 * Hospital → insurance company claim process, 8 stages. Communication with
 * the insurer / TPA is by email: the insurance desk verifies the documents,
 * emails them, and records the insurer's emailed reply to move the case on.
 */
export const DESK_STEPS: DeskStep[] = [
  {
    id: "admission",
    n: 1,
    emoji: "",
    title: "Patient Admission",
    short: "Register & capture insurance",
    color: "blue",
    statuses: ["DRAFT"],
    tasks: ["Register patient", "Capture insurance details", "Upload policy documents", "Link to encounter"],
    meaning: "The patient is admitted and the payment type is set to insurance. Capture the policy and link it to this admission.",
    needs: ["Insurance card or e-card", "Patient photo ID (Aadhaar / PAN)", "Policy number"],
  },
  {
    id: "eligibility",
    n: 2,
    emoji: "",
    title: "Eligibility Verification",
    short: "Policy active? Cover left?",
    color: "green",
    statuses: ["ELIGIBILITY_PENDING", "ELIGIBLE", "NOT_ELIGIBLE"],
    tasks: ["Verify policy with insurer / TPA", "Check coverage & limits", "Validate room rent, co-pay, deductible"],
    meaning: "Confirm with the insurer or TPA that the policy is active, the hospital is in network, and how much cover is left.",
    needs: ["Policy number and member ID", "Insurer / TPA contact"],
  },
  {
    id: "preauth",
    n: 3,
    emoji: "",
    title: "Pre-Authorization",
    short: "Request by email, record reply",
    color: "violet",
    statuses: ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "PREAUTH_UNDER_REVIEW", "PREAUTH_QUERY", "PREAUTH_REJECTED"],
    tasks: ["Submit pre-auth request", "Diagnosis & proposed treatment", "Estimated cost", "Upload clinical documents"],
    meaning: "Prepare the request (diagnosis, package, cost), verify the documents, email them to the insurer, then record their emailed reply: approved, partially approved, query or rejected.",
    needs: ["Doctor's diagnosis and notes", "Planned surgery / package", "ID and insurance card copies", "Cost estimate"],
  },
  {
    id: "treatment",
    n: 4,
    emoji: "",
    title: "Treatment / Surgery",
    short: "Within the approved amount",
    color: "orange",
    statuses: ["PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS"],
    tasks: ["Submit treatment as per approval", "Update procedures, medicines", "Maintain medical records"],
    meaning: "Treatment goes ahead as approved. Watch the running bill — if it will exceed the approval, email the insurer for an enhancement.",
    needs: ["Running bill", "Doctor's reason if more is needed"],
  },
  {
    id: "discharge",
    n: 5,
    emoji: "",
    title: "Discharge & Final Bill",
    short: "Final bill & summary",
    color: "teal",
    statuses: ["DISCHARGE_INITIATED", "FINAL_BILL_READY"],
    tasks: ["Generate final bill", "Prepare discharge summary", "Collect all required documents"],
    meaning: "The patient is discharged. The IP counter sends the final bill to insurance; collect and verify every document the claim needs.",
    needs: ["Discharge summary", "Final itemised bill", "Reports and pharmacy bills", "Pre-auth approval letter"],
  },
  {
    id: "submission",
    n: 6,
    emoji: "",
    title: "Claim Submission",
    short: "Email the claim, track it",
    color: "fuchsia",
    statuses: ["CLAIM_SUBMITTED"],
    tasks: ["Submit final claim to insurer / TPA", "Upload all required documents", "Track submission status"],
    meaning: "The verified claim file has been emailed to the insurer. Track it until they reply.",
    needs: ["All discharge documents verified"],
  },
  {
    id: "adjudication",
    n: 7,
    emoji: "",
    title: "Claim Adjudication",
    short: "Insurer reviews & decides",
    color: "indigo",
    statuses: ["CLAIM_QUERY_RAISED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED"],
    tasks: ["Insurer reviews claim", "Checks policy terms", "Evaluates medical necessity", "Raises query if required"],
    meaning: "The insurer reviews the claim and replies by email: approved, partially approved with deductions, a query, or rejected.",
    needs: ["Insurer's decision email"],
  },
  {
    id: "settlement",
    n: 8,
    emoji: "",
    title: "Settlement",
    short: "Payment & reconciliation",
    color: "emerald",
    statuses: ["SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED"],
    tasks: ["Claim approved", "Settlement advice", "Payment to hospital", "Reconciliation", "Claim closed"],
    meaning: "Record the settlement advice and the payment (UTR), match it with the bank, and close the claim.",
    needs: ["Settlement advice", "UTR / bank reference", "Bank statement"],
  },
]

/** Colour classes per stage, kept literal so Tailwind generates them. */
export const STAGE_TONE: Record<DeskStep["color"], { dot: string; soft: string; ring: string; text: string; solid: string }> = {
  blue: { dot: "bg-blue-600", soft: "bg-blue-50", ring: "border-blue-500", text: "text-blue-700", solid: "bg-blue-600" },
  green: { dot: "bg-green-600", soft: "bg-green-50", ring: "border-green-500", text: "text-green-700", solid: "bg-green-600" },
  violet: { dot: "bg-violet-600", soft: "bg-violet-50", ring: "border-violet-500", text: "text-violet-700", solid: "bg-violet-600" },
  orange: { dot: "bg-orange-500", soft: "bg-orange-50", ring: "border-orange-500", text: "text-orange-700", solid: "bg-orange-500" },
  teal: { dot: "bg-teal-600", soft: "bg-teal-50", ring: "border-teal-500", text: "text-teal-700", solid: "bg-teal-600" },
  fuchsia: { dot: "bg-fuchsia-600", soft: "bg-fuchsia-50", ring: "border-fuchsia-500", text: "text-fuchsia-700", solid: "bg-fuchsia-600" },
  indigo: { dot: "bg-indigo-600", soft: "bg-indigo-50", ring: "border-indigo-500", text: "text-indigo-700", solid: "bg-indigo-600" },
  emerald: { dot: "bg-emerald-600", soft: "bg-emerald-50", ring: "border-emerald-500", text: "text-emerald-700", solid: "bg-emerald-600" },
}

/** The claim status flow from the process chart, in order. */
export const STATUS_FLOW: { label: string; emoji: string; reached: InsuranceClaimStatus[] }[] = (() => {
  const order: InsuranceClaimStatus[] = [
    "DRAFT", "ELIGIBILITY_PENDING", "ELIGIBLE", "PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "PREAUTH_UNDER_REVIEW", "PREAUTH_QUERY",
    "PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED",
    "APPROVED", "PARTIALLY_APPROVED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED",
  ]
  const from = (s: InsuranceClaimStatus) => order.slice(order.indexOf(s))
  return [
    { label: "Draft", emoji: "", reached: from("DRAFT") },
    { label: "Pre-Auth Submitted", emoji: "", reached: from("PREAUTH_SUBMITTED") },
    { label: "Pre-Auth Approved", emoji: "", reached: from("PREAUTH_APPROVED") },
    { label: "Treatment In Progress", emoji: "", reached: from("TREATMENT_IN_PROGRESS") },
    { label: "Discharge & Final Bill", emoji: "", reached: from("DISCHARGE_INITIATED") },
    { label: "Claim Submitted", emoji: "", reached: from("CLAIM_SUBMITTED") },
    { label: "Under Review", emoji: "", reached: from("CLAIM_SUBMITTED") },
    { label: "Query Raised", emoji: "", reached: ["CLAIM_QUERY_RAISED", "PREAUTH_QUERY"] },
    { label: "Approved", emoji: "", reached: from("APPROVED") },
    { label: "Settlement Pending", emoji: "", reached: from("SETTLEMENT_PENDING") },
    { label: "Payment Received", emoji: "", reached: from("PAYMENT_RECEIVED") },
    { label: "Claim Closed", emoji: "", reached: ["CLOSED"] },
  ]
})()

export const stepOf = (c: ComprehensiveClaimRecord) => DESK_STEPS.find((s) => s.statuses.includes(c.status)) ?? DESK_STEPS[0]

/** A few words for the patient card: what is the desk waiting on? */
export const NEXT_SHORT: Record<InsuranceClaimStatus, string> = {
  DRAFT: "Add policy details",
  ELIGIBILITY_PENDING: "Check the policy with insurer",
  ELIGIBLE: "Prepare the approval request",
  NOT_ELIGIBLE: "Not covered — re-check or self-pay",
  PREAUTH_DRAFT: "Upload papers and send request",
  PREAUTH_SUBMITTED: "Waiting for insurer's reply",
  PREAUTH_UNDER_REVIEW: "Insurer is reviewing",
  PREAUTH_QUERY: "Answer the insurer's question",
  PREAUTH_APPROVED: "Approved — treatment can start",
  PREAUTH_REJECTED: "Approval refused — fix and resend",
  TREATMENT_IN_PROGRESS: "In treatment — watch the limit",
  DISCHARGE_INITIATED: "Waiting for final bill",
  FINAL_BILL_READY: "Upload discharge papers and send claim",
  CLAIM_SUBMITTED: "Waiting for insurer's decision",
  CLAIM_QUERY_RAISED: "Answer the insurer's question",
  APPROVED: "Enter settlement letter number",
  PARTIALLY_APPROVED: "Enter settlement letter number",
  REJECTED: "Claim refused — file an appeal",
  SETTLEMENT_PENDING: "Waiting for the money",
  PAYMENT_RECEIVED: "Match payment with bank",
  RECONCILED: "Close the claim",
  CLOSED: "Finished",
}

/** Statuses where the desk has something to do right now (not just waiting). */
export const NEEDS_ME: InsuranceClaimStatus[] = [
  "DRAFT",
  "ELIGIBILITY_PENDING",
  "ELIGIBLE",
  "PREAUTH_DRAFT",
  "PREAUTH_QUERY",
  "PREAUTH_REJECTED",
  "PREAUTH_APPROVED",
  "FINAL_BILL_READY",
  "CLAIM_QUERY_RAISED",
  "REJECTED",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "PAYMENT_RECEIVED",
  "RECONCILED",
]

export const GLOSSARY: [string, string][] = [
  ["Cashless", "The insurer pays the hospital directly; the patient pays only what is not covered."],
  ["TPA", "Third Party Administrator — the company that handles claims for the insurer. You usually talk to them."],
  ["Eligibility", "Checking that the policy is active and how much cover is left."],
  ["Pre-auth", "Approval from the insurer, before treatment, for an estimated amount."],
  ["Package", "A fixed price for a procedure (e.g. B-11 Appendectomy) that covers surgeon, OT, room and nursing."],
  ["Enhancement", "Asking the insurer to raise the approved amount when the bill will be higher than planned."],
  ["Co-pay", "A fixed share of the bill (e.g. 10%) that the patient always pays."],
  ["Deduction", "Items the insurer refuses to pay (e.g. gloves, extra room rent). Either the hospital writes it off or the patient pays."],
  ["Query", "A question from the insurer. The claim waits until it is answered."],
  ["Settlement advice", "The insurer's letter saying how much it will pay and when."],
  ["UTR", "The bank transfer reference number — proof the money was sent."],
  ["Reconcile", "Checking that the money received matches what the insurer promised."],
]
