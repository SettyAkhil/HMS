/**
 * Browser LocalStorage Quota Manager & Safe Storage Adapter
 *
 * Prevents and recovers from QuotaExceededError (DOMException 22) by:
 * 1. Pruning stale/redundant ICU flowsheets (e.g. duplicate name-keyed flowsheets)
 * 2. Compacting bloated audit logs (keeping newest 50 entries)
 * 3. Pruning large embedded base64 assets from historical templates
 * 4. Safe retry mechanism for persistent application databases
 */

export function freeLocalStorageQuota(): number {
  if (typeof window === "undefined" || !window.localStorage) return 0
  let freedCount = 0

  try {
    const keysToRemove: string[] = []
    const todayStr = new Date().toISOString().slice(0, 10)

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue

      // 1. Remove duplicate name-keyed ICU flowsheets (e.g., 'icu.flowsheet.Deepak Patel...')
      if (key.startsWith("icu.flowsheet.") && !/^icu\.flowsheet\.\d+\./.test(key)) {
        keysToRemove.push(key)
        continue
      }

      // 2. Remove ICU flowsheets older than 2 days to reclaim megabytes of JSON data
      if (key.startsWith("icu.flowsheet.")) {
        const parts = key.split(".")
        const dateStr = parts[parts.length - 1]
        if (dateStr && dateStr.length === 10 && dateStr < todayStr) {
          const ageDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
          if (ageDays > 2) {
            keysToRemove.push(key)
          }
        }
      }
    }

    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k)
        freedCount++
      } catch {}
    })

    // 3. Compact audit logs
    try {
      const rawAudit = localStorage.getItem("hospai_audit_logs_v1")
      if (rawAudit) {
        const logs = JSON.parse(rawAudit)
        if (Array.isArray(logs) && logs.length > 50) {
          localStorage.setItem("hospai_audit_logs_v1", JSON.stringify(logs.slice(0, 50)))
        }
      }
    } catch {}

    // 4. Compact templates with huge base64 data URLs
    try {
      const rawTpl = localStorage.getItem("hospai_rad_templates_v1")
      if (rawTpl) {
        const tpls = JSON.parse(rawTpl)
        if (Array.isArray(tpls)) {
          let modified = false
          const cleaned = tpls.map((t, idx, arr) => {
            const isLatest = idx === arr.length - 1
            if (!isLatest && t.originalFileDataUrl && t.originalFileDataUrl.length > 20000) {
              modified = true
              return { ...t, originalFileDataUrl: "", uploadedFileUrl: "" }
            }
            return t
          })
          if (modified) {
            localStorage.setItem("hospai_rad_templates_v1", JSON.stringify(cleaned))
          }
        }
      }
    } catch {}
  } catch (err) {
    console.warn("Storage quota cleanup warning:", err)
  }

  return freedCount
}

export function safeLocalStorageSetItem(key: string, value: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err: any) {
    const isQuota =
      err?.name === "QuotaExceededError" ||
      err?.code === 22 ||
      err?.code === 1014 ||
      err?.number === -2147024882 ||
      (err?.message && /quota/i.test(err.message))

    if (isQuota) {
      console.warn(`[StorageQuotaManager] Quota exceeded while saving "${key}". Reclaiming storage...`)
      freeLocalStorageQuota()
      try {
        localStorage.setItem(key, value)
        return true
      } catch (retryErr) {
        console.error(`[StorageQuotaManager] Critical: Unable to save "${key}" after storage cleanup`, retryErr)
        return false
      }
    }
    return false
  }
}

