import { useState } from "react"
import { InsuranceEngineService as E, STATUS_META } from "../../services/insuranceDb"
import { BillingDatabase } from "../../services/billingDb"
import type { ComprehensiveClaimRecord } from "../../types/insurance"
import { attempt, btn, fieldCls, fmtDateTime, inr, type Notify } from "./ui"

// Small read-outs shared by the claim screen and the HMS integrations.

/** What still stands between this case and a clean insurance claim at discharge. */
export function Readiness({ c }: { c: ComprehensiveClaimRecord }) {
  if (["APPROVED", "PARTIALLY_APPROVED", "SETTLEMENT_PENDING", "PAYMENT_RECEIVED", "RECONCILED", "CLOSED", "CLAIM_SUBMITTED", "CLAIM_QUERY_RAISED"].includes(c.status)) return null
  const r = E.dischargeReadiness(c)
  return (
    <div className="rounded-[8px] border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${r.ready ? "bg-emerald-500" : "bg-amber-500"}`} />
        <span className="text-[13px] font-semibold text-slate-900">{r.ready ? "Ready for the insurance claim" : "Before the claim can be sent"}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {r.items.map((i) => (
          <li key={i.key} className="px-4 py-2 flex items-center gap-3 text-[13px]">
            <span className={`w-4 text-center font-semibold ${i.ok ? "text-emerald-600" : "text-slate-300"}`}>{i.ok ? "✓" : "○"}</span>
            <span className={i.ok ? "text-slate-700" : "text-slate-900 font-medium"}>{i.label}</span>
            <span className="ml-auto text-[12.5px] text-slate-500">{i.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Approved vs used, the continuous comparison during treatment. */
export function Consumption({ c }: { c: ComprehensiveClaimRecord }) {
  const approved = c.approvedPreAuthAmount
  const used = c.consumedBillAmount
  const pct = approved ? Math.min(100, Math.round((used / approved) * 100)) : 0
  const bar = !approved ? "bg-slate-300" : pct >= 100 ? "bg-rose-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 text-[13px]">
        <span className="text-slate-500">
          Approved <strong className="text-slate-900 tabular-nums">{inr(approved)}</strong>
        </span>
        <span className="text-slate-500">
          Used <strong className="text-slate-900 tabular-nums">{inr(used)}</strong>
        </span>
        <span className="text-slate-500">
          Remaining <strong className={`tabular-nums ${approved - used < 0 ? "text-rose-600" : "text-slate-900"}`}>{inr(approved - used)}</strong>
        </span>
        <span className="ml-auto text-slate-500 tabular-nums">{approved ? `${pct}% used` : "No approval yet"}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** The bill's charges grouped by head -- every department's charges as billing raised them. */
export function BillLines({ c }: { c: ComprehensiveClaimRecord }) {
  const bill = c.billingClaimId ? BillingDatabase.getClaimById(c.billingClaimId) : undefined
  if (!bill) return <p className="text-[13px] text-slate-500">No bill has been raised for this encounter yet. Ward, ICU, OT, pharmacy and lab charges appear here once billing raises it.</p>
  const byHead = new Map<string, { total: number ;ins: number ;pat: number }>()
  for (const it of bill.items) {
    const k = it.category || "Other"
    const e = byHead.get(k) ?? { total: 0, ins: 0, pat: 0 }
    e.total += Number(it.total || 0)
    e.ins += Number(it.insuranceCovered || 0)
    e.pat += Number(it.patientPayable || 0)
    byHead.set(k, e)
  }
  const row = (l: string, v: number, strong = false, tone = "text-slate-900") => (
    <div className={`flex justify-between py-1.5 text-[13px] ${strong ? "font-semibold border-t border-slate-200 mt-1 pt-2" : ""}`}>
      <span className={strong ? "text-slate-900" : "text-slate-600"}>{l}</span>
      <span className={`tabular-nums ${tone}`}>{inr(v)}</span>
    </div>
  )
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <div className="text-[12px] text-slate-500 mb-1">
          Charges on {bill.invoiceNo} ({bill.items.length} lines)
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] text-slate-500 border-b border-slate-200">
              <th className="py-1.5 text-left font-medium">Charge</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
              <th className="py-1.5 text-right font-medium">Insurance</th>
              <th className="py-1.5 text-right font-medium">Patient</th>
            </tr>
          </thead>
          <tbody>
            {[...byHead.entries()].map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100">
                <td className="py-1.5 text-slate-800">{k}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(v.total)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-600">{inr(v.ins)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-600">{inr(v.pat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="text-[12px] text-slate-500 mb-1">From bill to claim</div>
        {row("Hospital bill", c.totalHospitalBill)}
        {row("Package charges (pre-auth)", c.packageBaseAmount)}
        {row("Non-payable items", c.nonPayableAmount)}
        {row("Patient share", c.patientShareAmount)}
        {row("Claim amount", c.finalClaimAmount, true, "text-blue-700")}
      </div>
    </div>
  )
}

export function AuditTable({ c, notify }: { c: ComprehensiveClaimRecord ;notify: Notify }) {
  const [note, setNote] = useState("")
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={fieldCls} placeholder="Add a note to this claim" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className={btn.plain} onClick={() => attempt(notify, () => E.addNote(c.id, note), "Note added.") && setNote("")}>
          Add note
        </button>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[12px] text-slate-500 border-b border-slate-200">
            {["When", "Who", "What happened", "Status", "Device"].map((h) => (
              <th key={h} className="py-2 pr-4 text-left font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.auditTrail.map((a) => (
            <tr key={a.id} className="border-b border-slate-100 align-top">
              <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{fmtDateTime(a.timestamp)}</td>
              <td className="py-2 pr-4 whitespace-nowrap text-slate-800">{a.user}</td>
              <td className="py-2 pr-4 text-slate-900">
                {a.action}
                {a.comments && <div className="text-[12.5px] text-slate-500">{a.comments}</div>}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-[12.5px] text-slate-500">
                {a.newStatus ? `${a.oldStatus ? STATUS_META[a.oldStatus as keyof typeof STATUS_META]?.label ?? a.oldStatus : "—"} → ${STATUS_META[a.newStatus as keyof typeof STATUS_META]?.label ?? a.newStatus}` : ""}
              </td>
              <td className="py-2 whitespace-nowrap text-[12.5px] text-slate-400">{a.device}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
