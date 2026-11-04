import React, { useState, useMemo } from "react"
import { ShieldCheck, Search, Building2, CheckCircle2, Download, RefreshCw, DollarSign, Eye } from "lucide-react"
import { BillingDatabase, type ClaimRecord, type ClaimStatus } from "../../services/billingDb"
import { accountsApi } from "../../services/accounts/client"
import { syncOperationalFeed } from "../../services/accounts/operationalFeed"
import {
  Button, Card, Empty, ErrorNote, Field, Input, Loaded, Modal, Money, Notice, PageHeader, Pill, Select, Table,
  Td, Th, downloadCsv, formatDate, formatINR, formatINRShort, today, useAction, useApi
} from "./ui"

export default function InsuranceAccountsView() {
  const [claimsRevision, setClaimsRevision] = useState(0)
  const [search, setSearch] = useState("")
  const [filterInsurer, setFilterInsurer] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [settlingClaim, setSettlingClaim] = useState<ClaimRecord | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()

  // Live claims from BillingDatabase (only genuine insurance claims)
  const claims = useMemo(() => {
    return BillingDatabase.getClaims().filter(
      (c) =>
        Boolean(c.insuranceProvider) &&
        c.insuranceProvider !== "Self-Pay" &&
        (Number(c.insurancePortion) > 0 || Number(c.totalAmount) > 0)
    )
  }, [claimsRevision])

  // Unique list of insurers
  const insurers = useMemo(() => {
    return Array.from(new Set(claims.map((c) => c.insuranceProvider).filter(Boolean)))
  }, [claims])

  // Filtered claims
  const filtered = claims.filter((c) => {
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      c.invoiceNo.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.preAuthCode && c.preAuthCode.toLowerCase().includes(q)) ||
      c.patientName.toLowerCase().includes(q) ||
      c.insuranceProvider.toLowerCase().includes(q)
    const matchesInsurer = filterInsurer === "all" || c.insuranceProvider === filterInsurer
    const isSettled = Boolean(c.tpa?.settledAt) || c.status === "Paid"
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "settled" && isSettled) ||
      (filterStatus === "pending" && !isSettled)
    return matchesSearch && matchesInsurer && matchesStatus
  })

  // Dynamic Financial Aggregations
  const totalClaimed = claims.reduce((sum, c) => sum + (Number(c.totalAmount) || 0), 0)
  const totalApproved = claims.reduce((sum, c) => sum + (Number(c.insurancePortion) || Number(c.totalAmount) || 0), 0)
  const totalSettled = claims.reduce((sum, c) => sum + (Number(c.tpa?.settledAmount) || (c.status === "Paid" ? Number(c.insurancePortion) : 0)), 0)
  const totalPending = Math.max(0, totalApproved - totalSettled)

  const handleSyncToLedger = () => {
    action.run(
      () => syncOperationalFeed(),
      (res) => {
        setNotice(
          `Insurance feed synchronized to general ledger: ${res.posted} entries posted, ${res.duplicate} duplicate(s) reconciled.`
        )
        setClaimsRevision((r) => r + 1)
      }
    )
  }

  const exportClaims = () => {
    downloadCsv(
      `insurance_tpa_claims_${today()}.csv`,
      ["Invoice No", "Claim Ref", "Patient", "Insurer / TPA", "Total Bill", "Insurance Portion", "Settled Amount", "Status"],
      claims.map((c) => [
        c.invoiceNo,
        c.preAuthCode || c.id,
        c.patientName,
        c.insuranceProvider,
        c.totalAmount,
        c.insurancePortion,
        c.tpa?.settledAmount || 0,
        c.status,
      ])
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insurance & Corporate (TPA) Sub-Ledger Tracking"
        subtitle="Pre-authorization approval reconciliation, co-pay deductions, TPA settlement vouchers, and receivables ledger integration."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={exportClaims}>
              <Download size={13} /> Export CSV
            </Button>
            <Button variant="primary" size="sm" busy={action.busy} onClick={handleSyncToLedger}>
              <RefreshCw size={13} /> Sync to General Ledger
            </Button>
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice(null)} />
      <ErrorNote message={action.error} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Total Claimed Value</span>
          <div className="text-xl font-bold text-[#0F172A] mt-1">{formatINRShort(totalClaimed)}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">{claims.length} Total Insurance Cases</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">TPA Approved Sum</span>
          <div className="text-xl font-bold text-[#047857] mt-1">{formatINRShort(totalApproved)}</div>
          <div className="text-[11px] text-[#047857] mt-0.5 font-semibold">Pre-Auth Guaranteed</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Settled &amp; Received</span>
          <div className="text-xl font-bold text-[#1B4FD8] mt-1">{formatINRShort(totalSettled)}</div>
          <div className="text-[11px] text-[#1B4FD8] mt-0.5 font-semibold">Credited to Bank Account</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Pending TPA Receivables</span>
          <div className="text-xl font-bold text-[#BE123C] mt-1">{formatINRShort(totalPending)}</div>
          <div className="text-[11px] text-[#BE123C] mt-0.5 font-semibold">Awaiting Insurer Remittance</div>
        </div>
      </div>

      {/* Filter and Table */}
      <div className="bg-white border border-[#DDE2EC] rounded-none overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#F1F5F9] bg-[#FAFAFA] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 text-[#94A3B8]" size={14} />
              <input
                type="text"
                placeholder="Search invoice, patient or TPA..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded-none focus:outline-none focus:border-[#1B4FD8] bg-white"
              />
            </div>
            <div className="w-48">
              <Select value={filterInsurer} onChange={(e) => setFilterInsurer(e.target.value)}>
                <option value="all">All Insurers / TPAs</option>
                {insurers.map((ins) => (
                  <option key={ins} value={ins}>
                    {ins}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending Settlement</option>
                <option value="settled">Settled</option>
              </Select>
            </div>
          </div>
          <span className="text-xs text-[#64748B]">
            Showing {filtered.length} of {claims.length} claims
          </span>
        </div>

        {filtered.length === 0 ? (
          <Empty>
            {claims.length === 0
              ? "No insurance claims recorded in the billing system yet."
              : "No insurance claims match filter."}
          </Empty>
        ) : (
          <Table dense>
            <thead>
              <tr>
                <Th>Invoice / Claim #</Th>
                <Th>Patient Name</Th>
                <Th>Insurer / TPA</Th>
                <Th right>Total Bill</Th>
                <Th right>TPA Portion</Th>
                <Th right>Settled (₹)</Th>
                <Th>Status</Th>
                <Th right>Action</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isSettled = Boolean(c.tpa?.settledAt) || c.status === "Paid"
                const settledAmount =
                  c.tpa?.settledAmount !== undefined
                    ? c.tpa.settledAmount
                    : isSettled
                    ? c.insurancePortion
                    : 0

                return (
                  <tr key={c.id} className="hover:bg-[#F8FAFC]">
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-bold text-xs text-[#1B4FD8]">{c.invoiceNo}</div>
                      {c.preAuthCode && (
                        <div className="text-[10.5px] font-mono text-[#64748B]">Auth: {c.preAuthCode}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-xs text-[#0F172A]">
                      {c.patientName}
                      <div className="text-[11px] text-[#64748B] font-normal font-mono">{c.patientId || c.mrn}</div>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[#334155]">{c.insuranceProvider}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs font-medium">
                      {formatINR(c.totalAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-[#047857]">
                      {formatINR(c.insurancePortion)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-[#1B4FD8]">
                      {formatINR(settledAmount, { blankZero: true }) || "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <Pill tone={isSettled ? "green" : "amber"}>
                        {isSettled ? "Settled / Paid" : c.status || "Submitted"}
                      </Pill>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {!isSettled ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setSettlingClaim(c)}
                        >
                          Post Settlement
                        </Button>
                      ) : (
                        <span className="text-xs text-[#047857] font-semibold">✓ Settled</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </div>

      {/* Post Settlement Modal */}
      {settlingClaim && (
        <PostSettlementModal
          claim={settlingClaim}
          onClose={() => setSettlingClaim(null)}
          onSaved={(msg) => {
            setSettlingClaim(null)
            setNotice(msg)
            setClaimsRevision((r) => r + 1)
          }}
        />
      )}
    </div>
  )
}

function PostSettlementModal({
  claim,
  onClose,
  onSaved,
}: {
  claim: ClaimRecord
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const defaultSettled = String(claim.insurancePortion || claim.totalAmount || "")
  const [settledAmount, setSettledAmount] = useState(defaultSettled)
  const [deduction, setDeduction] = useState("0")
  const [deductionReason, setDeductionReason] = useState("")
  const [shortfallTo, setShortfallTo] = useState<"writeoff" | "patient">("writeoff")
  const [reference, setReference] = useState("")
  const [settlementDate, setSettlementDate] = useState(today())
  const action = useAction()

  const save = () => {
    const sAmount = Number(settledAmount) || 0
    const dAmount = Number(deduction) || 0
    if (sAmount <= 0) return

    action.run(
      async () => {
        // 1. Update BillingDatabase claim record
        BillingDatabase.updateClaim(claim.id, {
          status: "Paid" as ClaimStatus,
          tpa: {
            settledAt: settlementDate,
            settledAmount: sAmount,
            deduction: dAmount,
            shortfallTo,
            deductionReason: deductionReason || undefined,
            settlementRef: reference || undefined,
          },
        })

        // 2. Post accounting settlement event into the ledger
        const slug = (val: string) =>
          val.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")
        const payer = {
          id: slug(claim.insuranceProvider),
          name: claim.insuranceProvider,
          type: "insurance",
        }

        const postingRes = await accountsApi.post([
          {
            event_id: `SETTLE-${claim.id}`,
            type: "INSURANCE_SETTLEMENT",
            source: "insurance",
            date: settlementDate,
            bill_no: claim.invoiceNo,
            claim_ref: claim.preAuthCode || claim.id,
            payer,
            patient: { id: claim.patientId || claim.mrn, name: claim.patientName },
            settled: sAmount,
            deduction: dAmount,
            deduction_to: shortfallTo,
            deduction_reason: deductionReason,
            reference: reference || undefined,
          },
        ])

        return postingRes
      },
      () => {
        onSaved(
          `Settlement for claim ${claim.invoiceNo} posted: ₹${Number(settledAmount).toLocaleString("en-IN")} credited.`
        )
      }
    )
  }

  return (
    <Modal
      title={`Post TPA Settlement: ${claim.invoiceNo}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={action.busy}
            disabled={!settledAmount || Number(settledAmount) <= 0}
            onClick={save}
          >
            Post Settlement &amp; Journal
          </Button>
        </>
      }
    >
      <ErrorNote message={action.error} />
      <div className="space-y-3">
        <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-none text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-[#64748B]">Patient:</span>
            <span className="font-semibold text-[#0F172A]">{claim.patientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748B]">Insurer / TPA:</span>
            <span className="font-semibold text-[#1B4FD8]">{claim.insuranceProvider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748B]">TPA Guaranteed Amount:</span>
            <span className="font-bold text-[#047857]">{formatINR(claim.insurancePortion)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Settled Amount Received (₹)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={settledAmount}
              onChange={(e) => setSettledAmount(e.target.value)}
            />
          </Field>
          <Field label="Settlement Date">
            <Input
              type="date"
              value={settlementDate}
              max={today()}
              onChange={(e) => setSettlementDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="TPA Deduction / Disallowed (₹)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={deduction}
              onChange={(e) => setDeduction(e.target.value)}
            />
          </Field>
          <Field label="Deduction Shortfall Charged To">
            <Select
              value={shortfallTo}
              onChange={(e) => setShortfallTo(e.target.value as "writeoff" | "patient")}
            >
              <option value="writeoff">Write-off (Hospital Absorbs)</option>
              <option value="patient">Patient AR (Collect from Patient)</option>
            </Select>
          </Field>
        </div>

        <Field label="Deduction Reason (if any)">
          <Input
            value={deductionReason}
            onChange={(e) => setDeductionReason(e.target.value)}
            placeholder="e.g. Non-medical consumables disallowed"
          />
        </Field>

        <Field label="Payment Reference / Bank UTR">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. UTR-HDFC-99281726"
          />
        </Field>
      </div>
    </Modal>
  )
}
