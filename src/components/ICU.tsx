import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Btn } from "./shared"
import { formatDateTimeIST } from "../lib/format"

import IcuFlowsheet, {
  flowsheetSummary,
  fetchDays,
  onFlowsheetSync,
  loadRecord,
  countEntries,
  syncRecordFromServer,
  appendChartRows,
  type FlowsheetDay,
  type FlowsheetRecord,
} from "./icu/IcuFlowsheet"
import {
  getPatientStayDays,
  getCurrentDateTimeFormatted,
} from "./icu/icuSeedData"
import IcuDischargeModal, {
  IcuDischargeSummarySlipModal,
  getDischargedIcuPatients,
  type IcuDischargeRecord,
} from "./icu/IcuDischargeModal"
import { deriveLiveState, acuityKey, type LiveState } from "./icu/icuLive"
import { LabOrderDatabase, type LabOrder } from "../services/labOrdersDb"
import { PharmacyDatabase, type AppPrescription } from "../services/pharmacyDb"
import { splitPrescriptionFile } from "../lib/prescriptionAI"
import { useBranding } from "./branding/DocumentBranding"
import { apiFetch } from "../lib/api"
import type { BedRecord } from "../services/bedDb"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts"

export type IcuUnitType = "MICU" | "SICU" | "CCU" | "NICU" | "PICU" | "WARD"

export type IcuPatient = {
  bed: string
  unit: string
  // ICU units only. General wards live in the Inpatient module and ER beds on
  // the Emergency page; this portal is critical care alone. "WARD" is the
  // ICU ward: critical-care beds that sit in a ward Bed Management does not
  // name as a specific unit (e.g. "Intensive Care Unit (ICU)", or an
  // ICU-type bed on a floor ward).
  unitType: IcuUnitType
  // Set on beds that come from Bed Management (/api/beds). Their occupancy is
  // owned there -- admitting, transferring and discharging happen on that
  // page -- while the clinical fields here are an ICU-side overlay.
  source?: "bed_management"
  bedId?: number
  ward?: string
  admissionId?: number | null
  admittedAt?: string | null
  bedStatus?: string
  /** Today's chart, derived; absent for an empty bed. */
  live?: LiveState
  name: string | null
  mrn: string
  age: number | null
  sex: "M" | "F" | null
  dx: string | null
  provider: string
  nurse: string
  los: string
  totalDays: number
  code: string
  vitals: {
    bp: string
    hr: string
    rr: string
    temp: string
    spo2: string
    cvp: string
  } | null
  vent: {
    mode: string
    fio2: string
    peep: string
    tv: string
    rr: string
    pip: string
  } | null
  infusions: { drug: string ;rate: string ;concentration: string }[]
  alerts: string[]
  score: { sofa: number ;apache: number ;rass: number }
  hrTrend: { t: string ;v: number }[]
  bpTrend: { t: string ;v: number }[]
  isManualCharting?: boolean
}

export type IcuMedOrderItem = {
  drug: string
  dose: string
  route: string
  freq: string
  instructions: string
}

export type IcuMedOrder = {
  items: IcuMedOrderItem[]
  urgency: "STAT" | "Routine"
  source: "DIGITAL" | "OCR"
  imageUrl?: string
  engine?: string
}

const ROUTES = ["IV", "IV infusion", "PO", "RT", "SC", "IM", "Neb", "Topical", "PR", "SL"]
const blankItem = (): IcuMedOrderItem => ({ drug: "", dose: "", route: "IV", freq: "", instructions: "" })

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/**
 * "+ New Order": medication orders for the patient in this bed. Lines are
 * typed, or read from a photographed / scanned prescription by the same
 * prescription reader the doctor portal uses. Every line stays editable, and
 * nothing is sent until the doctor submits.
 */
function PharmacyOrderModal({
  patient,
  isOpen,
  onClose,
  onSubmit,
}: {
  patient: IcuPatient
  isOpen: boolean
  onClose: () => void
  onSubmit: (order: IcuMedOrder) => Promise<void> | void
}) {
  const [items, setItems] = useState<IcuMedOrderItem[]>([blankItem()])
  const [urgency, setUrgency] = useState<"STAT" | "Routine">("STAT")
  const [scan, setScan] = useState<{ name: string ;dataUrl?: string ;engine?: string } | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setItems([blankItem()])
    setUrgency("STAT")
    setScan(null)
    setReadError(null)
    setReading(false)
    setSubmitting(false)
  }, [isOpen, patient.mrn])

  if (!isOpen) return null

  const valid = items.filter((i) => i.drug.trim())

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setReadError(null)
    let dataUrl: string | undefined
    try {
      if (file.type.startsWith("image/")) dataUrl = await readAsDataUrl(file)
    } catch {}
    setScan({ name: file.name, dataUrl })
    try {
      const split = await splitPrescriptionFile(file, file.name)
      const read = split.medications
        .filter((m) => m.name.trim())
        .map((m) => ({
          drug: [m.name, m.strength].filter(Boolean).join(" ").trim(),
          dose: m.dosage || "",
          route: m.route || "",
          freq: m.frequency || "",
          instructions: [m.duration, m.instructions].filter(Boolean).join(" · "),
        }))
      setScan({ name: file.name, dataUrl, engine: split.engine })
      if (read.length === 0) {
        setReadError(
          split.degradedReason
            ? `The prescription reader is unavailable (${split.degradedReason}). Type the medicines below.`
            : "No medicines could be read from this sheet. Type them below.",
        )
      } else {
        setItems((prev) => [...read, ...prev.filter((i) => i.drug.trim())])
      }
    } catch (e) {
      setReadError(
        `The sheet could not be read${e instanceof Error ? ` (${e.message})` : ""}. Type the medicines below.`,
      )
    } finally {
      setReading(false)
    }
  }

  const update = (idx: number, key: keyof IcuMedOrderItem, v: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: v } : it)))

  const submit = async () => {
    if (valid.length === 0) return
    setSubmitting(true)
    try {
      await onSubmit({
        items: valid.map((i) => ({ ...i, drug: i.drug.trim() })),
        urgency,
        source: scan ? "OCR" : "DIGITAL",
        imageUrl: scan?.dataUrl,
        engine: scan?.engine,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New medication order"
        className="bg-white w-full max-w-3xl shadow-xl border border-[#E2E8F0] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#EDF1F7] flex items-center gap-2">
          <span className="w-1 h-4 bg-[#1B4FD8]" />
          <h3 className="text-[13px] font-bold text-[#0F172A] flex-1">
            New medication order — {patient.name}
            <span className="text-[#64748B] font-medium">
              {" "}· {patient.bed} · MRN {patient.mrn}
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#94A3B8] hover:text-[#0F172A] text-[16px] leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3 border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5">
            <label className="text-[12px] font-semibold text-[#1B4FD8] cursor-pointer">
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  onFile(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
              Upload prescription sheet
            </label>
            <span className="text-[11.5px] text-[#64748B] flex-1 min-w-0 truncate">
              {reading
                ? `Reading ${scan?.name ?? "sheet"}…`
                : scan
                  ? `${scan.name}${scan.engine ? ` · read by ${scan.engine}` : ""} — check every line before sending`
                  : "Optional. Photographed or scanned sheets are read automatically; you can also type the lines."}
            </span>
          </div>
          {readError && (
            <div className="text-[11.5px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2">
              {readError}
            </div>
          )}

          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#64748B]">
                <th className="py-1 pr-2 w-[30%]">Drug</th>
                <th className="py-1 pr-2">Dose</th>
                <th className="py-1 pr-2">Route</th>
                <th className="py-1 pr-2">Frequency</th>
                <th className="py-1 pr-2 w-[24%]">Instructions</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className="py-1 pr-2">
                    <input className={modalInput} value={it.drug} placeholder="Drug and strength" onChange={(e) => update(idx, "drug", e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input className={modalInput} value={it.dose} placeholder="e.g. 1 g" onChange={(e) => update(idx, "dose", e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input className={modalInput} list="icu-order-routes" value={it.route} onChange={(e) => update(idx, "route", e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input className={modalInput} value={it.freq} placeholder="e.g. 8th hourly" onChange={(e) => update(idx, "freq", e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input className={modalInput} value={it.instructions} onChange={(e) => update(idx, "instructions", e.target.value)} />
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() =>
                        setItems((prev) => (prev.length === 1 ? [blankItem()] : prev.filter((_, i) => i !== idx)))
                      }
                      className="text-[#94A3B8] hover:text-[#DC2626] px-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="icu-order-routes">
            {ROUTES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, blankItem()])}
            className="text-[12px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer"
          >
            + Add line
          </button>
        </div>

        <div className="px-4 py-3 border-t border-[#EDF1F7] flex items-center gap-2">
          <span className="text-[11px] text-[#64748B] mr-1">Priority</span>
          {(["STAT", "Routine"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUrgency(u)}
              className={`px-2.5 py-1 text-[11px] font-semibold border cursor-pointer ${
                urgency === u ? "bg-slate-900 text-white border-slate-900" : "bg-white text-[#64748B] border-[#CBD5E1]"
              }`}
            >
              {u}
            </button>
          ))}
          <span className="flex-1" />
          <Btn variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" size="sm" disabled={valid.length === 0 || submitting || reading} onClick={submit}>
            {submitting ? "Sending…" : `Send to pharmacy${valid.length ? ` (${valid.length})` : ""}`}
          </Btn>
        </div>
      </div>
    </div>
  )
}

const DRIP_PRESETS: { drug: string ;concentration: string ;rate: string }[] = [
  { drug: "Norepinephrine", concentration: "8mg/250mL", rate: "0.05 mcg/kg/min" },
  { drug: "Vasopressin", concentration: "20u/100mL", rate: "0.03 u/min" },
  { drug: "Epinephrine", concentration: "4mg/250mL", rate: "0.05 mcg/kg/min" },
  { drug: "Dobutamine", concentration: "250mg/250mL", rate: "5 mcg/kg/min" },
  { drug: "Propofol", concentration: "10mg/mL", rate: "20 mcg/kg/min" },
  { drug: "Midazolam", concentration: "50mg/50mL", rate: "2 mg/hr" },
  { drug: "Fentanyl", concentration: "1000mcg/100mL", rate: "50 mcg/hr" },
  { drug: "Heparin Drip", concentration: "25,000u/250mL", rate: "1,000 u/hr" },
  { drug: "Insulin Infusion", concentration: "100u/100mL", rate: "2 u/hr" },
  { drug: "Furosemide", concentration: "100mg/100mL", rate: "10 mg/hr" },
]

const modalInput =
  "w-full border border-[#CBD5E1] rounded-none px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-blue-100"

function ModalShell({
  title,
  accent,
  onClose,
  children,
  footer,
}: {
  title: string
  accent: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white w-full max-w-md shadow-xl border border-[#E2E8F0]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#EDF1F7] flex items-center gap-2">
          <span className="w-1 h-4" style={{ backgroundColor: accent }} />
          <h3 className="text-[13px] font-bold text-[#0F172A] flex-1">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#94A3B8] hover:text-[#0F172A] text-[16px] leading-none cursor-pointer"
          >
            ×
          </button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
        <div className="px-4 py-3 border-t border-[#EDF1F7] flex justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  )
}

/** "+ Add Drip" on the Active Infusions panel. */
function AddDripModal({
  patientName,
  onClose,
  onAdd,
}: {
  patientName: string
  onClose: () => void
  onAdd: (inf: { drug: string ;rate: string ;concentration: string }) => void
}) {
  const [drug, setDrug] = useState("")
  const [concentration, setConcentration] = useState("")
  const [rate, setRate] = useState("")
  const valid = drug.trim() && rate.trim()

  const pickPreset = (name: string) => {
    setDrug(name)
    const p = DRIP_PRESETS.find((d) => d.drug === name)
    if (p) {
      setConcentration(p.concentration)
      setRate(p.rate)
    }
  }

  return (
    <ModalShell
      title={`Add Drip — ${patientName}`}
      accent="#DB2777"
      onClose={onClose}
      footer={
        <>
          <Btn variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            size="sm"
            disabled={!valid}
            onClick={() =>
              onAdd({
                drug: drug.trim(),
                rate: rate.trim(),
                concentration: concentration.trim() || "—",
              })
            }
          >
            Start Infusion
          </Btn>
        </>
      }
    >
      <label className="block">
        <span className="block text-[11px] font-semibold text-[#475569] mb-1">
          Drug *
        </span>
        <input
          autoFocus
          list="icu-drip-presets"
          className={modalInput}
          value={drug}
          placeholder="e.g. Norepinephrine"
          onChange={(e) => pickPreset(e.target.value)}
        />
        <datalist id="icu-drip-presets">
          {DRIP_PRESETS.map((d) => (
            <option key={d.drug} value={d.drug} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] font-semibold text-[#475569] mb-1">
            Concentration
          </span>
          <input
            className={modalInput}
            value={concentration}
            placeholder="e.g. 8mg/250mL"
            onChange={(e) => setConcentration(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-[#475569] mb-1">
            Rate *
          </span>
          <input
            className={modalInput}
            value={rate}
            placeholder="e.g. 0.1 mcg/kg/min"
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
      </div>
    </ModalShell>
  )
}

const CRITICAL_LAB_PANEL = [
  "Troponin I",
  "Lactic Acid",
  "ABG (Arterial Blood Gas)",
  "Complete Blood Count (CBC)",
  "Renal Function Test (RFT)",
  "Serum Electrolytes",
  "Coagulation Profile (PT/INR, APTT)",
  "Liver Function Test (LFT)",
  "Procalcitonin",
  "Blood Culture & Sensitivity",
  "Blood Sugar (RBS)",
  "D-Dimer",
]

/** "+ Order" on the Critical Labs panel -- a real lab order, billed at reception. */
function LabOrderModal({
  patient,
  onClose,
  onOrdered,
}: {
  patient: IcuPatient
  onClose: () => void
  onOrdered: (order: LabOrder) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [other, setOther] = useState("")
  const [urgency, setUrgency] = useState<"STAT" | "Routine">("STAT")
  const [notes, setNotes] = useState("")
  const tests = [
    ...picked,
    ...other
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ]

  const submit = () => {
    const order = LabOrderDatabase.createOrder({
      encounterId: `ICU-${patient.bed}`,
      umr: patient.mrn,
      patientName: patient.name || "Patient",
      age: patient.age ?? 0,
      sex: patient.sex === "F" ? "Female" : "Male",
      phone: "",
      opNumber: `ICU/${patient.bed}`,
      doctorId: patient.provider,
      doctorName: patient.provider || "ICU Physician",
      department: "ICU",
      diagnosis: patient.dx || "",
      clinicalNotes: notes.trim() || undefined,
      tests: tests.map((name) => ({ name, urgency })),
    })
    onOrdered(order)
  }

  return (
    <ModalShell
      title={`Order Labs — ${patient.name}`}
      accent="#D97706"
      onClose={onClose}
      footer={
        <>
          <Btn variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            size="sm"
            disabled={tests.length === 0}
            onClick={submit}
          >
            Place Order{tests.length ? ` (${tests.length})` : ""}
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-56 overflow-y-auto">
        {CRITICAL_LAB_PANEL.map((t) => (
          <label
            key={t}
            className="flex items-start gap-2 text-[12px] text-[#1E293B] cursor-pointer"
          >
            <input
              type="checkbox"
              className="mt-0.5 accent-[#D97706]"
              checked={picked.includes(t)}
              onChange={(e) =>
                setPicked((p) =>
                  e.target.checked ? [...p, t] : p.filter((x) => x !== t),
                )
              }
            />
            {t}
          </label>
        ))}
      </div>
      <label className="block">
        <span className="block text-[11px] font-semibold text-[#475569] mb-1">
          Other tests (comma separated)
        </span>
        <input
          className={modalInput}
          value={other}
          placeholder="e.g. Serum Magnesium, CRP"
          onChange={(e) => setOther(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[#475569]">
          Priority
        </span>
        {(["STAT", "Routine"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUrgency(u)}
            className={`px-2.5 py-1 text-[11px] font-bold border cursor-pointer ${
              urgency === u
                ? "bg-[#D97706] border-[#D97706] text-white"
                : "bg-white border-[#CBD5E1] text-[#475569] hover:border-[#D97706]"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="block text-[11px] font-semibold text-[#475569] mb-1">
          Clinical notes
        </span>
        <textarea
          rows={2}
          className={modalInput}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="text-[10.5px] text-[#64748B]">
        Sent to reception for billing (Billing → Lab Test Billing), then to the
        laboratory worklist.
      </p>
    </ModalShell>
  )
}

function MiniTrend({
  data,
  color,
  unit,
}: {
  data: { t: string ;v: number }[]
  color: string
  unit?: string
}) {
  const id = `grad-${color.replace("#", "")}`
  const values = data.map((d) => d.v)
  // Pad the domain so a flat-ish trend still reads as a line rather than a
  // stripe glued to the top of the panel.
  const pad = Math.max(
    2,
    Math.round((Math.max(...values) - Math.min(...values)) * 0.4),
  )
  return (
    <ResponsiveContainer width="100%" height={128}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#EDF1F7" vertical={false} />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 10, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[Math.min(...values) - pad, Math.max(...values) + pad]}
          tick={{ fontSize: 10, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
          width={42}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            padding: "4px 8px",
            border: "1px solid #E2E8F0",
            borderRadius: 0,
          }}
          formatter={(v) => [`${v}${unit ? ` ${unit}` : ""}`, ""]}
          labelFormatter={(l) => `${l}:00`}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={{ r: 2.5, fill: color }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Flat, square panel used across the redesigned ICU overview. */
function Panel({
  title,
  actions,
  children,
  className,
  accent,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  accent?: string
}) {
  return (
    <section
      className={`bg-white border border-[#E2E8F0] shadow-sm flex flex-col ${className ?? ""}`}
    >
      <header className="px-4 py-2.5 border-b border-[#EDF1F7] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {accent && (
            <span
              className="w-1 h-4 flex-shrink-0"
              style={{ backgroundColor: accent }}
            />
          )}
          <h3 className="text-[12.5px] font-bold text-[#1E293B] tracking-tight truncate">
            {title}
          </h3>
        </div>
        {actions}
      </header>
      <div className="p-4 flex-1">{children}</div>
    </section>
  )
}

/** Single vital reading, colour-coded against its normal range. */
function Vital({
  label,
  value,
  unit,
  state,
}: {
  label: string
  value: string
  unit?: string
  state: "ok" | "warn" | "crit"
}) {
  const tone =
    state === "crit"
      ? {
          text: "text-[#B91C1C]",
          bg: "bg-[#FEF2F2]",
          border: "border-[#FECACA]",
        }
      : state === "warn"
        ? {
            text: "text-[#B45309]",
            bg: "bg-[#FFFBEB]",
            border: "border-[#FDE68A]",
          }
        : { text: "text-[#0F172A]", bg: "bg-white", border: "border-[#E2E8F0]" }
  return (
    <div className={`border ${tone.border} ${tone.bg} px-3 py-2.5`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
        {label}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span
          className={`font-mono text-[19px] font-extrabold leading-none ${tone.text}`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[10.5px] text-[#94A3B8] font-medium">
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

const num = (s: string) => parseFloat(String(s).replace(/[^\d.-]/g, ""))

// Bed colour is clinical, not decorative: the census strip is read at a glance
// from across the unit, so acuity drives the colour and an empty bed reads as
// capacity rather than as another patient.
const ACUITY = {
  critical: {
    label: "Critical",
    color: "#DC2626",
    tint: "#FEF2F2",
    border: "#FECACA",
  },
  watch: {
    label: "Watch",
    color: "#D97706",
    tint: "#FFFBEB",
    border: "#FDE68A",
  },
  stable: {
    label: "Stable",
    color: "#16A34A",
    tint: "#F0FDF4",
    border: "#BBF7D0",
  },
  // Occupied, but nothing charted yet -- a patient just placed in an ICU bed
  // from Bed Management. Reading them as "Available" would hide them.
  pending: {
    label: "Vitals pending",
    color: "#2563EB",
    tint: "#EFF6FF",
    border: "#BFDBFE",
  },
  empty: {
    label: "Available",
    color: "#64748B",
    tint: "#F8FAFC",
    border: "#CBD5E1",
  },
} as const

// Colour for a charted vital; an uncharted one ("—") is neutral.
function vitalState(raw: string | undefined, rule: (v: number) => "ok" | "warn" | "crit"): "ok" | "warn" | "crit" {
  const v = num(raw ?? "")
  return Number.isFinite(v) ? rule(v) : "ok"
}

function acuityOf(p: { name?: string | null ;live?: LiveState }) {
  return ACUITY[acuityKey(p.live ?? null, Boolean(p.name))]
}

function MultiDayFlowchartMatrix({
  patientId,
  patientName,
  totalDays = 1,
  isManualCharting = true,
  revision = 0,
  onSelectDate,
}: {
  patientId: string
  patientName: string
  totalDays?: number
  isManualCharting?: boolean
  /** Bumped whenever a chart for this patient is saved or synced. */
  revision?: number
  onSelectDate: (dateStr: string) => void
}) {
  const stayDays = useMemo(() => getPatientStayDays(totalDays), [totalDays])

  // Each day's chart as recorded (cache synced from the clinical record by
  // the board). An uncharted day is an empty chart, never generated data.
  const records = useMemo(() => {
    return stayDays.map((sd) => {
      const rec: FlowsheetRecord = loadRecord(patientId, sd.dateStr)
      const live = deriveLiveState(rec)
      return { sd, rec, live, summary: { total: countEntries(rec) } }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, stayDays, totalDays, isManualCharting, revision])

  return (
    <Panel
      title={`Complete Day-by-Day Flow Chart History & Parameters (${totalDays}-Day ICU Stay)`}
      accent="#1B4FD8"
      className="col-span-full"
      actions={
        <span className="text-[11px] font-semibold text-[#1B4FD8] bg-[#EFF6FF] px-2 py-0.5 border border-[#BFDBFE]">
          {records.length} Days Recorded
        </span>
      }
    >
      <div className="text-[11.5px] text-[#64748B] mb-3">
        Detailed day-by-day clinical parameters, hemodynamics, ventilation
        settings, neurological scores, 24-hr fluid balances, and labs for{" "}
        {patientName}&apos;s complete stay. Click any day to open or update its
        full chart.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px] border-collapse min-w-[920px]">
          <thead>
            <tr className="bg-[#F8FAFC]">
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                Stay Day
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                Hemodynamics
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                Ventilator
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                GCS / RASS
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                24h Fluid Balance
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                Cum. Balance
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                Key Labs
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-left font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                Entries
              </th>
              <th className="border border-[#E2E8F0] px-2.5 py-1.5 text-center font-bold text-[#334155] uppercase text-[10px] tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map(({ sd, rec, live, summary }) => {
              const isChartEmpty = summary.total === 0
              const hr = live.vitals?.hr
              const bp = live.vitals?.bp
              const temp = live.vitals?.temp
              const ventMode = live.vent?.mode
              const fio2 = live.vent?.fio2
              const peep = live.vent?.peep
              const rass = live.rass ? `${live.rass.score} ${live.rass.label}` : ""
              const gcsTotal = live.gcs ? String(live.gcs.total) : ""
              const intake = rec.fields["balance_24h.intake"]
              const output = rec.fields["balance_24h.output"]
              const netBal = rec.fields["balance_24h.balance"]
              const cumBal = rec.fields["balance_24h.cumulative_balance"]
              const creat = rec.tables.labs?.[0]?.creatinine
              const hb = rec.tables.labs?.[0]?.hb

              return (
                <tr
                  key={sd.dateStr}
                  className={`border-b border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors ${
                    sd.isToday ? "bg-[#EFF6FF]" : ""
                  }`}
                >
                  <td className="border border-[#E2E8F0] px-2.5 py-2 whitespace-nowrap">
                    <div className="font-mono font-bold text-[#0F172A] flex items-center gap-1.5">
                      <span>Day {sd.dayNumber}</span>
                      {sd.isToday && (
                        <span className="text-[9px] bg-[#1B4FD8] text-white px-1 font-sans font-bold">
                          TODAY
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#64748B] font-mono">
                      {sd.dateStr}
                    </div>
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 font-mono">
                    {hr ? (
                      <>
                        <div className="font-semibold text-[#0F172A]">
                          HR {hr} bpm · {bp}
                        </div>
                        <div className="text-[10.5px] text-[#64748B]">
                          Temp {temp}°C
                        </div>
                      </>
                    ) : (
                      <span className="text-[#94A3B8] italic text-[11px]">Awaiting chart</span>
                    )}
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 font-mono">
                    {ventMode ? (
                      <>
                        <div className="font-semibold text-[#0369A1]">
                          {ventMode}
                        </div>
                        <div className="text-[10.5px] text-[#64748B]">
                          FiO₂ {fio2}% · PEEP {peep}
                        </div>
                      </>
                    ) : (
                      <span className="text-[#94A3B8] italic text-[11px]">Awaiting chart</span>
                    )}
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 font-mono">
                    {gcsTotal ? (
                      <>
                        <div className="font-semibold text-[#7C3AED]">
                          GCS {gcsTotal}
                        </div>
                        <div className="text-[10.5px] text-[#64748B] truncate max-w-[130px]">
                          {rass}
                        </div>
                      </>
                    ) : (
                      <span className="text-[#94A3B8] italic text-[11px]">Not assessed</span>
                    )}
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 font-mono">
                    {intake ? (
                      <>
                        <div className="text-[#64748B]">
                          In {intake}ml · Out {output}ml
                        </div>
                        <div
                          className={`font-bold ${
                            Number(netBal) >= 0 ? "text-[#059669]" : "text-[#DC2626]"
                          }`}
                        >
                          Net {Number(netBal) >= 0 ? `+${netBal}` : netBal} ml
                        </div>
                      </>
                    ) : (
                      <span className="text-[#94A3B8] italic text-[11px]">—</span>
                    )}
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 font-mono font-bold text-[#0F172A]">
                    {cumBal !== undefined ? `${cumBal} ml` : <span className="text-[#94A3B8] font-normal italic text-[11px]">—</span>}
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 font-mono">
                    {hb ? (
                      <>
                        <div>Hb {hb} g/dL</div>
                        <div className="text-[#64748B]">Cr {creat} mg/dL</div>
                      </>
                    ) : (
                      <span className="text-[#94A3B8] italic text-[11px]">—</span>
                    )}
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 whitespace-nowrap">
                    <div className="font-mono font-bold text-[#1B4FD8]">
                      {summary.total} entries
                    </div>
                    {summary.total > 0 && (
                      <div className="w-16 h-1.5 bg-[#EDF1F7] mt-1 overflow-hidden">
                        <div
                          className="h-full bg-[#1B4FD8]"
                          style={{
                            width: `${Math.min(100, Math.max(10, (summary.total / 120) * 100))}%`,
                          }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="border border-[#E2E8F0] px-2.5 py-2 text-center whitespace-nowrap">
                    <Btn
                      variant="primary"
                      size="xs"
                      onClick={() => onSelectDate(sd.dateStr)}
                    >
                      {isChartEmpty ? "+ Start Charting" : "Edit / View Chart"}
                    </Btn>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

const UNIT_LABEL: Record<string, string> = {
  All: "All ICUs",
  MICU: "Medical ICU",
  SICU: "Surgical ICU",
  CCU: "Cardiac ICU",
  NICU: "Neuro ICU",
  PICU: "Pediatric ICU",
  WARD: "ICU Ward",
}


// ── Bed Management → Critical Care ─────────────────────────────────────────
// A bed is critical care when Bed Management types it ICU, or when its ward or
// room is named as one (ward is free text, so "Intensive Care Unit (ICU)",
// "SICU", "Cardiac ICU" and an ICU-type bed on "2nd Floor" all count).
export function isCriticalCareBed(bed: Pick<BedRecord, "bed_type" | "ward" | "room_no">): boolean {
  if ((bed.bed_type || "").toUpperCase() === "ICU") return true
  const text = `${bed.ward || ""} ${bed.room_no || ""}`.toUpperCase()
  return /\b(ICU|MICU|SICU|CCU|NICU|PICU|ICCU|HDU)\b/.test(text) || text.includes("INTENSIVE CARE") || text.includes("CRITICAL CARE")
}

// Which Critical Care sub-page a bed belongs on, read from its room and ward
// names. Room is checked before ward because a room ("SICU") is more specific
// than the floor it sits on. A bed nothing names as a unit -- including a
// combined "Medical/Surgical" ward -- is listed under ICU Ward rather than
// guessed into one, so it is never missing from the ICU.
export function classifyIcuUnit(bed: Pick<BedRecord, "ward" | "room_no">): IcuUnitType {
  for (const raw of [bed.room_no, bed.ward]) {
    const t = (raw || "").toUpperCase()
    if (!t) continue
    if (/\bSICU\b/.test(t)) return "SICU"
    if (/\bMICU\b/.test(t)) return "MICU"
    if (/\bPICU\b/.test(t) || /PA?EDIATRIC/.test(t)) return "PICU"
    if (/\bNICU\b/.test(t) || t.includes("NEURO")) return "NICU"
    if (/\b(CCU|ICCU|CICU)\b/.test(t) || t.includes("CARDIAC") || t.includes("CORONARY")) return "CCU"
    const medical = t.includes("MEDICAL")
    const surgical = t.includes("SURGICAL")
    if (medical && surgical) return "WARD"
    if (surgical) return "SICU"
    if (medical) return "MICU"
  }
  return "WARD"
}

// The label shown on the census strip. It must be unique across the board
// (it is the selection key), so a bare bed number ("2") carries its room.
function syncedBedLabel(bed: BedRecord): string {
  const bedNo = String(bed.bed_no || "").trim()
  const room = String(bed.room_no || "").trim()
  if (!bedNo) return `${room || "Bed"}-${bed.id}`
  if (/^\d+$/.test(bedNo) && room && !bedNo.startsWith(room)) return `${room}-${bedNo}`
  return bedNo
}

function sexOf(gender: string | null): "M" | "F" | null {
  const g = (gender || "").trim().toUpperCase()
  if (g.startsWith("M")) return "M"
  if (g.startsWith("F")) return "F"
  return null
}

function stayDaysSince(iso: string | null): number {
  if (!iso) return 1
  const start = new Date(iso).getTime()
  if (Number.isNaN(start)) return 1
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1)
}

const dashIfNull = (v: string | null | undefined) => (v == null || v === "" ? "—" : v)

/**
 * One board entry: who is in the bed (Bed Management) and how they are
 * (today's chart). Nothing is filled in that was not recorded.
 */
function bedToIcuPatient(bed: BedRecord, live: LiveState): IcuPatient {
  const unitType = classifyIcuUnit(bed)
  const occupied = bed.status === "Occupied" && Boolean(bed.patient_id || bed.patient_name)
  const since = bed.allocated_at || bed.admission_date
  const days = occupied ? stayDaysSince(since) : 0
  const fullName = [bed.patient_name, bed.patient_last_name].filter(Boolean).join(" ").trim()
  const lv = occupied ? live : null
  return {
    bed: syncedBedLabel(bed),
    unit: `${UNIT_LABEL[unitType]} · ${bed.ward}${bed.room_no ? ` / ${bed.room_no}` : ""}`,
    unitType,
    source: "bed_management",
    bedId: bed.id,
    ward: bed.ward,
    admissionId: bed.admission_id,
    admittedAt: occupied ? since : null,
    bedStatus: bed.status,
    live: lv ?? undefined,
    name: occupied ? fullName || "Unnamed patient" : null,
    mrn: occupied ? String(bed.patient_id || "") : "",
    age: occupied ? bed.patient_age : null,
    sex: occupied ? sexOf(bed.patient_gender) : null,
    dx: occupied ? lv?.diagnosis || bed.admission_notes || "Diagnosis not recorded" : null,
    provider: occupied ? lv?.consultant || "" : "",
    nurse: occupied ? lv?.nurse || "" : "",
    los: occupied ? `${days}d` : "",
    totalDays: days,
    code: occupied ? lv?.allergy || "None recorded" : "",
    vitals: lv?.vitals
      ? {
          bp: dashIfNull(lv.vitals.bp),
          hr: dashIfNull(lv.vitals.hr),
          rr: dashIfNull(lv.vitals.rr),
          temp: dashIfNull(lv.vitals.temp),
          spo2: dashIfNull(lv.vitals.spo2),
          cvp: dashIfNull(lv.vitals.map),
        }
      : null,
    vent: lv?.vent
      ? {
          mode: lv.vent.mode,
          fio2: dashIfNull(lv.vent.fio2),
          peep: dashIfNull(lv.vent.peep),
          tv: dashIfNull(lv.vent.tv),
          rr: dashIfNull(lv.vent.rr),
          pip: dashIfNull(lv.vent.pip),
        }
      : null,
    infusions: (lv?.drugs ?? []).map((d) => ({
      drug: d.drug,
      rate: d.dose || "—",
      concentration: [d.route, d.freq].filter(Boolean).join(" · ") || "—",
    })),
    alerts: [
      ...(bed.status === "Maintenance" ? ["Bed under maintenance"] : []),
      ...(lv?.alerts ?? []),
    ],
    score: { sofa: 0, apache: 0, rass: lv?.rass?.score ?? 0 },
    hrTrend: lv?.hrTrend ?? [],
    bpTrend: lv?.bpTrend ?? [],
    isManualCharting: true,
  }
}

const BED_SYNC_INTERVAL_MS = 10_000
const CHART_SYNC_INTERVAL_MS = 15_000

/**
 * `unit` comes from the Critical Care sub-nav: "All" or an ICU unit type.
 * `onOpenBedManagement` opens Bed Management (on a given bed if provided),
 * where a synced bed's admission, transfer and discharge are done.
 */
export default function ICU({
  unit = "All",
  onOpenBedManagement,
}: {
  unit?: string
  onOpenBedManagement?: (bedId?: number) => void
}) {
  const branding = useBranding()

  // ── Beds: Bed Management is the single source of who is in which bed ──
  const [beds, setBeds] = useState<BedRecord[]>([])
  const [bedsState, setBedsState] = useState<"loading" | "live" | "offline">("loading")
  const [bedsSyncedAt, setBedsSyncedAt] = useState<number>(0)
  const loadBeds = useCallback(() => {
    return apiFetch<{ beds: BedRecord[] }>("/api/beds")
      .then((res) => {
        const all = Array.isArray(res?.beds) ? res.beds : []
        setBeds(all.filter(isCriticalCareBed))
        setBedsState("live")
        setBedsSyncedAt(Date.now())
      })
      .catch(() => setBedsState((s) => (s === "loading" ? "offline" : s)))
  }, [])

  // ── Charts: today's flowsheet for every occupied bed ──
  const today = new Date().toISOString().slice(0, 10)
  const [chartRev, setChartRev] = useState(0)
  const occupiedMrns = useMemo(
    () =>
      beds
        .filter((b) => b.status === "Occupied" && b.patient_id)
        .map((b) => String(b.patient_id)),
    [beds],
  )
  const occupiedKey = occupiedMrns.join("|")
  const syncCharts = useCallback(() => {
    if (!occupiedKey) return Promise.resolve()
    return Promise.all(
      occupiedKey.split("|").map((mrn) => syncRecordFromServer(mrn, today).catch(() => null)),
    ).then(() => setChartRev((n) => n + 1))
  }, [occupiedKey, today])

  // Realtime: poll, refresh on focus, and react at once to a chart saved in
  // any tab (BroadcastChannel) or written by another tab (storage event).
  useEffect(() => {
    loadBeds()
    const timer = window.setInterval(loadBeds, BED_SYNC_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") loadBeds()
    }
    window.addEventListener("focus", loadBeds)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", loadBeds)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [loadBeds])
  useEffect(() => {
    syncCharts()
    const timer = window.setInterval(syncCharts, CHART_SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [syncCharts])
  useEffect(() => onFlowsheetSync(() => setChartRev((n) => n + 1)), [])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("icu.flowsheet.")) setChartRev((n) => n + 1)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // A ticking clock so "synced N s ago" and stay length stay current.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const allBeds = useMemo(
    () => beds.map((b) => bedToIcuPatient(b, deriveLiveState(b.patient_id ? loadRecord(String(b.patient_id), today) : null))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beds, today, chartRev],
  )

  const openInBedManagement = (bed: IcuPatient) => {
    if (bed.bedId != null) {
      try {
        sessionStorage.setItem("hospai_target_bed_id", String(bed.bedId))
      } catch {}
    }
    onOpenBedManagement?.(bed.bedId)
  }

  // ── ICU hand-offs (recorded by the ICU discharge form) ──
  const [dischargedPatients, setDischargedPatients] = useState<IcuDischargeRecord[]>(() =>
    getDischargedIcuPatients(),
  )
  useEffect(() => {
    const refresh = () => setDischargedPatients(getDischargedIcuPatients())
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hms_icu_reception_discharges_v1") refresh()
    }
    window.addEventListener("icu:patient_discharged_to_reception", refresh)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("icu:patient_discharged_to_reception", refresh)
      window.removeEventListener("storage", onStorage)
    }
  }, [])
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [summarySlipRecord, setSummarySlipRecord] = useState<IcuDischargeRecord | null>(null)

  // Selected by bed label, not array index: the bed list refreshes live and
  // would shift every index under the selection.
  const [selectedBed, setSelectedBed] = useState<string>("")
  const selectedUnit = unit in UNIT_LABEL ? unit : "All"
  const [selectedStatus, setSelectedStatus] = useState<string>("All")
  const [selectedFlowsheetDate, setSelectedFlowsheetDate] = useState<string>("")
  const [view, setView] = useState<"overview" | "flowsheet" | "discharges">("overview")
  const [showPharmacyModal, setShowPharmacyModal] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [showDripModal, setShowDripModal] = useState(false)
  const [showLabModal, setShowLabModal] = useState(false)
  const [labTick, setLabTick] = useState(0)
  useEffect(() => LabOrderDatabase.subscribe(() => setLabTick((n) => n + 1)), [])

  const filteredBeds = useMemo(() => {
    return allBeds.filter((b) => {
      if (selectedUnit !== "All" && b.unitType !== selectedUnit) return false
      const a = acuityOf(b)
      if (selectedStatus === "Occupied" && !b.name) return false
      if (selectedStatus === "Available" && b.name) return false
      if (selectedStatus === "Critical" && a.label !== "Critical") return false
      if (selectedStatus === "Watch" && a.label !== "Watch") return false
      if (selectedStatus === "Stable" && a.label !== "Stable") return false
      return true
    })
  }, [allBeds, selectedUnit, selectedStatus])

  const unitBeds =
    selectedUnit === "All"
      ? allBeds
      : allBeds.filter((b) => b.unitType === selectedUnit)

  const pt: IcuPatient | undefined =
    unitBeds.find((b) => b.bed === selectedBed) ??
    unitBeds.find((b) => b.name) ??
    unitBeds[0]

  // Charting progress and day index for the selected patient.
  const summary = useMemo(
    () => flowsheetSummary(pt?.mrn || "", today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pt?.mrn, today, chartRev],
  )
  const [history, setHistory] = useState<FlowsheetDay[]>([])
  useEffect(() => {
    if (!pt?.mrn) {
      setHistory([])
      return
    }
    let alive = true
    fetchDays(pt.mrn)
      .then((d) => alive && setHistory(d.slice(0, 6)))
      .catch(() => alive && setHistory([]))
    return () => {
      alive = false
    }
  }, [pt?.mrn, chartRev])

  const pendingLabOrders = useMemo(
    () =>
      pt?.mrn
        ? LabOrderDatabase.getOrdersForPatient(pt.mrn).filter(
            (o) =>
              o.department === "ICU" &&
              o.status !== "Completed" &&
              o.status !== "Cancelled",
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pt?.mrn, labTick],
  )

  // Results entered by the laboratory on any of this patient's orders,
  // newest first. A multi-parameter test lists each parameter.
  const labResults = useMemo(() => {
    if (!pt?.mrn) return []
    const rows: { key: string ;label: string ;value: string ;abnormal: boolean ;at: string ;ts: number }[] = []
    for (const o of LabOrderDatabase.getOrdersForPatient(pt.mrn)) {
      for (const t of o.tests) {
        const when = t.verifiedAt || t.resultedAt || t.processingCompletedAt || o.updatedAt
        const ts = when ? new Date(when).getTime() || 0 : 0
        const at = when ? formatDateTimeIST(when) : ""
        if (t.results && Object.keys(t.results).length) {
          for (const [param, r] of Object.entries(t.results)) {
            if (!r?.value) continue
            rows.push({
              key: `${o.id}-${t.id}-${param}`,
              label: Object.keys(t.results).length > 1 ? `${t.name} · ${param}` : t.name,
              value: [r.value, r.unit].filter(Boolean).join(" "),
              abnormal: Boolean(r.flag),
              at,
              ts,
            })
          }
        } else if (t.result) {
          rows.push({
            key: `${o.id}-${t.id}`,
            label: t.name,
            value: [t.result, t.resultUnit].filter(Boolean).join(" "),
            abnormal: Boolean(t.flag),
            at,
            ts,
          })
        }
      }
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pt?.mrn, labTick])

  // Drips go on today's drug chart, so the nurse sees them in the flowsheet
  // and the board reads them back from the same record.
  const handleAddDrip = async (inf: { drug: string ;rate: string ;concentration: string }) => {
    if (!pt?.mrn) return
    setShowDripModal(false)
    const { timeStr } = getCurrentDateTimeFormatted()
    const { saved } = await appendChartRows(pt.mrn, today, "drug_chart", [
      {
        drug: inf.drug,
        dose: [inf.rate, inf.concentration !== "—" ? inf.concentration : ""].filter(Boolean).join(" · "),
        route: "IV infusion",
        freq: "Continuous",
        times: `Started ${timeStr}`,
        nurse_sign: "",
      },
    ])
    setChartRev((n) => n + 1)
    setNotification(
      saved
        ? `✓ ${inf.drug} at ${inf.rate} added to ${pt.name}'s drug chart.`
        : `${inf.drug} saved on this device; it will reach the chart when the connection is back.`,
    )
  }

  const handleLabOrdered = (order: LabOrder) => {
    setShowLabModal(false)
    setNotification(
      `✓ Lab order ${order.id} (${order.tests.length} test${order.tests.length === 1 ? "" : "s"}) sent to reception for billing.`,
    )
  }

  // Medication orders: one prescription into the pharmacy queue (status
  // "Sent To Pharmacy", department ICU) and the same lines onto today's chart.
  const handleMedicationOrder = async (order: IcuMedOrder) => {
    if (!pt?.mrn || !pt.name) return
    const stamp = new Date()
    const prescription: AppPrescription = {
      id: `RX-${stamp.getTime().toString(36).toUpperCase()}`,
      patientId: pt.mrn,
      patientName: pt.name,
      uhid: pt.mrn,
      age: pt.age ?? undefined,
      gender: pt.sex === "M" ? "Male" : pt.sex === "F" ? "Female" : undefined,
      visitId: pt.admissionId != null ? `IP-${pt.admissionId}` : undefined,
      doctorId: pt.provider || "icu",
      doctorName: pt.provider || "ICU physician",
      department: `ICU · ${pt.bed}`,
      diagnosis: pt.dx || undefined,
      date: stamp.toISOString().split("T")[0],
      arrivalTime: stamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
      sourceType: order.source,
      priority: order.urgency === "STAT" ? "Urgent" : "Normal",
      status: "Sent To Pharmacy",
      dispensingStatus: "Waiting",
      imageUrl: order.imageUrl,
      items: order.items.map((it, i) => ({
        id: `${stamp.getTime().toString(36)}-${i}`,
        medicineName: it.drug,
        dosage: it.dose,
        frequency: it.freq,
        duration: "As charted",
        route: it.route,
        instructions: it.instructions,
        quantity: 1,
        substitutionAllowed: false,
      })),
      verificationNotes: `ICU inpatient, bed ${pt.bed} (${pt.ward ?? pt.unit}).${order.source === "OCR" ? ` Read from an uploaded sheet${order.engine ? ` by ${order.engine}` : ""} — verify against the image.` : ""}`,
      createdAt: stamp.toISOString(),
    }
    PharmacyDatabase.savePrescriptions([prescription, ...PharmacyDatabase.getPrescriptions()])

    const { timeStr } = getCurrentDateTimeFormatted()
    const { saved } = await appendChartRows(
      pt.mrn,
      today,
      "drug_chart",
      order.items.map((it) => ({
        drug: order.urgency === "STAT" ? `${it.drug} (STAT)` : it.drug,
        dose: it.dose,
        route: it.route,
        freq: it.freq,
        times: `Ordered ${timeStr}`,
        nurse_sign: "",
      })),
    )
    setChartRev((n) => n + 1)
    setNotification(
      `✓ ${prescription.id}: ${order.items.length} medicine${order.items.length === 1 ? "" : "s"} sent to pharmacy${saved ? " and added to today's drug chart" : "; chart saved on this device until the connection is back"}.`,
    )
  }

  // The hand-off is recorded here; the bed is then released or transferred in
  // Bed Management, which owns it.
  const handleConfirmDischarge = (record: IcuDischargeRecord) => {
    setDischargedPatients(getDischargedIcuPatients())
    setSummarySlipRecord(record)
    setNotification(
      `✓ Hand-off for ${record.patientName} recorded. Release or transfer bed ${record.bed} in Bed Management to complete the move.`,
    )
  }
  const startDischarge = () => {
    if (pt?.name) setShowDischargeModal(true)
  }
  const occupiedCount = unitBeds.filter((b) => b.name).length
  const syncedAgo = bedsSyncedAt ? Math.max(0, Math.round((now - bedsSyncedAt) / 1000)) : null

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F5F7FB]">
      {/* Medication order modal */}
      {pt?.name && (
        <PharmacyOrderModal
          patient={pt}
          isOpen={showPharmacyModal}
          onClose={() => setShowPharmacyModal(false)}
          onSubmit={handleMedicationOrder}
        />
      )}

      {showDripModal && pt?.name && (
        <AddDripModal
          patientName={pt.name}
          onClose={() => setShowDripModal(false)}
          onAdd={handleAddDrip}
        />
      )}
      {showLabModal && pt?.name && (
        <LabOrderModal
          patient={pt}
          onClose={() => setShowLabModal(false)}
          onOrdered={handleLabOrdered}
        />
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="bg-[#15803D] text-white px-6 py-2.5 text-[12px] font-bold flex items-center justify-between shadow-md">
          <span>{notification}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-white hover:text-green-200 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* ICU discharge hand-off */}
      {pt?.name && showDischargeModal && (
        <IcuDischargeModal
          key={pt.bed}
          patient={pt}
          isOpen={showDischargeModal}
          onClose={() => setShowDischargeModal(false)}
          onConfirmDischarge={handleConfirmDischarge}
        />
      )}

      {/* Printable ICU Discharge Summary Slip Modal */}
      <IcuDischargeSummarySlipModal
        record={summarySlipRecord}
        onClose={() => setSummarySlipRecord(null)}
      />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-[#E2E8F0] px-6 py-3 flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-[#0F172A] tracking-tight">
            Critical Care
            <span className="text-[#64748B] font-semibold">
              {" "}
              · {UNIT_LABEL[selectedUnit]}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-[11.5px]">
            <span className="text-[#64748B]">{branding.hospitalName}</span>
            <span className="flex items-center gap-1.5 text-[#334155]">
              <span className="w-1.5 h-1.5 bg-[#DC2626]" /> {occupiedCount}{" "}
              occupied
            </span>
            <span className="flex items-center gap-1.5 text-[#334155]">
              <span className="w-1.5 h-1.5 bg-[#16A34A]" />{" "}
              {unitBeds.filter((b) => !b.name && b.bedStatus !== "Maintenance").length} available
            </span>
            <span className="text-[#94A3B8]">
              {unitBeds.length} total beds
            </span>
            <span
              className="flex items-center gap-1.5"
              style={{ color: bedsState === "offline" ? "#B45309" : "#15803D" }}
              title="Beds from Bed Management; vitals and drugs from today's flowsheet"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${bedsState === "live" ? "animate-pulse" : ""}`}
                style={{ backgroundColor: bedsState === "offline" ? "#F59E0B" : "#16A34A" }}
              />
              {bedsState === "loading"
                ? "Connecting…"
                : bedsState === "offline"
                  ? "Bed Management unreachable"
                  : `Live · synced ${syncedAgo ?? 0}s ago`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Btn
            variant={view === "overview" ? "primary" : "outline"}
            size="sm"
            onClick={() => setView("overview")}
          >
            Overview Board
          </Btn>
          <Btn
            variant={view === "flowsheet" ? "primary" : "outline"}
            size="sm"
            disabled={!pt?.name}
            onClick={() => setView(view === "flowsheet" ? "overview" : "flowsheet")}
          >
            {view === "flowsheet" ? "Back to Overview" : "Daily Flowsheet"}
          </Btn>
          <Btn
            variant={view === "discharges" ? "primary" : "outline"}
            size="sm"
            onClick={() => setView("discharges")}
          >
            Reception Handoffs ({dischargedPatients.length})
          </Btn>

          {pt?.name && (
            <button
              type="button"
              onClick={startDischarge}
              className="px-3.5 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span>📋 Discharge / Step-down</span>
            </button>
          )}

          <Btn
            variant="outline"
            size="sm"
            className="text-emerald-700 border-emerald-400 hover:bg-emerald-50 font-bold"
            onClick={() => {
              const empty = unitBeds.find((b) => !b.name && b.bedStatus !== "Maintenance")
              if (empty) openInBedManagement(empty)
              else onOpenBedManagement?.()
            }}
          >
            + Admit Patient
          </Btn>

          <Btn
            variant="primary"
            size="sm"
            disabled={!pt?.name}
            onClick={() => setShowPharmacyModal(true)}
          >
            + New Order
          </Btn>
        </div>
      </div>

      {/* ── Status filter pills (the unit comes from the side nav) ─────── */}
      <div className="flex-shrink-0 bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B] mr-1">
          Status:
        </span>
        {["All", "Critical", "Watch", "Stable", "Available"].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setSelectedStatus(st)}
            className={`px-2.5 py-1 text-[10.5px] font-semibold border rounded-full transition-all cursor-pointer ${
              selectedStatus === st
                ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                : "bg-white text-[#64748B] border-[#CBD5E1] hover:border-slate-800 hover:bg-slate-50"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* ── ICU bed census strip ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-[#E2E8F0] px-6 py-2.5 flex items-stretch gap-2 overflow-x-auto">
        {filteredBeds.length === 0 && (
          <div className="text-[11.5px] text-[#64748B] py-2">
            No critical-care beds in {UNIT_LABEL[selectedUnit]}. Beds typed ICU
            in Bed Management appear here as soon as they exist.
          </div>
        )}
        {filteredBeds.map((p) => {
          const selected = pt?.bed === p.bed
          const a = acuityOf(p)
          const occupied = Boolean(p.name)
          const spo2 = p.vitals ? num(p.vitals.spo2) : null
          const hr = p.vitals ? num(p.vitals.hr) : null
          return (
            <button
              key={p.bed}
              type="button"
              onClick={() => {
                if (!selected) setSelectedFlowsheetDate("")
                setSelectedBed(p.bed)
              }}
              className={`relative flex-shrink-0 w-48 text-left border rounded-xl pl-3.5 pr-2.5 py-2.5 transition-all overflow-hidden ${
                occupied
                  ? "hover:shadow-md cursor-pointer"
                  : "border-dashed cursor-pointer opacity-70 hover:opacity-100"
              } ${selected ? "ring-2 ring-offset-0 shadow-sm" : ""}`}
              style={{
                backgroundColor: selected
                  ? a.tint
                  : occupied
                    ? "#FFFFFF"
                    : ACUITY.empty.tint,
                // Full border in the acuity colour, matching the spine --
                // the pale tint left three sides looking unfinished.
                borderColor: occupied ? a.color : ACUITY.empty.border,
                ...(selected
                  ? ({ "--tw-ring-color": a.color } as React.CSSProperties)
                  : {}),
              }}
            >
              {/* acuity spine */}
              <span
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ backgroundColor: occupied ? a.color : "transparent" }}
              />
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#1B4FD8]">
                  {p.bed} · {p.unitType}
                </span>
                {occupied && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: a.tint, color: a.color }}
                  >
                    {a.label}
                  </span>
                )}
              </div>
              {occupied ? (
                <>
                  <div className="text-[12px] font-bold text-[#0F172A] truncate mt-0.5">
                    {p.name}
                  </div>
                  <div className="text-[10.5px] text-[#64748B] truncate">
                    {p.dx}
                  </div>
                  {!p.vitals && (
                    <div className="mt-1 text-[10.5px] text-[#2563EB]">No vitals charted today</div>
                  )}
                  {p.vitals && (
                    <div className="flex gap-2 mt-1 font-mono text-[10.5px]">
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            spo2 !== null && spo2 < 93
                              ? ACUITY.critical.color
                              : spo2 !== null && spo2 < 96
                                ? ACUITY.watch.color
                                : "#15803D",
                        }}
                      >
                        SpO₂ {p.vitals.spo2}
                      </span>
                      <span
                        style={{
                          color:
                            hr !== null && hr > 110
                              ? ACUITY.critical.color
                              : hr !== null && hr > 100
                                ? ACUITY.watch.color
                                : "#64748B",
                        }}
                      >
                        HR {p.vitals.hr}
                      </span>
                      {p.live?.lastChartedHour && (
                        <span className="text-[#94A3B8]">@{p.live.lastChartedHour}</span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1.5 mt-2">
                  <span
                    className="w-1.5 h-1.5"
                    style={{ backgroundColor: p.bedStatus === "Maintenance" ? "#F59E0B" : "#16A34A" }}
                  />
                  <span className="text-[11px] font-medium text-[#64748B]">
                    {p.bedStatus === "Maintenance" ? "Maintenance" : "Available"}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {!pt ? (
        <div className="flex-1 flex items-center justify-center p-10 bg-slate-50/50">
          <div className="text-center max-w-md bg-white border border-slate-200 p-8 shadow-xs rounded-xl">
            <div className="text-[15px] font-bold text-[#0F172A]">
              {bedsState === "loading"
                ? "Loading critical-care beds…"
                : bedsState === "offline"
                  ? "Bed Management could not be reached"
                  : `No beds in ${UNIT_LABEL[selectedUnit]} yet`}
            </div>
            <p className="text-[12px] text-[#64748B] mt-1 mb-5">
              {bedsState === "offline"
                ? "The board retries every few seconds."
                : "Create beds of type ICU in Bed Management. Name the ward or room after the unit (e.g. SICU, Cardiac ICU) to place them on its page; anything else is listed under ICU Ward."}
            </p>
            <Btn variant="primary" size="sm" onClick={() => onOpenBedManagement?.()}>
              Open Bed Management
            </Btn>
          </div>
        </div>
      ) : view === "flowsheet" && pt.name ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-[#0F172A] text-white px-6 py-2 flex items-center justify-between text-xs flex-shrink-0 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView("overview")}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                title="Return to Critical Care Overview Board"
              >
                <span>← Back to Overview Board</span>
              </button>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">
                Viewing Chart for: <strong className="text-white">{pt.name}</strong> ({pt.bed} · MRN {pt.mrn})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setView("overview")}
              className="text-slate-300 hover:text-white text-xs font-medium cursor-pointer flex items-center gap-1"
            >
              <span>✕</span>
              <span>Exit Chart</span>
            </button>
          </div>
          <IcuFlowsheet
            key={`${pt.mrn}-${selectedFlowsheetDate}`}
            patientId={pt.mrn}
            patientName={pt.name || "Patient"}
            bed={pt.bed}
            initialDate={selectedFlowsheetDate || today}
            totalDays={pt.totalDays || 10}
            isManualCharting={pt.isManualCharting}
            onClose={() => setView("overview")}
          />
        </div>
      ) : view === "discharges" ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                ICU Patient Discharges &amp; Reception Transfer Queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Archived ICU discharges transmitted to Reception for floor bed
                allocation and billing settlement.
              </p>
            </div>
            <span className="bg-red-50 text-red-700 border border-red-200 px-3 py-1 text-xs font-bold font-mono">
              {dischargedPatients.length} Discharges Recorded
            </span>
          </div>

          {dischargedPatients.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-none space-y-2">
              <div className="text-2xl">📋</div>
              <div className="text-sm font-bold text-slate-800">
                No ICU Discharges Recorded Yet
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Discharge any active ICU patient using the &quot;Discharge to
                Reception&quot; button to send their handover summary to
                Reception.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10.5px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">Ref ID</th>
                    <th className="p-3">Patient Name</th>
                    <th className="p-3">MRN</th>
                    <th className="p-3">ICU Unit / Bed</th>
                    <th className="p-3">Discharge Type</th>
                    <th className="p-3">Destination / Ward</th>
                    <th className="p-3">Physician</th>
                    <th className="p-3">Discharged At</th>
                    <th className="p-3 text-center">Reception Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-sans">
                  {dischargedPatients.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-blue-900">
                        {rec.id}
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        {rec.patientName}
                      </td>
                      <td className="p-3 font-mono text-slate-600">
                        {rec.mrn}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {rec.unit} ({rec.bed})
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 font-bold rounded-none text-[10.5px]">
                          {rec.dischargeType}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-700">
                        {rec.destinationWard || "Reception Billing Desk"}
                      </td>
                      <td className="p-3 text-slate-700">
                        {rec.attendingDoctor}
                      </td>
                      <td className="p-3 font-mono text-slate-500">
                        {formatDateTimeIST(rec.dischargedAt)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-300 font-bold rounded-none text-[10.5px]">
                          {rec.receptionStatus}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSummarySlipRecord(rec)}
                          className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold rounded-none cursor-pointer"
                        >
                          🖨 Print Summary
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !pt.name ? (
        <div className="flex-1 flex items-center justify-center p-10 bg-slate-50/50">
          <div className="text-center max-w-md bg-white border border-slate-200 p-8 shadow-xs rounded-xl">
            <div className="text-[15px] font-bold text-[#0F172A]">
              Bed {pt.bed} is {pt.bedStatus === "Maintenance" ? "under maintenance" : "available"}
            </div>
            <div className="text-[11.5px] text-[#64748B] mt-0.5">{pt.unit}</div>
            <p className="text-[12px] text-[#64748B] mt-2 mb-5">
              Beds are assigned in Bed Management. The patient appears on this
              board within seconds of being placed.
            </p>
            <Btn variant="primary" size="sm" onClick={() => openInBedManagement(pt)}>
              {pt.bedStatus === "Maintenance" ? `Open ${pt.bed} in Bed Management` : `Assign ${pt.bed} in Bed Management`}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* ── Patient banner ──────────────────────────────────────────── */}
          <div className="bg-white border border-[#E2E8F0] shadow-sm">
            <div className="px-4 py-3 flex flex-wrap items-start gap-4 border-b border-[#EDF1F7]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-[#0F172A] tracking-tight">
                    {pt.name}
                  </h2>
                  <span className="bg-[#FEE2E2] text-[#B91C1C] text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
                    ICU
                  </span>
                  <span className="bg-[#F1F5F9] text-[#475569] text-[10px] font-bold px-1.5 py-0.5">
                    {pt.bed}
                  </span>
                  <button
                    type="button"
                    onClick={startDischarge}
                    className="ml-2 px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white text-[11px] font-bold rounded shadow-2xs flex items-center gap-1 cursor-pointer"
                  >
                    <span>📋 Discharge / Step-down</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openInBedManagement(pt)}
                    className="px-2.5 py-1 border border-[#CBD5E1] hover:bg-slate-50 text-[#334155] text-[11px] font-semibold rounded cursor-pointer"
                  >
                    Transfer bed
                  </button>
                </div>
                <div className="text-[11.5px] text-[#64748B] mt-0.5">
                  {[
                    pt.age != null ? `${pt.age}y` : null,
                    pt.sex === "M" ? "Male" : pt.sex === "F" ? "Female" : null,
                    `MRN ${pt.mrn || "—"}`,
                    pt.unit,
                    pt.admittedAt ? `in bed since ${formatDateTimeIST(pt.admittedAt)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="text-[12.5px] font-semibold text-[#1E293B] mt-1">
                  {pt.dx}
                </div>
              </div>
              <div className="ml-auto grid grid-cols-3 sm:grid-cols-6 gap-x-5 gap-y-2">
                {[
                  { l: "Day in ICU", v: pt.los },
                  { l: "Allergy", v: pt.code },
                  { l: "Consultant", v: pt.provider || "Not charted" },
                  { l: "Nurse (shift)", v: pt.nurse || "Not charted" },
                  { l: "GCS", v: pt.live?.gcs ? `${pt.live.gcs.total}/15 @${pt.live.gcs.at}` : "Not charted" },
                  { l: "RASS", v: pt.live?.rass ? `${pt.live.rass.score > 0 ? "+" : ""}${pt.live.rass.score} @${pt.live.rass.at}` : "Not charted" },
                ].map((x) => (
                  <div key={x.l}>
                    <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      {x.l}
                    </div>
                    <div className="text-[12px] font-semibold text-[#1E293B] mt-0.5">
                      {x.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vitals strip -- latest charted value of each, today */}
            {!pt.vitals && (
              <div className="px-4 py-3 text-[12px] text-[#2563EB] bg-[#EFF6FF]">
                No vitals charted today. They appear here as soon as the nurse
                enters them in the Daily Flowsheet.
              </div>
            )}
            {pt.vitals && (
              <div className="px-4 pt-2 text-[10.5px] text-[#64748B]">
                Latest charted values{pt.live?.lastChartedHour ? `, last entry ${pt.live.lastChartedHour}` : ""}
                {pt.live?.updatedAt ? ` · chart saved ${formatDateTimeIST(pt.live.updatedAt)}` : ""}
              </div>
            )}
            {pt.vitals && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[#EDF1F7]">
                <Vital
                  label="Temp"
                  value={pt.vitals.temp.replace("°C", "")}
                  unit="°C"
                  state={vitalState(pt.vitals.temp, (v) => (v >= 38.5 ? "crit" : v >= 37.8 ? "warn" : "ok"))}
                />
                <Vital
                  label="Heart Rate"
                  value={pt.vitals.hr}
                  unit="bpm"
                  state={vitalState(pt.vitals.hr, (v) => (v > 120 || v < 50 ? "crit" : v > 100 ? "warn" : "ok"))}
                />
                <Vital
                  label="Blood Pressure"
                  value={pt.vitals.bp}
                  unit="mmHg"
                  state={vitalState(pt.vitals.bp.split("/")[0], (v) => (v < 90 ? "crit" : v < 100 ? "warn" : "ok"))}
                />
                <Vital
                  label="Resp Rate"
                  value={pt.vitals.rr}
                  unit="/min"
                  state={vitalState(pt.vitals.rr, (v) => (v > 30 || v < 8 ? "crit" : v > 22 ? "warn" : "ok"))}
                />
                <Vital
                  label="SpO₂"
                  value={pt.vitals.spo2.replace("%", "")}
                  unit="%"
                  state={vitalState(pt.vitals.spo2, (v) => (v < 92 ? "crit" : v < 95 ? "warn" : "ok"))}
                />
                <Vital
                  label="MAP"
                  value={pt.vitals.cvp}
                  unit="mmHg"
                  state={vitalState(pt.vitals.cvp, (v) => (v < 65 ? "crit" : v < 70 ? "warn" : "ok"))}
                />
              </div>
            )}
          </div>

          {/* ── Alerts ──────────────────────────────────────────────────── */}
          {pt.alerts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pt.alerts.map((a, i) => {
                const good = a.startsWith("✓")
                return (
                  <div
                    key={i}
                    className={`border px-3.5 py-2.5 text-[12px] font-medium flex items-start gap-2 ${
                      good
                        ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                        : "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
                    }`}
                  >
                    <span>{a}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Multi-Day Stay Flow Chart History & Parameters Matrix ──── */}
          <MultiDayFlowchartMatrix
            patientId={pt.mrn}
            patientName={pt.name || "Patient"}
            totalDays={pt.totalDays || 1}
            revision={chartRev}
            onSelectDate={(d) => {
              setSelectedFlowsheetDate(d)
              setView("flowsheet")
            }}
          />

          {/* ── Main grid ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Daily flow chart — charting status for today */}
            <Panel
              title="Daily Flow Chart"
              accent="#1B4FD8"
              className="lg:col-span-1"
              actions={
                <Btn
                  variant="primary"
                  size="xs"
                  onClick={() => setView("flowsheet")}
                >
                  Open Chart
                </Btn>
              }
            >
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="font-mono text-[24px] font-extrabold text-[#0F172A] leading-none">
                    {summary.total}
                  </div>
                  <div className="text-[10.5px] text-[#64748B] mt-1">
                    entries recorded today
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Date
                  </div>
                  <div className="font-mono text-[11.5px] font-semibold text-[#334155]">
                    {today}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {summary.tabs.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="text-[11.5px] text-[#475569] w-32 truncate">
                      {t.label}
                    </span>
                    <div className="flex-1 h-1.5 bg-[#EDF1F7] overflow-hidden">
                      <div
                        className="h-full bg-[#1B4FD8] transition-all"
                        style={{
                          width: `${Math.min(100, t.count === 0 ? 0 : Math.max(8, (t.count / 40) * 100))}%`,
                        }}
                      />
                    </div>
                    <span
                      className={`font-mono text-[11px] w-7 text-right ${
                        t.count ? "font-bold text-[#1B4FD8]" : "text-[#CBD5E1]"
                      }`}
                    >
                      {t.count}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[#EDF1F7]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                  Recent days
                </div>
                {history.length === 0 ? (
                  <div className="text-[11.5px] text-[#94A3B8]">
                    No charts recorded yet.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {history.map((d) => (
                      <button
                        key={d.chart_date}
                        type="button"
                        onClick={() => {
                          setSelectedFlowsheetDate(d.chart_date)
                          setView("flowsheet")
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1 border text-left transition-colors cursor-pointer ${
                          d.chart_date === today
                            ? "border-[#1B4FD8] bg-[#EFF6FF]"
                            : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#94A3B8]"
                        }`}
                      >
                        <span
                          className={`font-mono text-[10.5px] ${
                            d.chart_date === today
                              ? "text-[#1B4FD8] font-bold"
                              : "text-[#475569]"
                          }`}
                        >
                          {d.chart_date}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[10.5px] font-bold text-[#0F172A]">
                            {d.entry_count ?? 0}
                          </span>
                          <span className="text-[9.5px] text-[#94A3B8]">
                            entries
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Panel>

            {/* Trends -- today's charted readings */}
            <TrendPanel title="Heart Rate — today" color="#DC2626" unit="bpm" data={pt.hrTrend} />
            <TrendPanel title="Systolic BP — today" color="#7C3AED" unit="mmHg" data={pt.bpTrend} />

            {/* Ventilation */}
            <Panel
              title="Mechanical Ventilation"
              accent="#0EA5E9"
              actions={
                <span className="text-[10.5px] font-semibold text-[#0369A1] bg-[#E0F2FE] px-1.5 py-0.5">
                  {pt.vent ? pt.vent.mode : "Not charted"}
                </span>
              }
            >
              {pt.vent ? (
                <div className="grid grid-cols-3 gap-px bg-[#EDF1F7] border border-[#EDF1F7]">
                  {[
                    { l: "FiO₂", v: pt.vent.fio2 === "—" ? "—" : `${pt.vent.fio2.replace("%", "")}%` },
                    { l: "PEEP", v: pt.vent.peep === "—" ? "—" : `${pt.vent.peep} cmH₂O` },
                    { l: "Tidal Vol", v: pt.vent.tv === "—" ? "—" : `${pt.vent.tv} mL` },
                    { l: "Set RR", v: pt.vent.rr === "—" ? "—" : `${pt.vent.rr}/min` },
                    { l: "PIP", v: pt.vent.pip === "—" ? "—" : `${pt.vent.pip} cmH₂O` },
                    { l: "Mode", v: pt.vent.mode },
                  ].map((x) => (
                    <div key={x.l} className="bg-white px-2.5 py-2">
                      <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                        {x.l}
                      </div>
                      <div className="font-mono text-[12.5px] font-bold text-[#0F172A] mt-0.5">
                        {x.v}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyNote>No ventilator settings charted today.</EmptyNote>
              )}
            </Panel>

            {/* Sedation */}
            <Panel title="Sedation — RASS" accent="#7C3AED">
              {pt.live?.rass ? (
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 flex items-center justify-center font-mono text-[22px] font-extrabold ${
                      pt.live.rass.score <= -3 || pt.live.rass.score >= 2
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : "bg-[#DCFCE7] text-[#15803D]"
                    }`}
                  >
                    {pt.live.rass.score > 0 ? `+${pt.live.rass.score}` : pt.live.rass.score}
                  </div>
                  <div className="text-[11.5px] text-[#475569] leading-relaxed">
                    <div className="font-semibold text-[#1E293B]">{pt.live.rass.label}</div>
                    <div>Charted at {pt.live.rass.at}. Target −2 to 0; reassess two-hourly.</div>
                  </div>
                </div>
              ) : (
                <EmptyNote>No RASS charted today.</EmptyNote>
              )}
            </Panel>

            {/* Intake / Output */}
            <Panel
              title="Intake / Output — today"
              accent="#0891B2"
              actions={
                pt.live?.io ? (
                  <span className="text-[10px] text-[#64748B]">
                    {pt.live.io.source === "summary" ? "24h balance" : "from hourly rows"}
                  </span>
                ) : undefined
              }
            >
              {pt.live?.io ? (
                <>
                  <div className="grid grid-cols-2 gap-4 text-[11.5px]">
                    {(
                      [
                        ["Intake", pt.live.io.intake, pt.live.io.totalIn, "Total In"],
                        ["Output", pt.live.io.output, pt.live.io.totalOut, "Total Out"],
                      ] as const
                    ).map(([title, lines, total, totalLabel]) => (
                      <div key={title}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] mb-1.5">
                          {title}
                        </div>
                        {lines.length === 0 && <div className="text-[#94A3B8]">None charted</div>}
                        {lines.map((l) => (
                          <div key={l.label} className="flex justify-between py-0.5">
                            <span className="text-[#64748B]">{l.label}</span>
                            <span className="font-mono font-semibold text-[#1E293B]">
                              {l.ml.toLocaleString("en-IN")} mL
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-1.5 mt-1 border-t border-[#EDF1F7] font-bold">
                          <span className="text-[#334155]">{totalLabel}</span>
                          <span className="font-mono text-[#0F172A]">{total.toLocaleString("en-IN")} mL</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className={`mt-3 px-3 py-2 border text-[12px] font-bold text-center ${
                      Math.abs(pt.live.io.balance) >= 1000
                        ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                        : "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
                    }`}
                  >
                    Net Balance {pt.live.io.balance > 0 ? "+" : ""}
                    {pt.live.io.balance.toLocaleString("en-IN")} mL
                  </div>
                </>
              ) : (
                <EmptyNote>No intake or output charted today.</EmptyNote>
              )}
            </Panel>

            {/* Drugs on today's chart */}
            <Panel
              title="Drug Chart — today"
              accent="#DB2777"
              actions={
                <Btn
                  variant="outline"
                  size="xs"
                  onClick={() => setShowDripModal(true)}
                >
                  + Add Drip
                </Btn>
              }
            >
              {pt.infusions.length === 0 ? (
                <EmptyNote>Nothing on today&apos;s drug chart.</EmptyNote>
              ) : (
                <div className="space-y-2">
                  {pt.infusions.map((inf, i) => (
                    <div
                      key={`${inf.drug}-${i}`}
                      className="border border-[#E2E8F0] px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-[12px] font-bold text-[#0F172A] truncate">
                          {inf.drug}
                        </div>
                        <div className="text-[10.5px] text-[#94A3B8] font-mono truncate">
                          {inf.concentration}
                        </div>
                      </div>
                      <div className="font-mono text-[11.5px] font-semibold text-[#1B4FD8] whitespace-nowrap">
                        {inf.rate}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Labs */}
            <Panel
              title="Labs"
              accent="#D97706"
              actions={
                <Btn
                  variant="outline"
                  size="xs"
                  onClick={() => setShowLabModal(true)}
                >
                  + Order
                </Btn>
              }
            >
              {pendingLabOrders.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Pending orders
                  </div>
                  {pendingLabOrders.map((o) => (
                    <div
                      key={o.id}
                      className="border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-[#92400E]">
                          {o.id}
                        </span>
                        <span className="text-[10px] font-bold text-[#B45309]">
                          {o.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#475569] truncate">
                        {o.tests
                          .map(
                            (t) =>
                              `${t.name}${t.urgency === "STAT" ? " (STAT)" : ""}`,
                          )
                          .join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {labResults.length > 0 && (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Latest results
                  </div>
                  <div className="divide-y divide-[#EDF1F7]">
                    {labResults.map((r) => (
                      <div key={r.key} className="flex items-center justify-between py-1.5 gap-2">
                        <span className="text-[11.5px] text-[#475569] truncate">{r.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-mono text-[11.5px] font-bold ${
                              r.abnormal ? "text-[#DC2626]" : "text-[#1E293B]"
                            }`}
                          >
                            {r.value}
                          </span>
                          <span className="font-mono text-[10px] text-[#94A3B8] w-20 text-right">
                            {r.at}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {pt.live?.chartLabs && (
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Charted on flowsheet{pt.live.chartLabs.at ? ` · ${pt.live.chartLabs.at}` : ""}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4">
                    {pt.live.chartLabs.values.map((v) => (
                      <div key={v.label} className="flex justify-between py-0.5 text-[11.5px]">
                        <span className="text-[#475569]">{v.label}</span>
                        <span className="font-mono font-semibold text-[#1E293B]">{v.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pendingLabOrders.length === 0 && labResults.length === 0 && !pt.live?.chartLabs && (
                <EmptyNote>No lab orders or results for this patient yet.</EmptyNote>
              )}
            </Panel>

            {/* Care team and today's plan, from the chart */}
            <Panel title="Care Team & Today's Plan" accent="#059669">
              {(pt.live?.careTeam.length ?? 0) === 0 && (pt.live?.plan.length ?? 0) === 0 ? (
                <EmptyNote>
                  Consultants, shift nurses and the day plan appear once they are
                  entered on the flowsheet.
                </EmptyNote>
              ) : (
                <div className="space-y-3">
                  {(pt.live?.careTeam.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      {pt.live!.careTeam.map((m) => (
                        <div key={m.role} className="flex justify-between gap-3 text-[11.5px]">
                          <span className="text-[#64748B]">{m.role}</span>
                          <span className="font-semibold text-[#1E293B] truncate">{m.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(pt.live?.plan.length ?? 0) > 0 && (
                    <div className="border-t border-[#EDF1F7] pt-2 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                        Day plan
                      </div>
                      {pt.live!.plan.map((p, i) => (
                        <div key={i} className="text-[11.5px]">
                          <span className="font-mono text-[#94A3B8] mr-1.5">{p.time || "—"}</span>
                          <span className="text-[#1E293B]">{p.order}</span>
                          {p.by && <span className="text-[#94A3B8]"> · {p.by}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="text-[11.5px] text-[#94A3B8] py-2">{children}</div>
}

function TrendPanel({
  title,
  color,
  unit,
  data,
}: {
  title: string
  color: string
  unit: string
  data: { t: string ;v: number }[]
}) {
  return (
    <Panel title={title} accent={color}>
      {data.length === 0 ? (
        <EmptyNote>No readings charted today.</EmptyNote>
      ) : (
        <>
          <MiniTrend data={data} color={color} unit={unit} />
          <div className="flex justify-between mt-2 text-[11px] text-[#64748B] font-mono">
            <span>Min {Math.min(...data.map((d) => d.v))}</span>
            <span>Max {Math.max(...data.map((d) => d.v))}</span>
            <span className="font-bold text-[#0F172A]">
              Latest {data[data.length - 1].v} {unit} @{data[data.length - 1].t}:00
            </span>
          </div>
        </>
      )}
    </Panel>
  )
}
