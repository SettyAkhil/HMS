import { usePharmacyData } from "../data/usePharmacyData"
import { Fragment, useState, useEffect, useMemo } from "react"
import {
  Search,
  Download,
  ChevronDown,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import PageHeader from "../components/PageHeader"

const actionColors: Record<string, string> = {
  Verified: "#16a34a",
  Adjusted: "#d97706",
  Rejected: "#dc2626",
  Cancelled: "#dc2626",
  Approved: "#15803d",
  Updated: "#0F766E",
  Created: "#15803d",
  Deleted: "#dc2626",
}

interface AuditLogProps {
  onNavigate: (page: string) => void
}

export default function AuditLog({ onNavigate }: AuditLogProps) {
  const { auditLogs, refresh } = usePharmacyData()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [moduleFilter, setModuleFilter] = useState("All")

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  const modules = [
    "All",
    "Prescription",
    "Inventory",
    "Billing",
    "Purchase",
    "Medicine",
    "User",
  ]
  const filtered = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchSearch =
        !search ||
        log.user.toLowerCase().includes(search.toLowerCase()) ||
        log.module.toLowerCase().includes(search.toLowerCase()) ||
        log.record.toLowerCase().includes(search.toLowerCase()) ||
        log.details.toLowerCase().includes(search.toLowerCase())
      const matchModule = moduleFilter === "All" || log.module === moduleFilter
      return matchSearch && matchModule
    })
  }, [auditLogs, search, moduleFilter])

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedLogs = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [search, moduleFilter, auditLogs.length])

  const handleExport = () => {
    if (filtered.length === 0) {
      alert("No logs to export.")
      return
    }
    const headers = [
      "Timestamp",
      "User",
      "Module",
      "Action",
      "Record",
      "IP/Device",
      "Details",
    ]
    const csvRows = [headers.join(",")]

    for (const log of filtered) {
      const row = [
        `"${log.timestamp}"`,
        `"${log.user}"`,
        `"${log.module}"`,
        `"${log.action}"`,
        `"${log.record}"`,
        `"${log.ip ?? ""}"`,
        `"${log.details.replace(/"/g, '""')}"`,
      ]
      csvRows.push(row.join(","))
    }

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute(
      "download",
      `audit_log_${new Date().toISOString().split("T")[0]}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: "Pharmacy" },
          { label: "Administration" },
          { label: "Audit Log" },
        ]}
        title={
          <div className="flex items-center gap-2">
            Audit Log
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              Live
            </span>
          </div>
        }
        description="Complete trail of all system actions and changes"
        actions={
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-[#E2E8F0] bg-white text-[13px] text-[#334155] hover:bg-[#F5F7FA] transition-colors"
          >
            <Download size={13} /> Export
          </button>
        }
        onNavigate={onNavigate}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded px-3 py-2">
          <Search size={14} className="text-[#94A3B8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, record, action…"
            className="text-[13px] outline-none text-[#0F1624] placeholder:text-[#94A3B8] w-48"
          />
        </div>
        <div className="flex gap-1">
          {modules.map((m) => (
            <button
              key={m}
              onClick={() => setModuleFilter(m)}
              className="px-3 py-1.5 rounded text-[12px] font-medium transition-colors border border-[#E2E8F0]"
              style={{
                background: moduleFilter === m ? "#0F1624" : "#fff",
                color: moduleFilter === m ? "#fff" : "#64748B",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {/* Log Table */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <table>
          <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0]">
            <tr>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Timestamp</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">User</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Module</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Action</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Record</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">IP / Device</th>
              <th className="py-3 px-4 text-[11px] font-bold text-[#065F46] uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLogs.map((log, i) => (
              <Fragment key={log.id}>
                <tr
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="cursor-pointer"
                >
                  <td className="font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
                        style={{ background: "#E8EDF5", color: "#0F766E" }}
                      >
                        {log.user[0]}
                      </div>
                      <span className="text-[13px] font-medium text-[#0F1624]">
                        {log.user}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: "#F5F7FA", color: "#334155" }}
                    >
                      {log.module}
                    </span>
                  </td>
                  <td>
                    <span
                      className="text-[12px] font-bold"
                      style={{ color: actionColors[log.action] ?? "#334155" }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td
                    className="font-mono text-[12px] font-semibold"
                    style={{ color: "#0F766E" }}
                  >
                    {log.record}
                  </td>
                  <td className="font-mono text-[11px] text-[#94A3B8]">
                    {log.ip ?? "—"}
                  </td>
                  <td>
                    <button
                      onClick={() => setExpanded(expanded === i ? null : i)}
                      className="flex items-center gap-1 text-[12px] font-medium hover:underline cursor-pointer"
                      style={{ color: "#0F766E" }}
                    >
                      Details{" "}
                      <ChevronDown
                        size={12}
                        style={{
                          transform:
                            expanded === i ? "rotate(180deg)" : undefined,
                          transition: "transform 0.2s",
                        }}
                      />
                    </button>
                  </td>
                </tr>
                {expanded === i && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ background: "#F5F7FA", padding: 0 }}
                    >
                      <div className="px-14 py-3 flex items-start gap-3">
                        <Shield
                          size={13}
                          className="text-[#7c3aed] mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <p className="text-[12px] font-medium text-[#0F1624] mb-1">
                            Change Details
                          </p>
                          <p className="text-[12px] text-[#64748B]">
                            {log.details}
                          </p>
                          <p className="text-[11px] text-[#94A3B8] mt-1">
                            Recorded at {log.timestamp} · IP:{" "}
                            {log.ip ?? "unknown"}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-[13px] text-[#64748B]">
          <span>
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filtered.length)} of{" "}
            {filtered.length} entries
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded border border-[#E2E8F0] hover:bg-[#F5F7FA] disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 font-medium text-[#0F1624]">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded border border-[#E2E8F0] hover:bg-[#F5F7FA] disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
