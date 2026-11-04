const IST_TIMEZONE = "Asia/Kolkata"

function parseTimestamp(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(" ", "T")
  const hasOffset = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized)
  const parsed = new Date(hasOffset ? normalized : `${normalized}Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function formatDateTimeIST(value?: string | null): string {
  if (!value) return "-"
  const parsed = parseTimestamp(value)
  if (!parsed) return value
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(parsed)
  return `${formatted} IST`
}

export function formatDate(value?: string | null): string {
  if (!value) return "-"
  return new Date(value).toLocaleDateString()
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}
