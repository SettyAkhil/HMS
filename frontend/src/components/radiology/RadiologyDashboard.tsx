import React, { useState, useMemo, useEffect } from "react"
import {
  ExtendedRadiologyRecord,
  RadiologyWorkflowDb,
} from "../../services/radiologyWorkflowDb"
import PatientDetailsModal from "./PatientDetailsModal"
import NewInvestigationOrderModal from "./NewInvestigationOrderModal"
import RadiologyReportPdfModal from "./RadiologyReportPdfModal"
import {
  Search,
  PlusCircle,
  Play,
  CheckCircle2,
  FileText,
  User,
  AlertTriangle,
  Check,
  ExternalLink,
} from "lucide-react"

interface RadiologyDashboardProps {
  currentTechnician?: string
  currentRole?: string
  onOpenReportInReportsDept?: (studyId: string) => void
  onNavigateToNurseVerification?: () => void
}

export default function RadiologyDashboard({
  currentTechnician = "Alex Rivera, RT(R)",
  onOpenReportInReportsDept,
}: RadiologyDashboardProps) {
  const [tick, setTick] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<
    "all" | "ordered" | "in_progress" | "done" | "paid" | "pending" | "stat"
  >("all")
  const [modalityFilter, setModalityFilter] = useState<string>("all")

  // Modals state
  const [viewPatientStudy, setViewPatientStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [showPdfStudy, setShowPdfStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  // Mark Done modal state
  const [markDoneStudy, setMarkDoneStudy] = useState<ExtendedRadiologyRecord | null>(null)
  const [completionNotes, setCompletionNotes] = useState("Standard diagnostic scanning protocol completed.")

  // Subscribe to changes
  useEffect(() => {
    const unsub = RadiologyWorkflowDb.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])

  // Load all studies from service (cached)
  const allStudies = useMemo(() => {
    return RadiologyWorkflowDb.getStudies()
  }, [tick])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Single-pass O(N) calculation for summary KPIs
  const stats = useMemo(() => {
    let total = 0
    let ordered = 0
    let inProgress = 0
    let done = 0
    let paid = 0
    let pending = 0
    let stat = 0

    for (let i = 0; i < allStudies.length; i++) {
      const s = allStudies[i]
      total++
      if (s.normalizedStatus === "ORDERED") ordered++
      else if (s.normalizedStatus === "IN PROGRESS") inProgress++
      else if (s.normalizedStatus === "DONE") done++

      if (s.isPaid) paid++
      else pending++

      if (s.priority === "STAT") stat++
    }

    return { total, ordered, inProgress, done, paid, pending, stat }
  }, [allStudies])

  // Fast O(1) property checks for filtering
  const filteredStudies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const filterBySearch = q.length > 0
    const filterByModality = modalityFilter !== "all"

    return allStudies.filter((study) => {
      // 1. Status / Queue Tab Filter (Instant property check)
      if (activeFilter === "ordered" && study.normalizedStatus !== "ORDERED") return false
      if (activeFilter === "in_progress" && study.normalizedStatus !== "IN PROGRESS") return false
      if (activeFilter === "done" && study.normalizedStatus !== "DONE") return false
      if (activeFilter === "paid" && !study.isPaid) return false
      if (activeFilter === "pending" && study.isPaid) return false
      if (activeFilter === "stat" && study.priority !== "STAT") return false

      // 2. Modality Filter
      if (filterByModality && study.modality !== modalityFilter) return false

      // 3. Search Filter
      if (filterBySearch) {
        const matchPatient = study.patient.toLowerCase().includes(q)
        const matchUmr = (study.umr || "").toLowerCase().includes(q)
        const matchMrn = (study.mrn || "").toLowerCase().includes(q)
        const matchOp = (study.opNumber || "").toLowerCase().includes(q)
        const matchStudy = study.study.toLowerCase().includes(q)
        const matchDoctor = study.provider.toLowerCase().includes(q)
        const matchId = study.id.toLowerCase().includes(q)
        if (!matchPatient && !matchUmr && !matchMrn && !matchOp && !matchStudy && !matchDoctor && !matchId) {
          return false
        }
      }

      return true
    })
  }, [allStudies, activeFilter, modalityFilter, searchQuery])

  // Action: Start Test (ORDERED -> IN PROGRESS)
  const handleStartTest = (study: ExtendedRadiologyRecord) => {
    try {
      RadiologyWorkflowDb.startInvestigation(study.id, currentTechnician, study.room)
      showToast(`⚡ Investigation scan started for ${study.patient} (${study.study}) in ${study.room}`, "info")
    } catch (err: any) {
      showToast(err.message || "Failed to start investigation", "error")
    }
  }

  // Action: Confirm Mark as DONE
  const handleConfirmMarkDone = () => {
    if (!markDoneStudy) return
    try {
      RadiologyWorkflowDb.markInvestigationDone(markDoneStudy.id, currentTechnician, completionNotes)
      showToast(
        `✓ Investigation marked as DONE for ${markDoneStudy.patient}. Transferred to Reports Page!`,
        "success",
      )
      setMarkDoneStudy(null)
    } catch (err: any) {
      showToast(err.message || "Failed to mark as done", "error")
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-2 ${
            toastMessage.type === "success"
              ? "bg-emerald-950 text-emerald-100 border-emerald-700"
              : toastMessage.type === "error"
                ? "bg-rose-950 text-rose-100 border-rose-700"
                : "bg-slate-900 text-white border-slate-700"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : (
            <AlertTriangle size={16} className="text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Dashboard Top Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                Radiology Department
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Investigation Workflow & Operations Dashboard
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Instant Live Investigation Queue • Synchronized Billing Status (PAID / PENDING) • Fast Actions
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowNewOrderModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle size={15} />
              <span>Prescribe Investigation</span>
            </button>
          </div>
        </div>

        {/* Dashboard Quick Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              activeFilter === "all"
                ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-400/50"
                : "bg-slate-50/60 hover:bg-slate-100 border-slate-200"
            }`}
          >
            <div className="text-[11px] font-bold text-slate-600 uppercase">Total Orders</div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">{stats.total}</div>
            <div className="text-[10px] text-slate-500">All investigations</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("ordered")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              activeFilter === "ordered"
                ? "bg-slate-200 border-slate-400 ring-2 ring-slate-400/50"
                : "bg-slate-50/60 hover:bg-slate-100 border-slate-200"
            }`}
          >
            <div className="text-[11px] font-bold text-slate-700 uppercase">ORDERED</div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">{stats.ordered}</div>
            <div className="text-[10px] text-slate-500">Awaiting scan start</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("in_progress")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              activeFilter === "in_progress"
                ? "bg-blue-50 border-blue-300 ring-2 ring-blue-400/50"
                : "bg-slate-50/60 hover:bg-slate-100 border-slate-200"
            }`}
          >
            <div className="text-[11px] font-bold text-blue-700 uppercase">IN PROGRESS</div>
            <div className="text-xl font-extrabold text-blue-950 mt-1">{stats.inProgress}</div>
            <div className="text-[10px] text-blue-600">Scan being performed</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("done")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              activeFilter === "done"
                ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/50"
                : "bg-slate-50/60 hover:bg-slate-100 border-slate-200"
            }`}
          >
            <div className="text-[11px] font-bold text-emerald-700 uppercase">DONE</div>
            <div className="text-xl font-extrabold text-emerald-950 mt-1">{stats.done}</div>
            <div className="text-[10px] text-emerald-600">Awaiting report</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("paid")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              activeFilter === "paid"
                ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/50"
                : "bg-slate-50/60 hover:bg-slate-100 border-slate-200"
            }`}
          >
            <div className="text-[11px] font-bold text-emerald-800 uppercase">Billing: PAID</div>
            <div className="text-xl font-extrabold text-emerald-900 mt-1">{stats.paid}</div>
            <div className="text-[10px] text-emerald-700">Receipt cleared</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("pending")}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              activeFilter === "pending"
                ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400/50"
                : "bg-slate-50/60 hover:bg-slate-100 border-slate-200"
            }`}
          >
            <div className="text-[11px] font-bold text-amber-800 uppercase">Billing: PENDING</div>
            <div className="text-xl font-extrabold text-amber-900 mt-1">{stats.pending}</div>
            <div className="text-[10px] text-amber-700">Due at billing desk</div>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Queue Tab Buttons */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                activeFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("ordered")}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                activeFilter === "ordered" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Ordered ({stats.ordered})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("in_progress")}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                activeFilter === "in_progress" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              In Progress ({stats.inProgress})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("done")}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                activeFilter === "done" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Done ({stats.done})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("stat")}
              className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                activeFilter === "stat" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-600 hover:text-rose-700"
              }`}
            >
              🚨 STAT ({stats.stat})
            </button>
          </div>

          {/* Modality Filter */}
          <select
            value={modalityFilter}
            onChange={(e) => setModalityFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Modalities</option>
            <option value="XR">X-Ray (XR)</option>
            <option value="CT">CT Scan (CT)</option>
            <option value="MR">MRI (MR)</option>
            <option value="US">Ultrasound / Echo (US)</option>
            <option value="NM">Special / Mammo</option>
          </select>
        </div>

        {/* Search Field */}
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient, UMR, OP/IP, doctor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Main Radiology Dashboard Table */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Patient & UMR</th>
                <th className="py-3 px-4">OP / IP No</th>
                <th className="py-3 px-4">Investigation Name</th>
                <th className="py-3 px-4">Ordering Doctor & Date</th>
                <th className="py-3 px-4">Payment Status</th>
                <th className="py-3 px-4">Investigation Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-bold text-slate-700">No radiology investigations found.</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Adjust your search or filter criteria, or prescribe a new investigation.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStudies.map((study) => {
                  const isPaid = study.isPaid
                  const invStatus = study.normalizedStatus
                  const repStatus = study.normalizedReportStatus

                  return (
                    <tr key={study.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Patient Name & UMR Number */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs">
                          {study.patient}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          UMR: {study.umr || `PAT-${study.mrn}`}
                        </div>
                      </td>

                      {/* 2. OP / IP Number */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {study.opNumber || study.ipNumber || "OP-1002"}
                        </span>
                      </td>

                      {/* 3. Investigation Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <span>{study.study}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span className="font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold">
                            {study.modality}
                          </span>
                          <span>Suite: {study.room || "Suite 1"}</span>
                          <span>•</span>
                          <span>₹{study.price.toLocaleString("en-IN")}</span>
                          {study.priority === "STAT" && (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold bg-rose-100 text-rose-800">
                              STAT
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Ordering Doctor & Order Date */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">
                          {study.provider}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {study.orderDate || study.ordered}
                        </div>
                      </td>

                      {/* 5. Payment Status (PAID / PENDING) */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                            isPaid
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-amber-100 text-amber-800 border border-amber-300"
                          }`}
                        >
                          {isPaid ? <Check size={12} /> : <AlertTriangle size={12} />}
                          <span>{isPaid ? "PAID" : "PENDING"}</span>
                        </span>
                        {isPaid && study.paidReceiptNo && (
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            {study.paidReceiptNo}
                          </div>
                        )}
                      </td>

                      {/* 6. Investigation Status (ORDERED / IN PROGRESS / DONE) */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-extrabold tracking-wider uppercase ${
                            invStatus === "DONE"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : invStatus === "IN PROGRESS"
                                ? "bg-blue-100 text-blue-800 border border-blue-300 animate-pulse"
                                : "bg-slate-100 text-slate-700 border border-slate-300"
                          }`}
                        >
                          {invStatus}
                        </span>
                        {invStatus === "DONE" && (
                          <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                            Report: {repStatus}
                          </div>
                        )}
                      </td>

                      {/* 7. Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* View Patient Details */}
                          <button
                            type="button"
                            onClick={() => setViewPatientStudy(study)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                            title="View patient details"
                          >
                            <User size={13} />
                            <span>Patient</span>
                          </button>

                          {/* Investigation Workflow Progression */}
                          {invStatus === "ORDERED" && (
                            <button
                              type="button"
                              onClick={() => handleStartTest(study)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                            >
                              <Play size={12} />
                              <span>Start Test</span>
                            </button>
                          )}

                          {invStatus === "IN PROGRESS" && (
                            <button
                              type="button"
                              onClick={() => {
                                setMarkDoneStudy(study)
                                setCompletionNotes("Standard diagnostic imaging scan completed cleanly.")
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 size={12} />
                              <span>Mark as DONE</span>
                            </button>
                          )}

                          {invStatus === "DONE" && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onOpenReportInReportsDept) {
                                    onOpenReportInReportsDept(study.id)
                                  }
                                }}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <FileText size={12} />
                                <span>{repStatus === "Finalized" ? "View Report" : "Prepare Report"}</span>
                              </button>

                              {repStatus === "Finalized" && (
                                <button
                                  type="button"
                                  onClick={() => setShowPdfStudy(study)}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
                                  title="Print / Download Final PDF"
                                >
                                  <ExternalLink size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient Details Modal */}
      {viewPatientStudy && (
        <PatientDetailsModal
          study={viewPatientStudy}
          onClose={() => setViewPatientStudy(null)}
          onOpenReport={(study) => {
            if (onOpenReportInReportsDept) {
              onOpenReportInReportsDept(study.id)
            }
          }}
        />
      )}

      {/* Prescribe Investigation Modal */}
      {showNewOrderModal && (
        <NewInvestigationOrderModal
          onClose={() => setShowNewOrderModal(false)}
          onOrderCreated={(msg) => showToast(msg, "success")}
        />
      )}

      {/* Mark Done Dialog Modal */}
      {markDoneStudy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Mark Investigation as DONE</h3>
                <p className="text-xs text-slate-500">
                  {markDoneStudy.patient} • {markDoneStudy.study}
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Technician Completion Notes:
              </label>
              <textarea
                rows={3}
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter scan completion observations, contrast details, or protocol notes..."
              />
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
              Per workflow, marking this investigation as <strong>DONE</strong> will immediately move it to the <strong>Reports Page</strong> for clinical findings entry.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMarkDoneStudy(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkDone}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Confirm DONE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Modal */}
      {showPdfStudy && (
        <RadiologyReportPdfModal
          study={showPdfStudy}
          onClose={() => setShowPdfStudy(null)}
        />
      )}
    </div>
  )
}
