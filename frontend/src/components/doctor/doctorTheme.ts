/**
 * Colours for the doctor screens -- the administrator's Doctors overview and
 * each doctor's own workspace share them, so a colour means the same thing on
 * both: a specialty's hue for the doctor, a stage's hue for where a patient is.
 *
 * Values are hex (applied with inline styles) because they are chosen at
 * runtime from the doctor's specialty; Tailwind only ships classes it can see.
 */

export interface Hue {
  /** Solid accent: borders, active tabs, dots. */
  solid: string
  /** Gradient stops for bands and avatars. */
  from: string
  to: string
  /** Tinted background and its border. */
  soft: string
  border: string
  /** Text on the tinted background. */
  text: string
}

const HUES: Record<string, Hue> = {
  rose: { solid: "#9F1239", from: "#BE123C", to: "#881337", soft: "#FFF1F2", border: "#FCE7F3", text: "#9F1239" },
  amber: { solid: "#B45309", from: "#D97706", to: "#92400E", soft: "#FFFBEB", border: "#FEF3C7", text: "#92400E" },
  violet: { solid: "#6D28D9", from: "#7C3AED", to: "#5B21B6", soft: "#F5F3FF", border: "#EDE9FE", text: "#6D28D9" },
  red: { solid: "#B91C1C", from: "#DC2626", to: "#991B1B", soft: "#FEF2F2", border: "#FEE2E2", text: "#B91C1C" },
  blue: { solid: "#1D4ED8", from: "#2563EB", to: "#1E40AF", soft: "#EFF6FF", border: "#DBEAFE", text: "#1D4ED8" },
  pink: { solid: "#BE185D", from: "#DB2777", to: "#9D174D", soft: "#FDF2F8", border: "#FCE7F3", text: "#9D174D" },
  teal: { solid: "#0F766E", from: "#0D9488", to: "#115E59", soft: "#F0FDFA", border: "#CCFBF1", text: "#0F766E" },
  sky: { solid: "#0369A1", from: "#0284C7", to: "#075985", soft: "#F0F9FF", border: "#E0F2FE", text: "#0369A1" },
  fuchsia: { solid: "#A21CAF", from: "#C026D3", to: "#86198F", soft: "#FDF4FF", border: "#FAE8FF", text: "#86198F" },
  orange: { solid: "#C2410C", from: "#EA580C", to: "#9A3412", soft: "#FFF7ED", border: "#FFEDD5", text: "#9A3412" },
  cyan: { solid: "#0E7490", from: "#0891B2", to: "#155E75", soft: "#ECFEFF", border: "#CFFAFE", text: "#0E7490" },
  indigo: { solid: "#4338CA", from: "#4F46E5", to: "#3730A3", soft: "#EEF2FF", border: "#E0E7FF", text: "#4338CA" },
  emerald: { solid: "#047857", from: "#059669", to: "#065F46", soft: "#ECFDF5", border: "#D1FAE5", text: "#047857" },
  green: { solid: "#15803D", from: "#16A34A", to: "#166534", soft: "#F0FDF4", border: "#DCFCE7", text: "#15803D" },
  purple: { solid: "#7E22CE", from: "#9333EA", to: "#6B21A8", soft: "#FAF5FF", border: "#F3E8FF", text: "#6B21A8" },
  slate: { solid: "#475569", from: "#64748B", to: "#1E293B", soft: "#F8FAFC", border: "#E2E8F0", text: "#334155" },
}

const SPECIALTY_RULES: [RegExp, keyof typeof HUES][] = [
  [/cardio|heart/i, "rose"],
  [/ortho|trauma|spine|joint/i, "amber"],
  [/neuro/i, "violet"],
  [/emergency|critical|casualty|icu/i, "red"],
  [/pediatric|paediatric|child|neonat/i, "pink"],
  [/gastro|hepat|liver/i, "teal"],
  [/pulmo|chest|respir/i, "sky"],
  [/gyn|obst|women/i, "fuchsia"],
  [/derma|skin/i, "orange"],
  [/\bent\b|otolaryn|ear/i, "cyan"],
  [/urolog/i, "indigo"],
  [/nephro|kidney/i, "emerald"],
  [/onco|cancer/i, "purple"],
  [/surgery|surgical/i, "green"],
  [/endocrin|diabet/i, "orange"],
  [/radiolog|imaging/i, "slate"],
  [/medicine|internal|physician|general/i, "blue"],
]

const FALLBACK: (keyof typeof HUES)[] = ["blue", "teal", "violet", "amber", "sky", "rose", "emerald", "indigo"]

/** The colour a specialty is drawn in -- stable for a given name. */
export function specialtyHue(specialty?: string | null): Hue {
  const s = (specialty || "").trim()
  for (const [re, hue] of SPECIALTY_RULES) if (re.test(s)) return HUES[hue]
  if (!s) return HUES.slate
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return HUES[FALLBACK[h % FALLBACK.length]]
}

/** Where a patient is in the visit -- one colour per stage, on every doctor screen. */
export const STAGE_HUES = {
  Registered: HUES.slate,
  "With nurse": HUES.amber,
  Waiting: HUES.orange,
  "In consultation": HUES.blue,
  "After consultation": HUES.violet,
  Completed: HUES.green,
} as const

export const TONE = HUES

export const gradient = (h: Hue, angle = 135) => `linear-gradient(${angle}deg, ${h.from}, ${h.to})`

/**
 * A header band: calm executive slate base with an elegant soft specialty accent,
 * eliminating harsh bright glare while ensuring optimal contrast.
 */
export const band = (h: Hue, angle = 135) =>
  `linear-gradient(${angle}deg, #1E293B 0%, #29384E 75%, ${h.solid} 160%)`
