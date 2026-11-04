import React, { useState, useEffect, useMemo, useRef } from "react"
import {
  Syringe,
  Barcode,
  Printer,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Search,
  Filter,
  X,
  Droplet,
  MapPin,
  RefreshCw,
  Microscope,
  ArrowRight,
} from "lucide-react"
import { LabLisService, SpecimenRecord, TubeColor } from "../../services/labLisService"
import { LabOrderDatabase } from "../../services/labOrdersDb"

interface SampleCollectionViewProps {
  onOpenWorkbench?: (orderId: string) => void
}

export default function SampleCollectionView({ onOpenWorkbench }: SampleCollectionViewProps = {}) {
  const [specimens, setSpecimens] = useState<SpecimenRecord[]>([])
  const [activeSubTab, setActiveSubTab] = useState<"pending" | "collected" | "all">("pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTubeFilter, setSelectedTubeFilter] = useState<string>("All")
  const [collectorName, setCollectorName] = useState("Kavita Pillai (Staff Phlebotomist)")
  const [collectionLocation, setCollectionLocation] = useState("Central Phlebotomy Lab")
  const [activeBarcodeSpecimen, setActiveBarcodeSpecimen] = useState<SpecimenRecord | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Filtered collection queue
  const queue = useMemo(() => {
    return specimens.filter((s) => {
      const matchSearch =
        !searchQuery ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.umr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.barcode.includes(searchQuery)

      const matchTube = selectedTubeFilter === "All" || s.tubeColor.includes(selectedTubeFilter)

      return matchSearch && matchTube
    })
  }, [specimens, searchQuery, selectedTubeFilter])

  // Sub-module 1: Pending draws (Newest patients at the TOP)
  const pendingCollection = useMemo(() => {
    return queue
      .filter((s) => s.status === "Collection Pending" || s.status === "Recollection Requested" || s.status === "Rejected")
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        if (dateA !== dateB) return dateB - dateA
        return b.id.localeCompare(a.id)
      })
  }, [queue])

  // Sub-module 2: Collected samples (Most recently collected at the top)
  const completedCollection = useMemo(() => {
    return queue
      .filter((s) => s.status === "Collected" || s.status === "Received & Accepted")
      .sort((a, b) => {
        const dateA = new Date(a.collectedAt || a.receivedAt || a.createdAt || 0).getTime()
        const dateB = new Date(b.collectedAt || b.receivedAt || b.createdAt || 0).getTime()
        if (dateA !== dateB) return dateB - dateA
        return b.id.localeCompare(a.id)
      })
  }, [queue])

  // Dynamic queue: if 'all', pending samples strictly at TOP, collected at BOTTOM
  const displayedQueue = useMemo(() => {
    if (activeSubTab === "pending") return pendingCollection
    if (activeSubTab === "collected") return completedCollection
    return [...pendingCollection, ...completedCollection]
  }, [activeSubTab, pendingCollection, completedCollection])

  const handleCollect = (spec: SpecimenRecord) => {
    LabLisService.collectSpecimen(spec.id, collectorName, collectionLocation)
    showToast(`Specimen ${spec.id} (${spec.tubeColor}) successfully collected!`)
  }

  const printLabel = (spec: SpecimenRecord) => {
    setActiveBarcodeSpecimen(spec)
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── TOP STATS & CONTROLS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Pending Draws</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{pendingCollection.length}</div>
          <div className="text-[10px] text-amber-600 font-semibold mt-0.5">Awaiting phlebotomy draw</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Drawn Today</span>
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{completedCollection.length}</div>
          <div className="text-[10px] text-teal-600 font-semibold mt-0.5">Specimens accession-ready</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase mb-1">Active Phlebotomist</div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#7552B8]" />
            <input
              type="text"
              value={collectorName}
              onChange={(e) => setCollectorName(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-full"
            />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase mb-1">Collection Station</div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#0D9488]" />
            <select
              value={collectionLocation}
              onChange={(e) => setCollectionLocation(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 w-full"
            >
              <option value="Central Phlebotomy Lab">Central Phlebotomy Lab</option>
              <option value="OPD Blood Draw Room 102">OPD Blood Draw Room 102</option>
              <option value="Ward Bedside Phlebotomy">Ward Bedside Phlebotomy</option>
              <option value="Emergency Phlebotomy Bay">Emergency Phlebotomy Bay</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR & QUEUE ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Syringe className="w-5 h-5 text-[#7552B8]" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Phlebotomy & Sample Collection Queue</h3>
              <p className="text-[11px] text-slate-500">Collect specimens, print tube barcodes, and record drawing times</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search patient, UMR, barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none w-56"
              />
            </div>

            <select
              value={selectedTubeFilter}
              onChange={(e) => setSelectedTubeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="All">All Tube Types</option>
              <option value="Lavender">Lavender (EDTA)</option>
              <option value="Yellow">Yellow (SST Gel)</option>
              <option value="Red">Red (Plain Serum)</option>
              <option value="Blue">Light Blue (Citrate)</option>
              <option value="Grey">Grey (Fluoride)</option>
              <option value="Sterile">Sterile Cup</option>
            </select>

            <button
              onClick={loadData}
              className="p-1.5 bg-white border border-[#E2E8F0] hover:bg-slate-100 rounded-xl text-slate-600 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── SUB-MODULE QUEUE TABS ────────────────────────────────────────── */}
        <div className="flex border-b border-[#E2E8F0] bg-slate-50/70 p-2 gap-2 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab("pending")}
            className={`px-3.5 py-1.5 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === "pending"
                ? "bg-[#7552B8] text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Awaiting Blood Draw</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeSubTab === "pending" ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-800"
              }`}
            >
              {pendingCollection.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("collected")}
            className={`px-3.5 py-1.5 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === "collected"
                ? "bg-[#7552B8] text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Collected Samples (Dispatched)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeSubTab === "collected" ? "bg-emerald-400 text-slate-900" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {completedCollection.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("all")}
            className={`px-3.5 py-1.5 font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeSubTab === "all"
                ? "bg-[#7552B8] text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>All Phlebotomy History</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeSubTab === "all" ? "bg-purple-300 text-slate-900" : "bg-slate-200 text-slate-700"
              }`}
            >
              {queue.length}
            </span>
          </button>
        </div>

        {/* Specimen Queue Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Specimen ID & Barcode</th>
                <th className="py-3 px-4">Patient Details</th>
                <th className="py-3 px-4">Container Tube Type</th>
                <th className="py-3 px-4">Tests Requiring Tube</th>
                <th className="py-3 px-4">Department Bench</th>
                <th className="py-3 px-4">Collection Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedQueue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    {activeSubTab === "pending"
                      ? "No pending blood draws in queue. All samples have been collected!"
                      : activeSubTab === "collected"
                        ? "No collected specimens found in this filter."
                        : "No sample collection records in queue."}
                  </td>
                </tr>
              ) : (
                displayedQueue.map((spec) => {
                  const isCollected = spec.status === "Collected" || spec.status === "Received & Accepted"

                  // Tube color styling
                  let tubeBadge = "bg-slate-100 text-slate-700 border-slate-300"
                  if (spec.tubeColor.includes("Lavender")) tubeBadge = "bg-purple-100 text-purple-800 border-purple-300"
                  else if (spec.tubeColor.includes("Yellow") || spec.tubeColor.includes("Gold"))
                    tubeBadge = "bg-amber-100 text-amber-800 border-amber-300"
                  else if (spec.tubeColor.includes("Red")) tubeBadge = "bg-rose-100 text-rose-800 border-rose-300"
                  else if (spec.tubeColor.includes("Blue")) tubeBadge = "bg-sky-100 text-sky-800 border-sky-300"
                  else if (spec.tubeColor.includes("Grey")) tubeBadge = "bg-slate-200 text-slate-800 border-slate-400"
                  else if (spec.tubeColor.includes("Sterile")) tubeBadge = "bg-teal-100 text-teal-800 border-teal-300"

                  return (
                    <tr key={spec.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{spec.id}</div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 mt-0.5">
                          <Barcode className="w-3 h-3 text-[#7552B8]" />
                          <span>{spec.barcode}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{spec.patientName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {spec.umr} · {spec.age}y/{spec.sex?.[0] || "M"}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold border ${tubeBadge}`}>
                          {spec.tubeColor}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{spec.specimenType}</div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 truncate">{spec.testsIncluded.join(", ")}</div>
                        <div className="text-[10px] text-slate-400">{spec.testsIncluded.length} test(s)</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{spec.department}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isCollected
                              ? "bg-teal-50 text-teal-800 border-teal-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {spec.status}
                        </span>
                        {spec.collectedAt && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(spec.collectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {spec.collectedBy}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => printLabel(spec)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                            title="Print Tube Barcode Label"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {!isCollected ? (
                            <button
                              onClick={() => handleCollect(spec)}
                              className="px-3 py-1 bg-[#7552B8] hover:bg-[#6240a3] text-white font-bold rounded-lg transition shadow-2xs cursor-pointer flex items-center gap-1"
                            >
                              <Syringe className="w-3 h-3" />
                              <span>Draw</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-teal-700 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Drawn
                              </span>
                              {onOpenWorkbench && (
                                <button
                                  type="button"
                                  onClick={() => onOpenWorkbench(spec.orderId)}
                                  className="px-2 py-0.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[10.5px] font-bold rounded-md transition cursor-pointer flex items-center gap-1"
                                  title="Proceed to analyzer bench for testing"
                                >
                                  <Microscope className="w-3 h-3" />
                                  <span>Test Bench</span>
                                </button>
                              )}
                            </div>
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

      {/* ── BARCODE LABEL PRINT MODAL ───────────────────────────────────────── */}
      {activeBarcodeSpecimen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl overflow-hidden p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Barcode className="w-5 h-5 text-[#7552B8]" />
                <h4 className="text-sm font-bold text-slate-900">Specimen Barcode Label</h4>
              </div>
              <button
                onClick={() => setActiveBarcodeSpecimen(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated thermal barcode sticker */}
            <div className="p-4 bg-amber-50/50 border-2 border-dashed border-slate-300 rounded-xl space-y-2 text-center font-mono">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                HOSPAI DIAGNOSTIC LABS
              </div>
              <div className="text-sm font-black text-slate-900">{activeBarcodeSpecimen.patientName}</div>
              <div className="text-xs text-slate-700">
                UMR: <strong className="text-purple-800">{activeBarcodeSpecimen.umr}</strong> · {activeBarcodeSpecimen.age}y/{activeBarcodeSpecimen.sex?.[0]}
              </div>

              {/* Barcode graphic simulation */}
              <div className="py-2 flex flex-col items-center justify-center">
                <div className="text-2xl tracking-[0.25em] font-black text-slate-900">
                  ||||| | |||| ||| | |||
                </div>
                <div className="text-xs font-bold text-slate-800 tracking-wider">
                  *{activeBarcodeSpecimen.barcode}*
                </div>
              </div>

              <div className="text-[10.5px] font-bold text-slate-700 bg-white py-1 px-2 rounded border border-slate-200">
                {activeBarcodeSpecimen.tubeColor}
              </div>
              <div className="text-[9.5px] text-slate-500 truncate">
                Tests: {activeBarcodeSpecimen.testsIncluded.join(", ")}
              </div>
              <div className="text-[9px] text-slate-400">
                Drawn: {new Date().toLocaleDateString("en-IN")} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveBarcodeSpecimen(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.print()
                  setActiveBarcodeSpecimen(null)
                  showToast("Barcode label sent to thermal zebra printer!")
                }}
                className="px-4 py-1.5 bg-[#7552B8] hover:bg-[#6240a3] text-white text-xs font-bold rounded-lg transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Sticker</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

