import { useEffect, useMemo, useState } from "react"
import { Btn, AlertBanner } from "./shared"
import { Icon } from "./icons"
import { apiFetch, reportError } from "../lib/api"
import { formatDateTimeIST } from "../lib/format"
import {
  generateAndSaveDischargeSummary,
  type SavedDischargeSummary,
} from "../lib/dischargeSummary"
import { buildDischargeSummaryDocument } from "../lib/patientDocuments"
import { SendToPatientButton } from "./messaging/SendToPatientDialog"
import type { Notice } from "../types"
import {
  getDischargedIcuPatients,
  updateIcuDischargeStatus,
  type IcuDischargeRecord,
} from "./icu/IcuDischargeModal"
import { BedDatabase } from "../services/bedDb"
import { DischargeInsuranceCheck } from "./insurance/integrations"

const STEPS = ["Select Patient", "Review Checklist", "Confirm & Discharge"]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold border-2 transition-colors ${
                i < current
                  ? "bg-[#16A34A] border-[#16A34A] text-white"
                  : i === current
                    ? "bg-[#1B4FD8] border-[#1B4FD8] text-white"
                    : "bg-white border-[#DDE2EC] text-[#94A3B8]"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className={`text-[10.5px] font-medium mt-1 whitespace-nowrap ${
                i === current
                  ? "text-[#1B4FD8]"
                  : i < current
                    ? "text-[#16A34A]"
                    : "text-[#94A3B8]"
              }`}
            >
              {s}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`h-0.5 flex-1 mx-1.5 ${
                i < current ? "bg-[#16A34A]" : "bg-[#DDE2EC]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

type Bed = {
  id: number
  ward: string
  room_no: string
  bed_no: string
  bed_type: string
  status: "Available" | "Occupied" | "Maintenance"
  patient_id: string | null
  patient_name: string | null
  patient_last_name: string | null
  admission_date: string | null
  admission_id: number | null
}

type RoomChargeSegment = {
  ward: string
  room_no: string
  bed_no: string
  days: number
  daily_rate: number
  amount: number
}
type DischargeChecklist = {
  billing: {
    ok: boolean
    pending_invoices: { invoice_no: string ;due_amount: number }[]
  }
  prescriptions: { ok: boolean ;pending_count: number }
  documents: { count: number }
  room_charges: { segments: RoomChargeSegment[] ;total: number }
}

function formatINR(amount: number): string {
  return `₹${Math.round(amount || 0).toLocaleString("en-IN")}`
}

function occupantName(bed: Bed): string {
  return (
    `${bed.patient_name || ""} ${bed.patient_last_name || ""}`.trim() ||
    bed.patient_id ||
    "Patient"
  )
}

export default function Discharge({
  setNotice,
  onComplete,
}: {
  setNotice?: (n: Notice | null) => void
  onComplete: () => void
}) {
  const [step, setStep] = useState(0)
  const [beds, setBeds] = useState<Bed[]>([])
  const [loadingBeds, setLoadingBeds] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null)
  const [checklist, setChecklist] = useState<DischargeChecklist | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [dischargeReason, setDischargeReason] = useState("")
  const [discharging, setDischarging] = useState(false)
  const [summaryFailed, setSummaryFailed] = useState(false)
  const [savedSummary, setSavedSummary] = useState<SavedDischargeSummary | null>(null)
  const [icuDischarges, setIcuDischarges] = useState<IcuDischargeRecord[]>(() =>
    getDischargedIcuPatients(),
  )

  useEffect(() => {
    const handleUpdate = () => {
      setIcuDischarges(getDischargedIcuPatients())
    }
    window.addEventListener("icu:patient_discharged_to_reception", handleUpdate)
    window.addEventListener("storage", handleUpdate)
    return () => {
      window.removeEventListener("icu:patient_discharged_to_reception", handleUpdate)
      window.removeEventListener("storage", handleUpdate)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoadingBeds(true)
      try {
        const data = await apiFetch<{ beds: Bed[] }>("/api/beds")
        let list = (data.beds || []).filter((b) => b.status === "Occupied")
        if (list.length === 0) {
          list = (BedDatabase.getBeds() as any[]).filter((b) => b.status === "Occupied")
        }
        setBeds(list)
      } catch (error: any) {
        const local = (BedDatabase.getBeds() as any[]).filter((b) => b.status === "Occupied")
        setBeds(local)
      } finally {
        setLoadingBeds(false)
      }
    })()
  }, [])


  const filteredBeds = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return beds
    return beds.filter(
      (b) =>
        occupantName(b).toLowerCase().includes(q) ||
        (b.patient_id || "").toLowerCase().includes(q) ||
        b.ward.toLowerCase().includes(q) ||
        b.room_no.toLowerCase().includes(q),
    )
  }, [beds, search])

  const selectPatient = async (bed: Bed) => {
    setSelectedBed(bed)
    setStep(1)
    setChecklistLoading(true)
    setDischargeReason("")
    try {
      const data = await apiFetch<DischargeChecklist>(
        `/api/beds/${bed.id}/discharge-checklist`,
      )
      setChecklist(data)
    } catch (error: any) {
      reportError(setNotice, error, "Failed to load the discharge checklist.")
      setChecklist(null)
    } finally {
      setChecklistLoading(false)
    }
  }

  const checklistClear = checklist
    ? checklist.billing.ok && checklist.prescriptions.ok
    : false

  const confirmDischarge = async () => {
    if (!selectedBed) return
    setDischarging(true)
    setSummaryFailed(false)
    setSavedSummary(null)
    try {
      const roomChargeTotal = checklist?.room_charges.total
      await apiFetch(`/api/beds/${selectedBed.id}/release`, {
        method: "POST",
        body: JSON.stringify({
          discharge_override_reason: dischargeReason.trim() || undefined,
          room_charge_total: roomChargeTotal,
        }),
      })
      if (selectedBed.patient_id) {
        try {
          setSavedSummary(
            await generateAndSaveDischargeSummary(
              selectedBed.patient_id,
              selectedBed.admission_id ?? undefined,
            ),
          )
        } catch {
          setSummaryFailed(true)
        }
      }
      setStep(2)
    } catch (error: any) {
      reportError(setNotice, error, "Failed to discharge this patient.")
    } finally {
      setDischarging(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">
            Discharge Workflow
          </h1>
          <p className="text-[11.5px] text-[#64748B]">
            Guided discharge — real billing/prescription checklist, real bed
            release, auto-generated discharge summary.
          </p>
        </div>
        <Btn variant="ghost" size="sm" onClick={onComplete}>
          Close
        </Btn>
      </div>

      <div className="w-full p-5">
        <div className="bg-white border border-[#DDE2EC] rounded p-4 mb-5">
          <StepIndicator current={step} />
        </div>

        {step === 0 && (
          <div className="space-y-5">
            {icuDischarges.length > 0 && (
              <div className="bg-gradient-to-r from-red-50 via-rose-50 to-amber-50 border border-red-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                    <h2 className="text-sm font-semibold text-red-900">
                      ICU Discharge Handoffs Pending Reception ({icuDischarges.length})
                    </h2>
                  </div>
                  <span className="text-[11px] text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full font-medium">
                    Sent from ICU Portal
                  </span>
                </div>
                <p className="text-[12px] text-red-800 mb-4">
                  The following patients were discharged from ICU by intensive care staff and sent to Reception for ward stepdown allocation or final discharge settlement.
                </p>

                <div className="space-y-3">
                  {icuDischarges.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-white border border-red-100 rounded-lg p-3.5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">{rec.patientName}</span>
                          <span className="text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{rec.mrn}</span>
                          <span className="text-xs px-2 py-0.5 rounded font-medium bg-red-100 text-red-800">
                            {rec.dischargeType}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span><strong>Origin Bed:</strong> {rec.bed} ({rec.unit})</span>
                          <span><strong>Condition:</strong> {rec.dischargeCondition}</span>
                          {rec.destinationWard && (
                            <span><strong>Target Ward:</strong> {rec.destinationWard}</span>
                          )}
                          <span><strong>Doctor:</strong> {rec.attendingDoctor}</span>
                        </div>
                        {rec.clinicalSummaryNotes && (
                          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 italic">
                            "{rec.clinicalSummaryNotes}"
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        {rec.receptionStatus === "Awaiting Reception Settlement" ? (
                          <>
                            <Btn
                              variant="outline"
                              size="sm"
                              className="text-xs text-[#1B4FD8] border-[#1B4FD8] hover:bg-blue-50"
                              onClick={() => {
                                updateIcuDischargeStatus(rec.id, "Acknowledged at Reception")
                                setIcuDischarges(getDischargedIcuPatients())
                              }}
                            >
                              Acknowledge
                            </Btn>
                            <Btn
                              variant="primary"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                updateIcuDischargeStatus(rec.id, "Bed Allocated at Reception")
                                setIcuDischarges(getDischargedIcuPatients())
                              }}
                            >
                              Allocate Ward Bed
                            </Btn>
                          </>
                        ) : (
                          <span className="text-xs font-medium px-2.5 py-1 rounded bg-green-100 text-green-800 flex items-center gap-1">
                            ✓ {rec.receptionStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-[#DDE2EC] rounded p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Select the patient to discharge
              </h2>

            <div className="ai-search-bar mb-3">
              <Icon.Search />
              <input
                className="ai-search-input"
                placeholder="Search by patient name, ID, ward, or room..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {loadingBeds ? (
              <p className="text-[12.5px] text-[#64748B]">
                Loading occupied beds...
              </p>
            ) : filteredBeds.length === 0 ? (
              <p className="text-[12.5px] text-[#64748B]">
                No occupied beds match this search.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {filteredBeds.map((bed) => (
                  <button
                    key={bed.id}
                    onClick={() => void selectPatient(bed)}
                    className="w-full flex items-center justify-between p-3 border border-[#DDE2EC] rounded hover:border-[#1B4FD8] hover:bg-[#F8FAFC] transition-colors text-left"
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-gray-900">
                        {occupantName(bed)}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {bed.patient_id} · {bed.ward} · Room {bed.room_no} · Bed{" "}
                        {bed.bed_no}
                        {bed.admission_date
                          ? ` · Admitted ${formatDateTimeIST(bed.admission_date)}`
                          : ""}
                      </div>
                    </div>
                    <span className="text-[12px] font-medium text-[#1B4FD8]">
                      Select →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {step === 1 && selectedBed && (
          <div className="bg-white border border-[#DDE2EC] rounded p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              Discharge Checklist · {occupantName(selectedBed)}
            </h2>
            <p className="text-[11.5px] text-[#64748B] mb-4">
              {selectedBed.ward} · Room {selectedBed.room_no} · Bed{" "}
              {selectedBed.bed_no}
            </p>

            {/* Insured patients: is the insurance side ready for the claim? */}
            <div className="mb-4">
              <DischargeInsuranceCheck patientId={selectedBed.patient_id || undefined} patientName={occupantName(selectedBed)} />
            </div>

            {checklistLoading ? (
              <p className="text-[12.5px] text-[#64748B]">
                Loading checklist...
              </p>
            ) : checklist ? (
              <>
                {!checklistClear && (
                  <AlertBanner
                    type="warning"
                    title="Pending items found"
                    body="Billing dues or unfulfilled prescriptions are still open. You can still discharge (e.g. LAMA/DAMA), but confirm this is intentional."
                  />
                )}
                <div className="space-y-2 mt-3">
                  <div
                    className={`flex items-center justify-between p-3 rounded border ${
                      checklist.billing.ok
                        ? "bg-[#F0FDF4] border-[#BBF7D0]"
                        : "bg-[#FEF2F2] border-[#FCA5A5]"
                    }`}
                  >
                    <span className="text-[12.5px] font-medium text-gray-800">
                      Billing
                    </span>
                    <span
                      className={`text-[12px] font-semibold ${
                        checklist.billing.ok
                          ? "text-[#15803D]"
                          : "text-[#991B1B]"
                      }`}
                    >
                      {checklist.billing.ok
                        ? "Clear"
                        : `${checklist.billing.pending_invoices.length} pending invoice(s)`}
                    </span>
                  </div>
                  <div
                    className={`flex items-center justify-between p-3 rounded border ${
                      checklist.prescriptions.ok
                        ? "bg-[#F0FDF4] border-[#BBF7D0]"
                        : "bg-[#FEF2F2] border-[#FCA5A5]"
                    }`}
                  >
                    <span className="text-[12.5px] font-medium text-gray-800">
                      Prescriptions
                    </span>
                    <span
                      className={`text-[12px] font-semibold ${
                        checklist.prescriptions.ok
                          ? "text-[#15803D]"
                          : "text-[#991B1B]"
                      }`}
                    >
                      {checklist.prescriptions.ok
                        ? "Clear"
                        : `${checklist.prescriptions.pending_count} pending`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded border bg-[#F8FAFC] border-[#F1F5F9]">
                    <span className="text-[12.5px] font-medium text-gray-800">
                      Documents on file
                    </span>
                    <span className="text-[12px] font-semibold text-gray-700">
                      {checklist.documents.count}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#DDE2EC]">
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                    Room Charges
                  </div>
                  {checklist.room_charges.segments.length === 0 ? (
                    <p className="text-[12px] text-[#94A3B8]">
                      No room charges for this stay.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {checklist.room_charges.segments.map((seg, i) => (
                        <div
                          key={i}
                          className="flex justify-between text-[12px] text-gray-700"
                        >
                          <span>
                            {seg.ward} · Room {seg.room_no} · Bed {seg.bed_no} (
                            {seg.days}d @ {formatINR(seg.daily_rate)})
                          </span>
                          <span className="font-medium">
                            {formatINR(seg.amount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-[13px] font-semibold text-gray-900 pt-1.5 border-t border-[#F1F5F9]">
                        <span>Total</span>
                        <span>{formatINR(checklist.room_charges.total)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {!checklistClear && (
                  <div className="mt-4">
                    <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                      Reason for discharging with pending items
                    </label>
                    <input
                      className="w-full border border-[#DDE2EC] p-2 rounded text-[12.5px]"
                      placeholder="e.g. LAMA — patient insisted, dues to be settled later"
                      value={dischargeReason}
                      onChange={(e) => setDischargeReason(e.target.value)}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-[#B91C1C]">
                Could not load the checklist for this bed.
              </p>
            )}

            <div className="flex justify-between mt-5">
              <Btn variant="outline" size="md" onClick={() => setStep(0)}>
                ← Back
              </Btn>
              <Btn
                variant="primary"
                size="md"
                onClick={() => void confirmDischarge()}
                disabled={discharging || checklistLoading}
              >
                {discharging ? "Discharging..." : "Discharge Patient →"}
              </Btn>
            </div>
          </div>
        )}

        {step === 2 && selectedBed && (
          <div className="space-y-4">
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded p-4 flex items-center gap-3">
              <span className="text-[#16A34A] text-2xl">✓</span>
              <div>
                <div className="font-semibold text-[#15803D] text-sm">
                  {occupantName(selectedBed)} discharged
                </div>
                <div className="text-[12px] text-[#16A34A]">
                  Bed {selectedBed.bed_no} released and room charges billed.
                  {summaryFailed
                    ? " Discharge summary could not be generated automatically — add it manually from the patient's chart."
                    : " A discharge summary was generated and saved to the patient's chart (Documents tab)."}
                </div>
              </div>
            </div>
            <div className="bg-white border border-[#DDE2EC] rounded p-4">
              <div className="text-[13px] font-semibold text-gray-900">Send to the patient</div>
              <p className="text-[12px] text-[#64748B] mb-3">
                The discharge summary as a PDF (WhatsApp attachment, or a link by SMS), and a
                request to rate their stay.
              </p>
              <div className="flex flex-wrap gap-2">
                {savedSummary ? (
                  <SendToPatientButton
                    label="Send discharge summary"
                    patient={{
                      name: savedSummary.patientName,
                      phone: savedSummary.phone,
                      email: savedSummary.email,
                      id: savedSummary.patientId,
                    }}
                    kind="discharge_summary"
                    buildDocument={() =>
                      buildDischargeSummaryDocument({
                        name: savedSummary.patientName,
                        id: savedSummary.patientId,
                        phone: savedSummary.phone,
                        text: savedSummary.text,
                      })
                    }
                    documentLabel="Discharge summary"
                  />
                ) : (
                  <span className="text-[12px] text-[#92400E]">
                    No summary to send -- it could not be generated.
                  </span>
                )}
                <SendToPatientButton
                  label="Request feedback"
                  patient={{
                    name: savedSummary?.patientName || occupantName(selectedBed),
                    phone: savedSummary?.phone || "",
                    email: savedSummary?.email,
                    id: selectedBed.patient_id || undefined,
                  }}
                  kind="feedback_request"
                />
              </div>
            </div>
            <div className="flex justify-center gap-2">
              <Btn
                variant="outline"
                size="md"
                onClick={() => {
                  setStep(0)
                  setSelectedBed(null)
                  setChecklist(null)
                  setSavedSummary(null)
                }}
              >
                Discharge Another Patient
              </Btn>
              <Btn variant="primary" size="md" onClick={onComplete}>
                Done
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
