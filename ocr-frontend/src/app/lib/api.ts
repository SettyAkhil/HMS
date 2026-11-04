// Thin fetch wrapper for the Keppler FastAPI backend.
// In dev, Vite proxies /api -> http://localhost:8000 (see vite.config.ts),
// so the default base of "/api/v1" works without any CORS setup.
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "/api/v1"

const TOKEN_KEY = "keppler_token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// A stale/expired token never becomes valid again on its own, so every 401
// must trigger client-side logout — otherwise the UI stays stuck rendering
// as "authenticated" (auth-context's isAuthenticated only checks that a
// token *string* is present) while every request keeps failing forever with
// no path back to the login screen. AuthProvider registers logout() here.
let unauthorizedHandler: (() => void) | null = null
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler
}
function reportIfUnauthorized(status: number) {
  if (status === 401) unauthorizedHandler?.()
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers["Authorization"] = `Bearer ${token}`
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  // Always include localtunnel bypass header for tunneling environments
  headers["Bypass-Tunnel-Reminder"] = "true"

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  reportIfUnauthorized(res.status)

  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = data.detail ? String(data.detail) : JSON.stringify(data)
    } catch {
      /* response wasn't JSON */
    }
    throw new ApiError(res.status, detail)
  }

  const contentType = res.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return (await res.json()) as T
  }
  return (await res.text()) as unknown as T
}

const get = <T>(path: string) => request<T>(path, { method: "GET" })
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
const postForm = <T>(path: string, form: FormData) =>
  request<T>(path, { method: "POST", body: form })
const del = <T>(path: string) => request<T>(path, { method: "DELETE" })

async function downloadBlob(path: string, filename: string) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Bypass-Tunnel-Reminder": "true",
    },
  })
  reportIfUnauthorized(res.status)
  if (!res.ok) throw new ApiError(res.status, "Export failed")
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  user_id: number
  username: string
}

export const authApi = {
  login: (username: string, password: string) =>
    post<{
      access_token: string
      token_type: string
      user_id: number
      username: string
    }>("/auth/login", {
      username,
      password,
    }),
  register: (username: string, password: string) =>
    post<{ message: string }>("/auth/register", { username, password }),
  me: () => get<AuthUser>("/auth/me"),
}

// ─── OCR ───────────────────────────────────────────────────────────────────

export interface OCREntity {
  "Original Text"?: string
  "Predicted Code"?: string
  "Predicted Name"?: string
  Type?: string
  Confidence?: string
  page?: number
  bbox?: number[]
}

export interface JobStatus {
  job_id: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  progress: number
  error_message: string | null
  result_doc_id?: number | null
}

export interface OCRJobResult {
  filename: string
  combined_markdown: string
  pages: { label: string; text: string }[]
  entities: OCREntity[]
  confidence_score: number
  extraction_time: number | null
}

export const ocrApi = {
  blueprints: () => get<{ blueprints: string[] }>("/ocr/blueprints"),
  upload: (file: File, clientBlueprint: string) => {
    const form = new FormData()
    form.append("file", file)
    form.append("client_blueprint", clientBlueprint)
    return postForm<{ document_hash: string; job_id: string; message: string }>(
      "/ocr/upload",
      form,
    )
  },
  jobStatus: (jobId: string) => get<JobStatus>(`/ocr/job/${jobId}`),
  // Polls until the OCR job leaves PENDING/PROCESSING, or the timeout elapses.
  // Longer default than assistantApi.waitForIngest — OCR on a multi-page PDF
  // takes longer than embedding an already-extracted document.
  waitForJob: async (jobId: string, timeoutMs = 120000): Promise<JobStatus> => {
    const start = Date.now()
    while (true) {
      try {
        const s = await ocrApi.jobStatus(jobId)
        if (s.status === "COMPLETED" || s.status === "FAILED") return s
      } catch (e) {
        // Ignore transient network errors (e.g. server restarts)
        console.warn("Transient error waiting for job:", e)
      }
      if (Date.now() - start > timeoutMs)
        throw new Error("Timed out waiting for job")
      await new Promise((r) => setTimeout(r, 1500))
    }
  },
  result: (jobId: string) => get<OCRJobResult>(`/ocr/job/${jobId}/result`),
  downloadExport: (
    jobId: string,
    format: "md" | "json" | "pdf" | "docx" | "xlsx",
    filename: string,
  ) => downloadBlob(`/ocr/job/${jobId}/export?format=${format}`, filename),
  getOriginalFileUrl: async (jobId: string) => {
    const token = getToken()
    const res = await fetch(`${API_BASE}/ocr/job/${jobId}/original`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Bypass-Tunnel-Reminder": "true",
      },
    })
    reportIfUnauthorized(res.status)
    if (!res.ok) throw new ApiError(res.status, "Failed to load original image")
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },
}

// ─── PDF Summarizer ─────────────────────────────────────────────────────────

export interface SummarizerJobResult {
  filename: string
  summary_md: string
  page_texts: Record<string, string>
  patient_meta: { name?: string; ip_no?: string; doctor?: string; nurse?: string }
}

export const summarizerApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return postForm<{ document_hash: string; job_id: string; message: string }>(
      "/summarizer/upload",
      form,
    )
  },
  jobStatus: (jobId: string) => get<JobStatus>(`/summarizer/job/${jobId}`),
  result: (jobId: string) =>
    get<SummarizerJobResult>(`/summarizer/job/${jobId}/result`),
  downloadExport: (
    jobId: string,
    format: "md" | "pdf" | "docx",
    filename: string,
  ) =>
    downloadBlob(`/summarizer/job/${jobId}/export?format=${format}`, filename),
}

// ─── Document Vault ─────────────────────────────────────────────────────────

export interface VaultDoc {
  id: number
  filename: string
  doc_category: string | null
  confidence_score: number | null
  extraction_date: string | null
}

export const vaultApi = {
  list: () => get<VaultDoc[]>("/vault"),
  get: (docId: number) =>
    get<{ id: number; markdown: string }>(`/vault/${docId}`),
  downloadExport: async (id: number, format: string): Promise<Blob> => {
    const token = getToken()
    const headers: Record<string, string> = { "Bypass-Tunnel-Reminder": "true" }
    if (token) headers["Authorization"] = `Bearer ${token}`

    const res = await fetch(`${API_BASE}/vault/${id}/export/${format}`, {
      headers,
    })
    reportIfUnauthorized(res.status)
    if (!res.ok) throw new Error("Failed to download file")
    return res.blob()
  },
}

// ─── AI Assistant (RAG chat) ────────────────────────────────────────────────

export interface Citation {
  doc_id: number
  filename: string
  page_label: string
  snippet: string
}

export interface ChatMessage {
  role: string
  content: string
  citations?: Citation[]
}

export interface IngestJobStatus {
  job_id: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  progress: number
  error_message: string | null
  ingested_chunks: number | null
}

export const assistantApi = {
  chat: (
    message: string,
    sessionId: string,
    targetLanguage = "English",
    docIds?: number[],
  ) =>
    post<{ role: string; content: string; citations: Citation[] }>(
      "/assistant/chat",
      {
        message,
        session_id: sessionId,
        target_language: targetLanguage,
        doc_ids: docIds,
      },
    ),
  history: (sessionId: string) =>
    get<ChatMessage[]>(
      `/assistant/history?session_id=${encodeURIComponent(sessionId)}`,
    ),
  // Server-side record of which documents are scoped to a conversation —
  // source of truth for doc_ids fallback on /chat, and lets a page reload
  // restore attachment chips instead of silently losing the conversation's
  // scoping.
  getSessionAttachments: (sessionId: string) =>
    get<{ doc_id: number; filename: string }[]>(
      `/assistant/session/${encodeURIComponent(sessionId)}/attachments`,
    ),
  addSessionAttachment: (sessionId: string, docId: number, filename: string) =>
    post(`/assistant/session/${encodeURIComponent(sessionId)}/attachments`, {
      doc_id: docId,
      filename,
    }),
  removeSessionAttachment: (sessionId: string, docId: number) =>
    del(
      `/assistant/session/${encodeURIComponent(sessionId)}/attachments/${docId}`,
    ),
  // Both ingest endpoints queue a Celery job (embedding a large document
  // inline would block the request) — use ingestJobStatus/waitForIngest to
  // know when the document is actually queryable.
  ingestText: (documents: string[]) =>
    post<{ job_id: string; message: string }>("/assistant/ingest/text", {
      documents,
    }),
  ingestVaultDocs: (docIds: number[]) =>
    post<{ job_id: string; message: string }>("/assistant/ingest/vault", {
      doc_ids: docIds,
    }),
  ingestJobStatus: (jobId: string) =>
    get<IngestJobStatus>(`/assistant/ingest/job/${jobId}`),
  // Document-aware starting questions generated from the attached file(s)'
  // real content — always returns something usable (server falls back to
  // generic defaults on any error), so callers don't need their own fallback.
  suggestQuestions: (docIds: number[]) =>
    post<{ suggestions: string[] }>("/assistant/suggestions", {
      doc_ids: docIds,
    }),
  // Polls until the ingest job leaves PENDING/PROCESSING, or the timeout elapses.
  waitForIngest: async (
    jobId: string,
    timeoutMs = 60000,
  ): Promise<IngestJobStatus> => {
    const start = Date.now()
    while (true) {
      try {
        const s = await assistantApi.ingestJobStatus(jobId)
        if (s.status === "COMPLETED" || s.status === "FAILED") return s
      } catch (e) {
        console.warn("Transient error waiting for ingest:", e)
      }
      if (Date.now() - start > timeoutMs)
        throw new Error("Timed out waiting for ingest")
      await new Promise((r) => setTimeout(r, 1200))
    }
  },

  // Streaming variant: POST + auth header, so EventSource (GET-only, no custom
  // headers) doesn't work here — consume the SSE body via fetch + ReadableStream
  // instead. Calls onCitations once, onToken per chunk, onDone at the end.
  chatStream: async (
    message: string,
    sessionId: string,
    handlers: {
      onCitations?: (c: Citation[]) => void
      onToken?: (text: string) => void
      onDone?: () => void
      onError?: (msg: string) => void
    },
    targetLanguage = "English",
    docIds?: number[],
  ) => {
    const token = getToken()
    const res = await fetch(`${API_BASE}/assistant/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Bypass-Tunnel-Reminder": "true",
      },
      body: JSON.stringify({
        message,
        session_id: sessionId,
        target_language: targetLanguage,
        doc_ids: docIds,
      }),
    })
    reportIfUnauthorized(res.status)
    if (!res.ok || !res.body) {
      throw new ApiError(
        res.status,
        res.statusText || "Streaming request failed",
      )
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const event = JSON.parse(line.slice(6))
        if (event.type === "citations") handlers.onCitations?.(event.citations)
        else if (event.type === "token") handlers.onToken?.(event.text)
        else if (event.type === "error") handlers.onError?.(event.message)
        else if (event.type === "done") handlers.onDone?.()
      }
    }
  },
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export interface ActiveJob {
  job_id: string
  job_type: string
  status: string
  progress: number
  filename: string | null
}

export interface DashboardSummary {
  vault_document_count: number
  active_jobs: ActiveJob[]
  recent_documents: VaultDoc[]
}

export const dashboardApi = {
  summary: () => get<DashboardSummary>("/dashboard/summary"),
}
