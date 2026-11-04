import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import net from "node:net"
import os from "node:os"
// @ts-expect-error - JavaScript module without types
import memoryStore from "./server/db/memoryStore.mjs"


// Whether a local backend port is accepting connections, cached briefly so
// every request does not pay for a probe.
const portUpCache = new Map<number, { up: boolean; at: number }>()
function portUp(port: number): Promise<boolean> {
  const hit = portUpCache.get(port)
  if (hit && Date.now() - hit.at < 3000) return Promise.resolve(hit.up)
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" })
    const done = (up: boolean) => {
      socket.destroy()
      portUpCache.set(port, { up, at: Date.now() })
      resolve(up)
    }
    socket.setTimeout(400, () => done(false))
    socket.once("connect", () => done(true))
    socket.once("error", () => done(false))
  })
}

function getSafeFallbackPayload(urlOrPath: string): any {
  const p = (urlOrPath || "").toLowerCase()
  if (p.includes("/auth/login")) {
    return {
      status: "success",
      authenticated: true,
      user: { id: "ADM-001", username: "admin", role: "admin", name: "Administrator" },
      token: "mock_jwt_token",
    }
  }
  if (p.includes("/auth/session")) {
    return {
      authenticated: true,
      user: { id: "ADM-001", username: "admin", role: "admin", name: "Administrator" },
    }
  }
  if (p.includes("/er/visits")) {
    return { visits: [] }
  }
  if (p.includes("/er/bed-requests")) {
    return { bed_requests: [] }
  }
  if (p.includes("/er/triage-config")) {
    return {
      categories: [
        { id: 1, name: "Resuscitation (Level 1)", color: "red", maxWaitMinutes: 0 },
        { id: 2, name: "Emergent (Level 2)", color: "orange", maxWaitMinutes: 10 },
        { id: 3, name: "Urgent (Level 3)", color: "yellow", maxWaitMinutes: 30 },
        { id: 4, name: "Less Urgent (Level 4)", color: "green", maxWaitMinutes: 60 },
        { id: 5, name: "Non-Urgent (Level 5)", color: "blue", maxWaitMinutes: 120 },
      ],
    }
  }
  if (p.includes("/discharge-checklist")) {
    return {
      clear: true,
      billing: { ok: true, pending_invoices: [] },
      prescriptions: { ok: true, pending_count: 0 },
      documents: { count: 0 },
      room_charges: { segments: [] },
    }
  }
  if (p.includes("/beds/discharged")) {
    return { discharged_patients: [] }
  }
  if (p.includes("/beds")) {
    return {
      beds: [],
      summary: { total: 0, available: 0, occupied: 0, maintenance: 0 },
    }
  }
  if (p.includes("/readmissions")) {
    return {
      window_days: 30,
      total_discharges: 0,
      total_readmissions: 0,
      readmission_rate_pct: 0,
      readmission_events: [],
      high_frequency_patients: [],
    }
  }
  if (p.includes("/patients")) {
    return {
      patients: [],
      counts: { all: 0, op: 0, ip: 0, er: 0 },
    }
  }
  if (p.includes("/appointments")) {
    return { appointments: [] }
  }
  if (p.includes("/queue")) {
    return { queue: [] }
  }
  if (p.includes("/ot/cases") || p.includes("/pacu-ready")) {
    return { cases: [] }
  }
  if (p.includes("/billing/claims")) {
    return { claims: [] }
  }
  if (p.includes("/billing/invoices")) {
    return { invoices: [] }
  }
  if (p.includes("/pharmacy/summary")) {
    return {
      totalSales: 0,
      pendingPrescriptions: 0,
      lowStockCount: 0,
      expiringCount: 0,
    }
  }
  if (p.includes("/accounts/overview")) {
    return {
      cash: 450000,
      bank: 1850000,
      receivables: 320000,
      receivables_overdue_90: 0,
      payables: 210000,
      month: { income: 750000, expense: 520000, surplus: 230000 },
      year: { from: "2026-04-01", surplus: 1820000 },
      revenue_by_section: [
        { name: "Pharmacy", amount: 340000 },
        { name: "Consultations", amount: 180000 },
        { name: "Diagnostics / Lab", amount: 150000 },
        { name: "Inpatient Wards", amount: 80000 },
      ],
      trend: [
        { month: "2026-04", income: 650000, expense: 480000, surplus: 170000 },
        { month: "2026-05", income: 710000, expense: 510000, surplus: 200000 },
        { month: "2026-06", income: 750000, expense: 520000, surplus: 230000 },
      ],
      posting_exceptions: 0,
    }
  }
  if (p.includes("/accounts/accounts") || p.includes("/accounts/chart")) {
    return { accounts: [], cost_centres: [], tax_codes: [] }
  }
  if (p.includes("/accounts/ageing")) {
    return {
      as_of: new Date().toISOString().split("T")[0],
      ledger: p.includes("ap") ? "AP" : "AR",
      totals: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
      items: [],
    }
  }
  if (p.includes("/accounts/journals")) {
    return { journals: [] }
  }
  if (p.includes("/accounts/vouchers")) {
    return { vouchers: [], me: "Accounts Officer" }
  }
  if (p.includes("/accounts/cash-sessions")) {
    return { sessions: [], me: "Cashier" }
  }
  if (p.includes("/accounts/tax-codes")) {
    return { tax_codes: [] }
  }
  if (p.includes("/accounts/budget")) {
    return { fiscal_year: "2026-27", months_elapsed: 6, rows: [], totals: { budgeted: 0, actual: 0, variance: 0 } }
  }
  if (p.includes("/accounts/assets") || p.includes("/accounts/fixed-assets")) {
    return { assets: [] }
  }
  if (p.includes("/accounts/trial-balance")) {
    return { as_of: new Date().toISOString().split("T")[0], rows: [], total_debit: 0, total_credit: 0 }
  }
  if (p.includes("/accounts/balance-sheet")) {
    return { as_of: new Date().toISOString().split("T")[0], assets: [], liabilities: [], equity: [] }
  }
  if (p.includes("/accounts/profit-loss")) {
    return { from: "2026-04-01", to: new Date().toISOString().split("T")[0], income: [], expenses: [], net_profit: 0 }
  }
  if (p.includes("/icu") && p.includes("/flowsheets")) {
    return { flowsheets: [] }
  }

  // Safe universal fallback with initialized arrays for all standard collection fields
  return {
    success: true,
    status: "ok",
    items: [],
    data: [],
    results: [],
    patients: [],
    beds: [],
    cases: [],
    visits: [],
    claims: [],
    invoices: [],
    queue: [],
    appointments: [],
  }
}

function hmsApiMockMiddleware() {
  // One function for both servers. Vite calls plugin hooks with its own
  // context as `this`, not the plugin object, so the preview hook calling
  // `this.configureServer` threw and `vite preview` never started.
  const attach = (server: any) => {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      const url = req.url || ""
      if (!url.startsWith("/hms-api/")) {
        return next()
      }

      const parsedUrl = new URL(url, "http://localhost:8443")
      const pathname = parsedUrl.pathname.replace(/^\/hms-api/, "")

      // Canned answers are for when the real service is down. Answering
      // /api/auth/login here while the gateway was up meant no session cookie
      // was ever issued, so every authenticated call (prescription reading,
      // OCR) failed with 401 -- the real backend handles it whenever it can.
      const realPort = pathname.startsWith("/api/hr/") ? 8011 : 8010
      if (await portUp(realPort)) return next()

      const sendJson = (data: any) => {
        res.statusCode = 200
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify(data))
      }

      // HRMS routes
      if (pathname === "/api/hr/employees") {
        return sendJson({ employees: memoryStore.EMPLOYEES })
      }
      if (pathname === "/api/hr/attendance") {
        return sendJson({
          date: new Date().toISOString().split("T")[0],
          total: memoryStore.ATTENDANCE.length,
          attendance: memoryStore.ATTENDANCE,
        })
      }
      if (pathname === "/api/hr/leaves") {
        return sendJson({ leaves: memoryStore.LEAVES })
      }
      if (pathname === "/api/hr/overview/kpis") {
        return sendJson({
          totalWorkforce: memoryStore.EMPLOYEES.length,
          onDutyNow: memoryStore.EMPLOYEES.filter((e: any) => e.duty_status === "On Duty").length,
          doctorsOnDuty: memoryStore.EMPLOYEES.filter((e: any) => e.category === "Doctor" && e.duty_status === "On Duty").length,
          nursesOnDuty: memoryStore.EMPLOYEES.filter((e: any) => e.category === "Nursing" && e.duty_status === "On Duty").length,
          pendingLeaves: memoryStore.LEAVES.filter((l: any) => l.status === "Pending").length,
          expiringLicenses: 2,
          monthlyPayrollEstimate: memoryStore.EMPLOYEES.reduce((acc: number, e: any) => acc + (e.net_pay || 0), 0),
        })
      }
      if (pathname === "/api/hr/credentials") {
        return sendJson({ credentials: memoryStore.CREDENTIALS })
      }
      if (pathname === "/api/hr/payroll") {
        const urlObj = new URL(req.url, "http://127.0.0.1")
        const month = urlObj.searchParams.get("month") || "September"
        const year = parseInt(urlObj.searchParams.get("year") || "2026", 10)
        return sendJson({
          month,
          year,
          run: {
            id: `PR-${year}-${month.slice(0, 3).toUpperCase()}`,
            month,
            year,
            status: month === "September" ? "Paid" : "Calculated",
            total_employees: memoryStore.EMPLOYEES.length,
            total_gross: memoryStore.EMPLOYEES.reduce((acc: number, e: any) => acc + (e.basic + e.hra + e.allowances), 0),
            total_deductions: memoryStore.EMPLOYEES.reduce((acc: number, e: any) => acc + (e.pf + e.tax), 0),
            total_net: memoryStore.EMPLOYEES.reduce((acc: number, e: any) => acc + e.net_pay, 0),
          },
          payroll: memoryStore.PAYROLL_ITEMS.map((item: any) => ({
            ...item,
            basic: Number(item.basic || 0),
            hra: Number(item.hra || 0),
            allowances: Number(item.allowances || 0),
            gross: Number(item.gross || 0),
            pf: Number(item.pf || 0),
            tax: Number(item.tax || 0),
            otherDeductions: Number(item.otherDeductions || 0),
            totalDeductions: Number(item.totalDeductions || 0),
            netPay: Number(item.netPay || 0),
            overtimeHours: Number(item.overtimeHours || 0),
            overtimeAmount: Number(item.overtimeAmount || 0),
            month,
            year,
            status: month === "September" ? "Paid" : "Calculated",
            runStatus: month === "September" ? "Paid" : "Calculated",
          })),
        })
      }
      if (pathname === "/api/hr/payroll/run") {
        return sendJson({ status: "success", message: "Payroll calculated successfully" })
      }
      if (pathname.includes("/api/hr/payroll/") && (pathname.endsWith("/review") || pathname.endsWith("/approve") || pathname.endsWith("/pay") || pathname.endsWith("/revise"))) {
        return sendJson({ status: "success", message: "Payroll workflow action executed successfully" })
      }
      if (pathname === "/api/hr/biometric/staff-loans") {
        return sendJson({
          staffLoans: [
            {
              id: "LOAN-801",
              staffId: "EMP-104",
              staffName: "K. Venkatesh",
              department: "Cleaning",
              loanType: "Festival Advance",
              sanctionedAmount: 15000,
              disbursedDate: "2026-09-15",
              monthlyEmi: 2500,
              totalTenureMonths: 6,
              remainingTenureMonths: 4,
              balanceOutstanding: 10000,
              status: "Active",
            },
            {
              id: "LOAN-802",
              staffId: "EMP-105",
              staffName: "Sunita Reddy",
              department: "Clinical Pharmacy",
              loanType: "Medical Emergency Loan",
              sanctionedAmount: 50000,
              disbursedDate: "2026-06-01",
              monthlyEmi: 5000,
              totalTenureMonths: 10,
              remainingTenureMonths: 5,
              balanceOutstanding: 25000,
              status: "Active",
            },
          ],
        })
      }
      if (pathname === "/api/hr/shifts") {
        return sendJson({ shifts: memoryStore.SHIFTS })
      }
      if (pathname === "/api/hr/departments") {
        return sendJson({ departments: memoryStore.DEPARTMENTS })
      }

      // Doctor directory
      if (pathname === "/api/doctors" || pathname === "/api/doctors/directory" || pathname === "/api/op/doctors") {
        return sendJson({
          doctors: memoryStore.EMPLOYEES.filter((e: any) => e.category === "Doctor").map((d: any) => ({
            id: d.id,
            name: d.name,
            department: d.department,
            designation: d.designation,
            dutyStatus: d.duty_status,
          })),
        })
      }

      // Patient messaging gets no stand-in: a canned {"success": true} for a
      // send would tell the desk a patient had been sent their bill when
      // nothing left the building. 503 lets the app queue it honestly.
      // Accounts gets none either: its client (services/accounts/client.ts) refuses
      // mock figures on purpose -- a canned {"success": true} was taken as a
      // balance sheet with no sections and crashed Financial Statements.
      if (
        pathname.startsWith("/api/messaging") ||
        pathname.startsWith("/api/whatsapp") ||
        pathname.startsWith("/api/accounts") ||
        pathname.startsWith("/api/er") ||
        pathname.startsWith("/api/beds")
      ) {
        res.statusCode = 503
        res.setHeader("Content-Type", "application/json")
        return res.end(JSON.stringify({ error: "The hospital backend is not running." }))
      }

      // Safe fallback for all other routes when port 8010 is down
      return sendJson(getSafeFallbackPayload(pathname))
    })
  }

  return {
    name: "hms-api-mock-middleware",
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

// Vite config — https://vitejs.dev/config/

// Everything the browser needs that does not come from this dev server is
// reverse-proxied through it, so the app works from any host -- a tunnel, a
// forwarded port, another machine on the LAN -- and not only from localhost.
//
// `/hms-api` -> the hospital backend gateway. The frontend used to call
// `http://localhost:8010` by absolute URL, which works only when the browser
// happens to be on the same machine as the backend. Opened over a tunnel or a
// forwarded port, that hostname is the *viewer's* own machine, nothing is
// listening there, and every backend call dies as "Failed to fetch" -- and even
// when it is reachable, the gateway's CORS allowlist only admits localhost
// origins. Going through this server makes the calls same-origin, which settles
// reachability, CORS and the session cookie's SameSite=Lax all at once. The
// prefix is stripped before forwarding because the backend's own routes already
// live under /api, and plain `/api` is taken by the embedded Keppler app.
const proxy = {
  "/keppler-ocr": {
    target: "http://localhost:3000",
    changeOrigin: true,
    ws: true,
    configure: (proxy: any) => {
      proxy.on("error", (err: any, req: any, res: any) => {
        if (res.headersSent) return
        res.writeHead(503, { "Content-Type": "text/html" })
        res.end(
          "<div style='font-family:system-ui,sans-serif;padding:3rem;text-align:center;color:#334155;'><h3>Keppler OCR is starting...</h3><p style='color:#64748B;'>Please wait a moment while the embedded engine boots.</p><script>setTimeout(() => location.reload(), 2000)</script></div>"
        )
      })
    },
  },
  "/iclock": {
    target: "http://localhost:8011",
    changeOrigin: true,
  },
  // HR is served by the Node HRMS server (server/app.mjs), not the gateway's
  // Flask hr-service, which has none of the credentials/payroll/KPI routes
  // hrmsDb.ts calls. Must precede "/hms-api": the first matching prefix wins.
  "/hms-api/api/hr": {
    target: "http://localhost:8011",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/hms-api/, ""),
    configure: (proxy: any) => {
      proxy.on("error", (err: any, req: any, res: any) => {
        if (res.headersSent) return;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, employees: [], attendance: [], leaves: [], credentials: [] }));
      });
    },
  },
  "/hms-api": {
    target: "http://localhost:8010",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/hms-api/, ""),
    configure: (proxy: any) => {
      proxy.on("error", (err: any, req: any, res: any) => {
        // Fallback when port 8010 gateway is not running
        if (res.headersSent) return;
        const url = req.url || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getSafeFallbackPayload(url)));
      });
    },
  },
  "/vllm-api": {
    target: "http://localhost:8700",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/vllm-api/, ""),
  },
  "/api": {
    target: "http://localhost:3000",
    changeOrigin: true,
    configure: (proxy: any) => {
      proxy.on("error", (err: any, req: any, res: any) => {
        if (res.headersSent) return
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ status: "initializing", success: true }))
      })
    },
  },
}

// This machine's address on the local network (e.g. http://192.168.1.100:8443).
// Patient-card QR codes link here when the app itself is open on localhost --
// a phone that scans "localhost" would be looking at itself. VITE_PUBLIC_APP_URL
// (e.g. the hospital's domain or tunnel) overrides it.
function lanOrigin(): string {
  const port = parseInt(process.env.PORT || "8443")
  const virtual = /^(docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|wg|lo|cni|flannel|kube)/i
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (virtual.test(name)) continue
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) {
        return `http://${a.address}:${port}`
      }
    }
  }
  return ""
}

export default defineConfig({
  define: {
    // Dev server only: a production build must never bake in the build
    // machine's LAN address -- deployed, the site's own origin (or
    // VITE_PUBLIC_APP_URL) is what card QR codes link to.
    "import.meta.env.VITE_LAN_ORIGIN": JSON.stringify(process.argv.includes("build") ? "" : lanOrigin()),
  },
  plugins: [react(), tailwindcss(), hmsApiMockMiddleware()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-is",
      "recharts",
      "lucide-react",
      "react-hot-toast",
      "react-icons",
    ],
  },
  server: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
    strictPort: true,
    allowedHosts: [".trycloudflare.com", "all"],
    watch: { ignored: ["**/hospital-backend/**", "**/archive/**"] },
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx"],
    },
    proxy,
  },
  preview: {
    host: "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
    // Vite 8's DNS-rebinding guard rejects any Host header it doesn't
    // recognize -- needed here because `vite preview` gets tunneled through
    // a random *.trycloudflare.com hostname for demo links (see the "run"
    // skill / deployment notes), not accessed as localhost.
    // `.loca.lt` is here because a Cloudflare quick tunnel cannot choose its
    // own hostname -- it is assigned a random three-word name. localtunnel can,
    // which is how the demo gets a readable `enterprise-hms-demo` address.
    allowedHosts: [".trycloudflare.com", ".loca.lt"],
    // A previewed build is tunneled for demos too, so it needs the same
    // proxies the dev server has -- it had none, so every backend call and the
    // whole embedded Keppler app 404'd there.
    proxy,
  },
})
