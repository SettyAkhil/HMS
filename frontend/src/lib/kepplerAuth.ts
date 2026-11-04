// Shared helper for HMS components that call the Keppler AI platform's own
// backend directly (Clinical Summaries' /api/v1/summarizer/*, etc.) rather
// than through the embedded iframe (DpiOcrPortal.tsx / SymptomAI's own
// backend). Keppler auth is a bearer token (localStorage "keppler_token"),
// not the HMS's session cookie, so these calls need their own token --
// acquired the same way the embedded app signs itself in silently (see
// ocr-frontend/src/app/lib/auth-context.tsx): a single shared service
// account, auto-registered on first use, no separate login screen.
//
// Calls go through this app's own /api proxy (vite.config.ts -> the Keppler
// frontend dev server -> its backend on 7620), so same-origin, no CORS.
const KEPPLER_API_BASE = "/api/v1"
const TOKEN_KEY = "keppler_token"
const EMBED_USERNAME = "hms-embed"
const EMBED_PASSWORD = "HmsEmbed-2026!Keppler"

async function login(): Promise<string | null> {
  const res = await fetch(`${KEPPLER_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: EMBED_USERNAME,
      password: EMBED_PASSWORD,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token || null
}

async function register(): Promise<void> {
  await fetch(`${KEPPLER_API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: EMBED_USERNAME,
      password: EMBED_PASSWORD,
    }),
  }).catch(() => {})
}

let inFlight: Promise<string | null> | null = null

export async function getKepplerToken(): Promise<string | null> {
  const cached = localStorage.getItem(TOKEN_KEY)
  if (cached) return cached
  if (!inFlight) {
    inFlight = (async () => {
      let token = await login()
      if (!token) {
        await register()
        token = await login()
      }
      if (token) localStorage.setItem(TOKEN_KEY, token)
      return token
    })().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

// Wraps fetch with the Keppler bearer token, re-authenticating once and
// retrying on a 401 (an expired/stale cached token) before giving up.
export async function kepplerFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getKepplerToken()
  const headers = {
    ...options.headers as Record<string, string> | undefined,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  let res = await fetch(`${KEPPLER_API_BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    const freshToken = await getKepplerToken()
    res = await fetch(`${KEPPLER_API_BASE}${path}`, {
      ...options,
      headers: {
        ...options.headers as Record<string, string> | undefined,
        ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
      },
    })
  }
  return res
}
