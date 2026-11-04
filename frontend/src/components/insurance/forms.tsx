import { useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, FileUp, Plus, Trash2 } from "lucide-react"
import { InsuranceEngineService } from "../../services/insuranceDb"
import type {
  ClaimDeductionReason,
  ClaimQuery,
  ComprehensiveClaimRecord,
  DocumentCategory,
  EligibilityOutcome,
  InsurancePolicyDetails,
  PolicyRelationship,
} from "../../types/insurance"
import { InsurerReply, MailComposer } from "./mail"
import { Choice, DOC_EMOJI, Field, Section, Toggle, attempt, btn, fieldBase, fieldCls, fmtDateTime, inr, type Notify } from "./ui"

// One form per step of the insurance journey. Every page reuses these, so a
// step behaves the same whether it is done from the worklist, the claim
// detail page or the queries / settlement desks.

const E = InsuranceEngineService

const num = (v: string) => Math.max(0, Number(v) || 0)

// ── Policy (admission: payment type = insurance) ────────────────────────────

export function PolicyForm({
  initial,
  submitLabel,
  onSubmit,
  quick,
}: {
  initial?: Partial<InsurancePolicyDetails>
  submitLabel: string
  onSubmit: (p: InsurancePolicyDetails) => void
  /** ER quick capture: just enough to identify the cover; the rest is completed later. */
  quick?: boolean
}) {
  const insurers = useMemo(() => E.getInsurers().filter((i) => i.status === "Active"), [])
  const [p, setP] = useState<InsurancePolicyDetails>({
    paymentType: "Insurance / Cashless",
    insurerId: "",
    insurerName: "",
    tpaName: "",
    policyNumber: "",
    memberId: "",
    policyHolderName: "",
    relationship: "Self",
    validUntil: "",
    sumInsured: 0,
    balanceAvailable: 0,
    roomCategoryEligible: "",
    copayPercentage: 0,
    deductibleAmount: 0,
    preAuthRequired: true,
    ...initial,
  })
  const set = <K extends keyof InsurancePolicyDetails>(k: K, v: InsurancePolicyDetails[K]) => setP((x) => ({ ...x, [k]: v }))
  const pickInsurer = (id: string) => {
    const i = insurers.find((x) => x.id === id)
    setP((x) => ({ ...x, insurerId: id, insurerName: i?.companyName ?? "", tpaName: i?.tpaName ?? x.tpaName }))
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(p)
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Payment type">
          <select className={fieldCls} value={p.paymentType} onChange={(e) => set("paymentType", e.target.value as InsurancePolicyDetails["paymentType"])}>
            <option>Insurance / Cashless</option>
            <option>Corporate</option>
            <option>Government Scheme</option>
          </select>
        </Field>
        <Field label="Insurance company *" span={2}>
          <select className={fieldCls} value={p.insurerId} onChange={(e) => pickInsurer(e.target.value)} required>
            <option value="">Select insurer…</option>
            {insurers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.companyName} ({i.networkStatus})
              </option>
            ))}
          </select>
        </Field>
        <Field label="TPA">
          <input className={fieldCls} value={p.tpaName ?? ""} onChange={(e) => set("tpaName", e.target.value)} />
        </Field>
        <Field label={quick ? "Policy number (if known)" : "Policy number *"}>
          <input className={`${fieldCls} tabular-nums`} value={p.policyNumber} onChange={(e) => set("policyNumber", e.target.value)} required={!quick} />
        </Field>
        <Field label="Member ID">
          <input className={`${fieldCls} tabular-nums`} value={p.memberId} onChange={(e) => set("memberId", e.target.value)} />
        </Field>
        {!quick && (<>
          <Field label="Policy holder">
            <input className={fieldCls} value={p.policyHolderName} onChange={(e) => set("policyHolderName", e.target.value)} />
          </Field>
          <Field label="Relationship to holder">
            <select className={fieldCls} value={p.relationship} onChange={(e) => set("relationship", e.target.value as PolicyRelationship)}>
              {["Self", "Spouse", "Child", "Parent", "Other"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Valid until">
            <input type="date" className={fieldCls} value={p.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
          </Field>
          <Field label="Sum insured (₹)">
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={p.sumInsured || ""} onChange={(e) => set("sumInsured", num(e.target.value))} />
          </Field>
          <Field label="Room eligibility">
            <input className={fieldCls} placeholder="e.g. Semi-private" value={p.roomCategoryEligible} onChange={(e) => set("roomCategoryEligible", e.target.value)} />
          </Field>
          <Field label="Co-pay %">
            <input type="number" min={0} max={100} className={`${fieldCls} tabular-nums`} value={p.copayPercentage || ""} onChange={(e) => set("copayPercentage", Math.min(100, num(e.target.value)))} />
          </Field>
        </>)}
      </div>
      <div className="flex justify-end">
        <button type="submit" className={btn.primary}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

// ── Eligibility ─────────────────────────────────────────────────────────────

export function EligibilityForm({ c, notify, onDone }: { c: ComprehensiveClaimRecord; notify: Notify; onDone?: () => void }) {
  const [f, setF] = useState({
    method: "Portal" as "Portal" | "Phone" | "API" | "Email",
    reference: "",
    status: "Eligible" as EligibilityOutcome,
    policyActive: true,
    inNetwork: true,
    sumInsured: c.policy.sumInsured || 0,
    balanceAvailable: c.policy.balanceAvailable || 0,
    roomEligibilityNote: c.policy.roomCategoryEligible || "",
    copayApplicable: c.policy.copayPercentage > 0,
    copayValue: c.policy.copayPercentage ? `${c.policy.copayPercentage}%` : "",
    deductibleRemaining: c.policy.deductibleAmount || 0,
    preAuthRequired: c.policy.preAuthRequired,
    notes: "",
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (attempt(notify, () => E.recordEligibility(c.id, f), `Eligibility recorded: ${f.status}.`)) onDone?.()
      }}
    >
      <Section n={1} title="How did you check?" help={<>Call or log in to <strong>{c.policy.tpaName || c.policy.insurerName}</strong> and ask about policy <span className="tabular-nums">{c.policy.policyNumber || "—"}</span>.</>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Verified via">
            <select className={fieldCls} value={f.method} onChange={(e) => set("method", e.target.value as typeof f.method)}>
              <option value="Portal"> Insurer / TPA portal</option>
              <option value="Phone"> Phone call</option>
              <option value="Email"> Email</option>
              <option value="API"> Online link (API)</option>
            </select>
          </Field>
          <Field label="Reference / call ID" hint="The number they gave you, so it can be traced later">
            <input className={`${fieldCls} tabular-nums`} value={f.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section n={2} title="What did the insurer say?" help="Tap the answer that matches.">
        <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {(
            [
              ["Eligible", "", "Covered", "Policy is active and has cover", "emerald"],
              ["Partially Eligible", "", "Covered with limits", "Some items or amounts are capped", "blue"],
              ["Verification Required", "", "Needs more checks", "Insurer wants more details first", "amber"],
              ["Not Eligible", "", "Not covered", "Patient will pay themselves", "rose"],
            ] as const
          ).map(([v, e, t, sub, tone]) => (
            <Choice key={v} active={f.status === v} emoji={e} title={t} sub={sub} tone={tone} onClick={() => set("status", v)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Toggle checked={f.policyActive} onChange={(v) => set("policyActive", v)}>Policy is active</Toggle>
          <Toggle checked={f.inNetwork} onChange={(v) => set("inNetwork", v)}>Our hospital is in their network</Toggle>
          <Toggle checked={f.preAuthRequired} onChange={(v) => set("preAuthRequired", v)}>Approval needed before treatment</Toggle>
        </div>
      </Section>

      <Section n={3} title="Policy limits" help="Copy these from the insurer's reply. Leave blank what they did not tell you.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Sum insured (₹)" hint="Total cover for the year">
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.sumInsured || ""} onChange={(e) => set("sumInsured", num(e.target.value))} />
          </Field>
          <Field label="Available balance (₹)" hint="What is left to use now">
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.balanceAvailable || ""} onChange={(e) => set("balanceAvailable", num(e.target.value))} />
          </Field>
          <Field label="Room eligibility" hint="e.g. Single private room">
            <input className={fieldCls} value={f.roomEligibilityNote} onChange={(e) => set("roomEligibilityNote", e.target.value)} />
          </Field>
          <Field label="Deductible remaining (₹)" hint="Amount the patient pays first">
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.deductibleRemaining || ""} onChange={(e) => set("deductibleRemaining", num(e.target.value))} />
          </Field>
          <Field label="Co-pay" hint="Share the patient always pays">
            <div className="flex gap-2">
              <select className={fieldCls} value={f.copayApplicable ? "yes" : "no"} onChange={(e) => set("copayApplicable", e.target.value === "yes")}>
                <option value="no">No co-pay</option>
                <option value="yes">Yes, co-pay applies</option>
              </select>
              {f.copayApplicable && <input className={`${fieldBase} w-24`} placeholder="10%" value={f.copayValue} onChange={(e) => set("copayValue", e.target.value)} />}
            </div>
          </Field>
          <Field label="Notes">
            <input className={fieldCls} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </Section>
      <div className="flex justify-end">
        <button type="submit" className={btn.primary}>
          Record eligibility
        </button>
      </div>
    </form>
  )
}

// ── Documents ───────────────────────────────────────────────────────────────

const CATEGORY_ORDER: DocumentCategory[] = ["Patient", "Insurance", "Pre-Auth", "Clinical", "Billing", "Discharge", "Query", "Settlement"]

export function DocumentChecklist({
  c,
  notify,
  categories,
}: {
  c: ComprehensiveClaimRecord
  notify: Notify
  categories?: DocumentCategory[]
}) {
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)
  const [adding, setAdding] = useState<{ category: DocumentCategory; type: string; mandatory: boolean } | null>(null)
  const docs = c.documents.filter((d) => !categories || categories.includes(d.category))
  const groups = CATEGORY_ORDER.map((cat) => ({ cat, items: docs.filter((d) => d.category === cat) })).filter((g) => g.items.length)
  const mandatory = docs.filter((d) => d.isMandatory)
  const uploaded = mandatory.filter((d) => d.isUploaded).length
  const done = mandatory.filter((d) => d.isUploaded && d.status === "Verified").length
  const awaiting = docs.filter((d) => d.isUploaded && d.status === "Uploaded").length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="flex justify-between text-[11.5px] text-slate-600 mb-1">
            <span>
              {done === mandatory.length
                ? " All required documents uploaded and verified"
                : `${uploaded}/${mandatory.length} uploaded · ${done}/${mandatory.length} verified${uploaded < mandatory.length ? ` · ${mandatory.length - uploaded} to upload` : ""}`}
            </span>
            <span className="tabular-nums font-semibold">
              {done} / {mandatory.length}
            </span>
          </div>
          <div className="h-2 bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-emerald-600" style={{ width: `${mandatory.length ? (done / mandatory.length) * 100 : 100}%` }} />
            <div className="h-full bg-blue-300" style={{ width: `${mandatory.length ? ((uploaded - done) / mandatory.length) * 100 : 0}%` }} />
          </div>
        </div>
        {awaiting > 0 && c.status !== "CLOSED" && (
          <button type="button" className={btn.success} onClick={() => attempt(notify, () => E.verifyAllUploaded(c.id, categories), `${awaiting} document${awaiting > 1 ? "s" : ""} verified.`)}>
            Verify all uploaded ({awaiting})
          </button>
        )}
        <button type="button" className={btn.plain} onClick={() => setAdding({ category: categories?.[0] ?? "Clinical", type: "", mandatory: false })}>
          <Plus size={14} /> Add requirement
        </button>
      </div>

      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && target.current) attempt(notify, () => E.uploadDocument(c.id, target.current!, f.name), `${f.name} attached.`)
          e.target.value = ""
        }}
      />

      {adding && (
        <div className="p-3 bg-slate-50 border border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <Field label="Category">
            <select className={fieldCls} value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value as DocumentCategory })}>
              {CATEGORY_ORDER.map((c2) => (
                <option key={c2}>{c2}</option>
              ))}
            </select>
          </Field>
          <Field label="Document">
            <input className={fieldCls} value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value })} />
          </Field>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-slate-700 h-9">
            <input type="checkbox" className="accent-blue-600" checked={adding.mandatory} onChange={(e) => setAdding({ ...adding, mandatory: e.target.checked })} />
            Mandatory
          </label>
          <div className="flex gap-2">
            <button type="button" className={btn.plain} onClick={() => setAdding(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={btn.primary}
              onClick={() => attempt(notify, () => E.addDocument(c.id, adding.category, adding.type, adding.mandatory), "Requirement added.") && setAdding(null)}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 && <div className="text-[12px] text-slate-500">No documents required at this stage yet.</div>}
      {groups.map((g) => (
        <div key={g.cat} className="border border-slate-100">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[12px] font-medium text-slate-500">
            <span aria-hidden className="mr-1.5 text-[13px]">{DOC_EMOJI[g.cat]}</span>
            {g.cat} documents
          </div>
          <ul className="divide-y divide-slate-100">
            {g.items.map((d) => (
              <li key={d.id} className="px-3 py-2 flex flex-wrap items-center gap-3 text-[12.5px]">
                <span
                  className={`w-5 h-5 flex items-center justify-center shrink-0 ${d.status === "Verified" ? "text-emerald-600" : d.isUploaded ? "text-blue-600" : d.status === "Rejected" ? "text-rose-600" : "text-slate-300"
                    }`}
                >
                  <span aria-hidden className="text-[13px] font-semibold" title={d.status === "Verified" ? "Verified" : d.status === "Rejected" ? "Rejected" : d.isUploaded ? "Uploaded — verify it" : "Not uploaded"}>
                    {d.status === "Verified" ? "✓" : d.status === "Rejected" ? "✕" : d.isUploaded ? "●" : "○"}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">
                    {d.documentType}
                    {d.isMandatory ? null : <span className="text-slate-400 font-normal"> (optional)</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {d.isUploaded
                      ? `${d.fileName} · v${d.version} · ${d.uploadedBy ?? ""} · ${fmtDateTime(d.uploadedAt)}${d.status === "Verified" ? " · verified" : ""}`
                      : d.status === "Rejected"
                        ? "Rejected — upload a corrected copy"
                        : "Not uploaded"}
                  </div>
                </div>
                <button
                  type="button"
                  className="px-2.5 h-8 bg-white border border-slate-200 rounded-[8px] hover:border-blue-600 hover:text-blue-700 text-slate-700 text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1"
                  onClick={() => {
                    target.current = d.id
                    input.current?.click()
                  }}
                >
                  <span aria-hidden>{d.isUploaded ? "" : ""}</span> {d.isUploaded ? "Replace" : "Upload"}
                </button>
                {d.isUploaded && d.status !== "Verified" && (
                  <>
                    <button type="button" className="px-2.5 h-8 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[12px] font-semibold cursor-pointer" onClick={() => attempt(notify, () => E.verifyDocument(c.id, d.id, true), `${d.documentType} verified.`)}>
                      Verify
                    </button>
                    <button type="button" className="px-2.5 h-8 bg-rose-50 border border-rose-300 text-rose-800 text-[12px] font-semibold cursor-pointer" onClick={() => attempt(notify, () => E.verifyDocument(c.id, d.id, false), `${d.documentType} rejected.`)}>
                      Reject
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ── Pre-authorisation ───────────────────────────────────────────────────────

export function PreAuthForm({ c, notify, onDone }: { c: ComprehensiveClaimRecord; notify: Notify; onDone?: () => void }) {
  const pkgs = useMemo(() => E.getPackages().filter((p) => p.status === "Active"), [])
  const pa = c.preAuth
  const [f, setF] = useState({
    diagnosis: pa?.diagnosis ?? "",
    icdCode: pa?.icdCode ?? "",
    clinicalSummary: pa?.clinicalSummary ?? "",
    treatingDoctor: pa?.treatingDoctor || c.attendingDoctor || "",
    admissionType: (pa?.admissionType ?? "Planned") as "Planned" | "Emergency",
    procedureCodes: pa?.procedures.map((p) => p.packageCode) ?? [],
    estimatedOtherCharges: pa?.estimatedOtherCharges ?? 0,
    estimatedHospitalStayDays: pa?.estimatedHospitalStayDays ?? 3,
  })
  const [pick, setPick] = useState("")
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const lines = E.priceProcedures(f.procedureCodes)
  const gstRate = lines.length ? pkgs.find((p) => p.code === lines[0].packageCode)?.applicableGstRate ?? 0 : 0
  const subtotal = lines.reduce((a, l) => a + l.amount, 0)
  const gst = Math.round((subtotal * gstRate) / 100)
  const total = subtotal + gst + f.estimatedOtherCharges

  const move = (i: number, d: -1 | 1) => {
    const arr = [...f.procedureCodes]
    const j = i + d
    if (j < 0 || j >= arr.length) return
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    set("procedureCodes", arr)
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (attempt(notify, () => E.savePreAuthDraft(c.id, f), "Pre-auth draft saved.")) onDone?.()
      }}
    >
      <Section n={1} title="What is wrong and who is treating?" help="Write it as the doctor wrote it on the admission note.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Diagnosis *" span={2}>
            <input className={fieldCls} value={f.diagnosis} onChange={(e) => set("diagnosis", e.target.value)} required />
          </Field>
          <Field label="ICD-10">
            <input className={`${fieldCls} tabular-nums`} value={f.icdCode} onChange={(e) => set("icdCode", e.target.value)} />
          </Field>
          <Field label="Admission type">
            <select className={fieldCls} value={f.admissionType} onChange={(e) => set("admissionType", e.target.value as "Planned" | "Emergency")}>
              <option>Planned</option>
              <option>Emergency</option>
            </select>
          </Field>
          <Field label="Treating doctor *" span={2}>
            <input className={fieldCls} value={f.treatingDoctor} onChange={(e) => set("treatingDoctor", e.target.value)} required />
          </Field>
          <Field label="Estimated stay (days)">
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.estimatedHospitalStayDays} onChange={(e) => set("estimatedHospitalStayDays", num(e.target.value))} />
          </Field>
          <Field label="Other estimated charges (₹)" hint="Items outside the package">
            <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.estimatedOtherCharges || ""} onChange={(e) => set("estimatedOtherCharges", num(e.target.value))} />
          </Field>
          <Field label="Clinical summary" span={4} hint="A few lines on symptoms, findings and why admission is needed">
            <textarea rows={3} className={`${fieldCls} h-auto py-2`} value={f.clinicalSummary} onChange={(e) => set("clinicalSummary", e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* Procedures & packages (multiple-surgery rule applied per package) */}
      <Section
        n={2}
        title="Which surgery / package?"
        help="Add each planned procedure. The first is charged in full, the next ones at a reduced rate (e.g. 50%, 25%) — the price is worked out for you. Use ↑ ↓ to put the main surgery first."
      >
        <div className="border border-slate-100">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-slate-500 mr-auto">Proposed procedures & packages</span>
            <select className={`${fieldBase} w-auto min-w-[260px]`} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Add a package…</option>
              {pkgs.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.procedureName} ({inr(p.basePrice)})
                </option>
              ))}
            </select>
            <button type="button" className={btn.soft} disabled={!pick} onClick={() => pick && (set("procedureCodes", [...f.procedureCodes, pick]), setPick(""))}>
              <Plus size={14} /> Add
            </button>
          </div>
          {lines.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-slate-500">No package selected — the estimate uses other charges only.</div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[12px] font-medium text-slate-500 border-b border-slate-100">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Package</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">Rule</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.packageCode}-${i}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 tabular-nums">{l.sequence}</td>
                    <td className="px-3 py-2">
                      <span className="tabular-nums font-semibold">{l.packageCode}</span> {l.procedureName}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(l.baseAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.ratePercent}%</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{inr(l.amount)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" aria-label="Move up" className="p-1 text-slate-500 hover:text-blue-700 cursor-pointer" onClick={() => move(i, -1)}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" aria-label="Move down" className="p-1 text-slate-500 hover:text-blue-700 cursor-pointer" onClick={() => move(i, 1)}>
                        <ArrowDown size={14} />
                      </button>
                      <button type="button" aria-label="Remove" className="p-1 text-slate-500 hover:text-rose-700 cursor-pointer" onClick={() => set("procedureCodes", f.procedureCodes.filter((_, j) => j !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-3 py-3 border-t border-slate-100 bg-slate-50/60 text-[12.5px]">
            <div>
              <div className="text-[12px] font-medium text-slate-500">Package subtotal</div>
              <div className="tabular-nums font-semibold">{inr(subtotal)}</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-slate-500">GST ({gstRate}%)</div>
              <div className="tabular-nums font-semibold">{inr(gst)}</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-slate-500">Other charges</div>
              <div className="tabular-nums font-semibold">{inr(f.estimatedOtherCharges)}</div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-slate-500"> Amount we will ask for</div>
              <div className="tabular-nums font-semibold text-blue-800 text-[15px]">{inr(total)}</div>
            </div>
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <button type="submit" className={btn.primary} disabled={total <= 0}>
          Save pre-auth draft
        </button>
      </div>
    </form>
  )
}

export function SubmitForm({
  label,
  onSubmit,
  summary,
}: {
  label: string
  onSubmit: (method: "Portal" | "API" | "Email" | "Manual", ref: string) => void
  summary?: React.ReactNode
}) {
  const [method, setMethod] = useState<"Portal" | "API" | "Email" | "Manual">("Portal")
  const [ref, setRef] = useState("")
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(method, ref.trim())
      }}
    >
      {summary}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <Field label="Submitted via">
          <select className={fieldCls} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {["Portal", "API", "Email", "Manual"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Insurer / portal reference">
          <input className={`${fieldCls} tabular-nums`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" />
        </Field>
        <button type="submit" className={btn.primary}>
          {label}
        </button>
      </div>
    </form>
  )
}

export function PreAuthResponseForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const [outcome, setOutcome] = useState<"Approved" | "Partially Approved" | "Query" | "Rejected">("Approved")
  const [amount, setAmount] = useState(c.preAuth?.requestedAmount ?? 0)
  const [code, setCode] = useState("")
  const [note, setNote] = useState("")
  const [due, setDue] = useState(2)
  const [inboundParsed, setInboundParsed] = useState(false)
  const needsAmount = outcome === "Approved" || outcome === "Partially Approved"

  const simulatedInboundEmail = {
    sender: `approvals@${(c.policy.tpaName || c.policy.insurerName || "tpa").toLowerCase().replace(/[^a-z]/g, "")}.com`,
    subject: `[${c.id}] Pre-Auth Initial Approval Letter — ${c.patientName} (${c.policy.policyNumber || "POL-9921"})`,
    approvedAmount: c.preAuth?.requestedAmount ? Math.round(c.preAuth.requestedAmount * 0.95) : 50000,
    authCode: `AUTH-${(c.policy.tpaName || "TPA").slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`,
    remarks: `Initial cashless approved up to ₹${(c.preAuth?.requestedAmount || 50000).toLocaleString("en-IN")}. Non-medical items excluded. Subject to final discharge summary.`,
  }

  const handleAutoExtract = () => {
    setOutcome("Approved")
    setAmount(simulatedInboundEmail.approvedAmount)
    setCode(simulatedInboundEmail.authCode)
    setNote(simulatedInboundEmail.remarks)
    setInboundParsed(true)
    notify(`Extracted approval data from ${simulatedInboundEmail.sender}: ₹${simulatedInboundEmail.approvedAmount.toLocaleString("en-IN")}`, "success")
  }

  return (
    <div className="space-y-4">
      {/* Inbound TPA Decision Tracker Banner */}
      <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/80 rounded-[8px] p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                Inbound Email &amp; TPA Portal Tracker
              </span>
            </div>
            <div className="text-[13px] font-semibold text-slate-900 mt-1 truncate">
              {simulatedInboundEmail.subject}
            </div>
            <div className="text-[11.5px] text-slate-500 mt-0.5">
              From: <span className="font-mono font-medium text-slate-700">{simulatedInboundEmail.sender}</span> · Sanctioned: <span className="font-bold text-emerald-700">{inr(simulatedInboundEmail.approvedAmount)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAutoExtract}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold rounded-[6px] transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
          >
            <span>⚡</span> Auto-Fill from TPA Email
          </button>
        </div>
      </div>

      <form
        className="space-y-3 bg-white p-4 border border-slate-200 rounded-[8px]"
        onSubmit={(e) => {
          e.preventDefault()
          attempt(
            notify,
            () =>
              E.recordPreAuthResponse(c.id, {
                outcome,
                amount,
                approvalCode: code,
                note,
                dueDays: due,
              }),
            `Pre-auth ${outcome} recorded — Synced with Pharmacy & Billing desks.`,
          )
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="Insurer response">
            <select className={fieldCls} value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
              <option>Approved</option>
              <option>Partially Approved</option>
              <option>Query</option>
              <option>Rejected</option>
            </select>
          </Field>
          {needsAmount && (
            <>
              <Field label="Approved amount (₹)" hint={`Requested ${inr(c.preAuth?.requestedAmount)}`}>
                <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={amount || ""} onChange={(e) => setAmount(num(e.target.value))} />
              </Field>
              <Field label="Approval code *">
                <input className={`${fieldCls} tabular-nums`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AUTH-STAR-9921" />
              </Field>
            </>
          )}
          {outcome === "Query" && (
            <Field label="Respond within (days)">
              <input type="number" min={1} className={`${fieldCls} tabular-nums`} value={due} onChange={(e) => setDue(Math.max(1, num(e.target.value)))} />
            </Field>
          )}
          <Field label={outcome === "Query" ? "What the insurer asked *" : outcome === "Rejected" ? "Rejection reason" : "Remarks"} span={needsAmount ? 1 : 2}>
            <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Exclusions, validity notes, remarks" />
          </Field>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-[12px] text-slate-500">
            {needsAmount ? "✓ Authorisation will immediately reflect on Pharmacy and Reception bills." : ""}
          </span>
          <button type="submit" className={outcome === "Rejected" ? btn.danger : btn.primary}>
            Record &amp; Confirm Response
          </button>
        </div>
      </form>
    </div>
  )
}

export function EnhancementForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const pending = c.preAuth?.enhancements.find((e) => e.status === "Requested")
  const [amount, setAmount] = useState(Math.max(c.consumedBillAmount, (c.preAuth?.approvedAmount ?? 0) + 10000))
  const [reason, setReason] = useState("")
  const [granted, setGranted] = useState(pending?.amount ?? 0)
  if (pending)
    return (
      <div className="space-y-3">
        <div className="text-[12.5px] text-slate-700">
          Enhancement to <strong className="tabular-nums">{inr(pending.amount)}</strong> requested {fmtDateTime(pending.at)} — {pending.reason}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Amount granted (₹)">
            <input type="number" className={`${fieldBase} tabular-nums w-40`} value={granted || ""} onChange={(e) => setGranted(num(e.target.value))} />
          </Field>
          <button type="button" className={btn.primary} onClick={() => attempt(notify, () => E.resolveEnhancement(c.id, true, granted), "Enhancement approved.")}>
            Record approval
          </button>
          <button type="button" className={btn.danger} onClick={() => attempt(notify, () => E.resolveEnhancement(c.id, false), "Enhancement rejected.")}>
            Reject
          </button>
        </div>
      </div>
    )
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault()
        attempt(notify, () => E.requestEnhancement(c.id, amount, reason), "Enhancement requested from the insurer.")
      }}
    >
      <Field label="New total authorisation (₹)" hint={`Now ${inr(c.preAuth?.approvedAmount)}`}>
        <input type="number" className={`${fieldCls} tabular-nums`} value={amount || ""} onChange={(e) => setAmount(num(e.target.value))} />
      </Field>
      <Field label="Reason *" span={2}>
        <input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stay extended, ICU transfer" />
      </Field>
      <button type="submit" className={`${btn.soft} whitespace-nowrap`}>
        Request enhancement
      </button>
    </form>
  )
}

// ── Claim adjudication ──────────────────────────────────────────────────────

const DEDUCTION_CATEGORIES: ClaimDeductionReason["category"][] = [
  "Non-Payable Consumables",
  "Room Rent Capping",
  "Co-pay Deduction",
  "Unapproved Excess",
  "Package Difference",
  "Other",
]

export function ClaimDecisionForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const [outcome, setOutcome] = useState<"Approved" | "Partially Approved" | "Rejected">("Approved")
  const [approved, setApproved] = useState(c.finalClaimAmount)
  const [rows, setRows] = useState<ClaimDeductionReason[]>([])
  const [shortfallTo, setShortfallTo] = useState<"writeoff" | "patient">("writeoff")
  const [note, setNote] = useState("")
  const gap = Math.max(0, c.finalClaimAmount - approved)
  const deducted = rows.reduce((a, r) => a + r.amount, 0)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        attempt(
          notify,
          () => E.recordClaimDecision(c.id, { outcome: outcome === "Rejected" ? "Rejected" : gap > 0 ? "Partially Approved" : "Approved", approvedAmount: approved, deductions: rows, shortfallTo, note }),
          outcome === "Rejected" ? "Claim marked rejected." : `Claim decision recorded: ${inr(approved)} approved.`,
        )
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Field label="Insurer decision">
          <select
            className={fieldCls}
            value={outcome}
            onChange={(e) => {
              const v = e.target.value as typeof outcome
              setOutcome(v)
              if (v === "Approved") setApproved(c.finalClaimAmount)
            }}
          >
            <option>Approved</option>
            <option>Partially Approved</option>
            <option>Rejected</option>
          </select>
        </Field>
        {outcome !== "Rejected" && (
          <Field label="Approved amount (₹)" hint={`Claimed ${inr(c.finalClaimAmount)}`}>
            <input type="number" min={0} max={c.finalClaimAmount} className={`${fieldCls} tabular-nums`} value={approved || ""} onChange={(e) => setApproved(num(e.target.value))} />
          </Field>
        )}
        <Field label={outcome === "Rejected" ? "Rejection reason *" : "Remarks"} span={outcome === "Rejected" ? 3 : 2}>
          <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {outcome !== "Rejected" && gap > 0 && (
        <div className="border border-slate-100">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <span className="text-[12px] font-medium text-slate-500 mr-auto">
              Deductions — must total <span className="tabular-nums">{inr(gap)}</span>
            </span>
            <span className={`text-[12px] tabular-nums font-semibold ${deducted === gap ? "text-emerald-700" : "text-rose-700"}`}>{inr(deducted)} entered</span>
            <button type="button" className={btn.plain} onClick={() => setRows([...rows, { id: `D-${Date.now()}`, category: "Non-Payable Consumables", amount: gap - deducted, remark: "" }])}>
              <Plus size={14} /> Add deduction
            </button>
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-[200px_140px_1fr_auto] gap-2 border-b border-slate-100 last:border-0">
              <select className={fieldCls} value={r.category} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, category: e.target.value as ClaimDeductionReason["category"] } : x)))}>
                {DEDUCTION_CATEGORIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={r.amount || ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)))} />
              <input className={fieldCls} placeholder="Reason given by insurer" value={r.remark} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, remark: e.target.value } : x)))} />
              <button type="button" aria-label="Remove deduction" className="p-2 text-slate-500 hover:text-rose-700 cursor-pointer" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <div className="px-3 py-2 flex flex-wrap gap-2 items-center text-[12px]">
            <span className="text-slate-600">Shortfall is</span>
            {(
              [
                ["writeoff", "written off by the hospital"],
                ["patient", "recovered from the patient (reopens their IP bill)"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={`px-2.5 h-8 inline-flex items-center gap-2 border cursor-pointer ${shortfallTo === v ? "bg-blue-50 border-blue-600 text-blue-800 font-semibold" : "bg-white border-slate-200 text-slate-700"}`}>
                <input type="radio" className="accent-blue-600" checked={shortfallTo === v} onChange={() => setShortfallTo(v)} />
                {l}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" className={outcome === "Rejected" ? btn.danger : btn.primary}>
          Record decision
        </button>
      </div>
    </form>
  )
}

export function RaiseQueryForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const [text, setText] = useState("")
  const [due, setDue] = useState(3)
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-[1fr_150px_auto] gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault()
        attempt(notify, () => E.raiseClaimQuery(c.id, text, due), "Insurer query recorded.") && setText("")
      }}
    >
      <Field label="Query from the insurer">
        <input className={fieldCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Additional operative documentation required" />
      </Field>
      <Field label="Due in (days)">
        <input type="number" min={1} className={`${fieldCls} tabular-nums`} value={due} onChange={(e) => setDue(Math.max(1, num(e.target.value)))} />
      </Field>
      <button type="submit" className={`${btn.soft} whitespace-nowrap`}>
        Record query
      </button>
    </form>
  )
}

export function QueryResponseForm({ c, q, notify }: { c: ComprehensiveClaimRecord; q: ClaimQuery; notify: Notify }) {
  const [text, setText] = useState(q.hospitalResponseText ?? "")
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="space-y-3">
      <Field label="Hospital response">
        <textarea rows={3} className={`${fieldCls} h-auto py-2`} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btn.plain} cursor-pointer`}>
          <FileUp size={14} /> Attach documents
          <input type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? []).map((f) => f.name)])} />
        </label>
        {files.map((f) => (
          <span key={f} className="px-2 py-1 bg-slate-100 border border-slate-200 text-[11.5px]">
            {f}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          <button type="button" className={btn.plain} onClick={() => attempt(notify, () => E.saveQueryDraft(c.id, q.id, text), "Response draft saved.")}>
            Save draft
          </button>
          <button type="button" className={btn.primary} onClick={() => attempt(notify, () => E.respondToQuery(c.id, q.id, text, files), `Response to ${q.id} submitted.`)}>
            Submit response
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settlement ──────────────────────────────────────────────────────────────

export function SettlementAdviceForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const ins = E.getInsurers().find((i) => i.id === c.policy.insurerId)
  const [advice, setAdvice] = useState("")
  const [by, setBy] = useState(new Date(Date.now() + (ins?.slaDaysForClaimSettlement ?? 15) * 86_400_000).toISOString().slice(0, 10))
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault()
        attempt(notify, () => E.recordSettlementAdvice(c.id, advice, by), "Settlement advice recorded.")
      }}
    >
      <Field label="Settlement advice no.">
        <input className={`${fieldCls} tabular-nums`} value={advice} onChange={(e) => setAdvice(e.target.value)} />
      </Field>
      <Field label="Payment expected by" hint={ins ? `Insurer SLA ${ins.slaDaysForClaimSettlement} days` : undefined}>
        <input type="date" className={fieldCls} value={by} onChange={(e) => setBy(e.target.value)} />
      </Field>
      <button type="submit" className={btn.primary}>
        Record advice
      </button>
    </form>
  )
}

export function PaymentForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const s = c.settlement
  const [f, setF] = useState({ amount: (s?.expectedAmount ?? 0) - (s?.receivedAmount ?? 0), utr: "", bankRef: "", paymentDate: new Date().toISOString().slice(0, 10), bankAccount: "Hospital Collections A/c" })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault()
        attempt(notify, () => E.recordPayment(c.id, f), `Payment of ${inr(f.amount)} recorded.`)
      }}
    >
      <Field label="Amount received (₹)" hint={`Expected ${inr(s?.expectedAmount)}`}>
        <input type="number" min={0} className={`${fieldCls} tabular-nums`} value={f.amount || ""} onChange={(e) => set("amount", num(e.target.value))} />
      </Field>
      <Field label="UTR / reference *">
        <input className={`${fieldCls} tabular-nums`} value={f.utr} onChange={(e) => set("utr", e.target.value)} />
      </Field>
      <Field label="Bank reference">
        <input className={`${fieldCls} tabular-nums`} value={f.bankRef} onChange={(e) => set("bankRef", e.target.value)} />
      </Field>
      <Field label="Payment date">
        <input type="date" className={fieldCls} value={f.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} />
      </Field>
      <button type="submit" className={btn.success}>
        Record payment
      </button>
    </form>
  )
}

export function ReconcileForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const [note, setNote] = useState("")
  const short = c.settlement?.reconciliationStatus === "Short Payment"
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault()
        attempt(notify, () => E.reconcile(c.id, note), "Payment reconciled.")
      }}
    >
      <Field label={short ? "Short-payment explanation *" : "Reconciliation note"}>
        <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={short ? "e.g. TDS deducted by insurer" : "Matched with bank statement"} />
      </Field>
      <button type="submit" className={btn.primary}>
        Reconcile
      </button>
    </form>
  )
}

export function AppealForm({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const [text, setText] = useState("")
  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault()
        attempt(notify, () => E.appealClaim(c.id, text), "Appeal filed.")
      }}
    >
      <Field label="Grounds for appeal">
        <input className={fieldCls} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button type="submit" className={btn.primary}>
        File appeal
      </button>
    </form>
  )
}

// ── What to do next, for any case ───────────────────────────────────────────

/** The claim is with the insurer: ask what happened, then show only that form. */
function ClaimReply({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const [kind, setKind] = useState<"decision" | "query" | null>(null)
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Insurer reply" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Choice active={kind === "decision"} emoji="" title="They decided" sub="Approved, cut some items, or rejected" tone="emerald" onClick={() => setKind("decision")} />
        <Choice active={kind === "query"} emoji="" title="They asked a question" sub="Record it so it can be answered" tone="amber" onClick={() => setKind("query")} />
      </div>
      {kind === "decision" && <ClaimDecisionForm c={c} notify={notify} />}
      {kind === "query" && <RaiseQueryForm c={c} notify={notify} />}
    </div>
  )
}

/** Eligibility: verify on the portal / phone and record it, or ask the insurer by email. */
function EligibilityStep({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const asked = (c.mails ?? []).some((m) => m.direction === "out" && m.purpose === "Eligibility")
  const [how, setHow] = useState<"record" | "email">(asked ? "record" : "record")
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="How are you verifying" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Choice active={how === "record"} emoji="" title={asked ? "Insurer replied — record the result" : "Checked on portal / phone"} sub="Record what the insurer confirmed" onClick={() => setHow("record")} />
        <Choice active={how === "email"} emoji="" title="Ask the insurer by email" sub={asked ? "An eligibility email was already sent" : "Send the policy details for verification"} onClick={() => setHow("email")} />
      </div>
      {how === "email" ? (
        <MailComposer c={c} purpose="Eligibility" notify={notify} />
      ) : asked ? (
        <InsurerReply c={c} purpose="Eligibility" notify={notify}>
          {(n) => <EligibilityForm c={c} notify={n} />}
        </InsurerReply>
      ) : (
        <EligibilityForm c={c} notify={notify} />
      )}
    </div>
  )
}

const money = (label: string, v: number, tone = "") => (
  <div>
    <div className="text-[12px] font-medium text-slate-500">{label}</div>
    <div className={`tabular-nums font-semibold ${tone}`}>{inr(v)}</div>
  </div>
)

export function NextStep({ c, notify, onOpenBilling }: { c: ComprehensiveClaimRecord; notify: Notify; onOpenBilling?: () => void }) {
  const t = E.checkThresholdWarning(c)
  switch (c.status) {
    case "DRAFT":
    case "ELIGIBILITY_PENDING":
    case "NOT_ELIGIBLE":
      return <EligibilityStep c={c} notify={notify} />
    case "ELIGIBLE":
      return (
        <div className="space-y-3">
          {c.policy.preAuthRequired ? (
            <PreAuthForm c={c} notify={notify} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] text-slate-700">The policy does not require pre-authorisation.</span>
              <button type="button" className={btn.primary} onClick={() => attempt(notify, () => E.startTreatmentWithoutPreAuth(c.id), "Treatment started.")}>
                Start treatment
              </button>
            </div>
          )}
        </div>
      )
    case "PREAUTH_DRAFT":
    case "PREAUTH_REJECTED":
      return (
        <div className="space-y-4">
          <PreAuthForm c={c} notify={notify} />
          {c.status === "PREAUTH_DRAFT" && (
            <>
              <Section n={3} title="Upload and verify the documents" help="Upload each one, then check it and press  Verify. Only verified documents can be emailed.">
                <DocumentChecklist c={c} notify={notify} categories={E.PREAUTH_DOC_CATEGORIES} />
              </Section>
              <Section n={4} title="Email the request to the insurer" help="The verified documents are attached. Sending the email submits the pre-auth.">
                <MailComposer c={c} purpose="Pre-Auth" notify={notify} />
              </Section>
            </>
          )}
        </div>
      )
    case "PREAUTH_SUBMITTED":
    case "PREAUTH_UNDER_REVIEW":
      return (
        <div className="space-y-3">
          {c.status === "PREAUTH_SUBMITTED" && (
            <button type="button" className={btn.plain} onClick={() => attempt(notify, () => E.markPreAuthUnderReview(c.id), "Marked under review.")}>
              Insurer acknowledged — mark under review
            </button>
          )}
          <InsurerReply c={c} purpose="Pre-Auth" notify={notify}>
            {(n) => <PreAuthResponseForm c={c} notify={n} />}
          </InsurerReply>
        </div>
      )
    case "PREAUTH_QUERY":
    case "CLAIM_QUERY_RAISED": {
      const q = c.queries.find((x) => x.status === "Open" || x.status === "Draft Response")
      return q ? (
        <div className="space-y-3">
          <div className="text-[12.5px] text-amber-900 bg-amber-50 border border-amber-300 px-3 py-2">
            <strong> {q.id}</strong> from {q.requestedBy} — due {new Date(q.dueDate).toLocaleDateString("en-IN")}: {q.queryText}
          </div>
          <DocumentChecklist c={c} notify={notify} categories={["Query", "Clinical", "Discharge", "Billing"]} />
          <MailComposer key={q.id} c={c} purpose="Query Response" queryId={q.id} notify={notify} />
        </div>
      ) : (
        <div className="text-[12.5px] text-slate-600">Waiting for the insurer.</div>
      )
    }
    case "PREAUTH_APPROVED":
    case "TREATMENT_IN_PROGRESS":
      return (
        <div className="space-y-4">
          {t.message && (
            <div className={`text-[12.5px] px-3 py-2 border ${t.isWarning ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-slate-50 border-slate-100 text-slate-700"}`}>
              {t.message} Approved {inr(c.approvedPreAuthAmount)} · bill so far {inr(c.consumedBillAmount)} · remaining {inr(Math.max(0, t.remaining))}
            </div>
          )}
          <EnhancementForm c={c} notify={notify} />
          <div className="flex justify-end">
            <button type="button" className={btn.primary} onClick={() => attempt(notify, () => E.initiateDischarge(c.id), "Discharge initiated; claim documents added.")}>
              Initiate discharge
            </button>
          </div>
        </div>
      )
    case "DISCHARGE_INITIATED":
      return (
        <div className="space-y-4">
          <div className="text-[12.5px] px-3 py-2 bg-blue-50 border border-blue-200 text-blue-900 flex flex-wrap items-center gap-2">
            Waiting for the final bill: the IP counter raises it with <strong>Bill to insurance</strong>, then this claim becomes ready automatically. Meanwhile, collect and verify the discharge documents.
            {onOpenBilling && (
              <button type="button" className="ml-auto underline font-semibold cursor-pointer" onClick={onOpenBilling}>
                Open IP Billing
              </button>
            )}
          </div>
          <DocumentChecklist c={c} notify={notify} categories={["Clinical", "Billing", "Discharge", "Pre-Auth", "Patient"]} />
        </div>
      )
    case "FINAL_BILL_READY":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 border border-slate-100 text-[12.5px]">
            {money("Hospital bill", c.totalHospitalBill)}
            {money("Non-payable", c.nonPayableAmount)}
            {money("Patient share", c.patientShareAmount)}
            {money("Claim amount", c.finalClaimAmount, "text-blue-800")}
          </div>
          <Section n={1} title="Check the claim documents" help="Upload anything missing and verify each document against the original.">
            <DocumentChecklist c={c} notify={notify} categories={E.CLAIM_DOC_CATEGORIES} />
          </Section>
          <Section n={2} title="Email the claim to the insurer" help="Sending the email submits the claim; the insurer replies by email.">
            <MailComposer c={c} purpose="Claim" notify={notify} />
          </Section>
        </div>
      )
    case "CLAIM_SUBMITTED":
      return (
        <InsurerReply c={c} purpose="Claim" notify={notify}>
          {(n) => <ClaimReply c={c} notify={n} />}
        </InsurerReply>
      )
    case "REJECTED":
      return <AppealForm c={c} notify={notify} />
    case "APPROVED":
    case "PARTIALLY_APPROVED":
      return <SettlementAdviceForm c={c} notify={notify} />
    case "SETTLEMENT_PENDING":
      return <PaymentForm c={c} notify={notify} />
    case "PAYMENT_RECEIVED":
      return <ReconcileForm c={c} notify={notify} />
    case "RECONCILED":
      return (
        <button type="button" className={btn.primary} onClick={() => attempt(notify, () => E.closeClaim(c.id), "Claim closed.")}>
          Close claim
        </button>
      )
    case "CLOSED":
      return <div className="text-[12.5px] text-emerald-700 font-semibold">This claim is closed.</div>
  }
}

