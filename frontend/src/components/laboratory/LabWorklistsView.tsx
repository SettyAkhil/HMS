import React, { useState, useEffect, useMemo } from "react"
import {
  Microscope,
  FlaskConical,
  Clock,
  User,
  Activity,
  AlertCircle,
  Play,
  Pause,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react"
import { LabOrder, LabOrderTest, LabOrderDatabase } from "../../services/labOrdersDb"
import { LabLisService, LabDepartmentName, SpecimenRecord } from "../../services/labLisService"

interface LabWorklistsViewProps {
  onOpenResultEntry?: (order: LabOrder, test?: LabOrderTest) => void
}

const DEPARTMENTS: LabDepartmentName[] = [
  "Hematology",
  "Clinical Biochemistry",
  "Microbiology",
  "Serology & Immunology",
  "Clinical Pathology & Urinalysis",
  "Histopathology & Cytology",
]

export default function LabWorklistsView({ onOpenResultEntry }: LabWorklistsViewProps) {
  const [activeDept, setActiveDept] = useState<LabDepartmentName>("Hematology")
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [specimens, setSpecimens] = useState<SpecimenRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPriority, setFilterPriority] = useState<string>("All")

  const loadData = () => {
    setOrders(LabOrderDatabase.getOrders())
    setSpecimens(LabLisService.getSpecimens())
  }

  useEffect(() => {
    loadData()
    const unsub1 = LabOrderDatabase.subscribe(loadData)
    const unsub2 = LabLisService.subscribe(loadData)
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  // Extract tests relevant to the active department
  const worklistItems = useMemo(() => {
    const list: Array<{
      order: LabOrder
      test: LabOrderTest
      specimen?: SpecimenRecord
    }> = []

    orders.forEach((order) => {
      if (order.status === "Cancelled") return

      order.tests.forEach((test) => {
        // Map test category to active department
        const categoryLower = (test.category || "").toLowerCase()
        const activeLower = activeDept.toLowerCase()

        let matches = false
        if (activeLower.includes("hematology") && (categoryLower.includes("hematology") || categoryLower.includes("blood count"))) {
          matches = true
        } else if (
          activeLower.includes("biochemistry") &&
          (categoryLower.includes("biochemistry") || categoryLower.includes("sugar") || categoryLower.includes("lipid") || categoryLower.includes("lft") || categoryLower.includes("kft"))
        ) {
          matches = true
        } else if (activeLower.includes("microbiology") && (categoryLower.includes("microbiology") || categoryLower.includes("culture"))) {
          matches = true
        } else if (
          activeLower.includes("serology") &&
          (categoryLower.includes("serology") || categoryLower.includes("immunology") || categoryLower.includes("thyroid") || categoryLower.includes("hepatitis"))
        ) {
          matches = true
        } else if (
          activeLower.includes("pathology") &&
          (categoryLower.includes("pathology") || categoryLower.includes("urine") || categoryLower.includes("stool") || categoryLower.includes("fluid"))
        ) {
          matches = true
        } else if (categoryLower.includes(activeLower)) {
          matches = true
        }

        if (matches) {
          const spec = specimens.find((s) => s.orderId === order.id && s.testsIncluded.includes(test.name))
          list.push({ order, test, specimen: spec })
        }
      })
    })

    return list.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.order.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.order.umr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.test.name.toLowerCase().includes(searchQuery.toLowerCase())

      const matchPriority = filterPriority === "All" || item.test.urgency === filterPriority

      return matchSearch && matchPriority
    })
  }, [orders, specimens, activeDept, searchQuery, filterPriority])

  const handleStartProcessing = (orderId: string, testId: string) => {
    LabOrderDatabase.updateTestStatus(orderId, testId, "Processing", "Bench Tech")
  }

  const handleHoldTest = (orderId: string, testId: string) => {
    LabOrderDatabase.updateTestStatus(orderId, testId, "In Progress", "Bench Tech")
  }

  return (
    <div className="space-y-4">
      {/* ── DEPARTMENT BENCH TABS ────────────────────────────────────────────── */}
      <div className="flex border-b border-[#E2E8F0] overflow-x-auto bg-white p-1 rounded-xl shadow-2xs gap-1">
        {DEPARTMENTS.map((dept) => {
          const isActive = activeDept === dept
          return (
            <button
              key={dept}
              onClick={() => setActiveDept(dept)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? "bg-[#7552B8] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Microscope className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{dept}</span>
            </button>
          )
        })}
      </div>

      {/* ── WORKLIST TABLE & CONTROLS ────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-[#7552B8]" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">{activeDept} Department Worklist</h3>
              <p className="text-[11px] text-slate-500">Live analytical bench queue and instrument batch assignments</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search patient, order, test..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none w-52"
              />
            </div>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="All">All Priorities</option>
              <option value="STAT">STAT / Fast-Track</option>
              <option value="Routine">Routine</option>
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
                <th className="py-3 px-4">Specimen & Barcode</th>
                <th className="py-3 px-4">Patient Information</th>
                <th className="py-3 px-4">Investigation Test</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Assigned Bench / Tech</th>
                <th className="py-3 px-4">Analytical Status</th>
                <th className="py-3 px-4 text-right">Bench Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {worklistItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    No active samples pending on the {activeDept} bench.
                  </td>
                </tr>
              ) : (
                worklistItems.map(({ order, test, specimen }) => {
                  const isStat = test.urgency === "STAT"
                  const isCompleted = test.status === "Completed" || test.status === "Verified"

                  return (
                    <tr key={`${order.id}-${test.id}`} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{specimen?.id || `SPEC-${order.id}`}</div>
                        <div className="text-[10px] text-purple-700 font-mono">
                          {specimen?.barcode || "890126004128"}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{order.patientName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {order.umr} · {order.age}y/{order.sex?.[0]}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{test.name}</div>
                        <div className="text-[10px] text-slate-400">Order: {order.id}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            isStat
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {test.urgency || "Routine"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">{test.technician || "Bench Tech (Duty)"}</div>
                        <div className="text-[10px] text-slate-400">Bench: Station A</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isCompleted
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : test.status === "Processing"
                                ? "bg-teal-50 text-teal-800 border-teal-200"
                                : test.status === "Result Entered"
                                  ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {test.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(test.status === "Pending" || test.status === "Ordered") && order.billing?.status === "Paid" ? (
                            <button
                              onClick={() => handleStartProcessing(order.id, test.id)}
                              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              <span>Start</span>
                            </button>
                          ) : null}

                          {order.billing?.status === "Paid" ? (
                            <button
                              onClick={() => {
                                if (onOpenResultEntry) onOpenResultEntry(order, test)
                              }}
                              className="px-3 py-1 font-bold rounded-lg text-xs transition shadow-2xs cursor-pointer bg-[#7552B8] hover:bg-[#6240a3] text-white"
                            >
                              {isCompleted ? "View Result" : "Enter Results"}
                            </button>
                          ) : (
                            <span
                              className="px-2.5 py-1 font-semibold rounded-lg text-xs bg-amber-50 text-amber-800 border border-amber-300 cursor-not-allowed select-none"
                              title="Bill must be settled at Billing section before entering results"
                            >
                              Bill Pending
                            </span>
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
    </div>
  )
}

