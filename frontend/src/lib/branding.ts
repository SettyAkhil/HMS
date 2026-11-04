// Document branding: the hospital's own logo, the HospAI mark, and the
// "Powered by Kalpra Tech" line. One place, so the discharge summary, the
// clinical journey printout and every patient PDF carry the same identity --
// and a hospital changes its logo once, in Patient Messages → settings.

import { HOSPAI_MARK, HOSPAI_MARK_RATIO, KALPRA_MARK, KALPRA_MARK_RATIO } from "../assets/brandMarks"
import { getMessagingSettings } from "../services/patientMessaging"

export interface HospitalLogo {
  /** PNG data URL, already scaled down (see prepareHospitalLogo). */
  src: string
  /** width / height */
  ratio: number
}

export interface Branding {
  hospitalName: string
  helpline: string
  hospitalLogo: HospitalLogo | null
  hospaiMark: string
  hospaiMarkRatio: number
  kalpraMark: string
  kalpraMarkRatio: number
}

const LOGO_KEY = "hospai_hospital_logo_v1"
/** Fired on this window when the logo changes; other tabs get the storage event. */
export const BRANDING_EVENT = "hospai:branding-changed"

export const BRAND_COLORS = {
  hospaiRed: "#E11D2E",
  kalpraRed: "#B02030",
  kalpraNavy: "#383868",
} as const

export function getHospitalLogo(): HospitalLogo | null {
  try {
    const raw = localStorage.getItem(LOGO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HospitalLogo
    return parsed?.src?.startsWith("data:image/") && parsed.ratio > 0 ? parsed : null
  } catch {
    return null
  }
}

export function saveHospitalLogo(logo: HospitalLogo | null): void {
  try {
    if (logo) localStorage.setItem(LOGO_KEY, JSON.stringify(logo))
    else localStorage.removeItem(LOGO_KEY)
  } catch {
    throw new Error("The browser could not store the logo. Try a smaller image.")
  }
  window.dispatchEvent(new Event(BRANDING_EVENT))
}

/**
 * Reads an uploaded image and scales it to fit 600 × 240 px as a PNG, so a
 * phone photo of a letterhead does not fill localStorage or bloat every PDF.
 */
export function prepareHospitalLogo(file: File): Promise<HospitalLogo> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml|gif)$/.test(file.type)) {
      reject(new Error("Choose a PNG, JPG, WebP, SVG or GIF image."))
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("That image is over 8 MB. Choose a smaller file."))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const w = img.naturalWidth || 600
      const h = img.naturalHeight || 240
      const scale = Math.min(1, 600 / w, 240 / h)
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(w * scale))
      canvas.height = Math.max(1, Math.round(h * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("This browser cannot process images."))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ src: canvas.toDataURL("image/png"), ratio: canvas.width / canvas.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file could not be read as an image."))
    }
    img.src = url
  })
}

export function getBranding(): Branding {
  const s = getMessagingSettings()
  return {
    hospitalName: s.hospitalName,
    helpline: s.helpline,
    hospitalLogo: getHospitalLogo(),
    hospaiMark: HOSPAI_MARK,
    hospaiMarkRatio: HOSPAI_MARK_RATIO,
    kalpraMark: KALPRA_MARK,
    kalpraMarkRatio: KALPRA_MARK_RATIO,
  }
}

/** "Imperial Hospitals" -> "IH": stands in until the hospital uploads a logo. */
export function hospitalInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w))
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "H").slice(0, 2)).toUpperCase()
}
