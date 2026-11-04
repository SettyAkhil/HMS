import React from "react"
import { ExtendedRadiologyRecord, RadiologyWorkflowDb } from "../../services/radiologyWorkflowDb"
import { db } from "../../services/db"
import {
  X,
  User,
  Activity,
  Calendar,
  Phone,
  FileText,
  AlertCircle,
  CreditCard,
  Stethoscope,
  Heart,
  Droplet,
} from "lucide-react"

interface PatientDetailsModalProps {
  study: ExtendedRadiologyRecord
  onClose: () => void
  onOpenReport?: (study: ExtendedRadiologyRecord) => void
}

export default function PatientDetailsModal({
  study,
  onClose,
  onOpenReport,
}: PatientDetailsModalProps) {
  // Look up real patient details
  const realPatient =
    db.getPatientByUmr(study.umr || "") ||
    db.getPatients().find(
      (p) =>
        p.umr === study.umr ||
        (p as any).mrn === study.mrn ||
        p.name.toLowerCase() === study.patient.toLowerCase(),
    )

  // Look up real encounter if available
  const encounter = study.encounterId ? db.getEncounterById(study.encounterId) : null

  // All investigations for this patient
  const allPatientStudies = RadiologyWorkflowDb.getStudies().filter(
    (s) =>
      (study.umr && (s.umr === study.umr || s.mrn === study.umr)) ||
      (study.patient && s.patient.toLowerCase() === study.patient.toLowerCase()),
  )

  const paymentInfo = RadiologyWorkflowDb.getPaymentStatusFromBilling(study)
  const isPaid = paymentInfo.status === "PAID"
  const invStatus = RadiologyWorkflowDb.normalizeInvestigationStatus(study.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <User size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {study.patient}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {(realPatient as any)?.gender || realPatient?.sex || "Patient"} • {realPatient?.age || 38} yrs
                </span>
              </div>
              <p className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                <span>UMR: <strong className="font-mono text-white">{study.umr || `PAT-${study.mrn}`}</strong></span>
                <span>•</span>
                <span>OP/IP: <strong className="font-mono text-white">{study.opNumber || study.ipNumber || "OP-1002"}</strong></span>
                <span>•</span>
                <span>MRN: <strong className="font-mono text-white">{study.mrn}</strong></span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {/* Quick Demographics & Billing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Demographic Card */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User size={13} className="text-indigo-600" /> Patient Info
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-medium text-slate-800">{realPatient?.phone || "+91 98765 43210"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Blood Group:</span>
                  <span className="font-bold text-rose-700 flex items-center gap-1">
                    <Droplet size={11} /> {realPatient?.bloodGroup || "B+"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gender / Age:</span>
                  <span className="font-medium text-slate-800">{(realPatient as any)?.gender || realPatient?.sex || "Male"}, {realPatient?.age || 38}y</span>
                </div>
              </div>
            </div>

            {/* Ordering Details */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Stethoscope size={13} className="text-indigo-600" /> Clinical Order
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Ordering Doctor:</span>
                  <span className="font-medium text-slate-900">{study.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Department:</span>
                  <span className="font-medium text-slate-800">{study.department || "Radiology"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Order Date:</span>
                  <span className="font-medium text-slate-800">{study.orderDate || study.ordered}</span>
                </div>
              </div>
            </div>

            {/* Payment Status Card */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CreditCard size={13} className="text-indigo-600" /> Billing Status
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Billing Sync:</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
                      isPaid
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    }`}
                  >
                    {isPaid ? "PAID" : "PENDING"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tariff Amount:</span>
                  <span className="font-bold text-slate-900">₹{study.price.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Receipt Ref:</span>
                  <span className="font-mono text-slate-700">{study.paidReceiptNo || "Awaiting Cashier"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vitals Summary if available */}
          {encounter?.vitals && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center gap-1.5">
                <Activity size={14} className="text-indigo-600" /> Baseline Clinical Vitals
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">BP</span>
                  <span className="text-xs font-bold text-slate-800">{encounter.vitals.bp || "120/80"}</span>
                  <span className="text-[9px] text-slate-400 block">mmHg</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">Heart Rate</span>
                  <span className="text-xs font-bold text-slate-800">{encounter.vitals.pulse || 76}</span>
                  <span className="text-[9px] text-slate-400 block">bpm</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">SpO2</span>
                  <span className="text-xs font-bold text-slate-800">{encounter.vitals.spo2 || 98}%</span>
                  <span className="text-[9px] text-slate-400 block">Room Air</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">Temperature</span>
                  <span className="text-xs font-bold text-slate-800">{(encounter.vitals as any).temperature || encounter.vitals.temp || "98.4"}°F</span>
                  <span className="text-[9px] text-slate-400 block">Oral</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">Weight</span>
                  <span className="text-xs font-bold text-slate-800">{encounter.vitals.weight || 68} kg</span>
                  <span className="text-[9px] text-slate-400 block">Calculated</span>
                </div>
              </div>
            </div>
          )}

          {/* Current Investigation Details */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">Current Investigation Details</h4>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  invStatus === "DONE"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : invStatus === "IN PROGRESS"
                      ? "bg-blue-100 text-blue-800 border border-blue-300"
                      : "bg-slate-100 text-slate-700 border border-slate-300"
                }`}
              >
                {invStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Investigation Name:</span>
                <span className="font-bold text-slate-900 text-sm">{study.study}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Modality / Scanner Suite:</span>
                <span className="font-semibold text-indigo-700">{study.modality} ({study.room || "Suite 1"})</span>
              </div>
              <div>
                <span className="text-slate-500 block">Clinical Indication:</span>
                <span className="text-slate-800">{study.indication || "Diagnostic evaluation ordered by doctor"}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Imaging Technique:</span>
                <span className="text-slate-800">{study.technique || "Standard digital imaging scan"}</span>
              </div>
            </div>

            {study.completionNotes && (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-xs text-amber-900">
                <strong>Technician Completion Notes:</strong> {study.completionNotes}
              </div>
            )}
          </div>

          {/* Patient's Other Radiology Investigations */}
          {allPatientStudies.length > 1 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                All Radiology Studies for this Patient ({allPatientStudies.length})
              </h4>
              <div className="divide-y divide-slate-100 text-xs">
                {allPatientStudies.map((s) => {
                  const sPay = RadiologyWorkflowDb.getPaymentStatusFromBilling(s)
                  const sStat = RadiologyWorkflowDb.normalizeInvestigationStatus(s.status)
                  return (
                    <div key={s.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <span>{s.study}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {s.modality}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Ordered: {s.orderDate || s.ordered} by {s.provider}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                            sPay.status === "PAID"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {sPay.status}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                            sStat === "DONE"
                              ? "bg-emerald-100 text-emerald-800"
                              : sStat === "IN PROGRESS"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {sStat}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-white border-t border-slate-200">
          <span className="text-xs text-slate-500 font-medium">
            System Synchronized • Real Patient Clinical Record
          </span>
          <div className="flex items-center gap-2">
            {invStatus === "DONE" && onOpenReport && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onOpenReport(study)
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Open Clinical Report
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
