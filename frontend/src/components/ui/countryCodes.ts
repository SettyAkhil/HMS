export interface CountryCode {
  name: string
  dialCode: string
  code: string // ISO 2-letter
  flag: string
  digitsLength: number // Exact national number length (strictly enforced)
  formatGroup?: number[] // e.g. [5, 5] for India: 98765 43210, [3, 3, 4] for US: 234 567 8901
}

export const DEFAULT_COUNTRY_CODE = "+91" // India (+91) is default as requested

export const COUNTRY_CODES: CountryCode[] = [
  { name: "India", dialCode: "+91", code: "IN", flag: "🇮🇳", digitsLength: 10, formatGroup: [5, 5] },
  { name: "United States", dialCode: "+1", code: "US", flag: "🇺🇸", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "United Kingdom", dialCode: "+44", code: "GB", flag: "🇬🇧", digitsLength: 10, formatGroup: [4, 6] },
  { name: "United Arab Emirates", dialCode: "+971", code: "AE", flag: "🇦🇪", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Saudi Arabia", dialCode: "+966", code: "SA", flag: "🇸🇦", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Singapore", dialCode: "+65", code: "SG", flag: "🇸🇬", digitsLength: 8, formatGroup: [4, 4] },
  { name: "Australia", dialCode: "+61", code: "AU", flag: "🇦🇺", digitsLength: 9, formatGroup: [3, 3, 3] },
  { name: "Canada", dialCode: "+1", code: "CA", flag: "🇨🇦", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "Qatar", dialCode: "+974", code: "QA", flag: "🇶🇦", digitsLength: 8, formatGroup: [4, 4] },
  { name: "Kuwait", dialCode: "+965", code: "KW", flag: "🇰🇼", digitsLength: 8, formatGroup: [4, 4] },
  { name: "Oman", dialCode: "+968", code: "OM", flag: "🇴🇲", digitsLength: 8, formatGroup: [4, 4] },
  { name: "Bahrain", dialCode: "+973", code: "BH", flag: "🇧🇭", digitsLength: 8, formatGroup: [4, 4] },
  { name: "Malaysia", dialCode: "+60", code: "MY", flag: "🇲🇾", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "Germany", dialCode: "+49", code: "DE", flag: "🇩🇪", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "France", dialCode: "+33", code: "FR", flag: "🇫🇷", digitsLength: 9, formatGroup: [1, 2, 2, 2, 2] },
  { name: "Bangladesh", dialCode: "+880", code: "BD", flag: "🇧🇩", digitsLength: 10, formatGroup: [4, 6] },
  { name: "Nepal", dialCode: "+977", code: "NP", flag: "🇳🇵", digitsLength: 10, formatGroup: [5, 5] },
  { name: "Sri Lanka", dialCode: "+94", code: "LK", flag: "🇱🇰", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Pakistan", dialCode: "+92", code: "PK", flag: "🇵🇰", digitsLength: 10, formatGroup: [3, 7] },
  { name: "Philippines", dialCode: "+63", code: "PH", flag: "🇵🇭", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "Indonesia", dialCode: "+62", code: "ID", flag: "🇮🇩", digitsLength: 11, formatGroup: [3, 4, 4] },
  { name: "Thailand", dialCode: "+66", code: "TH", flag: "🇹🇭", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Japan", dialCode: "+81", code: "JP", flag: "🇯🇵", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "China", dialCode: "+86", code: "CN", flag: "🇨🇳", digitsLength: 11, formatGroup: [3, 4, 4] },
  { name: "South Africa", dialCode: "+27", code: "ZA", flag: "🇿🇦", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "New Zealand", dialCode: "+64", code: "NZ", flag: "🇳🇿", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Ireland", dialCode: "+353", code: "IE", flag: "🇮🇪", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Switzerland", dialCode: "+41", code: "CH", flag: "🇨🇭", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Italy", dialCode: "+39", code: "IT", flag: "🇮🇹", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "Spain", dialCode: "+34", code: "ES", flag: "🇪🇸", digitsLength: 9, formatGroup: [3, 3, 3] },
  { name: "Netherlands", dialCode: "+31", code: "NL", flag: "🇳🇱", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Sweden", dialCode: "+46", code: "SE", flag: "🇸🇪", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Norway", dialCode: "+47", code: "NO", flag: "🇳🇴", digitsLength: 8, formatGroup: [2, 2, 2, 2] },
  { name: "Denmark", dialCode: "+45", code: "DK", flag: "🇩🇰", digitsLength: 8, formatGroup: [2, 2, 2, 2] },
  { name: "Russia", dialCode: "+7", code: "RU", flag: "🇷🇺", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "Brazil", dialCode: "+55", code: "BR", flag: "🇧🇷", digitsLength: 11, formatGroup: [2, 5, 4] },
  { name: "Mexico", dialCode: "+52", code: "MX", flag: "🇲🇽", digitsLength: 10, formatGroup: [2, 4, 4] },
  { name: "Nigeria", dialCode: "+234", code: "NG", flag: "🇳🇬", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "Kenya", dialCode: "+254", code: "KE", flag: "🇰🇪", digitsLength: 9, formatGroup: [3, 3, 3] },
  { name: "Egypt", dialCode: "+20", code: "EG", flag: "🇪🇬", digitsLength: 10, formatGroup: [2, 4, 4] },
  { name: "South Korea", dialCode: "+82", code: "KR", flag: "🇰🇷", digitsLength: 10, formatGroup: [2, 4, 4] },
  { name: "Hong Kong", dialCode: "+852", code: "HK", flag: "🇭🇰", digitsLength: 8, formatGroup: [4, 4] },
  { name: "Turkey", dialCode: "+90", code: "TR", flag: "🇹🇷", digitsLength: 10, formatGroup: [3, 3, 4] },
  { name: "Israel", dialCode: "+972", code: "IL", flag: "🇮🇱", digitsLength: 9, formatGroup: [2, 3, 4] },
  { name: "Vietnam", dialCode: "+84", code: "VN", flag: "🇻🇳", digitsLength: 10, formatGroup: [3, 3, 4] }
]

/**
 * Splits an arbitrary phone string into country dialCode and national number.
 * If no known country dialCode is detected, defaults to India (+91).
 */
export function splitPhoneNumber(
  fullPhone: string | undefined | null,
  fallbackCode: string = DEFAULT_COUNTRY_CODE
): { countryCode: string; nationalNumber: string } {
  if (!fullPhone) {
    return { countryCode: fallbackCode, nationalNumber: "" }
  }

  const trimmed = fullPhone.trim()

  // If starts with +, try matching against known dialCodes (longest match first)
  if (trimmed.startsWith("+")) {
    // Sort dial codes descending by length to match e.g. +971 before +9
    const sortedCodes = [...COUNTRY_CODES].sort(
      (a, b) => b.dialCode.length - a.dialCode.length
    )
    for (const c of sortedCodes) {
      if (trimmed.startsWith(c.dialCode)) {
        const national = trimmed.slice(c.dialCode.length).trim()
        return { countryCode: c.dialCode, nationalNumber: national }
      }
    }
    // Fallback: extract up to first space or 4 characters as country code
    const parts = trimmed.split(" ")
    if (parts.length > 1) {
      return { countryCode: parts[0], nationalNumber: parts.slice(1).join(" ") }
    }
  }

  // If no + prefix, assume it is national number with default country code
  return { countryCode: fallbackCode, nationalNumber: trimmed }
}

/**
 * Formats country dialCode and national number into a clean standardized string.
 */
export function combinePhoneNumber(
  countryCode: string,
  nationalNumber: string
): string {
  const cleanNational = nationalNumber.trim()
  if (!cleanNational) return ""
  const code = countryCode.trim() || DEFAULT_COUNTRY_CODE
  return `${code} ${cleanNational}`
}

/**
 * Formats raw national digits according to country group pattern (e.g. 5-5 for India, 3-3-4 for US).
 */
export function formatNationalDigits(digits: string, country: CountryCode): string {
  if (!digits) return ""
  const group = country.formatGroup || [5, 5]
  const parts: string[] = []
  let offset = 0
  for (const len of group) {
    if (offset >= digits.length) break
    parts.push(digits.slice(offset, offset + len))
    offset += len
  }
  if (offset < digits.length) {
    parts.push(digits.slice(offset))
  }
  return parts.join(" ")
}

export interface PhoneValidationResult {
  isValid: boolean
  cleanDigits: string
  expectedLength: number
  countryCode: string
  countryName: string
  error?: string
}

/**
 * Validates a phone string strictly against the country's national length.
 */
export function validatePhoneNumber(
  fullPhone: string | undefined | null,
  fallbackCode: string = DEFAULT_COUNTRY_CODE
): PhoneValidationResult {
  if (!fullPhone || !fullPhone.trim()) {
    return {
      isValid: false,
      cleanDigits: "",
      expectedLength: 10,
      countryCode: fallbackCode,
      countryName: "India",
      error: "Phone number is required",
    }
  }

  const { countryCode, nationalNumber } = splitPhoneNumber(fullPhone, fallbackCode)
  const country =
    COUNTRY_CODES.find((c) => c.dialCode === countryCode) ||
    COUNTRY_CODES.find((c) => c.dialCode === DEFAULT_COUNTRY_CODE) ||
    COUNTRY_CODES[0]

  const cleanDigits = nationalNumber.replace(/\D/g, "")
  const expectedLength = country.digitsLength

  if (cleanDigits.length === 0) {
    return {
      isValid: false,
      cleanDigits: "",
      expectedLength,
      countryCode,
      countryName: country.name,
      error: "Please enter a valid phone number",
    }
  }

  if (cleanDigits.length < expectedLength) {
    return {
      isValid: false,
      cleanDigits,
      expectedLength,
      countryCode,
      countryName: country.name,
      error: `${country.name} phone number must be ${expectedLength} digits (entered ${cleanDigits.length})`,
    }
  }

  if (cleanDigits.length > expectedLength) {
    return {
      isValid: false,
      cleanDigits,
      expectedLength,
      countryCode,
      countryName: country.name,
      error: `${country.name} phone number cannot exceed ${expectedLength} digits`,
    }
  }

  return {
    isValid: true,
    cleanDigits,
    expectedLength,
    countryCode,
    countryName: country.name,
  }
}

