import React, { useState, useEffect } from "react"
import {
  LabTestDefinition,
  findTestDefinition,
  evaluateFlag,
} from "./labCatalogueSchema"
import { LabOrder, LabOrderTest, LabParameterResult } from "../../services/labOrdersDb"
import { AuditDatabase } from "../../services/auditDb"

interface TestResultModalProps {
  order: LabOrder
  test: LabOrderTest
  onClose: () => void
  onSave: (
    testId: string,
    status: "Result Entered" | "Completed" | "Verified",
    results: Record<string, LabParameterResult>,
    clinicalComments?: string,
    technician?: string,
    verifier?: string,
    tableData?: any[]
  ) => void
}

export default function TestResultModal({
  order,
  test,
  onClose,
  onSave,
}: TestResultModalProps) {
  const testDef: LabTestDefinition | undefined = findTestDefinition(test.name)
  
  // State for parameters
  const [paramResults, setParamResults] = useState<Record<string, LabParameterResult>>({})
  const [clinicalComments, setClinicalComments] = useState<string>("")
  const [technician, setTechnician] = useState<string>("Lab Technician")
  const [verifier, setVerifier] = useState<string>("")
  
  // Table state for Culture & Sensitivity tests
  const [cultureRows, setCultureRows] = useState<Array<{
    antibiotic: string
    zone: string
    mic: string
    susceptibility: "Sensitive" | "Intermediate" | "Resistant"
  }>>([])

  // Initialize values strictly from existing saved test results (plain blank form by default)
  useEffect(() => {
    const initial: Record<string, LabParameterResult> = {}
    
    if (testDef && testDef.parameters.length > 0) {
      testDef.parameters.forEach((param) => {
        const existing = test.results?.[param.name]
        const val = existing ? existing.value : ""
        const flag = existing ? existing.flag : ""

        initial[param.name] = {
          value: val,
          unit: param.unit || "",
          referenceRange: param.referenceRange?.text || "",
          flag: flag as LabParameterResult["flag"],
        }
      })
    } else if (test.results && Object.keys(test.results).length > 0) {
      Object.assign(initial, test.results)
    } else {
      // Fallback single parameter
      initial[test.name] = {
        value: test.result || "",
        unit: test.resultUnit || "",
        referenceRange: test.referenceRange || "",
        flag: test.flag || "",
      }
    }

    setParamResults(initial)
    setClinicalComments(test.clinicalComments || "")
    if (test.technician) setTechnician(test.technician)
    if (test.verifier) setVerifier(test.verifier)
    if (test.tableData && test.tableData.length > 0) {
      setCultureRows(test.tableData)
    }
  }, [test, testDef])

  const handleValueChange = (
    paramName: string,
    newValue: string,
    refRange?: LabTestDefinition["parameters"][0]["referenceRange"],
    inputType?: string
  ) => {
    let flag: LabParameterResult["flag"] = ""
    if (inputType === "numeric") {
      flag = evaluateFlag(newValue, refRange)
    }

    setParamResults((prev) => ({
      ...prev,
      [paramName]: {
        ...prev[paramName],
        value: newValue,
        flag,
      },
    }))
  }

  const isPaid = order.billing?.status === "Paid"

  const handleSave = () => {
    if (!isPaid) {
      alert("Cannot enter or save results: Patient bill has not been paid at the central billing desk.")
      return
    }
    const status = "Completed"
    onSave(
      test.id,
      status,
      paramResults,
      clinicalComments,
      technician,
      verifier || technician,
      testDef?.subModule.includes("Culture") ? cultureRows : undefined
    )

    AuditDatabase.logEvent(
      "Lab Result Saved",
      "Laboratory",
      `${technician} saved results for ${test.name} for patient ${order.patientName} (${order.umr}) - Lab Order ${order.id}.`,
      "Success"
    )
  }

  const isCultureTest = testDef?.subModule?.includes("Culture") || test.name.includes("C/S")

  return (
    <div className="flex-1 bg-white rounded-none shadow-xs border border-gray-200 flex flex-col overflow-hidden animate-in fade-in duration-150">
      
      {/* Top Header / Navigation Bar */}
      <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-none border border-slate-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>←</span> Back to Patient Investigations
          </button>
          <div className="h-6 w-px bg-slate-700 mx-1 hidden sm:block" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-none bg-blue-500/30 text-blue-300 uppercase tracking-wider">
                {testDef?.category || test.category}
              </span>
              {testDef?.subModule && (
                <span className="text-xs text-slate-400">
                  • {testDef.subModule}
                </span>
              )}
              {test.urgency === "STAT" && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-none bg-red-600 text-white animate-pulse">
                  STAT PRIORITY
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
              {testDef?.name || test.name}
            </h2>
          </div>
        </div>

        {/* Quick Actions (Top Right) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-none border border-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-none transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span>💾</span> Save Results
          </button>
        </div>
      </div>

      {/* Patient & Specimen Info Strip */}
      <div className="bg-slate-50 border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between text-xs text-gray-700 gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <div>
            <span className="text-gray-400">Patient:</span>{" "}
            <strong className="text-gray-900 font-bold">{order.patientName}</strong>{" "}
            <span className="text-gray-500 font-medium">({order.age}y/{order.sex})</span>
          </div>
          <div className="hidden sm:inline text-gray-300">•</div>
          <div>
            <span className="text-gray-400">Patient ID:</span>{" "}
            <strong className="font-mono text-gray-800 font-semibold">{order.umr}</strong>
          </div>
          <div className="hidden sm:inline text-gray-300">•</div>
          <div>
            <span className="text-gray-400">Visit / OP:</span>{" "}
            <strong className="font-mono text-gray-800">{order.opNumber || order.encounterId || "—"}</strong>
          </div>
          <div className="hidden sm:inline text-gray-300">•</div>
          <div>
            <span className="text-gray-400">Lab Order ID:</span>{" "}
            <strong className="font-mono text-gray-800">{order.id}</strong>
          </div>
          <div className="hidden sm:inline text-gray-300">•</div>
          <div>
            <span className="text-gray-400">Specimen:</span>{" "}
            <strong className="text-indigo-900 font-semibold">{testDef?.sampleType || "Blood / Serum / Body Fluid"}</strong>
          </div>
          <div className="hidden sm:inline text-gray-300">•</div>
          <div>
            <span className="text-gray-400">Ordering Doctor:</span>{" "}
            <strong className="text-gray-900 font-medium">{order.doctorName}</strong> ({order.department})
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Billing:</span>
          <span
            className={`px-2.5 py-0.5 rounded-none font-bold text-[11px] ${
              order.billing.status === "Paid"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : "bg-amber-100 text-amber-800 border border-amber-300"
            }`}
          >
            ● {order.billing.status}
          </span>
        </div>
      </div>

      {!isPaid && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠ Result Entry Locked:</span>
            <span>
              This order has an unpaid bill of ₹{order.billing?.total || 0}. Billing must be settled at the central Billing Section before laboratory results can be recorded or saved.
            </span>
          </div>
          <span className="font-bold px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 text-[11px]">
            Billing Pending
          </span>
        </div>
      )}

        {/* Modal Body - Parameter Form Fields */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                Investigation Parameters & Results
              </h3>
              <span className="text-xs text-gray-500">
                Reference standards from Hospital Diagnostic Laboratory Catalogue
              </span>
            </div>

            {testDef && testDef.parameters.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {testDef.parameters.map((param) => {
                  const current = paramResults[param.name] || {
                    value: "",
                    unit: param.unit || "",
                    referenceRange: param.referenceRange?.text || "",
                    flag: "",
                  }

                  return (
                    <div
                      key={param.id}
                      className="p-3.5 rounded-none bg-gray-50/80 hover:bg-white border border-gray-200 hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-2.5"
                    >
                      {/* Header: Parameter Name, Reference Range & Flag */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <label className="text-xs font-bold text-gray-900 block truncate" title={param.name}>
                            {param.name}
                          </label>
                          {param.referenceRange?.text ? (
                            <span className="text-[11px] text-gray-500 block truncate">
                              Ref: {param.referenceRange.text}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-400 block">—</span>
                          )}
                        </div>

                        {/* Flag / Reference Indicator */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {current.flag === "H" && (
                            <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-none">
                              ▲ High
                            </span>
                          )}
                          {current.flag === "L" && (
                            <span className="px-2 py-0.5 text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300 rounded-none">
                              ▼ Low
                            </span>
                          )}
                          {current.flag === "Critical" && (
                            <span className="px-2 py-0.5 text-[11px] font-bold bg-red-600 text-white rounded-none animate-pulse">
                              CRITICAL
                            </span>
                          )}
                          {!current.flag && current.value && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-none">
                              ✓ Normal
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Input Field Based on Type */}
                      <div className="pt-1">
                        {param.inputType === "numeric" && (
                          <div className="relative">
                            <input
                              type="number"
                              step="any"
                              value={current.value}
                              onChange={(e) =>
                                handleValueChange(
                                  param.name,
                                  e.target.value,
                                  param.referenceRange,
                                  "numeric"
                                )
                              }
                              placeholder="Enter value"
                              className="w-full text-xs font-semibold px-3 py-2 rounded-none border border-gray-300 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                            />
                            {param.unit && (
                              <span className="absolute right-3 top-2 text-xs text-gray-400 font-medium pointer-events-none">
                                {param.unit}
                              </span>
                            )}
                          </div>
                        )}

                        {param.inputType === "select" && (
                          <select
                            value={current.value}
                            onChange={(e) =>
                              handleValueChange(param.name, e.target.value)
                            }
                            className="w-full text-xs font-medium px-3 py-2 rounded-none border border-gray-300 focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="">Select option</option>
                            {param.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {(param.inputType === "positive_negative" ||
                          param.inputType === "reactive_nonreactive" ||
                          param.inputType === "detected_not_detected" ||
                          param.inputType === "present_absent") && (
                          <div className="flex items-center gap-2">
                            {(param.options || [
                              param.inputType === "positive_negative" ? "Negative" :
                              param.inputType === "reactive_nonreactive" ? "Non-reactive" :
                              param.inputType === "detected_not_detected" ? "Not Detected" : "Absent",
                              param.inputType === "positive_negative" ? "Positive" :
                              param.inputType === "reactive_nonreactive" ? "Reactive" :
                              param.inputType === "detected_not_detected" ? "Detected" : "Present"
                            ]).map((opt) => {
                              const isChecked = current.value === opt
                              const isAbnormal =
                                opt === "Positive" ||
                                opt === "Reactive" ||
                                opt === "Detected" ||
                                opt === "Present"
                              return (
                                <button
                                  type="button"
                                  key={opt}
                                  onClick={() => handleValueChange(param.name, opt)}
                                  className={`flex-1 py-1.5 text-xs font-semibold rounded-none border transition-all text-center cursor-pointer ${
                                    isChecked
                                      ? isAbnormal
                                        ? "bg-red-600 text-white border-red-600 shadow-xs"
                                        : "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                                  }`}
                                >
                                  {opt}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {(param.inputType === "text" ||
                          param.inputType === "grade" ||
                          param.inputType === "time" ||
                          param.inputType === "table") && (
                          <input
                            type="text"
                            value={current.value}
                            onChange={(e) =>
                              handleValueChange(param.name, e.target.value)
                            }
                            placeholder={param.placeholder || "Enter description / observation"}
                            className="w-full text-xs px-3 py-2 rounded-none border border-gray-300 focus:ring-1 focus:ring-blue-500 bg-white"
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              // Generic fallback if not explicitly found in catalogue
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-none bg-gray-50/80 border border-gray-200 flex flex-col justify-between space-y-2">
                  <label className="text-xs font-bold text-gray-900 block">
                    Observed Result Value
                  </label>
                  <input
                    type="text"
                    value={paramResults[test.name]?.value || ""}
                    onChange={(e) =>
                      setParamResults({
                        [test.name]: {
                          value: e.target.value,
                          unit: test.resultUnit || "",
                          referenceRange: test.referenceRange || "",
                          flag: "",
                        },
                      })
                    }
                    className="w-full text-xs px-3 py-2 rounded-none border border-gray-300 bg-white focus:ring-1 focus:ring-blue-500 font-semibold"
                    placeholder="Enter test result"
                  />
                </div>
                <div className="p-3.5 rounded-none bg-gray-50/80 border border-gray-200 flex flex-col justify-between space-y-2">
                  <label className="text-xs font-bold text-gray-900 block">
                    Unit & Reference Range
                  </label>
                  <div className="text-xs text-gray-600 py-2">
                    {test.resultUnit ? `Unit: ${test.resultUnit}` : "Standard Unit"} {test.referenceRange ? `• Ref: ${test.referenceRange}` : ""}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Microbiology Culture & Sensitivity Table if Applicable */}
          {isCultureTest && (
            <div className="border border-indigo-200 rounded-none p-3 bg-indigo-50/40">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-indigo-950 uppercase">
                  Antibiotic Susceptibility Testing (AST) Panel
                </h4>
                <span className="text-[11px] text-indigo-700">
                  CLSI Kirby-Bauer Disk Diffusion Method
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-indigo-100/70 text-indigo-900 text-[11px] font-bold">
                    <tr>
                      <th className="p-2">Antimicrobial Agent</th>
                      <th className="p-2">Zone Diameter</th>
                      <th className="p-2">MIC</th>
                      <th className="p-2">Susceptibility</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-100 bg-white">
                    {cultureRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium text-gray-900">{row.antibiotic}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.zone}
                            onChange={(e) => {
                              const next = [...cultureRows]
                              next[idx].zone = e.target.value
                              setCultureRows(next)
                            }}
                            className="px-2 py-0.5 border rounded-none w-20 text-xs bg-gray-50 border-gray-300"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.mic}
                            onChange={(e) => {
                              const next = [...cultureRows]
                              next[idx].mic = e.target.value
                              setCultureRows(next)
                            }}
                            className="px-2 py-0.5 border rounded-none w-24 text-xs bg-gray-50 border-gray-300"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={row.susceptibility}
                            onChange={(e) => {
                              const next = [...cultureRows]
                              next[idx].susceptibility = e.target.value as any
                              setCultureRows(next)
                            }}
                            className={`px-2 py-0.5 rounded-none text-xs font-bold border ${
                              row.susceptibility === "Sensitive"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : row.susceptibility === "Intermediate"
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : "bg-red-100 text-red-800 border-red-300"
                            }`}
                          >
                            <option value="Sensitive">Sensitive (S)</option>
                            <option value="Intermediate">Intermediate (I)</option>
                            <option value="Resistant">Resistant (R)</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Clinical Comments & Technologist / Verifier Sign-off */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Pathologist / Clinical Comments
              </label>
              <textarea
                rows={2}
                value={clinicalComments}
                onChange={(e) => setClinicalComments(e.target.value)}
                className="w-full text-xs p-2.5 rounded-none border border-gray-300 focus:ring-1 focus:ring-blue-500 bg-white resize-none"
                placeholder="Enter remarks, morphological observations, or clinical notes..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3 rounded-none border border-gray-200">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Medical Lab Technologist (MLT)
                </label>
                <input
                  type="text"
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded-none border border-gray-300 bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Verifying Pathologist / Doctor
                </label>
                <input
                  type="text"
                  value={verifier}
                  onChange={(e) => setVerifier(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded-none border border-gray-300 bg-white"
                />
              </div>
            </div>
          </div>
        </div>

      {/* Sticky Bottom Footer */}
      <div className="bg-gray-50 border-t border-gray-200 px-6 py-3.5 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-none hover:bg-gray-100 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <span>←</span> Back to Patient Investigations
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isPaid}
            className={`px-6 py-2 text-xs font-bold rounded-none transition-colors shadow-sm flex items-center gap-1.5 ${
              !isPaid
                ? "bg-gray-300 text-gray-500 cursor-not-allowed border border-gray-300"
                : "text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
            }`}
            title={!isPaid ? "Payment must be completed at Billing Section before saving results" : "Save Results"}
          >
            <span>💾</span> Save Results
          </button>
        </div>
      </div>

    </div>
  )
}
