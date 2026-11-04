import React, { useState, useMemo, useEffect } from "react"
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Filter,
  Check,
  RotateCcw,
  Layers,
  ArrowRight,
  ShieldCheck,
} from "lucide-react"
import {
  UniversalRadiologyDb,
  RadiologyException,
  ExceptionCategory,
  ExceptionSeverity,
} from "../../services/universalRadiologyDb"

export default function RadiologyExceptionsView() {
  const [tick, setTick] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("open")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [selectedException, setSelectedException] = useState<RadiologyException | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState("")
  const [resolvedBy, setResolvedBy] = useState("Dr. Rajesh Sharma (HOD Radiology)")
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  useEffect(() => {
    const unsub = UniversalRadiologyDb.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [])

  const allExceptions = useMemo(() => UniversalRadiologyDb.getExceptions(), [tick])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  const filteredExceptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const list = allExceptions.filter((ex) => {
      if (statusFilter === "open" && ex.status === "Resolved") return false
      if (statusFilter === "resolved" && ex.status !== "Resolved") return false

      if (severityFilter !== "all" && ex.severity !== severityFilter) return false

      if (q) {
        const matches =
          ex.id.toLowerCase().includes(q) ||
          ex.category.toLowerCase().includes(q) ||
          ex.description.toLowerCase().includes(q) ||
          (ex.patientName || "").toLowerCase().includes(q) ||
          (ex.assignedOwner || "").toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })

    // Predefined Standardized Sorting: Newest exceptions strictly first (descending).
    // Uses actual exception event timestamp.
    // Stable secondary tie-breaker: Exception ID descending.
    return list.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime()
      const timeB = new Date(b.timestamp || 0).getTime()
      if (timeA !== timeB) return timeB - timeA
      return (b.id || "").localeCompare(a.id || "")
    })
  }, [allExceptions, statusFilter, severityFilter, searchQuery])

  const handleResolve = () => {
    if (!selectedException) return
    if (!resolutionNotes.trim()) {
      showToast("Please provide resolution notes explaining how this was addressed.", "error")
      return
    }

    try {
      UniversalRadiologyDb.resolveException(selectedException.id, resolutionNotes.trim(), resolvedBy)
      showToast(`✓ Exception ${selectedException.id} marked as Resolved.`, "success")
      setSelectedException(null)
      setResolutionNotes("")
      setTick((t) => t + 1)
    } catch (err: any) {
      showToast(err.message || "Failed to resolve exception", "error")
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3 rounded-md text-[13px] font-semibold border flex items-center justify-between shadow-md transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : toastMessage.type === "error"
              ? "bg-red-50 border-red-300 text-red-900"
              : "bg-blue-50 border-blue-300 text-blue-900"
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="cursor-pointer ml-3 font-bold">✕</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span>Radiology Exception Management Center</span>
              <span className="text-[12px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full font-mono">
                {allExceptions.filter((e) => e.status !== "Resolved").length} Unresolved
              </span>
            </h3>
            <p className="text-[12px] text-[#64748B]">
              Centralized operational tracking for incomplete scans, billing mismatches, overdue reports, and safety anomalies
            </p>
          </div>

          <div className="flex border border-[#CBD5E1] rounded overflow-hidden text-[12px] font-semibold bg-white">
            <button
              onClick={() => setStatusFilter("open")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                statusFilter === "open" ? "bg-red-700 text-white font-bold" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Open Exceptions ({allExceptions.filter((e) => e.status !== "Resolved").length})
            </button>
            <button
              onClick={() => setStatusFilter("resolved")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                statusFilter === "resolved" ? "bg-[#1B4FD8] text-white font-bold" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              Resolved ({allExceptions.filter((e) => e.status === "Resolved").length})
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${
                statusFilter === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              All Records ({allExceptions.length})
            </button>
          </div>
        </div>

        {/* ── Search & Severity Filter ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exceptions by ID, description, patient, or assignee..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[12.5px] text-[#0F172A] focus:outline-none focus:border-red-600"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 rounded text-[12px] text-slate-700 font-semibold cursor-pointer focus:outline-none focus:border-red-600"
          >
            <option value="all">Severity: All Levels</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* ── Exceptions Table ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
        <table className="w-full text-left text-[12.5px] border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
              <th className="py-3 px-3 w-28">Exception ID</th>
              <th className="py-3 px-3 w-28 text-center">Severity</th>
              <th className="py-3 px-4">Category & Description</th>
              <th className="py-3 px-3">Patient / Reference</th>
              <th className="py-3 px-3">Assigned Owner</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {filteredExceptions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  No exceptions match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filteredExceptions.map((ex) => (
                <tr key={ex.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {ex.id}
                  </td>
                  <td className="py-3 px-2 text-center whitespace-nowrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                        ex.severity === "Critical"
                          ? "bg-red-100 text-red-900 border border-red-300 animate-pulse"
                          : ex.severity === "High"
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-blue-100 text-blue-900 border border-blue-200"
                      }`}
                    >
                      {ex.severity}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{ex.category}</div>
                    <p className="text-[11.5px] text-slate-600 line-clamp-2 mt-0.5">{ex.description}</p>
                    {ex.resolutionNotes && (
                      <div className="mt-1 text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                        Resolution: {ex.resolutionNotes}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-800">{ex.patientName || "System / Gantry"}</div>
                    {ex.umr && <div className="text-[11px] text-slate-500 font-mono">UMR: {ex.umr}</div>}
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    <div className="font-medium">{ex.assignedOwner}</div>
                    <div className="text-[10.5px] text-slate-400 font-mono">
                      {new Date(ex.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        ex.status === "Resolved"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-red-50 text-red-800 border border-red-200"
                      }`}
                    >
                      {ex.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    {ex.status !== "Resolved" ? (
                      <button
                        onClick={() => setSelectedException(ex)}
                        className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white px-2.5 py-1 rounded text-[11.5px] font-bold cursor-pointer shadow-2xs"
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-mono">Resolved</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Resolve Exception Modal ── */}
      {selectedException && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-[14px]">Resolve Exception • {selectedException.id}</h3>
              <button onClick={() => setSelectedException(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <div className="p-5 space-y-3.5 text-[12.5px]">
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-950">
                <div className="font-bold">{selectedException.category}</div>
                <div className="text-[11.5px] mt-1">{selectedException.description}</div>
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Resolving Supervisor / Specialist</label>
                <input
                  type="text"
                  value={resolvedBy}
                  onChange={(e) => setResolvedBy(e.target.value)}
                  className="w-full p-2 border rounded font-semibold text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 mb-1">Resolution Action & Clinical Notes *</label>
                <textarea
                  required
                  rows={4}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Detail the operational or clinical remediation taken to clear this exception..."
                  className="w-full p-2.5 border rounded text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setSelectedException(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded text-slate-700 font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolve}
                  className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold cursor-pointer"
                >
                  Confirm Resolution
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
