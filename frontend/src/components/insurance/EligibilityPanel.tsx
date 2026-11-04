import { useState } from "react"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import type { ComprehensiveClaimRecord, EligibilityOutcome, PatientPolicy } from "../../types/insurance"
import { Choice, Dot, Drawer, Field, KV, Toggle, attempt, btn, fieldCls, fmtDateTime, inr, type Notify } from "./ui"

// VERIFY ELIGIBILITY -- the side panel from anywhere a policy is shown: an
// insurance case (records on the case) or a policy on the patient's record
// (records on the policy, and on the case too if one is waiting for it).

type Target = { kind: "case" ;c: ComprehensiveClaimRecord } | { kind: "policy" ;p: PatientPolicy }

const num = (v: string) => Math.max(0, Number(v) || 0)

export default function EligibilityPanel({ target, notify, onClose }: { target: Target ;notify: Notify ;onClose: () => void }) {
  const pol =
    target.kind === "case"
      ? { patient: target.c.patientName, insurer: target.c.policy.insurerName, tpa: target.c.policy.tpaName, policyNo: target.c.policy.policyNumber, member: target.c.policy.memberId, sum: target.c.policy.sumInsured, bal: target.c.policy.balanceAvailable, copay: target.c.policy.copayPercentage, deductible: target.c.policy.deductibleAmount, room: target.c.policy.roomCategoryEligible, preauth: target.c.policy.preAuthRequired, last: target.c.eligibility }
      : { patient: target.p.patientName, insurer: target.p.insurerName, tpa: target.p.tpaName, policyNo: target.p.policyNumber, member: target.p.memberId, sum: target.p.sumInsured, bal: target.p.balanceAvailable, copay: target.p.copayPercentage, deductible: 0, room: "", preauth: true, last: undefined }

  const [f, setF] = useState({
    method: "Portal" as "Portal" | "Phone" | "API" | "Email",
    reference: "",
    status: "Eligible" as EligibilityOutcome,
    policyActive: true,
    inNetwork: true,
    sumInsured: pol.sum || 0,
    balanceAvailable: pol.bal || 0,
    roomEligibilityNote: pol.room || "As per policy",
    copayApplicable: pol.copay > 0,
    copayValue: pol.copay ? `${pol.copay}%` : "",
    deductibleRemaining: pol.deductible || 0,
    preAuthRequired: pol.preauth,
    notes: "",
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  const verify = () => {
    const ok = attempt(
      notify,
      () => (target.kind === "case" ? E.recordEligibility(target.c.id, f) : E.verifyPatientPolicy(target.p, f)),
      `Eligibility recorded: ${f.status}.`,
    )
    if (ok) onClose()
  }

  return (
    <Drawer
      title="Verify eligibility"
      subtitle="Confirm cover with the insurer / TPA and record what they said."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.soft} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btn.primary} onClick={verify}>
            Verify
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <KV k="Patient" v={pol.patient} />
          <KV k="Insurance" v={pol.insurer} />
          {pol.tpa && <KV k="TPA" v={pol.tpa} />}
          <KV k="Policy" v={pol.policyNo || "—"} mono />
          <KV k="Member ID" v={pol.member || "—"} mono />
          {pol.last && <KV k="Last verified" v={`${pol.last.status} · ${fmtDateTime(pol.last.verifiedAt)}`} />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Verified via">
            <select className={fieldCls} value={f.method} onChange={(e) => set("method", e.target.value as typeof f.method)}>
              <option value="Portal"> Portal</option>
              <option value="Phone"> Phone</option>
              <option value="Email"> Email</option>
              <option value="API"> API</option>
            </select>
          </Field>
          <Field label="Reference / call ID">
            <input className={`${fieldCls} tabular-nums`} value={f.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="text-[12px] font-medium text-slate-500 mb-1.5">Result</div>
          <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-2 gap-2">
            <Choice active={f.status === "Eligible"} emoji="" title="Eligible" tone="emerald" onClick={() => set("status", "Eligible")} />
            <Choice active={f.status === "Partially Eligible"} emoji="" title="Partially eligible" onClick={() => set("status", "Partially Eligible")} />
            <Choice active={f.status === "Verification Required"} emoji="" title="Verification required" tone="amber" onClick={() => set("status", "Verification Required")} />
            <Choice active={f.status === "Not Eligible"} emoji="" title="Not eligible" tone="rose" onClick={() => set("status", "Not Eligible")} />
          </div>
        </div>

        <div className="border border-slate-100 p-3 space-y-2">
          <div className="flex justify-between text-[12.5px]">
            <span className="text-slate-500">Policy status</span>
            <Dot ok={f.policyActive}>{f.policyActive ? "Active" : "Inactive"}</Dot>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-slate-500">Hospital network</span>
            <Dot ok={f.inNetwork}>{f.inNetwork ? "Yes" : "No"}</Dot>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-slate-500">Coverage</span>
            <Dot ok={f.status === "Eligible" ? true : f.status === "Not Eligible" ? false : null}>
              {f.status === "Eligible" ? "Available" : f.status === "Not Eligible" ? "Not available" : "Limited / pending"}
            </Dot>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Toggle checked={f.policyActive} onChange={(v) => set("policyActive", v)}>Policy active</Toggle>
            <Toggle checked={f.inNetwork} onChange={(v) => set("inNetwork", v)}>In network</Toggle>
            <Toggle checked={f.preAuthRequired} onChange={(v) => set("preAuthRequired", v)}>Pre-auth required</Toggle>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sum insured (₹)" hint={f.sumInsured ? inr(f.sumInsured) : undefined}>
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.sumInsured || ""} onChange={(e) => set("sumInsured", num(e.target.value))} />
          </Field>
          <Field label="Available balance (₹)" hint={f.balanceAvailable ? inr(f.balanceAvailable) : undefined}>
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.balanceAvailable || ""} onChange={(e) => set("balanceAvailable", num(e.target.value))} />
          </Field>
          <Field label="Room eligibility">
            <input className={fieldCls} value={f.roomEligibilityNote} onChange={(e) => set("roomEligibilityNote", e.target.value)} />
          </Field>
          <Field label="Deductible (₹)">
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.deductibleRemaining || ""} onChange={(e) => set("deductibleRemaining", num(e.target.value))} />
          </Field>
          <Field label="Co-pay">
            <select className={fieldCls} value={f.copayApplicable ? "yes" : "no"} onChange={(e) => set("copayApplicable", e.target.value === "yes")}>
              <option value="no">Not applicable</option>
              <option value="yes">Applicable</option>
            </select>
          </Field>
          {f.copayApplicable && (
            <Field label="Co-pay value">
              <input className={fieldCls} placeholder="10%" value={f.copayValue} onChange={(e) => set("copayValue", e.target.value)} />
            </Field>
          )}
          <Field label="Notes" span={2}>
            <input className={fieldCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </div>
    </Drawer>
  )
}
