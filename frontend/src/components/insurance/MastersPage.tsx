import { useEffect, useMemo, useState } from "react"
import { Building2, Calculator, FileCheck2, Handshake, Package as PackageIcon, Percent, Plus, Trash2, Sparkles, Search, BookOpen, CheckCircle2, UserCheck, Clock, ShieldCheck } from "lucide-react"
import { InsuranceEngineService } from "../../services/insuranceDb"
import type { ClaimEncounterType, DocumentCategory, DocumentRule, InsuranceCompanyConfig, PackageComponent, PackageMaster, PricingRuleSet, TpaConfig } from "../../types/insurance"
import { Card, Empty, PageHeader, Field, Modal, Tag, attempt, btn, fieldBase, fieldCls, inr, useNotify, type Notify } from "./ui"
import PhoneInput from "../ui/PhoneInput"
import { DEPT_SOP_DATA } from "./InsuranceSopModal"

// Masters the whole engine runs on: insurance companies, TPAs, procedure
// packages, multiple-surgery pricing rules and document rules. One page per
// master (section prop), all reading and writing InsuranceEngineService.

const COMPONENTS: PackageComponent[] = ["Surgeon", "OT", "Room", "Nursing", "Investigations", "Pharmacy", "Consumables", "Implants", "HighCostDrugs", "SpecialConsultations"]

function useMasters() {
  const E = InsuranceEngineService
  const read = () => ({ insurers: E.getInsurers(), packages: E.getPackages(), tpas: E.getTpas(), ruleSets: E.getPricingRuleSets(), docRules: E.getDocumentRules() })
  const [m, setM] = useState(read)
  useEffect(() => E.subscribe(() => setM(read())), []) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...m, reload: () => setM(read()) }
}

const blankInsurer = (): InsuranceCompanyConfig => ({
  id: "",
  companyName: "",
  companyCode: "",
  tpaName: "",
  contactPhone: "",
  contactEmail: "",
  preAuthEmail: "",
  claimsEmail: "",
  networkStatus: "Empaneled / In-Network",
  integrationType: "Portal",
  documentRequirements: ["Policy card", "Photo ID", "Admission note", "Discharge summary", "Final bill"],
  slaDaysForPreAuth: 1,
  slaDaysForClaimSettlement: 30,
  alertThresholdPct: 85,
  status: "Active",
})

const blankPackage = (): PackageMaster => ({
  id: "",
  code: "",
  procedureName: "",
  basePrice: 0,
  applicableGstRate: 5,
  department: "Surgery",
  includedComponents: ["Surgeon", "OT", "Room", "Nursing"],
  excludedComponents: ["Implants", "HighCostDrugs"],
  pricingRules: [
    { sequenceOrder: 1, discountPercentage: 100, description: "Primary procedure" },
    { sequenceOrder: 2, discountPercentage: 50, description: "Second procedure, same sitting" },
    { sequenceOrder: 3, discountPercentage: 25, description: "Third and subsequent" },
  ],
  effectiveDate: new Date().toISOString().slice(0, 10),
  status: "Active",
})

function InsurerForm({ initial, notify, onDone }: { initial: InsuranceCompanyConfig ;notify: Notify ;onDone: () => void }) {
  const [f, setF] = useState(initial)
  const [docs, setDocs] = useState(initial.documentRequirements.join("\n"))
  const set = <K extends keyof InsuranceCompanyConfig>(k: K, v: InsuranceCompanyConfig[K]) => setF((p) => ({ ...p, [k]: v }))
  const num = (v: string, min = 0, max = Infinity) => Math.min(max, Math.max(min, Number(v) || 0))
  const save = () => {
    const ok = attempt(
      notify,
      () =>
        InsuranceEngineService.saveInsurer({
          ...f,
          documentRequirements: docs.split("\n").map((d) => d.trim()).filter(Boolean),
        }),
      `${f.companyName || "Insurer"} and Pre-Auth Form configuration saved.`,
    )
    if (ok) onDone()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      set("preAuthFormDocumentName", file.name)
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setF((p) => ({
          ...p,
          preAuthFormDocumentName: file.name,
          preAuthPdfDataUrl: dataUrl,
          preAuthPageCount: 4,
        }))
        notify(`Attached and indexed official PDF form: ${file.name} (Ready for pre-auth auto-fill)`, "success")
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      {/* SECTION 1: COMPANY IDENTIFICATION */}
      <div className="bg-slate-50 p-4 rounded-none border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={14} className="text-blue-600" /> Insurer Profile &amp; Network Status
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company name *">
            <input className={fieldCls} value={f.companyName} placeholder="e.g. Star Health & Allied Insurance" onChange={(e) => set("companyName", e.target.value)} />
          </Field>
          <Field label="Code *">
            <input className={fieldCls} value={f.companyCode} placeholder="e.g. STAR-HLTH" onChange={(e) => set("companyCode", e.target.value.toUpperCase())} />
          </Field>
          <Field label="TPA Name" hint="Leave blank if settled directly in-house">
            <input className={fieldCls} value={f.tpaName ?? ""} placeholder="e.g. Medi Assist / FHPL / In-House" onChange={(e) => set("tpaName", e.target.value)} />
          </Field>
          <Field label="Network Status">
            <select className={fieldCls} value={f.networkStatus} onChange={(e) => set("networkStatus", e.target.value as InsuranceCompanyConfig["networkStatus"])}>
              <option>Empaneled / In-Network</option>
              <option>Preferred Provider</option>
              <option>Non-Network</option>
            </select>
          </Field>
          <Field label="Integration Type">
            <select className={fieldCls} value={f.integrationType} onChange={(e) => set("integrationType", e.target.value as InsuranceCompanyConfig["integrationType"])}>
              {["Portal", "API", "Email", "Manual"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className={fieldCls} value={f.status} onChange={(e) => set("status", e.target.value as "Active" | "Inactive")}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </Field>
        </div>
      </div>

      {/* SECTION 2: PRE-AUTH FORM CONFIGURATION (CRITICAL FOR PRE-AUTH VIEW) */}
      <div className="bg-blue-50/70 p-4 rounded-none border border-blue-200 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
            <FileCheck2 size={15} className="text-blue-600" /> Pre-Authorization Form Template &amp; Document Mapping
          </h4>
          <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-none border border-blue-300">
            Auto-Loads in Pre-Auth Desk
          </span>
        </div>
        <p className="text-[11.5px] text-slate-600">
          When this insurer is selected in the Pre-Authorization desk, the system will automatically select this form layout and incorporate all hospital &amp; patient clinical data into it.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pre-Auth Form Layout / Template *" hint="Determines format & field schedule">
            <select className={fieldCls} value={f.preAuthFormTemplate ?? "irdai_standard"} onChange={(e) => set("preAuthFormTemplate", e.target.value)}>
              <option value="care_health">Care Health (Religare) Cashless Requisition</option>
              <option value="star_health">Star Health & Allied Insurance Form</option>
              <option value="irdai_standard">IRDAI Uniform Cashless Form (Standard Part A & B)</option>
              <option value="medi_assist">Medi Assist TPA Standard Cashless Format</option>
              <option value="hdfc_fhpl">HDFC ERGO / FHPL Cashless Requisition</option>
              <option value="pmjay_tms">Ayushman Bharat PMJAY TMS Template</option>
              <option value="custom_template">Custom Network Hospital Cashless Template</option>
            </select>
          </Field>

          <Field label="Form Format Code *" hint="Official form identifier code">
            <input
              className={fieldCls}
              value={f.preAuthFormCode ?? ""}
              placeholder="e.g. CHI/CASHLESS/V4.2 or STAR/PREAUTH/2026"
              onChange={(e) => set("preAuthFormCode", e.target.value)}
            />
          </Field>

          <Field label="Pre-Auth Submission Email *" hint="Destination for outgoing pre-auth emails">
            <input className={fieldCls} type="email" value={f.preAuthEmail} placeholder="e.g. preauth@insurer.com" onChange={(e) => set("preAuthEmail", e.target.value)} />
          </Field>

          <Field label="Cashless Portal URL (optional)">
            <input className={fieldCls} type="url" value={f.portalUrl ?? ""} placeholder="e.g. https://provider.insurer.com" onChange={(e) => set("portalUrl", e.target.value)} />
          </Field>

          <div className="col-span-2 bg-white p-3 rounded-none border border-blue-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">
                Official Pre-Authorization Form Template Document (PDF / Scan)
              </label>
              {f.preAuthFormDocumentName && (
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200">
                  ✓ {f.preAuthFormDocumentName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                className={`${fieldCls} flex-1`}
                value={f.preAuthFormDocumentName ?? ""}
                placeholder="e.g. Care_Health_Cashless_PreAuth_V4.2.pdf"
                onChange={(e) => set("preAuthFormDocumentName", e.target.value)}
              />
              <label className="h-9 px-3.5 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs">
                <span>Upload PDF Form</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: CONTACTS, SLAS & REQUIRED DOCUMENTS */}
      <div className="bg-slate-50 p-4 rounded-none border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Desk Contacts, SLAs &amp; Required Checklist
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Helpline Phone">
            <PhoneInput size="sm" value={f.contactPhone} placeholder="1800 102 4455" onChange={(val) => set("contactPhone", val)} />
          </Field>
          <Field label="Claims & Settlement Email">
            <input className={fieldCls} type="email" value={f.claimsEmail} placeholder="claims@insurer.com" onChange={(e) => set("claimsEmail", e.target.value)} />
          </Field>
          <Field label="Pre-auth SLA (days)">
            <input className={fieldCls} type="number" min={0} value={f.slaDaysForPreAuth} onChange={(e) => set("slaDaysForPreAuth", num(e.target.value))} />
          </Field>
          <Field label="Settlement SLA (days)">
            <input className={fieldCls} type="number" min={0} value={f.slaDaysForClaimSettlement} onChange={(e) => set("slaDaysForClaimSettlement", num(e.target.value))} />
          </Field>
          <Field label="Running Bill Alert (%)" hint="Alert when bill reaches % of sanctioned limit" span={2}>
            <input className={fieldCls} type="number" min={1} max={100} value={f.alertThresholdPct ?? 85} onChange={(e) => set("alertThresholdPct", num(e.target.value, 1, 100))} />
          </Field>
          <Field label="Mandatory Documents Checklist" hint="One per line" span={2}>
            <textarea className={`${fieldCls} h-24 py-2`} value={docs} onChange={(e) => setDocs(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btn.soft} onClick={onDone}>
          Cancel
        </button>
        <button type="button" className={btn.primary} onClick={save}>
          Save Insurer &amp; Pre-Auth Form
        </button>
      </div>
    </div>
  )
}

function PackageForm({ initial, notify, onDone }: { initial: PackageMaster ;notify: Notify ;onDone: () => void }) {
  const [f, setF] = useState(initial)
  const ruleSets = useMemo(() => InsuranceEngineService.getPricingRuleSets().filter((x) => x.status === "Active"), [])
  const insurers = useMemo(() => InsuranceEngineService.getInsurers(), [])
  const set = <K extends keyof PackageMaster>(k: K, v: PackageMaster[K]) => setF((p) => ({ ...p, [k]: v }))
  const toggle = (c: PackageComponent, into: "includedComponents" | "excludedComponents") => {
    const other = into === "includedComponents" ? "excludedComponents" : "includedComponents"
    setF((p) => ({
      ...p,
      [into]: p[into].includes(c) ? p[into].filter((x) => x !== c) : [...p[into], c],
      [other]: p[other].filter((x) => x !== c),
    }))
  }
  const gst = Math.round((f.basePrice * f.applicableGstRate) / 100)
  const save = () => {
    if (attempt(notify, () => InsuranceEngineService.savePackage(f), `Package ${f.code || ""} saved.`)) onDone()
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Package code *">
          <input className={fieldCls} value={f.code} disabled={!!initial.id} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Department">
          <input className={fieldCls} value={f.department} onChange={(e) => set("department", e.target.value)} />
        </Field>
        <Field label="Procedure *" span={2}>
          <input className={fieldCls} value={f.procedureName} onChange={(e) => set("procedureName", e.target.value)} />
        </Field>
        <Field label="Package price (₹, before GST) *">
          <input className={fieldCls} type="number" min={0} value={f.basePrice || ""} onChange={(e) => set("basePrice", Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label="GST (%)" hint={`GST ${inr(gst)} · total ${inr(f.basePrice + gst)}`}>
          <input className={fieldCls} type="number" min={0} max={28} value={f.applicableGstRate} onChange={(e) => set("applicableGstRate", Math.min(28, Math.max(0, Number(e.target.value) || 0)))} />
        </Field>
        <Field label="Effective from">
          <input className={fieldCls} type="date" value={f.effectiveDate.slice(0, 10)} onChange={(e) => set("effectiveDate", e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={fieldCls} value={f.status} onChange={(e) => set("status", e.target.value as "Active" | "Inactive")}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </Field>
      </div>

      <div>
        <div className="text-[12px] font-medium text-slate-500 mb-1.5">Components — click to mark included / excluded</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {COMPONENTS.map((c) => {
            const inc = f.includedComponents.includes(c)
            const exc = f.excludedComponents.includes(c)
            return (
              <div key={c} className={`border px-2 py-1.5 text-[11.5px] ${inc ? "border-emerald-300 bg-emerald-50" : exc ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}>
                <div className="font-semibold text-slate-800 truncate">{c}</div>
                <div className="flex gap-1 mt-1">
                  <button type="button" onClick={() => toggle(c, "includedComponents")} className={`flex-1 text-[10.5px] font-semibold border cursor-pointer ${inc ? "bg-emerald-600 text-white border-emerald-700" : "bg-white border-slate-200"}`}>
                    Incl.
                  </button>
                  <button type="button" onClick={() => toggle(c, "excludedComponents")} className={`flex-1 text-[10.5px] font-semibold border cursor-pointer ${exc ? "bg-rose-600 text-white border-rose-700" : "bg-white border-slate-200"}`}>
                    Excl.
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="text-[12px] font-medium text-slate-500 mb-1.5">Applicable insurers — none ticked means every insurer</div>
        <div className="flex flex-wrap gap-2">
          {insurers.map((i) => {
            const on = f.applicableInsurerIds?.includes(i.id) ?? false
            return (
              <label key={i.id} className={`inline-flex items-center gap-2 px-2.5 h-8 border text-[12px] cursor-pointer ${on ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={on}
                  onChange={(e) => set("applicableInsurerIds", e.target.checked ? [...(f.applicableInsurerIds ?? []), i.id] : (f.applicableInsurerIds ?? []).filter((x) => x !== i.id))}
                />
                {i.companyName}
              </label>
            )
          })}
        </div>
      </div>

      <Field label="Multiple-surgery pricing" hint="Use a shared rule set from Pricing Rules, or define rules for this package only">
        <select className={fieldCls} value={f.pricingRuleSetId ?? ""} onChange={(e) => set("pricingRuleSetId", e.target.value || undefined)}>
          <option value="">This package's own rules (below)</option>
          {ruleSets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} — {x.category} ({x.rules.map((r) => `${r.discountPercentage}%`).join(" / ")})
            </option>
          ))}
        </select>
      </Field>

      <div className={f.pricingRuleSetId ? "hidden" : ""}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[12px] font-medium text-slate-500">Multiple-surgery pricing rules</div>
          <button
            type="button"
            className={btn.plain}
            onClick={() => set("pricingRules", [...f.pricingRules, { sequenceOrder: f.pricingRules.length + 1, discountPercentage: 25, description: "" }])}
          >
            <Plus size={13} /> Rule
          </button>
        </div>
        <table className="w-full text-[12.5px] border border-slate-100">
          <thead>
            <tr className="bg-slate-50 text-[12px] font-medium text-slate-500">
              <th className="px-2 py-1.5 text-left w-24">Sequence</th>
              <th className="px-2 py-1.5 text-left w-28">% of price</th>
              <th className="px-2 py-1.5 text-left">Description</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {f.pricingRules.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1">
                  <input
                    className={fieldCls}
                    type="number"
                    min={1}
                    value={r.sequenceOrder}
                    onChange={(e) => set("pricingRules", f.pricingRules.map((x, j) => (j === i ? { ...x, sequenceOrder: Math.max(1, Number(e.target.value) || 1) } : x)))}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    className={fieldCls}
                    type="number"
                    min={0}
                    max={100}
                    value={r.discountPercentage}
                    onChange={(e) => set("pricingRules", f.pricingRules.map((x, j) => (j === i ? { ...x, discountPercentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : x)))}
                  />
                </td>
                <td className="px-2 py-1">
                  <input className={fieldCls} value={r.description} onChange={(e) => set("pricingRules", f.pricingRules.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                </td>
                <td className="px-2 py-1 text-center">
                  <button type="button" aria-label="Remove rule" className="text-rose-600 cursor-pointer" onClick={() => set("pricingRules", f.pricingRules.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className={btn.soft} onClick={onDone}>
          Cancel
        </button>
        <button type="button" className={btn.primary} onClick={save}>
          Save package
        </button>
      </div>
    </div>
  )
}

function PackageCalculator({ packages }: { packages: PackageMaster[] }) {
  const active = packages.filter((p) => p.status === "Active")
  const [codes, setCodes] = useState<string[]>([])
  const [pick, setPick] = useState("")
  const lines = useMemo(() => InsuranceEngineService.priceProcedures(codes), [codes, packages])
  const subtotal = lines.reduce((a, l) => a + l.amount, 0)
  const gst = lines.reduce((a, l) => {
    const p = packages.find((x) => x.code === l.packageCode)
    return a + Math.round((l.amount * (p?.applicableGstRate ?? 0)) / 100)
  }, 0)
  return (
    <Card emoji="" title="Package calculator" subtitle="Order matters — the first procedure is charged at the primary rate">
      <div className="flex gap-2 mb-3">
        <select className={fieldCls} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a package…</option>
          {active.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} — {p.procedureName} ({inr(p.basePrice)})
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btn.primary}
          disabled={!pick}
          onClick={() => {
            setCodes((c) => [...c, pick])
            setPick("")
          }}
        >
          <Plus size={13} /> Add
        </button>
      </div>
      {lines.length === 0 ? (
        <div className="text-[12.5px] text-slate-500">Add one or more packages to see the combined price.</div>
      ) : (
        <table className="w-full text-[12.5px]">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5 tabular-nums">{l.sequence}.</td>
                <td className="py-1.5">
                  <span className="font-semibold">{l.packageCode}</span> {l.procedureName}
                </td>
                <td className="py-1.5 text-right text-slate-500">
                  {inr(l.baseAmount)} × {l.ratePercent}%
                </td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{inr(l.amount)}</td>
                <td className="py-1.5 text-right w-8">
                  <button type="button" aria-label="Remove" className="text-rose-600 cursor-pointer" onClick={() => setCodes((c) => c.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="pt-2 text-right text-slate-600">
                Subtotal
              </td>
              <td className="pt-2 text-right tabular-nums">{inr(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-slate-600">
                GST
              </td>
              <td className="text-right tabular-nums">{inr(gst)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right font-semibold">
                Package total
              </td>
              <td className="text-right tabular-nums font-semibold text-blue-700">{inr(subtotal + gst)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  )
}

export type MasterSection = "insurers" | "tpas" | "packages" | "pricing" | "docrules" | "sop_rules"

const SECTION_META: Record<MasterSection, { title: string; subtitle: string; icon: typeof Building2 }> = {
  insurers: { title: "Insurance Companies", subtitle: "Empaneled insurers, network status, gateway integrations, SLAs, and pre-auth form templates.", icon: Building2 },
  tpas: { title: "Third-Party Administrators (TPAs)", subtitle: "TPA networks, associated insurers, desk helpline contacts, and submission portals.", icon: Handshake },
  packages: { title: "Procedure Packages", subtitle: "Fixed-rate procedure packages: bundled components, base prices, GST rates, and multiple-surgery pricing.", icon: PackageIcon },
  pricing: { title: "Multiple-Surgery Pricing Rules", subtitle: "Standard percentage discount matrices shared across surgical packages (e.g. 1st 100%, 2nd 50%, 3rd 25%).", icon: Percent },
  docrules: { title: "Document Compliance Rules", subtitle: "Stage-wise mandatory document checklists per encounter type and insurer.", icon: FileCheck2 },
  sop_rules: { title: "Department Rules & Eligibility SOPs", subtitle: "Official Insurance Dept guidelines, room rent capping, pre-auth SLAs, and leave coverage handover protocols for all staff.", icon: BookOpen },
}

const SECTIONS: MasterSection[] = ["insurers", "tpas", "packages", "pricing", "docrules", "sop_rules"]
const SECTION_TAB: Record<MasterSection, { label: string; icon: typeof Building2 }> = {
  insurers: { label: "Insurers", icon: Building2 },
  tpas: { label: "TPAs", icon: Handshake },
  packages: { label: "Packages", icon: PackageIcon },
  pricing: { label: "Pricing Rules", icon: Percent },
  docrules: { label: "Document Rules", icon: FileCheck2 },
  sop_rules: { label: "Dept Rules & SOPs", icon: BookOpen },
}

const INSURER_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  "Care Health Insurance": { bg: "bg-amber-400", text: "text-blue-950 font-black", label: "CARE" },
  "Care Health": { bg: "bg-amber-400", text: "text-blue-950 font-black", label: "CARE" },
  "Star Health & Allied Insurance": { bg: "bg-sky-900", text: "text-white font-black", label: "STAR" },
  "Star Health": { bg: "bg-sky-900", text: "text-white font-black", label: "STAR" },
  "ICICI Lombard General Insurance": { bg: "bg-amber-700", text: "text-white font-black", label: "ICICI" },
  "ICICI Lombard": { bg: "bg-amber-700", text: "text-white font-black", label: "ICICI" },
  "HDFC ERGO General Insurance": { bg: "bg-red-600", text: "text-white font-black", label: "HDFC" },
  "FHPL (Family Health Plan TPA)": { bg: "bg-purple-600", text: "text-white font-black", label: "FHPL" },
  "Medi Assist TPA": { bg: "bg-teal-600", text: "text-white font-black", label: "MEDI" },
}

export default function MastersPage({ section = "insurers" }: { section?: MasterSection }) {
  const m = useMasters()
  const { notify, toastNode } = useNotify()
  const [tab, setTab] = useState<MasterSection>(section)
  useEffect(() => setTab(section), [section])
  const meta = SECTION_META[tab]

  const counts: Record<MasterSection, number> = {
    insurers: m.insurers.length,
    tpas: m.tpas.length,
    packages: m.packages.length,
    pricing: m.ruleSets.length,
    docrules: m.docRules.length,
    sop_rules: DEPT_SOP_DATA.length,
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-y-auto">
      {toastNode}

      <div className="p-6 max-w-[1750px] mx-auto w-full space-y-5">
        {/* Page Title & Subtitle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-none bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Building2 size={22} className="fill-white/20" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Insurance Master Data &amp; Rule Engine
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Manage empaneled insurers, TPAs, surgical package tariffs, multi-procedure discount rules, and compliance checklists.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation Controls Bar */}
        <div className="bg-white border border-slate-200/90 rounded-none p-2 shadow-2xs">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" role="tablist">
            {SECTIONS.map((x) => {
              const Icon = SECTION_TAB[x].icon
              const isActive = tab === x
              return (
                <button
                  key={x}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(x)}
                  className={`px-4 py-2.5 rounded-none text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                >
                  <Icon size={15} />
                  <span>{SECTION_TAB[x].label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {counts[x]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Section Description */}
        <div className="bg-blue-50/60 border border-blue-200/80 rounded-none p-3.5 flex items-center gap-2.5 text-xs text-blue-900 font-medium">
          <Sparkles size={16} className="text-blue-600 shrink-0" />
          <span>{meta.subtitle}</span>
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {tab === "insurers" && <InsurersSection m={m} notify={notify} />}
          {tab === "tpas" && <TpasSection m={m} notify={notify} />}
          {tab === "packages" && <PackagesSection m={m} notify={notify} />}
          {tab === "pricing" && <PricingSection m={m} notify={notify} />}
          {tab === "docrules" && <DocRulesSection m={m} notify={notify} />}
          {tab === "sop_rules" && <SopRulesSection />}
        </div>
      </div>
    </div>
  )
}

type M = ReturnType<typeof useMasters>
const statusTag = (s: "Active" | "Inactive") => (
  <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${s === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
    {s}
  </span>
)
const editBtn = (onClick: () => void) => (
  <button type="button" className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-none shadow-2xs transition-colors cursor-pointer" onClick={onClick}>
    Edit
  </button>
)

function InsurersSection({ m, notify }: { m: M; notify: Notify }) {
  const [edit, setEdit] = useState<InsuranceCompanyConfig | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredInsurers = useMemo(() => {
    if (!searchQuery.trim()) return m.insurers
    const q = searchQuery.toLowerCase()
    return m.insurers.filter(
      (i) =>
        i.companyName.toLowerCase().includes(q) ||
        i.companyCode.toLowerCase().includes(q) ||
        (i.tpaName && i.tpaName.toLowerCase().includes(q))
    )
  }, [m.insurers, searchQuery])

  return (
    <>
      {edit && (
        <Modal wide title={edit.id ? `Edit ${edit.companyName}` : "New Insurance Company"} onClose={() => setEdit(null)}>
          <InsurerForm initial={edit} notify={notify} onDone={() => (setEdit(null), m.reload())} />
        </Modal>
      )}
      <div className="bg-white border border-slate-200/90 rounded-none shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-900">Empaneled Insurance Companies</h3>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              {filteredInsurers.length} active configurations
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search insurer or TPA…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 h-8.5 text-xs bg-white border border-slate-200 rounded-none text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
              />
            </div>

            <button
              type="button"
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-none transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              onClick={() => setEdit(blankInsurer())}
            >
              <Plus size={14} />
              <span>Add Insurer</span>
            </button>
          </div>
        </div>

        {filteredInsurers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Building2 size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No insurers match your search query</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Insurer / Code</th>
                  <th className="py-3 px-4">TPA Network</th>
                  <th className="py-3 px-4">Pre-Auth Form Template</th>
                  <th className="py-3 px-4">Network Status</th>
                  <th className="py-3 px-4">Integration Mode</th>
                  <th className="py-3 px-4">Pre-Auth / Settlement SLA</th>
                  <th className="py-3 px-4 text-center">Docs Checklist</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredInsurers.map((i) => {
                  const insBadge = INSURER_BADGES[i.companyName] || {
                    bg: "bg-blue-700",
                    text: "text-white font-black",
                    label: i.companyName.slice(0, 4).toUpperCase(),
                  }

                  return (
                    <tr key={i.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider shrink-0 ${insBadge.bg} ${insBadge.text}`}>
                            {insBadge.label}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{i.companyName}</div>
                            <div className="text-[10.5px] font-mono text-slate-400">
                              {i.companyCode} • {i.preAuthEmail || i.contactEmail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {i.tpaName || "Direct / In-House"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10.5px] font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {i.preAuthFormCode || "IRDAI-STD"}
                          </span>
                          {i.preAuthFormDocumentName && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-bold">
                              PDF FORM
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-slate-400 capitalize mt-0.5">
                          {(i.preAuthFormTemplate || "irdai_standard").replace("_", " ")}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border ${
                          i.networkStatus === "Non-Network"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : i.networkStatus === "Preferred Provider"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {i.networkStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">
                        {i.integrationType}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {i.slaDaysForPreAuth}d / {i.slaDaysForClaimSettlement}d
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-blue-700">
                        {i.documentRequirements.length} docs
                      </td>
                      <td className="py-3 px-4">{statusTag(i.status)}</td>
                      <td className="py-3 px-4 text-center">{editBtn(() => setEdit(i))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

const th = (h: string) => (
  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">
    {h}
  </th>
)
const headRow = (hs: string[]) => <tr className="bg-slate-50 border-b border-slate-100 text-[12px] font-medium text-slate-500">{hs.map(th)}</tr>

const blankTpa = (): TpaConfig => ({ id: "", name: "", code: "", contactPhone: "", email: "", portalUrl: "", integrationType: "Portal", insurerIds: [], slaDaysForPreAuth: 1, status: "Active" })

function TpasSection({ m, notify }: { m: M ;notify: Notify }) {
  const [edit, setEdit] = useState<TpaConfig | null>(null)
  const name = (id: string) => m.insurers.find((i) => i.id === id)?.companyName ?? id
  return (
    <>
      {edit && (
        <Modal wide title={edit.id ? `Edit ${edit.name}` : "New TPA"} onClose={() => setEdit(null)}>
          <TpaForm initial={edit} insurers={m.insurers} notify={notify} onDone={() => (setEdit(null), m.reload())} />
        </Modal>
      )}
      <Card
        emoji=""
        title="Third-party administrators"
        subtitle={`${m.tpas.length} configured`}
        pad={false}
        actions={
          <button type="button" className={btn.primary} onClick={() => setEdit(blankTpa())}>
            <Plus size={13} /> TPA
          </button>
        }
      >
        {m.tpas.length === 0 ? (
          <Empty emoji="" title="No TPAs configured" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>{headRow(["TPA", "Handles insurers", "Contact", "Integration", "Pre-auth SLA", "Status", ""])}</thead>
              <tbody>
                {m.tpas.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900">{t.name}</div>
                      <div className="text-[11px] tabular-nums text-slate-500">{t.code}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {t.insurerIds.length ? t.insurerIds.map((id) => <Tag key={id}>{name(id)}</Tag>) : <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px]">
                      <div>{t.contactPhone || "—"}</div>
                      <div className="text-slate-500">{t.email}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {{ Portal: "", API: "", Email: "", Manual: "" }[t.integrationType]} {t.integrationType}
                    </td>
                    <td className="px-3 py-2.5">{t.slaDaysForPreAuth}d</td>
                    <td className="px-3 py-2.5">{statusTag(t.status)}</td>
                    <td className="px-3 py-2.5">{editBtn(() => setEdit(t))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

function TpaForm({ initial, insurers, notify, onDone }: { initial: TpaConfig ;insurers: InsuranceCompanyConfig[] ;notify: Notify ;onDone: () => void }) {
  const [f, setF] = useState(initial)
  const set = <K extends keyof TpaConfig>(k: K, v: TpaConfig[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="TPA name *">
          <input className={fieldCls} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Code">
          <input className={`${fieldCls} tabular-nums`} value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Phone">
          <PhoneInput size="sm" value={f.contactPhone} onChange={(val) => set("contactPhone", val)} placeholder="98765 43210" />
        </Field>
        <Field label="Email">
          <input className={fieldCls} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Portal URL">
          <input className={fieldCls} value={f.portalUrl ?? ""} onChange={(e) => set("portalUrl", e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Integration">
          <select className={fieldCls} value={f.integrationType} onChange={(e) => set("integrationType", e.target.value as TpaConfig["integrationType"])}>
            {["Portal", "API", "Email", "Manual"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Pre-auth SLA (days)">
          <input className={fieldCls} type="number" min={0} value={f.slaDaysForPreAuth} onChange={(e) => set("slaDaysForPreAuth", Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label="Status">
          <select className={fieldCls} value={f.status} onChange={(e) => set("status", e.target.value as "Active" | "Inactive")}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </Field>
      </div>
      <div>
        <div className="text-[12px] font-medium text-slate-500 mb-1.5">Insurers this TPA handles</div>
        <div className="flex flex-wrap gap-2">
          {insurers.map((i) => {
            const on = f.insurerIds.includes(i.id)
            return (
              <label key={i.id} className={`inline-flex items-center gap-2 px-2.5 h-8 border text-[12px] cursor-pointer ${on ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                <input type="checkbox" className="accent-blue-600" checked={on} onChange={(e) => set("insurerIds", e.target.checked ? [...f.insurerIds, i.id] : f.insurerIds.filter((x) => x !== i.id))} />
                {i.companyName}
              </label>
            )
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.soft} onClick={onDone}>
          Cancel
        </button>
        <button type="button" className={btn.primary} onClick={() => attempt(notify, () => InsuranceEngineService.saveTpa(f), `${f.name || "TPA"} saved.`) && onDone()}>
          Save TPA
        </button>
      </div>
    </div>
  )
}

function PackagesSection({ m, notify }: { m: M ;notify: Notify }) {
  const [edit, setEdit] = useState<PackageMaster | null>(null)
  const [q, setQ] = useState("")
  const rows = m.packages.filter((p) => !q.trim() || `${p.code} ${p.procedureName} ${p.department}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
      {edit && (
        <Modal wide title={edit.id ? `Edit package ${edit.code}` : "Create package"} onClose={() => setEdit(null)}>
          <PackageForm initial={edit} notify={notify} onDone={() => (setEdit(null), m.reload())} />
        </Modal>
      )}
      <Card
        emoji=""
        title="Packages"
        subtitle={`${m.packages.length} packages`}
        pad={false}
        actions={
          <div className="flex gap-2">
            <input className={`${fieldBase} w-48`} placeholder="Search packages…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search packages" />
            <button type="button" className={btn.primary} onClick={() => setEdit(blankPackage())}>
              <Plus size={13} /> Package
            </button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <Empty emoji="" title="No packages" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((p) => {
              const rules = InsuranceEngineService.rulesForPackage(p)
              const set = p.pricingRuleSetId ? m.ruleSets.find((x) => x.id === p.pricingRuleSetId) : undefined
              return (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] text-slate-900">
                        <span className="tabular-nums text-blue-700">{p.code}</span> {p.procedureName}
                      </div>
                      <div className="text-[11.5px] text-slate-500">
                        {p.department} · {inr(p.basePrice)} + GST {p.applicableGstRate}% · {set ? `rule set “${set.name}”` : "own rules"} {rules.map((r) => `${r.discountPercentage}%`).join(" / ")}
                        {p.applicableInsurerIds?.length ? ` · ${p.applicableInsurerIds.length} insurer(s)` : " · all insurers"}
                      </div>
                      <div className="text-[12.5px] text-slate-600 mt-1">
                        Includes: {p.includedComponents.join(", ") || "—"}
                        {p.excludedComponents.length ? <span className="text-slate-400"> · Excludes: {p.excludedComponents.join(", ")}</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusTag(p.status)}
                      {editBtn(() => setEdit(p))}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <div className="space-y-4">
        <PackageCalculator packages={m.packages} />
        <div className="bg-white border border-slate-200 rounded-[8px] px-4 py-3 text-[12px] text-slate-600 flex gap-2">
          <Calculator size={15} className="text-blue-600 shrink-0 mt-0.5" />
          Pre-auth and billing use these same prices and rules. A change applies to pre-auths prepared after it is saved; submitted ones keep the price they were sent with.
        </div>
      </div>
    </div>
  )
}

const blankRuleSet = (): PricingRuleSet => ({
  id: "",
  name: "",
  category: "",
  rules: [
    { sequenceOrder: 1, discountPercentage: 100, description: "Primary procedure" },
    { sequenceOrder: 2, discountPercentage: 50, description: "Second procedure" },
    { sequenceOrder: 3, discountPercentage: 25, description: "Third and subsequent" },
  ],
  status: "Active",
})

function PricingSection({ m, notify }: { m: M ;notify: Notify }) {
  const [edit, setEdit] = useState<PricingRuleSet | null>(null)
  return (
    <>
      {edit && (
        <Modal wide title={edit.id ? `Edit ${edit.name}` : "New pricing rule"} onClose={() => setEdit(null)}>
          <RuleSetForm initial={edit} notify={notify} onDone={() => (setEdit(null), m.reload())} />
        </Modal>
      )}
      <div className="flex justify-end">
        <button type="button" className={btn.primary} onClick={() => setEdit(blankRuleSet())}>
          <Plus size={13} /> Pricing rule
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {m.ruleSets.map((rs) => {
          const used = m.packages.filter((p) => p.pricingRuleSetId === rs.id)
          return (
            <Card key={rs.id} emoji="" title={rs.name} subtitle={`Procedure category: ${rs.category || "—"}`} actions={<div className="flex gap-2 items-center">{statusTag(rs.status)}{editBtn(() => setEdit(rs))}</div>}>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[12px] font-medium text-slate-500 border-b border-slate-100">
                    <th className="py-1.5 text-left">Sequence</th>
                    <th className="py-1.5 text-left">Rate</th>
                    <th className="py-1.5 text-left">Applies to</th>
                  </tr>
                </thead>
                <tbody>
                  {rs.rules.map((r) => (
                    <tr key={r.sequenceOrder} className="border-b border-slate-100">
                      <td className="py-1.5 font-semibold">{["1st", "2nd", "3rd"][r.sequenceOrder - 1] ?? `${r.sequenceOrder}th`}</td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-100">
                            <div className="h-full bg-blue-600" style={{ width: `${r.discountPercentage}%` }} />
                          </div>
                          <span className="tabular-nums font-semibold">{r.discountPercentage}%</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-slate-600">{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[11.5px] text-slate-500 mt-2">
                {used.length ? `Used by ${used.map((p) => p.code).join(", ")}` : "Not used by any package yet — pick it on a package's form."}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

function RuleSetForm({ initial, notify, onDone }: { initial: PricingRuleSet ;notify: Notify ;onDone: () => void }) {
  const [f, setF] = useState(initial)
  const setRule = (i: number, patch: Partial<PricingRuleSet["rules"][number]>) => setF((x) => ({ ...x, rules: x.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Rule name *" span={2}>
          <input className={fieldCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Multiple surgery — standard" />
        </Field>
        <Field label="Procedure category">
          <input className={fieldCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="General Surgery" />
        </Field>
      </div>
      <table className="w-full text-[12.5px] border border-slate-100">
        <thead>
          <tr className="bg-slate-50 text-[12px] font-medium text-slate-500">
            <th className="px-2 py-1.5 text-left w-24">Sequence</th>
            <th className="px-2 py-1.5 text-left w-28">Rate %</th>
            <th className="px-2 py-1.5 text-left">Description</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {f.rules.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-2 py-1">
                <input className={fieldCls} type="number" min={1} value={r.sequenceOrder} onChange={(e) => setRule(i, { sequenceOrder: Math.max(1, Number(e.target.value) || 1) })} aria-label="Sequence" />
              </td>
              <td className="px-2 py-1">
                <input className={fieldCls} type="number" min={0} max={100} value={r.discountPercentage} onChange={(e) => setRule(i, { discountPercentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Rate" />
              </td>
              <td className="px-2 py-1">
                <input className={fieldCls} value={r.description} onChange={(e) => setRule(i, { description: e.target.value })} aria-label="Description" />
              </td>
              <td className="px-2 py-1 text-center">
                <button type="button" aria-label="Remove rule" className="text-rose-600 cursor-pointer" onClick={() => setF({ ...f, rules: f.rules.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between gap-2">
        <button type="button" className={btn.plain} onClick={() => setF({ ...f, rules: [...f.rules, { sequenceOrder: f.rules.length + 1, discountPercentage: 25, description: "" }] })}>
          <Plus size={13} /> Add rule
        </button>
        <div className="flex gap-2">
          <select className={`${fieldBase} w-auto`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "Active" | "Inactive" })} aria-label="Status">
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <button type="button" className={btn.soft} onClick={onDone}>
            Cancel
          </button>
          <button type="button" className={btn.primary} onClick={() => attempt(notify, () => InsuranceEngineService.savePricingRuleSet(f), `${f.name || "Rule"} saved.`) && onDone()}>
            Save rule
          </button>
        </div>
      </div>
    </div>
  )
}

const STAGES: DocumentRule["stage"][] = ["Pre-Auth", "Discharge", "Query", "Settlement"]
const ENCOUNTERS: ClaimEncounterType[] = ["IP", "ER", "OT", "ICU"]
const CATEGORIES: DocumentCategory[] = ["Patient", "Insurance", "Pre-Auth", "Clinical", "Billing", "Discharge", "Query", "Settlement"]
const blankDocRule = (stage: DocumentRule["stage"]): DocumentRule => ({ id: "", documentType: "", category: stage === "Discharge" ? "Discharge" : stage === "Pre-Auth" ? "Clinical" : stage, stage, mandatory: true, encounterTypes: [], insurerIds: [], status: "Active" })

function DocRulesSection({ m, notify }: { m: M ;notify: Notify }) {
  const [edit, setEdit] = useState<DocumentRule | null>(null)
  const insurerName = (id: string) => m.insurers.find((i) => i.id === id)?.companyName ?? id
  return (
    <>
      {edit && (
        <Modal title={edit.id ? "Edit document rule" : "New document rule"} onClose={() => setEdit(null)}>
          <DocRuleForm initial={edit} insurers={m.insurers} notify={notify} onDone={() => (setEdit(null), m.reload())} />
        </Modal>
      )}
      <div className="px-4 py-3 bg-blue-50 border border-blue-200 text-[12.5px] text-blue-900">
         These hospital-wide rules build every case's checklist. Each insurer's own list (Insurance Companies) is added on top, and the same document is never asked for twice.
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {STAGES.map((st) => {
          const rows = m.docRules.filter((d) => d.stage === st)
          return (
            <Card
              key={st}
              emoji={{ "Pre-Auth": "", Discharge: "", Query: "", Settlement: "" }[st]}
              title={`${st} documents`}
              subtitle={`${rows.filter((d) => d.mandatory && d.status === "Active").length} mandatory`}
              pad={false}
              actions={
                <button type="button" className={btn.plain} onClick={() => setEdit(blankDocRule(st))}>
                  <Plus size={13} /> Rule
                </button>
              }
            >
              {rows.length === 0 ? (
                <Empty title="No rules at this stage" />
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead>{headRow(["Document", "Required", "Applies to", ""])}</thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} className={`border-b border-slate-100 ${d.status === "Inactive" ? "opacity-50" : ""}`}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">{d.documentType}</div>
                          <div className="text-[11px] text-slate-500">{d.category}</div>
                        </td>
                        <td className="px-3 py-2">{d.mandatory ? <Tag tone="rose">Mandatory</Tag> : <Tag>Optional</Tag>}</td>
                        <td className="px-3 py-2 text-[11.5px] text-slate-600">
                          {d.encounterTypes.length ? d.encounterTypes.join(", ") : "All encounters"}
                          {d.insurerIds.length ? ` · ${d.insurerIds.map(insurerName).join(", ")}` : ""}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          {editBtn(() => setEdit(d))}
                          <button
                            type="button"
                            aria-label={`Delete ${d.documentType}`}
                            className="ml-1 p-1.5 text-slate-400 hover:text-rose-700 cursor-pointer"
                            onClick={() => attempt(notify, () => InsuranceEngineService.deleteDocumentRule(d.id), `${d.documentType} removed.`) && m.reload()}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}

function DocRuleForm({ initial, insurers, notify, onDone }: { initial: DocumentRule ;insurers: InsuranceCompanyConfig[] ;notify: Notify ;onDone: () => void }) {
  const [f, setF] = useState(initial)
  const set = <K extends keyof DocumentRule>(k: K, v: DocumentRule[K]) => setF((x) => ({ ...x, [k]: v }))
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Document *" span={2}>
          <input className={fieldCls} value={f.documentType} onChange={(e) => set("documentType", e.target.value)} placeholder="e.g. Implant invoice & sticker" />
        </Field>
        <Field label="Stage">
          <select className={fieldCls} value={f.stage} onChange={(e) => set("stage", e.target.value as DocumentRule["stage"])}>
            {STAGES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select className={fieldCls} value={f.category} onChange={(e) => set("category", e.target.value as DocumentCategory)}>
            {CATEGORIES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer">
          <input type="checkbox" className="accent-blue-600" checked={f.mandatory} onChange={(e) => set("mandatory", e.target.checked)} /> Mandatory
        </label>
        <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer ml-4">
          <input type="checkbox" className="accent-blue-600" checked={f.status === "Active"} onChange={(e) => set("status", e.target.checked ? "Active" : "Inactive")} /> Active
        </label>
      </div>
      <div>
        <div className="text-[12px] font-medium text-slate-500 mb-1.5">Encounter types — none ticked means all</div>
        <div className="flex flex-wrap gap-2">
          {ENCOUNTERS.map((e) => (
            <label key={e} className={`inline-flex items-center gap-2 px-2.5 h-8 border text-[12px] cursor-pointer ${f.encounterTypes.includes(e) ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <input type="checkbox" className="accent-blue-600" checked={f.encounterTypes.includes(e)} onChange={() => set("encounterTypes", toggle(f.encounterTypes, e))} />
              {e}
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[12px] font-medium text-slate-500 mb-1.5">Insurers — none ticked means all</div>
        <div className="flex flex-wrap gap-2">
          {insurers.map((i) => (
            <label key={i.id} className={`inline-flex items-center gap-2 px-2.5 h-8 border text-[12px] cursor-pointer ${f.insurerIds.includes(i.id) ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <input type="checkbox" className="accent-blue-600" checked={f.insurerIds.includes(i.id)} onChange={() => set("insurerIds", toggle(f.insurerIds, i.id))} />
              {i.companyName}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.soft} onClick={onDone}>
          Cancel
        </button>
        <button type="button" className={btn.primary} onClick={() => attempt(notify, () => InsuranceEngineService.saveDocumentRule(f), "Document rule saved.") && onDone()}>
          Save rule
        </button>
      </div>
    </div>
  )
}

function SopRulesSection() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCat, setSelectedCat] = useState("all")

  const filteredCategories = DEPT_SOP_DATA.map((cat) => {
    const rules = cat.rules.filter(
      (r) =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.details.some((d) => d.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    return { ...cat, rules }
  }).filter((cat) => (selectedCat === "all" || cat.id === selectedCat) && cat.rules.length > 0)

  return (
    <div className="space-y-5">
      {/* SOP Section Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-none p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="text-emerald-400" size={20} />
            <h3 className="text-base font-extrabold tracking-tight">Insurance Department Operating Guidelines &amp; Duty Handover SOPs</h3>
            <span className="px-2.5 py-0.5 rounded-none text-[10.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              Department Master Standard
            </span>
          </div>
          <p className="text-xs text-blue-200">
            Standard operating procedures for room rent capping, cashless intake mandates, pre-auth SLAs, and leave coverage duty protocols.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter rules &amp; SLAs…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 h-8.5 text-xs bg-white/10 border border-white/20 rounded-none text-white placeholder-blue-200/60 focus:bg-white focus:text-slate-900 focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Rules Content */}
      <div className="space-y-6">
        {filteredCategories.map((cat) => {
          const Icon = cat.icon
          return (
            <div key={cat.id} className="bg-white border border-slate-200/90 rounded-none p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Icon size={16} />
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-900">{cat.title}</h4>
                </div>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-none border border-blue-100">
                  {cat.badge}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cat.rules.map((rule) => (
                  <div key={rule.id} className="p-4 rounded-none border border-slate-200/80 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        {rule.title}
                      </h5>
                      {rule.tag && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                          {rule.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 font-medium">{rule.summary}</p>
                    <ul className="space-y-1 pt-1">
                      {rule.details.map((d, idx) => (
                        <li key={idx} className="text-[11.5px] text-slate-700 flex items-start gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
