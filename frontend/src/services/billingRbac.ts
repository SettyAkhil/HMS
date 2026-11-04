/**
 * Enterprise Hospital Management System - Billing Role-Based Access Control (RBAC) Engine
 * Granular permission matrices, multi-tiered approval workflows, departmental scoping,
 * and immutable financial audit trail.
 */

export type BillingRole = "billing_manager" | "billing_specialist" | "cashier" | "claims_specialist" | "ar_specialist" | "dept_billing" | "hospital_admin" | "finance_accounting"

export type BillingDepartmentScope = "All" | "Emergency" | "Inpatient" | "ICU" | "Surgery" | "Outpatient" | "Radiology" | "Laboratory"

export interface BillingUserProfile {
  id: string // e.g. "STAFF-BM-01"
  name: string // "Dr. Rajesh K (Billing Administrator)"
  email: string
  role: BillingRole
  roleLabel: string
  department: BillingDepartmentScope
  maxSmallAdjustmentLimit: number // in INR ₹ (e.g. 5000)
  canApproveSelf: boolean // strictly false for all financial safety
}

// ── Granular Permission Tokens ──────────────────────────────────────────────
export type BillingPermission = "patients.view" | "patients.search" | "patients.edit_demographics" | "charges.view" | "charges.create" | "charges.edit" | "charges.finalize" | "charges.void" | "invoices.view" | "invoices.create" | "invoices.edit" | "invoices.finalize" | "invoices.void" | "invoices.reprint" | "payments.view" | "payments.record" | "payments.refund_request" | "payments.refund_approve" | "payments.reverse" | "claims.view" | "claims.create" | "claims.submit" | "claims.edit" | "claims.resubmit" | "claims.appeal" | "claims.bulk_submit" | "adjustments.view" | "adjustments.create_small" | "adjustments.create_large" | "adjustments.approve" | "adjustments.reverse" | "ar.view" | "ar.add_activity" | "ar.update_status" | "ar.export" | "reports.view" | "reports.export" | "admin.billing_config" | "admin.payer_config" | "admin.permissions" | "audit.view" // Patients // Charges // Invoices // Payments // Insurance Claims // Adjustments & Write-Offs // A/R & Collections // Reports // Administration // Audit

// ── Role Permissions Mapping ────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<BillingRole, BillingPermission[]> = {
  // 1. Billing Administrator / Billing Manager: Full module control & approvals
  billing_manager: [
    "patients.view",
    "patients.search",
    "patients.edit_demographics",
    "charges.view",
    "charges.create",
    "charges.edit",
    "charges.finalize",
    "charges.void",
    "invoices.view",
    "invoices.create",
    "invoices.edit",
    "invoices.finalize",
    "invoices.void",
    "invoices.reprint",
    "payments.view",
    "payments.record",
    "payments.refund_request",
    "payments.refund_approve",
    "payments.reverse",
    "claims.view",
    "claims.create",
    "claims.submit",
    "claims.edit",
    "claims.resubmit",
    "claims.appeal",
    "claims.bulk_submit",
    "adjustments.view",
    "adjustments.create_small",
    "adjustments.create_large",
    "adjustments.approve",
    "adjustments.reverse",
    "ar.view",
    "ar.add_activity",
    "ar.update_status",
    "ar.export",
    "reports.view",
    "reports.export",
    "admin.billing_config",
    "admin.payer_config",
    "admin.permissions",
    "audit.view",
  ],

  // 2. Billing Staff / Billing Specialist: Operational billing & claim prep
  billing_specialist: [
    "patients.view",
    "patients.search",
    "charges.view",
    "charges.create",
    "charges.edit",
    "charges.finalize",
    "invoices.view",
    "invoices.create",
    "invoices.edit",
    "invoices.finalize",
    "invoices.reprint",
    "payments.view",
    "payments.record",
    "payments.refund_request",
    "claims.view",
    "claims.create",
    "claims.submit",
    "claims.edit",
    "claims.resubmit",
    "claims.appeal",
    "adjustments.view",
    "adjustments.create_small",
    "ar.view",
    "ar.add_activity",
    "ar.update_status",
    "ar.export",
    "reports.view",
    "reports.export",
    "audit.view",
  ],

  // 3. Cashier / Payment Desk: Patient payment collections & receipting only
  cashier: [
    "patients.view",
    "patients.search",
    "invoices.view",
    "invoices.reprint",
    "payments.view",
    "payments.record",
    "payments.refund_request",
    "reports.view",
  ],

  // 4. Insurance / Claims Specialist: Dedicated to claims, clearinghouse, appeals
  claims_specialist: [
    "patients.view",
    "patients.search",
    "charges.view",
    "invoices.view",
    "invoices.reprint",
    "claims.view",
    "claims.create",
    "claims.submit",
    "claims.edit",
    "claims.resubmit",
    "claims.appeal",
    "claims.bulk_submit",
    "ar.view",
    "ar.add_activity",
    "reports.view",
    "reports.export",
    "audit.view",
  ],

  // 5. A/R / Collections Specialist: Aging receivables & patient payment follow-up
  ar_specialist: [
    "patients.view",
    "patients.search",
    "invoices.view",
    "invoices.reprint",
    "payments.view",
    "payments.record",
    "claims.view",
    "ar.view",
    "ar.add_activity",
    "ar.update_status",
    "ar.export",
    "reports.view",
    "reports.export",
    "audit.view",
  ],

  // 6. Department Billing User: Scoped to department charges & unbilled encounters
  dept_billing: [
    "patients.view",
    "patients.search",
    "charges.view",
    "charges.create",
    "charges.edit",
    "invoices.view",
    "invoices.reprint",
  ],

  // 7. Hospital Administrator: High-level KPI dashboards, governance & audit
  hospital_admin: [
    "patients.view",
    "patients.search",
    "invoices.view",
    "invoices.reprint",
    "payments.view",
    "claims.view",
    "ar.view",
    "reports.view",
    "reports.export",
    "audit.view",
  ],

  // 8. Finance / Accounting User: Financial reconciliation, remittance & ledger
  finance_accounting: [
    "patients.view",
    "patients.search",
    "invoices.view",
    "invoices.reprint",
    "payments.view",
    "payments.refund_approve",
    "adjustments.view",
    "adjustments.approve",
    "ar.view",
    "ar.export",
    "reports.view",
    "reports.export",
    "audit.view",
  ],
}

// ── Preset Staff Profiles for Rapid Role Testing ────────────────────────────
export const PRESET_BILLING_USERS: Record<BillingRole, BillingUserProfile> = {
  billing_manager: {
    id: "STAFF-BM-01",
    name: "Dr. Rajesh K (Billing Administrator)",
    email: "rajesh.billing@generalhospital.org",
    role: "billing_manager",
    roleLabel: "Billing Administrator / Manager",
    department: "All",
    maxSmallAdjustmentLimit: 25000,
    canApproveSelf: false,
  },
  billing_specialist: {
    id: "STAFF-BS-02",
    name: "Ananya Deshmukh (Billing Specialist)",
    email: "ananya.rcm@generalhospital.org",
    role: "billing_specialist",
    roleLabel: "Billing Staff / Specialist",
    department: "All",
    maxSmallAdjustmentLimit: 5000,
    canApproveSelf: false,
  },
  cashier: {
    id: "STAFF-CS-03",
    name: "Sarah Jenkins (Senior Cashier)",
    email: "sarah.cashier@generalhospital.org",
    role: "cashier",
    roleLabel: "Cashier / Payment Desk",
    department: "All",
    maxSmallAdjustmentLimit: 0,
    canApproveSelf: false,
  },
  claims_specialist: {
    id: "STAFF-CLM-04",
    name: "Priya Nair (Insurance Claims Lead)",
    email: "priya.claims@generalhospital.org",
    role: "claims_specialist",
    roleLabel: "Insurance / Claims Specialist",
    department: "All",
    maxSmallAdjustmentLimit: 0,
    canApproveSelf: false,
  },
  ar_specialist: {
    id: "STAFF-AR-05",
    name: "Karan Singhal (A/R Collections Officer)",
    email: "karan.ar@generalhospital.org",
    role: "ar_specialist",
    roleLabel: "A/R & Collections Specialist",
    department: "All",
    maxSmallAdjustmentLimit: 0,
    canApproveSelf: false,
  },
  dept_billing: {
    id: "STAFF-ED-06",
    name: "Dr. Vikram Seth (ER Dept Billing Lead)",
    email: "vikram.er@generalhospital.org",
    role: "dept_billing",
    roleLabel: "Department Billing User (ER)",
    department: "Emergency",
    maxSmallAdjustmentLimit: 0,
    canApproveSelf: false,
  },
  hospital_admin: {
    id: "STAFF-ADM-07",
    name: "Hospital Administrator",
    email: "admin@generalhospital.org",
    role: "hospital_admin",
    roleLabel: "Hospital Administrator (Executive)",
    department: "All",
    maxSmallAdjustmentLimit: 0,
    canApproveSelf: false,
  },
  finance_accounting: {
    id: "STAFF-FIN-08",
    name: "Suresh Iyer (Chief Financial Controller)",
    email: "suresh.finance@generalhospital.org",
    role: "finance_accounting",
    roleLabel: "Finance & Accounting Controller",
    department: "All",
    maxSmallAdjustmentLimit: 50000,
    canApproveSelf: false,
  },
}

// ── Financial Approval Request Types ────────────────────────────────────────
export interface AdjustmentRequest {
  id: string // "ADJ-REQ-101"
  invoiceId: string
  claimId?: string
  patientName: string
  mrn: string
  requestedBy: string
  requestedByRole: BillingRole
  requestedAt: string
  amount: number // in INR ₹
  adjustmentType: "Courtesy Discount" | "Hardship Write-Off" | "Clinical Dispute" | "Insurance Contractual Offset" | "Administrative Correction"
  reason: string
  status: "Pending Approval" | "Approved" | "Rejected"
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
}

export interface RefundRequest {
  id: string // "REF-REQ-201"
  invoiceId: string
  paymentId: string
  patientName: string
  mrn: string
  requestedBy: string
  requestedByRole: BillingRole
  requestedAt: string
  amount: number // in INR ₹
  refundMethod: "Cash" | "UPI / Digital" | "Bank Transfer" | "Credit Card Reversal" | "Debit Card Reversal"
  reason: string
  status: "Pending Approval" | "Approved" | "Rejected"
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
}

// ── Immutable Audit Trail Record ────────────────────────────────────────────
export interface BillingAuditRecord {
  id: string // "AUDIT-2026-891"
  timestamp: string // ISO
  userId: string
  userName: string
  userRole: BillingRole
  action: "INVOICE_CREATED" | "INVOICE_FINALIZED" | "INVOICE_VOIDED" | "CHARGE_ADDED" | "CHARGE_MODIFIED" | "CHARGE_DELETED" | "PAYMENT_RECORDED" | "REFUND_REQUESTED" | "REFUND_APPROVED" | "REFUND_REJECTED" | "ADJUSTMENT_APPLIED" | "ADJUSTMENT_REQUESTED" | "ADJUSTMENT_APPROVED" | "ADJUSTMENT_REJECTED" | "CLAIM_SUBMITTED" | "CLAIM_BULK_SUBMITTED" | "CLAIM_APPEALED" | "CLAIM_RESUBMITTED" | "AR_NOTE_ADDED" | "PREAUTH_REQUESTED" | "PREAUTH_APPROVED" | "PREAUTH_ENHANCEMENT" | "INSURANCE_ATTACHED" | "TPA_QUERY" | "TPA_APPROVED" | "TPA_DENIED" | "TPA_SETTLED"
  patientId: string
  patientName: string
  mrn: string
  invoiceNo: string
  claimId?: string
  originalValue?: string
  newValue?: string
  financialAmount?: number
  reason: string
  approvedBy?: string
  department?: string
}

// ── A/R Collection Note Record ──────────────────────────────────────────────
export interface ArCollectionActivity {
  id: string // "AR-ACT-301"
  invoiceNo: string
  claimId?: string
  patientName: string
  mrn: string
  timestamp: string
  loggedBy: string
  loggedByRole: BillingRole
  activityType: "Phone Call Follow-up" | "Insurance Clearinghouse Status Call" | "Payment Reminder SMS / Email" | "Demand Letter Sent" | "Payment Promise"
  promisedDate?: string
  promisedAmount?: number
  outcomeNotes: string
  nextFollowUpDate?: string
}

// ── Storage Keys ────────────────────────────────────────────────────────────
const STORAGE_KEY_ACTIVE_USER = "hosp_billing_active_user_v9"
const STORAGE_KEY_AUDIT_LOGS = "hosp_billing_audit_logs_v9"
const STORAGE_KEY_ADJUSTMENT_REQS = "hosp_billing_adjustment_reqs_v9"
const STORAGE_KEY_REFUND_REQS = "hosp_billing_refund_reqs_v9"
const STORAGE_KEY_AR_ACTIVITIES = "hosp_billing_ar_activities_v9"

const INITIAL_SEED_AUDIT_LOGS: BillingAuditRecord[] = [
  {
    id: "AUDIT-2026-001",
    timestamp: "2026-08-22T14:10:00Z",
    userId: "STAFF-BM-01",
    userName: "Dr. Rajesh K (Billing Administrator)",
    userRole: "billing_manager",
    action: "INVOICE_FINALIZED",
    patientId: "P-100245",
    patientName: "John Smith",
    mrn: "100245",
    invoiceNo: "INV-2026-0811",
    claimId: "CLM-8921",
    originalValue: "Draft",
    newValue: "Accepted",
    financialAmount: 600,
    reason:
      "Inpatient stay clinical review completed and Star Health pre-authorization verified.",
  },
  {
    id: "AUDIT-2026-002",
    timestamp: "2026-08-24T14:35:00Z",
    userId: "STAFF-CS-03",
    userName: "Sarah Jenkins (Senior Cashier)",
    userRole: "cashier",
    action: "PAYMENT_RECORDED",
    patientId: "P-100512",
    patientName: "Maria Garcia",
    mrn: "100512",
    invoiceNo: "INV-2026-0819",
    claimId: "CLM-8929",
    originalValue: "Balance Due: ₹280",
    newValue: "Balance Due: ₹0 (Paid in Full)",
    financialAmount: 280,
    reason:
      "Patient paid self-pay emergency wound treatment via UPI (Auth: UPI-AUTH-98451234).",
  },
  {
    id: "AUDIT-2026-003",
    timestamp: "2026-08-23T15:20:00Z",
    userId: "STAFF-CLM-04",
    userName: "Priya Nair (Insurance Claims Lead)",
    userRole: "claims_specialist",
    action: "CLAIM_APPEALED",
    patientId: "P-100215",
    patientName: "Helen Park",
    mrn: "100215",
    invoiceNo: "INV-2026-0816",
    claimId: "CLM-8926",
    originalValue: "Rejected",
    newValue: "Appeal",
    financialAmount: 480,
    reason:
      "Formal medical necessity appeal submitted to Bajaj Allianz with attending microbiology charts.",
  },
]

const INITIAL_SEED_ADJUSTMENTS: AdjustmentRequest[] = [
  {
    id: "ADJ-REQ-101",
    invoiceId: "CLM-8924",
    claimId: "CLM-8924",
    patientName: "Thomas Reed",
    mrn: "100301",
    requestedBy: "Ananya Deshmukh (Billing Specialist)",
    requestedByRole: "billing_specialist",
    requestedAt: "2026-08-24T09:15:00Z",
    amount: 150,
    adjustmentType: "Hardship Write-Off",
    reason:
      "Extended ICU stay copay assistance request submitted under hospital financial hardship relief policy.",
    status: "Pending Approval",
  },
]

const INITIAL_SEED_REFUNDS: RefundRequest[] = [
  {
    id: "REF-REQ-201",
    invoiceId: "CLM-8932",
    paymentId: "PAY-1003",
    patientName: "Sunita Patel",
    mrn: "100002",
    requestedBy: "Sarah Jenkins (Senior Cashier)",
    requestedByRole: "cashier",
    requestedAt: "2026-08-30T16:00:00Z",
    amount: 80,
    refundMethod: "Debit Card Reversal",
    reason:
      "Duplicate consultation co-pay collected at front desk; insurance paid in full under secondary policy.",
    status: "Pending Approval",
  },
]

const INITIAL_SEED_AR_ACTIVITIES: ArCollectionActivity[] = [
  {
    id: "AR-ACT-301",
    invoiceNo: "INV-2026-0813",
    claimId: "CLM-8923",
    patientName: "Robert Lee",
    mrn: "100221",
    timestamp: "2026-08-22T11:00:00Z",
    loggedBy: "Karan Singhal (A/R Collections Officer)",
    loggedByRole: "ar_specialist",
    activityType: "Insurance Clearinghouse Status Call",
    outcomeNotes:
      "Spoke with Care Health adjudications desk. Claim is in final payment batch; expected remittance in 4 business days.",
    nextFollowUpDate: "2026-08-28",
  },
  {
    id: "AR-ACT-302",
    invoiceNo: "INV-2026-0811",
    claimId: "CLM-8921",
    patientName: "John Smith",
    mrn: "100245",
    timestamp: "2026-08-23T14:30:00Z",
    loggedBy: "Karan Singhal (A/R Collections Officer)",
    loggedByRole: "ar_specialist",
    activityType: "Phone Call Follow-up",
    outcomeNotes:
      "Contacted patient regarding remaining ₹120 co-pay balance. Patient promised settlement at discharge.",
    promisedDate: "2026-08-29",
    promisedAmount: 120,
    nextFollowUpDate: "2026-08-29",
  },
]

export class BillingRbacManager {
  private static load<T,>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return fallback
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  private static save<T,>(key: string, data: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(data))
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hospital_billing_rbac_updated"))
      }
    } catch (e) {
      console.error("Failed to save RBAC storage:", e)
    }
  }

  static onUpdate(callback: () => void): () => void {
    if (typeof window === "undefined") return () => {}
    const handler = () => callback()
    window.addEventListener("hospital_billing_rbac_updated", handler)
    return () =>
      window.removeEventListener("hospital_billing_rbac_updated", handler)
  }

  // ── Active User Management ────────────────────────────────────────────────
  static getActiveUser(): BillingUserProfile {
    return this.load<BillingUserProfile>(
      STORAGE_KEY_ACTIVE_USER,
      PRESET_BILLING_USERS.billing_manager,
    )
  }

  static setActiveRole(
    role: BillingRole,
    department?: BillingDepartmentScope,
  ): BillingUserProfile {
    const preset = PRESET_BILLING_USERS[role]
    const user: BillingUserProfile = {
      ...preset,
      department: department || (role === "dept_billing" ? "Emergency" : "All"),
    }
    this.save(STORAGE_KEY_ACTIVE_USER, user)
    return user
  }

  static setDepartmentScope(
    department: BillingDepartmentScope,
  ): BillingUserProfile {
    const current = this.getActiveUser()
    const updated = { ...current, department }
    this.save(STORAGE_KEY_ACTIVE_USER, updated)
    return updated
  }

  // ── Permission Verification ───────────────────────────────────────────────
  static hasPermission(
    permission: BillingPermission,
    user?: BillingUserProfile,
  ): boolean {
    const active = user || this.getActiveUser()
    const allowed = ROLE_PERMISSIONS[active.role] || []
    return allowed.includes(permission)
  }

  static checkPermission(
    permission: BillingPermission,
    actionLabel = "this action",
  ): void {
    if (!this.hasPermission(permission)) {
      const active = this.getActiveUser()
      throw new Error(
        `Access Denied: Your role '${active.roleLabel}' does not have permission to ${actionLabel} (Required: ${permission}).`,
      )
    }
  }

  static isDepartmentAuthorized(
    department: string,
    user?: BillingUserProfile,
  ): boolean {
    const active = user || this.getActiveUser()
    if (active.role !== "dept_billing" || active.department === "All")
      return true
    return active.department.toLowerCase() === department.toLowerCase()
  }

  // ── Audit Trail Methods ───────────────────────────────────────────────────
  static getAuditLogs(filter?: {
    search?: string
    action?: string
    patientName?: string
  }): BillingAuditRecord[] {
    let logs = this.load<BillingAuditRecord[]>(
      STORAGE_KEY_AUDIT_LOGS,
      INITIAL_SEED_AUDIT_LOGS,
    )
    if (filter) {
      if (filter.action && filter.action !== "All") {
        logs = logs.filter((l) => l.action === filter.action)
      }
      if (filter.search && filter.search.trim()) {
        const q = filter.search.toLowerCase().trim()
        logs = logs.filter(
          (l) =>
            l.userName.toLowerCase().includes(q) ||
            l.patientName.toLowerCase().includes(q) ||
            l.mrn.toLowerCase().includes(q) ||
            l.invoiceNo.toLowerCase().includes(q) ||
            l.reason.toLowerCase().includes(q),
        )
      }
    }
    return logs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
  }

  static logEvent(
    data: Omit<BillingAuditRecord, "id" | "timestamp" | "userId" | "userName" | "userRole">,
  ): BillingAuditRecord {
    const active = this.getActiveUser()
    const logs = this.getAuditLogs()
    const newRecord: BillingAuditRecord = {
      id: `AUDIT-2026-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString(),
      userId: active.id,
      userName: active.name,
      userRole: active.role,
      ...data,
    }
    logs.unshift(newRecord)
    this.save(STORAGE_KEY_AUDIT_LOGS, logs)
    return newRecord
  }

  // ── Approvals: Adjustments & Write-Offs ────────────────────────────────────
  static getAdjustmentRequests(
    status?: "All" | "Pending Approval" | "Approved" | "Rejected",
  ): AdjustmentRequest[] {
    let reqs = this.load<AdjustmentRequest[]>(
      STORAGE_KEY_ADJUSTMENT_REQS,
      INITIAL_SEED_ADJUSTMENTS,
    )
    if (status && status !== "All") {
      reqs = reqs.filter((r) => r.status === status)
    }
    return reqs.sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    )
  }

  static requestAdjustment(params: {
    invoiceId: string
    claimId?: string
    patientName: string
    mrn: string
    amount: number
    adjustmentType: AdjustmentRequest["adjustmentType"]
    reason: string
  }): AdjustmentRequest {
    const active = this.getActiveUser()
    if (
      !this.hasPermission("adjustments.create_small") &&
      !this.hasPermission("adjustments.create_large")
    ) {
      throw new Error(
        "Access Denied: You do not have permission to request adjustments or write-offs.",
      )
    }

    const reqs = this.getAdjustmentRequests("All")
    const newReq: AdjustmentRequest = {
      id: `ADJ-REQ-${100 + reqs.length + 1}`,
      invoiceId: params.invoiceId,
      claimId: params.claimId,
      patientName: params.patientName,
      mrn: params.mrn,
      requestedBy: active.name,
      requestedByRole: active.role,
      requestedAt: new Date().toISOString(),
      amount: params.amount,
      adjustmentType: params.adjustmentType,
      reason: params.reason,
      status: "Pending Approval",
    }

    reqs.unshift(newReq)
    this.save(STORAGE_KEY_ADJUSTMENT_REQS, reqs)

    this.logEvent({
      action: "ADJUSTMENT_REQUESTED",
      patientId: params.mrn,
      patientName: params.patientName,
      mrn: params.mrn,
      invoiceNo: params.invoiceId,
      claimId: params.claimId,
      financialAmount: params.amount,
      reason: `Adjustment requested for ₹${params.amount.toLocaleString("en-IN")} (${params.adjustmentType}): ${params.reason}`,
    })

    return newReq
  }

  static reviewAdjustment(
    reqId: string,
    action: "approve" | "reject",
    reviewNotes?: string,
  ): AdjustmentRequest {
    const active = this.getActiveUser()
    this.checkPermission(
      "adjustments.approve",
      "approve or reject financial write-offs and adjustments",
    )

    const reqs = this.getAdjustmentRequests("All")
    const idx = reqs.findIndex((r) => r.id === reqId)
    if (idx < 0) throw new Error("Adjustment request not found.")

    const current = reqs[idx]

    // Anti-Self-Approval Enforcement
    if (current.requestedBy === active.name && !active.canApproveSelf) {
      throw new Error(
        "Regulatory Compliance Violation: You cannot approve your own financial adjustment request. Another authorized manager must review it.",
      )
    }

    const updated: AdjustmentRequest = {
      ...current,
      status: action === "approve" ? "Approved" : "Rejected",
      reviewedBy: active.name,
      reviewedAt: new Date().toISOString(),
      reviewNotes:
        reviewNotes ||
        (action === "approve"
          ? "Approved in accordance with hospital revenue cycle guidelines."
          : "Rejected during audit review."),
    }

    reqs[idx] = updated
    this.save(STORAGE_KEY_ADJUSTMENT_REQS, reqs)

    this.logEvent({
      action:
        action === "approve" ? "ADJUSTMENT_APPROVED" : "ADJUSTMENT_REJECTED",
      patientId: current.mrn,
      patientName: current.patientName,
      mrn: current.mrn,
      invoiceNo: current.invoiceId,
      claimId: current.claimId,
      financialAmount: current.amount,
      reason: `Adjustment ₹${current.amount.toLocaleString("en-IN")} ${
        action === "approve" ? "APPROVED" : "REJECTED"
      }: ${updated.reviewNotes}`,
      approvedBy: active.name,
    })

    return updated
  }

  // ── Approvals: Patient Refunds ────────────────────────────────────────────
  static getRefundRequests(
    status?: "All" | "Pending Approval" | "Approved" | "Rejected",
  ): RefundRequest[] {
    let reqs = this.load<RefundRequest[]>(
      STORAGE_KEY_REFUND_REQS,
      INITIAL_SEED_REFUNDS,
    )
    if (status && status !== "All") {
      reqs = reqs.filter((r) => r.status === status)
    }
    return reqs.sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    )
  }

  static requestRefund(params: {
    invoiceId: string
    paymentId: string
    patientName: string
    mrn: string
    amount: number
    refundMethod: RefundRequest["refundMethod"]
    reason: string
  }): RefundRequest {
    const active = this.getActiveUser()
    this.checkPermission(
      "payments.refund_request",
      "initiate a patient payment refund request",
    )

    const reqs = this.getRefundRequests("All")
    const newReq: RefundRequest = {
      id: `REF-REQ-${200 + reqs.length + 1}`,
      invoiceId: params.invoiceId,
      paymentId: params.paymentId,
      patientName: params.patientName,
      mrn: params.mrn,
      requestedBy: active.name,
      requestedByRole: active.role,
      requestedAt: new Date().toISOString(),
      amount: params.amount,
      refundMethod: params.refundMethod,
      reason: params.reason,
      status: "Pending Approval",
    }

    reqs.unshift(newReq)
    this.save(STORAGE_KEY_REFUND_REQS, reqs)

    this.logEvent({
      action: "REFUND_REQUESTED",
      patientId: params.mrn,
      patientName: params.patientName,
      mrn: params.mrn,
      invoiceNo: params.invoiceId,
      financialAmount: params.amount,
      reason: `Refund request created for ₹${params.amount.toLocaleString("en-IN")} via ${params.refundMethod}: ${params.reason}`,
    })

    return newReq
  }

  static reviewRefund(
    reqId: string,
    action: "approve" | "reject",
    reviewNotes?: string,
  ): RefundRequest {
    const active = this.getActiveUser()
    this.checkPermission(
      "payments.refund_approve",
      "approve or reject patient refunds",
    )

    const reqs = this.getRefundRequests("All")
    const idx = reqs.findIndex((r) => r.id === reqId)
    if (idx < 0) throw new Error("Refund request not found.")

    const current = reqs[idx]

    // Anti-Self-Approval Enforcement
    if (current.requestedBy === active.name && !active.canApproveSelf) {
      throw new Error(
        "Regulatory Compliance Violation: You cannot approve your own refund request. Another manager or finance controller must review it.",
      )
    }

    const updated: RefundRequest = {
      ...current,
      status: action === "approve" ? "Approved" : "Rejected",
      reviewedBy: active.name,
      reviewedAt: new Date().toISOString(),
      reviewNotes:
        reviewNotes ||
        (action === "approve"
          ? "Refund authorized and processed to origin payment method."
          : "Refund rejected during manager audit."),
    }

    reqs[idx] = updated
    this.save(STORAGE_KEY_REFUND_REQS, reqs)

    this.logEvent({
      action: action === "approve" ? "REFUND_APPROVED" : "REFUND_REJECTED",
      patientId: current.mrn,
      patientName: current.patientName,
      mrn: current.mrn,
      invoiceNo: current.invoiceId,
      financialAmount: current.amount,
      reason: `Patient refund of ₹${current.amount.toLocaleString("en-IN")} ${
        action === "approve" ? "APPROVED" : "REJECTED"
      }: ${updated.reviewNotes}`,
      approvedBy: active.name,
    })

    return updated
  }

  // ── A/R Collections Activity Logger ───────────────────────────────────────
  static getArActivities(invoiceNo?: string): ArCollectionActivity[] {
    let acts = this.load<ArCollectionActivity[]>(
      STORAGE_KEY_AR_ACTIVITIES,
      INITIAL_SEED_AR_ACTIVITIES,
    )
    if (invoiceNo) {
      acts = acts.filter(
        (a) => a.invoiceNo === invoiceNo || a.claimId === invoiceNo,
      )
    }
    return acts.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
  }

  static logArActivity(params: {
    invoiceNo: string
    claimId?: string
    patientName: string
    mrn: string
    activityType: ArCollectionActivity["activityType"]
    promisedDate?: string
    promisedAmount?: number
    outcomeNotes: string
    nextFollowUpDate?: string
  }): ArCollectionActivity {
    const active = this.getActiveUser()
    this.checkPermission(
      "ar.add_activity",
      "log A/R collection follow-ups and payment promises",
    )

    const acts = this.getArActivities()
    const newAct: ArCollectionActivity = {
      id: `AR-ACT-${300 + acts.length + 1}`,
      invoiceNo: params.invoiceNo,
      claimId: params.claimId,
      patientName: params.patientName,
      mrn: params.mrn,
      timestamp: new Date().toISOString(),
      loggedBy: active.name,
      loggedByRole: active.role,
      activityType: params.activityType,
      promisedDate: params.promisedDate,
      promisedAmount: params.promisedAmount,
      outcomeNotes: params.outcomeNotes,
      nextFollowUpDate: params.nextFollowUpDate,
    }

    acts.unshift(newAct)
    this.save(STORAGE_KEY_AR_ACTIVITIES, acts)

    this.logEvent({
      action: "AR_NOTE_ADDED",
      patientId: params.mrn,
      patientName: params.patientName,
      mrn: params.mrn,
      invoiceNo: params.invoiceNo,
      claimId: params.claimId,
      financialAmount: params.promisedAmount,
      reason: `A/R follow-up (${params.activityType}): ${params.outcomeNotes}`,
    })

    return newAct
  }
}
