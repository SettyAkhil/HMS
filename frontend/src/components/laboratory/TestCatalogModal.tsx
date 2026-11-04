import React, { useState, useMemo } from "react"
import {
  ALL_LAB_TESTS,
  LabTestDefinition,
  LabParameterDefinition,
} from "./labCatalogueSchema"

interface TestCatalogModalProps {
  onClose?: () => void
  isInline?: boolean
}

export default function TestCatalogModal({
  onClose,
  isInline = false,
}: TestCatalogModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedTest, setSelectedTest] = useState<LabTestDefinition | null>(null)

  // Dynamically derive unique categories from the existing test data
  const categories = useMemo(() => {
    const cats = Array.from(new Set(ALL_LAB_TESTS.map((t) => t.category)))
    return cats.sort()
  }, [])

  // Dynamically calculate counts per category from the existing test data
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    ALL_LAB_TESTS.forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + 1
    })
    return counts
  }, [])

  // Filter tests by search query (name or code or subModule) and selected category
  const filteredTests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return ALL_LAB_TESTS.filter((t) => {
      // Category filter
      if (selectedCategory !== "all" && t.category !== selectedCategory) {
        return false
      }

      // Search filter
      if (query) {
        const matchesName = t.name.toLowerCase().includes(query)
        const matchesCode = t.code.toLowerCase().includes(query)
        const matchesSubModule = t.subModule.toLowerCase().includes(query)
        const matchesSample = t.sampleType?.toLowerCase().includes(query) || false
        if (!matchesName && !matchesCode && !matchesSubModule && !matchesSample) {
          return false
        }
      }

      return true
    })
  }, [searchQuery, selectedCategory])

  const renderCatalogContent = () => (
    <>
      {/* Sub-header description */}
      <div className="bg-slate-50 border-b border-gray-200 px-6 py-2.5 flex flex-wrap items-center justify-between text-xs text-gray-600 gap-2 shrink-0">
          <p className="text-gray-600">
            Explore all tests available in the laboratory. Click on any investigation to view clinical parameters, specimen requirements, and reference standards.
          </p>
          <span className="text-gray-400 text-[11px] font-mono">
            NABL Accredited Diagnostic Catalogue • Standard Rate Card
          </span>
        </div>

        {/* Search and Category Filters Bar */}
        <div className="p-4 border-b border-gray-200 bg-white space-y-3">
          
          {/* Search Field */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[280px] max-w-lg relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tests by name or code..."
                className="w-full text-xs pl-8 pr-8 py-2 rounded-none border border-gray-300 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
              <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>Showing:</span>
              <strong className="text-gray-900 font-bold">{filteredTests.length}</strong>
              <span>of</span>
              <span className="font-semibold text-gray-700">{ALL_LAB_TESTS.length} tests</span>
            </div>
          </div>

          {/* Categories Filter Tabs (Dynamically derived from existing test data) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === "all"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
              }`}
            >
              <span>All Tests</span>
              <span className={`text-[10.5px] px-1.5 py-0.2 rounded-none font-mono ${
                selectedCategory === "all" ? "bg-blue-700 text-white" : "bg-gray-200 text-gray-700"
              }`}>
                {ALL_LAB_TESTS.length}
              </span>
            </button>

            {categories.map((cat) => {
              const count = categoryCounts[cat] || 0
              const isSelected = selectedCategory === cat
              return (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                  }`}
                >
                  <span>{cat}</span>
                  <span className={`text-[10.5px] px-1.5 py-0.2 rounded-none font-mono ${
                    isSelected ? "bg-blue-700 text-white" : "bg-gray-200 text-gray-700"
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tests Table */}
        <div className="flex-1 overflow-y-auto">
          {filteredTests.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <div className="w-12 h-12 rounded-none bg-gray-100 flex items-center justify-center text-2xl mb-2">
                🧪
              </div>
              <p className="text-sm font-semibold text-gray-600">No laboratory tests found</p>
              <p className="text-xs text-gray-400 mt-1">
                No investigations match &ldquo;{searchQuery}&rdquo; in the selected category.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setSelectedCategory("all")
                }}
                className="mt-3 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-none cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-100 text-gray-700 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-200 sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="py-2.5 px-4">Test Name & Code</th>
                  <th className="py-2.5 px-4">Category / Sub-Module</th>
                  <th className="py-2.5 px-4">Specimen / Sample</th>
                  <th className="py-2.5 px-4">Turnaround Time</th>
                  <th className="py-2.5 px-4">Parameters</th>
                  <th className="py-2.5 px-4">Price</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredTests.map((test) => {
                  const paramCount = test.parameters?.length || 0
                  return (
                    <tr
                      key={test.id}
                      onClick={() => setSelectedTest(test)}
                      className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                    >
                      {/* Test Name & Code */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-none bg-gray-100 border border-gray-300 font-bold text-gray-700 group-hover:bg-blue-100 group-hover:border-blue-300 group-hover:text-blue-900 transition-colors">
                            {test.code}
                          </span>
                          <div>
                            <strong className="text-gray-900 group-hover:text-blue-700 transition-colors text-xs block">
                              {test.name}
                            </strong>
                            {test.description && (
                              <span className="text-[11px] text-gray-400 block truncate max-w-xs">
                                {test.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category & Sub-Module */}
                      <td className="py-3 px-4">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-none text-[10.5px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                            {test.category}
                          </span>
                          {test.subModule && (
                            <span className="block text-[11px] text-gray-500 mt-0.5">
                              {test.subModule}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Specimen / Sample Type */}
                      <td className="py-3 px-4">
                        {test.sampleType ? (
                          <span className="text-gray-700 font-medium">
                            {test.sampleType}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">
                            Standard specimen
                          </span>
                        )}
                      </td>

                      {/* Turnaround Time (TAT) */}
                      <td className="py-3 px-4">
                        {test.turnaroundTime ? (
                          <span className="inline-flex items-center gap-1 text-gray-700 font-medium">
                            <span>⏱️</span> {test.turnaroundTime}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Same Day</span>
                        )}
                      </td>

                      {/* Parameters Count */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-none text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 font-mono">
                          {paramCount} {paramCount === 1 ? "param" : "params"}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-3 px-4">
                        <strong className="text-gray-900 font-mono font-bold text-xs">
                          ₹{test.price}
                        </strong>
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTest(test)
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white rounded-none transition-colors border border-blue-200 group-hover:border-blue-600 cursor-pointer"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Catalog Footer */}
        <div className="bg-gray-100 border-t border-gray-200 px-6 py-3 flex items-center justify-between text-xs shrink-0">
          <div className="text-gray-600 font-medium">
            Showing <strong className="text-gray-900 font-bold">{filteredTests.length}</strong> of <strong className="text-gray-900 font-bold">{ALL_LAB_TESTS.length}</strong> laboratory tests in standard catalog
          </div>
          {onClose && !isInline && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-800 bg-white border border-gray-300 rounded-none hover:bg-gray-50 hover:text-blue-700 hover:border-blue-300 cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
            >
              <span>←</span> Back to Laboratory
            </button>
          )}
        </div>
    </>
  )

  const renderDetailsModal = () => {
    if (!selectedTest) return null
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-none shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-none bg-blue-500/30 text-blue-300 uppercase tracking-wider font-mono">
                    {selectedTest.code}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-none bg-slate-800 text-slate-300 uppercase">
                    {selectedTest.category}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-none bg-emerald-500/20 text-emerald-300">
                    Active in Catalogue
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight mt-1">
                  {selectedTest.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTest(null)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-none transition-colors font-bold text-base cursor-pointer"
                title="Back to Catalog List"
              >
                ✕
              </button>
            </div>

            {/* Test Metadata Grid */}
            <div className="bg-slate-50 border-b border-gray-200 p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-gray-400 block text-[11px]">Test Code</span>
                <strong className="font-mono text-gray-900 text-xs font-bold">{selectedTest.code}</strong>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Laboratory Module</span>
                <strong className="text-gray-900">{selectedTest.category}</strong>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Sub-Module / Section</span>
                <strong className="text-gray-900">{selectedTest.subModule}</strong>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Standard Tariff</span>
                <strong className="text-emerald-700 font-mono text-sm font-bold">₹{selectedTest.price}</strong>
              </div>

              <div>
                <span className="text-gray-400 block text-[11px]">Specimen / Sample Type</span>
                <strong className="text-indigo-900">{selectedTest.sampleType || "Blood / Serum / Standard"}</strong>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Turnaround Time (TAT)</span>
                <strong className="text-gray-900">{selectedTest.turnaroundTime || "Same Day Routine"}</strong>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Report Parameters</span>
                <strong className="text-gray-900">{selectedTest.parameters.length} Clinical Parameters</strong>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Catalogue ID</span>
                <span className="font-mono text-gray-600 text-[11px]">{selectedTest.id}</span>
              </div>
            </div>

            {/* Test Description (if present in schema) */}
            {selectedTest.description && (
              <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 text-xs text-blue-900">
                <span className="font-bold">Clinical Note: </span>
                <span>{selectedTest.description}</span>
              </div>
            )}

            {/* Parameters Table */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                  Clinical Parameters & Reference Standards ({selectedTest.parameters.length})
                </h3>
                <span className="text-[11px] text-gray-500">
                  Standard Hospital Diagnostic Catalogue
                </span>
              </div>

              {selectedTest.parameters.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-xs">
                  This investigation is reported as a single global clinical observation.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-none overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-100 text-gray-700 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="py-2 px-3 w-8">#</th>
                        <th className="py-2 px-3">Parameter Name</th>
                        <th className="py-2 px-3">Input Type</th>
                        <th className="py-2 px-3">Unit</th>
                        <th className="py-2 px-3">Reference Range / Standards</th>
                        <th className="py-2 px-3">Critical Limits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedTest.parameters.map((param: LabParameterDefinition, idx: number) => (
                        <tr key={param.id || idx} className="hover:bg-gray-50/70">
                          <td className="py-2 px-3 text-gray-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <strong className="text-gray-900 block font-medium">
                              {param.name}
                            </strong>
                            {param.options && (
                              <span className="text-[10px] text-gray-400 block mt-0.5">
                                Options: {param.options.join(", ")}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded-none text-[10px] font-mono bg-gray-100 text-gray-700 border border-gray-200">
                              {param.inputType}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-gray-700 text-[11px]">
                            {param.unit || "—"}
                          </td>
                          <td className="py-2 px-3 text-gray-800">
                            {param.referenceRange?.text ? (
                              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200 text-[11px]">
                                {param.referenceRange.text}
                              </span>
                            ) : param.referenceRange?.low !== undefined && param.referenceRange?.high !== undefined ? (
                              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-none border border-emerald-200 text-[11px]">
                                {param.referenceRange.low} – {param.referenceRange.high} {param.unit || ""}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {param.referenceRange?.criticalLow !== undefined || param.referenceRange?.criticalHigh !== undefined ? (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 rounded-none">
                                {param.referenceRange.criticalLow !== undefined ? `< ${param.referenceRange.criticalLow}` : ""}
                                {param.referenceRange.criticalLow !== undefined && param.referenceRange.criticalHigh !== undefined ? " or " : ""}
                                {param.referenceRange.criticalHigh !== undefined ? `> ${param.referenceRange.criticalHigh}` : ""}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-100 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
              <span className="text-[11px] text-gray-500 font-medium">
                🔒 Read-Only Reference Standard • Hospital Laboratory Catalogue
              </span>
              <button
                type="button"
                onClick={() => setSelectedTest(null)}
                className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-none hover:bg-gray-50 cursor-pointer shadow-xs"
              >
                Back to Catalog List
              </button>
            </div>

          </div>
        </div>
    )
  }

  if (isInline) {
    return (
      <div className="flex-1 flex flex-col bg-white overflow-hidden w-full h-full font-sans">
        {renderCatalogContent()}
        {renderDetailsModal()}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden">
      <div className="bg-white rounded-none shadow-2xl border border-gray-300 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        {/* Fullscreen Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">📖</span>
            <div>
              <div className="text-[10px] font-mono tracking-wider uppercase text-blue-400 font-semibold">
                Central Pathology & Clinical Diagnostics
              </div>
              <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Laboratory Test Catalog & Master Directory
                <span className="text-xs font-normal text-slate-400">
                  ({ALL_LAB_TESTS.length} Standard Tests)
                </span>
              </h2>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-none border border-slate-700 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Catalog"
            >
              ✕
            </button>
          )}
        </div>

        {renderCatalogContent()}
      </div>

      {renderDetailsModal()}
    </div>
  )
}
