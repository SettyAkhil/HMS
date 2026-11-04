import React, { useState } from "react"
import { findTestDefinition, evaluateFlag } from "./labCatalogueSchema"
import { LabOrder, LabParameterResult } from "../../services/labOrdersDb"
import { AuditDatabase } from "../../services/auditDb"

interface ImportAllResultsModalProps {
  order: LabOrder
  onClose: () => void
  onSaveAll: (
    updatedTestsData: Array<{
      testId: string
      status: "Completed" | "Result Entered"
      results: Record<string, LabParameterResult>
      clinicalComments?: string
      technician?: string
      verifier?: string
    }>
  ) => void
}

export default function ImportAllResultsModal({
  order,
  onClose,
  onSaveAll,
}: ImportAllResultsModalProps) {
  const [activeTab, setActiveTab] = useState<number>(0)
  const [technician, setTechnician] = useState<string>("Lab Technician")
  const [verifier, setVerifier] = useState<string>("")

  // Initialize test data map for all ordered tests
  const [testsData, setTestsData] = useState<
    Array<{
      testId: string
      testName: string
      category: string
      results: Record<string, LabParameterResult>
      clinicalComments: string
    }>
  >(() => {
    return order.tests.map((test) => {
      const def = findTestDefinition(test.name)
      const results: Record<string, LabParameterResult> = {}

      if (def && def.parameters.length > 0) {
        def.parameters.forEach((param) => {
          const existing = test.results?.[param.name]
          const val = existing ? existing.value : ""
          const flag = existing
            ? existing.flag
            : ""

          results[param.name] = {
            value: val,
            unit: param.unit || "",
            referenceRange: param.referenceRange?.text || "",
            flag: flag as LabParameterResult["flag"],
          }
        })
      } else if (test.results && Object.keys(test.results).length > 0) {
        Object.assign(results, test.results)
      } else {
        results[test.name] = {
          value: test.result || "",
          unit: test.resultUnit || "",
          referenceRange: test.referenceRange || "",
          flag: test.flag || "",
        }
      }

      return {
        testId: test.id,
        testName: test.name,
        category: def?.category || test.category,
        results,
        clinicalComments: test.clinicalComments || "",
      }
    })
  })

  const currentTest = testsData[activeTab] || testsData[0]
  const currentDef = currentTest ? findTestDefinition(currentTest.testName) : undefined

  const handleParamChange = (paramName: string, value: string) => {
    setTestsData((prev) => {
      const next = [...prev]
      const t = { ...next[activeTab] }
      const paramDef = currentDef?.parameters.find((p) => p.name === paramName)
      let flag: LabParameterResult["flag"] = ""
      if (paramDef?.inputType === "numeric") {
        flag = evaluateFlag(value, paramDef.referenceRange)
      }

      t.results = {
        ...t.results,
        [paramName]: {
          ...t.results[paramName],
          value,
          flag,
        },
      }
      next[activeTab] = t
      return next
    })
  }

  const handleSaveAll = () => {
    if (order.billing.status !== "Paid") return
    const payload = testsData.map((t) => ({
      testId: t.testId,
      status: "Completed" as const,
      results: t.results,
      clinicalComments: t.clinicalComments,
      technician,
      verifier: verifier || technician,
    }))

    onSaveAll(payload)

    AuditDatabase.logEvent(
      "Import All Test Results",
      "Laboratory",
      `${technician} saved results for all ${order.tests.length} investigations for patient ${order.patientName} (${order.umr}) - Lab Order ${order.id}.`,
      "Success"
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-none shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="bg-linear-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-none bg-emerald-500/40 uppercase tracking-wider">
                Batch Import Tool
              </span>
              <span className="text-xs text-emerald-100">
                • {order.tests.length} Doctor-Ordered Investigation(s)
              </span>
            </div>
            <h2 className="text-xl font-bold mt-1 text-white tracking-tight">
              Import All Test Results
            </h2>
            <div className="flex items-center gap-4 text-xs text-emerald-100 mt-1">
              <span>Patient: <strong className="text-white">{order.patientName}</strong> ({order.umr})</span>
              <span>Visit: <strong className="text-white">{order.opNumber || order.encounterId}</strong></span>
              <span>Ordering Doctor: <strong className="text-white">{order.doctorName}</strong></span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-none transition-colors font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Warning Banner if Billing is Pending */}
        {order.billing.status !== "Paid" && (
          <div className="bg-amber-100 border-b border-amber-300 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900 font-medium">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>
                <strong>Billing Settlement Pending:</strong> Patient investigations have not been settled at Billing Desk. Result saving is restricted.
              </span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-none bg-amber-200 text-amber-900 uppercase">
              Restricted
            </span>
          </div>
        )}

        {/* Test Selector Tabs */}
        <div className="bg-emerald-50/70 border-b border-emerald-200 px-6 py-2.5 flex items-center gap-2 overflow-x-auto">
          {testsData.map((t, idx) => {
            const isSelected = activeTab === idx
            return (
              <button
                key={t.testId}
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-white text-gray-700 hover:bg-emerald-100/60 border border-emerald-200"
                }`}
              >
                <span>{idx + 1}.</span>
                <span>{t.testName}</span>
                <span className="text-[10px] opacity-75 font-normal">
                  ({Object.keys(t.results).length} params)
                </span>
              </button>
            )
          })}
        </div>

        {/* Current Test Parameters Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <span className="text-xs font-semibold text-emerald-700 uppercase">
                {currentDef?.category || currentTest?.category} • {currentDef?.subModule || "Standard Module"}
              </span>
              <h3 className="text-base font-bold text-gray-900">
                {currentTest?.testName}
              </h3>
            </div>
            <div className="text-xs text-gray-500">
              Sample: <strong className="text-gray-700">{currentDef?.sampleType || "Blood / Urine / Fluid"}</strong>
            </div>
          </div>

          {/* Parameters grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentDef && currentDef.parameters.length > 0 ? (
              currentDef.parameters.map((param) => {
                const cur = currentTest.results[param.name] || {
                  value: "",
                  unit: param.unit || "",
                  referenceRange: param.referenceRange?.text || "",
                  flag: "",
                }

                return (
                  <div
                    key={param.id}
                    className="p-2.5 rounded-none border border-gray-200 bg-gray-50 hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-800">
                        {param.name}
                      </label>
                      {cur.flag === "H" && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-none bg-amber-100 text-amber-800">
                          High
                        </span>
                      )}
                      {cur.flag === "L" && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-none bg-blue-100 text-blue-800">
                          Low
                        </span>
                      )}
                      {cur.flag === "Critical" && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-none bg-red-600 text-white animate-pulse">
                          Critical
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {param.inputType === "select" ? (
                        <select
                          value={cur.value}
                          onChange={(e) => handleParamChange(param.name, e.target.value)}
                          className="flex-1 text-xs px-2.5 py-1.5 border border-gray-300 rounded-none bg-white font-medium"
                        >
                          <option value="">Select...</option>
                          {param.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={param.inputType === "numeric" ? "number" : "text"}
                          step="any"
                          value={cur.value}
                          onChange={(e) => handleParamChange(param.name, e.target.value)}
                          className="flex-1 text-xs font-semibold px-2.5 py-1.5 border border-gray-300 rounded-none bg-white"
                          placeholder="Enter value"
                        />
                      )}
                      {param.unit && (
                        <span className="text-xs text-gray-500 font-medium whitespace-nowrap min-w-10">
                          {param.unit}
                        </span>
                      )}
                    </div>
                    {param.referenceRange?.text && (
                      <span className="text-[10.5px] text-gray-400 block mt-1">
                        Ref: {param.referenceRange.text}
                      </span>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="col-span-2 p-4 bg-gray-50 rounded-none border border-gray-200">
                <input
                  type="text"
                  value={currentTest.results[currentTest.testName]?.value || ""}
                  onChange={(e) => handleParamChange(currentTest.testName, e.target.value)}
                  className="w-full text-xs p-2 border border-gray-300 rounded-none bg-white"
                />
              </div>
            )}
          </div>

          {/* Test Comment */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              Comments for {currentTest.testName}
            </label>
            <input
              type="text"
              value={currentTest.clinicalComments}
              onChange={(e) => {
                const next = [...testsData]
                next[activeTab].clinicalComments = e.target.value
                setTestsData(next)
              }}
              className="w-full text-xs p-2 border border-gray-300 rounded-none bg-white"
            />
          </div>

          {/* Technician & Verifier Info */}
          <div className="grid grid-cols-2 gap-4 bg-emerald-50/40 p-3 rounded-none border border-emerald-200">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Technologist
              </label>
              <input
                type="text"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-none bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Sign-off Pathologist / Consultant
              </label>
              <input
                type="text"
                value={verifier}
                onChange={(e) => setVerifier(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-none bg-white"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-none hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={order.billing.status !== "Paid"}
              onClick={handleSaveAll}
              title={
                order.billing.status !== "Paid"
                  ? "Action restricted: Billing payment is pending at reception desk"
                  : "Save all test results"
              }
              className={`px-6 py-2 text-xs font-bold rounded-none transition-colors shadow-sm flex items-center gap-1.5 ${
                order.billing.status === "Paid"
                  ? "text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                  : "text-gray-400 bg-gray-300 border border-gray-300 cursor-not-allowed opacity-75"
              }`}
            >
              <span>💾</span> Save All Results ({testsData.length} Tests)
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
