import { useEffect, useMemo, useState } from "react"
import { InsuranceEngineService as E, STATUS_META } from "../../services/insuranceDb"
import type { ClaimEncounterType, ComprehensiveClaimRecord, PatientPolicy } from "../../types/insurance"
import { Consumption, Readiness } from "./widgets"
import EligibilityPanel from "./EligibilityPanel"
import { PolicyForm } from "./forms"
import { EncounterCase } from "./NewCaseModal"
import { Card, Choice, Dot, Drawer, Empty, KV, Modal, STATUS_EMOJI, StatusPill, attempt, btn, fieldBase, fieldCls, fmtDate, fmtDateTime, inr, useNotify } from "./ui"

// The insurance engine surfaced inside the rest of the HMS. Every widget here
// reads and writes the same InsuranceEngineService, so OP / IP / ER / OT / ICU
// never grow their own insurance systems -- they send the encounter here.

type Who = { patientId?: string ;patientName?: string }

/** Open an insurance page (optionally on one case) from anywhere in the app. */
export function openInsurance(module: string, caseId?: string) {
  window.dispatchEvent(new CustomEvent("hms:open-insurance", { detail: { module, caseId } }))
}

// One case list shared by every widget on screen (a bed board can show dozens
// of chips); rebuilt only when the engine or billing reports a change.
let cache: ComprehensiveClaimRecord[] | null = null
const watchers = new Set<() => void>()
let unsub: (() => void) | null = null
function allCases() {
  if (!cache) cache = E.getClaims()
  return cache
}
function watch(fn: () => void) {
  watchers.add(fn)
  if (!unsub)
    unsub = E.subscribe(() => {
      cache = null
      watchers.forEach((w) => w())
    })
  return () => {
    watchers.delete(fn)
    if (!watchers.size && unsub) (unsub(), (unsub = null), (cache = null))
  }
}
const matches = (c: ComprehensiveClaimRecord, { patientId, patientName }: Who) => {
  const id = (patientId || "").toLowerCase()
  if (id && (c.patientId.toLowerCase() === id || (c.mrn || "").toLowerCase() === id)) return true
  return !!patientName && c.patientName.trim().toLowerCase() === patientName.trim().toLowerCase()
}

/** Cases for a patient, kept live across tabs and billing updates. */
export function usePatientCases(who: Who) {
  const { patientId, patientName } = who
  const read = () => (patientId || patientName ? allCases().filter((c) => matches(c, who)) : [])
  const [cases, setCases] = useState<ComprehensiveClaimRecord[]>(read)
  useEffect(() => {
    setCases(read())
    return watch(() => setCases(read()))
  }, [patientId, patientName]) // eslint-disable-line react-hooks/exhaustive-deps
  return cases
}

const isActive = (c: ComprehensiveClaimRecord) => c.status !== "CLOSED" && c.status !== "NOT_ELIGIBLE"

// ── IP / ICU: insurance status on the patient ──────────────────────────────

export function InsuranceStatusCard({ patientId, patientName }: Who) {
  const c = usePatientCases({ patientId, patientName }).find(isActive)
  if (!c) return null
  return (
    <section className="bg-white border border-slate-200 rounded-[8px]">
      <header className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-slate-900">Insurance status</h3>
        <span className="ml-2">
          <StatusPill status={c.status} />
        </span>
        <button type="button" className={`${btn.plain} ml-auto h-8`} onClick={() => openInsurance("insurance_claims", c.id)}>
          View insurance case
        </button>
      </header>
      <div className="p-4 space-y-3">
        <div className="text-[12.5px] text-slate-600">
          {c.policy.insurerName}
          {c.policy.tpaName ? ` · ${c.policy.tpaName}` : ""} · policy <span className="tabular-nums">{c.policy.policyNumber || "—"}</span> · {c.encounterType}
        </div>
        <Consumption c={c} />
      </div>
    </section>
  )
}

/** A one-line chip for bed cards and patient headers. */
export function InsuranceChip({ patientId, patientName }: Who) {
  const c = usePatientCases({ patientId, patientName }).find(isActive)
  if (!c) return null
  const t = E.checkThresholdWarning(c)
  const warn = c.status === "TREATMENT_IN_PROGRESS" && t.isWarning
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openInsurance("insurance_claims", c.id)
      }}
      title={`${c.policy.insurerName} · ${c.status.replace(/_/g, " ").toLowerCase()} — open insurance case`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold border cursor-pointer max-w-full truncate ${warn ? "bg-rose-50 border-rose-300 text-rose-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}
    >
      <span aria-hidden>{warn ? "" : ""}</span>
      <span className="truncate">{warn ? `${Math.round(t.percentageConsumed)}% of approval used` : `Insured · ${STATUS_META[c.status].label}`}</span>
    </button>
  )
}

// ── Patient record: the Insurance tab ────────────────────────────────────────

export function PatientInsuranceTab({ patientId, patientName }: { patientId: string ;patientName: string }) {
  const { notify, toastNode } = useNotify()
  const cases = usePatientCases({ patientId, patientName })
  const [policies, setPolicies] = useState<PatientPolicy[]>(() => E.getPatientPolicies({ id: patientId, name: patientName }))
  useEffect(() => {
    const load = () => setPolicies(E.getPatientPolicies({ id: patientId, name: patientName }))
    load()
    return E.subscribe(load)
  }, [patientId, patientName])
  const [edit, setEdit] = useState<PatientPolicy | null>(null)
  const [verify, setVerify] = useState<PatientPolicy | null>(null)
  const [useFor, setUseFor] = useState(false)
  const active = cases.find(isActive)

  const blank: PatientPolicy = {
    id: "",
    patientId,
    patientName,
    insurerId: "",
    insurerName: "",
    policyNumber: "",
    memberId: "",
    policyHolderName: patientName,
    relationship: "Self",
    validUntil: "",
    sumInsured: 0,
    balanceAvailable: 0,
    copayPercentage: 0,
    status: "Active",
    createdAt: "",
  }

  return (
    <div className="space-y-4">
      {toastNode}
      {verify && <EligibilityPanel target={{ kind: "policy", p: verify }} notify={notify} onClose={() => setVerify(null)} />}
      {edit && (
        <Modal wide title={edit.id ? "Edit insurance policy" : "Add insurance policy"} onClose={() => setEdit(null)}>
          <PolicyForm
            initial={{ ...edit, paymentType: "Insurance / Cashless", deductibleAmount: 0, preAuthRequired: true, roomCategoryEligible: "" }}
            submitLabel="Save policy"
            onSubmit={(p) => {
              if (attempt(notify, () => E.savePatientPolicy({ ...edit, ...p, tpaName: p.tpaName, patientId, patientName }), "Policy saved to the patient record.")) setEdit(null)
            }}
          />
        </Modal>
      )}
      {useFor && (
        <Modal wide title="Use insurance for this admission" onClose={() => setUseFor(false)}>
          <EncounterCase notify={notify} initial={{ patientId, patientName }} onOpened={(id) => (setUseFor(false), openInsurance("insurance_preauth", id))} />
        </Modal>
      )}

      <Card
        emoji=""
        title="Insurance coverage"
        subtitle={`${policies.length} polic${policies.length === 1 ? "y" : "ies"} on record`}
        actions={
          <div className="flex gap-2">
            {!active && (
              <button type="button" className={btn.soft} onClick={() => setUseFor(true)}>
                Use for admission
              </button>
            )}
            <button type="button" className={btn.primary} onClick={() => setEdit(blank)}>
              Add policy
            </button>
          </div>
        }
      >
        {policies.length === 0 ? (
          <Empty emoji="" title="No insurance on record" hint="Add the patient's policy. A patient can hold several — each admission picks the one it uses." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {policies.map((p) => (
              <div key={p.id} className="border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold text-slate-900">{p.insurerName}</div>
                    <div className="text-[12px] text-slate-500">{p.tpaName || "Direct"}</div>
                  </div>
                  <Dot ok={p.status === "Active"}>{p.status}</Dot>
                </div>
                <div className="mt-2">
                  <KV k="Policy number" v={p.policyNumber} mono />
                  <KV k="Member ID" v={p.memberId || "—"} mono />
                  <KV k="Policy holder" v={`${p.policyHolderName || patientName} (${p.relationship})`} />
                  <KV k="Valid until" v={p.validUntil ? fmtDate(p.validUntil) : "—"} />
                  <KV k="Sum insured / balance" v={`${p.sumInsured ? inr(p.sumInsured) : "—"} / ${p.balanceAvailable ? inr(p.balanceAvailable) : "—"}`} mono />
                  <KV
                    k="Eligibility"
                    v={p.lastVerification ? <Dot ok={p.lastVerification.status === "Eligible" ? true : p.lastVerification.status === "Not Eligible" ? false : null}>{p.lastVerification.status} · {fmtDateTime(p.lastVerification.at)}</Dot> : <Dot ok={null}>Not verified</Dot>}
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" className={btn.primary} onClick={() => setVerify(p)}>
                    Verify eligibility
                  </button>
                  {!p.id.startsWith("POL-CLM") && (
                    <>
                      <button type="button" className={btn.plain} onClick={() => setEdit(p)}>
                         Edit
                      </button>
                      <button type="button" className={btn.plain} onClick={() => attempt(notify, () => E.removePatientPolicy(p.id), "Policy removed from the record.")}>
                         Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card emoji="" title="Insurance by encounter" subtitle="Each admission has its own insurance case" pad={false}>
        {cases.length === 0 ? (
          <Empty emoji="" title="No insured encounters" hint="OP visits are paid by the patient. Admitted encounters on insurance appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {cases.map((c) => (
              <li key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-[11px] font-semibold">{c.encounterType}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-slate-900">
                    <span className="tabular-nums">{c.id}</span> · {c.policy.insurerName}
                  </div>
                  <div className="text-[11.5px] text-slate-500">
                    {c.department} · admitted {fmtDate(c.admissionDate)} · approved {inr(c.approvedPreAuthAmount)} · bill {inr(c.consumedBillAmount)}
                  </div>
                </div>
                <StatusPill status={c.status} />
                <button type="button" className={btn.plain} onClick={() => openInsurance("insurance_claims", c.id)}>
                  View case
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {active && <InsuranceStatusCard patientId={patientId} patientName={patientName} />}
    </div>
  )
}

// ── Admissions: payment type at the encounter ───────────────────────────────

export type PaymentChoice = "Self Pay" | "Insurance / Cashless" | "Corporate" | "Government Scheme"

/**
 * Payment type for an admission. Choosing Insurance / Corporate / Government
 * opens the insurance case for this encounter (using a policy on record or a
 * new one); Self Pay leaves insurance out entirely.
 */
export function AdmissionPaymentType({
  patientId,
  patientName,
  encounterType = "IP",
  department = "Inpatient",
  attendingDoctor,
}: {
  patientId: string
  patientName: string
  encounterType?: ClaimEncounterType
  department?: string
  attendingDoctor?: string
}) {
  const { notify, toastNode } = useNotify()
  const cases = usePatientCases({ patientId, patientName })
  const active = cases.find(isActive)
  const policies = useMemo(() => (patientId || patientName ? E.getPatientPolicies({ id: patientId, name: patientName }).filter((p) => p.status === "Active") : []), [patientId, patientName, cases.length])
  const [choice, setChoice] = useState<PaymentChoice>(active ? "Insurance / Cashless" : "Self Pay")
  const [policyId, setPolicyId] = useState<string>("")

  if (!patientId && !patientName) return null
  if (active)
    return (
      <div className="border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-[12.5px] flex flex-wrap items-center gap-2">
        {toastNode}
        <strong>Payment type: Insurance / Cashless</strong> — {active.policy.insurerName} · <StatusPill status={active.status} />
        <button type="button" className="ml-auto underline font-semibold text-blue-700 cursor-pointer" onClick={() => openInsurance("insurance_preauth", active.id)}>
          Open insurance case
        </button>
      </div>
    )

  const openWith = (p: Parameters<typeof E.openEncounterCase>[1]) => {
    let id = ""
    if (attempt(notify, () => (id = E.openEncounterCase({ patientId, patientName, encounterType, department, attendingDoctor }, { ...p, paymentType: choice === "Self Pay" ? "Insurance / Cashless" : choice }).id), `Insurance case opened for ${patientName} — the insurance desk will verify eligibility.`))
      openInsurance("insurance_preauth", id)
  }

  return (
    <div className="space-y-3">
      {toastNode}
      <div className="text-[12px] font-medium text-slate-500">Payment type</div>
      <div role="radiogroup" aria-label="Payment type" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Choice active={choice === "Self Pay"} emoji="" title="Self Pay" onClick={() => setChoice("Self Pay")} />
        <Choice active={choice === "Insurance / Cashless"} emoji="" title="Insurance / Cashless" onClick={() => setChoice("Insurance / Cashless")} />
        <Choice active={choice === "Corporate"} emoji="" title="Corporate" onClick={() => setChoice("Corporate")} />
        <Choice active={choice === "Government Scheme"} emoji="" title="Government Scheme" onClick={() => setChoice("Government Scheme")} />
      </div>
      {choice !== "Self Pay" && (
        <div className="border border-slate-100 p-3 space-y-3">
          {policies.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block flex-1 min-w-[240px]">
                <span className="block text-[12px] font-medium text-slate-500 mb-1">Policy on record</span>
                <select className={fieldCls} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
                  <option value="">Enter a new policy below…</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.insurerName} — {p.policyNumber}
                    </option>
                  ))}
                </select>
              </label>
              {policyId && (
                <button
                  type="button"
                  className={btn.primary}
                  onClick={() => {
                    const p = policies.find((x) => x.id === policyId)!
                    openWith({ paymentType: "Insurance / Cashless", insurerId: p.insurerId, insurerName: p.insurerName, tpaName: p.tpaName, policyNumber: p.policyNumber, memberId: p.memberId, policyHolderName: p.policyHolderName, relationship: p.relationship, validUntil: p.validUntil, sumInsured: p.sumInsured, balanceAvailable: p.balanceAvailable, roomCategoryEligible: "", copayPercentage: p.copayPercentage, deductibleAmount: 0, preAuthRequired: true })
                  }}
                >
                   Use this policy
                </button>
              )}
            </div>
          )}
          {!policyId && <PolicyForm initial={{ policyHolderName: patientName, paymentType: choice }} submitLabel="Open insurance case" onSubmit={openWith} />}
        </div>
      )}
    </div>
  )
}

// ── ER: quick insurance capture ─────────────────────────────────────────────

export function ErQuickInsurance({ patientId, patientName, age, gender, doctor }: { patientId: string ;patientName: string ;age?: number ;gender?: string ;doctor?: string }) {
  const { notify, toastNode } = useNotify()
  const [open, setOpen] = useState(false)
  const active = usePatientCases({ patientId, patientName }).find(isActive)
  if (active)
    return (
      <button type="button" className="inline-flex items-center gap-1.5 px-2.5 h-8 bg-blue-50 border border-blue-300 text-blue-800 text-[12px] font-semibold cursor-pointer" onClick={() => openInsurance("insurance_preauth", active.id)}>
        {toastNode} {active.policy.insurerName} · {active.quickCapture ? "quick capture" : active.status.replace(/_/g, " ").toLowerCase()}
      </button>
    )
  return (
    <>
      {toastNode}
      <button type="button" className="inline-flex items-center gap-1.5 px-2.5 h-8 bg-white border border-slate-200 rounded-[8px] hover:border-blue-500 text-slate-800 text-[12px] font-semibold cursor-pointer" onClick={() => setOpen(true)}>
         Quick insurance
      </button>
      {open && (
        <Drawer title="Quick insurance capture" subtitle="Minimum details now — the insurance desk completes the rest after treatment starts." onClose={() => setOpen(false)}>
          <EncounterCase quick notify={notify} initial={{ patientId, patientName, encounterType: "ER", department: "Emergency", attendingDoctor: doctor, age, gender }} onOpened={() => setOpen(false)} />
        </Drawer>
      )}
    </>
  )
}

// ── OT: procedure -> package -> insurance case ──────────────────────────────

export function OtPackageLink({ patientId, patientName, procedureName, surgeon, scheduledAt }: { patientId?: string ;patientName?: string ;procedureName: string ;surgeon?: string ;scheduledAt?: string }) {
  const { notify, toastNode } = useNotify()
  const c = usePatientCases({ patientId, patientName }).find(isActive)
  const pkgs = useMemo(() => E.getPackages().filter((p) => p.status === "Active"), [])
  const guess = useMemo(() => {
    const words = procedureName.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    return pkgs.find((p) => words.some((w) => p.procedureName.toLowerCase().includes(w)))?.code ?? ""
  }, [pkgs, procedureName])
  const [code, setCode] = useState(guess)
  if (!c) return null
  const linked = c.procedureLinks?.find((l) => l.procedureName === procedureName)
  return (
    <div className="border border-violet-200 bg-violet-50/50 px-3 py-2 text-[12px] flex flex-wrap items-center gap-2">
      {toastNode}
      <span className="font-semibold text-violet-900">Insured ({c.policy.insurerName})</span>
      {linked ? (
        <span className="text-violet-900">
          · package <span className="tabular-nums font-semibold">{linked.packageCode}</span> sent to pre-auth
        </span>
      ) : (
        <>
          <select className={`${fieldBase} h-8 w-auto min-w-[220px]`} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Insurance package">
            <option value="">Choose package…</option>
            {pkgs.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.procedureName} ({inr(p.basePrice)})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="px-2.5 h-8 bg-violet-600 hover:bg-violet-700 text-white font-semibold cursor-pointer disabled:opacity-50"
            disabled={!code}
            onClick={() => attempt(notify, () => E.linkProcedure({ id: patientId, name: patientName }, { packageCode: code, procedureName, surgeon, scheduledAt, source: "OT" }), `Package ${code} sent to the insurance pre-auth.`)}
          >
            Send to insurance
          </button>
        </>
      )}
    </div>
  )
}

// ── Discharge: insurance clearance ──────────────────────────────────────────

export function DischargeInsuranceCheck({ patientId, patientName }: Who) {
  const c = usePatientCases({ patientId, patientName }).find(isActive)
  if (!c) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[12.5px]">
        <strong>Insurance clearance</strong> — {c.policy.insurerName} · <StatusPill status={c.status} />
        <button type="button" className="ml-auto underline font-semibold text-blue-700 cursor-pointer" onClick={() => openInsurance("insurance_claims", c.id)}>
          Open insurance case
        </button>
      </div>
      <Readiness c={c} />
    </div>
  )
}
