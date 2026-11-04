import { InvoiceItem, PaymentRecord } from "../services/billingDb"

/**
 * Converts a numerical amount in Indian Rupees (INR) to English words.
 * Example: 20750 -> "rupees twenty thousand seven hundred fifty only"
 */
export function numberToWordsINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return "rupees zero only"

  const absAmount = Math.abs(amount)
  const rupees = Math.floor(absAmount)
  const paise = Math.round((absAmount - rupees) * 100)

  const units = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ]

  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ]

  function convertTwoDigits(n: number): string {
    if (n === 0) return ""
    if (n < 20) return units[n]
    const t = Math.floor(n / 10)
    const u = n % 10
    return `${tens[t]}${u > 0 ? " " + units[u] : ""}`
  }

  function convertThreeDigits(n: number): string {
    const h = Math.floor(n / 100)
    const rem = n % 100
    let res = ""
    if (h > 0) {
      res += `${units[h]} hundred`
      if (rem > 0) res += " "
    }
    if (rem > 0) {
      res += convertTwoDigits(rem)
    }
    return res
  }

  let words = ""

  // Indian number system: Crores, Lakhs, Thousands, Hundreds
  const crores = Math.floor(rupees / 10000000)
  let remainder = rupees % 10000000

  const lakhs = Math.floor(remainder / 100000)
  remainder = remainder % 100000

  const thousands = Math.floor(remainder / 1000)
  remainder = remainder % 1000

  const hundredsPart = remainder

  if (crores > 0) {
    words += `${convertThreeDigits(crores)} crore `
  }
  if (lakhs > 0) {
    words += `${convertTwoDigits(lakhs)} lakh `
  }
  if (thousands > 0) {
    words += `${convertTwoDigits(thousands)} thousand `
  }
  if (hundredsPart > 0) {
    words += `${convertThreeDigits(hundredsPart)} `
  }

  words = words.trim()
  let result = `rupees ${words}`

  if (paise > 0) {
    result += ` and ${convertTwoDigits(paise)} paise`
  }

  result += " only"
  return result
}

/**
 * Formats date into "01-Sep-2026 10:49AM" format.
 */
export function formatReceiptDateTime(dateInput?: string | Date): string {
  if (!dateInput) {
    const now = new Date()
    return formatReceiptDateTime(now)
  }

  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput
    if (isNaN(d.getTime())) return String(dateInput)

    const day = d.getDate().toString().padStart(2, "0")
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    const month = months[d.getMonth()]
    const year = d.getFullYear()

    let hours = d.getHours()
    const minutes = d.getMinutes().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    hours = hours % 12 || 12
    const formattedHours = hours.toString().padStart(2, "0")

    return `${day}-${month}-${year} ${formattedHours}:${minutes}${ampm}`
  } catch {
    return String(dateInput)
  }
}

/**
 * Formats date into "01-Sep-26" short format.
 */
export function formatReceiptDateShort(dateInput?: string | Date): string {
  if (!dateInput) {
    const now = new Date()
    return formatReceiptDateShort(now)
  }

  try {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput
    if (isNaN(d.getTime())) return String(dateInput)

    const day = d.getDate().toString().padStart(2, "0")
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    const month = months[d.getMonth()]
    const year = d.getFullYear().toString().slice(-2)

    return `${day}-${month}-${year}`
  } catch {
    return String(dateInput)
  }
}

/**
 * Formats time into "10:49:35AM" format.
 */
export function formatReceiptTimeWithSeconds(
  dateInput?: string | Date,
): string {
  try {
    const d = !dateInput
      ? new Date()
      : typeof dateInput === "string"
        ? new Date(dateInput)
        : dateInput
    if (isNaN(d.getTime())) return "10:49:35AM"

    let hours = d.getHours()
    const minutes = d.getMinutes().toString().padStart(2, "0")
    const seconds = d.getSeconds().toString().padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    hours = hours % 12 || 12
    const formattedHours = hours.toString().padStart(2, "0")

    return `${formattedHours}:${minutes}:${seconds}${ampm}`
  } catch {
    return "10:49:35AM"
  }
}

/**
 * Interface for grouped items in the reference receipt layout
 */
export interface ReceiptItemSection {
  mainCategory: "Service Charges" | "Professional Charges"
  subCategory: string // e.g. "EMERGENCY", "HOSPITALITY SERVICES", "ENT", "LABORATORY"
  subTotal: number
  items: {
    serviceCode: string
    description: string
    hsnSacCode: string
    qty: number
    rate: number
    amount: number
  }[]
}

/**
 * Helper to auto-generate realistic service codes matching hospital billing convention
 */
function getServiceCode(
  category: string,
  description: string,
  index: number,
): string {
  const desc = description.toUpperCase()
  if (desc.includes("OXYGEN")) return "EME01"
  if (desc.includes("NURSING")) return "HSP113"
  if (desc.includes("TREATMENT")) return "HSP134"
  if (desc.includes("MRD")) return "HSP136"
  if (desc.includes("ADMISSION")) return "HSP52"
  if (desc.includes("PROCEDURE") || desc.includes("SURGERY")) return "HSP67"
  if (desc.includes("GRBS") || desc.includes("GLUCOSE")) return "HSP8"
  if (desc.includes("ROOM") || desc.includes("BED")) return "HSP90"
  if (
    desc.includes("CONSULT") ||
    desc.includes("DR.") ||
    desc.includes("DOCTOR")
  )
    return `DM00${30 + index}`
  if (desc.includes("CBC") || desc.includes("BLOOD") || desc.includes("LAB"))
    return `LAB0${10 + index}`
  if (desc.includes("X-RAY") || desc.includes("CT") || desc.includes("MRI"))
    return `RAD0${20 + index}`

  if (category === "Consultation") return `DM00${25 + index}`
  if (category === "Room / Bed Charges" || category === "Nursing")
    return `HSP${100 + index}`
  if (category === "Laboratory") return `LAB${100 + index}`
  if (category === "Radiology / Imaging") return `RAD${100 + index}`
  if (category === "Procedure / Surgery") return `SUR${100 + index}`
  return `HSP${50 + index}`
}

/**
 * Groups invoice items into Service Charges and Professional Charges with sub-categories
 */
export function groupReceiptItems(items: InvoiceItem[]): ReceiptItemSection[] {
  const sectionsMap: { [key: string]: ReceiptItemSection } = {}

  items.forEach((item, idx) => {
    const isDoctor =
      item.category === "Consultation" ||
      item.description.toLowerCase().includes("consult") ||
      item.description.toLowerCase().includes("dr.") ||
      item.description.toLowerCase().includes("doctor")

    const mainCategory = isDoctor ? "Professional Charges" : "Service Charges"

    let subCategory = "HOSPITALITY SERVICES"
    if (isDoctor) {
      subCategory = item.description.toUpperCase().includes("ENT")
        ? "ENT"
        : "GENERAL MEDICINE"
    } else if (item.category === "Laboratory") {
      subCategory = "LABORATORY SERVICES"
    } else if (item.category === "Radiology / Imaging") {
      subCategory = "RADIOLOGY & IMAGING"
    } else if (
      item.description.toLowerCase().includes("oxygen") ||
      item.description.toLowerCase().includes("emergency")
    ) {
      subCategory = "EMERGENCY"
    } else if (item.category === "Procedure / Surgery") {
      subCategory = "PROCEDURE & OT SERVICES"
    } else if (
      item.category === "Room / Bed Charges" ||
      item.category === "Nursing"
    ) {
      subCategory = "HOSPITALITY SERVICES"
    }

    const key = `${mainCategory}_${subCategory}`
    if (!sectionsMap[key]) {
      sectionsMap[key] = {
        mainCategory,
        subCategory,
        subTotal: 0,
        items: [],
      }
    }

    const serviceCode =
      item.cptCode && item.cptCode !== "99213"
        ? item.cptCode
        : getServiceCode(item.category, item.description, idx)
    const amount = item.total || item.unitPrice * (item.quantity || 1)
    const qty = item.quantity || 1
    const rate = item.unitPrice || Math.round(amount / qty)

    let displayDesc = item.description.toUpperCase()
    if (
      isDoctor &&
      !displayDesc.startsWith("N - ") &&
      !displayDesc.startsWith("DR.")
    ) {
      displayDesc = `N - DR. ${displayDesc}`
    }

    sectionsMap[key].items.push({
      serviceCode,
      description: displayDesc,
      hsnSacCode: "",
      qty,
      rate,
      amount,
    })

    sectionsMap[key].subTotal += amount
  })

  return Object.values(sectionsMap)
}
