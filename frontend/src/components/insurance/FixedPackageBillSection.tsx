import React, { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Trash2, Printer, Save, FileText, Upload } from "lucide-react"
import { inr, type Notify } from "./ui"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import type { ComprehensiveClaimRecord, FixedPackageBill, FixedPackageSurgeryLine } from "../../types/insurance"

const STATUSES: FixedPackageBill["status"][] = ["Draft", "Verified", "Submitted"]

/** Build priced surgery lines from an ordered list of package codes. */
function priceLines(codes: string[]): FixedPackageSurgeryLine[] {
  return E.priceProcedures(codes).map((l) => ({
    sequence: l.sequence,
    packageCode: l.packageCode,
    procedureName: l.procedureName,
    ratePercent: l.ratePercent,
    baseAmount: l.baseAmount,
    amount: l.amount,
  }))
}

/** A fresh bill auto-filled from the insurance case. */
function billFromCase(c: ComprehensiveClaimRecord): FixedPackageBill {
  return {
    id: "",
    caseId: c.id,
    patientName: c.patientName || "",
    panNo: "",
    idNo: c.policy?.memberId || "",
    insuranceCompany: c.policy?.insurerName || "",
    claimNo: c.id || "",
    admissionDate: c.admissionDate || "",
    dischargeDate: c.dischargeDate || "",
    packageCode: "",
    procedureName: "",
    packagePrice: 0,
    gstRate: 0,
    surgeries: [],
    packageSubtotal: 0,
    gstAmount: 0,
    totalAmount: 0,
    creditBillingSignedBy: "",
    creditBillingDate: "",
    patientSignedBy: "",
    patientSignedDate: "",
    status: "Draft",
    createdAt: "",
    updatedAt: "",
  }
}

// ── small document-form primitives (PDF look) ────────────────────────────────
function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-slate-100 border-l-4 border-slate-700 px-3 py-2">
      <h5 className="text-[11px] font-bold tracking-wider uppercase text-slate-700">{children}</h5>
    </div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-transparent text-[13px] font-medium text-slate-900 placeholder:text-slate-300 focus:outline-none border-b border-dashed border-slate-300 focus:border-teal-500 pb-0.5"

// Click-to-upload or paste a signature image; the image replaces the drop area.
function SignatureField({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const readFile = (file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : undefined)
    reader.readAsDataURL(file)
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"))
    if (item) { e.preventDefault(); readFile(item.getAsFile()) }
  }
  if (value) {
    return (
      <div className="flex items-center gap-3">
        <img src={value} alt="Signature" className="h-12 max-w-[180px] object-contain border border-slate-200 rounded bg-white" />
        <div className="flex flex-col gap-0.5">
          <button type="button" onClick={() => inputRef.current?.click()} className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer">Replace</button>
          <button type="button" onClick={() => onChange(undefined)} className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer">Remove</button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
      </div>
    )
  }
  return (
    <div
      tabIndex={0}
      onPaste={onPaste}
      onClick={() => inputRef.current?.click()}
      className="border border-dashed border-slate-300 rounded-md px-3 py-2.5 text-[11.5px] text-slate-400 hover:border-teal-400 focus:border-teal-500 focus:outline-none cursor-pointer flex items-center gap-1.5"
    >
      <Upload size={13} /> Click to upload or paste signature image
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
    </div>
  )
}

export default function FixedPackageBillSection({ c, notify }: { c: ComprehensiveClaimRecord; notify: Notify }) {
  const packages = useMemo(() => E.getPackages().filter((p) => p.status === "Active"), [])
  const [form, setForm] = useState<FixedPackageBill>(() => E.getFixedPackageBillForCase(c.id) ?? billFromCase(c))
  const [codes, setCodes] = useState<string[]>(() => (E.getFixedPackageBillForCase(c.id)?.surgeries ?? []).map((s) => s.packageCode))
  const [addCode, setAddCode] = useState("")

  // Reload if the stored bill changes (e.g. another tab) or the case switches.
  useEffect(() => {
    const load = () => {
      const existing = E.getFixedPackageBillForCase(c.id)
      if (existing) { setForm(existing); setCodes(existing.surgeries.map((s) => s.packageCode)) }
    }
    return E.subscribe(load)
  }, [c.id])

  // The surgery lines follow the package rules, but the primary row honours the
  // (editable) package code, procedure name and price typed into Package details.
  // Amounts are computed from the package rules, but any row's amount can be
  // overridden by hand (keyed by sequence number); the override then wins.
  const [amountOverride, setAmountOverride] = useState<Record<number, number>>({})
  const surgeries = useMemo(() => {
    const lines = priceLines(codes)
    if (lines.length) {
      const base = form.packagePrice > 0 ? form.packagePrice : lines[0].baseAmount
      lines[0] = {
        ...lines[0],
        packageCode: form.packageCode || lines[0].packageCode,
        procedureName: form.procedureName || lines[0].procedureName,
        baseAmount: base,
        amount: Math.round((base * lines[0].ratePercent) / 100),
      }
    }
    return lines.map((l) => (amountOverride[l.sequence] != null ? { ...l, amount: amountOverride[l.sequence] } : l))
  }, [codes, form.packageCode, form.procedureName, form.packagePrice, amountOverride])
  const packageSubtotal = surgeries.reduce((a, s) => a + s.amount, 0)
  const gstAmount = Math.round((packageSubtotal * (form.gstRate || 0)) / 100)
  const totalAmount = packageSubtotal + gstAmount

  const set = <K extends keyof FixedPackageBill>(k: K, v: FixedPackageBill[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Choosing the package code fills the procedure, price and GST, and makes it
  // the first (primary) surgery — all still editable afterwards.
  function selectPrimary(code: string) {
    const p = packages.find((x) => x.code === code)
    setForm((f) => ({
      ...f,
      packageCode: code,
      procedureName: p?.procedureName ?? f.procedureName,
      packagePrice: p?.basePrice ?? f.packagePrice,
      gstRate: f.gstRate || (p?.applicableGstRate ?? 0),
    }))
    setCodes((prev) => (prev.length ? [code, ...prev.slice(1)] : [code]))
  }

  function addSurgery() {
    if (!addCode) return
    setCodes([...codes, addCode])
    setAddCode("")
  }

  function removeSurgery(i: number) {
    const next = codes.filter((_, idx) => idx !== i)
    setCodes(next)
    setAmountOverride({}) // sequences renumber — drop manual amounts to stay in sync
    if (i === 0) {
      const p = next[0] ? packages.find((x) => x.code === next[0]) : undefined
      setForm((f) => ({ ...f, packageCode: p?.code ?? "", procedureName: p?.procedureName ?? "", packagePrice: p?.basePrice ?? 0 }))
    }
  }

  function refetchFromCase() {
    const base = billFromCase(c)
    setForm((f) => ({ ...f, patientName: base.patientName, idNo: base.idNo, insuranceCompany: base.insuranceCompany, claimNo: base.claimNo, admissionDate: base.admissionDate, dischargeDate: base.dischargeDate }))
    notify("Patient & insurance details re-fetched from the case", "success")
  }

  function save() {
    try {
      const saved = E.saveFixedPackageBill({ ...form, surgeries, packageSubtotal, gstAmount, totalAmount })
      setForm(saved)
      setCodes(saved.surgeries.map((s) => s.packageCode))
      notify(`Fixed package bill ${saved.id} saved`, "success")
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save the fixed package bill", "error")
    }
  }

  // Print ONLY this fixed package bill, as its own standalone document, built
  // from the current form values (so it never depends on the page around it).
  function buildPrintHtml(): string {
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string))
    const d = (iso?: string) => (iso ? iso.split("-").reverse().join(" / ") : "—")
    const row = (label: string, value: string) => `<td class="cell"><div class="lbl">${label}</div><div class="val">${value}</div></td>`
    const surgeryRows = surgeries.length
      ? surgeries.map((s) => `<tr><td>${String(s.sequence).padStart(2, "0")} &middot; <b>${esc(s.packageCode)}</b> ${esc(s.procedureName)}</td><td class="r">${s.ratePercent}%</td><td class="r">${inr(s.amount)}</td></tr>`).join("")
      : `<tr><td colspan="3" class="muted">No surgeries added.</td></tr>`
    return `<!doctype html><html><head><meta charset="utf-8"><title>Fixed Package Bill ${esc(form.id || "")}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; background: #fff; }
  .doc { max-width: 820px; margin: 0 auto; border: 1px solid #334155; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 20px; border-bottom: 2px solid #334155; }
  .title { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
  .sub { font-size: 11px; color: #64748b; margin-top: 3px; }
  .meta { text-align: right; font-size: 11px; }
  .meta .k { color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta .v { color: #334155; font-weight: 600; margin-bottom: 6px; }
  .bar { background: #f1f5f9; border-left: 4px solid #334155; padding: 7px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #334155; }
  table { width: 100%; border-collapse: collapse; }
  .grid td.cell { border: 1px solid #e2e8f0; padding: 8px 12px; width: 50%; vertical-align: top; }
  .lbl { font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
  .val { font-size: 13px; font-weight: 600; }
  .sur th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; text-align: left; padding: 7px 12px; }
  .sur td { padding: 8px 12px; border-top: 1px solid #e2e8f0; font-size: 12.5px; }
  .sur .r { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #94a3b8; text-align: center; }
  .tot td { padding: 7px 12px; text-align: right; font-size: 12.5px; }
  .tot .grand { font-weight: 800; font-size: 15px; color: #0f766e; border-top: 2px solid #cbd5e1; }
  .status { background: #1e293b; color: #e2e8f0; padding: 10px 20px; font-size: 11px; display: flex; justify-content: space-between; }
  .pill { background: #0d9488; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; }
</style></head>
<body><div class="doc">
  <div class="head">
    <div><div class="title">FIXED PACKAGE</div><div class="sub">Hospital fixed-package billing &amp; insurance record</div></div>
    <div class="meta"><div class="k">Form type</div><div class="v">Insurance / Billing</div><div class="k">Form ID</div><div class="v">${esc(form.id || "FP-—")}</div></div>
  </div>
  <div class="bar">Package details</div>
  <table class="grid"><tr>${row("Package code", esc(form.packageCode) || "—")}${row("Procedure", esc(form.procedureName) || "—")}</tr>
  <tr>${row("Package price (₹, before GST)", form.packagePrice ? inr(form.packagePrice) : "—")}${row("Hospital GST %", `${form.gstRate || 0}%`)}</tr></table>
  <div class="bar">Patient &amp; insurance</div>
  <table class="grid"><tr>${row("Patient name", esc(form.patientName) || "—")}${row("PAN no.", esc(form.panNo) || "—")}</tr>
  <tr>${row("ID no. (member / policy)", esc(form.idNo) || "—")}${row("Insurance company", esc(form.insuranceCompany) || "—")}</tr>
  <tr>${row("Claim no.", esc(form.claimNo) || "—")}${row("&nbsp;", "")}</tr>
  <tr>${row("Date of admission", d(form.admissionDate))}${row("Date of discharge", d(form.dischargeDate))}</tr></table>
  <div class="bar">Surgery pricing</div>
  <table class="sur"><thead><tr><th>Surgery sequence</th><th style="text-align:right">Package rate</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${surgeryRows}</tbody>
  <tfoot class="tot"><tr><td colspan="2">Package subtotal</td><td>${inr(packageSubtotal)}</td></tr>
  <tr><td colspan="2">GST (${form.gstRate || 0}%)</td><td>${inr(gstAmount)}</td></tr>
  <tr><td colspan="2" class="grand">Total payable</td><td class="grand">${inr(totalAmount)}</td></tr></tfoot></table>
  <div class="bar">Authorization</div>
  <table class="grid"><tr>
    <td class="cell"><div class="lbl">Credit billing signature</div>${form.creditBillingSignatureImg ? `<img src="${form.creditBillingSignatureImg}" style="height:46px;max-width:220px;object-fit:contain" />` : ""}<div class="val" style="margin-top:4px">${esc(form.creditBillingSignedBy) || "—"}</div><div class="lbl" style="margin-top:8px">Date</div><div class="val">${d(form.creditBillingDate)}</div></td>
    <td class="cell"><div class="lbl">Patient signature</div>${form.patientSignatureImg ? `<img src="${form.patientSignatureImg}" style="height:46px;max-width:220px;object-fit:contain" />` : ""}<div class="val" style="margin-top:4px">${esc(form.patientSignedBy) || "—"}</div><div class="lbl" style="margin-top:8px">Date</div><div class="val">${d(form.patientSignedDate)}</div></td>
  </tr></table>
  <div class="status"><span>Document status: <span class="pill">${esc(form.status)}</span></span><span>Package values follow the applicable hospital / insurer agreement.</span></div>
</div></body></html>`
  }

  function printBill() {
    // Print via a hidden iframe so no extra browser tab/window is shown.
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) { iframe.remove(); notify("Could not open the print dialog", "error"); return }
    doc.open()
    doc.write(buildPrintHtml())
    doc.close()
    const win = iframe.contentWindow!
    const done = () => setTimeout(() => iframe.remove(), 800)
    win.onafterprint = done
    setTimeout(() => {
      try { win.focus(); win.print() } catch { /* ignore */ }
      done() // fallback cleanup if onafterprint never fires
    }, 300)
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
      {/* header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 mt-0.5"><FileText size={16} /></div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Fixed package billing</h4>
            <p className="text-xs text-slate-500 mt-0.5">Fixed-rate package form — patient &amp; insurance details are fetched from this claim automatically.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refetchFromCase} className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer">
            Re-fetch details
          </button>
          <button type="button" onClick={printBill} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer">
            <Printer size={13} /> Print bill
          </button>
          <button type="button" onClick={save} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-xs">
            <Save size={13} /> Save bill
          </button>
        </div>
      </div>

      {/* ── the document (PDF format) ── */}
      <div className="border border-slate-300 rounded-lg overflow-hidden">
        {/* Doc header */}
        <div className="flex items-start justify-between px-5 py-4 border-b-2 border-slate-700">
          <div>
            <div className="text-[22px] font-black tracking-tight text-slate-800 leading-none">FIXED PACKAGE</div>
            <div className="text-[11px] text-slate-500 mt-1">Hospital fixed-package billing &amp; insurance record</div>
          </div>
          <div className="text-right text-[11px]">
            <div className="text-slate-400 font-semibold uppercase tracking-wider">Form type</div>
            <div className="text-slate-700 font-medium">Insurance / Billing</div>
            <div className="text-slate-400 font-semibold uppercase tracking-wider mt-1.5">Form ID</div>
            <div className="text-slate-700 font-mono font-bold">{form.id || "FP-—"}</div>
          </div>
        </div>

        {/* Package details */}
        <SectionBar>Package details</SectionBar>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <Cell label="Package code">
            <select className={`${inputCls} cursor-pointer`} value={form.packageCode} onChange={(e) => selectPrimary(e.target.value)}>
              <option value="">— choose a package —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.code}>{p.code} — {p.procedureName}</option>
              ))}
            </select>
          </Cell>
          <Cell label="Procedure">
            <input className={inputCls} value={form.procedureName} onChange={(e) => set("procedureName", e.target.value)} placeholder="Procedure name" />
          </Cell>
          <Cell label="Package price (₹, before GST)">
            <input type="number" className={inputCls} value={form.packagePrice || ""} onChange={(e) => set("packagePrice", Number(e.target.value) || 0)} placeholder="0" />
          </Cell>
          <Cell label="Hospital GST %">
            <input type="number" className={inputCls} value={form.gstRate} onChange={(e) => set("gstRate", Number(e.target.value) || 0)} />
          </Cell>
        </div>

        {/* Patient & insurance */}
        <SectionBar>Patient &amp; insurance</SectionBar>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <Cell label="Patient name"><input className={inputCls} value={form.patientName} onChange={(e) => set("patientName", e.target.value)} /></Cell>
          <Cell label="PAN no."><input className={inputCls} value={form.panNo ?? ""} onChange={(e) => set("panNo", e.target.value)} placeholder="—" /></Cell>
          <Cell label="ID no. (member / policy)"><input className={inputCls} value={form.idNo ?? ""} onChange={(e) => set("idNo", e.target.value)} /></Cell>
          <Cell label="Insurance company"><input className={inputCls} value={form.insuranceCompany} onChange={(e) => set("insuranceCompany", e.target.value)} /></Cell>
          <Cell label="Claim no."><input className={inputCls} value={form.claimNo} onChange={(e) => set("claimNo", e.target.value)} /></Cell>
          <Cell label="&nbsp;"><span className="text-slate-300 text-[13px]">—</span></Cell>
          <Cell label="Date of admission"><input type="date" className={inputCls} value={form.admissionDate ?? ""} onChange={(e) => set("admissionDate", e.target.value)} /></Cell>
          <Cell label="Date of discharge"><input type="date" className={inputCls} value={form.dischargeDate ?? ""} onChange={(e) => set("dischargeDate", e.target.value)} /></Cell>
        </div>

        {/* Surgery pricing */}
        <SectionBar>Surgery pricing</SectionBar>
        <div className="px-3 py-3 bg-slate-50/60 flex flex-wrap items-end gap-2 border-b border-slate-200">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Add another surgery (optional — 2nd at 50%, 3rd at 25%)</div>
            <select className="w-full h-9 px-2.5 rounded-md border border-slate-300 text-[12.5px] bg-white focus:outline-none focus:border-teal-500" value={addCode} onChange={(e) => setAddCode(e.target.value)}>
              <option value="">Choose a package…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.code}>{p.code} — {p.procedureName}</option>
              ))}
            </select>
          </div>
          <button type="button" disabled={!addCode} onClick={addSurgery} className="h-9 px-3.5 rounded-md bg-slate-700 hover:bg-slate-800 text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            <Plus size={14} /> Add
          </button>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-[10px] uppercase tracking-wider">
              <th className="text-left py-2 px-3 font-bold">Surgery sequence</th>
              <th className="text-right py-2 px-3 font-bold">Package rate</th>
              <th className="text-right py-2 px-3 font-bold">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {surgeries.length === 0 ? (
              <tr><td colSpan={4} className="py-6 text-center text-slate-400 text-[12px]">Add at least one surgery to price the package.</td></tr>
            ) : surgeries.map((s, i) => (
              <tr key={i} className="border-t border-slate-200">
                <td className="py-2.5 px-3">
                  <span className="font-mono font-bold text-slate-700 mr-2">{String(s.sequence).padStart(2, "0")}</span>
                  <span className="text-slate-800">{s.packageCode} · {s.procedureName}</span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-600">{s.ratePercent}%</td>
                <td className="py-2.5 px-3 text-right">
                  <div className="inline-flex items-center gap-1 justify-end">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      value={s.amount}
                      onChange={(e) => setAmountOverride((m) => ({ ...m, [s.sequence]: Number(e.target.value) || 0 }))}
                      className="w-24 text-right font-mono font-semibold text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-teal-500 pb-0.5"
                    />
                  </div>
                </td>
                <td className="py-2.5 px-2 text-right">
                  <button type="button" onClick={() => removeSurgery(i)} className="text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
          {surgeries.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 text-slate-600">
                <td className="py-2 px-3 text-right" colSpan={2}>Package subtotal</td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">{inr(packageSubtotal)}</td><td />
              </tr>
              <tr className="text-slate-600">
                <td className="py-2 px-3 text-right" colSpan={2}>GST ({form.gstRate || 0}%)</td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">{inr(gstAmount)}</td><td />
              </tr>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="py-2.5 px-3 text-right font-bold text-slate-900" colSpan={2}>Total payable</td>
                <td className="py-2.5 px-3 text-right font-mono font-black text-teal-700 text-[15px]">{inr(totalAmount)}</td><td />
              </tr>
            </tfoot>
          )}
        </table>

        {/* Authorization */}
        <SectionBar>Authorization</SectionBar>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <Cell label="Credit billing — signature"><SignatureField value={form.creditBillingSignatureImg} onChange={(v) => set("creditBillingSignatureImg", v)} /></Cell>
          <Cell label="Patient — signature"><SignatureField value={form.patientSignatureImg} onChange={(v) => set("patientSignatureImg", v)} /></Cell>
          <Cell label="Credit billing — signed by"><input className={inputCls} value={form.creditBillingSignedBy ?? ""} onChange={(e) => set("creditBillingSignedBy", e.target.value)} /></Cell>
          <Cell label="Patient — signed by"><input className={inputCls} value={form.patientSignedBy ?? ""} onChange={(e) => set("patientSignedBy", e.target.value)} /></Cell>
          <Cell label="Date"><input type="date" className={inputCls} value={form.creditBillingDate ?? ""} onChange={(e) => set("creditBillingDate", e.target.value)} /></Cell>
          <Cell label="Date"><input type="date" className={inputCls} value={form.patientSignedDate ?? ""} onChange={(e) => set("patientSignedDate", e.target.value)} /></Cell>
        </div>

        {/* Document status */}
        <div className="bg-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document status</span>
            <div className="flex items-center gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("status", s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${form.status === s ? "bg-teal-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
            <FileText size={12} />
            <span>Package values follow the applicable hospital / insurer agreement.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
