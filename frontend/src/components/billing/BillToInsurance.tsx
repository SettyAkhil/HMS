import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Building2, Lock, Pencil, ShieldCheck } from "lucide-react"
import { BillingDatabase, isCashlessEligible, type ClaimRecord } from "../../services/billingDb"
import { isBilledToInsurance, isInsured } from "../insurance/ClaimPanel"

// Billing a bill to insurance at a counter (OP, IP or Emergency).
//
// The counter decides only the money: how much of each charge the insurer
// covers and how much is the patient's co-pay (non-payable items, co-pay
// clauses). Insurer/TPA selection, KYC and pre-authorisation stay with the
// Insurance department, which receives the bill on its Claims Desk.
//
// The split stays editable until the Insurance department submits the claim;
// after that the insurer's decision governs and it is locked.

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`

type Preset = "onfile" | "full" | "copay10" | "copay20" | "custom"

/** Spread `target` over the lines in proportion; the last line absorbs rounding. */
function spread(items: ClaimRecord["items"], total: number, target: number) {
  const out: Record<string, number> = {}
  let left = Math.max(0, Math.round(target))
  items.forEach((it, i) => {
    const share =
      i === items.length - 1 ? left : Math.min(it.total, Math.round(total > 0 ? (it.total * target) / total : 0))
    const v = Math.max(0, Math.min(it.total, share))
    out[it.id] = v
    left -= v
  })
  return out
}

export default function BillToInsurance({
  claim,
  onDone,
  onError,
}: {
  claim: ClaimRecord
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const billed = isBilledToInsurance(claim)
  const editable = !billed || claim.status === "Ready" || claim.status === "Draft"
  const paid = claim.amountPaid || 0
  const maxCover = Math.max(0, claim.totalAmount - paid)

  // Cover already on the bill (an insured admission's policy terms, or the
  // split saved at hand-over). A new hand-over starts from it rather than
  // silently dropping a policy co-pay.
  const onFile = useMemo(
    () => Object.fromEntries(claim.items.map((it) => [it.id, Number(it.insuranceCovered || 0)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claim.id, billed],
  )
  const hasOnFile = Object.values(onFile).some((v) => v > 0)

  const initial = useMemo(
    () => (billed || hasOnFile ? onFile : spread(claim.items, claim.totalAmount, maxCover)),
    // Re-seed only when a different bill is opened or it is (re)billed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claim.id, billed],
  )

  const [cover, setCover] = useState<Record<string, number>>(initial)
  const startPreset: Preset = billed ? "custom" : hasOnFile ? "onfile" : "full"
  const [preset, setPreset] = useState<Preset>(startPreset)
  const [open, setOpen] = useState(!billed)
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState("")

  useEffect(() => {
    setCover(initial)
    setPreset(startPreset)
    setOpen(!billed)
    setConfirming(false)
    setNote("")
  }, [initial, billed])

  const insurance = claim.items.reduce((a, it) => a + (cover[it.id] ?? 0), 0)
  const copay = Math.max(0, claim.totalAmount - insurance)
  const dueNow = Math.max(0, copay - paid)
  const overCover = insurance > maxCover
  const valid = insurance > 0 && !overCover

  const applyPreset = (p: Preset) => {
    setPreset(p)
    setConfirming(false)
    if (p === "custom") return
    if (p === "onfile") {
      setCover(onFile)
      return
    }
    const pct = p === "copay10" ? 0.1 : p === "copay20" ? 0.2 : 0
    const target = Math.min(maxCover, Math.round(claim.totalAmount * (1 - pct)))
    setCover(spread(claim.items, claim.totalAmount, target))
  }

  const setLine = (id: string, v: number, max: number) => {
    setPreset("custom")
    setConfirming(false)
    setCover((c) => ({ ...c, [id]: Math.max(0, Math.min(max, Math.round(v || 0))) }))
  }

  const save = () => {
    try {
      if (billed) {
        BillingDatabase.setInsuranceSplit(claim.id, cover)
        onDone(`Insurance split updated: insurance ${inr(insurance)}, patient co-pay ${inr(copay)}.`)
      } else {
        BillingDatabase.billToInsurance(claim.id, { coverage: cover, note: note.trim() || undefined })
        onDone(
          dueNow > 0
            ? `${inr(insurance)} sent to the Insurance department. Collect the patient's co-pay of ${inr(dueNow)} now.`
            : `${inr(insurance)} sent to the Insurance department. The patient pays nothing now.`,
        )
      }
      setConfirming(false)
    } catch (e) {
      onError((e as Error).message || "Could not bill to insurance")
    }
  }

  // OP visits are never billed to insurance -- only admissions are.
  if (!isCashlessEligible(claim)) return null

  // Once the insurer has the claim, the counter only sees the split.
  if (billed && !editable) {
    return (
      <div className="px-5 py-3 flex items-center gap-2 text-[12px] text-slate-600 border-t border-[#E2E8F0] bg-slate-50">
        <Lock size={14} className="text-slate-400" />
        Split locked — the claim is with the insurer. Insurance {inr(insurance)} · patient {inr(copay)}.
      </div>
    )
  }

  if (billed && !open) {
    return (
      <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-t border-[#E2E8F0] bg-slate-50">
        <span className="text-[12.5px] text-slate-700">
          Split: insurance <strong className="font-mono">{inr(insurance)}</strong> · patient co-pay{" "}
          <strong className="font-mono">{inr(copay)}</strong>
        </span>
        <span className="text-[11.5px] text-slate-500">Editable until the Insurance department submits the claim.</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto px-3 h-8 bg-white border border-[#CBD5E1] hover:border-blue-600 hover:text-blue-700 text-slate-700 text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5"
        >
          <Pencil size={13} /> Edit split
        </button>
      </div>
    )
  }

  const numCls =
    "w-28 h-8 px-2 text-right font-mono text-[12.5px] bg-white border border-[#CBD5E1] focus:outline-none focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-400"

  return (
    <div className="p-5 space-y-4">
      {!billed && (
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200">
          <Building2 size={18} className="text-blue-700 mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-blue-950 leading-relaxed">
            Set how much of this bill the insurer covers. The{" "}
            <strong>Insurance department</strong> then chooses the insurer and TPA, completes KYC and
            pre-authorisation, and claims it.
            {isInsured(claim) && (
              <span className="block text-blue-800 mt-0.5">
                Insurance on file: <strong>{claim.insuranceProvider}</strong>
                {claim.policyNumber ? ` · ${claim.policyNumber}` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">Split</span>
        {(
          [
            ...(hasOnFile && !billed ? ([["onfile", "As on file"]] as const) : []),
            ["full", "Full cashless"],
            ["copay10", "Co-pay 10%"],
            ["copay20", "Co-pay 20%"],
            ["custom", "Custom"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            className={`px-3 h-8 text-[12px] font-bold border cursor-pointer transition-colors ${
              preset === id ? "bg-blue-600 border-blue-700 text-white" : "bg-white border-[#CBD5E1] text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Per-line split */}
      <div className="border border-[#E2E8F0] overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-left">Charge</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Insurance pays</th>
              <th className="px-3 py-2 text-right">Patient pays</th>
              <th className="px-3 py-2 text-center">Not covered</th>
            </tr>
          </thead>
          <tbody>
            {claim.items.map((it) => {
              const v = cover[it.id] ?? 0
              const excluded = v === 0
              return (
                <tr key={it.id} className={`border-b border-[#F1F5F9] last:border-0 ${excluded ? "bg-amber-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{it.description}</div>
                    <div className="text-[11px] text-slate-500">{it.category}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{inr(it.total)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={it.total}
                      aria-label={`Insurance share of ${it.description}`}
                      value={v}
                      onChange={(e) => setLine(it.id, Number(e.target.value), it.total)}
                      className={numCls}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-amber-900">{inr(it.total - v)}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${it.description} not covered by insurance`}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                      checked={excluded}
                      onChange={(e) => setLine(it.id, e.target.checked ? 0 : it.total, it.total)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 border border-[#E2E8F0] bg-slate-50">
        {[
          { l: "Bill total", v: claim.totalAmount, c: "text-slate-900" },
          { l: "Insurance claim", v: insurance, c: overCover ? "text-rose-700" : "text-blue-800" },
          { l: "Patient co-pay", v: copay, c: "text-amber-900" },
          { l: "Already paid", v: paid, c: "text-emerald-700" },
          { l: "Due at counter now", v: dueNow, c: dueNow > 0 ? "text-amber-900" : "text-emerald-700" },
        ].map((x) => (
          <div key={x.l} className="px-4 py-3 border-r border-b sm:border-b-0 border-[#E2E8F0] last:border-r-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{x.l}</div>
            <div className={`font-mono text-[16px] font-bold mt-0.5 ${x.c}`}>{inr(x.v)}</div>
          </div>
        ))}
      </div>

      {overCover && (
        <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-300 text-[12px] text-rose-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          The patient has already paid {inr(paid)}, so insurance can cover at most {inr(maxCover)}.
        </div>
      )}
      {!overCover && insurance === 0 && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-300 text-[12px] text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Insurance covers nothing — collect this bill as a normal patient payment instead.
        </div>
      )}

      {!billed && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for the Insurance department (optional) — e.g. cashless card verified, non-medical items excluded"
          className="w-full h-9 px-3 text-[12.5px] bg-white border border-[#CBD5E1] focus:outline-none focus:border-blue-600"
        />
      )}

      {confirming ? (
        <div className="p-4 bg-amber-50 border border-amber-300 space-y-3">
          <div className="text-[13px] text-amber-950 leading-relaxed">
            {billed ? "Update the split to" : "Send"} <strong className="font-mono">{inr(insurance)}</strong> to insurance
            {copay > 0 ? (
              <>
                {" "}— the patient's co-pay is <strong className="font-mono">{inr(copay)}</strong>
                {dueNow > 0 && (
                  <>
                    , of which <strong className="font-mono">{inr(dueNow)}</strong> is collected now
                  </>
                )}
                .
              </>
            ) : (
              " — the patient pays nothing."
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-4 h-9 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12.5px] font-bold cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              onClick={save}
              className="px-4 h-9 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white text-[12.5px] font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <ShieldCheck size={15} /> {billed ? "Save split" : "Confirm & send to Insurance"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {billed && (
            <button
              type="button"
              onClick={() => {
                setCover(initial)
                setOpen(false)
              }}
              className="px-4 h-11 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-bold cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!valid}
            className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white text-[14px] font-bold cursor-pointer transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck size={16} />
            {billed
              ? `Review changes — insurance ${inr(insurance)} · co-pay ${inr(copay)}`
              : `Bill ${inr(insurance)} to insurance${copay > 0 ? ` · co-pay ${inr(copay)}` : " · patient pays ₹0"}`}
          </button>
        </div>
      )}
    </div>
  )
}
