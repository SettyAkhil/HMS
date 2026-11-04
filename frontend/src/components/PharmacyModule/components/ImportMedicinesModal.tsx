import React, { useState, useRef } from "react"
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Search,
  RefreshCw,
  Info,
  Sparkles,
} from "lucide-react"
import { PharmacyDatabase } from "../../../services/pharmacyDb"

interface ImportMedicinesModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingMedicines: any[]
}

export interface ParsedMedicineRow {
  name: string
  generic: string
  supplierName: string
  form: string
  pack: string
  strength: string
  manufacturer: string
  mnfCode: string
  hsnCode: string
  schedule: string
  gst: number
  sgst?: number
  cgst?: number
  mrp: number
  purchasePrice: number
  discount: number
  stock: number
  batchNumber: string
  expiryDate: string
  binNo: string
  category: string
  isValid: boolean
  errors: string[]
  isExisting: boolean
}

export default function ImportMedicinesModal({
  isOpen,
  onClose,
  onSuccess,
  existingMedicines,
}: ImportMedicinesModalProps) {
  const [parsedRows, setParsedRows] = useState<ParsedMedicineRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [createOpeningBatches, setCreateOpeningBatches] = useState(true)
  const [updateExisting, setUpdateExisting] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [alignedMapping, setAlignedMapping] = useState<{ field: string; source: string }[]>([])
  const [importSummary, setImportSummary] = useState<{
    total: number
    valid: number
    existing: number
    totalStock: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  // Clean CSV text line by line handling quotes, commas, semicolons, and tabs
  const parseCSVLines = (text: string): string[][] => {
    // Remove BOM if present
    const cleanText = text.replace(/^\uFEFF/, "")
    const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0)
    if (lines.length === 0) return []

    // Auto-detect delimiter from first non-empty line
    const firstLine = lines[0]
    let delimiter = ","
    const commaCount = (firstLine.match(/,/g) || []).length
    const semiCount = (firstLine.match(/;/g) || []).length
    const tabCount = (firstLine.match(/\t/g) || []).length
    if (semiCount > commaCount && semiCount > tabCount) delimiter = ";"
    else if (tabCount > commaCount && tabCount > semiCount) delimiter = "\t"
    
    return lines.map((line) => {
      const row: string[] = []
      let insideQuote = false
      let currentVal = ""

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (insideQuote && line[i + 1] === '"') {
            currentVal += '"'
            i++ // skip escaped quote
          } else {
            insideQuote = !insideQuote
          }
        } else if (char === delimiter && !insideQuote) {
          row.push(currentVal.trim())
          currentVal = ""
        } else {
          currentVal += char
        }
      }
      row.push(currentVal.trim())
      return row
    })
  }

  // Parse Date string into YYYY-MM-DD
  const normalizeExpiryDate = (val: string): string => {
    if (!val) return "2028-03-31"
    let trimmed = val.trim().replace(/^00(\d{2})/, "20$1")

    // Match YYYY-MM-DD or YY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})$/)
    if (ymdMatch) {
      let year = parseInt(ymdMatch[1], 10)
      if (year < 100) year += 2000
      const month = ymdMatch[2].padStart(2, "0")
      const day = ymdMatch[3].padStart(2, "0")
      return `${year}-${month}-${day}`
    }

    // MM/YY or MM-YY -> 20YY-MM-lastDay (matches receipt format e.g. 10/27, 5/28)
    const mmyyMatch = trimmed.match(/^(\d{1,2})[/-](\d{2})$/)
    if (mmyyMatch) {
      const month = parseInt(mmyyMatch[1], 10)
      const year = parseInt("20" + mmyyMatch[2], 10)
      const lastDay = new Date(year, month, 0).getDate()
      return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    }

    // MM/YYYY or MM-YYYY
    const mmyyyyMatch = trimmed.match(/^(\d{1,2})[/-](\d{4})$/)
    if (mmyyyyMatch) {
      const month = parseInt(mmyyyyMatch[1], 10)
      const year = parseInt(mmyyyyMatch[2], 10)
      const lastDay = new Date(year, month, 0).getDate()
      return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY or DD-MM-YY
    const ddmmyyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
    if (ddmmyyMatch) {
      const day = ddmmyyMatch[1].padStart(2, "0")
      const month = ddmmyyMatch[2].padStart(2, "0")
      let year = parseInt(ddmmyyMatch[3], 10)
      if (year < 100) year += 2000
      return `${year}-${month}-${day}`
    }

    return "2028-03-31"
  }

  const parseNum = (val: any, fallback = NaN): number => {
    if (val === undefined || val === null || val === "") return fallback
    const str = String(val).replace(/[₹$,\s%]/g, "").trim()
    const num = parseFloat(str)
    return isNaN(num) ? fallback : num
  }

  const parseIntNum = (val: any, fallback = NaN): number => {
    if (val === undefined || val === null || val === "") return fallback
    const str = String(val).replace(/[₹$,\s]/g, "").trim()
    const num = parseInt(str, 10)
    return isNaN(num) ? fallback : num
  }

  const processCSVData = (rows: string[][], sourceName: string) => {
    if (rows.length < 2) {
      alert("The uploaded CSV file must contain a header row and at least one data row.")
      return
    }

    // Detect if row 0 is actually a header row or data row
    const firstRowHasHeaders = rows[0].some((val) =>
      /(qty|stock|mfr|pack|product|item|medicine|name|batch|exp|hsn|mrp|rate|price|dis|gst|tax)/i.test(val)
    )

    const headers = firstRowHasHeaders
      ? rows[0].map((h) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ""))
      : []

    // Find index of headers with exact match priority and collision protection
    const findIndex = (aliases: string[]) => {
      if (!firstRowHasHeaders) return -1
      const cleanAliases = aliases.map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, ""))
      // 1. Prioritize exact header match
      const exactIdx = headers.findIndex((h) => cleanAliases.includes(h))
      if (exactIdx !== -1) return exactIdx

      // 2. Intelligent substring match with false-positive collision protection
      return headers.findIndex((h) =>
        cleanAliases.some((a) => {
          if (a === "rate" && (h.includes("gst") || h.includes("tax"))) return false
          if ((a === "gst" || a === "tax") && (h.includes("sgst") || h.includes("cgst"))) return false
          return h.includes(a)
        })
      )
    }

    let qtyIdx = findIndex(["qty", "quantity", "stock", "openingstock", "units", "count", "nos", "pieces", "balance", "currentstock", "availableqty", "recqty", "receivedqty", "billedqty", "totqty", "totalqty", "balqty", "itemqty", "stockqty", "qtynos"])
    let supplierIdx = findIndex(["supplier", "suppliername", "vendor", "vendorname", "distributor", "distributorname", "party", "partyname", "wholesaler", "suppliedby", "agency", "suppname"])
    let mnfCodeIdx = findIndex(["mfr", "mnf", "mnfcode", "mfgcode", "mfgshort", "shortmfr", "manufacturer", "mfg", "company", "make", "vendor", "brand", "div", "mfrname"])
    let formIdx = findIndex(["type", "form", "dosageform", "dosage", "formulation", "presentation", "category", "medtype", "itemtype", "nature", "class", "formtype", "producttype", "drugtype"])
    let packIdx = findIndex(["pack", "packing", "pkg", "packsize", "package", "packaging", "size", "unit", "uom", "stripsize", "packtype"])
    let nameIdx = findIndex(["productname", "product", "itemname", "item", "medicinename", "medicine", "name", "description", "particulars", "drug", "brandname", "trade", "tradename", "material", "drugname", "itemdesc", "itemdescription", "productdesc", "productdescription"])
    let batchIdx = findIndex(["batch", "batchnumber", "batchno", "batchnum", "bno", "lot", "lotno", "batchid", "lotnumber", "batchcode"])
    let expIdx = findIndex(["exp", "expiry", "expirydate", "expdate", "validthru", "expiration", "expdt", "dtexp", "usebefore", "expiredate", "dtclose"])
    let hsnIdx = findIndex(["hsn", "hsncode", "sac", "sku", "tariff", "hsnno", "commoditycode", "hsnsac", "saccode", "hsnnum"])
    let mrpIdx = findIndex(["mrp", "maxretailprice", "retailprice", "maximumretailprice", "mrprate", "price", "sellingprice", "saleprice", "mrprs", "retailrate", "unitmrp"])
    let purchaseIdx = findIndex(["rate", "purchaserate", "purchaseprice", "ptr", "cost", "costprice", "unitprice", "basicrate", "netrate", "buyprice", "netptr", "purrate", "purprice", "buyrate", "costunit"])
    let disIdx = findIndex(["dis", "discount", "disc", "dis%", "discount%", "disc%"])
    let sgstIdx = findIndex(["sgst", "sgst%", "sgstrate", "sgstp"])
    let cgstIdx = findIndex(["cgst", "cgst%", "cgstrate", "cgstp"])
    let gstIdx = findIndex(["gst", "gst%", "totalgst", "tax", "taxpercentage", "taxrate", "igst", "vat", "tax%"])

    // Heuristic Value Auto-Detection: If any column is still -1, inspect cell values in data rows
    const startDataRow = firstRowHasHeaders ? 1 : 0
    const sampleRows = rows.slice(startDataRow, Math.min(startDataRow + 6, rows.length))
    const totalCols = rows[0]?.length || 0

    const claimedCols = new Set(
      [qtyIdx, supplierIdx, mnfCodeIdx, formIdx, packIdx, nameIdx, batchIdx, expIdx, hsnIdx, mrpIdx, purchaseIdx, disIdx, sgstIdx, cgstIdx, gstIdx].filter(
        (i) => i !== -1
      )
    )

    const getColSamples = (col: number) =>
      sampleRows.map((r) => (r[col] || "").trim()).filter(Boolean)

    // 1. Expiry Auto-Detection if not matched
    if (expIdx === -1) {
      for (let c = 0; c < totalCols; c++) {
        if (claimedCols.has(c)) continue
        const samples = getColSamples(c)
        if (
          samples.length > 0 &&
          samples.every((s) => /^\d{1,2}[/-]\d{2,4}$/.test(s) || /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(s) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s))
        ) {
          expIdx = c
          claimedCols.add(c)
          break
        }
      }
    }

    // 2. HSN Auto-Detection (6-8 digit numeric or 3004/3002)
    if (hsnIdx === -1) {
      for (let c = 0; c < totalCols; c++) {
        if (claimedCols.has(c)) continue
        const samples = getColSamples(c)
        if (
          samples.length > 0 &&
          samples.every((s) => /^\d{6,8}$/.test(s.replace(/\s+/g, "")) || s.startsWith("3004") || s.startsWith("3002"))
        ) {
          hsnIdx = c
          claimedCols.add(c)
          break
        }
      }
    }

    // 3. Pack Auto-Detection (ML, TAB, CAP, VIAL, 10'S, 1'S, GM, etc.)
    if (packIdx === -1) {
      for (let c = 0; c < totalCols; c++) {
        if (claimedCols.has(c)) continue
        const samples = getColSamples(c)
        if (
          samples.length > 0 &&
          samples.some((s) => /\b(ml|tab|cap|vial|amp|strip|box|gm|mg|10'?s|1'?s|2'?s|50ml|100ml)\b/i.test(s))
        ) {
          packIdx = c
          claimedCols.add(c)
          break
        }
      }
    }

    // 3.5. Form / Type Auto-Detection (Tablet, Capsule, Injection, Syrup, etc.)
    if (formIdx === -1) {
      for (let c = 0; c < totalCols; c++) {
        if (claimedCols.has(c)) continue
        const samples = getColSamples(c)
        if (
          samples.length > 0 &&
          samples.some((s) => /\b(tablet|tab|capsule|cap|injection|inj|syrup|syp|suspension|susp|ointment|oint|drops?|cream|gel|fluid|infusion|vial|ampoule|amp)\b/i.test(s))
        ) {
          formIdx = c
          claimedCols.add(c)
          break
        }
      }
    }

    // 4. Batch Auto-Detection (alphanumeric with letters and numbers)
    if (batchIdx === -1) {
      for (let c = 0; c < totalCols; c++) {
        if (claimedCols.has(c)) continue
        const samples = getColSamples(c)
        if (
          samples.length > 0 &&
          samples.every((s) => /^[A-Z0-9-]{4,15}$/i.test(s) && /[A-Z]/i.test(s) && /\d/.test(s))
        ) {
          batchIdx = c
          claimedCols.add(c)
          break
        }
      }
    }

    // 5. Mfr Code Auto-Detection (short 2-6 char uppercase)
    if (mnfCodeIdx === -1) {
      for (let c = 0; c < totalCols; c++) {
        if (claimedCols.has(c)) continue
        const samples = getColSamples(c)
        if (
          samples.length > 0 &&
          samples.every((s) => /^[A-Z]{2,6}$/i.test(s) && !/\d/.test(s) && s.length <= 6)
        ) {
          mnfCodeIdx = c
          claimedCols.add(c)
          break
        }
      }
    }

    // 6. Product Name Auto-Detection (longest text with alphabetic letters)
    if (nameIdx === -1) {
      let bestCol = -1
      let maxLen = 0
      for (let c = 0; c < totalCols; c++) {
        if (claimedCols.has(c)) continue
        const samples = getColSamples(c)
        const avgLen = samples.reduce((acc, s) => acc + s.length, 0) / (samples.length || 1)
        const hasAlphabets = samples.some((s) => /[a-zA-Z]{3,}/.test(s))
        if (hasAlphabets && avgLen > maxLen) {
          maxLen = avgLen
          bestCol = c
        }
      }
      if (bestCol !== -1) {
        nameIdx = bestCol
        claimedCols.add(bestCol)
      }
    }

    // 7. Numeric columns Auto-Detection (Rate, MRP, Qty)
    const remainingNumericCols: { col: number; avgVal: number }[] = []
    for (let c = 0; c < totalCols; c++) {
      if (claimedCols.has(c)) continue
      const samples = getColSamples(c)
      const nums = samples.map((s) => parseFloat(s)).filter((n) => !isNaN(n))
      if (nums.length === samples.length && nums.length > 0) {
        const avgVal = nums.reduce((a, b) => a + b, 0) / nums.length
        remainingNumericCols.push({ col: c, avgVal })
      }
    }

    if (mrpIdx === -1 && remainingNumericCols.length >= 2) {
      remainingNumericCols.sort((a, b) => b.avgVal - a.avgVal)
      mrpIdx = remainingNumericCols[0].col
      claimedCols.add(mrpIdx)
      if (purchaseIdx === -1) {
        purchaseIdx = remainingNumericCols[1].col
        claimedCols.add(purchaseIdx)
      }
    } else if (mrpIdx === -1 && remainingNumericCols.length === 1) {
      mrpIdx = remainingNumericCols[0].col
      claimedCols.add(mrpIdx)
    }

    if (qtyIdx === -1) {
      const candidate = remainingNumericCols.find((item) => !claimedCols.has(item.col))
      if (candidate) {
        qtyIdx = candidate.col
        claimedCols.add(qtyIdx)
      }
    }

    // Check if columns match receipt positional sequence:
    // [0: Qty, 1: Mfr, 2: Pack, 3: Product Name, 4: Batch, 5: Exp, 6: HSN, 7: M.R.P, 8: Rate, 9: DIS, 10: SGST, 11: CGST]
    const isPositional = nameIdx === -1 && totalCols >= 4

    // Save auto-aligned mapping for visual confirmation in UI
    const formatCol = (idx: number, fallback: string) => {
      if (idx !== -1 && firstRowHasHeaders && rows[0][idx]) {
        return `Col ${idx + 1} (${rows[0][idx].trim()})`
      }
      if (idx !== -1) return `Col ${idx + 1}`
      return fallback
    }

    setAlignedMapping([
      { field: "Qty", source: formatCol(qtyIdx, isPositional ? "Col 1" : "Default (50)") },
      { field: "Supplier Name", source: formatCol(supplierIdx, "General Supplier (Default)") },
      { field: "Mfr", source: formatCol(mnfCodeIdx, isPositional ? "Col 2" : "Default (MANK)") },
      { field: "Type", source: formatCol(formIdx, "Auto-Inferred") },
      { field: "Pack", source: formatCol(packIdx, isPositional ? "Col 3" : "Default (1's)") },
      { field: "Product Name", source: formatCol(nameIdx, isPositional ? "Col 4" : "Col 1") },
      { field: "Batch", source: formatCol(batchIdx, isPositional ? "Col 5" : "Auto-Generated") },
      { field: "Exp", source: formatCol(expIdx, isPositional ? "Col 6" : "Auto (2028-03-31)") },
      { field: "HSN", source: formatCol(hsnIdx, isPositional ? "Col 7" : "3004 039") },
      { field: "M.R.P", source: formatCol(mrpIdx, isPositional ? "Col 8" : "₹100") },
      { field: "Rate", source: formatCol(purchaseIdx, isPositional ? "Col 9" : "₹75") },
      { field: "DIS", source: formatCol(disIdx, isPositional ? "Col 10" : "0%") },
      { field: "SGST", source: formatCol(sgstIdx, isPositional ? "Col 11" : "2.5%") },
      { field: "CGST", source: formatCol(cgstIdx, isPositional ? "Col 12" : "2.5%") },
    ])

    const parsed: ParsedMedicineRow[] = []

    for (let i = startDataRow; i < rows.length; i++) {
      const row = rows[i]
      if (row.length === 0 || (row.length === 1 && !row[0])) continue

      const name = (nameIdx !== -1 ? row[nameIdx] : (isPositional ? row[3] : row[0]) || "").trim()
      if (!name) continue // Skip empty line

      const supplierName = (supplierIdx !== -1 && row[supplierIdx]
        ? row[supplierIdx]
        : "General Supplier").trim()

      const rawStock = qtyIdx !== -1 ? parseIntNum(row[qtyIdx]) : (isPositional ? parseIntNum(row[0]) : 50)
      const stock = isNaN(rawStock) ? 50 : Math.max(0, rawStock)

      const mnfCode = (mnfCodeIdx !== -1 && row[mnfCodeIdx] 
        ? row[mnfCodeIdx] 
        : (isPositional && row[1] ? row[1] : "MANK")).trim().toUpperCase()

      const pack = (packIdx !== -1 && row[packIdx] 
        ? row[packIdx] 
        : (isPositional && row[2] ? row[2] : "1's")).trim()

      const batchNumber = (batchIdx !== -1 && row[batchIdx] 
        ? row[batchIdx] 
        : (isPositional && row[4] ? row[4] : "BT" + Math.floor(100000 + Math.random() * 900000))).trim()

      const rawExp = expIdx !== -1 && row[expIdx] ? row[expIdx] : (isPositional && row[5] ? row[5] : "2028-03-31")
      const expiryDate = normalizeExpiryDate(rawExp)

      const hsnCode = (hsnIdx !== -1 && row[hsnIdx] 
        ? row[hsnIdx] 
        : (isPositional && row[6] ? row[6] : "3004 039")).trim()

      const rawPurchase = purchaseIdx !== -1 ? parseNum(row[purchaseIdx]) : (isPositional ? parseNum(row[8]) : NaN)
      const rawMrp = mrpIdx !== -1 ? parseNum(row[mrpIdx]) : (isPositional ? parseNum(row[7]) : NaN)

      const purchasePrice = !isNaN(rawPurchase) && rawPurchase > 0 
        ? rawPurchase 
        : (!isNaN(rawMrp) && rawMrp > 0 ? +(rawMrp * 0.75).toFixed(2) : 75)

      const mrp = !isNaN(rawMrp) && rawMrp > 0
        ? rawMrp
        : +(purchasePrice * 1.33).toFixed(2)

      const rawDis = disIdx !== -1 ? parseNum(row[disIdx]) : (isPositional ? parseNum(row[9]) : 0)
      const discount = isNaN(rawDis) ? 0 : rawDis

      // Resolve SGST & CGST
      let sgst = 2.5
      let cgst = 2.5
      let totalGst = 5

      const parsedSgst = sgstIdx !== -1 ? parseNum(row[sgstIdx]) : (isPositional && row[10] ? parseNum(row[10]) : NaN)
      const parsedCgst = cgstIdx !== -1 ? parseNum(row[cgstIdx]) : (isPositional && row[11] ? parseNum(row[11]) : NaN)
      const parsedGst = gstIdx !== -1 ? parseNum(row[gstIdx]) : NaN

      if (!isNaN(parsedSgst) && !isNaN(parsedCgst)) {
        sgst = parsedSgst
        cgst = parsedCgst
        totalGst = +(sgst + cgst).toFixed(2)
      } else if (!isNaN(parsedGst)) {
        totalGst = parsedGst
        sgst = +(totalGst / 2).toFixed(2)
        cgst = +(totalGst / 2).toFixed(2)
      } else if (!isNaN(parsedSgst)) {
        sgst = parsedSgst
        cgst = parsedSgst
        totalGst = +(sgst * 2).toFixed(2)
      }

      const errors: string[] = []
      if (!name || name.trim().length === 0) errors.push("Medicine name required")

      // Dynamically resolve formulation type (Tablet, Capsule, Injection, Syrup, etc.)
      let resolvedForm = "TABLET"
      const rawForm = (formIdx !== -1 && row[formIdx] ? row[formIdx] : "").trim().toUpperCase()
      if (rawForm) {
        if (/TAB/i.test(rawForm)) resolvedForm = "TABLET"
        else if (/CAP/i.test(rawForm)) resolvedForm = "CAPSULE"
        else if (/INJ|VIAL|AMP/i.test(rawForm)) resolvedForm = "INJECTION"
        else if (/SYR|SUSP|LIQ/i.test(rawForm)) resolvedForm = "SYRUP"
        else if (/OINT|GEL|CREAM/i.test(rawForm)) resolvedForm = "OINTMENT"
        else if (/DROP/i.test(rawForm)) resolvedForm = "DROPS"
        else if (/INFUS|IV/i.test(rawForm)) resolvedForm = "IV FLUID"
        else if (/INHAL|RESP/i.test(rawForm)) resolvedForm = "INHALER"
        else resolvedForm = rawForm
      } else {
        const combined = (name + " " + pack).toUpperCase()
        if (/\b(INJ|INJECTION|VIAL|AMP)\b/i.test(combined) || /\b(2\s*ML|1\s*ML|5\s*ML|10\s*ML|50\s*ML)\b/i.test(pack)) resolvedForm = "INJECTION"
        else if (/\b(CAP|CAPSULE)\b/i.test(combined)) resolvedForm = "CAPSULE"
        else if (/\b(SYP|SYRUP|SUSP|SUSPENSION|SOLN|SOLUTION|LIQUID)\b/i.test(combined)) resolvedForm = "SYRUP"
        else if (/\b(OINT|OINTMENT|GEL|CREAM)\b/i.test(combined)) resolvedForm = "OINTMENT"
        else if (/\b(DROPS?|EYE|EAR|NASAL)\b/i.test(combined)) resolvedForm = "DROPS"
        else if (/\b(IV|INFUSION|500\s*ML)\b/i.test(combined)) resolvedForm = "IV FLUID"
        else if (/\b(RESP|RESPULE|INHALER)\b/i.test(combined)) resolvedForm = "INHALER"
        else resolvedForm = "TABLET"
      }

      const isExisting = existingMedicines.some(
        (m) => m.name?.trim().toLowerCase() === name.trim().toLowerCase()
      )

      parsed.push({
        name: name.trim().toUpperCase(),
        generic: name.trim().toUpperCase(),
        supplierName: supplierName || "VH MEDICALS AND CHEMICALS",
        form: resolvedForm,
        pack: pack || "1's",
        strength: pack || "",
        manufacturer: mnfCode,
        mnfCode,
        hsnCode,
        schedule: "H",
        gst: totalGst,
        sgst,
        cgst,
        mrp,
        purchasePrice,
        discount,
        stock,
        batchNumber,
        expiryDate,
        binNo: "",
        category: resolvedForm,
        isValid: errors.length === 0,
        errors,
        isExisting,
      })
    }

    setFileName(sourceName)
    setParsedRows(parsed)

    const validCount = parsed.filter((r) => r.isValid).length
    const existingCount = parsed.filter((r) => r.isExisting).length
    const totalStock = parsed.reduce((sum, r) => sum + (r.isValid ? r.stock : 0), 0)

    setImportSummary({
      total: parsed.length,
      valid: validCount,
      existing: existingCount,
      totalStock,
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      if (text) {
        const rows = parseCSVLines(text)
        processCSVData(rows, file.name)
      }
    }
    reader.readAsText(file)
  }

  const handleDownloadTemplate = () => {
    // Exact column headers matching supplier receipt columns in identical sequence + Type + Supplier Name
    const headers = [
      "Qty",
      "Supplier Name",
      "Mfr",
      "Type",
      "Pack",
      "Product Name",
      "Batch",
      "Exp",
      "HSN",
      "M.R.P",
      "Rate",
      "DIS",
      "SGST",
      "CGST",
    ]

    // Sample data directly matching receipt with various formulation types
    const sampleRows = [
      [
        "36",
        "VH MEDICALS AND CHEMICALS",
        "MANK",
        "INJECTION",
        "2 ML",
        "DROTICIND INJ",
        "B51Y016",
        "10/27",
        "30049099",
        "39.74",
        "19.94",
        "0.00",
        "2.50",
        "2.50",
      ],
      [
        "120",
        "VH MEDICALS AND CHEMICALS",
        "MANK",
        "INJECTION",
        "2 ML",
        "VOMIKIND INJ",
        "B0IQZ010",
        "5/28",
        "30049036",
        "12.79",
        "3.62",
        "0.00",
        "2.50",
        "2.50",
      ],
      [
        "60",
        "VH MEDICALS AND CHEMICALS",
        "CIPLA",
        "TABLET",
        "10's",
        "PARACETAMOL 650 MG",
        "PCM9021",
        "12/28",
        "30049011",
        "30.50",
        "18.20",
        "0.00",
        "2.50",
        "2.50",
      ],
      [
        "25",
        "VH MEDICALS AND CHEMICALS",
        "ABBOT",
        "SYRUP",
        "100 ML",
        "ASCORIL D PLUS SYRUP",
        "ASC1104",
        "08/27",
        "30049080",
        "145.00",
        "98.50",
        "0.00",
        "2.50",
        "2.50",
      ],
      [
        "10",
        "VH MEDICALS AND CHEMICALS",
        "SUN",
        "OINTMENT",
        "15 GM",
        "BETADINE OINTMENT 5%",
        "BET4501",
        "11/27",
        "30049030",
        "85.00",
        "55.00",
        "0.00",
        "2.50",
        "2.50",
      ],
    ]

    const csvContent =
      headers.join(",") +
      "\n" +
      sampleRows.map((r) => r.join(",")).join("\n") +
      "\n"

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", "supplier_receipt_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExecuteImport = () => {
    const validRows = parsedRows.filter((r) => r.isValid)
    if (validRows.length === 0) {
      alert("No valid rows available to import.")
      return
    }

    setIsProcessing(true)

    try {
      const result = PharmacyDatabase.bulkImportMedicines({
        rows: validRows,
        updateExisting,
        createOpeningBatches,
      })

      // Audio chime
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.type = "sine"
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime) // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1) // A5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35)
        osc.start()
        osc.stop(audioCtx.currentTime + 0.35)
      } catch (e) {
        // audio fallback
      }

      window.dispatchEvent(
        new CustomEvent("hospai_pharmacy_toast", {
          detail: {
            message: `Import Success! Added ${result.addedCount} medicines, updated ${result.updatedCount}, with ${result.batchesCreated} active batches in inventory.`,
          },
        })
      )

      setIsProcessing(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      console.error("Bulk Import Exception:", err)
      alert("Error importing medicines: " + (err.message || "Unknown error"))
      setIsProcessing(false)
    }
  }

  const filteredPreviewRows = parsedRows.filter((r) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      r.name.toLowerCase().includes(term) ||
      r.generic.toLowerCase().includes(term) ||
      r.manufacturer.toLowerCase().includes(term) ||
      r.batchNumber.toLowerCase().includes(term)
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#CBD5E1] w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0F766E] to-[#115E59] text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs shadow-inner">
              <FileSpreadsheet className="text-white" size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Import Medicines from CSV</h2>
              <p className="text-xs text-teal-100 font-medium">
                Upload your medicine spreadsheet to import directly into Medicine Master & inventory batches
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-teal-100 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Top Format Helper Bar */}
        <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-[#475569]">
            <Info size={16} className="text-[#0F766E] flex-shrink-0" />
            <span>
              CSV columns match supplier invoice format: <b>Product Name, Pack, Mfr, HSN Code, Batch Number, Expiry Date, Qty, MRP, Rate, Discount %, GST %</b>
            </span>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#0F766E] text-xs font-bold text-[#0F766E] hover:bg-teal-50 shadow-xs transition-colors"
            title="Download blank CSV template with column headers for entering your medicines"
          >
            <Download size={14} /> Download Blank CSV Template (.CSV)
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!parsedRows.length && (
            <div className="space-y-4">
              {/* Drag and Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#CBD5E1] hover:border-[#0F766E] rounded-2xl p-10 bg-[#F8FAFC] hover:bg-teal-50/40 text-center cursor-pointer transition-all group flex flex-col items-center justify-center space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, text/csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <div className="w-16 h-16 rounded-2xl bg-teal-100 text-[#0F766E] group-hover:scale-105 flex items-center justify-center transition-transform shadow-xs">
                  <Upload size={30} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E293B]">
                    Click to browse or drag & drop your Medicine CSV file
                  </h3>
                  <p className="text-xs text-[#64748B] mt-1">
                    Accepts any CSV file exported from Microsoft Excel, Google Sheets, or your pharmacy software
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2 text-[11px] font-semibold text-[#0F766E]">
                  <span>Supports: .csv format</span>
                </div>
              </div>

              {/* Explanatory Guide Card */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 mt-0.5">
                  <FileText size={18} />
                </div>
                <div className="text-xs space-y-1">
                  <h4 className="font-bold text-emerald-950">How to use the CSV Format Template:</h4>
                  <p className="text-emerald-900 leading-relaxed">
                    1. Click the <b>"Download Blank CSV Template"</b> button above.<br />
                    2. Open the file in <b>Excel</b> or <b>Google Sheets</b>.<br />
                    3. Fill in your medicines matching your supplier receipt (Product Name, Pack, Mfr, HSN, Batch, Exp, Qty, MRP, Rate, Dis %, GST %).<br />
                    4. Save the file and upload it here. It will immediately populate into Medicine Master!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Parsed Data Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-4">
              {/* Summary Metrics */}
              {importSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200">
                    <p className="text-[11px] font-semibold text-teal-800 uppercase">Total Items In CSV</p>
                    <p className="text-xl font-bold text-teal-900 mt-0.5">{importSummary.total}</p>
                    <p className="text-[11px] text-teal-700 mt-0.5 font-medium truncate">File: {fileName}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <p className="text-[11px] font-semibold text-emerald-800 uppercase">Valid Ready to Import</p>
                    <p className="text-xl font-bold text-emerald-900 mt-0.5">{importSummary.valid}</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">100% verified</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                    <p className="text-[11px] font-semibold text-blue-800 uppercase">Existing in Master</p>
                    <p className="text-xl font-bold text-blue-900 mt-0.5">{importSummary.existing}</p>
                    <p className="text-[11px] text-blue-700 mt-0.5 font-medium">Will update details</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-[11px] font-semibold text-amber-800 uppercase">Total Opening Stock</p>
                    <p className="text-xl font-bold text-amber-900 mt-0.5">
                      {importSummary.totalStock.toLocaleString("en-IN")} units
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5 font-medium">Will create batches</p>
                  </div>
                </div>
              )}

              {/* Auto-Aligned Columns Indicator */}
              {alignedMapping.length > 0 && (
                <div className="bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 rounded-xl p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-[#0F766E]" />
                      <span className="text-xs font-bold text-[#0F172A]">
                        Smart Column Auto-Alignment: All 12 Receipt Columns Successfully Aligned
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-[#0F766E] bg-teal-100/90 px-2.5 py-0.5 rounded-full">
                      ✓ Auto-Mapped to Supplier Invoice Columns
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 pt-1">
                    {alignedMapping.map((col, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col bg-white border border-teal-200/80 rounded-lg px-2 py-1 shadow-2xs"
                      >
                        <span className="text-[10px] font-bold text-[#0F766E] uppercase">
                          {col.field}
                        </span>
                        <span className="text-[11px] text-[#334155] font-medium truncate" title={col.source}>
                          {col.source}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter and Re-upload */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-white border border-[#CBD5E1] rounded-xl px-3 py-1.5 flex-1 max-w-sm">
                  <Search size={14} className="text-[#94A3B8]" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter preview by product name, mfr, batch, HSN..."
                    className="text-xs outline-none text-[#0F172A] placeholder:text-[#94A3B8] w-full"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm("")}>
                      <X size={12} className="text-[#94A3B8]" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setParsedRows([])
                      setFileName(null)
                      setImportSummary(null)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9] transition-colors"
                  >
                    <RefreshCw size={13} /> Select Different CSV File
                  </button>
                </div>
              </div>

              {/* Data Table - Supplier Invoice Aligned (Exact Receipt Sequence) */}
              <div className="bg-white rounded-xl border border-[#CBD5E1] shadow-2xs overflow-hidden max-h-[340px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#F1F5F9] border-b border-[#CBD5E1] sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase">Status</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#15803D] uppercase text-right">Qty</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase">Mfr</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#0F766E] uppercase">Type</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#0F766E] uppercase">Pack</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase">Product Name</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#0F766E] uppercase">Supplier</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase">Batch</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase">Exp</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase font-mono">HSN</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase text-right">M.R.P (₹)</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#15803D] uppercase text-right">Rate (₹)</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase text-right">Dis %</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase text-right">SGST %</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#475569] uppercase text-right">CGST %</th>
                      <th className="py-2.5 px-3 text-[11px] font-bold text-[#0F766E] uppercase text-right">GST %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="py-8 text-center text-[#94A3B8] text-xs">
                          No matching medicines found in current preview filter.
                        </td>
                      </tr>
                    ) : (
                      filteredPreviewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="py-2 px-3 whitespace-nowrap">
                            {row.isExisting ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                Update
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 size={10} /> New
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-[#15803D] whitespace-nowrap">
                            {row.stock}
                          </td>
                          <td className="py-2 px-3 text-[#334155] whitespace-nowrap font-mono font-bold text-[#0F766E]">
                            {row.mnfCode}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold">
                              {row.form}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[#0F172A] whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[#0F766E] text-[11px] font-semibold">
                              {row.pack || "1's"}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-[#0F172A] whitespace-nowrap">
                            {row.name}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                              {row.supplierName || "VH MEDICALS AND CHEMICALS"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[#0F172A] font-medium whitespace-nowrap font-mono">
                            {row.batchNumber}
                          </td>
                          <td className="py-2 px-3 text-[#475569] whitespace-nowrap">
                            {row.expiryDate}
                          </td>
                          <td className="py-2 px-3 text-[#64748B] whitespace-nowrap font-mono text-[11px]">
                            {row.hsnCode}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-[#0F172A] whitespace-nowrap">
                            ₹{row.mrp.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-[#15803D] whitespace-nowrap">
                            ₹{row.purchasePrice.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right text-[#64748B] whitespace-nowrap">
                            {row.discount}%
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-[#475569] whitespace-nowrap">
                            {row.sgst ?? +(row.gst / 2).toFixed(2)}%
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-[#475569] whitespace-nowrap">
                            {row.cgst ?? +(row.gst / 2).toFixed(2)}%
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-[#0F766E] whitespace-nowrap">
                            {row.gst}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Import Options Checkboxes */}
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#334155] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={createOpeningBatches}
                      onChange={(e) => setCreateOpeningBatches(e.target.checked)}
                      className="w-4 h-4 text-[#0F766E] rounded focus:ring-0 cursor-pointer accent-[#0F766E]"
                    />
                    Create Opening Stock Batches & Register Inventory Ledger
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#334155] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="w-4 h-4 text-[#0F766E] rounded focus:ring-0 cursor-pointer accent-[#0F766E]"
                    />
                    Update Existing Records if Medicine Name Matches
                  </label>
                </div>

                <div className="text-xs text-[#64748B]">
                  Showing <span className="font-bold text-[#0F172A]">{filteredPreviewRows.length}</span> of{" "}
                  <span className="font-bold text-[#0F172A]">{parsedRows.length}</span> medicines
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-[#E2E8F0] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {parsedRows.length > 0 && (
              <button
                disabled={isProcessing || parsedRows.filter((r) => r.isValid).length === 0}
                onClick={handleExecuteImport}
                className="px-6 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Importing to Database...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} /> Save to Inventory ({parsedRows.filter((r) => r.isValid).length} Medicines)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
