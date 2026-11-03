/**
 * Utility to classify clinical tests as Radiology vs Laboratory,
 * determine imaging modalities, default rooms, and prices.
 */
import { priceForTest } from "../services/labOrdersDb"

export function isRadiologyTest(testName: string, category?: string): boolean {
  if (category) {
    const c = category.trim().toUpperCase()
    if (
      c.includes("RADIOLOGY") ||
      c.includes("IMAGING") ||
      c === "XR" ||
      c === "CT" ||
      c === "MR" ||
      c === "US" ||
      c === "NM"
    ) {
      return true
    }
  }

  const name = (testName || "").toLowerCase().trim()
  if (!name) return false

  const keywords = [
    "x-ray", "xray", "x ray", "radiograph", "radiography",
    "ct scan", "ct head", "ct chest", "ct abdomen", "ct spine", "ct pelvis", "ct angiogram", "ct-", "hrct",
    "mri", "magnetic resonance", "mrcp", "mra", "mrv",
    "ultrasound", "usg", "sonogram", "sonography",
    "echocardiogram", "2d echo", "echo ",
    "doppler", "dvt",
    "mammogram", "mammography", "tomosynthesis",
    "pet scan", "pet-ct", "scintigraphy", "nuclear medicine", "spect",
    "dexa", "bmd", "bone mineral density",
    "fluoroscopy", "barium", "ivp", "ivu", "hsg", "mcu", "vcug", "rgu", "fistulograph", "sinograph",
    "dental", "iopa", "bitewing", "occlusal", "opg", "cephalogram", "cbct",
    "image-guided", "guided biopsy", "guided aspiration", "guided drainage"
  ]

  if (name.startsWith("ct ") || name.startsWith("ct-") || name.endsWith(" ct") || name.includes(" ct ") || name.includes("ct scan")) {
    return true
  }

  return keywords.some((kw) => name.includes(kw))
}

export function getModalityForTest(testName: string): "XR" | "CT" | "MR" | "US" | "NM" {
  const name = (testName || "").toLowerCase().trim()
  if (name.includes("mri") || name.includes("magnetic")) return "MR"
  if (
    name.includes("ct scan") ||
    name.includes("computed tomography") ||
    name.startsWith("ct ") ||
    name.startsWith("ct-") ||
    name.endsWith(" ct") ||
    name.includes(" ct ") ||
    name.includes("hrct") ||
    /\bct\b/i.test(name)
  ) {
    return "CT"
  }
  if (
    name.includes("ultrasound") ||
    name.includes("usg") ||
    name.includes("echo") ||
    name.includes("doppler") ||
    name.includes("sonogram") ||
    name.includes("sonograph")
  ) {
    return "US"
  }
  if (name.includes("pet") || name.includes("nuclear") || name.includes("spect")) return "NM"
  if (name.includes("mammogram") || name.includes("mammograph")) return "XR"
  return "XR"
}

export function getRoomForModality(modality: "XR" | "CT" | "MR" | "US" | "NM"): string {
  switch (modality) {
    case "CT": return "CT-1"
    case "MR": return "MR-1"
    case "US": return "US-1"
    case "NM": return "NM-1"
    case "XR": default: return "XR-1"
  }
}

import { RADIOLOGY_MODALITIES, RadiologyModality, INITIAL_RADIOLOGY_TARIFFS } from "../services/radiologyTariffsData"

/**
 * Accurately maps any clinical study record, investigation name, or modality code
 * into one of the official 11 Radiology modalities used in the Hospital Management System.
 */
export function getCanonicalRadiologyModality(study: {
  study?: string
  name?: string
  modality?: string
  department?: string
  code?: string
  orderedItems?: Array<{ description?: string }>
} | null | undefined): RadiologyModality {
  if (!study) return "X-Ray"

  // 1. Direct match with official modality names if already set
  if (study.modality && (RADIOLOGY_MODALITIES as readonly string[]).includes(study.modality)) {
    return study.modality as RadiologyModality
  }

  // 2. Department match if department is explicitly a modality (e.g. from tariffs, not referring desk)
  if (study.department && (RADIOLOGY_MODALITIES as readonly string[]).includes(study.department)) {
    return study.department as RadiologyModality
  }

  const name = (study.study || (study as any).name || "").toLowerCase().trim()
  const modCode = (study.modality || "").toUpperCase().trim()
  const code = ((study as any).code || "").toUpperCase().trim()

  // 3. Authoritative catalog exact match from INITIAL_RADIOLOGY_TARIFFS
  if (name || code) {
    const tariff = INITIAL_RADIOLOGY_TARIFFS.find(
      (t) =>
        (code && t.code.toUpperCase() === code) ||
        (name && t.name.toLowerCase() === name) ||
        (name && t.code.toLowerCase() === name)
    )
    if (tariff && tariff.modality && (RADIOLOGY_MODALITIES as readonly string[]).includes(tariff.modality)) {
      return tariff.modality as RadiologyModality
    }
  }

  // Safeguard: Do NOT classify non-radiology clinical tests (e.g. ECG, surgical procedures) as CT
  const isEcg = /\b(ecg|ekg|electrocardiogram|tmt|holter)\b/i.test(name) && !/\b(echo|echocardiogram|ultrasound)\b/i.test(name)

  const itemsText = (study.orderedItems || []).map((it) => it.description || "").join(" ").toLowerCase()
  const text = `${name} ${modCode} ${itemsText}`

  // A. Specialized sub-modalities first:
  // 1. Doppler Studies
  if (text.includes("doppler") || text.includes("dvt") || text.includes("color flow")) {
    return "Doppler"
  }

  // 2. Mammography & Breast Imaging
  if (text.includes("mammo") || text.includes("breast imaging") || text.includes("tomosynthesis") || text.includes("galactogram")) {
    return "Mammography"
  }

  // 3. DEXA / Bone Densitometry
  if (text.includes("dexa") || text.includes("densitometry") || text.includes("bmd") || text.includes("bone mineral")) {
    return "DEXA"
  }

  // 4. Nuclear Medicine / PET / SPECT
  if (
    modCode === "NM" ||
    text.includes("nuclear") ||
    text.includes("pet-ct") ||
    text.includes("pet scan") ||
    text.includes("spect") ||
    text.includes("scintigraphy") ||
    text.includes("radioisotope") ||
    text.includes("gamma camera") ||
    text.includes("dtpa") ||
    text.includes("dmsa")
  ) {
    return "Nuclear Medicine"
  }

  // 5. Dental & Maxillofacial Imaging
  if (
    text.includes("dental") ||
    text.includes("opg") ||
    text.includes("iopa") ||
    text.includes("cbct") ||
    text.includes("bitewing") ||
    text.includes("occlusal") ||
    text.includes("cephalogram") ||
    text.includes("orthopantomogram")
  ) {
    return "Dental"
  }

  // 6. Fluoroscopy & Contrast Studies
  if (
    text.includes("fluoroscop") ||
    text.includes("barium") ||
    text.includes("hsg") ||
    text.includes("hysterosalping") ||
    text.includes("ivu") ||
    text.includes("ivp") ||
    text.includes("mcu") ||
    text.includes("vcug") ||
    text.includes("rgu") ||
    text.includes("fistulogram") ||
    text.includes("sinogram") ||
    text.includes("sialogram")
  ) {
    return "Fluoroscopy / Contrast"
  }

  // 7. Interventional Radiology & Image-Guided
  if (
    text.includes("interventional") ||
    text.includes("guided") ||
    text.includes("biopsy") ||
    text.includes("aspiration") ||
    text.includes("drainage") ||
    text.includes("catheter placement") ||
    text.includes("nephrostomy") ||
    text.includes("angioplasty") ||
    text.includes("embolotherapy") ||
    text.includes("embolization") ||
    text.includes("pigtail")
  ) {
    return "Interventional Radiology"
  }

  // B. Core Modalities:
  // 8. MRI
  if (
    modCode === "MR" ||
    modCode === "MRI" ||
    text.includes("mri") ||
    text.includes("magnetic resonance") ||
    text.includes("mrcp") ||
    text.includes("mra") ||
    text.includes("mrv")
  ) {
    return "MRI"
  }

  // 9. CT Scan - Strictly ensure non-CT words (contracture, traction, extraction, resection, infection, fracture, etc.) are excluded
  const isGenuineCt =
    modCode === "CT" ||
    text.includes("ct scan") ||
    text.includes("computed tomography") ||
    text.includes("hrct") ||
    text.includes("ct angiogram") ||
    text.includes("ct angio") ||
    text.includes("ct-") ||
    /\bct\s+(head|brain|chest|abdomen|pelvis|spine|neck|kcb|pns|temporal|orbit|face|extremity)\b/i.test(text) ||
    /\bct\b/i.test(name)

  if (isGenuineCt && !isEcg) {
    return "CT Scan"
  }

  // 10. Ultrasound / USG
  if (
    modCode === "US" ||
    modCode === "USG" ||
    text.includes("ultrasound") ||
    text.includes("usg") ||
    text.includes("sonogram") ||
    text.includes("sonography") ||
    text.includes("echo") ||
    text.includes("echocardiogram")
  ) {
    return "Ultrasound (USG)"
  }

  // 11. X-Ray
  if (
    modCode === "XR" ||
    modCode === "X-RAY" ||
    modCode === "XRAY" ||
    text.includes("x-ray") ||
    text.includes("xray") ||
    text.includes("radiograph") ||
    text.includes("radiography") ||
    text.includes("cxr") ||
    text.includes("chest pa")
  ) {
    return "X-Ray"
  }

  return "X-Ray"
}
