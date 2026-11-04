import React, { useState, useEffect, useMemo } from "react"
import {
  FileEdit,
  CheckCircle2,
  AlertTriangle,
  Search,
  Save,
  User,
  Clock,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Stethoscope,
  Microscope,
  DollarSign,
  ArrowRight,
} from "lucide-react"
import { LabOrder, LabOrderTest, LabOrderDatabase, LabParameterResult } from "../../services/labOrdersDb"
import { findTestDefinition, LabTestDefinition, evaluateFlag } from "./labCatalogueSchema"
import { AuditDatabase } from "../../services/auditDb"

interface ResultEntryViewProps {
  initialOrder?: LabOrder
  initialTest?: LabOrderTest
  onComplete?: () => void
}

export default function ResultEntryView({ initialOrder, initialTest, onComplete }: ResultEntryViewProps) {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrder?.id || "")
  const [selectedTestId, setSelectedTestId] = useState<string>(initialTest?.id || "")
  const [paramValues, setParamValues] = useState<Record<string, LabParameterResult>>({})
  const [clinicalComments, setClinicalComments] = useState<string>("")
  const [technicianName, setTechnicianName] = useState<string>("Bench Technician")
  const [cultureRows, setCultureRows] = useState<
    Array<{
      antibiotic: string
      zone: string
      mic: string
      susceptibility: "Sensitive" | "Intermediate" | "Resistant"
    }>
  >([])
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const loadOrders = () => {
    const list = LabOrderDatabase.getOrders()
    setOrders(list)
    if (!selectedOrderId && list.length > 0) {
      const active =
        list.find((o) => o.billing?.status === "Paid" && o.status !== "Completed" && o.status !== "Cancelled") ||
        list.find((o) => o.status !== "Completed" && o.status !== "Cancelled") ||
        list[0]
      setSelectedOrderId(active.id)
      if (active.tests.length > 0) {
        setSelectedTestId(active.tests[0].id)
      }
    }
  }

  useEffect(() => {
    loadOrders()
    const unsub = LabOrderDatabase.subscribe(loadOrders)
    return () => unsub()
  }, [])

  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === selectedOrderId) || null
  }, [orders, selectedOrderId])

  const isOrderPaid = selectedOrder?.billing?.status === "Paid"

  const selectedTest = useMemo(() => {
    if (!selectedOrder) return null
    return selectedOrder.tests.find((t) => t.id === selectedTestId) || selectedOrder.tests[0] || null
  }, [selectedOrder, selectedTestId])

  const testDefinition = useMemo(() => {
    if (!selectedTest) return undefined
    return findTestDefinition(selectedTest.name)
  }, [selectedTest])

  // Load existing results into state when test changes
  useEffect(() => {
    if (!selectedTest) return

    const initial: Record<string, LabParameterResult> = {}
    if (selectedTest.results && Object.keys(selectedTest.results).length > 0) {
      Object.assign(initial, selectedTest.results)
    } else if (testDefinition) {
      testDefinition.parameters.forEach((param) => {
        // Start empty: the catalogue's defaultValue is a demo value, and preloading it made
        // invented numbers look like the patient's recorded result. "Auto-Fill Normal Values"
        // remains an explicit action.
        initial[param.name] = {
          value: "",
          unit: param.unit || "",
          referenceRange: param.referenceRange
            ? (param.referenceRange.low !== undefined && param.referenceRange.high !== undefined
                ? `${param.referenceRange.low} - ${param.referenceRange.high}`
                : param.referenceRange.text || "")
            : "",
          flag: "",
        }
      })
    }
    setParamValues(initial)
    setClinicalComments(selectedTest.clinicalComments || "")
    setTechnicianName(selectedTest.technician || "Bench Technician")
    setCultureRows(selectedTest.tableData || [])
  }, [selectedTest, testDefinition])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleValueChange = (paramName: string, val: string, paramDef?: any) => {
    if (!isOrderPaid) {
      showToast("Editing restricted: Patient bill must be paid at billing desk first.")
      return
    }

    let flag: LabParameterResult["flag"] = ""
    if (paramDef?.referenceRange) {
      flag = evaluateFlag(val, paramDef.referenceRange)
    }

    setParamValues((prev) => ({
      ...prev,
      [paramName]: {
        ...prev[paramName],
        value: val,
        flag: flag,
      },
    }))
  }

  const handleAddCultureRow = () => {
    if (!isOrderPaid) return
    setCultureRows((prev) => [
      ...prev,
      { antibiotic: "Amikacin (AK)", zone: "22 mm", mic: "<= 4 ug/mL", susceptibility: "Sensitive" },
    ])
  }

  const handleAutoFillNormalValues = () => {
    if (!testDefinition) return
    const normalValues: Record<string, LabParameterResult> = {}
    testDefinition.parameters.forEach((param) => {
      let defaultVal = param.defaultValue || ""
      if (!defaultVal && param.referenceRange) {
        if (param.referenceRange.low !== undefined && param.referenceRange.high !== undefined) {
          const mid = (param.referenceRange.low + param.referenceRange.high) / 2
          defaultVal = String(Number.isInteger(mid) ? mid : mid.toFixed(1))
        } else if (param.referenceRange.text) {
          defaultVal = param.referenceRange.text.split("-")[0]?.trim() || "Normal"
        }
      }
      normalValues[param.name] = {
        value: defaultVal || "Normal",
        unit: param.unit || "",
        referenceRange: param.referenceRange
          ? (param.referenceRange.low !== undefined && param.referenceRange.high !== undefined
              ? `${param.referenceRange.low} - ${param.referenceRange.high}`
              : param.referenceRange.text || "")
          : "",
        flag: "",
      }
    })
    setParamValues(normalValues)
    showToast("Filled standard physiological reference values!")
  }

  const handleRemoveCultureRow = (index: number) => {
    if (!isOrderPaid) return
    setCultureRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveResult = (status: "Result Entered" | "Completed") => {
    if (!selectedOrder || !selectedTest) return

    if (!isOrderPaid) {
      showToast("Cannot enter results: Patient bill has not been cleared at the billing counter.")
      return
    }

    const hasAnyValue =
      Object.values(paramValues).some((r) => String(r?.value ?? "").trim() !== "") ||
      cultureRows.length > 0 ||
      clinicalComments.trim() !== ""
    if (!hasAnyValue) {
      showToast("Enter at least one observed value before saving.")
      return
    }

    const saved = LabOrderDatabase.saveDetailedTestResult(
      selectedOrder.id,
      selectedTest.id,
      {
        status,
        results: paramValues,
        clinicalComments,
        technician: technicianName,
        tableData: cultureRows.length > 0 ? cultureRows : undefined,
        actor: technicianName,
      }
    )

    if (!saved) {
      showToast("Action restricted: Bill payment is required to save results.")
      return
    }

    showToast(`Observations for ${selectedTest.name} saved as "${status}"!`)
    if (onComplete) onComplete()
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

      {/* ── TOP ORDER SELECTOR & WORKSPACE HEADER ───────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-100 text-[#7552B8] rounded-xl">
            <FileEdit className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Structured Laboratory Result Entry</h3>
            <p className="text-[11px] text-slate-500">
              Input test observations, apply reference intervals, and evaluate critical panic limits
            </p>
          </div>
        </div>

        {/* Order & Test Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <select
              value={selectedOrderId}
              onChange={(e) => {
                setSelectedOrderId(e.target.value)
                const ord = orders.find((o) => o.id === e.target.value)
                if (ord && ord.tests.length > 0) setSelectedTestId(ord.tests[0].id)
              }}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
            >
              {orders.map((o) => {
                const paid = o.billing?.status === "Paid"
                return (
                  <option key={o.id} value={o.id}>
                    {o.id} · {o.patientName} ({o.umr}) — {paid ? "✓ Paid" : "⚠ Bill Pending"}
                  </option>
                )
              })}
            </select>
          </div>

          {selectedOrder && (
            <div>
              <select
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
                className="px-3 py-1.5 text-xs bg-purple-50 border border-purple-200 rounded-xl font-bold text-[#7552B8]"
              >
                {selectedOrder.tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── RESULT ENTRY FORM ───────────────────────────────────────────────── */}
      {selectedOrder && selectedTest ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs p-5 space-y-5">
          {/* Patient Banner */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-900 text-sm">{selectedOrder.patientName}</span>{" "}
              <span className="font-mono text-purple-700 font-bold">({selectedOrder.umr})</span>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {selectedOrder.age}y · {selectedOrder.sex} · Doctor: {selectedOrder.doctorName} ({selectedOrder.department})
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-purple-100 text-purple-800 font-bold text-xs">
                {selectedTest.name}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10.5px] font-bold border ${
                  selectedTest.urgency === "STAT"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                {selectedTest.urgency || "Routine"}
              </span>
            </div>
          </div>

          {/* Billing Clearance Status Banner */}
          {!isOrderPaid ? (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-center gap-3 text-amber-950">
              <div className="p-2.5 bg-amber-200/90 rounded-xl text-amber-900 shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <div className="font-extrabold text-xs uppercase tracking-wider text-amber-900">
                  Billing Pending at Billing Section (₹{selectedOrder.billing?.total?.toLocaleString("en-IN") || 0} Unpaid)
                </div>
                <div className="text-xs text-amber-800 mt-1">
                  Billing must be completed at the <strong>Billing section</strong>. Result entry is strictly locked until the bill is settled at the billing counter.
                </div>
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-emerald-900 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold">Bill Paid & Cleared</span>
                <span className="text-[11px] text-emerald-700 font-mono">
                  (Total: ₹{selectedOrder.billing.total.toLocaleString("en-IN")} · Receipt: {selectedOrder.billing.receiptNo || "Paid"})
                </span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase rounded">
                Cleared for Results
              </span>
            </div>
          )}

          {/* Locked overlay when bill is pending */}
          {!isOrderPaid ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl">
                🔒
              </div>
              <h4 className="font-bold text-sm text-slate-800">Result Entry Locked</h4>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                This test order has an unpaid bill of ₹{selectedOrder.billing?.total?.toLocaleString("en-IN") || 0}. Billing must be cleared in the <strong>Billing Section</strong> before laboratory results can be recorded or submitted.
              </p>
            </div>
          ) : testDefinition && testDefinition.parameters.length > 0 ? (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Test Parameter Observations
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoFillNormalValues}
                    disabled={!isOrderPaid}
                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-[#7552B8] border border-purple-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    title="Automatically fill normal baseline values for rapid entry"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Fill Normal Values</span>
                  </button>
                  <span className="text-[11px] text-slate-400">Biological Reference Ranges Verified</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100/80 border-b border-slate-200 text-[10.5px] uppercase font-bold text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3">Parameter Name</th>
                      <th className="py-2.5 px-3 w-48">Observed Value</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3">Biological Reference Range</th>
                      <th className="py-2.5 px-3 text-right">Flag / Warning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {testDefinition.parameters.map((param) => {
                      const curr = paramValues[param.name] || { value: "", flag: "" }
                      const isHigh = curr.flag === "H"
                      const isLow = curr.flag === "L"
                      const isCritical = curr.flag === "Critical"

                      return (
                        <tr key={param.id || param.name} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{param.name}</td>

                          <td className="py-2.5 px-3">
                            {param.inputType === "select" || param.options ? (
                              <select
                                value={curr.value}
                                disabled={!isOrderPaid}
                                onChange={(e) => handleValueChange(param.name, e.target.value, param)}
                                className={`w-full p-1.5 border rounded-lg text-xs ${
                                  !isOrderPaid ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white border-slate-200"
                                }`}
                              >
                                <option value="">Select Result...</option>
                                {(param.options || ["Normal", "Abnormal", "Not Detected"]).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : param.inputType === "positive_negative" ||
                              param.inputType === "reactive_nonreactive" ? (
                              <select
                                value={curr.value}
                                disabled={!isOrderPaid}
                                onChange={(e) => handleValueChange(param.name, e.target.value, param)}
                                className={`w-full p-1.5 border rounded-lg text-xs font-bold ${
                                  !isOrderPaid ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white border-slate-200"
                                }`}
                              >
                                <option value="">Select...</option>
                                <option value="Negative">Negative / Non-Reactive</option>
                                <option value="Positive">Positive / Reactive</option>
                              </select>
                            ) : (
                              <input
                                type={param.inputType === "numeric" ? "text" : "text"}
                                value={curr.value}
                                disabled={!isOrderPaid}
                                placeholder={!isOrderPaid ? "Payment required..." : "Enter value..."}
                                onChange={(e) => handleValueChange(param.name, e.target.value, param)}
                                className={`w-full p-1.5 rounded-lg border text-xs font-bold focus:outline-none ${
                                  !isOrderPaid
                                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                                    : isCritical
                                      ? "bg-rose-50 border-rose-400 text-rose-800"
                                      : isHigh || isLow
                                        ? "bg-amber-50 border-amber-300 text-amber-800"
                                        : "bg-white border-slate-200 text-slate-900"
                                }`}
                              />
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-mono text-slate-500">{param.unit || "-"}</td>

                          <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                            {param.referenceRange
                              ? (param.referenceRange.low !== undefined && param.referenceRange.high !== undefined
                                  ? `${param.referenceRange.low} - ${param.referenceRange.high}`
                                  : param.referenceRange.text || "Normal")
                              : "Normal"}
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            {isCritical ? (
                              <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] uppercase shadow-2xs">
                                CRITICAL
                              </span>
                            ) : isHigh ? (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[10px] uppercase">
                                HIGH (H)
                              </span>
                            ) : isLow ? (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[10px] uppercase">
                                LOW (L)
                              </span>
                            ) : curr.value ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                                Normal
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Single General Observation Entry if no granular parameters */
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Diagnostic Finding / Result Summary</label>
              <textarea
                rows={3}
                value={clinicalComments}
                disabled={!isOrderPaid}
                onChange={(e) => setClinicalComments(e.target.value)}
                placeholder={!isOrderPaid ? "Payment required at billing counter before recording observations..." : "Enter clinical examination remarks or microscopic findings..."}
                className={`w-full p-3 text-xs border rounded-xl focus:outline-none ${
                  !isOrderPaid ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "border-slate-200"
                }`}
              />
            </div>
          )}

          {/* Culture & Susceptibility Table if Microbiology / Culture */}
          {(selectedTest.name.toLowerCase().includes("culture") ||
            testDefinition?.category?.toLowerCase().includes("microbiology")) && (
            <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Microscope className="w-4 h-4 text-teal-700" />
                  <span className="text-xs font-bold text-teal-900 uppercase tracking-wider">
                    Antibiotic Susceptibility Matrix (AST / MIC)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddCultureRow}
                  className="px-2.5 py-1 bg-teal-600 text-white rounded-lg text-xs font-bold hover:bg-teal-700 transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Antibiotic</span>
                </button>
              </div>

              {cultureRows.length > 0 ? (
                <div className="border border-teal-200 rounded-lg overflow-hidden bg-white text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-teal-100/70 text-[10px] font-bold text-teal-900 uppercase">
                      <tr>
                        <th className="py-2 px-3">Antimicrobial Agent</th>
                        <th className="py-2 px-3">Zone of Inhibition</th>
                        <th className="py-2 px-3">MIC Value</th>
                        <th className="py-2 px-3">Susceptibility</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-teal-100">
                      {cultureRows.map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.antibiotic}
                              onChange={(e) => {
                                const val = e.target.value
                                setCultureRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, antibiotic: val } : r))
                                )
                              }}
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.zone}
                              onChange={(e) => {
                                const val = e.target.value
                                setCultureRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, zone: val } : r))
                                )
                              }}
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.mic}
                              onChange={(e) => {
                                const val = e.target.value
                                setCultureRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, mic: val } : r))
                                )
                              }}
                              className="w-full p-1 border rounded text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={row.susceptibility}
                              onChange={(e: any) => {
                                const val = e.target.value
                                setCultureRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, susceptibility: val } : r))
                                )
                              }}
                              className="p-1 border rounded text-xs font-bold"
                            >
                              <option value="Sensitive">Sensitive</option>
                              <option value="Intermediate">Intermediate</option>
                              <option value="Resistant">Resistant</option>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveCultureRow(idx)}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-teal-700">
                  No organisms or antibiotics added yet. Click &apos;Add Antibiotic&apos; to populate susceptibility panel.
                </div>
              )}
            </div>
          )}

          {/* Clinical Comments & Technician Signature */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Technician Clinical Remarks / Notes
              </label>
              <textarea
                rows={2}
                value={clinicalComments}
                onChange={(e) => setClinicalComments(e.target.value)}
                placeholder="Document any relevant bench observations or sample remarks..."
                className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Performing Technician</label>
              <input
                type="text"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                className="w-full p-2 text-xs border border-slate-200 rounded-xl bg-slate-50 font-medium"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div>
              {!isOrderPaid && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Blocked: Patient bill must be paid at billing desk before entering lab results.</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!isOrderPaid}
                onClick={() => handleSaveResult("Result Entered")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  !isOrderPaid
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                }`}
              >
                Save as Draft / In-Progress
              </button>
              <button
                type="button"
                disabled={!isOrderPaid}
                onClick={() => handleSaveResult("Completed")}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-2xs flex items-center gap-1.5 ${
                  !isOrderPaid
                    ? "bg-purple-300 text-white cursor-not-allowed opacity-60"
                    : "bg-[#7552B8] hover:bg-[#6240a3] text-white cursor-pointer"
                }`}
              >
                <Save className="w-4 h-4" />
                <span>Submit for Pathologist Review</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 text-xs bg-white border border-[#E2E8F0] rounded-xl">
          Please select an order and test from the dropdown above to enter observations.
        </div>
      )}
    </div>
  )
}

