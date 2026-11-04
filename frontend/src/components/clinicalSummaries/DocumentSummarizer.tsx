import React, { useState, useEffect, useRef } from "react"
import { Icon } from "../icons"
import { kepplerFetch } from "../../lib/kepplerAuth"
import MarkdownReport from "../MarkdownReport"

// Summarise an uploaded patient record PDF through the Keppler summarizer.
export default function DocumentSummarizer() {
  const [generating, setGenerating] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const pollingIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const generateSummary = async () => {
    if (!file) {
      setError("Please select a patient record PDF to summarize.")
      return
    }

    setGenerating(true)
    setSummary(null)
    setError(null)
    setJobId(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await kepplerFetch("/summarizer/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`)
      }

      const data = await res.json()
      if (data.job_id) {
        setJobId(data.job_id)
        startPolling(data.job_id)
      } else {
        throw new Error("No job_id returned from upload")
      }
    } catch (err: any) {
      console.error(err)
      setError("Failed to reach the Keppler summarizer backend. Is it running?")
      setGenerating(false)
    }
  }

  const startPolling = (currentJobId: string) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)

    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const res = await kepplerFetch(`/summarizer/job/${currentJobId}`)
        if (!res.ok) throw new Error("Failed to check job status")

        const data = await res.json()
        if (data.status === "COMPLETED") {
          if (pollingIntervalRef.current)
            clearInterval(pollingIntervalRef.current)
          fetchResult(currentJobId)
        } else if (data.status === "FAILED") {
          if (pollingIntervalRef.current)
            clearInterval(pollingIntervalRef.current)
          setError(
            `Summarization failed: ${data.error_message || "Unknown error"}`,
          )
          setGenerating(false)
        }
      } catch (err: any) {
        console.error("Polling error", err)
      }
    }, 2000)
  }

  const fetchResult = async (currentJobId: string) => {
    try {
      const res = await kepplerFetch(`/summarizer/job/${currentJobId}/result`)
      if (!res.ok) throw new Error("Failed to fetch result")
      const data = await res.json()
      setSummary(data.summary_md)
      setGenerating(false)
    } catch (err: any) {
      setError("Failed to fetch summarization results.")
      setGenerating(false)
    }
  }

  const downloadPdf = async () => {
    if (!jobId) return
    try {
      const res = await kepplerFetch(
        `/summarizer/job/${jobId}/export?format=pdf`,
      )
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `clinical_summary_${jobId}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Failed to download the summary PDF.")
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-auto p-5 flex flex-col md:flex-row gap-4">
        {/* Left Panel: Configuration */}
        <div className="w-full md:w-80 bg-white border border-[#DDE2EC] rounded flex flex-col flex-shrink-0">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
            <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Summary Parameters
            </h2>
          </div>
          <div className="p-4 space-y-4 flex-1 overflow-auto">
            {error && (
              <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] px-3 py-2 rounded flex flex-col gap-1 text-[11.5px]">
                <div className="flex items-center gap-1 font-semibold">
                  <Icon.Alert /> Error
                </div>
                {error}
              </div>
            )}

            <div>
              <label className="block text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase mb-1.5">
                Upload Patient Record (PDF)
              </label>
              <label className="cursor-pointer flex flex-col items-center justify-center border border-dashed border-[#CBD5E1] rounded p-4 bg-[#F8FAFC] hover:border-[#1B4FD8] transition-colors">
                <Icon.Download />
                <span className="text-[11.5px] text-gray-700 mt-2 font-medium text-center">
                  {file ? file.name : "Select PDF to summarize"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase mb-1.5">
                Summary Type
              </label>
              <select className="w-full border border-[#DDE2EC] rounded bg-white text-[12.5px] px-3 py-1.5 focus:outline-none focus:border-[#1B4FD8]">
                <option>Discharge Summary</option>
                <option>Transfer Note</option>
                <option>Outpatient Consult Follow-up</option>
                <option>Pre-Op Clearance</option>
              </select>
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase mb-1.5">
                Time Range (History)
              </label>
              <div className="space-y-1.5">
                {[
                  "Current Admission Only",
                  "Past 3 Months",
                  "Past Year",
                  "Full Available History",
                ].map((opt, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="time"
                      defaultChecked={i === 0}
                      className="accent-[#1B4FD8]"
                    />
                    <span className="text-[12px] text-gray-800">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase mb-1.5">
                Include Sections
              </label>
              <div className="space-y-1.5">
                {[
                  "Chief Complaint",
                  "History of Present Illness",
                  "Medication History",
                  "Investigations",
                  "Treatment Course",
                ].map((opt, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      className="accent-[#1B4FD8]"
                    />
                    <span className="text-[12px] text-gray-800">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-[#DDE2EC] bg-[#F8FAFC]">
            <button
              onClick={generateSummary}
              disabled={generating}
              className="w-full h-9 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-medium rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Icon.TrendUp />
              )}
              {generating ? "Generating..." : "Generate Summary"}
            </button>
          </div>
        </div>

        {/* Right Panel: Output */}
        <div className="flex-1 min-w-0 min-h-[240px] bg-white border border-[#DDE2EC] rounded flex flex-col">
          {!summary && !generating && (
            <div className="flex-1 flex flex-col items-center justify-center text-[#94A3B8]">
              <div className="w-14 h-14 bg-[#F1F5F9] rounded-full flex items-center justify-center mb-3">
                <Icon.Reports />
              </div>
              <p className="text-[12.5px]">
                Upload a patient PDF and click generate to create an AI summary.
              </p>
            </div>
          )}

          {generating && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-[#E2E8F0] border-t-[#1B4FD8] rounded-full animate-spin mb-3"></div>
              <div className="text-[13px] font-semibold text-gray-900 mb-1">
                Synthesizing Clinical Records...
              </div>
              <div className="text-[11.5px] text-[#64748B]">
                Reading uploaded document chunks (Job ID: {jobId || "..."})
              </div>
            </div>
          )}

          {summary && !generating && (
            <>
              <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex justify-between items-center bg-[#F8FAFC]">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  <Icon.Cmd /> Generated Draft (Discharge Summary)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={downloadPdf}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#1B4FD8] bg-[#EFF6FF] border border-[#BFDBFE] rounded hover:bg-[#DBEAFE] flex items-center gap-1.5"
                  >
                    <Icon.Download /> Download PDF
                  </button>
                  <button className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#16A34A] border border-[#15803D] rounded hover:bg-[#15803D]">
                    Approve to EMR
                  </button>
                </div>
              </div>
              <div className="flex-1 p-6 overflow-auto text-[13px] leading-relaxed text-gray-900">
                <div className="w-full space-y-4">
                  <div className="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] rounded px-3 py-2 text-[11.5px]">
                    <strong>AI Generated Draft:</strong> This summary was
                    generated from available source information. Do not treat as
                    verified clinical truth without review.
                  </div>

                  {/* Rendered, not shown as raw "## Heading / **Field:**" text. */}
                  <MarkdownReport text={summary || ""} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
