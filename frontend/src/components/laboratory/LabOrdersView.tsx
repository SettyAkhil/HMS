import React, { useState, useEffect, useMemo } from "react"
import toast from "react-hot-toast"
import {
  Plus,
  Search,
  Filter,
  FileText,
  Calendar,
  User,
  Stethoscope,
  Clock,
  AlertCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  DollarSign,
  Tag,
} from "lucide-react"
import { LabOrder, LabOrderDatabase, priceForTest } from "../../services/labOrdersDb"
import { ALL_LAB_TESTS, LabTestDefinition, findTestDefinition } from "./labCatalogueSchema"
import { db, DBPatient } from "../../services/db"
import { AuditDatabase } from "../../services/auditDb"

interface LabOrdersViewProps {
  onOpenReport?: (order: LabOrder) => void
  onOpenBench?: (order: LabOrder) => void
  onCollectSample?: (order?: LabOrder) => void
}

export default function LabOrdersView({ onOpenReport, onOpenBench, onCollectSample }: LabOrdersViewProps) {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>("All")
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Creation form state
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<DBPatient | null>(null)
  const [patientMatches, setPatientMatches] = useState<DBPatient[]>([])
  const [orderSource, setOrderSource] = useState<"OPD" | "IPD" | "Emergency" | "ICU" | "OT" | "Direct">("OPD")
  const [orderingDoctor, setOrderingDoctor] = useState("Dr. P. R. K. Varma")
  const [department, setDepartment] = useState("Cardiology")
  const [clinicalNotes, setClinicalNotes] = useState("")
  const [priority, setPriority] = useState<"Routine" | "Urgent" | "STAT">("Routine")
  const [fastingRequired, setFastingRequired] = useState(false)
  const [selectedTests, setSelectedTests] = useState<LabTestDefinition[]>([])
  const [testSearchQuery, setTestSearchQuery] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  const loadOrders = () => {
    setOrders(LabOrderDatabase.getOrders())
  }

  useEffect(() => {
    loadOrders()
    const unsub = LabOrderDatabase.subscribe(loadOrders)
    return () => unsub()
  }, [])

  // Patient live search
  useEffect(() => {
    if (!patientSearch.trim() || selectedPatient) {
      setPatientMatches([])
      return
    }
    const q = patientSearch.toLowerCase()
    const all = db.getPatients()
    const matches = all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.umr.toLowerCase().includes(q) ||
        p.phone.includes(q)
    )
    setPatientMatches(matches.slice(0, 5))
  }, [patientSearch, selectedPatient])

  const tabCounts = useMemo(() => {
    const pendingBilling = orders.filter((o) => o.billing?.status !== "Paid").length
    const readyForDraw = orders.filter((o) => o.billing?.status === "Paid" && o.status === "Billed").length
    const inTesting = orders.filter((o) => o.status === "Sample Collected" || o.status === "In Progress").length
    const completed = orders.filter((o) => o.status === "Completed").length
    return { pendingBilling, readyForDraw, inTesting, completed }
  }, [orders])

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !searchQuery ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.umr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.tests.some((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchTab =
        selectedStatusTab === "All" ||
        (selectedStatusTab === "Pending Billing" && o.billing?.status !== "Paid") ||
        (selectedStatusTab === "Paid" && o.billing?.status === "Paid" && o.status === "Billed") ||
        (selectedStatusTab === "Processing" && (o.status === "Sample Collected" || o.status === "In Progress")) ||
        (selectedStatusTab === "Completed" && o.status === "Completed")

      return matchSearch && matchTab
    })
  }, [orders, searchQuery, selectedStatusTab])

  // Available tests search for modal
  const searchTestResults = useMemo(() => {
    if (!testSearchQuery.trim()) return ALL_LAB_TESTS.slice(0, 8)
    const q = testSearchQuery.toLowerCase()
    return ALL_LAB_TESTS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [testSearchQuery])

  // Order Total calculation
  const orderTotal = useMemo(() => {
    return selectedTests.reduce((sum, t) => sum + priceForTest(t.name), 0)
  }, [selectedTests])

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage("")

    if (!selectedPatient) {
      setErrorMessage("Please select a valid registered patient.")
      return
    }
    if (selectedTests.length === 0) {
      setErrorMessage("Please add at least one clinical laboratory test.")
      return
    }
    if (!orderingDoctor.trim()) {
      setErrorMessage("Please enter the ordering clinician name.")
      return
    }

    try {
      const newOrder = LabOrderDatabase.createOrder({
        encounterId: `ENC-${selectedPatient.umr}-${Date.now().toString().slice(-4)}`,
        umr: selectedPatient.umr,
        patientName: selectedPatient.name,
        age: selectedPatient.age,
        sex: selectedPatient.sex,
        phone: selectedPatient.phone,
        opNumber: `OP-${Math.floor(100 + Math.random() * 900)}`,
        doctorId: "DOC-01",
        doctorName: orderingDoctor,
        department: department,
        diagnosis: clinicalNotes || "Routine clinical diagnostic workup",
        clinicalNotes: fastingRequired ? `Fasting Required. ${clinicalNotes}` : clinicalNotes,
        tests: selectedTests.map((t) => ({
          name: t.name,
          category: t.category,
          urgency: priority,
          price: priceForTest(t.name),
        })),
      })

      AuditDatabase.logEvent(
        "Laboratory Order Created",
        "Laboratory",
        `New lab order ${newOrder.id} created for patient ${selectedPatient.name} (${selectedPatient.umr}) with ${selectedTests.length} tests by ${orderingDoctor}.`,
        "Success",
      )

      setIsCreateModalOpen(false)
      setSelectedPatient(null)
      setSelectedTests([])
      setPatientSearch("")
      setClinicalNotes("")
      toast.success(`Lab order ${newOrder.id} created successfully!`)
    } catch (err: any) {
      const msg = err.message || "Failed to create lab order."
      setErrorMessage(msg)
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── HEADER ACTIONS & TABS ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {[
            { id: "All", label: `All Orders (${orders.length})` },
            { id: "Pending Billing", label: `💳 Awaiting Billing (${tabCounts.pendingBilling})` },
            { id: "Paid", label: `💉 Ready for Draw (${tabCounts.readyForDraw})` },
            { id: "Processing", label: `🔬 In Testing (${tabCounts.inTesting})` },
            { id: "Completed", label: `✅ Released (${tabCounts.completed})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatusTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                selectedStatusTab === tab.id
                  ? "bg-white text-[#7552B8] shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & New Order Button */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter orders by ID, UMR, test..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7552B8] w-64 shadow-2xs"
            />
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#7552B8] hover:bg-[#6240a3] text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Lab Order</span>
          </button>
        </div>
      </div>

      {/* ── ORDERS TABLE ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Order Ref</th>
                <th className="py-3 px-4">Patient Demographics</th>
                <th className="py-3 px-4">Tests Included</th>
                <th className="py-3 px-4">Doctor & Department</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Billing Status</th>
                <th className="py-3 px-4">Lifecycle State</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    No diagnostic laboratory orders match your criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const hasStat = order.tests.some((t) => t.urgency === "STAT")
                  const isPaid = order.billing?.status === "Paid"

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900">{order.id}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "09:30 AM"}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{order.patientName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {order.umr} · {order.age}y/{order.sex?.[0] || "M"}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 truncate">
                          {order.tests.map((t) => t.name).join(", ")}
                        </div>
                        <div className="text-[10px] text-slate-400">{order.tests.length} item(s)</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{order.doctorName}</div>
                        <div className="text-[10px] text-slate-400">{order.department}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            hasStat
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {hasStat ? "STAT" : "Routine"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {order.billing?.status || "Pending"}
                        </span>
                        <div className="text-[10px] font-mono text-slate-600 mt-0.5">₹{order.billing?.total || 0}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            order.status === "Completed"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : order.status === "In Progress"
                                ? "bg-teal-50 text-teal-700 border-teal-200"
                                : order.status === "Sample Collected"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid ? (
                            <span
                              className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-default select-none shadow-2xs"
                              title="Payment must be settled in the central Billing section"
                            >
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Bill at Billing Section</span>
                            </span>
                          ) : (
                            <>
                              {order.status === "Billed" && onCollectSample && (
                                <button
                                  type="button"
                                  onClick={() => onCollectSample(order)}
                                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-[#7552B8] border border-purple-200 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Go to Phlebotomy / Sample Collection"
                                >
                                  <span>💉 Draw Sample</span>
                                </button>
                              )}

                              {(order.status === "Sample Collected" || order.status === "In Progress" || (order.status !== "Completed" && !onCollectSample)) && onOpenBench && (
                                <button
                                  type="button"
                                  onClick={() => onOpenBench(order)}
                                  className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Enter analyzer values on workbench"
                                >
                                  <span>🔬 Enter Results</span>
                                </button>
                              )}
                            </>
                          )}

                          {order.status === "Completed" && onOpenReport && (
                            <button
                              type="button"
                              onClick={() => onOpenReport(order)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="View and print official diagnostic report"
                            >
                              <span>📄 View Report</span>
                            </button>
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

      {/* ── CREATE ORDER MODAL ──────────────────────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-[#7552B8] rounded-xl">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create New Laboratory Order</h3>
                  <p className="text-[11px] text-slate-500">Order diagnostic panels for OPD, IPD, or Emergency</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateOrder} className="p-5 overflow-y-auto space-y-4 flex-1">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 1. Patient Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Patient Identity <span className="text-rose-600">*</span>
                </label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between p-3 bg-purple-50/60 border border-purple-200 rounded-xl text-xs">
                    <div>
                      <strong className="text-slate-900 font-bold">{selectedPatient.name}</strong>{" "}
                      <span className="font-mono text-purple-700">({selectedPatient.umr})</span>
                      <div className="text-[11px] text-slate-500">
                        {selectedPatient.age} yrs · {selectedPatient.sex} · Phone: {selectedPatient.phone}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null)
                        setPatientSearch("")
                      }}
                      className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Type patient name, UMR, or phone number..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7552B8]"
                    />
                    {patientMatches.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden divide-y divide-slate-100">
                        {patientMatches.map((p) => (
                          <div
                            key={p.umr}
                            onClick={() => {
                              setSelectedPatient(p)
                              setPatientMatches([])
                            }}
                            className="p-2.5 hover:bg-purple-50/70 transition cursor-pointer text-xs"
                          >
                            <span className="font-bold text-slate-900">{p.name}</span>{" "}
                            <span className="font-mono text-[10px] text-purple-700">({p.umr})</span>
                            <div className="text-[10px] text-slate-500">
                              {p.age}y · {p.sex} · {p.phone}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Order Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Encounter Pathway</label>
                  <select
                    value={orderSource}
                    onChange={(e: any) => setOrderSource(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="OPD">OPD Consultation</option>
                    <option value="IPD">Inpatient Ward</option>
                    <option value="Emergency">Emergency (ED)</option>
                    <option value="ICU">Intensive Care Unit (ICU)</option>
                    <option value="OT">Operation Theatre (OT)</option>
                    <option value="Direct">Direct Lab Walk-in</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Ordering Clinician</label>
                  <input
                    type="text"
                    value={orderingDoctor}
                    onChange={(e) => setOrderingDoctor(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Cardiology">Cardiology</option>
                    <option value="General Medicine">General Medicine</option>
                    <option value="Pediatrics">Pediatrics</option>
                    <option value="Orthopedics">Orthopedics</option>
                    <option value="Neurology">Neurology</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                </div>
              </div>

              {/* 3. Priority & Fasting */}
              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Turnaround Priority</label>
                  <div className="flex gap-2">
                    {(["Routine", "Urgent", "STAT"] as const).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                          priority === p
                            ? p === "STAT"
                              ? "bg-rose-600 text-white border-rose-600 shadow-2xs"
                              : "bg-[#7552B8] text-white border-[#7552B8] shadow-2xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fastingRequired}
                      onChange={(e) => setFastingRequired(e.target.checked)}
                      className="w-4 h-4 rounded text-[#7552B8] focus:ring-[#7552B8]"
                    />
                    <span>10-12 Hours Fasting Required</span>
                  </label>
                </div>
              </div>

              {/* 4. Test Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Diagnostic Tests <span className="text-rose-600">*</span>
                </label>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search clinical test master (CBC, LFT, Creatinine, Lipid, TSH...)"
                    value={testSearchQuery}
                    onChange={(e) => setTestSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>

                {/* Test pill options */}
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                  {searchTestResults.map((t) => {
                    const isSelected = selectedTests.some((st) => st.name === t.name)
                    return (
                      <button
                        type="button"
                        key={t.name}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTests((prev) => prev.filter((st) => st.name !== t.name))
                          } else {
                            setSelectedTests((prev) => [...prev, t])
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                          isSelected
                            ? "bg-[#7552B8] text-white shadow-2xs"
                            : "bg-white text-slate-700 border border-slate-200 hover:border-purple-300"
                        }`}
                      >
                        <span>{t.name}</span>
                        <span className="text-[10px] opacity-75">₹{priceForTest(t.name)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Selected Tests Summary & Pricing */}
              {selectedTests.length > 0 && (
                <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl text-xs space-y-2">
                  <div className="flex justify-between items-center font-bold text-slate-900">
                    <span>Selected Tests ({selectedTests.length})</span>
                    <span className="text-[#7552B8] font-mono text-sm">Total Tariff: ₹{orderTotal}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTests.map((t) => (
                      <span
                        key={t.name}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-purple-200 text-[10.5px] font-medium text-slate-800"
                      >
                        {t.name}
                        <button
                          type="button"
                          onClick={() => setSelectedTests((prev) => prev.filter((st) => st.name !== t.name))}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Clinical Indication Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Clinical Indication / Notes</label>
                <textarea
                  rows={2}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="e.g. Rule out bacterial sepsis, persistent 3-day pyrexia, evaluate baseline renal function"
                  className="w-full p-2 text-xs border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#7552B8] hover:bg-[#6240a3] text-white transition shadow-2xs cursor-pointer"
                >
                  Confirm & Route to Billing / Draw
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

