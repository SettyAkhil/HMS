import React, { useEffect, useState } from "react"
import {
  QueueTab,
  Table,
  TR,
  TD,
  StatusBadge,
  Btn,
  Card,
  MetricCard,
  AlertBanner,
} from "./shared"
import { Icon } from "./icons"
import { apiFetch } from "../lib/api"

interface RealClaim {
  id: number
  invoice_id: number
  patient_id: string
  insurer_name: string
  claim_amount: number
  approved_amount: number
  claim_status: "submitted" | "under_review" | "approved" | "rejected" | "settled"
  external_ref: string | null
  submitted_at: string
  notes: string | null
}

const CLAIM_STATUS_LABEL: Record<RealClaim["claim_status"], string> = {
  submitted: "Submitted",
  under_review: "Pending",
  approved: "Approved",
  rejected: "Denied",
  settled: "Settled",
}

const QUEUES = [
  { label: "Verification", count: 12 },
  { label: "Pre-Auth", count: 8 },
  { label: "Pending", count: 24 },
  { label: "Approved", count: 89 },
  { label: "Denied", count: 7 },
  { label: "Appeals", count: 5 },
]

const ELIGIBILITY = [
  {
    patient: "Thomas Reed",
    mrn: "100301",
    payer: "HDFC ERGO",
    plan: "Optima Restore Health",
    member: "HDFC-TE5-MK72",
    group: "—",
    status: "Verified",
    copay: "₹0",
    ded: "₹50,000 met",
    auth: "Not Required",
  },
  {
    patient: "John Smith",
    mrn: "100245",
    payer: "Star Health",
    plan: "Star Comprehensive Health",
    member: "SH-28847291",
    group: "EMR-44102",
    status: "Verified",
    copay: "₹2,500 inpatient",
    ded: "₹12,000 of ₹25,000",
    auth: "Approved",
  },
  {
    patient: "Mary Jones",
    mrn: "100246",
    payer: "ICICI Lombard",
    plan: "Complete Health Insurance",
    member: "ICICI-9920118",
    group: "GH-8812",
    status: "Verified",
    copay: "₹3,000 inpatient",
    ded: "₹0 remaining",
    auth: "Pending",
  },
  {
    patient: "Elena Vasquez",
    mrn: "100198",
    payer: "PM-JAY (Ayushman Bharat)",
    plan: "Ayushman Card Golden",
    member: "AB-0045512",
    group: "—",
    status: "Verified",
    copay: "₹0",
    ded: "₹0",
    auth: "Not Required",
  },
  {
    patient: "Patricia Okonkwo",
    mrn: "100149",
    payer: "Star Health",
    plan: "Star Health Premier",
    member: "SH-71199044",
    group: "GEN-2201",
    status: "Verification Pending",
    copay: "Unknown",
    ded: "Unknown",
    auth: "Required",
  },
  {
    patient: "Marcus Kim",
    mrn: "100377",
    payer: "Care Health",
    plan: "Care Supreme Plan",
    member: "CARE-4422981",
    group: "CORP-8821",
    status: "Verified",
    copay: "₹1,500 inpatient",
    ded: "₹8,000 of ₹30,000",
    auth: "Approved",
  },
]

export default function Insurance() {
  const [activeQueue, setActiveQueue] = useState(0)
  const [activeTab, setActiveTab] = useState<"eligibility" | "auth">(
    "eligibility",
  )
  const [claims, setClaims] = useState<RealClaim[]>([])
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [claimsVersion, setClaimsVersion] = useState(0)
  const [showNewClaimModal, setShowNewClaimModal] = useState(false)

  useEffect(() => {
    if (activeTab !== "auth") return
    let cancelled = false
    setClaimsLoading(true)
    apiFetch<{ claims: RealClaim[] }>("/api/billing/claims")
      .then((res) => {
        if (!cancelled) setClaims(res.claims || [])
      })
      .catch(() => {
        if (!cancelled) setClaims([])
      })
      .finally(() => {
        if (!cancelled) setClaimsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, claimsVersion])

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">
            Insurance &amp; TPA Authorization
          </h1>
          <p className="text-[11.5px] text-[#64748B]">
            Revenue Cycle · Eligibility Verification &amp; Prior
            Pre-Authorization (INR ₹)
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm">
            Batch Verify
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => setShowNewClaimModal(true)}>
            + Prior Auth Request
          </Btn>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Verifications Today"
            value="47"
            sub="All admissions + new encounters"
          />
          <MetricCard
            label="Prior Auth Pending"
            value="8"
            sub="Avg 2.3 days to decision"
            color="#D97706"
          />
          <MetricCard
            label="Auth Approval Rate"
            value="91.2%"
            sub="↑ 3.1% vs last quarter"
            color="#16A34A"
          />
          <MetricCard
            label="Denials — MTD"
            value="7"
            sub="₹3.8 L at risk · 5 in appeal"
            color="#DC2626"
          />
        </div>

        {/* Alert */}
        <AlertBanner
          type="warning"
          title="Prior Auth Expiring Soon"
          body="John Smith (SH-28847291) — Inpatient auth expires Aug 28. Review if continued stay needed."
          action="Extend Auth"
        />

        {/* Tabs */}
        <div className="bg-white border border-[#DDE2EC] rounded overflow-hidden">
          <div className="flex border-b border-[#DDE2EC]">
            <button
              onClick={() => setActiveTab("eligibility")}
              className={`px-5 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer
                ${
                  activeTab === "eligibility"
                    ? "border-[#1B4FD8] text-[#1B4FD8]"
                    : "border-transparent text-[#64748B] hover:text-gray-700"
                }`}
            >
              Eligibility Verification
            </button>
            <button
              onClick={() => setActiveTab("auth")}
              className={`px-5 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer
                ${
                  activeTab === "auth"
                    ? "border-[#1B4FD8] text-[#1B4FD8]"
                    : "border-transparent text-[#64748B] hover:text-gray-700"
                }`}
            >
              Prior Authorizations
            </button>
          </div>

          {activeTab === "eligibility" && (
            <div>
              <div className="px-4 pt-3 pb-1 text-[11px] text-[#94A3B8] italic">
                Illustrative data -- no payer eligibility/coverage-check integration exists yet.
              </div>
              <Table
                headers={[
                  "Patient",
                  "MRN",
                  "Payer",
                  "Plan",
                  "Member ID",
                  "Copay / Ded",
                  "Auth Status",
                  "Eligibility",
                  "",
                ]}
              >
                {ELIGIBILITY.map((e, i) => (
                  <TR key={i}>
                    <TD>
                      <span className="font-semibold text-gray-800">
                        {e.patient}
                      </span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[11.5px] text-[#64748B]">
                        {e.mrn}
                      </span>
                    </TD>
                    <TD>
                      <span className="font-medium text-[#64748B]">
                        {e.payer}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-[11.5px] text-gray-700">
                        {e.plan}
                      </span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[11.5px] text-[#64748B]">
                        {e.member}
                      </span>
                    </TD>
                    <TD>
                      <div>
                        <div className="text-[12px]">{e.copay}</div>
                        <div className="text-[11px] text-[#94A3B8]">
                          {e.ded}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <span
                        className={`text-[11.5px] font-medium ${
                          e.auth === "Approved"
                            ? "text-[#16A34A]"
                            : e.auth === "Pending"
                              ? "text-[#D97706]"
                              : e.auth === "Required"
                                ? "text-[#DC2626]"
                                : "text-[#64748B]"
                        }`}
                      >
                        {e.auth}
                      </span>
                    </TD>
                    <TD>
                      <span
                        className={`text-[11.5px] font-semibold ${
                          e.status === "Verified"
                            ? "text-[#16A34A]"
                            : "text-[#D97706]"
                        }`}
                      >
                        {e.status === "Verified" ? "✓ " : "⏳ "}
                        {e.status}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex gap-1">
                        <Btn variant="ghost" size="xs">
                          View
                        </Btn>
                        <Btn variant="ghost" size="xs">
                          Re-verify
                        </Btn>
                      </div>
                    </TD>
                  </TR>
                ))}
              </Table>
            </div>
          )}

          {activeTab === "auth" && (
            <div>
              {/* Queue tabs */}
              <div className="flex border-b border-[#F1F5F9] overflow-x-auto">
                {QUEUES.map((q, i) => (
                  <QueueTab
                    key={i}
                    label={q.label}
                    count={q.count}
                    active={activeQueue === i}
                    onClick={() => setActiveQueue(i)}
                  />
                ))}
              </div>
              {claimsLoading ? (
                <p className="text-[12px] text-[#94A3B8] px-4 py-6">Loading claims...</p>
              ) : claims.length === 0 ? (
                <p className="text-[12px] text-[#94A3B8] px-4 py-6">
                  No insurance claims recorded yet.
                </p>
              ) : (
                <Table
                  headers={[
                    "Patient ID",
                    "Invoice",
                    "Payer",
                    "Claim Amount",
                    "Approved",
                    "Submitted",
                    "External Ref",
                    "Status",
                  ]}
                >
                  {claims.map((c) => (
                    <TR key={c.id}>
                      <TD>
                        <span className="font-mono text-[11.5px] text-gray-800">
                          {c.patient_id}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-mono text-[11.5px] text-[#64748B]">
                          INV-{c.invoice_id}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-[#64748B]">{c.insurer_name}</span>
                      </TD>
                      <TD>
                        <span className="font-mono text-[11.5px]">
                          ₹{c.claim_amount.toLocaleString("en-IN")}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-mono text-[11.5px] text-[#16A34A]">
                          {c.approved_amount ? `₹${c.approved_amount.toLocaleString("en-IN")}` : "—"}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-mono text-[11.5px]">
                          {new Date(c.submitted_at).toLocaleDateString("en-IN")}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-mono text-[11.5px] text-[#64748B]">
                          {c.external_ref || "—"}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge status={CLAIM_STATUS_LABEL[c.claim_status].replace(/\s/g, "")} />
                      </TD>
                    </TR>
                  ))}
                </Table>
              )}
            </div>
          )}
        </div>

        {/* Denial Management */}
        <Card title="Denial Management — Active Cases">
          <div className="text-[11px] text-[#94A3B8] italic mb-2">
            Illustrative data -- rejected/settled claims can be tracked for real via the
            Prior Authorizations tab once claim appeal workflow exists.
          </div>
          <div className="space-y-3">
            {[
              {
                patient: "Sandra Brown",
                service: "MRI Brain w/ & w/o",
                payer: "Bajaj Allianz",
                denialReason: "Medical necessity not established",
                amount: "₹42,000",
                daysLeft: 12,
                stage: "Appeal Filed",
              },
              {
                patient: "George Watts",
                service: "Extended ED Visit",
                payer: "Care Health",
                denialReason: "Level of service downgraded",
                amount: "₹18,500",
                daysLeft: 5,
                stage: "Peer Review Pending",
              },
              {
                patient: "Isabel Cruz",
                service: "Ankle MRI",
                payer: "ICICI Lombard",
                denialReason: "Requires X-ray first (step therapy)",
                amount: "₹21,000",
                daysLeft: 21,
                stage: "Resubmit with X-ray",
              },
            ].map((d, i) => (
              <div
                key={i}
                className={`border rounded p-3.5 ${
                  d.daysLeft <= 7
                    ? "border-[#FECACA] bg-[#FEF2F2]"
                    : "border-[#DDE2EC]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13px] text-gray-900">
                        {d.patient}
                      </span>
                      <span className="font-mono font-semibold text-[#DC2626] text-[12px]">
                        {d.amount}
                      </span>
                    </div>
                    <div className="text-[12px] text-gray-700 mt-0.5">
                      {d.service} · {d.payer}
                    </div>
                    <div className="text-[11.5px] text-[#D97706] mt-0.5">
                      ⚠ {d.denialReason}
                    </div>
                    <div className="text-[11.5px] text-[#64748B] mt-0.5">
                      Stage: {d.stage}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`font-mono font-semibold text-[13px] ${
                        d.daysLeft <= 7 ? "text-[#DC2626]" : "text-[#D97706]"
                      }`}
                    >
                      {d.daysLeft} days left
                    </div>
                    <div className="text-[11px] text-[#94A3B8]">
                      to appeal deadline
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Btn variant="outline" size="xs">
                        Docs
                      </Btn>
                      <Btn variant="danger" size="xs">
                        Submit Appeal
                      </Btn>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {showNewClaimModal && (
        <NewClaimModal
          onClose={() => setShowNewClaimModal(false)}
          onCreated={() => {
            setShowNewClaimModal(false)
            setActiveTab("auth")
            setClaimsVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

function NewClaimModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [invoiceId, setInvoiceId] = useState("")
  const [insurerName, setInsurerName] = useState("")
  const [claimAmount, setClaimAmount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!invoiceId.trim() || !insurerName.trim() || claimAmount <= 0) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch("/api/billing/claims", {
        method: "POST",
        body: JSON.stringify({
          invoice_id: Number(invoiceId),
          insurer_name: insurerName.trim(),
          claim_amount: claimAmount,
        }),
      })
      onCreated()
    } catch {
      setError("Could not submit this claim -- check the invoice number and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white max-w-sm w-full p-5 space-y-3 shadow-2xl border border-slate-200 rounded-lg text-xs">
        <h3 className="font-bold text-slate-900 text-sm">Submit Insurance Claim</h3>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice ID</label>
          <input
            type="text"
            placeholder="e.g. 42"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-none font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Insurer / Payer Name</label>
          <input
            type="text"
            placeholder="e.g. Star Health"
            value={insurerName}
            onChange={(e) => setInsurerName(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-none font-medium"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Claim Amount (₹)</label>
          <input
            type="number"
            value={claimAmount || ""}
            onChange={(e) => setClaimAmount(Number(e.target.value) || 0)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-none font-mono"
          />
        </div>
        {error && <p className="text-rose-600 font-medium">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-none cursor-pointer">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={submit}
            className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-none cursor-pointer disabled:opacity-50"
          >
            {saving ? "Submitting..." : "Submit Claim"}
          </button>
        </div>
      </div>
    </div>
  )
}
