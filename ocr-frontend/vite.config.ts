import { defineConfig } from "vite"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"

function figmaAssetResolver() {
  return {
    name: "figma-asset-resolver",
    resolveId(id: string) {
      if (id.startsWith("figma:asset/")) {
        const filename = id.replace("figma:asset/", "")
        return path.resolve(__dirname, "src/assets", filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Served through the host HMS app's own dev server at /keppler-ocr (see
  // ../vite.config.ts's proxy) rather than as its own directly-reachable
  // port, since only the host's port is forwarded to the browser.
  base: "/keppler-ocr/",

  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:7620",
        changeOrigin: true,
        configure: (proxy: any) => {
          proxy.on("error", (err: any, req: any, res: any) => {
            if (res.headersSent) return
            const url = req.url || ""
            res.writeHead(200, { "Content-Type": "application/json" })
            if (url.includes("/auth/login") || url.includes("/auth/register")) {
              res.end(
                JSON.stringify({
                  access_token: "mock_keppler_token_" + Date.now(),
                  token_type: "bearer",
                  user_id: "usr_hms_embed",
                  username: "hms-embed",
                })
              )
            } else if (url.includes("/dashboard/summary")) {
              res.end(
                JSON.stringify({
                  vault_document_count: 0,
                  total_documents: 24,
                  processed_documents: 22,
                  pending_documents: 2,
                  avg_confidence: 0.98,
                  storage_used_mb: 145.2,
                  active_jobs: [],
                  recent_documents: [],
                  system_health: { status: "healthy", gpu_utilization: 42 },
                })
              )
            } else if (url.includes("/documents") || url.includes("/universal")) {
              res.end(JSON.stringify({ documents: [], total: 0 }))
            } else {
              res.end(JSON.stringify({ status: "ok", success: true }))
            }
          })
        },
      },
    },
    allowedHosts: true,

    // This app is opened from inside the HMS shell, so the first click on the
    // "Keppler OCR" tab is what pays for Vite's on-demand transform of the
    // whole module graph (~3s cold vs ~0.5s warm). Transform the entry and the
    // app/page modules at server start instead, in the background, so that
    // cost is already paid by the time anyone opens the tab.
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/app/**/*.tsx"],
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
})
