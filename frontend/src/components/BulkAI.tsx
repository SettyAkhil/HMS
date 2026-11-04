import React, { useState, useRef, useEffect } from "react"
import { Icon } from "./icons"
import { API_BASE } from "../lib/constants"
import { withAuthHeaders, reportError } from "../lib/api"
import type { Notice } from "../types"

type BulkJob = {
  id: number
  filename: string
  status: string
  kind?: string
  error?: string | null
  row_count?: number | null
}

type Props = {
  setNotice?: (notice: Notice | null) => void
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[#FEF3C7] text-[#B45309]",
  PENDING_MAPPING: "bg-[#FEF3C7] text-[#B45309]",
  MAPPING: "bg-[#DBEAFE] text-[#1D4ED8]",
  IMPORTING: "bg-[#DBEAFE] text-[#1D4ED8]",
  PROCESSING: "bg-[#DBEAFE] text-[#1D4ED8]",
  RUNNING: "bg-[#DBEAFE] text-[#1D4ED8]",
  AWAITING_PROMPT: "bg-[#DCFCE7] text-[#15803D]",
  COMPLETED: "bg-[#DCFCE7] text-[#15803D]",
  DONE: "bg-[#DCFCE7] text-[#15803D]",
  FAILED: "bg-[#FEE2E2] text-[#B91C1C]",
}

// The backend's job states (bulk_import/tasks.py): a spreadsheet goes
// PENDING_MAPPING -> IMPORTING -> DONE, a document PENDING_MAPPING ->
// AWAITING_PROMPT (text extracted). Polling used to stop at the first of these
// it did not recognise -- PENDING_MAPPING -- so every job sat there forever.
const ACTIVE_STATUSES = ["PENDING", "PENDING_MAPPING", "MAPPING", "IMPORTING", "PROCESSING", "RUNNING"]
const FINISHED_STATUSES = ["COMPLETED", "DONE", "AWAITING_PROMPT"]

export default function BulkAI({ setNotice }: Props) {
  const [jobs, setJobs] = useState<BulkJob[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    pollRef.current = window.setInterval(() => {
      setJobs((prev) => {
        prev
          .filter((j) => ACTIVE_STATUSES.includes(j.status))
          .forEach((j) => void refreshJob(j.id))
        return prev
      })
    }, 2500)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const refreshJob = async (jobId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/bulk-import/jobs/${jobId}`, {
        credentials: "include",
        headers: withAuthHeaders(),
      })
      if (!res.ok) return
      const data = await res.json()
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, ...data, filename: data.original_filename || j.filename }
            : j,
        ),
      )
    } catch {
      // best effort -- picked up again on the next poll tick
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`${API_BASE}/api/bulk-import/upload`, {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders({}, "POST"),
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw Object.assign(new Error(data.error || "Upload failed."), {
          status: res.status,
        })
      }
      setJobs((prev) => [
        { id: data.job_id, filename: file.name, status: "PENDING" },
        ...prev,
      ])
      setNotice?.({
        type: "success",
        message: `${file.name} queued for AI processing.`,
      })
    } catch (err) {
      reportError(
        setNotice,
        err as { status?: number ;message?: string },
        "Unable to upload that file.",
      )
    } finally {
      setUploading(false)
    }
  }

  const activeCount = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length
  const completedCount = jobs.filter((j) => FINISHED_STATUSES.includes(j.status)).length
  const failedCount = jobs.filter((j) => j.status === "FAILED").length

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3">
        <h1 className="text-base font-semibold text-gray-900">
          Bulk Patient AI
        </h1>
        <p className="text-[11.5px] text-[#64748B]">
          Upload patient record spreadsheets or documents for AI-assisted column
          mapping and import, powered by the Keppler AI (Qwen) backend.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-5 flex flex-col lg:flex-row gap-4">
        {/* Left Column: Upload + Stats */}
        <div className="lg:w-72 flex flex-col gap-4 flex-shrink-0">
          <div className="bg-white border border-[#DDE2EC] rounded p-4">
            <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
              New Batch
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.pdf,.docx"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full h-9 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-medium rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Icon.Plus />
              )}
              {uploading ? "Uploading…" : "Upload File"}
            </button>
            <p className="text-[11px] text-[#94A3B8] mt-2">
              .xlsx, .csv, .pdf, or .docx
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white border border-[#DDE2EC] rounded p-3">
              <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">
                Active
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {activeCount}
              </div>
            </div>
            <div className="bg-white border border-[#DDE2EC] rounded p-3">
              <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">
                Done
              </div>
              <div className="text-lg font-semibold text-[#16A34A]">
                {completedCount}
              </div>
            </div>
            <div className="bg-white border border-[#DDE2EC] rounded p-3">
              <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">
                Failed
              </div>
              <div className="text-lg font-semibold text-[#DC2626]">
                {failedCount}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Jobs */}
        <div className="flex-1 flex flex-col">
          <div className="bg-white border border-[#DDE2EC] rounded overflow-hidden flex-1 flex flex-col">
            <div className="px-4 py-2.5 border-b border-[#DDE2EC] bg-[#F8FAFC] flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                This Session's Jobs
              </span>
            </div>

            {jobs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#94A3B8] p-10">
                <p className="text-[12.5px]">
                  Upload a file to start an AI-assisted import batch.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-white border border-[#DDE2EC] p-3 rounded flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded bg-[#F1F5F9] flex items-center justify-center text-[#64748B] flex-shrink-0">
                        <Icon.Reports />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10.5px] font-mono text-[#94A3B8]">
                            JOB-{job.id}
                          </span>
                          <h3 className="text-[12.5px] font-semibold text-gray-900 truncate">
                            {job.filename}
                          </h3>
                        </div>
                        {job.error && (
                          <p className="text-[11px] text-[#DC2626] truncate">
                            {job.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10.5px] font-medium rounded uppercase tracking-wider whitespace-nowrap ${STATUS_STYLE[job.status] || "bg-[#F1F5F9] text-[#64748B]"}`}
                    >
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
