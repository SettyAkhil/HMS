import { safeLocalStorageSetItem } from "../utils/storageQuotaManager"

export interface AuditLog {
  id: string
  userId: string
  username: string
  action: string
  module: string
  description: string
  timestamp: string
  status: "Success" | "Failed"
  device?: string
  loginTime?: string
  logoutTime?: string
  duration?: string
  sessionId?: string
}

let _cachedDetectDevice: string | null = null

export function detectDevice(): string {
  if (_cachedDetectDevice) return _cachedDetectDevice
  if (typeof navigator === "undefined") {
    _cachedDetectDevice = "Lenovo Laptop"
    return "Lenovo Laptop"
  }

  const ua = navigator.userAgent || ""
  const platform = navigator.platform || ""
  const vendor = navigator.vendor || ""

  let gpuRenderer = ""
  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas")
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
      if (gl) {
        const debugInfo = (gl as any).getExtension("WEBGL_debug_renderer_info")
        if (debugInfo) {
          gpuRenderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ""
        }
        try {
          const lose = (gl as any).getExtension("WEBGL_lose_context")
          lose?.loseContext()
        } catch {}
      }
    }
  } catch {
    // Ignore
  }

  const fullContext = `${ua} ${platform} ${vendor} ${gpuRenderer}`

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0 && /Android|Mobile/i.test(ua))

  if (isMobile || /iPhone|iPad|iPod/i.test(ua)) {
    if (/iPhone/i.test(ua)) _cachedDetectDevice = "Apple iPhone"
    return "Apple iPhone"
    if (/iPad/i.test(ua)) _cachedDetectDevice = "Apple iPad"
    return "Apple iPad"
    if (/Vivo|V2\d{3}|V1\d{3}|V20|V21|V22|V23|V24|V25|V27|V29|V30|Y20|Y21|Y33|Y56|Y75|CPH/i.test(fullContext)) _cachedDetectDevice = "Vivo Phone"
    return "Vivo Phone"
    if (/Samsung|SM-[A-Z0-9]|Galaxy/i.test(fullContext)) _cachedDetectDevice = "Samsung Phone"
    return "Samsung Phone"
    if (/Xiaomi|Redmi|Poco|Mi /i.test(fullContext)) _cachedDetectDevice = "Xiaomi Phone"
    return "Xiaomi Phone"
    if (/OnePlus|ONEPLUS/i.test(fullContext)) _cachedDetectDevice = "OnePlus Phone"
    return "OnePlus Phone"
    if (/Oppo/i.test(fullContext)) _cachedDetectDevice = "Oppo Phone"
    return "Oppo Phone"
    if (/Realme|RMX/i.test(fullContext)) _cachedDetectDevice = "Realme Phone"
    return "Realme Phone"
    if (/Pixel/i.test(fullContext)) _cachedDetectDevice = "Google Pixel"
    return "Google Pixel"
    if (/Motorola|Moto/i.test(fullContext)) _cachedDetectDevice = "Motorola Phone"
    return "Motorola Phone"
    if (/Huawei|Honor/i.test(fullContext)) _cachedDetectDevice = "Huawei Phone"
    return "Huawei Phone"
    if (/Nokia/i.test(fullContext)) _cachedDetectDevice = "Nokia Phone"
    return "Nokia Phone"
    if (/LG/i.test(fullContext)) _cachedDetectDevice = "LG Phone"
    return "LG Phone"
    _cachedDetectDevice = "Android Phone"
    return "Android Phone"
  }

  if (/Macintosh|Mac OS X|MacIntel/i.test(fullContext)) _cachedDetectDevice = "Apple MacBook"
    return "Apple MacBook"
  if (/Lenovo|ThinkPad|IdeaPad|Yoga|Legion/i.test(fullContext)) _cachedDetectDevice = "Lenovo Laptop"
    return "Lenovo Laptop"
  if (/HP|Hewlett-Packard|Pavilion|EliteBook|ProBook|Envy|Spectre|OMEN/i.test(fullContext)) {
    _cachedDetectDevice = "HP Laptop"
    return "HP Laptop"
  }
  if (/Dell|Inspiron|Latitude|XPS|Alienware|Vostro/i.test(fullContext)) {
    _cachedDetectDevice = "Dell Laptop"
    return "Dell Laptop"
  }
  if (/Asus|ROG|ZenBook|VivoBook/i.test(fullContext)) {
    _cachedDetectDevice = "Asus Laptop"
    return "Asus Laptop"
  }
  if (/Acer|Predator|Aspire|Swift|Nitro/i.test(fullContext)) {
    _cachedDetectDevice = "Acer Laptop"
    return "Acer Laptop"
  }
  if (/MSI/i.test(fullContext)) {
    _cachedDetectDevice = "MSI Laptop"
    return "MSI Laptop"
  }
  if (/Surface/i.test(fullContext)) {
    _cachedDetectDevice = "Microsoft Surface"
    return "Microsoft Surface"
  }
  if (/Samsung/i.test(fullContext)) {
    _cachedDetectDevice = "Samsung Galaxy Book"
    return "Samsung Galaxy Book"
  }

  if (/Windows|Win32|Win64/i.test(fullContext)) {
    _cachedDetectDevice = "Lenovo Laptop"
    return "Lenovo Laptop"
  }

  if (/Linux/i.test(fullContext)) {
    _cachedDetectDevice = "Linux Workstation"
    return "Linux Workstation"
  }
  if (/CrOS/i.test(fullContext)) {
    _cachedDetectDevice = "Chromebook"
    return "Chromebook"
  }

  _cachedDetectDevice = "Lenovo Laptop"
  return "Lenovo Laptop"
}

export function formatTimeOnly(isoStr?: string): string {
  if (!isoStr) return "—"
  if (isoStr === "Active" || isoStr === "Session Expired" || isoStr === "—") return isoStr
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  } catch {
    return isoStr
  }
}

export function formatDuration(startDate: Date, endDate: Date): string {
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return "—"
  let diffMs = Math.max(0, endDate.getTime() - startDate.getTime())
  let totalSeconds = Math.floor(diffMs / 1000)
  let seconds = totalSeconds % 60
  let minutes = Math.floor((totalSeconds / 60) % 60)
  let hours = Math.floor(totalSeconds / 3600)

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(" ")
}

const STORAGE_KEY = "hospai_audit_logs_v1"

export class AuditDatabase {
  private static _cachedLogs: AuditLog[] | null = null

  static invalidateCache(): void {
    this._cachedLogs = null
  }
  static getRawLogs(): AuditLog[] {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      } catch {
        // Fall through to default seed
      }
    }

    const defaultLogs: AuditLog[] = [
      {
        id: "AUD_" + Date.now() + "_101",
        userId: "ADM-001",
        username: "admin",
        action: "Login Successful",
        module: "Authentication",
        description: "Administrator signed into HMS Portal with MFA authentication.",
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        status: "Success",
        device: detectDevice(),
        loginTime: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        logoutTime: "Active",
        duration: "30m 00s",
      },
      {
        id: "AUD_" + (Date.now() - 1800000) + "_102",
        userId: "DOC-003",
        username: "dr.anita",
        action: "Prescription Created",
        module: "Doctor Workspace",
        description: "Prescription dispatched for patient OP consultation #OP-8821.",
        timestamp: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
        status: "Success",
        device: "Apple iPad Pro",
        loginTime: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        logoutTime: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        duration: "1h 15m 00s",
      },
      {
        id: "AUD_" + (Date.now() - 3600000) + "_103",
        userId: "NUR-012",
        username: "nurse_station1",
        action: "Vitals Recorded",
        module: "OP Department",
        description: "Patient vitals captured (BP 120/80 mmHg, SpO2 98%, Temp 98.6F).",
        timestamp: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
        status: "Success",
        device: "Windows Workstation",
        loginTime: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
        logoutTime: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        duration: "2h 30m 00s",
      },
      {
        id: "AUD_" + (Date.now() - 7200000) + "_104",
        userId: "REC-001",
        username: "reception_desk",
        action: "Patient Registered",
        module: "Reception",
        description: "New OPD Patient Registration completed for #PAT-9082.",
        timestamp: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
        status: "Success",
        device: "Dell Desktop PC",
        loginTime: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
        logoutTime: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        duration: "3h 00m 00s",
      },
      {
        id: "AUD_" + (Date.now() - 10800000) + "_105",
        userId: "DOC-005",
        username: "dr.v Sharma",
        action: "Login Successful",
        module: "Authentication",
        description: "Physician logged in to review ICU flowsheets.",
        timestamp: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
        status: "Success",
        device: "Apple MacBook Pro",
        loginTime: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
        logoutTime: new Date(Date.now() - 1000 * 60 * 275).toISOString(),
        duration: "45m 00s",
      },
      {
        id: "AUD_" + (Date.now() - 14400000) + "_106",
        userId: "ADM-001",
        username: "admin",
        action: "Security Matrix Sync",
        module: "Administration",
        description: "Updated system module permissions and RBAC matrix for staff accounts.",
        timestamp: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
        status: "Success",
        device: detectDevice(),
        loginTime: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
        logoutTime: "Session Expired",
        duration: "8h 00m 00s",
      },
    ]

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultLogs))
    } catch {}

    return defaultLogs
  }

  static getLogs(): AuditLog[] {
    const rawLogs = this.getRawLogs()
    let currentUsername = ""
    try {
      const curData = localStorage.getItem("hospai_current_user")
      if (curData) {
        const u = JSON.parse(curData)
        if (u && u.user) currentUsername = u.user
      }
    } catch {
      // Ignore
    }

    const now = new Date()
    const currentDetected = detectDevice()
    let updatedStorageNeeded = false

    const processedLogs = rawLogs.map((log) => {
      let device = log.device
      if (!device || device === "Windows PC" || device === "Desktop Web Browser") {
        device = currentDetected
        log.device = currentDetected
        updatedStorageNeeded = true
      }

      const isLoginSession =
        log.action.toLowerCase().includes("login") ||
        log.module === "Authentication"

      const loginTimeIso = log.loginTime || log.timestamp
      const loginDate = new Date(loginTimeIso)
      const isFailed = log.status === "Failed" || log.action.toLowerCase().includes("failed")

      if (isFailed) {
        return {
          ...log,
          device,
          loginTime: formatTimeOnly(loginTimeIso),
          logoutTime: "—",
          duration: "—",
        }
      }

      let logoutTimeState = log.logoutTime || "Active"
      let calculatedDuration = log.duration

      if (!isLoginSession) {
        return {
          ...log,
          device: device || currentDetected,
          loginTime: formatTimeOnly(loginTimeIso),
          logoutTime: logoutTimeState === "Active" ? "—" : logoutTimeState,
          duration: calculatedDuration || "15m 00s",
        }
      }

      if (!logoutTimeState || logoutTimeState === "Active") {
        const diffMins = (now.getTime() - loginDate.getTime()) / (1000 * 60)
        const matchesUser =
          !currentUsername ||
          currentUsername.toLowerCase() === log.username.toLowerCase() ||
          log.userId === currentUsername

        if (matchesUser && diffMins < 480) {
          logoutTimeState = "Active"
          calculatedDuration = formatDuration(loginDate, now)
        } else {
          logoutTimeState = "Session Expired"
          const expiryDate = new Date(loginDate.getTime() + Math.min(diffMins, 480) * 60 * 1000)
          calculatedDuration = formatDuration(loginDate, expiryDate)
        }
      } else if (logoutTimeState !== "Session Expired" && logoutTimeState !== "—") {
        const logoutDate = new Date(logoutTimeState)
        if (!isNaN(logoutDate.getTime())) {
          calculatedDuration = formatDuration(loginDate, logoutDate)
          logoutTimeState = formatTimeOnly(logoutTimeState)
        }
      }

      return {
        ...log,
        device,
        loginTime: formatTimeOnly(loginTimeIso),
        logoutTime: logoutTimeState,
        duration: calculatedDuration || "0s",
      }
    })

    if (updatedStorageNeeded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rawLogs))
      } catch {
        // Ignore
      }
    }

    return processedLogs
  }

  static recordLogout(username: string) {
    const logs = this.getRawLogs()
    const nowIso = new Date().toISOString()
    let updated = false

    for (const log of logs) {
      const isLogin = log.action === "Login Successful" || (log.module === "Authentication" && log.status === "Success")
      const isUserMatch =
        !username ||
        log.username.toLowerCase() === username.toLowerCase() ||
        log.userId === username ||
        username === "System" ||
        username === "Hospital Administrator"

      if (isLogin && isUserMatch && (!log.logoutTime || log.logoutTime === "Active")) {
        const loginDate = new Date(log.loginTime || log.timestamp)
        log.logoutTime = nowIso
        log.duration = formatDuration(loginDate, new Date(nowIso))
        updated = true
        break
      }
    }

    if (!updated) {
      for (const log of logs) {
        const isLogin = log.action === "Login Successful" || (log.module === "Authentication" && log.status === "Success")
        if (isLogin && (!log.logoutTime || log.logoutTime === "Active")) {
          const loginDate = new Date(log.loginTime || log.timestamp)
          log.logoutTime = nowIso
          log.duration = formatDuration(loginDate, new Date(nowIso))
          updated = true
          break
        }
      }
    }

    if (updated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
      } catch (err) {
        console.warn("AuditDatabase: Unable to update logout in localStorage", err)
      }
    }
  }

  static logEvent(
    action: string,
    module: string,
    description: string,
    status: "Success" | "Failed",
    userId: string = "system",
    username: string = "System",
    device?: string,
  ) {
    if (action === "Logout" || action.toLowerCase().includes("logout")) {
      this.recordLogout(username !== "System" ? username : userId)
      return
    }

    const logs = this.getRawLogs()
    let finalUserId = userId
    let finalUsername = username

    if (finalUserId === "system") {
      try {
        const currentUserData = localStorage.getItem("hospai_current_user")
        if (currentUserData) {
          const u = JSON.parse(currentUserData)
          if (u && u.staffId) {
            finalUserId = u.staffId
            finalUsername = u.user
          }
        }
      } catch (e) {
        // Ignore
      }
    }

    const isLoginRelated = action.toLowerCase().includes("login") || module === "Authentication"
    const nowIso = new Date().toISOString()

    const entry: AuditLog = {
      id: "AUD_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      userId: finalUserId,
      username: finalUsername,
      action,
      module,
      description,
      timestamp: nowIso,
      status,
      device: device || detectDevice(),
      loginTime: nowIso,
      logoutTime: isLoginRelated ? (status === "Success" ? "Active" : "—") : "—",
      duration: isLoginRelated ? (status === "Success" ? "0s" : "—") : "5m 00s",
    }

    try {
      logs.unshift(entry)
      if (logs.length > 30) {
        logs.splice(30)
      }
      safeLocalStorageSetItem(STORAGE_KEY, JSON.stringify(logs))
    } catch (e) {
      console.warn("AuditDatabase: Unable to persist log to localStorage, trimming to 10", e)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 10)))
      } catch {
        try { localStorage.removeItem(STORAGE_KEY) } catch {}
      }
    }
  }
}
