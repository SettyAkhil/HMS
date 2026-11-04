import React, { useState, useMemo, useEffect } from "react"
import {
  ExtendedRadiologyRecord,
  RadiologyWorkflowDb,
} from "../../services/radiologyWorkflowDb"
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  User,
  CreditCard,
  FileCheck,
  Search,
  AlertTriangle,
} from "lucide-react"

interface NurseVerificationTabProps {
  currentNurseName?: string
  onOrderVerified?: (message: string) => void
  onNavigateToDashboard?: () => void
}

export default function NurseVerificationTab({
  currentNurseName = "Nurse Lead (OPD)",
  onOrderVerified,
  onNavigateToDashboard,
}: NurseVerificationTabProps) {
  const [tick, setTick] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  // Subscribe to changes
  useEffect(() => {
    const unsub = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])

  const allStudies = useMemo(() => RadiologyWorkflowDb.getStudies(), [tick])

  // Unverified doctor orders (nurseVerified === false or status is Orders with no nurse verification log)
  const unverifiedStudies = useMemo(() => {
    return allStudies.filter((s) => {
      return s.nurseVerified === false
    })
  }, [allStudies])

  // Verified studies list (recently verified by nurse)
  const verifiedStudies = useMemo(() => {
    return allStudies.filter((s) => s.nurseVerified === true)
  }, [allStudies])

  // Filtered unverified list
  const filteredUnverified = useMemo(() => {
    if (!searchQuery.trim()) return unverifiedStudies
    const q = searchQuery.toLowerCase().trim()
    return unverifiedStudies.filter(
      (s) =>
        s.patient.toLowerCase().includes(q) ||
        (s.umr || "").toLowerCase().includes(q) ||
        s.study.toLowerCase().includes(q) ||
        s.provider.toLowerCase().includes(q),
    )
  }, [unverifiedStudies, searchQuery])

  // Strict FIFO Ordering with STAT Clinical Urgency Exception:
  // Oldest pending doctor orders appear strictly first (#1 at top).
  // STAT priority orders are prioritized at top of FIFO queue.
  const sortedUnverified = useMemo(() => {
    return RadiologyWorkflowDb.sortNurseVerificationQueue(filteredUnverified)
  }, [filteredUnverified])

  // Action: Nurse verifies investigation and forwards to Billing & Radiology
  const handleVerify = (study: ExtendedRadiologyRecord) => {
    setVerifyingId(study.id)
    try {
      RadiologyWorkflowDb.verifyInvestigationByNurse(study.id, currentNurseName)
      const msg = `✓ Investigation "${study.study}" for ${study.patient} verified by ${currentNurseName}. Forwarded simultaneously to Central Billing and Radiology Dashboard!`
      if (onOrderVerified) {
        onOrderVerified(msg)
      }
    } catch (err: any) {
      alert(err.message || "Failed to verify investigation.")
    } finally {
      setVerifyingId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Banner */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 uppercase tracking-wider">
                Step 2 • Verification Desk
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Nurse Investigation Verification & Distribution
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Doctor orders verified here are forwarded simultaneously to Central Billing (Claim) and Radiology Dashboard (Status: ORDERED).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              Active Nurse: <strong>{currentNurseName}</strong>
            </div>
          </div>
        </div>

        {/* Workflow Diagram Strip */}
        <div className="p-3 bg-gradient-to-r from-amber-50 via-indigo-50 to-emerald-50 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">1</span>
            <span>Doctor Prescribes Test</span>
          </div>
          <ArrowRight size={14} className="text-slate-400" />
          <div className="flex items-center gap-2 text-indigo-900 font-bold bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-2xs">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
            <span>Nurse Verifies Investigation</span>
          </div>
          <ArrowRight size={14} className="text-slate-400" />
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
            <span>Available to Billing & Radiology</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Unverified Orders Worklist */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock size={16} className="text-amber-600" />
                <span>Doctor Prescriptions Awaiting Nurse Verification ({filteredUnverified.length})</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review clinical prescription and dispatch to Billing and Radiology worklist
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by patient, UMR, test..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {filteredUnverified.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-80" />
              <p className="text-xs font-bold text-slate-700">All doctor prescriptions are verified!</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                New doctor radiology orders will appear here automatically for nurse sign-off.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedUnverified.map((study, idx) => {
                return (
                  <div
                    key={study.id}
                    className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">#{idx + 1} FIFO</span>
                        <span className="font-bold text-sm text-slate-900">{study.patient}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          UMR: {study.umr || study.mrn}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          OP: {study.opNumber || "OP-1002"}
                        </span>
                        {study.priority === "STAT" && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                            🚨 STAT EMERGENCY
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-indigo-700">{study.study}</span>
                        <span className="text-slate-400">•</span>
                        <span className="font-mono text-slate-600">Modality: {study.modality}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600 font-medium">Tariff: ₹{study.price.toLocaleString("en-IN")}</span>
                      </div>

                      <div className="text-xs text-slate-600">
                        <strong className="text-slate-700">Prescribing Doctor:</strong> {study.provider} • Ordered: {study.orderDate || study.ordered}
                      </div>

                      <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                        <strong>Indication:</strong> {study.indication || "Doctor consultation prescription"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        disabled={verifyingId === study.id}
                        onClick={() => handleVerify(study)}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck size={16} />
                        <span>{verifyingId === study.id ? "Forwarding..." : "Verify & Forward"}</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recently Verified Orders History */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>Verified Orders Active in Billing & Radiology ({verifiedStudies.length})</span>
            </h3>
            {onNavigateToDashboard && (
              <button
                type="button"
                onClick={onNavigateToDashboard}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
              >
                View Radiology Dashboard →
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {verifiedStudies.slice(0, 5).map((s) => {
              return (
                <div key={s.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {s.patient} • {s.study}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      UMR: {s.umr} • Verified by: {s.nurseVerifiedBy || "Nurse Desk"} • Doctor: {s.provider}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                        s.isPaid
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      Billing: {s.paymentStatusDisplay}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-slate-100 text-slate-800 uppercase">
                      {s.normalizedStatus}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
