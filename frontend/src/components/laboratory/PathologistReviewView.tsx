import React, { useState, useEffect, useMemo } from "react"
import {
  CheckCircle,
  FileCheck,
  AlertTriangle,
  User,
  Clock,
  Printer,
  Search,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  Edit3,
} from "lucide-react"
import { LabOrder, LabOrderDatabase } from "../../services/labOrdersDb"
import { LabLisService } from "../../services/labLisService"
import CompleteLabReportModal from "./CompleteLabReportModal"

interface PathologistReviewViewProps {
  initialOrderId?: string
}

export default function PathologistReviewView({ initialOrderId }: PathologistReviewViewProps = {}) {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId || "")
  const [searchQuery, setSearchQuery] = useState("")
  const [pathologistName, setPathologistName] = useState("Dr. Arvind Swaminathan, MD (Path)")
  const [interpretiveComments, setInterpretiveComments] = useState("")
  const [activeReportOrder, setActiveReportOrder] = useState<LabOrder | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const loadData = () => {
    const list = LabOrderDatabase.getOrders()
    setOrders(list)
    if (!selectedOrderId && list.length > 0) {
      const matchInitial = initialOrderId ? list.find((o) => o.id === initialOrderId) : null
      const reviewable = matchInitial || list.find((o) => o.status !== "Completed" && o.status !== "Cancelled") || list[0]
      setSelectedOrderId(reviewable.id)
    }
  }

  useEffect(() => {
    if (initialOrderId) {
      setSelectedOrderId(initialOrderId)
    }
  }, [initialOrderId])

  useEffect(() => {
    loadData()
    const unsub = LabOrderDatabase.subscribe(loadData)
    return () => unsub()
  }, [])

  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === selectedOrderId) || null
  }, [orders, selectedOrderId])

  const isSelectedOrderPaid = selectedOrder?.billing?.status === "Paid"
  const hasSelectedOrderResults = Boolean(
    selectedOrder?.tests.some(
      (t) => Boolean(t.result) || (t.results && Object.keys(t.results).length > 0)
    )
  )

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Orders awaiting review
  const reviewOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !searchQuery ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.umr.toLowerCase().includes(searchQuery.toLowerCase())

      return matchSearch
    })
  }, [orders, searchQuery])

  const handleAuthorizeReport = () => {
    if (!selectedOrder) return

    if (!isSelectedOrderPaid) {
      showToast(`Cannot finalize: Billing for Order ${selectedOrder.id} is pending payment (₹${selectedOrder.billing?.total || 0}) at Billing section.`)
      return
    }

    if (!hasSelectedOrderResults) {
      showToast(`Cannot finalize: No test results entered yet for Order ${selectedOrder.id}. Please enter results in Lab Workbench first.`)
      return
    }

    const ok = LabLisService.verifyAndSignReport(selectedOrder.id, pathologistName, interpretiveComments)
    if (!ok) {
      showToast(`Authorization blocked. Check billing status and test result entries.`)
      return
    }

    showToast(`Order ${selectedOrder.id} authorized & signed by ${pathologistName}! Opening diagnostic report...`)
    setInterpretiveComments("")

    setTimeout(() => {
      const refreshed = LabOrderDatabase.getOrder(selectedOrder.id)
      if (refreshed) setActiveReportOrder(refreshed)
    }, 400)
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── TOP BANNER ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-100 text-[#7552B8] rounded-xl">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Pathologist & Authorized Reviewer Workspace</h3>
            <p className="text-[11px] text-slate-500">
              Two-panel clinical verification, biological delta checks, interpretive commentary, and digital report release
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Authorizing Pathologist:</span>
          <input
            type="text"
            value={pathologistName}
            onChange={(e) => setPathologistName(e.target.value)}
            className="text-xs font-bold text-purple-900 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1 w-64"
          />
        </div>
      </div>

      {/* ── TWO-PANEL REVIEW LAYOUT ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Panel: Review Worklist Queue (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl shadow-2xs p-3 space-y-3 flex flex-col h-[750px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Diagnostic Queue ({reviewOrders.length})
            </span>
            <span className="text-[10px] text-slate-400">Click to load</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search queue by patient, UMR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {reviewOrders.map((ord) => {
              const isSelected = selectedOrderId === ord.id
              const hasCritical = ord.tests.some(
                (t) => t.flag === "Critical" || Object.values(t.results || {}).some((r) => r.flag === "Critical")
              )
              const isOrderPaid = ord.billing?.status === "Paid"
              const isFinal = ord.status === "Completed" && isOrderPaid

              return (
                <div
                  key={ord.id}
                  onClick={() => setSelectedOrderId(ord.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-1 ${
                    isSelected
                      ? "bg-purple-50/70 border-[#7552B8] shadow-xs ring-1 ring-[#7552B8]"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-900">{ord.patientName}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${
                        !isOrderPaid
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : isFinal
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : hasCritical
                              ? "bg-rose-50 text-rose-800 border-rose-200 animate-pulse"
                              : "bg-blue-50 text-blue-800 border-blue-200"
                      }`}
                    >
                      {!isOrderPaid
                        ? "Bill Pending"
                        : isFinal
                          ? "Verified"
                          : hasCritical
                            ? "Critical Alert"
                            : ord.status}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono">
                    {ord.umr} · {ord.id}
                  </div>

                  <div className="text-slate-700 font-medium truncate text-[11.5px]">
                    {ord.tests.map((t) => t.name).join(", ")}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Panel: Detailed Results & Authorization (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl shadow-2xs p-5 space-y-4 flex flex-col justify-between h-[750px] overflow-y-auto">
          {selectedOrder ? (
            <div className="space-y-4">
              {/* Header Details */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 text-sm">{selectedOrder.patientName}</span>
                    <span className="font-mono text-purple-700 font-bold">({selectedOrder.umr})</span>
                  </div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Age/Sex: {selectedOrder.age}y/{selectedOrder.sex} · Doctor: {selectedOrder.doctorName} (
                    {selectedOrder.department})
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveReportOrder(selectedOrder)}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Preview</span>
                  </button>
                </div>
              </div>

              {/* Billing Clearance or Results Alert Banner */}
              {!isSelectedOrderPaid ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Billing Clearance Required:</strong> Order {selectedOrder.id} has an unpaid bill of ₹{selectedOrder.billing?.total?.toLocaleString("en-IN") || 0}. Billing must be cleared in the central Billing Section before this diagnostic report can be verified or finalized.
                    </span>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg font-bold shrink-0">
                    Bill Pending
                  </span>
                </div>
              ) : !hasSelectedOrderResults ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs text-blue-900">
                  <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Awaiting Workbench Results:</strong> No analytical observations or test values have been recorded for this order yet. Results must be entered on the workbench before authorization.
                  </span>
                </div>
              ) : null}

              {/* Tests & Parameters Observation Table */}
              <div className="space-y-4">
                {selectedOrder.tests.map((test) => {
                  const hasParams = test.results && Object.keys(test.results).length > 0

                  return (
                    <div key={test.id} className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <div className="px-3.5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex justify-between items-center">
                        <div>
                          <strong className="text-slate-900 font-bold text-xs">{test.name}</strong>
                          <span className="text-[10.5px] text-slate-500 ml-2">Dept: {test.category}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
                          Status: {test.status}
                        </span>
                      </div>

                      {hasParams ? (
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100">
                            <tr>
                              <th className="py-2 px-3">Analyte / Parameter</th>
                              <th className="py-2 px-3">Observed Result</th>
                              <th className="py-2 px-3">Unit</th>
                              <th className="py-2 px-3">Reference Range</th>
                              <th className="py-2 px-3 text-right">Flag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Object.entries(test.results || {}).map(([pName, pRes]) => {
                              const isCrit = pRes.flag === "Critical"
                              const isAbnormal = pRes.flag === "H" || pRes.flag === "L"

                              return (
                                <tr key={pName} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 font-semibold text-slate-800">{pName}</td>
                                  <td
                                    className={`py-2 px-3 font-mono font-bold ${
                                      isCrit
                                        ? "text-rose-700 bg-rose-50"
                                        : isAbnormal
                                          ? "text-amber-800"
                                          : "text-slate-900"
                                    }`}
                                  >
                                    {pRes.value}
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{pRes.unit || "-"}</td>
                                  <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                                    {pRes.referenceRange || "-"}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    {isCrit ? (
                                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[9.5px]">
                                        PANIC CRITICAL
                                      </span>
                                    ) : isAbnormal ? (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[9.5px]">
                                        {pRes.flag === "H" ? "HIGH" : "LOW"}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-700 font-bold text-[10.5px]">Normal</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-3 text-slate-600 text-xs">
                          {test.result ? (
                            <div>
                              Finding: <strong className="text-slate-900">{test.result}</strong>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No parameter observations recorded yet.</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Pathologist Commentary & Release Actions */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Pathologist Interpretive Opinion & Impressions
                </label>
                <textarea
                  rows={2}
                  value={interpretiveComments}
                  onChange={(e) => setInterpretiveComments(e.target.value)}
                  placeholder="Enter medical interpretation, correlation with clinical symptoms, or recommendation for repeat testing..."
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none"
                />

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-slate-500">
                    Signing as: <strong className="text-purple-900">{pathologistName}</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveReportOrder(selectedOrder)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Preview / Print Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAuthorizeReport}
                      disabled={!isSelectedOrderPaid || !hasSelectedOrderResults}
                      className={`px-5 py-2 text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5 ${
                        !isSelectedOrderPaid || !hasSelectedOrderResults
                          ? "bg-slate-300 cursor-not-allowed text-slate-500"
                          : "bg-[#0D9488] hover:bg-[#0f766e] cursor-pointer"
                      }`}
                      title={
                        !isSelectedOrderPaid
                          ? "Bill must be paid at Billing Section before authorization"
                          : !hasSelectedOrderResults
                            ? "Enter test results on Workbench before authorization"
                            : "Authorize & finalize official diagnostic report"
                      }
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Authorize & Finalize Report</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              Select an order from the queue on the left to review diagnostic results.
            </div>
          )}
        </div>
      </div>

      {/* Complete Printable Report Modal */}
      {activeReportOrder && (
        <CompleteLabReportModal order={activeReportOrder} onClose={() => setActiveReportOrder(null)} />
      )}
    </div>
  )
}

