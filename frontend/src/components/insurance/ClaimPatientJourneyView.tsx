import React from "react"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import { inr, fmtDate } from "./ui"
import {
  UserCheck,
  FileSpreadsheet,
  Send,
  MailCheck,
  Pill,
  CreditCard,
  Building2,
  Clock,
  CheckCircle2,
} from "lucide-react"

export default function ClaimPatientJourneyView({ c }: { c: ComprehensiveClaimRecord }) {
  const pa = c.preAuth
  const el = c.eligibility
  const sett = c.settlement

  // Compile timeline events chronologically
  const events: {
    id: string
    date?: string
    title: string
    subtitle: string
    icon: React.ReactNode
    status: "completed" | "current" | "upcoming"
    badge?: string
    badgeColor?: string
    details?: React.ReactNode
  }[] = []

  // 1. Admission
  events.push({
    id: "admission",
    date: c.admissionDate || c.dateOfService,
    title: "Patient Admission & Ward Entry",
    subtitle: `${c.encounterType} ${c.department} · Admitted for ${pa?.diagnosis || "Medical Treatment"}`,
    icon: <Building2 className="text-blue-600" size={16} />,
    status: "completed",
    badge: "Admitted",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    details: (
      <div className="text-[12px] text-slate-600 mt-1 grid grid-cols-2 gap-2">
        <div><span className="text-slate-400">Patient:</span> {c.patientName} ({c.patientId})</div>
        <div><span className="text-slate-400">Treating Doctor:</span> {pa?.treatingDoctor || c.attendingDoctor || "Consulting Specialist"}</div>
      </div>
    ),
  })

  // 2. Policy & Eligibility
  const elDone = !!el && el.status === "Eligible"
  events.push({
    id: "eligibility",
    date: el?.verifiedAt || c.admissionDate || c.dateOfService,
    title: "Insurance Policy & Eligibility Verification",
    subtitle: `${c.policy.insurerName}${c.policy.tpaName ? ` (TPA: ${c.policy.tpaName})` : ""}`,
    icon: <UserCheck className="text-teal-600" size={16} />,
    status: elDone ? "completed" : "current",
    badge: elDone ? "Verified Eligible" : "Pending Verification",
    badgeColor: elDone ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-amber-50 text-amber-700 border-amber-200",
    details: (
      <div className="text-[12px] text-slate-600 mt-1 grid grid-cols-3 gap-2">
        <div><span className="text-slate-400">Policy No:</span> {c.policy.policyNumber || "—"}</div>
        <div><span className="text-slate-400">Member ID:</span> {c.policy.memberId || "—"}</div>
        <div><span className="text-slate-400">Sum Insured:</span> {c.policy.sumInsured ? inr(c.policy.sumInsured) : "—"}</div>
      </div>
    ),
  })

  // 3. Pre-Auth Submission
  const paSubmitted = !!pa?.submittedAt
  events.push({
    id: "preauth_submission",
    date: pa?.submittedAt,
    title: "Cashless Pre-Authorization Request Sent",
    subtitle: paSubmitted ? `Submitted via ${pa?.submissionMethod || "Portal"} for ₹${(pa?.requestedAmount || 0).toLocaleString("en-IN")}` : "Pre-authorization package being prepared",
    icon: <Send className="text-indigo-600" size={16} />,
    status: paSubmitted ? "completed" : elDone ? "current" : "upcoming",
    badge: paSubmitted ? `Requested ${inr(pa?.requestedAmount || 0)}` : "Pending Submission",
    badgeColor: paSubmitted ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-100 text-slate-600 border-slate-200",
    details: pa ? (
      <div className="text-[12px] text-slate-600 mt-1">
        <div><span className="text-slate-400">Diagnosis:</span> {pa.diagnosis}</div>
        <div><span className="text-slate-400">Procedures:</span> {pa.procedures.map((p) => p.procedureName).join(", ") || "Medical management"}</div>
      </div>
    ) : undefined,
  })

  // 4. Inbound TPA Decision & Approval
  const isPaApproved = c.approvedPreAuthAmount > 0
  const isPaRejected = c.status === "PREAUTH_REJECTED"
  events.push({
    id: "preauth_decision",
    date: pa?.updatedAt,
    title: "TPA Inbound Decision & Sanction Letter",
    subtitle: isPaApproved
      ? `Approved by ${c.policy.tpaName || c.policy.insurerName} · Auth Code: ${pa?.approvalCode || "SANCTION-APPROVED"}`
      : isPaRejected
      ? `Pre-auth rejected: ${pa?.responseNote || "Non-covered procedure"}`
      : "Awaiting approval decision from insurance company / TPA",
    icon: <MailCheck className={isPaApproved ? "text-emerald-600" : isPaRejected ? "text-rose-600" : "text-amber-600"} size={16} />,
    status: isPaApproved || isPaRejected ? "completed" : paSubmitted ? "current" : "upcoming",
    badge: isPaApproved ? `Sanctioned: ${inr(c.approvedPreAuthAmount)}` : isPaRejected ? "Rejected" : "Awaiting TPA",
    badgeColor: isPaApproved ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold" : isPaRejected ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200",
    details: isPaApproved ? (
      <div className="text-[12px] text-slate-600 mt-1 bg-emerald-50/50 p-2.5 rounded-[6px] border border-emerald-100">
        <div className="font-semibold text-emerald-800 flex items-center gap-1">
          <CheckCircle2 size={13} /> Synchronized with Pharmacy &amp; Reception Billing
        </div>
        <div className="text-slate-600 mt-0.5">
          Patient is tagged as <strong>Insurance Cashless</strong> with a spending ceiling of <strong>{inr(c.approvedPreAuthAmount)}</strong>.
        </div>
      </div>
    ) : undefined,
  })

  // 5. Active Inpatient Treatment & Pharmacy Dispenses
  const treatmentActive = ["PREAUTH_APPROVED", "TREATMENT_IN_PROGRESS", "DISCHARGE_INITIATED", "FINAL_BILL_READY", "CLAIM_SUBMITTED", "APPROVED", "SETTLED"].includes(c.status)
  events.push({
    id: "treatment_care",
    title: "Inpatient Clinical Care & Cashless Pharmacy Dispenses",
    subtitle: `Live tracking of nursing, diagnostic investigations, and cashless pharmacy medications`,
    icon: <Pill className="text-sky-600" size={16} />,
    status: treatmentActive ? "completed" : "upcoming",
    badge: treatmentActive ? `Total Billed: ${inr(c.totalHospitalBill)}` : "Pending Treatment",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    details: (
      <div className="text-[12px] text-slate-600 mt-1">
        <div><span className="text-slate-400">Current Hospital Bill:</span> {inr(c.totalHospitalBill)}</div>
        <div><span className="text-slate-400">Headroom Remaining:</span> {c.approvedPreAuthAmount > 0 ? inr(Math.max(0, c.approvedPreAuthAmount - c.totalHospitalBill)) : "—"}</div>
      </div>
    ),
  })

  // 6. Discharge Clearance & Final Bill Ready
  const dischargeReady = ["FINAL_BILL_READY", "CLAIM_SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "SETTLED", "CLOSED"].includes(c.status)
  events.push({
    id: "discharge_final_bill",
    date: c.dischargeDate,
    title: "Discharge Clearance & Consolidated Final Bill",
    subtitle: dischargeReady ? `Discharge completed · Final claim amount: ₹${(c.finalClaimAmount || c.totalHospitalBill).toLocaleString("en-IN")}` : "Doctor marks clinical discharge; final billing compilation begins",
    icon: <FileSpreadsheet className="text-purple-600" size={16} />,
    status: dischargeReady ? "completed" : c.status === "DISCHARGE_INITIATED" ? "current" : "upcoming",
    badge: dischargeReady ? `Claim: ${inr(c.finalClaimAmount || c.totalHospitalBill)}` : "Discharge Pending",
    badgeColor: dischargeReady ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-100 text-slate-600 border-slate-200",
  })

  // 7. Settlement & Bank UTR Reconciliation
  const settled = !!sett && sett.receivedAmount > 0
  events.push({
    id: "settlement",
    date: sett?.paymentDate,
    title: "Claim Settlement & Bank Fund Credit",
    subtitle: settled
      ? `Settled for ₹${(sett.receivedAmount || 0).toLocaleString("en-IN")} · UTR Ref: ${sett.paymentReferenceNo || "NEFT-CONFIRMED"}`
      : "Adjudication and payment transfer by insurance company",
    icon: <CreditCard className={settled ? "text-emerald-600" : "text-slate-400"} size={16} />,
    status: settled ? "completed" : dischargeReady ? "current" : "upcoming",
    badge: settled ? `Received ${inr(sett?.receivedAmount || 0)}` : "Pending Payout",
    badgeColor: settled ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold" : "bg-slate-100 text-slate-600 border-slate-200",
  })

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[8px] p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-5">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">
              Patient Insurance &amp; Hospitalization Journey
            </h3>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Complete chronological audit roadmap from patient admission to final insurance payout.
            </p>
          </div>
          <span className="text-[12px] font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            Current Stage: {c.status.replace(/_/g, " ")}
          </span>
        </div>

        {/* Timeline Roadmap */}
        <div className="relative pl-6 space-y-8 before:absolute before:left-[21px] before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {events.map((ev, index) => {
            const isCompleted = ev.status === "completed"
            const isCurrent = ev.status === "current"

            return (
              <div key={ev.id} className="relative flex items-start gap-4">
                {/* Milestone Node */}
                <div
                  className={`relative z-10 w-8 h-8 shrink-0 rounded-full flex items-center justify-center -ml-6 shadow-xs border transition-all ${
                    isCompleted
                      ? "bg-white border-emerald-500 text-emerald-600 ring-4 ring-emerald-50"
                      : isCurrent
                      ? "bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100 animate-pulse"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  {ev.icon}
                </div>

                {/* Content Box */}
                <div className="flex-1 bg-slate-50/70 border border-slate-200/80 rounded-[8px] p-4 shadow-2xs hover:bg-white hover:border-slate-300 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                        STEP {index + 1}
                      </span>
                      <h4 className="text-[13.5px] font-bold text-slate-900">
                        {ev.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      {ev.date && (
                        <span className="text-[11.5px] text-slate-400 flex items-center gap-1">
                          <Clock size={12} /> {fmtDate(ev.date)}
                        </span>
                      )}
                      {ev.badge && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ev.badgeColor || "bg-slate-100 text-slate-700"}`}>
                          {ev.badge}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[12.5px] text-slate-600">
                    {ev.subtitle}
                  </p>

                  {ev.details && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                      {ev.details}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
