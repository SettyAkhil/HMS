import { useEffect, useRef, useState } from "react"
import type { Dispatch, ReactNode, SetStateAction } from "react"
import DocumentUploadDropzone from "./DocumentUploadDropzone"
import MarkdownReport from "./MarkdownReport"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Table,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TabsContent,
  TabsTrigger,
} from "./ui"
import {
  API_BASE,
  SUPPORTED_DOCUMENT_ACCEPT,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from "../lib/constants"
import { apiFetch, reportError, withAuthHeaders } from "../lib/api"
import { formatDateTimeIST as formatDateTime } from "../lib/format"
import type { Notice } from "../types"

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>
}

type OcrJob = {
  job_id: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  progress: number
  error_message?: string | null
}

type OcrJobResult = {
  filename: string
  combined_markdown: string
  entities: unknown[]
  confidence_score: number | null
}

type VaultDoc = {
  id: number
  filename: string
  doc_category: string | null
  confidence_score: number | null
  extraction_date: string | null
}

type VaultDocDetail = {
  id: number
  markdown: string
}

type KbDoc = {
  doc_id: number
  filename: string
  category: string | null
  chunk_count: number
}

type ChatCitation = {
  doc_id: number
  filename: string
  page_label?: string | null
  snippet?: string | null
}

type ChatMessage = {
  role: "user" | "assistant"
  content: string
  citations?: ChatCitation[]
}

const EXPORT_FORMATS: { value: string ;label: string }[] = [
  { value: "md", label: "Markdown" },
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
  { value: "xlsx", label: "Excel" },
]

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

function Icon({
  name,
  size = 18,
}: {
  name: "upload" | "folder" | "chat" | "file" | "check" | "clock" | "alert"
  size?: number
}) {
  const paths: Record<string, ReactNode> = {
    upload: (
      <>
        <path d="M12 16V4M12 4l-4 4M12 4l4 4" {...STROKE} />
        <path
          d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16"
          {...STROKE}
        />
      </>
    ),
    folder: (
      <>
        <path
          d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l1.6 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"
          {...STROKE}
        />
      </>
    ),
    chat: (
      <>
        <path
          d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H5.5A1.5 1.5 0 0 1 4 14.5Z"
          {...STROKE}
        />
      </>
    ),
    file: (
      <>
        <path
          d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z"
          {...STROKE}
        />
        <path d="M14 3.5V7a1 1 0 0 0 1 1h3.5" {...STROKE} />
      </>
    ),
    check: <path d="M5 12.5l4.5 4.5L19 7" {...STROKE} />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8" {...STROKE} />
        <path d="M12 8v4l3 2" {...STROKE} />
      </>
    ),
    alert: (
      <>
        <path d="M12 8.5v4.2" {...STROKE} />
        <path
          d="M10.3 4.3 2.9 17.5A1.8 1.8 0 0 0 4.5 20h15a1.8 1.8 0 0 0 1.6-2.5L13.7 4.3a1.8 1.8 0 0 0-3.4 0Z"
          {...STROKE}
        />
        <circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function confidenceVariant(
  score: number | null,
): "default" | "secondary" | "destructive" {
  if (score == null) return "secondary"
  if (score >= 90) return "default"
  if (score >= 70) return "secondary"
  return "destructive"
}

function jobStatusMeta(
  status: OcrJob["status"],
): {
  label: string
  variant: "default" | "secondary" | "destructive"
  icon: "clock" | "check" | "alert"
} {
  switch (status) {
    case "COMPLETED":
      return { label: "Completed", variant: "default", icon: "check" }
    case "FAILED":
      return { label: "Failed", variant: "destructive", icon: "alert" }
    case "PROCESSING":
      return { label: "Processing", variant: "secondary", icon: "clock" }
    default:
      return { label: "Queued", variant: "secondary", icon: "clock" }
  }
}

function downloadExport(path: string) {
  window.open(`${API_BASE}${path}`, "_blank", "noopener,noreferrer")
}

export default function OcrPage({ setNotice }: Props) {
  const [tab, setTab] = useState<"upload" | "vault" | "chat">("upload")

  // Upload & Scan
  const [blueprints, setBlueprints] = useState<string[]>([
    "Universal OCR (Any Text)",
  ])
  const [selectedBlueprint, setSelectedBlueprint] = useState(
    "Universal OCR (Any Text)",
  )
  const [file, setFile] = useState<File | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<OcrJob | null>(null)
  const [jobResult, setJobResult] = useState<OcrJobResult | null>(null)
  const pollTimeoutRef = useRef<number | null>(null)

  // My Documents (vault)
  const [vaultLoaded, setVaultLoaded] = useState(false)
  const [vaultDocs, setVaultDocs] = useState<VaultDoc[]>([])
  const [vaultDetail, setVaultDetail] = useState<VaultDocDetail | null>(null)
  const [vaultDetailOpen, setVaultDetailOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Ask AI (chat)
  const [chatLoaded, setChatLoaded] = useState(false)
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    apiFetch<{ blueprints: string[] }>("/api/ocr-portal/blueprints")
      .then((data) => {
        if (data.blueprints?.length) {
          setBlueprints(data.blueprints)
          setSelectedBlueprint(data.blueprints[0])
        }
      })
      .catch(() => {
        // Fall back to the default option already in state -- non-fatal.
      })
  }, [])

  // ---- Upload & Scan ----------------------------------------------------

  const handleFileSelect = (selectedFile?: File | null) => {
    setFile(selectedFile || undefined)
    setActiveJobId(null)
    setJobStatus(null)
    setJobResult(null)
  }

  const handleUpload = async () => {
    if (!file) {
      setNotice({ type: "warning", message: "Choose a file to scan first." })
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      body.append("blueprint", selectedBlueprint)
      const response = await fetch(`${API_BASE}/api/ocr-portal/upload`, {
        method: "POST",
        headers: withAuthHeaders({}, "POST"),
        body,
        credentials: "include",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw Object.assign(new Error(data.error || "Upload failed."), {
          status: response.status,
        })
      }
      setJobResult(null)
      setJobStatus({ job_id: data.job_id, status: "PENDING", progress: 0 })
      setActiveJobId(data.job_id)
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Failed to upload document.",
      )
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (!activeJobId) return undefined
    let cancelled = false

    const poll = async () => {
      try {
        const data = await apiFetch<OcrJob>(
          `/api/ocr-portal/jobs/${activeJobId}`,
        )
        if (cancelled) return
        setJobStatus(data)

        if (data.status === "COMPLETED") {
          const result = await apiFetch<OcrJobResult>(
            `/api/ocr-portal/jobs/${activeJobId}/result`,
          )
          if (!cancelled) setJobResult(result)
          return
        }
        if (data.status === "FAILED") {
          reportError(
            setNotice,
            { message: data.error_message || "OCR processing failed." },
            "OCR processing failed.",
          )
          return
        }
        pollTimeoutRef.current = window.setTimeout(poll, 2000)
      } catch (error) {
        if (!cancelled) {
          reportError(
            setNotice,
            error as { message?: string ;status?: number },
            "Lost connection while checking job status.",
          )
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current)
    }
  }, [activeJobId, setNotice])

  const handleClear = () => {
    setFile(undefined)
    setActiveJobId(null)
    setJobStatus(null)
    setJobResult(null)
  }

  // ---- My Documents (vault) ----------------------------------------------

  const loadVault = async () => {
    try {
      const data = await apiFetch<VaultDoc[]>("/api/ocr-portal/vault")
      setVaultDocs(data)
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to load your documents.",
      )
    }
  }

  const openVaultTab = () => {
    setTab("vault")
    if (!vaultLoaded) {
      setVaultLoaded(true)
      void loadVault()
    }
  }

  const openVaultDetail = async (doc: VaultDoc) => {
    try {
      const data = await apiFetch<VaultDocDetail>(
        `/api/ocr-portal/vault/${doc.id}`,
      )
      setVaultDetail(data)
      setVaultDetailOpen(true)
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to load document.",
      )
    }
  }

  const handleDeleteConfirmed = async () => {
    if (deleteTargetId == null) return
    setDeleting(true)
    try {
      await apiFetch(`/api/ocr-portal/vault/${deleteTargetId}`, {
        method: "DELETE",
      })
      setVaultDocs((prev) => prev.filter((doc) => doc.id !== deleteTargetId))
      setNotice({ type: "success", message: "Document deleted." })
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to delete document.",
      )
    } finally {
      setDeleting(false)
      setDeleteTargetId(null)
    }
  }

  const handleAddToKnowledgeBase = async (doc: VaultDoc) => {
    try {
      await apiFetch("/api/ocr-portal/assistant/ingest", {
        method: "POST",
        body: JSON.stringify({ doc_ids: [doc.id] }),
      })
      setNotice({
        type: "success",
        message: `${doc.filename} is being added to the knowledge base.`,
      })
      if (chatLoaded) void loadKb()
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to add document to knowledge base.",
      )
    }
  }

  // ---- Ask AI (chat) -------------------------------------------------------

  const loadKb = async () => {
    try {
      const data = await apiFetch<KbDoc[]>("/api/ocr-portal/assistant/kb")
      setKbDocs(data)
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to load knowledge base.",
      )
    }
  }

  const loadChatHistory = async () => {
    try {
      const data = await apiFetch<{
        role: "user" | "assistant"
        content: string
      }[]>("/api/ocr-portal/assistant/history")
      setChatMessages(data)
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to load chat history.",
      )
    }
  }

  const openChatTab = () => {
    setTab("chat")
    if (!chatLoaded) {
      setChatLoaded(true)
      void loadKb()
      void loadChatHistory()
    }
  }

  const handleRemoveFromKb = async (doc: KbDoc) => {
    try {
      await apiFetch(`/api/ocr-portal/assistant/kb/${doc.doc_id}`, {
        method: "DELETE",
      })
      setKbDocs((prev) => prev.filter((d) => d.doc_id !== doc.doc_id))
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to remove document.",
      )
    }
  }

  const handleChatSend = async () => {
    const message = chatInput.trim()
    if (!message) return
    setChatMessages((prev) => [...prev, { role: "user", content: message }])
    setChatInput("")
    setChatLoading(true)
    try {
      const data = await apiFetch<{
        role: "assistant"
        content: string
        citations: ChatCitation[]
      }>("/api/ocr-portal/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message, session_id: "default" }),
      })
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content, citations: data.citations },
      ])
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to reach the knowledge base.",
      )
      setChatMessages((prev) => prev.slice(0, -1))
      setChatInput(message)
    } finally {
      setChatLoading(false)
    }
  }

  const handleClearChat = async () => {
    try {
      await apiFetch("/api/ocr-portal/assistant/history", { method: "DELETE" })
      setChatMessages([])
      setNotice({ type: "success", message: "Chat history cleared." })
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to clear chat history.",
      )
    }
  }

  const statusMeta = jobStatus ? jobStatusMeta(jobStatus.status) : null

  return (
    <div className="w-full p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Premium Segmented Control for Tabs */}
      <div className="flex justify-center">
        <div className="flex bg-[#F0F2F5] p-1.5 rounded-2xl shadow-inner border border-[#E2E8F0] gap-1 relative">
          {[
            { id: "upload", label: "Upload & Scan", icon: "upload" },
            {
              id: "vault",
              label: `My Documents ${
                vaultDocs.length ? `(${vaultDocs.length})` : ""
              }`,
              icon: "folder",
            },
            { id: "chat", label: "Ask AI", icon: "chat" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (t.id === "vault") openVaultTab()
                else if (t.id === "chat") openChatTab()
                else setTab("upload")
              }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ease-out ${
                tab === t.id
                  ? "bg-white text-[#1B4FD8] shadow-[0_2px_8px_-2px_rgba(27,79,216,0.15)] scale-100"
                  : "text-[#64748B] hover:text-[#1E2D42] hover:bg-white/50 scale-95"
              }`}
            >
              <Icon name={t.icon as any} size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="transition-all duration-300">
        {tab === "upload" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4 fade-in">
            {/* Left Col: Upload Form */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white/90 backdrop-blur-xl rounded-[24px] p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-100/40 via-purple-50/20 to-transparent rounded-bl-full opacity-60 pointer-events-none" />

                <div className="flex items-center gap-4 mb-6 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <Icon name="file" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                      Smart Document AI
                    </h2>
                    <p className="text-sm font-medium text-gray-500">
                      Extract intelligence instantly.
                    </p>
                  </div>
                </div>

                <div className="space-y-6 relative z-10">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Analysis Model
                    </label>
                    <div className="relative">
                      <Select
                        value={selectedBlueprint}
                        onChange={(e) => setSelectedBlueprint(e.target.value)}
                        className="w-full bg-gray-50/50 border-gray-200 shadow-sm rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold text-gray-700 h-[46px]"
                      >
                        {blueprints.map((bp) => (
                          <option key={bp} value={bp}>
                            {bp}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-[20px] overflow-hidden border-[2.5px] border-dashed border-gray-200 group-hover:border-indigo-400/50 transition-all duration-300 bg-gray-50/30 hover:bg-indigo-50/30">
                    <DocumentUploadDropzone
                      accept={SUPPORTED_DOCUMENT_ACCEPT}
                      file={file}
                      helperText={`Supports: ${SUPPORTED_DOCUMENT_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", ")}`}
                      disabled={uploading}
                      onFileSelect={handleFileSelect}
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      variant="primary"
                      type="button"
                      onClick={() => void handleUpload()}
                      disabled={!file || uploading}
                      className={`flex-1 rounded-[14px] h-[52px] font-bold text-white transition-all shadow-[0_4px_20px_-4px_rgba(99,102,241,0.4)] hover:shadow-[0_8px_25px_-4px_rgba(99,102,241,0.5)] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                        uploading ? "animate-pulse" : ""
                      }`}
                    >
                      {uploading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg
                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Processing...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                            <polyline points="13 2 13 9 20 9" />
                          </svg>
                          Extract Intelligence
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={handleClear}
                      disabled={!file && !jobStatus}
                      className="rounded-[14px] h-[52px] px-5 font-semibold text-gray-500 bg-gray-50 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-50"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </div>

              {/* Status Inline Tracker */}
              {jobStatus && (
                <div className="bg-white rounded-[20px] p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-gray-100 animate-in slide-in-from-top-4 fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {statusMeta && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            statusMeta.variant === "default"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                              : statusMeta.variant === "destructive"
                                ? "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
                                : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 animate-pulse"
                          }`}
                        >
                          <Icon name={statusMeta.icon} size={12} />
                          {statusMeta.label}
                        </span>
                      )}
                      {jobResult?.confidence_score != null && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold bg-gray-50 text-gray-600 ring-1 ring-gray-200">
                          {Math.round(jobResult.confidence_score)}% Confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {jobStatus.status !== "COMPLETED" &&
                    jobStatus.status !== "FAILED" && (
                      <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out relative"
                          style={{
                            width: `${Math.min(100, Math.max(4, jobStatus.progress || 0))}%`,
                          }}
                        >
                          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%)] bg-[length:15px_15px] animate-[shimmer_1s_infinite_linear]" />
                        </div>
                      </div>
                    )}

                  {jobStatus.status === "FAILED" && (
                    <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-sm font-medium border border-rose-100">
                      {jobStatus.error_message || "Unknown error."}
                    </div>
                  )}

                  {jobResult && (
                    <div className="pt-4 mt-2 border-t border-gray-100 flex flex-wrap gap-2">
                      {EXPORT_FORMATS.map((fmt) => (
                        <button
                          key={fmt.value}
                          onClick={() =>
                            downloadExport(
                              `/api/ocr-portal/jobs/${activeJobId}/export?format=${fmt.value}`,
                            )
                          }
                          className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 rounded-lg transition-colors border border-gray-200 hover:border-indigo-200"
                        >
                          Export {fmt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Col: Results View */}
            <div className="lg:col-span-7">
              {jobResult ? (
                <div className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 h-full min-h-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
                  <div className="p-6 md:p-8 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/50">
                    <h3 className="text-2xl font-extrabold text-gray-900 flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Icon name="check" size={20} />
                      </span>
                      {jobResult.filename}
                    </h3>
                  </div>
                  <div className="p-6 md:p-8 flex-1 overflow-y-auto">
                    <div className="prose prose-indigo max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-600 prose-a:text-indigo-600">
                      <MarkdownReport text={jobResult.combined_markdown} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50/50 rounded-[24px] border-2 border-dashed border-gray-200 h-full min-h-[600px] flex flex-col items-center justify-center text-center p-8 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-100/50 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  <div className="w-24 h-24 bg-white rounded-3xl shadow-sm flex items-center justify-center text-gray-300 mb-6 border border-gray-100 transform group-hover:-translate-y-2 transition-transform duration-500">
                    <Icon name="file" size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-400 mb-2">
                    Extraction Results
                  </h3>
                  <p className="text-gray-400 font-medium max-w-sm">
                    The parsed text and structured data from your document will
                    appear here in beautiful typography.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "vault" && (
          <div className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-4 fade-in relative group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-100/40 via-purple-50/20 to-transparent rounded-bl-full opacity-60 pointer-events-none" />
            <div className="p-6 md:p-8 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-white to-gray-50/50 relative z-10">
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
                  My Documents Vault
                </h2>
                <p className="text-gray-500 font-medium">
                  All your securely processed and stored files.
                </p>
              </div>
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                <Icon name="folder" size={24} />
              </div>
            </div>

            <div className="p-0 relative z-10">
              {vaultDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-24 h-24 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-300 mb-6 border border-gray-100">
                    <Icon name="folder" size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Vault is Empty
                  </h3>
                  <p className="text-gray-500 font-medium">
                    Scan some documents first to populate your vault.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Document
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Confidence
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {vaultDocs.map((doc) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-indigo-50/30 transition-colors group/row"
                        >
                          <td className="px-6 py-4">
                            <button
                              onClick={() => void openVaultDetail(doc)}
                              className="flex items-center gap-3 text-gray-900 font-bold hover:text-indigo-600 transition-colors"
                            >
                              <span className="p-2 bg-white rounded-xl shadow-sm text-indigo-500 border border-gray-100 group-hover/row:border-indigo-200">
                                <Icon name="file" size={16} />
                              </span>
                              {doc.filename}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex px-3 py-1 bg-gray-50 text-gray-600 rounded-full text-xs font-bold border border-gray-200">
                              {doc.doc_category || "Uncategorized"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {doc.confidence_score != null ? (
                              <span
                                className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold ${
                                  doc.confidence_score >= 90
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                                    : doc.confidence_score >= 70
                                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"
                                      : "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
                                }`}
                              >
                                {Math.round(doc.confidence_score)}%
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-500">
                            {formatDateTime(doc.extraction_date)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
                              <button
                                onClick={() =>
                                  void handleAddToKnowledgeBase(doc)
                                }
                                className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                              >
                                Add to KB
                              </button>
                              <button
                                onClick={() =>
                                  downloadExport(
                                    `/api/ocr-portal/vault/${doc.id}/export/pdf`,
                                  )
                                }
                                className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                              >
                                PDF
                              </button>
                              <button
                                onClick={() => setDeleteTargetId(doc.id)}
                                className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "chat" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 fade-in h-[700px]">
            {/* KB Sidebar */}
            <div className="lg:col-span-1 bg-white/80 backdrop-blur-xl rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-indigo-100/40 to-transparent rounded-bl-full opacity-60 pointer-events-none" />
              <div className="mb-6 flex items-center justify-between relative z-10">
                <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                  <span className="text-indigo-500">
                    <Icon name="folder" size={18} />
                  </span>
                  Knowledge Base
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-3 relative z-10">
                {kbDocs.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm font-medium text-gray-400">
                      Your KB is empty. Add documents from the Vault.
                    </p>
                  </div>
                ) : (
                  kbDocs.map((doc) => (
                    <div
                      key={doc.doc_id}
                      className="group p-4 bg-white rounded-[16px] border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all flex items-start justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {doc.filename}
                        </p>
                        <p className="text-xs font-medium text-gray-400 mt-1">
                          {doc.chunk_count} chunks
                        </p>
                      </div>
                      <button
                        onClick={() => void handleRemoveFromKb(doc)}
                        className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        title="Remove from KB"
                      >
                        <Icon name="alert" size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className="lg:col-span-3 bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col h-full overflow-hidden relative">
              {/* Header */}
              <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-white/90 backdrop-blur-md absolute top-0 left-0 right-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-[16px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <Icon name="chat" size={24} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-lg">
                      Medical AI Assistant
                    </h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Powered by your Knowledge Base
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void handleClearChat()}
                  disabled={!chatMessages.length}
                  className="text-xs font-bold text-gray-500 hover:text-rose-600 disabled:opacity-50 transition-colors bg-gray-50 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 px-4 py-2 rounded-xl shadow-sm"
                >
                  Clear Chat
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-8 pt-28 space-y-6 bg-gradient-to-b from-gray-50/50 to-white">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                    <div className="w-24 h-24 bg-indigo-50 rounded-[24px] flex items-center justify-center text-indigo-500 mb-6 shadow-sm border border-indigo-100/50">
                      <Icon name="chat" size={40} />
                    </div>
                    <h2 className="text-2xl font-extrabold text-gray-900 mb-3">
                      How can I help you?
                    </h2>
                    <p className="text-gray-500 font-medium">
                      Ask anything about the documents in your knowledge base. I
                      can summarize, extract details, and answer complex
                      queries.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      } animate-in slide-in-from-bottom-2 fade-in duration-300`}
                    >
                      <div
                        className={`max-w-[85%] rounded-[24px] px-6 py-5 shadow-sm ${
                          msg.role === "user"
                            ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-tr-sm shadow-indigo-500/20"
                            : "bg-white border border-gray-100 text-gray-900 rounded-tl-sm shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                        }`}
                      >
                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-[10px] bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <Icon name="chat" size={14} />
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                              AI Assistant
                            </span>
                          </div>
                        )}
                        <div
                          className={`prose max-w-none ${
                            msg.role === "user"
                              ? "text-white prose-p:text-white prose-headings:text-white"
                              : "prose-indigo prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-indigo-600"
                          }`}
                        >
                          <MarkdownReport text={msg.content} />
                        </div>
                        {!!msg.citations?.length && (
                          <div className="mt-5 pt-4 border-t border-gray-100/20 flex flex-wrap gap-2">
                            {msg.citations.map((c, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border ${
                                  msg.role === "user"
                                    ? "bg-white/10 border-white/20 text-white"
                                    : "bg-indigo-50 border-indigo-100 text-indigo-700"
                                }`}
                              >
                                <span className="mr-2 opacity-70">
                                  <Icon name="file" size={12} />
                                </span>
                                {c.filename}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-100 rounded-[24px] rounded-tl-sm px-6 py-5 flex items-center gap-2 shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
                      <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-6 bg-white border-t border-gray-100">
                <div className="relative flex items-center">
                  <textarea
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-[20px] pl-6 pr-16 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/50 resize-none h-[60px] overflow-hidden transition-all shadow-inner text-gray-900 font-medium placeholder-gray-400"
                    placeholder="Ask a question about your knowledge base..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        if (!chatLoading && chatInput.trim())
                          void handleChatSend()
                      }
                    }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => void handleChatSend()}
                    disabled={chatLoading || !chatInput.trim()}
                    className="absolute right-2 top-2 bottom-2 aspect-square bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-[16px] flex items-center justify-center transition-all shadow-md hover:shadow-lg disabled:shadow-none"
                  >
                    <Icon name="chat" size={20} />
                  </button>
                </div>
                <div className="text-center mt-3">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    AI can make mistakes. Verify important information.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal
        open={vaultDetailOpen}
        onClose={() => setVaultDetailOpen(false)}
        title="Document View"
      >
        <div className="max-h-[70vh] overflow-y-auto p-4 bg-gray-50 rounded-xl border border-gray-200 mt-4 prose prose-sm max-w-none">
          {vaultDetail && <MarkdownReport text={vaultDetail.markdown} />}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTargetId != null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDeleteConfirmed}
        title="Delete Document"
        description="Are you sure? This will remove the document from your vault permanently."
        confirmLabel="Yes, delete it"
        loading={deleting}
      />
    </div>
  )
}
