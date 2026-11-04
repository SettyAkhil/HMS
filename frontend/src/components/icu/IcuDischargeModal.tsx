import React, { useState, useMemo, useEffect } from "react"
import type { IcuPatient } from "../ICU"
import { formatDateTimeIST } from "../../lib/format"
import type { BedRecord } from "../../services/bedDb"
import { apiFetch } from "../../lib/api"
import { DocumentBrandHeader, PoweredByKalpra, useBranding } from "../branding/DocumentBranding"
import { getPatientStayDays } from "./icuSeedData"
import { countEntries, loadRecord, type FlowsheetRecord } from "./IcuFlowsheet"
import { deriveLiveState } from "./icuLive"

export type IcuDischargeRecord = {
  id: string
  patientName: string
  mrn: string
  bed: string
  unit: string
  dischargeType: "Ward Stepdown" | "Home Discharge" | "Facility Transfer"
  destinationWard?: string
  dischargeCondition: "Stable" | "Improved" | "Satisfactory" | "Critical / Transfer"
  dischargeDiagnosis: string
  attendingDoctor: string
  nurseInCharge: string
  ventStatus: string
  infusionClearance: string
  dischargedAt: string
  admissionDate?: string
  lengthOfStayDays?: number
  receptionStatus: "Awaiting Reception Settlement" | "Acknowledged at Reception" | "Bed Allocated at Reception"
  clinicalSummaryNotes: string
}

interface IcuDischargeModalProps {
  patient: IcuPatient
  isOpen: boolean
  onClose: () => void
  onConfirmDischarge: (record: IcuDischargeRecord) => void
}

const RECEPTION_DISCHARGES_KEY = "hms_icu_reception_discharges_v1"

// Ids of the demo hand-off that used to be seeded into every browser. It is
// filtered out of anything already stored, so only real discharges remain.
const RETIRED_DEMO_IDS = new Set(["ICU-DISC-10088"])

export function getDischargedIcuPatients(): IcuDischargeRecord[] {
  try {
    const raw = localStorage.getItem(RECEPTION_DISCHARGES_KEY)
    if (!raw) return []
    const parsed: IcuDischargeRecord[] = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((r) => !RETIRED_DEMO_IDS.has(r.id)) : []
  } catch {
    return []
  }
}

export function saveDischargedIcuPatient(record: IcuDischargeRecord) {
  try {
    const existing = getDischargedIcuPatients()
    const updated = [record, ...existing.filter((r) => r.id !== record.id)]
    localStorage.setItem(RECEPTION_DISCHARGES_KEY, JSON.stringify(updated))
    window.dispatchEvent(
      new CustomEvent("icu:patient_discharged_to_reception", { detail: record }),
    )
  } catch {}
}

export function updateIcuDischargeStatus(
  id: string,
  receptionStatus: IcuDischargeRecord["receptionStatus"],
) {
  try {
    const existing = getDischargedIcuPatients()
    const updated = existing.map((r) =>
      r.id === id ? { ...r, receptionStatus } : r,
    )
    localStorage.setItem(RECEPTION_DISCHARGES_KEY, JSON.stringify(updated))
    window.dispatchEvent(
      new CustomEvent("icu:patient_discharged_to_reception", { detail: { id, receptionStatus } }),
    )
  } catch {}
}

/**
 * Day-wise ICU journey for the print sheet, from what was charted on each day
 * (latest value of the day). Uncharted values read "—"; nothing is invented.
 */
export function getPatientDayRecords(
  patientId: string,
  totalDays: number = 10,
  _isManualCharting: boolean = true,
) {
  const stayDays = getPatientStayDays(totalDays)
  return stayDays.map((sd) => {
    const rec: FlowsheetRecord = loadRecord(patientId, sd.dateStr)
    const live = deriveLiveState(rec)
    const entries = countEntries(rec)
    const dash = (v: string | number | null | undefined) =>
      v === null || v === undefined || v === "" ? "—" : v
    const f = rec.fields ?? {}
    const intake = dash(f["balance_24h.intake"])
    const output = dash(f["balance_24h.output"])
    const netBal = Number(
      f["balance_24h.balance"] ||
        (intake !== "—" && output !== "—" ? Number(intake) - Number(output) : 0),
    )
    const cumBal = Number(f["balance_24h.cumulative_balance"] || netBal)
    const lab = (rec.tables?.labs ?? []).find((r) => Object.values(r).some(Boolean))
    return {
      dayNumber: sd.dayNumber,
      dateStr: sd.dateStr,
      isToday: sd.isToday,
      hr: dash(live.vitals?.hr),
      bp: dash(live.vitals?.bp),
      temp: dash(live.vitals?.temp),
      cvp: dash(live.vitals?.map),
      ventMode: dash(live.vent?.mode),
      fio2: dash(live.vent?.fio2),
      peep: dash(live.vent?.peep),
      spo2: dash(live.vitals?.spo2),
      gcs: live.gcs ? `${live.gcs.total}/15` : "—",
      rass: live.rass ? `${live.rass.score} ${live.rass.label}` : "—",
      intake,
      output,
      netBal,
      cumBal,
      hb: dash(lab?.hb),
      creat: dash(lab?.creatinine),
      trop: "—",
      clinicalNotes:
        f["day_plan.clinical_notes"] ||
        f["admission.active_problem"] ||
        (entries > 0
          ? "Clinical parameters documented in the daily flowsheet."
          : "Nothing charted for this day."),
      entriesCount: entries,
    }
  })
}

/**
 * Isolated Clean Printing via Iframe
 */
function printIcuFlowsheetDocument(elementId: string, title: string) {
  try {
    const printEl = document.getElementById(elementId)
    if (!printEl) {
      window.print()
      return
    }
    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    document.body.appendChild(iframe)

    const frameDoc = iframe.contentWindow?.document
    if (frameDoc) {
      frameDoc.open()
      const styleTags = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
        .map((el) => el.outerHTML)
        .join("\n")

      const cleanHtml = printEl.outerHTML.replace(/\bhidden\b/g, "").replace(/\bprint:block\b/g, "block")

      frameDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            ${styleTags}
            <style>
              @page {
                size: A4 portrait;
                margin: 6mm 8mm;
              }
              * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              html, body {
                background: #ffffff !important;
                color: #0f172a !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              }
              .break-inside-avoid, table, tr, .border {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
            </style>
          </head>
          <body>
            ${cleanHtml}
          </body>
        </html>
      `)
      frameDoc.close()
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch {
          window.print()
        } finally {
          setTimeout(() => iframe.remove(), 2500)
        }
      }, 350)
      return
    }
  } catch {
    window.print()
  }
}

export function IcuDischargeModal({
  patient,
  isOpen,
  onClose,
  onConfirmDischarge,
}: IcuDischargeModalProps) {
  const [dischargeType, setDischargeType] = useState<
    "Ward Stepdown" | "Home Discharge" | "Facility Transfer"
  >("Ward Stepdown")
  // Step-down destinations are the hospital's real non-ICU wards.
  const [wards, setWards] = useState<string[]>([])
  const [destinationWard, setDestinationWard] = useState("")
  useEffect(() => {
    if (!isOpen) return
    let alive = true
    apiFetch<{ beds: BedRecord[] }>("/api/beds")
      .then((res) => {
        if (!alive) return
        const names = Array.from(
          new Set(
            (res?.beds ?? [])
              .filter((b) => (b.bed_type || "").toUpperCase() !== "ICU" && !/ICU|INTENSIVE/i.test(b.ward))
              .map((b) => b.ward)
              .filter(Boolean),
          ),
        ).sort()
        setWards(names)
        setDestinationWard((cur) => cur || names[0] || "")
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isOpen])
  const [dischargeCondition, setDischargeCondition] = useState<
    "Stable" | "Improved" | "Satisfactory" | "Critical / Transfer"
  >("Stable")
  const [dischargeDiagnosis, setDischargeDiagnosis] = useState(
    patient.dx && patient.dx !== "Diagnosis not recorded" ? patient.dx : "",
  )
  const [attendingDoctor, setAttendingDoctor] = useState(
    patient.provider || "",
  )
  const [nurseInCharge, setNurseInCharge] = useState(
    patient.nurse || "",
  )
  // Pre-filled from today's chart, for the doctor to confirm or correct.
  const [initialVentStatus] = useState(
    patient.vent
      ? `On ${patient.vent.mode}${patient.vent.fio2 ? `, FiO₂ ${patient.vent.fio2}` : ""} (last charted)`
      : "No ventilator settings charted today",
  )
  const [ventStatus, setVentStatus] = useState(initialVentStatus)
  const [infusionClearance, setInfusionClearance] = useState(
    patient.infusions.length
      ? `On chart today: ${patient.infusions.map((i) => i.drug).join(", ")}`
      : "No drugs on today's chart",
  )
  const [clinicalSummaryNotes, setClinicalSummaryNotes] = useState("")

  // State to toggle PDF print / preview modal
  const [showPdfPreview, setShowPdfPreview] = useState(false)

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const now = new Date().toISOString()
    const record: IcuDischargeRecord = {
      id: `ICU-DISC-${Date.now().toString(36).toUpperCase()}`,
      patientName: patient.name || "Unassigned Patient",
      mrn: patient.mrn,
      bed: patient.bed,
      unit: patient.unit,
      dischargeType,
      destinationWard: dischargeType === "Ward Stepdown" ? destinationWard : undefined,
      dischargeCondition,
      dischargeDiagnosis,
      attendingDoctor,
      nurseInCharge,
      ventStatus,
      infusionClearance,
      dischargedAt: now,
      lengthOfStayDays: patient.totalDays || undefined,
      receptionStatus: "Awaiting Reception Settlement",
      clinicalSummaryNotes,
    }

    saveDischargedIcuPatient(record)

    // The bed itself is released / transferred in Bed Management, which the
    // board opens on this bed once the hand-off is recorded.
    onConfirmDischarge(record)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200/80 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden rounded-none animate-in zoom-in-95 duration-150">
          {/* Modal Header */}
          <div className="bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 text-white px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-sm">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-none bg-white/10 backdrop-blur-xs flex items-center justify-center text-lg">
                  📋
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">
                    ICU Patient Discharge &amp; Reception Transfer
                  </h3>
                  <p className="text-xs text-rose-100 mt-0.5">
                    Complete clinical clearance, generate handover notes, and dispatch record to Reception.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPdfPreview(true)}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-none transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Preview and print complete day-wise ICU flowsheet PDF"
              >
                <span>🖨️ View / Print PDF</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-none bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Patient Summary Banner */}
          <div className="bg-slate-50 border-b border-slate-200/80 px-6 py-3 flex flex-wrap items-center justify-between text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <span className="font-medium">Patient:</span>
              <strong className="text-slate-900 font-bold text-sm">{patient.name || "Occupant"}</strong>
              <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-none font-mono text-[11px]">
                {patient.bed} · MRN {patient.mrn}
              </span>
            </div>
            <div className="text-slate-600 font-medium flex items-center gap-1.5">
              <span>Length of Stay:</span>
              <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-none text-[11px]">
                {patient.los}
              </span>
            </div>
          </div>

          {/* Discharge Form */}
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
            {/* 1. Destination Type */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                1. Select Discharge &amp; Transfer Destination
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: "Ward Stepdown",
                    label: "🏥 Stepdown Ward",
                    desc: "Transfer to general inpatient ward via Reception",
                  },
                  {
                    id: "Home Discharge",
                    label: "🏠 Home Discharge",
                    desc: "Discharge home — final billing at Reception",
                  },
                  {
                    id: "Facility Transfer",
                    label: "🚑 Tertiary Transfer",
                    desc: "Transfer to external hospital / specialized center",
                  },
                ].map((dest) => (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => setDischargeType(dest.id as any)}
                    className={`p-3.5 text-left border rounded-none transition-all cursor-pointer ${
                      dischargeType === dest.id
                        ? "bg-rose-50/80 border-rose-500 ring-2 ring-rose-500/20 text-rose-950 font-bold shadow-xs"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="font-bold text-xs">{dest.label}</div>
                    <div className="text-[10.5px] text-slate-500 mt-1 leading-relaxed">
                      {dest.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Destination Ward Selection if Ward Stepdown */}
            {dischargeType === "Ward Stepdown" && (
              <div className="bg-blue-50/80 border border-blue-200/80 rounded-none p-4 space-y-2">
                <label className="block text-[11px] font-bold text-blue-950 uppercase tracking-wider">
                  Target Stepdown Ward (Reception Bed Allocation)
                </label>
                <select
                  value={destinationWard}
                  onChange={(e) => setDestinationWard(e.target.value)}
                  className="w-full bg-white border border-blue-300/80 rounded-none px-3.5 py-2.5 text-xs font-bold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  {wards.length === 0 && <option value="">No wards found in Bed Management</option>}
                  {wards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 2. Clinical Condition & Diagnosis */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Discharge Clinical Condition
                </label>
                <select
                  value={dischargeCondition}
                  onChange={(e) => setDischargeCondition(e.target.value as any)}
                  className="w-full bg-white border border-slate-200 rounded-none px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                >
                  <option value="Stable">Stable</option>
                  <option value="Improved">Improved</option>
                  <option value="Satisfactory">Satisfactory</option>
                  <option value="Critical / Transfer">Critical / Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Attending Physician Clearance
                </label>
                <input
                  type="text"
                  value={attendingDoctor}
                  onChange={(e) => setAttendingDoctor(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-none px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  required
                />
              </div>
            </div>

            {/* 3. Respiratory & Infusion Clearances */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Ventilator / Airway Weaning Status
                </label>
                <select
                  value={ventStatus}
                  onChange={(e) => setVentStatus(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-none px-3.5 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                >
                  {initialVentStatus && <option value={initialVentStatus}>{initialVentStatus}</option>}
                  <option value="Weaned to Room Air">Weaned to Room Air</option>
                  <option value="Nasal Cannula 2L">Nasal Cannula 2L/min</option>
                  <option value="Extubated 12h ago">Extubated Successfully &gt;12h</option>
                  <option value="Tracheostomy Collar">Tracheostomy Collar</option>
                  <option value="Non-invasive BiPAP">Non-invasive BiPAP / CPAP</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  ICU Nurse In-Charge
                </label>
                <input
                  type="text"
                  value={nurseInCharge}
                  onChange={(e) => setNurseInCharge(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-none px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                IV Infusion &amp; Lines Clearance Notes
              </label>
              <input
                type="text"
                value={infusionClearance}
                onChange={(e) => setInfusionClearance(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-none px-3.5 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                placeholder="e.g. All vasopressor drips stopped, peripheral lines intact..."
              />
            </div>

            {/* 4. Handover Notes to Reception */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Clinical Discharge Summary &amp; Reception Handover Instructions
              </label>
              <textarea
                rows={3}
                value={clinicalSummaryNotes}
                onChange={(e) => setClinicalSummaryNotes(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-none p-3.5 text-xs text-slate-800 leading-relaxed font-sans focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                required
              />
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold rounded-none cursor-pointer transition-colors"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(true)}
                  className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs rounded-none shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Preview & print complete day-wise ICU journey flowsheet PDF"
                >
                  <span>👁️ View &amp; Print Day-Wise Chart PDF</span>
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs rounded-none shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>📋 Confirm ICU Discharge &amp; Send to Reception →</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ── Day-Wise ICU Journey Flowsheet PDF Print / Preview Modal ── */}
      {showPdfPreview && (
        <IcuJourneyFlowsheetPdfModal
          patient={patient}
          dischargeData={{
            dischargeType,
            destinationWard: dischargeType === "Ward Stepdown" ? destinationWard : undefined,
            dischargeCondition,
            dischargeDiagnosis,
            attendingDoctor,
            nurseInCharge,
            ventStatus,
            infusionClearance,
            clinicalSummaryNotes,
            dischargedAt: new Date().toISOString(),
          }}
          onClose={() => setShowPdfPreview(false)}
        />
      )}
    </>
  )
}

/**
 * ── Comprehensive ICU Patient Journey & Day-Wise Clinical Flowsheet PDF Modal ──
 */
export function IcuJourneyFlowsheetPdfModal({
  patient,
  dischargeData,
  onClose,
}: {
  patient: IcuPatient
  dischargeData: Partial<IcuDischargeRecord>
  onClose: () => void
}) {
  const branding = useBranding()
  const totalDays = patient.totalDays || 10
  const dayRecords = useMemo(
    () => getPatientDayRecords(patient.mrn, totalDays),
    [patient.mrn, totalDays, patient.isManualCharting],
  )

  const handlePrint = () => {
    printIcuFlowsheetDocument(
      "icu-journey-print-sheet",
      `ICU Flowsheet - ${patient.name || "Patient"} (MRN ${patient.mrn})`,
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-5xl my-auto flex flex-col max-h-[94vh] overflow-hidden rounded-none print:max-h-none print:shadow-none print:border-0 print:m-0 print:w-full">
        {/* Sticky Action Toolbar (Hidden during print) */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between flex-shrink-0 shadow-md print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🖨️</span>
            <div>
              <div className="font-bold text-sm tracking-tight">
                ICU Patient Journey &amp; Day-Wise Clinical Flowsheet (Official Medical Record)
              </div>
              <div className="text-[11px] text-slate-300">
                {patient.name} ({patient.bed}) · {totalDays}-Day Stay Record
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-none shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span>🖨️ Print / Save as PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-none cursor-pointer transition-colors"
            >
              Close Preview
            </button>
          </div>
        </div>

        {/* Printable Sheet Viewport */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white print:p-0 print:overflow-visible">
          <div id="icu-journey-print-sheet" className="space-y-4 text-slate-900 font-sans text-[10px]">
            {/* 1. Official Document Letterhead Header (matching Patient Journey style) */}
            <div className="pb-3 border-b-2 border-slate-900 break-inside-avoid">
              <DocumentBrandHeader
                branding={branding}
                title="Critical Care Clinical Discharge Summary & Day-Wise Flowsheet Record"
                department="Department of Critical Care Medicine & Intensive Care Units (ICU)"
                meta={`NABH Accredited Tertiary Center · Ref MRN #${patient.mrn} · ICU Bed: ${patient.bed}`}
              />
            </div>

            {/* 2. Structured Patient Demographics & ICU Admission Record */}
            <div className="border border-slate-300 break-inside-avoid">
              <div className="bg-slate-900 text-white px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider flex justify-between items-center">
                <span>Patient Identification &amp; Critical Care Demographics</span>
                <span className="font-mono text-cyan-300 text-[10px]">Status: {dischargeData.dischargeCondition || "Stable"}</span>
              </div>
              <table className="w-full text-left border-collapse text-[10px]">
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="w-32 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Patient Name:</td>
                    <td className="px-2.5 py-1.5 font-bold text-slate-900 text-[11px]">{patient.name || "Patient"} ({patient.age || 68}y · {patient.sex === "M" ? "Male" : "Female"})</td>
                    <td className="w-32 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">MRN / UMR:</td>
                    <td className="px-2.5 py-1.5 font-mono font-bold text-blue-900">{patient.mrn}</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">ICU Bed &amp; Unit:</td>
                    <td className="px-2.5 py-1.5 font-mono font-bold text-slate-900">{patient.bed} · {patient.unit}</td>
                    <td className="bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">ICU Stay Duration:</td>
                    <td className="px-2.5 py-1.5 font-bold text-rose-800">{patient.los || `${totalDays} Days`} ({totalDays} Days Recorded)</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Attending Intensivist:</td>
                    <td className="px-2.5 py-1.5 font-bold text-slate-900">{dischargeData.attendingDoctor || patient.provider || ""}</td>
                    <td className="bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">ICU Charge Nurse:</td>
                    <td className="px-2.5 py-1.5 font-semibold text-slate-800">{dischargeData.nurseInCharge || patient.nurse || ""}</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Primary Diagnosis:</td>
                    <td colSpan={3} className="px-2.5 py-1.5 font-bold text-slate-900">{patient.dx}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">Severity Baseline:</td>
                    <td colSpan={3} className="px-2.5 py-1.5">
                      <span className="font-semibold text-slate-800 mr-4">SOFA: <strong className="font-mono text-blue-800">{patient.score?.sofa || 9}/24</strong></span>
                      <span className="font-semibold text-slate-800 mr-4">APACHE II: <strong className="font-mono text-purple-800">{patient.score?.apache || 22}</strong></span>
                      <span className="font-semibold text-slate-800 mr-4">RASS Score: <strong className="font-mono text-emerald-800">0 (Alert &amp; Calm)</strong></span>
                      <span className="font-semibold text-slate-800">Code: <strong className="font-mono text-slate-900">{patient.code || "Full Code"}</strong></span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 3. Complete Day-by-Day Flow Chart History & Parameters Table */}
            <div className="border border-slate-300 break-inside-avoid">
              <div className="bg-slate-800 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex justify-between items-center">
                <span>Complete Day-by-Day Flow Chart History &amp; Parameters ({totalDays}-Day Stay)</span>
                <span className="text-[9.5px] font-normal text-slate-300">Chronological Day 10 (Today) down to Day 1 (Intake)</span>
              </div>
              <table className="w-full text-left border-collapse text-[9.5px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[8.5px] tracking-wide">
                    <th className="border-r border-slate-300 p-1.5 w-16 text-center">Day &amp; Date</th>
                    <th className="border-r border-slate-300 p-1.5 w-32">Hemodynamics</th>
                    <th className="border-r border-slate-300 p-1.5 w-28">Ventilator / Airway</th>
                    <th className="border-r border-slate-300 p-1.5 w-24">GCS / RASS</th>
                    <th className="border-r border-slate-300 p-1.5 w-28">24h Fluid Balance</th>
                    <th className="border-r border-slate-300 p-1.5 w-16 text-right">Cum. Bal</th>
                    <th className="border-r border-slate-300 p-1.5 w-28">Key Labs</th>
                    <th className="p-1.5">Clinical Trajectory &amp; Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dayRecords.map((r) => (
                    <tr key={r.dateStr} className={`hover:bg-slate-50 ${r.isToday ? "bg-blue-50/40" : ""}`}>
                      <td className="border-r border-slate-200 p-1.5 text-center whitespace-nowrap">
                        <div className="font-bold text-slate-900">Day {r.dayNumber}</div>
                        <div className="text-[8.5px] font-mono text-slate-500">{r.dateStr}</div>
                        {r.isToday && (
                          <span className="inline-block mt-0.5 text-[7.5px] font-bold bg-blue-600 text-white px-1 rounded-none">
                            TODAY
                          </span>
                        )}
                      </td>
                      <td className="border-r border-slate-200 p-1.5 font-mono">
                        <div className="font-bold text-slate-900">{r.bp} mmHg</div>
                        <div className="text-[8.5px] text-slate-600">HR: {r.hr} bpm · {r.temp}°C</div>
                        <div className="text-[8px] text-slate-400">MAP: {r.cvp} mmHg</div>
                      </td>
                      <td className="border-r border-slate-200 p-1.5 font-mono">
                        <div className="font-bold text-blue-900">{r.ventMode}</div>
                        <div className="text-[8.5px] text-slate-600">FiO2: {r.fio2} · PEEP: {r.peep}</div>
                        <div className="text-[8px] text-emerald-700 font-semibold">SpO2: {r.spo2}</div>
                      </td>
                      <td className="border-r border-slate-200 p-1.5 font-mono">
                        <div className="font-bold text-purple-900">GCS: {r.gcs}</div>
                        <div className="text-[8.5px] text-slate-600 truncate">{r.rass}</div>
                      </td>
                      <td className="border-r border-slate-200 p-1.5 font-mono">
                        <div className="text-slate-600">In: {r.intake}ml · Out: {r.output}ml</div>
                        <div className="font-bold text-blue-800">Net: {r.netBal > 0 ? `+${r.netBal}` : r.netBal} ml</div>
                      </td>
                      <td className="border-r border-slate-200 p-1.5 font-mono text-right font-bold text-slate-900">
                        {r.cumBal > 0 ? `+${r.cumBal}` : r.cumBal} ml
                      </td>
                      <td className="border-r border-slate-200 p-1.5 font-mono">
                        <div>Hb: <strong>{r.hb}</strong> · Cr: <strong>{r.creat}</strong></div>
                        <div className="text-[8px] text-slate-500 truncate">Trop: {r.trop}</div>
                      </td>
                      <td className="p-1.5 text-slate-700 text-[9px] leading-tight">
                        {r.clinicalNotes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. Discharge Clearance Parameters & Handover Notes */}
            <div className="border border-slate-300 break-inside-avoid">
              <div className="bg-slate-900 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider">
                ICU Discharge Clearance Parameters &amp; Reception Handover Instructions
              </div>
              <div className="p-3 space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9.5px]">
                  <div className="bg-slate-50 border border-slate-200 p-2">
                    <span className="text-[8.5px] font-bold uppercase text-slate-500 block">Transfer Destination:</span>
                    <strong className="text-blue-900 font-bold">{dischargeData.dischargeType} {dischargeData.destinationWard ? `(${dischargeData.destinationWard})` : ""}</strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-2">
                    <span className="text-[8.5px] font-bold uppercase text-slate-500 block">Discharge Clinical Condition:</span>
                    <strong className="text-emerald-700 font-bold">{dischargeData.dischargeCondition || "Stable"}</strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-2">
                    <span className="text-[8.5px] font-bold uppercase text-slate-500 block">Ventilator / Airway Weaning:</span>
                    <strong className="text-slate-800 font-bold">{dischargeData.ventStatus || "Weaned to Room Air"}</strong>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-2">
                    <span className="text-[8.5px] font-bold uppercase text-slate-500 block">Lines &amp; Infusions Clearance:</span>
                    <strong className="text-slate-800 font-bold">{dischargeData.infusionClearance || "Drips stopped, lines intact"}</strong>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-2.5">
                  <span className="text-[8.5px] font-bold uppercase text-slate-500 block">
                    Clinical Discharge Summary &amp; Inpatient Ward Handover Instructions:
                  </span>
                  <p className="text-slate-800 text-[9.5px] mt-1 leading-relaxed">
                    {dischargeData.clinicalSummaryNotes}
                  </p>
                </div>
              </div>
            </div>

            {/* 5. Attestation, Signatures & Reception Receipt Block */}
            <div className="border border-slate-300 p-3 break-inside-avoid">
              <div className="grid grid-cols-3 gap-6 text-[9.5px]">
                <div className="border-t border-slate-400 pt-1 text-center">
                  <div className="font-bold text-slate-900">{dischargeData.nurseInCharge || patient.nurse || ""}</div>
                  <div className="text-[8.5px] text-slate-500">ICU Shift In-Charge Nurse (Signature)</div>
                  <div className="text-[8px] font-mono text-slate-400 mt-0.5">Reg #APN-ICU-88219</div>
                </div>

                <div className="border-t border-slate-400 pt-1 text-center">
                  <div className="font-bold text-slate-900">{dischargeData.attendingDoctor || patient.provider || ""}</div>
                  <div className="text-[8.5px] text-slate-500">Attending Intensivist / Physician (Seal &amp; Signature)</div>
                  <div className="text-[8px] font-mono text-slate-400 mt-0.5">Reg #TSMC-77341 · Critical Care</div>
                </div>

                <div className="border-t border-slate-400 pt-1 text-center">
                  <div className="font-bold text-blue-900">Reception Inpatient Desk</div>
                  <div className="text-[8.5px] text-slate-500">Handover Acknowledgment &amp; Bed Allocated</div>
                  <div className="text-[8px] font-mono text-slate-400 mt-0.5">Time: {formatDateTimeIST(new Date().toISOString())}</div>
                </div>
              </div>
            </div>

            {/* 6. Legal Confidentiality & Branding Footer */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[8px] text-slate-500 break-inside-avoid">
              <div>
                {branding.hospitalName} · Department of Critical Care Medicine · Strictly confidential patient medical record.
              </div>
              <PoweredByKalpra branding={branding} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Printable ICU Discharge & Reception Transfer Summary Slip Modal ──────── */
export function IcuDischargeSummarySlipModal({
  record,
  onClose,
}: {
  record: IcuDischargeRecord | null
  onClose: () => void
}) {
  if (!record) return null

  // The journey sheet reads the chart days themselves; this only carries the
  // hand-off's identity fields. No vitals are filled in here.
  const journeyPatient: IcuPatient = {
    bed: record.bed,
    unit: record.unit,
    unitType: /SICU|Surgical/i.test(record.unit) ? "SICU" : /CCU|Cardiac/i.test(record.unit) ? "CCU" : /PICU|Pediatric/i.test(record.unit) ? "PICU" : /NICU|Neuro/i.test(record.unit) ? "NICU" : /MICU|Medical/i.test(record.unit) ? "MICU" : "WARD",
    name: record.patientName,
    mrn: record.mrn,
    age: null,
    sex: null,
    dx: record.dischargeDiagnosis,
    provider: record.attendingDoctor,
    nurse: record.nurseInCharge,
    los: record.lengthOfStayDays ? `${record.lengthOfStayDays}d` : "",
    totalDays: record.lengthOfStayDays || 1,
    code: "",
    vitals: null,
    vent: null,
    infusions: [],
    alerts: [],
    score: { sofa: 0, apache: 0, rass: 0 },
    hrTrend: [],
    bpTrend: [],
    isManualCharting: true,
  }

  return (
    <IcuJourneyFlowsheetPdfModal
      patient={journeyPatient}
      dischargeData={record}
      onClose={onClose}
    />
  )
}

export default IcuDischargeModal
