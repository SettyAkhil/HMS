import React, { useEffect, useRef, useState } from "react"
import { Icon } from "./icons"
import { API_BASE } from "../lib/constants"
import { withAuthHeaders, reportError } from "../lib/api"
import type { Notice } from "../types"

type BulkPatientRow = {
  patient_id: string
  name: string
  last_name?: string
  age?: number
  gender?: string
  area?: string
  medical_condition?: string
  phone?: string
}

type ActiveJob = {
  id: number
  filename: string
  status: string
  kind?: string
  error?: string | null
}

type BroadcastProgress = {
  id: number
  status: string
  total: number
  sent: number
  failed: number
}

type Props = {
  setNotice?: (notice: Notice | null) => void
}

const ACTIVE_JOB_STATUSES = new Set([
  "PENDING",
  "MAPPING",
  "PROCESSING",
  "IMPORTING",
])
const READY_STATUSES = new Set(["DONE", "AWAITING_PROMPT"])

export default function NLFiltering({ setNotice }: Props) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<BulkPatientRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [answer, setAnswer] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const jobPollRef = useRef<number | null>(null)

  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [broadcast, setBroadcast] = useState<BroadcastProgress | null>(null)
  const broadcastPollRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (jobPollRef.current) window.clearInterval(jobPollRef.current)
      if (broadcastPollRef.current)
        window.clearInterval(broadcastPollRef.current)
    }
  }, [])

  const stopJobPolling = () => {
    if (jobPollRef.current) {
      window.clearInterval(jobPollRef.current)
      jobPollRef.current = null
    }
  }

  const pollJob = (jobId: number) => {
    stopJobPolling()
    jobPollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/bulk-import/jobs/${jobId}`, {
          credentials: "include",
          headers: withAuthHeaders(),
        })
        if (!res.ok) return
        const data = await res.json()
        setActiveJob((prev) =>
          prev && prev.id === jobId
            ? {
                ...prev,
                status: data.status,
                kind: data.kind,
                error: data.error,
              }
            : prev,
        )
        if (READY_STATUSES.has(data.status) || data.status === "FAILED") {
          stopJobPolling()
        }
      } catch {
        // best effort -- picked up again on the next tick
      }
    }, 2500)
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
      setActiveJob({ id: data.job_id, filename: file.name, status: "PENDING" })
      setResults(null)
      setAnswer(null)
      setQuery("")
      pollJob(data.job_id)
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

  const clearActiveJob = () => {
    stopJobPolling()
    setActiveJob(null)
    setResults(null)
    setAnswer(null)
  }

  const applyResults = (rows: BulkPatientRow[], matchedTotal: number) => {
    setResults(rows)
    setTotal(matchedTotal)
    setSelectedIds(
      new Set(rows.filter((r) => r.phone).map((r) => r.patient_id)),
    )
    stopBroadcastPolling()
    setBroadcast(null)
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    if (activeJob && ACTIVE_JOB_STATUSES.has(activeJob.status)) return

    setLoading(true)
    setResults(null)
    setAnswer(null)

    try {
      const isDocument = activeJob && activeJob.kind === "document"
      const endpoint = isDocument
        ? `${API_BASE}/api/bulk-import/jobs/${activeJob!.id}/ask`
        : `${API_BASE}/api/bulk-import/query`
      const body = isDocument
        ? { prompt: query.trim() }
        : { prompt: query.trim(), job_id: activeJob?.id }

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders(
          { "Content-Type": "application/json" },
          "POST",
        ),
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw Object.assign(
          new Error(data.error || "Unable to run that query."),
          { status: res.status },
        )
      }
      applyResults(
        data.results || [],
        isDocument ? (data.results || []).length : data.total || 0,
      )
      if (isDocument) setAnswer(data.answer || null)
    } catch (err) {
      reportError(
        setNotice,
        err as { status?: number ;message?: string },
        "Unable to run that query.",
      )
      applyResults([], 0)
    } finally {
      setLoading(false)
    }
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!results) return
    const withPhone = results.filter((r) => r.phone).map((r) => r.patient_id)
    setSelectedIds((prev) =>
      prev.size === withPhone.length ? new Set() : new Set(withPhone),
    )
  }

  const stopBroadcastPolling = () => {
    if (broadcastPollRef.current) {
      window.clearInterval(broadcastPollRef.current)
      broadcastPollRef.current = null
    }
  }

  const pollBroadcast = (broadcastId: number) => {
    stopBroadcastPolling()
    broadcastPollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/bulk-import/whatsapp/broadcasts/${broadcastId}`,
          {
            credentials: "include",
            headers: withAuthHeaders(),
          },
        )
        if (!res.ok) return
        const data = await res.json()
        setBroadcast({
          id: broadcastId,
          status: data.status,
          total: data.total_recipients,
          sent: data.sent_count,
          failed: data.failed_count,
        })
        if (data.status === "DONE") stopBroadcastPolling()
      } catch {
        // best effort -- picked up again on the next tick
      }
    }, 2000)
  }

  const selectedRows = (results || []).filter((r) =>
    selectedIds.has(r.patient_id),
  )
  // A queued broadcast is dispatched almost instantly by Celery, so the POST
  // resolving is not the same as the send finishing -- keep the button
  // disabled until polling confirms DONE, or a click while "Sending..." is
  // still showing would fire the same message at the same recipients twice.
  const broadcastInFlight = !!broadcast && broadcast.status !== "DONE"

  const handleSend = async () => {
    if (!message.trim() || selectedRows.length === 0) return
    setSending(true)
    setBroadcast(null)
    try {
      const res = await fetch(`${API_BASE}/api/bulk-import/broadcast`, {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders(
          { "Content-Type": "application/json" },
          "POST",
        ),
        body: JSON.stringify({
          channel,
          message: message.trim(),
          recipients: selectedRows.map((r) => ({
            patient_id: r.patient_id,
            name: r.name,
            last_name: r.last_name,
            phone: r.phone,
            medical_condition: r.medical_condition,
          })),
          job_id: activeJob?.id,
          prompt: query.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw Object.assign(
          new Error(data.error || "Unable to send that message."),
          { status: res.status },
        )
      }
      setNotice?.({
        type: "success",
        message: `Sending to ${data.total_recipients} patient(s)…`,
      })
      // Set immediately, not just on the first poll tick 2s from now -- Celery
      // dispatches almost instantly, so leaving `broadcast` null until then
      // would re-enable the Send button for that window and let a second
      // click fire the same message at the same recipients twice.
      setBroadcast({
        id: data.broadcast_id,
        status: "PENDING",
        total: data.total_recipients,
        sent: 0,
        failed: 0,
      })
      pollBroadcast(data.broadcast_id)
    } catch (err) {
      reportError(
        setNotice,
        err as { status?: number ;message?: string },
        "Unable to send that message.",
      )
    } finally {
      setSending(false)
    }
  }

  const searchDisabled =
    !query.trim() ||
    loading ||
    (!!activeJob && ACTIVE_JOB_STATUSES.has(activeJob.status))
  const jobBusy = activeJob && ACTIVE_JOB_STATUSES.has(activeJob.status)

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3">
        <h1 className="text-base font-semibold text-gray-900">
          PatientReach AI
        </h1>
        <p className="text-[11.5px] text-[#64748B]">
          Best for patient engagement, segmentation, and outreach. Query the
          bulk-imported patient population, or upload an Excel/PDF file to
          filter within just that file, using conversational language
          translated by the Keppler AI (Qwen) model. Select any matched patients
          to send a customized WhatsApp or SMS message.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-5 flex flex-col w-full gap-4">
        {/* Search + upload row */}
        <div className="flex items-start gap-3">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                activeJob?.kind === "document"
                  ? "Ask a question about this document, e.g. 'Who has diabetes?'"
                  : "e.g. 'Show all male patients over 50'"
              }
              disabled={!!jobBusy}
              className="w-full h-10 bg-white border border-[#DDE2EC] rounded pl-3 pr-28 text-[13px] text-gray-900 focus:outline-none focus:border-[#1B4FD8] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={searchDisabled}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12px] font-medium rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Icon.Filter />
              )}
              {loading ? "Translating..." : "Filter"}
            </button>
          </form>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.pdf,.docx"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !!activeJob}
              className="h-10 px-3.5 bg-white border border-[#DDE2EC] hover:border-[#1B4FD8] text-gray-700 text-[12.5px] font-medium rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? (
                <div className="w-3.5 h-3.5 border-2 border-[#94A3B8]/40 border-t-[#1B4FD8] rounded-full animate-spin"></div>
              ) : (
                <Icon.Plus />
              )}
              {uploading ? "Uploading…" : "Upload File"}
            </button>
            {!activeJob && (
              <p className="text-[10.5px] text-[#94A3B8]">
                .xlsx, .csv, .pdf, or .docx
              </p>
            )}
          </div>
        </div>

        {activeJob && (
          <div
            className={`flex items-center justify-between gap-3 px-3.5 py-2 rounded border text-[12px] ${
              activeJob.status === "FAILED"
                ? "bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]"
                : jobBusy
                  ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1B4FD8]"
                  : "bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="flex-shrink-0">📄</span>
              <span className="font-medium truncate">{activeJob.filename}</span>
              <span className="flex-shrink-0 opacity-80">
                {activeJob.status === "FAILED"
                  ? activeJob.error || "Processing failed."
                  : jobBusy
                    ? "Processing…"
                    : activeJob.kind === "document"
                      ? "Ready — ask a question above."
                      : "Ready — search above is now scoped to this file."}
              </span>
            </span>
            <button
              onClick={clearActiveJob}
              className="flex-shrink-0 text-inherit opacity-70 hover:opacity-100 font-bold px-1"
              title="Clear and search all bulk-imported patients"
            >
              ✕
            </button>
          </div>
        )}

        {answer && (
          <div className="bg-white border border-[#DDE2EC] rounded p-3.5 text-[12.5px] text-gray-800">
            <span className="font-semibold text-[#1B4FD8]">AI answer: </span>
            {answer}
          </div>
        )}

        <div className="flex gap-4 items-start">
          {/* Main Results Table */}
          <div className="flex-1 bg-white border border-[#DDE2EC] rounded overflow-hidden min-h-[360px]">
            {!results && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-[#94A3B8] p-10">
                <div className="text-3xl mb-3">🔍</div>
                <p className="text-[12.5px] text-center max-w-sm">
                  Enter a natural language query above to filter bulk-imported
                  patient records, or upload a file first to search within just
                  that data.
                </p>
              </div>
            )}

            {loading && (
              <div className="h-full flex flex-col items-center justify-center p-10">
                <div className="w-10 h-10 border-4 border-[#E2E8F0] border-t-[#1B4FD8] rounded-full animate-spin mb-3"></div>
                <div className="text-[13px] font-semibold text-gray-900">
                  Executing Secure Query
                </div>
              </div>
            )}

            {results && !loading && (
              <>
                <div className="px-4 py-2.5 border-b border-[#DDE2EC] bg-[#F8FAFC] flex justify-between items-center">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Found {total} Matching Patients
                  </div>
                  {results.length > 0 && (
                    <div className="text-[11px] text-[#64748B]">
                      {selectedIds.size} selected for messaging
                    </div>
                  )}
                </div>
                {results.length === 0 ? (
                  <div className="p-10 text-center text-[12.5px] text-[#94A3B8]">
                    No patients matched that query.
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="border-b border-[#DDE2EC]">
                      <tr>
                        <th className="px-4 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={
                              selectedIds.size > 0 &&
                              selectedIds.size ===
                                results.filter((r) => r.phone).length
                            }
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th className="px-4 py-2 text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider">
                          MRN
                        </th>
                        <th className="px-4 py-2 text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider">
                          Patient Name
                        </th>
                        <th className="px-4 py-2 text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider">
                          Age/Sex
                        </th>
                        <th className="px-4 py-2 text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider">
                          Phone
                        </th>
                        <th className="px-4 py-2 text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider">
                          Area
                        </th>
                        <th className="px-4 py-2 text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider">
                          Medical Condition
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {results.map((r) => (
                        <tr key={r.patient_id} className="hover:bg-[#F8FAFC]">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(r.patient_id)}
                              disabled={!r.phone}
                              onChange={() => toggleRow(r.patient_id)}
                            />
                          </td>
                          <td className="px-4 py-2 text-[11.5px] font-mono text-[#64748B]">
                            {r.patient_id}
                          </td>
                          <td className="px-4 py-2 text-[12.5px] font-medium text-gray-900">
                            {r.name} {r.last_name || ""}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-gray-700">
                            {r.age ?? "—"} / {r.gender ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-gray-700">
                            {r.phone || (
                              <span className="text-[#DC2626]">No phone</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-gray-700">
                            {r.area || "—"}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-gray-700">
                            {r.medical_condition || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>

        {results && results.length > 0 && (
          <div className="bg-white border border-[#DDE2EC] rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Send Message to Filtered Patients
              </h2>
              <div className="flex gap-1.5">
                {(["whatsapp", "sms"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={`px-3 py-1 rounded border text-[11.5px] font-semibold uppercase tracking-wider transition-colors ${
                      channel === c
                        ? "bg-[#1B4FD8] text-white border-[#1B4FD8]"
                        : "bg-white text-[#64748B] border-[#DDE2EC] hover:border-[#94A3B8]"
                    }`}
                  >
                    {c === "whatsapp" ? "WhatsApp" : "SMS"}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. 'Hi {name}, this is a reminder from the hospital about your upcoming follow-up. Please call us at your convenience.'"
              className="w-full border border-[#DDE2EC] p-2.5 rounded text-[12.5px]"
            />
            <p className="text-[10.5px] text-[#94A3B8] mt-1">
              Use <code className="font-mono">{"{name}"}</code> to personalize
              each message.
            </p>

            <div className="flex items-center justify-between mt-3">
              <div className="text-[11.5px] text-[#64748B]">
                {broadcast
                  ? broadcast.status === "DONE"
                    ? `Sent ${broadcast.sent} / ${broadcast.total} (${broadcast.failed} failed)`
                    : `Sending… ${broadcast.sent} / ${broadcast.total} so far`
                  : `${selectedRows.length} patient(s) will receive this message.`}
              </div>
              <button
                onClick={handleSend}
                disabled={
                  sending ||
                  broadcastInFlight ||
                  !message.trim() ||
                  selectedRows.length === 0
                }
                className="h-9 px-4 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-medium rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {sending ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <Icon.Message />
                )}
                {sending
                  ? "Sending…"
                  : `Send to ${selectedRows.length} Patient(s)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
