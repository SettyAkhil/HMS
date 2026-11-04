import React, { useState } from "react"
import { db, DBOPEncounter } from "../services/db"
import { DoctorPortalDatabase } from "../services/doctorPortalDb"
import { encounterArrivalMs } from "../services/encounterTime"
import { BillingDatabase, RadiologyStudyRecord } from "../services/billingDb"
import { PharmacyDatabase } from "../services/pharmacyDb"
import { printRadiologyDocument } from "../utils/radiologyPrint"
import RadiologyReportPdfModal from "./radiology/RadiologyReportPdfModal"
import { Icon } from "./icons"

interface PatientJourneyModalProps {
  encounter: DBOPEncounter | null
  onClose: () => void
  onNavigateToDoctorPortal?: (encId: string) => void
  onNavigateToOPWorkflow?: (encId: string, step?: number) => void
}

export default function PatientJourneyModal({
  encounter,
  onClose,
  onNavigateToDoctorPortal,
  onNavigateToOPWorkflow,
}: PatientJourneyModalProps) {
  const [activeTab, setActiveTab] =
    useState<"current_journey" | "previous_consultations">("current_journey")
  const [selectedReportStudy, setSelectedReportStudy] = useState<RadiologyStudyRecord | null>(null)
  const [tick, setTick] = useState(0)

  React.useEffect(() => {
    const unsubDb = db.subscribe(() => setTick((t) => t + 1))
    const unsubDoc = DoctorPortalDatabase.subscribe(() => setTick((t) => t + 1))
    const unsubBilling = BillingDatabase.onUpdate(() => setTick((t) => t + 1))
    const handlePharm = () => setTick((t) => t + 1)
    window.addEventListener("hospai_pharmacy_updated", handlePharm)
    window.addEventListener("storage", handlePharm)
    return () => {
      unsubDb()
      unsubDoc()
      unsubBilling()
      window.removeEventListener("hospai_pharmacy_updated", handlePharm)
      window.removeEventListener("storage", handlePharm)
    }
  }, [])

  if (!encounter) return null

  // Retrieve current live encounter instance from DB if available
  const liveEncounter = db.getEncounterById(encounter.id) || encounter

  // Retrieve lifetime OP history & previous consultation records for this patient's UMR
  const allPatientEncounters = db
    .getEncountersForPatient(liveEncounter.umr)
    .sort(
      (a, b) =>
        (encounterArrivalMs(b) || 0) - (encounterArrivalMs(a) || 0),
    )

  const previousEncounters = allPatientEncounters.filter(
    (e) => e.id !== liveEncounter.id,
  )
  const consultationRecords = DoctorPortalDatabase.getConsultationsForPatient(
    liveEncounter.umr,
  )

  // Query live radiology studies from BillingDatabase
  const allRadStudies = BillingDatabase.getRadiologyStudies()

  // Match finalized radiology reports for the current live encounter
  const finalizedStudiesForEncounter = allRadStudies.filter((s) => {
    const isFinal = s.status === "Final" || s.reportStatus === "Final"
    if (!isFinal) return false

    // 1. Primary link: direct encounterId match
    if (s.encounterId && s.encounterId === liveEncounter.id) {
      if (s.umr && s.umr !== liveEncounter.umr) return false
      return true
    }

    // 2. Verified fallback: matching UMR without another conflicting encounter ID,
    // where study matches an investigation ordered in this encounter
    if (s.umr && s.umr === liveEncounter.umr && !s.encounterId) {
      const matchesInvestigation = liveEncounter.investigations?.some(
        (inv) =>
          inv.toLowerCase().includes(s.study.toLowerCase()) ||
          s.study.toLowerCase().includes(inv.toLowerCase())
      )
      return Boolean(matchesInvestigation)
    }

    return false
  })

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in overflow-y-auto">
      <div
        id="printable-area"
        className="printable-area bg-white border-2 border-[#CBD5E1] rounded-none shadow-2xl max-w-3xl w-full my-auto flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#0F172A] text-white flex justify-between items-center flex-shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-[#1B4FD8] flex items-center justify-center text-lg font-bold">
              🧭
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-bold text-white">
                  Outpatient Clinical Journey & Consultation History
                </h3>
                <span className="font-mono text-[11px] font-bold bg-blue-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded-none">
                  {liveEncounter.opNumber}
                </span>
              </div>
              <p className="text-[12px] text-slate-300">
                Outpatient care trajectory & past consultation data for
                permanent UMR:{" "}
                <strong className="text-white font-mono">
                  {liveEncounter.umr}
                </strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Patient Credentials Bar */}
        <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] flex-shrink-0">
          <div>
            <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
              Patient Name
            </span>
            <span className="font-bold text-gray-900 text-[13.5px]">
              {liveEncounter.patientName}
            </span>
            <span className="text-[11px] text-[#64748B] block">
              {liveEncounter.age} yrs · {liveEncounter.sex}
            </span>
          </div>

          <div>
            <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
              Permanent UMR (Lifetime)
            </span>
            <span className="font-mono font-bold text-[#1B4FD8] text-[13px] bg-blue-50 px-2 py-0.5 rounded-none border border-blue-200 inline-block mt-0.5">
              {liveEncounter.umr}
            </span>
            <span className="text-[11px] text-gray-500 block mt-0.5">
              {liveEncounter.phone}
            </span>
          </div>

          <div>
            <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
              Department & Doctor
            </span>
            <span className="font-semibold text-gray-900 block">
              {liveEncounter.dept}
            </span>
            <span className="text-[11px] text-gray-600 block">
              {liveEncounter.assignedDoctor || "Attending Physician"} ·{" "}
              {liveEncounter.room || "Room 101"}
            </span>
          </div>

          <div>
            <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
              Care Status & History
            </span>
            <span className="font-bold text-[#15803D] bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200 inline-block text-[11px]">
              {liveEncounter.status}
            </span>
            <span className="text-[11px] font-mono font-bold text-gray-700 block mt-0.5">
              {previousEncounters.length} Past OP Consultations
            </span>
          </div>
        </div>

        {/* Navigation Switcher Tabs */}
        <div className="bg-white border-b border-[#CBD5E1] px-6 py-2 flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("current_journey")}
            className={`px-3.5 py-1.5 text-[12px] font-bold rounded-none transition-colors cursor-pointer ${
              activeTab === "current_journey"
                ? "bg-[#1B4FD8] text-white shadow-xs"
                : "bg-[#F8FAFC] border border-[#CBD5E1] text-[#64748B] hover:text-gray-900"
            }`}
          >
            ⚡ Today's OP Care Milestones
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("previous_consultations")}
            className={`px-3.5 py-1.5 text-[12px] font-bold rounded-none transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "previous_consultations"
                ? "bg-[#1B4FD8] text-white shadow-xs"
                : "bg-[#F8FAFC] border border-[#CBD5E1] text-[#64748B] hover:text-gray-900"
            }`}
          >
            <span>📜</span> Previous Consultations ({previousEncounters.length})
          </button>
        </div>

        {/* TAB 1: CURRENT OP VISIT MILESTONES */}
        {activeTab === "current_journey" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="relative pl-6 space-y-6 border-l-2 border-[#CBD5E1] ml-4">
              {/* 1. ARRIVAL & CHECK-IN */}
              <div className="relative group">
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#1B4FD8] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                  1
                </div>
                <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                      <span>🏥</span> Arrival & OPD Check-In
                    </div>
                    <span className="font-mono text-[11.5px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded-none border border-blue-200">
                      {liveEncounter.date
                        ? `${liveEncounter.date} · ${liveEncounter.registrationTime}`
                        : liveEncounter.timestamps?.arrival || liveEncounter.registrationTime || "Arrival Recorded"}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-700">
                    Patient arrived at Outpatient Reception Desk. Walk-in token
                    initialized.
                  </p>
                  <div className="text-[11px] text-[#64748B] bg-[#F8FAFC] p-2 rounded-none border border-[#E2E8F0]">
                    Token ID:{" "}
                    <strong>
                      {liveEncounter.queueToken || liveEncounter.opNumber}
                    </strong>{" "}
                    · Type:{" "}
                    <strong>
                      {liveEncounter.isNew
                        ? "New Outpatient"
                        : "Returning Patient Revisit"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 2. REGISTRATION & UMR CONFIRMATION */}
              <div className="relative group">
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#1B4FD8] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                  2
                </div>
                <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                      <span>📝</span> OP Registration & Permanent UMR
                      Verification
                    </div>
                    <span className="font-mono text-[11.5px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded-none border border-blue-200">
                      {liveEncounter.date
                        ? `${liveEncounter.date} · ${liveEncounter.registrationTime}`
                        : liveEncounter.timestamps?.registration || liveEncounter.registrationTime || "Registration Recorded"}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-700">
                    Demographic credentials verified against permanent master
                    database. Lifetime <strong>{liveEncounter.umr}</strong> linked
                    with today's OP visit number{" "}
                    <strong>{liveEncounter.opNumber}</strong>.
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-600">
                    <span>✓ Official OP Pass Issued</span>
                    <span>•</span>
                    <span>Contact: {liveEncounter.phone}</span>
                    <span>•</span>
                    <span>Address: {liveEncounter.address || "Main City"}</span>
                  </div>
                </div>
              </div>

              {/* 3. SYMPTOMS & AI CLINICAL TRIAGE */}
              <div className="relative group">
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#8B5CF6] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                  3
                </div>
                <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                      <span>🤖</span> Symptom Intake & AI Specialty
                      Recommendation
                    </div>
                    <span className="font-mono text-[11.5px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-none border border-purple-200">
                      {liveEncounter.timestamps?.symptoms || liveEncounter.timestamps?.arrival || "Captured"}
                    </span>
                  </div>
                  <div className="bg-[#F8FAFC] p-2.5 rounded-none border border-[#E2E8F0] text-[12px]">
                    <span className="font-bold text-[#64748B] block text-[10.5px] uppercase">
                      Presenting Chief Complaints:
                    </span>
                    <span className="text-gray-900 font-medium">
                      {liveEncounter.chiefComplaint ||
                        (liveEncounter.symptoms && liveEncounter.symptoms.length > 0
                          ? liveEncounter.symptoms.join(", ")
                          : "General outpatient evaluation requested.")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] flex-wrap">
                    <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-none border border-purple-200">
                      AI Specialty: {liveEncounter.aiSpecialty || liveEncounter.dept} {liveEncounter.aiConfidence ? `(${liveEncounter.aiConfidence}%)` : ""}
                    </span>
                    <span className="text-[#64748B]">
                      Assigned to:{" "}
                      <strong>{liveEncounter.assignedDoctor || "Physician Triage"}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. NURSE STATION & VITAL SIGNS */}
              <div className="relative group">
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#10B981] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                  4
                </div>
                <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                      <span>🩺</span> Nurse Station Triage & Baseline Vitals
                    </div>
                    <span className="font-mono text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200">
                      {liveEncounter.timestamps?.vitalsRecorded || (liveEncounter.vitals?.bp ? "Vitals Recorded" : "Pending Vitals")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11.5px]">
                    <div className="bg-[#F8FAFC] p-2 rounded-none border border-[#E2E8F0] text-center">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Blood Pressure
                      </span>
                      <span className="font-mono font-bold text-gray-900 text-[13px]">
                        {liveEncounter.vitals?.bp || "--"}
                      </span>
                    </div>
                    <div className="bg-[#F8FAFC] p-2 rounded-none border border-[#E2E8F0] text-center">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Heart Rate
                      </span>
                      <span className="font-mono font-bold text-gray-900 text-[13px]">
                        {liveEncounter.vitals?.pulse ? `${liveEncounter.vitals.pulse} bpm` : "--"}
                      </span>
                    </div>
                    <div className="bg-[#F8FAFC] p-2 rounded-none border border-[#E2E8F0] text-center">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Temperature
                      </span>
                      <span className="font-mono font-bold text-gray-900 text-[13px]">
                        {liveEncounter.vitals?.temp ? `${liveEncounter.vitals.temp} °F` : "--"}
                      </span>
                    </div>
                    <div className="bg-[#F8FAFC] p-2 rounded-none border border-[#E2E8F0] text-center">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        SpO2 Oxygen
                      </span>
                      <span className="font-mono font-bold text-gray-900 text-[13px]">
                        {liveEncounter.vitals?.spo2 ? `${liveEncounter.vitals.spo2}%` : "--"}
                      </span>
                    </div>
                    <div className="bg-[#F8FAFC] p-2 rounded-none border border-[#E2E8F0] text-center">
                      <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                        Body Weight
                      </span>
                      <span className="font-mono font-bold text-gray-900 text-[13px]">
                        {liveEncounter.vitals?.weight ? `${liveEncounter.vitals.weight} kg` : "--"}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11.5px] text-[#166534] bg-[#F0FDF4] p-2 rounded-none border border-emerald-200">
                    👩‍⚕️ <strong>Nurse Assessment:</strong>{" "}
                    {liveEncounter.vitals?.notes ||
                      (liveEncounter.vitals?.bp ? "Baseline physiological vitals recorded." : "Vitals assessment pending at nurse station.")}
                  </div>
                </div>
              </div>

              {/* 5. DOCTOR QUEUE ALLOCATION */}
              <div className="relative group">
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#F59E0B] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                  5
                </div>
                <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                      <span>⏳</span> Doctor Queue Allocation & Chamber Calling
                    </div>
                    <span className="font-mono text-[11.5px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-none border border-amber-200">
                      {liveEncounter.timestamps?.doctorAssigned || (liveEncounter.assignedDoctor ? "Assigned" : "Pending Queue")}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-700">
                    Allocated to{" "}
                    <strong>
                      {liveEncounter.assignedDoctor || "Attending Physician Triage"}
                    </strong>{" "}
                    in <strong>{liveEncounter.room || "Consultation Room"}</strong> with token{" "}
                    <strong>
                      #{liveEncounter.queueToken || liveEncounter.opNumber}
                    </strong>
                    .
                  </p>
                </div>
              </div>

              {/* 6. PHYSICIAN CONSULTATION & LIVE RX PAD */}
              <div className="relative group">
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#1B4FD8] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                  6
                </div>
                <div className="bg-white border-2 border-blue-200 rounded-none p-4 shadow-xs space-y-3">
                  <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2">
                    <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                      <span>🩺</span> Physician Examination & Live Prescription (Rx)
                    </div>
                    <span className="font-mono text-[11.5px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded-none border border-blue-200">
                      {liveEncounter.timestamps?.consultationStart
                        ? `${liveEncounter.timestamps.consultationStart} ${liveEncounter.timestamps?.consultationEnd ? `— ${liveEncounter.timestamps.consultationEnd}` : ""}`
                        : (liveEncounter.diagnosis ? "Consultation Recorded" : "Under Evaluation / Pending")}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                    <div className="bg-[#F8FAFC] p-2.5 rounded-none border border-[#E2E8F0]">
                      <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                        Clinical Diagnosis
                      </span>
                      <span className="font-bold text-gray-900 block mt-0.5">
                        {liveEncounter.diagnosis || "Pending Physician Diagnosis"}
                      </span>
                      {liveEncounter.icd10 && (
                        <span className="text-[11px] font-mono text-[#1B4FD8]">
                          ICD-10: {liveEncounter.icd10}
                        </span>
                      )}
                    </div>

                    <div className="bg-[#F8FAFC] p-2.5 rounded-none border border-[#E2E8F0]">
                      <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                        Diagnostic Investigations
                      </span>
                      <span className="font-medium text-gray-800 block mt-0.5">
                        {liveEncounter.investigations && liveEncounter.investigations.length > 0
                          ? liveEncounter.investigations.join(", ")
                          : "No diagnostic tests ordered."}
                      </span>
                    </div>
                  </div>

                  {/* Prescribed Medications Pad */}
                  <div className="space-y-1 text-[12px]">
                    <span className="text-[11px] uppercase font-bold text-[#64748B] block">
                      Prescribed Medications (Rx):
                    </span>
                    {liveEncounter.prescription && liveEncounter.prescription.length > 0 ? (
                      <div className="bg-white border border-[#CBD5E1] rounded-none overflow-hidden">
                        <table className="w-full text-left text-[11.5px]">
                          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] font-bold text-[#64748B]">
                            <tr>
                              <th className="px-3 py-1.5">Medicine</th>
                              <th className="px-3 py-1.5">Dosage</th>
                              <th className="px-3 py-1.5">Frequency</th>
                              <th className="px-3 py-1.5">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9]">
                            {liveEncounter.prescription.map((rx, i) => (
                              <tr key={i}>
                                <td className="px-3 py-1.5 font-semibold text-gray-900">
                                  {rx.medicine}
                                </td>
                                <td className="px-3 py-1.5 text-gray-700">
                                  {rx.dosage}
                                </td>
                                <td className="px-3 py-1.5 text-gray-700">
                                  {rx.frequency}
                                </td>
                                <td className="px-3 py-1.5 text-gray-700">
                                  {rx.duration}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-[12px] text-gray-500 italic bg-[#F8FAFC] p-2 border border-[#E2E8F0]">
                        No medications prescribed for this encounter.
                      </div>
                    )}
                  </div>

                  <div className="text-[11.5px] text-gray-700 bg-[#F8FAFC] p-2 rounded-none border border-[#E2E8F0]">
                    <strong>Doctor Advice:</strong>{" "}
                    {liveEncounter.advice || "No specific advice recorded yet."}
                  </div>
                </div>
              </div>

              {/* 7. BILLING SETTLEMENT & INVOICE */}
              <div className="relative group">
                <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#10B981] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                  7
                </div>
                <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                      <span>💳</span> Billing Settlement & Official Receipt
                    </div>
                    <span className="font-mono text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200">
                      {liveEncounter.timestamps?.billingCompleted || (liveEncounter.billing?.status === 'Paid' ? 'Settled' : 'Pending')}
                    </span>
                  </div>

                  <div className="bg-[#F8FAFC] p-3 rounded-none border border-[#E2E8F0] space-y-1.5 text-[12px]">
                    {(() => {
                      const regFee = liveEncounter.billing?.registrationFee ?? (liveEncounter.isNew === false ? 0 : 20)
                      const consultFee = liveEncounter.billing?.consultationFee ?? 500
                      const labFee = liveEncounter.billing?.labFee || 0
                      const grandTotal = liveEncounter.billing?.total || (regFee + consultFee + labFee)
                      return (
                        <>
                          <div className="flex justify-between text-gray-700">
                            <span>1. Patient Registration Fee {liveEncounter.isNew === false || regFee === 0 ? "(Existing Patient)" : ""}</span>
                            <span className="font-mono font-bold text-gray-900">₹{regFee}.00</span>
                          </div>
                          <div className="flex justify-between text-gray-700">
                            <span>2. Physician Outpatient Consultation Fee {liveEncounter.assignedDoctor ? `(${liveEncounter.assignedDoctor})` : ""}</span>
                            <span className="font-mono font-bold text-gray-900">₹{consultFee}.00</span>
                          </div>
                          {labFee > 0 && (
                            <div className="flex justify-between text-gray-700">
                              <span>3. Diagnostic Investigations / Triage</span>
                              <span className="font-mono font-bold text-gray-900">₹{labFee}.00</span>
                            </div>
                          )}
                          <div className="pt-1.5 border-t border-[#E2E8F0] flex justify-between font-bold text-[13px] text-gray-900">
                            <span>Total Official Settlement:</span>
                            <span className="font-mono text-emerald-700">₹{grandTotal}.00 (Status: {liveEncounter.billing?.status || 'Paid'})</span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* 7b. DIAGNOSTIC RADIOLOGY & IMAGING REPORTS (FINALIZED) */}
              {finalizedStudiesForEncounter.length > 0 && (
                <div className="relative group">
                  <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#4338CA] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                    🩻
                  </div>
                  <div className="bg-white border-2 border-indigo-200 rounded-none p-4 shadow-2xs space-y-3">
                    <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2">
                      <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                        <span>☢️</span> Diagnostic Radiology & Imaging Reports
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-none border border-indigo-200">
                          {finalizedStudiesForEncounter.length} Finalized {finalizedStudiesForEncounter.length === 1 ? "Report" : "Reports"}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200">
                          Clinically Finalized
                        </span>
                      </div>
                    </div>

                    <p className="text-[12px] text-gray-700">
                      Official radiology imaging studies performed, interpreted, and finalized by the Department of Radiodiagnosis.
                    </p>

                    <div className="space-y-3">
                      {finalizedStudiesForEncounter.map((study) => (
                        <div
                          key={study.id}
                          className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded-none space-y-2.5 text-[12px]"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-[#E2E8F0] pb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 text-[10.5px] font-mono font-bold rounded-none border ${
                                study.modality === "CT" ? "bg-purple-100 text-purple-800 border-purple-200" :
                                study.modality === "MR" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                study.modality === "US" ? "bg-cyan-100 text-cyan-800 border-cyan-200" :
                                "bg-blue-100 text-blue-800 border-blue-200"
                              }`}>
                                {study.modality}
                              </span>
                              <span className="font-bold text-[13.5px] text-gray-900">
                                {study.study}
                              </span>
                              <span className="text-[11px] font-mono text-gray-500">
                                ({study.accessionNo || study.id})
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#64748B]">
                                Exam: <strong className="text-gray-800">{study.ordered}</strong>
                              </span>
                              <span>·</span>
                              <span className="text-[11px] text-[#166534]">
                                Finalized: <strong className="text-emerald-800">{study.signedAt || study.finalizedAt || "Final"}</strong>
                              </span>
                            </div>
                          </div>

                          {/* Doctors & Department info */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
                            <div className="bg-white p-2 rounded-none border border-[#E2E8F0]">
                              <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                                Referring Physician
                              </span>
                              <span className="font-semibold text-gray-900 block mt-0.5">
                                {study.provider || liveEncounter.assignedDoctor || "Attending Physician"}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-none border border-[#E2E8F0]">
                              <span className="text-[#64748B] block text-[10px] uppercase font-bold">
                                Reporting Consultant Radiologist
                              </span>
                              <span className="font-semibold text-indigo-900 block mt-0.5">
                                {study.radiologist || "Dr. Laura Kim, MD · Senior Consultant Radiologist"}
                              </span>
                            </div>
                          </div>

                          {/* Indication */}
                          {study.indication && (
                            <div className="text-[11.5px] text-gray-700 bg-white p-2 rounded-none border border-[#E2E8F0]">
                              <strong className="text-gray-900">Clinical Indication:</strong> {study.indication}
                            </div>
                          )}

                          {/* Diagnostic Impression Box */}
                          <div className="bg-white p-2.5 rounded-none border-l-4 border-indigo-600 border border-[#E2E8F0] space-y-1">
                            <span className="text-[10px] uppercase font-bold text-indigo-900 block tracking-wider">
                              Diagnostic Impression &amp; Conclusion:
                            </span>
                            <p className="text-[11.5px] text-gray-900 font-medium whitespace-pre-line leading-relaxed">
                              {study.impression && study.impression.length > 0
                                ? study.impression.join("\n")
                                : "Diagnostic radiology examination completed cleanly without complication."}
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#E2E8F0]">
                            <button
                              type="button"
                              onClick={() => setSelectedReportStudy(study)}
                              className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11.5px] font-bold rounded-none shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                              <Icon.Eye /> View Full Report (A4)
                            </button>

                            <button
                              type="button"
                              onClick={() => printRadiologyDocument(study)}
                              className="px-3.5 py-1.5 bg-white hover:bg-gray-100 text-gray-800 border border-[#CBD5E1] text-[11.5px] font-bold rounded-none shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                              <Icon.Download /> Print Report
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 8. PHARMACY & DISPENSING */}
              {(() => {
                const prescriptions = PharmacyDatabase.getPrescriptions()
                const targetName = (liveEncounter.patientName || "").toLowerCase().trim()
                const matchedRx = prescriptions.find(
                  (p) =>
                    (p.visitId && p.visitId === liveEncounter.id) ||
                    (p.uhid && p.uhid === liveEncounter.umr) ||
                    (p.patientId && p.patientId === liveEncounter.umr) ||
                    ((liveEncounter as any).prescriptionId && p.id === (liveEncounter as any).prescriptionId) ||
                    (targetName && p.patientName && p.patientName.toLowerCase().trim() === targetName)
                )

                const isDispensed =
                  matchedRx?.status === "Dispensed" ||
                  matchedRx?.dispensingStatus === "Dispensed" ||
                  liveEncounter.pharmacyStatus === "Dispensed" ||
                  liveEncounter.status === "OP Completed"

                const isPartial =
                  (matchedRx?.status as string) === "Partially Dispensed" ||
                  (matchedRx?.dispensingStatus as string) === "Partially Dispensed" ||
                  liveEncounter.pharmacyStatus === "Partially Dispensed"

                const isReady =
                  matchedRx?.status === "Ready For Dispensing" ||
                  matchedRx?.dispensingStatus === "Ready" ||
                  liveEncounter.pharmacyStatus === "Ready"

                const isProcessing =
                  matchedRx?.status === "Preparing" ||
                  matchedRx?.dispensingStatus === "Preparing" ||
                  (matchedRx?.status as string) === "Processing" ||
                  liveEncounter.pharmacyStatus === "Processing"

                return (
                  <div className="relative group">
                    <div className="absolute -left-[31px] top-0 w-6 h-6 rounded-none bg-[#06B6D4] text-white flex items-center justify-center text-xs font-bold ring-4 ring-white shadow-xs">
                      8
                    </div>
                    <div className="bg-white border border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-1.5">
                      <div className="flex justify-between items-center">
                        <div className="font-bold text-[13.5px] text-gray-900 flex items-center gap-1.5">
                          <span>💊</span> Pharmacy Dispensing & Visit Status
                        </div>
                        {isDispensed ? (
                          <span className="font-mono text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-none border border-emerald-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Dispensed
                          </span>
                        ) : isPartial ? (
                          <span className="font-mono text-[11.5px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-none border border-amber-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Partially Dispensed
                          </span>
                        ) : isReady ? (
                          <span className="font-mono text-[11.5px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-none border border-blue-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            Ready
                          </span>
                        ) : isProcessing ? (
                          <span className="font-mono text-[11.5px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-none border border-indigo-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            In Process
                          </span>
                        ) : (
                          <span className="font-mono text-[11.5px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-none border border-cyan-200">
                            In Queue
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-700">
                        {isDispensed && matchedRx
                          ? `Prescription ${matchedRx.id} dispensed by Central Pharmacy (${matchedRx.items?.length || 0} item(s)).`
                          : isDispensed
                          ? "Prescription dispensed by Central Pharmacy. Outpatient departure counselled."
                          : isPartial && matchedRx
                          ? `Prescription ${matchedRx.id} partially dispensed (${matchedRx.items?.length || 0} item(s)).`
                          : liveEncounter.prescription && liveEncounter.prescription.length > 0
                          ? "Prescriptions routed to outpatient pharmacy queue."
                          : "Outpatient visit recorded in hospital system."}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* TAB 2: PREVIOUS CONSULTATION DATA (OUTPATIENT CLINICAL HISTORY) */}
        {activeTab === "previous_consultations" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {previousEncounters.length === 0 ? (
              <div className="bg-[#F0FDF4] border-2 border-[#86EFAC] rounded-none p-6 text-center space-y-2">
                <div className="text-2xl">✨</div>
                <h4 className="text-[14px] font-bold text-[#166534]">
                  First Outpatient Visit — Initial Clinical Baseline
                </h4>
                <p className="text-[12px] text-[#15803D] max-w-md mx-auto">
                  This patient is registered for their first OP consultation.
                  Today's visit will create their baseline outpatient clinical
                  record.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-3 rounded-none text-[12px] text-[#1E40AF] flex items-center justify-between">
                  <span className="font-bold">
                    📜 Chronological OP Consultation History for{" "}
                    {encounter.patientName}
                  </span>
                  <span className="font-mono font-bold bg-white px-2 py-0.5 border border-blue-200">
                    {previousEncounters.length} Prior Visits
                  </span>
                </div>

                {previousEncounters.map((pastEnc, idx) => {
                  const matchingConsult = consultationRecords.find(
                    (c) => c.encounterId === pastEnc.id,
                  )

                  return (
                    <div
                      key={pastEnc.id}
                      className="bg-white border-2 border-[#CBD5E1] rounded-none p-4 shadow-2xs space-y-3"
                    >
                      {/* Consultation Header */}
                      <div className="flex justify-between items-start border-b border-[#E2E8F0] pb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-none bg-[#1B4FD8] text-white text-[11px] font-bold flex items-center justify-center font-mono">
                              {previousEncounters.length - idx}
                            </span>
                            <span className="font-bold text-[14px] text-gray-900">
                              {pastEnc.assignedDoctor || "Attending Physician"}
                            </span>
                            <span className="text-[11px] font-mono text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded-none border border-blue-200">
                              {pastEnc.dept || "Cardiology"}
                            </span>
                          </div>
                          <span className="text-[11.5px] text-[#64748B] block mt-0.5">
                            Visit OP No:{" "}
                            <strong className="font-mono text-gray-800">
                              {pastEnc.opNumber}
                            </strong>{" "}
                            · Room: {pastEnc.room || "Room 101"}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-[11.5px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-none border border-gray-300 inline-block">
                            {pastEnc.date ? `${pastEnc.date} (${pastEnc.registrationTime})` : pastEnc.registrationTime || "Past Visit"}
                          </span>
                          <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200 block mt-1">
                            {pastEnc.status}
                          </span>
                        </div>
                      </div>

                      {/* Complaint & Symptoms */}
                      <div className="bg-[#F8FAFC] p-2.5 rounded-none border border-[#E2E8F0] text-[12px]">
                        <span className="font-bold text-[#64748B] block text-[10px] uppercase">
                          Chief Complaint Narrative
                        </span>
                        <p className="text-gray-900 font-medium mt-0.5">
                          "
                          {pastEnc.chiefComplaint ||
                            pastEnc.symptoms?.join(", ") ||
                            "Routine follow-up evaluation."}
                          "
                        </p>
                      </div>

                      {/* Vitals Recorded */}
                      {pastEnc.vitals?.bp && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <div className="bg-gray-50 p-2 rounded-none border border-gray-200 text-center">
                            <span className="text-gray-500 block text-[9.5px] uppercase font-bold">
                              BP
                            </span>
                            <span className="font-mono font-bold text-gray-900">
                              {pastEnc.vitals.bp}
                            </span>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-none border border-gray-200 text-center">
                            <span className="text-gray-500 block text-[9.5px] uppercase font-bold">
                              Heart Rate
                            </span>
                            <span className="font-mono font-bold text-gray-900">
                              {pastEnc.vitals.pulse}
                            </span>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-none border border-gray-200 text-center">
                            <span className="text-gray-500 block text-[9.5px] uppercase font-bold">
                              Temp
                            </span>
                            <span className="font-mono font-bold text-gray-900">
                              {pastEnc.vitals.temp}
                            </span>
                          </div>
                          <div className="bg-gray-50 p-2 rounded-none border border-gray-200 text-center">
                            <span className="text-gray-500 block text-[9.5px] uppercase font-bold">
                              SpO2
                            </span>
                            <span className="font-mono font-bold text-gray-900">
                              {pastEnc.vitals.spo2}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Diagnosis & Prescribed Rx */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                        <div className="bg-[#F8FAFC] p-2.5 rounded-none border border-[#E2E8F0]">
                          <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                            Diagnosis Recorded
                          </span>
                          <span className="font-bold text-gray-900 block mt-0.5">
                            {pastEnc.diagnosis ||
                              matchingConsult?.diagnosis ||
                              "Primary Evaluation Completed"}
                          </span>
                        </div>

                        <div className="bg-[#F8FAFC] p-2.5 rounded-none border border-[#E2E8F0]">
                          <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                            Doctor Advice
                          </span>
                          <span className="text-gray-800 font-medium block mt-0.5">
                            {pastEnc.advice ||
                              matchingConsult?.advice ||
                              "Regular follow-up as advised."}
                          </span>
                        </div>
                      </div>

                      {/* Prescribed Medications Table */}
                      {pastEnc.prescription?.length ||
                      matchingConsult?.medications?.length ? (
                        <div className="space-y-1 text-[11.5px]">
                          <span className="text-[10.5px] uppercase font-bold text-[#64748B] block">
                            Medications Prescribed (Rx):
                          </span>
                          <div className="border border-[#CBD5E1] overflow-hidden bg-white">
                            <table className="w-full text-left">
                              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] font-bold text-[#64748B] text-[10.5px]">
                                <tr>
                                  <th className="px-3 py-1">Medicine</th>
                                  <th className="px-3 py-1">Dosage</th>
                                  <th className="px-3 py-1">Frequency</th>
                                  <th className="px-3 py-1">Duration</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#F1F5F9] text-[11px]">
                                {(
                                  pastEnc.prescription ||
                                  matchingConsult?.medications ||
                                  []
                                ).map((rx: any, rxIdx: number) => (
                                  <tr key={rxIdx}>
                                    <td className="px-3 py-1 font-semibold text-gray-900">
                                      {rx.medicine || rx.name}
                                    </td>
                                    <td className="px-3 py-1 text-gray-700">
                                      {rx.dosage}
                                    </td>
                                    <td className="px-3 py-1 text-gray-700">
                                      {rx.frequency}
                                    </td>
                                    <td className="px-3 py-1 text-gray-700">
                                      {rx.duration}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}

                      {/* Finalized Historical Radiology Reports for Past Encounter */}
                      {(() => {
                        const pastFinalizedStudies = allRadStudies.filter((s) => {
                          const isFinal = s.status === "Final" || s.reportStatus === "Final"
                          if (!isFinal) return false
                          if (s.encounterId && s.encounterId === pastEnc.id) {
                            if (s.umr && s.umr !== pastEnc.umr) return false
                            return true
                          }
                          return false
                        })

                        if (pastFinalizedStudies.length === 0) return null

                        return (
                          <div className="space-y-2 text-[11.5px] pt-2 border-t border-[#E2E8F0]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10.5px] uppercase font-bold text-indigo-900 flex items-center gap-1">
                                <span>🩻</span> Finalized Radiology Reports ({pastFinalizedStudies.length})
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200">
                                Clinically Finalized
                              </span>
                            </div>

                            {pastFinalizedStudies.map((s) => (
                              <div key={s.id} className="bg-[#F8FAFC] border border-[#CBD5E1] p-3 rounded-none space-y-2">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-none border border-indigo-200">
                                      {s.modality}
                                    </span>
                                    <span className="font-bold text-gray-900 text-[12.5px]">{s.study}</span>
                                  </div>
                                  <span className="font-mono text-[10.5px] text-gray-600">
                                    {s.signedAt || s.finalizedAt || s.ordered}
                                  </span>
                                </div>

                                <div className="text-[11px] text-gray-700 flex flex-wrap justify-between gap-1">
                                  <span>Reporting Radiologist: <strong className="text-gray-900">{s.radiologist || "Radiology"}</strong></span>
                                  <span>Accession: <strong className="font-mono text-gray-800">{s.accessionNo || s.id}</strong></span>
                                </div>

                                {s.impression && (
                                  <div className="bg-white p-2 border-l-2 border-indigo-600 border border-[#E2E8F0] text-[11px] text-gray-800">
                                    <strong className="text-indigo-950">Impression:</strong>{" "}
                                    {Array.isArray(s.impression) ? s.impression.join("; ") : s.impression}
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedReportStudy(s)}
                                    className="px-2.5 py-1 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11px] font-bold rounded-none cursor-pointer flex items-center gap-1"
                                  >
                                    <Icon.Eye /> View Full Report (A4)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => printRadiologyDocument(s)}
                                    className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-800 border border-[#CBD5E1] text-[11px] font-bold rounded-none cursor-pointer flex items-center gap-1"
                                  >
                                    <Icon.Download /> Print Report
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal Bottom Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
          <div className="text-[11.5px] text-[#64748B]">
            Permanent UMR: <strong>{encounter.umr}</strong> · Visit:{" "}
            <strong>{encounter.opNumber}</strong>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-white hover:bg-gray-100 border border-[#CBD5E1] text-gray-800 text-[12px] font-bold rounded-none shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Icon.Download /> Print Journey Report
            </button>

            {onNavigateToDoctorPortal && (
              <button
                type="button"
                onClick={() => {
                  const encId = encounter.id
                  onClose()
                  onNavigateToDoctorPortal(encId)
                }}
                className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1B4FD8] border border-blue-200 text-[12px] font-bold rounded-none transition-colors cursor-pointer"
              >
                Open Doctor Workspace →
              </button>
            )}

            {onNavigateToOPWorkflow && (
              <button
                type="button"
                onClick={() => {
                  const encId = encounter.id
                  onClose()
                  onNavigateToOPWorkflow(encId, 1)
                }}
                className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-bold rounded-none shadow-xs transition-colors cursor-pointer"
              >
                Open Full 6-Step Clinical Journey ➔
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Complete A4 Finalized Radiology Report Viewer Modal */}
      {selectedReportStudy && (
        <RadiologyReportPdfModal
          study={selectedReportStudy}
          onClose={() => setSelectedReportStudy(null)}
        />
      )}
    </div>
  )
}
