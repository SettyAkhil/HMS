import { useState } from "react"

// Embeds the Keppler Medical Document Intelligence Platform (dpi-ocr) app
// unmodified, as its own build running in a container on port 3005. It is a
// full separate application, so it is embedded rather than merged into this
// bundle to avoid its React 18 / shadcn / Figma UI kit dependencies
// colliding with this app's React 19 + Tailwind v4 setup.
//
// Loaded through this dev server's own /keppler-ocr proxy (vite.config.ts)
// rather than http://localhost:3005 directly: only this app's own port is
// forwarded to the browser, so a cross-port iframe src is unreachable from
// outside this sandbox even though it resolves fine from inside it.
const OCR_APP_URL = (import.meta as any)?.env?.VITE_DPI_OCR_URL || "/keppler-ocr/"

export default function DpiOcrPortal() {
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  return (
    <div className="h-full w-full flex flex-col bg-[#F0F2F5] relative">
      {failed && (
        <div className="px-3.5 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A] text-[#92400E] text-[12.5px] flex items-start gap-2.5">
          <span className="font-bold mt-px text-sm">⚠</span>
          <span>
            Could not reach the Keppler OCR app at{" "}
            <code className="font-mono">{OCR_APP_URL}</code>. Start it with{" "}
            <code className="font-mono">
              cd ocr-frontend && npm install && npm run dev
            </code>{" "}
            (and its backend with{" "}
            <code className="font-mono">
              cd ocr-backend && docker compose up -d
            </code>
            ), then reload this tab.
          </span>
        </div>
      )}
      <iframe
        title="Keppler OCR"
        src={OCR_APP_URL}
        className="flex-1 w-full border-0"
        onLoad={() => setLoading(false)}
        onError={() => setFailed(true)}
      />
      {loading && !failed && (
        <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-[#64748B] pointer-events-none bg-[#F0F2F5]">
          Loading Keppler OCR…
        </div>
      )}
    </div>
  )
}
