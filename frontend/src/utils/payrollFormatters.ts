/**
 * Decimal-safe rounding and formatting utilities for Indian Payroll & Payslips
 */

export const round2 = (num: number): number => {
  if (isNaN(num)) return 0
  return Number(Math.round(Number(num + "e+2")) + "e-2")
}

const units = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
]

const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
]

function twoDigits(n: number): string {
  if (n <= 0) return ""
  if (n < 20) return units[n]
  const t = Math.floor(n / 10)
  const u = n % 10
  return u > 0 ? `${tens[t]}-${units[u]}` : tens[t]
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rem = n % 100
  let res = ""
  if (h > 0) res += `${units[h]} Hundred`
  if (rem > 0) res += (res ? " " : "") + twoDigits(rem)
  return res
}

function convertRupees(n: number): string {
  if (n === 0) return "Zero"

  const crores = Math.floor(n / 10000000)
  const remCrores = n % 10000000
  const lakhs = Math.floor(remCrores / 100000)
  const remLakhs = remCrores % 100000
  const thousands = Math.floor(remLakhs / 1000)
  const remThousands = remLakhs % 1000

  const parts: string[] = []
  if (crores > 0) {
    parts.push(`${convertRupees(crores)} Crore`)
  }
  if (lakhs > 0) {
    parts.push(`${twoDigits(lakhs)} Lakh`)
  }
  if (thousands > 0) {
    parts.push(`${twoDigits(thousands)} Thousand`)
  }
  if (remThousands > 0) {
    parts.push(threeDigits(remThousands))
  }

  return parts.join(" ")
}

/**
 * Converts INR numerical amount to formal English words with Rupees and Paise.
 * Example: 24677.42 -> "Rupees Twenty-Four Thousand Six Hundred Seventy-Seven and Forty-Two Paise Only"
 * Example: 30000.00 -> "Rupees Thirty Thousand Only"
 */
export function numberToWordsINR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return "Rupees Zero Only"
  }

  const safeNum = round2(Math.abs(amount))
  const totalPaise = Math.round(Number(Math.round(Number(safeNum + "e+2")) + "e-2") * 100)
  const rupees = Math.floor(totalPaise / 100)
  const paise = totalPaise % 100

  const rupeeStr = convertRupees(rupees)

  if (paise === 0) {
    return `Rupees ${rupeeStr} Only`
  }

  const paiseStr = twoDigits(paise)

  if (rupees === 0) {
    return `Rupees Zero and ${paiseStr} Paise Only`
  }

  return `Rupees ${rupeeStr} and ${paiseStr} Paise Only`
}

/**
 * Masks bank account number by default for confidentiality in UI and prints.
 * Format: ••••••••1001
 */
export function maskAccountNumber(acc?: string | null): string {
  if (!acc || typeof acc !== "string") return "••••••••1001"
  const clean = acc.trim()
  if (!clean) return "••••••••1001"
  if (clean.startsWith("•")) return clean
  const last4 = clean.slice(-4)
  return `••••••••${last4}`
}

/**
 * Masks PAN by default for confidentiality in UI and prints.
 * Format: •••••1234
 */
export function maskPanNumber(pan?: string | null): string {
  if (!pan || typeof pan !== "string") return "•••••1234"
  const clean = pan.trim()
  if (!clean) return "•••••1234"
  if (clean.startsWith("•")) return clean
  const last4 = clean.slice(-4)
  return `•••••${last4}`
}
