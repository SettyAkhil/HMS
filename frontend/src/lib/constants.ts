// The hospital backend gateway, reached through this app's own origin.
//
// `/hms-api` is a reverse proxy onto the gateway on port 8010 (see the `proxy`
// block in vite.config.ts, which strips the prefix before forwarding). It is a
// same-origin *path*, deliberately, not `http://localhost:8010`:
//
//  - An absolute localhost URL only resolves when the browser is on the same
//    machine as the backend. Open the app through a tunnel, a forwarded port or
//    from another device and `localhost:8010` is the *viewer's* machine, where
//    nothing is listening -- every call fails as "Failed to fetch".
//  - The gateway's CORS allowlist admits localhost origins only, so even a
//    reachable backend rejects a request from a tunnel hostname.
//  - The session cookie is `SameSite=Lax`, so it would be withheld from
//    cross-site POSTs anyway.
//
// Same-origin settles all three. VITE_API_BASE still overrides it at build time
// (see .env.production, for the Cloudflare Pages deploy, where the backend is a
// Cloudflare Tunnel URL rather than something this server can proxy).
const API_BASE_OVERRIDE = (import.meta as any)?.env?.VITE_API_BASE as string | undefined
export const API_BASE = API_BASE_OVERRIDE || "/hms-api"
export const SYMPTOM_API_BASE = API_BASE_OVERRIDE || "/hms-api"

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "tif",
  "tiff",
  "bmp",
  "gif",
  "heic",
  "heif",
]

const SUPPORTED_DOCUMENT_EXTENSION_SET = new Set(SUPPORTED_DOCUMENT_EXTENSIONS)

export const SUPPORTED_DOCUMENT_ACCEPT = SUPPORTED_DOCUMENT_EXTENSIONS.map(
  (ext) => `.${ext}`,
).join(",")

export const isSupportedDocumentFile = (file: File) => {
  const parts = file.name.toLowerCase().split(".")
  const ext = parts.length > 1 ? parts[parts.length - 1] : ""
  return SUPPORTED_DOCUMENT_EXTENSION_SET.has(ext)
}
