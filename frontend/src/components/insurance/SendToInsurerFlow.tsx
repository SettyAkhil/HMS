import React, { useMemo, useState, useRef } from "react"
import { X, Send, Receipt, Pill, Package as PackageIcon, FileCheck2, FileText, Check, Building2, Upload, Trash2, Paperclip } from "lucide-react"
import { inr, type Notify } from "./ui"
import { InsuranceEngineService as E } from "../../services/insuranceDb"
import { PharmacyDatabase } from "../../services/pharmacyDb"
import { BillingDatabase } from "../../services/billingDb"
import type { ComprehensiveClaimRecord } from "../../types/insurance"

type BillItem = { id: string; label: string; sub: string; amount: number; icon: React.ReactNode }

// A compact, selectable row.
function Row({ checked, icon, label, sub, meta, onClick }: { checked: boolean; icon: React.ReactNode; label: string; sub?: string; meta?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${checked ? "bg-blue-50/70 border-blue-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>{checked && <Check size={11} className="text-white" />}</span>
      <span className={checked ? "text-blue-600" : "text-slate-400"}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-semibold text-slate-800 truncate">{label}</span>
        {sub && <span className="block text-[11px] text-slate-400 truncate">{sub}</span>}
      </span>
      {meta && <span className="text-[11.5px] font-mono text-slate-600 shrink-0">{meta}</span>}
    </button>
  )
}

export default function SendToInsurerFlow({ c, notify, onClose, onSent }: { c: ComprehensiveClaimRecord; notify: Notify; onClose: () => void; onSent?: () => void }) {
  const draft = useMemo(() => E.mailDraft(c, "Claim"), [c])
  const verifiedDocs = useMemo(() => draft.documents.filter((d) => d.isUploaded && d.status === "Verified"), [draft])

  const bills = useMemo<BillItem[]>(() => {
    const out: BillItem[] = []
    try {
      const fb = E.getFixedPackageBillForCase(c.id)
      if (fb && fb.packageCode) out.push({ id: `fixed:${fb.id}`, label: `Fixed Package Bill ${fb.id}`, sub: `${fb.packageCode} · ${fb.procedureName}`, amount: fb.totalAmount, icon: <PackageIcon size={15} /> })
    } catch { /* ignore */ }
    try {
      const pName = (c.patientName || "").toLowerCase().trim()
      const pId = (c.patientId || "").toLowerCase().trim()
      const uhid = (c.policy?.memberId || "").toLowerCase().trim()
      PharmacyDatabase.getBills()
        .filter((b) => {
          const bName = (b.patientName || "").toLowerCase().trim()
          return (pName && bName.includes(pName)) || (pId && (b.patientId || "").toLowerCase().trim() === pId) || (uhid && (b.uhid || "").toLowerCase().trim() === uhid)
        })
        .forEach((b) => out.push({ id: `pharm:${b.id}`, label: `Pharmacy Bill ${b.billNumber}`, sub: "Pharmacy", amount: b.totalAmount || 0, icon: <Pill size={15} /> }))
    } catch { /* ignore */ }
    try {
      const hb = c.billingClaimId ? BillingDatabase.getClaimById(c.billingClaimId) : undefined
      if (hb) out.push({ id: `hosp:${hb.id || hb.invoiceNo}`, label: `Reception / Hospital Bill ${hb.invoiceNo}`, sub: "Hospital charges", amount: hb.totalAmount || 0, icon: <Receipt size={15} /> })
    } catch { /* ignore */ }
    return out
  }, [c])

  const [to, setTo] = useState(draft.to)
  const [cc, setCc] = useState("")
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [billSel, setBillSel] = useState<string[]>(bills.map((b) => b.id))
  const [docSel, setDocSel] = useState<string[]>(verifiedDocs.map((d) => d.id))
  const [discharge, setDischarge] = useState(true)
  const manualFileInputRef = useRef<HTMLInputElement>(null)
  const [manualDocs, setManualDocs] = useState<{ id: string; name: string; size: string }[]>([])

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const newDocs = files.map((file, idx) => ({
      id: `manual-${Date.now()}-${idx}`,
      name: file.name,
      size: `${Math.round(file.size / 1024)} KB`
    }))
    setManualDocs((prev) => [...prev, ...newDocs])
    try {
      files.forEach((file, idx) => {
        E.uploadDocument(c.id, `DOC-MANUAL-${Date.now()}-${idx}`, file.name)
      })
    } catch { /* ignore */ }
    notify(`${files.length} manual document${files.length > 1 ? "s" : ""} attached`, "success")
    e.target.value = ""
  }

  const removeManualDoc = (id: string) => {
    setManualDocs((prev) => prev.filter((d) => d.id !== id))
    notify("Attachment removed", "success")
  }

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])

  const presetAllBills = () => { setBillSel(bills.map((b) => b.id)); setDischarge(false) }
  const presetFixedDischarge = () => { setBillSel(bills.filter((b) => b.id.startsWith("fixed:")).map((b) => b.id)); setDischarge(true) }
  const activePreset: "bills" | "fixed" | "custom" =
    bills.length && billSel.length === bills.length && !discharge ? "bills"
    : bills.filter((b) => b.id.startsWith("fixed:")).every((b) => billSel.includes(b.id)) && billSel.every((id) => id.startsWith("fixed:")) && discharge ? "fixed"
    : "custom"

  const selectedBills = bills.filter((b) => billSel.includes(b.id))
  const billsTotal = selectedBills.reduce((a, b) => a + b.amount, 0)
  const itemCount = billSel.length + docSel.length + (discharge ? 1 : 0) + manualDocs.length

  function send() {
    const extra = [
      ...selectedBills.map((b) => `${b.label} — ${inr(b.amount)}`),
      ...(discharge ? ["Discharge Summary"] : []),
      ...manualDocs.map((d) => `${d.name} (${d.size})`)
    ]
    if (!itemCount) { notify("Select at least one item to send", "error"); return }
    try {
      if (billSel.some((id) => id.startsWith("fixed:"))) {
        const fb = E.getFixedPackageBillForCase(c.id)
        if (fb) E.saveFixedPackageBill({ ...fb, status: "Submitted" })
      }
      E.sendInsurerEmail(c.id, { purpose: "General", to, cc, subject, body, attachmentIds: docSel, extraAttachments: extra })
      notify(`Sent ${itemCount} item${itemCount !== 1 ? "s" : ""} (including ${manualDocs.length} manual docs) to insurer`, "success")
      onSent?.()
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not send to insurer", "error")
    }
  }

  const presetCls = (on: boolean) => `flex-1 text-left p-3 rounded-xl border transition-colors flex items-start gap-2.5 cursor-pointer ${on ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/15" : "bg-white border-slate-200 hover:bg-slate-50"}`

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Send to insurer" className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl my-8 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <header className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0"><Send size={17} /></div>
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold text-slate-900 leading-tight">Send to insurer</h3>
            <p className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-1.5 truncate"><Building2 size={12} /> {c.patientName} · {c.id} · {c.policy?.insurerName || "—"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"><X size={17} /></button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* LEFT — what to send */}
          <div className="p-6 space-y-5 lg:border-r border-slate-100">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Quick preset</div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button type="button" onClick={presetAllBills} className={presetCls(activePreset === "bills")}>
                  <Receipt size={17} className={activePreset === "bills" ? "text-blue-600 mt-0.5" : "text-slate-400 mt-0.5"} />
                  <span><span className="block text-[12.5px] font-bold text-slate-800">All bills</span><span className="block text-[11px] text-slate-500 mt-0.5">Pharmacy + reception bills</span></span>
                </button>
                <button type="button" onClick={presetFixedDischarge} className={presetCls(activePreset === "fixed")}>
                  <PackageIcon size={17} className={activePreset === "fixed" ? "text-blue-600 mt-0.5" : "text-slate-400 mt-0.5"} />
                  <span><span className="block text-[12.5px] font-bold text-slate-800">Fixed bill + discharge</span><span className="block text-[11px] text-slate-500 mt-0.5">Fixed package + discharge summary</span></span>
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Bills</div>
              <div className="space-y-2">
                {bills.length === 0 ? (
                  <div className="text-[12px] text-slate-500 px-1 py-2">No saved bills for this case yet — save a fixed package / pharmacy / reception bill first.</div>
                ) : bills.map((b) => (
                  <Row key={b.id} checked={billSel.includes(b.id)} icon={b.icon} label={b.label} sub={b.sub} meta={inr(b.amount)} onClick={() => toggle(billSel, setBillSel, b.id)} />
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">Discharge</div>
              <Row checked={discharge} icon={<FileCheck2 size={15} />} label="Discharge summary" onClick={() => setDischarge((v) => !v)} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Verified documents</div>
                <button
                  type="button"
                  onClick={() => manualFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  <Upload size={12} /> Upload Manual File
                </button>
                <input
                  ref={manualFileInputRef}
                  type="file"
                  multiple
                  onChange={handleManualUpload}
                  className="hidden"
                />
              </div>

              {verifiedDocs.length === 0 && manualDocs.length === 0 ? (
                <div className="text-[12px] text-slate-500 px-1 py-2">No verified documents yet. Click above to upload a manual file.</div>
              ) : (
                <div className="space-y-2">
                  {verifiedDocs.map((d) => (
                    <Row key={d.id} checked={docSel.includes(d.id)} icon={<FileText size={15} />} label={d.documentType} sub={d.fileName} onClick={() => toggle(docSel, setDocSel, d.id)} />
                  ))}
                  {manualDocs.map((md) => (
                    <div key={md.id} className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-blue-300 bg-blue-50/70 text-left">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Paperclip size={14} className="text-blue-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">{md.name}</div>
                          <div className="text-[10.5px] text-blue-600 font-mono font-semibold">Manual Attachment · {md.size}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeManualDoc(md.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — the email */}
          <div className="p-6 space-y-3 bg-slate-50/40">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Email</div>
            <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-[12.5px]">
              <label className="text-slate-500 font-semibold">To</label>
              <input className="h-9 px-3 rounded-lg border border-slate-300 text-[12.5px] focus:outline-none focus:border-blue-400" value={to} onChange={(e) => setTo(e.target.value)} placeholder="claims@insurer.com" />
              <label className="text-slate-500 font-semibold">Cc</label>
              <input className="h-9 px-3 rounded-lg border border-slate-300 text-[12.5px] focus:outline-none focus:border-blue-400" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" />
              <label className="text-slate-500 font-semibold">Subject</label>
              <input className="h-9 px-3 rounded-lg border border-slate-300 text-[12.5px] focus:outline-none focus:border-blue-400" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <textarea className="w-full rounded-lg border border-slate-300 text-[12px] leading-5 p-3 focus:outline-none focus:border-blue-400 resize-none" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>

        {/* footer */}
        <footer className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[12.5px] text-slate-600">
            {itemCount === 0 ? "Nothing selected" : <><span className="font-semibold text-slate-900">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>{billsTotal > 0 && <> · <span className="font-mono font-semibold text-slate-900">{inr(billsTotal)}</span></>}</>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer">Cancel</button>
            <button type="button" disabled={itemCount === 0} onClick={send} className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-xs">
              <Send size={14} /> Send to insurer
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
