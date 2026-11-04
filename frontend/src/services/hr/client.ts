// Client for the FastAPI HR service (backend/hr-api) behind the gateway.
// Includes high-performance in-memory caching and request de-duplication for sub-10ms UI responsiveness.
import { API_BASE } from "../../lib/constants"
import { getCsrfToken } from "../../lib/api"

export class HrApiError extends Error {
  status: number
  code: string
  details?: Record<string, any>

  constructor(status: number, message: string, code = "error", details?: Record<string, any>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  /** Field-level messages from a 422, keyed by field path. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const f of this.details?.fields ?? []) out[f.field] = f.message
    return out
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

const GET_CACHE_TTL_MS = 25_000 // 25s fast in-memory cache
const getCache = new Map<string, { data: any; expiry: number }>()
const inflightGetPromises = new Map<string, Promise<any>>()

/** Invalidate cached HR responses when changes occur or user forces refresh. */
export function invalidateHrCache(pattern?: string) {
  if (!pattern) {
    getCache.clear()
  } else {
    for (const key of getCache.keys()) {
      if (key.includes(pattern)) getCache.delete(key)
    }
  }
}

function url(path: string, query?: Query): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v))
  }
  const s = qs.toString()
  return `${API_BASE}${path}${s ? `?${s}` : ""}`
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query, bypassCache = false): Promise<T> {
  const reqUrl = url(path, query)

  // Mutations invalidate the read cache immediately
  if (method !== "GET") {
    invalidateHrCache()
  } else if (!bypassCache) {
    const hit = getCache.get(reqUrl)
    if (hit && Date.now() < hit.expiry) {
      return hit.data as T
    }
    // De-duplicate in-flight GET requests
    if (inflightGetPromises.has(reqUrl)) {
      return inflightGetPromises.get(reqUrl) as Promise<T>
    }
  }

  const exec = async (): Promise<T> => {
    const headers: Record<string, string> = { Accept: "application/json" }
    const csrf = getCsrfToken()
    if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf
    let payload: BodyInit | undefined
    if (body instanceof FormData) payload = body
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json"
      payload = JSON.stringify(body)
    }
    let res: Response
    try {
      res = await fetch(reqUrl, { method, headers, body: payload, credentials: "include" })
    } catch {
      throw new HrApiError(0, "HR service is unreachable. Check the backend is running.", "network")
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // Non-JSON (e.g. a gateway 502 page): fall through to the status message.
    }
    if (!res.ok) {
      const message =
        data?.error ||
        (res.status === 401
          ? "Your session has expired. Sign in again."
          : res.status === 502 || res.status === 503
            ? "HR service is unavailable right now."
            : `Request failed (${res.status})`)
      throw new HrApiError(res.status, message, data?.code, data?.details)
    }
    if (method === "GET") {
      getCache.set(reqUrl, { data, expiry: Date.now() + GET_CACHE_TTL_MS })
    }
    return data as T
  }

  if (method === "GET" && !bypassCache) {
    const prom = exec().finally(() => {
      inflightGetPromises.delete(reqUrl)
    })
    inflightGetPromises.set(reqUrl, prom)
    return prom
  }

  return exec()
}

export const hr = {
  get: <T>(path: string, query?: Query, bypassCache = false) => request<T>("GET", path, undefined, query, bypassCache),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, body, query),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: (path: string) => request<void>("DELETE", path),
  /** Absolute URL for downloads and EventSource (cookies travel same-origin). */
  href: (path: string, query?: Query) => url(path, query),
  clearCache: invalidateHrCache,
}
