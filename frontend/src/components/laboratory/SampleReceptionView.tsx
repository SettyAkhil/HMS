import React, { useState, useEffect, useMemo, useRef } from "react"
import {
  Inbox,
  Barcode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  User,
  Clock,
  ShieldCheck,
  RefreshCw,
  X,
  FileCheck,
} from "lucide-react"
import { LabLisService, SpecimenRecord, SpecimenCondition } from "../../services/labLisService"

export default function SampleReceptionView() {
  const [specimens, setSpecimens] = useState<SpecimenRecord[]>([])
  const [barcodeInput, setBarcodeInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("All")
  const [activeSubTab, setActiveSubTab] = useState<"awaiting" | "accepted" | "rejected" | "all">("awaiting")
  const [technicianName, setTechnicianName] = useState("Ramesh Sharma (Accessioning Tech)")
  const [inspectingSpecimen, setInspectingSpecimen] = useState<SpecimenRecord | null>(null)
  const [selectedCondition, setSelectedCondition] = useState<SpecimenCondition>("Good")
  const [rejectionReason, setRejectionReason] = useState("")
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const barcodeInputRef = useRef<HTMLInputElement>(null)

  const loadData = () => {
    setSpecimens(LabLisService.getSpecimens())
  }

  useEffect(() => {
    loadData()
    const unsub = LabLisService.subscribe(loadData)
    return () => unsub()
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Quick barcode scan submission
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcodeInput.trim()) return

    const match = specimens.find(
      (s) => s.barcode === barcodeInput.trim() || s.id.toLowerCase() === barcodeInput.trim().toLowerCase()
    )

    if (match) {
      setInspectingSpecimen(match)
      setSelectedCondition(match.condition || "Good")
      setRejectionReason("")
      setBarcodeInput("")
    } else {
      showToast(`Specimen with barcode/ID "${barcodeInput}" not found in laboratory queue.`)
    }
  }

  // Filtered accessioning list
  const accessionQueue = useMemo(() => {
    return specimens.filter((s) => {
      const matchSearch =
        !searchQuery ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.umr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.barcode.includes(searchQuery)

      const matchDept = selectedDeptFilter === "All" || s.department.includes(selectedDeptFilter)

      return matchSearch && matchDept
    })
  }, [specimens, searchQuery, selectedDeptFilter])

  // Sort awaiting reception with newest at TOP
  const pendingReception = useMemo(() => {
    return accessionQueue
      .filter((s) => s.status === "Collected")
      .sort((a, b) => {
        const dateA = a.collectedAt ? new Date(a.collectedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0)
        const dateB = b.collectedAt ? new Date(b.collectedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0)
        return dateB - dateA || b.id.localeCompare(a.id)
      })
  }, [accessionQueue])

  // Accepted & Routed samples
  const acceptedList = useMemo(() => {
    return accessionQueue
      .filter((s) => s.status === "Received & Accepted")
      .sort((a, b) => {
        const dateA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0
        const dateB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0
        return dateB - dateA || b.id.localeCompare(a.id)
      })
  }, [accessionQueue])

  // Rejected / recollected samples
  const rejectedList = useMemo(() => {
    return accessionQueue
      .filter((s) => s.status === "Rejected")
      .sort((a, b) => {
        const dateA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0
        const dateB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0
        return dateB - dateA || b.id.localeCompare(a.id)
      })
  }, [accessionQueue])

  // Sub-module segregation: displayed queue
  const displayedQueue = useMemo(() => {
    if (activeSubTab === "awaiting") return pendingReception
    if (activeSubTab === "accepted") return acceptedList
    if (activeSubTab === "rejected") return rejectedList
    // In "all", pending samples stay strictly at the TOP, accepted/rejected move to BOTTOM
    return [...pendingReception, ...acceptedList, ...rejectedList]
  }, [activeSubTab, pendingReception, acceptedList, rejectedList])

  const handleConfirmReception = () => {
    if (!inspectingSpecimen) return

    LabLisService.receiveSpecimen(inspectingSpecimen.id, selectedCondition, technicianName, rejectionReason)

    if (selectedCondition === "Good") {
      showToast(`Specimen ${inspectingSpecimen.id} accepted and routed to ${inspectingSpecimen.department} bench!`)
    } else {
      showToast(`Specimen ${inspectingSpecimen.id} REJECTED due to ${selectedCondition}. Recollection alert triggered.`)
    }

    setInspectingSpecimen(null)
    if (barcodeInputRef.current) barcodeInputRef.current.focus()
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xl flex items-center gap-2 border border-slate-700">
          <FileCheck className="w-4 h-4 text-[#0D9488]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── BARCODE SCANNER FAST ACCESSIONING DOCK ─────────────────────────── */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <h3 className="text-base font-black tracking-wide">Specimen Reception & Accessioning Desk</h3>
            </div>
            <p className="text-xs text-purple-200">
              Scan thermal barcode or enter Specimen ID to verify sample integrity, check hemolysis, and route to analytical benches
            </p>
          </div>

          <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Barcode className="w-4 h-4 absolute left-3 top-3 text-purple-300" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan barcode or type Specimen ID..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-3 py-2 text-xs bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:bg-white focus:text-slate-900 focus:ring-2 focus:ring-[#7552B8]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Inbox className="w-4 h-4" />
              <span>Accession</span>
            </button>
          </form>
        </div>
      </div>

      {/* ── METRIC STATS ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Awaiting Reception</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{pendingReception.length}</div>
          <div className="text-[10px] text-blue-600 font-semibold mt-0.5">Arrived from phlebotomy queue</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Accepted Today</span>
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{acceptedList.length}</div>
          <div className="text-[10px] text-teal-600 font-semibold mt-0.5">Under active bench analysis</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Rejected / QNS</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{rejectedList.length}</div>
          <div className="text-[10px] text-rose-600 font-semibold mt-0.5">Recollection alerts triggered</div>
        </div>
      </div>

      {/* ── SUB-TABS: CLEAN CATEGORIZATION & SEPARATION ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-2">
        <button
          onClick={() => setActiveSubTab("awaiting")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "awaiting"
              ? "bg-[#7552B8] text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Awaiting Accessioning</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "awaiting" ? "bg-white text-[#7552B8]" : "bg-purple-100 text-[#7552B8]"
            }`}
          >
            {pendingReception.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("accepted")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "accepted"
              ? "bg-[#0D9488] text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Accepted & Routed to Bench</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "accepted" ? "bg-white text-[#0D9488]" : "bg-teal-100 text-[#0D9488]"
            }`}
          >
            {acceptedList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("rejected")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "rejected"
              ? "bg-rose-600 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Rejected / Recollection</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "rejected" ? "bg-white text-rose-600" : "bg-rose-100 text-rose-600"
            }`}
          >
            {rejectedList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("all")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "all"
              ? "bg-slate-800 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>All Accession History</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === "all" ? "bg-white text-slate-800" : "bg-slate-200 text-slate-700"
            }`}
          >
            {accessionQueue.length}
          </span>
        </button>
      </div>

      {/* ── ACCESSIONING QUEUE TABLE ────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-[#7552B8]" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Specimen Accessioning Worklist</h3>
              <p className="text-[11px] text-slate-500">
                {activeSubTab === "awaiting" && "New specimens awaiting barcode verification & integrity inspection"}
                {activeSubTab === "accepted" && "Accepted samples successfully routed to departmental analyzers & benches"}
                {activeSubTab === "rejected" && "Rejected specimens pending recollection notice"}
                {activeSubTab === "all" && "All specimen accession logs (new pending arrivals on top, accepted at bottom)"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search patient, barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none w-52"
              />
            </div>

            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="All">All Departments</option>
              <option value="Hematology">Hematology</option>
              <option value="Biochemistry">Biochemistry</option>
              <option value="Microbiology">Microbiology</option>
              <option value="Pathology">Pathology</option>
            </select>

            <button
              onClick={loadData}
              className="p-1.5 bg-white border border-[#E2E8F0] hover:bg-slate-100 rounded-xl text-slate-600 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Barcode & ID</th>
                <th className="py-3 px-4">Patient Information</th>
                <th className="py-3 px-4">Specimen Type & Tube</th>
                <th className="py-3 px-4">Destination Department</th>
                <th className="py-3 px-4">Integrity Status</th>
                <th className="py-3 px-4">Accession State</th>
                <th className="py-3 px-4 text-right">Verification Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    {activeSubTab === "awaiting"
                      ? "No specimen records awaiting accessioning. All samples processed!"
                      : activeSubTab === "accepted"
                      ? "No specimens accepted today yet."
                      : activeSubTab === "rejected"
                      ? "No specimens currently rejected."
                      : "No specimen records match the current filter."}
                  </td>
                </tr>
              ) : (
                displayedQueue.map((spec) => {
                  const isAccepted = spec.status === "Received & Accepted"
                  const isRejected = spec.status === "Rejected"

                  return (
                    <tr key={spec.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{spec.barcode}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{spec.id}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{spec.patientName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {spec.umr} · {spec.age}y/{spec.sex?.[0]}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">{spec.tubeColor}</span>
                        <div className="text-[10px] text-slate-400">{spec.specimenType}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{spec.department}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            spec.condition === "Good"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-rose-50 text-rose-800 border-rose-200"
                          }`}
                        >
                          {spec.condition || "Good"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isAccepted
                              ? "bg-teal-50 text-teal-700 border-teal-200"
                              : isRejected
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {spec.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setInspectingSpecimen(spec)
                            setSelectedCondition(spec.condition || "Good")
                            setRejectionReason(spec.rejectionReason || "")
                          }}
                          className="px-3 py-1 bg-slate-100 hover:bg-[#7552B8] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          {isAccepted ? "Re-Inspect" : "Inspect & Accept"}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ACCESSIONING INSPECTION & ACCEPT/REJECT MODAL ────────────────────── */}
      {inspectingSpecimen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#0D9488]" />
                <h4 className="text-sm font-bold text-slate-900">Specimen Quality & Accessioning Check</h4>
              </div>
              <button
                onClick={() => setInspectingSpecimen(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Specimen Header Card */}
            <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900 text-sm">{inspectingSpecimen.patientName}</span>
                <span className="font-mono text-purple-800 font-bold">Barcode: {inspectingSpecimen.barcode}</span>
              </div>
              <div className="text-slate-600">
                UMR: {inspectingSpecimen.umr} · Container: <strong>{inspectingSpecimen.tubeColor}</strong>
              </div>
              <div className="text-slate-500 text-[11px]">
                Assigned Destination: <strong>{inspectingSpecimen.department}</strong>
              </div>
            </div>

            {/* Specimen Integrity Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">Specimen Physical Integrity Condition</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(
                  [
                    "Good",
                    "Hemolyzed",
                    "Lipemic",
                    "Icteric",
                    "Clotted",
                    "Insufficient Quantity (QNS)",
                    "Leaked / Damaged",
                  ] as SpecimenCondition[]
                ).map((cond) => (
                  <button
                    type="button"
                    key={cond}
                    onClick={() => setSelectedCondition(cond)}
                    className={`p-2 rounded-xl text-left font-medium border transition cursor-pointer ${
                      selectedCondition === cond
                        ? cond === "Good"
                          ? "bg-teal-50 border-teal-500 text-teal-800 font-bold"
                          : "bg-rose-50 border-rose-500 text-rose-800 font-bold"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {cond === "Good" ? "✓ " : "⚠️ "} {cond}
                  </button>
                ))}
              </div>
            </div>

            {/* Rejection reason textarea if not Good */}
            {selectedCondition !== "Good" && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Document Specimen Rejection Reason</span>
                </div>
                <textarea
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Specify clinical rejection rationale (e.g. In vitro hemolysis interferes with potassium & LDH)..."
                  className="w-full p-2 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none"
                />
              </div>
            )}

            {/* Receiving Tech name */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Accessioning Technician Signature</label>
              <input
                type="text"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                className="w-full p-2 text-xs border border-slate-200 rounded-xl bg-slate-50"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setInspectingSpecimen(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReception}
                className={`px-5 py-2 text-xs font-bold rounded-xl transition shadow-2xs text-white cursor-pointer ${
                  selectedCondition === "Good"
                    ? "bg-[#0D9488] hover:bg-[#0f766e]"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {selectedCondition === "Good" ? "Accept & Route to Bench" : "Confirm Specimen Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

